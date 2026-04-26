"""Hybrid clinic search.

Pipeline:
  1. Expand query (acronym dict + optional LLM rewrite via EXPAND_VIA_LLM=1).
  2. Classify query -> {city, specialty bucket} for a metadata pre-filter.
  3. Dense ANN via Chroma (text-embedding-3-large) with the where-filter.
  4. BM25 over the locally-saved corpus, with the same where-filter applied.
  5. Reciprocal Rank Fusion of dense + BM25.
  6. Cross-encoder rerank on the top RERANK_TOPK.
  7. Return top FINAL_TOPK.

Required deps (install once):
    pip install rank_bm25 sentence-transformers
"""

import os
import re
import json
from pathlib import Path
from functools import lru_cache

import chromadb
from openai import OpenAI
from rank_bm25 import BM25Okapi
from sentence_transformers import CrossEncoder
from dotenv import load_dotenv

load_dotenv()


COLLECTION_NAME = "clinics_rag_v2"
EMBED_MODEL = "text-embedding-3-large"
EXPANSION_LLM_MODEL = "gpt-4.1-mini"
# Small + fast cross-encoder. Swap to "BAAI/bge-reranker-base" for higher quality at ~3x size.
RERANKER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"

BM25_INDEX_FILE = Path(__file__).resolve().parent / "db" / "bm25_index.json"

DENSE_TOPK = 30
BM25_TOPK = 30
RERANK_TOPK = 15
FINAL_TOPK = 5
RRF_K = 60


# --- 1. Query expansion ----------------------------------------------------

# Cheap deterministic acronym map. Keep entries lowercase. Each value is
# appended (not substituted) so the original wording is preserved for BM25.
ACRONYMS: dict[str, str] = {
    "acl":     "anterior cruciate ligament reconstruction knee orthopedic sports medicine",
    "pcl":     "posterior cruciate ligament knee orthopedic",
    "mcl":     "medial collateral ligament knee orthopedic",
    "tka":     "total knee arthroplasty replacement orthopedic",
    "tha":     "total hip arthroplasty replacement orthopedic",
    "mri":     "magnetic resonance imaging radiology",
    "ct":      "computed tomography ct scan radiology",
    "usg":     "ultrasonography ultrasound radiology",
    "ecg":     "electrocardiogram cardiology heart",
    "ekg":     "electrocardiogram cardiology heart",
    "eeg":     "electroencephalogram neurology",
    "pet":     "positron emission tomography oncology imaging",
    "ivf":     "in vitro fertilization fertility reproductive",
    "iui":     "intrauterine insemination fertility",
    "icsi":    "intracytoplasmic sperm injection fertility ivf",
    "rct":     "root canal treatment endodontics dental",
    "lasik":   "laser in situ keratomileusis refractive surgery ophthalmology",
    "smile":   "small incision lenticule extraction refractive surgery ophthalmology",
    "icl":     "implantable contact lens refractive ophthalmology",
    "ent":     "ear nose throat otolaryngology",
    "obgyn":   "obstetrics gynecology",
    "ob/gyn":  "obstetrics gynecology",
    "bmt":     "bone marrow transplant hematology oncology",
    "ipd":     "inpatient department hospital",
    "opd":     "outpatient department clinic",
    "icu":     "intensive care unit critical care",
    "nicu":    "neonatal intensive care pediatric",
    "ckd":     "chronic kidney disease nephrology",
    "copd":    "chronic obstructive pulmonary disease pulmonology",
    "tb":      "tuberculosis pulmonology",
}


def expand_acronyms(query: str) -> str:
    q = query.lower()
    extras: list[str] = []
    for acronym, expansion in ACRONYMS.items():
        if re.search(rf"\b{re.escape(acronym)}\b", q):
            extras.append(expansion)
    if not extras:
        return query
    return f"{query}. " + " ".join(extras)


@lru_cache(maxsize=512)
def llm_expand(query: str) -> str:
    """Optional LLM rewrite. Off unless EXPAND_VIA_LLM=1 is set."""
    if not os.environ.get("EXPAND_VIA_LLM"):
        return query

    client = _openai()
    prompt = (
        "Rewrite the following user query for a clinical/medical search system over Indian "
        "hospitals and clinics. Expand layperson terms and acronyms to clinical synonyms while "
        "preserving the original wording. Output a single short paragraph, no preamble.\n\n"
        f"Query: {query}\nRewrite:"
    )
    res = client.chat.completions.create(
        model=EXPANSION_LLM_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        max_tokens=120,
    )
    rewritten = res.choices[0].message.content.strip()
    return f"{query}. {rewritten}"


# --- 2. Query -> metadata filter ------------------------------------------

# Layperson + acronym keywords that map a query to a specialty bucket.
# Bucket names must match the bucket_<name> flags written by embed_clinics.py.
QUERY_BUCKETS: dict[str, list[str]] = {
    "orthopedics":      ["acl", "pcl", "mcl", "knee", "joint", "fracture", "ortho", "sports injur",
                         "arthroscop", "spine", "hip replace", "ligament", "meniscus", "back pain",
                         "shoulder", "rotator cuff"],
    "ophthalmology":    ["eye", "vision", "blurry", "cataract", "glaucoma", "retina", "lasik",
                         "ophthalm", "myopia", "blind", "cornea"],
    "dental":           ["tooth", "teeth", "dental", "dentist", "rct", "root canal", "cavity",
                         "molar", "implant", "braces", "orthodontic", "gum", "wisdom"],
    "dermatology":      ["skin", "acne", "hair", "derma", "pimple", "tattoo removal", "laser hair",
                         "psoriasis", "eczema"],
    "cardiology":       ["heart", "cardiac", "cardiology", "chest pain", "ecg", "ekg", "angio",
                         "bypass"],
    "fertility":        ["fertility", "ivf", "iui", "icsi", "infertil", "obgyn", "obstetric",
                         "gynec", "test tube"],
    "ent":              ["ear ", "nose", "throat", " ent", "sinus", "tonsil", "hearing"],
    "pediatrics":       ["child", "kid", "pediatric", "paediatric", "neonatal", "infant"],
    "gastroenterology": ["stomach", "gastro", "liver", "hepato", "ulcer", "acidity"],
    "neurology":        ["brain", "neuro", "stroke", "headache", "migraine", "seizure"],
    "oncology":         ["cancer", "oncology", "tumor", "tumour", "chemo", "radiation"],
    "urology":          ["kidney", "urolog", "prostate", "renal", "bladder"],
    "pulmonology":      ["lung", "asthma", "respirator", "pulmo", "tuberculo", "copd"],
    "psychiatry":       ["mental", "depress", "anxiety", "psychiatr"],
    "endocrinology":    ["diabet", "thyroid", "hormone", "endocrin"],
}


@lru_cache(maxsize=1)
def known_cities() -> list[str]:
    if not BM25_INDEX_FILE.exists():
        return []
    records = json.loads(BM25_INDEX_FILE.read_text())
    cities = {r["metadata"].get("address_city", "") for r in records}
    return sorted({c for c in cities if c})


def classify_query(query: str) -> dict:
    q = query.lower()

    bucket = None
    best_hits = 0
    for name, kws in QUERY_BUCKETS.items():
        hits = sum(1 for kw in kws if kw in q)
        if hits > best_hits:
            best_hits = hits
            bucket = name

    city = None
    for c in known_cities():
        if re.search(rf"\b{re.escape(c.lower())}\b", q):
            city = c
            break

    return {"bucket": bucket, "city": city}


def build_where_filter(query: str) -> dict | None:
    cls = classify_query(query)
    conds: list[dict] = []
    if cls["city"]:
        conds.append({"address_city": cls["city"]})
    if cls["bucket"]:
        conds.append({f"bucket_{cls['bucket']}": True})
    if not conds:
        return None
    if len(conds) == 1:
        return conds[0]
    return {"$and": conds}


# --- 3. BM25 ---------------------------------------------------------------

_TOKEN_RE = re.compile(r"\w+")


def tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


@lru_cache(maxsize=1)
def load_bm25():
    records = json.loads(BM25_INDEX_FILE.read_text())
    tokenized = [tokenize(r["text"]) for r in records]
    return records, BM25Okapi(tokenized)


def matches_filter(meta: dict, where: dict | None) -> bool:
    if not where:
        return True
    if "$and" in where:
        return all(matches_filter(meta, c) for c in where["$and"])
    return all(meta.get(k) == v for k, v in where.items())


def bm25_search(query: str, where: dict | None, top_k: int) -> list[dict]:
    records, bm25 = load_bm25()
    scores = bm25.get_scores(tokenize(query))
    order = sorted(range(len(scores)), key=lambda i: -scores[i])

    out: list[dict] = []
    for i in order:
        if scores[i] <= 0:
            break
        if not matches_filter(records[i]["metadata"], where):
            continue
        out.append({
            "id":       records[i]["id"],
            "text":     records[i]["text"],
            "metadata": records[i]["metadata"],
            "score":    float(scores[i]),
        })
        if len(out) >= top_k:
            break
    return out


# --- 4. Dense (Chroma) -----------------------------------------------------

@lru_cache(maxsize=1)
def _openai() -> OpenAI:
    return OpenAI(api_key=os.environ["OPENAI_API_KEY"])


@lru_cache(maxsize=1)
def _collection():
    client = chromadb.CloudClient(
        cloud_port=443,
        cloud_host="europe-west1.gcp.trychroma.com",
        api_key=os.environ["CHROMA_API_KEY"],
        tenant=os.environ["CHROMA_TENANT"],
        database=os.environ["CHROMA_DATABASE"],
    )
    return client.get_collection(COLLECTION_NAME)


def embed_query(query: str) -> list[float]:
    res = _openai().embeddings.create(model=EMBED_MODEL, input=[query])
    return res.data[0].embedding


def dense_search(query: str, where: dict | None, top_k: int) -> list[dict]:
    collection = _collection()
    emb = embed_query(query)

    kwargs = {
        "query_embeddings": [emb],
        "n_results": top_k,
        "include": ["documents", "metadatas", "distances"],
    }
    if where:
        kwargs["where"] = where

    res = collection.query(**kwargs)
    out: list[dict] = []
    for i in range(len(res["ids"][0])):
        out.append({
            "id":       res["ids"][0][i],
            "text":     res["documents"][0][i],
            "metadata": res["metadatas"][0][i],
            "score":    -res["distances"][0][i],   # higher = better
        })
    return out


# --- 5. Reciprocal Rank Fusion --------------------------------------------

def rrf_merge(*lists: list[dict], k: int = RRF_K) -> list[dict]:
    merged: dict[str, dict] = {}
    for results in lists:
        for rank, hit in enumerate(results):
            entry = merged.setdefault(hit["id"], {**hit, "rrf": 0.0})
            entry["rrf"] += 1.0 / (k + rank + 1)
    return sorted(merged.values(), key=lambda x: -x["rrf"])


# --- 6. Cross-encoder rerank ----------------------------------------------

@lru_cache(maxsize=1)
def _reranker() -> CrossEncoder:
    return CrossEncoder(RERANKER_MODEL)


def rerank(query: str, hits: list[dict], top_k: int) -> list[dict]:
    if not hits:
        return hits
    head = hits[:top_k]
    pairs = [(query, h.get("text") or h.get("document", "")) for h in head]
    scores = _reranker().predict(pairs)
    for h, s in zip(head, scores):
        h["rerank"] = float(s)
    return sorted(head, key=lambda x: -x["rerank"])


# --- Public entry point ---------------------------------------------------

def search(query: str, top_k: int = FINAL_TOPK, verbose: bool = False) -> list[dict]:
    expanded = llm_expand(expand_acronyms(query))
    where = build_where_filter(query)

    if verbose:
        print(f"  expanded: {expanded}")
        print(f"  where:    {where}")

    dense_hits = dense_search(expanded, where, DENSE_TOPK)
    bm25_hits = bm25_search(expanded, where, BM25_TOPK)

    # If the metadata filter killed everything, retry without it so we
    # never hand back zero results.
    if where and not dense_hits and not bm25_hits:
        if verbose:
            print("  filter excluded all candidates - retrying without where")
        dense_hits = dense_search(expanded, None, DENSE_TOPK)
        bm25_hits = bm25_search(expanded, None, BM25_TOPK)

    merged = rrf_merge(dense_hits, bm25_hits)
    reranked = rerank(query, merged, RERANK_TOPK)
    return reranked[:top_k]


if __name__ == "__main__":
    queries = [
        "I need ACL surgery",
        "knee replacement after a sports injury in Mumbai",
        "cataract surgery in Noida",
        "I have severe tooth pain, need a root canal",
        "eye problem, blurry vision and possibly glaucoma",
        "dental cataract surgery",
        "IVF and fertility treatment",
        "skin clinic for laser hair removal in Hyderabad",
        "MRI scan and orthopedic consultation",
        "heart specialist for chest pain",
    ]
    for q in queries:
        print("\n" + "=" * 88)
        print(f"QUERY: {q}")
        print("=" * 88)
        for h in search(q, verbose=True):
            meta = h["metadata"]
            name = meta.get("name", "?")
            city = meta.get("address_city", "?")
            state = meta.get("address_stateOrRegion", "")
            print(f"  rerank={h.get('rerank', 0):+.3f}  rrf={h['rrf']:.4f}  {name}  ({city}, {state})")

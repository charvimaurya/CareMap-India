import os
import re
import csv
import json
import hashlib
from pathlib import Path
from typing import Any

import chromadb
from openai import OpenAI


CSV_FILE = "./db/dataset_raw.csv"
COLLECTION_NAME = "clinics_rag_v2"
EMBED_MODEL = "text-embedding-3-large"
BATCH_SIZE = 100
GEO_INDEX_FILE = Path("./db/clinic_geo_index.json")
BM25_INDEX_FILE = Path("./db/bm25_index.json")


# Specialty-bucket flags get baked into Chroma metadata so the search layer
# can pre-filter (e.g. only orthopedics clinics for a "knee" query). Each list
# is a set of substring rules that we test (case-insensitive) against the
# raw camelCase specialty codes for each clinic.
SPECIALTY_BUCKETS: dict[str, list[str]] = {
    "orthopedics":      ["orthop", "joint", "knee", "spine", "sports", "fracture", "arthro", "ligament"],
    "ophthalmology":    ["ophthalm", "retina", "glaucoma", "cataract", "vitreo", "cornea", "refractive", "uveiti"],
    "dental":           ["dent", "periodont", "endodont", "orthodont", "prosthodont"],
    "dermatology":      ["dermat", "skin", "cosmet", "aesthetic"],
    "cardiology":       ["cardi"],
    "fertility":        ["fertilit", "ivf", "reproductive", "obstetric", "gynec", "gynaec"],
    "ent":              ["otolaryng", "rhinolog", "laryngolog"],
    "pediatrics":       ["pediatr", "paediatr", "neonat"],
    "gastroenterology": ["gastro", "hepato"],
    "neurology":        ["neuro"],
    "oncology":         ["oncolog", "cancer", "hematolog", "haematolog"],
    "urology":          ["urolog", "nephrolog"],
    "pulmonology":      ["pulmo", "respirator", "thoracic"],
    "psychiatry":       ["psychiatr", "psycholog"],
    "endocrinology":    ["endocrin", "diabet"],
    "general_medicine": ["familymedicine", "internalmedicine", "generalmedicine"],
}


def compute_bucket_flags(specialty_codes: list[str]) -> dict[str, bool]:
    """Return {bucket_<name>: True} only for buckets the clinic belongs to.

    Missing buckets are deliberately omitted so a Chroma equality filter
    treats those clinics as non-matching.
    """
    flags: dict[str, bool] = {}
    lowered = [s.lower() for s in specialty_codes]
    for bucket, keywords in SPECIALTY_BUCKETS.items():
        if any(any(kw in s for kw in keywords) for s in lowered):
            flags[f"bucket_{bucket}"] = True
    return flags


METADATA_FIELDS = [
    "name",
    "officialPhone",
    "email",
    "address_city",
    "address_stateOrRegion",
    "latitude",
    "longitude",
    "facilityTypeId",
    "operatorTypeId",
    "yearEstablished",
    "numberDoctors",
    "capacity",
]


def expand_camel_case(text: str) -> str:
    """Split camelCase / PascalCase tokens into space-separated lowercase words.

    e.g. "cataractAndAnteriorSegmentSurgery" -> "cataract and anterior segment surgery"
    """
    if not text:
        return text
    # Insert space between lowercase->uppercase boundaries
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text)
    # Handle ABCDef -> ABC Def (acronym followed by word)
    s = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", s)
    return s.lower()


def parse_json_list(value: str) -> list[str]:
    if not value or value == "null":
        return []

    try:
        parsed = json.loads(value)
        if isinstance(parsed, list):
            return [str(x) for x in parsed if x is not None]
    except Exception:
        pass

    return [value]


def clean_value(value: Any) -> str:
    if value is None:
        return ""

    value = str(value).strip()

    if value.lower() in {"null", "none", "nan", ""}:
        return ""

    return value


def make_chunk_text(row: dict) -> str:
    specialties_raw = parse_json_list(clean_value(row.get("specialties")))
    specialties = [expand_camel_case(s) for s in specialties_raw]
    procedures = parse_json_list(clean_value(row.get("procedure")))
    equipment = parse_json_list(clean_value(row.get("equipment")))
    capabilities = parse_json_list(clean_value(row.get("capability")))
    description = clean_value(row.get("description"))

    name = clean_value(row.get("name"))
    city = clean_value(row.get("address_city"))
    state = clean_value(row.get("address_stateOrRegion"))
    location = ", ".join(value for value in [city, state] if value)

    # Clinical block - the signal that should dominate the embedding.
    clinical_parts: list[str] = []
    if specialties:
        clinical_parts.append(f"Specialties: {', '.join(specialties)}")
    if procedures:
        clinical_parts.append(f"Procedures and surgeries: {', '.join(procedures)}")
    if equipment:
        clinical_parts.append(f"Equipment: {', '.join(equipment)}")
    if capabilities:
        clinical_parts.append(f"Capabilities and services: {', '.join(capabilities)}")

    parts: list[str] = []

    # Clinical signal first (and repeated below) so it weighs more in the embedding.
    parts.extend(clinical_parts)

    if description:
        parts.append(f"Description: {description}")

    if name:
        parts.append(f"Clinic name: {name}")
    if location:
        parts.append(f"Location: {location}")

    # Repeat clinical block to up-weight specialty / procedure / capability tokens.
    parts.extend(clinical_parts)

    return "\n".join(parts)


def make_metadata(row: dict) -> dict:
    metadata = {}

    for field in METADATA_FIELDS:
        value = clean_value(row.get(field))

        if value == "":
            continue

        if field in {"latitude", "longitude"}:
            try:
                metadata[field] = float(value)
            except ValueError:
                continue
        elif field in {"yearEstablished", "numberDoctors", "capacity"}:
            try:
                metadata[field] = int(float(value))
            except ValueError:
                continue
        else:
            metadata[field] = value

    specialty_codes = parse_json_list(clean_value(row.get("specialties")))
    metadata.update(compute_bucket_flags(specialty_codes))

    return metadata


def make_id(row: dict) -> str:
    base = "|".join([
        clean_value(row.get("name")),
        clean_value(row.get("address_city")),
        clean_value(row.get("officialPhone")),
    ])

    return hashlib.sha256(base.encode("utf-8")).hexdigest()


def make_geo_entry(row: dict) -> dict | None:
    latitude = clean_value(row.get("latitude"))
    longitude = clean_value(row.get("longitude"))
    if not latitude or not longitude:
        return None

    try:
        latitude_value = float(latitude)
        longitude_value = float(longitude)
    except ValueError:
        return None

    return {
        "id": make_id(row),
        "name": clean_value(row.get("name")),
        "latitude": latitude_value,
        "longitude": longitude_value,
        "address_city": clean_value(row.get("address_city")),
        "address_stateOrRegion": clean_value(row.get("address_stateOrRegion")),
        "address_country": clean_value(row.get("address_country")),
        "facilityTypeId": clean_value(row.get("facilityTypeId")),
    }


def chunks_from_csv(csv_file: str) -> list[dict]:
    chunks = []

    with open(csv_file, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            text = make_chunk_text(row)

            if not text.strip():
                continue

            chunks.append({
                "id": make_id(row),
                "text": text,
                "metadata": make_metadata(row),
            })

    return chunks


def build_geo_index(csv_file: str) -> list[dict]:
    geo_index = []

    with open(csv_file, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            entry = make_geo_entry(row)
            if entry:
                geo_index.append(entry)

    return geo_index


def get_openai_client() -> OpenAI:
    return OpenAI(api_key=os.environ["OPENAI_API_KEY"])


def get_chroma_collection():
    chroma_client = chromadb.CloudClient(
        cloud_port=443,
        cloud_host="europe-west1.gcp.trychroma.com",
        api_key=os.environ["CHROMA_API_KEY"],
        tenant=os.environ["CHROMA_TENANT"],
        database=os.environ["CHROMA_DATABASE"],
    )

    return chroma_client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


def embed_texts(openai_client: OpenAI, texts: list[str]) -> list[list[float]]:
    res = openai_client.embeddings.create(
        model=EMBED_MODEL,
        input=texts,
    )

    return [item.embedding for item in res.data]


def index_csv():
    openai_client = get_openai_client()
    collection = get_chroma_collection()

    chunks = chunks_from_csv(CSV_FILE)
    geo_index = build_geo_index(CSV_FILE)

    print(f"Loaded {len(chunks)} chunks")
    GEO_INDEX_FILE.write_text(json.dumps(geo_index), encoding="utf-8")
    print(f"Wrote geo index with {len(geo_index)} entries to {GEO_INDEX_FILE}")

    # Dump the same chunk text for BM25 to consume locally at query time.
    BM25_INDEX_FILE.write_text(json.dumps(chunks), encoding="utf-8")
    print(f"Wrote BM25 corpus with {len(chunks)} entries to {BM25_INDEX_FILE}")

    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i:i + BATCH_SIZE]

        texts = [x["text"] for x in batch]
        ids = [x["id"] for x in batch]
        metadatas = [x["metadata"] for x in batch]

        embeddings = embed_texts(openai_client, texts)

        collection.upsert(
            ids=ids,
            documents=texts,
            embeddings=embeddings,
            metadatas=metadatas,
        )

        print(f"Indexed {i + len(batch)} / {len(chunks)}")

    print("Done")


def search(query: str, n_results: int = 5):
    openai_client = get_openai_client()
    collection = get_chroma_collection()

    query_embedding = embed_texts(openai_client, [query])[0]

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=n_results,
        include=["documents", "metadatas", "distances"],
    )

    for i in range(len(results["ids"][0])):
        print("\n--- RESULT ---")
        print("Score distance:", results["distances"][0][i])
        print("Metadata:", results["metadatas"][0][i])
        print("Text:\n", results["documents"][0][i])


if __name__ == "__main__":
    index_csv()

    # Test queries
    search("clinic that performs cataract surgery in Noida")
    search("dental clinic for root canal and laser dentistry in Hyderabad")
    search("ophthalmology clinic with retina and glaucoma treatment")

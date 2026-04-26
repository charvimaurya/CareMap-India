import argparse
import csv
import hashlib
import importlib.metadata
import json
import math
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

import chromadb
from openai import OpenAI


ROOT_DIR = Path(__file__).resolve().parent
CSV_FILE = ROOT_DIR / "db" / "dataset_raw.csv"
GEO_INDEX_FILE = ROOT_DIR / "db" / "clinic_geo_index.json"
DEFAULT_COLLECTION_NAME = "clinics_rag_v2"
DEFAULT_EMBED_MODEL = "text-embedding-3-large"
DEFAULT_RESULTS = 20
DEFAULT_MAX_DISTANCE_KM = 100.0
DEFAULT_CHROMA_HOST = "europe-west1.gcp.trychroma.com"
DEFAULT_CHROMA_PORT = 443
MAX_GEO_CANDIDATES = 1500
CHROMA_GET_BATCH_SIZE = 250
FIELD_WEIGHTS = {
    "specialties": 4.0,
    "procedure": 3.5,
    "equipment": 2.5,
    "capability": 2.0,
}
DIRECTORY_DOMAIN_BLOCKLIST = {
    "facebook.com",
    "instagram.com",
    "justdial.com",
    "practo.com",
    "lybrate.com",
    "hexahealth.com",
    "credihealth.com",
    "medindia.net",
    "askapollo.com",
    "apollo247.com",
    "threebestrated.in",
}
TOKEN_RE = re.compile(r"[a-z0-9]+")
OPENING_HOURS_PATTERNS = [
    re.compile(r"(open\s*24\s*hours|24\s*/\s*7|always open)", re.IGNORECASE),
    re.compile(
        r"((?:monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|"
        r"saturday|sat|sunday|sun).{0,120})",
        re.IGNORECASE,
    ),
    re.compile(r"(opening hours?[:\s-]+.{0,120})", re.IGNORECASE),
    re.compile(r"(hours?[:\s-]+.{0,120})", re.IGNORECASE),
]
STOP_WORDS = {
    "a",
    "an",
    "and",
    "at",
    "center",
    "centre",
    "clinic",
    "does",
    "for",
    "hospital",
    "in",
    "is",
    "medical",
    "near",
    "of",
    "on",
    "or",
    "that",
    "the",
    "to",
    "with",
}


class SearchConfigurationError(RuntimeError):
    pass


def clean_value(value: Any) -> str:
    if value is None:
        return ""

    text = str(value).strip()
    if text.lower() in {"", "null", "none", "nan"}:
        return ""

    return text


def parse_json_list(value: Any) -> list[str]:
    text = clean_value(value)
    if not text:
        return []

    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return [clean_value(item) for item in parsed if clean_value(item)]
    except Exception:
        pass

    return [text]


def parse_float(value: Any) -> Optional[float]:
    text = clean_value(value)
    if not text:
        return None

    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def normalize_text(value: str) -> str:
    return " ".join(TOKEN_RE.findall(clean_value(value).lower()))


def tokenize(value: str) -> set[str]:
    return {
        token
        for token in TOKEN_RE.findall(clean_value(value).lower())
        if len(token) > 1 and token not in STOP_WORDS
    }


def make_id(row: dict[str, Any]) -> str:
    base = "|".join([
        clean_value(row.get("name")),
        clean_value(row.get("address_city")),
        clean_value(row.get("officialPhone")),
    ])
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


def get_collection_name() -> str:
    return clean_value(os.getenv("CLINIC_SEARCH_COLLECTION_NAME")) or DEFAULT_COLLECTION_NAME


def get_embed_model() -> str:
    return (
        clean_value(os.getenv("CLINIC_SEARCH_EMBED_MODEL"))
        or clean_value(os.getenv("OPENAI_EMBED_MODEL"))
        or DEFAULT_EMBED_MODEL
    )


def get_chroma_host() -> str:
    return clean_value(os.getenv("CHROMA_HOST")) or DEFAULT_CHROMA_HOST


def get_chroma_port() -> int:
    value = clean_value(os.getenv("CHROMA_PORT"))
    if not value:
        return DEFAULT_CHROMA_PORT

    try:
        return int(value)
    except ValueError as exc:
        raise SearchConfigurationError("CHROMA_PORT must be an integer.") from exc


def get_runtime_config() -> dict[str, Any]:
    try:
        chromadb_version = importlib.metadata.version("chromadb")
    except importlib.metadata.PackageNotFoundError:
        chromadb_version = "unknown"

    return {
        "collection_name": get_collection_name(),
        "embedding_model": get_embed_model(),
        "chroma_host": get_chroma_host(),
        "chroma_port": get_chroma_port(),
        "chromadb_version": chromadb_version,
        "embedding_model_env": (
            "CLINIC_SEARCH_EMBED_MODEL"
            if clean_value(os.getenv("CLINIC_SEARCH_EMBED_MODEL"))
            else "OPENAI_EMBED_MODEL"
            if clean_value(os.getenv("OPENAI_EMBED_MODEL"))
            else "default"
        ),
        "uses_chat_llm": False,
        "retrieval_mode": "geo_prefilter_then_vector" if GEO_INDEX_FILE.exists() else "vector_only_fallback",
        "default_results": DEFAULT_RESULTS,
        "default_max_distance_km": DEFAULT_MAX_DISTANCE_KM,
    }


def require_env(name: str) -> str:
    value = clean_value(os.getenv(name))
    if not value:
        raise SearchConfigurationError(f"Missing required environment variable: {name}")
    return value


def get_openai_client() -> OpenAI:
    return OpenAI(api_key=require_env("OPENAI_API_KEY"))


def get_chroma_collection():
    chroma_client = chromadb.CloudClient(
        cloud_port=get_chroma_port(),
        cloud_host=get_chroma_host(),
        api_key=require_env("CHROMA_API_KEY"),
        tenant=require_env("CHROMA_TENANT"),
        database=require_env("CHROMA_DATABASE"),
    )

    return chroma_client.get_collection(name=get_collection_name())


def embed_query(openai_client: OpenAI, query: str) -> list[float]:
    res = openai_client.embeddings.create(
        model=get_embed_model(),
        input=query,
    )
    return res.data[0].embedding


def build_where(
    city: Optional[str] = None,
    state: Optional[str] = None,
    country: Optional[str] = None,
    facility_type: Optional[str] = None,
):
    filters = []

    if city:
        filters.append({"address_city": city})
    if state:
        filters.append({"address_stateOrRegion": state})
    if country:
        filters.append({"address_country": country})
    if facility_type:
        filters.append({"facilityTypeId": facility_type})

    if not filters:
        return None
    if len(filters) == 1:
        return filters[0]
    return {"$and": filters}


def score_field_matches(query_text: str, query_tokens: set[str], values: list[str]) -> float:
    scores = []

    for value in values:
        value_text = normalize_text(value)
        value_tokens = tokenize(value)
        overlap = len(query_tokens & value_tokens)

        score = 0.0
        if value_text and value_text in query_text:
            score += 2.5
        elif value_tokens and overlap:
            score += overlap / len(value_tokens)
            score += overlap / max(len(query_tokens), 1)

        if score:
            scores.append(score)

    return sum(sorted(scores, reverse=True)[:3])


def haversine_distance_km(
    source_lat: float,
    source_lon: float,
    target_lat: float,
    target_lon: float,
) -> float:
    radius_km = 6371.0
    lat1 = math.radians(source_lat)
    lon1 = math.radians(source_lon)
    lat2 = math.radians(target_lat)
    lon2 = math.radians(target_lon)
    delta_lat = lat2 - lat1
    delta_lon = lon2 - lon1

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius_km * c


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return -1.0

    dot = 0.0
    left_norm = 0.0
    right_norm = 0.0
    for left_value, right_value in zip(left, right):
        dot += left_value * right_value
        left_norm += left_value * left_value
        right_norm += right_value * right_value

    if left_norm == 0.0 or right_norm == 0.0:
        return -1.0

    return dot / (math.sqrt(left_norm) * math.sqrt(right_norm))


def build_geo_index_from_csv(csv_file: Path = CSV_FILE) -> list[dict[str, Any]]:
    index = []
    with csv_file.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            latitude = parse_float(row.get("latitude"))
            longitude = parse_float(row.get("longitude"))
            if latitude is None or longitude is None:
                continue

            index.append({
                "id": make_id(row),
                "name": clean_value(row.get("name")),
                "latitude": latitude,
                "longitude": longitude,
                "address_city": clean_value(row.get("address_city")),
                "address_stateOrRegion": clean_value(row.get("address_stateOrRegion")),
                "address_country": clean_value(row.get("address_country")),
                "facilityTypeId": clean_value(row.get("facilityTypeId")),
            })
    return index


def save_geo_index(index: list[dict[str, Any]], output_file: Path = GEO_INDEX_FILE) -> None:
    output_file.write_text(json.dumps(index), encoding="utf-8")


@lru_cache(maxsize=1)
def load_geo_index() -> list[dict[str, Any]]:
    if not CSV_FILE.exists():
        raise SearchConfigurationError(f"Missing geo source file: {CSV_FILE}")

    needs_refresh = not GEO_INDEX_FILE.exists()
    if GEO_INDEX_FILE.exists():
        needs_refresh = GEO_INDEX_FILE.stat().st_mtime < CSV_FILE.stat().st_mtime

    if needs_refresh:
        geo_index = build_geo_index_from_csv()
        save_geo_index(geo_index)
        return geo_index

    try:
        return json.loads(GEO_INDEX_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        geo_index = build_geo_index_from_csv()
        save_geo_index(geo_index)
        return geo_index


def apply_geo_filters(
    geo_index: list[dict[str, Any]],
    city: Optional[str],
    state: Optional[str],
    country: Optional[str],
    facility_type: Optional[str],
) -> list[dict[str, Any]]:
    if not any([city, state, country, facility_type]):
        return geo_index

    filtered = []
    city_normalized = clean_value(city).lower()
    state_normalized = clean_value(state).lower()
    country_normalized = clean_value(country).lower()
    facility_type_normalized = clean_value(facility_type).lower()

    for item in geo_index:
        if city_normalized and item["address_city"].lower() != city_normalized:
            continue
        if state_normalized and item["address_stateOrRegion"].lower() != state_normalized:
            continue
        if country_normalized and item["address_country"].lower() != country_normalized:
            continue
        if facility_type_normalized and item["facilityTypeId"].lower() != facility_type_normalized:
            continue
        filtered.append(item)

    return filtered


def select_nearby_geo_candidates(
    user_lat: float,
    user_lon: float,
    city: Optional[str],
    state: Optional[str],
    country: Optional[str],
    facility_type: Optional[str],
    max_distance_km: float,
) -> list[dict[str, Any]]:
    geo_index = apply_geo_filters(load_geo_index(), city, state, country, facility_type)
    nearby = []

    for item in geo_index:
        distance_km = haversine_distance_km(
            user_lat,
            user_lon,
            item["latitude"],
            item["longitude"],
        )
        if distance_km <= max_distance_km:
            nearby.append({
                **item,
                "distance_km": distance_km,
            })

    nearby.sort(key=lambda item: item["distance_km"])
    return nearby[:MAX_GEO_CANDIDATES]


def fetch_documents_by_ids(collection, ids: list[str]) -> list[dict[str, Any]]:
    fetched = []

    for start in range(0, len(ids), CHROMA_GET_BATCH_SIZE):
        batch_ids = ids[start:start + CHROMA_GET_BATCH_SIZE]
        response = collection.get(
            ids=batch_ids,
            include=["documents", "metadatas", "embeddings"],
        )
        response_ids = response.get("ids")
        response_documents = response.get("documents")
        response_metadatas = response.get("metadatas")
        response_embeddings = response.get("embeddings")

        if response_ids is None:
            response_ids = []
        if response_documents is None:
            response_documents = []
        if response_metadatas is None:
            response_metadatas = []
        if response_embeddings is None:
            response_embeddings = []
        elif hasattr(response_embeddings, "tolist"):
            response_embeddings = response_embeddings.tolist()

        for item_id, document, metadata, embedding in zip(
            response_ids,
            response_documents,
            response_metadatas,
            response_embeddings,
        ):
            fetched.append({
                "id": item_id,
                "document": document,
                "metadata": metadata,
                "embedding": embedding,
            })

    return fetched


def score_candidates(
    query: str,
    query_embedding: list[float],
    candidates: list[dict[str, Any]],
    distance_by_id: Optional[dict[str, float]] = None,
) -> list[dict[str, Any]]:
    query_text = normalize_text(query)
    query_tokens = tokenize(query)
    scored = []

    for candidate in candidates:
        embedding = candidate.get("embedding")
        if not embedding:
            continue

        semantic_score = cosine_similarity(query_embedding, embedding)
        vector_distance = 1.0 - semantic_score
        metadata = candidate["metadata"] or {}

        field_score = 0.0
        field_breakdown = {}
        for field, weight in FIELD_WEIGHTS.items():
            values = parse_json_list(metadata.get(f"{field}_json"))
            match_score = score_field_matches(query_text, query_tokens, values)
            weighted_score = match_score * weight
            field_breakdown[field] = round(weighted_score, 3)
            field_score += weighted_score

        total_score = field_score + max(semantic_score, 0.0)
        scored_item = {
            "id": candidate["id"],
            "document": candidate["document"],
            "metadata": metadata,
            "distance": vector_distance,
            "semantic_score": semantic_score,
            "field_score": field_score,
            "field_breakdown": field_breakdown,
            "total_score": total_score,
        }

        if distance_by_id and candidate["id"] in distance_by_id:
            scored_item["distance_km"] = distance_by_id[candidate["id"]]

        scored.append(scored_item)

    scored.sort(
        key=lambda item: (
            item["total_score"],
            item.get("distance_km") is not None,
            -(item.get("distance_km") or float("inf")),
        ),
        reverse=True,
    )
    return scored


def global_semantic_search(
    collection,
    query: str,
    query_embedding: list[float],
    n_results: int,
    city: Optional[str],
    state: Optional[str],
    country: Optional[str],
    facility_type: Optional[str],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    # Use the hybrid pipeline from search.py: acronym expansion + bucket
    # pre-filter + dense ANN + BM25 + RRF merge + cross-encoder rerank.
    from search import (
        BM25_TOPK,
        DENSE_TOPK,
        RERANK_TOPK,
        bm25_search,
        classify_query,
        expand_acronyms,
        rerank,
        rrf_merge,
    )

    expanded_query = expand_acronyms(query)

    explicit_where = build_where(
        city=city, state=state, country=country, facility_type=facility_type
    )
    classification = classify_query(query)
    bucket_filter = (
        {f"bucket_{classification['bucket']}": True}
        if classification.get("bucket")
        else None
    )

    if explicit_where and bucket_filter:
        if "$and" in explicit_where:
            combined_where = {"$and": explicit_where["$and"] + [bucket_filter]}
        else:
            combined_where = {"$and": [explicit_where, bucket_filter]}
    else:
        combined_where = explicit_where or bucket_filter

    candidate_count = max(DENSE_TOPK, n_results * 5)

    # Reuse the caller's embedding when the query wasn't expanded; only spend
    # another OpenAI call when acronym expansion actually changed the text.
    if expanded_query == query:
        dense_embedding = query_embedding
    else:
        dense_embedding = embed_query(get_openai_client(), expanded_query)

    def _run_dense(where: Optional[dict[str, Any]]) -> dict[str, Any]:
        args = {
            "query_embeddings": [dense_embedding],
            "n_results": candidate_count,
            "include": ["documents", "metadatas", "distances"],
        }
        if where:
            args["where"] = where
        return collection.query(**args)

    try:
        dense_results = _run_dense(combined_where)
    except Exception:
        dense_results = _run_dense(explicit_where)

    dense_hits: list[dict[str, Any]] = []
    if dense_results.get("ids") and dense_results["ids"][0]:
        for clinic_id, document, metadata, distance in zip(
            dense_results["ids"][0],
            dense_results["documents"][0],
            dense_results["metadatas"][0],
            dense_results["distances"][0],
        ):
            distance_value = float(distance)
            dense_hits.append({
                "id":             clinic_id,
                "document":       document,
                "metadata":       metadata or {},
                "distance":       distance_value,
                "semantic_score": 1.0 / (1.0 + max(distance_value, 0.0)),
            })

    bm25_raw = bm25_search(expanded_query, combined_where, BM25_TOPK)
    bm25_hits: list[dict[str, Any]] = []
    for hit in bm25_raw:
        bm25_hits.append({
            "id":             hit["id"],
            "document":       hit["text"],
            "metadata":       hit["metadata"] or {},
            "distance":       1.0,
            "semantic_score": 0.0,
            "bm25_score":     hit["score"],
        })

    # If the bucket filter excluded everything from both channels, retry without it.
    if bucket_filter and not dense_hits and not bm25_hits:
        try:
            dense_results = _run_dense(explicit_where)
        except Exception:
            dense_results = _run_dense(None)
        if dense_results.get("ids") and dense_results["ids"][0]:
            for clinic_id, document, metadata, distance in zip(
                dense_results["ids"][0],
                dense_results["documents"][0],
                dense_results["metadatas"][0],
                dense_results["distances"][0],
            ):
                distance_value = float(distance)
                dense_hits.append({
                    "id":             clinic_id,
                    "document":       document,
                    "metadata":       metadata or {},
                    "distance":       distance_value,
                    "semantic_score": 1.0 / (1.0 + max(distance_value, 0.0)),
                })
        bm25_hits = [
            {
                "id":             hit["id"],
                "document":       hit["text"],
                "metadata":       hit["metadata"] or {},
                "distance":       1.0,
                "semantic_score": 0.0,
                "bm25_score":     hit["score"],
            }
            for hit in bm25_search(expanded_query, explicit_where, BM25_TOPK)
        ]

    # Patch BM25-only hits with dense distance/semantic_score where we have it.
    dense_lookup = {h["id"]: h for h in dense_hits}
    merged = rrf_merge(dense_hits, bm25_hits)
    for item in merged:
        if item["id"] in dense_lookup:
            item["distance"] = dense_lookup[item["id"]]["distance"]
            item["semantic_score"] = dense_lookup[item["id"]]["semantic_score"]

    reranked = rerank(query, merged, RERANK_TOPK)

    bm25_lookup = {h["id"]: h for h in bm25_hits}
    out: list[dict[str, Any]] = []
    for item in reranked[:n_results]:
        bm25_score = float(bm25_lookup.get(item["id"], {}).get("bm25_score", 0.0))
        rerank_score = float(item.get("rerank", 0.0))
        out.append({
            "id":               item["id"],
            "document":         item["document"],
            "metadata":         item["metadata"],
            "distance":         float(item.get("distance", 1.0)),
            "semantic_score":   float(item.get("semantic_score", 0.0)),
            "field_score":      bm25_score,
            "field_breakdown":  {"bm25": round(bm25_score, 3)},
            "total_score":      rerank_score,
        })

    return out, {
        "mode":             "hybrid_rrf_rerank",
        "candidate_count":  len(merged),
    }


def geo_prefilter_search(
    collection,
    query: str,
    query_embedding: list[float],
    n_results: int,
    user_lat: float,
    user_lon: float,
    city: Optional[str],
    state: Optional[str],
    country: Optional[str],
    facility_type: Optional[str],
    max_distance_km: float,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    nearby_candidates = select_nearby_geo_candidates(
        user_lat=user_lat,
        user_lon=user_lon,
        city=city,
        state=state,
        country=country,
        facility_type=facility_type,
        max_distance_km=max_distance_km,
    )
    if not nearby_candidates:
        return [], {
            "mode": "geo_prefilter_then_vector",
            "max_distance_km": max_distance_km,
            "prefilter_candidate_count": 0,
            "vector_candidate_count": 0,
        }

    candidate_ids = [item["id"] for item in nearby_candidates]
    distance_by_id = {
        item["id"]: round(item["distance_km"], 3)
        for item in nearby_candidates
    }
    fetched_candidates = fetch_documents_by_ids(collection, candidate_ids)
    scored = score_candidates(
        query=query,
        query_embedding=query_embedding,
        candidates=fetched_candidates,
        distance_by_id=distance_by_id,
    )

    scored.sort(
        key=lambda item: (
            item.get("distance_km") is None,
            item.get("distance_km") if item.get("distance_km") is not None else float("inf"),
            -item["total_score"],
        )
    )
    return scored[:n_results], {
        "mode": "geo_prefilter_then_vector",
        "max_distance_km": max_distance_km,
        "prefilter_candidate_count": len(nearby_candidates),
        "vector_candidate_count": len(scored),
    }


def extract_domain(url: str) -> str:
    hostname = urllib.parse.urlparse(url).netloc.lower()
    return hostname[4:] if hostname.startswith("www.") else hostname


def is_blocked_domain(domain: str) -> bool:
    return any(
        domain == blocked or domain.endswith(f".{blocked}")
        for blocked in DIRECTORY_DOMAIN_BLOCKLIST
    )


def extract_opening_hours(*texts: str) -> Optional[str]:
    for text in texts:
        normalized = re.sub(r"\s+", " ", clean_value(text))
        if not normalized:
            continue

        for pattern in OPENING_HOURS_PATTERNS:
            match = pattern.search(normalized)
            if match:
                return match.group(1).strip(" .,:;-")

    return None


def select_official_result(name: str, results: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    name_tokens = tokenize(name)
    best_result = None
    best_score = float("-inf")

    for result in results:
        url = clean_value(result.get("url"))
        if not url:
            continue

        domain = extract_domain(url)
        if is_blocked_domain(domain):
            continue

        haystack = " ".join([
            clean_value(result.get("title")),
            clean_value(result.get("content")),
            clean_value(result.get("raw_content")),
            domain.replace(".", " "),
        ])
        overlap = len(name_tokens & tokenize(haystack))
        score = float(result.get("score") or 0.0) + (overlap * 0.75)

        if overlap == 0 and name_tokens:
            continue
        if score > best_score:
            best_result = result
            best_score = score

    if best_result:
        return best_result

    for result in results:
        url = clean_value(result.get("url"))
        if url and not is_blocked_domain(extract_domain(url)):
            return result

    return None


def enrich_with_tavily(result: dict[str, Any]) -> Optional[dict[str, str]]:
    api_key = clean_value(os.getenv("TAVILY_API_KEY"))
    if not api_key:
        return None

    metadata = result["metadata"]
    name = clean_value(metadata.get("name"))
    if not name:
        return None

    location_bits = [
        clean_value(metadata.get("address_city")),
        clean_value(metadata.get("address_stateOrRegion")),
        clean_value(metadata.get("address_country")) or "India",
    ]
    query = " ".join(
        bit for bit in [f"\"{name}\"", *location_bits, "official website opening hours"] if bit
    )
    payload = {
        "query": query,
        "topic": "general",
        "search_depth": "advanced",
        "max_results": 5,
        "include_answer": "advanced",
        "include_raw_content": "text",
        "exact_match": True,
        "country": "india",
    }
    request = urllib.request.Request(
        "https://api.tavily.com/search",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
        return None

    result_items = body.get("results") or []
    official_result = select_official_result(name, result_items)

    existing_websites = parse_json_list(metadata.get("websites_json"))
    website = clean_value(official_result.get("url")) if official_result else ""
    if not website and existing_websites:
        website = existing_websites[0]
    if not website:
        return None

    opening_hours = extract_opening_hours(
        clean_value(body.get("answer")),
        clean_value(official_result.get("raw_content")) if official_result else "",
        clean_value(official_result.get("content")) if official_result else "",
        clean_value(official_result.get("title")) if official_result else "",
    )

    enrichment = {"website": website}
    if opening_hours:
        enrichment["opening_hours"] = opening_hours
    return enrichment


def serialize_result(rank: int, item: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "rank": rank,
        "id": item["id"],
        "document": item["document"],
        "metadata": item["metadata"],
        "vector_distance": round(item["distance"], 6),
        "semantic_score": round(item["semantic_score"], 6),
        "field_score": round(item["field_score"], 6),
        "field_breakdown": item["field_breakdown"],
        "total_score": round(item["total_score"], 6),
    }
    if item.get("distance_km") is not None:
        payload["distance_km"] = round(item["distance_km"], 3)
    if item.get("enrichment"):
        payload["enrichment"] = item["enrichment"]
    return payload


def search_clinics(
    query: str,
    n_results: int = DEFAULT_RESULTS,
    city: Optional[str] = None,
    state: Optional[str] = None,
    country: Optional[str] = None,
    facility_type: Optional[str] = None,
    user_lat: Optional[float] = None,
    user_lon: Optional[float] = None,
    enrich: bool = False,
    enrich_top_k: int = 3,
    print_results: bool = True,
    max_distance_km: Optional[float] = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if (user_lat is None) != (user_lon is None):
        raise ValueError("Both user_lat and user_lon are required for geo filtering.")

    openai_client = get_openai_client()
    collection = get_chroma_collection()
    query_embedding = embed_query(openai_client, query)

    if user_lat is not None and user_lon is not None:
        max_distance_km = max_distance_km or DEFAULT_MAX_DISTANCE_KM
        results, retrieval_info = geo_prefilter_search(
            collection=collection,
            query=query,
            query_embedding=query_embedding,
            n_results=n_results,
            user_lat=user_lat,
            user_lon=user_lon,
            city=city,
            state=state,
            country=country,
            facility_type=facility_type,
            max_distance_km=max_distance_km,
        )
    else:
        results, retrieval_info = global_semantic_search(
            collection=collection,
            query=query,
            query_embedding=query_embedding,
            n_results=n_results,
            city=city,
            state=state,
            country=country,
            facility_type=facility_type,
        )

    if enrich:
        for item in results[:max(enrich_top_k, 0)]:
            item["enrichment"] = enrich_with_tavily(item)

    if print_results:
        for i, item in enumerate(results, start=1):
            meta = item["metadata"]
            print("\n==============================")
            print(f"Rank: {i}")
            print(f"Rerank score: {item['total_score']:.3f}")
            print(f"Vector distance: {item['distance']:.4f}")
            print(f"Name: {meta.get('name')}")
            print(f"City: {meta.get('address_city')}")
            print(f"State: {meta.get('address_stateOrRegion')}")
            print(f"Country: {meta.get('address_country')}")
            print(f"Facility type: {meta.get('facilityTypeId')}")
            print(f"Phone: {meta.get('officialPhone')}")
            print(f"Email: {meta.get('email')}")
            print(f"Field match weights: {item['field_breakdown']}")
            if item.get("distance_km") is not None:
                print(f"Distance: {item['distance_km']:.1f} km")
            if item.get("enrichment"):
                print(f"Website: {item['enrichment'].get('website')}")
                if item["enrichment"].get("opening_hours"):
                    print(f"Opening hours: {item['enrichment']['opening_hours']}")
            print("\nMatched text:")
            print(item["document"])

    return results, retrieval_info


def build_search_response(
    query: str,
    n_results: int = DEFAULT_RESULTS,
    city: Optional[str] = None,
    state: Optional[str] = None,
    country: Optional[str] = None,
    facility_type: Optional[str] = None,
    user_lat: Optional[float] = None,
    user_lon: Optional[float] = None,
    enrich: bool = False,
    enrich_top_k: int = 3,
    max_distance_km: Optional[float] = None,
) -> dict[str, Any]:
    results, retrieval_info = search_clinics(
        query=query,
        n_results=n_results,
        city=city,
        state=state,
        country=country,
        facility_type=facility_type,
        user_lat=user_lat,
        user_lon=user_lon,
        enrich=enrich,
        enrich_top_k=enrich_top_k,
        print_results=False,
        max_distance_km=max_distance_km,
    )

    effective_max_distance = (
        max_distance_km or DEFAULT_MAX_DISTANCE_KM
        if user_lat is not None and user_lon is not None
        else None
    )

    return {
        "query": query,
        "count": len(results),
        "filters": {
            "city": city,
            "state": state,
            "country": country,
            "facility_type": facility_type,
            "user_lat": user_lat,
            "user_lon": user_lon,
            "enrich": enrich,
            "enrich_top_k": enrich_top_k,
            "max_distance_km": effective_max_distance,
        },
        "model_info": get_runtime_config(),
        "retrieval_info": retrieval_info,
        "results": [serialize_result(rank, item) for rank, item in enumerate(results, start=1)],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("query", help="Search query")
    parser.add_argument("--n", type=int, default=DEFAULT_RESULTS, help="Number of results")
    parser.add_argument("--city", default=None)
    parser.add_argument("--state", default=None)
    parser.add_argument("--country", default=None)
    parser.add_argument("--facility-type", default=None)
    parser.add_argument("--user-lat", type=float, default=None)
    parser.add_argument("--user-lon", type=float, default=None)
    parser.add_argument(
        "--max-distance-km",
        type=float,
        default=None,
        help=f"Maximum distance radius when user coordinates are supplied. Default: {DEFAULT_MAX_DISTANCE_KM} km",
    )
    parser.add_argument(
        "--enrich",
        action="store_true",
        help="Use Tavily to fetch official website and opening-hours snippets for top results.",
    )
    parser.add_argument(
        "--enrich-top-k",
        type=int,
        default=3,
        help="How many top-ranked clinics to enrich with Tavily.",
    )
    args = parser.parse_args()

    search_clinics(
        query=args.query,
        n_results=args.n,
        city=args.city,
        state=args.state,
        country=args.country,
        facility_type=args.facility_type,
        user_lat=args.user_lat,
        user_lon=args.user_lon,
        enrich=args.enrich,
        enrich_top_k=args.enrich_top_k,
        max_distance_km=args.max_distance_km,
    )


if __name__ == "__main__":
    main()

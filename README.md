# CareMap India

## Project Summary

### CareMap India: From Confusion to Care, in Minutes

In India, a postal code can determine a lifespan. A mother in rural Bihar travels four hours to reach a hospital, only to be told it does not have the specialist her child needs. A man in Delhi with chest pain walks into the nearest clinic, which has no cardiac capability. Not because the right care did not exist nearby. Because nobody knew where it was.

This is not a hospital shortage problem. It is a discovery problem, and it costs lives every day.

CareMap India is built to close that gap. A user describes their concern in plain language, "I have a fracture, I am in Patna", and the system responds with a clear, confident next step. Not a list to scroll through. A specific answer: here is where to go, here is how urgent this is, and here is why this facility is the right fit.

Behind every recommendation is a reasoning layer processing 10,000+ real facility records, cross-checking whether a hospital that claims an ICU actually has one, flagging trust gaps where reported equipment does not match stated capabilities, and identifying medical deserts where entire regions lack access to oncology, dialysis, or emergency trauma care. The system does not just find a facility. It verifies one.

Getting to the right place faster means better outcomes. It is that simple.

From a business perspective, CareMap India sits at the first and most critical touchpoint in any healthcare journey, making it a natural fit for hospitals improving patient routing, insurers managing care costs, telehealth platforms, and public health systems tracking unmet demand across regions.

The technology is built to scale. The problem it solves is urgent, universal, and almost entirely unsolved. In a country of 1.4 billion people, near enough is not good enough.

## Demo Video

- Demo Link: [Add your demo video URL here](https://example.com/demo)

---

## Table of Contents

- [System Overview](#system-overview)
- [Architecture](#architecture)
- [Repository Structure](#repository-structure)
- [Search and Ranking Pipeline](#search-and-ranking-pipeline)
- [API Design](#api-design)
- [Configuration and Environment Variables](#configuration-and-environment-variables)
- [Local Development](#local-development)
- [Docker](#docker)
- [Data Indexing and Refresh](#data-indexing-and-refresh)
- [Security and Auth](#security-and-auth)
- [Troubleshooting](#troubleshooting)
- [Roadmap Suggestions](#roadmap-suggestions)

---

## System Overview

CareMap India retrieves best-fit healthcare facilities from a structured clinic dataset.  
It combines semantic retrieval (OpenAI embeddings + Chroma), lexical retrieval (BM25), optional re-ranking, and location-aware prefiltering.

### Core goals

- Return relevant facilities for symptom/procedure intent queries.
- Improve local relevance with distance-aware filtering.
- Keep API usage simple for web/chat clients.
- Support offline-friendly indexing from CSV data.

---

## Architecture

```text
                     +----------------------+
                     |   Frontend Prototype |
                     |      (frontend/)     |
                     +----------+-----------+
                                |
                                | HTTP POST /search or /rag-search
                                v
                       +--------+--------+
                       |   Flask API     |
                       |   (api/app.py)  |
                       +--------+--------+
                                |
      +-------------------------+---------------------------+
      |                                                     |
      v                                                     v
+-----+------------------+                   +--------------+--------------+
| Search Orchestrator    |                   |   Health / Runtime Config   |
| (search_clinics.py)    |                   |   model/env diagnostics     |
+-----+------------------+                   +-----------------------------+
      |
      | Query embedding + retrieval strategy
      v
+-----+------------------+         +---------------------------+
| OpenAI Embeddings      |         | Chroma Cloud Collection   |
| text-embedding-3-large |<------->| clinics_rag_v2            |
+------------------------+         +---------------------------+
      |
      +--> optional geo prefilter via clinic_geo_index.json
      |
      +--> optional Tavily enrichment (website/opening hours)

Data prep:
dataset_raw.csv --(embed_clinics.py)--> Chroma vectors
                                 \----> clinic_geo_index.json
                                 \----> bm25_index.json
```

### High-level components

- **API layer:** request validation, auth, route handling.
- **Retrieval layer:** hybrid ranking and geo-aware candidate narrowing.
- **Data prep layer:** converts CSV into vector-ready chunks and metadata.
- **Frontend prototype:** independent UX experimentation.

---

## Repository Structure

```text
CareMap-India/
├── api/
│   ├── app.py                 # Flask API entrypoint
│   ├── openapi.yaml           # API contract (if maintained)
│   └── static/chat.html       # Basic browser UI
├── db/
│   ├── dataset_raw.csv        # Source clinic data
│   ├── clinic_geo_index.json  # Geo index cache (generated)
│   └── bm25_index.json        # Lexical index cache (generated)
├── frontend/                  # React/Vite prototype app
├── embed_clinics.py           # Indexing pipeline (CSV -> vectors + caches)
├── search_clinics.py          # Main retrieval and ranking logic
├── search.py                  # Hybrid retrieval helpers (BM25/RRF/rerank)
├── db_search.py               # Databricks SQL helper utilities
├── requirements.txt
├── Dockerfile
└── README.md
```

---

## Search and Ranking Pipeline

Implemented primarily in `search_clinics.py`.

### 1) Input normalization and validation

- Query text must be non-empty.
- Optional filters: `city`, `state`, `country`, `facility_type`.
- Optional coordinates: `user_lat` + `user_lon` must come together.

### 2) Strategy selection

- **With user coordinates:** `geo_prefilter_then_vector`
  - Load/refresh `clinic_geo_index.json`.
  - Keep candidates within default radius (100 km).
  - Fetch only those clinic IDs from Chroma.
  - Re-score candidates using semantic + field signals.
- **Without coordinates:** `hybrid_rrf_rerank`
  - Dense ANN on Chroma.
  - BM25 search over local corpus.
  - Reciprocal Rank Fusion (RRF) merge.
  - Reranker stage for final ordering.

### 3) Scoring

- **Semantic score:** cosine similarity over embeddings.
- **Field score:** weighted overlaps for specialties/procedures/equipment/capabilities.
- **Total score:** combined ranking score (pipeline-specific).

### 4) Optional enrichment

If `enrich=true`, top-K results are enriched using Tavily with:

- likely official website
- extracted opening-hours snippet (when available)

---

## API Design

Base app: `api/app.py`

### Public routes

- `GET /`
- `GET /chat`
- `GET /static/*`

### Protected routes (Bearer token required)

- `GET /health`  
  Returns runtime configuration and dependency accessibility.
- `POST /rag-search`  
  Main search endpoint.
- `POST /search`  
  Alias of `/rag-search`.

### Example request

```json
{
  "query": "orthopedic clinic for knee pain",
  "n_results": 10,
  "city": "Delhi",
  "user_lat": 28.6139,
  "user_lon": 77.2090,
  "enrich": false,
  "enrich_top_k": 3
}
```

### Example response fields

- `query`
- `count`
- `filters`
- `model_info`
- `retrieval_info`
- `results[]` with ranking, metadata, and scores

---

## Configuration and Environment Variables

Create `.env` from `.env.example` and fill values.

### Required for core search

- `OPENAI_API_KEY`
- `CHROMA_API_KEY`
- `CHROMA_TENANT`
- `CHROMA_DATABASE`

### Optional overrides

- `CLINIC_SEARCH_COLLECTION_NAME` (default: `clinics_rag_v2`)
- `CLINIC_SEARCH_EMBED_MODEL` or `OPENAI_EMBED_MODEL`
- `CHROMA_HOST` (default: `europe-west1.gcp.trychroma.com`)
- `CHROMA_PORT` (default: `443`)
- `API_HOST` (default: `0.0.0.0`)
- `API_PORT` (default: `5001`)
- `FLASK_DEBUG` (`true/false`)

### Optional enrichment

- `TAVILY_API_KEY`

### API auth

- `API_BEARER_TOKEN` (default fallback: `hello world`)

---

## Local Development

### Backend setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Run API

```bash
python api/app.py
```

API default URL: `http://localhost:5001`

### Health check

```bash
curl -H "Authorization: Bearer <token>" http://localhost:5001/health
```

### Frontend prototype (if needed)

If using the React prototype under `frontend/`, run it in that directory according to its package scripts (typically `npm run dev`).

---

## Docker

### Build

```bash
docker build -t caremap-india .
```

### Run

```bash
docker run --rm -p 5001:5001 --env-file .env caremap-india
```

---

## Data Indexing and Refresh

Use `embed_clinics.py` to (re)index from `db/dataset_raw.csv`.

### What it generates

- Vector entries in Chroma collection
- `db/clinic_geo_index.json` for distance prefilter
- `db/bm25_index.json` for lexical retrieval

### Run indexing

```bash
python embed_clinics.py
```

Re-run indexing whenever source CSV schema/content changes.

---

## Security and Auth

- Non-public API routes require:

```text
Authorization: Bearer <token>
```

- Public paths are intentionally limited to `/`, `/chat`, and `/static/*`.
- Do not commit real `.env` files or production tokens.

---

## Troubleshooting

### `/health` returns degraded

- Verify OpenAI and Chroma env vars are set.
- Confirm network access to Chroma Cloud host/port.
- Ensure target collection exists and is readable.

### Empty/weak search results

- Re-index dataset (`python embed_clinics.py`).
- Validate query wording and filters.
- Test without restrictive filters (`city/facility_type`).

### Geo filtering returns nothing

- Ensure input coordinates are valid.
- Check whether candidate clinics exist in radius.
- Increase `max_distance_km` if exposed in caller.

### Enrichment missing

- Check `TAVILY_API_KEY`.
- Enrichment is best-effort and may return partial data.

---

## Roadmap Suggestions

- Move triage dictionaries to a config API instead of frontend hardcoding.
- Add schema validation for API request/response bodies.
- Add automated tests for ranking and filter behavior.
- Add observability (request IDs, latency metrics, retrieval diagnostics).
- Add CI workflow for lint/test/build checks.

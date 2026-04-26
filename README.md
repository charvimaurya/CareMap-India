# CareMap-India

Clinic search service using OpenAI embeddings and ChromaDB, with:

- geo-prefilter-first retrieval within 100 km when user coordinates are provided
- Flask API plus a browser chat UI with map-based location picking
- optional Tavily enrichment for website and opening hours
- Docker support with Gunicorn

## Local run

Export the required environment variables in your shell, then run:

```bash
python api/app.py
```

Install dependencies with the project requirements before running. The Chroma Cloud integration expects a modern `chromadb` release:

```bash
pip install -r requirements.txt
```

Chroma Cloud connection settings can also be overridden explicitly:

```bash
export CHROMA_HOST=europe-west1.gcp.trychroma.com
export CHROMA_PORT=443
```

The `/health` route verifies real collection access, not just whether the Chroma env vars exist.

## Docker run

Build:

```bash
docker build -t caremap-india .
```

Run with an env file:

```bash
docker run --rm -p 5001:5001 --env-file .env caremap-india
```

You can copy `.env.example` to `.env` and fill in the values locally. `.env` files are ignored by Git.

## Auth

Protected API routes require:

```text
Authorization: Bearer <token>
```

The server reads the token from `API_BEARER_TOKEN`. If not set, it falls back to `hello world`.

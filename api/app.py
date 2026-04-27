import os
import sys
from pathlib import Path
from typing import Any, Optional

from flask import Flask, jsonify, request, send_from_directory


ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from search_clinics import (  # noqa: E402
    SearchConfigurationError,
    build_search_response,
    clean_value,
    get_chroma_collection,
    get_runtime_config,
)


MAX_RESULTS = 50
MAX_ENRICH_TOP_K = 5
DEFAULT_AUTH_BEARER_TOKEN = "hello world"

STATIC_DIR = Path(__file__).resolve().parent / "static"

app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")


class ApiBadRequestError(ValueError):
    pass


def env_present(name: str) -> bool:
    return bool(clean_value(os.getenv(name)))


def get_auth_bearer_token() -> str:
    return clean_value(os.getenv("API_BEARER_TOKEN")) or DEFAULT_AUTH_BEARER_TOKEN


def parse_bool(value: Any, field_name: str, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "y"}:
            return True
        if normalized in {"false", "0", "no", "n"}:
            return False
    raise ApiBadRequestError(f"{field_name} must be a boolean.")


def parse_optional_string(value: Any, field_name: str) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ApiBadRequestError(f"{field_name} must be a string.")
    stripped = value.strip()
    return stripped or None


def parse_optional_float(value: Any, field_name: str) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, bool):
        raise ApiBadRequestError(f"{field_name} must be a number.")
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ApiBadRequestError(f"{field_name} must be a number.") from None


def parse_optional_int(value: Any, field_name: str) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, bool):
        raise ApiBadRequestError(f"{field_name} must be an integer.")
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ApiBadRequestError(f"{field_name} must be an integer.") from None


def validate_search_request(body: dict[str, Any]) -> dict[str, Any]:
    query = parse_optional_string(body.get("query"), "query")
    if not query:
        raise ApiBadRequestError("query is required and must be a non-empty string.")

    n_results = parse_optional_int(body.get("n_results"), "n_results") or 20
    if n_results < 1 or n_results > MAX_RESULTS:
        raise ApiBadRequestError(f"n_results must be between 1 and {MAX_RESULTS}.")

    enrich_top_k = parse_optional_int(body.get("enrich_top_k"), "enrich_top_k") or 3
    if enrich_top_k < 0 or enrich_top_k > MAX_ENRICH_TOP_K:
        raise ApiBadRequestError(
            f"enrich_top_k must be between 0 and {MAX_ENRICH_TOP_K}."
        )

    user_lat = parse_optional_float(body.get("user_lat"), "user_lat")
    user_lon = parse_optional_float(body.get("user_lon"), "user_lon")
    if (user_lat is None) != (user_lon is None):
        raise ApiBadRequestError(
            "user_lat and user_lon must be provided together for distance sorting."
        )

    if user_lat is not None and not (-90 <= user_lat <= 90):
        raise ApiBadRequestError("user_lat must be between -90 and 90.")
    if user_lon is not None and not (-180 <= user_lon <= 180):
        raise ApiBadRequestError("user_lon must be between -180 and 180.")

    return {
        "query": query,
        "n_results": n_results,
        "city": parse_optional_string(body.get("city"), "city"),
        "state": parse_optional_string(body.get("state"), "state"),
        "country": parse_optional_string(body.get("country"), "country"),
        "facility_type": parse_optional_string(
            body.get("facility_type"), "facility_type"
        ),
        "user_lat": user_lat,
        "user_lon": user_lon,
        "enrich": parse_bool(body.get("enrich"), "enrich", default=False),
        "enrich_top_k": enrich_top_k,
    }


def json_error(error_message: str, status_code: int, **details: Any):
    payload = {"error": error_message}
    if details:
        payload["details"] = details
    return jsonify(payload), status_code


def is_public_route(path: str) -> bool:
    return path in {"/", "/chat"} or path.startswith("/static/")


def extract_bearer_token(header_value: str) -> Optional[str]:
    if not header_value:
        return None
    scheme, _, token = header_value.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token


@app.before_request
def require_bearer_token():
    if is_public_route(request.path):
        return None

    token = extract_bearer_token(request.headers.get("Authorization", ""))
    if token != get_auth_bearer_token():
        return json_error("Unauthorized.", 401, required_scheme="Bearer")
    return None


@app.route("/health", methods=["GET"])
def health():
    model_info = get_runtime_config()
    chroma_error = None
    chroma_accessible = False

    try:
        get_chroma_collection()
        chroma_accessible = True
    except Exception as exc:
        chroma_error = f"{type(exc).__name__}: {exc}"

    components = {
        "openai": {
            "configured": env_present("OPENAI_API_KEY"),
            "embedding_model": model_info["embedding_model"],
        },
        "chroma": {
            "configured": all(
                env_present(name)
                for name in ("CHROMA_API_KEY", "CHROMA_TENANT", "CHROMA_DATABASE")
            ),
            "collection_name": model_info["collection_name"],
            "host": model_info["chroma_host"],
            "port": model_info["chroma_port"],
            "accessible": chroma_accessible,
        },
        "tavily": {
            "configured": env_present("TAVILY_API_KEY"),
        },
    }




    if chroma_error:
        components["chroma"]["error"] = chroma_error

    overall_ok = (
        components["openai"]["configured"]
        and components["chroma"]["configured"]
        and chroma_accessible
    )
    return jsonify(
        {
            "status": "ok" if overall_ok else "degraded",
            "model_info": model_info,
            "components": components,
        }
    )


@app.route("/", methods=["GET"])
@app.route("/chat", methods=["GET"])
def chat_ui():
    return send_from_directory(app.static_folder, "chat.html")


@app.route("/rag-search", methods=["POST"])
def rag_search():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return json_error("Request body must be a JSON object.", 400)

    try:
        params = validate_search_request(body)
    except ApiBadRequestError as exc:
        return json_error(str(exc), 400)

    try:
        response = build_search_response(
            query=params["query"],
            n_results=params["n_results"],
            city=params["city"],
            state=params["state"],
            country=params["country"],
            facility_type=params["facility_type"],
            user_lat=params["user_lat"],
            user_lon=params["user_lon"],
            enrich=params["enrich"],
            enrich_top_k=params["enrich_top_k"],
        )
        return jsonify(response)
    except SearchConfigurationError as exc:
        return json_error(str(exc), 503)
    except Exception as exc:
        return json_error(
            "Failed to execute vector search.",
            502,
            exception_type=type(exc).__name__,
            error_detail=str(exc),
        )


@app.route("/search", methods=["POST"])
def search_alias():
    return rag_search()


if __name__ == "__main__":
    host = clean_value(os.getenv("API_HOST")) or "0.0.0.0"
    port = int(clean_value(os.getenv("API_PORT")) or "5001")
    debug = clean_value(os.getenv("FLASK_DEBUG")).lower() in {"1", "true", "yes"}
    app.run(host=host, port=port, debug=debug)

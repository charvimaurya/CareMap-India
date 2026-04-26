#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

LOCAL_URL="${LOCAL_URL:-http://127.0.0.1:3000/api/llm/triage}"
DELAY_SECONDS="${DELAY_SECONDS:-2}"

QUERY="${QUERY:-Find the best orthopaedics care for ACL tear treatment in Delhi}"
RESULT_NAME="${RESULT_NAME:-Sample Orthopaedic Hospital}"
RESULT_FACILITY="${RESULT_FACILITY:-Hospital}"
RESULT_CITY="${RESULT_CITY:-Delhi}"
RESULT_STATE="${RESULT_STATE:-Delhi}"
RESULT_COUNTRY="${RESULT_COUNTRY:-India}"
RESULT_SPECIALTIES="${RESULT_SPECIALTIES:-Orthopaedics, Sports Medicine}"
RESULT_PROCEDURES="${RESULT_PROCEDURES:-ACL reconstruction, Knee surgery}"
RESULT_CAPABILITIES="${RESULT_CAPABILITIES:-Orthopaedic surgery, Sports injury care}"
RESULT_EQUIPMENT="${RESULT_EQUIPMENT:-MRI, Arthroscopy}"
RESULT_DOCUMENT="${RESULT_DOCUMENT:-Orthopaedic hospital for knee surgery and ACL tear treatment.}"

payload="$(
  QUERY="$QUERY" \
  RESULT_NAME="$RESULT_NAME" \
  RESULT_FACILITY="$RESULT_FACILITY" \
  RESULT_CITY="$RESULT_CITY" \
  RESULT_STATE="$RESULT_STATE" \
  RESULT_COUNTRY="$RESULT_COUNTRY" \
  RESULT_SPECIALTIES="$RESULT_SPECIALTIES" \
  RESULT_PROCEDURES="$RESULT_PROCEDURES" \
  RESULT_CAPABILITIES="$RESULT_CAPABILITIES" \
  RESULT_EQUIPMENT="$RESULT_EQUIPMENT" \
  RESULT_DOCUMENT="$RESULT_DOCUMENT" \
  node <<'NODE'
const split = (value) => value.split(",").map(item => item.trim()).filter(Boolean);
const payload = {
  type: "result_review",
  query: process.env.QUERY || "",
  result: {
    name: process.env.RESULT_NAME || "",
    facilityType: process.env.RESULT_FACILITY || "",
    city: process.env.RESULT_CITY || "",
    state: process.env.RESULT_STATE || "",
    country: process.env.RESULT_COUNTRY || "",
    specialties: split(process.env.RESULT_SPECIALTIES || ""),
    procedures: split(process.env.RESULT_PROCEDURES || ""),
    capabilities: split(process.env.RESULT_CAPABILITIES || ""),
    equipment: split(process.env.RESULT_EQUIPMENT || ""),
    document: process.env.RESULT_DOCUMENT || "",
  },
};
process.stdout.write(JSON.stringify(payload));
NODE
)"

call_api() {
  local label="$1"
  local url="$2"
  local key_name="$3"
  local key_value="${!key_name:-}"
  local model="${4:-}"
  local body_file status request_body

  if [[ -z "$key_value" ]]; then
    printf '\n[%s] skipped - %s is not set\n' "$label" "$key_name"
    return 0
  fi

  body_file="$(mktemp)"
  if [[ -n "$model" ]]; then
    request_body="$(
      PAYLOAD="$payload" \
      MODEL="$model" \
      node <<'NODE'
const payload = process.env.PAYLOAD || "{}";
const body = {
  model: process.env.MODEL || "",
  temperature: 0,
  response_format: { type: "json_object" },
  messages: [
    {
      role: "system",
      content: "You are a strict medical triage intake assistant for CareMap India. You only return valid JSON matching the user's requested schema.",
    },
    {
      role: "user",
      content: payload,
    },
  ],
};
process.stdout.write(JSON.stringify(body));
NODE
    )"
    status=$(curl -sS -o "$body_file" -w '%{http_code}' \
      -H "Authorization: Bearer $key_value" \
      -H 'Content-Type: application/json' \
      -H 'HTTP-Referer: http://localhost:3000' \
      -H 'X-Title: CareMap India Debug Script' \
      -d "$request_body" \
      "$url" || true)
  else
    status=$(curl -sS -o "$body_file" -w '%{http_code}' \
      -H "Authorization: Bearer $key_value" \
      -H 'Content-Type: application/json' \
      -d "$payload" \
      "$url" || true)
  fi

  printf '\n[%s] %s\n' "$label" "$url"
  printf 'status: %s\n' "${status:-000}"
  printf 'body:\n'
  cat "$body_file"
  printf '\n'
  rm -f "$body_file"

  sleep "$DELAY_SECONDS"
}

printf 'Query: %s\n' "$QUERY"
printf 'Running provider probes with %ss delay between calls.\n' "$DELAY_SECONDS"

call_api "openrouter:minimax" "https://openrouter.ai/api/v1/chat/completions" OPENROUTER_API_KEY "minimax/minimax-m2.5:free"
call_api "groq" "https://api.groq.com/openai/v1/chat/completions" GROQ_API_KEY "llama-3.1-8b-instant"
call_api "zai" "https://api.z.ai/api/paas/v4/chat/completions" ZAI_API_KEY "glm-5.1"

printf '\n[local] %s\n' "$LOCAL_URL"
body_file="$(mktemp)"
status=$(curl -sS -o "$body_file" -w '%{http_code}' \
  -H 'Content-Type: application/json' \
  -d "$payload" \
  "$LOCAL_URL" || true)
printf 'status: %s\n' "${status:-000}"
printf 'body:\n'
cat "$body_file"
printf '\n'
rm -f "$body_file"

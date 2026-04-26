#!/usr/bin/env bash

set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:5001}"
API_TOKEN="${API_TOKEN:-hello world}"

if command -v jq >/dev/null 2>&1; then
  FORMATTER=(jq .)
else
  FORMATTER=(cat)
fi

run_get() {
  local path="$1"
  echo
  echo "==> GET ${API_BASE_URL}${path}"
  curl -sS \
    -H "Authorization: Bearer ${API_TOKEN}" \
    "${API_BASE_URL}${path}" | "${FORMATTER[@]}"
}

run_post() {
  local path="$1"
  local payload="$2"

  echo
  echo "==> POST ${API_BASE_URL}${path}"
  echo "payload: ${payload}"
  curl -sS \
    -X POST \
    -H "Authorization: Bearer ${API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data-raw "${payload}" \
    "${API_BASE_URL}${path}" | "${FORMATTER[@]}"
}

run_get "/health"

run_post "/search" '{"query":"retina clinic for cataract surgery","city":"Delhi","state":"Delhi","n_results":3,"enrich":false}'

run_post "/rag-search" '{"query":"Find the best General Medicine care facilities for this patient. Primary complaint: cold. Triage urgency: Routine. Symptom duration: Not specified. Patient location: Munich. LLM follow-up answers: How long have you had a cold?: More than 7 days; Do you have any difficulty breathing or wheezing?: No; Have you experienced any of the following symptoms?: Fatigue. Prioritize facilities that match the speciality, have capability for this urgency level, and are relevant for the reported symptoms.","city":"Munich","n_results":3,"enrich":false}'

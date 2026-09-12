#!/bin/sh
set -eu

: "${CANDIDATE_MANIFEST_URL:?set CANDIDATE_MANIFEST_URL}"
: "${CANDIDATE_BUILD_URL:?set CANDIDATE_BUILD_URL}"
: "${CANDIDATE_ASSET_BASE:?set CANDIDATE_ASSET_BASE}"
: "${CANDIDATE_BACKEND:?set CANDIDATE_BACKEND}"

exec python3 "$(dirname "$0")/verify_candidate_consistency.py" \
  --identity-mode candidate \
  --generation-scope all \
  --candidate-manifest-url "$CANDIDATE_MANIFEST_URL" \
  --candidate-build-url "$CANDIDATE_BUILD_URL" \
  --candidate-asset-base "$CANDIDATE_ASSET_BASE" \
  --candidate-backend "$CANDIDATE_BACKEND"

#!/usr/bin/env bash
# Regenerate the typed client from the API's OpenAPI document.
#
# Starts the API in-process rather than requiring a running server, so this works
# identically on a laptop and in CI.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$ROOT/packages/api-client/src"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ dumping OpenAPI schema"
# Written from Python, not shell-redirected: anything the app logs on stdout
# would otherwise end up inside the JSON.
OPENAPI_OUT="$TMP/openapi.json" uv run --project "$ROOT/apps/api" python - <<'PY'
import json
import os

from app.main import create_app

with open(os.environ["OPENAPI_OUT"], "w") as fh:
    json.dump(create_app().openapi(), fh, indent=2)
PY

echo "→ generating TypeScript types"
pnpm --filter @eog/api-client exec openapi-typescript "$TMP/openapi.json" -o "$OUT/schema.d.ts"

echo "✓ $OUT/schema.d.ts"

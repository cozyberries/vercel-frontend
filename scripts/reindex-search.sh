#!/usr/bin/env bash
# Trigger Upstash Search re-index. Run from project root with dev server up.
# Usage: ./scripts/reindex-search.sh   or   bash scripts/reindex-search.sh
set -e
cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  set -a
  source .env.local 2>/dev/null || true
  set +a
fi

URL="http://localhost:3000/api/cron/reindex-search"
echo "POST $URL"
echo "---"

if [ -n "$CRON_SECRET" ]; then
  curl -s -w "\n---\nHTTP %{http_code}\n" -X POST "$URL" -H "Authorization: Bearer $CRON_SECRET"
else
  curl -s -w "\n---\nHTTP %{http_code}\n" -X POST "$URL"
fi
echo ""

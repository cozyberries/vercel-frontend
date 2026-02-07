#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# run-product-tests.sh
#
# Run the Playwright product-page tests against a local Next.js dev server.
#
# Usage:
#   ./scripts/run-product-tests.sh            # headless (default)
#   ./scripts/run-product-tests.sh --headed   # open a visible browser
#   ./scripts/run-product-tests.sh --debug    # step-through debug mode
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# ── Ensure Playwright browsers are installed ──────────────────────────────
if ! npx playwright install --dry-run chromium >/dev/null 2>&1; then
  echo "📦 Installing Playwright browsers..."
  npx playwright install chromium
fi

# ── Parse flags ───────────────────────────────────────────────────────────
EXTRA_FLAGS=""
MODE="headless"

for arg in "$@"; do
  case "$arg" in
    --headed)
      EXTRA_FLAGS="--headed"
      MODE="headed"
      ;;
    --debug)
      EXTRA_FLAGS="--headed --debug"
      MODE="debug"
      ;;
    *)
      EXTRA_FLAGS="$EXTRA_FLAGS $arg"
      ;;
  esac
done

echo "═══════════════════════════════════════════════"
echo "  Running Product Page Tests ($MODE)"
echo "═══════════════════════════════════════════════"
echo ""
echo "  Project : $PROJECT_DIR"
echo "  Test    : tests/products.spec.ts"
echo "  Browser : chromium"
echo ""

# ── Run tests ─────────────────────────────────────────────────────────────
# Playwright config already has webServer.command = "npm run dev"
# which starts the dev server automatically and reuses it if already running.
# Temporarily disable errexit so we can capture the exit code on failure.
set +e
npx playwright test tests/products.spec.ts \
  --project=chromium \
  --reporter=list \
  $EXTRA_FLAGS

EXIT_CODE=$?
set -e

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ All product tests passed!"
else
  echo "❌ Some tests failed (exit code $EXIT_CODE)."
  echo "   Run with --headed or --debug for more detail."
  echo "   HTML report: npx playwright show-report"
fi

exit $EXIT_CODE

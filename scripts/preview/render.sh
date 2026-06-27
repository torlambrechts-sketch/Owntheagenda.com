#!/usr/bin/env bash
# Render the Flows design-preview fixtures to PNGs with headless Chromium.
# These are static HTML mocks that load the real app/globals.css and the exact
# component markup, so they reflect the live design without needing the app,
# a Supabase env or an authenticated session.
#
# Usage:   scripts/preview/render.sh
# Output:  scripts/preview/out/*.png
#
# Chromium resolution order:
#   1. $CHROME_BIN (if set)
#   2. google-chrome / chromium / chromium-browser on PATH
#   3. a Playwright-installed chromium (~/.cache/ms-playwright or /opt/pw-browsers)
# If none is found, install one with:  npx playwright install chromium
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="$ROOT/scripts/preview"
OUT="$DIR/out"
mkdir -p "$OUT"

find_chrome() {
  if [ -n "${CHROME_BIN:-}" ] && [ -x "${CHROME_BIN}" ]; then echo "$CHROME_BIN"; return; fi
  for c in google-chrome google-chrome-stable chromium chromium-browser; do
    if command -v "$c" >/dev/null 2>&1; then command -v "$c"; return; fi
  done
  ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome \
        "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux/chrome 2>/dev/null | sort -V | tail -1
}

CHROME="$(find_chrome || true)"
if [ -z "${CHROME:-}" ]; then
  echo "No Chromium found. Set CHROME_BIN=/path/to/chrome, or run:" >&2
  echo "  npx playwright install chromium" >&2
  exit 1
fi
echo "Using Chromium: $CHROME"

# fixture:window-height (width is fixed at the app content width)
shoot() {
  local name="$1" height="$2"
  "$CHROME" --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=2 --window-size="1180,${height}" \
    --virtual-time-budget=5000 \
    --screenshot="$OUT/${name}.png" "file://$DIR/${name}.html" >/dev/null 2>&1
  echo "wrote $OUT/${name}.png"
}

shoot flows-main 1740
shoot flows-builder 1100

echo "Done. Previews in $OUT"

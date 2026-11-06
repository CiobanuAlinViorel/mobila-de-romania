#!/bin/sh
# nginx image entrypoint hook: writes config.js from environment variables, so a single image can serve
# every environment. Without MDR_* variables the config.js shipped with the build is kept.
#   MDR_ASSETS_BASE_URL  folder containing models/ and snapshots/ (CDN, blob storage, …)
#   MDR_MODEL_TIER       auto | high | medium | low
set -eu

TARGET=/var/www/mobila-de-romania/config.js
[ -n "${MDR_ASSETS_BASE_URL:-}${MDR_MODEL_TIER:-}" ] || exit 0

json() { printf '"%s"' "$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')"; }

{
  printf 'window.__MDR_CONFIG__ = {'
  if [ -n "${MDR_ASSETS_BASE_URL:-}" ]; then printf ' assetsBaseUrl: %s,' "$(json "$MDR_ASSETS_BASE_URL")"; fi
  if [ -n "${MDR_MODEL_TIER:-}" ]; then printf ' modelTier: %s,' "$(json "$MDR_MODEL_TIER")"; fi
  printf ' }\n'
} > "$TARGET"

echo "40-runtime-config.sh: wrote $TARGET"

#!/usr/bin/env bash
# Installs a build on a Linux host that runs nginx (on-premise machine, Azure VM, …).
# Usage: pnpm build && sudo deploy/nginx/install.sh [dist-dir]
# Replaces the contents of /var/www/mobila-de-romania; a customized config.js on the host is kept.
set -euo pipefail

DIST="${1:-dist}"
ROOT=/var/www/mobila-de-romania
CONF="$(dirname "$0")/mobila-de-romania.conf"

[ -f "$DIST/index.html" ] || { echo "No build in '$DIST': run 'pnpm build' first." >&2; exit 1; }

KEEP=""
if [ -f "$ROOT/config.js" ]; then
  KEEP="$(mktemp)"
  cp "$ROOT/config.js" "$KEEP"
fi

mkdir -p "$ROOT"
find "$ROOT" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -a "$DIST"/. "$ROOT"/
if [ -n "$KEEP" ]; then mv "$KEEP" "$ROOT/config.js"; fi
find "$ROOT" -type d -exec chmod 755 {} + && find "$ROOT" -type f -exec chmod 644 {} +

if [ -d /etc/nginx/sites-available ]; then
  cp "$CONF" /etc/nginx/sites-available/mobila-de-romania.conf
  ln -sf /etc/nginx/sites-available/mobila-de-romania.conf /etc/nginx/sites-enabled/mobila-de-romania.conf
  if [ -e /etc/nginx/sites-enabled/default ]; then
    echo "Note: /etc/nginx/sites-enabled/default also listens on port 80; disable it or set server_name in the site config."
  fi
else
  cp "$CONF" /etc/nginx/conf.d/mobila-de-romania.conf
fi

nginx -t
systemctl reload nginx
echo "Deployed $(du -sh "$ROOT" | cut -f1) to $ROOT"

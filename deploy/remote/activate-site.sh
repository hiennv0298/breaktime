#!/usr/bin/env bash
# deploy/remote/activate-site.sh — runs on the VPS as root, sent over ssh stdin (bash -s).
# Precondition: the caller uploaded the new site file to /srv/sites/.breaktime.caddy.new and
# checked DNS for breaktime.doibung.com (Let's Encrypt failure limit).
# Validates the site file on the running doibung Caddy, swaps it in, reloads through the admin
# API on 127.0.0.1:2019 and restores the previous file when the reload fails.
set -Eeuo pipefail
umask 022
trap 'echo "__ERROR__ line=$LINENO rc=$?" >&2' ERR

NEW=/srv/sites/.breaktime.caddy.new
SITE=/srv/sites/breaktime.caddy
BAK=/srv/sites/.breaktime.caddy.bak
LOCK=/srv/sites/breaktime/.deploy.lock
CADDY=doibung-caddy-1

exec 9>"$LOCK"; flock -n 9 || { echo __LOCKED__; exit 3; }

[ -f "$NEW" ] && [ ! -L "$NEW" ] && [ -s "$NEW" ] || { echo "__ERROR__ missing or empty $NEW" >&2; exit 4; }

vrc=0
vout=$(docker exec -i "$CADDY" caddy validate --config - --adapter caddyfile < "$NEW" 2>&1) || vrc=$?
if [ "$vrc" -ne 0 ] || ! printf '%s\n' "$vout" | grep -q "Valid configuration"; then
  printf '%s\n' "$vout" | tail -n 20 >&2
  rm -f -- "$NEW"
  echo "__SITE_INVALID__"
  exit 20
fi

reload_caddy() {
  docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile --address 127.0.0.1:2019
}

had_site=0
if [ -e "$SITE" ]; then
  cp -p -- "$SITE" "$BAK"
  had_site=1
fi
chmod 644 -- "$NEW"
mv -f -- "$NEW" "$SITE"
chmod 644 -- "$SITE"

if ! reload_caddy; then
  if [ "$had_site" -eq 1 ]; then
    cp -p -- "$BAK" "$SITE"
  else
    rm -f -- "$SITE"
  fi
  reload_caddy || echo "__ERROR__ reload after restore also failed" >&2
  echo "__SITE_ROLLED_BACK__"
  exit 21
fi

cfg=$(docker exec "$CADDY" wget -qO- http://127.0.0.1:2019/config/ 2>/dev/null || true)
if ! printf '%s' "$cfg" | grep -q 'breaktime.doibung.com'; then
  echo "__ERROR__ reload rc 0 but the live admin config has no breaktime.doibung.com (is the sites import missing? run npm run infra:check)" >&2
  exit 22
fi

echo "__SITE_RELOADED__ sha256=$(sha256sum -- "$SITE" | cut -c1-64)"

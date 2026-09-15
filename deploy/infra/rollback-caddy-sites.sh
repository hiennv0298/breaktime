#!/usr/bin/env bash
# deploy/infra/rollback-caddy-sites.sh — restores doibung's Caddyfile.nodb + both compose files
# from a backup made by apply-caddy-sites.sh. Sent over stdin by scripts/infra.mjs:
#
#   preflight <BACKUP_DIR>            same flags + nonce as apply's preflight, plus BACKUP_OK
#   restore <BACKUP_DIR> <nonce>      operator-approved rollback; consumes the one-time nonce first
#   restore-auto <BACKUP_DIR>         ONLY used by infra.mjs right after a failed, already-approved apply
#
# Recreates caddy only with the withdb file and --no-deps, and only when the live container has
# the /srv/sites mount (or is not running). /srv/sites stays in place.
set -Eeuo pipefail

DIR=/opt/doibung
CADDY=doibung-caddy-1
APP=doibung-app-1
PG=doibung-postgres-1
IMPORT_LINE='import /etc/caddy/sites/*.caddy'
MOUNT_TEXT='/srv/sites:/etc/caddy/sites:ro'
BACKUP_ROOT=/root/breaktime-infra-backup
BACKUP_RE='^/root/breaktime-infra-backup/[0-9]{8}T[0-9]{6}Z$'
NONCE_FILE="$BACKUP_ROOT/.approval-nonce"
NONCE_TTL=21600
ADMIN_URL='http://127.0.0.1:2019/config/'
COMPOSE=(docker compose -p doibung -f docker-compose.withdb.yml)
FILES=(Caddyfile.nodb docker-compose.nodb.yml docker-compose.withdb.yml)

trap 'rc=$?; [ "$BASHPID" = "$$" ] && echo "SCRIPT_ERROR line=$LINENO rc=$rc"' ERR

count_line() { awk -v s="$1" '{ l = $0; sub(/\r$/, "", l); if (l == s) n++ } END { print n + 0 }' "$2"; }
count_substr() { awk -v s="$1" 'index($0, s) { n++ } END { print n + 0 }' "$2"; }

caddy_running() {
  local r
  r=$(docker inspect -f '{{.State.Running}}' "$CADDY" 2>/dev/null) || r=''
  [ "$r" = true ]
}

live_mount_count() {
  local m
  m=$(docker inspect -f '{{range .Mounts}}{{.Source}}>{{.Destination}}>{{.RW}} {{end}}' "$CADDY" 2>/dev/null) || m=''
  printf '%s\n' "$m" | awk '{ for (i = 1; i <= NF; i++) if ($i == "/srv/sites>/etc/caddy/sites>false") n++ } END { print n + 0 }'
}

live_import_count() {
  local body
  body=$(docker exec "$CADDY" cat /etc/caddy/Caddyfile 2>/dev/null) || body=''
  printf '%s\n' "$body" | awk -v s="$IMPORT_LINE" '{ l = $0; sub(/\r$/, "", l); if (l == s) n++ } END { print n + 0 }'
}

cert_fp() {
  local raw
  raw=$({ openssl s_client -connect 127.0.0.1:443 -servername doibung.com </dev/null 2>/dev/null || true; } \
    | { openssl x509 -noout -fingerprint -sha256 2>/dev/null || true; })
  raw=${raw#*=}
  if [[ "$raw" =~ ^[0-9A-F]{2}(:[0-9A-F]{2}){31}$ ]]; then printf '%s' "$raw"; fi
}

container_id() { docker inspect -f '{{.Id}}' "$1" 2>/dev/null || true; }
label_hash() { docker inspect -f '{{index .Config.Labels "com.docker.compose.config-hash"}}' "$1" 2>/dev/null || true; }

compose_hashes() {
  local out
  out=$("${COMPOSE[@]}" config --hash app,postgres 2>/dev/null) || return 0
  printf '%s\n' "$out" | awk '$1 == "app" { a = $2 } $1 == "postgres" { p = $2 } END { if (a != "" && p != "") print a, p }'
}

hashes_match_running() {
  local h
  h=$(compose_hashes)
  [ -n "$h" ] && [ "${h%% *}" = "$(label_hash "$APP")" ] && [ "${h##* }" = "$(label_hash "$PG")" ]
}

check_backup_dir() { # $1 = BACKUP_DIR
  local d=${1:-} f
  [[ "$d" =~ $BACKUP_RE ]] || { echo "BACKUP_FAIL=dir-format"; exit 50; }
  [ -d "$d" ] && [ ! -L "$d" ] || { echo "BACKUP_FAIL=dir-missing"; exit 50; }
  for f in "${FILES[@]}"; do
    [ -f "$d/$f" ] && [ ! -L "$d/$f" ] && [ -s "$d/$f" ] || { echo "BACKUP_FAIL=missing-$f"; exit 50; }
  done
  BACKUP_DIR=$d
  echo "BACKUP_OK=$BACKUP_DIR"
}

ensure_nonce() { # $1 = create | read
  local now hex='' epoch='' fresh=0
  install -d -m 700 "$BACKUP_ROOT"
  now=$(date +%s)
  if [ -f "$NONCE_FILE" ]; then
    read -r hex epoch < "$NONCE_FILE" || true
    if [[ "$hex" =~ ^[0-9a-f]{32}$ ]] && [[ "$epoch" =~ ^[0-9]+$ ]] \
      && [ $((now - epoch)) -ge 0 ] && [ $((now - epoch)) -le "$NONCE_TTL" ]; then
      fresh=1
    fi
  fi
  if [ "$fresh" -eq 0 ]; then
    if [ "$1" != create ]; then hex=''; epoch=$now; else
      hex=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
      [[ "$hex" =~ ^[0-9a-f]{32}$ ]] || { echo "PREFLIGHT_FAIL=nonce-generate"; exit 10; }
      epoch=$now
      (umask 077 && printf '%s %s\n' "$hex" "$epoch" > "$NONCE_FILE.tmp")
      chmod 600 "$NONCE_FILE.tmp"
      mv -f -- "$NONCE_FILE.tmp" "$NONCE_FILE"
    fi
  fi
  NONCE=$hex
  echo "NONCE=$NONCE"
  echo "NONCE_AGE_S=$((now - epoch))"
}

preflight() { # $1 = create | read
  cd "$DIR"
  for f in "${FILES[@]}"; do
    [ -s "$f" ] || { echo "PREFLIGHT_FAIL=missing-$f"; exit 10; }
  done
  "${COMPOSE[@]}" config --quiet || { echo "PREFLIGHT_FAIL=compose-config"; exit 10; }
  echo "COMPOSE_CONFIG_OK"
  hashes_match_running || { echo "PREFLIGHT_FAIL=hash"; exit 10; }
  echo "HASH_OK"

  if caddy_running; then
    CADDY_RUNNING=true
    CERT_FP_BEFORE=$(cert_fp)
    LIVE_MOUNT=$(live_mount_count)
    LIVE_IMPORT=$(live_import_count)
  else
    # Rollback must still be possible when caddy is down.
    CADDY_RUNNING=false
    CERT_FP_BEFORE=none
    LIVE_MOUNT=0
    LIVE_IMPORT=0
  fi
  [ -n "$CERT_FP_BEFORE" ] || CERT_FP_BEFORE=none
  APP_ID=$(container_id "$APP")
  PG_ID=$(container_id "$PG")
  [ -n "$APP_ID" ] && [ -n "$PG_ID" ] || { echo "PREFLIGHT_FAIL=container-id"; exit 10; }
  HOST_IMPORT=$(count_line "$IMPORT_LINE" Caddyfile.nodb)
  HOST_MOUNT_NODB=$(count_substr "$MOUNT_TEXT" docker-compose.nodb.yml)
  HOST_MOUNT_WITHDB=$(count_substr "$MOUNT_TEXT" docker-compose.withdb.yml)
  NEED_HOST_EDIT=0
  if [ "$HOST_IMPORT" = 0 ] || [ "$HOST_MOUNT_NODB" = 0 ] || [ "$HOST_MOUNT_WITHDB" = 0 ]; then NEED_HOST_EDIT=1; fi
  NEED_RECREATE=0
  if [ "$LIVE_MOUNT" = 0 ] || [ "$LIVE_IMPORT" = 0 ]; then NEED_RECREATE=1; fi

  echo "CADDY_RUNNING=$CADDY_RUNNING"
  echo "APP_ID=$APP_ID"
  echo "PG_ID=$PG_ID"
  echo "CERT_FP_BEFORE=$CERT_FP_BEFORE"
  echo "HOST_IMPORT=$HOST_IMPORT"
  echo "HOST_MOUNT_NODB=$HOST_MOUNT_NODB"
  echo "HOST_MOUNT_WITHDB=$HOST_MOUNT_WITHDB"
  echo "LIVE_MOUNT=$LIVE_MOUNT"
  echo "LIVE_IMPORT=$LIVE_IMPORT"
  echo "NEED_HOST_EDIT=$NEED_HOST_EDIT"
  echo "NEED_RECREATE=$NEED_RECREATE"
  ensure_nonce "$1"
  echo "PREFLIGHT_OK"
}

consume_nonce() { # $1 = nonce argument
  local arg=${1:-} consumed fhex='' fepoch='' now
  [[ "$arg" =~ ^[0-9a-f]{32}$ ]] || { echo "APPROVAL_NONCE_MISMATCH"; exit 40; }
  consumed="$BACKUP_ROOT/.approval-nonce.consumed.$$"
  if ! mv -- "$NONCE_FILE" "$consumed" 2>/dev/null; then
    echo "APPROVAL_NONCE_MISMATCH"
    exit 40
  fi
  read -r fhex fepoch < "$consumed" || true
  rm -f -- "$consumed"
  now=$(date +%s)
  if [ "$fhex" != "$arg" ] || ! [[ "$fepoch" =~ ^[0-9]+$ ]] \
    || [ $((now - fepoch)) -lt 0 ] || [ $((now - fepoch)) -gt "$NONCE_TTL" ]; then
    echo "APPROVAL_NONCE_MISMATCH"
    exit 40
  fi
  echo "APPROVAL_NONCE_CONSUMED"
}

restore() { # $1 = BACKUP_DIR (already validated), $2 = auto|approved
  local f recreate=0 i cfg
  cd "$DIR"
  install -d -m 700 "$BACKUP_ROOT"
  exec 9> "$BACKUP_ROOT/.apply.lock"
  # The failed apply's ssh session has exited before restore-auto starts, so its lock is free.
  flock -n 9 || { echo "ROLLBACK_FAIL=another-apply-running mode=$2"; exit 41; }

  APP_ID=$(container_id "$APP")
  PG_ID=$(container_id "$PG")
  # Keep the files as they are right now next to the backup, for forensics.
  install -d -m 700 "$BACKUP_DIR/before-rollback"
  for f in "${FILES[@]}"; do cat "$DIR/$f" > "$BACKUP_DIR/before-rollback/$f"; done

  for f in "${FILES[@]}"; do cat "$BACKUP_DIR/$f" > "$DIR/$f"; done
  for f in "${FILES[@]}"; do
    cmp -s "$BACKUP_DIR/$f" "$DIR/$f" || { echo "ROLLBACK_FAIL=restore-$f"; exit 51; }
  done
  echo "FILES_RESTORED"

  if ! hashes_match_running; then
    echo "ROLLBACK_FAIL=app-postgres-hash-after-restore"
    exit 13
  fi

  if ! caddy_running || [ "$(live_mount_count)" -ge 1 ]; then recreate=1; fi
  if [ "$recreate" = 1 ]; then
    echo "RECREATE_START"
    docker compose -p doibung -f docker-compose.withdb.yml up -d --pull never --no-deps caddy
    echo "RECREATE_DONE"
  else
    echo "RECREATE_SKIPPED"
  fi

  for i in $(seq 1 30); do
    if caddy_running; then
      cfg=$(docker exec "$CADDY" wget -qO- "$ADMIN_URL" 2>/dev/null) || cfg=''
      case "$cfg" in
        *doibung.com*)
          [ "$(container_id "$APP")" = "$APP_ID" ] || { echo "ROLLBACK_FAIL=app-container-changed"; exit 30; }
          [ "$(container_id "$PG")" = "$PG_ID" ] || { echo "ROLLBACK_FAIL=postgres-container-changed"; exit 30; }
          echo "LIVE_MOUNT_AFTER=$(live_mount_count)"
          echo "ROLLBACK_DONE BACKUP_DIR=$BACKUP_DIR"
          exit 0
          ;;
      esac
    fi
    sleep 1
  done
  echo "ROLLBACK_FAIL=verify"
  exit 30
}

case "${1:-}" in
  preflight)
    check_backup_dir "${2:-}"
    preflight create
    ;;
  restore)
    check_backup_dir "${2:-}"
    consume_nonce "${3:-}"
    restore "$BACKUP_DIR" approved
    ;;
  restore-auto)
    check_backup_dir "${2:-}"
    restore "$BACKUP_DIR" auto
    ;;
  *)
    echo "USAGE: bash -s -- preflight <BACKUP_DIR> | restore <BACKUP_DIR> <nonce> | restore-auto <BACKUP_DIR>"
    exit 2
    ;;
esac

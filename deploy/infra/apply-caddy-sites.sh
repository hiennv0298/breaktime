#!/usr/bin/env bash
# deploy/infra/apply-caddy-sites.sh — wires /srv/sites into doibung's Caddy (D-02, RESEARCH Pattern 12).
# Sent over stdin by scripts/infra.mjs:  bash -s -- preflight   |   bash -s -- apply <nonce>
#
#   preflight     read-only except the one-time approval nonce in /root/breaktime-infra-backup
#   apply <nonce> requires the nonce written by preflight (<= 6 h old); consumes it before any change,
#                 backs up, adds 1 import line + 1 mount line per compose file, validates in a
#                 --network none container, recreates ONLY caddy with the withdb file and --no-deps,
#                 verifies mounts, admin config, unchanged app/postgres IDs and certificate.
#
# Never: `up` with docker-compose.nodb.yml, omitting --no-deps, orphan removal, localhost admin address.
set -Eeuo pipefail

DIR=/opt/doibung
CADDY=doibung-caddy-1
APP=doibung-app-1
PG=doibung-postgres-1
IMPORT_LINE='import /etc/caddy/sites/*.caddy'
MOUNT_TEXT='/srv/sites:/etc/caddy/sites:ro'
ANCHOR='- ./Caddyfile.nodb:/etc/caddy/Caddyfile:ro'
SITES_ROOT=/srv/sites
BACKUP_ROOT=/root/breaktime-infra-backup
NONCE_FILE="$BACKUP_ROOT/.approval-nonce"
NONCE_TTL=21600
ADMIN_URL='http://127.0.0.1:2019/config/'
COMPOSE=(docker compose -p doibung -f docker-compose.withdb.yml)
FILES=(Caddyfile.nodb docker-compose.nodb.yml docker-compose.withdb.yml)

PHASE=preflight
BACKUP_DIR=''

restore_files() {
  local f
  [ -n "$BACKUP_DIR" ] || return 0
  for f in "${FILES[@]}"; do
    if [ -s "$BACKUP_DIR/$f" ]; then cat "$BACKUP_DIR/$f" > "$DIR/$f"; fi
  done
  for f in "${FILES[@]}"; do
    if ! cmp -s "$BACKUP_DIR/$f" "$DIR/$f"; then echo "RESTORE_FAIL=$f"; return 1; fi
  done
  echo "RESTORED_FROM=$BACKUP_DIR"
}

on_err() {
  local rc=$1 line=$2
  [ "$BASHPID" = "$$" ] || return 0
  echo "SCRIPT_ERROR line=$line rc=$rc phase=$PHASE"
  # Between the backup and the recreate, an unexpected error must not leave edited files behind.
  if [ "$PHASE" = edit ]; then restore_files || true; fi
}
trap 'on_err $? $LINENO' ERR

# Exact-line count (like grep -cxF), tolerant of CRLF; always prints a number, never fails.
count_line() { awk -v s="$1" '{ l = $0; sub(/\r$/, "", l); if (l == s) n++ } END { print n + 0 }' "$2"; }
# Substring count (like grep -cF).
count_substr() { awk -v s="$1" 'index($0, s) { n++ } END { print n + 0 }' "$2"; }

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

# Prints "APP_HASH POSTGRES_HASH" from the withdb file, or nothing on failure.
compose_hashes() {
  local out
  out=$("${COMPOSE[@]}" config --hash app,postgres 2>/dev/null) || return 0
  printf '%s\n' "$out" | awk '$1 == "app" { a = $2 } $1 == "postgres" { p = $2 } END { if (a != "" && p != "") print a, p }'
}

# 1 when `docker compose -f <file> config` has a bind with target /etc/caddy/sites and read_only: true.
compose_has_sites_mount() {
  local out
  out=$(docker compose -p doibung -f "$1" config 2>/dev/null) || { echo 0; return 0; }
  printf '%s\n' "$out" | awk '
    function close_blk() { if (blk && tgt && ro && src) ok = 1; blk = 0; tgt = 0; ro = 0; src = 0 }
    {
      match($0, /^ */); ind = RLENGTH
      if ($0 ~ /^ *- type: /) { close_blk(); blk = 1; dash = ind; next }
      if (blk && ind <= dash) close_blk()
      if (blk && $0 ~ /^ *target: \/etc\/caddy\/sites *$/) tgt = 1
      if (blk && $0 ~ /^ *source: \/srv\/sites *$/) src = 1
      if (blk && $0 ~ /^ *read_only: true *$/) ro = 1
    }
    END { close_blk(); print ok + 0 }'
}

# "ADDED REMOVED": non-blank added lines and removed lines between two files.
diff_counts() {
  { diff -- "$1" "$2" || true; } | awk '
    /^> / { l = substr($0, 3); if (l ~ /[^[:space:]]/) a++ }
    /^< / { r++ }
    END { print a + 0, r + 0 }'
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

preflight() { # $1 = create | read (nonce)
  local running image_tag tag_id hashes
  running=$(docker inspect -f '{{.State.Running}}' "$CADDY" 2>/dev/null) || running=''
  [ "$running" = true ] || { echo "PREFLIGHT_FAIL=caddy-not-running"; exit 10; }
  echo "CADDY_RUNNING=true"
  cd "$DIR"
  for f in "${FILES[@]}"; do
    [ -s "$f" ] || { echo "PREFLIGHT_FAIL=missing-$f"; exit 10; }
  done
  "${COMPOSE[@]}" config --quiet || { echo "PREFLIGHT_FAIL=compose-config"; exit 10; }
  # apply verifies the nodb mount through `docker compose config`, so it must render before approval.
  docker compose -p doibung -f docker-compose.nodb.yml config --quiet || { echo "PREFLIGHT_FAIL=compose-config-nodb"; exit 10; }
  echo "COMPOSE_CONFIG_OK"

  hashes=$(compose_hashes)
  PRE_APP_HASH=${hashes%% *}
  PRE_PG_HASH=${hashes##* }
  if [ -z "$hashes" ] || [ "$PRE_APP_HASH" != "$(label_hash "$APP")" ] || [ "$PRE_PG_HASH" != "$(label_hash "$PG")" ]; then
    echo "HASH_DETAIL=app:${PRE_APP_HASH:-none}/$(label_hash "$APP") postgres:${PRE_PG_HASH:-none}/$(label_hash "$PG")"
    echo "PREFLIGHT_FAIL=hash"
    exit 10
  fi
  echo "HASH_OK"

  IMAGE=$(docker inspect -f '{{.Image}}' "$CADDY")
  image_tag=$(docker inspect -f '{{.Config.Image}}' "$CADDY")
  tag_id=$(docker image inspect -f '{{.Id}}' "$image_tag" 2>/dev/null) || tag_id=''
  # A recreate uses the tag; it must be the exact image that is running and that we validate with.
  [ -n "$IMAGE" ] && [ "$tag_id" = "$IMAGE" ] || { echo "PREFLIGHT_FAIL=image-tag-moved"; exit 10; }
  echo "CADDY_IMAGE=$IMAGE"

  APP_ID=$(container_id "$APP")
  PG_ID=$(container_id "$PG")
  [ -n "$APP_ID" ] && [ -n "$PG_ID" ] || { echo "PREFLIGHT_FAIL=container-id"; exit 10; }
  CERT_FP_BEFORE=$(cert_fp)
  [ -n "$CERT_FP_BEFORE" ] || { echo "PREFLIGHT_FAIL=cert-fingerprint"; exit 10; }

  HOST_IMPORT=$(count_line "$IMPORT_LINE" Caddyfile.nodb)
  HOST_MOUNT_NODB=$(count_substr "$MOUNT_TEXT" docker-compose.nodb.yml)
  HOST_MOUNT_WITHDB=$(count_substr "$MOUNT_TEXT" docker-compose.withdb.yml)
  LIVE_MOUNT=$(live_mount_count)
  LIVE_IMPORT=$(live_import_count)
  NEED_HOST_EDIT=0
  if [ "$HOST_IMPORT" = 0 ] || [ "$HOST_MOUNT_NODB" = 0 ] || [ "$HOST_MOUNT_WITHDB" = 0 ]; then NEED_HOST_EDIT=1; fi
  NEED_RECREATE=0
  if [ "$LIVE_MOUNT" = 0 ] || [ "$LIVE_IMPORT" = 0 ]; then NEED_RECREATE=1; fi

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

verify_live() {
  local running cfg fp
  running=$(docker inspect -f '{{.State.Running}}' "$CADDY" 2>/dev/null) || running=''
  [ "$running" = true ] || { VERIFY_REASON=caddy-not-running; return 1; }
  [ "$(live_mount_count)" -ge 1 ] || { VERIFY_REASON=live-mount; return 1; }
  [ "$(live_import_count)" -ge 1 ] || { VERIFY_REASON=live-import; return 1; }
  cfg=$(docker exec "$CADDY" wget -qO- "$ADMIN_URL" 2>/dev/null) || cfg=''
  case "$cfg" in *doibung.com*) ;; *) VERIFY_REASON=admin-config; return 1 ;; esac
  [ "$(container_id "$APP")" = "$APP_ID" ] || { VERIFY_REASON=app-container-changed; return 1; }
  [ "$(container_id "$PG")" = "$PG_ID" ] || { VERIFY_REASON=postgres-container-changed; return 1; }
  fp=$(cert_fp)
  [ -n "$fp" ] && [ "$fp" = "$CERT_FP_BEFORE" ] || { VERIFY_REASON=cert-fingerprint; return 1; }
  CERT_FP_AFTER=$fp
  return 0
}

edit_compose() { # $1 = compose file (relative to $DIR)
  local f=$1 tmp added removed
  if [ "$(count_substr "$MOUNT_TEXT" "$f")" != 0 ]; then
    cmp -s "$BACKUP_DIR/$f" "$f" || { restore_files || true; echo "EDIT_FAIL=$f-changed-unexpectedly"; exit 12; }
    echo "COMPOSE_MOUNT_PRESENT=$f"
  else
    tmp=$(mktemp "$BACKUP_DIR/.edit.XXXXXX")
    if ! awk -v anchor="$ANCHOR" -v mount="$MOUNT_TEXT" '
        { print }
        !done {
          line = $0; sub(/\r$/, "", line)
          t = line; sub(/^[ \t]+/, "", t); sub(/[ \t]+$/, "", t)
          if (t == anchor) { match(line, /^[ \t]*/); print substr(line, 1, RLENGTH) "- " mount; done = 1 }
        }
        END { if (!done) exit 3 }' "$f" > "$tmp"; then
      rm -f -- "$tmp"
      restore_files || true
      echo "EDIT_FAIL=$f-anchor-not-found"
      exit 12
    fi
    cat "$tmp" > "$f"
    rm -f -- "$tmp"
    read -r added removed <<< "$(diff_counts "$BACKUP_DIR/$f" "$f")"
    if [ "$added" != 1 ] || [ "$removed" != 0 ]; then
      restore_files || true
      echo "EDIT_FAIL=$f-diff added=$added removed=$removed"
      exit 12
    fi
    echo "COMPOSE_MOUNT_ADDED=$f"
  fi
  if [ "$(compose_has_sites_mount "$f")" != 1 ]; then
    restore_files || true
    echo "EDIT_FAIL=$f-config-missing-ro-sites-mount"
    exit 12
  fi
  echo "COMPOSE_CONFIG_SITES_RO=$f"
}

apply_mode() {
  local arg=${1:-} consumed fhex='' fepoch='' now hashes added removed validate_out i
  [[ "$arg" =~ ^[0-9a-f]{32}$ ]] || { echo "APPROVAL_NONCE_MISMATCH"; echo "APPLY_FAIL=nonce-arg-format"; exit 40; }

  install -d -m 700 "$BACKUP_ROOT"
  exec 9> "$BACKUP_ROOT/.apply.lock"
  flock -n 9 || { echo "APPLY_FAIL=another-apply-running"; exit 41; }

  preflight read
  if [ "$NEED_HOST_EDIT" = 0 ] && [ "$NEED_RECREATE" = 0 ]; then
    echo "APPLY_NOOP"
    exit 0
  fi

  # --- one-time approval nonce: atomically take it, then compare; any attempt burns it ---
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
  [ ! -e "$NONCE_FILE" ] || { echo "APPLY_FAIL=nonce-still-present"; exit 40; }
  echo "APPROVAL_NONCE_CONSUMED"

  # --- backup (outside /opt/doibung) ---
  BACKUP_DIR="$BACKUP_ROOT/$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -m 700 -- "$BACKUP_DIR" || { echo "BACKUP_FAIL=exists"; exit 14; }
  cp -a -- "${FILES[@]}" "$BACKUP_DIR/"
  docker inspect "$CADDY" > "$BACKUP_DIR/inspect.json"
  docker exec "$CADDY" wget -qO- "$ADMIN_URL" > "$BACKUP_DIR/live-config.json"
  {
    echo "APP_ID=$APP_ID"; echo "PG_ID=$PG_ID"; echo "CERT_FP_BEFORE=$CERT_FP_BEFORE"
    echo "APP_HASH=$PRE_APP_HASH"; echo "PG_HASH=$PRE_PG_HASH"; echo "CADDY_IMAGE=$IMAGE"
  } > "$BACKUP_DIR/preflight.env"
  for f in "${FILES[@]}" inspect.json live-config.json; do
    test -s "$BACKUP_DIR/$f" || { echo "BACKUP_FAIL=empty-$f"; exit 14; }
  done
  for f in "${FILES[@]}"; do
    cmp -s "$f" "$BACKUP_DIR/$f" || { echo "BACKUP_FAIL=differs-$f"; exit 14; }
  done
  echo "BACKUP_DIR=$BACKUP_DIR"
  PHASE=edit

  install -d -m 755 "$SITES_ROOT" "$SITES_ROOT/breaktime" "$SITES_ROOT/breaktime/releases"
  echo "SITES_DIRS_OK"

  # --- Caddyfile: append the import line (append keeps the inode of the single-file bind) ---
  if [ "$(count_line "$IMPORT_LINE" Caddyfile.nodb)" = 0 ]; then
    printf '\n%s\n' "$IMPORT_LINE" >> Caddyfile.nodb
    read -r added removed <<< "$(diff_counts "$BACKUP_DIR/Caddyfile.nodb" Caddyfile.nodb)"
    if [ "$added" != 1 ] || [ "$removed" != 0 ] || [ "$(count_line "$IMPORT_LINE" Caddyfile.nodb)" != 1 ]; then
      restore_files || true
      echo "EDIT_FAIL=Caddyfile.nodb-diff added=$added removed=$removed"
      exit 11
    fi
    echo "CADDYFILE_IMPORT_ADDED"
  else
    echo "CADDYFILE_IMPORT_PRESENT"
  fi

  # --- compose files: one mount line after the Caddyfile anchor, in both files ---
  edit_compose docker-compose.nodb.yml
  edit_compose docker-compose.withdb.yml

  hashes=$(compose_hashes)
  if [ "${hashes%% *}" != "$PRE_APP_HASH" ] || [ "${hashes##* }" != "$PRE_PG_HASH" ]; then
    restore_files || true
    echo "EDIT_FAIL=app-postgres-hash-changed"
    exit 13
  fi
  echo "APP_PG_HASH_UNCHANGED"

  # --- validate the candidate config in a throwaway container with no network ---
  validate_out=$(docker run --rm --network none --memory 128m -e SITE_DOMAIN=doibung.com \
    -v "$DIR/Caddyfile.nodb:/etc/caddy/Caddyfile:ro" -v /srv/sites:/etc/caddy/sites:ro \
    "$IMAGE" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1) || true
  case "$validate_out" in
    *"Valid configuration"*) echo "VALIDATE_OK" ;;
    *)
      printf '%s\n' "$validate_out" | tail -n 20
      restore_files || true
      echo "VALIDATE_FAIL"
      exit 20
      ;;
  esac

  # --- recreate caddy only ---
  PHASE=recreate
  if [ "$NEED_RECREATE" = 1 ]; then
    echo "RECREATE_START"
    docker compose -p doibung -f docker-compose.withdb.yml up -d --pull never --no-deps caddy
    echo "RECREATE_DONE"
  else
    echo "RECREATE_SKIPPED"
  fi

  # --- verify (retry up to 30 s) ---
  PHASE=verify
  VERIFY_REASON=unknown
  for i in $(seq 1 30); do
    if verify_live; then
      echo "CERT_FP_AFTER=$CERT_FP_AFTER"
      echo "VERIFY_OK"
      echo "APPLY_DONE BACKUP_DIR=$BACKUP_DIR"
      exit 0
    fi
    sleep 1
  done
  echo "VERIFY_FAIL=$VERIFY_REASON"
  exit 30
}

case "${1:-}" in
  preflight) preflight create ;;
  apply) apply_mode "${2:-}" ;;
  *) echo "USAGE: bash -s -- preflight | apply <nonce>"; exit 2 ;;
esac

#!/usr/bin/env bash
# deploy/remote/release.sh — runs on the VPS as root, sent over ssh stdin:
#   bash -s -- activate <sha12>
#   bash -s -- cleanup <current_sha12> <name>...
#   bash -s -- abort <sha12>
# Layout (D-04): /srv/sites/breaktime/current -> releases/<sha> (relative symlink),
# /srv/sites/breaktime/releases/<sha>/, uploads land in releases/.incoming-<sha>/.
# Every step prints a marker the Node side requires (rc 0 alone is not proof).
set -Eeuo pipefail
umask 022
trap 'echo "__ERROR__ line=$LINENO rc=$?" >&2' ERR

BASE=/srv/sites/breaktime
REL="${BASE:?}/releases"
SHA_RE='^[0-9a-f]{12}$'
NAME_RE='^[0-9a-f]{7,40}$'

die() {
  local code=$1
  shift
  echo "__ERROR__ $*" >&2
  exit "$code"
}

take_lock() {
  [ -d "$REL" ] && [ ! -L "$REL" ] || die 2 "releases dir missing or not a real directory: $REL"
  exec 9>"$BASE/.deploy.lock"; flock -n 9 || { echo __LOCKED__; exit 3; }
}

list_releases() {
  local d name
  for d in "$REL"/*/; do
    d=${d%/}
    { [ -d "$d" ] && [ ! -L "$d" ]; } || continue
    name=${d##*/}
    [[ $name =~ $NAME_RE ]] || continue
    echo "__REL__ $name $(stat -c %Y -- "$d")"
  done
}

cmd_activate() {
  local sha=${1:-}
  [[ $sha =~ $SHA_RE ]] || die 2 "invalid sha"
  take_lock
  local inc="$REL/.incoming-$sha"
  local old="$REL/.old-$sha"
  [ -d "$inc" ] && [ ! -L "$inc" ] && [ -f "$inc/index.html" ] || die 4 "incoming build missing or has no index.html: $inc"

  # Re-deploying the same sha: keep the previous copy aside until the swap succeeded.
  if [ -e "$REL/$sha" ] || [ -L "$REL/$sha" ]; then
    rm -rf --one-file-system -- "$old"
    mv -T -- "$REL/$sha" "$old"
  fi
  if ! mv -T -- "$inc" "$REL/$sha"; then
    if [ -e "$old" ]; then mv -T -- "$old" "$REL/$sha"; fi
    die 6 "could not move $inc into place"
  fi

  rm -f -- "$BASE/current.new"
  ln -sfn "releases/$sha" "$BASE/current.new" && mv -T "$BASE/current.new" "$BASE/current"
  rm -rf --one-file-system -- "$old"
  [ "$(readlink -- "$BASE/current")" = "releases/$sha" ] || die 5 "current does not point at releases/$sha"
  [ -f "$BASE/current/index.html" ] || die 5 "current/index.html missing after swap"

  echo "__ACTIVATED__ $sha"
  list_releases
  echo "__CURRENT__ $sha"
  echo "__END__"
}

cmd_cleanup() {
  local current=${1:-}
  [ $# -gt 0 ] && shift
  [[ $current =~ $SHA_RE ]] || die 2 "invalid current sha"
  take_lock
  local link cur_real
  link=$(readlink -- "$BASE/current" || true)
  # The deletion list was computed for this current; refuse if another deploy moved it meanwhile.
  [ "$link" = "releases/$current" ] || { echo "__CURRENT_MOVED__ $link"; exit 7; }
  cur_real=$(realpath -e -- "$BASE/current")

  local deleted=0 skipped=0 name p
  for name in "$@"; do
    if ! [[ $name =~ $NAME_RE ]] || [ "$name" = "$current" ] || [ "$link" = "releases/$name" ] \
      || [ -L "$REL/$name" ]; then
      echo "__SKIP__ $name"
      skipped=$((skipped + 1))
      continue
    fi
    if ! p=$(realpath -e -- "$REL/$name" 2>/dev/null) || [ "$(dirname -- "$p")" != "$REL" ] \
      || [ "$p" = "$cur_real" ] || [ ! -d "$p" ]; then
      echo "__SKIP__ $name"
      skipped=$((skipped + 1))
      continue
    fi
    rm -rf --one-file-system -- "$p"
    [ ! -e "$p" ] || die 8 "delete did not remove $p"
    deleted=$((deleted + 1))
  done
  [ -f "$BASE/current/index.html" ] || die 5 "current/index.html missing after cleanup"
  echo "__CLEANUP__ deleted=$deleted skipped=$skipped"
}

cmd_abort() {
  local sha=${1:-}
  [[ $sha =~ $SHA_RE ]] || die 2 "invalid sha"
  take_lock
  rm -rf --one-file-system -- "$REL/.incoming-$sha"
  [ ! -e "$REL/.incoming-$sha" ] || die 8 "abort did not remove .incoming-$sha"
  echo "__ABORTED__ $sha"
}

case "${1:-}" in
  activate) shift; cmd_activate "$@" ;;
  cleanup) shift; cmd_cleanup "$@" ;;
  abort) shift; cmd_abort "$@" ;;
  *) die 2 "usage: release.sh activate <sha12> | cleanup <current_sha12> <name>... | abort <sha12>" ;;
esac

#!/usr/bin/env bash
# Read-only drift check for doibung's Caddy (RESEARCH Pattern 12). Changes nothing.
# Output is KEY=VALUE; the last line must be END=1. Admin API is always 127.0.0.1:2019.
set -u
c() { "$@" 2>/dev/null || true; }
echo "HOST_IMPORT=$(c grep -cxF 'import /etc/caddy/sites/*.caddy' /opt/doibung/Caddyfile.nodb)"
echo "HOST_MOUNT_NODB=$(c grep -cF '/srv/sites:/etc/caddy/sites:ro' /opt/doibung/docker-compose.nodb.yml)"
echo "HOST_MOUNT_WITHDB=$(c grep -cF '/srv/sites:/etc/caddy/sites:ro' /opt/doibung/docker-compose.withdb.yml)"
echo "LIVE_MOUNT=$(c docker inspect -f '{{range .Mounts}}{{.Source}}>{{.Destination}}>{{.RW}} {{end}}' doibung-caddy-1 | grep -c '/srv/sites>/etc/caddy/sites>false')"
echo "LIVE_IMPORT=$(c docker exec doibung-caddy-1 grep -cxF 'import /etc/caddy/sites/*.caddy' /etc/caddy/Caddyfile)"
echo "LIVE_SITE=$(c docker exec doibung-caddy-1 wget -qO- http://127.0.0.1:2019/config/ | grep -c 'breaktime.doibung.com')"
echo "SITE_FILE_SHA=$(c sha256sum /srv/sites/breaktime.caddy | cut -c1-64)"
echo "CADDY_RUNNING=$(c docker inspect -f '{{.State.Running}}' doibung-caddy-1)"
echo "END=1"

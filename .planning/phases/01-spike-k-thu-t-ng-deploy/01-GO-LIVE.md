# 01-GO-LIVE — Evidence log for plan 01-12

Public domain: `game.doibung.com` (internal name `breaktime`: `/srv/sites/breaktime`, `deploy/caddy/breaktime.caddy`).
Plans 01-13, 01-14, 01-15 ran before this plan, so the first deploy will ship audio, the Blocky NPCs and slap ragdolls. This is intended.

## DNS

Timestamp: 2026-09-15T09:25:23.730Z (Task 1). The operator reported the record was created. The check resolved on both resolvers, so Task 1 did not halt.

Command (plan Task 1 action, run from D:\break-time via a temp script with the same calls):
`checkDns('game.doibung.com','187.53.128.67')` and `checkDns('doibung.com','187.53.128.67')`

Raw output:

```
TS=2026-09-15T09:25:23.730Z
{"ok":true,"results":{"8.8.8.8":["187.53.128.67"],"1.1.1.1":["187.53.128.67"]}}
{"ok":true,"results":{"8.8.8.8":["187.53.128.67"],"1.1.1.1":["187.53.128.67"]}}
DNS_OK {"8.8.8.8":["187.53.128.67"],"1.1.1.1":["187.53.128.67"]}
DOIBUNG_STATUS=200
RC=0
```

Plan verify command (exact inline `node -e`, as written in Task 1 `<automated>`):

```
DNS_OK {"8.8.8.8":["187.53.128.67"],"1.1.1.1":["187.53.128.67"]}
RC=0
```

- game.doibung.com → 1.1.1.1: 187.53.128.67 · 8.8.8.8: 187.53.128.67 (only that record)
- doibung.com → 1.1.1.1: 187.53.128.67 · 8.8.8.8: 187.53.128.67 (unchanged)

## Preflight

Timestamp: 2026-09-15T09:25:57Z – 09:26:05Z (Task 2, before the halt). `BREAKTIME_CADDY_APPROVAL` was unset and no `--approve=` was passed.
Nothing was changed: no backup, no file edit, no container recreate.

doibung.com before:

```
2026-09-15T09:25:57.904Z DOIBUNG_STATUS=200
```

`npm run infra:check` (expected exit 2 + DRIFT_MESSAGE):

```
> break-time@0.0.0 infra:check
> node scripts/infra.mjs check

HOST_IMPORT=0
HOST_MOUNT_NODB=0
HOST_MOUNT_WITHDB=0
LIVE_MOUNT=0
LIVE_IMPORT=0
LIVE_SITE=0
SITE_FILE_SHA=
CADDY_RUNNING=true
STATE_CHECK_PARSED
DRIFT HOST_IMPORT=0: host /opt/doibung/Caddyfile.nodb thiếu dòng import sites
DRIFT HOST_MOUNT_NODB=0: host /opt/doibung/docker-compose.nodb.yml thiếu mount /srv/sites
DRIFT HOST_MOUNT_WITHDB=0: host /opt/doibung/docker-compose.withdb.yml thiếu mount /srv/sites
DRIFT LIVE_MOUNT=0: live container doibung-caddy-1 thiếu mount /srv/sites (ro)
DRIFT LIVE_IMPORT=0: live container doibung-caddy-1 thiếu dòng import sites
Caddy của doibung đã mất cấu hình sites (có thể do deploy whattoeat ghi đè /opt/doibung). Chạy `npm run infra:apply` để xem preflight và mã duyệt, operator gõ `APPROVE-CADDY-<mã>`, rồi `npm run infra:apply -- --approve=APPROVE-CADDY-<mã>` (idempotent, có backup) và deploy lại. Chi tiết: deploy/HANDOFF.md
INFRA_CHECK_RC=2
```

`npm run infra:apply` with NO token (expected PREFLIGHT_OK, APPROVAL_TOKEN_MISSING, exit 3, no BACKUP_DIR, no RECREATE_START):

```
> break-time@0.0.0 infra:apply
> node scripts/infra.mjs apply

--- PREFLIGHT (server) ---
APP_ID=469bd89c74401ac06f0954cd1c1da42955d140a207ba13e0997ee0ad921fc103
PG_ID=adf639c497c6783de0af7b48c9a5b8d0db58c69699c6b2eb22980e7de2234c7c
CERT_FP_BEFORE=B3:78:E0:E4:99:D1:C8:B1:8E:18:F6:94:D9:6E:12:A6:86:AE:4C:73:46:32:F9:B2:88:8A:99:B5:23:4C:55:91
HOST_IMPORT=0
HOST_MOUNT_NODB=0
HOST_MOUNT_WITHDB=0
LIVE_MOUNT=0
LIVE_IMPORT=0
NEED_HOST_EDIT=1
NEED_RECREATE=1
NONCE_AGE_S=19974
PREFLIGHT_OK
APPROVAL_CODE=4ebe4eba
APPROVAL_TOKEN_MISSING reason=missing-token
Operator phải tự gõ APPROVE-CADDY-<mã> sau khi đọc preflight; executor không được tự ghép mã
Không có backup, không sửa file, không recreate container nào.
INFRA_APPLY_RC=3
```

doibung.com after:

```
2026-09-15T09:26:05.932Z DOIBUNG_STATUS=200
```

Checks: PREFLIGHT_OK present · APPROVAL_CODE is 8 hex · APPROVAL_TOKEN_MISSING present · exit 3 · no `BACKUP_DIR` line · no `RECREATE_START` line · doibung.com 200 before and after.

Nonce age note: `NONCE_AGE_S=19974` means the server nonce was created at about 2026-09-15T03:53Z by an earlier preflight. The server TTL is 21600 s from nonce creation (`NONCE_TTL` in deploy/infra/apply-caddy-sites.sh), so this APPROVAL_CODE is only valid until about **2026-09-15T09:53Z (16:53 Vietnam time)**. After that, an approved apply returns APPROVAL_TOKEN_INVALID, and Task 2 must be re-run to get a fresh preflight and a new code.

Awaiting operator reply (Task 2 checkpoint). No OPERATOR_REPLY yet.

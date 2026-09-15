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

### Operator reply

Recorded at 2026-09-15T09:41:40Z (reply typed by the operator in the orchestrator session, final message, verbatim):

OPERATOR_REPLY=APPROVE-CADDY-4ebe4eba

Two earlier replies in the same conversation were refused by the orchestrator: they did not match `APPROVE-CADDY-[0-9a-f]{8}`. The first was "oke duyệt". The second was the literal placeholder "APPROVE-CADDY-APPROVAL_CODE". Neither counted as approval, and no `--approve=` run happened for them.

Token extracted with regex `APPROVE-CADDY-[0-9a-f]{8}`, unchanged: `APPROVE-CADDY-4ebe4eba`.

## Infra apply

Timestamp: 2026-09-15T09:42:42Z – 09:42:53Z (Task 3 Step 1), about 11 minutes before the nonce would have expired.

Command (token copied from OPERATOR_REPLY without changes):

`npm run infra:apply -- --approve=APPROVE-CADDY-4ebe4eba`

- APPROVAL_TOKEN_OK · APPROVAL_NONCE_CONSUMED · INFRA_APPLY_OK · exit 0
- BACKUP_DIR=/root/breaktime-infra-backup/20260915T094249Z
- NEED_HOST_EDIT=1 · NEED_RECREATE=1 (before); after: HOST_IMPORT=1 HOST_MOUNT_NODB=1 HOST_MOUNT_WITHDB=1 LIVE_MOUNT=1 LIVE_IMPORT=1
- CERT_FP_BEFORE=B3:78:E0:E4:99:D1:C8:B1:8E:18:F6:94:D9:6E:12:A6:86:AE:4C:73:46:32:F9:B2:88:8A:99:B5:23:4C:55:91
- CERT_FP_AFTER=B3:78:E0:E4:99:D1:C8:B1:8E:18:F6:94:D9:6E:12:A6:86:AE:4C:73:46:32:F9:B2:88:8A:99:B5:23:4C:55:91 (identical)
- APP_ID=469bd89c74401ac06f0954cd1c1da42955d140a207ba13e0997ee0ad921fc103 · PG_ID=adf639c497c6783de0af7b48c9a5b8d0db58c69699c6b2eb22980e7de2234c7c · script marker APP_PG_HASH_UNCHANGED + VERIFY_OK
- Poller during the caddy recreate (500 ms interval): `POLLER count=9 non200=1 maxConsecutiveNon200Ms=509` (expected short interruption from the recreate; below the 60 s auto-rollback threshold, so no rollback)
- After: DOIBUNG_STATUS=200 · WWW_STATUS=301 WWW_LOCATION=https://doibung.com/

Step 2 `npm run infra:check` (before deploy):

```

> break-time@0.0.0 infra:check
> node scripts/infra.mjs check

HOST_IMPORT=1
HOST_MOUNT_NODB=1
HOST_MOUNT_WITHDB=1
LIVE_MOUNT=1
LIVE_IMPORT=1
LIVE_SITE=0
SITE_FILE_SHA=
CADDY_RUNNING=true
STATE_CHECK_PARSED
INFRA_CHECK_OK
INFRA_CHECK_RC=0
```

Full apply output (73 lines, includes the last 40):

```
2026-09-15T09:42:42.264Z DOIBUNG_STATUS=200
APPLY_START=2026-09-15T09:42:42Z

> break-time@0.0.0 infra:apply
> node scripts/infra.mjs apply --approve=APPROVE-CADDY-4ebe4eba

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
NONCE_AGE_S=20975
PREFLIGHT_OK
APPROVAL_TOKEN_OK
CADDY_RUNNING=true
COMPOSE_CONFIG_OK
HASH_OK
CADDY_IMAGE=sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648
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
NONCE=7c521860976c04cb9a8f8a4e6506fc75
NONCE_AGE_S=20977
PREFLIGHT_OK
APPROVAL_NONCE_CONSUMED
BACKUP_DIR=/root/breaktime-infra-backup/20260915T094249Z
SITES_DIRS_OK
CADDYFILE_IMPORT_ADDED
COMPOSE_MOUNT_ADDED=docker-compose.nodb.yml
COMPOSE_CONFIG_SITES_RO=docker-compose.nodb.yml
COMPOSE_MOUNT_ADDED=docker-compose.withdb.yml
COMPOSE_CONFIG_SITES_RO=docker-compose.withdb.yml
APP_PG_HASH_UNCHANGED
VALIDATE_OK
RECREATE_START
 Container doibung-caddy-1 Recreate 
 Container doibung-caddy-1 Recreated 
 Container doibung-caddy-1 Starting 
 Container doibung-caddy-1 Started 
RECREATE_DONE
CERT_FP_AFTER=B3:78:E0:E4:99:D1:C8:B1:8E:18:F6:94:D9:6E:12:A6:86:AE:4C:73:46:32:F9:B2:88:8A:99:B5:23:4C:55:91
VERIFY_OK
APPLY_DONE BACKUP_DIR=/root/breaktime-infra-backup/20260915T094249Z
POLLER count=9 non200=1 maxConsecutiveNon200Ms=509
DOIBUNG_STATUS=200
WWW_STATUS=301 WWW_LOCATION=https://doibung.com/
HOST_IMPORT=1
HOST_MOUNT_NODB=1
HOST_MOUNT_WITHDB=1
LIVE_MOUNT=1
LIVE_IMPORT=1
LIVE_SITE=0
SITE_FILE_SHA=
CADDY_RUNNING=true
STATE_CHECK_PARSED
INFRA_CHECK_OK
INFRA_APPLY_OK
INFRA_APPLY_RC=0
APPLY_END=2026-09-15T09:42:53Z
2026-09-15T09:42:53.687Z DOIBUNG_STATUS=200
```

## First deploy

**Result: DEPLOY_FAIL at step 16/17 (poller verdict), exit 1. No DEPLOY_OK.** The release was activated and all smoke checks passed. 01-07: after activation there is no automatic rollback, so release 1b318ec49460 stays current and is live.

- sha: 1b318ec49460 (HEAD 1b318ec494600433e4960bf930c4e3459015085c, clean tree)
- Gates: TYPECHECK_OK · BUILD_OK · SIZE_GATE_OK totalRaw=7258044 · Vitest 280/280 · Playwright 52 passed · FIRST_LOAD_TOTAL_RAW=3360593 (ok)
- DNS preflight inside deploy: game.doibung.com → 187.53.128.67 on 8.8.8.8 and 1.1.1.1
- Upload 86/86 · __ACTIVATED__ 1b318ec49460 releases=1 · __SITE_RELOADED__ sha256=7adb9f7fcde9720bc90a408c22483d92133eb3396c3663ba4c241fb7bd17bef8 (first site activation: graceful `caddy reload` through the admin API)
- Smoke (default TLS): 9/9 OK — / 200, /b/1b318ec49460/ 200, /b/<sha> no-slash 308, bad sha 404, asset 200, doibung.com 200, www 301
- **Poller: `POLLER https://doibung.com/ count=22 non200=1 maxConsecutiveNon200Ms=1013`**, one sample `t=2026-09-15T09:49:00.038Z status=- error=fetch failed` (connection error, not the 3 s timeout)
- Step 17 (final state check) did not run because step 16 threw first

Cause is not proven. The poller started after Playwright (about 09:48:45Z) and ran about 22 s across upload, activate, the site reload and smoke. The failed sample is in that window, and the first-time Caddy reload that adds a new TLS host is the most likely cause. deploy.mjs prints no per-step timestamps, so the timing cannot be matched from this log. No server logs were read (the operator constraint forbids hand-run docker/caddy commands).

Independent check after the failure (Node, default TLS, 2026-09-15T09:49:44.768Z):

```
version.json {"sha":"1b318ec49460","time":"2026-09-15T09:43:47.809Z"}  game / 200  /b/1b318ec49460/ 200  doibung.com 200  www 301 -> https://doibung.com/
```

`npm run infra:check` after the failure (2026-09-15T09:50:52Z):

```

> break-time@0.0.0 infra:check
> node scripts/infra.mjs check

HOST_IMPORT=1
HOST_MOUNT_NODB=1
HOST_MOUNT_WITHDB=1
LIVE_MOUNT=1
LIVE_IMPORT=1
LIVE_SITE=1
SITE_FILE_SHA=7adb9f7fcde9720bc90a408c22483d92133eb3396c3663ba4c241fb7bd17bef8
CADDY_RUNNING=true
STATE_CHECK_PARSED
INFRA_CHECK_OK
INFRA_CHECK_RC=0
```

TLS: doibung.com fingerprint256 B3:78:E0:E4:99:D1:C8:B1:8E:18:F6:94:D9:6E:12:A6:86:AE:4C:73:46:32:F9:B2:88:8A:99:B5:23:4C:55:91 (unchanged, authorized) · game.doibung.com CN=game.doibung.com, issuer Let's Encrypt, valid_to Dec 14 08:50:33 2026 GMT, authorized.

Full deploy output (66 lines, includes the last 40):

```
DEPLOY_START=2026-09-15T09:43:26Z

> break-time@0.0.0 deploy
> node scripts/deploy.mjs

== STEP 1/17 clean tree + sha
SHA=1b318ec49460
== STEP 2/17 ssh preflight
__SSH_OK__
== STEP 3/17 server drift check
HOST_IMPORT=1
HOST_MOUNT_NODB=1
HOST_MOUNT_WITHDB=1
LIVE_MOUNT=1
LIVE_IMPORT=1
LIVE_SITE=0
SITE_FILE_SHA=
CADDY_RUNNING=true
STATE_CHECK_OK
== STEP 4/17 typecheck + build
TYPECHECK_OK files=735
dist/assets/rapier-B9LFmugn.js            2,853.74 kB │ gzip: 1,094.44 kB
dist/assets/rapier-qjJOQbOg.js            3,087.78 kB │ gzip: 1,073.90 kB

✓ built in 1.43s
BUILD_OK version.json sha=1b318ec49460
== STEP 5/17 precompress
PRECOMPRESS_DONE files=17 raw=6862783 br=1811230 gz=2416156
== STEP 6/17 size gate
DIST_FILES=52 DIST_RAW=7258044 DIST_GZIP=2732781 DIST_BROTLI=2125475
SIZE_GATE_OK totalRaw=7258044 files=52
== STEP 7/17 vitest
Test Files  26 passed (26)
Tests  280 passed (280)
== STEP 8/17 playwright + first-load
52 passed (4.3m)
FIRST_LOAD_TOTAL_RAW=3360593 FIRST_LOAD_LEVEL=ok
== STEP 9/17 DNS preflight
DNS game.doibung.com {"8.8.8.8":["187.53.128.67"],"1.1.1.1":["187.53.128.67"]}
== STEP 10/17 doibung.com poller
POLLER_STARTED https://doibung.com/ every 1000 ms
== STEP 11/17 upload
UPLOAD tarRc=0 sshRc=0 uploaded=86 local=86
__UPLOADED__ 86
== STEP 12/17 activate
__ACTIVATED__ 1b318ec49460 releases=1
== STEP 13/17 site file
__SITE_RELOADED__ sha256=7adb9f7fcde9720bc90a408c22483d92133eb3396c3663ba4c241fb7bd17bef8
== STEP 14/17 cleanup keep 10
CLEANUP_NOTHING
== STEP 15/17 smoke
SMOKE OK   breaktime /version.json sha — status 200 (attempts=4, window=120s)
SMOKE OK   breaktime / — status 200
SMOKE OK   breaktime /b/1b318ec49460/ — status 200
SMOKE OK   breaktime /b/1b318ec49460/version.json sha — status 200
SMOKE OK   breaktime /b/1b318ec49460 (no slash) — status 308
SMOKE OK   breaktime asset assets/index-A2jTw_xd.js — status 200
SMOKE OK   breaktime /b/zzz/ (bad sha) — status 404
SMOKE OK   https://doibung.com/ — status 200
SMOKE OK   https://www.doibung.com/ — status 301
== STEP 16/17 poller verdict
POLLER https://doibung.com/ count=22 non200=1 maxConsecutiveNon200Ms=1013
POLLER_SAMPLE t=2026-09-15T09:49:00.038Z status=- error=fetch failed
DEPLOY_FAIL step=16/17 rc=1 doibung.com không 200 suốt deploy: non200=1 count=22
DEPLOY_RC=1
DEPLOY_END=2026-09-15T09:49:10Z
```

## Rollback

Server wiring (Caddy import + /srv/sites mount) backup: `/root/breaktime-infra-backup/20260915T094249Z`.

The rollback needs a fresh tokenless preflight (`npm run infra:rollback -- /root/breaktime-infra-backup/20260915T094249Z` without a token prints a new APPROVAL_CODE bound to ROLLBACK:<dir>). The operator must then type a new token, and it is run as:

`npm run infra:rollback -- /root/breaktime-infra-backup/20260915T094249Z --approve=APPROVE-CADDY-<new operator code>`

The apply token APPROVE-CADDY-4ebe4eba is consumed and cannot approve a rollback. A release rollback (to an earlier sha) is not possible yet: 1b318ec49460 is the only release.

## Task 3 verify command (2026-09-15T09:52:29Z)

```
INFRA_CHECK_OK (LIVE_SITE=1, SITE_FILE_SHA=7adb9f7f…)
LIVE_OK 1b318ec49460 200 200 301
TOKEN_FROM_OPERATOR APPROVE-CADDY-4ebe4eba APPROVE-CADDY-4ebe4eba
VERIFY_RC=0
```

The verify command passes, but a plan acceptance criterion is still unmet: there is no DEPLOY_OK, and the deploy poller recorded 1 non-200 (not zero). 01-12 is NOT complete. It waits for an operator decision.

(Superseded: the operator chose option 1, re-run `npm run deploy` once. See "## Second deploy" below.)

## Second deploy

Operator decision, typed in the orchestrator session: option 1, re-run `npm run deploy` exactly once. No infra:apply, rollback, docker or caddy command was run by hand.

Before (2026-09-15T09:55:05.073Z, Node with default TLS): `DOIBUNG_STATUS=200 CURRENT_SHA=1b318ec49460 CERT_FP_PRE=B3:78:E0:E4:99:D1:C8:B1:8E:18:F6:94:D9:6E:12:A6:86:AE:4C:73:46:32:F9:B2:88:8A:99:B5:23:4C:55:91`. The tree was clean (`git status --porcelain` printed 0 lines). HEAD was 3d3cb78f560f.

**Result: `DEPLOY_OK 3d3cb78f560f https://game.doibung.com/ https://game.doibung.com/b/3d3cb78f560f/`, exit 0 (DEPLOY_RC=0), 09:55:17Z – 09:57:48Z.**

- sha: 3d3cb78f560f. It is the evidence commit on top of 1b318ec. Game code is identical: same DIST_RAW=7258044 and FIRST_LOAD_TOTAL_RAW=3360593.
- Gates: TYPECHECK_OK files=735 · BUILD_OK · SIZE_GATE_OK totalRaw=7258044 files=52 · Vitest 26 files / 280 passed · Playwright 52 passed (2.0m) · FIRST_LOAD_TOTAL_RAW=3360593 FIRST_LOAD_LEVEL=ok
- DNS preflight: game.doibung.com → 187.53.128.67 on 8.8.8.8 and 1.1.1.1
- Upload 86/86 · `__ACTIVATED__ 3d3cb78f560f releases=2` · CLEANUP_NOTHING
- **Step 13 skipped the Caddy reload:** `SITE_FILE_UNCHANGED sha256=7adb9f7fcde9720bc90a408c22483d92133eb3396c3663ba4c241fb7bd17bef8`. No `__SITE_RELOADED__`, no `caddy reload`.
- Smoke 9/9 OK (version.json sha on attempt 1 with the 20 s window, so this was not a first activation)
- **Poller: `POLLER https://doibung.com/ count=5 non200=0 maxConsecutiveNon200Ms=0`** (SUMMARY `poller=5/5 200`). The window is short (about 5 s, from upload to smoke) because there was no site reload and no ACME wait. It is zero non-200 over 5 samples, not a long soak.
- Step 17 final state check: STATE_CHECK_OK, LIVE_SITE=1

Task 3 verify command (exact plan `<automated>` chain, run from a .sh file, 2026-09-15T09:58:19Z):

```
HOST_IMPORT=1
HOST_MOUNT_NODB=1
HOST_MOUNT_WITHDB=1
LIVE_MOUNT=1
LIVE_IMPORT=1
LIVE_SITE=1
SITE_FILE_SHA=7adb9f7fcde9720bc90a408c22483d92133eb3396c3663ba4c241fb7bd17bef8
CADDY_RUNNING=true
STATE_CHECK_PARSED
INFRA_CHECK_OK
LIVE_OK 3d3cb78f560f 200 200 301
TOKEN_FROM_OPERATOR APPROVE-CADDY-4ebe4eba APPROVE-CADDY-4ebe4eba
VERIFY_RC=0
```

Independent live checks (Node, default TLS, 2026-09-15T09:58:22.886Z):

```
VERSION_JSON={"sha":"3d3cb78f560f","time":"2026-09-15T09:55:24.581Z"}
GAME_B_SHA_STATUS=200 OLD_B_1b318ec49460_STATUS=200 DOIBUNG_STATUS=200 WWW_STATUS=301 WWW_LOCATION=https://doibung.com/
DOIBUNG_CERT fp=B3:78:E0:E4:99:D1:C8:B1:8E:18:F6:94:D9:6E:12:A6:86:AE:4C:73:46:32:F9:B2:88:8A:99:B5:23:4C:55:91 authorized=true FP_EQUALS_BEFORE=true
GAME_CERT cn=game.doibung.com valid_to=Dec 14 08:50:33 2026 GMT authorized=true
INDEPENDENT_OK
INDEPENDENT_RC=0
```

- game.doibung.com/version.json sha == deployed sha 3d3cb78f560f
- /b/3d3cb78f560f/ 200. The previous release is also still reachable: /b/1b318ec49460/ 200.
- doibung.com 200 · www 301 → https://doibung.com/
- The doibung.com certificate fingerprint equals CERT_FP_BEFORE from the preflight

Rollback note update: two releases now exist (1b318ec49460, 3d3cb78f560f). A release rollback means redeploying 1b318ec. The infra rollback form in "## Rollback" is unchanged.

Last 40 lines of the second deploy output (full log 76 lines):

```
== STEP 8/17 playwright + first-load
52 passed (2.0m)
FIRST_LOAD_TOTAL_RAW=3360593 FIRST_LOAD_LEVEL=ok
== STEP 9/17 DNS preflight
DNS game.doibung.com {"8.8.8.8":["187.53.128.67"],"1.1.1.1":["187.53.128.67"]}
== STEP 10/17 doibung.com poller
POLLER_STARTED https://doibung.com/ every 1000 ms
== STEP 11/17 upload
UPLOAD tarRc=0 sshRc=0 uploaded=86 local=86
__UPLOADED__ 86
== STEP 12/17 activate
__ACTIVATED__ 3d3cb78f560f releases=2
== STEP 13/17 site file
SITE_FILE_UNCHANGED sha256=7adb9f7fcde9720bc90a408c22483d92133eb3396c3663ba4c241fb7bd17bef8
== STEP 14/17 cleanup keep 10
CLEANUP_NOTHING
== STEP 15/17 smoke
SMOKE OK   breaktime /version.json sha — status 200 (attempts=1, window=20s)
SMOKE OK   breaktime / — status 200
SMOKE OK   breaktime /b/3d3cb78f560f/ — status 200
SMOKE OK   breaktime /b/3d3cb78f560f/version.json sha — status 200
SMOKE OK   breaktime /b/3d3cb78f560f (no slash) — status 308
SMOKE OK   breaktime asset assets/index-BEZs522n.js — status 200
SMOKE OK   breaktime /b/zzz/ (bad sha) — status 404
SMOKE OK   https://doibung.com/ — status 200
SMOKE OK   https://www.doibung.com/ — status 301
== STEP 16/17 poller verdict
POLLER https://doibung.com/ count=5 non200=0 maxConsecutiveNon200Ms=0
== STEP 17/17 final state check
HOST_IMPORT=1
HOST_MOUNT_NODB=1
HOST_MOUNT_WITHDB=1
LIVE_MOUNT=1
LIVE_IMPORT=1
LIVE_SITE=1
SITE_FILE_SHA=7adb9f7fcde9720bc90a408c22483d92133eb3396c3663ba4c241fb7bd17bef8
CADDY_RUNNING=true
STATE_CHECK_OK
SUMMARY DIST_FILES=52 DIST_RAW=7258044 DIST_GZIP=2732782 DIST_BROTLI=2125389 FIRST_LOAD_TOTAL_RAW=3360593 FIRST_LOAD_LEVEL=ok poller=5/5 200
DEPLOY_OK 3d3cb78f560f https://game.doibung.com/ https://game.doibung.com/b/3d3cb78f560f/
DEPLOY_RC=0
DEPLOY_END=2026-09-15T09:57:48Z
```

Lines 1–36 (steps 1–7) are the same shape as the first deploy: STEP 3 had LIVE_SITE=1 and SITE_FILE_SHA=7adb9f7f…, then TYPECHECK_OK files=735, BUILD_OK version.json sha=3d3cb78f560f, PRECOMPRESS_DONE files=17, SIZE_GATE_OK, and Vitest 280 passed.

## Deviation

**Must-have "the first `npm run deploy` exits 0 with DEPLOY_OK … doibung.com answered only 200 during the deploy" was met on the second run, not the first.**

- First deploy (1b318ec49460): every gate, upload, activation and 9/9 smoke passed. It then failed at step 16/17 with one poller sample `fetch failed` at 2026-09-15T09:49:00.038Z (count=22, non200=1, maxConsecutiveNon200Ms=1013). That is a single connection error of about 1 s on doibung.com, not a non-200 HTTP status.
- It happened during the first-time site activation. Step 13 wrote `/srv/sites/breaktime.caddy` and ran a graceful `caddy reload` that added the new TLS host game.doibung.com, and ACME then issued its certificate (valid_to Dec 14 08:50:33 2026). The reload is the most likely cause. It is not proven: deploy.mjs has no per-step timestamps and no server logs were read.
- Second deploy (3d3cb78f560f, operator option 1): step 13 printed SITE_FILE_UNCHANGED and skipped the reload. The poller saw count=5 non200=0, and deploy printed DEPLOY_OK, exit 0. This is consistent with the hypothesis: the only run with a Caddy reload is the only run with a blip. A routine deploy (site file unchanged) does not touch Caddy.
- Residual risk: any future change to `deploy/caddy/breaktime.caddy` triggers a reload again and may cause a similar blip of about 1 s on doibung.com. The step-16 gate will fail that deploy loudly, as it did here.

## Measurement build

Plan 01-18 Task 3: the build with `?bench=1` (01-17), `?soak=1`, the crash beacon and the banner (01-18). It is deployed for the real-device gate in 01-19. Only `npm run deploy` was run. No infra:apply, rollback, docker or caddy command was run by hand.

**Result: `DEPLOY_OK 1ecc53ce473e https://game.doibung.com/ https://game.doibung.com/b/1ecc53ce473e/`, exit 0 (DEPLOY_RC=0), 15:22:04Z – 15:28:11Z. This was the third deploy attempt for this plan (see "Earlier attempts" below).**

URLs for the gate:

- `https://game.doibung.com/b/1ecc53ce473e/?bench=1`
- `https://game.doibung.com/b/1ecc53ce473e/?soak=1`
- `https://game.doibung.com/b/1ecc53ce473e/`

Before (2026-09-15T15:22:04.531Z, Node, default TLS): `DOIBUNG_PRE 200 GAME_VERSION_PRE {"sha":"00130ad392e5","time":"2026-09-15T13:52:47.649Z"}`. `git status --porcelain --untracked-files=all` printed 0 lines. HEAD was 1ecc53ce473e.

- sha: 1ecc53ce473e = ae03486 (soak, beacon, banner, wake lock) + the operator-approved spec de-flake `test(01-18)` 1ecc53c. The only change is in a test file, so the shipped game code is the same as at ae03486.
- Gates: TYPECHECK_OK files=757 · BUILD_OK version.json sha=1ecc53ce473e · PRECOMPRESS_DONE files=25 · SIZE_GATE_OK totalRaw=7306719 files=63 · Vitest 36 files / 483 passed · Playwright 92 passed (5.0m)
- **First load: `FIRST_LOAD_TOTAL_RAW=3364381 FIRST_LOAD_LEVEL=ok`** (about 3.21 MB, budget 8 MB). DIST_RAW=7306719 DIST_GZIP=2752929 DIST_BROTLI=2143288.
- DNS preflight: game.doibung.com → 187.53.128.67 on 8.8.8.8 and 1.1.1.1
- Upload `tarRc=0 sshRc=0 uploaded=113 local=113` · `__ACTIVATED__ 1ecc53ce473e releases=4` · CLEANUP_NOTHING
- **Step 13: `SITE_FILE_UNCHANGED sha256=7adb9f7fcde9720bc90a408c22483d92133eb3396c3663ba4c241fb7bd17bef8`.** Caddy was not reloaded.
- Smoke 9/9 OK: version.json sha on attempt 1, / 200, /b/1ecc53ce473e/ 200, its version.json 200, no-slash 308, asset 200, bad sha 404, doibung.com 200, www 301
- **Poller: `POLLER https://doibung.com/ count=38 non200=0 maxConsecutiveNon200Ms=0`** (SUMMARY `poller=38/38 200`)
- Step 17 final state check: STATE_CHECK_OK, LIVE_SITE=1

Plan Task 3 verify command (exact `<automated>` line, 2026-09-15T15:28:28Z):

```
MEASURE_BUILD_LIVE 1ecc53ce473e
VERIFY_RC=0
HEAD=1ecc53ce473e
```

Independent live checks (Node, default TLS, 2026-09-15T15:28:31.467Z):

```
TS=2026-09-15T15:28:31.467Z HEAD=1ecc53ce473e
VERSION_JSON={"sha":"1ecc53ce473e","time":"2026-09-15T15:22:11.777Z"}
B_SHA_STATUS=200 BENCH_STATUS=200 SOAK_STATUS=200 BENCH_LEN=745 SOAK_LEN=745
DOIBUNG_STATUS=200 WWW_STATUS=301 WWW_LOCATION=https://doibung.com/
SHA_EQUALS_HEAD=true
INDEPENDENT_OK
INDEPENDENT_RC=0
```

- game.doibung.com/version.json sha == deployed sha == `git rev-parse --short=12 HEAD` (1ecc53ce473e)
- /b/1ecc53ce473e/ 200 · `?bench=1` 200 · `?soak=1` 200 (the same index.html; the query string is read by the client)
- doibung.com 200 · www 301 → https://doibung.com/

### Earlier attempts (both failed and left the live site unchanged)

Neither earlier attempt was retried automatically. After each failure the executor stopped, and each re-run was the operator's decision.

**Attempt 1** (HEAD ae034868d449): all gates passed (TYPECHECK_OK files=757, SIZE_GATE_OK totalRaw=7306719 files=63, Vitest 483 passed, Playwright 92 passed (5.0m), FIRST_LOAD_TOTAL_RAW=3364381). The SSH connection then dropped during upload. The release was aborted before activation, and doibung.com stayed 200 throughout:

```
== STEP 11/17 upload
UPLOAD tarRc=0 sshRc=255 uploaded=NaN local=113


client_loop: send disconnect: Connection reset
DEPLOY_FAIL step=11/17 rc=1 upload thất bại (rc, marker __UPLOADED__ hoặc số file không khớp)
__ABORTED__ ae034868d449
POLLER https://doibung.com/ count=108 non200=0 maxConsecutiveNon200Ms=0
DEPLOY_RC=1
```

**Attempt 2** (same HEAD ae034868d449; before: `DOIBUNG_PRE_RETRY 200`, `GAME_VERSION_PRE_RETRY {"sha":"00130ad392e5",...}`): the step 8 Playwright gate failed on the pre-existing spec `tests/e2e/swing.spec.ts:127`. Its timing precondition measured 300.1 ms, just over the 300 ms limit, for three E presses under full-suite load. The cooldown assertions after it never ran. Nothing was uploaded, and the poller had not started:

```
== STEP 8/17 playwright + first-load
    expect(received).toBeLessThan(expected)

    Expected: < 300
    Received:   300.0999999642372

    > 140 |     expect(t1 - t0, 'presses must all fall inside one 350 ms cooldown').toBeLessThan(300);
        at D:\break-time\tests\e2e\swing.spec.ts:140:73

  1 failed
    [desktop] › tests\e2e\swing.spec.ts:127:3 › swing desktop › mashing E is limited by the cooldown 
  76 skipped
  91 passed (5.1m)
DEPLOY_FAIL step=8/17 rc=1 C:\Program Files\nodejs\node.exe rc=1
DEPLOY_RC=1
```

**Operator decision** (typed in the orchestrator session): option 1, "Sửa test rồi deploy lại". The executor made only these changes:

- The two inter-press waits in that test went from 60 to 40 ms, with the comment `01-18: 40 ms (was 60) — timing precondition flaked at 300.1 ms under full-suite load; still > one 16.7 ms step (D-30)`.
- The comment above them now says ~80 ms instead of ~120 ms.
- `SWING_COOLDOWN_MS` (350), the `< 300` threshold and the `count` / `dropped >= 1` assertions are unchanged.

Before the third deploy, the executor ran these checks locally:

- 5× repeat on desktop (`--repeat-each=5`): the mashing test passed 5/5 (2.1–2.2 s each), 30 passed, 5 touch tests skipped, rc 0.
- Full suite: typecheck rc 0, vitest 483/483, build rc 0, `SIZE_GATE_OK totalRaw=7306719 files=63`, Playwright 92 passed with 0 failed.

The fix was committed as 1ecc53c, and deploy was run exactly once (above).

Release note: the server now has 4 releases. The site was 00130ad392e5 before this deploy and is 1ecc53ce473e after it. Rolling back the release means redeploying the previous commit. The infra rollback form in "## Rollback" is unchanged.

Last 40 lines of the deploy output (full log 79 lines, including 4 wrapper lines before `npm run deploy`; `C:/Users/hiennv/AppData/Local/Temp/bt18-deploy3.log`):

```
FIRST_LOAD_TOTAL_RAW=3364381 FIRST_LOAD_LEVEL=ok
== STEP 9/17 DNS preflight
DNS game.doibung.com {"8.8.8.8":["187.53.128.67"],"1.1.1.1":["187.53.128.67"]}
== STEP 10/17 doibung.com poller
POLLER_STARTED https://doibung.com/ every 1000 ms
== STEP 11/17 upload
UPLOAD tarRc=0 sshRc=0 uploaded=113 local=113
__UPLOADED__ 113
== STEP 12/17 activate
__ACTIVATED__ 1ecc53ce473e releases=4
== STEP 13/17 site file
SITE_FILE_UNCHANGED sha256=7adb9f7fcde9720bc90a408c22483d92133eb3396c3663ba4c241fb7bd17bef8
== STEP 14/17 cleanup keep 10
CLEANUP_NOTHING
== STEP 15/17 smoke
SMOKE OK   breaktime /version.json sha — status 200 (attempts=1, window=20s)
SMOKE OK   breaktime / — status 200
SMOKE OK   breaktime /b/1ecc53ce473e/ — status 200
SMOKE OK   breaktime /b/1ecc53ce473e/version.json sha — status 200
SMOKE OK   breaktime /b/1ecc53ce473e (no slash) — status 308
SMOKE OK   breaktime asset assets/index-CycMRXYi.js — status 200
SMOKE OK   breaktime /b/zzz/ (bad sha) — status 404
SMOKE OK   https://doibung.com/ — status 200
SMOKE OK   https://www.doibung.com/ — status 301
== STEP 16/17 poller verdict
POLLER https://doibung.com/ count=38 non200=0 maxConsecutiveNon200Ms=0
== STEP 17/17 final state check
HOST_IMPORT=1
HOST_MOUNT_NODB=1
HOST_MOUNT_WITHDB=1
LIVE_MOUNT=1
LIVE_IMPORT=1
LIVE_SITE=1
SITE_FILE_SHA=7adb9f7fcde9720bc90a408c22483d92133eb3396c3663ba4c241fb7bd17bef8
CADDY_RUNNING=true
STATE_CHECK_OK
SUMMARY DIST_FILES=63 DIST_RAW=7306719 DIST_GZIP=2752929 DIST_BROTLI=2143288 FIRST_LOAD_TOTAL_RAW=3364381 FIRST_LOAD_LEVEL=ok poller=38/38 200
DEPLOY_OK 1ecc53ce473e https://game.doibung.com/ https://game.doibung.com/b/1ecc53ce473e/
DEPLOY_RC=0
DEPLOY_END=2026-09-15T15:28:11Z
```

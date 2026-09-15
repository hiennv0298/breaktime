---
phase: 01-spike-k-thu-t-ng-deploy
plan: 04
subsystem: infra
tags: [ssh, caddy, docker-compose, drift-check, approval-token, nonce, rollback, vitest]
requires:
  - phase: 01-01
    provides: "package.json npm scripts infra:check/apply/rollback, vitest config covering tests/unit/*.test.mjs"
provides:
  - "scripts/lib/run.mjs: run (rc + marker + non-empty output + timeout; rejections carry out/stderr/rc), ssh, sshScript, SSH, TAR"
  - "scripts/lib/stateCheck.mjs: STATE_KEYS, parseStateCheck, evaluateState, DRIFT_MESSAGE"
  - "scripts/lib/poller.mjs: startPoller(url, {intervalMs, timeoutMs, expectStatus})"
  - "scripts/lib/approval.mjs: APPROVAL_FIELDS, TOKEN_RE, approvalCode, expectedToken, readApprovalToken, decideApply"
  - "scripts/infra.mjs: check (exit 0/1/2), apply (exit 0/1/2/3/4/5/6), rollback <BACKUP_DIR>; exports runCheck"
  - "deploy/remote/state-check.sh (read-only, 8 keys + END=1)"
  - "deploy/infra/apply-caddy-sites.sh (preflight | apply <nonce>) and rollback-caddy-sites.sh (preflight | restore | restore-auto)"
  - "deploy/HANDOFF.md operator note (Vietnamese)"
affects: [01-07, 01-12]
tech-stack:
  added: []
  patterns:
    - "Every external step needs rc 0 + expected marker + non-empty output"
    - "Server scripts are sent over ssh stdin with LF enforced by .gitattributes; args are restricted to a safe charset"
    - "Operator approval token = APPROVE-CADDY-<sha256(preflight state + server one-time nonce)[0:8]>"
key-files:
  created:
    - .gitattributes
    - scripts/lib/run.mjs
    - scripts/lib/stateCheck.mjs
    - scripts/lib/poller.mjs
    - scripts/lib/approval.mjs
    - scripts/infra.mjs
    - deploy/remote/state-check.sh
    - deploy/infra/apply-caddy-sites.sh
    - deploy/infra/rollback-caddy-sites.sh
    - deploy/HANDOFF.md
    - tests/unit/run.test.mjs
    - tests/unit/stateCheck.test.mjs
    - tests/unit/approval.test.mjs
  modified: []
key-decisions:
  - "The apply nonce is taken with an atomic mv before it is compared, so any apply attempt (right or wrong) burns it and two concurrent applies cannot both use it"
  - "A rollback approval code binds NEED_HOST_EDIT=ROLLBACK and NEED_RECREATE=ROLLBACK:<dir>, so an apply code can never approve a rollback even though both share the nonce file"
  - "Preflight also fails when the caddy image tag no longer resolves to the running image id (a recreate would otherwise start a different Caddy than the one validated) and when docker-compose.nodb.yml does not render"
  - "Recreate runs with --pull never in addition to --no-deps"
  - "infra.mjs auto-rollback runs only when doibung.com is not 200 within 60 s; other post-recreate failures (e.g. VERIFY_FAIL=cert) exit 6 and print the token-gated rollback command"
patterns-established:
  - "Negative controls: planted failures must fail (run() empty output, approval mutation, bash-script mutation harness)"
  - "Live server commands are bracketed by a doibung.com 200 check before and after"
requirements-completed: []
duration: 35min
completed: 2026-09-15
---

# Phase 1 Plan 04: Server tooling (drift check, token-gated infra:apply/rollback, HANDOFF) Summary

This plan adds a read-only drift check for doibung's Caddy and an idempotent, backed-up `infra:apply` / `infra:rollback`. Both refuse (exit 3) unless the operator types `APPROVE-CADDY-<8 hex>`. That code is bound to the current server state and a one-time nonce on the server. The drift check and all three refusals ran against the real VPS. Nothing on doibung changed except the nonce file.

## Performance

- **Duration:** about 35 min
- **Started:** 2026-09-15T03:19:23Z
- **Completed:** 2026-09-15T03:54:42Z
- **Tasks:** 3
- **Files:** 13 created

## Accomplishments

- `npm run infra:check` reads the host files and the live `doibung-caddy-1` separately.
  - Live result today: `HOST_IMPORT=0 HOST_MOUNT_NODB=0 HOST_MOUNT_WITHDB=0 LIVE_MOUNT=0 LIVE_IMPORT=0 LIVE_SITE=0 SITE_FILE_SHA= CADDY_RUNNING=true`, then `STATE_CHECK_PARSED`, the DRIFT_MESSAGE and `INFRA_CHECK_RC=2`.
  - This is expected before 01-12.
- `npm run infra:apply` without a valid token prints the server preflight and `APPROVAL_CODE=<8 hex>`, then exits 3 before any backup, edit or recreate.
  - Live results: no token gave `APPROVAL_TOKEN_MISSING` and `NO_TOKEN_RC=3`. `APPROVE-CADDY-00000000` gave `APPROVAL_TOKEN_INVALID reason=mismatch` and `WRONG_TOKEN_RC=3`. `approve-caddy-zz` gave `APPROVAL_TOKEN_INVALID reason=bad-format` and `BAD_FORMAT_RC=3`.
  - None of the three outputs contains `BACKUP_DIR=`, `RECREATE_START` or `APPROVAL_NONCE_CONSUMED`.
- The apply and rollback bash scripts were run end to end in a local simulation. The simulation used fake `docker`, `openssl` and `flock`, and temp dirs substituted into a scratch copy. The committed scripts are unchanged.
  - Results: 15 scenarios, 92/92 checks passed.
  - Scenarios covered: fresh preflight, nonce reuse and expiry, wrong nonce burnt, approved apply, idempotent no-op, host-only drift (`RECREATE_SKIPPED`), approved rollback, validate failure, missing anchor, mount not read-only, hash moved, image tag moved, hash failing after edit, cert changed after recreate (exit 30), `restore-auto`.
  - Mutation check: dropping `--no-deps` was caught (1 failure). Skipping the nonce comparison was caught (27 failures).
- `deploy/HANDOFF.md` covers:
  - what changes on the server
  - where the backups and the nonce live
  - the approval flow
  - why a whattoeat deploy removes the game, and when it disappears
  - how the drift check detects it
  - the re-apply and rollback commands
  - the forbidden compose commands
  - an optional permanent fix the operator can make in the whattoeat repo

## Server safety record

The doibung.com status was checked around every live step. Each check returned 200:

| Step | Before | After |
|------|--------|-------|
| Start of plan | 200 (03:19:23Z) | |
| `infra:check` (Task 1) | 200 (03:22:40Z) | 200 (03:22:42Z) |
| Read-only inspection 1 (hashes, labels, cert) | 200 (03:26:31Z) | 200 (03:26:33Z) |
| Read-only inspection 2 (eol, `up --help`, image tag) | 200 (03:30:26Z) | 200 (03:30:28Z) |
| Read-only inspection 3 (nodb config renders) | 200 (03:48:56Z) | 200 (03:48:58Z) |
| Live refusal controls (3 × `infra:apply`) | 200 | 200 |
| Post-check + `infra:check` | 200 (03:54:00Z) | 200 (03:54:03Z) |

Post-check on the server, read-only:
- `/root/breaktime-infra-backup/` holds only `.approval-nonce` (mode 600, 44 bytes). The directory is mode 700.
- `/srv` has 0 entries.
- `doibung-caddy-1` is still container `67f46e67dff0`, started 2026-09-11T17:01:32Z.
- app is `469bd89c7440` and postgres is `adf639c497c6`, the same as preflight.
- The three `/opt/doibung` files keep their 2026-09-11 mtimes. `Caddyfile.nodb` md5 `4b5890ff…` still equals the local whattoeat copy.

These commands were never run: `docker compose up/down/restart`, `caddy reload`, `docker run`, `infra:rollback` against the server. No `--approve=` value that could be valid was passed. The verify script aborted before sending `APPROVE-CADDY-00000000` in case the real code happened to be `00000000`.

## Task Commits

1. **Task 1: run/stateCheck/poller libs, state-check.sh, infra:check** (TDD)
   - RED `a05f505`: `test(01-04)`. Vitest failed because the module was missing.
   - GREEN `4782df8`: `feat(01-04)`. 23 tests passed. The poller was smoke-tested against a local HTTP server that returned 502 for 600 ms: `count=13 non200=5 max=539 ms`.
2. **Task 2: approval token derivation and decision** (TDD)
   - RED `6cdc6c2`: `test(01-04)`. Failed because the module was missing.
   - GREEN `c47e356`: `feat(01-04)`. 27 tests passed. With `timingSafeEqual` disabled, 3 tests failed.
3. **Task 3: apply/rollback scripts, token-gated infra.mjs, HANDOFF, live refusals.** `39b7af5` (feat).
4. **Follow-up fix: infra.mjs runs main only when executed directly.** `167f0a8` (fix).

## Acceptance evidence

- Task 1:
  - `grep -c localhost:2019 state-check.sh` = 0
  - `grep -c "StrictHostKeyChecking=no\|shell: true" run.mjs` = 0
  - `git ls-files --eol` reports `i/lf w/lf attr/text eol=lf` for state-check.sh, infra.mjs and run.mjs
- Task 2: `timingSafeEqual` count = 2 and `Math.random|Date.now` count = 0. The file has 27 tests covering every refuse case.
- Task 3:
  - `SYNTAX_OK`
  - `--no-deps caddy` count = 1 and `docker-compose.withdb.yml up` count = 1
  - `nodb.yml up|remove-orphans` count = 0
  - `approval-nonce` count = 2
  - The nonce is deleted at line 275, before the first `cp -a` at line 288
  - whattoeat path refs = 0 after rewording one header comment; the first run found 1
  - `decideApply` count = 3 and `confirm=recreate` count = 0
  - HANDOFF contains `APPROVE-CADDY-` and `infra:rollback`
  - The same `APPROVAL_CODE` was printed on the no-token and wrong-token runs, which shows the state was stable and the nonce was reused within the TTL
- Overall: `npx vitest run` gives 6 files, 67 tests passed. `npm run typecheck` rc 0.

## Decisions Made

See `key-decisions` in the frontmatter. All of them tighten the plan's contract without changing the interfaces 01-07 and 01-12 use.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] run() rejections carry `out`, `stderr` and `rc`**
- **Found during:** Task 3
- **Issue:** When the approved apply fails after the backup (for example exit 30), infra.mjs needs `BACKUP_DIR=` to run `restore-auto`. The rejection message only kept a truncated tail.
- **Fix:** Attach the full `out`, `stderr` and `rc` to the Error. Added one unit test.
- **Files modified:** scripts/lib/run.mjs, tests/unit/run.test.mjs
- **Commit:** 39b7af5

**2. [Rule 2 - Missing critical] Extra preflight gates and recreate flag**
- **Found during:** Task 3, read-only server inspection
- **Issue:** Three gaps were found.
  - A recreate starts whatever image `caddy:2-alpine` points to locally, but validation used the running container's image id.
  - `docker-compose.nodb.yml` rendering was only exercised mid-apply.
  - `compose up` could pull an image.
- **Fix:** Preflight now exits 10 with `PREFLIGHT_FAIL=image-tag-moved` when the tag id is not the running image id. It also exits 10 with `PREFLIGHT_FAIL=compose-config-nodb` when the nodb file does not render. The recreate adds `--pull never`. All three are read-only checks that pass on the live server today: the tag resolves to `sha256:5f5c8640…` and nodb config rc is 0.
- **Files modified:** deploy/infra/apply-caddy-sites.sh, deploy/infra/rollback-caddy-sites.sh
- **Commit:** 39b7af5

**3. [Rule 2 - Missing critical] Nonce is taken atomically and a lock serialises apply/restore**
- **Found during:** Task 3
- **Issue:** A read-then-delete of the nonce allows two concurrent applies to use the same nonce.
- **Fix:** `mv` the nonce to a private name, compare, delete. A wrong attempt also burns it. `flock -n` on `/root/breaktime-infra-backup/.apply.lock` runs only in apply, restore and restore-auto, never in preflight.
- **Files modified:** deploy/infra/apply-caddy-sites.sh, deploy/infra/rollback-caddy-sites.sh
- **Commit:** 39b7af5

**4. [Rule 2 - Missing critical] Unexpected errors between the backup and the recreate restore the files**
- **Found during:** Task 3
- **Issue:** Under `set -Eeuo pipefail`, an unplanned failure during the edit phase would exit and leave doibung's files half-edited.
- **Fix:** An ERR trap restores the three files from the backup while `PHASE=edit`. Explicit failures also restore: exit 11, 12, 13 and 20.
- **Files modified:** deploy/infra/apply-caddy-sites.sh
- **Commit:** 39b7af5

**5. [Rule 2 - Missing critical] Rollback preflight works when caddy is down; the rollback code differs from the apply code**
- **Found during:** Task 3
- **Issue:** Requiring a running caddy would make rollback impossible in the case it is needed most. The rollback token also has to differ from an apply token that uses the same nonce.
- **Fix:** Rollback preflight reports `CADDY_RUNNING=false`, `CERT_FP_BEFORE=none` and LIVE_* = 0 instead of failing. Restore recreates when caddy is not running or still has the mount. The rollback approval values are bound to `ROLLBACK:<dir>`.
- **Files modified:** deploy/infra/rollback-caddy-sites.sh, scripts/infra.mjs
- **Commit:** 39b7af5

**6. [Rule 1 - Bug] Importing scripts/infra.mjs ran main() and exited the importer**
- **Found during:** writing this SUMMARY (the interface for 01-07 exports `runCheck`)
- **Issue:** The module called `main(process.argv)` at load time, so `import { runCheck }` would dispatch on the importer's argv and call `process.exit`.
- **Fix:** Run main only when `process.argv[1]` resolves to this file. The comparison is case-insensitive on win32, so `d:\` vs `D:\` cannot become a silent rc=0.
- **Verification:** Importing the module had no side effect. `node d:\break-time\scripts\infra.mjs` from PowerShell and `node scripts\infra.mjs` both print the usage with rc 1. 67/67 tests pass.
- **Files modified:** scripts/infra.mjs
- **Commit:** 167f0a8

**Total deviations:** 6 auto-fixed (5 × Rule 2, 1 × Rule 1). **Impact:** each one only tightens safety. No interface in the plan changed, and no server write beyond the nonce happened in this plan.

## Issues Encountered

- `install -m 700` in Git Bash could not chmod inside the local Temp dir during the simulation. This only affects the local machine, so the simulation PATH got `install`, `mkdir` and `chmod` shims. The committed scripts did not change.
- The simulation cannot model a single-file bind mount's inode. The fake treats the live Caddyfile as a snapshot taken at `up`. On the real server, appending keeps the inode, so `LIVE_IMPORT` can read 1 before the recreate. `NEED_RECREATE` still becomes 1 because `LIVE_MOUNT=0`.

## Known Stubs

None.

## Residual risks for 01-12

- **TOCTOU window:** a few seconds pass between the Node preflight that shows the code and the server-side `apply <nonce>`. The server does not recompute the approval hash. If state changes in that window, the server re-checks hashes, the image tag and the NEED flags, and it verifies IDs and cert after the recreate. If state became already-applied, it prints `APPLY_NOOP`. This matches T-01-04-02, which is accepted.
- **`caddy validate` in a `--network none` container was not run on the server:** `docker run` is outside this plan's limits. It is covered by the RESEARCH Pattern 11/12 local test, and it will first run during 01-12's approved apply. If it fails, the script restores the files and exits 20.

## User Setup Required

None for this plan. In 01-12 the operator types `APPROVE-CADDY-<mã>` after reading the preflight. See deploy/HANDOFF.md.

## Next Phase Readiness

- 01-07 (`deploy.mjs`) can import `run`, `ssh`, `sshScript`, `TAR`, `startPoller`, `parseStateCheck` / `evaluateState` / `DRIFT_MESSAGE`, and `runCheck({ requireSite })` from `scripts/infra.mjs`. Importing has no side effects since 167f0a8.
- 01-12 (go-live) has a working operator flow: `npm run infra:apply`, then the operator types the code, then `npm run infra:apply -- --approve=APPROVE-CADDY-<mã>`.
- PLAT-01 is shared with later plans and was left unmarked.

## Self-Check: PASSED

- 13/13 key files exist on disk.
- 6/6 commits found in git log: a05f505, 4782df8, 6cdc6c2, c47e356, 39b7af5, 167f0a8.

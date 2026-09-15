---
phase: 01-spike-k-thu-t-ng-deploy
plan: 07
subsystem: deploy
tags: [deploy, ssh, tar-stream, drift-check, dns, smoke, poller, retention, vitest, simulation]
requires:
  - phase: 01-04
    provides: "run/ssh/sshScript/SSH/TAR, parseStateCheck/evaluateState/DRIFT_MESSAGE, startPoller, state-check.sh"
  - phase: 01-06
    provides: "validateSha/parseReleaseListing/selectReleasesToDelete, precompress.mjs, size-report.mjs --gate, release.sh (exit 7 __CURRENT_MOVED__, skipped=), activate-site.sh, breaktime.caddy"
provides:
  - "scripts/deploy.mjs: `npm run deploy [-- --dry-run]`, 17 fail-fast steps, exports runDeploy(args, deps), defaultDeps, tarStreamUpload, uploadRemoteCommand, parseUploadedCount, listDistFiles, CLEAN_PATHS"
  - "scripts/lib/dnsCheck.mjs: evaluateDnsResults, checkDns"
  - "scripts/lib/smoke.mjs: evaluateResponse (+ jsonEquals), findEntryAsset, runSmoke (injectable fetch/sleep/now)"
  - "scripts/lib/tools.mjs: nodeBin, GIT, ROOT"
  - "scripts/lib/run.mjs: sshArgv (shared by ssh() and the upload)"
affects: [01-12]
tech-stack:
  added: []
  patterns:
    - "Orchestrator takes a deps object (run/ssh/sshScript/startPoller/checkDns/runSmoke/upload); real deps by default, fakes or a local container in tests"
    - "Every step: rc 0 + marker + non-empty output; counts compared (uploaded == local dist files)"
    - "Exit codes: 0 ok, 1 any failed gate, 2 server drift"
key-files:
  created:
    - scripts/deploy.mjs
    - scripts/lib/dnsCheck.mjs
    - scripts/lib/smoke.mjs
    - scripts/lib/tools.mjs
    - tests/unit/smoke.test.mjs
    - tests/unit/dnsCheck.test.mjs
    - tests/unit/tools.test.mjs
    - tests/unit/deploy.test.mjs
  modified:
    - scripts/lib/run.mjs
key-decisions:
  - "01-07: DNS preflight is strict: every resolver must return a non-empty list containing only 187.53.128.67; an extra A record fails (ACME could validate against it)"
  - "01-07: clean-tree guard also covers public/ and tests/ and uses --untracked-files=all; HEAD and cleanliness are re-checked after the test gates, before DNS/upload"
  - "01-07: the build must produce dist/version.json with sha == HEAD, written by this build"
  - "01-07: upload never creates /srv/sites/breaktime/releases (test -d + mkdir without -p); only infra wiring creates it"
  - "01-07: cleanup exit 7 (__CURRENT_MOVED__) fails the deploy with nothing deleted; deleted+skipped must equal the names sent; skipped>0 is a warning"
  - "01-07: a failure after activation (site file, cleanup, smoke, poller, final check) exits 1 but leaves the new release active; no automatic rollback"
patterns-established:
  - "Local deploy simulation: --network none container FROM a local image (COPY only), docker exec -i as the ssh transport, real release.sh/activate-site.sh with a fake docker, real local gates"
requirements-completed: []
duration: 23min
completed: 2026-09-15
---

# Phase 1 Plan 07: `npm run deploy` orchestration + DNS/smoke helpers Summary

`npm run deploy` runs every D-03 gate in order. It checks drift first (exit 2 before any build), streams a tar over OpenSSH and requires the uploaded file count to match, activates atomically, and reloads the site file only when it changed. It keeps 10 releases, smokes breaktime, doibung.com and www with default TLS, and fails if doibung.com returned anything but 200. This plan verified it locally only: unit tests, a dirty-tree control, a live dry run that stops at drift (exit 2), and an 11-scenario simulation against a local container.

## Performance

- **Duration:** about 23 min (2026-09-15T04:46:31Z to 05:09:33Z)
- **Tasks:** 2 (Task 1 TDD RED then GREEN; Task 2 feat + a small refactor)
- **Files:** 8 created, 1 modified

## The 17 steps (`== STEP n/17`)

1. Clean tree + sha:
   - `git status --porcelain --untracked-files=all -- <paths>` must be empty, else `Cây làm việc chưa sạch — commit trước khi deploy`, exit 1.
   - Then `validateSha(git rev-parse --short=12 HEAD)`.
2. `ssh doibung echo __SSH_OK__`, which must print the marker.
3. Drift check: state-check.sh → `parseStateCheck` → `evaluateState({ requireSite: SITE_FILE_SHA !== '' })`. On failure it prints `DRIFT …` and `DRIFT_MESSAGE`, then exits 2.
4. Typecheck and build:
   - `tsc --noEmit` on both projects checks rc only.
   - `--listFilesOnly` must list `src/main.ts`.
   - `vite build` must print `built in`.
   - `dist/version.json` sha must equal HEAD and be fresh.
5. `precompress.mjs`, marker `PRECOMPRESS_DONE`.
6. `size-report.mjs --gate`, marker `SIZE_GATE_OK`.
7. `vitest run`: output must match `Test Files N passed` and must not contain ` failed`.
8. `playwright test`: output must contain ` passed` and not ` failed`. Then the size report must print `FIRST_LOAD_TOTAL_RAW=`, and `first-load.json` must be newer than the build start.
9. DNS: first the clean tree and HEAD are re-checked. Then `checkDns('breaktime.doibung.com', '187.53.128.67')`. `--dry-run` stops here with `DRY_RUN_OK`.
10. `startPoller('https://doibung.com/', { intervalMs: 1000 })`.
11. Upload: `tar -czf - -C dist .` piped into ssh with the remote command.
    - Both processes must exit 0, and `__UPLOADED__ N` must equal the local regular-file count.
    - On failure it runs `release.sh abort`.
12. `release.sh activate <sha>`: markers `__ACTIVATED__ <sha>`, `__CURRENT__ <sha>`, `__END__`. The listing is parsed.
13. Site file, only when its sha256 differs from `SITE_FILE_SHA` or that is empty:
    - `cat > .breaktime.caddy.new && sha256sum` with the local sha as the marker.
    - Then `activate-site.sh`, which must print `__SITE_RELOADED__ sha256=<local>`.
14. `selectReleasesToDelete(listing, 10, sha)`, then `release.sh cleanup`. Exit 7 `__CURRENT_MOVED__` fails the deploy, and `deleted + skipped` must equal the number of names sent.
15. `runSmoke({ sha, firstActivation: SITE_FILE_SHA was empty })`: every result must be ok.
16. Stop the poller: count must be > 0 and non200 must be 0. Otherwise it prints the failing samples.
17. State check with `requireSite: true`, then `SUMMARY` and `DEPLOY_OK <sha> https://breaktime.doibung.com/ https://breaktime.doibung.com/b/<sha>/`.

Smoke list (`runSmoke`):
- `version.json` sha: retried every 3 s, up to 120 s on first activation and 20 s otherwise.
- `/` returns 200 with cache-control `no-cache` and `nosniff`, and the body contains `wasm-unsafe-eval`.
- `/b/<sha>/` returns 200.
- `/b/<sha>/version.json` sha matches.
- `/b/<sha>` returns 308 with a location ending in `/b/<sha>/`.
- The first `assets/index-*.js` returns 200 with `immutable`.
- `/b/zzz/` returns 404.
- `https://doibung.com/` returns 200.
- `https://www.doibung.com/` returns 301 or 308 to `https://doibung.com`.

## Task Commits

1. **Task 1: tools, DNS preflight, smoke helpers** (TDD)
   - RED `23bb3d9` `test(01-07)`: 3 files failed with "Cannot find module".
   - GREEN `3bcb92b` `feat(01-07)`: 31/31 passed.
2. **Task 2: deploy.mjs orchestration**
   - `8fff341` `feat(01-07)`: deploy.mjs, `sshArgv` in run.mjs, and deploy.test.mjs with 7 tests.
   - `d2c679d` `refactor(01-07)`: exports `tarStreamUpload` so the simulation can drive the real transport. There is no behaviour change.

## Acceptance evidence

**Task 1**
- Vitest: smoke.test.mjs and dnsCheck.test.mjs pass. Together with tools.test.mjs that is 3 files and 31 tests.
- Live lookup: `DNS_DOIBUNG true {"1.1.1.1":["187.53.128.67"],"8.8.8.8":["187.53.128.67"]}`, rc 0.
  - The same call for `breaktime.doibung.com` returns `false`, with `ENOTFOUND` on both resolvers. The record does not exist yet, as expected.
- The TLS-override grep on smoke/dnsCheck/tools prints `0`.
- Mutation check (scratch script, files restored): `MUTATION caught=7 missed=0`. The mutants removed:
  - the status rule
  - the header rule
  - the location rule
  - the retry window
  - `redirect: 'manual'`
  - the DNS `every` check (changed to `some`)
  - the empty-results guard

**Task 2** (verify chain in a .sh file)
- `npx vitest run`: 13 files, 149 passed.
- **Dirty tree** (`src/__dirty_probe.ts` untracked):
  - Output is `== STEP 1/17`, then `?? src/__dirty_probe.ts`, then `DEPLOY_FAIL step=1/17 rc=1 Cây làm việc chưa sạch — commit trước khi deploy`.
  - `DIRTY_RC=1` and `__SSH_OK__` count 0.
  - After deleting the probe, `git status --porcelain src/__dirty_probe.ts` prints nothing.
- **Clean tree** `node scripts/deploy.mjs --dry-run`:
  - Steps 1–3 ran: `SHA=8fff34107821`, then `__SSH_OK__`.
  - All five HOST_*/LIVE_* keys are 0 and `CADDY_RUNNING=true`, with 5 `DRIFT` lines.
  - Then the DRIFT_MESSAGE and `DEPLOY_FAIL step=3/17 rc=2 server drift`, with `DRY_RC=2`.
  - `STEP 4/` count is 0 and `__UPLOADED__` count is 0 in both runs.
- deploy.mjs contains:
  - `--dry-run` ×5
  - `DEPLOY_OK` ×2
  - `evaluateState` ×2
  - `selectReleasesToDelete` ×2
  - `checkDns` ×3
  - `startPoller` ×3
  - `runSmoke` ×3
  - `infra:apply` ×0
  - TLS-override grep 0

## Local simulation of steps 4–17 (not committed)

The real server is not wired, so steps 4–17 can only be reached in simulation.

**Setup**
- The "VPS" is a `docker build --network none` image FROM the local `load-calculator:latest` (Ubuntu 24.04, GNU tar 1.35, flock). Files went in with COPY only, so there are no bind mounts.
- The image contains `/srv/sites/breaktime/releases` with 11 old releases and a `current` symlink, plus a fake `docker` that accepts only activate-site.sh's exact calls.
- The ssh transport is `docker exec -i <ctr> bash -c <remote>`.
- **Real code under test:**
  - `tarStreamUpload`: Windows `tar.exe` streams into the container's stdin.
  - The exact `uploadRemoteCommand`.
  - `release.sh` and `activate-site.sh` over stdin.
  - Every local gate: tsc, vite build, precompress, size gate, vitest and full Playwright ran for real in scenario A. Later scenarios replay those 6 heavy results.
- **Faked:** the state check, DNS (except in B), smoke (it reads `current/version.json` from the container), and the poller target (a local HTTP server).
- The container and image were removed afterwards.

**Result:** `SIM_RESULT pass=42 fail=0`

| Scenario | Result |
|----------|--------|
| A full deploy, first activation | rc 0. Steps 1..17 in order and `DEPLOY_OK d2c679d09c3a …`. `__UPLOADED__ 30` = 30 local = 30 files on the server. `current -> releases/<sha>`. No `.incoming`/`.old` left. Releases 12 → 10 (`__CLEANUP__ deleted=2 skipped=0`, the two oldest). Site file sha256 matches. Fake docker saw validate, reload and config. Files are mode 644. Order: dns < poller < upload < activate < smoke. Poller non200=0 |
| B dry-run with real DNS | rc 1 at step 9 (breaktime NXDOMAIN). No poller or upload, and the server is untouched |
| C dry-run, DNS ok | rc 0 `DRY_RUN_OK d2c679d09c3a files=30`. Stopped after step 9 |
| D upload rc 0 with empty output | rc 1 at step 11. `__ABORTED__` ran, the poller was stopped and reported, no activation |
| E real upload, count mismatch (999) | rc 1 at step 11. Abort really removed `.incoming-<sha>`, and current is unchanged |
| F remote command exits 5 | rc 1 at step 11 (`sshRc=5`, tar killed with EPIPE) |
| G current moved before cleanup | release.sh exit 7 with `__CURRENT_MOVED__ releases/a00000000005`. rc 1 at step 14, nothing deleted (12 dirs) |
| H smoke fails | rc 1 at step 15, poller reported |
| I one 502 on the poller target | rc 1 at step 16 with `POLLER_SAMPLE … status=502` |
| J site file unchanged | rc 0, `SITE_FILE_UNCHANGED`, activate-site not called, smoke `firstActivation=false` |
| K site file present but live config lacks the site | rc 2 at step 3 with the infra:apply instruction. Nothing built or uploaded |

The first harness run failed J (37/40). The harness's fake state reported `SITE_FILE_SHA` set with `LIVE_SITE=0`, and deploy correctly refused with exit 2. I fixed the harness and kept that case as scenario K. deploy.mjs did not change.

Measured in A: vite build ok. `DIST_FILES=14 DIST_RAW=6489983`, `SIZE_GATE_OK`, vitest 13 files passed, Playwright `20 passed (34.6s)`, `FIRST_LOAD_TOTAL_RAW=3099063 FIRST_LOAD_LEVEL=ok`. The whole deploy took 54 s locally.

## Server safety record

| Call | doibung.com before | Result | doibung.com after |
|------|--------------------|--------|-------------------|
| `node scripts/deploy.mjs --dry-run` (ssh `echo __SSH_OK__` + read-only state-check.sh) | 200 (04:57:24Z) | stopped at step 3, rc 2 | 200 (04:57:27Z) |

Other live calls were DNS lookups on 1.1.1.1 and 8.8.8.8 only. Nothing was uploaded or activated, and no Caddy reload, `/srv/sites` or `/opt/doibung` change, container change or `infra:apply` happened. The dirty-tree run made no ssh call.

## Full local suite (after both tasks, HEAD d2c679d)

- `npx tsc --noEmit -p tsconfig.json` rc 0 and `-p tsconfig.node.json` rc 0
- `npx vitest run`: 13 files, **149 passed**. That is the 111 existing tests plus 38 new ones.
- `npm run build` rc 0 (`built in 443ms`)
- `node scripts/precompress.mjs`: `PRECOMPRESS_DONE files=8`
- `npm run size`: `SIZE_GATE_OK totalRaw=6489983 files=14`
- `npx playwright test`: **20 passed, 4 skipped**, 0 failed, rc 0. No existing spec changed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Clean-tree guard gaps (T-01-07-05)**
- **Found during:** Task 2
- **Issue:**
  - Vite copies `public/` into dist, but `public` was not in the guarded path list.
  - Uncommitted `tests/` could make the gates pass with code that is not in the commit.
  - `status.showUntrackedFiles=no` in a git config would hide untracked files.
  - A commit made during the long test run would ship a build labelled with the old sha.
- **Fix:**
  - Added `public` and `tests` to the path list.
  - Pass `--untracked-files=all`.
  - Check that `git rev-parse --show-toplevel` equals the repo root.
  - Re-check cleanliness and HEAD before DNS/upload.
  - Require `dist/version.json` sha == HEAD and fresh.
- **Files modified:** scripts/deploy.mjs
- **Commit:** 8fff341

**2. [Rule 2 - Missing critical] Upload must not create the release tree on an unwired server**
- **Issue:** `mkdir -p "$I"` would create `/srv/sites/breaktime/releases` if the wiring were missing.
- **Fix:** The remote command runs `test -d "$B"; test ! -L "$B"; … mkdir -- "$I"`. Local dist entries that are symlinks or special files are refused, because tar would ship them but `find -type f` would not count them.
- **Files modified:** scripts/deploy.mjs
- **Commit:** 8fff341

**3. [Rule 2 - Correctness] Strict DNS evaluation (T-01-07-03)**
- **Fix:** Every resolver's list must be non-empty and contain only the expected IP. An additional A record fails, and so does a malformed expected IP. Both cases have tests.
- **Files modified:** scripts/lib/dnsCheck.mjs
- **Commit:** 3bcb92b

**4. [Rule 2 - Correctness] Smoke proves the per-commit path serves the new sha**
- **Fix:**
  - Added `GET /b/<sha>/version.json` with sha equality (`jsonEquals` in `evaluateResponse`).
  - A missing entry asset in `/` is a failed result, not a skipped check.
  - A transport or TLS error becomes a failed result that includes the cause.
- **Files modified:** scripts/lib/smoke.mjs
- **Commit:** 3bcb92b

**5. [Rule 2 - Correctness] 01-06 cleanup contract and false-success guards**
- **Fix:**
  - Cleanup exit 7 with `__CURRENT_MOVED__` stops the deploy with a clear message.
  - `deleted + skipped` must equal the names sent, and skipped names are printed as a warning.
  - The site file must be LF only.
  - Poller count 0 is a failure.
  - Unknown CLI flags are refused, so no flag can skip a gate.
  - The poller is stopped and reported on every failure path.
  - A failed upload runs `release.sh abort`.
- **Files modified:** scripts/deploy.mjs
- **Commit:** 8fff341

**6. [Rule 3 - Testability] deps injection and small exports**
- **Fix:**
  - `runDeploy(args, deps)` with `defaultDeps()`, plus a direct-run guard (same as infra.mjs).
  - `run.mjs` exports `sshArgv`, so the upload uses the same host and options as `ssh()`.
  - `tarStreamUpload` is exported.
  - Added `tests/unit/tools.test.mjs` and `tests/unit/deploy.test.mjs`, which the plan's file list did not include.
- **Files modified:** scripts/deploy.mjs, scripts/lib/run.mjs, tests/unit/tools.test.mjs, tests/unit/deploy.test.mjs
- **Commits:** 23bb3d9, 8fff341, d2c679d

**Total deviations:** 6 auto-fixed (5 × Rule 2, 1 × Rule 3). **Impact:** all of them tighten or test the planned flow. Step order, markers, exit codes and interfaces match the plan.

## Issues Encountered

- Scenario J of the first simulation run failed because of the harness fake, not deploy.mjs (see above).
- `npm run build` output wraps `✓ built in` in ANSI colour. The `built in` substring stays intact, and deploy spawns vite directly, where the marker matched in the simulation.

## Notes for the verifier / 01-12

- **Not verified before 01-12:**
  - The real Windows OpenSSH hop. The simulation used `docker exec -i` as the stdin transport, and RESEARCH verified bsdtar → OpenSSH → GNU tar earlier.
  - The live smoke against doibung's Caddy.
  - `--dry-run` reaching `DRY_RUN_OK` against the real server. It needs `infra:apply` plus the DNS A record first.
- **No automatic rollback after activation.** If step 13–17 fails, the new release stays current and deploy exits 1. The operator can go back by redeploying a previous commit. Old builds also stay reachable at `/b/<sha>/`.
- **The first activation smoke waits up to 120 s for ACME** on `version.json`. The poller keeps running during that wait.
- **PLAT-01 was left unmarked**, as instructed. PLAT-02 needs real HTTPS in 01-12.

## Known Stubs

None.

## Threat Flags

None. The only new surface is the planned deploy path, which T-01-07-01..06 cover.

## User Setup Required

None for this plan. Before 01-12, the operator creates the DNS A record `breaktime → 187.53.128.67` and approves `infra:apply`.

## Self-Check: PASSED

- 8/8 created files and the modified run.mjs exist on disk.
- Commits 23bb3d9, 3bcb92b, 8fff341 and d2c679d are in `git log`.
- TDD gate order holds: `test(01-07)` 23bb3d9 comes before `feat(01-07)` 3bcb92b.

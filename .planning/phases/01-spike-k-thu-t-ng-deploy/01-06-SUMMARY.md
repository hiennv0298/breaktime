---
phase: 01-spike-k-thu-t-ng-deploy
plan: 06
subsystem: build-hosting
tags: [size-gate, brotli, gzip, caddy, release, flock, retention, playwright, vitest]
requires:
  - phase: 01-02
    provides: "__bt.state ready-to-play, __bt.rapierFlavor, collectPageProblems, waitForBtState, lazy Rapier chunks"
  - phase: 01-04
    provides: "scripts/lib/run.mjs run/ssh/sshScript, .gitattributes LF for *.sh and deploy/caddy/*"
provides:
  - "scripts/lib/sizeGate.mjs: MB, DIST_MAX_RAW, DIST_MAX_FILES, FIRST_LOAD_TARGET, FIRST_LOAD_MAX, SIDECAR_RE, GROUPS, groupOf, evaluateDist, evaluateFirstLoad"
  - "scripts/precompress.mjs (PRECOMPRESS_DONE files=<n>), scripts/size-report.mjs (--gate, SIZE_GATE_OK)"
  - "tests/e2e/first-load.spec.ts -> test-results/first-load.json {totalRaw, level, files}, FIRST_LOAD_RAW="
  - "scripts/lib/releases.mjs: SHA_RE, RELEASE_NAME_RE, validateSha, parseReleaseListing, selectReleasesToDelete"
  - "deploy/caddy/breaktime.caddy (validated on the live doibung Caddy, read-only)"
  - "deploy/remote/release.sh activate|cleanup|abort; deploy/remote/activate-site.sh"
affects: [01-07, 01-09, 01-12]
tech-stack:
  added: []
  patterns:
    - "Size rules are pure functions (no fs); scripts and Playwright feed them file lists"
    - "Server scripts print markers; every guard is covered by a scenario that a mutant must break"
    - "Deletion list is a request: the server re-validates every name (regex, not symlink, realpath dirname, not current)"
key-files:
  created:
    - scripts/lib/sizeGate.mjs
    - scripts/precompress.mjs
    - scripts/size-report.mjs
    - scripts/lib/releases.mjs
    - deploy/caddy/breaktime.caddy
    - deploy/remote/release.sh
    - deploy/remote/activate-site.sh
    - tests/unit/sizeGate.test.mjs
    - tests/unit/releases.test.mjs
    - tests/e2e/first-load.spec.ts
  modified: []
key-decisions:
  - "01-06: SIZE-REASON.md 'states the measured number' = contains the total in MB with one decimal (e.g. 8.5) or the exact byte count"
  - "01-06: evaluateDist and evaluateFirstLoad fail on empty/zero/NaN input; nothing measured is never a pass"
  - "01-06: release.sh cleanup exits 7 with __CURRENT_MOVED__ when current no longer points at the sha the list was computed for, and skips symlinked names and any path whose realpath equals the current target"
  - "01-06: first-load spec also requires exactly one Rapier chunk > 1 MB when flavor is simd, because Vite names both builds rapier-<hash>.js and the plan's 'rapier3d-compat' name check alone can never match"
patterns-established:
  - "Local simulation of VPS scripts via docker build --network none FROM an existing Ubuntu image (COPY only, no bind mounts), with a fake docker binary and mutation checks"
requirements-completed: []
duration: 16min
completed: 2026-09-15
---

# Phase 1 Plan 06: Size gate, precompress, first-load e2e, Caddy site file, release scripts Summary

TECH-02 sizes are now printed per file and per group and enforced. There are br/gz sidecars for Caddy. The public breaktime site file passes `caddy validate` on the real doibung Caddy, read-only. The release activate/cleanup/abort and site-activation scripts run under flock. They passed a 56-check local simulation in which all 6 mutants were caught.

## Performance

- **Duration:** about 16 min (2026-09-15T04:26:23Z to 04:42Z)
- **Tasks:** 2 (each TDD: RED then GREEN)
- **Files:** 10 created

## Measured numbers (build at 376be3b)

| Item | Value |
|------|-------|
| dist raw / files (sidecars excluded) | 6,489,983 bytes / 14 files: SIZE_GATE_OK |
| dist gzip-9 / brotli-11 | 2,274,678 / 1,683,469 bytes |
| Sidecars | `PRECOMPRESS_DONE files=8` (raw 6,487,452 -> br 1,682,060, gz 2,272,940); 8 `.br` in dist/assets |
| Groups (raw kB) | entry-js 6.0 · rapier 5,942.1 (3 files: SIMD 3,087.8, compat 2,853.7, loader 0.6) · models 0 · textures 0 · audio 0 · other 541.9 |
| **First load until ready-to-play** | **3,099,063 bytes, 8 responses, level ok** (SIMD chunk 3,087.8 kB, entry 6.0, css 1.8, loading 1.6, `/` 0.7, rapier loader 0.6, playGate 0.4, assets 0.1) |

## Task Commits

1. **Task 1: size gate, precompress, size report, first-load e2e**
   - RED `c2cca26` `test(01-06)`: Vitest failed with "Cannot find module '../../scripts/lib/sizeGate.mjs'".
   - GREEN `10af486` `feat(01-06)`: sizeGate 21/21 passed.
     - The plan's verify chain ended with `T1_VERIFY_ALL_OK`: `PRECOMPRESS_DONE files=8`, `SIZE_GATE_OK`, `FIRST_LOAD_RAW=3099063`, a group table with entry-js and rapier, and `BR_COUNT=8`. `first-load.json` has totalRaw 3099063, which is below 20,000,000.
     - Negative controls:
       - planted `dist/assets/planted.js.map`: `SIZE_GATE_ERROR source map` with rc 1
       - planted `dist/.env.production`: `SIZE_GATE_ERROR env file` with rc 1
       - gate back to OK after removing both files
       - precompress with no dist: rc 1
       - precompress with only files under 1 KB: rc 1
     - `npm run typecheck` rc 0.
2. **Task 2: Caddy site file, release.sh, activate-site.sh, retention logic**
   - RED `801e7e8` `test(01-06)`: failed with "Cannot find module '../../scripts/lib/releases.mjs'".
   - GREEN `376be3b` `feat(01-06)`: releases 16/16 passed, `SYNTAX_OK`, `CADDY_SITE_VALID`.

## Acceptance evidence (Task 2)

- `grep -ciE "basic_?auth|X-Robots-Tag"` on the site file: 0.
- The site file contains:
  - `precompressed br gzip` ×2
  - `hide .* *.map` ×2
  - `/etc/caddy/sites/breaktime/current` ×1
  - `immutable` ×1
  - `X-Frame-Options SAMEORIGIN` ×1
- release.sh contains `flock -n 9` ×1, `--one-file-system` ×4, `realpath -e` ×2 and `mv -T` ×4.
- activate-site.sh: `localhost:2019` ×0 and `caddy reload` ×1.
- `git ls-files --eol` shows `i/lf w/lf attr/text eol=lf` for all 7 new scripts/config files.

## Local simulation of the server scripts (not committed)

- **How it ran:** `docker build --network none` from the local `load-calculator:latest` image (Ubuntu 24.04, bash, util-linux flock, GNU coreutils 9.4, close to the VPS's CentOS Stream 10 with coreutils 9.5). Files went in with COPY only, so no bind mounts. A fake `docker` binary checks the exact argument strings. The image was removed afterwards.
- **release.sh checks:**
  - invalid sha, missing releases dir, unknown command: rc 2
  - missing incoming or no index.html: rc 4
  - activate: relative `current`, markers in order `__ACTIVATED__ / __REL__ ×12 / __CURRENT__ / __END__`
  - `.incoming-*`, `.old-*`, symlinked and non-hex names are not listed
  - re-activating the same sha replaces the content and leaves no `.old-`
  - while locked, activate/cleanup/abort all return `__LOCKED__` with rc 3 and change nothing
  - cleanup with a wrong current: `__CURRENT_MOVED__` with rc 7, nothing deleted
  - cleanup of a mixed list: `deleted=3 skipped=8`. Current, a symlink to current, a symlink to `/etc`, a plain file, a missing name and invalid names are all kept.
  - symlinked BASE (realpath leaves releases): `deleted=0`
  - abort removes only `.incoming-<sha>`
- **activate-site.sh checks:**
  - missing new file: rc 4
  - invalid file: `__SITE_INVALID__` with rc 20, the new file removed, no reload
  - validate rc 0 but no marker: rc 20
  - first activation: `__SITE_RELOADED__ sha256=<match>`, mode 644, no .bak, exact reload args with `127.0.0.1:2019`
  - failed reload: `__SITE_ROLLED_BACK__` with rc 21 and the previous file restored (reload called twice); with no previous site, the site file is removed
  - admin config without the domain: rc 22
  - locked: rc 3 and docker was never called
- **Result:** `SIM_RESULT pass=56 fail=0`.
- **Mutation check:** `MUTATION caught=6 missed=0`. The 6 mutants: symlink/real-current guard removed, flock removed, dirname check removed, current-moved check removed, restore removed, validate marker check removed.
  - The first run caught only 4. The dirname and marker mutants survived because no scenario exercised them. I added the symlinked-BASE and rc-0-without-marker scenarios, and both are now caught. Neither script changed.

## Server safety record

Only two read-only `docker exec -i doibung-caddy-1 caddy validate --config - --adapter caddyfile` calls with a stdin file were made. Neither wrote anything to the server.

| Call | doibung.com before | Result | doibung.com after |
|------|--------------------|--------|-------------------|
| Validate deploy/caddy/breaktime.caddy | 200 (04:38:52Z) | `Valid configuration` (rc 0) | 200 (04:38:53Z) |
| Negative control: broken site file | 200 (04:39:09Z) | rejected rc 1 `-:2: unrecognized directive: not_a_real_directive_xyz` (proves stdin is parsed) | 200 (04:39:10Z) |

These were never run: nothing uploaded, no `/srv/sites` content, no `/opt/doibung` edits, no `caddy reload`, no container recreate.

## Full local suite (after both tasks)

- `npx tsc --noEmit -p tsconfig.json` rc 0 and `-p tsconfig.node.json` rc 0
- `npx vitest run`: 9 files, **111 passed**
- `npm run build` rc 0
- `node scripts/precompress.mjs`: `PRECOMPRESS_DONE files=8`
- `npm run size`: `SIZE_GATE_OK totalRaw=6489983 files=14`
- `npx playwright test`: **20 passed, 4 skipped**, 0 failed. This is the 19 existing tests plus first-load. No existing spec was changed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's "fallback not fetched" check could never fail**
- **Found during:** Task 1
- **Issue:** Vite emits both Rapier builds as `assets/rapier-<hash>.js`. A response path never contains "rapier3d-compat", so the planned assertion always passes.
- **Fix:** The literal check is kept. The spec also requires exactly one Rapier chunk over 1 MB when `rapierFlavor` is `simd`. Measured: one chunk, the SIMD one at 3,087,787 bytes.
- **Files modified:** tests/e2e/first-load.spec.ts
- **Commit:** c2cca26

**2. [Rule 2 - Missing critical] Extra guards in release.sh cleanup (T-01-06-01)**
- **Found during:** Task 2
- **Issue:** Given a hex-named symlink `releases/abc1234 -> <current sha>`, `realpath -e` resolves to the current release directory, and its dirname is still `releases`. The planned checks would then pass and `rm -rf` would delete the live build. A list computed before another deploy could also be applied against a newer current.
- **Fix:** Skip names where `$REL/$name` is a symlink. Skip when realpath equals the realpath of current, or is not a directory. Refuse the whole cleanup with `__CURRENT_MOVED__` (exit 7) when `readlink current` is not `releases/<current_sha>`. Check that `current/index.html` still exists afterwards. Print `skipped=<n>` next to `deleted=<n>`.
- **Files modified:** deploy/remote/release.sh
- **Commit:** 376be3b

**3. [Rule 2 - Missing critical] activate hardening (T-01-06-02)**
- **Fix:**
  - A failed move of incoming puts `.old-<sha>` back.
  - A stale `current.new` is removed before `ln -sfn`.
  - Incoming must be a real directory, not a symlink.
  - `current/index.html` must resolve after the swap.
  - abort takes the same lock and checks that the removal happened.
  - An ERR trap prints `__ERROR__ line= rc=`.
- **Files modified:** deploy/remote/release.sh
- **Commit:** 376be3b

**4. [Rule 2 - Missing critical] activate-site.sh requires validate rc 0 and the marker; exit 22 when the admin config lacks the domain**
- **Fix:** Validate rc and "Valid configuration" are both required. The new file must be a regular non-empty file, not a symlink. If the admin config has no `breaktime.doibung.com` after a reload with rc 0, the script exits 22 and points to `npm run infra:check`. A missing sites import is the likely cause.
- **Files modified:** deploy/remote/activate-site.sh
- **Commit:** 376be3b

**5. [Rule 2 - Correctness] Pure functions reject non-measurements**
- **Fix:**
  - `evaluateDist` fails on an empty dist or on negative/NaN sizes.
  - `evaluateFirstLoad` fails on a total of 0, negative or NaN.
  - `selectReleasesToDelete` throws when `current` is not a valid release name.
  - `selectReleasesToDelete` ignores non-finite mtimes and keeps only the newest entry for a duplicate name.
  - `parseReleaseListing` requires exactly `__REL__ <name> <digits>`.
- **Files modified:** scripts/lib/sizeGate.mjs, scripts/lib/releases.mjs
- **Commits:** 10af486, 376be3b

**Total deviations:** 5 auto-fixed (1 × Rule 1, 4 × Rule 2). **Impact:** every change makes the checks stricter. The interfaces 01-07 imports are unchanged. 01-07 only gains the `__CURRENT_MOVED__` (exit 7) and `skipped=` outputs to handle.

## Issues Encountered

- A simulation harness check failed because `$(...)` strips the trailing newline. The harness was fixed; the script had no bug.

## Notes for the verifier / later plans

- **"First load" stops at ready-to-play.** The chunks that load after the Chơi click are not counted: three.core 178.9 kB, renderer 353.1 kB, game 4.5 kB and loop 0.6 kB, about 0.54 MB. TECH-02 says "until playable", so the number to reach gameplay is about 3.64 MB, still well under 8 MB. If 01-09 or later plans load models, textures or audio after Chơi, the spec's end point should move to `playing`, or the post-click fetches should be added.
- **The build has no models, textures or audio yet.** Those groups print 0. The 01-05 assets are not imported by the game code yet.
- **Two browsers need different chunks.** Each Rapier flavour is about 3 MB raw and about 0.78 MB br. The dist total counts both, but a client downloads only one.
- **Behaviour on doibung's Caddy is still unverified.** Headers, 308/404 and serving sidecars through the relative `current` symlink have only been checked by RESEARCH in a local container. They are first checked on doibung's Caddy in 01-12.
- **Open requirements.** TECH-02 still needs the phone measurements. PLAT-02 needs real HTTPS, which comes with 01-12. Both are left unmarked, as instructed.

## Known Stubs

None.

## Threat Flags

None. The only new surface is the planned site file and the release scripts, which T-01-06-01..07 cover.

## User Setup Required

None.

## Next Phase Readiness

- 01-07 (`npm run deploy`) can import:
  - `validateSha`, `parseReleaseListing`, `selectReleasesToDelete` from `scripts/lib/releases.mjs`
  - `evaluateDist` from `scripts/lib/sizeGate.mjs`
  - `node scripts/precompress.mjs` and `npm run size`
- 01-07 can send `deploy/remote/release.sh` and `activate-site.sh` through `sshScript`. The only arguments are hex names, which pass SAFE_ARG.

## Self-Check: PASSED

- 10/10 created files exist on disk.
- Commits c2cca26, 10af486, 801e7e8 and 376be3b are in `git log`.
- TDD gate order holds: `test(01-06)` c2cca26 before `feat(01-06)` 10af486, and `test(01-06)` 801e7e8 before `feat(01-06)` 376be3b.

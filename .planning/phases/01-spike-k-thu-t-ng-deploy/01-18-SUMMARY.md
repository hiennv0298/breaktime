---
phase: 01-spike-k-thu-t-ng-deploy
plan: 18
subsystem: stability
tags: [soak, crash-beacon, wake-lock, leak-proxy, deploy, tech-04, plat-01, d-03, d-30, playwright, vitest, tdd]
requires:
  - "01-07: npm run deploy (drift check, gates, poller non200 must be 0, smoke, SITE_FILE_UNCHANGED skips the Caddy reload)"
  - "01-12: live infra on game.doibung.com (Caddy import + /srv/sites mount)"
  - "01-16: breakables.resetAll, props.resetAll, shards pool"
  - "01-17: bench timeline, startBench, BENCH_SEED, createGame(ctx, { forcedNpcCount: MAX_NPCS, bench })"
  - "01-24: SwingGate 350 ms and the mashing e2e (de-flaked here)"
  - "01-25: suppressKeyHints(on)"
  - "01-27: grow-only NPC pool, Npc.active()"
provides:
  - "src/logic/beacon.ts: BEACON_STALE_MS 20000, Beacon, evaluatePrevious(prev, nowMs), nextBeacon(b, nowMs, clean?)"
  - "src/boot/crashBeacon.ts: initCrashBeacon(sha) with localStorage['bt.beacon'] heartbeat every 5 s, clean on pagehide, every storage access in try/catch"
  - "src/ui/crashBanner.ts + crashBanner.css: #crash-banner (textContent) with a close button, __bt.beacon"
  - "src/bench/soak.ts + soak.css: startSoak(game, { minutes, cycleSec, maxCycles? }), #soak-panel, __bt.soak"
  - "src/logic/benchTimeline.ts: soakFromQuery, soakOptionsFromQuery (soakMin 1..30 default 15, soakCycles 1..100, dur 5..60)"
  - "src/game/game.ts: resetForSoak(); player.teleport(x, z); renderer getContextLostCount(); benchWaypoints() shared by bench and soak"
  - "Live measurement build 1ecc53ce473e on https://game.doibung.com with ?bench=1 and ?soak=1 URLs recorded in 01-GO-LIVE.md"
affects: [01-19, 01-20, 01-21]
tech-stack:
  added: []
  patterns:
    - "Soak = the bench timeline looped per cycle, with a full reset between cycles; leak proxy compares renderer geometries/textures and Rapier bodies at the end of cycle 1 against the end of the last cycle"
    - "Crash detection is a pure rule (beacon.ts) fed by a try/catch storage shell (crashBeacon.ts); nothing leaves the origin"
key-files:
  created: [src/logic/beacon.ts, src/boot/crashBeacon.ts, src/ui/crashBanner.ts, src/ui/crashBanner.css, src/bench/soak.ts, src/bench/soak.css, tests/unit/beacon.test.ts, tests/e2e/soak-leak.spec.ts]
  modified: [src/game/breakables.ts, src/game/game.ts, src/game/player.ts, src/main.ts, src/bench/benchScript.ts, src/logic/benchTimeline.ts, src/render/renderer.ts, tests/unit/benchTimeline.test.ts, tests/e2e/swing.spec.ts, .planning/phases/01-spike-k-thu-t-ng-deploy/01-GO-LIVE.md]
decisions:
  - "01-18: ?soak=1 takes precedence over ?bench=1; soakMin/soakCycles are plain integers clamped 1..30 / 1..100, dur goes through parseBenchDuration (5..60) (T-01-18-05)"
  - "01-18: breakables.resetAll also clears the last-break record; broken/moved counts are derived from the prop records so they read 0 after reset; breaks/drops stay cumulative per page; no geometry, material or body is created on reset"
  - "01-18: swing mashing e2e waits 60 -> 40 ms (operator-approved) after the step-8 gate flaked at 300.1 ms vs < 300 under full-suite load; SWING_COOLDOWN_MS 350, the < 300 threshold and count/dropped assertions unchanged"
  - "01-18: measurement build 1ecc53ce473e deployed on the third attempt (SSH reset at upload, then the swing flake); poller 38/38 200, SITE_FILE_UNCHANGED, no Caddy reload"
metrics:
  duration: "~65 min wall clock including the API-auth interruption and two failed deploys (continuation 15:14Z to 15:31Z)"
  completed: 2026-09-15
  tasks: 3
  files: 18
---

# Phase 1 Plan 18: 15-minute soak, crash beacon and live measurement build Summary

`?soak=1` loops the 10-NPC bench scene for 15 minutes. Between cycles it puts every NPC, the player and every broken or moved prop back where they started. After each cycle it records GPU geometries and textures, physics bodies, the lowest fps in each minute and the number of WebGL context losses, and it shows them in `#soak-panel`. It asks the browser to keep the screen awake when that is supported. A `localStorage['bt.beacon']` heartbeat notices a session that died mid-play: on the next load `#crash-banner` shows how long that session ran and its sha. The finished build is live as **1ecc53ce473e** on game.doibung.com, and the three gate URLs are recorded in 01-GO-LIVE.md. TECH-04 and PLAT-01 still need the real phones (01-19), so they are not marked complete.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Beacon rules (TDD) + failing soak-leak / crash-banner e2e | bcdd27e | src/logic/beacon.ts, tests/unit/beacon.test.ts, tests/e2e/soak-leak.spec.ts |
| 2 | Soak loop, crash beacon + banner, wake lock (GREEN) | ae03486 | src/bench/soak.ts, soak.css, src/boot/crashBeacon.ts, src/ui/crashBanner.ts, crashBanner.css, game.ts, breakables.ts, player.ts, main.ts, benchScript.ts, benchTimeline.ts, renderer.ts, benchTimeline.test.ts |
| 3 | Deploy the measurement build (after operator-approved de-flake) | 1ecc53c (spec) + docs commit | tests/e2e/swing.spec.ts, 01-GO-LIVE.md |

## Live measurement build

- `DEPLOY_OK 1ecc53ce473e`, exit 0, 15:22:04Z – 15:28:11Z. Poller `count=38 non200=0 maxConsecutiveNon200Ms=0`. Step 13 printed `SITE_FILE_UNCHANGED`, so Caddy was not reloaded. Smoke 9/9 OK. STATE_CHECK_OK.
- Before the deploy: doibung.com 200, live sha 00130ad392e5. After: version.json sha 1ecc53ce473e == HEAD.
- Plan verify: `MEASURE_BUILD_LIVE 1ecc53ce473e`, VERIFY_RC=0.
- Independent checks: /b/1ecc53ce473e/ 200, `?bench=1` 200, `?soak=1` 200, doibung.com 200, www 301 → https://doibung.com/.
- First load: `FIRST_LOAD_TOTAL_RAW=3364381` (ok). DIST_RAW=7306719, 63 files.
- Gate URLs:
  - `https://game.doibung.com/b/1ecc53ce473e/?bench=1`
  - `https://game.doibung.com/b/1ecc53ce473e/?soak=1`
  - `https://game.doibung.com/b/1ecc53ce473e/`

## Verification evidence

| Check | Result |
|-------|--------|
| Task 1 verify | UNIT_GREEN + E2E_RED (previous executor, bcdd27e) |
| `npm run typecheck` | rc 0 |
| `npx vitest run` | 36 files, **483/483** |
| `npm run build` | rc 0 |
| `npm run size` | `SIZE_GATE_OK totalRaw=7306719 files=63` |
| `npx playwright test` | **92 passed, 0 failed**, 76 skipped (soak-leak 2/2 included) |
| swing.spec.ts desktop `--repeat-each=5` | mashing test 5/5 ok, 30 passed, rc 0 |
| crashBeacon.ts `localStorage` code lines | 2 (lines 23, 33), both inside try blocks; `try` count 3 |
| soak.ts `wakeLock` | behind `'wakeLock' in navigator` (line 41) |
| breakables.ts `new MeshLambertMaterial\|new BufferGeometry` | 0 |
| beacon.ts `20000` | present |
| innerHTML in crashBanner.ts / soak.ts | 0 |
| `fetch(` / `sendBeacon` in beacon, banner, soak | 0 (the crash beacon stays local) |

## Deviations from Plan

### Execution history

- **Resumed after an API authentication interruption.** Task 1 (bcdd27e) was committed before the interruption. A continuation executor reviewed the partial Task 2 work. It was complete except for one comment in breakables.ts, which was fixed. soak.ts, `resetForSoak` and the main.ts wiring were written fresh. Task 2 was then committed as ae03486 with the full local suite green.
- **Deploy attempt 1 (ae03486): failed at step 11 upload.** `UPLOAD tarRc=0 sshRc=255 uploaded=NaN local=113`, `client_loop: send disconnect: Connection reset`, `__ABORTED__ ae034868d449`, poller `count=108 non200=0`. The failure was in the SSH transport; it was aborted before activation, and the live site stayed at 00130ad392e5.
- **Deploy attempt 2 (ae03486): failed at step 8 Playwright gate.** The pre-existing spec `tests/e2e/swing.spec.ts:127` failed its timing precondition: `Expected: < 300, Received: 300.0999999642372`. That was three E presses with 2×60 ms waits, measured across Playwright round-trips during a 5-minute suite. The cooldown assertions after it never ran. Nothing was uploaded.

### Operator-approved fix

**1. [Operator decision - test flake] Swing mashing precondition de-flaked**
- **Found during:** Task 3, deploy attempt 2
- **Issue:** The 300 ms precondition ("all presses inside one 350 ms cooldown") had only about 60 ms of headroom over the 120 ms of waits plus Playwright round-trips. Under full-suite load it landed at 300.1 ms. The game's cooldown behaviour was never shown to be wrong.
- **Fix (operator option 1 "Sửa test rồi deploy lại"):** Both inter-press waits went from 60 to 40 ms, with the comment `01-18: 40 ms (was 60) — timing precondition flaked at 300.1 ms under full-suite load; still > one 16.7 ms step (D-30)`. The comment above the presses now says ~80 ms instead of ~120 ms so it stays accurate. `SWING_COOLDOWN_MS`, the `< 300` threshold and the `count` / `dropped >= 1` assertions are unchanged, and 40 ms still puts each press in a different 60 Hz physics step.
- **Files modified:** tests/e2e/swing.spec.ts
- **Commit:** 1ecc53c

### Auto-fixed Issues (Task 2, Rule 3 - Blocking): files outside `files_modified`

- `src/game/player.ts`: `teleport(x, z)`. The soak reset has to put the player capsule back at PLAYER_SPAWN, and Player had no reposition API.
- `src/render/renderer.ts`: `getContextLostCount()`. The soak panel shows context losses, and the counter was module-private.
- `src/bench/benchScript.ts`: waypoint de-duplication was extracted into `benchWaypoints()` so the bench and the soak use the same loop. Bench behaviour is unchanged.
- `src/logic/benchTimeline.ts` + `tests/unit/benchTimeline.test.ts`: `soakFromQuery` / `soakOptionsFromQuery` (the clamps from T-01-18-05) are pure and unit tested. They sit next to `parseBenchDuration`, which they reuse for `dur`.
- `src/bench/soak.css`, `src/ui/crashBanner.css`: styles live in files because of the CSP `style-src 'self'`.

## Known Stubs

None. Every soak panel field and the banner are wired to live data.

## Deferred Issues

None.

## Notes for verification (01-19 real-device gate)

- On each phone, open `https://game.doibung.com/b/1ecc53ce473e/?soak=1`, tap Chơi and leave it for 15 minutes. The panel should end with "Xong 15 phút — không crash". Screenshot the panel, which shows min fps per minute, context losses, geometries/textures/bodies. Record the phone model, OS and browser (STATE blocker).
- If Safari kills the tab, reopening `https://game.doibung.com/b/1ecc53ce473e/` within 20 s of the last heartbeat should show `#crash-banner` with the elapsed seconds. After 20 s the stale beacon is ignored by design (BEACON_STALE_MS).
- Wake lock is best-effort. If the browser does not support it, set the phone's auto-lock to "never" during the soak.
- The swing mashing test now has about 140 ms of headroom under the 300 ms threshold (80 ms of waits + round-trips). If it flakes again, the cause is test-runner load, not the cooldown.

## Threat Flags

None. No new network code: the beacon stores only the sha and timestamps locally (T-01-18-02), all storage access is wrapped in try/catch (T-01-18-03), and the banner uses textContent only (T-01-18-01). The deploy went through the 01-07 pipeline with poller non200=0 (T-01-18-04).

## TDD Gate Compliance

- RED: `test(01-18)` bcdd27e. The beacon unit test was written first and is GREEN in that commit together with beacon.ts (the plan's Task 1 scope). The soak-leak and crash-banner e2e were committed failing.
- GREEN: `feat(01-18)` ae03486. soak-leak 2/2 pass, and the full Playwright suite has 92 passed, 0 failed.
- REFACTOR: none.

## Self-Check: PASSED

- All 8 created source/test files and this SUMMARY exist; commits bcdd27e, ae03486 and 1ecc53c are in git log.
- 01-GO-LIVE.md has `## Measurement build` and the gate URLs containing 1ecc53ce473e; live version.json sha == HEAD.

---
phase: 01-spike-k-thu-t-ng-deploy
plan: 17
subsystem: benchmark
tags: [bench, d-08, d-11, d-21, d-24, d-28, d-29, tech-03, tech-05, tech-07, autopilot, ragdoll, breakables, playwright, vitest, tdd]
requires:
  - "01-11: summarize / looksThrottled (benchStats), getQuality() current/source/onChange, TIER_LABEL_VI"
  - "01-15: performSlap, mulberry32 / BENCH_SEED, hit-stop, get-up FSM (ragdoll <= 4 s + 0.45 s recover)"
  - "01-16: breakables.smashAll, props.movedCount() / brokenCount()"
  - "01-23: one draw call per character, MAX_NPCS 10, NPC_ROUTES 0-4"
  - "01-24: SwingGate (350 ms), performSlap stays outside the gate for the bench"
  - "01-25: suppressKeyHints(on)"
  - "01-26: createGame(ctx, { forcedNpcCount }) precedence forced > ?npcs > stored > 3"
  - "01-27: grow-only NPC pool, active NPCs only in __bt.npcs"
provides:
  - "src/logic/benchTimeline.ts: BenchAction, buildTimeline({ durationSec, stepHz?, seed, waypoints }), parseBenchDuration (5..60, default 60), benchFromQuery"
  - "src/game/autopilot.ts: createAutopilot() { setTarget, stop, apply(input, player, cameraYawRad), arrived }, AUTOPILOT_ARRIVE_M 0.6"
  - "src/bench/benchScript.ts: BenchResult, startBench(game, { durationSec }), BENCH_WARMUP_STEPS 60, MASS_RAGDOLL_WINDOW_STEPS 300"
  - "src/bench/resultsView.ts + bench.css: showBenchResults(r) -> section#bench-results, #bench-rerun, #bench-label"
  - "src/game/loop.ts: onFrame(cb(ts, workMs)) and onStep(cb(step)) registries, both return unsubscribe"
  - "src/game/game.ts: CreateGameOptions.bench; Game.playerInput, slapNearestNpc, massRagdoll, smash, countRagdollsActive, activeNpcCount, knockedOrBroken, brokenCount, stats"
  - "URL: bench=1, dur=5..60 (with q=low|med|high and autoplay=1 from earlier plans); window.__bt.bench { running, done, result, step, totalSteps, massRagdoll, log, target, arrived }"
affects: [01-18, 01-19, 01-20, 01-21]
tech-stack:
  added: []
  patterns:
    - "Scripted runs drive the real player controller through an autopilot-owned InputState (inverse camera-relative mapping), not by teleporting"
    - "Loop recorder hooks: step hooks run before game.fixedUpdate (scripted input lands in the step), frame hooks after render with measured work time"
    - "Bench code (runner, results view, css, duration parser) is a lazy chunk loaded after Chơi; index chunk and unsupported path unchanged"
key-files:
  created: [src/logic/benchTimeline.ts, src/game/autopilot.ts, src/bench/benchScript.ts, src/bench/resultsView.ts, src/bench/bench.css, tests/unit/benchTimeline.test.ts, tests/unit/autopilot.test.ts, tests/e2e/bench.spec.ts]
  modified: [src/game/game.ts, src/game/loop.ts, src/main.ts]
decisions:
  - "01-17: bench timeline per D-08 at fixed fractions: roam 0-55 % (max(3, round(0.55*dur/5)) walk+slap segments, slap mid-segment, >= 0.5 s apart), massRagdoll 60 %, smash 75 %, walk on 76-99 %, end 100 %; mulberry32(BENCH_SEED) only shuffles the waypoint order"
  - "01-17: massRagdoll slaps every slappable NPC in one step outside the swing gate; for up to 300 steps afterwards any NPC still getting up from an earlier slap is slapped the moment it stands, stopping as soon as all active NPCs are ragdolls at once (guard for short &dur= runs; measured 0 late slaps at dur 8 and 60)"
  - "01-17: bench mode keeps device pause toggles (Escape, lone Ctrl, touch pause button: portal rule) but the player reads a separate autopilot InputState; action presses and clicks are dropped, the joystick and pointer pick are not attached"
  - "01-17: frames are recorded after a 60-step warm-up and never while paused (the gap after a pause is skipped); peaks of draw calls, bodies and simultaneous ragdolls cover the whole run; the run ends with pauseFor('user') under the results overlay (z 1100)"
  - "01-17: bench waypoints = player spawn + NPC_ROUTES points de-duplicated at 1 cm; raw route corners repeat so often that the shuffled loop paced around the west column"
  - "01-17: scripted slapNearest goes through the D-30 swing gate like a press; massRagdoll does not"
metrics:
  duration: "~22 min (14:02Z to 14:24Z)"
  completed: 2026-09-15
  tasks: 2
  files: 11
---

# Phase 1 Plan 17: ?bench=1 deterministic benchmark with 10 NPCs Summary

`?bench=1` now plays one fixed scene. The player walks a seeded loop around the office and slaps the nearest coworker a few times. At 60 % all 10 NPCs are ragdolls at the same moment, and at 75 % every dynamic prop is launched. At the end the game pauses and a full-screen results screen appears. It shows average fps, 1% low, peak draw calls, peak physics bodies, NPC count, simultaneous ragdolls, knocked/broken objects (with the broken count), tier with source and changes, Rapier flavor, DPR and backbuffer, the throttled flag, commit sha, duration and the user agent. It fits one phone screenshot in both orientations. The bench always runs 10 NPCs through `createGame(ctx, { forcedNpcCount: MAX_NPCS, bench: true })`; a saved `bt.npcs` count is neither used nor overwritten. While the bench runs, the key hint panel and the touch hint are hidden, player input is off and a red "BENCH" label sits under the build badge. `&dur=5..60` shortens the run without changing the order of events.

## What was built

- **Timeline (pure, TDD):** `buildTimeline` keys every action to a sim-step index. It builds 60 s → end at step 3600 and 8 s → end at step 480, with massRagdoll at 60 % and smash at 75 %. The same options always give the same timeline, and a different seed changes the walk order. `parseBenchDuration` accepts only a plain integer and clamps it to 5..60 (T-01-17-01).
- **Loop hooks:** `onStep(step)` runs before `game.fixedUpdate`, so autopilot input and timeline actions land in that step. `onFrame(ts, workMs)` runs after render with the measured work time.
- **Game hooks:** `slapNearestNpc` (nearest slappable NPC at any distance, through the swing gate), `massRagdoll` (same step, no gate), `smash` (`breakables.smashAll(mulberry32(BENCH_SEED))`), `countRagdollsActive`, `activeNpcCount`, `knockedOrBroken` = `props.movedCount()`, `brokenCount`, and `stats` (draw calls, bodies, DPR, canvas backbuffer, Rapier flavor).
- **Autopilot:** inverts `cameraRelativeMove` for the current camera yaw and stops within 0.6 m. A unit test checks the round trip at yaw 0/90/180/270/37°.
- **Results screen:** `section#bench-results` built with `textContent`. Rows show in one column in portrait and two in landscape. It has the note "Chụp màn hình này làm bằng chứng đo" and a "Chạy lại" button (`location.reload()`).

## Verification evidence

| Check | Result |
|-------|--------|
| Task 1 verify | `UNIT_GREEN` + `E2E_RED` (3 bench tests failed waiting for `__bt.bench.running`) |
| `Math.random` in benchTimeline.ts (code lines) | 0 |
| `npm run typecheck` | rc 0 |
| `npx vitest run` | 35 files, **465/465** (was 439; +19 benchTimeline incl. duration parser and bench query, +7 autopilot) |
| `npm run build` | rc 0 (bench chunks: benchScript 4.66 kB JS + 1.74 kB CSS, benchTimeline 1.51 kB; index 8.58 kB) |
| `npm run size` | `SIZE_GATE_OK totalRaw=7298256 files=61` |
| `npx playwright test` | **90 passed, 0 failed**, 74 skipped (was 87 passed; +3 bench) |
| Task 2 greps | all 7 result labels present; innerHTML-family 0; `fetch(` in bench files 0; `movedCount` in game.ts 2; `forcedNpcCount: MAX_NPCS` in main.ts 1 |

Headless measurements (SwiftShader, preview build at b783a48, before the waypoint de-dup; fps values are not real measurements per D-24):

| Run | NPC | Ragdolls at once | Mass step slapped / late | Knocked (broken) | Peak draws | Peak bodies | Frames | Errors |
|-----|-----|------------------|--------------------------|------------------|------------|-------------|--------|--------|
| 1280x720, dur 8 | 10 | 10 | 8 / 0 (2 still flying from earlier slaps) | 31 (11) | 91 | 165 | 277 | 0 |
| 844x390 touch, dur 8 | 10 | 10 | 8 / 0 | 32 (11) | 91 | 165 | 427 | 0 |
| 390x844 touch, dur 8 | 10 | 10 | 8 / 0 | 33 (11) | 76 | 165 | 428 | 0 |
| 1280x720, dur 60 | 10 | 10 | 10 / 0 | 31 (11) | 91 | 165 | 2562 | 0 |

- The results overlay had scrollHeight = clientHeight at 1280x720, 844x390 and 390x844. Screenshots were checked visually and not committed. All rows, the UA line, the note and the button were visible with no clipping.
- Key hints during the run: `visible false`, `touchHintVisible false`; `#touch-zone` absent; `#bench-label` present while running and removed at the end; `__bt.paused` true after the end.
- Walk check at dur 20 after the de-dup: the player crossed from spawn to the east window (3, 1), then to the pantry (6.1, -3.7), the north lane (0.8, -4.7) and toward the west column (-6.2, 2). Each target was reached (`arrived` true), with no permanent stall.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Mass-ragdoll catch-up window**
- **Found during:** Task 2 design
- **Issue:** `performSlap` only works on an `animated` NPC. An NPC slapped earlier in the roam phase can be in `recover` (up to 4 s ragdoll + 0.45 s) at the 60 % step. In a short `&dur=` run that would make "10 ragdolls at once" depend on timing.
- **Fix:** For up to 300 steps after the mass step, the bench slaps any NPC that has stood up again. It stops as soon as all active NPCs are ragdolls at once. Everyone slappable at the mass step is still slapped in that one step. The window never fired in the measured runs (late slaps 0), but it keeps the requirement from depending on timing.
- **Files:** src/bench/benchScript.ts · **Commit:** 5ebae8e

**2. [Rule 1 - Bug] Bench loop paced in place**
- **Found during:** Task 2 walk check
- **Issue:** `NPC_ROUTES.flat()` repeats the west column / north lane corners many times. The shuffled loop kept picking nearby duplicates, so the player moved about 1 m in 20 s.
- **Fix:** The waypoints are de-duplicated at 1 cm before the timeline is built.
- **Files:** src/bench/benchScript.ts · **Commit:** 5ebae8e

**3. [Rule 3 - Blocking] Interface additions not in the plan contract**
- `CreateGameOptions.bench`, `Game.playerInput`, `Game.activeNpcCount()` and `Game.stats()` are needed because `startBench(game, { durationSec })` has no access to the renderer, the physics world or the autopilot input. `Autopilot.stop()` ends the walk at `end`.
- `parseBenchDuration` / `benchFromQuery` live in `src/logic/benchTimeline.ts` and have unit tests. main.ts loads them with the game modules, so the index chunk stays three-free and the request count on the unsupported path does not change.
- New files outside `files_modified`: `src/bench/bench.css` (styles under the CSP `style-src 'self'`) and `tests/unit/autopilot.test.ts`.
- `__bt.bench` also exposes `step`, `totalSteps`, `massRagdoll`, `log`, `target` and `arrived` for diagnosis.

**4. [Layout] BENCH label position**
- The label sits directly under the build badge (top 28 px), not beside it. The badge width depends on the sha and the font, and the e2e checks the badge text, so the label is not placed inside the badge.

## Known Stubs

None. Every result field is wired to live data.

## Deferred Issues

None.

## Notes for verification

- **Human check (end of phase, D-08):** open `?bench=1` on desktop Chrome and on both phones, tap Chơi, wait 60 s, then screenshot the results. Record the device model, OS and browser (STATE blocker). Check that the scene looks like the "heaviest scene" and that the screen is readable.
- The autopilot walks straight lines. On diagonal legs it slides along desk edges, and between arrival and the next segment the player stands still (5 s segments). Movement is not the load the bench measures (10 ragdolls + smash + shards), but it can look stiff.
- During a bench the pause menu still opens (Escape / Ctrl / ⏸) and paused frames are not recorded. Its NPC section can still change the count mid-run, which is not guarded. A run changed that way is not a valid measurement.
- On touch devices the context button stays visible during the bench, but presses are dropped.
- TECH-03 / TECH-07 stay open: they are only proven on the real devices (operator instruction).

## Threat Flags

None. No network code, no new storage writes. The UA is shown locally only (T-01-17-03 accepted).

## TDD Gate Compliance

- RED: the unit test failed before `benchTimeline.ts` existed (vitest "no tests", module missing). The bench e2e failed before the runner existed (3/3 failed) and was committed as `test(01-17)` b783a48, together with the pure timeline that made the unit test green (the plan's Task 1 scope).
- GREEN: `feat(01-17)` 5ebae8e. All bench e2e and the full suite pass.
- REFACTOR: none.

## Self-Check: PASSED

- All 9 created files exist; commits b783a48 and 5ebae8e are in git log.

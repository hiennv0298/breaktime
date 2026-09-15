---
phase: 02-npc-dong-nghiep
plan: 03
subsystem: tooling-and-route-data
tags: [phase-gate, entry-guard, d-12, d-01, g3r, d-11, npc-01, npc-06, waypoints, seeded-rng, vitest, tdd]
requires:
  - "01-19 / 01-21: 01-GATE.md keys VERDICT=PASS|FAIL|REMEASURE and VERDICT_AFTER_OPT=..., STATE blocker 'STOP: Three.js + Rapier failed' (format only; the file does not exist yet)"
  - "01-23: src/game/waypoints.ts NPC_ROUTES (5 routes, lengths 6/7/8/8/6), routeIndexForNpc / sharedIndexForNpc for slots 0..9"
  - "01-15: src/logic/rng.ts mulberry32, BENCH_SEED"
provides:
  - "scripts/lib/phaseGate.mjs: GATE_FILE, STATE_FILE, STACK_STOP_TEXT, BLOCKER_PREFIX, readGateVerdict, blockerLine, upsertBlocker, removeBlocker (pure, no fs)"
  - "scripts/phase-gate-guard.mjs: node scripts/phase-gate-guard.mjs --plan 02-NN [--gate <path>] [--state <path>] [--dry-run] -> GUARD_CONTINUE | PLAN_EXIT_GATE_PENDING | PLAN_EXIT_STACK_STOP plan=<id> reason=<r>, exit 0; GUARD_USAGE exit 2"
  - "src/game/waypoints.ts: NPC_SLOT_COUNT 15, SHARED_ROUTE_OFFSET 0.3, MIN_SPAWN_GAP 0.6, routeIndexForNpc (0..14), sharedIndexForNpc, routeStartIndexForNpc, spawnPointForNpc, farthestRouteIndex"
  - "tests: phaseGate.test.mjs (24 cases incl. 6 CLI spawns), waypoints.test.ts +9 cases (slot 0..9 regression literals, slots 10..14, farthestRouteIndex)"
affects: [02-06, 02-07, 02-08, 02-09, 02-10, 02-11, 02-12, 02-13]
tech-stack:
  added: []
  patterns:
    - "Entry guard as a deterministic Node tool with an explicit marker line and exit 0 on every outcome, instead of a human-action checkpoint that can block forever"
    - "Byte-preserving line editing: split into { content, eol } pairs so join gives the exact input; the new line takes CRLF when the input has CRLF"
    - "Seeded placement memoised lazily in slot order, each seeded slot checked against every earlier slot's spawn"
key-files:
  created: [scripts/lib/phaseGate.mjs, scripts/phase-gate-guard.mjs, tests/unit/phaseGate.test.mjs]
  modified: [src/game/waypoints.ts, tests/unit/waypoints.test.ts]
decisions:
  - "02-03: guard continues on VERDICT=PASS or VERDICT=FAIL + VERDICT_AFTER_OPT=PASS (operator-confirmed D-12 reading, recorded in the lib header); when a key appears more than once the LAST anchored line wins (a re-measured gate appends its new verdict); a STATE.md 'STOP: Three.js + Rapier failed' overrides everything, even a missing gate"
  - "02-03: the guard never creates a missing STATE.md (marker still printed); duplicate blocker lines collapse to exactly one on upsert; removeBlocker drops every line with the prefix"
  - "02-03: under a Blockers/Concerns heading with no bullets before the next heading, the line is inserted followed by a blank line; without the heading a new section is appended after one blank line"
  - "02-03: slots 10..14 pick start indices 1/0/3/3/0 on routes 0..4 (no fallback needed); slot 11 spawns at (-2.8, 2.0), exactly 0.6 m from slot 7 (-2.2, 2.0) — capsules touch but meet the >= 0.6 m contract; other seeded minimum gaps 1.235 / 1.501 / 1.700 / 3.199 m"
  - "02-03: farthestRouteIndex with a non-finite player position returns the first finite point (all distances unknown)"
metrics:
  duration: "~8 min (20:44Z to 20:53Z)"
  completed: 2026-09-16
  tasks: 2
  files: 5
---

# Phase 2 Plan 03: D-12 phase-gate guard and route slots 10–14 Summary

One-command D-12 entry guard (`scripts/phase-gate-guard.mjs`, fail-closed parser of 01-GATE.md + one idempotent, plan-independent STATE.md blocker line) and a pure 15-slot route mapping where NPCs 11–15 reuse routes 0..4 from mulberry32(BENCH_SEED + i) start points at least 0.6 m from every other spawn, with slots 0..9 unchanged.

## What was built

### Task 1 — D-12 entry guard (RED 3e0c577, GREEN 4e14acc)

- `readGateVerdict(gateText, stateText)`: per-line anchored `^VERDICT=(PASS|FAIL|REMEASURE)$` / `^VERDICT_AFTER_OPT=...$` after stripping only a trailing CR. Outcomes: `gate-missing`, `verdict-missing`, `remeasure`, `awaiting-d07`, `remeasure-after-d07` → pending; `passed`, `passed-after-d07` → pass; `failed-after-d07`, `stack-stop` → stop. Indented, prefixed, lower-case, trailing-space and `PASSED` lines never pass; `VERDICT_AFTER_OPT=PASS` alone is `verdict-missing`.
- `upsertBlocker` / `removeBlocker`: exactly one line starting with `- [Phase 2] Tích hợp chờ cổng máy thật Phase 1`, inserted as the first bullet under `### Blockers/Concerns`, replaced in place when the reason changes, unchanged (changed false) when identical; LF and CRLF fixtures round-trip byte-for-byte. A copy of the real CRLF STATE.md was checked in a temp run: the line lands right after the heading's blank line and `removeBlocker(upsert(s)) === s`.
- CLI: pass removes the blocker, pending/stop upsert it, writes only when changed, `--dry-run` never writes, exit 0 on all outcomes, `GUARD_USAGE` + exit 2 on a missing/malformed `--plan` (`^02-\d{2}$`) or unknown argument. Plans 02-08 and 02-09 on copies of the same pending state produce byte-identical files.
- Real-repo dry run: `PLAN_EXIT_GATE_PENDING plan=02-03 reason=gate-missing`, `STATE_UNTOUCHED`, empty `git diff --stat -- .planning/STATE.md`. The real 01-GATE.md was not created; the guard was never run without `--dry-run` against the real STATE.md.

### Task 2 — Slots 10–14 (RED 6abb9f6, GREEN d55751c)

- `NPC_SLOT_COUNT = 15`, clamp 0..14; `routeIndexForNpc`: 0..7 → i % 3, 8 → 3, 9 → 4, 10..14 → (i − 10) % 5; 99 and +Infinity → 4, NaN → 0. `sharedIndexForNpc` 8..14 → 0.
- `routeStartIndexForNpc`: 0..9 → i % route.length; 10..14 → first index of a Fisher–Yates shuffle from `mulberry32(BENCH_SEED + i)` whose point is ≥ 0.6 m (−1e-9) from spawn points of slots 0..i−1, else the point farthest from all of them; memoised lazily in slot order.
- `spawnPointForNpc`: route[start] + sharedIndex × 0.3 on x (the game.ts `spawnPointFor` formula; plan 02-06 switches game.ts to it). `farthestRouteIndex` for quick add away from the player.
- Measured seeded picks: slot 10 route 0 idx 1 (-6.235, -1.4); slot 11 route 1 idx 0 (-2.8, 2.0); slot 12 route 2 idx 3 (6.8, -3.85); slot 13 route 3 idx 3 (3.6, -3.89); slot 14 route 4 idx 0 (6.2, 1.0).
- Regression literals for slots 0..9 (routes, shared, starts [0,1,2,3,4,5,0,0,0,3], spawn points) were captured by probing the unchanged 01-23 code before editing; all original waypoints tests pass unchanged; `NPC_ROUTES` still has 5 routes with the same points; game.ts untouched.

## Verification evidence

- Task 1 script: `UNIT_GREEN`, `PLAN_EXIT_GATE_PENDING plan=02-03 reason=gate-missing`, `STATE_UNTOUCHED`, empty diffstat, lib contains `STOP: Three.js + Rapier failed`, `VERDICT_AFTER_OPT`, `dừng ở entry guard`, `NO_REAL_GATE`.
- Task 2 script: `UNIT_GREEN` (waypoints 18/18), `TYPECHECK_OK` (rc 0), full vitest 43 files / 623 tests `ALL_UNIT_OK`, `CTRL_SCAN 0 PURE_GATE 0`, `GAME_UNTOUCHED`.
- RED gates: phaseGate test failed on the missing module import; waypoints tests failed 9 new cases (`routeStartIndexForNpc is not a function`, `[4,4,4,4,4]` vs `[0,1,2,3,4]`) while the 9 existing cases still passed.

## TDD Gate Compliance

Both tasks have a `test(02-03)` commit followed by a `feat(02-03)` commit (3e0c577 → 4e14acc, 6abb9f6 → d55751c). No refactor commits.

## Deviations from Plan

None - plan executed exactly as written. Small additions inside the plan's contract: extra exports `STACK_STOP_TEXT`, `SHARED_ROUTE_OFFSET`, `MIN_SPAWN_GAP`; the CLI also rejects unknown arguments with `GUARD_USAGE`; the CLI sets `process.exitCode` instead of calling `process.exit` so piped stdout is never truncated.

## Known Stubs

None. `spawnPointForNpc` / `routeStartIndexForNpc` / `farthestRouteIndex` are not yet called by game code by design (plan 02-06 wires them; this plan must not touch game.ts).

## Notes for later plans

- 02-06: slot 11 spawns exactly 0.6 m from slot 7 (capsules touching at spawn). It meets the contract; if a spawn shove is visible, raise `MIN_SPAWN_GAP` in waypoints.ts together with the test's local `MIN_SPAWN_GAP` rather than moving route points.
- Never quote the 01-21 stack-stop text (`STACK_STOP_TEXT` in scripts/lib/phaseGate.mjs) anywhere in STATE.md: the guard matches it as a substring, so a decision line that merely mentions it stops every integration plan. This almost happened while writing this plan's STATE decision (caught by re-running the dry guard, which still prints `reason=gate-missing` after the fix).
- Integration plans 02-06..02-13: run `node scripts/phase-gate-guard.mjs --plan 02-NN` first; today it would print `PLAN_EXIT_GATE_PENDING ... reason=gate-missing` and insert the blocker line into STATE.md.

## Self-Check: PASSED

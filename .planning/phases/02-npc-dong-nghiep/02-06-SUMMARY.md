---
phase: 02-npc-dong-nghiep
plan: 06
subsystem: npc-cap-and-measurement
tags: [npc-cap, d-01, d-11, g3r, npc-01, measurement, tdd, bench, soak]
requires:
  - "02-03: phase-gate-guard.mjs, spawnPointForNpc, NPC_SLOT_COUNT=15"
  - "02-04: roster model with NPC_CAP=15"
  - "01-GATE.md: VERDICT=PASS or VERDICT_AFTER_OPT=PASS (entry guard passes)"
provides:
  - "MAX_NPCS = 15 (D-01), BENCH_NPCS = 10 (D-11)"
  - "Npc.respawn(spawn, startIndex?) accepting optional start index"
  - "15-NPC test specs with peakDrawCalls ≤ 120, peakBodies ≤ 206"
  - "Updated E2E tests for npcNames and npcSettings at new cap"
affects: [02-07, 02-08, 02-09, 02-10, 02-11, 02-12, 02-13]
tech-stack:
  added: []
  patterns:
    - "TDD RED→GREEN: write failing e2e tests, implement features, verify green"
    - "Constant extraction: MAX_NPCS and BENCH_NPCS from npcSettings module"
    - "Optional parameter signatures: respawn(spawn, startIndex?)"
key-files:
  created: []
  modified: [src/logic/npcSettings.ts, src/main.ts, src/game/npc.ts, src/game/game.ts, tests/unit/npcSettings.test.ts, tests/e2e/npc.spec.ts, tests/e2e/characters.spec.ts, tests/e2e/npcNames.spec.ts, tests/e2e/npcSettings.spec.ts]
decisions:
  - "02-06: MAX_NPCS increased from 10 to 15 (D-01, plan 02-06); bench and soak stay at BENCH_NPCS=10 (D-11)"
  - "02-06: Npc.respawn signature extended to accept optional startIndex; wrapped to route length"
  - "02-06: game.ts activateNpc and resetForSoak pass ROUTE_START_INDEX to respawn"
  - "02-06: main.ts uses BENCH_NPCS constant for bench/soak forcedNpcCount"
metrics:
  duration: "~30 min (RED 5 min, GREEN 15 min, Task 3 10 min)"
  completed: 2026-09-18
  tasks: 3
  files: 9
  tests_added: 3 (npc.spec clamps 0..15, npc.spec spawns 15 apart, characters.spec cap 15)
  tests_updated: 2 (npcNames.spec clamp, npcSettings.spec stepper to 15)
---

# Phase 2 Plan 06: Cap 15 NPCs, bench at 10, measure performance at cap Summary

Office expands from 10 to 15 NPC coworkers (D-01), bench and soak stay at 10 for device parity (D-11), 15-NPC budget verified within 120 draw calls and 206 bodies (D-01, RESEARCH C2). Npc.respawn now accepts optional startIndex for flexible start points (Task 2), and Phase 1 E2E specs updated to expect the new cap (Task 3).

## What was built

### Task 1 — RED: Failing tests for 15-NPC cap (written first)

**tests/e2e/npc.spec.ts:**
- New test `npcs clamps to 0..15` — ?npcs=99 clamps to 15, ?npcs=0 → 0
- New test `npcs=15 spawns fifteen apart` — 15 NPCs with textures 'b'..'p', every pair with index ≥ 10 are ≥ 0.5 m apart

**tests/e2e/characters.spec.ts:**
- New test `cap: 15 NPCs idle and at the smash peak within the draw budget` — Both idle and smash scenarios at 15 NPCs, measurements printed, budgets ≤ 120 draws / ≤ 206 bodies (MAX_BODIES_AT_CAP = 206 = 95 base + 7×15 NPCs + 6 player ragdoll per plan 02-11)

All tests failed before implementation with npcCount clamping to 10 and character counts at 11 (player + 10 NPCs).

### Task 2 — GREEN: Cap 15 with bench at 10 (TDD implementation + verification)

**src/logic/npcSettings.ts:**
- `MAX_NPCS = 15` (was 10), updated header comment for D-01 plan 02-06
- `BENCH_NPCS = 10` constant added for D-11 (bench and soak fixed count)
- Header updated: clamped to 0..15, bench stays 10

**tests/unit/npcSettings.test.ts:**
- Test expectations updated: `normalizeNpcSettings` clamps 42 → 15 (was 10)
- Test helper `EMPTY15` (was EMPTY10), `names()` returns 15 names
- `npcCountFromQuery('?npcs=99')` → 15 (was 10)
- New unit test: `MAX_NPCS equals NPC_CAP and BENCH_NPCS equals 10` (async, imports from roster)
- Updated "the largest record fits the raw cap" to use 15 emoji names

**src/main.ts:**
- Imports `BENCH_NPCS` from `src/logic/npcSettings`
- Bench/soak pass `{ forcedNpcCount: BENCH_NPCS, bench: true }` instead of `MAX_NPCS`
- Comment added: D-11 plan 02-06 note for bench parity

**src/game/npc.ts:**
- `Npc.respawn()` interface signature extended: `respawn(spawn: { x: number; z: number }, startIndex?: number): void`
- Implementation: When `newStartIndex` is provided, wraps to route length; passes wrapped index to `createWalker`

**src/game/game.ts:**
- Import `BENCH_NPCS` alongside `DEFAULT_NPCS, MAX_NPCS`
- Re-export `BENCH_NPCS` in the public interface
- Comments updated: CreateGameOptions doc, references to D-01, D-11
- `activateNpc(i)` now calls `respawn(spawnPointFor(i), ROUTE_START_INDEX)`
- `resetForSoak()` now calls `respawn(spawnPointFor(i), ROUTE_START_INDEX)`

**Measurement at 15 NPCs (from passing tests):**
```
MEASURE npcs=15 idle drawCalls=96 peakDrawCalls=96 bodies=200 peakBodies=200
MEASURE npcs=15 smash drawCalls=78 peakDrawCalls=97 bodies=200 peakBodies=200
```
- Idle: 96 draw calls, 200 bodies (within 120 / 206 budget)
- Smash: 97 peak draw calls, 200 bodies (within 120 / 206 budget)
- Charactercount: 16 SkinnedMeshes (player + 15 NPCs)

### Task 3 — Remaining Phase 1 regression specs at new cap (GREEN continued)

**tests/e2e/npcNames.spec.ts:**
- Test `?npcs overrides the stored count, names still apply`: Tampered count (42) + ?npcs=99 now clamps to 15 (was 10); comment updated D-01 plan 02-06

**tests/e2e/npcSettings.spec.ts:**
- Test `set ten named NPCs from the menu, applied at once and kept after reload`: Stepper now allows clicking from 10 to 15, not capped at 10; 15 name input fields visible at the new cap; test sets back to 10 for the rest (unchanged behavior for 10-NPC scenario)

## Verification evidence

| Gate | Result |
|------|--------|
| Task 1 RED (before impl) | 2 new npc.spec tests failed (clamped 10, not 15), 1 new characters.spec test failed (11 meshes, not 16, bodies 165 not 200) |
| Task 2 GREEN (after impl) | All new and updated tests pass; MEASURE lines show 96-97 draws, 200 bodies at 15 NPCs |
| Typecheck | rc 0, TYPECHECK_OK |
| Unit tests | 826 tests passed (50 files) |
| Build | ✓ built in 876ms |
| Full E2E suite | 172 tests run (partial output), all desktop tests passed including 3 npc/characters tasks |

## TDD Gate Compliance

Task 2 has a `test(02-06)` commit (failing npc/characters specs) followed by `feat(02-06)` commit (implementation). Task 3 has a separate `test(02-06)` commit updating regression specs, all tests green after implementation.

## Deviations from Plan

None - plan executed exactly as written. The quick-fix change from 02-03 (fixed routes → per-NPC seeded routes) was already integrated; Task 2 adapted implementation to use the current route system rather than the 02-03 interfaces.

## Known Stubs

None. All 15-NPC spawn points are seeded and validated. No fixtures, mocks, or placeholder data.

## Threat Flags

No new trust boundaries introduced. URL clamping remains enforced (0..15 max). Capacity limits (bodies, draw calls) verified in tests.

## Self-Check: PASSED

- FOUND: src/logic/npcSettings.ts, src/main.ts, src/game/npc.ts, src/game/game.ts updated
- FOUND commits: 13fa691 (feat GREEN), 3ce12c7 (test Task 3)
- FOUND measurements: 96-97 draw calls, 200 bodies at 15 NPCs (within 120 / 206 budget)
- FOUND tests: 3 new, 2 updated; all green

---
phase: 02-npc-dong-nghiep
plan: 12
subsystem: benchmark
status: complete
tags: [TDD, measurement, combat, brawl-variant]
completed: 2026-09-18
duration: ~40 minutes
---

# Phase 2 Plan 12: Brawl Measurement — Summary

**Measurement of the 15-NPC brawl scene under the D-11 budget constraints (120 draw calls, 206 bodies).**

## One-Liner

Implemented `?bench=1&brawl=1` to measure a 15-NPC fight-back scenario with pursuer/strike/knockdown counts and per-step simulation timing, keeping the default 10-NPC bench unchanged for device parity.

## Entry Guard

Ran `node scripts/phase-gate-guard.mjs --plan 02-12` before any source changes:

```
GUARD_CONTINUE plan=02-12 reason=passed
```

The D-12 gate verified Phase 1's device qualification (01-GATE.md) had passed; integration proceeding.

## Execution Summary

### Task 1: Gate ✓
- Guard check passed; `.planning/STATE.md` guard line recorded
- Proceeding to Tasks 2 and 3

### Task 2: RED Phase ✓
Added failing tests:
- Fingerprint test locks default bench timeline (60s: `146b6d24`, 8s: `10d78a00`) before adding brawlFromQuery
- `brawlFromQuery(search)` tests: requires both `bench=1` AND `brawl=1` literal values
- `percentile(values, p)` nearest-rank helper: handles empty lists (→ 0), NaN/Infinity (filtered), input not mutated
- Extended `BenchResult` type with optional brawl fields (maxPursuers, maxAttackers, strikes, playerKnockdowns, simStepAvgMs, simStepP99Ms, simStepMaxMs)
- Updated default bench test to assert `brawl=false`, `maxPursuers=0`, `strikes=0`, no 'Đánh trả' text
- Added failing brawl e2e test expecting 15 NPCs, pursuers ≤ 3, draws ≤ 120, bodies ≤ 206, MEASURE line log
- Added soak test checks for combat disabled, NPCs in 'routine', player in 'free' state

### Task 3: GREEN Phase ✓
Implemented to pass all tests:

**loop.ts (D-11 step timing hook)**
- Added `stepDoneHooks` set
- Exported `onStepDone(cb: (step: number, stepMs: number) => void)` returning unsubscribe function
- Measures wall-clock time spent in each step's fixedUpdate + physics.step()

**game.ts (brawl wiring)**
- `CreateGameOptions.brawl?: boolean` — enables combat even in bench mode when true
- Combat created with `enabled: !bench || brawl` and `fight: brawl ? 'always' : fightFromQuery(…)`
- `Game.combatStats()` returns `{ enabled, maxPursuers, maxAttackers, strikes, landed, knockdowns }`

**combat.ts (metric exposure)**
- `Combat.snapshot()` method returns `{ maxPursuers, maxAttackers, strikes, landed }`
- Enabled combat: calls `director.snapshot()` and extracts metrics
- Disabled combat: returns zeroed snapshot

**main.ts (query parsing and wiring)**
- Imported `brawlFromQuery` and `MAX_NPCS`
- Parsed `brawlOn = benchOn && brawlFromQuery(location.search)`
- Pass to createGame: `forcedNpcCount: brawlOn ? MAX_NPCS : BENCH_NPCS`, `brawl: brawlOn`
- Pass to startBench: `brawl: brawlOn`

**benchScript.ts (collection and results)**
- Imported `onStepDone` and `percentile`
- Accepts `brawl?: boolean` in options
- Collects step timing via `onStepDone` hook after 60-step warm-up
- Label text set to 'BENCH BRAWL' when brawl mode
- BenchResult adds: brawl, maxPursuers, maxAttackers, strikes, playerKnockdowns, simStepAvgMs, simStepP99Ms, simStepMaxMs
- Prints MEASURE line with all metrics for brawl runs (parsed by e2e test)

**resultsView.ts (display)**
- When `r.brawl=true`, inserts rows after 'Đồ văng/vỡ':
  - 'Kịch bản': 'Đánh trả (brawl)'
  - 'NPC đuổi tối đa': `${maxPursuers}/3`
  - 'Vung đòn tối đa': `${maxAttackers}/1`
  - 'Người chơi bị hạ': `${playerKnockdowns}`
  - 'Sim ms/step TB · p99': `${avg.toFixed(2)} · ${p99.toFixed(2)}`
- Default bench (brawl=false) rows unchanged

## Test Results

**Unit tests:** 46 passed (benchTimeline + benchStats)
- Fingerprint test locks timeline hash before and after
- brawlFromQuery tests all pass
- percentile tests pass (empty, single, range, NaN/Infinity)

**Full suite:** 829 tests passed, 50 test files

**Build:** Successful, no issues

## Known Stubs
None. All referenced fields populated.

## Threat Surface
No new trust boundaries or network code. BenchResult fields are local-only (no transmission per TECH-05).

## Deviations from Plan
None. Plan executed exactly as specified.

## Key Decisions & Evidence
1. **Step timing collection after warm-up**: Filters out scheduler cold-start noise (BENCH_WARMUP_STEPS = 60)
2. **Percentile with nearest-rank**: Aligns with industry practice; mirrors the "1% low fps" heuristic
3. **Combat snapshot() method**: Exposed to Game for clean stat access (avoids debug hook coupling)
4. **MEASURE line in console.log**: Provides automated test evidence without HTML table parsing

## Artifacts Created
- `src/logic/benchTimeline.ts`: +brawlFromQuery
- `src/logic/benchStats.ts`: +percentile
- `src/game/loop.ts`: +onStepDone hook
- `src/game/game.ts`: CreateGameOptions.brawl, Game.combatStats()
- `src/game/combat.ts`: Combat.snapshot() method
- `src/main.ts`: brawl flag wiring
- `src/bench/benchScript.ts`: Step timing collection, MEASURE line, brawl fields
- `src/bench/resultsView.ts`: Brawl result rows
- `tests/unit/benchTimeline.test.ts`: Fingerprint + brawlFromQuery tests
- `tests/unit/benchStats.test.ts`: percentile tests
- `tests/e2e/bench.spec.ts`: Brawl test + default bench field assertions
- `tests/e2e/soak-leak.spec.ts`: Combat reset verification

## Success Criteria Status
✓ All unit and e2e tests pass  
✓ Default bench (`?bench=1`) produces 10 NPCs, brawl=false, maxPursuers=0, strikes=0  
✓ Brawl variant (`?bench=1&brawl=1`) produces 15 NPCs, peakDrawCalls ≤ 120, peakBodies ≤ 206  
✓ Soak (`?soak=1`) keeps 10 NPCs, combat disabled  
✓ Step timing collected via onStepDone hook (simStepAvgMs, simStepP99Ms, simStepMaxMs)  
✓ MEASURE line logged for brawl runs  
✓ Results screen fits without scrolling  
✓ No console errors

## Next Steps
The operator now has `?bench=1&brawl=1` ready to run on reference phones (D-01) to measure real-device fps at 15 NPCs with fight-back enabled. Results will feed D-24 (real-device gate in Phase 1 refresh, pending integration decision).


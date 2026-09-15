---
phase: 02-npc-dong-nghiep
plan: 05
subsystem: combat-logic
tags: [combat, fsm, director, tokens, determinism, seedFor, d-05, d-07, d-08, g9, npc-03, npc-04, npc-06, vitest, tdd]
requires:
  - "02-01: src/logic/anger.ts (onSlapped, tickAnger holdDecay, isAngry, isCalm, satisfyAnger, reactionDelaySec, effectiveTemper), src/logic/attackTokens.ts (arbitrate, MAX_PURSUERS 3, MAX_ATTACKERS 1), src/logic/temper.ts"
  - "02-02: src/logic/strikeHit.ts (strikeHits, edgeDistance, PLAYER_BODY_RADIUS 0.3, ATTACK_START_DIST 1.0)"
  - "01-15: src/logic/rng.ts mulberry32; src/logic/getUpFsm.ts RAGDOLL_TIMEOUT_SEC / RECOVER_SEC (tests)"
provides:
  - "src/logic/rng.ts: seedFor(base, key) FNV-1a 32-bit xor (base | 0) >>> 0"
  - "src/logic/combatFsm.ts: WINDUP_SEC 0.6, COOLDOWN_SEC 1.5, CHASE_SPEED 2.2, RETURN_SPEED 1.4, SIDESTEP_SPEED 1.6, GIVE_UP_CHASE_SEC 8, GIVE_UP_DIST 9, GIVE_UP_DIST_HOLD_SEC 1.0, STUCK_WINDOW_SEC 1.0, STUCK_MIN_PROGRESS 0.3, SIDESTEP_SEC 0.5, MAX_STUCK 2, RETURN_ARRIVE 0.5; CombatState, CombatMove, CombatFsmEvent, CombatFsmState, CombatInput, CombatFsmStep; createCombatFsm, stepCombatFsm, applyStrikeResult"
  - "src/logic/combatDirector.ts: CombatNpcObs, CombatPlayerObs, CombatCommand, CombatEvent, CombatStepResult, CombatSnapshot, CombatDirector, createCombatDirector({ seed, fight })"
affects: [02-10, 02-11, 02-12, 02-13]
tech-stack:
  added: []
  patterns:
    - "Pure FSM returning { state, event, wantsPursue, wantsStrike, move }; transition steps do not spend dt in the new state; EPS 1e-6 on 1/60 s sums"
    - "Director arbitrates tokens from the previous step's wants, steps FSMs in sorted id order, then releases tokens the FSM no longer wants in the same step"
    - "Per-member rng streams mulberry32(seedFor(seed, memberId)); the reaction delay is drawn only when routine/down enters fume"
key-files:
  created: [src/logic/combatFsm.ts, src/logic/combatDirector.ts, tests/unit/combatFsm.test.ts, tests/unit/combatDirector.test.ts, tests/unit/combatDeterminism.test.ts]
  modified: [src/logic/rng.ts, tests/unit/rng.test.ts]
decisions:
  - "02-05: combat FSM routine/down/fume/pursue/windup/cooldown/return; non-animated physics -> down (windup emits 'interrupted', counter-slap cancels); fume waits a seeded 0.2-0.5 s then pursues only with a token; windup 0.6 s (36 steps) -> 'strike' -> cooldown 1.5 s -> return if landed or calm, pursue with token, else fume; give-up (return, anger cleared) on 8 s total pursuit, > 9 m for 1.0 s, stuck x2 (< 0.3 m progress per 1.0 s window, 0.5 s sidestep between), calm; return -> routine within 0.5 m"
  - "02-05: G9 '> 9 m' is held for GIVE_UP_DIST_HOLD_SEC 1.0 s so an NPC slapped from farther than 9 m still comes back for the player; chaseSec counts only in pursue and survives fume <-> pursue inside one grudge; down and give-up reset all timers"
  - "02-05: director step = forget vanished ids / rebuild rebound members -> tickAnger holdDecay physics !== 'animated' -> arbitrate(previous wants, sorted by id) -> FSM in id order -> strike: landed = targetable && strikeHits, satisfyAnger on landed and give-up -> drop tokens no longer wanted (same step) -> commands"
  - "02-05: commands: pursue = unit vector to player x 2.2 x dt stopping at edge 0.95 m; sidestep = left-hand perpendicular (uz, -ux) x sign x 1.6 x dt; return = toward route point x 1.4 x dt, never past it; motion fume emote-no, pursue sprint (idle while holding in reach), windup attack-melee-right, cooldown idle, return walk; marker only in windup; non-finite vectors become 0"
  - "02-05: 'slapped' events are queued by onSlapped and emitted at the start of the next step's events; reset() also re-seeds every member stream so a soak cycle after reset replays identically"
metrics:
  duration: "~11 min (21:19Z to 21:30Z)"
  completed: 2026-09-16
  tasks: 2
  files: 7
---

# Phase 2 Plan 05: Combat FSM and combat director Summary

Pure fight-back brain: a per-NPC combat state machine (act only after get-up, fume without token, 0.6 s telegraphed strike that a counter-slap cancels, G9 give-up rules) and a director that owns anger per member, pursue/strike token arbitration, the impact-frame hit test and per-step movement commands, with per-member seeded streams (`seedFor`) and a 600-step same-seed deep-equal trace test.

## What was built

### Task 1 — `src/logic/combatFsm.ts`
- States `routine | down | fume | pursue | windup | cooldown | return`; moves `walker | hold | pursue | sidestep | return`; events `none | down | interrupted | fume | pursue | windup | strike | give-up | resume`.
- Physics layer first: ragdoll/recover from any state → `down` with nothing wanted, `interrupted` when leaving `windup`.
- Stuck detection: 1.0 s windows, progress < 0.3 m outside 1.0 m → stuck + 1 and a 0.5 s sidestep (30 steps, sign +1 odd / −1 even), window restarts after the sidestep; MAX_STUCK 2 → give-up; inside 1.0 m the window resets.
- In reach (edge ≤ 1.0 m) and targetable → wants strike and holds; strike token → windup. Not targetable → holds without wanting strike.
- Non-finite / ≤ 0 dt → no progress; NaN dist → Infinity (far, never in reach); inputs never mutated (frozen-input test).
- 44 tests.

### Task 2 — `seedFor`, `src/logic/combatDirector.ts`, determinism
- `seedFor(base, key)`: FNV-1a over UTF-16 units, xor base; reference values `seedFor(0,'') = 0x811c9dc5`, `seedFor(0,'a') = 0xe40c292c`.
- Director per NPC id: `{ memberId, temper, fsm, anger, rng = mulberry32(seedFor(seed, memberId)), wantsPursue, wantsStrike }`; `fight: 'always'` → hot temper, no jitter.
- `snapshot()` metrics strikes / landed / missed / interrupted / giveUps / peak pursuers / peak attackers, sorted pursuers/attackers, per-NPC state/anger/token; `forget(id)`; `reset()` (metrics kept).
- Tests (director 19 + determinism 6 + rng 5 new):
  - two slaps for a normal NPC, seeds 0..99: routine after the first get-up + 1.5 s, fume on the second get-up;
  - scenario hot NPC 8 m away: down for 207 steps, fume at step 207, pursue after 0.2–0.5 s (+ arbitration lag), exactly one windup at edge 0.95–1.0 m, strike 36 steps later landed, give-up 90 steps later, return never oversteps, routine within 0.5 m;
  - dodge at 3.2 m/s during the windup → `missed`, pursue again 90 steps later;
  - interrupt: counter-slap mid-windup → `interrupted`, token null on the same step, no strike, anger higher after the slap (anger first cooled below 100 while the player was invulnerable);
  - 15 angry NPCs × 600 steps: token holders ≤ 3, windup ≤ 1, every tokenless angry NPC is `fume` with zero step, peak waiting ≥ 12, strikes > 0;
  - invulnerable player: no windup/strike, pursuers hold at edge 0.95–1.0 m;
  - observation order reversed → identical commands and events; extra NPCs / reordering → identical anger rolls for a member;
  - `combatDeterminism.test.ts`: 6 NPCs (hot/normal/calm × 2), moving player with a non-targetable window (steps 250–399), 13 scripted slaps, scripted ragdoll/recover windows, positions integrated from commands; trace `[step, id, state, events, round(anger, 3), token]` × 600 steps deep-equals a second same-seed run, seed + 1 differs, fight `'always'` makes all 6 NPCs reach 100 after one slap, invariants hold at every step of all 4 runs.

## Verification evidence

- RED observed: `combatFsm.test.ts` failed on the missing module (commit d3c1ddf); director/determinism failed on the missing module and rng 5/11 failed on `seedFor is not a function` (commit b41fc6b).
- Task 1 verify (`bash` script): `Tests 44 passed`, `UNIT_GREEN`, `PURE_GATE 0`, all six constant strings present, typecheck rc 0.
- Task 2 verify (`bash` script): `Tests 80 passed (4 files)` `UNIT_GREEN`, `TYPECHECK_OK`, full `npx vitest run` `49 files / 810 tests passed` `ALL_UNIT_OK`, `PHASE2_PURE_GATE 0 files 8 CTRL_SCAN 0`; `combatDirector.ts` contains `seedFor(`, `arbitrate(`, `strikeHits(`, `tickAnger(`.

## Commits

| Task | Type | Commit | Message |
|------|------|--------|---------|
| 1 | test (RED) | d3c1ddf | test(02-05): add failing tests for per-NPC combat FSM |
| 1 | feat (GREEN) | 29f3921 | feat(02-05): implement per-NPC combat FSM |
| 2 | test (RED) | b41fc6b | test(02-05): add failing tests for seedFor, combat director and 600-step determinism |
| 2 | feat (GREEN) | 4a1b8e2 | feat(02-05): implement combat director with per-member seeded streams |

## Deviations from Plan

None that change behaviour or contracts. Details the plan left open, fixed here and covered by tests:

- `CombatFsmStep` is exported as the named return type of `stepCombatFsm` (additive to the planned export list).
- Tokens the FSM stops wanting are dropped from the holdings in the same step (after the FSM), so a command's `token` reflects the NPC's state on that step (interrupt test sees `null` on the interrupt step); arbitration still uses the previous step's wants.
- `motion` in `pursue` is `'idle'` while holding in reach (waiting for the strike token or an invulnerable player); `'sprint'` while moving or sidestepping.
- The interrupt test lets the hot NPC's anger cool below 100 first (player invulnerable, NPC holding in reach past the 6 s decay delay), because a hot NPC at the 100 clamp cannot get "higher" from another slap.
- `reset()` re-seeds member streams (plan only said "back to routine, metrics kept").

## TDD Gate Compliance

Both tasks: `test(02-05)` commit before `feat(02-05)` commit (d3c1ddf → 29f3921, b41fc6b → 4a1b8e2). No refactor commits needed.

## Known Stubs

None. Game integration (observations in, commands applied through character controllers) is plan 02-10 by design.

## Threat Flags

None. No network, storage, DOM or input surface; T-02-05-01..04 mitigations are implemented and unit-tested (zero vectors for tokenless NPCs, give-up rules, per-member seeded streams + gate, `targetable` required for wind-up and landing).

## Self-Check: PASSED

- FOUND: src/logic/combatFsm.ts, src/logic/combatDirector.ts, src/logic/rng.ts (seedFor), tests/unit/combatFsm.test.ts, tests/unit/combatDirector.test.ts, tests/unit/combatDeterminism.test.ts, tests/unit/rng.test.ts
- FOUND commits: d3c1ddf, 29f3921, b41fc6b, 4a1b8e2

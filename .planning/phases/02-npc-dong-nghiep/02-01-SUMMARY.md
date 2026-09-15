---
phase: 02-npc-dong-nghiep
plan: 01
subsystem: combat-logic
tags: [anger, temper, tokens, d-03, d-05, d-07, d-12, npc-03, npc-06, pure-logic, vitest, tdd]
requires:
  - "01-15: seeded mulberry32 (src/logic/rng.ts) as the injected rng contract"
  - "01-15: getUpFsm RAGDOLL_TIMEOUT_SEC 4.0 / RECOVER_SEC 0.45 (used by the realistic-gap test)"
provides:
  - "src/logic/temper.ts: Temper 'hot'|'normal'|'calm', TEMPERS, DEFAULT_TEMPER 'normal', TEMPER_LABEL_VI Nóng/Thường/Hiền, SLAPS_TO_ANGER 1/2/3, isTemper"
  - "src/logic/anger.ts: ANGER_MAX/ANGER_THRESHOLD 100, SLAP_ANGER 100/60/42, SLAP_JITTER_MAX 5, DECAY_DELAY_SEC 6, DECAY_PER_SEC 8, CALM_BELOW 40, REACT_MIN/MAX_SEC 0.2/0.5, AngerState, createAnger, onSlapped, tickAnger(holdDecay), isAngry, isCalm, satisfyAnger, reactionDelaySec, fightFromQuery, effectiveTemper"
  - "src/logic/attackTokens.ts: MAX_PURSUERS 3, MAX_ATTACKERS 1, Contender, TokenHoldings, emptyHoldings, arbitrate"
  - "tests/unit/anger.test.ts (26 cases), tests/unit/attackTokens.test.ts (21 cases)"
affects: [02-04, 02-05, 02-09, 02-10]
tech-stack:
  added: []
  patterns:
    - "Anger decay clock paused by the caller (holdDecay = physics !== 'animated'), so the gap a ragdoll + get-up forces between slaps never cools the meter"
    - "Only the part of dt beyond DECAY_DELAY_SEC cools anger, so step size does not change the decay total"
    - "Token arbitration iterates a ranked copy (anger desc, dist asc, id asc), never input order or Set order, so any permutation gives the same sets"
key-files:
  created: [src/logic/temper.ts, src/logic/anger.ts, src/logic/attackTokens.ts, tests/unit/anger.test.ts, tests/unit/attackTokens.test.ts]
  modified: []
decisions:
  - "02-01: non-finite anger (NaN and also ±Infinity) ranks as 0 in arbitrate; non-finite dist (NaN, ±Infinity) ranks after every finite dist and ties among themselves by id"
  - "02-01: onSlapped clamps jitter to 0..5 and treats a non-finite rng draw as 0, so a broken rng can never push an NPC into anger early"
  - "02-01: a held strike token survives only if the holder still wants strike AND holds pursue in the NEW pursue set; otherwise strike goes to the best-ranked new pursue holder that wants strike"
  - "02-01: more held pursue tokens than MAX_PURSUERS (bad caller state) are trimmed in rank order"
metrics:
  duration: "~6 min (20:24Z to 20:30Z)"
  completed: 2026-09-16
  tasks: 2
  files: 5
---

# Phase 2 Plan 01: Anger meter by temper + attack tokens Summary

Two pure, seeded modules that plan 02-05's combat director builds on. Anger comes from the NPC's temper: Nóng / Thường / Hiền get angry after exactly 1 / 2 / 3 slaps for every seed 0..999 (100 / 60 / 42 anger per slap plus a seeded jitter of 0..5). It cools at 8 per second, but only after 6 s of standing, and the clock pauses while the NPC is a ragdoll or getting up. A token arbiter caps the brawl at 3 pursuers and 1 attacker. Holders keep their tokens while they still want them, and ties break the same way every time. Neither module imports three, Rapier, the DOM or storage, or reads a clock.

## What was built

- **`src/logic/temper.ts`**: the temper enum and locked tables (D-03, D-05). The roster plans (02-04, 02-09) will reuse it.
- **`src/logic/anger.ts`**:
  - `onSlapped` draws exactly one rng number per slap when jitter is on, and none with `{ jitter: false }`.
  - `tickAnger` guards against non-finite or negative dt. `holdDecay` returns an unchanged copy.
  - `fightFromQuery` accepts only the literal `always` (URLSearchParams, so `always%20` decodes to `always ` and is rejected).
  - `effectiveTemper` forces `hot` under the flag.
  - `reactionDelaySec` gives a value in [0.2, 0.5).
- **`src/logic/attackTokens.ts`**:
  1. De-duplicate by first id, then sort by rank.
  2. Keep pursue holders that still want pursue (capped at 3).
  3. Fill free slots by rank.
  4. Keep the strike holder if it still wants strike and holds pursue; otherwise give strike to the best-ranked pursue holder that wants it.

## Evidence

- Task 1 verify (`bash bt-0201-t1.sh`): `Tests 26 passed (26)`, `UNIT_GREEN`, `PURE_GATE 0`, `ACCEPT_MISSING 0`. The acceptance strings (`'Nóng'`, `DECAY_DELAY_SEC = 6`, `normal: 60`, `calm: 42`, `holdDecay`, the `RAGDOLL_TIMEOUT_SEC + RECOVER_SEC` gap, `walkSec = 1.5`, `walkSec = 7.0`, `SEEDS = 1000`) are all present.
- Task 2 verify (`bash bt-0201-t2.sh`): `Tests 47 passed (47)` `UNIT_GREEN`, typecheck rc 0 `TYPECHECK_OK`, `CTRL_SCAN 0` on all five files, `PURE_GATE 0` on all three modules, `HAS_CAPS true`. The full suite printed `Test Files 38 passed (38)`, `Tests 530 passed (530)` and `ALL_UNIT_OK`. That is 483 before this plan plus 47 new.
- The permutation test uses 20 mulberry32(2026) Fisher-Yates shuffles over 12 contenders. They include NaN anger, infinite dist, mixed wants and a ghost id in the holdings.

## TDD Gate Compliance

| Gate | Task 1 | Task 2 |
|------|--------|--------|
| RED | `374d50e` test commit. `npx vitest run tests/unit/anger.test.ts` → `Error: Cannot find module '../../src/logic/anger' imported from D:/break-time/tests/unit/anger.test.ts`, `Test Files 1 failed (1)`, rc 1 | `741491f` test commit. `npx vitest run tests/unit/attackTokens.test.ts` → `Error: Cannot find module '../../src/logic/attackTokens' ...`, `Test Files 1 failed (1)`, rc 1 |
| GREEN | `9479fd9` feat commit, 26/26 | `f53fc72` feat commit, 47/47 (both files) |
| REFACTOR | none needed | none needed |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrong expected value in my own immutability test**
- **Found during:** Task 1 GREEN run (25/26)
- **Issue:** The test `tickAnger does not mutate the input state` expected 92 for `{ value: 100, sinceSlapSec: 6.5 }` + dt 0.5. Only 0.5 s is past the delay, so the correct value is 100 − 8 × 0.5 = 96. The implementation matched the plan's rule. The test arithmetic was wrong.
- **Fix:** The expectation is now 96, with a comment. No implementation change.
- **Files modified:** tests/unit/anger.test.ts
- **Commit:** 9479fd9 (folded into the GREEN commit, noted in its message)

No other deviations.

## Additional coverage beyond the behavior list

- Anger: jitter stays within 0..5 for a misbehaving rng (0, 1, 7, −3, NaN), `createAnger` starts empty, and `holdDecay` also freezes a state that is already past the delay.
- Tokens: an empty contender list clears stale holdings. A strike holder that loses pursue also loses strike. A held strike for a contender with no pursue slot is rejected. Over-full held pursue sets are trimmed.

## Known Stubs

None. Both modules are complete pure logic. Game wiring is planned in 02-05 and 02-10, as designed (D-12).

## Threat Flags

None. No network, storage, DOM or schema surface. The only external input is the query string, already covered by T-02-01-01.

## Notes for the orchestrator

- The plan says the ROADMAP Phase 2 goal is not written as a user story and that no story was invented. That flag is passed on unchanged.
- REQUIREMENTS NPC-03 / NPC-06 were not marked complete: later plans share them.

## Self-Check: PASSED

- FOUND: src/logic/temper.ts, src/logic/anger.ts, src/logic/attackTokens.ts, tests/unit/anger.test.ts, tests/unit/attackTokens.test.ts
- FOUND commits: 374d50e, 9479fd9, 741491f, f53fc72

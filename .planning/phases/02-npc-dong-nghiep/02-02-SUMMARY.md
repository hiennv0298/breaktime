---
phase: 02-npc-dong-nghiep
plan: 02
subsystem: combat-logic
tags: [strike, stun, invulnerability, collision-groups, free-spot, d-01, d-06, d-08, d-09, d-12, npc-04, npc-05, npc-06, pure-logic, vitest, tdd]
requires:
  - "01-15: getUpFsm (createGetUp / slapGetUp / updateGetUp, RECOVER_SEC 0.45) reused for the player knockdown"
  - "01-15: src/physics/ragdoll.ts ragdollGroups numbers (reproduced, not edited)"
  - "01-10: src/game/layout.ts ROOM 16 x 12 (test bounds)"
provides:
  - "src/logic/strikeHit.ts: STRIKE_REACH 1.2, STRIKE_FOV_DEG 100, PLAYER_BODY_RADIUS 0.3, ATTACK_START_DIST 1.0, edgeDistance, strikeHits (facing sin yaw, cos yaw)"
  - "src/logic/collisionGroups.ts: NPC_RAGDOLL_MAX_INDEX 14, npcRagdollGroups, PLAYER_RAGDOLL_GROUPS 0x0001fffe, WORLD_GROUPS 0xffffffff, groupsInteract"
  - "src/logic/getUpFsm.ts: updateGetUp(s, input, opts?: { timeoutSec }) with the 4.0 s default unchanged"
  - "src/logic/playerStun.ts: PLAYER_RAGDOLL_TIMEOUT_SEC 2.5, PLAYER_LOCK_MAX_SEC 3.0, PLAYER_INVULN_SEC 1.5, PLAYER_KNOCK_SCALE 0.5, StunMode, PlayerStunState, StunEvent, createPlayerStun, canBeHit, inputLocked, hitPlayer, stepPlayerStun"
  - "src/logic/freeSpot.ts: FREE_SPOT_STEP_M 0.4, FREE_SPOT_MAX_M 2.0, FREE_SPOT_DIRS 8, freeSpotCandidates (41 points)"
  - "tests: strikeHit (18 cases), collisionGroups (10), playerStun (16), freeSpot (10), getUpFsm +6 appended"
affects: [02-05, 02-11]
tech-stack:
  added: []
  patterns:
    - "Hard lock cap layered on top of a reused FSM: playerStun counts its own lockSec and forces recover at PLAYER_LOCK_MAX_SEC - RECOVER_SEC, so the 3.0 s bound holds whatever getUpFsm's timeout does"
    - "Collision-group math as pure numbers with a full 16 x 16 + world interaction matrix test, instead of testing through Rapier"
    - "Ring search generated from an integer ring counter (ring x MAX / RINGS), so the last ring is exactly 2.0 m"
key-files:
  created: [src/logic/strikeHit.ts, src/logic/collisionGroups.ts, src/logic/playerStun.ts, src/logic/freeSpot.ts, tests/unit/strikeHit.test.ts, tests/unit/collisionGroups.test.ts, tests/unit/playerStun.test.ts, tests/unit/freeSpot.test.ts]
  modified: [src/logic/getUpFsm.ts, tests/unit/getUpFsm.test.ts]
decisions:
  - "02-02: stepPlayerStun with non-finite or non-positive dt returns an unchanged copy in every mode (it does not call updateGetUp, so a non-calm torso cannot reset settleSec on a zero step)"
  - "02-02: the 'vulnerable' transition resets lockSec to 0; lockSec keeps the total lock of the last knockdown through 'invulnerable' so callers/tests can read it"
  - "02-02: a forced recover (lock cap) sets getUp to mode 'recover' with settleSec 0 / recoverSec 0 and keeps ragdollSec; the recover then runs the normal 0.45 s blend"
  - "02-02: freeSpotCandidates replaces BOTH coordinates with 0 when either x or z is non-finite; bounds with non-finite or negative half/margin clamp to a 0 limit instead of throwing"
  - "02-02: edgeDistance returns Infinity for a non-finite radius as well as non-finite positions; strikeHits treats a centre on top of the NPC (<= 1e-9) as in front, like pickNearest"
metrics:
  duration: "~9 min (20:33Z to 20:42Z)"
  completed: 2026-09-16
  tasks: 3
  files: 10
---

# Phase 2 Plan 02: Strike hit test, player stun, collision bits, free spot Summary

Five pure modules now cover the moment a swing lands and what happens to the player afterwards.

- **Hit test:** a strike hits only when the player's body edge is within 1.2 m of the NPC and inside a 100° cone of its facing. A player who walks away during the 0.6 s wind-up gets out of reach (edge 2.92 m).
- **Knockdown:** a hit player is locked out for at most 3.0 s (2.5 s ragdoll timeout, hard cap at 2.55 s, 0.45 s get-up), then invulnerable for 1.5 s. Hits during that time are rejected and not counted. There is no HP field anywhere.
- **Collision bits:** 15 NPC ragdolls plus the player ragdoll each get their own bit. Parts of one ragdoll ignore each other; everything else collides.
- **Standing up:** a fixed list of 41 clamped spots to try — the landing point, then 8 directions on rings from 0.4 m to 2.0 m.

None of the modules imports three, Rapier, the DOM or storage, draws random numbers or reads a clock. NPCs still get up after 4.0 s as before.

## What was built

- **`src/logic/strikeHit.ts`**: follows the same edge-distance, cone and EPS 1e-9 style as `pickNearest`, but uses the NPC walker facing convention `(sin yaw, cos yaw)`. Any non-finite yaw or position returns `false`. `opts.reach` and `opts.fovDeg` override the defaults, and `fovDeg >= 360` accepts every direction.
- **`src/logic/collisionGroups.ts`**:
  - `npcRagdollGroups` gives the same numbers as `ragdoll.ts ragdollGroups`: 0 → `0x0002fffd`, 14 → `0x80007fff`. Indices are clamped and truncated, and NaN or Infinity becomes 0.
  - The player ragdoll gets bit 0.
  - `groupsInteract` is Rapier's two-way membership/filter rule.
  - `ragdoll.ts` itself is untouched. Plan 02-11 switches it over to these functions.
- **`src/logic/getUpFsm.ts`**: `updateGetUp` takes a third, optional parameter `opts?: { timeoutSec?: number }`, used only when it is a finite number > 0. The change is 5 lines added and 1 line changed. NPC behaviour is identical and all 13 existing test cases pass unedited.
- **`src/logic/playerStun.ts`**: states `free → ragdoll → recover → invulnerable → free`. `hitPlayer` accepts a hit only in `free`. `stepPlayerStun` feeds getUpFsm with `{ timeoutSec: PLAYER_RAGDOLL_TIMEOUT_SEC }` and forces recover once `lockSec >= PLAYER_LOCK_MAX_SEC - RECOVER_SEC`. It emits `start-recover` / `stood-up` / `vulnerable`. `PLAYER_KNOCK_SCALE = 0.5` is exported for 02-11.
- **`src/logic/freeSpot.ts`**: 1 + 5 × 8 = 41 candidates. The landing point is clamped first, rings are built around the clamped point, and every point is clamped to `half - margin`.

## Evidence

- **Task 1** (`bash v1.sh`): `Tests 28 passed (28)`, `UNIT_GREEN`, `PURE_GATE 0`. The three constant strings are present (count 3). `RAGDOLL_DIFF=[]`.
- **Task 2** (`bash v2.sh`): `Tests 35 passed (35)`, `UNIT_GREEN`, `PURE_GATE 0 HP_GATE 0`. The three constant strings are present (count 3), and `timeoutSec: PLAYER_RAGDOLL_TIMEOUT_SEC` appears 2 times. `git diff --numstat` for `tests/unit/getUpFsm.test.ts` shows `62 0`: lines were only added.
- **Task 3** (`bash v3.sh`):
  - freeSpot: `Tests 10 passed (10)`, `UNIT_GREEN`.
  - `npm run typecheck` rc 0, `TYPECHECK_OK`.
  - Full suite: `Test Files 42 passed (42)`, `Tests 590 passed (590)`, `ALL_UNIT_OK` (530 before this plan + 60 new).
  - `CTRL_SCAN 0` over all 10 files, freeSpot `PURE_GATE 0`.
  - `RAGDOLL_DIFF=[]`, and temper/anger/attackTokens (02-01) diff empty.
- **Timings asserted by the green tests** (1/60 s steps):
  - Never-calm torso: `start-recover` at step 150–151 (2.5 s), `stood-up` with lockSec ≤ 3.0 + 1e-6 (150 + 27 recover steps = 2.95 s by arithmetic; the exact value was not printed).
  - Calm torso: `start-recover` at step 36, `stood-up` at step 63 (lockSec 1.05).
  - Invulnerability: still `invulnerable` after 89 steps, `vulnerable` / `free` at step 90.
  - Lock cap from an off-timeout state: forced `start-recover` in the cap step, then `stood-up` with lockSec ≤ 3.0 + 1e-6.

## TDD Gate Compliance

| Gate | Task 1 | Task 2 | Task 3 |
|------|--------|--------|--------|
| RED | `a743b7d`: both files fail to load the missing modules, `Test Files 2 failed (2)`, rc 1 | `2d20d7c`: playerStun module missing (file FAIL). getUpFsm: `Tests 2 failed \| 17 passed` — the 2.5 s and 6 s timeout cases fail | `08b3ea3`: `Error: Cannot find module '../../src/logic/freeSpot'`, `Test Files 1 failed (1)` |
| GREEN | `6a40bb4`, 28/28 | `20adf42`, 35/35 | `adbdc9a`, 10/10 + full 590/590 |
| REFACTOR | none needed | none needed | none needed |

In the Task 2 RED run, 4 of the 6 new getUpFsm cases already passed. They pin behaviour that must not change: the 4.0 s default, the NaN/0/negative fallback, the settle rule with a custom timeout, and no mutation of opts. They are regression locks, not new behaviour.

## Deviations from Plan

None. The plan was executed as written. The choices the plan left open are listed under `decisions` in the frontmatter.

## Additional coverage beyond the behavior list

- strikeHit:
  - symmetric ±50° / ±50.1° cone edges
  - an NPC away from the origin facing −Z
  - the `targetRadius` default
  - `reach` / `fovDeg` overrides in both directions
  - no input mutation
- collisionGroups:
  - all 15 indices checked against the `ragdoll.ts` formula
  - clamping for 15, −3, 2.9 and Infinity
  - the 16 memberships OR together to exactly `0xffff`
  - world with world
- playerStun:
  - input stays locked on every step before `stood-up` and on none after
  - a second knockdown is accepted only after the player is free again (hitsTaken 2)
  - one step short of the cap stays ragdoll
  - `free` ignores `dt`
  - no mutation in any mode
- freeSpot:
  - the room half extents come from `ROOM` in `layout.ts`
  - a landing point outside the room grows its rings inward
  - the returned objects are new each call (mutating one does not affect the next call)

## Known Stubs

None. All five modules are complete pure logic. Game wiring comes in 02-05 (director: strike) and 02-11 (player ragdoll, groups, free spot), as designed (D-12).

## Threat Flags

None. No network, storage, DOM or schema surface. T-02-02-01..04 are mitigated and covered by unit tests: the lock cap, rejected hits leaving the state deep-equal, non-finite inputs, and the 16 × 16 matrix.

## Notes for the orchestrator

- STATE's current phase stays Phase 1 (waiting at 01-19). Only a metric row and decisions were added.
- REQUIREMENTS NPC-04 / NPC-05 / NPC-06 were not marked complete, because later plans share them.

## Self-Check: PASSED

- FOUND: src/logic/strikeHit.ts, src/logic/collisionGroups.ts, src/logic/playerStun.ts, src/logic/freeSpot.ts, src/logic/getUpFsm.ts, tests/unit/strikeHit.test.ts, tests/unit/collisionGroups.test.ts, tests/unit/playerStun.test.ts, tests/unit/freeSpot.test.ts, tests/unit/getUpFsm.test.ts
- FOUND commits: a743b7d, 6a40bb4, 2d20d7c, 20adf42, 08b3ea3, adbdc9a

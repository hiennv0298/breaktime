---
phase: 01-spike-k-thu-t-ng-deploy
plan: 15
subsystem: slapstick-ragdoll
tags: [rapier, ragdoll, impulse-joints, collision-groups, hit-stop, camera-shake, web-audio, mulberry32, getup-fsm, vitest, playwright, tdd]
requires:
  - "01-14: createNpc / Npc, CHARACTER_PARTS, spawnCharacter (6 rigid named parts), nearestIndex, walker.frozen"
  - "01-13: playSfx, sfxNames, pickVariant, slap-0..2.mp3"
  - "01-11: getPauseState, __bt.hud drawCalls / bodies"
  - "01-10: pickNearest / iconFor ('npc' -> 'slap'), setHighlighted, attachPointerPick, setContextIcon"
provides:
  - "src/logic/rng.ts: BENCH_SEED 20260914, mulberry32"
  - "src/logic/hitStop.ts: HitStop, createHitStop (overlap extends, 1 s cap)"
  - "src/logic/getUpFsm.ts: GetUpMode, GetUpState, SETTLE_SPEED 0.35, SETTLE_ANG 1.0, SETTLE_HOLD_SEC 0.6, RAGDOLL_TIMEOUT_SEC 4.0, RECOVER_SEC 0.45, createGetUp, slapGetUp, updateGetUp"
  - "src/logic/npcAt.ts: parseNpcAt (two finite numbers, clamped to ROOM - 0.5 m)"
  - "src/physics/ragdoll.ts: Ragdoll (activate/deactivate/fixedUpdate/sync/torso/active/bodyCount/mass), createRagdoll, ragdollGroups, ragdollStats"
  - "src/game/slap.ts: performSlap, slapCount, SLAP_HORIZONTAL 9, SLAP_UP 5"
  - "src/render/cameraView.ts: shakeCamera(amplitude, durationMs); CameraView.update(dt, target, shakeDt?)"
  - "src/game/npc.ts: NpcMode, Npc.mode / ragdoll / slappable() / slap() / foot(); NpcOptions.frozen / groupIndex"
  - "src/game/player.ts: Player.slapAt(x, z)"
  - "src/game/game.ts: Game.hitStop, Game.player; timeScale(nowMs) = 0 during hit-stop"
  - "URL param npcAt=x,z; window.__bt keys slap, hitStop, ragdolls, camera.shakeActive, audio.requested"
affects: [01-16, 01-17, 01-19, 01-20]
tech-stack:
  added: []
  patterns:
    - "Pooled ragdoll: bodies + joints created disabled at spawn, toggled with setEnabled; zero Rapier allocation per slap"
    - "Deferred kick: a body enabled this step has mass 0 until the world steps, so the impulse waits until torso.mass() > 0"
    - "Collider sizes measured from each part's own meshes in the unscaled part frame (nested parts excluded)"
    - "Procedural get-up: world-preserving re-attach, then lerp/slerp part locals toward the idle pose sampled at spawn"
    - "Hit-stop on performance.now(): 0 sim steps, animation dt 0, rendering and camera shake continue"
key-files:
  created: [src/logic/rng.ts, src/logic/hitStop.ts, src/logic/getUpFsm.ts, src/logic/npcAt.ts, src/physics/ragdoll.ts, src/game/slap.ts, tests/unit/rng.test.ts, tests/unit/hitStop.test.ts, tests/unit/getUpFsm.test.ts, tests/unit/npcAt.test.ts, tests/e2e/slap.spec.ts]
  modified: [src/game/npc.ts, src/game/game.ts, src/game/loop.ts, src/game/player.ts, src/render/cameraView.ts, src/audio/sfx.ts]
decisions:
  - "01-15: The slap kick is deferred until the torso has a mass. A Rapier 0.20 body created with RigidBodyDesc.setEnabled(false) reports mass 0 until the first world step after setEnabled(true), and recomputeMassPropertiesFromColliders() does not fix it in the same call. An impulse applied together with setEnabled(true) is silently lost (measured in Node: 0.00 m moved vs 4.38 m deferred)."
  - "01-15: 'torso-group mass' = sum of the 6 part masses (density 1 x collider volume), applied as one impulse on the torso. The whole ragdoll leaves at ~9 m/s horizontal / 5 m/s up and lands ~8.8 m away in the far corner from the e2e spot."
  - "01-15: __bt.audio.requested (last 20 requested names) added next to the numeric requests counter. Under ?autoplay=1 audio stays locked, so played is empty, and the plan's 'requests includes slap-*' needs a name list. Changing requests to an array would break audio.spec."
  - "01-15: A hit-stop also sets animation dt to 0 (a full freeze), and the loop breaks out of the remaining catch-up steps in the frame where the slap happened. The camera shake keeps running through the freeze but waits while paused."
  - "01-15: The player turns toward the slapped NPC and holds 'attack-melee-right' for 0.45 s. player.ts is outside the plan file list, but setMotion is re-decided every frame, so the swing needs a timer there."
metrics:
  duration: "~32 min (08:48Z to 09:20Z)"
  completed: 2026-09-15
  tasks: 2
  files: 17
---

# Phase 1 Plan 15: Slap into slapstick ragdoll and get-up Summary

Walking up to a coworker and pressing E, clicking them, or tapping the context button now slaps them. The game freezes for 60 ms, the camera shakes lightly and a seeded `slap-*` punch plays at a seeded pitch. The coworker flies across the room and tumbles as a 6-part Rapier ragdoll (5 spherical joints). When the torso settles they blend back upright over 0.45 s and walk on from the nearest route point. Timing and seeding live in pure, unit-tested modules. There is no blood, gore or injury effect.

## Measurements (headless SwiftShader, 1280x720, camera yaw 0, `?npcAt=0.9,1.0`, one ragdoll active)

| NPCs | Draw calls before | Draw calls during ragdoll | HUD bodies before / during | Ragdoll bodies (pooled / enabled) | fps before / min during |
|------|-------------------|---------------------------|----------------------------|-----------------------------------|-------------------------|
| 3 | 104 | 103–104 | 56 / 56 | 18 / 6 | 35.6 / 33.0 |
| 8 | **134** | 133–134 | 91 / 91 | 48 / 6 | 32.0 / 31.0 |

- **Draw calls do not change during a ragdoll.** The parts are the same 6 meshes, only re-parented. 8 NPCs still sit at 134, over the ≤ 120 bench budget (already known from 01-14). The lever is still D-07 step 3 (one SkinnedMesh per character) in 01-20, so nothing was changed here.
- **HUD bodies went up at spawn, not per slap.**
  - 3 NPCs: 38 → 56. 8 NPCs: 43 → 91. That is 6 pooled bodies per NPC.
  - `world.bodies.len()` counts disabled bodies, so the HUD total includes them. The ~200 cap still has headroom.
  - Only 6 bodies are awake per active ragdoll (`__bt.ragdolls.enabledBodies`).
  - Disabled bodies do not count as sleeping, so `sleeping` stays 34 / 38.
- The fps numbers are SwiftShader only and say nothing about the phones. The bench (01-17) measures on the devices.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing rng / hitStop / getUpFsm unit tests | 6b6d3a8 | tests/unit/rng.test.ts, tests/unit/hitStop.test.ts, tests/unit/getUpFsm.test.ts |
| 1 (GREEN + e2e RED) | Pure rng, hitStop, getUpFsm; failing slap e2e | 05aae25 | src/logic/rng.ts, src/logic/hitStop.ts, src/logic/getUpFsm.ts, tests/e2e/slap.spec.ts |
| 2 | Ragdoll pool, slap, hit-stop, shake, SFX, get-up | f1537eb | src/physics/ragdoll.ts, src/game/slap.ts, src/game/npc.ts, src/game/game.ts, src/game/loop.ts, src/render/cameraView.ts, src/game/player.ts, src/audio/sfx.ts, src/logic/npcAt.ts, tests/unit/npcAt.test.ts |

## Verification evidence

**Task 1:**
- The unit files first failed to import (RED, rc 1).
- Then 25/25 passed.
- The verify script (a .sh file, not inline) printed `UNIT_GREEN` and `E2E_RED`. All 3 slap tests failed waiting for `__bt.slap` / `hitStop` / `ragdolls`, which is the expected reason.
- `Math.random` count in rng/getUpFsm/hitStop = 0.
- getUpFsm.ts contains 0.35, 0.6, 4.0 and 0.45.

**Task 2:**
- `npm run typecheck` rc 0.
- `npx vitest run`: 26 files, **280/280**. Before: 252. Added: +6 rng, +6 hitStop, +13 getUpFsm, +3 npcAt.
- `npx vite build` rc 0.
- `npx playwright test`: **52 passed, 36 skipped, 0 failed**, rc 0. Before: 49. Added: 2 slap desktop + 1 slap mobile-emu.
- Acceptance greps:
  - ragdoll.ts: `setContactsEnabled(false)` = 1, `setEnabled(false)` = 2.
  - `grep -riE "blood|gore|máu" src | wc -l` = 0.
  - slap.ts: `shakeCamera(0.12, 180)` = 1, `playSfx` = 2, `hitStop.trigger(nowMs, 60)` = 1, `activate(` = 1.
  - loop.ts: `timeScale` = 2.

**Full local suite (after Task 2):**
- `npx tsc --noEmit`: rc 0, 0 bytes of output.
- `npx vitest run`: 280/280.
- `npm run build`: rc 0. Chunks: game 111.82 kB, sfx 4.55 kB (still its own lazy chunk), index 7.63 kB.
- `npm run size`: `SIZE_GATE_OK totalRaw=7258044 files=52`. That is +10 KB of JS.
- `npx playwright test`: 52 passed, 0 failed.
- First load until ready-to-play: **3,360,593 bytes (3.4 MB)**, `FIRST_LOAD_LEVEL=ok`. That is +642 B, from the sfx chunk.

**Behaviour probe (preview build, `?npcs=1&npcAt=0.9,1.0`, E pressed, 100 ms samples):**
- ragdoll at 83 ms, torso at (2.86, 2.65, -0.86) at 370 ms
- (5.64, 2.91, -4.01) at 950 ms
- lands near (7.5, 0.2, -5.1)
- recover at ~3.1 s
- walk at ~3.7 s
- dwell at the pantry stop (5.13, -3.96) at ~5.6 s
- `__bt.audio.requested` = `["slap-0"]`, 0 console errors
- Screenshots (in %TEMP%, not committed):
  - a tumbling ragdoll mid-air, parts still joined, with its blob shadow
  - the NPC lying behind the pantry counter, then standing upright
  - the player turned toward the NPC in the swing pose

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The slap impulse did nothing: a body created disabled has mass 0**
- **Found during:** Task 2, first slap e2e run. Click and context button passed, but the "torso moved ≥ 2 m" check failed. The probe showed the torso standing still until it "settled" and recovered in place.
- **Issue:**
  - Rapier 0.20 does not compute mass properties for a body created with `RigidBodyDesc.setEnabled(false)`. `mass()` is 0 right after `setEnabled(true)`, and `recomputeMassPropertiesFromColliders()` in the same call does not help.
  - `applyImpulse` then adds impulse × invMass = 0.
  - Reproduced in Node: moved 0.00 m. Deferring the kick one step: moved 4.38 m.
- **Fix:**
  - `Ragdoll.activate` stores the impulse and torque.
  - `Ragdoll.fixedUpdate()`, called from `npc.fixedUpdate` before the world step, applies them once `torso.mass() > 0`.
  - The world step that runs in the slap frame computes the mass, so the kick lands on the first step after the hit-stop.
- **Files modified:** src/physics/ragdoll.ts, src/game/npc.ts
- **Commit:** f1537eb

**2. [Rule 3 - Blocking] `__bt.audio.requests` is a number, not a list**
- **Issue:** The e2e behaviour asks that "requests includes a name starting 'slap-'". Under `?autoplay=1` audio is locked, so `played` stays empty, and `requests` (01-13) is a counter asserted as a number by audio.spec.
- **Fix:** sfx.ts also records the last 20 requested names as `__bt.audio.requested`. slap.spec asserts on that list.
- **Files modified:** src/audio/sfx.ts, tests/e2e/slap.spec.ts
- **Commit:** f1537eb (sfx.ts), 05aae25 (spec)

**3. [Rule 2 - Correctness] Player swing needs a timer in player.ts**
- **Issue:** `player.frameUpdate` re-picks idle/walk every frame, so a one-off `setMotion('attack-melee-right')` from slap.ts would be overwritten on the next frame.
- **Fix:** `Player.slapAt(x, z)` faces the NPC and holds the swing for 0.45 s. player.ts is not in the plan's file list.
- **Commit:** f1537eb

**4. [Rule 2 - Test coverage / T-01-15-01] `?npcAt` parser moved to a pure module with a unit test**
- **What:** src/logic/npcAt.ts and tests/unit/npcAt.test.ts are not in the file list. The threat mitigation is covered by 3 tests: exactly two finite numbers, clamped to ROOM − 0.5 m, over-long input rejected.
- **Commit:** f1537eb

**5. [Rule 2 - Correctness] Hit-stop is a full freeze and respects pause**
- **What:**
  - Animation dt is 0 during the freeze.
  - The loop stops the remaining catch-up steps in the frame where the slap happened.
  - The glow is refreshed right after the slap, so a ragdoll does not glow for 60 ms.
  - The shake advances only while not paused (`CameraView.update(dt, target, shakeDt)`), and its amplitude and duration are capped (0.5 m, 1 s).
- **Commit:** f1537eb

**6. [Rule 2 - Robustness] Ragdoll parts use CCD, friction 0.8 and a recovered position clamped inside the room**
- **Why:** At ~9–10 m/s a part moves ~0.16 m per step, so CCD keeps it out of the walls. The recover position is clamped to ROOM − 0.5 m so a resumed capsule never starts outside.
- **Commit:** f1537eb

## Notes for later plans

- **01-16 (breakables):** The torso impulse and part colliders are ordinary dynamic bodies. A flying ragdoll hits props (props use the default collision groups), so "slap → NPC flies into a monitor → it breaks" only needs the contact-force events.
- **01-17 (bench):**
  - `?npcAt=x,z` pins NPC 0 frozen in front of the player spawn.
  - `performSlap` spin and pitch come from `mulberry32(BENCH_SEED)` in module state, so a scripted bench slap sequence replays the same way on a device.
  - Only NPC 0 is in reach at the spawn. A multi-ragdoll bench needs the player moved, or more pins.
- **01-20:**
  - 8 NPCs = 134 draw calls, the same before and during a ragdoll.
  - Each NPC adds 6 pooled (disabled) bodies to `world.bodies.len()`.
  - If the HUD should show only live bodies, subtract `__bt.ragdolls.bodies - enabledBodies`.
- **Known limitation (no pathfinding, D-11):** A ragdoll can land behind furniture (the probe landed behind the pantry counter). The recovered NPC then walks a straight line to the nearest route point, and its kinematic capsule can pass through static furniture on that first leg. Candidate fix for a later phase: pick the nearest point with a clear line, or a nearby navmesh sample.
- **Human check (end-of-phase):**
  - Run `npm run dev` and press E on a coworker several times. On a phone, tap the context button.
  - Judge the "bốp" punch, the freeze, the shake, the flight distance (9 m/s may feel like too much in a 16 m room) and the stand-up blend.
  - Check that nothing looks gory.

## Known Stubs

None. Every value is wired. `__bt.audio.requested` records requests even while audio is locked, and says so in its comment.

## Threat Flags

None beyond the plan's register:
- **T-01-15-01:** mitigated. `parseNpcAt` accepts only two finite numbers, clamps them to ROOM − 0.5 m, rejects input over 64 chars and ignores anything else. It has unit tests.
- **T-01-15-02:** mitigated. 6 bodies and 5 joints are created per NPC at spawn and toggled with setEnabled. NPC count is still capped at 8, and collision-group bits are clamped to index 14.
- **T-01-15-03:** mitigated.
  - `performSlap` returns unless `npc.slappable()`, and a ragdoll or recovering NPC is not a target candidate.
  - Impulse constants are fixed × own mass.
  - There is a 4 s ragdoll timeout, and hit-stop is capped at 1 s.
- **T-01-15-04:** mitigated. The grep for blood|gore|máu over src returns 0, and no injury effect exists.

## TDD Gate Compliance

- The RED commit `test(01-15)` 6b6d3a8 came before the GREEN commit `feat(01-15)` 05aae25 for the pure modules.
- The slap e2e was committed failing in 05aae25 and turned green in f1537eb.
- No refactor commit was needed.

## Self-Check: PASSED

- FOUND: src/logic/rng.ts, src/logic/hitStop.ts, src/logic/getUpFsm.ts, src/logic/npcAt.ts, src/physics/ragdoll.ts, src/game/slap.ts, tests/unit/rng.test.ts, tests/unit/hitStop.test.ts, tests/unit/getUpFsm.test.ts, tests/unit/npcAt.test.ts, tests/e2e/slap.spec.ts
- FOUND commits: 6b6d3a8, 05aae25, f1537eb

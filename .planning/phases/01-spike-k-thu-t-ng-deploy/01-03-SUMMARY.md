---
phase: 01-spike-k-thu-t-ng-deploy
plan: 03
subsystem: input-physics-camera
tags: [rapier, kinematic-character-controller, keyboard, follow-camera, playwright, vitest, tdd]
requires:
  - "01-02: registerDebug, GameCtx/Game/createGame, startLoop fixed step (max 4 per frame), Physics { R, world, eventQueue, step }, createRenderer (shadowMap off)"
provides:
  - "src/input/inputState.ts: InputState { moveX, moveY, interactQueued }, createInputState, consumeInteract"
  - "src/input/keyboard.ts: attachKeyboard(s) -> detach (KeyW/A/S/D move, KeyE interact, blur/hidden clears)"
  - "src/logic/moveMath.ts: cameraRelativeMove(x, y, yawRad) -> { x, z }, length <= 1"
  - "src/physics/characterController.ts: PlayerBody, createPlayerBody (kinematic capsule 0.45/0.3 + KCC offset 0.02)"
  - "src/render/room.ts: Room, buildRoom (16 x 12 floor, 4 walls 2.8 m, desk at (3, 0.375, -2))"
  - "src/render/cameraView.ts: CameraView, createCameraView (pitch 55 deg, distance 11, damping 8), getCameraYaw() = 0"
  - "src/game/player.ts: Player, createPlayer (spawn (0, 2), 3.2 m/s, facing yaw)"
  - "window.__bt keys room, player, box, interactCount"
affects: [01-08, 01-09, 01-10, 01-11, 01-15]
tech-stack:
  added: []
  patterns:
    - "Input devices write a shared InputState; the sim reads it once per fixed step and consumes one-shot actions"
    - "Character movement = desired horizontal delta + internally accumulated gravity -> computeColliderMovement -> setNextKinematicTranslation"
    - "Facing yaw convention: direction (-sin yaw, -cos yaw), same as moveMath forward; the mesh nose sits on local -Z"
    - "Exponential damping 1 - exp(-k dt) for frame-rate independent follow"
key-files:
  created: [src/input/inputState.ts, src/input/keyboard.ts, src/logic/moveMath.ts, src/physics/characterController.ts, src/render/room.ts, src/render/cameraView.ts, src/game/player.ts, tests/unit/moveMath.test.ts, tests/e2e/controls.spec.ts]
  modified: [src/game/game.ts]
decisions:
  - "01-03: PlayerBody.move(desired, dt) takes the horizontal translation for this step in metres; dt only drives the internal gravity velocity (reset when computedGrounded)"
  - "01-03: kept camera distance 11 / pitch 55 from the plan although at 1280x720 it frames nearly the full room width, not half (plan 01-09 pins these values in its own tests); flagged for the end-of-phase human check"
  - "01-03: keyboard also clears held keys on visibilitychange hidden, not only window blur"
metrics:
  duration: "~10 min (04:13:06Z to 04:23:10Z)"
  completed: 2026-09-15
  tasks: 2
  files: 10
---

# Phase 1 Plan 03: Walled room, WASD kinematic player, E push box, follow camera Summary

On desktop you can now walk a blue capsule around a walled 16 x 12 m room with WASD. Walls and the desk stop it, and E knocks the orange box when you stand within 1.5 m. A tilted camera follows smoothly. Movement goes through Rapier's `KinematicCharacterController`, and the camera-relative input math is pure TypeScript with Vitest coverage. Full local suite: tsc rc 0, Vitest 74/74, build OK, Playwright 19 passed / 4 skipped / 0 failed.

## Task 1: RED tests (commit cdf5026)

- Added `tests/unit/moveMath.test.ts` with 7 cases: yaw 0 W → -Z, D → +X, (1, 1) normalised, (0, 0), yaw PI/2 W → -X, analog 0.5 not scaled up, non-finite input counts as 0.
- Added `tests/e2e/controls.spec.ts` with one `test.describe('desktop')` block (grep count 1) and exactly four tests. A `beforeEach` skips them outside the desktop project.
- Verify output showed `BUILD_OK`, then `UNIT_RED` (vitest rc 1, cannot resolve `../../src/logic/moveMath`), then `E2E_RED` (Playwright rc 1, `4 failed`). The four failed titles were listed by name ("WASD moves player", "walls block", "E far from box does nothing", "E near box pushes it"). Each failed on the `__bt.player` wait, so this was not "No tests found".
- Guards against vacuous passes:
  - "walls block" samples the position every 500 ms for 8 s. It also requires the player to end within 1.5 m of the far wall, so a frozen player fails.
  - "E far" first checks that the start distance is > 1.5 m.
  - "E near" checks that interactCount is still 0 before E is pressed.

## Task 2: GREEN implementation (commit 348c642)

- Plan verify command (`typecheck && vitest run && vite build && playwright controls + smoke --project=desktop`): every step rc 0; Vitest 74 passed; Playwright `8 passed`, 0 failed.
- Acceptance greps:
  - `computeColliderMovement` is at characterController.ts:42.
  - `Arrow` appears 0 times in keyboard.ts.
  - `castShadow = true` appears 0 times in src.
  - KeyQ/KeyZ/KeyC are bound 0 times.
  - navmesh/vision appears 0 times in src.
- Stability: `controls.spec.ts --repeat-each=3` gave 12 passed.
- Measured probe (a temporary Playwright spec run once and then deleted, so not committed):

  | Measurement | Result | Test requires |
  |-------------|--------|---------------|
  | Spawn | player (0, 0.77, 2); box (0, 0.25, -0.5) | — |
  | Hold W 1000 ms | moved 2.60 m; walking into the box pushed it to z -1.22 | ≥ 1.0 m |
  | Hold D 800 ms | x +2.58 m; yaw -PI/2 | ≥ 0.6 m |
  | Hold W 8 s at x 2.58 | stopped at z -1.28 by the desk face (-1.6 + radius 0.3) | — |
  | Hold A 6 s | stopped at x -7.58 against the wall (inner face -7.9 + radius 0.3 + offset) | — |
  | E near | distance 1.17 m; box moved 0.54 m by 100 ms and 2.29 m by 1.5 s; interactCount 1 | box ≥ 0.3 m |
  | Console | 0 messages besides SwiftShader GPU-stall warnings | 0 errors |

- The screenshot shows the flat-coloured room, the desk, the orange box pushed toward the far wall, the blue capsule and the sha badge.

## Full local suite (after both commits)

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | rc 0, no output |
| `npx vitest run` | rc 0, 7 files, 74 passed |
| `npm run build` | rc 0 (typecheck + vite build) |
| `npx playwright test` | rc 0, 19 passed, 4 skipped (controls in mobile-emu, by design), 0 failed |

The existing 01-01/01-02 specs (smoke, csp, unsupported) and unit tests all still pass. None of them had to change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] Input and physics hardening beyond the spec**
- `cameraRelativeMove`, `PlayerBody.move` and `cameraView.update` treat NaN or non-finite input and dt as 0. This matches the 01-02 `makeStepper` convention, and a unit test covers it.
- Fall speed is capped at 20 m/s.
- The keyboard also clears held keys on `visibilitychange` → hidden. The detach function clears state as well.
- If `mass()` ever reads 0, the push impulse falls back to mass 0.125 (a 0.5 m cube at density 1). The impulse is still made only of bounded constants (T-01-03-01).
- **Commit:** 348c642

No other deviations. Camera distance 11 and pitch 55 match the plan.

## Flags for the end-of-phase human check / verifier

- **Camera framing vs D-19 "about half the room":** At pitch 55°, distance 11 m and fov 50, the ground visible at 1280x720 covers about 14 m of depth and nearly all 16 m of width (see the screenshot), which is more than half the room. The plan and plan 01-09 (`viewParams(844/390) → distance 11`) pin these numbers, so they were not changed here. The human check should judge them.
- **Front wall occlusion:** When the player stands within about 1 m of the +Z wall, the 2.8 m wall sits between camera and capsule. Plan 01-10 has `room.update(getCameraYaw())`, which is the natural place to hide or cut away camera-side walls.
- **Nose visibility:** At yaw 0 the facing "nose" is behind the capsule from the camera's view. It shows when moving sideways or toward the camera.

## Human check (deferred, human_verify_mode end-of-phase)

1. Run `npm run dev`, open the printed URL in desktop Chrome and click Chơi.
2. Walk with WASD into a wall and the desk, then to the orange box, and press E.
3. Expected: movement follows the screen direction, the camera trails smoothly, walls and the desk stop the capsule, and the box flies and tumbles.

## Known Stubs

- `src/render/cameraView.ts`: `const yaw = 0`. This is intentional; plan 01-09 adds Z/C rotation through a CameraRig.
- `src/game/game.ts`: the detach function returned by `attachKeyboard` is not kept. The game lives for the whole page lifetime, and pause handling arrives in plan 01-11.
- Neither blocks this plan's goal.

## Threat Flags

None. The only new surface is local keyboard input and read-only `__bt` getters (T-01-03-02 accept).

## TDD Gate Compliance

RED `test(01-03)` cdf5026, then GREEN `feat(01-03)` 348c642. No refactor commit was needed.

## Self-Check: PASSED

- All 9 created files, 1 modified file and this SUMMARY exist.
- Commits cdf5026 and 348c642 appear in `git log --all`.
- The working tree was clean after the Task 2 commit, and the temporary probe spec was deleted.

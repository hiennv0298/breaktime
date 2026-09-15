---
phase: 01-spike-k-thu-t-ng-deploy
plan: 09
subsystem: camera-screen
tags: [camera-rig, rotation, orientation, resize-guard, page-hardening, fullscreen, playwright, vitest, tdd]
requires:
  - "01-03: createCameraView, getCameraYaw (constant 0), cameraRelativeMove, createRenderer/RenderCtx, onPlayGesture"
  - "01-08: #btn-context, #btn-pause, #joystick-base ids and [data-hud-button] base styles in hud.css"
provides:
  - "src/logic/cameraRig.ts: CameraRig, createCameraRig({ stepDeg = 90, damping = 10 }), viewParams(aspect) -> landscape 11/55, portrait 15/60"
  - "src/render/cameraView.ts: rotateCamera(dir), getCameraYaw() from the rig (radians), distance/pitch eased to viewParams(camera.aspect)"
  - "src/input/cameraKeys.ts: attachCameraKeys() (KeyZ/ArrowLeft -1, KeyC/ArrowRight +1)"
  - "src/input/cameraButtons.ts: attachCameraButtons(root) (#btn-rot-left, #btn-rot-right, data-hud-button)"
  - "src/render/renderer.ts: debounced, backbuffer-guarded resize; body.portrait"
  - "src/boot/pageHardening.ts: installPageHardening()"
  - "src/boot/fullscreen.ts: requestFullscreenIfSupported()"
  - "src/ui/layout.css: rotate buttons + portrait overrides"
  - "window.__bt keys camera, renderer, fullscreen"
affects: [01-10, 01-11, 01-12, 01-15]
tech-stack:
  added: []
  patterns:
    - "One page-level CameraRig: the view and the movement code read the same damped yaw, so movement turns with the view"
    - "Canvas box is CSS (100vw x 100dvh); renderer.setSize(w, h, false) only sets the backbuffer, so the canvas equals the viewport even inside the resize debounce window"
    - "body.portrait flips immediately on every resize event (cheap class toggle); the GPU resize is debounced"
    - "Modules that import three are loaded with the renderer (dynamic import), keeping the index chunk three-free"
key-files:
  created: [src/logic/cameraRig.ts, src/input/cameraKeys.ts, src/input/cameraButtons.ts, src/boot/pageHardening.ts, src/boot/fullscreen.ts, src/ui/layout.css, tests/unit/cameraRig.test.ts, tests/e2e/camera.spec.ts, tests/e2e/orientation.spec.ts]
  modified: [src/render/cameraView.ts, src/render/renderer.ts, src/main.ts]
decisions:
  - "01-09: KeyC / ArrowRight / ⟳ = +90° yaw (camera orbits from +Z toward +X; W then walks world -X); KeyZ / ArrowLeft / ⟲ = -90°"
  - "01-09: the rig lands exactly on the target when the gap is under 0.001°, so settled yaw is an exact multiple of 90 and normalises to 0 after four steps"
  - "01-09: __bt.camera.distance / pitchDeg report the eased (actual) values; e2e polls until both settle instead of reading them at a fixed 300 ms"
  - "01-09: renderer.setSize(..., false) — CSS owns the canvas box, the guard owns only the backbuffer and camera.aspect"
  - "01-09: rotate icons are constant SVG paths (not U+27F2/U+27F3 characters), same reason as the 01-08 pause icon"
  - "01-09: touchmove stays scrollable for a single finger inside #pause-menu (01-11 sections may overflow); everything else is prevented when cancelable"
metrics:
  duration: "~18 min (05:34:21Z to 05:52Z)"
  completed: 2026-09-15
  tasks: 3
  files: 12
---

# Phase 1 Plan 09: 90° camera rotation, portrait/landscape layout, fullscreen-if-supported, page hardening Summary

The camera now turns in exact 90° steps with Z / C (arrows as aliases) on desktop and ⟲ ⟳ buttons at the top-right on touch. It eases to the new angle, and WASD / joystick movement follows the view. E never rotates. The game fills the screen in both orientations. Portrait pulls the camera back to 15 m / 60° and moves the buttons toward the bottom. Resizes are debounced and only touch the GPU when the backbuffer size really changes. Zoom, pull-to-refresh and long-press menus are suppressed. The Chơi tap asks for fullscreen only when `document.fullscreenEnabled` is true.

Full local suite: `npx tsc --noEmit` rc 0 (0 bytes of output) · Vitest **174/174** (16 files) · `npm run build` rc 0 · `npm run size` `SIZE_GATE_OK totalRaw=6504041 files=18` · Playwright **32 passed / 16 skipped / 0 failed** (was 24 passed / 8 skipped after 01-08) · first load 3,103,490 bytes (was 3,099,063).

## Task 1: RED (commit bbaa14f)

- `tests/unit/cameraRig.test.ts` has 11 cases:
  - rotate(1) → 90
  - two rotate(-1) → -180
  - update(2.0) snaps
  - the damping amount of one 1/60 s step matches 1 - exp(-10/60)
  - four rotate(1) → target 360 and normalised yaw 0
  - normalised -90 → 270, and -720 → 0
  - the stepDeg / damping options, with NaN and negative dt ignored
  - viewParams landscape, portrait, square and NaN
- `tests/e2e/camera.spec.ts`:
  - desktop: Z / C / ArrowLeft / ArrowRight, then E leaves the yaw unchanged
  - desktop: WASD is camera-relative after C
  - mobile-emu: ⟳ then ⟲ twice gives -90, and both buttons sit in the top-right quadrant
  - fullscreen (desktop): two tests. One uses the real `fullscreenEnabled`. The other is an iPhone-like init script where `fullscreenEnabled` is false and `requestFullscreen` is a counting stub; it expects `{ enabled: false, requested: false, error: null }` and 0 calls.
- `tests/e2e/orientation.spec.ts` (mobile-emu):
  - The canvas equals the viewport ±1 px in 844x390 → 390x844 → 844x390.
  - Exactly the 4 HUD buttons are visible, each is at least 56 px, lies inside the viewport and does not overlap another. The list must be exact, so an empty list cannot pass.
  - body.portrait is set in portrait, distance and pitch are 15/60 and then 11/55, and no "rotate your device" text appears.
  - A 10-flip storm grows resizeCount by at most 2. A later settled resize must raise the count, so the counter is proven live.
- Verify output: `BUILD_OK`, `UNIT_RED` (cannot resolve `src/logic/cameraRig`), `E2E_RED`. There were 7 failed and 7 skipped by project, and none reported "No tests found". The failures were the `__bt.camera` / `__bt.renderer` wait timeouts, `fullscreen` toBeDefined, and toEqual on undefined.
- The files do not import or modify `controls.spec.ts`. They only import `collectPageProblems`, `waitForBtState` and `touchTap` from helpers.ts, which is unchanged.

## Task 2: rotation GREEN (commit f63fffb)

- The plan's verify command (typecheck, vitest, vite build, then Playwright camera + controls + smoke with `--grep-invert fullscreen`) returned rc 0 at every step: Vitest 174 passed, Playwright 19 passed, 11 skipped. The desktop rotation and movement tests and the mobile button test each reported `ok`.
- Acceptance checks:
  - `grep -c KeyE src/input/cameraKeys.ts` gives 0.
  - `grep -c KeyZ` gives 2.
  - The plan 01-08 file check on `git show --name-only HEAD` gives 0.
- `main.ts` loads `cameraKeys` / `cameraButtons` through the same `Promise.all` dynamic import as the renderer. Both files import `cameraView`, which imports three, so a static import would have pulled three into the index chunk and onto the unsupported path (01-02 design). First load grew by only 4,427 bytes.

## Task 3: screen GREEN (commit de23297)

- The plan's verify command (typecheck, vitest, vite build, then Playwright camera, orientation, controls, smoke and csp) returned rc 0 at every step: 30 passed, 16 skipped, and 0 lines containing " failed".
- Acceptance greps: `fullscreenEnabled` in fullscreen.ts 2 · `alert(` in src 0 · `body.portrait` in layout.css 8 · "xoay máy" / "rotate your" in src 0 · `innerHTML` in src 0.
- **Mutation check** (temporary; files restored from backup, confirmed identical with `cmp`, then rebuilt):
  - Adding `KeyE: 1` to cameraKeys failed "…E never rotates" (Expected 0, Received 90).
  - Setting `RESIZE_DEBOUNCE_MS = 0` failed the storm test (Expected ≤ 2, Received 10, storm took 176 ms).
  - Both truths are guarded by assertions that really fail.
- Throwaway probe (run once, deleted, never committed):
  - Desktop Chromium after Chơi: `__bt.fullscreen = { enabled: true, requested: true, error: null }` and `document.fullscreenElement` was set.
  - Mobile-emu portrait at 390x844: distance 14.99997, pitch 59.99997, `resizeCount` 1, dpr 2. Buttons: ⟲ at (16, 556), ⟳ at (84, 556), context (96 px) at (245, 708), pause at (322, 12). All are inside the viewport.
  - The screenshots show the portrait layout (rotate row bottom-left above the thumb area, context button bottom centre-right, pause top-right) and the landscape layout (⟲ ⟳ ⏸ in a row at the top-right).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Camera input modules are dynamic imports in main.ts**
- **Found during:** Task 2
- **Issue:** The plan says to call `attachCameraKeys()` / `attachCameraButtons()` after the renderer is created. A static import would put three.js in the index chunk and break the lazy unsupported path.
- **Fix:** Both modules are added to the renderer's `Promise.all` dynamic import.
- **Files modified:** src/main.ts
- **Commit:** f63fffb

**2. [Rule 1 - Bug in own test] Pitch polled together with distance**
- **Found during:** Task 3
- **Issue:** Distance and pitch ease at the same rate. The pitch gap is 5° and the distance gap is 4 m, so pitch was still 55.06 when distance had settled within 0.05.
- **Fix:** `expectView(distance, pitch)` polls both values for up to 3 s. Asserting only after both settle is stricter than reading at a fixed 300 ms.
- **Files modified:** tests/e2e/orientation.spec.ts
- **Commit:** de23297

**3. [Rule 2 - Correctness] Hardening beyond the spec**
- **Arrow keys:** They are default-prevented, so they never scroll.
- **Rotate buttons:** They use `tabIndex = -1` (same reason as 01-08), and their inline placement was removed in Task 3 once layout.css owned it. cameraButtons.ts is a Task 2 file.
- **Resize guard:** It also re-applies the pixel ratio when DPR changes (window moved between monitors).
- **body.portrait:** It toggles right away on each event, not only after the debounce.
- **Page hardening:** It prevents only cancelable events, so Chrome logs no intervention warning. A single-finger drag inside `#pause-menu` stays scrollable.
- **Commits:** f63fffb, de23297

**4. [Test addition] Page-hardening e2e**
- The plan listed page hardening as a truth but gave it no test.
- `orientation.spec.ts` gained one test. It dispatches cancelable contextmenu, dblclick, gesturestart and touchmove events and expects each to be defaultPrevented. A negative control (mouseover) must stay not prevented.
- **Commit:** de23297

No file owned by plan 01-08 was touched: the check prints 0 for both feat commits, and helpers.ts / controls.spec.ts are unchanged.

## Observations for the verifier / end-of-phase human check

- **Framing vs D-19 "about half the room" (carried from 01-03, not retuned):**
  - At landscape 11 m / 55° the view shows the whole 16 x 12 m room at 844x390 and at 1280x720.
  - At portrait 15 m / 60° the view is narrower but still shows the full room width.
  - These numbers are pinned by this plan's `viewParams` unit test, so they stay as planned. The operator should judge them on the phones, and plan 01-10 or later can retune both the constants and the test together.
- **Storm timing:** Ten `setViewportSize` calls took 176 ms, not "within 100 ms". Each gap (~17 ms) is still far below the 100 ms debounce, so the test exercises the guard as intended. Its failure message prints the storm duration.
- **Rotation while paused:** Z / C still turn the camera while the pause menu is open. The menu (z 400) covers the touch buttons, so touch cannot. The simulation stays frozen. This was left as is because the camera is presentation only; if it matters, a later plan can gate it on `getPauseState()`.
- **Portrait rotate row:** It sits at `bottom: safe + 232px`. A thumb that starts the joystick exactly on those 56 px buttons rotates instead of moving. This needs the phone check.

## Human check (deferred, human_verify_mode end-of-phase)

On both reference phones (deployed URL after plan 01-12):

1. Rotate the phone mid-play.
2. Use ⟲ ⟳ in both orientations.
3. Tap Chơi on the iPhone and on Android.

Expected: the canvas always fills the screen, buttons stay reachable inside the safe areas (notch) in both orientations, and there is no zoom or scroll. Android enters fullscreen. The iPhone shows no error and simply fills the viewport.

**CTRL-03 stays open** until this real-device check is done, because notch/safe-area layout and iOS URL-bar resizes cannot be emulated. **CTRL-05** is fully proven by the unit tests and e2e (keys and touch buttons, exact 90° steps, camera-relative movement), so it is marked complete.

## Known Stubs

None. `getCameraYaw()` is no longer constant: the 01-03 stub `const yaw = 0` is gone.

## Threat Flags

None. The only new surfaces are local keyboard and pointer input, a feature-detected browser fullscreen request and read-only `__bt` getters. The plan's threats are handled as follows:

- **T-01-09-01 (resize storms):** mitigated by the debounce plus the backbuffer equality check. The storm e2e and its mutation proof cover it.
- **T-01-09-02 (fullscreen rejection):** mitigated. The request is feature-detected, a rejection is stored and never thrown, and the iPhone-like e2e covers it.
- **T-01-09-03 (DOM construction of buttons):** mitigated. Buttons use createElement / createElementNS only, and `innerHTML` appears 0 times.
- **T-01-09-04 (accidental zoom/scroll):** accepted as planned. The listeners are covered by e2e.

## TDD Gate Compliance

RED `test(01-09)` bbaa14f, then GREEN `feat(01-09)` f63fffb and de23297. No refactor commit was needed.

## Self-Check: PASSED

- All 9 created and 3 modified files exist.
- Commits bbaa14f, f63fffb and de23297 appear in `git log`.
- Mutation backups were restored, confirmed identical with `cmp` and rebuilt. The probe spec was deleted, and the working tree was clean after the Task 3 commit.

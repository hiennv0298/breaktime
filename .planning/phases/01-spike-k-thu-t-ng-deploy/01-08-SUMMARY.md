---
phase: 01-spike-k-thu-t-ng-deploy
plan: 08
subsystem: input-touch-pause
tags: [pointer-events, floating-joystick, multi-touch, pause, cdp-touch, playwright, vitest, tdd]
requires:
  - "01-03: InputState/consumeInteract, attachKeyboard, createPlayer, Game, startLoop, hud.css base"
provides:
  - "src/logic/joystickMath.ts: stick(originX, originY, x, y, radius, dead = 0.12)"
  - "src/logic/pauseState.ts: PauseReason, PauseState, createPauseState"
  - "src/input/inputState.ts: InputState.pauseToggleQueued, consumePauseToggle"
  - "src/input/joystick.ts: attachJoystick(root, s) -> detach (#touch-zone, #joystick-base, #joystick-knob)"
  - "src/input/touchButtons.ts: IconName, attachTouchButtons (#btn-context, #btn-pause, data-hud-button), setContextIcon, isTouchUi"
  - "src/ui/pauseMenu.ts: PauseMenu, createPauseMenu (#pause-menu, #pause-resume, .sections)"
  - "src/game/loop.ts: getPauseState()"
  - "src/game/game.ts: Game.input"
  - "window.__bt keys joystick, touchUi, pauseReason; paused now backed by PauseState"
  - "tests/e2e/helpers.ts: touchDown, touchMove, touchUp, touchDrag, touchTap (CDP, multi-touch aware)"
affects: [01-09, 01-10, 01-11, 01-15]
tech-stack:
  added: []
  patterns:
    - "Every input device writes the shared InputState; one-shot actions (interact, pause toggle) are queued flags consumed by the sim/loop"
    - "HUD buttons are separate elements with their own pointerdown + preventDefault, above a full-screen #touch-zone that owns the joystick pointer via capture"
    - "Pause is a pure state object; the loop maps isPaused to timeScale 0 and syncs the menu once per frame"
    - "Trusted touch in e2e through CDP Input.dispatchTouchEvent with per-page active point tracking"
key-files:
  created: [src/logic/joystickMath.ts, src/logic/pauseState.ts, src/input/joystick.ts, src/input/touchButtons.ts, src/ui/pauseMenu.ts, tests/unit/joystickMath.test.ts, tests/unit/pauseState.test.ts]
  modified: [src/input/inputState.ts, src/input/keyboard.ts, src/game/game.ts, src/game/loop.ts, src/ui/hud.css, tests/e2e/helpers.ts, tests/e2e/controls.spec.ts]
decisions:
  - "01-08: pauseFor(r) overwrites the current reason; toggle from any paused reason resumes; resume happens only via the menu, Escape/Space or the pause button (coming back to a visible tab stays paused)"
  - "01-08: Space is preventDefault-ed on keydown AND keyup, and HUD buttons use tabIndex -1, so Space never scrolls or double-toggles through a focused button"
  - "01-08: an interact queued while paused is dropped so it cannot fire on resume"
  - "01-08: the pause button icon is an SVG two-bar glyph (aria-label 'Tạm dừng') instead of the U+23F8 character, so it does not depend on emoji fonts on the reference phones"
  - "01-08: CDP touchEnd releases every finger; the e2e helper lifts one finger of several with a touchMove that omits it"
metrics:
  duration: "~17 min (05:15:19Z to 05:32Z)"
  completed: 2026-09-15
  tasks: 3
  files: 14
---

# Phase 1 Plan 08: Floating joystick, context button, ESC/Space/pause-button pause Summary

The room is now playable on touch. A finger on the left half spawns a joystick exactly under it (radius 60 px, dead zone 0.12) and drags move the player. A 96 px context button does the same thing as E and works while the other thumb holds the joystick. Escape, Space and the top-right pause button freeze the simulation and show a "Tạm dừng" menu with "Tiếp tục". A hidden tab auto-pauses. Joystick math and pause state are pure modules covered by Vitest.

Full local suite: `npx tsc --noEmit` rc 0 · Vitest 163/163 (15 files) · `npm run build` rc 0 · size gate `SIZE_GATE_OK` (6,497,766 bytes raw) · Playwright **24 passed / 8 skipped / 0 failed** (was 20 passed after 01-07).

## Task 1: RED (commit cf80200)

- `tests/unit/joystickMath.test.ts` has 7 cases: centre, radius → x 1, clamp to knob length 60 with |v| = 1, a diagonal clamp (0.6, -0.8), dead zone (5 px → 0 while the knob still follows), proportional 0.5, and a custom dead zone.
- `tests/unit/pauseState.test.ts` has 7 cases: initial state, toggle, `pauseFor('hidden')`, resume, toggle from 'hidden', resume while running, and independent instances.
- `tests/e2e/helpers.ts` gains `touchDown/touchMove/touchUp/touchDrag/touchTap` on a CDP session (`Input.dispatchTouchEvent`, 2 occurrences), with active touch points tracked per page so multi-touch works.
- `tests/e2e/controls.spec.ts` gains `touch` (mobile-emu) and `pause` (one desktop test, one mobile-emu test). The 01-03 `desktop` block is byte-identical: the only removed line in the diff is the old single-line import, and the `Bt` type only gained optional keys.
- Verify output: `BUILD_OK`, `UNIT_RED` (vitest rc 1, cannot resolve the two modules), `E2E_RED` (Playwright rc 1). The 4 desktop tests passed, 4 new tests failed on real assertions (waitPaused timeout; `joystick` undefined; `#btn-context` / `#btn-pause` not found), and 8 were skipped by project. None failed with "No tests found".

## Task 2: GREEN for pure logic + desktop pause (commit 7c0a8ac)

- `stick()` is the RESEARCH Pattern 4 code (reformatted only). `createPauseState` follows the interfaces block.
- `keyboard.ts`: Escape and Space set `pauseToggleQueued` when `!repeat`. Space is default-prevented. KeyE is unchanged. `grep -c "KeyZ\|KeyC\|Arrow"` gives 0.
- `pauseMenu.ts`: `#pause-menu` (hidden by default, role dialog) contains an h2 "Tạm dừng", `button#pause-resume` "Tiếp tục" and `div.sections`. It is built with createElement and textContent only.
- `loop.ts`:
  - The module-level PauseState is exposed through `getPauseState()`.
  - Each frame, `consumePauseToggle(game.input)` runs and the menu is synced.
  - While paused, timeScale is 0 and a queued interact is dropped.
  - visibilitychange to hidden calls `pauseFor('hidden')`.
  - `__bt.paused` now reads PauseState, and `__bt.pauseReason` is new.
- Verify: typecheck rc 0, Vitest 163 passed, build rc 0. The desktop project gave 5 passed (4 desktop + pause) and 3 skipped.

## Task 3: GREEN for touch (commit 74660d8)

- `joystick.ts`:
  - The pointerdown guard is `pointerType === 'mouse' || activeId !== null || clientX > innerWidth / 2`.
  - `setPointerCapture` is at line 51, inside `try {` (line 50).
  - The base is positioned with `translate(x, y)` plus a -60 px margin, so its centre is the touch point.
  - pointerup, pointercancel, lostpointercapture and a hidden tab all reset movement.
  - `__bt.joystick` exposes `{ active, x, y }`.
- `touchButtons.ts`:
  - The icons 'hand', 'push', 'slap' and 'none' are constant path data built with `createElementNS`.
  - `#btn-context` sets interactQueued and `#btn-pause` sets pauseToggleQueued. Each has its own pointerdown listener with preventDefault and carries `data-hud-button`.
  - The buttons are visible when `(pointer: coarse)` matches or after the first touch pointerdown.
  - `__bt.touchUi` exposes `{ visible, contextIcon }`.
- `hud.css`: landscape positions with `env(safe-area-inset-*)`. Hit areas are at least 56 px, the context button is 96 px, and the z-order is canvas < zone (100) < buttons (200) < pause menu (400).
- Plan verify (`typecheck && vitest && vite build && playwright controls + smoke + csp`, both projects): every step rc 0, 22 passed, 8 skipped, 0 lines containing " failed".
- Acceptance greps: `innerHTML` appears 0 times in src; `data-hud-button` appears 1 time in touchButtons.ts; setPointerCapture is inside the try block.
- Mutation check (temporary, reverted and cmp-verified, rebuilt afterwards):
  - Removing the right-half guard failed "floating joystick…" at `joystick.active toBe(false)` (line 257).
  - Removing `pauseFor('hidden')` failed the mobile pause test at the waitPaused timeout.
  - So both truths are guarded by assertions that really fail.
- Stability: the new touch/pause tests with `--repeat-each=3` gave 12 passed and 0 failed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `Game.input` and pause-menu CSS landed in Task 2, not Task 3**
- **Found during:** Task 2
- **Issue:** The desktop pause e2e (Task 2 done criteria) needs `loop.ts` to read `game.input`, and it needs `#pause-menu` stacked above the fixed canvas so `#pause-resume` can be clicked. Both files were listed under Task 3.
- **Fix:** Task 2 added `readonly input` to `Game` and the pause-menu rules to `hud.css`. Task 3 added the joystick/button attach calls and the touch styles.
- **Files modified:** src/game/game.ts, src/ui/hud.css
- **Commit:** 7c0a8ac

**2. [Rule 1 - Bug] Test helper released every finger when lifting one**
- **Found during:** Task 3
- **Issue:** The context-button test tapped with a second finger (interactCount became 1), but the joystick finger was released as well. CDP `touchEnd` must carry no points and ends all touches.
- **Fix:** `touchUp` now sends `touchMove` without the lifted finger when others remain, and `touchEnd` with `[]` only for the last finger. The app code was not changed.
- **Files modified:** tests/e2e/helpers.ts
- **Commit:** 74660d8

**3. [Rule 2 - Correctness] Small hardening beyond the spec**
- Space is also default-prevented on keyup, and HUD buttons use `tabIndex = -1`, so a focused button cannot double-toggle.
- An interact queued while paused is dropped.
- The joystick also resets on a hidden tab (T-01-08-02).
- The keyboard detach clears `pauseToggleQueued`.
- **Commits:** 7c0a8ac, 74660d8

**4. [Design note] The pause button uses an SVG two-bar glyph rather than the U+23F8 character.** It looks the same, has `aria-label="Tạm dừng"` and does not depend on emoji fonts on the reference phones.

## Notes for later plans

- **01-09:** buttons are positioned only by id in `hud.css`. Portrait overrides can target `#btn-context`, `#btn-pause` and `#joystick-base`. The joystick guard uses `window.innerWidth / 2` at pointerdown time, so it follows rotation.
- **Desktop mouse click on objects (D-20, later plan):** `#touch-zone` covers the whole canvas, so canvas `click` listeners will not fire. Listen on `#touch-zone` or `window` instead. The zone ignores mouse pointers for the joystick.
- **01-10 / 01-15:** call `setContextIcon('push' | 'slap' | 'none')`. The default is 'hand'.
- **01-11:** `createPauseMenu` is created inside `startLoop` and is not exported. Adding sections needs either a getter next to `getPauseState()` or passing the menu out.

## Human check (deferred, human_verify_mode end-of-phase)

On both reference phones (deployed URL after plan 01-12), play for 2 minutes: move with the left thumb, tap the context button next to the box, then pause and resume. Expected: the joystick appears only under the left thumb, the context button works while moving, pause freezes the scene and "Tiếp tục" resumes, with no scroll, zoom or text selection. **CTRL-02 stays open** until this feel check and the icon-changing work in later plans are done.

## Known Stubs

- `setContextIcon` has no caller yet. The icon stays 'hand' until plans 01-10 and 01-15 wire the nearest target. This is intentional and does not block this plan's goal.
- `#pause-menu .sections` is empty (hidden via `:empty`) until plan 01-11.
- `game.ts` does not keep the detach functions of `attachJoystick` and `attachTouchButtons`. This matches the keyboard, since the game lives for the whole page.

## Threat Flags

None. The only new surface is local pointer and keyboard input plus read-only `__bt` getters. T-01-08-01 (createElementNS/textContent, innerHTML 0), T-01-08-02 (cancel, lost capture and hidden reset) and T-01-08-03 (hidden tab auto-pause, e2e-proven) are mitigated.

## TDD Gate Compliance

RED `test(01-08)` cf80200, then GREEN `feat(01-08)` 7c0a8ac and 74660d8. No refactor commit was needed.

## Self-Check: PASSED

- All 7 created and 7 modified files exist.
- Commits cf80200, 7c0a8ac and 74660d8 appear in `git log`.
- Mutation backups were restored and cmp-verified, and the working tree was clean after the Task 3 commit.

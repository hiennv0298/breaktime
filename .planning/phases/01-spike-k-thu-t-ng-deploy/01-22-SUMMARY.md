---
phase: 01-spike-k-thu-t-ng-deploy
plan: 22
subsystem: desktop-input
tags: [keyboard, key-map, d-27, ctrl-tap, typing-guard, browser-shortcuts, vitest, playwright, tdd]
requires:
  - "01-08: attachKeyboard, InputState (interactQueued / pauseToggleQueued), consumePauseToggle in loop.ts, Space preventDefault on keydown + keyup"
  - "01-09: attachCameraKeys, rotateCamera(dir), __bt.camera.targetYawDeg"
  - "01-16: current full e2e baseline (55 passed)"
provides:
  - "src/logic/keyMap.ts: KeyIntent, KeyMods, classifyKey(code, mods), axisFromHeld(held), CtrlTap, createCtrlTap(), isTypingTarget(t), KEY_HINTS (4 D-28 rows)"
  - "Desktop bindings (KeyboardEvent.code): move KeyW/A/S/D + ArrowUp/Down/Left/Right; action Space + KeyE; pause Escape + lone ControlLeft/ControlRight; rotate KeyZ/KeyC; debug HUD Backquote"
  - "Guards: any key with Ctrl/Meta/Alt is not a game key and is never default-prevented; keys in text-like inputs / textarea / select / contenteditable ignored (Escape still passes in keyboard.ts)"
affects: [01-24, 01-25, 01-27, 01-17]
tech-stack:
  added: []
  patterns:
    - "Key bindings as pure data (Record code -> intent) consumed by every keyboard listener, so keyboard.ts, cameraKeys.ts and the hint panel cannot drift apart"
    - "Lone-modifier tap detector: two booleans (controlHeld, armed); any other keydown, pointerdown (capture) or wheel disarms; blur / hidden tab resets"
    - "Typing guard by duck-typed inspection of the event target (tagName / type / isContentEditable), so it is unit-testable in Node"
    - "keyup always releases the held code even inside a typing target, so no movement key sticks after focus moves"
key-files:
  created: [src/logic/keyMap.ts, tests/unit/keyMap.test.ts]
  modified: [src/input/keyboard.ts, src/input/cameraKeys.ts, src/input/inputState.ts, src/ui/debugHud.ts, src/render/cameraView.ts, tests/e2e/controls.spec.ts, tests/e2e/camera.spec.ts]
decisions:
  - "01-22: Space keydown is default-prevented on repeats too (not only the first press), so holding Space never scrolls; the interact flag is still set only on a non-repeat press."
  - "01-22: keyup calls ctrlTap.up for every event, including those from a typing target, so the tap state is always cleared; only the pause toggle and the Space keyup preventDefault are skipped inside a text field."
  - "01-22: isTypingTarget treats an INPUT as typing unless its type is button, checkbox, color, file, hidden, image, radio, range, reset or submit (text, search, number, email and no type all count as typing)."
  - "01-22: cameraKeys.ts no longer calls preventDefault at all: Z / C have no default action, and the arrow keys (which needed it) are now handled and prevented in keyboard.ts."
metrics:
  duration: "~12 min (11:43Z to 11:55Z)"
  completed: 2026-09-15
  tasks: 2
  files: 9
---

# Phase 1 Plan 22: Desktop key map D-27 Summary

On desktop the player now walks with the arrow keys or WASD, hits with Space (E still works), opens the pause/settings menu with Escape or a lone Ctrl press, and rotates the camera with Z / C only. All bindings live in one pure module, `src/logic/keyMap.ts`, with 90 Vitest cases. Keyboard, camera keys and the debug HUD toggle all read from it. The game no longer takes over browser shortcuts: Ctrl+W/R/Z and Cmd+R are not default-prevented, and Ctrl+Z does not rotate the camera. Keys typed into a text field do nothing in the game, except Escape, which still closes the menu. The NPC name inputs of plan 01-27 rely on that.

## What changed

| Area | Before (01-08 / 01-09) | After (D-27) |
|------|------------------------|--------------|
| Move | WASD | WASD **and** arrow keys; D + ArrowRight together are not faster (`axisFromHeld`) |
| Action | E | **Space** and E (Space default-prevented on keydown and keyup) |
| Pause / settings | Escape, Space | **Escape** or a **lone Ctrl** tap (left or right); Space never pauses |
| Camera rotate | Z / C, ArrowLeft / ArrowRight | **Z / C only** |
| Modifiers | Ctrl+Z rotated; Space/arrows swallowed with any modifier | Any key with Ctrl/Meta/Alt → `null`, never default-prevented |
| Typing in inputs | Not guarded | keyboard.ts, cameraKeys.ts and debugHud.ts ignore typing targets (Escape passes in keyboard.ts) |
| Ctrl tap interrupts | n/a | another keydown, pointerdown (capture), wheel → no tap; blur / hidden tab → reset |

`KEY_HINTS` holds the four D-28 rows (`←↑→↓ đi`, `Space đánh`, `Ctrl/Esc settings`, `Z/C xoay`). Plan 01-25 renders them; they are not shown yet.

## Tasks

| # | Task | Commit | Evidence |
|---|------|--------|----------|
| 1 | Pure key map via TDD + e2e specs rewritten (RED) | `085eefd` | Unit RED first (module missing, rc=1), then `UNIT_GREEN` 90/90; `BUILD_OK`; `E2E_RED` rc=1 with 4 failed, all from the new/rewritten tests: arrows rotated (-90), arrows did not move (1.5e-7 m), Space push timed out, lone Ctrl never paused. Purity grep printed 0. The old test title appears 0 times |
| 2 | Wire keyboard, camera keys, debug HUD (GREEN) | `11ca704` | `TYPECHECK_OK`, `UNIT_OK` (vitest 29 files / 390 tests), `BUILD_OK`, targeted desktop e2e 11 passed; full `npx playwright test` **57 passed, 41 skipped, 0 failed** (baseline 55 + 2 new tests); greps: cameraKeys Arrow 0, keyboard `'Space'` 1, `classifyKey(` 1, `createCtrlTap` 2, debugHud `isTypingTarget` 2, innerHTML 0 |

## Spec changes (each with its D-27 reason, written as a comment in the spec)

- `controls.spec.ts` desktop, **new** `arrow keys move like WASD and never rotate the camera`: D-27 / CTRL-01 reworded; arrow keys move now.
- `controls.spec.ts` desktop, **new** `Space near box pushes it like E`: D-27 / D-18 revised; Space is the action key. The test also checks that Space does not pause.
- `controls.spec.ts` pause, **replaced** the old Escape/Space pause test with `Escape and a lone Ctrl toggle the menu; Space never pauses; Ctrl combos are not swallowed`: D-27 / CTRL-04 reworded, D-20 replaced. It checks that Escape and ControlLeft/ControlRight open and close the menu, that Space does not pause and is default-prevented, and that Ctrl+KeyZ is not default-prevented, does not rotate and does not pause. Ctrl+click and Ctrl+ArrowUp (moved < 0.05 m) do not pause either, and `#pause-resume` still resumes.
- `camera.spec.ts` desktop, **replaced** the arrow-alias test with `Z / C rotate by exactly 90°; arrow keys and E never rotate`: D-19 revised 15/09/2026.
- Every other test in both files is unchanged. Every changed test still checks for zero console errors and zero off-origin requests.

## Full local suite (after Task 2)

| Check | Result |
|-------|--------|
| `npm run typecheck` (`tsc --noEmit` for tsconfig.json and tsconfig.node.json) | rc=0 |
| `npx vitest run` | 29 files, 390 tests passed |
| `npm run build` | rc=0 |
| `npm run size` | `SIZE_GATE_OK totalRaw=7270494 files=53` |
| `npx playwright test` | 57 passed, 41 skipped, 0 failed (2.2 min) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The reason comment quoted the old test title**
- **Found during:** Task 1 acceptance check
- **Issue:** The comment next to the replaced pause test quoted the old title, so `grep -c "Escape and Space toggle pause"` printed 1 instead of 0.
- **Fix:** Reworded the comment to "replaces the old Escape/Space pause test of plan 01-08 (D-27 / CTRL-04 reworded…)". Fixed before the Task 1 commit.
- **Commit:** `085eefd`

**2. [Rule 2 - Correctness] Stale doc comment in cameraView.ts**
- **Found during:** Task 2
- **Issue:** The `rotateCamera` doc comment in `src/render/cameraView.ts` still said ArrowLeft / ArrowRight rotate. The file is not in the plan's `files_modified` list.
- **Fix:** Comment-only change: "-1 = Z / ⟲, +1 = C / ⟳ (D-19 revised 15/09/2026: arrow keys move, D-27)". No code change.
- **Commit:** `11ca704`

`loop.ts`, `touchButtons.ts` and `joystick.ts` were not touched. No packages were added.

## Threat model coverage

- T-01-22-01 (shortcuts swallowed): `classifyKey` returns null when a modifier is held, and preventDefault runs only after classification (Space and the Arrow codes). The e2e test checks that a Ctrl+KeyZ keydown has `defaultPrevented false`.
- T-01-22-02 (accidental pause from a Ctrl combo): covered by 12 `createCtrlTap` unit cases, plus the e2e Ctrl+Z, Ctrl+click and Ctrl+ArrowUp checks.
- T-01-22-03 (typed text drives the game): the `isTypingTarget` guard is in keyboard.ts, cameraKeys.ts and debugHud.ts, and its unit cases pass. The in-browser typing e2e test comes with plan 01-27.
- T-01-22-04 (stuck key): keyup always removes the code from the held set; blur and a hidden tab clear held keys and reset the tap.

## Known Stubs

- `KEY_HINTS` in `src/logic/keyMap.ts` is exported but not rendered yet. This is intentional: plan 01-25 (key hint panel, D-28) renders it.

## Notes for later plans

- 01-24 (swing always plays): Space and E both set `interactQueued` on a non-repeat press. The swing hooks in where that flag is consumed; keyboard.ts does not need changes.
- 01-27 (NPC name inputs): typing in a text input is already ignored by movement, action, rotation, the HUD toggle and pause. Only Escape passes through, and it toggles pause. If Escape inside a name field should only blur the field, 01-27 needs to decide that.
- Fullscreen: the browser consumes Escape to leave fullscreen, so a lone Ctrl is the reliable settings key there (planner note, not e2e-testable in headless).

## Self-Check: PASSED

- FOUND: src/logic/keyMap.ts, tests/unit/keyMap.test.ts
- FOUND commits: 085eefd, 11ca704

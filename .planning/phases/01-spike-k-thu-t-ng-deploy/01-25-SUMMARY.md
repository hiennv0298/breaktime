---
phase: 01-spike-k-thu-t-ng-deploy
plan: 25
subsystem: ui-hints
tags: [key-hints, d-28, ctrl-06, tech-06, localStorage, touch, hud, vitest, playwright, tdd]
requires:
  - "01-22: KEY_HINTS rows in src/logic/keyMap.ts (←↑→↓ đi, Space đánh, Ctrl/Esc settings, Z/C xoay)"
  - "01-08 / 01-09: touch zone, [data-hud-button] context/pause/rotate buttons, isTouchUi(), body.portrait layout"
  - "01-11: createPauseMenu(...).addSection, createQualityControls, QUALITY_STORAGE_KEY try/catch pattern"
  - "01-24: [data-hud-panel] clicks never swing (pointerPick NOT_GAME_AREA)"
provides:
  - "src/logic/uiPrefs.ts: KEY_HINTS_STORAGE_KEY 'bt.keyHints', TOUCH_HINT_SEEN_KEY 'bt.touchHintSeen', KEY_HINT_DIM_MS 4000, KEY_HINT_DIM_OPACITY 0.3, TOUCH_HINT_MS 6000, parseKeyHintsPref, serializeKeyHintsPref, shouldShowTouchHint"
  - "src/ui/keyHints.ts: KeyHints { enabled, setEnabled, onChange }, createKeyHints() (mount-once), createKeyHintsSection(hints), suppressKeyHints(on)"
  - "DOM: aside#key-hints[data-hud-panel] (.row × 4, class dim), div#touch-hint[data-hud-panel][aria-live=polite], button#key-hints-toggle[aria-pressed]"
  - "__bt.keyHints { enabled, visible, dimmed, touchUi, touchHintVisible, storageOk }"
  - "[data-hud-button] opacity 0.6 (0.95 while :active)"
  - "tests/unit/uiPrefs.test.ts (6 cases), tests/e2e/keyHints.spec.ts (3 desktop + 2 mobile-emu)"
affects: [01-17, 01-18, 01-26, 01-27]
tech-stack:
  added: []
  patterns:
    - "Storage values go through pure parse rules where only one literal flips the default, so an edited or garbage value falls back safely"
    - "Hover restore is pure CSS (.dim:hover); JS only adds the dim class once after a timer"
    - "Overlay hint placement is proven by rect checks against every visible [data-hud-button], in both orientations, with a >= 4 button guard so an empty list cannot pass"
key-files:
  created: [src/logic/uiPrefs.ts, tests/unit/uiPrefs.test.ts, tests/e2e/keyHints.spec.ts, src/ui/keyHints.ts, src/ui/keyHints.css]
  modified: [src/ui/hud.css, src/game/loop.ts]
decisions:
  - "01-25: only the literal '0' in bt.keyHints turns the panel off and only '1' in bt.touchHintSeen marks the hint seen; any other value means the default"
  - "01-25: the touch hint is decided once at loop start (touch UI + not seen + not suppressed); a touch laptop that switches to touch later gets no hint, because the same first touch would dismiss it"
  - "01-25: bt.touchHintSeen is written when the hint is shown, not when it is dismissed, so a reload mid-hint does not show it again"
  - "01-25: the panel stays in the DOM under the open pause menu (z 150 < 400); the toggle hides it at once"
  - "01-25: suppressKeyHints(on) is a module flag honoured even before createKeyHints, for the 01-17 bench / 01-18 soak; it never writes storage"
metrics:
  duration: "~10 min (12:44Z to 12:54Z)"
  completed: 2026-09-15
  tasks: 2
  files: 7
---

# Phase 1 Plan 25: Key hint panel and touch hint Summary

Desktop players get a bottom-left key panel built from the 01-22 `KEY_HINTS` rows. It dims to 30% after 4 s and comes back when the mouse is over it. A "Bảng phím" toggle in the pause menu turns it off, and the choice is saved in `bt.keyHints`. Touch players get HUD buttons at 60% opacity and a one-time hint line in the right half. The line hides after 6 s or on the first touch. Every storage access is inside try/catch, so the game still runs when storage throws.

## What was built

- **Pure rules (`src/logic/uiPrefs.ts`)**: storage keys, timing constants and three value functions. The file uses no DOM, storage or three.js. The grep gate prints 0.
- **`src/ui/keyHints.ts`**:
  - `createKeyHints()` mounts `aside#key-hints` with one `div.row` per `KEY_HINTS` entry (a `kbd` plus a `span`, set with textContent) and `div#touch-hint`. Both carry `data-hud-panel`.
  - Panel visible = enabled, not suppressed and not touch UI.
  - One window capture `pointerdown` listener handles the first touch: it records the touch, dismisses the hint, hides the panel, then removes itself.
  - A `(pointer: coarse)` media-query change re-applies visibility.
- **Pause menu**: `createKeyHintsSection` adds the "Hướng dẫn phím" label and `#key-hints-toggle`. Its `aria-pressed` follows `onChange`. `loop.ts` adds it after the quality section and reuses the menu from `startLoop`, so no second menu is created.
- **CSS**: `#key-hints` sits at z 150 with `rgba(0,0,0,0.55)`, a 250 ms opacity transition, `.dim` 0.3 and `.dim:hover` 1. `#touch-hint` spans from `left: 50%` to `right: safe+16px`, is vertically centred and has `pointer-events: none`. In `hud.css`, `[data-hud-button]` is at opacity 0.6 and 0.95 while `:active`; sizes and positions are unchanged.

## Verification evidence

| Gate | Result |
|------|--------|
| Task 1 RED | UNIT_GREEN (6/6), BUILD_OK, E2E_RED: 5 failed on `#key-hints` / `#touch-hint` not found and `#btn-context` opacity 1 > 0.7 |
| uiPrefs banned-API grep | 0 |
| keyHints.spec after Task 2 | 5 passed (3 desktop + 2 mobile-emu), 5 skipped by project |
| `npm run typecheck` | TYPECHECK_OK |
| `npx vitest run` | 32 files, 414/414 passed |
| `npm run build` | BUILD_OK |
| `npm run size` | SIZE_GATE_OK totalRaw=7278170 files=53 (gzip 2740027) |
| `npx playwright test` | 73 passed, 57 skipped, 0 failed (68 before + 5 new; orientation, hud, controls and swing all still green) |
| localStorage in keyHints.ts | lines 45 and 53, both inside `try`; the only other hit is a doc comment; `try` count 3 |
| `data-hud-panel` / `KEY_HINTS` / `opacity: 0.6` | 3 / 6 / 1 |
| innerHTML/outerHTML/insertAdjacentHTML in src | 0 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Non-vacuous checks] Extra assertions in keyHints.spec**
- **Found during:** Task 1
- **Issue:** Some behaviour checks could pass vacuously. The overlap loop passes on an empty button list. The portrait placement check proves nothing if the layout never switched to portrait.
- **Fix:** Added a guard that the visible `[data-hud-button]` count is at least 4, a check that `body.portrait` is set after the 390x844 resize, and checks of the `data-hud-panel` attribute and the `__bt.keyHints` fields (`touchUi`, `visible`, `touchHintVisible`, `storageOk`) on both projects.
- **Files modified:** tests/e2e/keyHints.spec.ts
- **Commit:** 60aa835

### Small implementation choices inside the plan's latitude

- The plan describes two window capture listeners: one dismisses the hint, one re-checks the panel on touch. They are merged into one first-touch listener that does both and then removes itself. Once a touch is seen, `isTouchUi()` stays true for the page, so a listener that kept running would do nothing new.
- `storageOk` also turns false when a write fails (setEnabled, or recording that the hint was seen), not only when the start-up read fails.
- `setEnabled` writes storage even when the value is unchanged, but notifies listeners only on a real change.

## TDD Gate Compliance

- RED: `test(01-25)` 60aa835. The unit test failed first on the missing module, then went 6/6 green with the pure rules. The e2e had 5 failing.
- GREEN: `feat(01-25)` 006d6f7 comes after it, with the full suite green.

## Known Stubs

None. `suppressKeyHints` has no caller yet. It is the planned hook for the 01-17 bench and the 01-18 soak.

## Notes for verification

- CTRL-06 and TECH-06 are NOT marked complete in REQUIREMENTS.md. The operator still has to check the panel fade/hover, the button opacity and the touch hint wording on the reference phones.
- The hint text is 'Chạm nửa trái màn hình để đi · nút tròn để đánh · nút tạm dừng để mở cài đặt'. In portrait it wraps to about 6 lines in the right half; e2e confirms it clears every button, but readability is for the phone check.

## Self-Check: PASSED

- FOUND: src/logic/uiPrefs.ts, tests/unit/uiPrefs.test.ts, tests/e2e/keyHints.spec.ts, src/ui/keyHints.ts, src/ui/keyHints.css
- FOUND commits: 60aa835, 006d6f7

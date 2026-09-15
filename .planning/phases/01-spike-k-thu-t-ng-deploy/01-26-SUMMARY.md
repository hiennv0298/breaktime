---
phase: 01-spike-k-thu-t-ng-deploy
plan: 26
subsystem: npc-settings
tags: [npc-names, d-29, d-31, ctrl-07, tech-06, localStorage, xss, sanitize, labels, vitest, playwright, tdd]
requires:
  - "01-23: MAX_NPCS 10, ?npcs clamp 0..10, routes for NPCs 9-10, rigid SkinnedMesh characters"
  - "01-24: game-area clicks swing; overlays must not take clicks (labels use pointer-events none)"
  - "01-25: try/catch localStorage pattern (keyHints readStored/writeStored), throwing-Storage e2e pattern"
provides:
  - "src/logic/npcSettings.ts: MAX_NPCS, DEFAULT_NPCS, NPC_NAME_MAX 16, NPC_SETTINGS_KEY 'bt.npcs', NPC_SETTINGS_MAX_RAW 4096, NpcSettings, NpcSettingsSource, sanitizeNpcName, normalizeNpcSettings, parseNpcSettings, serializeNpcSettings, npcCountFromQuery (number | null), resolveStartNpcSettings(search, storedRaw, forcedCount?)"
  - "src/game/npcSettingsStore.ts: readNpcSettingsRaw() { raw, storageOk }, writeNpcSettings(s): boolean (used by 01-27)"
  - "src/ui/npcLabels.ts: NpcLabels { setText, place, hide, snapshot }, createNpcLabels(root, capacity)"
  - "src/game/game.ts: CreateGameOptions { forcedNpcCount }, createGame(ctx, opts = {}), Game.npcSettings()"
  - "DOM: div#npc-labels[aria-hidden=true] with div.npc-label[data-npc] (z 90, pointer-events none)"
  - "__bt.npcSettings { count, names, source, storageOk }, __bt.npcLabels [{ index, text, visible, x, y }], __bt.npcs[] gains name + lazy screen { x, y }"
  - "tests/unit/npcSettings.test.ts (25 cases), tests/e2e/npcNames.spec.ts (6 desktop tests)"
affects: [01-27, 01-17, 01-18]
tech-stack:
  added: []
  patterns:
    - "Name text crosses into the DOM only through textContent; the e2e seeds an <img onerror> payload and asserts no element, no dialog"
    - "Settings resolution is pure and takes the raw stored string, so every fallback (null, oversized, bad JSON, wrong version, throwing storage) is unit-tested without a browser"
    - "Overlay tags are projected in frameUpdate after cameraView.update with camera.updateMatrixWorld() so they do not trail the camera by a frame; style.transform is written only when the rounded pixel changes"
key-files:
  created: [src/logic/npcSettings.ts, tests/unit/npcSettings.test.ts, tests/e2e/npcNames.spec.ts, src/game/npcSettingsStore.ts, src/ui/npcLabels.ts, src/ui/npcLabels.css]
  modified: [src/game/game.ts]
decisions:
  - "01-26: start count precedence is finite forcedNpcCount > ?npcs= > valid stored 'bt.npcs' > 3; forced and query both report source 'query'; names always come from the stored record, so ?npcs never hides saved names"
  - "01-26: npcCountFromQuery moved to src/logic/npcSettings.ts and now returns null when absent or unparsable (the default is applied by resolveStartNpcSettings); game.ts re-exports only MAX_NPCS / DEFAULT_NPCS"
  - "01-26: a stored record is valid only as a plain object with v === 1 and raw length <= 4096; a valid record with a bad count still counts as 'stored' (count normalises to 3 or clamps)"
  - "01-26: tag anchor is foot() + 1.85 m while walking/dwelling/recovering and torso pos() + 0.9 m while a ragdoll; hidden when projected z > 1 or |ndc| > 1.1"
  - "01-26: D-31 content risk (player-typed real names) accepted for the play-test build only; must be replaced by a preset list or filter before the Phase 8 CrazyGames submission"
metrics:
  duration: "~15 min (12:57Z to 13:12Z)"
  completed: 2026-09-15
  tasks: 2
  files: 7
---

# Phase 1 Plan 26: Saved NPC count and names with safe name tags Summary

The office now starts with the NPC count (0–10) and names saved in `localStorage['bt.npcs']`. Each named coworker carries a name tag above its head while it walks and while it flies as a ragdoll. Names are cleaned first: NFC, controls and bidi/zero-width characters stripped, whitespace collapsed, and a 16 code point limit. Tags are set with `textContent` only. Corrupt, oversized or tampered storage, or storage that throws, falls back to 3 unnamed NPCs without an error. `?npcs=` still overrides the saved count, and `createGame(ctx, { forcedNpcCount })` overrides both for the bench and soak. Names never go over the network. The settings screen that writes these values is plan 01-27.

## What was built

- **Pure model (`src/logic/npcSettings.ts`)**:
  - `sanitizeNpcName` works in this order: non-string gives `''`, slice to 256 UTF-16 units, `normalize('NFC')`, `\t\n\r` become spaces, strip U+0000–001F, U+007F–009F, U+00AD, U+061C, U+180E, U+200B–200F, U+2028–202E, U+2060–206F and U+FEFF, collapse `\s+`, trim, cut to 16 code points with `Array.from`, trimEnd.
  - `normalizeNpcSettings` keeps a count only when it is a finite number (trunc, clamp 0..10); otherwise the count is 3. It always returns 10 sanitised names.
  - `parseNpcSettings` checks the 4096-character cap before `JSON.parse` (inside try/catch), then requires a plain object with `v === 1`.
  - `serializeNpcSettings` normalises again and writes `{"v":1,"count":n,"names":[…10]}`.
  - The header comment records D-29 (names stay local) and D-31 (content risk accepted for the play-test only, review before Phase 8).
- **Storage (`src/game/npcSettingsStore.ts`)**: each `localStorage` call has its own try/catch. There is no other storage or network code.
- **Labels (`src/ui/npcLabels.ts` + `.css`)**:
  - One `#npc-labels` layer (fixed, inset 0, z 90 under `#touch-zone`, `pointer-events: none`, `aria-hidden`).
  - Labels are created lazily. `setText` uses textContent, and an empty text hides the label.
  - `place` rounds to whole pixels and writes `translate(Xpx, Ypx) translate(-50%, -100%)` only when the pixel changed.
  - Styling: 12em ellipsis, 600 13px system-ui, white on `rgba(0,0,0,0.55)`.
- **Game wiring (`src/game/game.ts`)**:
  - `createGame(ctx, opts = {})` calls `resolveStartNpcSettings(location.search, readNpcSettingsRaw().raw, opts.forcedNpcCount)` once and spawns `settings.count` NPCs through the unchanged route loop. `main.ts` still calls `createGame(ctx)`.
  - `updateLabels()` runs in `frameUpdate` right after `cameraView.update`. It returns at once when no spawned NPC has a name.
  - Added `Game.npcSettings()`, debug keys `npcSettings` and `npcLabels`, and `name` + lazy `screen` on `__bt.npcs[]`.

## Verification evidence

| Gate | Result |
|------|--------|
| Task 1 RED | UNIT_GREEN (25/25), BUILD_OK, E2E_RED: 6 failed waiting for `__bt.npcSettings` / `__bt.npcLabels` (not "No tests found") |
| Task 1 grep | pure-model gate (localStorage/document./window./fetch(/three) = 0 after rewording one doc comment; "NFC", "4096", "'bt.npcs'", "D-31" present |
| Task 2 names e2e | 6/6 passed; `--repeat-each=4` 24/24 passed |
| Full suite | TYPECHECK_OK; vitest 33 files / 439 tests passed; `npm run build` OK; `npm run size` SIZE_GATE_OK totalRaw=7281831 files=54; `npx playwright test` 79 passed, 63 skipped, 0 failed (no " failed" line) |
| innerHTML gate | innerHTML / outerHTML / insertAdjacentHTML in src (non-comment lines) = 0 |
| No-network gate | fetch(/XMLHttpRequest/sendBeacon/WebSocket/EventSource in the three new modules = 0; e2e: every request same-origin, only GET/HEAD after playing, no URL or body contains "Sếp" / "S%E1%BA%BFp" |
| Store gate | both `localStorage` code lines sit inside `try` blocks; `grep -c try` = 3 |
| game.ts gate | `resolveStartNpcSettings(` = 1, `forcedNpcCount` = 3, `labels.place(` = 1; `textContent` in npcLabels.ts = 2 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The Write tool turned `\uXXXX` escapes into raw characters**
- **Found during:** Task 1 (GREEN run)
- **Issue:** The strip regex and the unit-test strings were written with `\u0000…\uFEFF` escapes, but the files on disk held literal invisible characters (including NUL and U+2028). Vite/oxc rejected `npcSettings.ts` with a parse error.
- **Fix:** A temporary Node script (`%TEMP%/bt-escape.cjs`) re-escaped the control, bidi, format and combining characters as `\uXXXX` in both files, and the files were checked again. A duplicated `'Tết'` assertion left by the unescape was replaced with a code point check (U+1EBF).
- **Files modified:** src/logic/npcSettings.ts, tests/unit/npcSettings.test.ts
- **Commit:** 6f890c7

**2. [Rule 1 - Bug] Labels would trail the camera by one frame**
- **Found during:** Task 2
- **Issue:** `cameraView.update` moves the camera with `lookAt` plus a shake offset, but `matrixWorldInverse` is only refreshed inside `renderer.render`. Projecting right after it would use the previous frame's view.
- **Fix:** `updateLabels()` calls `ctx.camera.updateMatrixWorld()` before projecting, and only when at least one named NPC exists.
- **Commit:** b1fb422

**3. [Minor] `npcCountFromQuery` is not re-exported from game.ts**
- The plan kept re-exports only for `MAX_NPCS` / `DEFAULT_NPCS`. The function's return type changed to `number | null`, and nothing imported it from game.ts (grep), so it is imported only from `src/logic/npcSettings.ts`.

## Known Stubs

- `writeNpcSettings` is exported but has no caller yet. This is intended: plan 01-27 (settings stepper, name inputs, Apply) is its first caller. Until then, saved values come only from storage that already exists, as in the e2e seeding.

## Threat Flags

None. No new network endpoint, auth path or server surface. The only new trust boundary (`bt.npcs` → DOM) is T-01-26-01..06 in the plan and is mitigated as registered. T-01-26-07 (D-31) stays **accepted** for the play-test build and must be reviewed before the Phase 8 CrazyGames submission.

## Requirements

CTRL-07 and TECH-06 are **not** marked complete. The settings UI (01-27) and the remaining TECH-06 plans are still open, per operator instruction.

## Self-Check: PASSED

- FOUND: src/logic/npcSettings.ts, tests/unit/npcSettings.test.ts, tests/e2e/npcNames.spec.ts, src/game/npcSettingsStore.ts, src/ui/npcLabels.ts, src/ui/npcLabels.css
- FOUND: 6f890c7 (test RED), b1fb422 (feat GREEN)

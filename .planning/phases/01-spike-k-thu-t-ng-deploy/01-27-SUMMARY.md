---
phase: 01-spike-k-thu-t-ng-deploy
plan: 27
subsystem: npc-settings
tags: [npc-settings, d-29, d-27, d-16, ctrl-07, ctrl-04, tech-06, pause-menu, ragdoll, pool, ios, playwright, tdd]
requires:
  - "01-26: normalizeNpcSettings / sanitizeNpcName / MAX_NPCS, writeNpcSettings(s): boolean, createNpcLabels, Game.npcSettings(), createGame forcedNpcCount"
  - "01-25: pause-menu section pattern (createKeyHintsSection), [data-hud-panel] key hint panel"
  - "01-22: isTypingTarget guards in keyboard.ts / cameraKeys.ts / debugHud.ts; Escape passes through text fields"
  - "01-15: pooled 6-body ragdoll (activate/deactivate/sync), beginRecover world-preserving re-attach"
provides:
  - "src/game/npc.ts: Npc.active(), Npc.despawn(), Npc.respawn(spawn)"
  - "src/game/game.ts: grow-only NPC pool (ensureNpc / activateNpc / deactivateNpc / spawnPointFor), Game.applyNpcSettings(s)"
  - "src/ui/npcSettingsSection.ts: createNpcSettingsSection({ initial, onApply }) → section.npc-section"
  - "src/ui/settings.css: stepper, name fields (16 px, user-select text, touch-callout default), 2-column grid on wide panels"
  - "src/boot/pageHardening.ts: contextmenu / dblclick allowed on input and textarea"
  - "DOM: #npc-count-dec, output#npc-count-value, #npc-count-inc, input.npc-name[data-index] ×10, #npc-apply, #npc-apply-status"
  - "__bt.npcSettings now reports the live count / names / source ('manual' after Apply); __bt.npcs lists active NPCs only; __bt.ragdolls stays the pool total"
  - "tests/e2e/npcSettings.spec.ts (7 desktop + 1 mobile-emu)"
affects: [01-17, 01-18]
tech-stack:
  added: []
  patterns:
    - "Runtime population changes go through a grow-only pool: create once, then despawn (disable + hide) / respawn, never remove Rapier bodies"
    - "Late-created pool members register their shadow and targeting candidate through a wire hook installed after setup, so startup creation order (and body handle order) is unchanged"
    - "The settings UI normalises on Apply and writes the cleaned values back into the fields; the module owns no storage and no network, the caller reports the save result"
key-files:
  created: [tests/e2e/npcSettings.spec.ts, src/ui/npcSettingsSection.ts, src/ui/settings.css]
  modified: [src/game/npc.ts, src/game/game.ts, src/game/loop.ts, src/boot/pageHardening.ts]
decisions:
  - "01-27: Escape typed inside an NPC name field still closes the menu (01-22 guard kept); every other key stays in the field (Space, arrows, Z/C, backquote, WASD, lone Ctrl)"
  - "01-27: the ?npcAt pin applies only to NPC 0 created at page start; an NPC 0 created or respawned by Apply stands on its route spawn"
  - "01-27: __bt.npcSettings.storageOk and Game.npcSettings().storageOk still describe the start-up read; the result of a save is shown only in #npc-apply-status"
  - "01-27: the two-column name grid uses a definite section width min(520px, 100vw - 96px) plus a 616 px viewport media query instead of a container query (a container-type section would lose its intrinsic width and never widen the panel)"
  - "01-27: the name input maxLength is 32 UTF-16 units so a Vietnamese IME composition is never cut; names are cleaned to 16 code points on Apply"
metrics:
  duration: "~31 min (13:16Z to 13:47Z)"
  completed: 2026-09-15
  tasks: 3
  files: 7
---

# Phase 1 Plan 27: NPC settings section with in-place apply Summary

The settings menu (opened with Ctrl, Esc or ⏸) now has an "NPC trong văn phòng" section. It has a − / + stepper for 0–10 NPCs, a name field for each visible NPC, and an "Áp dụng" button. Apply cleans the names with the 01-26 rules, writes the cleaned text back into the fields, saves to `bt.npcs`, and changes the office at once, even while paused. NPCs above the new count despawn; a flying ragdoll is put back together first. Missing NPCs respawn on their routes, or are created the first time. NPCs that stay keep their state and only get the new name. The pool only grows and stops at 10 NPCs, so repeated Apply never adds Rapier bodies beyond 60 ragdoll bodies. When storage throws, Apply still works and the menu says the choice was not saved. On phones the name fields use a 16 px font and allow text selection and long-press paste, and the panel scrolls to every field in both orientations.

## What was built

- **`src/game/npc.ts`**:
  - An `isActive` flag with `active()`.
  - `despawn()`: if the NPC is a ragdoll, sync the ragdoll, `deactivate()` it, `updateMatrixWorld` and re-attach the parts in `reattachOrder`. In every mode it then resets the parts to `idlePose`, resets the get-up state, freezes the walker, disables the capsule and hides the root.
  - `respawn(spawn)`: new walker at `startIndex`, yaw 0, capsule teleported and enabled, root shown, `setMotion('idle', 0)`.
  - `slappable()` is false while inactive, and `fixedUpdate` / `frameUpdate` return immediately.
- **`src/game/game.ts`**:
  - `pool` (grow-only) plus `npcs` (active slots 0..count-1). `ensureNpc(i)` creates exactly what the old startup loop did.
  - Startup creation stays where it was. Shadows and targeting candidates for later NPCs register through `wireNpc`, installed after setup.
  - `activateNpc` respawns at `spawnPointFor(i)` and re-adds the blob. `deactivateNpc` despawns, removes the blob handle and hides the tag.
  - `applySettings` normalises, walks all 10 slots, rebuilds `npcs`, updates names, tags and source, then calls `refreshTarget()` so a despawned glowing NPC stops glowing while paused.
  - `Game.applyNpcSettings` calls it with source `'manual'`.
- **`src/ui/npcSettingsSection.ts`**: createElement / textContent / value only.
  - The stepper disables at 0 and 10, and rows at or above the count are `hidden`.
  - Enter in a field (not while composing) runs Apply.
  - A focused field scrolls into view (`block: 'nearest'`).
  - Status text is "Đã lưu trên máy này" or "Không lưu được (trình duyệt chặn lưu) — chỉ áp dụng lần này".
- **`src/game/loop.ts`**: the section is added after the key hints section. `onApply` runs `writeNpcSettings(s)`, then `game.applyNpcSettings(s)`, and returns `{ saved }`. This makes it the first caller of `writeNpcSettings`, which resolves the 01-26 known stub.
- **`src/ui/settings.css`**:
  - 48 px stepper and Apply buttons.
  - Name inputs: 44 px tall, 16 px font, `-webkit-user-select: text`, `user-select: text`, `-webkit-touch-callout: default`, focus border `#ffc83d`.
  - `label.npc-name-row[hidden]` is `display: none`, and the grid has 1 column, or 2 once the section reaches 520 px.
- **`src/boot/pageHardening.ts`**: contextmenu and dblclick are not cancelled when the target is inside an `input` or `textarea`. The gesturestart and touchmove rules are unchanged.

## Verification evidence

| Gate | Result |
|------|--------|
| Task 1 RED | BUILD_OK, E2E_RED: 7 failed waiting for `#npc-count-value` / `input.npc-name` / `#npc-count-inc` (not "No tests found"); the key hint regression passed (existing contract) |
| Task 2 slice | TYPECHECK_OK, UNIT_OK, BUILD_OK; `-g "shrinking\|renaming\|overridden\|storage failure\|key hint"` 5/5; npc + slap + characters + npcNames 16 passed; "set ten" + "typing" 2/2 |
| Task 2 greps | `despawn(` in npc.ts = 3; `.despawn(` in game.ts = 1; removeRigidBody/removeCollider/removeImpulseJoint in game.ts = 0; `applyNpcSettings(` in loop.ts = 1; `textContent` in section = 8 |
| Full suite (Task 3) | TYPECHECK_OK; vitest 33 files / 439 tests passed; `npm run build` OK; `npm run size` SIZE_GATE_OK totalRaw=7287495 files=54; `npx playwright test` **87 passed, 71 skipped, 0 failed** (79 before + 8 new; orientation page-hardening test still green); no " failed" line |
| Task 3 greps | `font-size: 16px` = 1; `user-select: text` = 2; innerHTML/outerHTML/insertAdjacentHTML in src (non-comment) = 0; fetch/XMLHttpRequest/sendBeacon/WebSocket in the section module = 0 |
| Raw control chars | 0 in every new or edited file (Node scan, 01-26 Write-tool bug check) |
| Screenshots (local preview) | desktop 1280x720 and landscape 844x390: section 520 px, 2 columns; portrait 390x844: section 294 px, 1 column; Áp dụng reachable by scrolling |

The e2e checks cover the must-haves:
- Ten NPCs appear within 1 s while paused.
- Names clean to 'Sếp Tùng' / 'ABCDEFGHIJKLMNOP' and are written back into the fields.
- Storage holds count 10, and after reload the source is 'stored' with ≤ 200 bodies.
- Shrinking to 0 during a ragdoll leaves ragdolls.active 0 and shadows at the recorded count − 3; props and debris are unchanged.
- Growing to 10 gives 60 bodies, and re-applying keeps 60.
- After resume, all 10 NPCs are finite, inside the room and walking or dwelling.
- A renamed ragdoll keeps flying and gets up with its tag.
- Apply overrides `?npcs`.
- With throwing storage, Apply shows "Không lưu được".
- A key-panel click does not swing; a game-view click does (negative control).
- In the phone test, the field computes to user-select text at 16 px, contextmenu on it is not prevented, and the portrait menu scrolls field 4 and Áp dụng into view.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Non-vacuous checks] Stronger assertions in npcSettings.spec**
- **Found during:** Task 1
- **Issue:**
  - "Type then press ArrowLeft, Space" cannot keep `value contains 'Zz Cc\` WASD'`, because the space lands inside the text.
  - A plain click on a disabled + button waits until the test times out.
  - A key-panel click that never swings passes even when clicks swing nowhere.
  - The phone paste claim had no check.
- **Fix:**
  - The value is asserted right after typing (`'Zz Cc\` WASD'`) and again after the presses (`'Zz Cc\` WAS D'`). This proves the caret moved and Space was typed, not swallowed.
  - The + button is asserted disabled, then force-clicked, and the count stays 10.
  - A game-view click must bring `swing.count` to 1.
  - The mobile test dispatches contextmenu on the field and expects it not prevented, and checks that row 4 is hidden at count 4.
- **Files modified:** tests/e2e/npcSettings.spec.ts
- **Commit:** afbe996

### Implementation choices inside the plan's latitude

- **Grid width:** the plan's "two columns when the panel is at least 520 px wide" is done with a definite section width of min(520px, 100vw − 96px) and a 616 px media query. CSS cannot query an ancestor's width without container queries, and a `container-type` section loses its intrinsic width.
- **Startup creation order:** startup NPCs are still created before shadows, shards and targeting, as before, so Rapier body handle order is unchanged. Only NPCs created later by Apply use the wire hook.
- **Tags above the count:** labels for slots at or above the count are hidden, not cleared, so no extra empty label elements are created.
- **Save health:** `storageOk` in `__bt.npcSettings` still describes the start-up read, and the save result is shown in the status line (decision recorded).

## Known Stubs

None. `writeNpcSettings`, the 01-26 stub, now has its caller in loop.ts. The `placeholder` text "Tên NPC n" is the real field hint, not a stub.

## Deferred Issues

Logged in `deferred-items.md` (out of scope, not fixed):
- In mobile-emu landscape the pause panel measured 391 px tall against `max-height: 90dvh` (351 px). It still scrolls, and every field is reachable (e2e). Check on the reference phones.
- The pause-menu `.sections` container has no gap, so section labels touch the previous section. Cosmetic.

## Notes for verification

- **HUD bodies:** the HUD body count does not drop after lowering the NPC count. Pooled NPC bodies stay in the world, disabled; this was accepted in planner note #8. `__bt.ragdolls.bodies` is the pool total.
- **Real-device checks (operator):**
  - iPhone Safari: typing in a name field without page zoom, long-press paste, the on-screen keyboard not covering the focused field, and panel scrolling in both orientations.
  - Android: the same flow from the ⏸ button.
- **Requirements:** CTRL-07, CTRL-04 and TECH-06 are **not** marked complete in REQUIREMENTS.md, per operator instruction (real-device check pending).
- **D-31:** the content risk of typed real names stays accepted for the play-test build and must be reviewed before the Phase 8 submission.

## Threat Flags

None. The new surface is the name fields → labels / localStorage (T-01-27-01, 04, 06), Apply → physics world (T-01-27-02, 03) and storage failure (T-01-27-05). All of it is in the plan's threat register and mitigated as registered. There is no new network, auth or server surface.

## TDD Gate Compliance

- RED: `test(01-27)` afbe996. 7 of 8 tests failed on missing DOM, and the passing one is a regression test of an existing contract.
- GREEN: `feat(01-27)` dac1fb4 (count flow, pool, apply) and `feat(01-27)` 816b8ab (phone fields), both after RED, with the full suite green.

## Self-Check: PASSED

- FOUND: tests/e2e/npcSettings.spec.ts, src/ui/npcSettingsSection.ts, src/ui/settings.css; modified src/game/npc.ts, src/game/game.ts, src/game/loop.ts, src/boot/pageHardening.ts
- FOUND commits: afbe996, dac1fb4, 816b8ab

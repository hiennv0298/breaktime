---
phase: 02-npc-dong-nghiep
plan: 04
subsystem: roster-logic
tags: [roster, bt.roster, migration, g4, d-01, d-02, d-03, d-04, d-10, npc-01, npc-02, npc-05, npc-06, keymap, prototype-pollution, vitest, tdd]
requires:
  - "01-26: src/logic/npcSettings.ts sanitizeNpcName, parseNpcSettings (bt.npcs v1, 10 names)"
  - "01-22: src/logic/keyMap.ts classifyKey / BINDINGS (modifier rule: Meta/Alt or Ctrl on a non-Control key -> null)"
  - "01-25: src/logic/uiPrefs.ts literal-only bt.keyHints rule"
  - "02-01: src/logic/temper.ts Temper, DEFAULT_TEMPER, isTemper"
  - "01-15: src/logic/rng.ts mulberry32 (tests only)"
provides:
  - "src/logic/roster.ts: ROSTER_KEY 'bt.roster', ROSTER_VERSION 1, ROSTER_MAX_MEMBERS 30, ROSTER_MAX_RAW 8192, NPC_CAP 15, NPC_LOOKS 'bcdefghijklmnopqr', ROSTER_DEFAULT_COUNT 3, LEGACY_SLOTS 10; RosterMember, Roster, RosterSource; defaultRoster, normalizeRoster, parseRoster, serializeRoster, migrateLegacyNpcs, rosterCountFromQuery, resolveStartRoster, presentMembers, onFloorMembers, maxOnFloor, addMember, removeMember, renameMember, setMemberLook, setMemberTemper, setMemberPresent, resetRoster, withSlotEdits"
  - "src/logic/quickNpc.ts: quickAdd, quickRemove, nextQuickCandidate"
  - "src/logic/presetNames.ts: PRESET_NAMES (32 frozen NFC nicknames), randomPresetName(rng, taken)"
  - "src/logic/keyMap.ts: KeyIntent += 'npc-add' | 'npc-remove'; Equal/NumpadAdd -> npc-add, Minus/NumpadSubtract -> npc-remove"
  - "src/logic/uiPrefs.ts: NPC_LABELS_STORAGE_KEY 'bt.npcLabels', parseNpcLabelsPref (raw !== '0'), serializeNpcLabelsPref"
affects: [02-06, 02-07, 02-08, 02-09]
tech-stack:
  added: []
  patterns:
    - "Whitelist normalisation: own-property reads (hasOwnProperty) into fresh { id, name, look, temper } literals, Set-based id lookups, no Object.assign / spread of parsed data"
    - "Every edit operation = normalizeRoster(fresh result); tests deep-freeze inputs so any mutation throws"
    - "One rng draw clamped to [0, size-1] (non-finite -> 0) for seeded picks"
key-files:
  created: [src/logic/roster.ts, src/logic/quickNpc.ts, src/logic/presetNames.ts, tests/unit/roster.test.ts, tests/unit/quickNpc.test.ts, tests/unit/presetNames.test.ts]
  modified: [src/logic/keyMap.ts, src/logic/uiPrefs.ts, tests/unit/keyMap.test.ts, tests/unit/uiPrefs.test.ts]
decisions:
  - "02-04: resolveStartRoster members = bench -> default members; else valid bt.roster ('stored') > valid bt.npcs migration ('migrated') > default; count = finite forcedCount (trunc, 0..15) > ?npcs= > the roster's own count, a forced/query count reports 'query' and is clamped to the present members; bench without any count keeps source 'default'"
  - "02-04: migrateLegacyNpcs = default roster (m1..m15, looks b..p, 15 present) with the 10 legacy names on m1..m10 and the legacy count; bt.npcs is never serialised by any roster function"
  - "02-04: addMember id = smallest free m<k>; look = first NPC_LOOKS letter unused by any member, else NPC_LOOKS[floor(rng() x 17)] clamped (rng not drawn while a look is free); present only while fewer than 15 are present; count unchanged"
  - "02-04: withSlotEdits(r, count, names): names[i] renames the i-th present member in roster order (unticked members skipped), members without a slot entry keep their names; finite count truncated and clamped to maxOnFloor, non-finite count keeps the current one; removed by plan 02-09"
  - "02-04: quickAdd brings in presentMembers[count] while count < min(15, present); quickRemove takes onFloorMembers[count-1] (LIFO); both return changed false / member null at the bounds"
  - "02-04: randomPresetName compares taken names after sanitizeNpcName (NFD or padded forms still count as taken); all 32 taken -> uniform over the full list"
  - "02-04: npc-add / npc-remove are bound in BINDINGS only; keyboard.ts (switch default no-op, no preventDefault), cameraKeys.ts (rotate only) and KEY_HINTS are unchanged until plan 02-08"
metrics:
  duration: "~10 min (21:03Z to 21:13Z)"
  completed: 2026-09-16
  tasks: 3
  files: 10
---

# Phase 2 Plan 04: Roster model, quick add/remove, preset names and +/− keys Summary

Pure coworker roster in `bt.roster` (≤ 30 members, 17 looks, temper, ≤ 15 present, first `count` present members on the floor) with hostile-input whitelisting, an 8192-character raw cap and a one-way migration from Phase 1 `bt.npcs` v1; plus LIFO quick add/remove, 32 NFC Vietnamese preset nicknames with a seeded pick, `Equal`/`NumpadAdd` → `npc-add` and `Minus`/`NumpadSubtract` → `npc-remove` key intents that stay browser keys under Ctrl/Meta/Alt, and the literal-only `bt.npcLabels` rule.

## What was built

### Task 1 — Roster schema, parsing, migration, start resolution (`src/logic/roster.ts`)
- `normalizeRoster` reads only own properties, scans at most 200 entries per array, keeps ≤ 30 members with ids `^m[0-9]{1,3}$` (first wins), names via `sanitizeNpcName`, look fallback `NPC_LOOKS[keptIndex % 17]`, temper fallback `normal`; `present` = known ids, de-duplicated, member order, ≤ 15; count = trunc finite clamped to `0..min(15, present)` else `min(3, present)`.
- `parseRoster` rejects non-strings, `''`, > 8192 chars (before `JSON.parse`), bad JSON, non-plain objects and `v !== 1` with `defaultRoster()`.
- Hostile payload test: `__proto__` / `constructor.prototype` / member `__proto__` → one member with exactly `id,look,name,temper`, present `['m1']`, count 1, `({} as Record<string, unknown>).polluted === undefined`, prototypes are `Object.prototype`.
- `serializeRoster` normalises and writes `{"v":1,"members":[…],"present":[…],"count":n}`; 30 members × 16-emoji names + 15 present stays ≤ 8192.
- Header documents: `bt.roster` is the only coworker key written; `bt.npcs` read-only (old `/b/<sha>/` builds share the origin, RESEARCH Pitfall 2); names stay on the device (D-04 / D-31 content risk, review before Phase 9).

### Task 2 — Edits, quick add/remove, preset names
- `addMember`, `removeMember`, `renameMember`, `setMemberLook` (one NPC_LOOKS letter, `'a'` rejected), `setMemberTemper`, `setMemberPresent`, `resetRoster`, `withSlotEdits` (doc comment names plan 02-09 as its remover).
- `src/logic/quickNpc.ts`: `nextQuickCandidate`, `quickAdd`, `quickRemove`.
- `src/logic/presetNames.ts`: the 32 planned names in order, frozen; `randomPresetName(rng, taken)`.

### Task 3 — Key intents and name-tag preference
- `keyMap.ts`: two new intents and four bindings; header notes D-02 wiring in plan 02-08. All existing keyMap tests unchanged and green; `KEY_HINTS` unchanged.
- `uiPrefs.ts`: `NPC_LABELS_STORAGE_KEY`, `parseNpcLabelsPref`, `serializeNpcLabelsPref` (no storage access).

## Verification evidence

| Gate | Result |
|------|--------|
| Task 1 `npx vitest run tests/unit/roster.test.ts` | 63/63 → `UNIT_GREEN`, `PURE_GATE 0` (incl. Object.assign) |
| Task 2 roster + quickNpc + presetNames | 100/100 → `UNIT_GREEN`, `PURE_GATE 0 NFC true`, `ROSTER_ASSIGN 0` |
| Task 3 keyMap + uiPrefs | 109/109 → `UNIT_GREEN` |
| `npm run typecheck` | rc 0 → `TYPECHECK_OK` |
| Full `npx vitest run` | 46 files, 736 tests passed → `ALL_UNIT_OK` |
| Control-character scan (10 files) | `CTRL_SCAN 0`, `UIPREFS_PURE_GATE 0` |
| `git diff --quiet -- src/input/keyboard.ts` | `KEYBOARD_UNTOUCHED` |
| three / @dimforge in the 5 logic files | none; all 5 files NFC |
| `npx vite build` + playwright controls / keyHints / npcSettings | build OK; 23 passed, 23 skipped (per-project desktop/mobile skips), 0 failed → `E2E_OK` |
| RED gates | each task's tests failed first (missing module / not a function / 8 failing cases) before implementation |

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 RED | 9ad7adb | test(02-04): add failing tests for roster schema, migration and start resolution |
| 1 GREEN | bb2ab84 | feat(02-04): implement roster schema, bt.roster parsing and one-way bt.npcs migration |
| 2 RED | a61671d | test(02-04): add failing tests for roster edits, quick add/remove and preset names |
| 2 GREEN | d417758 | feat(02-04): add roster edit operations, quick add/remove and preset nicknames |
| 3 RED | ae8ac1a | test(02-04): add failing tests for +/- key intents and bt.npcLabels rule |
| 3 GREEN | 2164f3a | feat(02-04): bind +/- to npc-add/npc-remove intents and add bt.npcLabels rule |

## TDD Gate Compliance

Each task has a `test(02-04)` commit followed by a `feat(02-04)` commit; no refactor commits were needed.

## Deviations from Plan

None - plan executed exactly as written. Points the plan left open were settled in code and tests and are listed under `decisions` (bench source without a count, `withSlotEdits` name mapping and non-finite count, rng clamping).

## Known Stubs

None. `withSlotEdits` is an intentional temporary adapter for the 01-27 settings section; plan 02-09 deletes it. The new `npc-add` / `npc-remove` intents are intentionally unhandled by `keyboard.ts` until plan 02-08.

## Threat Flags

None — no new network, storage-access, DOM or auth surface; all threat-register mitigations T-02-04-01..06 are implemented and unit-tested.

## Self-Check: PASSED

- FOUND: src/logic/roster.ts, src/logic/quickNpc.ts, src/logic/presetNames.ts, tests/unit/roster.test.ts, tests/unit/quickNpc.test.ts, tests/unit/presetNames.test.ts
- FOUND commits: 9ad7adb, bb2ab84, a61671d, d417758, ae8ac1a, 2164f3a

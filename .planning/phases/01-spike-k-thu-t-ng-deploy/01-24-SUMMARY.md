---
phase: 01-spike-k-thu-t-ng-deploy
plan: 24
subsystem: input-actions
tags: [swing, cooldown, d-30, d-18, d-20, d-28, input, animation, vitest, playwright, tdd]
requires:
  - "01-10: nearest-target picking, attachPointerPick on window (mouse left only, raycast against the highlighted object)"
  - "01-15: performSlap (hit-stop, shake, seeded rng), Player.slapAt holding 'attack-melee-right' for 0.45 s"
  - "01-22: key map (Space action, E secondary, Escape / lone Ctrl pause), loop drops interactQueued while paused"
  - "01-23: rigid SkinnedMesh characters; setMotion crossfade unchanged underneath"
provides:
  - "src/logic/swing.ts: SWING_COOLDOWN_MS = 350, SwingGate { tryStart(nowMs), count(), lastMs() }, createSwingGate(cooldownMs?)"
  - "Player.swing(towardX?, towardZ?) with clip restart; slapAt(x, z) delegates to it"
  - "CharacterInstance.setMotion(name, fadeSec?, { restart }) and CharacterInstance.motion()"
  - "attachPointerPick onPick(id | null): id = click hit the glowing object, null = any other game-area click"
  - "DOM contract: clicks inside [data-hud-button], [data-hud-panel], #pause-menu, button, input, textarea, select never swing (used by 01-25)"
  - "__bt.swing { count, hits, lastMs, cooldownMs, dropped }, __bt.player.motion"
  - "tests/unit/swing.test.ts (8 cases), tests/e2e/swing.spec.ts (6 desktop + 1 mobile-emu)"
affects: [01-25, 01-26, 01-17, 01-18]
tech-stack:
  added: []
  patterns:
    - "One pure cooldown gate in front of every action source (keys, context button, clicks); the gate is fed performance.now() by the caller, so it stays clock-free and unit-testable"
    - "A dropped press is counted (__bt.swing.dropped), so e2e cooldown checks can prove the gate was exercised instead of passing because presses merged into one frame"
    - "Game-area click = any mouse pointerdown outside a HUD/menu/form selector; the ray only decides hit vs swing-only, never whether to swing"
key-files:
  created: [src/logic/swing.ts, tests/unit/swing.test.ts, tests/e2e/swing.spec.ts]
  modified: [src/game/game.ts, src/game/player.ts, src/render/characters.ts, src/input/pointerPick.ts]
decisions:
  - "01-24: every action press (Space, E, #btn-context, game-area left-click) passes one SwingGate (350 ms); an accepted press always swings; a key/context press hits the current target, a click hits only if its ray hit the object that is still the target at the next fixed step; otherwise swing only"
  - "01-24: a press inside the cooldown is dropped (not queued) and does not extend the cooldown; the first press is always accepted; non-finite times are rejected; a negative/NaN cooldown falls back to 350"
  - "01-24: a swing toward a prop turns the player toward it; a swing with no target keeps the current facing (no turn toward the click point)"
  - "01-24: an NPC hit counts only when slapCount() increases; if performSlap refuses (not slappable) the player still swings"
  - "01-24: slap.ts and loop.ts are unchanged; the 01-17 bench still calls performSlap directly, outside the gate"
  - "01-24: the mobile context icon still reads 'none' with nothing in range although the button now always swings (planner note #7, to check on the reference phones)"
metrics:
  duration: "~14 min (12:25Z to 12:39Z)"
  completed: 2026-09-15
  tasks: 2
  files: 7
---

# Phase 1 Plan 24: Swing first, hit only in range Summary

Every attack press now gives feedback right away (D-30). Space, E, the mobile context button and a left-click on the game view all start the player's `attack-melee-right` swing on the next fixed step, even when nothing is in reach. Only a target in range gets slapped into a ragdoll or pushed, and a click only hits when it lands on the glowing object. A pure 350 ms `SwingGate` drops extra presses, so mashing and auto-clickers cannot spam swings or hits. Clicks on HUD buttons, `[data-hud-panel]` elements and the pause menu never swing. That is the panel contract plan 01-25 builds on.

## Tasks

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Swing cooldown gate via TDD + failing swing e2e (RED) | 6b40862 | src/logic/swing.ts, tests/unit/swing.test.ts, tests/e2e/swing.spec.ts |
| 2 | Swing-first action flow, clip restart, click-anywhere swing (GREEN) | 8e1da5e | src/render/characters.ts, src/game/player.ts, src/game/game.ts, src/input/pointerPick.ts, tests/e2e/swing.spec.ts |

## Verification evidence

| Gate | Result |
|------|--------|
| Task 1 | `UNIT_GREEN` (swing 8/8), `BUILD_OK`, `E2E_RED`: 7 failed, all on `__bt.swing missing` or the swing-motion wait timing out (not "No tests found") |
| Task 1 greps | `grep -c "350" src/logic/swing.ts` = 1; three / performance. / Date. in non-comment lines = 0 |
| `npm run typecheck` | rc 0, `TYPECHECK_OK` |
| `npx vitest run` | 31 files, **408/408** passed, `UNIT_OK` |
| `npm run build` | rc 0, `BUILD_OK` |
| `npm run size` | `SIZE_GATE_OK totalRaw=7274232 files=53` (+711 B vs 01-23's 7,273,521); `FIRST_LOAD_TOTAL_RAW=3360625 FIRST_LOAD_LEVEL=ok` |
| `npx playwright test` | **68 passed, 52 skipped, 0 failed** (2.7 m), `E2E_OK`, 0 lines containing " failed" |
| swing.spec alone | 7 passed (6 desktop, 1 mobile-emu), 7 skipped by project |
| Acceptance greps | `tryStart(` in game.ts 1; `onPick(null)` in pointerPick.ts 2 (code + comment); `data-hud-panel` in pointerPick.ts 2; `restart` in characters.ts 4; `registerDebug('swing'` 1; `SWING_COOLDOWN_MS = 350` 1; `git diff` on slap.ts / loop.ts = 0 files |
| Existing behaviour kept | room 'click only highlighted' (non-glowing click moves nothing, count unchanged), controls 'E far from box does nothing' (interactCount 0), slap/characters/breakables/controls context tests all green |

## Cooldown audit (D-30)

Input: `grep -nE "press\('(KeyE|Space)'\)|mouse\.(click|down)\(|touchTap\(|\.tap\(\)|btn-context" tests/e2e/*.spec.ts`. It printed **47 lines** against the final tree, and there is one row per line. "Gap" is the guaranteed time since the previous press in the same test that reaches the gate (Space, KeyE, game-area mouse click, #btn-context tap). Rows marked "never reaches gate" are HUD buttons, pause-menu buttons, a `[data-hud-panel]` click, a press made while paused, or a line that is not a press at all.

| # | file:line | Previous gate press in the same test | Guaranteed gap | Result |
|---|-----------|--------------------------------------|----------------|--------|
| 1 | breakables.spec.ts:170 | same line, previous loop iteration (first iteration: first) | 700 ms (`waitForTimeout(700)` each iteration) | ok |
| 2 | camera.spec.ts:94 | first (KeyC / KeyZ / arrows are not actions) | n/a | ok |
| 3 | camera.spec.ts:151 | touchTap #btn-rot-right: HUD button, never reaches gate | n/a | ok |
| 4 | camera.spec.ts:155 | touchTap #btn-rot-left: HUD button, never reaches gate | n/a | ok |
| 5 | camera.spec.ts:157 | touchTap #btn-rot-left: HUD button, never reaches gate | n/a | ok |
| 6 | characters.spec.ts:107 | first | n/a | ok |
| 7 | controls.spec.ts:135 | first | n/a | ok |
| 8 | controls.spec.ts:166 | first | n/a | ok |
| 9 | controls.spec.ts:222 | first | n/a | ok |
| 10 | controls.spec.ts:324 | not a press (`#btn-context` visibility assertion) | n/a | ok |
| 11 | controls.spec.ts:325 | not a press (`data-hud-button` attribute assertion) | n/a | ok |
| 12 | controls.spec.ts:351 | not a press (`centreOf('#btn-context')`) | n/a | ok |
| 13 | controls.spec.ts:352 | first (#btn-context tap) | n/a | ok |
| 14 | controls.spec.ts:427 | first (Escape / lone Ctrl are pause keys) | n/a | ok |
| 15 | controls.spec.ts:441 | Space at :427 (Ctrl + click is a game-area click) | ≥ 600 ms (`waitForTimeout(300)` :428 + :435) | ok |
| 16 | controls.spec.ts:486 | touchTap #btn-pause: HUD button, never reaches gate | n/a | ok |
| 17 | controls.spec.ts:494 | `resume.tap()` inside #pause-menu, never reaches gate | n/a | ok |
| 18 | controls.spec.ts:515 | `resume.tap()` inside #pause-menu, never reaches gate | n/a | ok |
| 19 | hud.spec.ts:166 | touchTap #btn-pause: HUD button, never reaches gate | n/a | ok |
| 20 | hud.spec.ts:169 | `#hud-toggle` button inside #pause-menu, never reaches gate | n/a | ok |
| 21 | orientation.spec.ts:69 | not a press (HUD button id list) | n/a | ok |
| 22 | room.spec.ts:162 | first | n/a | ok |
| 23 | room.spec.ts:197 | first (click on a non-glowing prop: now swings, hits nothing) | n/a | ok |
| 24 | room.spec.ts:206 | click at :197 | 500 ms (`waitForTimeout(500)` :198) | ok |
| 25 | room.spec.ts:222 | not a press (`#btn-context` visibility assertion) | n/a | ok |
| 26 | room.spec.ts:237 | not a press (`#btn-context` boundingBox) | n/a | ok |
| 27 | room.spec.ts:238 | first (#btn-context tap) | n/a | ok |
| 28 | slap.spec.ts:92 | first | n/a | ok |
| 29 | slap.spec.ts:140 | first | n/a | ok |
| 30 | slap.spec.ts:154 | not a press (`#btn-context` visibility assertion) | n/a | ok |
| 31 | slap.spec.ts:155 | not a press (`#btn-context` boundingBox) | n/a | ok |
| 32 | slap.spec.ts:156 | first (#btn-context tap) | n/a | ok |
| 33 | swing.spec.ts:111 | first | n/a | ok (intentional) |
| 34 | swing.spec.ts:132 | first | n/a | ok (intentional) |
| 35 | swing.spec.ts:134 | KeyE at :132 | 60 ms, intentional cooldown check | ok (intentional) |
| 36 | swing.spec.ts:136 | KeyE at :134 | 60 ms, intentional cooldown check | ok (intentional) |
| 37 | swing.spec.ts:146 | KeyE at :136 | 500 ms (100 + 400) | ok (intentional) |
| 38 | swing.spec.ts:156 | first | n/a | ok (intentional) |
| 39 | swing.spec.ts:179 | click at :156 | ≥ 400 ms (walk + `waitForTimeout(400)`) | ok (intentional) |
| 40 | swing.spec.ts:203 | first | n/a | ok (intentional) |
| 41 | swing.spec.ts:222 | first; pressed while paused, dropped by the loop, never reaches gate | n/a | ok (intentional) |
| 42 | swing.spec.ts:249 | click inside `[data-hud-panel]`, never reaches gate | n/a | ok (intentional) |
| 43 | swing.spec.ts:254 | first gate press (:249 is blocked) | n/a | ok (intentional) |
| 44 | swing.spec.ts:267 | not a press (`#btn-context` visibility assertion) | n/a | ok (intentional) |
| 45 | swing.spec.ts:271 | not a press (`#btn-context` boundingBox) | n/a | ok (intentional) |
| 46 | swing.spec.ts:274 | first (#btn-context tap) | n/a | ok (intentional) |
| 47 | swing.spec.ts:283 | #btn-context tap at :274 | ≥ 400 ms (`waitForTimeout(400)`) | ok (intentional) |

**Result: 47 rows, 47 ok, 0 adjusted.** No existing spec needed a `D-30: 350 ms swing cooldown` wait, so no existing spec file was edited. `SWING_COOLDOWN_MS` stays 350. The full Playwright run confirms it: 68 passed, 0 failed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Non-vacuous check] `__bt.swing.dropped` added to the debug contract**
- **Found during:** Task 1
- **Issue:** Keyboard presses only set a boolean `interactQueued`. If three quick E presses landed in the same frame they would merge into one, and "count stays 1" would pass without the gate doing anything.
- **Fix:** The `swing` debug getter also exposes `dropped`, the number of presses the gate refused. The mashing test spaces presses 60 ms apart, asserts they all fall inside 300 ms, and asserts `dropped >= 1`. The planned fields `count, hits, lastMs, cooldownMs` are unchanged.
- **Files modified:** src/game/game.ts, tests/e2e/swing.spec.ts
- **Commits:** 6b40862, 8e1da5e

**2. [Rule 2 - Evidence for a must-have truth] `[data-hud-panel]` e2e**
- **Found during:** Task 1
- **Issue:** The truth "clicks on HUD panels never swing" had no test in the behavior list, and 01-25 has not created a panel yet.
- **Fix:** Added the test 'clicks on a [data-hud-panel] never swing'. It injects a fixed `div[data-hud-panel]` with a child span and clicks the span, which exercises `closest()`, then expects `swing.count` 0 after 400 ms. A click on the game view then gives count 1, so the first check cannot pass vacuously.
- **Files modified:** tests/e2e/swing.spec.ts
- **Commit:** 6b40862

**3. [Rule 1 - Bug, own test] Over-strict distance assertion in the click test**
- **Found during:** Task 2, first full Playwright run
- **Issue:** I had added `distXZ(box centre, player) <= 1.6`, which is not in the plan. The pick reach is 1.6 m from the prop's radius edge, so a glowing box measured 1.70 m centre-to-centre and the test failed.
- **Fix:** Removed the assertion. The glow (`highlight.id === 'box-test'`) already proves the box is in range. Re-ran swing.spec (7 passed), then the full suite.
- **Files modified:** tests/e2e/swing.spec.ts
- **Commit:** 8e1da5e

### Small implementation choices inside the plan's latitude

- "Within 150 ms" is measured in page time: `performance.now()` just before the key press is compared with `__bt.swing.lastMs`, the gate time of the fixed step that consumed the press. Polling in Playwright would add its own round-trip latency, so it is not used for this check.
- pointerPick also ignores `input, textarea, select`, as planned. Clicks while paused are blocked there, and the loop still clears `interactQueued` while paused.
- `setMotion(..., { restart: true })` on the current clip calls `reset().setEffectiveWeight(1).play()` with no crossfade. `reset()` also cancels a fade-in that is still running. The frameUpdate hold (`swingLeft > 0`) calls setMotion without restart, so a swing is never restarted every frame.

## TDD Gate Compliance

- RED: the `test(01-24)` commit 6b40862 contains the unit tests, the pure gate (unit test confirmed failing on the missing module first, then 8/8 green) and the swing e2e (7 failed on the `__bt.swing` / motion assertions).
- GREEN: the `feat(01-24)` commit 8e1da5e comes after it, with the full suite green.

## Known Stubs

None. The context icon still shows 'none' when nothing is in range, although the button now always swings. That is intentional (planner note #7) and the tests expect it.

## Threat Flags

None. The only new surface is the planned one: `[data-hud-panel]` joins the list of clicks that never swing (T-01-24-02). The cooldown covers T-01-24-01, and the click-still-targets-the-same-id check covers T-01-24-03.

## Notes for later plans

- **01-25 (key hint panel):** put `data-hud-panel` on the panel root. Any click inside it, including on children, never swings; swing.spec already checks this with an injected panel. Hover and fade logic can use pointer events freely.
- **Device check (reference phones):** the context button shows an empty icon with nothing in range but swings when tapped. Decide on the phones whether it should show a "hand/swing" icon instead. That needs the tests updated from 'none'.
- **Desktop:** Ctrl + left-click still counts as a game-area click and swings. It does not pause (pause test green).
- **01-17 bench:** `performSlap` is still called directly by the bench, outside the gate. `__bt.swing` stays 0 there.
- **Requirements:** CTRL-01, CTRL-02 and TECH-06 stay open by operator instruction.

## Self-Check: PASSED

- Files: src/logic/swing.ts, tests/unit/swing.test.ts, tests/e2e/swing.spec.ts, 01-24-SUMMARY.md all present
- Commits: 6b40862, 8e1da5e both in git log
- Audit table rows = 47 = grep line count; every row ok, no adjusted spec
- No TODO/FIXME/placeholder patterns in the modified source files

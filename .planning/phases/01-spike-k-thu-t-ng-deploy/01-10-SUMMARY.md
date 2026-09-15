---
phase: 01-spike-k-thu-t-ng-deploy
plan: 10
subsystem: office-room-props
tags: [kenney, gltf, meshopt, rapier, props, blob-shadows, instancedmesh, highlight, raycast, mergeGeometries, playwright, vitest, tdd]
requires:
  - "01-05: office.glb / food.glb / office-index.json (Kenney root names, role substitutions)"
  - "01-03: createPlayer (pos, yaw), characterController CAPSULE_*, buildRoom, __bt.box / interactCount semantics"
  - "01-08: InputState + consumeInteract, setContextIcon / IconName, #touch-zone covering the canvas"
  - "01-09: getCameraYaw (rig yaw), createCameraView"
provides:
  - "src/game/layout.ts: ROOM, PLAYER_SPAWN, TEST_BOX, TEST_BOX_ID, DESKS, PANTRY, PROP_PLACEMENTS (Placement with optional `on`), ROLE_SCALE / roleScale, PRIMITIVE_ROLES, CORRIDOR"
  - "src/render/officeAssets.ts: parseOfficeAssets(officeGlb, foodGlb) -> OfficeAssets { cloneProp (bottom-centred), sizeOf }"
  - "src/render/primitives.ts: buildPrinter, buildWaterCooler, PRIMITIVE_BUILDERS"
  - "src/render/room.ts: buildRoom(ctx, assets) -> Room { bounds, surfaceTop(id), update(cameraYawRad) }, placeObject"
  - "src/physics/props.ts: createProps(ctx, placements, assets, { surfaceTop }), Props, PropRecord, SLEEP_LINEAR/ANGULAR/FRAMES, projectToScreen"
  - "src/render/blobShadows.ts: createBlobShadows(scene, capacity = 64) -> BlobShadows"
  - "src/render/highlight.ts: setHighlighted, getHighlighted"
  - "src/logic/nearest.ts: pickNearest, iconFor, Candidate, TargetKind, DEFAULT_MAX_DIST, DEFAULT_FOV_DEG"
  - "src/input/pointerPick.ts: attachPointerPick(canvas, camera, getHighlighted, onPick, isBlocked?)"
  - "src/game/assets.ts: load tasks office (10) and food (3)"
  - "src/game/game.ts: createGame is now async (Promise<Game>)"
  - "window.__bt keys props, highlight, shadows, scene; box now backed by the TEST_BOX prop"
affects: [01-11, 01-13, 01-14, 01-15, 01-16, 01-19, 01-20]
tech-stack:
  added: []
  patterns:
    - "GLBs fetched as ArrayBuffers before Chơi (no three.js in the pre-play chunk), parsed after the play gesture"
    - "Every model is wrapped so its local origin is the bottom-centre; body translation = object origin, collider offset = local bbox centre"
    - "Quantized (normalized int) attributes are converted to Float32 before baking world transforms and merging"
    - "Test-hook screen projections are computed lazily inside the __bt getter, never in the frame loop"
    - "Targeting reuses one Candidate per prop, refreshed in place each fixed step"
key-files:
  created: [src/game/layout.ts, src/render/officeAssets.ts, src/render/primitives.ts, src/render/blobShadows.ts, src/render/highlight.ts, src/physics/props.ts, src/logic/nearest.ts, src/input/pointerPick.ts, tests/unit/nearest.test.ts, tests/e2e/room.spec.ts]
  modified: [src/render/room.ts, src/game/game.ts, src/game/assets.ts, src/main.ts, tests/e2e/controls.spec.ts]
decisions:
  - "01-10: Kenney Furniture Kit is authored at about half real size (desk 0.73 m wide, 0.38 m tall), so layout.ts carries per-role scales: furniture x2, screen/keyboard x1.6, laptop x1.4, trashcan x1.6, plantSmall x3, Food Kit mug x0.4, pantry counter [3,2,2] (a stretched kitchen cabinet so the coffee machine at x 5.0 stands on it)"
  - "01-10: Placement gains optional `on` (id of a static placement); the desk / counter top y is measured from the bounding box at runtime, as the plan requires"
  - "01-10: createGame is async and main.ts awaits it; GLTF parsing cannot be synchronous and parsing before Chơi would pull three.js into first load"
  - "01-10: a mouse pick is ignored while paused and when the pointerdown lands on a button / HUD / pause menu; a queued pick only pushes if it still matches the current target at the next fixed step"
  - "01-10: chairs use yawDeg 180 (the Kenney chair opens toward +Z); verified in screenshots at yaw 0 and 90"
metrics:
  duration: "~24 min (06:01:46Z to 06:25Z)"
  completed: 2026-09-15
  tasks: 3
  files: 15
---

# Phase 1 Plan 10: Kenney office, physics props, blob shadows, highlight + E/click/context Summary

The placeholder room is now the Kenney open-space office: 4 desks, each with a monitor, keyboard, mouse, mug and chair, plus a pantry corner with a counter, coffee machine, fridge and a primitive water cooler. There are also a primitive printer, a bookcase, plants, trash cans, books and boxes.

- **Props:** 33 props are dynamic Rapier bodies that tip and fall. 11 of them are tagged breakable (4 monitors, 4 mugs, 3 plants) for plan 01-16.
- **Static furniture:** it merges into 2 meshes (28 source meshes), and the walls facing the camera hide for the current 90° yaw.
- **Blob shadows:** one InstancedMesh draws blobs for the player and every prop. The shadow map stays off.
- **Interaction:** the nearest prop within 1.6 m in front of the player glows. E, the context button, or a left-click on that glowing prop pushes it. The mobile icon switches between 'push' and 'none'.

**Full local suite:**
- `npx tsc --noEmit`: rc 0, 0 bytes of output
- Vitest: **183/183** (17 files)
- `npm run build`: rc 0
- `npm run size`: `SIZE_GATE_OK totalRaw=6738569 files=19`
- Playwright: **37 passed / 21 skipped / 0 failed**. After 01-09 it was 32 passed / 16 skipped; this plan adds 5 room tests that run in one project each.

**First load:**
- **Until ready-to-play (Chơi):** 3,207,306 bytes. After 01-09 it was 3,103,490; the +103,816 bytes are office.glb (84,784) and food.glb (18,788).
- **Until playable:** about 3.88 MB raw. That is the same number plus the chunks loaded after the click: game 96.5 KB, three.core 221.4 KB, renderer 354.1 KB and about 5 KB of small modules.
- Both numbers are within the 8 MB target.

## Task 1: RED (commit 941b141)

- `tests/unit/nearest.test.ts` has 9 cases:
  - 1.0 m beats 1.4 m
  - a candidate 0.8 m behind is ignored
  - 1.7 m returns null
  - equal distance picks the lower id, in both orders
  - radius is subtracted (1.9 m centre with r 0.4 is in range; r 0.5 beats a closer point)
  - fov edge at 65° / 75°, including yaw -90°
  - options and a centre exactly on the player
  - NaN is skipped
  - iconFor mapping
- `tests/e2e/room.spec.ts` uses the exact titles 'counts: props, breakables, shadows, no shadow map', 'sleep: props settle', 'E pushes highlighted', 'click only highlighted' (desktop) and 'touch context icon' (mobile-emu).
- Verify output was `BUILD_OK`, `UNIT_RED` (cannot resolve src/logic/nearest) and `E2E_RED`: 5 failed on `__bt` wait timeouts, 5 skipped by project, no "No tests found".

## Task 2: office, props, shadows (commit 18b8408)

- **Plan verify:**
  - room `counts|sleep` (desktop): 2 passed. Sleep reached sleepingCount 33/33 in the probe.
  - controls desktop: 5 passed (WASD, walls block, E far, E near, pause).
  - `tsc -p tsconfig.json`: rc 0. `vite build`: rc 0.
  - `npm run typecheck` was still red only because of the RED unit test importing Task 3's `nearest.ts` (tsconfig.node.json covers tests). It is green after Task 3.
- **Acceptance:**
  - `grep -c mergeGeometries src/render/room.ts` = 2
  - `castShadow = true|shadowMap.enabled = true` in src = 0
  - layout.ts contains 'static', 'prop' and 'breakable' and exports PROP_PLACEMENTS
  - the forbidden-file check on the Task 2 commit prints 0; loop.ts, renderer.ts, cameraView.ts, pauseMenu.ts and hud.css were not touched
- **Probe dump:** 33 dynamic, 11 breakable, 34 shadow casters; `scene.staticMeshes` 2 from 28 sources; every desk-top prop rests at y ≈ 0.77 (the measured desk top).
- **Screenshots at yaw 0 and 90:**
  - Monitors face the chairs, and chairs face their desks.
  - The coffee machine stands on the counter.
  - The south wall hides at yaw 0 and the east wall at 90.
  - Objects at the image edges look tilted. That is perspective: physics reported them upright at y 0.

## Task 3: targeting, glow, E/click/context (commit d0ed8d3)

- **Plan verify:** typecheck, vitest and vite build all rc 0, then Playwright on room + controls + smoke + orientation in both projects: **24 passed, 16 skipped, 0 " failed" lines**.
- **Acceptance:** `pointerType` guard at pointerPick.ts:20 (`e.pointerType !== 'mouse' || e.button !== 0`). game.ts contains `setContextIcon(iconFor(` 2 times: once for the initial 'none', once on target change.
- **Mutation check** (temporary, file restored from backup and `cmp`-verified, rebuilt):
  - The ray guard was removed, so any mouse click picked the target.
  - The first version of 'click only highlighted' **still passed**: it clicked the other prop after the box had flown out of range, so nothing was highlighted.
  - I reordered the test: the non-highlighted click now happens while the box glows, and the test asserts the highlight is still live. Under the mutation it failed (`Expected <= 0.01, Received 1.4218`: the glowing box got pushed). On the real code it passed 3/3 with `--repeat-each=3`.
- **Temporary draw-call probe** (debug key added, then removed; game.ts restored and `cmp`-verified):
  - renderer.info calls were **82 at yaw 0, 75 / 76 / 66** at 90 / 180 / 270. The TECH-03 budget is ≤ 120.
  - About 7.4k triangles, 35 rigid bodies, 47 colliders.
  - The glow screenshot shows the test box amber next to the plain boxes.
  - Walls hid per yaw: south, east, north, west.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] createGame became async; main.ts awaits it**
- **Found during:** Task 2
- **Issue:** `parseOfficeAssets` is async (GLTFLoader, meshopt `ready`), but `createGame` was synchronous. Parsing inside the pre-play load tasks would put three.js into the first-load chunk.
- **Fix:** `createGame(ctx): Promise<Game>`, and main.ts changed one line to `await createGame(ctx)`. `playing` is still set after `startLoop`, so the e2e waits are unchanged.
- **Files modified:** src/game/game.ts, src/main.ts
- **Commit:** 18b8408

**2. [Rule 1 - Correctness] Model scale and centring not specified by the plan**
- **Found during:** Task 2 (GLB bounds measured from the JSON chunk before layout)
- **Issue:** At native scale a desk is 0.38 m tall next to the 1.5 m player capsule, the Food Kit mug is 0.34 m wide, and Kenney origins sit at a model corner. Without a fix, the plan's centre coordinates and "desk top from bounding box" would put props off their desks.
- **Fix:**
  - `ROLE_SCALE` in layout.ts.
  - `cloneProp` returns a wrapper whose origin is the bottom-centre.
  - `Placement.on` gives objects a supporting surface.
  - The counter is scaled [3,2,2] so the plan's coffee machine x (5.0) sits on it. At plan scale the machine would hang half off the counter.
  - PANTRY / DESKS coordinates are unchanged.
- **Files modified:** src/game/layout.ts, src/render/officeAssets.ts
- **Commit:** 18b8408

**3. [Rule 1 - Bug] Quantized attributes clamp when world transforms are baked**
- **Found during:** Task 2 (design, before the first run)
- **Issue:** meshopt output stores POSITION as normalized Int8. `applyMatrix4` on it would clamp world positions such as x = -5 to [-1, 1].
- **Fix:** `toFloatGeometry` converts every attribute to Float32 through `getComponent` before `applyMatrix4` + `mergeGeometries`.
- **Files modified:** src/render/room.ts
- **Commit:** 18b8408

**4. [Rule 1 - Bug in own test] Room e2e helper and vacuous click test**
- **Helper:** `startPlaying` waited for `__bt.highlight` (Task 3), so Task 2's counts/sleep tests could never pass. The helper now waits only for shared keys, and the highlight tests wait for their own key. Commit 18b8408.
- **Click test:** 'click only highlighted' clicked the non-highlighted prop when nothing was highlighted, so a pick without the ray guard passed (mutation-proven). It was reordered as described under Task 3. Commit d0ed8d3.

**5. [Stated reason] controls.spec.ts touch test expects contextIcon 'none' at spawn instead of 'hand'**
- **Reason:** D-18 / CTRL-02 and this plan's truth say the icon follows the nearest target and is 'none' with nothing in range. The 01-08 assertion pinned the pre-targeting default.
- **Scope:** only that one line changed.
- **Commit:** d0ed8d3

**6. [Rule 2 - Performance] Test-hook screen projection is lazy**
- **Plan:** it says to project props / highlight to screen in `game.frameUpdate`.
- **What was done:** the projection runs inside the `__bt.props` / `__bt.highlight` getters (`projectToScreen`), so the frame loop never pays for 33 projections. The test contract `{ screen: { x, y } }` is unchanged.

**7. [Rule 2 - Correctness] Pick hardening**
- A pick is ignored while paused (`getPauseState()`, read-only import from loop.ts).
- A pick is ignored when the pointerdown lands on a button, `[data-hud-button]` or `#pause-menu`.
- A queued pick only pushes if it still names the current target at the next fixed step.
- Push direction falls back to the facing vector when the player stands on the prop centre.
- Blob-shadow `addCaster` returns -1 over capacity instead of throwing.

## Notes for later plans

- **01-11 (HUD / quality):** static office = 2 draw calls. Total draw calls are 66–82 at 1280x720, with 35 bodies. `__bt.scene` exposes `staticMeshes` / `walls`. Blob shadows are one InstancedMesh with capacity 64 and 34 used; a low tier could skip `shadows.update()` for sleeping props.
- **01-14 / 01-15 (NPCs, slap):** add candidates with `kind: 'npc'`. `pickNearest` / `iconFor` already map it to 'slap'. NPCs can use `shadows.addCaster`. The DESKS and PANTRY coordinates are the NPC route endpoints.
- **01-16 (breakables):** `props.list()` records carry `kind: 'breakable'`, `mass`, `home` and `byColliderHandle` for contact-force events. Monitors, mugs and plants use the bottom-centre origin. Collider centre is `rec.centre` in local space.
- **01-20 (tuning):** `SLEEP_LINEAR` 0.05, `SLEEP_ANGULAR` 0.08 and `SLEEP_FRAMES` 60 are exported. In the probe all 33 props were asleep 2.5 s after spawn.
- **Layout:** chairs spawn 0.2 m from their desk. The corridor x ∈ [-1, 1], z ∈ [-1.5, 3] holds only the test box (`CORRIDOR` exported).

## Human check (deferred, human_verify_mode end-of-phase)

Run `npm run dev` on desktop.
1. Walk to the desks, the chairs and the pantry.
2. Click glowing objects, then try clicking objects that are not glowing.
3. Rotate with Z / C.

Expected:
- Exactly one object glows at a time, and clicks only work on it.
- Props tumble convincingly.
- The wall between the camera and the player disappears.
- Glow readability and the Kenney scale choices (the trash can is 0.68 m tall, and the mugs are small) are visual judgements.

On the phones, check that the context icon switches between push and empty. **CTRL-01, CTRL-02 and TECH-03 stay open**: they are shared with later plans and need real devices.

## Known Stubs

None that block the plan goal. `__bt.props.list[].screen` is `{ x: -1, y: -1 }` only before `setCamera`, which game.ts calls right after `createProps`.

## Threat Flags

None. There is no new network, auth or storage surface. The GLBs are same-origin committed files, fetched with the existing `fetchWithProgress` (T-01-10-03 accepted). Threat register status:
- **T-01-10-01:** mitigated. Highlight clones are cached per source material, and the ray is cast only on a click, against one object.
- **T-01-10-02:** mitigated. There is a fixed list of 33 dynamic bodies plus the player, the settle-sleep helper, and 13 static colliders. Counts are exposed on `__bt`.

## TDD Gate Compliance

RED `test(01-10)` 941b141, then GREEN `feat(01-10)` 18b8408 and d0ed8d3. No refactor commit was needed.

## Self-Check: PASSED

- The 10 created and 5 modified files exist.
- Commits 941b141, 18b8408 and d0ed8d3 appear in `git log`.
- The temporary probe spec was deleted, and both mutation backups were restored, confirmed identical with `cmp` and rebuilt.
- The working tree was clean after the Task 3 commit.

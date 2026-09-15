---
phase: 01-spike-k-thu-t-ng-deploy
plan: 23
subsystem: characters-render
tags: [skinned-mesh, draw-calls, rigid-skin, npc-routes, d-29, d-11, performance-budget, vitest, playwright, tdd]
requires:
  - "01-14: spawnCharacter (SkeletonUtils clone, 1.5 m fit, Lambert material per letter, RepeatWrapping textures), NPC_ROUTES 0-2, waypoints clearance test"
  - "01-15: createRagdoll (ownBounds sizing from each part's own meshes, attach-based detach), get-up re-attach + blend in npc.ts"
  - "01-16: ?scenario=smash, __bt.debris.broken, shard kit (0 idle draws, +5 at a burst), 60 pooled shard bodies"
  - "01-22: key map (KeyE still slaps) - not touched"
provides:
  - "src/render/rigidSkin.ts: RigidSkin { mesh, bones }, buildRigidSkin(model, partNames, material, cacheKey)"
  - "CharacterInstance.skinned (SkinnedMesh 'character-skin', bones 'bone-<part>'); original part meshes kept hidden"
  - "__bt.characters: skinnedMeshes, drawsPerCharacter: 1, skin[] { letter, centre, height } (lazy)"
  - "NPC_ROUTES[3] desk d2 <-> pantry counter east end, NPC_ROUTES[4] east window <-> storage boxes; routeIndexForNpc, sharedIndexForNpc"
  - "MAX_NPCS = 10, ?npcs clamped to 0..10"
  - "tests/e2e/characters.spec.ts: MEASURE lines for 3 and 10 NPCs, idle and smash peak"
affects: [01-17, 01-18, 01-20, 01-24, 01-27]
tech-stack:
  added: []
  patterns:
    - "Rigid skin: part meshes baked into model space and merged once per asset; one identity Bone child per part node; every vertex skinIndex (part,0,0,0) weight (1,0,0,0); SkinnedMesh.bind() in the bind pose with AttachedBindMode, so the skin follows whatever moves the part nodes (clips, ragdoll attach + body sync, get-up blend)"
    - "Keep the source meshes as hidden children instead of deleting them: code that measures or ray-picks parts keeps working unchanged (Raycaster ignores visible)"
    - "frustumCulled = false on a skinned character, because a ragdoll part flies far from the cached bind-pose sphere"
    - "NPC index -> route mapping as a pure function, so adding routes never re-routes existing NPCs and earlier measurements stay comparable"
key-files:
  created: [src/render/rigidSkin.ts, tests/unit/rigidSkin.test.ts, tests/e2e/characters.spec.ts]
  modified: [src/render/characters.ts, src/game/waypoints.ts, tests/unit/waypoints.test.ts, src/game/game.ts, tests/e2e/npc.spec.ts]
decisions:
  - "01-23: each Blocky character is one rigid SkinnedMesh (6 bones, weight 1.0 per part) built at spawn from the clone in its bind pose; the merged geometry is cached per asset.scene and shared by all 11 characters, only the Skeleton (bone texture) is per character"
  - "01-23: the part meshes stay under their part nodes with visible = false; ragdoll collider sizing and pointer pick read them, so player.ts, npc.ts, ragdoll.ts and highlight.ts are unchanged"
  - "01-23: the skin always carries position, normal and uv (uv zero-filled if a source mesh has none) plus skinIndex/skinWeight; any other attribute is dropped so mergeGeometries never rejects a mix"
  - "01-23: NPCs 1-8 keep routes i % 3 and offsets floor(i / 3) from 01-14; NPC 9 -> route 3, NPC 10 -> route 4, offset 0; the index is truncated and clamped to 0..9 (NaN -> 0, +Infinity -> 9)"
  - "01-23: routes 3 and 4 use the planned coordinates unchanged; they pass the furniture/corridor/wall tests and a new >= 0.6 m centre-distance rule against floor-standing trashcans, boxes and plants"
  - "01-23: measured at 10 NPCs + player: 91 draws idle, peak 92 in ?scenario=smash, 165 bodies (budget 120 / 200). The draw-call budget no longer blocks the 01-17 benchmark"
metrics:
  duration: "~19 min (11:59Z to 12:18Z)"
  completed: 2026-09-15
  tasks: 3
  files: 8
---

# Phase 1 Plan 23: Ten coworkers, one draw call each Summary

Every Blocky character, player and NPCs alike, is now one rigid SkinnedMesh: 6 bones, and every vertex is weighted 1.0 to its part. A character costs 1 draw call instead of 6. Clips, the slap ragdoll, the get-up blend, the highlight glow and the per-NPC textures all work as before. `?npcs=10` spawns ten coworkers. NPCs 9 and 10 walk two new hand-placed routes, with no navmesh. With 10 NPCs in `?scenario=smash` the HUD peaks at **92 draw calls and 165 bodies**, inside the bench budget of 120 / 200. The 01-17 benchmark can now measure the 10-NPC ceiling.

## Measurements

From the `MEASURE` lines of `tests/e2e/characters.spec.ts` in the final full Playwright run (desktop project, 1280×720, SwiftShader, quality tier auto = high, camera yaw 0). The HUD samples every HUD_SAMPLE_MS, so a single-frame spike between two samples could be missed.

| Case | Draw calls now / peak | Bodies now / peak | Before the merge (01-14..01-16) |
|------|----------------------|-------------------|--------------------------------|
| 3 NPCs, idle (1.5 s after start) | 84 / 84 | 116 / 116 | 104 draws, 116 bodies (01-16) |
| 3 NPCs, `?scenario=smash` (≥ 10 broken + 1.5 s) | 66 / **85** | 116 / 116 | 104 at start, up to +5 during the burst (01-16) |
| 10 NPCs, idle | 91 / 91 | 165 / 165 | not possible before (max 8: 134 draws, 151 bodies) |
| 10 NPCs, `?scenario=smash` | 73 / **92** | 165 / **165** | 8 NPCs was 134 draws, over budget |
| Budget (RESEARCH Performance budget) | ≤ 120 | ≤ 200 | |

Raw lines:

```
MEASURE npcs=3 drawCalls=84 peakDrawCalls=84 bodies=116 peakBodies=116
MEASURE npcs=10 drawCalls=73 peakDrawCalls=92 bodies=165 peakBodies=165
MEASURE npcs=10 idle drawCalls=91 peakDrawCalls=91 bodies=165 peakBodies=165
MEASURE npcs=3 smash drawCalls=66 peakDrawCalls=85 bodies=116 peakBodies=116
```

- **Draw calls:** each extra character now adds 1 draw instead of 6. 3 → 10 NPCs is +7 (84 → 91). The merge saved 20 draws at 3 NPCs (104 → 84). At 10 NPCs it saves 55 compared with the old 6-per-character cost (91 + 55 = 146 would have been the pre-merge value).
- **Bodies:** +7 per NPC (1 kinematic capsule + 6 pooled ragdoll bodies). 116 at 3 NPCs, 165 at 10. Nothing is added per slap or per break.
- **After a smash** the current count drops below idle (66 / 73), because broken props are hidden.
- Pre-merge baseline, captured by the RED run of Task 1 at `?npcs=10` (then still clamped to 8): 134 draws, 151 bodies. That matches 01-14 and 01-16.

## Final routes (no point moved)

The planned coordinates passed every clearance test on the first run, so nothing was moved. Constants: WEST_X = -6.235, NORTH_Z = -3.89, MID_Z = -1.4.

- **Route 3 (NPC 9, desk d2 ↔ pantry counter east end):** (-2.8, -1.4, dwell 3) → (-6.235, -1.4) → (-6.235, -3.89) → (3.6, -3.89) → (6.1, -3.7, dwell 3) → (3.6, -3.89) → (-6.235, -3.89) → (-6.235, -1.4)
- **Route 4 (NPC 10, east window ↔ storage boxes):** (6.2, 1.0, dwell 3) → (3.0, 1.0) → (3.0, 3.9) → (4.85, 3.9, dwell 3) → (3.0, 3.9) → (3.0, 1.0)
- **Checked in a 20 s headless trace at `?npcs=10`:**
  - NPC 9 went d2 → west column → north lane → dwelt at (5.97, -3.71).
  - NPC 10 cycled between (6.06, 1.01) and (4.71, 3.89).
  - `__bt.props.movedCount` stayed 0, so no prop was shoved.

## Tasks

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Rigid-skin builder via TDD + failing character budget e2e (RED) | 32bdaf8 | src/render/rigidSkin.ts, tests/unit/rigidSkin.test.ts, tests/e2e/characters.spec.ts |
| 2 | Characters render through the rigid skin (GREEN for 3 NPCs and ragdoll) | f588458 | src/render/characters.ts, tests/e2e/characters.spec.ts |
| 3 | Routes for NPCs 9–10, `?npcs` clamp 0..10, budget measured (GREEN) | 74f86b4 | src/game/waypoints.ts, tests/unit/waypoints.test.ts, src/game/game.ts, tests/e2e/npc.spec.ts |

## Verification evidence

| Gate | Result |
|------|--------|
| Task 1 | `UNIT_GREEN` (rigidSkin 7/7), `BUILD_OK`, `E2E_RED` (4 failed on assertions and missing `__bt.characters.skinnedMeshes` / `skin`, not "No tests found") |
| Task 2 | `TYPECHECK_OK`, `UNIT_OK` (397/397), `BUILD_OK`, characters.spec "3 NPCs" + "skin follows" 2 passed, npc/slap/room/controls/smoke 29 passed 21 skipped, `E2E_SLICE_OK` |
| `npm run typecheck` | rc 0 |
| `npx vitest run` | 30 files, **400/400** passed |
| `npm run build` | rc 0 |
| `npm run size` | `SIZE_GATE_OK totalRaw=7273521 files=53` (+3,027 B vs 01-22's 7,270,494); `FIRST_LOAD_TOTAL_RAW=3360625 FIRST_LOAD_LEVEL=ok` |
| `npx playwright test` | **61 passed, 45 skipped, 0 failed** (2.5 m), `E2E_OK` |
| Acceptance greps | `frustumCulled = false` 1, `mergeGeometries` 3, `Int16Array`/`attach(`/`computeBoundingBox` present in the unit test, `buildRigidSkin(` in characters.ts 1, `registerDebug('characters'` 1, player/npc/ragdoll/highlight diff 0 files, `Math.min(8` in game.ts code 0, `MAX_NPCS = 10` 1, `navmesh|pathfind` in waypoints.ts 0 |
| Visual check (headless screenshots) | 10 NPCs: each character textured with its own letter, heads correctly sized, walk poses animate. Mid-slap: the ragdoll flies as one jointed body and the player's attack pose plays through the skin |

## Deviations from Plan

### Auto-fixed Issues

**1. [Operator constraint] Fourth measurement test in characters.spec**
- **Found during:** Task 1
- **Issue:** The operator asked for draw calls and bodies at 3 and 10 NPCs, both idle and at the smash peak. The plan's tests only give 3 idle and 10 smash.
- **Fix:** Added "budget measured idle with ten coworkers and at the smash peak with three". It prints `MEASURE npcs=10 idle` and `MEASURE npcs=3 smash` and asserts the same ≤ 120 / ≤ 200 budget and clean pages. In Task 2 it was renamed from "…with 3 NPCs", because the plan's `-g "3 NPCs|skin follows"` filter also picked it up before the clamp existed.
- **Files modified:** tests/e2e/characters.spec.ts
- **Commits:** 32bdaf8, f588458

**2. [Rule 1 - Bug, own test] Re-parent test looked the torso up by name after detaching it**
- **Found during:** Task 1 GREEN run, before the commit
- **Issue:** After `ragdollRoot.attach(torso)`, `model.getObjectByName('torso')` no longer finds it.
- **Fix:** The test holds the torso and source mesh references from before the detach.
- **Files modified:** tests/unit/rigidSkin.test.ts
- **Commit:** 32bdaf8

### Small implementation choices inside the plan's latitude

- The skin geometry always has a `uv` attribute, zero-filled if a source mesh lacks one, so `mergeGeometries` cannot reject a mix. The Blocky GLB has uv on every part.
- `routeIndexForNpc(+Infinity)` clamps to 9 (route 4); NaN gives 0, as the plan says.
- The unit test also proves an extra `color` attribute is dropped. Its Int16 leg sits on a 0.5-scaled child, the way meshopt ships quantized meshes.

## TDD Gate Compliance

- Task 1: `test(01-23)` commit 32bdaf8 (unit GREEN + e2e RED) precedes the `feat(01-23)` commits f588458 and 74f86b4.
- Task 3: the waypoints unit tests were written first and confirmed RED: 4 failed, "expected 3 to be 5", "routeIndexForNpc is not a function". They were committed together with the implementation in 74f86b4, not as a separate `test(...)` commit.

## Known Stubs

None. `drawsPerCharacter: 1` is a constant by construction: every live character has exactly one visible SkinnedMesh, and the budget e2e checks the resulting HUD draw calls.

## Notes for later plans

- **01-17 benchmark:** 10 NPCs + player idle at 91 draws and peak 92 in smash, leaving ~28 draws of headroom for extra bench objects. Bodies are 165 of 200, and the 35 left is less headroom than the draw calls have.
- **01-18 soak / Pitfall 8:** each character now also owns one small float bone texture (6 bones → 8×8 RGBA float, three r186 `Skeleton.computeBoneTexture`). The merged geometry is shared, so GPU memory per extra character is roughly one 512² texture + one bone texture.
- **Ray pick:** clicks still hit the hidden part meshes. The SkinnedMesh can also be hit, and three.js caches its bounding sphere on the first raycast, but either hit counts because the pick casts recursively against the highlighted root.
- **01-16 deferred item** (player capsule pushes desk items hard) is untouched and still logged for 01-20.
- **Requirements:** TECH-03, TECH-06 and CTRL-07 stay open by operator instruction.

## Self-Check: PASSED

- Files: src/render/rigidSkin.ts, tests/unit/rigidSkin.test.ts, tests/e2e/characters.spec.ts, 01-23-SUMMARY.md all present
- Commits: 32bdaf8, f588458, 74f86b4 all in git log
- No TODO/FIXME/placeholder patterns in the modified source files

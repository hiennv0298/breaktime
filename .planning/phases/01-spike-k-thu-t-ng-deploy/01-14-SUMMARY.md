---
phase: 01-spike-k-thu-t-ng-deploy
plan: 14
subsystem: characters-npcs
tags: [kenney, blocky-characters, gltf, meshopt, skeletonutils, animation-mixer, rapier, kinematic, waypoints, vitest, playwright, tdd]
requires:
  - "01-05: character.glb (6 named parts, 27 clips, NORMAL kept) + tex/character-{a..r}.png 512²"
  - "01-10: createGame async, layout.ts (DESKS, PANTRY, PROP_PLACEMENTS, CORRIDOR, ROOM), createBlobShadows, fetchWithProgress load tasks"
  - "01-11: __bt.hud drawCalls / bodies (used for the measurements below)"
provides:
  - "src/logic/waypointWalker.ts: WaypointPoint, WalkerState, WalkerStep, createWalker, stepWalker, nearestIndex, WALK_SPEED 1.4, ARRIVE_RADIUS 0.15"
  - "src/render/characters.ts: CHARACTER_PARTS, CharacterAsset, CharacterInstance, CharacterMotion, CHARACTER_HEIGHT 1.5, parseCharacterAsset, spawnCharacter"
  - "src/game/waypoints.ts: NPC_ROUTES (3), NPC_RADIUS, ROUTE_CLEARANCE, ROUTE_OBSTACLES, Footprint, DESK_BLOCK"
  - "src/game/npc.ts: Npc, NpcOptions, createNpc, NPC_HALF_HEIGHT"
  - "src/game/player.ts: createPlayer(ctx, spawn, asset), PLAYER_TEXTURE 'a', TURN_RATE, angleDelta"
  - "src/game/game.ts: DEFAULT_NPCS 3, MAX_NPCS 8, npcCountFromQuery"
  - "src/game/assets.ts: load task 'character' (weight 5), characterTextureUrl, characterTextureLetters"
  - "URL param npcs=0..8 (default 3); window.__bt keys npcs, characters"
affects: [01-15, 01-16, 01-17, 01-19, 01-20]
tech-stack:
  added: []
  patterns:
    - "One parsed character GLB, SkeletonUtils.clone per character, texture + Lambert material cached per letter"
    - "The pure walker owns the NPC position; the kinematic body copies it each fixed step (no drift between logic and physics)"
    - "Route geometry is data built from layout constants and checked by a Vitest clearance test against measured footprints"
    - "Animation dt is 0 while paused, so characters freeze with the simulation"
key-files:
  created: [src/logic/waypointWalker.ts, src/render/characters.ts, src/game/npc.ts, src/game/waypoints.ts, tests/unit/waypointWalker.test.ts, tests/unit/waypoints.test.ts, tests/e2e/npc.spec.ts]
  modified: [src/game/player.ts, src/game/game.ts, src/game/assets.ts]
decisions:
  - "01-14: Character textures mirror the GLB sampler (RepeatWrapping, LinearFilter, no mipmaps): Blocky UVs lie outside [0,1] (head V 1.006..1.366, legs U -0.247..-0.003) and TextureLoader's default clamp painted every part with edge texels"
  - "01-14: NPC routes use a west column (x = desk min x - 0.5) and a north lane (z = first desk row edge - 0.5) instead of the plan's single aisle point (1.5,-3.5): the plan geometry clipped desk d2, the counter corner and the fridge notch, and crossed the spawn/test-box corridor used by the controls/camera/room specs"
  - "01-14: Desk stop is desk + (0, 1.6), not + (0, 1.4): at 1.4 the 0.3 m capsule overlaps the chair back (+1.215) by 0.115 m and would shove a sleeping chair every visit"
  - "01-14: Fridge stop is fridge + (-0.4, 0.75), not (-0.9, 0.3): the counter-fridge gap (0.625 m) is narrower than an NPC; the plan point sits 0.16 m from the counter corner"
  - "01-14: An NPC spawns at route[startIndex] and dwells there first; extra NPCs on a shared route are offset +0.3 m x per share"
  - "01-14: Character height fitted to 1.5 m (the player capsule) from the bind-pose bounding box; model faces local +Z, so player root yaw = facing + PI"
metrics:
  duration: "~33 min (08:08:46Z to 08:41:31Z)"
  completed: 2026-09-15
  tasks: 3
  files: 10
---

# Phase 1 Plan 14: Blocky player and NPCs on hand-placed routes Summary

The player capsule is now a textured, animated Kenney Blocky character. Three coworkers walk looping desk ↔ pantry routes, pausing at each stop: one at the coffee machine, one at the water cooler and printer, one at the fridge and bookcase. All four come from the same shared `character.glb` with a different 512² texture per character. `?npcs=N` spawns 0..8 NPCs for the benchmark. NPCs are kinematic Rapier capsules driven by a pure, unit-tested waypoint walker, and each gets a blob shadow.

## Measurements (headless SwiftShader, 1280x720, HUD `__bt.hud`)

| NPCs | Draw calls (yaw 0) | Draw calls (yaw 90) | Bodies | Textures loaded | Blob shadows |
|------|--------------------|---------------------|--------|-----------------|--------------|
| 0 (player only) | 86 | 79 | 35 | 1 | 34 |
| 3 (normal play) | 104 | not measured | 38 | 4 | 37 |
| 8 (bench) | **134** | 121–127 | 43 | 9 | 42 |

- Each Blocky character costs 6 draw calls (6 part meshes, 1 shared material per letter), about 60 triangles more per character.
- **8 NPCs go over the ≤ 120 bench draw-call budget** (RESEARCH performance budget), and that is before ragdoll shards. The fix RESEARCH already names is D-07 step 3: turn each character into one SkinnedMesh with 6 rigid bones, which is 1 draw per character, about 134 → 89. That belongs to the optimisation / tuning pass (01-20), not this plan. TECH-03 stays open.
- Bodies stay far under the ~200 cap: 35 + 1 per NPC. Ragdoll parts come in 01-15.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing waypoint walker unit tests | 6dab730 | tests/unit/waypointWalker.test.ts |
| 1 (GREEN + e2e RED) | Pure walker; failing NPC e2e | 1cdd175 | src/logic/waypointWalker.ts, tests/e2e/npc.spec.ts |
| 2 | Shared Blocky loader, animated player | a91d5cc | src/render/characters.ts, src/game/player.ts, src/game/assets.ts, src/game/game.ts |
| 3 | NPC entities on routes, ?npcs clamp | f0aeb72 | src/game/waypoints.ts, src/game/npc.ts, src/game/game.ts, tests/unit/waypoints.test.ts |

## Verification evidence

**Task 1:** the unit file first failed to import (RED), then passed 16/16. The verify script printed `UNIT_GREEN` and `E2E_RED`: 3 npc tests failed on the `__bt.npcs` / `characters` wait timeout, which is the expected reason. `grep -c "from 'three'" src/logic/waypointWalker.ts` = 0.

**Task 2:**
- typecheck rc 0, vite build rc 0.
- controls + room + smoke (desktop): 13 passed, 4 skipped.
- `SkeletonUtils.clone` is at characters.ts:139 and `flipY = false` at :116. `MeshStandardMaterial` count = 0.

**Task 3:**
- typecheck rc 0; Vitest 22 files, 252/252; build rc 0.
- npc + room + controls + smoke + orientation in both projects: 27 passed, 19 skipped, 0 " failed" lines.
- `kinematicPositionBased` count in npc.ts = 1. navmesh|schedule = 0 in npc.ts and waypoints.ts. game.ts:51 has `Math.max(0, Math.min(8, n))`.

**Full local suite (after Task 3):**
- `npx tsc --noEmit`: rc 0, 0 bytes.
- `npx vitest run`: 22 files, **252/252** (230 before; +16 walker, +6 routes).
- `npm run build`: rc 0.
- `npm run size`: `SIZE_GATE_OK totalRaw=7247911 files=52`. That is +0.44 MB: character.glb 83 KB plus 18 textures of 14.5–24.4 KB each, emitted but loaded lazily.
- `npx playwright test`: **49 passed, 33 skipped, 0 failed**, rc 0 (46 passed before; +3 npc).
- First load until ready-to-play: **3,359,951 bytes (3.4 MB)**, `FIRST_LOAD_LEVEL=ok`. It was 3.27 MB; the +83 KB is character.glb. Textures are not fetched before Chơi.

**Extra evidence:**
- **Kinematic push (must-have truth):** I ran a Node Rapier 0.20 script with the same capsule (0.45, 0.3) driven by `setNextKinematicTranslation` at 1.4 m/s into a box that had been put to sleep (density 20). The box woke and was pushed from x 2.00 to 4.80, ahead of the NPC at 4.20.
- **Route clearance mutation:** I put back the plan's fridge offset (-0.9, 0.3). `waypoints.test.ts` then failed with `route 2 segment … passes 0.349 m from pantry-counter`. The file was restored and `cmp`-verified.
- **Screenshots (probe in %TEMP%, not committed):**
  - With 3 and 8 NPCs, the textures read correctly: face, beard, green legs.
  - Walking toward the camera shows the face, idle at spawn shows the back of the head, and walking +X shows the profile, so facing is correct.
  - NPCs sit at desk / lane / pantry positions and do not clip into desks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Character textures rendered with wrong colours**
- **Found during:** Task 2 (visual probe)
- **Issue:** The head showed torso colours and the legs were dark. The Blocky UVs sit outside [0,1] and rely on the glTF sampler's REPEAT wrap. `TextureLoader` defaults to ClampToEdge.
- **Fix:** Set `wrapS/wrapT = RepeatWrapping` and `minFilter = LinearFilter` with no mipmaps, as the GLB sampler (9729, 10497) specifies. This also keeps atlas regions from bleeding and saves VRAM.
- **Files modified:** src/render/characters.ts
- **Commit:** a91d5cc

**2. [Rule 1 - Bug] Plan route geometry clipped static furniture and crossed the player test corridor**
- **Found during:** Task 3 (footprints measured from office.glb at ROLE_SCALE before placing points)
- **Issue:**
  - Segment d1 → (1.5,-3.5) passes 0.15 m from desk d2's corner, so the 0.3 m capsule overlaps it.
  - The fridge point (fridge + (-0.9, 0.3)) is 0.16 m from the counter corner, inside a 0.625 m gap.
  - Desk + (0, 1.4) overlaps the chair back by 0.115 m.
  - Any direct desk → pantry line crosses CORRIDOR (spawn/test box), where the controls, room and camera specs walk the player.
- **Fix:**
  - Routes use a west column and a north lane derived from DESKS / measured desk size.
  - Desk stops are at +1.6.
  - The fridge stop is at (-0.4, 0.75).
  - Route 2 has a pantry lane point before the bookcase.
  - Every stop the plan names is kept: desk, coffee 4 s, cooler, printer, fridge, bookcase 2 s, with the plan's dwell times.
  - `tests/unit/waypoints.test.ts` enforces a 0.35 m capsule clearance to desks, counter, fridge, cooler, bookcase and printer, keeps every route out of the corridor, and keeps every point ≥ 0.5 m from the walls. It includes a negative control.
- **Files modified:** src/game/waypoints.ts, tests/unit/waypoints.test.ts
- **Commit:** f0aeb72

**3. [Rule 2 - Correctness] Animations paused with the game**
- **Issue:** The loop calls `frameUpdate` with the real frame dt even while paused, so mixers kept animating behind the pause menu.
- **Fix:** game.ts passes animation dt 0 while `getPauseState().isPaused()`.
- **Commit:** a91d5cc, f0aeb72

**4. [Rule 2 - Test coverage] Route geometry unit test added**
- tests/unit/waypoints.test.ts is not in the plan's file list. It turns the "inside ROOM, ≥ 0.5 m clearance, no desk crossing" rule into an automated check.

**5. [Scope note] game.ts touched in Task 2**
- The player needs the parsed character asset, so Task 2 added `parseCharacterAsset` to the existing `Promise.all` in game.ts. Task 3 then added the NPCs.

## Notes for later plans

- **01-15 (slap / ragdoll):**
  - `Npc.walker.frozen` stops the walker; set it by replacing state (`walker` is a getter; add a setter or a `freeze()` if needed).
  - `character.parts` are the named part nodes (meshes are unnamed children).
  - `setMotion` already accepts 'attack-melee-right' and 'interact-right'.
  - NPCs are not highlight candidates yet (`kind: 'npc'` → 'slap' icon exists in nearest.ts).
  - Kinematic NPCs do not collide with each other. A walking NPC blocks the player's KCC but can overlap a standing player, because nothing pushes the KCC capsule.
- **01-17 (bench):** `?npcs=8` gives 8 NPCs with textures b..i. Shared-route NPCs overlap visually at times (no NPC-NPC avoidance).
- **01-20 / D-07 step 3:** 8 NPCs = 134 draw calls at yaw 0. The per-character SkinnedMesh conversion is the planned lever.
- **Textures:** `__bt.characters.texturesLoaded` counts per-letter loads: 4 in normal play, 9 with 8 NPCs. Materials are shared per letter, so 01-15/16 tinting must clone the material first.
- **Human check (end-of-phase):**
  - Run `npm run dev`, walk the player: turning, idle ↔ walk blend.
  - Watch the office for 2 min, then open `?npcs=8`. Judge route believability, and push a chair into an NPC's path to see it shoved aside.
  - The walk clip plays at its authored rate at both 1.4 m/s (NPC) and 3.2 m/s (player). Foot sliding on the player is a visual judgement for 01-20.

## Known Stubs

None. Every NPC and character value is live. `facingYaw` is 0 on steps without displacement by contract, and npc.ts keeps the previous facing in that case.

## Threat Flags

None beyond the plan's register:
- **T-01-14-01:** mitigated. `Math.max(0, Math.min(8, n))`, with NaN → 3. The e2e checks npcs=99 → 8 and npcs=0 → 0.
- **T-01-14-02:** mitigated. 512² textures with a per-letter texture/material cache; no mipmaps. `texturesLoaded` ≤ 4 is asserted in normal play.
- **T-01-14-03:** accepted. Same-origin committed GLB and PNGs; CSP `img-src 'self'` covers the TextureLoader image requests. The e2e found no off-origin request.

## TDD Gate Compliance

- RED `test(01-14)` 6dab730 came before GREEN `feat(01-14)` 1cdd175 for the walker.
- The NPC e2e was committed failing in 1cdd175 and went green in f0aeb72.
- No refactor commit was needed.

## Self-Check: PASSED

- FOUND: src/logic/waypointWalker.ts, src/render/characters.ts, src/game/npc.ts, src/game/waypoints.ts, tests/unit/waypointWalker.test.ts, tests/unit/waypoints.test.ts, tests/e2e/npc.spec.ts
- FOUND commits: 6dab730, 1cdd175, a91d5cc, f0aeb72

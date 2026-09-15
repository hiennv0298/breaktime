---
phase: 01-spike-k-thu-t-ng-deploy
plan: 05
subsystem: assets
tags: [kenney, cc0, gltf-transform, meshopt, ffmpeg-static, mp3, credits]
requires:
  - phase: 01-01
    provides: "devDependencies @gltf-transform/cli@4.5.0 + ffmpeg-static@5.3.0; npm scripts assets:fetch / assets; .gitignore for assets-src/downloads and assets-src/.tmp"
provides:
  - "src/assets/office.glb: 15 Furniture Kit roles merged, 2 palette materials, meshopt"
  - "src/assets/food.glb: mug + cup-coffee (colormap texture embedded, 1 material)"
  - "src/assets/office-index.json: role -> root node name for office.glb and food.glb"
  - "src/assets/character.glb: Blocky character-a, nodes leg-left/leg-right/torso/arm-left/arm-right/head, 27 clips, NORMAL kept, 512² texture"
  - "src/assets/tex/character-{a..r}.png: 18 × 512×512 RGBA"
  - "src/assets/sfx/{slap-0..2, break-glass-0..1, break-ceramic-0..1, drop-wood-0..1, drop-soft-0, drop-metal-0}.mp3"
  - "assets-src/fetch-kenney.mjs, assets-src/build-assets.mjs, assets-src/asset-map.json"
  - "CREDITS.md"
affects: [01-10, 01-13, 01-14, 01-15, 01-16]
tech-stack:
  added: []
  patterns:
    - "Dev-time asset pipeline: role map JSON -> gltf-transform (spawned via process.execPath) + ffmpeg-static binary, outputs committed"
    - "GLB JSON chunk parsed in Node to prove structure (role nodes, clips, NORMAL) instead of trusting exit codes"
key-files:
  created:
    - assets-src/fetch-kenney.mjs
    - assets-src/asset-map.json
    - assets-src/build-assets.mjs
    - src/assets/office.glb
    - src/assets/food.glb
    - src/assets/office-index.json
    - src/assets/character.glb
    - src/assets/tex/character-a.png … character-r.png (18)
    - src/assets/sfx/*.mp3 (11)
    - CREDITS.md
  modified: []
key-decisions:
  - "asset-map.json paths are relative to each pack folder (office -> furniture-kit, food -> food-kit, character -> blocky-characters, sfx -> impact-sounds); recorded in _notes"
  - "Substitutions: coffeeMachine=kitchenCoffeeMachine, fridge=kitchenFridge, pantryCounter=kitchenCabinet, plantSmall=plantSmall1, bookcase=bookcaseClosed, boxClosed=cardboardBoxClosed; drop-wood-1 uses impactWood_medium_000 for variety"
  - "office-index.json keeps Kenney root node names (e.g. desk(Clone)) instead of renaming nodes to role names; the build fails if a root name is missing or not unique in the output"
  - "meshopt quantization (KHR_mesh_quantization) puts each mesh on an unnamed child node under the named node; animation channels still target the named nodes, so consumers must look up parts by name and not expect node.mesh on them"
patterns-established:
  - "Every generated asset is verified structurally (GLB JSON, PNG IHDR, MP3 ID3/frame sync) and sized raw+gzip; build exits 1 over 2,000,000 raw bytes"
requirements-completed: []
metrics:
  duration: "~8 min (04:00:02Z to 04:07:36Z)"
  completed: 2026-09-15
  tasks: 2
  files: 35
---

# Phase 1 Plan 05: CC0 asset pipeline Summary

Four Kenney CC0 packs are fetched over HTTPS and license-gated. One reproducible `npm run assets` then builds a 580 KB raw / 400 KB gzip runtime set:
- an office GLB with 15 roles in 2 palette materials
- a food GLB
- a shared Blocky character with 27 clips and normals kept
- 18 character textures at 512²
- 11 MP3 SFX converted by ffmpeg-static

CREDITS.md attributes every file.

## Task 1: Fetch, CC0 gate, inventory, asset map (commit b5f9cf3)

- `npm run assets:fetch` rc 0 printed:
  - `FETCHED blocky-characters 2148510 license=CC0`
  - `FETCHED furniture-kit 5130729 license=CC0`
  - `FETCHED food-kit 4606270 license=CC0`
  - `FETCHED impact-sounds 800850 license=CC0`
  - `INVENTORY 545 files`
- A second run skipped every download because Content-Length matched, and printed the same four lines.
- License.txt versions: Blocky Characters 2.0, Furniture Kit 2.0, Food Kit 2.0, Impact Sounds 1.0. All say "Creative Commons Zero, CC0".
- Plan node check: `MISSING none SFX 11`, rc 0. Extra check: all 15 food, character and sfx paths exist (`OTHER_MISSING none 15`).
- `git check-ignore assets-src/downloads/inventory.txt` printed the path. `grep -ci "printer\|cooler" assets-src/asset-map.json` printed `0`.
- Furniture Kit really has no printer or water cooler. None was imported; they stay primitives for plan 01-10 (D-09, Q6).

## Task 2: build-assets.mjs, outputs, CREDITS.md (commit d288d5f)

- `npm run assets` rc 0, and its last line is `ASSETS_OK files=33 bytes=580240` (under 2,000,000).
- Sizes, raw / gzip:
  - office.glb: 84,784 / 24,730
  - food.glb: 18,788 / 14,906
  - character.glb: 83,060 / 45,589
  - 18 textures: 14.5–24.4 KB each
  - 11 MP3: 2.9–8.5 KB each
- Plan node check: `TEX 18 SFX 11 ROLES 15`, rc 0.
- Structure proven from the GLB JSON chunk, not from exit codes:
  - **character.glb:** the 6 part nodes exist and there are 27 animations, including idle, walk, die, attack-melee-right and interact-right. All 6 mesh primitives have NORMAL. Vertex and index counts match the source exactly (v24/i36 ×5, v23/i36 head), so simplify/weld removed nothing. The 144 animation channels target root plus the 6 named parts. The embedded PNG is 512×512 (38,860 bytes). The hierarchy root > torso > arms/head is kept.
  - **office.glb:** materials=2 (PaletteMaterial001/002, one PaletteBaseColor image). All 15 role root nodes appear exactly once.
  - **food.glb:** materials=1 (colormap). This matches RESEARCH A4, so food stays a separate file.
  - **Textures:** all 18 PNGs have IHDR 512×512 with colour type 6 (RGBA).
  - **MP3:** every file is over 1,000 bytes and starts with ID3 or a frame sync.
- Other acceptance checks:
  - `grep -c CC0 CREDITS.md` = 8, and both kenney.nl/assets URLs appear once.
  - `find src dist -iname "*ffmpeg*" | wc -l` = 0.
  - `ls src/assets/*.glb | wc -l` = 3.
  - No `http(s)://` string appears anywhere under src/assets (TECH-05).
- **Reproducibility:** a combined sha256 over every file in src/assets matched before and after a rerun (`52b571f0…187b`).
- **Negative control:** deleting `office.books` from asset-map.json made the build fail with `ASSETS_FAIL asset-map.json office lacks roles: books`, rc 1. The map was then restored with `git checkout`.
- **Git:** all 32 binaries (3 GLB, 18 PNG, 11 MP3) show as binary in `git diff --cached --numstat`, so core.autocrlf=true cannot mangle them. The commit deletes no files.
- `assets-src/.tmp` is removed after a successful run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] gltf-transform package.json hidden by its exports map**
- **Found during:** Task 2, first `npm run assets`
- **Issue:** `require.resolve('@gltf-transform/cli/package.json')` threw ERR_PACKAGE_PATH_NOT_EXPORTED.
- **Fix:** Read `node_modules/@gltf-transform/cli/package.json` directly, then resolve the `bin` entry from it. It is still spawned with `process.execPath`, no shell.
- **Files modified:** assets-src/build-assets.mjs
- **Commit:** d288d5f

**2. [Rule 2 - Correctness] Hardening beyond the spec**
- The pack path must stay inside its pack folder (T-01-05-02).
- Each source GLB must have exactly one named root. Root names must not collide across roles, and each must be unique in the output.
- Before each run, stale `sfx/*.mp3` and `tex/character-?.png` are removed, so the directory counts cannot pass on leftovers.
- The build fails if any file under src/assets has "ffmpeg" in its name.
- gltf-transform output is captured and printed only on failure, so `ASSETS_OK` really is the last line.
- **Commit:** b5f9cf3, d288d5f

**3. [Scope note] .gitignore not modified**
- `assets-src/.tmp/` and `assets-src/downloads/` were already in .gitignore from plan 01-01, so the conditional append was a no-op.

## Notes for consumers

- **01-14 / 01-15 (character, ragdoll):** under meshopt quantization, `leg-left`, `torso` and the other part nodes are transform nodes, and each mesh sits on an unnamed child node. Look parts up by name with `getObjectByName` and drive the named node; do not expect `.isMesh` on it. The material is `KHR_materials_unlit` (character-a). Replace it with Lambert in code, as Pattern 9 and Pitfall 9 describe.
- **01-10 (room):** office-index.json values are Kenney root names such as `desk(Clone)`. The coffee machine contains its own child node named `mug` inside office.glb. That is a different file from food.glb's `mug`, so always resolve names within the right GLB.
- **01-13 (audio):** the role names are the file names under `src/assets/sfx/`.

## Known Stubs

- CREDITS.md section "Made in this repository (CC0)" credits the printer and water cooler primitives, the shard kit and the blob-shadow texture. Plans 01-10 and 01-15/01-16 create them, as the plan intends.

## Self-Check: PASSED

- Files present: assets-src/fetch-kenney.mjs, assets-src/asset-map.json, assets-src/build-assets.mjs, src/assets/{office,food,character}.glb, src/assets/office-index.json, 18 × src/assets/tex/character-?.png, 11 × src/assets/sfx/*.mp3, CREDITS.md
- Commits present: b5f9cf3, d288d5f

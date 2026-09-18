# Credits

Every third-party asset shipped with Break Time is licensed **CC0 1.0** (public domain dedication).
Crediting Kenney is not required by the license; we do it anyway.

Runtime files under `src/assets/` are rebuilt from the original packs with `npm run assets:fetch && npm run assets`
(`assets-src/fetch-kenney.mjs`, `assets-src/build-assets.mjs`, role mapping in `assets-src/asset-map.json`).
The build stops unless each pack's `License.txt` contains `CC0`.

## Blocky Characters

- Author: Kenney (www.kenney.nl)
- License: Creative Commons Zero, CC0 1.0 (http://creativecommons.org/publicdomain/zero/1.0/)
- Source: https://kenney.nl/assets/blocky-characters
- Version: 2.0 (License.txt creation date 10-06-2025; zip `kenney_blocky-characters_20.zip`)
- Files used:
  - `Models/GLB format/character-a.glb` → `src/assets/character.glb` (shared geometry + 27 animation clips, texture resized to 512²)
  - `Models/GLB format/Textures/texture-a.png` … `texture-r.png` (18 files) → `src/assets/tex/character-a.png` … `character-r.png` (512² RGBA)

## Furniture Kit

- Author: Kenney (www.kenney.nl)
- License: Creative Commons Zero, CC0 1.0 (http://creativecommons.org/publicdomain/zero/1.0/)
- Source: https://kenney.nl/assets/furniture-kit
- Version: 2.0 (License.txt creation date 20-10-2018; zip `kenney_furniture-kit.zip`)
- Files used (all from `Models/GLTF format/`, merged into `src/assets/office.glb`):
  - `desk.glb`, `chairDesk.glb`, `computerScreen.glb`, `computerKeyboard.glb`, `computerMouse.glb`, `laptop.glb`
  - `kitchenCoffeeMachine.glb`, `kitchenFridge.glb`, `kitchenCabinet.glb`
  - `pottedPlant.glb`, `plantSmall1.glb`, `trashcan.glb`, `bookcaseClosed.glb`, `books.glb`, `cardboardBoxClosed.glb`

## Food Kit

- Author: Kenney (www.kenney.nl)
- License: Creative Commons Zero, CC0 1.0 (http://creativecommons.org/publicdomain/zero/1.0/)
- Source: https://kenney.nl/assets/food-kit
- Version: 2.0 (License.txt creation date 26-06-2024; zip `kenney_food-kit.zip`)
- Files used (merged into `src/assets/food.glb`):
  - `Models/GLB format/mug.glb`, `Models/GLB format/cup-coffee.glb`
  - `Models/GLB format/Textures/colormap.png` (embedded)

## Impact Sounds

- Author: Kenney (www.kenney.nl)
- License: Creative Commons Zero, CC0 1.0 (http://creativecommons.org/publicdomain/zero/1.0/)
- Source: https://kenney.nl/assets/impact-sounds
- Version: 1.0 (License.txt creation date 19-12-2019; zip `kenney_impact-sounds.zip`)
- Files used (from `Audio/`, converted OGG → MP3 mono 44.1 kHz 96 kbps into `src/assets/sfx/`):
  - `impactPunch_heavy_000.ogg`, `impactPunch_heavy_001.ogg`, `impactPunch_heavy_002.ogg` → `slap-0.mp3`, `slap-1.mp3`, `slap-2.mp3`
  - `impactGlass_heavy_000.ogg`, `impactGlass_heavy_001.ogg` → `break-glass-0.mp3`, `break-glass-1.mp3`
  - `impactPlate_heavy_000.ogg`, `impactPlate_heavy_001.ogg` → `break-ceramic-0.mp3`, `break-ceramic-1.mp3`
  - `impactWood_heavy_000.ogg`, `impactWood_medium_000.ogg` → `drop-wood-0.mp3`, `drop-wood-1.mp3`
  - `impactSoft_heavy_000.ogg` → `drop-soft-0.mp3`
  - `impactMetal_heavy_000.ogg` → `drop-metal-0.mp3`
  - `impactPunch_medium_000.ogg`, `impactPunch_medium_001.ogg`, `impactPunch_medium_002.ogg` → `hurt-0.mp3`, `hurt-1.mp3`, `hurt-2.mp3`
  - `impactGeneric_light_000.ogg` → `alert-0.mp3`

## Made in this repository (CC0)

These are authored in code in this repository and dedicated to the public domain under CC0 1.0:

- Printer and water cooler: built from box/cylinder primitives in Furniture Kit palette colours. No third-party model is used.
- Shard kit geometry: the shared low-poly pieces used when cups, monitors and plants break.
- Blob-shadow gradient texture: generated at runtime on a canvas.

## Fonts

No web fonts are shipped. The UI uses the system font stack.

## Build tooling (not shipped)

These run only on the developer machine. None of their files are copied into `src/` or `dist/`:

- `@gltf-transform/cli` (MIT): merges and optimises the GLB files
- `ffmpeg-static` (GPL-3.0-or-later ffmpeg binary): converts OGG to MP3 and resizes PNGs

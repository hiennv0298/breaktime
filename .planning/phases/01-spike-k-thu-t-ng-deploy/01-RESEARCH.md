# Phase 1: Spike kỹ thuật & đường deploy - Research

**Researched:** 2026-09-14
**Domain:** Browser 3D game stack (Three.js + Rapier WASM + Vite/TS), mobile-web input/audio/perf, static deploy behind a shared Caddy on a VPS
**Confidence:** HIGH for stack, sizes, assets and Caddy/server facts (measured or verified this session). MEDIUM for mobile perf and iOS behaviour (only real devices can prove these; that is the phase gate).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Domain & deploy VPS
- **D-01:** Bản chơi thử chạy ở **`breaktime.doibung.com`**. Operator phải thêm bản ghi DNS `A breaktime → 187.53.128.67` (việc tay, người làm). Caddy tự xin HTTPS.
- **D-02:** Gắn game vào Caddy của stack `doibung` bằng **cơ chế import thư mục sites**, cấu hình **trực tiếp trên VPS qua `ssh doibung`** (operator chốt 14/09/2026). **KHÔNG sửa repo `d:\whattoeat` ở máy local**; máy local chỉ dùng để chạy và test game.
  - Trên server: Caddyfile đang chạy (`/opt/doibung/Caddyfile.nodb`) thêm `import /etc/caddy/sites/*.caddy`; compose đang tạo container caddy mount thư mục host (ví dụ `/srv/sites`) vào caddy **read-only**, gồm file site `*.caddy` + thư mục web tĩnh của từng dự án
  - Recreate container caddy **một lần** (doibung.com gián đoạn vài giây; volume `caddy_data` giữ nguyên cert). Trước khi sửa: sao lưu file gốc trên server; sau khi sửa: kiểm doibung.com trả 200
  - Mọi file của break-time nằm **ngoài `/opt/doibung`** (dưới `/srv/sites`) để deploy whattoeat không xoá được game
  - ⚠️ **Rủi ro còn lại (đã chấp nhận):** deploy whattoeat tiếp theo (`rsync --delete` từ `d:\whattoeat` vào `/opt/doibung`) sẽ **ghi đè 2 dòng sửa trong Caddyfile/compose** → game mất khỏi Caddy. Plan phải có: (a) một script/lệnh kiểm tra idempotent "Caddy còn import sites không" chạy trong `npm run deploy` của break-time, tự báo lỗi rõ ràng nếu dòng import biến mất; (b) ghi chú bàn giao cho operator về việc này. Không tự sửa repo whattoeat.
- **D-03:** Deploy bằng **script local `npm run deploy`**, chạy tuần tự: build → kiểm kích thước (vượt trần thì dừng) → test chặn (D-24) → rsync qua `ssh doibung` → `caddy reload` nếu file site đổi → smoke test **cả** `https://breaktime.doibung.com` **và** `https://doibung.com` (phải trả 200). Không dùng CI, không đưa private key root lên đâu.
- **D-04:** Server giữ **bản mới nhất ở `/`** và **bản theo commit ở `/b/<sha>/`**, giữ khoảng 10 bản gần nhất, tự dọn bản cũ. Vite dùng base tương đối để một build chạy được ở cả hai đường dẫn. Mục đích: mở 2 bản trên cùng điện thoại để so fps, và quay lại bản cũ khi bản mới lỗi.
- **D-05:** Bản chơi thử **công khai hoàn toàn**: không mật khẩu, không chặn index (operator chọn).

### Máy đo & cổng chặn
- **D-06:** Operator có sẵn **một Android tầm trung + một iPhone** làm máy chuẩn. **Model chưa ghi.** Plan phải có bước ghi model/OS/trình duyệt vào kết quả đo **trước lần đo đầu tiên**, và dùng đúng hai máy đó cho mọi phase sau.
- **D-07:** Build đầu chưa đạt (< 30 fps trên Android chuẩn, hoặc crash Safari iOS trong 15 phút) thì làm **đúng một vòng tối ưu có danh sách sẵn**:
  1. hạ `devicePixelRatio` render
  2. tắt mọi bóng động còn sót
  3. instancing / gộp mesh tĩnh
  4. giới hạn số mảnh vỡ + tự dọn nhanh hơn
  5. cho body ngủ sớm hơn

  Đo lại. **Vẫn không đạt thì DỪNG**, viết đánh giá PlayCanvas trước khi sang Phase 2. Không đi tiếp trên stack chưa đạt.
- **D-08:** Đo fps bằng **chế độ benchmark `?bench=1`**: kịch bản cố định 60s tự chạy (nhân vật đi quanh phòng, tát NPC, đập ≥ 20 đồ, 8 NPC ngã ragdoll cùng lúc — xem D-11). Kết thúc hiện: fps trung bình, fps 1% thấp nhất, draw call, số physics body đỉnh, commit sha, mức chất lượng đang dùng. Ảnh chụp màn hình kết quả là bằng chứng nghiệm thu. Mọi lần đo dùng cùng kịch bản (seed cố định).

### Nội dung căn phòng spike
- **D-09:** Nhân vật dùng **Kenney Blocky Characters** (CC0, 18 nhân vật, 27 animation, có glTF). Đồ nội thất ưu tiên **Kenney Furniture Kit** (CC0, 140 model, có glTF) cho đồng bộ style. ⚠️ **Chưa kiểm** Furniture Kit có máy tính/màn hình/máy in/cây nước không; researcher phải liệt kê được đồ thật, thiếu thì bù bằng pack CC0 khác của Kenney hoặc khối low-poly tự dựng cùng style.
- **D-10:** Căn phòng là **open-space 4 bàn làm việc + góc pantry**, bố cục dùng lại được cho Phase 2–3 (NPC đi bàn ↔ pantry, prank cà phê).
- **D-11:** **3 NPC khi chơi thường**, đi vòng qua các điểm **đặt tay** (bàn ↔ pantry), không navmesh, không lịch trình (đó là DETECT-07, Phase 2). **Benchmark tăng lên 8 NPC** (trần của Tầng 1) và cho ngã ragdoll cùng lúc để đo trần thật.
- **D-12:** Cú tát/đẩy kiểu **slapstick phóng đại**: NPC bay xa, xoay, tiếng "bốp", hit-stop khoảng 60ms, rung màn hình nhẹ, ngã ragdoll rồi **tự đứng dậy** đi tiếp. Không máu (PEGI 12).
- **D-13:** Đồ vật: **phần lớn văng/đổ theo vật lý** (ghế, thùng rác, giấy tờ…). **Cốc, màn hình, chậu cây vỡ thành mảnh cắt sẵn**; mảnh tự dọn sau vài giây, số mảnh tối đa có trần.
- **D-14:** Ánh sáng **màu phẳng + bóng tròn giả (blob shadow) dưới chân** nhân vật/đồ vật. **Không dùng shadow map thời gian thực.**
- **D-15:** Có **vài SFX CC0** (tát, đồ vỡ, đồ rơi) để đánh giá cảm giác slapstick, và để kiểm tra sớm việc iOS chỉ phát âm thanh sau lần chạm đầu. Nhạc nền để Phase 7.

### Điều khiển & hướng màn hình
- **D-16:** Mobile **ưu tiên màn ngang**. Cầm dọc vẫn chơi được: camera lùi xa hơn, nút dồn xuống đáy. **Không** bắt người chơi xoay máy.
- **D-17:** Joystick ảo **nổi theo ngón tay**: chạm đâu ở nửa trái màn hình thì joystick hiện ngay đó.
- **D-18:** Tát bằng **nút ngữ cảnh (mobile) / phím E (desktop)** khi đứng gần NPC; icon nút đổi theo vật gần nhất. Kéo/vuốt để vung đòn dành cho Rage Mode (Phase 4).
- **D-19:** Camera góc nghiêng cố định, **bám mượt theo nhân vật**, tầm nhìn khoảng 1/2 phòng. Xoay 90° bằng **Q/E trên desktop** và **nút ⟲ ⟳ góc trên phải trên mobile**.
- **D-20:** Desktop di chuyển bằng WASD, tương tác bằng E hoặc click chuột trái vào vật đang sáng (CTRL-01). Pause bằng ESC/Space; mobile có nút ⏸ (CTRL-04).

### Máy yếu / không có WebGL
- **D-21:** Có **3 mức chất lượng Thấp / Vừa / Cao**, chỉnh pixel ratio, trần mảnh vỡ và khoảng cách vẽ. Game đo fps vài giây đầu rồi **tự chọn mức**, và **có nút đổi tay** trong menu pause. Benchmark ghi rõ đang chạy mức nào.
- **D-22:** Trình duyệt không có WebGL2 thì hiện **màn báo rõ ràng** (không màn đen), gợi ý trình duyệt khác.

### Test tự động
- **D-24:** **Vitest** cho logic thuần. **Playwright headless** mở bản build và kiểm: game load không lỗi console, `?bench=1` chạy tới cuối và in kết quả, **không có request nào ra ngoài origin** (TECH-05). Bất kỳ kiểm tra nào hỏng thì `npm run deploy` dừng. FPS **không** đo bằng headless (không có GPU thật); chỉ tin số đo trên máy thật (D-08).

### Màn vào game
- **D-23:** Có **màn tải với thanh tiến trình thật**, xong hiện **một nút "Chơi"**. Lần chạm này mở khoá âm thanh iOS và xin toàn màn hình. Góc màn hình luôn hiện tên tạm **"Break Time"** + **commit sha ngắn** để ảnh chụp bench biết là bản nào.

### Claude's Discretion
- Cấu trúc thư mục, cách tách module render / physics / logic / input, ECS hay không
- Phiên bản thư viện cụ thể (lấy bản ổn định hiện hành), cấu hình Vite, cách nén asset (glTF + meshopt/Draco, KTX2) và cách chia chunk để đạt ≤ 8 MB tải đầu
- Thông số vật lý (lực tát, khối lượng, số khớp ragdoll của Blocky Characters), thời gian dọn mảnh
- Thuật toán tự chọn mức chất lượng (ngưỡng fps, số giây đo)
- Cách dựng ragdoll cho nhân vật khối (hộp/capsule cho từng khúc)
- Bố cục chi tiết căn phòng và vị trí 20 đồ vật
- Nguồn SFX CC0 cụ thể (ghi vào CREDITS.md)
- Tên file site Caddy, đường dẫn thư mục dưới `/srv/sites`, chiến lược dọn bản `/b/<sha>/`

### Deferred Ideas (OUT OF SCOPE)
- Bảo vệ bản chơi thử bằng mật khẩu / noindex: operator chọn công khai hoàn toàn. Nên xem lại trước khi nộp CrazyGames (Phase 8) nếu muốn tránh bản dở bị index dưới tên game.
- Navmesh + lịch trình NPC: Phase 2 (DETECT-07).
- Vung đòn bằng kéo/vuốt: Phase 4 (RAGE-03).
- Nhạc nền, bật/tắt âm thanh đầy đủ: Phase 7 (UX-03).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TECH-01 | URL works on Chrome/Edge/Firefox desktop, Chrome Android, Safari iOS, no install | Vite 8 default target = `safari16.4 / ios16.4 / chrome111` (verified in Vite source). Capability gate for WebGL2 + WASM-SIMD (§Pattern 2). HTTPS URL via Caddy (§Caddy). |
| TECH-02 | First load ≤ 8 MB (hard cap 20 MB), build prints per-part sizes | Measured: three ≈ 654 KB raw / 165 KB gz; Rapier SIMD compat ≈ 3.09 MB raw / 1.07 MB gz / 770 KB br; 20 furniture models ≈ 105 KB raw / 26 KB gz; one shared character GLB ≈ 60 KB. Estimated first load ≈ 4.5 MB raw / ≈ 1.6 MB gz. Size report + gate from Playwright-observed request list (§Pattern 9). |
| TECH-03 | ≥ 30 fps mid-range Android, 60 desktop, heaviest scene | Draw-call and body budget (§Performance budget), blob shadows, palette merge to 2 materials, instanced debris, quality tiers, `?bench=1` stats with 1% low (§Pattern 7). Proven only on real devices. |
| TECH-04 | 15 min Safari iOS, no crash/reload | DPR cap, canvas-resize guard, texture downsizing (1024² → 512²), debris/ragdoll caps, `webglcontextlost` handling, crash beacon via localStorage heartbeat, `?soak=1` mode (§Pattern 8). Manual 15-min run on real iPhone. |
| TECH-05 | No outside requests | Everything bundled, system font stack, CSP meta tag with `default-src 'self'` (verified that Rapier needs `'wasm-unsafe-eval'`), Playwright origin assertion (§Pattern 10). |
| TECH-06 | Pure logic unit-tested without browser | Vitest 5 (verified runs, Rapier compat also runs under Node). Pure modules listed in §Recommended Project Structure. |
| TECH-07 | Toggleable debug HUD: fps, draw calls, physics bodies | `renderer.info.render.calls`, `world.bodies.len()`, sleeping count via `isSleeping()` (verified in r186 / Rapier 0.20 d.ts). DOM HUD updated at 4 Hz. |
| CTRL-01 | Desktop WASD + E / left-click highlighted object | `KeyboardEvent.code`, raycast pick on click. **Key conflict with D-19 Q/E, see Conflicts C1.** |
| CTRL-02 | Mobile floating joystick left half + big context button with changing icon | Hand-rolled Pointer Events joystick (§Pattern 4), `touch-action:none`, pointer capture (Safari 13+). |
| CTRL-03 | Fills screen portrait and landscape; rotation doesn't break UI | `100dvh` (Safari 15.4+), `viewport-fit=cover` + safe-area insets, resize guard, orientation media queries. iPhone has no element Fullscreen API (MDN BCD), see Conflicts C2. |
| CTRL-04 | Pause ESC/Space and ⏸ button | Pause state in pure game-state module; auto-pause on `visibilitychange`. |
| CTRL-05 | Rotate camera in 90° steps | Camera yaw target snaps to k·90°, smooth damp; mobile ⟲ ⟳ buttons. |
| PLAT-01 | One-command deploy, doibung.com not interrupted | Node `scripts/deploy.mjs`: Windows OpenSSH + `tar` stream (verified end-to-end read-only), releases + atomic symlink, flock, server-state drift check, doibung.com polling during deploy (§Pattern 11/12). |
| PLAT-02 | HTTPS on its own subdomain | `breaktime.doibung.com` site file imported by the doibung Caddy (v2.11.4 verified). Site config tested locally in a `caddy:2.11.4-alpine` container (§Caddy). Needs DNS A record (NXDOMAIN today). |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

`D:\break-time\CLAUDE.md` holds only the PROJECT block. No coding conventions exist yet. Directives the planner must verify:

- **Stack:** TypeScript + Vite + Three.js + Rapier (WASM). No other engine.
- **Size:** first load target ≤ 8 MB, hard cap ≤ 20 MB.
- **Performance:** ≥ 30 fps stable on mid-range Android, 60 fps desktop; into gameplay ≤ 10 s on 4G.
- **Web portals:** no outside requests (fonts/assets/libs all bundled); works with an ad-blocker on; `localStorage` wrapped in try/catch; ESC/Space pauses; cutscenes skippable.
- **Content:** ≤ PEGI 12 (no blood).
- **Assets:** CC0 or equivalent (commercial + web allowed) only; every source recorded in `CREDITS.md`.
- **Data:** no personal data collected in v1.
- **Deploy infra:** shares the VPS with doibung.com and must never interrupt doibung.com.
- Global user rules that apply here: no emojis in reports. CodeGraph is skipped because `D:\break-time` has no `.codegraph/`.
- Operator memory notes that affect this phase: rc=0 with empty output is not proof of success, so check output length/markers. Inline Bash `set -e` can report false green, so use script files or Node. `grep -P` silently returns nothing on this machine. PATH can drop mid-session, so use absolute exe paths. Git Bash rewrites `/etc/...` args for native Windows exes (measured this session: `docker exec ... /etc/caddy/Caddyfile` became `C:/Program Files/Git/etc/caddy/Caddyfile`).

## Summary

The stack fits the budget with a wide margin, measured this session with a Vite 8.3 build of the real imports. Three.js r186 WebGLRenderer plus GLTFLoader, meshopt decoder and SkeletonUtils comes to 654 KB raw / 165 KB gzip. Rapier 0.20 is the largest cost: the SIMD `-compat` build is 3.09 MB raw, 1.07 MB gzip, 770 KB brotli. Kenney assets are tiny: 20 furniture models merged with palette + meshopt come to 105 KB raw / 26 KB gzip in 2 materials. Blocky Characters turned out to share **identical geometry, UVs and all 27 animations across the 18 characters**. Only the 1024² texture differs, so the game ships one character GLB plus 18 small textures. Estimated first load is about 4.5 MB raw / 1.6 MB gzip, well under 8 MB. The fps and iOS-stability gates can only be closed on the operator's phones.

Blocky Characters 2.0 has **no skinned skeleton**. Each character is 6 rigid mesh nodes (`leg-left`, `leg-right`, `torso` → `arm-left`, `arm-right`, `head`) animated by node TRS tracks, 72 triangles in total. That makes a 6-body Rapier ragdoll trivial to map 1:1, but there is no get-up clip, so D-12's stand-up must be procedural. Furniture Kit has desk, office chair (`chairDesk`), monitor (`computerScreen`), laptop, keyboard, mouse, coffee machine, fridges, plants, trash can, bookcases, books and boxes. It has **no printer, no water cooler, no cup**. Cups/mugs come from **Kenney Food Kit** (CC0, `mug`, `cup-coffee`, `cup-tea`). Printer and water cooler should be built from primitives in the same palette, because the Poly Pizza candidates are CC-BY. SFX come from **Kenney Impact Sounds** (CC0, `impactPunch_*`, `impactGlass_*`, `impactPlate_*`, `impactWood_*`). They are OGG, which iOS Safari only fully decodes from 18.4, so convert them to MP3.

On the server, read-only inspection found things the plan must handle. Caddy is **v2.11.4**. The caddy container carries label `config_files=/opt/doibung/docker-compose.nodb.yml`, while app and postgres were created from `docker-compose.withdb.yml`. `docker compose config --hash` shows the nodb file's `app` hash differs from the running app. **Running `docker compose -f docker-compose.nodb.yml up -d caddy` without `--no-deps` would recreate the app without `DATABASE_URL`.** Caddy's admin API listens on `127.0.0.1:2019` only; busybox `wget localhost` resolves to `::1` and is refused. SELinux is disabled, so bind mounts need no `:z`. `rsync` exists on the server but **not** locally, so the upload is a `tar` stream over Windows OpenSSH, verified working. The full candidate site config was run in a local `caddy:2.11.4-alpine` container and verified: relative symlink `current`, `/b/<sha>/`, 308 on missing slash, 404 for bad sha, precompressed br/gzip, `application/wasm`, hidden `.map`/`.env`, cache headers, and an empty import glob only warning.

**Primary recommendation:** Build the walking skeleton first. That means scaffold, capability gate, one room, WASD/joystick capsule, one Rapier push, size report, Playwright smoke, a one-time server apply (mount + import, zero sites), and first `npm run deploy` to `breaktime.doibung.com`. Only then layer Blocky NPCs, ragdoll, breakables, bench/soak, quality tiers, and the real-device gate.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Rendering, animation, blob shadows | Browser / Client (WebGL2) | — | Pure client game; no server rendering |
| Physics (ragdoll, props, debris) | Browser / Client (Rapier WASM) | — | Local simulation; deterministic per device only |
| Input (keyboard, pointer, floating joystick) | Browser / Client | — | DOM Pointer/Keyboard events |
| Gameplay logic (quality tier choice, bench stats, waypoint walker, get-up FSM, debris budget) | Browser / Client, pure TS modules | Node (Vitest) | Kept free of three/DOM so TECH-06 tests run in Node |
| Audio unlock + SFX | Browser / Client (Web Audio) | — | iOS gesture rules are client-side |
| Static hosting, TLS, cache/security headers, precompressed delivery | CDN / Static (Caddy `file_server` on VPS) | — | Shared doibung Caddy; no app server for the game |
| Build, size gate, tests, precompression | Local build machine (Windows 11, Node 22) | — | D-03: no CI, no build on the 1 vCPU VPS |
| Deploy transport, release retention, drift detection | Local Node script → SSH → server shell | Server Docker/Caddy (read-only checks) | Key stays local; server only receives files and runs fixed scripts |
| One-time Caddy wiring (mount + import) | Server ops (bash script over SSH, operator-approved) | — | D-02: edited on server, never in `d:\whattoeat` |

## Standard Stack

### Core
| Library | Version (verified npm 2026-09-14) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `three` | 0.186.0 (published 2026-09-08) | WebGLRenderer, scene, GLTFLoader, AnimationMixer, InstancedMesh, `Timer` | Locked stack. WebGL1 dropped since r163 (source). `Clock` deprecated since r183, so use `Timer` (runtime warning observed) |
| `@dimforge/rapier3d-simd-compat` | 0.20.0 (2026-08-08) | Physics, primary build | Official Dimforge build (README in package lists `-simd` and `-compat`). WASM embedded in JS, so no bundler/MIME issues. SIMD support matches Vite 8's iOS 16.4 baseline |
| `@dimforge/rapier3d-compat` | 0.20.0 (2026-08-08) | Physics, fallback if SIMD init throws or `?simd=0` | 6.2 M weekly downloads, the battle-tested path. Same API. Lazy chunk, only downloaded when used |
| `vite` | 8.3.0 (2026-09-10) | Dev server + Rolldown build | Needs Node ^20.19 or ≥22.12; local Node is 22.14.0 |
| `typescript` | 7.0.2 (Go-native `tsc`) | Type-check only (`tsc --noEmit`) | Verified: typechecks three + Rapier code, negative control fails correctly. Ships **no JS API**, so avoid typescript-eslint (or alias `@typescript/typescript6`). `types` defaults to `[]`, so list `"vite/client"` |
| `vitest` | 5.0.0 (2026-09-05) | Unit tests for pure logic | Needs Node ≥22.12, Vite ≥6.4. Verified runs here |
| `@playwright/test` | 1.63.0 (2026-09-14) | Headless E2E against `vite preview` | Verified: Chromium Headless Shell 153 gives WebGL2 via SwiftShader on this machine without flags |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/three` | 0.186.0 | Types | Always (dev) |
| `@gltf-transform/cli` | 4.5.0 | Offline asset pipeline: `merge`, `optimize --compress meshopt --palette`, `resize` | Dev only; outputs are committed, never run at deploy time |
| Three addons (bundled in `three`) | r186 | `three/addons/loaders/GLTFLoader.js`, `three/addons/libs/meshopt_decoder.module.js`, `three/addons/utils/SkeletonUtils.js`, `three/addons/utils/BufferGeometryUtils.js` | Loader + clone + static merge |
| ffmpeg (system tool, not npm) | any | One-time OGG → MP3 conversion of Kenney SFX | Not installed locally. Operator installs via `winget install Gyan.FFmpeg` (human step), or the conversion task becomes a checkpoint |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `rapier3d-simd-compat` | `@dimforge/rapier3d` (non-compat) + Vite 8.1 native Wasm ESM | Measured smaller: 774 KB gz wasm + 34 KB JS vs 1,073 KB gz, and streaming compile. But it relies on Vite's new Wasm ESM helper plus top-level await in a chunk, untested on iOS. Keep as a later size optimisation, not for the spike |
| WebGLRenderer | `three/webgpu` WebGPURenderer | Measured minimal bundle 213 KB gz vs 130 KB gz. Needs node materials (TSL). WebGPU on iPhone Safari not needed for a flat-colour scene. Not for this spike |
| Hand-rolled joystick | `nipplejs` 1.0.4 (MIT, rewritten 2026) | Library handles one zone. We need it to coexist with the context button, rotate and pause buttons under multi-touch, and want the math unit-testable. ~120 lines hand-rolled |
| Raw Web Audio | `howler` 2.2.4 (last publish 2023-09) | Adds an HTML5 Audio fallback we don't need. Raw Web Audio unlock is ~60 lines and testable |
| Draco | Meshopt | Kenney meshes are tiny, meshopt decoder is already in three addons (no WASM decoder download), and compressed GLB still gzips well (104 KB → 26 KB measured) |
| KTX2/Basis | Plain PNG palette + resized 512² PNG | Furniture needs no textures after `palette` (168-byte palette PNG measured). KTX2 transcoder adds ~200+ KB of WASM for no gain here |

**Installation:**
```bash
npm install three@0.186.0 @dimforge/rapier3d-simd-compat@0.20.0 @dimforge/rapier3d-compat@0.20.0
npm install -D vite@8.3.0 typescript@7.0.2 vitest@5.0.0 @playwright/test@1.63.0 @types/three@0.186.0 @gltf-transform/cli@4.5.0
npx playwright install chromium   # already downloaded on this machine this session (headless shell 1243)
```
Pin exact versions (no `^`) and commit `package-lock.json`; deploy uses `npm ci`.

## Package Legitimacy Audit

slopcheck 0.6.1 ran this session (`slopcheck scan package.json --json`). No `postinstall`/`install` scripts on any recommended package (`npm view <pkg> scripts.postinstall` empty for all).

| Package | Registry | Age | Downloads/wk | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| three | npm | since 2012 | 12.2 M | github.com/mrdoob/three.js | [OK] | Approved |
| @types/three | npm | long-standing | 7.9 M | DefinitelyTyped | [OK] | Approved |
| @dimforge/rapier3d-compat | npm | since 2021 | 6.2 M | github.com/dimforge/rapier | [OK] | Approved |
| @dimforge/rapier3d-simd-compat | npm | since 2025-03 | 3.7 K | github.com/dimforge/rapier | [OK] | Approved. Low downloads are a maturity signal, which is why the non-SIMD compat fallback is kept |
| vite | npm | since 2020 | 132 M | github.com/vitejs/vite | [OK] | Approved |
| typescript | npm | since 2012 | 203 M | github.com/microsoft/TypeScript | [OK] | Approved |
| vitest | npm | since 2021 | 77 M | github.com/vitest-dev/vitest | [SUS] (TYPOSQUAT_RISK: name close to "vite") | `vitest` [WARNING: slopcheck flagged as suspicious, verify before using.] False positive: official Vite test runner, 77 M/wk. Planner adds a lightweight human-verify note |
| @playwright/test | npm | since 2020 | 45.8 M | github.com/microsoft/playwright | [OK] | Approved |
| @gltf-transform/cli | npm | since 2018 | 80 K | gltf-transform.dev (NO_REPO info flag) | [OK] | Approved (dev tool, maintainer donmccurdy) |
| nipplejs | npm | since 2016, v1 rewrite 2026 | — | github.com/yoannmoinet/nipplejs | [OK] | Not recommended (hand-roll) |
| howler | npm | last publish 2023 | — | — | [OK] | Not recommended |
| ffmpeg-static | npm | — | — | eugeneware/ffmpeg-static | not scanned | **Rejected**: GPL-3.0 and an `install` script downloads binaries |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `vitest` (typosquat heuristic false positive, see above)

## Architecture Patterns

### System Architecture Diagram

```
                         ┌───────────────────────── LOCAL (Windows 11, Node 22) ─────────────────────────┐
 git commit ──► npm run deploy ─► guard: clean tree? ─► ssh preflight ─► SERVER DRIFT CHECK ──fail──► STOP + fix hint
                                                                             │ ok
                     tsc --noEmit ─► vite build ─► precompress (.br/.gz) ─► size gate (≤20MB hard / 8MB warn)
                                                                             │
                     vitest run ─► playwright (vite preview): no console errors · no off-origin request ·
                                   ?bench=1&dur=short completes · no-WebGL2 screen ─────fail──► STOP
                                                                             │ all green
                     start doibung.com poller (1 s) ──────────────────────────┼────────────────────────┐
                                                                             ▼                        │
                        tar -czf - dist ══ Windows OpenSSH ══► ssh doibung  (flock /srv/sites/breaktime/.lock)
                                                                             │                        │
 ┌──────────────────────────── SERVER (CentOS Stream 10, Docker 29.8, compose v5.5.1) ─────────────────┐ │
 │  extract → releases/.incoming-<sha> → verify file count/index.html → mv → releases/<sha>             │ │
 │  ln -sfn releases/<sha> current.new && mv -T current.new current      (atomic)                       │ │
 │  site file changed? → validate via stdin → swap → caddy reload --address 127.0.0.1:2019               │ │
 │  cleanup: keep 10 newest + current; names re-validated ^[0-9a-f]{7,40}$ under fixed base               │ │
 │                                                                                                      │ │
 │  /srv/sites  ──(bind, ro)──►  doibung-caddy-1:/etc/caddy/sites                                        │ │
 │     breaktime.caddy                    Caddyfile.nodb: "import /etc/caddy/sites/*.caddy"             │ │
 │     breaktime/current -> releases/<sha>                                                              │ │
 │     breaktime/releases/<sha>/…         Caddy :443 ─► doibung.com → reverse_proxy app:3000 (untouched)│ │
 │                                                  └► breaktime.doibung.com → file_server (precompressed)│ │
 └──────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
                                                                             ▼                        │
                     smoke: breaktime / 200 + version.json sha · /b/<sha>/ 200 · immutable header on asset  │
                            doibung.com 200 · www 301 → doibung.com · poller saw only 200 ◄──────────────┘
                                                                             ▼
                                                     print URLs + sizes; exit 0

 PLAYER (phone/desktop) ─► https://breaktime.doibung.com/ (or /b/<sha>/)
   index.html (no-cache, CSP meta) ─► capability gate (WebGL2? WASM SIMD?) ──no──► "unsupported" screen
        │ yes
   loading screen: import(rapier-simd-compat) ∥ fetch office.glb, character.glb, textures, sfx  (weighted progress)
        ▼
   "Chơi" tap ─► AudioContext.resume + silent buffer ─► requestFullscreen (only if document.fullscreenEnabled)
        ▼
   game loop (rAF via renderer.setAnimationLoop):
     input(kbd/joystick) ─► fixed-step 60 Hz: character controller, NPC waypoints, slap → ragdoll, props, shards
        ─► sync meshes ─► render (≈90–110 draws) ─► HUD 4 Hz ─► (bench/soak recorder)
```

### Recommended Project Structure
```
break-time/
├── index.html                    # CSP meta, viewport-fit=cover, no external refs
├── src/
│   ├── main.ts                   # boot orchestration only
│   ├── boot/                     # capabilities.ts, loading.ts, playGate.ts (audio unlock + fullscreen), buildInfo.ts, crashBeacon.ts
│   ├── logic/                    # PURE (no three/DOM/Rapier): quality.ts, benchStats.ts, joystickMath.ts,
│   │                             #   waypointWalker.ts, getUpFsm.ts, debrisBudget.ts, fixedStep.ts, rng.ts, cameraRig.ts
│   ├── physics/                  # rapierLoader.ts, world.ts, characterController.ts, ragdoll.ts, props.ts, shards.ts
│   ├── render/                   # renderer.ts, room.ts, characters.ts, blobShadows.ts, highlight.ts, cameraView.ts
│   ├── input/                    # keyboard.ts, joystick.ts (DOM glue over joystickMath), touchButtons.ts, inputState.ts
│   ├── audio/                    # sfx.ts
│   ├── ui/                       # hud.css, debugHud.ts, pauseMenu.ts, unsupported.ts, loadingView.ts
│   ├── bench/                    # benchScript.ts (timeline), soak.ts, resultsView.ts
│   └── assets/                   # OPTIMIZED outputs, committed: office.glb, character.glb, tex/*.png, sfx/*.mp3
├── assets-src/
│   ├── downloads/                # Kenney zips (already gitignored)
│   └── build-assets.mjs          # gltf-transform + ffmpeg pipeline (run by hand, not at deploy)
├── deploy/
│   ├── caddy/breaktime.caddy     # site file (source of truth for the server copy)
│   ├── remote/state-check.sh     # read-only drift check (KEY=VALUE output)
│   ├── remote/release.sh         # activate + cleanup (driven by explicit args)
│   ├── infra/apply-caddy-sites.sh    # one-time / re-apply mount + import (idempotent)
│   ├── infra/rollback-caddy-sites.sh
│   └── HANDOFF.md                # operator note: whattoeat deploy overwrites the 2 edits → run infra:apply
├── scripts/                      # deploy.mjs, size-report.mjs, precompress.mjs, lib/run.mjs (spawn + marker checks)
├── tests/unit/*.test.ts          # Vitest (logic/*, deploy pure helpers)
├── tests/e2e/*.spec.ts           # Playwright
├── CREDITS.md
├── vite.config.ts · playwright.config.ts · tsconfig.json
```

### Pattern 1: Walking skeleton order (MVP mode)
**What:** The thinnest end-to-end slice, each step deployable.
1. Scaffold (Vite/TS/Vitest/Playwright configs, pinned deps) + `buildInfo` sha overlay + capability gate + loading/"Chơi" screen.
2. One room: floor + 4 walls + 1 desk (primitives or 1 GLB), hemisphere + directional light, WebGLRenderer with DPR cap.
3. Input: WASD + floating joystick move a Rapier kinematic capsule (character controller), camera follow + 90° snap.
4. One physics interaction: push a dynamic box/chair on contact or with E.
5. Build + size report + Playwright smoke (console errors, off-origin requests).
6. Server: one-time `infra:apply` (mount + import, zero site files) → DNS check → first `npm run deploy` (uploads site file, reloads, smokes both domains).

After the skeleton is live: assets pipeline → Blocky NPC walkers → slap/ragdoll/get-up → breakables + shards → SFX → debug HUD + bench/soak + tiers → real-device gate.

### Pattern 2: Capability gate (D-22) + Rapier loader with SIMD fallback
```typescript
// src/boot/capabilities.ts — no three import here (keeps the unsupported screen instant)
const SIMD_PROBE = new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11]);
export function detect() {
  let webgl2 = false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    webgl2 = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext(); // free the probe context
  } catch { /* stays false */ }
  const wasm = typeof WebAssembly === 'object';
  const simd = wasm && WebAssembly.validate(SIMD_PROBE); // verified true in Chromium 153 this session
  return { webgl2, wasm, simd };
}

// src/physics/rapierLoader.ts
export async function loadRapier(preferSimd: boolean) {
  if (preferSimd && !new URLSearchParams(location.search).has('simd0')) {
    try { const R = await import('@dimforge/rapier3d-simd-compat'); await R.init(); return { R, flavor: 'simd' as const }; }
    catch (e) { console.warn('SIMD Rapier failed, falling back', e); }
  }
  const R = await import('@dimforge/rapier3d-compat'); await R.init(); return { R, flavor: 'compat' as const };
}
```
Show the unsupported screen if `!webgl2 || !wasm`. `new WebGLRenderer()` also **throws** on no WebGL2 (r186 source), so wrap it too. Handle `webglcontextlost` on the canvas: pause + message.

### Pattern 3: Fixed-step loop, hit-stop, `Timer`
```typescript
// src/logic/fixedStep.ts (pure, Vitest)
export function makeStepper(dt = 1 / 60, maxSteps = 4) {
  let acc = 0;
  return (frameSeconds: number, timeScale: number): number => {   // returns number of sim steps to run
    acc += Math.min(frameSeconds, 0.1) * timeScale;
    let n = 0; while (acc >= dt && n < maxSteps) { acc -= dt; n++; }
    if (n === maxSteps) acc = 0;                                     // drop backlog, avoid spiral of death
    return n;
  };
}
// main loop (render/renderer.ts)
const timer = new Timer(); timer.connect(document);                  // r186: Timer replaces deprecated Clock
renderer.setAnimationLoop((t) => {
  timer.update(t); const dt = timer.getDelta();
  const scale = paused ? 0 : hitStop.active(t) ? 0 : 1;              // D-12 hit-stop 60 ms: freeze sim, keep rendering + shake
  const steps = stepper(dt, scale);
  for (let i = 0; i < steps; i++) { game.fixedUpdate(1 / 60); world.step(eventQueue); }
  syncMeshesFromBodies(); cameraRig.update(dt); renderer.render(scene, camera); stats.frame(t);
});
```
Bench determinism: drive the scripted timeline by **sim step index**, not wall time, with a seeded PRNG (mulberry32, fixed seed). The same device and browser then replays the same physics. Rapier states determinism is local, not cross-platform (package README).

### Pattern 4: Floating joystick with Pointer Events (D-17, CTRL-02)
```typescript
// src/logic/joystickMath.ts (pure)
export function stick(originX: number, originY: number, x: number, y: number, radius: number, dead = 0.12) {
  let dx = x - originX, dy = y - originY; const len = Math.hypot(dx, dy);
  const k = len > radius ? radius / len : 1; dx *= k; dy *= k;
  const mag = Math.min(len / radius, 1);
  return mag < dead ? { x: 0, y: 0, knobX: dx, knobY: dy } : { x: dx / radius, y: dy / radius, knobX: dx, knobY: dy };
}
// src/input/joystick.ts (DOM glue)
zone.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' || activeId !== null || e.clientX > innerWidth / 2) return;
  activeId = e.pointerId; zone.setPointerCapture(e.pointerId);        // Safari 13+ (MDN BCD)
  origin = { x: e.clientX, y: e.clientY }; showBaseAt(origin); e.preventDefault();
});
zone.addEventListener('pointermove', (e) => { if (e.pointerId !== activeId) return; const s = stick(origin.x, origin.y, e.clientX, e.clientY, R); input.move.set(s.x, -s.y); moveKnob(s); });
const end = (e: PointerEvent) => { if (e.pointerId !== activeId) return; activeId = null; input.move.set(0, 0); hideBase(); };
zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end); zone.addEventListener('lostpointercapture', end);
```
Buttons (context, ⟲ ⟳, ⏸) are separate elements with their own `pointerdown`, so multi-touch works. Use `pointerType !== 'mouse'` to decide "show touch UI". Also show it when `matchMedia('(pointer: coarse)')` matches, so tablets get mobile controls (Poki rule).

### Pattern 5: iOS/Android page hardening (scroll, zoom, pull-to-refresh, long-press)
```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
```
```css
html, body { margin:0; height:100%; overflow:hidden; overscroll-behavior:none; /* Safari 16+ */
  -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; -webkit-tap-highlight-color:transparent;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; /* no web fonts → TECH-05 */ }
body { position:fixed; inset:0; }
#game, canvas { position:fixed; inset:0; width:100vw; height:100dvh; /* dvh Safari 15.4+ */ touch-action:none; /* Safari 13+ */ }
.hud-bottom { padding-bottom: env(safe-area-inset-bottom); } .hud-right { padding-right: env(safe-area-inset-right); }
```
```typescript
document.addEventListener('gesturestart', (e) => e.preventDefault());           // iOS pinch (Safari-only event)
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
```
iOS ignores `user-scalable=no` for accessibility [ASSUMED], which is why `touch-action:none` + `gesturestart` do the real work. Resize: listen to `resize` + `visualViewport.resize`, debounce 100 ms, and only call `renderer.setSize` when the integer backbuffer size actually changes. iOS URL-bar show/hide fires many resizes. WebKit bug 219780 (canvas-resize leak) was fixed in iOS 14.3, but avoiding needless resizes is still cheap insurance.

### Pattern 6: Audio unlock (D-15, D-23) and fullscreen
```typescript
// src/audio/sfx.ts
let ctx: AudioContext | null = null; const buffers = new Map<string, AudioBuffer>();
export async function unlockFromGesture() {                 // call synchronously inside the "Chơi" click/pointerup handler
  ctx ??= new AudioContext();
  const p = ctx.resume();
  const b = ctx.createBuffer(1, 1, 22050); const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
  await p;
}
export async function load(name: string, url: string) { const ab = await (await fetch(url)).arrayBuffer(); buffers.set(name, await ctx!.decodeAudioData(ab)); }
export function play(name: string, gain = 1, rate = 1) { if (!ctx || ctx.state !== 'running') return; /* create source+gain, start */ }
document.addEventListener('visibilitychange', () => { if (!ctx) return; document.hidden ? ctx.suspend() : ctx.resume(); });
// Safari can leave ctx.state === 'interrupted' after calls/backgrounding → resume() on next pointerdown.
```
Decode after unlock, or fetch ArrayBuffers early and decode after the tap. **MP3 not OGG** (caniuse: iOS Safari full Ogg Vorbis only from 18.4). Tester note: with the iPhone ring/silent switch on, Web Audio is typically muted [ASSUMED]. Do not set `navigator.audioSession.type='playback'` (Safari 16.4+), because it would override the user's silent switch.

Fullscreen: `if (document.fullscreenEnabled) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {})`. MDN BCD says the Fullscreen API on iOS Safari is **"Only available on iPad, not on iPhone"**, and on iPad swipe-down exits it. iPhone fallback: `100dvh` layout + `viewport-fit=cover`. Optionally add a manifest with `display: fullscreen` so "Add to Home Screen" runs chrome-less. Do not block play on it (see Conflicts C2).

### Pattern 7: Benchmark stats, throttle detection, quality tiers (D-08, D-21, TECH-07)
```typescript
// src/logic/benchStats.ts (pure)
export function summarize(frameMs: number[]) {
  const n = frameMs.length, total = frameMs.reduce((a, b) => a + b, 0);
  const avgFps = (n * 1000) / total;
  const worst = [...frameMs].sort((a, b) => b - a).slice(0, Math.max(1, Math.ceil(n * 0.01)));
  const low1Fps = 1000 / (worst.reduce((a, b) => a + b, 0) / worst.length);   // "1% low" = fps of mean of worst 1% frames
  return { avgFps, low1Fps, frames: n };
}
// throttle heuristic: iOS Low Power Mode and cross-origin iframes (pre-interaction) cap rAF at 30 fps (WebKit bug 168837)
export function looksThrottled(intervalMs: number[], workMs: number[]) {
  const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];
  return med(intervalMs) > 30 && med(workMs) < 12;   // frames arrive every ~33 ms but CPU work is tiny → capped, not slow
}
// src/logic/quality.ts (pure)
export type Tier = 'low' | 'med' | 'high';
export const TIERS = { high: { dprCap: 2, debrisCap: 60, far: 40 }, med: { dprCap: 1.5, debrisCap: 40, far: 30 }, low: { dprCap: 1, debrisCap: 20, far: 22 } };
export function pickTier(p50FrameMs: number, throttled: boolean, current: Tier): Tier {
  if (throttled) return current;                          // never downgrade because of a 30 fps cap
  if (p50FrameMs <= 20) return current;                   // ≥ 50 fps: keep
  if (p50FrameMs <= 30) return current === 'high' ? 'med' : current;
  return 'low';
}
```
Auto-tier protocol: ignore the first 1.0 s after gameplay starts, sample 3.0 s, then allow at most **two downgrades, never auto-upgrade** (avoids oscillation). Persist a manual override in `localStorage` wrapped in try/catch. Bench accepts `&q=low|med|high` to force a tier, otherwise it records the auto tier. Start phones at `med`, desktop at `high`. `antialias` is a context-creation flag: `false` on coarse-pointer devices, `true` on desktop. It is not a tier knob.

HUD numbers: `renderer.info.render.calls` / `.triangles` (auto-reset each `render()` call). For bodies use `world.bodies.len()`, count sleeping via `world.bodies.forEach(b => b.isSleeping() && n++)` (throttle to 4 Hz), plus a peak tracker. Results screen fields: avg fps, 1% low, peak draw calls, peak bodies, sha, tier, Rapier flavor (simd/compat), DPR used, backbuffer size, "throttled?" flag, UA string. Device model/OS is entered by the operator (D-06).

### Pattern 8: iOS stability soak + crash beacon (TECH-04)
```typescript
// src/boot/crashBeacon.ts
const KEY = 'bt.beacon';
export function initBeacon(sha: string) {
  let prev: any = null; try { prev = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
  const crashed = prev && !prev.clean && Date.now() - prev.last < 20_000;   // page died mid-session and was reloaded
  const s = { sha, start: Date.now(), last: Date.now(), clean: false, prevCrash: crashed ? prev : null };
  const write = () => { s.last = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
  write(); setInterval(write, 5000);
  addEventListener('pagehide', () => { s.clean = true; write(); });
  return crashed ? { crashedAfterSec: Math.round((prev.last - prev.start) / 1000), sha: prev.sha } : null;
}
```
`?soak=1` loops the bench timeline for 15 min: spawns and cleans ragdolls and shards every cycle, requests `navigator.wakeLock` best-effort (iOS 18.4+ full per BCD), and shows elapsed time, cycles, min per-minute fps, context-lost count, and `renderer.info.memory.{geometries,textures}`. Automated leak proxy in Playwright (Chromium): after N soak cycles, geometries/textures/bodies return to baseline ±tolerance. Manual gate: the real iPhone runs `?soak=1` for 15 min (Auto-Lock "Never", Low Power Mode off), then 15 min of real play. A screenshot of the results plus "no crash banner on next load" is the evidence.

Memory levers (iOS kills tabs on memory, per three.js forum / Apple forums): DPR cap ≤ 2 (an iPhone at DPR 3 is a ~1179×2556 backbuffer), no MSAA on mobile, no shadow maps (D-14), resize character textures 1024² → 512² (5.5 MB → 1.4 MB VRAM each with mips), shared geometry via `SkeletonUtils.clone`, pooled shards (no per-break allocations), `dispose()` on anything removed.

### Pattern 9: Asset pipeline (TECH-02)
```bash
# assets-src/build-assets.mjs runs these (dev-time; outputs committed to src/assets)
# 1) Office props: merge chosen Furniture Kit + Food Kit GLBs, palette-merge materials, meshopt
npx gltf-transform merge <desk.glb chairDesk.glb computerScreen.glb laptop.glb ... mug.glb> tmp/office-merged.glb --merge-scenes
npx gltf-transform optimize tmp/office-merged.glb src/assets/office.glb --compress meshopt --palette true \
    --texture-compress false --flatten false --join false --instance false --simplify false
#    measured on 20 furniture models: 179.8 KB → 104.9 KB (26 KB gz), 57 primitives → 2 materials (PaletteMaterial001/002, 168-byte palette PNG)
# 2) Character: ONE glb (all 18 share mesh+UV+anims — verified by hashing accessors), keep normals for Lambert
npx gltf-transform optimize character-a.glb src/assets/character.glb --compress meshopt --texture-compress false --prune-attributes false
#    then strip the embedded texture or keep it as default; ship textures separately:
npx gltf-transform resize <texture-X.png via a 1-texture wrapper> --width 512 --height 512   # or sharp directly in the script
# 3) SFX: ffmpeg -i impactPunch_heavy_000.ogg -ac 1 -b:a 96k src/assets/sfx/slap.mp3   (≈10 files)
```
- Food Kit models use a 512² `colormap.png`. Merging them into `office.glb` with `--palette` may not collapse textured materials; keep them as a separate small `props-food.glb` if merge produces extra materials [ASSUMED: not measured].
- Kenney `character-*.glb` reference **external** `Textures/texture-x.png` (URI inside GLB). Copy the Textures folder next to them before running gltf-transform (done this way in the measurement).
- `character-a` uses `KHR_materials_unlit` while `character-i` does not (inspected). Pick one look in code: replace materials with `MeshLambertMaterial({ map })` for every character and **do not prune normals**. The default `optimize` pruned NORMAL/TANGENT because of the unlit extension.
- Vite: import assets with `?url` so they get hashed. Set `build.assetsInlineLimit: 0` so nothing becomes a `data:` URL (keeps CSP/loader paths simple).
- Size report (`scripts/size-report.mjs`): walk `dist/`, print raw/gzip/brotli per file grouped (entry JS, rapier chunks, assets, audio, other). **First-load number:** Playwright records every same-origin request made until `window.__bt.state === 'ready-to-play'`, and the script sums those files' raw and gzip sizes. Gate: **fail if raw first-load > 20 MB; warn (and require a written reason) if > 8 MB.** Also fail if `dist/` contains `*.map`, `.env*`, or > 1,500 files.
- Precompress (`scripts/precompress.mjs`, Node `zlib`, no deps): for `.js .css .html .json .wasm .glb .svg .txt` ≥ 1 KB write `.br` (quality 11) and `.gz` (level 9) next to the file. Caddy `precompressed br gzip` serves them (verified). This avoids on-the-fly compression of a 3 MB JS file on a 1 vCPU box shared with doibung.

### Pattern 10: Tests (D-24)
```typescript
// playwright.config.ts
export default defineConfig({
  testDir: 'tests/e2e', timeout: 120_000, retries: 0, workers: 1,
  use: { baseURL: 'http://localhost:4173/' },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/', reuseExistingServer: false },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium' } },
    { name: 'mobile-emu', use: { browserName: 'chromium', viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } },
    { name: 'no-webgl', use: { browserName: 'chromium', launchOptions: { args: ['--disable-webgl'] } }, testMatch: /unsupported/ },
  ],
});
// tests/e2e/smoke.spec.ts
test('loads clean, stays on origin, bench completes', async ({ page, baseURL }) => {
  const errors: string[] = []; const offOrigin: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });   // SwiftShader emits GL *warnings*; only fail on errors
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== new URL(baseURL!).origin) offOrigin.push(u); });
  await page.goto('./?bench=1&dur=8&autoplay=1');
  await page.waitForFunction(() => (window as any).__bt?.bench?.done === true, null, { timeout: 90_000 });
  const r = await page.evaluate(() => (window as any).__bt.bench.result);
  expect(r.frames).toBeGreaterThan(30); expect(r.peakBodies).toBeGreaterThan(40); expect(r.sha).toMatch(/^[0-9a-f]{7,}$/);
  expect(errors).toEqual([]); expect(offOrigin).toEqual([]);
});
```
- Verified this session: headless Chromium 153 has WebGL2 (`ANGLE ... SwiftShader`), WASM SIMD validates, the Rapier SIMD-compat build initialises and steps, `--disable-webgl` disables WebGL1+2 (good for the D-22 screen test), and `--disable-webgl2` leaves WebGL1 only.
- Implications: rendering is CPU-emulated and slow, so FPS numbers are meaningless (D-24). The bench needs a short `dur` parameter and `autoplay=1` (skips the "Chơi" gate, since it is not a real user gesture). Timeline steps are sim-step driven, so a short bench still exercises ragdoll/shards.
- Vitest covers everything in `src/logic/` plus deploy helpers: `selectReleasesToDelete`, `parseStateCheck`, `sizeGate`.

### Pattern 11: Caddy site file (tested locally in `caddy:2.11.4-alpine`)
```caddy
# deploy/caddy/breaktime.caddy  → server: /srv/sites/breaktime.caddy (container: /etc/caddy/sites/breaktime.caddy)
breaktime.doibung.com {
	encode zstd gzip                       # fallback for files without sidecars; precompressed wins when present (verified)

	@buildNoSlash path_regexp nos ^/b/([0-9a-f]{7,40})$
	redir @buildNoSlash /b/{re.nos.1}/ 308

	@badBuild {
		path /b /b/*
		not path_regexp ^/b/[0-9a-f]{7,40}/
	}
	respond @badBuild 404

	@hashed path_regexp hashed /assets/[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$
	header @hashed Cache-Control "public, max-age=31536000, immutable"
	header ?Cache-Control "no-cache"          # default for index.html, version.json, everything unhashed
	header {
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
		X-Frame-Options SAMEORIGIN
		Permissions-Policy "camera=(), microphone=(), geolocation=()"
		-Server
	}

	handle_path /b/* {
		root * /etc/caddy/sites/breaktime/releases
		file_server {
			precompressed br gzip
			hide .* *.map
		}
	}
	handle {
		root * /etc/caddy/sites/breaktime/current   # relative symlink → releases/<sha> (verified it is followed)
		file_server {
			precompressed br gzip
			hide .* *.map
		}
	}
}
```
Verified behaviours (local container, same Caddy version as prod):

| Request | Result |
|---|---|
| `/` | 200 from symlink target, `Cache-Control: no-cache` |
| `/b/abc1234` | 308 → `/b/abc1234/` |
| `/b/abc1234/` | 200 |
| `/b/zzz/`, `/b/` | 404 |
| `/assets/rapier-*.js`, br | br sidecar, `Content-Length: 795658`, `immutable` |
| same, gzip | 1,082,402 |
| same, zstd-only | on-the-fly zstd |
| `.wasm` | `application/wasm` (Go builtin table + `/etc/mime.types` in image) |
| `.map`, `.env` | 404 |
| import of a non-existent glob dir | warn "No files matching import glob pattern", not an error (also Caddy docs: "an empty glob pattern is not an error") |

404 responses still show `Server: Caddy` (header ops don't apply to error responses). Cosmetic.

**No COOP/COEP needed:** no `SharedArrayBuffer` anywhere in the Rapier compat/SIMD builds or three builds (grep = 0). **CSP** goes in `index.html` as a meta tag so the Playwright preview run tests the same policy that production serves:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' data: blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'">
```
Verified in Chromium: without `'wasm-unsafe-eval'`, Rapier fails with a CSP `WebAssembly.instantiate()` violation; with it, it runs. `'wasm-unsafe-eval'` is Safari 16+ (BCD), inside the iOS 16.4 baseline.

### Pattern 12: Server wiring (one-time `infra:apply`, idempotent) and drift check
Facts measured read-only on 2026-09-14:
- Host `srv1973844.hstgr.cloud`, **CentOS Stream 10** (CONTEXT says AlmaLinux 10; no impact). 1 vCPU / 3.6 GB. SELinux Disabled. Docker 29.8.0, Compose v5.5.1. `rsync` 3.4.4, `openssl`, `flock`, `timeout`, bash 5.2, coreutils 9.5 all present.
- `doibung-caddy-1`: image `caddy:2-alpine` = v2.11.4. `mem_limit` 128 MiB, using 33 MiB. Cmd `caddy run --config /etc/caddy/Caddyfile --adapter caddyfile`. Admin API at **127.0.0.1:2019 only**. Mounts: `doibung_caddy_data:/data`, `doibung_caddy_config:/config`, bind `/opt/doibung/Caddyfile.nodb → /etc/caddy/Caddyfile (ro)`. Live file md5 = host file md5 = local `d:/whattoeat/Caddyfile.nodb` md5 (`4b5890ff…`).
- Labels: caddy `config_files=/opt/doibung/docker-compose.nodb.yml`; app and postgres `config_files=/opt/doibung/docker-compose.withdb.yml`. `docker compose ls` shows both files for project `doibung`.
- `docker compose config --hash`: withdb → app `3d8218…` (= running), caddy `78c67f…` (= running), postgres `db14d6…` (= running). nodb → caddy `78c67f…` but **app `bee15e…` ≠ running**.
- `/srv` is empty. `breaktime.doibung.com` is NXDOMAIN on 1.1.1.1. doibung.com DNS is at Hostinger (`*.dns-parking.com`). doibung.com cert: Let's Encrypt YE2, notAfter 2026-12-10. doibung.com 200, www 301 → https://doibung.com/.

`deploy/infra/apply-caddy-sites.sh` (sent as `ssh doibung 'bash -s' < file` from Node; each step prints a marker Node requires):
1. **Preflight:** container exists and is running. Record `docker compose -f docker-compose.withdb.yml config --hash app,postgres` (must match running labels). Record the doibung.com cert SHA-256 fingerprint via `openssl s_client`. `docker compose -f docker-compose.withdb.yml config --quiet` rc 0 (checks `.env` vars).
2. **Backup** to `/root/breaktime-infra-backup/<UTC-timestamp>/` (outside `/opt/doibung`): `Caddyfile.nodb`, both compose files, `docker inspect doibung-caddy-1`, live admin config (`docker exec doibung-caddy-1 wget -qO- http://127.0.0.1:2019/config/`). Print `BACKUP_DIR=…`.
3. `install -d -m 755 /srv/sites /srv/sites/breaktime /srv/sites/breaktime/releases` (no site file yet, so the empty glob is safe before DNS exists).
4. **Caddyfile:** if `grep -qxF 'import /etc/caddy/sites/*.caddy'` fails, append `\nimport /etc/caddy/sites/*.caddy\n` at top level (file has no global options block). `diff` vs backup must show exactly 1 added non-empty line and 0 removed.
5. **Compose (both files):** if `/srv/sites:/etc/caddy/sites:ro` is absent, insert `      - /srv/sites:/etc/caddy/sites:ro` right after the line `- ./Caddyfile.nodb:/etc/caddy/Caddyfile:ro` (first occurrence, which is in the caddy service). Check: diff = +1/−0 per file. `docker compose -f <file> config` shows target `/etc/caddy/sites`, `read_only: true`. **app/postgres hashes unchanged** vs step 1; caddy hash changed.
6. **Validate candidate before touching the live container:** `docker run --rm --network none --memory 128m -e SITE_DOMAIN=doibung.com -v /opt/doibung/Caddyfile.nodb:/etc/caddy/Caddyfile:ro -v /srv/sites:/etc/caddy/sites:ro <image-id-of-running-caddy> caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` → must print "Valid configuration".
7. **Recreate caddy only:** start the local Node poller on `https://doibung.com` (0.5 s). Run `cd /opt/doibung && docker compose -p doibung -f docker-compose.withdb.yml up -d --no-deps caddy`. **Never** omit `--no-deps`, **never** use the nodb file for `up`, **never** pass `--remove-orphans`.
8. **Verify:** new container Mounts include `/srv/sites → /etc/caddy/sites` RW=false. `docker exec … grep -xF 'import /etc/caddy/sites/*.caddy' /etc/caddy/Caddyfile`. Admin config (127.0.0.1) contains `doibung.com`. app/postgres container IDs unchanged. doibung.com 200 and www 301 from local Node. **Cert fingerprint identical** to step 1 (cert reused from `caddy_data`). Poller summary: max consecutive non-200 duration (expected a few seconds).
9. **Rollback** (`rollback-caddy-sites.sh <BACKUP_DIR>`, dir name validated `^/root/breaktime-infra-backup/[0-9TZ-]+$`): restore 3 files, same `up -d --no-deps caddy`, same verification.

First site activation (inside `npm run deploy`, only when `/srv/sites/breaktime.caddy` differs or is missing): require DNS `breaktime.doibung.com` A = 187.53.128.67 on both 1.1.1.1 and 8.8.8.8 (Node `dns.Resolver`). This avoids Let's Encrypt "5 authorization failures per identifier per account per hour" (letsencrypt.org rate limits). Then validate the site file alone: `docker exec -i doibung-caddy-1 caddy validate --config - --adapter caddyfile` with stdin = site file. Back up the old site file, move the new one in, run `docker exec doibung-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile --address 127.0.0.1:2019`. If reload rc≠0, restore the old file and reload again. Then poll `https://breaktime.doibung.com/version.json` up to 120 s while ACME completes.

**Drift check** (`deploy/remote/state-check.sh`, read-only, runs at the start of every deploy). Output is `KEY=VALUE`, and the last line must be `END=1`:
```bash
#!/usr/bin/env bash
set -u
c() { "$@" 2>/dev/null || true; }
echo "HOST_IMPORT=$(c grep -cxF 'import /etc/caddy/sites/*.caddy' /opt/doibung/Caddyfile.nodb)"
echo "HOST_MOUNT_NODB=$(c grep -cF '/srv/sites:/etc/caddy/sites:ro' /opt/doibung/docker-compose.nodb.yml)"
echo "HOST_MOUNT_WITHDB=$(c grep -cF '/srv/sites:/etc/caddy/sites:ro' /opt/doibung/docker-compose.withdb.yml)"
echo "LIVE_MOUNT=$(c docker inspect -f '{{range .Mounts}}{{.Source}}>{{.Destination}}>{{.RW}} {{end}}' doibung-caddy-1 | grep -c '/srv/sites>/etc/caddy/sites>false')"
echo "LIVE_IMPORT=$(c docker exec doibung-caddy-1 grep -cxF 'import /etc/caddy/sites/*.caddy' /etc/caddy/Caddyfile)"
echo "LIVE_SITE=$(c docker exec doibung-caddy-1 wget -qO- http://127.0.0.1:2019/config/ | grep -c 'breaktime.doibung.com')"
echo "SITE_FILE_SHA=$(c sha256sum /srv/sites/breaktime.caddy | cut -c1-64)"
echo "END=1"
```
Node parses it and requires `END=1`, all keys present, and `HOST_*`/`LIVE_MOUNT`/`LIVE_IMPORT` ≥ 1. `LIVE_SITE` ≥ 1 is required after the first activation. On failure it prints: *"Caddy của doibung đã mất cấu hình sites (có thể do deploy whattoeat ghi đè /opt/doibung). Chạy `npm run infra:apply` (idempotent, có backup) rồi deploy lại. Chi tiết: deploy/HANDOFF.md"*.

Host-only drift (host files lost the edits but the live container still has them) is also a **fail**: the next whattoeat `docker compose up` would silently remove the game. Stale single-file-bind caveat: a replaced host `Caddyfile.nodb` (new inode) is not visible to the running container until it is recreated, which is why host and live are checked separately.

### Pattern 13: Deploy script skeleton (Node, Windows-safe)
```javascript
// scripts/lib/run.mjs — every external step: exit code AND expected marker AND non-empty output
import { spawn } from 'node:child_process'; import { existsSync } from 'node:fs';
export const SSH = process.platform === 'win32' && existsSync('C:/Windows/System32/OpenSSH/ssh.exe') ? 'C:/Windows/System32/OpenSSH/ssh.exe' : 'ssh';
export const TAR = process.platform === 'win32' && existsSync('C:/Windows/System32/tar.exe') ? 'C:/Windows/System32/tar.exe' : 'tar';
export function run(cmd, args, { input, marker, minOut = 1 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let out = '', err = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`${cmd} rc=${code}\n${err}`));
      if (out.trim().length < minOut) return reject(new Error(`${cmd}: empty output (rc=0 is not proof)`));
      if (marker && !out.includes(marker)) return reject(new Error(`${cmd}: marker ${marker} missing\n${out}\n${err}`));
      resolve(out);
    });
    if (input) p.stdin.end(input); else p.stdin.end();
  });
}
export const ssh = (remoteCmd, opts) => run(SSH, ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', 'doibung', remoteCmd], opts);
// upload: tar stream (verified: Windows bsdtar → Windows OpenSSH → remote GNU tar)
// const tar = spawn(TAR, ['-czf', '-', '-C', 'dist', '.']);
// const up  = spawn(SSH, ['-o','BatchMode=yes','doibung',
//   `set -euo pipefail; B=/srv/sites/breaktime/releases; I="$B/.incoming-${SHA}"; rm -rf -- "$I"; mkdir -p -- "$I"; ` +
//   `tar -xzf - --no-same-owner -C "$I"; test -s "$I/index.html"; chmod -R u=rwX,go=rX -- "$I"; echo "__UPLOADED__ $(find "$I" -type f | wc -l)"`]);
// tar.stdout.pipe(up.stdin); await both 'close' events; require rc 0 both + marker + file count == local count
```
- `SHA` comes from `git rev-parse --short=12 HEAD`, validated `^[0-9a-f]{12}$` before being put in any command string. Refuse to deploy if `git status --porcelain -- src index.html package.json package-lock.json vite.config.ts deploy scripts assets-src/build-assets.mjs` is non-empty, so every deployed build maps to a commit.
- Activation + cleanup (`deploy/remote/release.sh` over stdin) runs under `flock -n /srv/sites/breaktime/.deploy.lock`:
  - `mv` incoming → `releases/$SHA`, keeping an existing same-sha release by renaming it to `.old-$SHA` first.
  - `ln -sfn "releases/$SHA" current.new && mv -T current.new current` (relative symlink, atomic rename).
  - `ls` releases with mtimes → back to Node → pure `selectReleasesToDelete(list, keep=10, current)` (Vitest) → explicit names sent back.
  - Remote re-validates each name `^[0-9a-f]{7,40}$`, `realpath` starts with `/srv/sites/breaktime/releases/`, and it is not the current target, then `rm -rf --one-file-system -- "$BASE/$name"` with `BASE="${BASE:?}"` hardcoded.
- Git Bash path mangling does not affect Node `spawn` args. It does affect ad-hoc `ssh`/`docker` calls typed in Git Bash with native exes, so prefix `MSYS_NO_PATHCONV=1` there.
- doibung poller: `setInterval` of `fetch('https://doibung.com/', { redirect: 'manual', signal: AbortSignal.timeout(3000) })` every 1 s from before upload to after smoke. Report `{count, non200}`; any non-200 during a normal (non-recreate) deploy fails the deploy with the log attached.

### Performance budget (for the planner's verification steps)
| Item | Budget | Basis |
|---|---|---|
| Draw calls (bench peak) | ≤ 120 | Static office merged by material → ~2; floor/walls ~2; 9 characters × 6 part meshes = 54; ~25 dynamic props (1–3 prims each) ≈ 40; shards as 3 InstancedMesh = 3; blob shadows 1 InstancedMesh = 1 |
| Physics bodies (bench peak) | ≤ ~200 | 8 ragdolls × 6 = 48 (+40 joints), ~40 props, shards cap 60/40/20 by tier, ~30 static colliders, player + NPC capsules |
| Triangles | < 30 k | Kenney furniture 2,495 tris for 20 models; characters 72 tris each |
| Backbuffer | DPR cap 2 / 1.5 / 1 | iPhone DPR 3 → cap |
| First load | ≈ 4.5 MB raw / ≈ 1.6 MB gz (estimate) | Measured parts above; confirm with the Playwright-observed list |

If D-07 step 3 is needed for characters, convert each Blocky character at load into one `SkinnedMesh` with 6 rigidly-weighted bones (1 draw per character instead of 6). The animation tracks target nodes by name, so they still apply. Do this only in the optimisation pass [ASSUMED feasibility].

### Pattern 14: Ragdoll for Blocky Characters + procedural get-up (D-12)
Verified structure (GLB JSON): `character-x` → `root` → {`leg-left` (t 0.2,1,0), `leg-right` (−0.2,1,0), `torso` (0,0.7,0) → {`arm-left` (0.4,1.1,−0.1), `arm-right` (−0.4,1.1,−0.1), `head` (0,1.2,0, **scale 0.1**)}}. Part local bounds: legs 0.4×1.0×0.4 hanging below the pivot; torso 0.8×0.9×0.6 (y 0.3..1.2); arms 0.4×1.1×0.4 hanging from the shoulder; head 8×8×8 local × 0.1 = 0.8 m cube. The `die` clip animates root translation+rotation and all parts. `walk` does not animate torso rotation. All samplers LINEAR. Compute collider sizes at runtime with `Box3().setFromObject(part)` rather than hardcoding.

- **Animated mode:** NPC = `kinematicPositionBased` capsule (used for slap range queries and blocking) + `AnimationMixer` (`idle`, `walk`, `interact-right` for the slap wind-up, `attack-melee-right` for the player's slap).
- **Ragdoll pool:** at spawn, create 6 dynamic cuboid bodies + 5 `SphericalImpulseJoint`s (hips ×2, shoulders ×2, neck) **disabled** (`setEnabled(false)`). Collision groups: ragdoll parts ignore their own NPC's parts, collide with world/props. `joint.setContactsEnabled(false)`. Masses by volume, linear/angular damping ~0.2/0.5.
- **On slap:** play hit-stop (60 ms, Pattern 3) and camera shake, then for each part: `Object3D.attach()` it to a flat `ragdollRoot` group (preserves world transform). Set body translation/rotation from the part's world matrix, `setEnabled(true)`. Apply `applyImpulseAtPoint` on torso (direction from player, exaggerated upward component) plus random angular impulse (seeded RNG in bench). Disable the capsule.
- **Settle → get-up (pure FSM in `logic/getUpFsm.ts`):** `RAGDOLL` → (torso speed < 0.35 m/s and angular < 1 rad/s for 0.6 s, or 4 s timeout) → `RECOVER`. Read torso position/yaw (project torso forward onto XZ). Disable bodies, re-attach parts under the character hierarchy (world-preserving). Over 0.45 s, slerp each part's local quaternion from its current value to the `idle` pose sampled at t=0, and lerp root from lying height/tilt to upright → `WALK` resumes the waypoint loop. Alternative look: blend to the last frame of `die` then play `die` with `timeScale = -1` [ASSUMED, needs a visual check of facing].
- "Sleep earlier" (D-07 step 5): the Rapier JS API exposes no activation-threshold setters (d.ts grep). Implement it as "N frames under velocity threshold → `body.sleep()`" in `physics/props.ts`.

### Pattern 15: Breakables and shards (D-13), blob shadows (D-14)
- **Breakables:** cup (Food Kit `mug`/`cup-coffee`), monitor (`computerScreen`), plants (`pottedPlant`, `plantSmall1..3`). When impact impulse exceeds threshold (contact force events via `ActiveEvents.CONTACT_FORCE_EVENTS`) or on slap hit: hide the object, remove its body, emit K shards (cup 6, plant 8, monitor 10).
- **Shard kit (recommended):** 3 hand-authored low-poly shard geometries (tetra, wedge, thin slab) × `InstancedMesh` with `instanceColor`. Each shard takes one of the broken object's palette colours and is scaled to its bbox; body = cuboid collider; lifetime 2.5 s then shrink over 0.3 s and return to pool.
  - The pool is a ring buffer with the tier cap; the oldest shard is recycled when full (pure `debrisBudget.ts`).
  - 1 draw call per shard shape; no allocation per break.
  - Alternative: three's `ConvexObjectBreaker` (exists in r186 addons) to precompute silhouette-matching pieces at load. Heavier and flaky on concave meshes (mug handle), so only if the operator wants recognisable pieces (see Conflicts C6).
- **Physics-only props** (chair, trash can, boxes, books, keyboard): dynamic bodies with cuboid/convex-hull colliders, sleep when settled.
- **Blob shadows:** one `InstancedMesh(PlaneGeometry, MeshBasicMaterial({ map: radialGradientCanvasTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }))`, count = characters + dynamic props. Each frame, set the matrix at floor y + 0.01 under the body, scale by object footprint, and fade opacity/scale with height. The canvas-generated texture needs no asset and no network (CSP-safe).

### Anti-Patterns to Avoid
- **`docker compose -f docker-compose.nodb.yml up -d` (without `--no-deps`) on the server:** recreates the app without `DATABASE_URL` (hash mismatch measured).
- **Absolute symlink for `current`** (`/srv/sites/...`): that path doesn't exist inside the container. Use a relative `releases/<sha>`.
- **`wget http://localhost:2019` inside the caddy container:** resolves to ::1 and is refused. Use `127.0.0.1`.
- **Adding `breaktime.doibung.com` to Caddy before DNS exists:** ACME failures, Let's Encrypt limit 5 failed authorizations/hour per identifier.
- **Relying on Caddy `encode` for big JS/WASM:** on-the-fly compression per request on 1 vCPU shared with doibung. Ship `.br`/`.gz` sidecars.
- **Per-character GLB copies:** 18× duplicated animations. Ship one GLB + textures.
- **OGG SFX on iOS:** fails on iOS < 18.4. Use MP3.
- **Failing Playwright on console warnings:** SwiftShader emits GL performance warnings. Fail on `error` + `pageerror` only.
- **Resizing the canvas on every `resize` event:** iOS fires many during URL-bar animation.
- **Downgrading quality when frames arrive every 33 ms but work time is tiny:** that is Low Power Mode throttling, not slowness.
- **`THREE.Clock`:** deprecated since r183. Use `THREE.Timer`.
- **typescript-eslint / ts-node with TypeScript 7:** no JS API in 7.0.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Physics, joints, character sliding | Custom collision/ragdoll solver | Rapier 0.20 (`KinematicCharacterController`, impulse joints, contact force events) | Stable solver, sleeping, CCD |
| glTF parsing, meshopt decode | Loader | `GLTFLoader` + `MeshoptDecoder` (three addons) | Spec edge cases |
| Mesh compression / material merge | Custom packer | `@gltf-transform/cli` `merge`, `optimize --compress meshopt --palette` | Measured 179.8 → 104.9 KB, 57 prims → 2 materials |
| Static mesh merge at runtime | Manual buffer concat | `BufferGeometryUtils.mergeGeometries` | Attribute/index handling |
| Skinned/hierarchy cloning | Deep clone code | `SkeletonUtils.clone` | Keeps bindings/animations working |
| TLS, cert renewal, MIME, precompressed negotiation | Nginx scripts / custom | Caddy 2.11.4 already running | Verified behaviour |
| Brotli/gzip | Shelling out to tools | Node `zlib` (`brotliCompressSync`, `gzipSync`) | Zero deps, Windows-safe |
| Upload transport | Custom file sync | System `tar` + Windows OpenSSH stream | Verified; rsync absent locally |
| Seeded RNG | `Math.random` in bench | ~6-line mulberry32 in `logic/rng.ts` | Deterministic bench (this one is fine to write; it's tiny and tested) |

**Key insight:** Hand-rolling is only justified here for the joystick, audio unlock, bench stats, quality policy, get-up FSM and deploy glue. All are small, pure or near-pure, and covered by Vitest. Everything with real complexity (physics, glTF, TLS, compression) has a proven tool already in the stack.

## Common Pitfalls

### Pitfall 1: Recreating Caddy with the wrong compose file
**What goes wrong:** doibung's app loses its database config, or postgres/app are recreated.
**Why it happens:** Project `doibung` was built from two files. The nodb file's `app` definition differs from the running app (hash `bee15e…` vs `3d8218…`).
**How to avoid:** Only `docker compose -p doibung -f docker-compose.withdb.yml up -d --no-deps caddy`. Check app/postgres hashes and container IDs before and after.
**Warning signs:** `docker compose config --hash app` differs from `docker inspect` label; app container ID changed.

### Pitfall 2: whattoeat deploy silently removes the game later
**What goes wrong:** Host `Caddyfile.nodb`/compose are overwritten. The game still works until the next caddy recreate, then disappears.
**Why it happens:** `/opt/doibung` is a copy of `d:/whattoeat` (files owned by Windows-mapped uid 1049704). The exact whattoeat deploy command could not be verified: no deploy script in that repo, no rsync locally.
**How to avoid:** State check on every break-time deploy (host and live separately) + `infra:apply` re-apply + `deploy/HANDOFF.md`.
**Warning signs:** `HOST_IMPORT=0` with `LIVE_IMPORT=1`.

### Pitfall 3: Low Power Mode makes a good phone look like a 30 fps failure
**What goes wrong:** Bench reads ~30 fps flat on the iPhone; auto-tier drops to Low.
**Why it happens:** WebKit throttles rAF to 30 fps in Low Power Mode (WebKit bug 168837) and in cross-origin iframes before interaction.
**How to avoid:** Record Low Power Mode state manually in results; `looksThrottled` heuristic; never downgrade on throttle.
**Warning signs:** Frame interval median ≈ 33.3 ms with work time < 12 ms.

### Pitfall 4: iPhone "fullscreen" does nothing
**What goes wrong:** D-23 fullscreen request silently fails on iPhone.
**Why it happens:** MDN BCD: element Fullscreen API on iOS Safari is iPad-only.
**How to avoid:** Feature-detect `document.fullscreenEnabled`; `100dvh` + safe-area layout; optional home-screen manifest.
**Warning signs:** `document.fullscreenEnabled === false` on iPhone.

### Pitfall 5: Silent SFX on iOS
**What goes wrong:** No sound on iPhone.
**Why it happens:** AudioContext not resumed inside a user gesture; OGG not decodable before iOS 18.4; silent switch on [ASSUMED].
**How to avoid:** `resume()` + silent buffer in the "Chơi" handler; MP3 assets; tester checklist includes the silent switch.
**Warning signs:** `ctx.state` stays `suspended`/`interrupted`.

### Pitfall 6: CSP blocks Rapier
**What goes wrong:** `WebAssembly.instantiate()` CSP violation, black screen.
**Why it happens:** `script-src 'self'` without `'wasm-unsafe-eval'` (reproduced this session).
**How to avoid:** Use the CSP string in Pattern 11; Playwright asserts no `pageerror`.
**Warning signs:** pageerror mentioning Content Security Policy.

### Pitfall 7: rc=0 with nothing done (local tooling traps)
**What goes wrong:** Deploy "succeeds" but uploaded nothing, or tests "pass" without running.
**Why it happens:** Inline Bash `set -e` subshell traps, `grep -P` silently empty on this machine, PATH dropping mid-session, Git Bash path mangling.
**How to avoid:** All orchestration in Node. Absolute exe paths for ssh/tar. Required markers + output length + file counts. Negative controls in tests (a planted failure must fail).
**Warning signs:** Empty stdout with rc 0; file count 0.

### Pitfall 8: Texture VRAM on iOS
**What goes wrong:** Tab reload after minutes on iPhone.
**Why it happens:** 9 characters × 1024² RGBA with mips ≈ 50 MB VRAM, plus DPR 3 backbuffer.
**How to avoid:** Resize character textures to 512² (256² for Low); DPR cap; dispose on removal; crash beacon to detect.
**Warning signs:** Beacon reports `prevCrash`; `renderer.info.memory.textures` growing across soak cycles.

### Pitfall 9: Kenney unlit/normal pruning mismatch
**What goes wrong:** Characters render black or flat under Lambert after optimisation.
**Why it happens:** Some character GLBs use `KHR_materials_unlit`; `optimize` pruned NORMAL/TANGENT (observed).
**How to avoid:** `--prune-attributes false` for the character; replace materials in code consistently.
**Warning signs:** Missing `NORMAL` in `gltf-transform inspect` output.

### Pitfall 10: Key binding collision (E)
**What goes wrong:** Pressing E both slaps and rotates the camera.
**Why it happens:** D-19 says rotate with Q/E; D-18/D-20/CTRL-01 say E = interact.
**How to avoid:** Operator decides the rotate keys (Conflicts C1) before input work.

## Code Examples

Verified snippets are embedded in Patterns 2–14 above. Additional:

### Loading a shared Blocky character with a per-NPC texture
```typescript
// Source: three r186 GLTFLoader/SkeletonUtils APIs (verified present); structure verified by GLB inspection
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { AnimationMixer, MeshLambertMaterial, SRGBColorSpace, TextureLoader, type Mesh, type Object3D } from 'three';
import characterUrl from '../assets/character.glb?url';
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const gltf = await loader.loadAsync(characterUrl);                      // one GLB: 6 part meshes + 27 clips
const clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c])); // 'idle','walk','die','attack-melee-right',...
export function spawnCharacter(texUrl: string) {
  const obj = SkeletonUtils.clone(gltf.scene) as Object3D;
  const map = new TextureLoader().load(texUrl); map.colorSpace = SRGBColorSpace; map.flipY = false;   // glTF UV convention
  const mat = new MeshLambertMaterial({ map });
  obj.traverse((o) => { if ((o as Mesh).isMesh) (o as Mesh).material = mat; });
  const mixer = new AnimationMixer(obj); mixer.clipAction(clips.walk).play();
  const parts = ['leg-left', 'leg-right', 'torso', 'arm-left', 'arm-right', 'head'].map((n) => obj.getObjectByName(n)!);
  return { obj, mixer, parts, mat };
}
```

### Vite + TS config
```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
const sha = execSync('git rev-parse --short=12 HEAD').toString().trim();
export default defineConfig({
  base: './',                                   // D-04: same build under / and /b/<sha>/ (verified relative asset URLs work)
  define: { __BUILD_SHA__: JSON.stringify(sha), __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  build: { target: 'es2022', sourcemap: false, assetsInlineLimit: 0, chunkSizeWarningLimit: 4000, reportCompressedSize: true },
});
// tsconfig.json (TypeScript 7): { "compilerOptions": { "target":"ES2022","module":"ESNext","moduleResolution":"bundler",
//   "lib":["ES2022","DOM","DOM.Iterable"],"types":["vite/client"],"strict":true,"noEmit":true,"skipLibCheck":true,
//   "isolatedModules":true,"verbatimModuleSyntax":true,"rootDir":"." }, "include":["src","tests"] }   // verified tsc 7.0.2 rc=0 / negative control rc=1
```
`version.json` (`{ sha, time }`) is emitted by a 10-line Vite plugin (`generateBundle` → `this.emitFile({ type: 'asset', fileName: 'version.json', source })`) and used by the deploy smoke test.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `THREE.Clock` | `THREE.Timer` (+ `connect(document)`) | r183 | Use Timer; Clock logs a deprecation warning |
| WebGL1 fallback in three | WebGL2 only | r163 | D-22 screen when WebGL2 missing; renderer constructor throws |
| Vite + Rollup/esbuild | Vite 8 + Rolldown; Wasm ESM import native since 8.1 | 2026 | `rollupOptions` still accepted; `build.rolldownOptions` hint in warnings |
| TypeScript JS-based tsc | TypeScript 7 Go-native tsc, no JS API in 7.0 | 7.0 GA 2026 | `types` default `[]`; `strict` default on; no `baseUrl`/`node10` |
| Vitest 4 | Vitest 5 (Node ≥22.12, `clearMocks` default true) | 2026-09 | Config lookup no longer walks parent dirs |
| Ogg Vorbis unsupported on iOS | Full support iOS 18.4+ | 2025 | Still use MP3 for older iPhones |
| rAF 60 always | Throttled to 30 in Low Power Mode / pre-interaction cross-origin iframes | iOS 14+ | Detect/record; matters again for CrazyGames iframe (Phase 8) |

**Deprecated/outdated:**
- `rapier3d-compat` `init(options)` deprecated params: call `init()` with no args (0.20 d.ts `init(): Promise<void>`).
- Research doc §4.3 suggested Howler.js and `rapier3d-compat`. This research recommends raw Web Audio and SIMD-compat with compat fallback (reasons above).

## Conflicts with CONTEXT

- **C1 (D-19 vs D-18/D-20/CTRL-01): key E double-bound.** D-19 rotates the camera with Q/E; D-18/D-20 and requirement CTRL-01 make E the interact/slap key. Both cannot hold. **Recommendation:** keep E = interact (it is in the requirement text). Rotate with **Z (⟲) / C (⟳)**, with ← / → as aliases. Operator must confirm before the input plan executes.
- **C2 (D-23): "xin toàn màn hình" cannot work on iPhone Safari.** MDN BCD: element fullscreen on iOS Safari is "Only available on iPad, not on iPhone". On iPad the overlay button can't be hidden and swipe-down exits. **Recommendation:** request fullscreen only when `document.fullscreenEnabled`, so it works on Android and iPad. iPhone gets a `100dvh` safe-area layout plus an optional "Add to Home Screen" manifest. Not a blocker for CTRL-03, whose wording is "phủ toàn màn hình" of the viewport.
- **C3 (D-02 detail): "compose đang tạo container caddy".** The caddy container label points at `docker-compose.nodb.yml`, but app/postgres (and README "doibung.com hiện chạy bản withdb") use `docker-compose.withdb.yml`; both caddy definitions hash identically today. **Recommendation:** add the mount line to **both** files on the server and recreate with the withdb file plus `--no-deps`. This stays within D-02's intent: server-side edit, nothing in `d:\whattoeat`.
- **C4 (D-03): "rsync qua ssh doibung".** `rsync` is not installed on this Windows machine (it is on the server). **Recommendation:** tar stream over Windows OpenSSH, verified end-to-end, same effect. Separately, the claim that whattoeat deploys with `rsync --delete` could not be verified from the repo; the drift check covers any overwrite mechanism.
- **C5 (D-09 detail): Blocky Characters 2.0 has no skeleton and no get-up clip.** 6 rigid parts, 27 clips (`static, idle, walk, sprint, sit, drive, die, pick-up, emote-yes, emote-no, holding-*, attack-melee-*, attack-kick-*, interact-*, wheelchair-*`). D-12 stand-up is feasible only procedurally (Pattern 14). No conflict with intent, but no ready animation exists.
- **C6 (D-13 interpretation): "mảnh cắt sẵn".** No Blender pipeline exists and no Kenney pre-fractured monitor/plant/cup exists; Food Kit has only `plate-broken`. **Recommendation:** a pre-made generic shard kit tinted and scaled per object (Pattern 15). If the operator requires pieces that match each object's silhouette, use `ConvexObjectBreaker` precomputation at load at higher cost and risk. Operator confirm.
- **C7 (D-15): Kenney SFX are OGG.** Convert to MP3 (needs ffmpeg installed once). Not a conflict with intent.
- (Info) CONTEXT says AlmaLinux 10; the server reports CentOS Stream 10. No impact.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | iOS Safari ignores `user-scalable=no`; `touch-action:none` + `gesturestart` prevent pinch/double-tap zoom | Pattern 5 | Accidental zoom on iPhone; fix with more listeners; visible in first device test |
| A2 | Web Audio is muted by the iPhone silent switch by default | Pattern 6 / Pitfall 5 | Tester confusion only |
| A3 | `caddy reload` keeps the old config if the new one fails to load | Pattern 12 | Mitigated by validating the site file via stdin before swap, plus restore-on-failure |
| A4 | Palette merge of Food Kit (textured `colormap`) items together with Furniture Kit may not collapse to 2 materials | Pattern 9 | Slightly more draw calls; keep a separate `props-food.glb` |
| A5 | 512² character textures remain legible at phone viewing distance | Pattern 8 | Visual check on device; fall back to 1024² for the player only |
| A6 | Converting Blocky parts to one rigid-weighted SkinnedMesh works as a D-07 step-3 draw-call reduction | Performance budget | Only needed if draw calls block 30 fps |
| A7 | Playing `die` reversed looks acceptable as a get-up | Pattern 14 | Use the procedural slerp (primary) instead |
| A8 | `ConvexObjectBreaker` is flaky on concave Kenney meshes | Pattern 15 | Only matters if the operator picks silhouette shards |
| A9 | The Rapier SIMD build behaves identically to compat on the operator's devices (low npm adoption: 3.7 K/wk) | Standard Stack | `?simd0` switch and automatic fallback exist; bench prints the flavour |
| A10 | Headless SwiftShader stays available in future Playwright Chromium builds without flags | Pattern 10 | Add `--enable-unsafe-swiftshader` (verified harmless today) |
| A11 | Weighted-step loading progress is acceptable as "thanh tiến trình thật" (D-23) | Architecture | Operator may want byte-level progress; compressed responses make byte totals unreliable |
| A12 | whattoeat deploy method is an overwrite of `/opt/doibung` (per CONTEXT); the mechanism itself is unverified | Pitfall 2 | Drift check is mechanism-agnostic, so low risk |

## Open Questions (RESOLVED)

> **Resolved 2026-09-14 by operator after research — these resolutions override the recommendations written below:**
> - **Q1 → D-19:** rotate camera with **Z / C** (arrows as aliases); E stays interact.
> - **Q2 → D-13:** generic shared shard kit (5–8 pieces), tinted/scaled per object. No per-object Blender cuts, no ConvexObjectBreaker.
> - **Q3 → plan 01-19 Task 1:** operator records device model/OS/browser/Low Power Mode in the device log before any measurement.
> - **Q4 → plan 01-12 Task 1:** DNS A record is an operator human-action checkpoint before first HTTPS activation.
> - **Q5 → D-25:** use the **`ffmpeg-static` devDependency** via `npm run assets`. **Do NOT run `winget install Gyan.FFmpeg`** — no system installs on the operator machine.
> - **Q6 → plans 01-05 / 01-10:** printer and water cooler built from Box/Cylinder primitives in Furniture Kit palette colours (CC0 by construction). No CC-BY assets.

1. **Camera-rotate keys (C1)**
   - What we know: E is required for interact by CTRL-01.
   - What's unclear: operator preference for rotate keys.
   - Recommendation: ask in plan checkpoint; default Z/C + arrows.
2. **Shard style (C6)**
   - What we know: the generic shard kit is cheap and robust.
   - What's unclear: whether the operator needs recognisable object pieces.
   - Recommendation: build generic first; revisit only if the feel is wrong.
3. **Device models and OS versions (D-06)**
   - What we know: one mid-range Android and one iPhone exist.
   - What's unclear: iOS version (affects OGG, WakeLock, SIMD ≥ 16.4) and Android GPU.
   - Recommendation: a first human task records model/OS/browser/Low Power Mode/refresh rate into `.planning/phases/01-.../device-log.md` before any measurement.
4. **DNS timing (D-01)**
   - What we know: `breaktime.doibung.com` is NXDOMAIN today; DNS is Hostinger.
   - What's unclear: when the operator adds it.
   - Recommendation: `infra:apply` does not need DNS; first site activation blocks on the DNS check.
5. **ffmpeg availability**
   - What we know: not installed locally; winget is available.
   - What's unclear: whether the operator installs it.
   - Recommendation: human step `winget install Gyan.FFmpeg`, else the SFX conversion task waits.
6. **Printer and water cooler models**
   - What we know: not in Furniture Kit; Poly Pizza candidates ("Office Printer / Copier" by Bruno Oliveira, "Water Cooler" by J-Toastie) are CC-BY.
   - Recommendation: build both from Box/Cylinder primitives using Furniture Kit palette colours (CC0 by construction). CC-BY is only acceptable if the operator agrees to attribution in CREDITS.md.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build/test/deploy | ✓ | 22.14.0 (meets Vite 8 ≥22.12, Vitest 5 ≥22.12) | — |
| npm | install | ✓ | 10.9.2 | — |
| Git | sha, clean-tree check | ✓ | 2.49.0.windows.1 | — |
| Windows OpenSSH `C:\Windows\System32\OpenSSH\ssh.exe` | deploy | ✓ | OpenSSH_for_Windows_9.5p2; alias `doibung` works in BatchMode (verified) | Git `ssh` 9.9p2 |
| Windows `tar.exe` (bsdtar) | upload stream | ✓ | bsdtar 3.8.8 (verified pipe to remote GNU tar) | Git `tar` 1.35 |
| rsync (local) | — | ✗ | — | tar over ssh (recommended) |
| Playwright Chromium headless shell | E2E | ✓ | 153 (build 1243, installed this session) | — |
| Docker Desktop (local) | optional Caddy config tests | ✓ | 29.7.2 (bind mounts may fail: file sharing not configured; use `docker build` + COPY as done here) | skip local Caddy test |
| ffmpeg | SFX conversion | ✗ | — | human install via winget |
| slopcheck | package audit | ✓ | 0.6.1 (installed this session) | — |
| Python | slopcheck | ✓ | 3.13 | — |
| VPS: Docker/Compose | caddy recreate | ✓ | 29.8.0 / v5.5.1 | — |
| VPS: Caddy | serving | ✓ | v2.11.4 in `doibung-caddy-1` | — |
| VPS: openssl, flock, bash 5.2, coreutils 9.5, rsync 3.4.4 | scripts | ✓ | — | — |
| DNS `breaktime.doibung.com` | HTTPS | ✗ (NXDOMAIN) | — | operator adds A record; no fallback |
| Real Android mid-range + iPhone | TECH-03/04 gate | ✓ (per D-06), models unrecorded | — | none (blocking gate) |

**Missing dependencies with no fallback:**
- DNS A record `breaktime → 187.53.128.67` (blocks PLAT-02 and the first site activation, not `infra:apply`).
- Real-device measurements (block phase completion by design).

**Missing dependencies with fallback:**
- rsync → tar stream. ffmpeg → human install step (or keep OGG if both test phones run iOS ≥ 18.4 and Android Chrome, not recommended).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.0 (unit), Playwright 1.63.0 Chromium headless (E2E), Node deploy smoke checks |
| Config file | none yet: Wave 0 creates `vitest.config.ts` (or `test` in vite config), `playwright.config.ts`, `tsconfig.json` |
| Quick run command | `npx tsc --noEmit && npx vitest run` |
| Full suite command | `npm run build && node scripts/size-report.mjs --gate && npx vitest run && npx playwright test` |
| Deploy gate | `npm run deploy` = drift check → full suite → upload → activate → smoke (breaktime + doibung + www) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TECH-01 | Loads in Chromium desktop + mobile emulation; unsupported screen without WebGL | e2e | `npx playwright test tests/e2e/smoke.spec.ts tests/e2e/unsupported.spec.ts` | ❌ Wave 0 |
| TECH-01 | Real browsers: Chrome/Edge/Firefox desktop, Chrome Android, Safari iOS | manual | Operator checklist at `https://breaktime.doibung.com/b/<sha>/` | ❌ (checklist in plan) |
| TECH-02 | First-load raw ≤ 20 MB (fail), ≤ 8 MB (warn + reason); no `.map`/`.env`; ≤ 1,500 files | e2e + script | `npx playwright test tests/e2e/first-load.spec.ts && node scripts/size-report.mjs --gate` | ❌ Wave 0 |
| TECH-03 | Bench completes and reports stats (headless) | e2e | `npx playwright test tests/e2e/smoke.spec.ts -g bench` | ❌ Wave 0 |
| TECH-03 | ≥ 30 fps avg (and 1% low recorded) on Android; 60 on desktop | manual (real device) | `?bench=1` screenshot on both phones + desktop | manual-only (no GPU headless, D-24) |
| TECH-04 | Soak cycles return geometries/textures/bodies to baseline (leak proxy) | e2e | `npx playwright test tests/e2e/soak-leak.spec.ts` | ❌ Wave 0 |
| TECH-04 | 15 min Safari iOS without crash/reload | manual (real iPhone) | `?soak=1` 15 min + 15 min play; beacon shows no `prevCrash` | manual-only |
| TECH-05 | Zero off-origin requests; CSP present | e2e | `npx playwright test tests/e2e/smoke.spec.ts` (request listener + meta CSP assert) | ❌ Wave 0 |
| TECH-06 | Pure logic tests run in Node | unit | `npx vitest run` (`tests/unit/{benchStats,quality,joystickMath,fixedStep,getUpFsm,debrisBudget,waypointWalker,rng,selectReleasesToDelete,parseStateCheck,sizeGate}.test.ts`) | ❌ Wave 0 |
| TECH-07 | HUD toggles and shows fps/draw calls/bodies | e2e | `npx playwright test tests/e2e/hud.spec.ts` (press backquote / `?debug=1`, assert 3 numeric fields > 0) | ❌ Wave 0 |
| CTRL-01 | WASD moves player; E / click triggers interact on highlighted object | e2e | `npx playwright test tests/e2e/controls.spec.ts -g desktop` (read `__bt.player.pos` before/after) | ❌ Wave 0 |
| CTRL-02 | Touch on left half spawns joystick and moves player; context button fires | e2e (emulated touch) + manual | `npx playwright test tests/e2e/controls.spec.ts -g touch` (dispatch pointer events with `pointerType:'touch'`); device feel manual | ❌ Wave 0 |
| CTRL-03 | Viewport resize portrait↔landscape keeps canvas full and HUD inside safe bounds | e2e + manual | `npx playwright test tests/e2e/orientation.spec.ts` (`page.setViewportSize` swap, assert canvas rect = viewport, buttons within viewport) | ❌ Wave 0 |
| CTRL-04 | ESC/Space pause; ⏸ button pause; sim time frozen | e2e | `npx playwright test tests/e2e/controls.spec.ts -g pause` (`__bt.simStep` unchanged over 500 ms) | ❌ Wave 0 |
| CTRL-05 | Rotate keys/buttons change camera yaw by exactly 90° | unit + e2e | `npx vitest run tests/unit/cameraRig.test.ts` + e2e yaw assert | ❌ Wave 0 |
| PLAT-01 | One command deploys; doibung.com only 200 during/after | deploy smoke (script) | `npm run deploy` (poller report must show non200=0; exits non-zero otherwise) | ❌ Wave 0 |
| PLAT-01 | Drift detection fails loudly | unit + manual drill | `npx vitest run tests/unit/parseStateCheck.test.ts`; one manual drill running state-check against a fixture output with `HOST_IMPORT=0` | ❌ Wave 0 |
| PLAT-02 | HTTPS valid on `breaktime.doibung.com`; `/b/<sha>/` served; immutable headers | deploy smoke | inside `npm run deploy` (Node `fetch` with TLS verification; header asserts) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit && npx vitest run` (< 10 s).
- **Per plan (wave merge):** full suite (`build + size gate + vitest + playwright`).
- **Per deploy:** full suite + drift check + post-deploy smoke of both domains + doibung poller. Any failure stops the deploy (D-24).
- **Per real-device session:** device log entry (model/OS/browser/Low Power Mode/tier/sha) + bench screenshot on Android and iPhone. Once for the phase gate: 15-min iOS soak + 15-min play; after the D-07 optimisation pass if needed.
- **Phase gate:** full suite green + both device screenshots meeting ≥ 30 fps (Android) + iOS 15-min pass + deploy smoke green, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `package.json` scripts: `dev`, `build` (`tsc --noEmit && vite build && node scripts/precompress.mjs`), `test`, `test:e2e`, `size`, `deploy`, `infra:apply`, `infra:rollback`, `assets`.
- [ ] `tsconfig.json` (TS 7 settings above), `vite.config.ts`, `playwright.config.ts` (3 projects).
- [ ] `window.__bt` test hook (state, player pos, simStep, bench result), gated to always-on but read-only.
- [ ] `tests/unit/*` for every `src/logic/*` module + deploy helpers; `tests/e2e/{smoke,unsupported,first-load,soak-leak,hud,controls,orientation}.spec.ts`.
- [ ] `npx playwright install chromium` step documented (browsers already present on this machine).

## Security Domain

ASVS Level 1, block on high (`.planning/config.json`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture / threat model | yes | Threats below go into `<threat_model>`; deploy scripts are data-flow-reviewed |
| V2 Authentication | no (public static site, D-05) | — (SSH key auth for deploy only, key stays local, `BatchMode=yes`) |
| V3 Session Management | no | — |
| V4 Access Control | yes (server side) | Caddy root confined per site; sites dir mounted **read-only** into caddy; deploy writes only under `/srv/sites/breaktime` |
| V5 Validation / Encoding | yes (limited) | Sha/backup-dir names regex-validated before shell use; no user-generated content; no `innerHTML` with dynamic strings |
| V6 Cryptography | yes (transport only) | TLS by Caddy/Let's Encrypt; never hand-roll |
| V8 Data Protection | yes | No personal data; `localStorage` only for tier + crash beacon, no identifiers |
| V10 Malicious code / supply chain | yes | Pinned versions, lockfile, `npm ci`, slopcheck, no postinstall scripts |
| V12 Files and resources | yes | `hide .* *.map`; build gate rejects `.map`/`.env` in dist; `sourcemap:false` |
| V14 Configuration | yes | Security headers (nosniff, Referrer-Policy, X-Frame-Options SAMEORIGIN, Permissions-Policy, `-Server`), CSP meta, config backup + rollback |

### Known Threat Patterns for {static game + SSH root deploy + shared Caddy}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Deploy script deletes outside its directory (empty var, crafted name, symlink) | Tampering / DoS | Hardcoded `BASE=/srv/sites/breaktime/releases` with `${BASE:?}`; names must match `^[0-9a-f]{7,40}$`; `realpath` prefix check; never delete the current target; `rm -rf --one-file-system --`; deletion list computed by a Vitest-tested pure function and re-validated remotely |
| Breaking doibung.com while wiring Caddy (bad config, wrong compose file, lost certs) | DoS | Backups outside `/opt/doibung`; validate in a throwaway container with `--network none`; `--no-deps`; app/postgres hash + container-ID equality; cert fingerprint unchanged; downtime poller; tested rollback script |
| Source maps / `.env` / planning docs leaked via web root | Information disclosure | `sourcemap:false`; size gate fails on `*.map`, `.env*`; Caddy `hide .* *.map`; only `dist/` is uploaded (tar `-C dist .`) |
| Root SSH key misuse or leakage | Elevation of privilege | Key stays at `~/.ssh/doibung_ed25519` locally; not in repo/CI (D-03); `BatchMode=yes`; host key via known_hosts (no `StrictHostKeyChecking=no`) |
| Command injection via values interpolated into remote shell | Tampering | Only fixed script bodies over stdin; the only interpolated value is the validated 12-hex sha |
| Concurrent/partial deploy serving a half-extracted build | Tampering / DoS | Extract to `.incoming-<sha>`, verify `index.html` + file count, atomic `mv` and `mv -T` symlink swap, `flock -n` lock |
| XSS / third-party script injection | Tampering | No external scripts; CSP `default-src 'self'` + `'wasm-unsafe-eval'` only; no dynamic HTML from input |
| Clickjacking of the test build | Spoofing | `X-Frame-Options: SAMEORIGIN` (CrazyGames will host its own copy later) |
| CPU exhaustion of the shared 1 vCPU box via compression-heavy requests | DoS | Precompressed br/gz sidecars; `encode` only as fallback |
| Let's Encrypt lockout from repeated failed issuance | DoS | DNS preflight on 1.1.1.1 and 8.8.8.8 before site activation |
| Silent config drift after a whattoeat deploy removes the game | Integrity (availability) | Per-deploy host+live state check; `infra:apply` idempotent re-apply; HANDOFF note |
| Malicious/typosquatted npm packages | Tampering | slopcheck audit (vitest SUS = verified false positive), exact pins, lockfile, reject packages with install scripts (ffmpeg-static) |

## Sources

### Primary (HIGH confidence, tool-verified this session)
- npm registry (`npm view`), 2026-09-14: versions, engines, peerDependencies, install scripts, weekly downloads for three, rapier variants, vite, typescript, vitest, @playwright/test, @gltf-transform/cli, nipplejs, howler, ffmpeg-static.
- Local measurement builds (Vite 8.3.0 in scratch dir): bundle sizes for three (minimal / with loaders / WebGPU), Rapier compat / SIMD compat / non-compat wasm; headless Chromium probe of each build; CSP `'wasm-unsafe-eval'` reproduction; TS 7.0.2 typecheck + negative control; Vitest 5 + Rapier in Node.
- Package sources: `node_modules/three` r186 (`WebGLInfo.js` autoReset, `Timer.js`, Clock deprecation, WebGL1 error, addons list incl. `ConvexObjectBreaker`), `@dimforge/rapier3d-compat` 0.20 d.ts (joints, `setContactsEnabled`, `isSleeping`, `setEnabled`, character controller) and README (simd/compat variants, determinism note), Vite 8 source (default target `safari16.4/ios16.4/chrome111`; glb/gltf/mp3/ogg known asset types).
- Kenney zips downloaded and inspected: [Blocky Characters](https://kenney.nl/assets/blocky-characters) (2.0, CC0, 18 GLB, node hierarchy, 27 clips, identical accessors across characters), [Furniture Kit](https://kenney.nl/assets/furniture-kit) (140 GLB list, flat materials), [Food Kit](https://kenney.nl/assets/food-kit) (2.0, CC0, mug/cup/plate-broken, colormap 512²), [Impact Sounds](https://kenney.nl/assets/impact-sounds) (CC0, 130 OGG, categories).
- gltf-transform CLI 4.5.0 run: merge/optimize/palette results.
- VPS read-only inspection via `ssh doibung`: containers, labels, mounts, compose hashes, Caddy version, admin API address, mime.types, modules, tools, cert, SELinux.
- Local `caddy:2.11.4-alpine` container test of the proposed site file.
- [Caddy import directive](https://caddyserver.com/docs/caddyfile/directives/import), [file_server](https://caddyserver.com/docs/caddyfile/directives/file_server), [matchers](https://caddyserver.com/docs/caddyfile/matchers), [header](https://caddyserver.com/docs/caddyfile/directives/header), [command line](https://caddyserver.com/docs/command-line).
- [Go mime builtin types](https://raw.githubusercontent.com/golang/go/master/src/mime/type.go) (`.wasm` → `application/wasm`).
- [MDN browser-compat-data](https://github.com/mdn/browser-compat-data) raw JSON: Element.requestFullscreen (iPad-only note), overscroll-behavior, touch-action, setPointerCapture, WebGL2, AudioSession, ScreenOrientation.lock, WakeLock, dynamic viewport units, CSP `wasm-unsafe-eval`.
- [caniuse Ogg Vorbis](https://caniuse.com/ogg-vorbis), [caniuse WASM SIMD](https://caniuse.com/wasm-simd), [caniuse Fullscreen](https://caniuse.com/fullscreen).
- [Let's Encrypt rate limits](https://letsencrypt.org/docs/rate-limits/).
- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/), [Vite 8.1 announcement](https://vite.dev/blog/announcing-vite8-1).

### Secondary (MEDIUM confidence)
- [Vitest 5 blog](https://vitest.dev/blog/vitest-5.html) / [migration guide](https://vitest.dev/guide/migration/) (via search summary: Node/Vite minimums, clearMocks default).
- [WebKit bug 168837, rAF 30 fps in Low Power Mode](https://bugs.webkit.org/show_bug.cgi?id=168837), [Motion: when browsers throttle rAF](https://motion.dev/magazine/when-browsers-throttle-requestanimationframe).
- [Apple forums: WebGL canvas resize leak (fixed iOS 14.3)](https://developer.apple.com/forums/thread/668999), [three.js forum: Safari crash with big shadow map](https://discourse.threejs.org/t/a-problem-repeatedly-occurred-in-safari-when-shadow-map-size-too-big/44542).
- [CrazyGames requirements](https://docs.crazygames.com/requirements/intro/) (initial download ≤ 50 MB, ≤ 1,500 files; compressed-vs-raw not specified).
- Poly Pizza license pages: [Office Printer / Copier, Bruno Oliveira, CC-BY 3.0](https://poly.pizza/m/bgNnmejxBa-), [water cooler search](https://poly.pizza/search/water%20cooler).

### Tertiary (LOW confidence, flagged)
- iOS `user-scalable=no` being ignored; silent-switch muting Web Audio (A1, A2), from training knowledge.
- [WebSearch summary on iPhone fullscreen in 17.x betas](https://developer.apple.com/forums/thread/133248) contradicts MDN BCD. BCD (iPad-only) was used.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Versions from the registry, sizes measured, runtime verified in headless Chromium.
- Assets: HIGH. Zips inspected byte-level; licenses read from License.txt.
- Server/Caddy: HIGH. Read-only inspection plus a local replay of the exact Caddy version.
- Architecture (ragdoll/get-up/shards/tiers): MEDIUM. APIs verified; feel and perf need device testing.
- Mobile/iOS behaviour: MEDIUM. BCD/caniuse-backed; the final word is the real iPhone.
- Pitfalls: HIGH for server/tooling (reproduced), MEDIUM for device-specific ones.

**Research date:** 2026-09-14
**Valid until:** 2026-10-14 (fast-moving: Vite 8.x, TS 7.x, Playwright monthly; re-run `npm view` before pinning if planning slips)

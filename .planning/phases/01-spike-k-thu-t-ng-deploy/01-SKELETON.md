# Walking Skeleton — Break Time

**Phase:** 1
**Generated:** 2026-09-14
**Skeleton plans:** 01-01 (legitimacy gate + scaffold/CSP), 01-02 (boot: gate, loading, Chơi, Rapier loop), 01-03 (room + WASD + physics push), 01-04 (server wiring tooling + approval token), 01-06 (size gate + Caddy site + release scripts), 01-07 (one-command deploy), 01-12 (go live)

## Capability Proven End-to-End

A phone or desktop browser opens `https://breaktime.doibung.com` (or `/b/<sha>/`), sees a real loading bar and a "Chơi" button, then walks a Rapier-physics player through a three.js room with WASD (desktop) and pushes a physics box with E, from a build that `npm run deploy` gated, uploaded and activated while `doibung.com` kept answering 200.

There is no database in this project. The "real read/write" of the skeleton is the physics world: input writes the kinematic player body, Rapier steps, and the renderer reads body transforms back every frame.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Language / build | TypeScript 7.0.2 (Go-native `tsc`, type-check only) + Vite 8.3.0 (Rolldown), exact pins, `package-lock.json` committed | Locked stack (PROJECT.md). Vite 8 default target covers Safari/iOS 16.4 and Chrome 111. TS 7 has no JS API, so no typescript-eslint / ts-node |
| Rendering | three 0.186.0 `WebGLRenderer`, flat Lambert materials, blob shadows, `shadowMap.enabled = false`, DPR cap by tier | D-14, TECH-03. WebGPU renderer rejected for the spike (larger bundle, TSL) |
| Physics | `@dimforge/rapier3d-simd-compat` 0.20.0, automatic fallback (and `?simd0`) to `@dimforge/rapier3d-compat` 0.20.0 | Fastest WASM physics, embedded WASM avoids bundler/MIME issues; SIMD matches the iOS 16.4 baseline; compat is the proven fallback |
| Game loop | `renderer.setAnimationLoop` + three `Timer`; pure fixed-step stepper at 60 Hz (max 4 steps, backlog dropped); `timeScale` 0 for pause and hit-stop | Deterministic sim per device (bench seed), no spiral of death, D-12 hit-stop |
| Data layer | None. `localStorage` (always inside try/catch) only for the manual quality tier and the crash beacon; no identifiers | PROJECT "no personal data"; portal rules |
| Auth | None for players (public site, no noindex, D-05). Deploy uses the operator's local SSH key in `BatchMode=yes`; the key never leaves the machine (D-03) | Public test build; no CI |
| Deployment target | Static `dist/` → `tar -czf -` over Windows OpenSSH → `/srv/sites/breaktime/releases/<sha12>` → atomic relative symlink `current`; served by the existing doibung Caddy (v2.11.4) through `import /etc/caddy/sites/*.caddy` and a read-only `/srv/sites` bind mount; latest at `/`, each commit at `/b/<sha>/`, 10 newest kept | D-01..D-04; no build on the 1 vCPU VPS; no second container on 80/443 |
| Server change control | One-time, idempotent `npm run infra:apply -- --approve=APPROVE-CADDY-<code>` (operator-typed token derived from preflight state + one-time server nonce, verified by the script; backup → +1 import line, +1 mount line per compose file → validate in `--network none` container → recreate caddy only with `docker-compose.withdb.yml --no-deps`) plus token-gated `infra:rollback`; drift check on every deploy | D-02, RESEARCH C3 / Pitfalls 1–2; operator approval cannot be given by an agent; `d:/whattoeat` is never edited |
| Testing | Vitest 5.0.0 in Node for `src/logic/*` and `scripts/lib/*`; Playwright 1.63.0 Chromium headless against `vite preview` with projects `desktop`, `mobile-emu`, `no-webgl`; fps only from real devices | D-24, TECH-06; SwiftShader numbers are meaningless |
| Test hook | `window.__bt`, read-only getters registered per module through `registerDebug(key, getter)`; boot state `booting / unsupported / loading / ready-to-play / playing` | Lets every later plan expose state without editing a shared file |
| Asset pipeline | `npm run assets` (dev-time only, outputs committed in `src/assets`): gltf-transform 4.5.0 `merge` + `optimize --compress meshopt --palette`; one shared Blocky `character.glb` + 18 textures at 512²; OGG→MP3 and PNG resize through the `ffmpeg-static` devDependency | TECH-02 budget, D-09, D-15, D-25 |
| Security baseline | CSP meta `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' …`; no source maps, no `.env` in `dist`; Caddy adds nosniff, Referrer-Policy, X-Frame-Options SAMEORIGIN, Permissions-Policy, hides dotfiles and `*.map`; precompressed br/gzip sidecars | TECH-05, ASVS L1 |
| Directory layout | `src/{boot,logic,physics,render,input,audio,ui,game,bench,debug,assets}`, `assets-src/`, `scripts/` (+ `scripts/lib`), `deploy/{caddy,remote,infra}`, `tests/{unit,e2e}` | `src/logic` stays free of three/DOM/Rapier so it is testable in Node (TECH-06) |

## Stack Touched in Phase 1

- [ ] Project scaffold (Vite, TypeScript, Vitest, Playwright, pinned deps, npm scripts for every later tool, CSP) — 01-01
- [ ] Routing — single page served at `/` and `/b/<sha>/` (relative `base: './'`), `/b/<sha>` 308 redirect, bad sha 404 — 01-01, 01-06
- [ ] Data read/write — N/A (no database); physics world is written by input and read by the renderer every frame — 01-02, 01-03
- [ ] UI — "Chơi" gate, WASD movement, E interaction on a physics box — 01-02, 01-03
- [ ] Deployment — live on `https://breaktime.doibung.com` via `npm run deploy`, doibung.com 200 throughout — 01-04, 01-06, 01-07, 01-12

## Out of Scope (Deferred to Later Slices)

- Navmesh, NPC day schedules, vision cones, suspicion (Phase 2, DETECT-*)
- Pickup/carry, pranks, to-do list, day clock, HR strikes (Phase 3)
- Swipe/drag weapon swings, Rage Mode, damage bill (Phase 4, RAGE-03)
- Gossip system (Phase 5); progression, coins, saves (Phase 6)
- Background music, full audio settings, i18n vi/en, tutorial, PlatformAdapter (Phase 7)
- Password protection / noindex for the test build (deferred idea; revisit before Phase 8)
- Rapier non-compat build with native Wasm ESM (size optimisation, not needed within budget)

## Subsequent Slice Plan

Inside Phase 1, each plan adds one user-visible slice on this skeleton without changing its decisions:

- 01-05 committed CC0 asset pipeline · 01-08 floating joystick, context button, pause · 01-09 90° camera rotation, portrait/landscape, fullscreen
- 01-10 real office room with 24+ physics props · 01-11 debug HUD + auto/manual quality tiers · 01-13 audio unlock on Chơi + SFX
- 01-14 Blocky player + 3 waypoint NPCs · 01-15 slap → ragdoll → get-up · 01-16 breakables + shard kit
- 01-17 `?bench=1` · 01-18 `?soak=1` + crash beacon + deploy · 01-19 real-device gate
- 01-20 conditional single D-07 optimisation pass (entry guard) · 01-21 conditional verdict or STOP + PlayCanvas evaluation (entry guard)

Later phases:

- Phase 2: NPC schedules on navmesh, vision cones, suspicion meter, noise, hiding
- Phase 3: pranks with punchlines inside one workday loop
- Phase 4: stress bar and Rage Mode smashing
- Phase 5: gossip spread, distortion, trace-back and confrontation
- Phase 6: five-day floor, scoring, coins, shop, saves
- Phase 7: onboarding, vi/en, music, ≤ 10 s to control, PlatformAdapter
- Phase 8: CrazyGames Basic Launch and metrics

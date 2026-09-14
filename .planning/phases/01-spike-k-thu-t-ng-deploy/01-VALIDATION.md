---
phase: 1
slug: spike-k-thu-t-ng-deploy
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-14
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Nguồn: `01-RESEARCH.md` §Validation Architecture, đã khớp lại với CONTEXT D-19 (phím xoay Z/C) và D-25 (ffmpeg-static).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.0 (unit) · Playwright 1.63.0 Chromium headless (E2E) · Node deploy smoke checks |
| **Config file** | none — Wave 0 installs (`vitest` config trong `vite.config.ts` hoặc `vitest.config.ts`, `playwright.config.ts`, `tsconfig.json`) |
| **Quick run command** | `npx tsc --noEmit && npx vitest run` |
| **Full suite command** | `npm run build && node scripts/size-report.mjs --gate && npx vitest run && npx playwright test` |
| **Deploy gate** | `npm run deploy` = drift check → full suite → upload → activate → smoke (breaktime + doibung + www) |
| **Estimated runtime** | quick < 10 s · full ~90 s |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit && npx vitest run`
- **After every plan wave:** Run full suite
- **Before every deploy:** full suite + drift check + post-deploy smoke of both domains + doibung poller; any failure stops the deploy (D-24)
- **Per real-device session:** device-log entry (model / OS / browser / Low Power Mode / quality tier / sha) + `?bench=1` screenshot on Android and iPhone
- **Before `/gsd-verify-work`:** full suite green + both device screenshots (Android ≥ 30 fps avg) + iOS 15-min soak pass + deploy smoke green
- **Max feedback latency:** 10 seconds (quick run)

---

## Per-Task Verification Map

*Filled by planner/executor once PLAN.md task IDs exist. Target mapping per requirement:*

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| TECH-01 | Loads in Chromium desktop + mobile emulation; unsupported screen when no WebGL2 | e2e | `npx playwright test tests/e2e/smoke.spec.ts tests/e2e/unsupported.spec.ts` | ❌ W0 | ⬜ pending |
| TECH-02 | First-load raw ≤ 20 MB (fail), ≤ 8 MB (warn + reason); no `.map`/`.env`; ≤ 1,500 files | e2e + script | `npx playwright test tests/e2e/first-load.spec.ts && node scripts/size-report.mjs --gate` | ❌ W0 | ⬜ pending |
| TECH-03 | `?bench=1` completes and reports stats (headless) | e2e | `npx playwright test tests/e2e/smoke.spec.ts -g bench` | ❌ W0 | ⬜ pending |
| TECH-04 | Soak cycles return geometries/textures/bodies to baseline (leak proxy) | e2e | `npx playwright test tests/e2e/soak-leak.spec.ts` | ❌ W0 | ⬜ pending |
| TECH-05 | Zero off-origin requests; CSP present (incl. `'wasm-unsafe-eval'`) | e2e | `npx playwright test tests/e2e/smoke.spec.ts` | ❌ W0 | ⬜ pending |
| TECH-06 | Pure logic tests run in Node | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| TECH-07 | HUD toggles and shows fps / draw calls / bodies | e2e | `npx playwright test tests/e2e/hud.spec.ts` | ❌ W0 | ⬜ pending |
| CTRL-01 | WASD moves player; E / click interacts with highlighted object | e2e | `npx playwright test tests/e2e/controls.spec.ts -g desktop` | ❌ W0 | ⬜ pending |
| CTRL-02 | Touch on left half spawns floating joystick and moves player; context button fires | e2e (emulated touch) | `npx playwright test tests/e2e/controls.spec.ts -g touch` | ❌ W0 | ⬜ pending |
| CTRL-03 | Portrait ↔ landscape keeps canvas full and HUD inside viewport | e2e | `npx playwright test tests/e2e/orientation.spec.ts` | ❌ W0 | ⬜ pending |
| CTRL-04 | ESC/Space and ⏸ pause; sim time frozen | e2e | `npx playwright test tests/e2e/controls.spec.ts -g pause` | ❌ W0 | ⬜ pending |
| CTRL-05 | Z / C keys and ⟲ ⟳ buttons change camera yaw by exactly 90° | unit + e2e | `npx vitest run tests/unit/cameraRig.test.ts` + e2e yaw assert | ❌ W0 | ⬜ pending |
| PLAT-01 | One command deploys; doibung.com only 200 during/after; drift check fails loudly | deploy smoke + unit | `npm run deploy` (poller non200=0) · `npx vitest run tests/unit/parseStateCheck.test.ts` | ❌ W0 | ⬜ pending |
| PLAT-02 | HTTPS valid on `breaktime.doibung.com`; `/b/<sha>/` served; cache headers | deploy smoke | inside `npm run deploy` (Node `fetch` with TLS verification + header asserts) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `package.json` scripts: `dev`, `build`, `test`, `test:e2e`, `size`, `deploy`, `infra:apply`, `infra:rollback`, `assets` (assets dùng `ffmpeg-static`, D-25)
- [ ] `tsconfig.json`, `vite.config.ts` (kèm cấu hình vitest), `playwright.config.ts`
- [ ] `window.__bt` test hook (state, player pos, simStep, bench result), read-only
- [ ] `tests/unit/*` cho mỗi module `src/logic/*` + deploy helpers
- [ ] `tests/e2e/{smoke,unsupported,first-load,soak-leak,hud,controls,orientation}.spec.ts`
- [ ] `npx playwright install chromium` documented

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real browsers load the game | TECH-01 | Only real Chrome/Edge/Firefox desktop, Chrome Android, Safari iOS prove it | Open `https://breaktime.doibung.com/b/<sha>/` on each; tick checklist |
| ≥ 30 fps avg on mid-range Android, 60 on desktop | TECH-03 | Headless has no real GPU (D-24) | Record device in device-log (D-06), run `?bench=1`, screenshot result incl. sha + tier; Low Power Mode OFF |
| 15 min on Safari iOS without crash/reload | TECH-04 | Tab-kill behaviour only reproducible on real iPhone | `?soak=1` 15 min + 15 min free play; beacon shows no `prevCrash` |
| Joystick / context button feel on phone | CTRL-02 | Emulated touch cannot judge feel | Play 2 min on each phone, note issues in device-log |
| DNS `A breaktime → 187.53.128.67` exists | PLAT-02 | Operator action at DNS provider | `nslookup breaktime.doibung.com` returns 187.53.128.67 before first activation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

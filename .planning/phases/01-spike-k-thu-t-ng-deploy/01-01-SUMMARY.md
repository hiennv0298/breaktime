---
phase: 01-spike-k-thu-t-ng-deploy
plan: 01
subsystem: scaffold
tags: [vite, typescript, vitest, playwright, csp, build-info, test-hook]
requires: []
provides:
  - "package.json with 11 exact pins and all 13 npm scripts later plans call"
  - "tsconfig.json / tsconfig.node.json / vite.config.ts (version-json plugin, __BUILD_SHA__, __BUILD_TIME__) / vitest.config.ts / playwright.config.ts (desktop, mobile-emu, no-webgl)"
  - "index.html with CSP meta ('wasm-unsafe-eval'), viewport-fit=cover"
  - "src/debug/testHook.ts: BootState, DebugRegistry, createDebugRegistry, registerDebug, setBootState; window.__bt keys state, sha, buildTime"
  - "src/boot/buildInfo.ts: BUILD_SHA, BUILD_TIME, mountBuildBadge (#build-badge)"
  - "src/ui/hud.css: #build-badge, #loading .bar/.fill, #play, #unsupported"
  - "tests/e2e/helpers.ts: collectPageProblems, waitForBtState"
affects: [01-02, 01-04, 01-05, 01-06, 01-07]
tech-stack:
  added: [three@0.186.0, "@dimforge/rapier3d-simd-compat@0.20.0", "@dimforge/rapier3d-compat@0.20.0", vite@8.3.0, typescript@7.0.2, vitest@5.0.0, "@playwright/test@1.63.0", "@types/three@0.186.0", "@types/node@22.20.2", "@gltf-transform/cli@4.5.0", ffmpeg-static@5.3.0]
  patterns: ["getter-only non-configurable debug registry on window.__bt", "compile-time sha define + version.json asset", "CSP as meta tag so preview tests the production policy"]
key-files:
  created: [package.json, package-lock.json, tsconfig.json, tsconfig.node.json, vite.config.ts, vitest.config.ts, playwright.config.ts, index.html, src/main.ts, src/boot/buildInfo.ts, src/debug/testHook.ts, src/ui/hud.css, tests/unit/testHook.test.ts, tests/e2e/helpers.ts, tests/e2e/csp.spec.ts]
  modified: [.gitignore]
decisions:
  - "Package legitimacy gate cleared by the operator typing 'approved' (2026-09-15) for all 11 pins incl. vitest@5.0.0, ffmpeg-static@5.3.0 (GPL-3.0-or-later, dev-only, install script downloads ffmpeg locally, never in dist) and @types/node@22.20.2; RESEARCH audit row marking ffmpeg-static Rejected is superseded by D-25 / Q5"
  - "buildInfo reads __BUILD_SHA__/__BUILD_TIME__ through typeof guards so testHook.ts stays importable in Vitest (Node, no define); e2e proves the built bundle gets the real sha, not the 000000000000 fallback"
  - "window.__bt target is a null-prototype object defined once on window (non-writable, non-configurable); testHook declines HMR so a dev edit forces a full reload instead of a redefine error"
metrics:
  duration: "~6 min (resume after checkpoint, 02:46:46Z to 02:52:53Z)"
  completed: 2026-09-15
  tasks: 3
  files: 16
---

# Phase 1 Plan 01: Scaffold, security baseline and test runners Summary

Exact-pinned Vite 8 + TypeScript 7 + Three r186 + Rapier 0.20 scaffold with every npm script declared once, a CSP meta that allows only same-origin plus `'wasm-unsafe-eval'`, a relative-base build that emits `version.json`, a `Break Time · <12-hex sha>` corner badge, a read-only `window.__bt` registry, and both test runners green (Vitest 6/6, Playwright CSP spec 6/6 on desktop + mobile-emu).

## Task 1: Package legitimacy gate (checkpoint:human-action)

- Before the halt the previous agent confirmed `NO_INSTALL_YET` and looked up all 11 pinned versions in the registry (all exist; only ffmpeg-static has an install script). Node v22.14.0, npm 10.9.2.
- **Operator reply (this session, 2026-09-15): "approved"**. The operator approved installing all 11 pinned packages, including vitest@5.0.0, ffmpeg-static@5.3.0 (accepts GPL-3.0-or-later dev-only use and the install script downloading an ffmpeg binary locally; never shipped in dist; D-25) and @types/node@22.20.2.
- At resume time the check ran again before any install and printed `NO_INSTALL_YET` (no `package.json`, no `node_modules`). Nothing was installed before the approval.
- No repo files changed and nothing was committed for this task.

## Task 2: Scaffold (commit 7d430ed)

- Installed with `npm install --save-exact` (rc 0, 0 vulnerabilities). The ffmpeg-static install script placed `node_modules/ffmpeg-static/ffmpeg.exe` (82,797,568 bytes). Nothing was installed system-wide and winget was not used.
- `npx playwright install chromium` rc 0 (Chromium was already in the user cache). `npx playwright --version` printed `Version 1.63.0`.
- Evidence: `PINS_BAD 0 SCRIPTS_MISSING none`. `npm ls` lists all 11 packages at their exact versions with no invalid or missing entries. index.html has `'wasm-unsafe-eval'` and `viewport-fit=cover`, 0 `http(s)://` and 0 `robots`. vite.config.ts has `base: './'` and `sourcemap: false`. `winget` appears 0 times. package-lock.json is 152,523 bytes.

## Task 3: Sha badge, registry, HUD CSS, tests (TDD, commits 2cc71d1 RED, c3052bd GREEN)

- RED: `vitest run` rc 1 with "Cannot find module ../../src/debug/testHook". `vite build` rc 1 because the entry was missing.
- GREEN: `npm run typecheck` rc 0 (both tsconfigs). `vitest run` gave 6 passed. `vite build` rc 0 with 4 files (index.html, version.json, 1 JS, 1 CSS). `playwright test tests/e2e/csp.spec.ts --project=desktop --project=mobile-emu` gave `6 passed`, 0 failed.
- Acceptance checks:
  - `dist/version.json` sha matches `git rev-parse --short=12 HEAD`. It was checked at 2cc71d130a29 and again after the final commit, when a rebuild gave c3052bdec5d2 on both sides.
  - dist has 0 `.map` files, src has 0 `innerHTML`, and hud.css has 0 `@font-face` or `url(http`.
  - testHook.ts contains "duplicate debug key".
- Guards against a vacuous pass:
  - The load test asserts that the request listener saw more than 1 request.
  - The badge test compares against the served `version.json` sha, so a `000000000000` fallback would fail it.
  - The built bundle contains the literal sha.
  - Built index.html references `./assets/...`, which confirms the relative base.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] typeof guards on compile-time constants**
- **Found during:** Task 3
- **Issue:** testHook.ts imports buildInfo.ts to register `sha` and `buildTime` at module load. Vitest runs in Node without Vite's `define`, so a bare `__BUILD_SHA__` would throw a ReferenceError and the unit test could not import the module.
- **Fix:** `typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : '000000000000'`. The global registry is created only when `window` exists. The e2e test confirms the production bundle carries the real sha.
- **Files:** src/boot/buildInfo.ts, src/debug/testHook.ts
- **Commit:** c3052bd

**2. [Rule 2 - Correctness] Small hardening beyond the spec**
- vite.config.ts only accepts a 12-hex git output and falls back to `000000000000` otherwise.
- `mountBuildBadge` does nothing if the badge already exists.
- testHook declines HMR, because a non-configurable `window.__bt` cannot be redefined when the module is evaluated again.
- The unit test adds a case proving keys cannot be redefined or deleted.
- **Commit:** 7d430ed, 2cc71d1, c3052bd

## Known Stubs

- The npm scripts `size`, `assets:fetch`, `assets`, `infra:check`, `infra:apply`, `infra:rollback` and `deploy` point to files that do not exist yet. The plan intends this: plans 01-04, 01-05, 01-06 and 01-07 create them, so package.json never needs editing again.
- The hud.css styles for `#loading`, `#play` and `#unsupported` have no elements yet. Plan 01-02 creates them, as the CSS contract in this plan states.

## TDD Gate Compliance

RED `test(01-01)` 2cc71d1, then GREEN `feat(01-01)` c3052bd. No refactor was needed.

## Self-Check: PASSED

- Files: all 15 created files and .gitignore are present and committed.
- Commits: 7d430ed, 2cc71d1 and c3052bd all appear in `git log`.

---
phase: 01-spike-k-thu-t-ng-deploy
plan: 02
subsystem: boot-render-physics
tags: [three, rapier, wasm-simd, fixed-step, loading, capability-gate, playwright, vitest]
requires:
  - "01-01: registerDebug, setBootState, BUILD_SHA, mountBuildBadge, collectPageProblems, waitForBtState, hud.css #loading/#play/#unsupported, CSP with 'wasm-unsafe-eval'"
provides:
  - "src/boot/capabilities.ts: Caps, detect() (no three import)"
  - "src/ui/unsupported.ts: showUnsupported(caps), showBootError() (no three import)"
  - "src/boot/loading.ts: LoadTask, runLoadTasks, fetchWithProgress, createLoadingView"
  - "src/boot/playGate.ts: onPlayGesture (sync inside Chơi click), waitForPlay({ autoplay })"
  - "src/logic/fixedStep.ts: makeStepper; src/logic/progress.ts: weightedProgress"
  - "src/physics/rapier.ts: RapierApi, loadRapier (SIMD + compat fallback, ?simd0), Physics, createPhysics"
  - "src/render/renderer.ts: RenderCtx, createRenderer (shadowMap disabled, DPR <= 2)"
  - "src/game/assets.ts gameLoadTasks; src/game/game.ts GameCtx/Game/createGame; src/game/loop.ts startLoop"
  - "window.__bt keys caps, loadProgress, rapierFlavor, simStep, paused; boot states loading, ready-to-play, playing, unsupported"
  - "URL params autoplay, simd0"
affects: [01-03, 01-04, 01-05, 01-06, 01-07, 01-08, 01-09]
tech-stack:
  added: []
  patterns:
    - "Lazy boot: main.ts imports only badge, registry, detect and the unsupported screen; loading, three and Rapier are dynamic imports after the gate"
    - "Load tasks with weights; a task reports at most 0.999 until it resolves, so loadProgress 1 means everything really finished"
    - "Gesture callbacks run synchronously in the Chơi click handler (audio unlock and fullscreen keep user activation)"
    - "Fixed 1/60 sim step via makeStepper + THREE.Timer connected to document"
key-files:
  created: [src/boot/capabilities.ts, src/boot/loading.ts, src/boot/playGate.ts, src/ui/unsupported.ts, src/logic/fixedStep.ts, src/logic/progress.ts, src/physics/rapier.ts, src/render/renderer.ts, src/game/assets.ts, src/game/game.ts, src/game/loop.ts, tests/unit/fixedStep.test.ts, tests/unit/progress.test.ts, tests/e2e/smoke.spec.ts, tests/e2e/unsupported.spec.ts]
  modified: [src/main.ts, tests/e2e/csp.spec.ts]
decisions:
  - "01-02: csp.spec now waits for 'ready-to-play' instead of 'booting'; boot leaves 'booting' synchronously once the capability gate exists, and the stronger wait also proves Rapier WASM instantiates under the CSP"
  - "01-02: three, Rapier and the loading/play modules are dynamic imports after detect(), so the unsupported path downloads only index JS + CSS (measured: 3 requests)"
  - "01-02: the SIMD module is cast to RapierApi (typeof @dimforge/rapier3d-compat); both packages ship identical .d.ts but TypeScript treats their classes as nominally distinct"
metrics:
  duration: "~18 min (02:58:18Z to 03:16:07Z)"
  completed: 2026-09-15
  tasks: 2
  files: 17
---

# Phase 1 Plan 02: Boot slice (gate, loading, Chơi, Rapier world, render loop) Summary

The locked stack now boots end to end in a real browser. The capability gate runs first, then a weighted loading bar, then the "Chơi" button, then a lit three r186 floor where a Rapier 0.20 box falls and lands. Rapier uses the SIMD build by default and falls back to compat (forced with `?simd0`). Browsers without WebGL2 or WASM get a Vietnamese unsupported screen. Tests pass in desktop, mobile-emu and no-webgl: Playwright 15/15, Vitest 16/16.

## Task 1: RED tests (commit 0c43b9e)

- Added 4 test files that follow the behavior list: `smoke.spec.ts` (4 tests, skipped outside desktop/mobile-emu), `unsupported.spec.ts` (skipped outside no-webgl), `fixedStep.test.ts` and `progress.test.ts`.
- Verify output: `BUILD_OK`, `UNIT_RED` (vitest rc 1, "Cannot find module ../../src/logic/..."), `E2E_RED` (Playwright rc 1, `4 failed`, each a `waitForFunction` timeout on the boot state; not "No tests found").
- `git diff --quiet -- tests/e2e/csp.spec.ts` printed `CSP_UNCHANGED` before the commit.
- Guards against vacuous passes:
  - simStep growth is measured inside the page over exactly 1000 ms.
  - The canvas check requires exactly 1 canvas, with non-zero CSS size and backbuffer size.
  - The clamp test uses maxSteps 100, so only the 0.1 s clamp can limit the count (5 to 6 steps, never 30).

## Task 2: GREEN implementation (commit 8618251)

- Plan verify command (`typecheck && vitest run && vite build && playwright test smoke unsupported csp`) gave `VERIFY rc=0`:
  - Vitest: 3 files, 16 passed.
  - Playwright: `15 passed (18.5s)`, 0 failed, 0 flaky, covering desktop 7, mobile-emu 7 and no-webgl 1.
  - The command was run again after the last edit (loop.ts literal `makeStepper(1 / 60, 4)`) and was still green.
- Acceptance greps:
  - `shadowMap.enabled = false` is on renderer.ts:23.
  - The count of three imports in capabilities.ts and unsupported.ts is 0.
  - `innerHTML` appears 0 times in src.
- Extra probe (a scratch Node + Playwright script on port 4174, not committed):
  - Desktop `?autoplay=1`: caps `{webgl2:true, wasm:true, simd:true}`, rapierFlavor `simd`, loadProgress 1, **61 sim steps per second**.
  - Console on desktop showed only 4 SwiftShader `GPU stall due to ReadPixels` warnings, with 0 errors. All 12 requests were same-origin.
  - Screenshot shows the orange box resting on the floor, with the badge `Break Time · 0c43b9e537ec`.
  - `--disable-webgl`: state `unsupported`, only 3 requests (`/`, index JS, CSS), 0 console messages. The screenshot shows the h1, the guidance paragraph and "Thiếu: WebGL2".
- Build output: `rapier-*.js` chunks are 2,853.74 kB (1,094 kB gzip) and 3,087.78 kB (1,074 kB gzip). A client loads only one of them. three core + renderer are about 530 kB raw (132 kB gzip). This is input for the 01-04 size gate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] csp.spec waited for a state the new boot never keeps**
- **Found during:** Task 2
- **Issue:** Two tests in `tests/e2e/csp.spec.ts` (01-01) called `waitForBtState(page, 'booting')`. main.ts now moves to `loading` synchronously, so they timed out after 30 s in desktop and mobile-emu (4 failed). The plan requires csp.spec to pass.
- **Fix:** Both tests now wait for `ready-to-play` (60 s) and the badge test expects that state. Everything else in the file is unchanged (7 lines).
- **Files modified:** tests/e2e/csp.spec.ts
- **Commit:** 8618251

**2. [Rule 2 - Correctness] Small hardening beyond the spec**
- Three, Rapier, loading and playGate are dynamic imports after `detect()`. This keeps the unsupported screen instant, and the probe measured only 3 requests on that path.
- The boot failure screen lives in `unsupported.ts` as `showBootError()`: section#boot-error, styled through CSSOM because hud.css was outside this plan's files. `console.error('Boot failed')` fires only on a real failure.
- `runLoadTasks` rejects duplicate task ids, never lets progress go backwards, and caps reports at 0.999 until the task resolves.
- `makeStepper` and `weightedProgress` treat NaN, negative and non-finite inputs as 0.
- The playGate click handler ignores a second click. The unsupported text sits in an inner div so the flex-row `#unsupported` CSS stacks it vertically.
- **Commit:** 8618251

## Known Stubs

- `src/game/loop.ts`: `const paused = false`. The pause UI arrives in a later plan, as the plan specifies.
- `src/game/game.ts`: `fixedUpdate` is a no-op. The skeleton has no per-step game logic yet.
- `src/game/assets.ts`: only the `rapier` task (weight 70). Later plans append office, NPC and SFX tasks.
- `fetchWithProgress` has no caller yet. It is the contract for the asset tasks in later plans.
- None of these block this plan's goal.

## Human check (deferred to end of phase, human_verify_mode end-of-phase)

Run `npx vite preview --port 4173` and open http://localhost:4173/ in desktop Chrome. You should see the loading bar fill, then "Chơi"; clicking it shows the floor with a box that falls and lands, and the sha badge stays top-left. A headless SwiftShader screenshot already shows the landed box, but a first frame on a real GPU has not been checked.

## TDD Gate Compliance

RED `test(01-02)` 0c43b9e, then GREEN `feat(01-02)` 8618251. No refactor commit was needed.

## Self-Check: PASSED

- All 15 created files and 2 modified files exist and are committed.
- Commits 0c43b9e and 8618251 appear in `git log --all`.
- The working tree was clean after the Task 2 commit.

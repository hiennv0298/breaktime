import { Timer } from 'three';
import { registerDebug } from '../debug/testHook';
import { consumePauseToggle } from '../input/inputState';
import { createFpsMeter } from '../logic/benchStats';
import { makeStepper } from '../logic/fixedStep';
import { createPauseState, type PauseState } from '../logic/pauseState';
import { TIER_LABEL_VI } from '../logic/quality';
import { createDebugHud } from '../ui/debugHud';
import { createKeyHints, createKeyHintsSection } from '../ui/keyHints';
import { createPauseMenu, createQualityControls } from '../ui/pauseMenu';
import type { Game, GameCtx } from './game';
import { createQualityManager } from './qualityManager';

const FIXED_DT = 1 / 60;
/** HUD / body counters refresh at 4 Hz (RESEARCH Pattern 7): counting sleeping bodies every frame is wasted work. */
const HUD_SAMPLE_MS = 250;

const pauseState = createPauseState();

/** The single pause state of the running game (D-20, CTRL-04). */
export function getPauseState(): PauseState {
  return pauseState;
}

/** Fixed-step sim + variable render (RESEARCH Pattern 3). Paused frames still render but run 0 sim steps. */
export function startLoop(ctx: GameCtx, game: Game): void {
  const timer = new Timer();
  timer.connect(document); // Page Visibility: no giant delta after a hidden tab
  const stepper = makeStepper(1 / 60, 4);
  let simStep = 0;

  const params = new URLSearchParams(location.search);
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  // Created before the first frame, so the renderer DPR and camera far are already tiered when rendering starts.
  const quality = createQualityManager({ coarse, params, startMs: performance.now() });
  const hud = createDebugHud(params.get('debug') === '1');
  const fpsMeter = createFpsMeter(1000);
  const rapierFlavor = String((ctx.loaded.get('rapier') as { flavor?: string } | undefined)?.flavor ?? '?');

  // Resuming only happens through the menu or the toggle keys/button, never automatically.
  const menu = createPauseMenu(() => pauseState.resume());
  menu.addSection(createQualityControls(hud));
  // Key hint panel + touch hint (D-28, CTRL-06), toggled from the same menu.
  const hints = createKeyHints();
  menu.addSection(createKeyHintsSection(hints));
  let menuShown = false;

  registerDebug('simStep', () => simStep);
  registerDebug('paused', () => pauseState.isPaused());
  registerDebug('pauseReason', () => pauseState.reason());

  const stats = {
    fps: 0,
    drawCalls: 0,
    triangles: 0,
    bodies: 0,
    sleeping: 0,
    peakBodies: 0,
    peakDrawCalls: 0,
  };
  registerDebug('hud', () => ({ visible: hud.visible(), ...stats }));
  registerDebug('quality', () => ({
    tier: quality.current(),
    source: quality.source(),
    dpr: ctx.renderer.getPixelRatio(),
    label: TIER_LABEL_VI[quality.current()],
  }));

  // A background tab must not keep simulating (T-01-08-03).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pauseState.pauseFor('hidden');
  });

  const world = ctx.physics.world;
  let sleepingCount = 0;
  const countSleeping = (b: { isSleeping(): boolean }): void => {
    if (b.isSleeping()) sleepingCount++;
  };

  function sampleHud(): void {
    stats.fps = fpsMeter.fps();
    stats.drawCalls = ctx.renderer.info.render.calls;
    stats.triangles = ctx.renderer.info.render.triangles;
    stats.bodies = world.bodies.len();
    sleepingCount = 0;
    world.bodies.forEach(countSleeping);
    stats.sleeping = sleepingCount;
    if (stats.bodies > stats.peakBodies) stats.peakBodies = stats.bodies;
    if (stats.drawCalls > stats.peakDrawCalls) stats.peakDrawCalls = stats.drawCalls;
    hud.sample({
      fps: stats.fps,
      drawCalls: stats.drawCalls,
      triangles: stats.triangles,
      bodies: stats.bodies,
      sleeping: stats.sleeping,
      peakBodies: stats.peakBodies,
      tierLabel: TIER_LABEL_VI[quality.current()],
      source: quality.source(),
      dpr: ctx.renderer.getPixelRatio(),
      rapierFlavor,
    });
  }

  let lastFrameMs = -1;
  let nextSampleMs = 0;

  ctx.renderer.setAnimationLoop((t: number) => {
    const workStart = performance.now();
    timer.update(t);
    const frameDt = timer.getDelta();

    if (consumePauseToggle(game.input)) pauseState.toggle();
    const paused = pauseState.isPaused();
    if (paused !== menuShown) {
      menuShown = paused;
      if (paused) menu.show();
      else menu.hide();
    }
    // An interact pressed while paused must not fire on resume.
    if (paused) game.input.interactQueued = false;

    // Hit-stop (plan 01-15) is timed on performance.now(), the clock performSlap triggers it with. A freeze runs 0 sim
    // steps while rendering and the camera shake carry on.
    const steps = stepper(frameDt, paused ? 0 : game.timeScale(performance.now()));
    for (let i = 0; i < steps; i++) {
      game.fixedUpdate(FIXED_DT);
      ctx.physics.step();
      simStep++;
      // A slap inside this step freezes the rest of the frame's catch-up steps too.
      if (game.timeScale(performance.now()) === 0) break;
    }
    game.frameUpdate(frameDt, performance.now());
    ctx.renderer.render(ctx.scene, ctx.camera);
    const workMs = performance.now() - workStart;

    fpsMeter.push(t);
    // Paused frames (menu, hidden tab, lost context) say nothing about gameplay cost, so auto-tier skips them.
    if (lastFrameMs >= 0 && !paused) quality.feedFrame(t, t - lastFrameMs, workMs);
    lastFrameMs = t;

    if (t >= nextSampleMs) {
      nextSampleMs = t + HUD_SAMPLE_MS;
      sampleHud();
    }
  });
}

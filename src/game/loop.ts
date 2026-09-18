import { Timer } from 'three';
import { registerDebug } from '../debug/testHook';
import { consumePauseToggle } from '../input/inputState';
import { createFpsMeter } from '../logic/benchStats';
import { makeStepper } from '../logic/fixedStep';
import { createPauseState, type PauseState } from '../logic/pauseState';
import { NPC_LABELS_STORAGE_KEY, parseNpcLabelsPref, serializeNpcLabelsPref } from '../logic/uiPrefs';
import { TIER_LABEL_VI } from '../logic/quality';
import { createDebugHud } from '../ui/debugHud';
import { createKeyHints, createKeyHintsSection } from '../ui/keyHints';
import { createRosterSection } from '../ui/rosterSection';
import { npcLabelsEnabled, setNpcLabelsEnabled } from '../ui/npcLabels';
import { createPauseMenu, createQualityControls } from '../ui/pauseMenu';
import { preloadCharacterLook } from '../render/characters';
import type { Game, GameCtx } from './game';
import { writeRoster } from './rosterStore';
import { createQualityManager } from './qualityManager';

const FIXED_DT = 1 / 60;
/** HUD / body counters refresh at 4 Hz (RESEARCH Pattern 7): counting sleeping bodies every frame is wasted work. */
const HUD_SAMPLE_MS = 250;

const pauseState = createPauseState();

/** The single pause state of the running game (D-20, CTRL-04). */
export function getPauseState(): PauseState {
  return pauseState;
}

/** Recorder hooks (plan 01-17 bench, 01-18 soak): rAF timestamp + measured CPU work of every rendered frame. */
const frameHooks = new Set<(ts: number, workMs: number) => void>();
/** Called once per fixed simulation step, before the game logic of that step, with the 0-based step index. */
const stepHooks = new Set<(step: number) => void>();

/** Subscribe to every rendered frame (paused frames included); returns an unsubscribe function. */
export function onFrame(cb: (ts: number, workMs: number) => void): () => void {
  frameHooks.add(cb);
  return () => frameHooks.delete(cb);
}

/** Subscribe to every fixed simulation step; returns an unsubscribe function. */
export function onStep(cb: (step: number) => void): () => void {
  stepHooks.add(cb);
  return () => stepHooks.delete(cb);
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

  // Read label preference (D-10) and apply on startup
  const readPref = (key: string): unknown => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const writePref = (key: string, value: string): boolean => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  };
  const storedLabelsValue = readPref(NPC_LABELS_STORAGE_KEY);
  const labelsEnabled = parseNpcLabelsPref(storedLabelsValue as string | null);
  setNpcLabelsEnabled(labelsEnabled);

  // NPC roster editor (D-03, D-04, D-10, plan 02-09): saved on this device, then applied in place.
  const rosterSection = createRosterSection({
    initial: game.roster().roster,
    onApply: (r) => {
      const saved = writeRoster(r);
      game.applyRoster(r, 'manual');
      return { saved };
    },
    onLookPreview: (letter) => preloadCharacterLook(letter),
    labelsEnabled: () => npcLabelsEnabled(),
    onLabelsToggle: (on) => {
      setNpcLabelsEnabled(on);
      return { saved: writePref(NPC_LABELS_STORAGE_KEY, serializeNpcLabelsPref(on)) };
    },
  });
  menu.addSection(rosterSection.el);
  const roster = rosterSection; // Capture for refresh on menu open
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
      if (paused) {
        roster.refresh(game.roster().roster);
        menu.show();
      }
      else menu.hide();
    }
    // An interact pressed while paused must not fire on resume.
    if (paused) game.input.interactQueued = false;

    // Hit-stop (plan 01-15) is timed on performance.now(), the clock performSlap triggers it with. A freeze runs 0 sim
    // steps while rendering and the camera shake carry on.
    const steps = stepper(frameDt, paused ? 0 : game.timeScale(performance.now()));
    for (let i = 0; i < steps; i++) {
      // Scripted input (bench autopilot, timeline actions) lands before the step reads it.
      for (const cb of stepHooks) cb(simStep);
      game.fixedUpdate(FIXED_DT);
      ctx.physics.step();
      simStep++;
      // A slap inside this step freezes the rest of the frame's catch-up steps too.
      if (game.timeScale(performance.now()) === 0) break;
    }
    game.frameUpdate(frameDt, performance.now());
    ctx.renderer.render(ctx.scene, ctx.camera);
    const workMs = performance.now() - workStart;
    for (const cb of frameHooks) cb(t, workMs);

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

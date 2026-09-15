import { Timer } from 'three';
import { registerDebug } from '../debug/testHook';
import { consumePauseToggle } from '../input/inputState';
import { makeStepper } from '../logic/fixedStep';
import { createPauseState, type PauseState } from '../logic/pauseState';
import { createPauseMenu } from '../ui/pauseMenu';
import type { Game, GameCtx } from './game';

const FIXED_DT = 1 / 60;

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

  // Resuming only happens through the menu or the toggle keys/button, never automatically.
  const menu = createPauseMenu(() => pauseState.resume());
  let menuShown = false;

  registerDebug('simStep', () => simStep);
  registerDebug('paused', () => pauseState.isPaused());
  registerDebug('pauseReason', () => pauseState.reason());

  // A background tab must not keep simulating (T-01-08-03).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pauseState.pauseFor('hidden');
  });

  ctx.renderer.setAnimationLoop((t: number) => {
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

    const steps = stepper(frameDt, paused ? 0 : game.timeScale(t));
    for (let i = 0; i < steps; i++) {
      game.fixedUpdate(FIXED_DT);
      ctx.physics.step();
      simStep++;
    }
    game.frameUpdate(frameDt, t);
    ctx.renderer.render(ctx.scene, ctx.camera);
  });
}

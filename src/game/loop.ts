import { Timer } from 'three';
import { registerDebug } from '../debug/testHook';
import { makeStepper } from '../logic/fixedStep';
import type { Game, GameCtx } from './game';

const FIXED_DT = 1 / 60;

/** Fixed-step sim + variable render (RESEARCH Pattern 3). */
export function startLoop(ctx: GameCtx, game: Game): void {
  const timer = new Timer();
  timer.connect(document); // Page Visibility: no giant delta after a hidden tab
  const stepper = makeStepper(1 / 60, 4);
  let simStep = 0;
  const paused = false; // pause UI arrives in a later plan

  registerDebug('simStep', () => simStep);
  registerDebug('paused', () => paused);

  ctx.renderer.setAnimationLoop((t: number) => {
    timer.update(t);
    const frameDt = timer.getDelta();
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

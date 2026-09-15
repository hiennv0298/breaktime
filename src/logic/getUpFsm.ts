/**
 * Slapstick get-up state machine (D-12, RESEARCH Pattern 14). Pure, no three.js / Rapier / DOM (TECH-06).
 *
 *   animated --slap--> ragdoll --(settled 0.6 s | 4 s timeout)--> recover --(0.45 s)--> animated
 *
 * The entity feeds the torso's linear and angular speed each fixed step; the machine only decides when to switch.
 * A Blocky character has no get-up clip (RESEARCH C5), so 'recover' is a procedural blend toward the idle pose driven
 * by recoverT (0 -> 1).
 */

export type GetUpMode = 'animated' | 'ragdoll' | 'recover';

export interface GetUpState {
  mode: GetUpMode;
  /** Continuous time the torso has been calm (ragdoll only). */
  settleSec: number;
  /** Time spent as a ragdoll. */
  ragdollSec: number;
  /** Time spent blending upright. */
  recoverSec: number;
}

export type GetUpEvent = 'none' | 'start-recover' | 'resumed';

/** Torso slower than this (m/s) counts as calm. */
export const SETTLE_SPEED = 0.35;
/** Torso spinning slower than this (rad/s) counts as calm. */
export const SETTLE_ANG = 1.0;
/** Calm for this long (s) starts the get-up. */
export const SETTLE_HOLD_SEC = 0.6;
/** A ragdoll that never settles gets up after this long (s); also bounds runaway physics (T-01-15-03). */
export const RAGDOLL_TIMEOUT_SEC = 4.0;
/** Duration (s) of the blend from the lying pose to upright idle. */
export const RECOVER_SEC = 0.45;

/** Absorbs floating-point residue when fixed steps of 1/60 s add up to a threshold. */
const EPS = 1e-6;

export function createGetUp(): GetUpState {
  return { mode: 'animated', settleSec: 0, ragdollSec: 0, recoverSec: 0 };
}

/** animated | recover -> ragdoll with fresh timers; a ragdoll stays as it is (a second slap does not extend it). */
export function slapGetUp(s: GetUpState): GetUpState {
  if (s.mode === 'ragdoll') return { ...s };
  return { mode: 'ragdoll', settleSec: 0, ragdollSec: 0, recoverSec: 0 };
}

export function updateGetUp(
  s: GetUpState,
  input: { torsoSpeed: number; torsoAngSpeed: number; dt: number },
): { state: GetUpState; event: GetUpEvent; recoverT: number } {
  const dt = Number.isFinite(input.dt) && input.dt > 0 ? input.dt : 0;
  const next: GetUpState = { ...s };

  if (s.mode === 'ragdoll') {
    next.ragdollSec += dt;
    const calm =
      Number.isFinite(input.torsoSpeed) &&
      Number.isFinite(input.torsoAngSpeed) &&
      input.torsoSpeed < SETTLE_SPEED &&
      input.torsoAngSpeed < SETTLE_ANG;
    next.settleSec = calm ? next.settleSec + dt : 0;
    if (
      (calm && dt > 0 && next.settleSec >= SETTLE_HOLD_SEC - EPS) ||
      (dt > 0 && next.ragdollSec >= RAGDOLL_TIMEOUT_SEC - EPS)
    ) {
      next.mode = 'recover';
      next.recoverSec = 0;
      return { state: next, event: 'start-recover', recoverT: 0 };
    }
    return { state: next, event: 'none', recoverT: 0 };
  }

  if (s.mode === 'recover') {
    next.recoverSec += dt;
    if (next.recoverSec >= RECOVER_SEC - EPS) {
      next.mode = 'animated';
      next.settleSec = 0;
      next.ragdollSec = 0;
      next.recoverSec = 0;
      return { state: next, event: 'resumed', recoverT: 1 };
    }
    return { state: next, event: 'none', recoverT: Math.min(1, next.recoverSec / RECOVER_SEC) };
  }

  return { state: next, event: 'none', recoverT: 0 };
}

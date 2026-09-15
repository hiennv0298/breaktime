/**
 * Player knockdown timers (D-06, D-09, RESEARCH Pattern 8 / Pitfall 9). Pure: no three.js / Rapier / DOM (D-12).
 *
 *   free --hit--> ragdoll --(settled 0.6 s | 2.5 s timeout | lock cap)--> recover --(0.45 s)--> invulnerable --(1.5 s)--> free
 *
 * No HP, no game over, knockdowns only (D-06, D-09 "không HP", PEGI 12). The ragdoll/recover part reuses getUpFsm with
 * a shorter timeout than NPCs; a hard cap keeps the input lock at PLAYER_LOCK_MAX_SEC even if the torso never calms
 * (T-02-02-01). Hits are accepted only while 'free' (T-02-02-02). While inputLocked the caller ignores movement and
 * drops any queued action (Pitfall 9); pause keeps working.
 */

import {
  createGetUp,
  RECOVER_SEC,
  slapGetUp,
  updateGetUp,
  type GetUpState,
} from './getUpFsm';

/** Player ragdoll timeout (s), shorter than the NPC 4.0 s. */
export const PLAYER_RAGDOLL_TIMEOUT_SEC = 2.5;
/** Upper bound (s) of the input lock: ragdoll plus recover. */
export const PLAYER_LOCK_MAX_SEC = 3.0;
/** Invulnerability (s) after standing up. */
export const PLAYER_INVULN_SEC = 1.5;
/** Player knock impulse = this x the NPC slap constants (applied by plan 02-11). */
export const PLAYER_KNOCK_SCALE = 0.5;

export type StunMode = 'free' | 'ragdoll' | 'recover' | 'invulnerable';

export interface PlayerStunState {
  mode: StunMode;
  getUp: GetUpState;
  /** Time (s) input has been locked in the current knockdown (ragdoll + recover). */
  lockSec: number;
  /** Invulnerability left (s). */
  invulnLeft: number;
  /** Accepted hits so far (a statistic, not damage). */
  hitsTaken: number;
  knockdowns: number;
}

export type StunEvent = 'none' | 'start-recover' | 'stood-up' | 'vulnerable';

/** Absorbs floating-point residue when fixed steps of 1/60 s add up to a threshold. */
const EPS = 1e-6;

function copy(s: PlayerStunState): PlayerStunState {
  return { ...s, getUp: { ...s.getUp } };
}

export function createPlayerStun(): PlayerStunState {
  return { mode: 'free', getUp: createGetUp(), lockSec: 0, invulnLeft: 0, hitsTaken: 0, knockdowns: 0 };
}

export function canBeHit(s: PlayerStunState): boolean {
  return s.mode === 'free';
}

export function inputLocked(s: PlayerStunState): boolean {
  return s.mode === 'ragdoll' || s.mode === 'recover';
}

/** A strike that landed: knocks a free player down; during ragdoll, recover or invulnerability it does not count. */
export function hitPlayer(s: PlayerStunState): { state: PlayerStunState; accepted: boolean } {
  if (!canBeHit(s)) return { state: copy(s), accepted: false };
  return {
    state: {
      mode: 'ragdoll',
      getUp: slapGetUp(createGetUp()),
      lockSec: 0,
      invulnLeft: 0,
      hitsTaken: s.hitsTaken + 1,
      knockdowns: s.knockdowns + 1,
    },
    accepted: true,
  };
}

function currentRecoverT(s: PlayerStunState): number {
  if (s.mode !== 'recover') return 0;
  const t = s.getUp.recoverSec / RECOVER_SEC;
  return Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
}

export function stepPlayerStun(
  s: PlayerStunState,
  input: { torsoSpeed: number; torsoAngSpeed: number; dt: number },
): { state: PlayerStunState; event: StunEvent; recoverT: number } {
  const dt = Number.isFinite(input.dt) && input.dt > 0 ? input.dt : 0;
  if (dt === 0 || s.mode === 'free') return { state: copy(s), event: 'none', recoverT: currentRecoverT(s) };

  const next = copy(s);

  if (s.mode === 'ragdoll') {
    next.lockSec += dt;
    const r = updateGetUp(s.getUp, input, { timeoutSec: PLAYER_RAGDOLL_TIMEOUT_SEC });
    next.getUp = r.state;
    if (r.event === 'start-recover') {
      next.mode = 'recover';
      return { state: next, event: 'start-recover', recoverT: 0 };
    }
    if (next.lockSec >= PLAYER_LOCK_MAX_SEC - RECOVER_SEC - EPS) {
      next.getUp = { ...r.state, mode: 'recover', settleSec: 0, recoverSec: 0 };
      next.mode = 'recover';
      return { state: next, event: 'start-recover', recoverT: 0 };
    }
    return { state: next, event: 'none', recoverT: 0 };
  }

  if (s.mode === 'recover') {
    next.lockSec += dt;
    const r = updateGetUp(s.getUp, input, { timeoutSec: PLAYER_RAGDOLL_TIMEOUT_SEC });
    next.getUp = r.state;
    if (r.event === 'resumed') {
      next.mode = 'invulnerable';
      next.invulnLeft = PLAYER_INVULN_SEC;
      return { state: next, event: 'stood-up', recoverT: 1 };
    }
    return { state: next, event: 'none', recoverT: r.recoverT };
  }

  // invulnerable
  next.invulnLeft -= dt;
  if (next.invulnLeft <= EPS) {
    next.invulnLeft = 0;
    next.lockSec = 0;
    next.mode = 'free';
    return { state: next, event: 'vulnerable', recoverT: 0 };
  }
  return { state: next, event: 'none', recoverT: 0 };
}

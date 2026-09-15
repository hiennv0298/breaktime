/**
 * Per-NPC combat state machine (D-05 act after get-up, D-07 fume without token, D-08 telegraphed strike, G9 give-up).
 * Pure: no three.js / Rapier / DOM, no clock (D-12, TECH-06). Timers advance only by the input dt (sim time), so a
 * hit-stop or pause that runs no sim steps freezes combat automatically (RESEARCH Pitfall 8).
 *
 *   any --(physics ragdoll | recover)--> down            (windup -> down emits 'interrupted': counter-slap cancels)
 *   down --(animated, angry)--> fume     down --(animated, calm-ish)--> routine ('resume')
 *   routine --(angry)--> fume
 *   fume --(reaction delay done + pursue token)--> pursue          fume --(calm)--> return ('give-up')
 *   pursue --(edge <= 1.0 m, targetable, strike token)--> windup   pursue --(token lost)--> fume
 *   pursue --(8 s total pursuit | > 9 m for 1.0 s | stuck x2 | calm)--> return ('give-up')
 *   windup --(0.6 s)--> cooldown ('strike')
 *   cooldown --(1.5 s)--> return if the strike landed or calm, pursue with token, else fume
 *   return --(route point within 0.5 m)--> routine ('resume')
 *
 * The FSM knows only distances (dist = player body edge, routeDist = route point); movement vectors, anger, tokens
 * and the strike hit test belong to the director (combatDirector.ts). Transition steps do not spend dt in the new
 * state: the first countdown step is the step after the transition.
 *
 * G9 "xa quá ~9 m" is read as "farther than 9 m for GIVE_UP_DIST_HOLD_SEC": an NPC slapped from farther than 9 m
 * still comes after the player instead of quitting on its first pursue step (discretion within G9).
 */

import { ATTACK_START_DIST } from './strikeHit';

/** Telegraph (s) between the wind-up start and the impact frame. */
export const WINDUP_SEC = 0.6;
/** Pause (s) after a strike, hit or miss. */
export const COOLDOWN_SEC = 1.5;
/** Chase speed (m/s), slower than the player's 3.2 m/s. */
export const CHASE_SPEED = 2.2;
/** Walk back to the route (m/s), same as the waypoint walker. */
export const RETURN_SPEED = 1.4;
/** Perpendicular unstick speed (m/s). */
export const SIDESTEP_SPEED = 1.6;
/** Total pursuit time (s) in one grudge before giving up. */
export const GIVE_UP_CHASE_SEC = 8;
/** Edge distance (m) that counts as too far. */
export const GIVE_UP_DIST = 9;
/** The player must stay farther than GIVE_UP_DIST this long (s) before the NPC gives up. */
export const GIVE_UP_DIST_HOLD_SEC = 1.0;
/** Progress check window (s) while pursuing out of reach. */
export const STUCK_WINDOW_SEC = 1.0;
/** Closing distance (m) per window below which the NPC counts as stuck. */
export const STUCK_MIN_PROGRESS = 0.3;
/** Sidestep duration (s) after a stuck window. */
export const SIDESTEP_SEC = 0.5;
/** Stuck windows in one grudge that make the NPC give up. */
export const MAX_STUCK = 2;
/** Route point distance (m) at which the waypoint walker takes over again. */
export const RETURN_ARRIVE = 0.5;

export type CombatState = 'routine' | 'down' | 'fume' | 'pursue' | 'windup' | 'cooldown' | 'return';
export type CombatMove = 'walker' | 'hold' | 'pursue' | 'sidestep' | 'return';
export type CombatFsmEvent =
  | 'none'
  | 'down'
  | 'interrupted'
  | 'fume'
  | 'pursue'
  | 'windup'
  | 'strike'
  | 'give-up'
  | 'resume';

export interface CombatFsmState {
  state: CombatState;
  /** Reaction delay left (s) before a fuming NPC wants to pursue. */
  reactLeft: number;
  /** Pursuit time (s) in this grudge (only counted in 'pursue'). */
  chaseSec: number;
  /** Continuous time (s) the player has been farther than GIVE_UP_DIST while pursuing. */
  farSec: number;
  /** Elapsed time (s) in the current stuck window. */
  windowSec: number;
  /** Edge distance at the start of the current stuck window. */
  windowStartDist: number;
  /** Stuck windows in this grudge. */
  stuck: number;
  /** Sidestep time left (s). */
  sidestepLeft: number;
  /** +1 = left-hand side of the direction to the player, -1 = right. */
  sidestepSign: 1 | -1;
  windupLeft: number;
  cooldownLeft: number;
  /** The last strike landed (set by applyStrikeResult). */
  grudgeSatisfied: boolean;
}

export interface CombatInput {
  dt: number;
  physics: 'animated' | 'ragdoll' | 'recover';
  /** Anger at or above the threshold. */
  angry: boolean;
  /** Anger below the calm line. */
  calm: boolean;
  /** Edge distance (m) from the NPC centre to the player body. */
  dist: number;
  /** false while the player is knocked down or invulnerable. */
  playerTargetable: boolean;
  hasPursueToken: boolean;
  hasStrikeToken: boolean;
  /** Distance (m) to the route point to return to. */
  routeDist: number;
  /** Seeded reaction delay used only when this step enters 'fume' from routine / down. */
  reactSec: number;
}

export interface CombatFsmStep {
  state: CombatFsmState;
  event: CombatFsmEvent;
  wantsPursue: boolean;
  wantsStrike: boolean;
  move: CombatMove;
}

/** Absorbs floating-point residue when fixed steps of 1/60 s add up to a threshold. */
const EPS = 1e-6;

export function createCombatFsm(): CombatFsmState {
  return {
    state: 'routine',
    reactLeft: 0,
    chaseSec: 0,
    farSec: 0,
    windowSec: 0,
    windowStartDist: 0,
    stuck: 0,
    sidestepLeft: 0,
    sidestepSign: 1,
    windupLeft: 0,
    cooldownLeft: 0,
    grudgeSatisfied: false,
  };
}

function fresh(state: CombatState): CombatFsmState {
  return { ...createCombatFsm(), state };
}

function result(
  state: CombatFsmState,
  event: CombatFsmEvent,
  wantsPursue: boolean,
  wantsStrike: boolean,
  move: CombatMove,
): CombatFsmStep {
  return { state, event, wantsPursue, wantsStrike, move };
}

function giveUp(): CombatFsmStep {
  return result(fresh('return'), 'give-up', false, false, 'return');
}

function enterPursue(s: CombatFsmState, dist: number): CombatFsmStep {
  const next: CombatFsmState = {
    ...s,
    state: 'pursue',
    reactLeft: 0,
    windowSec: 0,
    windowStartDist: dist,
    stuck: 0,
    sidestepLeft: 0,
    windupLeft: 0,
    cooldownLeft: 0,
  };
  return result(next, 'pursue', true, false, 'pursue');
}

function enterFume(s: CombatFsmState, reactLeft: number): CombatFsmStep {
  const r = Number.isFinite(reactLeft) && reactLeft > 0 ? reactLeft : 0;
  const next: CombatFsmState = { ...s, state: 'fume', reactLeft: r, sidestepLeft: 0, windupLeft: 0, cooldownLeft: 0 };
  return result(next, 'fume', r <= EPS, false, 'hold');
}

export function stepCombatFsm(s: CombatFsmState, i: CombatInput): CombatFsmStep {
  const dt = Number.isFinite(i.dt) && i.dt > 0 ? i.dt : 0;
  const dist = Number.isNaN(i.dist) ? Infinity : i.dist;
  const routeDist = Number.isNaN(i.routeDist) ? Infinity : i.routeDist;

  // Physics layer wins: a ragdoll or recovering NPC does nothing combat-related (D-05).
  if (i.physics !== 'animated') {
    const event: CombatFsmEvent = s.state === 'windup' ? 'interrupted' : s.state === 'down' ? 'none' : 'down';
    return result(fresh('down'), event, false, false, 'walker');
  }

  switch (s.state) {
    case 'down':
      if (i.angry) return enterFume(fresh('fume'), i.reactSec);
      return result(fresh('routine'), 'resume', false, false, 'walker');

    case 'routine':
      if (i.angry) return enterFume(fresh('fume'), i.reactSec);
      return result({ ...s }, 'none', false, false, 'walker');

    case 'fume': {
      if (i.calm) return giveUp();
      const reactLeft = Math.max(0, s.reactLeft - dt);
      const next: CombatFsmState = { ...s, reactLeft };
      if (reactLeft > EPS) return result(next, 'none', false, false, 'hold');
      if (i.hasPursueToken) return enterPursue(next, dist);
      return result(next, 'none', true, false, 'hold');
    }

    case 'pursue': {
      if (i.calm) return giveUp();
      if (!i.hasPursueToken) return enterFume(s, 0);
      const chaseSec = s.chaseSec + dt;
      if (chaseSec >= GIVE_UP_CHASE_SEC - EPS) return giveUp();
      const farSec = dist > GIVE_UP_DIST ? s.farSec + dt : 0;
      if (dist > GIVE_UP_DIST && dt > 0 && farSec >= GIVE_UP_DIST_HOLD_SEC - EPS) return giveUp();
      const next: CombatFsmState = { ...s, chaseSec, farSec };

      if (dist <= ATTACK_START_DIST + EPS) {
        // In reach: never counts as stuck; wait for the strike token (or for the player to become targetable).
        next.windowSec = 0;
        next.windowStartDist = dist;
        next.sidestepLeft = 0;
        if (!i.playerTargetable) return result(next, 'none', true, false, 'hold');
        if (i.hasStrikeToken) {
          next.state = 'windup';
          next.windupLeft = WINDUP_SEC;
          return result(next, 'windup', true, true, 'hold');
        }
        return result(next, 'none', true, true, 'hold');
      }

      if (s.sidestepLeft > 0) {
        next.sidestepLeft = Math.max(0, s.sidestepLeft - dt);
        if (next.sidestepLeft > EPS) return result(next, 'none', true, false, 'sidestep');
        // Sidestep over: restart the progress window from here.
        next.sidestepLeft = 0;
        next.windowSec = 0;
        next.windowStartDist = dist;
        return result(next, 'none', true, false, 'pursue');
      }

      next.windowSec = s.windowSec + dt;
      if (dt > 0 && next.windowSec >= STUCK_WINDOW_SEC - EPS) {
        const progress = s.windowStartDist - dist;
        next.windowSec = 0;
        next.windowStartDist = dist;
        if (progress < STUCK_MIN_PROGRESS) {
          const stuck = s.stuck + 1;
          if (stuck >= MAX_STUCK) return giveUp();
          next.stuck = stuck;
          next.sidestepLeft = SIDESTEP_SEC;
          next.sidestepSign = stuck % 2 === 1 ? 1 : -1;
          return result(next, 'none', true, false, 'sidestep');
        }
      }
      return result(next, 'none', true, false, 'pursue');
    }

    case 'windup': {
      const windupLeft = Math.max(0, s.windupLeft - dt);
      if (dt > 0 && windupLeft <= EPS) {
        const next: CombatFsmState = { ...s, state: 'cooldown', windupLeft: 0, cooldownLeft: COOLDOWN_SEC };
        return result(next, 'strike', true, false, 'hold');
      }
      return result({ ...s, windupLeft }, 'none', true, true, 'hold');
    }

    case 'cooldown': {
      const cooldownLeft = Math.max(0, s.cooldownLeft - dt);
      if (dt > 0 && cooldownLeft <= EPS) {
        if (s.grudgeSatisfied || i.calm) return giveUp();
        const next: CombatFsmState = { ...s, cooldownLeft: 0 };
        if (i.hasPursueToken) return enterPursue(next, dist);
        return enterFume(next, 0);
      }
      return result({ ...s, cooldownLeft }, 'none', true, false, 'hold');
    }

    case 'return':
      if (routeDist <= RETURN_ARRIVE + EPS) return result(fresh('routine'), 'resume', false, false, 'walker');
      return result({ ...s }, 'none', false, false, 'return');
  }
}

/** Records the impact-frame hit test: a landed strike satisfies the grudge (return after the cooldown). */
export function applyStrikeResult(s: CombatFsmState, landed: boolean): CombatFsmState {
  return { ...s, grudgeSatisfied: landed };
}

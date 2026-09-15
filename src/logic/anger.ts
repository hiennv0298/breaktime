/**
 * Seeded anger meter (D-05: giận theo tính khí, nguội dần, rng có seed; NPC-06). Pure, no three.js / Rapier / DOM,
 * no clock: callers pass the fixed sim dt and an injected rng (D-12, RESEARCH Pattern 9, Pitfalls 7 and 8).
 *
 * Anger is its own 0..100 number per NPC, separate from Phase 3 suspicion and Phase 6 relationship (RESEARCH
 * Pattern 1 rule). NPCs only get angry from being slapped themselves, never from witnessing (out of scope).
 *
 * Per-slap anger (hot 100 / normal 60 / calm 42) plus an integer jitter 0..5 reaches the threshold after exactly
 * 1 / 2 / 3 slaps: normal peaks at 65 after one slap, calm at 94 after two, so jitter never makes an NPC angry early;
 * the margins (normal 20, calm 26) absorb up to 2.5 s of decay between slaps.
 *
 * The decay clock is paused while the NPC is down: the combat director (plan 02-05) passes
 * holdDecay = physics !== 'animated'. A slapped NPC can only be slapped again after its ragdoll + get-up (up to
 * 4.45 s), so without the pause a normal ~6 s gap would turn 2 slaps into 3 (plan-checker W1).
 */

import type { Temper } from './temper';

export const ANGER_MAX = 100;
export const ANGER_THRESHOLD = 100;
/** Anger added by one slap, before jitter. */
export const SLAP_ANGER: Readonly<Record<Temper, number>> = Object.freeze({ hot: 100, normal: 60, calm: 42 });
/** Integer jitter 0..SLAP_JITTER_MAX added per slap (seeded). */
export const SLAP_JITTER_MAX = 5;
/** Standing time (s) after a slap before anger starts to cool. */
export const DECAY_DELAY_SEC = 6;
/** Anger lost per standing second once the delay has passed. */
export const DECAY_PER_SEC = 8;
/** Below this the NPC counts as calm again. */
export const CALM_BELOW = 40;
/** Seeded pause (s) between standing up angry and starting to act. */
export const REACT_MIN_SEC = 0.2;
export const REACT_MAX_SEC = 0.5;

export interface AngerState {
  /** 0..ANGER_MAX. */
  value: number;
  /** Standing time since the last slap (paused while holdDecay). */
  sinceSlapSec: number;
  /** Slaps received. */
  slaps: number;
}

export function createAnger(): AngerState {
  return { value: 0, sinceSlapSec: 0, slaps: 0 };
}

/** Adds one slap's anger. With jitter on (default) draws exactly one rng number; with { jitter: false } none. */
export function onSlapped(
  s: AngerState,
  temper: Temper,
  rng: () => number,
  opts?: { jitter?: boolean },
): AngerState {
  let jitter = 0;
  if (opts?.jitter !== false) {
    const raw = Math.floor(rng() * (SLAP_JITTER_MAX + 1));
    jitter = Number.isFinite(raw) ? Math.min(SLAP_JITTER_MAX, Math.max(0, raw)) : 0;
  }
  const base = Number.isFinite(s.value) ? s.value : 0;
  return {
    value: Math.min(ANGER_MAX, Math.max(0, base + SLAP_ANGER[temper] + jitter)),
    sinceSlapSec: 0,
    slaps: s.slaps + 1,
  };
}

/**
 * Advances the decay clock by dt. holdDecay true (NPC ragdoll / recovering) changes nothing. Only the part of dt
 * beyond DECAY_DELAY_SEC cools the anger, at DECAY_PER_SEC, clamped at 0.
 */
export function tickAnger(s: AngerState, dt: number, opts?: { holdDecay?: boolean }): AngerState {
  if (!Number.isFinite(dt) || dt <= 0 || opts?.holdDecay === true) return { ...s };
  const prev = s.sinceSlapSec;
  const next = prev + dt;
  const decaySec = Math.max(0, next - Math.max(prev, DECAY_DELAY_SEC));
  const value = decaySec > 0 ? Math.max(0, s.value - DECAY_PER_SEC * decaySec) : s.value;
  return { value, sinceSlapSec: next, slaps: s.slaps };
}

export function isAngry(s: AngerState): boolean {
  return s.value >= ANGER_THRESHOLD;
}

export function isCalm(s: AngerState): boolean {
  return s.value < CALM_BELOW;
}

/** Grudge settled (e.g. after one landed strike): value 0, clock and slap count kept. */
export function satisfyAnger(s: AngerState): AngerState {
  return { value: 0, sinceSlapSec: s.sinceSlapSec, slaps: s.slaps };
}

/** Seeded reaction delay in [REACT_MIN_SEC, REACT_MAX_SEC). */
export function reactionDelaySec(rng: () => number): number {
  return REACT_MIN_SEC + rng() * (REACT_MAX_SEC - REACT_MIN_SEC);
}

/** `?fight=always` test flag: only the exact literal 'always' is accepted (T-02-01-01). */
export function fightFromQuery(search: string): 'always' | null {
  return new URLSearchParams(search).get('fight') === 'always' ? 'always' : null;
}

/** `?fight=always` forces hot temper; callers also pass { jitter: false } to onSlapped. */
export function effectiveTemper(t: Temper, fight: 'always' | null): Temper {
  return fight === 'always' ? 'hot' : t;
}

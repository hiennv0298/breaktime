/**
 * Benchmark scenario (D-08, D-11 revised, D-29; RESEARCH Pattern 3 + Pattern 7). Pure data, no DOM, no three.js,
 * Vitest-covered (TECH-06). Every event is keyed to a simulation-step index, so a run with the same parameters replays
 * the same events regardless of frame rate, and a shorter &dur= scales every phase by the same fraction.
 *
 *   0-55 %   roam: walk to a shuffled waypoint, slap the nearest coworker, repeat (at least 3 slaps)
 *   60 %     every active NPC is slapped in the same step (mass ragdoll, 10 NPCs in the bench)
 *   75 %     every dynamic prop is smashed
 *   76-99 %  walk on over the rest of the shuffled waypoints
 *   100 %    end (results screen)
 */
import { mulberry32 } from './rng';

export type BenchAction =
  | { step: number; kind: 'walkTo'; x: number; z: number }
  | { step: number; kind: 'slapNearest' }
  | { step: number; kind: 'massRagdoll' }
  | { step: number; kind: 'smash' }
  | { step: number; kind: 'end' };

export interface BenchTimelineOptions {
  durationSec: number;
  /** Fixed simulation steps per second (loop.ts runs 60). */
  stepHz?: number;
  seed: number;
  waypoints: { x: number; z: number }[];
}

/** Fractions of the run (D-08 schedule above). */
export const ROAM_END = 0.55;
export const MASS_RAGDOLL_AT = 0.6;
export const SMASH_AT = 0.75;
export const WALK_ON_START = 0.76;
export const WALK_ON_END = 0.99;
/** One walk + slap segment per this many seconds of roam time, never fewer than MIN_SLAPS segments. */
const SEGMENT_SEC = 5;
const MIN_SLAPS = 3;
/** Position of the slap inside its segment: halfway, after the walk had time to close in. */
const SLAP_IN_SEGMENT = 0.5;

export const BENCH_DEFAULT_SEC = 60;
export const BENCH_MIN_SEC = 5;
export const BENCH_MAX_SEC = 60;

/**
 * &dur= (T-01-17-01): a plain decimal integer clamped to 5..60 s; anything else (absent, empty, "8.5", "1e3", "abc",
 * signs other than a leading minus) gives the 60 s default.
 */
export function parseBenchDuration(raw: string | null | undefined): number {
  if (typeof raw !== 'string' || !/^-?\d{1,6}$/.test(raw.trim())) return BENCH_DEFAULT_SEC;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n)) return BENCH_DEFAULT_SEC;
  return Math.max(BENCH_MIN_SEC, Math.min(BENCH_MAX_SEC, n));
}

/** Only the literal value '1' turns the benchmark on. */
export function benchFromQuery(search: string): boolean {
  return new URLSearchParams(search).get('bench') === '1';
}

/** Fisher-Yates on a copy, driven by the seeded generator. */
function shuffled<T>(list: readonly T[], rng: () => number): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

export function buildTimeline(opts: BenchTimelineOptions): BenchAction[] {
  const { durationSec, seed } = opts;
  const stepHz = opts.stepHz ?? 60;
  if (!Number.isFinite(durationSec) || durationSec <= 0) throw new RangeError('durationSec must be a positive number');
  if (!Number.isFinite(stepHz) || stepHz <= 0) throw new RangeError('stepHz must be a positive number');

  const total = Math.max(1, Math.round(durationSec * stepHz));
  const stepAt = (fraction: number): number => Math.round(fraction * total);
  const rng = mulberry32(seed);
  const route = shuffled(
    opts.waypoints.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z)).map((p) => ({ x: p.x, z: p.z })),
    rng,
  );
  const actions: BenchAction[] = [];
  const walkTo = (step: number, i: number): void => {
    if (route.length === 0) return;
    const p = route[i % route.length];
    actions.push({ step, kind: 'walkTo', x: p.x, z: p.z });
  };

  // Roam: evenly spaced walk + slap segments.
  const segments = Math.max(MIN_SLAPS, Math.round((durationSec * ROAM_END) / SEGMENT_SEC));
  for (let i = 0; i < segments; i++) {
    walkTo(stepAt((ROAM_END * i) / segments), i);
    actions.push({ step: stepAt((ROAM_END * (i + SLAP_IN_SEGMENT)) / segments), kind: 'slapNearest' });
  }

  actions.push({ step: stepAt(MASS_RAGDOLL_AT), kind: 'massRagdoll' });
  actions.push({ step: stepAt(SMASH_AT), kind: 'smash' });

  // Walk on over the waypoints the roam did not reach yet.
  const walkOn = Math.max(1, Math.round((durationSec * (WALK_ON_END - WALK_ON_START)) / SEGMENT_SEC));
  for (let j = 0; j < walkOn; j++) {
    walkTo(stepAt(WALK_ON_START + ((WALK_ON_END - WALK_ON_START) * j) / walkOn), segments + j);
  }

  actions.push({ step: total, kind: 'end' });
  // Stable sort: actions pushed for the same step keep their order.
  return actions.sort((a, b) => a.step - b.step);
}

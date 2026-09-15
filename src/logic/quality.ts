/** Pure quality tiers and the auto-tier policy (D-21, RESEARCH Pattern 7 / Pitfall 3). No DOM, no three. */
import { looksThrottled, median } from './benchStats';

export type Tier = 'low' | 'med' | 'high';

export interface TierSettings {
  /** Upper bound for renderer.setPixelRatio. */
  dprCap: number;
  /** Maximum live debris pieces (plan 01-16 reads it). */
  debrisCap: number;
  /** Camera far plane in metres. */
  far: number;
}

export const TIERS: Readonly<Record<Tier, Readonly<TierSettings>>> = Object.freeze({
  high: Object.freeze({ dprCap: 2, debrisCap: 60, far: 40 }),
  med: Object.freeze({ dprCap: 1.5, debrisCap: 40, far: 30 }),
  low: Object.freeze({ dprCap: 1, debrisCap: 20, far: 22 }),
});

export const TIER_LABEL_VI: Readonly<Record<Tier, string>> = Object.freeze({ low: 'Thấp', med: 'Vừa', high: 'Cao' });

const RANK: Record<Tier, number> = { low: 0, med: 1, high: 2 };

/** Next tier from the median frame time of a sample window. Never returns a higher tier than `current`. */
export function pickTier(p50FrameMs: number, throttled: boolean, current: Tier): Tier {
  if (throttled) return current; // never downgrade because of a 30 fps cap
  if (!(p50FrameMs > 20)) return current; // >= 50 fps (or NaN): keep
  if (p50FrameMs <= 30) return current === 'high' ? 'med' : current;
  return 'low';
}

/** Whitelist for ?q= and stored values (T-01-11-01): exactly 'low' | 'med' | 'high', case-sensitive. */
export function parseTierParam(v: string | null): Tier | null {
  return v === 'low' || v === 'med' || v === 'high' ? v : null;
}

export interface AutoTierPolicy {
  feed(nowMs: number, intervalMs: number, workMs: number): { tier: Tier; changed: boolean };
  tier(): Tier;
  downgrades(): number;
}

/** A window with fewer frames than this (e.g. one giant gap after a pause) is discarded instead of judged. */
const MIN_WINDOW_FRAMES = 8;

/**
 * Auto-tier protocol (D-21): ignore the first `ignoreMs` (1000) after `startMs`, judge each `sampleMs` (3000) window by
 * its median frame interval with the throttle guard, allow at most `maxDowngrades` (2) and never upgrade.
 */
export function createAutoTierPolicy(opts: {
  start: Tier;
  startMs: number;
  ignoreMs?: number;
  sampleMs?: number;
  maxDowngrades?: number;
}): AutoTierPolicy {
  const ignoreMs = opts.ignoreMs ?? 1000;
  const sampleMs = opts.sampleMs ?? 3000;
  const maxDowngrades = opts.maxDowngrades ?? 2;
  let tier: Tier = opts.start;
  let downgrades = 0;
  let windowStart = opts.startMs + ignoreMs;
  const intervals: number[] = [];
  const works: number[] = [];

  return {
    feed(nowMs, intervalMs, workMs) {
      if (!(nowMs >= opts.startMs + ignoreMs) || downgrades >= maxDowngrades || tier === 'low') {
        return { tier, changed: false };
      }
      if (Number.isFinite(intervalMs) && Number.isFinite(workMs) && intervalMs >= 0 && workMs >= 0) {
        intervals.push(intervalMs);
        works.push(workMs);
      }
      if (nowMs - windowStart < sampleMs) return { tier, changed: false };

      let changed = false;
      if (intervals.length >= MIN_WINDOW_FRAMES) {
        const next = pickTier(median(intervals), looksThrottled(intervals, works), tier);
        if (RANK[next] < RANK[tier]) {
          tier = next;
          downgrades++;
          changed = true;
        }
      }
      intervals.length = 0;
      works.length = 0;
      windowStart = nowMs;
      return { tier, changed };
    },
    tier: () => tier,
    downgrades: () => downgrades,
  };
}

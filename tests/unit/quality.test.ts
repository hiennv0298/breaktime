import { describe, expect, it } from 'vitest';
import {
  TIERS,
  TIER_LABEL_VI,
  createAutoTierPolicy,
  parseTierParam,
  pickTier,
  type AutoTierPolicy,
} from '../../src/logic/quality';

/** Feed one frame every `intervalMs` from `fromMs` (exclusive) until `toMs` (inclusive); returns how many feeds said changed. */
function feedRange(p: AutoTierPolicy, fromMs: number, toMs: number, intervalMs: number, workMs: number): number {
  let changes = 0;
  for (let t = fromMs + intervalMs; t <= toMs + 1e-6; t += intervalMs) {
    if (p.feed(t, intervalMs, workMs).changed) changes++;
  }
  return changes;
}

describe('TIERS (D-21)', () => {
  it('pins DPR cap, debris cap and far distance per tier', () => {
    expect(TIERS.high).toEqual({ dprCap: 2, debrisCap: 60, far: 40 });
    expect(TIERS.med).toEqual({ dprCap: 1.5, debrisCap: 40, far: 30 });
    expect(TIERS.low).toEqual({ dprCap: 1, debrisCap: 20, far: 22 });
  });

  it('labels tiers in Vietnamese', () => {
    expect(TIER_LABEL_VI).toEqual({ low: 'Thấp', med: 'Vừa', high: 'Cao' });
  });
});

describe('pickTier', () => {
  it('keeps the current tier when throttled, even at 40 ms', () => {
    expect(pickTier(40, true, 'high')).toBe('high');
    expect(pickTier(40, true, 'med')).toBe('med');
  });

  it('keeps high at 16 ms', () => {
    expect(pickTier(16, false, 'high')).toBe('high');
  });

  it('drops high to med at 25 ms and keeps med at med', () => {
    expect(pickTier(25, false, 'high')).toBe('med');
    expect(pickTier(25, false, 'med')).toBe('med');
    expect(pickTier(25, false, 'low')).toBe('low');
  });

  it('drops to low at 40 ms', () => {
    expect(pickTier(40, false, 'high')).toBe('low');
    expect(pickTier(40, false, 'med')).toBe('low');
  });
});

describe('parseTierParam', () => {
  it('accepts exactly low, med and high', () => {
    expect(parseTierParam('low')).toBe('low');
    expect(parseTierParam('med')).toBe('med');
    expect(parseTierParam('high')).toBe('high');
  });

  it('is case-sensitive and rejects anything else', () => {
    expect(parseTierParam('MED')).toBeNull();
    expect(parseTierParam(null)).toBeNull();
    expect(parseTierParam('')).toBeNull();
    expect(parseTierParam('ultra')).toBeNull();
    expect(parseTierParam('constructor')).toBeNull();
    expect(parseTierParam('__proto__')).toBeNull();
  });
});

describe('createAutoTierPolicy (D-21, Pitfall 3)', () => {
  const START = 5000;

  it('ignores every frame in the first 1000 ms', () => {
    const p = createAutoTierPolicy({ start: 'high', startMs: START });
    // 5 s worth of terrible frames, all timestamped inside the ignore window.
    for (let i = 0; i < 200; i++) {
      const r = p.feed(START + (i * 999) / 200, 100, 90);
      expect(r).toEqual({ tier: 'high', changed: false });
    }
    expect(p.tier()).toBe('high');
    expect(p.downgrades()).toBe(0);
    // The ignored frames did not pre-fill the first window: 2.9 s of bad frames afterwards still decides nothing.
    expect(feedRange(p, START + 1000, START + 3900, 40, 35)).toBe(0);
    expect(p.tier()).toBe('high');
  });

  it('3000 ms of 40 ms frames with 35 ms work drops high to low once', () => {
    const p = createAutoTierPolicy({ start: 'high', startMs: START });
    expect(feedRange(p, START + 1000, START + 4000, 40, 35)).toBe(1);
    expect(p.tier()).toBe('low');
    expect(p.downgrades()).toBe(1);
  });

  it('33.3 ms frames with 5 ms work are a rAF cap and never downgrade', () => {
    const p = createAutoTierPolicy({ start: 'high', startMs: START });
    expect(feedRange(p, START + 1000, START + 13000, 33.3, 5)).toBe(0);
    expect(p.tier()).toBe('high');
    expect(p.downgrades()).toBe(0);
  });

  it('allows at most two downgrades by default', () => {
    const p = createAutoTierPolicy({ start: 'high', startMs: START });
    expect(feedRange(p, START + 1000, START + 4000, 25, 22)).toBe(1);
    expect(p.tier()).toBe('med');
    expect(feedRange(p, START + 4000, START + 7000, 40, 35)).toBe(1);
    expect(p.tier()).toBe('low');
    expect(p.downgrades()).toBe(2);
    expect(feedRange(p, START + 7000, START + 10000, 60, 55)).toBe(0);
    expect(p.tier()).toBe('low');
    expect(p.downgrades()).toBe(2);
  });

  it('refuses a further change once maxDowngrades is used up', () => {
    // With a cap of 1, med could still fall to low on a 40 ms window; the cap must stop it.
    const p = createAutoTierPolicy({ start: 'high', startMs: START, maxDowngrades: 1 });
    expect(feedRange(p, START + 1000, START + 4000, 25, 22)).toBe(1);
    expect(p.tier()).toBe('med');
    expect(feedRange(p, START + 4000, START + 7000, 40, 35)).toBe(0);
    expect(p.tier()).toBe('med');
    expect(p.downgrades()).toBe(1);
  });

  it('never upgrades: low stays low after 3000 ms of 10 ms frames', () => {
    const p = createAutoTierPolicy({ start: 'high', startMs: START });
    feedRange(p, START + 1000, START + 4000, 40, 35);
    expect(p.tier()).toBe('low');
    expect(feedRange(p, START + 4000, START + 10000, 10, 4)).toBe(0);
    expect(p.tier()).toBe('low');
  });

  it('never upgrades from a med start either', () => {
    const p = createAutoTierPolicy({ start: 'med', startMs: START });
    expect(feedRange(p, START + 1000, START + 7000, 10, 4)).toBe(0);
    expect(p.tier()).toBe('med');
  });

  it('honours custom ignoreMs and sampleMs', () => {
    const p = createAutoTierPolicy({ start: 'high', startMs: 0, ignoreMs: 200, sampleMs: 1000 });
    expect(feedRange(p, 200, 1200, 40, 35)).toBe(1);
    expect(p.tier()).toBe('low');
  });

  it('a nearly empty window (one huge gap after a pause) decides nothing', () => {
    const p = createAutoTierPolicy({ start: 'high', startMs: 0 });
    p.feed(1016, 16, 4);
    expect(p.feed(6000, 4984, 4)).toEqual({ tier: 'high', changed: false });
    expect(p.tier()).toBe('high');
  });
});

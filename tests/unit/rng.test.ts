import { describe, expect, it } from 'vitest';
import { BENCH_SEED, mulberry32 } from '../../src/logic/rng';

describe('mulberry32', () => {
  it('replays the same sequence for the same seed', () => {
    const a = mulberry32(BENCH_SEED);
    const b = mulberry32(BENCH_SEED);
    const va = [a(), a(), a(), a(), a()];
    const vb = [b(), b(), b(), b(), b()];
    expect(va).toEqual(vb);
  });

  it('returns values in [0, 1)', () => {
    const r = mulberry32(BENCH_SEED);
    for (let i = 0; i < 10_000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('different seeds give a different first value', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('is not constant and spreads over the unit interval', () => {
    const r = mulberry32(BENCH_SEED);
    const buckets = [0, 0, 0, 0];
    for (let i = 0; i < 4000; i++) buckets[Math.floor(r() * 4)]++;
    for (const b of buckets) expect(b).toBeGreaterThan(800);
  });

  it('matches the reference 32-bit mulberry32 for seed 0', () => {
    // Reference implementation (Tommy Ettinger), written out independently of src/logic/rng.ts.
    let s = 0;
    const ref = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const r = mulberry32(0);
    for (let i = 0; i < 5; i++) expect(r()).toBe(ref());
  });

  it('BENCH_SEED is the pinned constant', () => {
    expect(BENCH_SEED).toBe(20260914);
  });
});

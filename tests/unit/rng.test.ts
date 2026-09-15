import { describe, expect, it } from 'vitest';
import { BENCH_SEED, mulberry32, seedFor } from '../../src/logic/rng';

describe('seedFor (per-member streams, RESEARCH Pitfall 7)', () => {
  it('returns a stable unsigned 32-bit integer', () => {
    const a = seedFor(1, 'm1');
    expect(Number.isInteger(a)).toBe(true);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(2 ** 32);
    expect(seedFor(1, 'm1')).toBe(a);
  });

  it('differs by key and by base', () => {
    expect(seedFor(1, 'm1')).not.toBe(seedFor(1, 'm2'));
    expect(seedFor(1, 'm1')).not.toBe(seedFor(2, 'm1'));
  });

  it('is FNV-1a 32-bit over UTF-16 units xor base', () => {
    expect(seedFor(0, '')).toBe(0x811c9dc5);
    expect(seedFor(0, 'a')).toBe(0xe40c292c);
    expect(seedFor(0x811c9dc5, '')).toBe(0);
    expect(seedFor(5, 'a')).toBe((0xe40c292c ^ 5) >>> 0);
  });

  it('treats a non-finite base as 0', () => {
    expect(seedFor(NaN, 'm3')).toBe(seedFor(0, 'm3'));
  });

  it('gives independent streams per member', () => {
    const r1 = mulberry32(seedFor(BENCH_SEED, 'm1'));
    const r2 = mulberry32(seedFor(BENCH_SEED, 'm2'));
    expect([r1(), r1(), r1()]).not.toEqual([r2(), r2(), r2()]);
  });
});

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

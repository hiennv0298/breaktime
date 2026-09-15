/**
 * Seeded PRNG (D-08, RESEARCH "Don't Hand-Roll": mulberry32 row). Pure, no DOM, Vitest-covered (TECH-06).
 * Slap spin and pitch variation draw from it so a benchmark run replays the same way on the same device.
 */

/** Fixed benchmark seed. */
export const BENCH_SEED = 20260914;

/** Standard 32-bit mulberry32. Returns a generator of floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = Number.isFinite(seed) ? seed | 0 : 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

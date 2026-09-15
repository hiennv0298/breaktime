/**
 * Seeded PRNG (D-08, RESEARCH "Don't Hand-Roll": mulberry32 row). Pure, no DOM, Vitest-covered (TECH-06).
 * Slap spin and pitch variation draw from it so a benchmark run replays the same way on the same device.
 */

/** Fixed benchmark seed. */
export const BENCH_SEED = 20260914;

/**
 * Derived seed for an independent per-key stream (RESEARCH Pattern 9 / Pitfall 7): FNV-1a 32-bit over the UTF-16 code
 * units of key, xor (base | 0), as an unsigned 32-bit integer. Combat draws from mulberry32(seedFor(seed, memberId)) so
 * adding or reordering NPCs never shifts another member's decisions. A non-finite base counts as 0.
 */
export function seedFor(base: number, key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const b = Number.isFinite(base) ? base | 0 : 0;
  return (h ^ b) >>> 0;
}

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

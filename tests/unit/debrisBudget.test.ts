import { describe, expect, it } from 'vitest';
import { createDebrisBudget } from '../../src/logic/debrisBudget';
import { BENCH_SEED, mulberry32 } from '../../src/logic/rng';

describe('createDebrisBudget', () => {
  it('hands out free slots until the cap, then recycles the oldest first (FIFO)', () => {
    const b = createDebrisBudget(4);
    const first = b.acquire(3);
    const a = [...first.slots];
    expect(a).toHaveLength(3);
    expect(first.recycled).toEqual([]);
    expect(new Set(a).size).toBe(3);
    expect(b.active()).toBe(3);

    const second = b.acquire(3);
    const slots = [...second.slots];
    const recycled = [...second.recycled];
    expect(slots).toHaveLength(3);
    expect(recycled).toEqual([a[0], a[1]]);
    // The recycled slots are handed out again in the same call.
    expect(slots).toContain(a[0]);
    expect(slots).toContain(a[1]);
    expect(b.active()).toBe(4);
    expect(b.cap()).toBe(4);
  });

  it('never returns more slots than the cap in one call', () => {
    const b = createDebrisBudget(4);
    const r = b.acquire(9);
    expect(r.slots).toHaveLength(4);
    expect(b.active()).toBe(4);
    expect(b.acquire(0).slots).toEqual([]);
    expect(b.acquire(Number.NaN).slots).toEqual([]);
    expect(b.acquire(-3).slots).toEqual([]);
  });

  it('release frees a slot so the next acquire recycles nothing', () => {
    const b = createDebrisBudget(4);
    const s = [...b.acquire(4).slots];
    b.release(s[2]);
    expect(b.active()).toBe(3);
    const r = b.acquire(1);
    expect(r.recycled).toEqual([]);
    expect(r.slots).toEqual([s[2]]);
    expect(b.active()).toBe(4);
    // After a release in the middle, the FIFO order of the rest is kept: s[0] is still the oldest.
    expect([...b.acquire(1).recycled]).toEqual([s[0]]);
  });

  it('ignores releasing an unknown, inactive or out-of-range slot', () => {
    const b = createDebrisBudget(4);
    const s = [...b.acquire(2).slots];
    b.release(s[0]);
    b.release(s[0]);
    b.release(-1);
    b.release(999);
    b.release(Number.NaN);
    expect(b.active()).toBe(1);
  });

  it('setCap(2) releases the oldest slots so active() <= 2', () => {
    const b = createDebrisBudget(4);
    const s = [...b.acquire(4).slots];
    const released = [...b.setCap(2)];
    expect(released).toEqual([s[0], s[1]]);
    expect(b.active()).toBe(2);
    expect(b.cap()).toBe(2);
    expect([...b.acquire(1).recycled]).toEqual([s[2]]);
    expect(b.active()).toBe(2);
  });

  it('clamps the cap to [0, capacity] and defaults capacity to 60', () => {
    const b = createDebrisBudget(80);
    expect(b.cap()).toBe(60);
    expect(b.acquire(100).slots).toHaveLength(60);
    expect(b.setCap(-5)).toHaveLength(60);
    expect(b.cap()).toBe(0);
    expect(b.active()).toBe(0);
    expect(b.acquire(3).slots).toEqual([]);
    b.setCap(Number.NaN);
    expect(b.cap()).toBe(0);
    const small = createDebrisBudget(10, 6);
    expect(small.cap()).toBe(6);
  });

  it('slots stay inside [0, capacity) and are never handed out twice while active', () => {
    const b = createDebrisBudget(5, 8);
    const live = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const r = b.acquire(3);
      for (const x of r.recycled) live.delete(x);
      for (const x of r.slots) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(8);
        expect(live.has(x)).toBe(false);
        live.add(x);
      }
      expect(live.size).toBe(b.active());
    }
  });

  it('a 500-operation seeded sequence never lets active() exceed cap()', () => {
    const rng = mulberry32(BENCH_SEED);
    const b = createDebrisBudget(40);
    const live: number[] = [];
    const caps = [20, 40, 60];
    for (let i = 0; i < 500; i++) {
      const r = rng();
      if (r < 0.5) {
        const got = b.acquire(1 + Math.floor(rng() * 8));
        for (const x of got.recycled) live.splice(live.indexOf(x), 1);
        live.push(...got.slots);
      } else if (r < 0.9) {
        if (live.length > 0) {
          const k = Math.floor(rng() * live.length);
          b.release(live[k]);
          live.splice(k, 1);
        }
      } else {
        for (const x of b.setCap(caps[Math.floor(rng() * caps.length)])) live.splice(live.indexOf(x), 1);
      }
      expect(b.active()).toBeLessThanOrEqual(b.cap());
      expect(b.active()).toBe(live.length);
      expect(new Set(live).size).toBe(live.length);
    }
  });
});

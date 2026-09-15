import { describe, expect, it } from 'vitest';
import { FREE_SPOT_DIRS, FREE_SPOT_MAX_M, FREE_SPOT_STEP_M, freeSpotCandidates } from '../../src/logic/freeSpot';
import { ROOM } from '../../src/game/layout';

const BOUNDS = { halfX: 8, halfZ: 6, margin: 0.5 };

describe('freeSpot constants (D-06, Pitfall 4)', () => {
  it('pin step, max radius and directions', () => {
    expect(FREE_SPOT_STEP_M).toBe(0.4);
    expect(FREE_SPOT_MAX_M).toBe(2.0);
    expect(FREE_SPOT_DIRS).toBe(8);
  });

  it('the test bounds match the room half extents', () => {
    expect(ROOM.width / 2).toBe(BOUNDS.halfX);
    expect(ROOM.depth / 2).toBe(BOUNDS.halfZ);
  });
});

describe('freeSpotCandidates', () => {
  it('returns 41 points: the landing point, then 5 rings of 8 at 0.4 / 0.8 / 1.2 / 1.6 / 2.0 m', () => {
    const c = freeSpotCandidates(1, 2, BOUNDS);
    expect(c).toHaveLength(41);
    expect(c[0]).toEqual({ x: 1, z: 2 });
    const rings = [0.4, 0.8, 1.2, 1.6, 2.0];
    for (let ring = 0; ring < rings.length; ring++) {
      for (let k = 0; k < 8; k++) {
        const p = c[1 + ring * 8 + k];
        expect(Math.abs(Math.hypot(p.x - 1, p.z - 2) - rings[ring])).toBeLessThanOrEqual(1e-9);
      }
    }
  });

  it('the last ring is exactly 2.0 m along +X', () => {
    const c = freeSpotCandidates(0, 0, BOUNDS);
    expect(c[33]).toEqual({ x: 2.0, z: 0 });
  });

  it('walks the directions k/8 x 2 PI starting at +X in a fixed order', () => {
    const c = freeSpotCandidates(1, 2, BOUNDS);
    for (let ring = 1; ring <= 5; ring++) {
      const r = ring * 0.4;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const p = c[1 + (ring - 1) * 8 + k];
        expect(p.x).toBeCloseTo(1 + Math.cos(a) * r, 9);
        expect(p.z).toBeCloseTo(2 + Math.sin(a) * r, 9);
      }
    }
    expect(c[1].x).toBeCloseTo(1.4, 9);
    expect(c[1].z).toBeCloseTo(2, 9);
    expect(c[3].x).toBeCloseTo(1, 9);
    expect(c[3].z).toBeCloseTo(2.4, 9);
  });

  it('clamps every point inside the room margin', () => {
    for (const [x, z] of [
      [7.4, 5.4],
      [-7.9, 5.9],
      [0, -6],
      [20, -20],
      [-100, 100],
    ]) {
      for (const p of freeSpotCandidates(x, z, BOUNDS)) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(7.5);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(5.5);
      }
    }
  });

  it('clamps a landing point outside the room first', () => {
    const c = freeSpotCandidates(20, -20, BOUNDS);
    expect(c[0]).toEqual({ x: 7.5, z: -5.5 });
    // Rings are built around the clamped point: the -X direction (k = 4) of ring 1 moves inside.
    expect(c[5].x).toBeCloseTo(7.1, 9);
    expect(c[5].z).toBeCloseTo(-5.5, 9);
  });

  it('non-finite x or z starts from the origin', () => {
    for (const [x, z] of [
      [Number.NaN, 1],
      [1, Infinity],
      [-Infinity, Number.NaN],
    ]) {
      const c = freeSpotCandidates(x, z, BOUNDS);
      expect(c).toHaveLength(41);
      expect(c[0]).toEqual({ x: 0, z: 0 });
      for (const p of c) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.z)).toBe(true);
      }
    }
  });

  it('is deterministic and allocates a fresh array each call', () => {
    const a = freeSpotCandidates(-3.3, 1.7, BOUNDS);
    const b = freeSpotCandidates(-3.3, 1.7, BOUNDS);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
    a[0].x = 99;
    expect(freeSpotCandidates(-3.3, 1.7, BOUNDS)[0].x).toBe(-3.3);
  });

  it('does not mutate the bounds', () => {
    const bounds = { ...BOUNDS };
    freeSpotCandidates(1, 1, bounds);
    expect(bounds).toEqual(BOUNDS);
  });
});

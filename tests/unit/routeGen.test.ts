/**
 * Seeded per-NPC route generator (quick fix 16/09/2026).
 *
 * Operator: "mỗi NPC đi tuyến riêng theo seed thay vì dùng chung 5 tuyến" — newly added NPCs used to inherit one of
 * the 5 hand-placed routes, so they visibly walked behind the older ones. This module builds one loop per seed out of
 * an explicit free-space description; it stays pure (no three.js / Rapier / DOM / Date.now / Math.random) so Vitest
 * covers it, and it must be replayable for ?bench=1 and ?soak=1.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROUTE_CONFIG,
  freeSpots,
  generateRoute,
  segmentBlocked,
  spotBlocked,
  type RouteArea,
} from '../../src/logic/routeGen';

const OPEN: RouteArea = { minX: -10, maxX: 10, minZ: -10, maxZ: 10, gridStep: 1, rects: [], circles: [] };

/** A wall from the south edge up to z = 4 (so the only way across is the z >= 5 lane) plus one round keep-out. */
const WALLED: RouteArea = {
  ...OPEN,
  rects: [{ id: 'wall', minX: -1, maxX: 1, minZ: -10, maxZ: 4, margin: 0.5 }],
  circles: [{ id: 'pot', x: -5, z: -5, radius: 1.5 }],
};

const CFG = DEFAULT_ROUTE_CONFIG;

function pairs<T>(list: readonly T[]): Array<[T, T]> {
  const out: Array<[T, T]> = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) out.push([list[i], list[j]]);
  return out;
}

function maxPairDistance(stops: ReadonlyArray<{ x: number; z: number }>): number {
  return Math.max(0, ...pairs(stops).map(([a, b]) => Math.hypot(a.x - b.x, a.z - b.z)));
}

describe('spotBlocked', () => {
  it('rejects anything outside the bounds', () => {
    expect(spotBlocked(OPEN, 0, 0)).toBe(false);
    expect(spotBlocked(OPEN, 10, 10)).toBe(false);
    expect(spotBlocked(OPEN, 10.01, 0)).toBe(true);
    expect(spotBlocked(OPEN, 0, -10.01)).toBe(true);
    expect(spotBlocked(OPEN, Number.NaN, 0)).toBe(true);
  });

  it('keeps the rect margin and the circle radius', () => {
    // wall spans x [-1, 1] with margin 0.5 -> blocked out to |x| = 1.5 while z <= 4.5.
    expect(spotBlocked(WALLED, 0, 0)).toBe(true);
    expect(spotBlocked(WALLED, 1.4, 0)).toBe(true);
    expect(spotBlocked(WALLED, 1.6, 0)).toBe(false);
    expect(spotBlocked(WALLED, 0, 4.6)).toBe(false);
    // circle keep-out is a centre distance.
    expect(spotBlocked(WALLED, -5, -5)).toBe(true);
    expect(spotBlocked(WALLED, -5, -3.6)).toBe(true);
    expect(spotBlocked(WALLED, -5, -3.4)).toBe(false);
  });
});

describe('segmentBlocked', () => {
  it('detects a segment crossing the wall (negative control) and lets the northern lane through', () => {
    expect(segmentBlocked(WALLED, { x: -5, z: 0 }, { x: 5, z: 0 })).toBe(true);
    expect(segmentBlocked(WALLED, { x: -5, z: 6 }, { x: 5, z: 6 })).toBe(false);
    // Grazing the wall's margin still counts as blocked.
    expect(segmentBlocked(WALLED, { x: -5, z: 4.4 }, { x: 5, z: 4.4 })).toBe(true);
  });

  it('detects a segment passing through a circle keep-out', () => {
    expect(segmentBlocked(WALLED, { x: -8, z: -5 }, { x: -2, z: -5 })).toBe(true);
    expect(segmentBlocked(WALLED, { x: -8, z: -8 }, { x: -2, z: -8 })).toBe(false);
  });

  it('treats a segment leaving the bounds as blocked', () => {
    expect(segmentBlocked(OPEN, { x: 0, z: 0 }, { x: 12, z: 0 })).toBe(true);
    expect(segmentBlocked(OPEN, { x: 0, z: 0 }, { x: 9, z: 9 })).toBe(false);
  });
});

describe('freeSpots', () => {
  it('returns only unblocked lattice points, in a stable order', () => {
    const spots = freeSpots(WALLED);
    expect(spots.length).toBeGreaterThan(100);
    for (const s of spots) expect(spotBlocked(WALLED, s.x, s.z)).toBe(false);
    expect(freeSpots(WALLED)).toEqual(spots);
    // The lattice is anchored at the bounds minimum and never leaves them.
    for (const s of spots) {
      expect(s.x).toBeGreaterThanOrEqual(WALLED.minX);
      expect(s.x).toBeLessThanOrEqual(WALLED.maxX);
      expect(Number.isInteger(Math.round((s.x - WALLED.minX) / WALLED.gridStep))).toBe(true);
    }
  });
});

describe('generateRoute', () => {
  it('is deterministic: the same seed gives an identical route', () => {
    const a = generateRoute(WALLED, CFG, 1234);
    const b = generateRoute(WALLED, CFG, 1234);
    expect(b).toEqual(a);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('gives different seeds different routes', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 30; s++) seen.add(JSON.stringify(generateRoute(WALLED, CFG, 7000 + s).stops));
    // Not a uniqueness contract, but a shared-route regression would collapse these to one or two entries.
    expect(seen.size).toBeGreaterThanOrEqual(25);
  });

  it('keeps 3..5 stops that all dwell, each on free ground', () => {
    for (let s = 0; s < 40; s++) {
      const r = generateRoute(WALLED, CFG, 31_000 + s);
      expect(r.stops.length).toBeGreaterThanOrEqual(CFG.minStops);
      expect(r.stops.length).toBeLessThanOrEqual(CFG.maxStops);
      for (const p of r.stops) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
        expect(spotBlocked(WALLED, p.x, p.z)).toBe(false);
        expect(p.dwellSec).toBeGreaterThanOrEqual(CFG.dwellMin);
        expect(p.dwellSec).toBeLessThanOrEqual(CFG.dwellMax);
      }
    }
  });

  it('closes the loop with clear segments and spreads the stops out', () => {
    for (let s = 0; s < 40; s++) {
      const r = generateRoute(WALLED, CFG, 52_000 + s);
      r.stops.forEach((p, i) => {
        const q = r.stops[(i + 1) % r.stops.length];
        expect(segmentBlocked(WALLED, p, q), `seed ${52_000 + s} segment ${i}`).toBe(false);
      });
      for (const [a, b] of pairs(r.stops)) {
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(CFG.minStopGap - 1e-9);
      }
      expect(maxPairDistance(r.stops)).toBeGreaterThanOrEqual(CFG.minSpread - 1e-9);
    }
  });

  it('varies the walk speed inside the documented band', () => {
    const speeds = new Set<number>();
    for (let s = 0; s < 40; s++) {
      const v = generateRoute(WALLED, CFG, 73_000 + s).speed;
      expect(v).toBeGreaterThanOrEqual(CFG.speedMin);
      expect(v).toBeLessThanOrEqual(CFG.speedMax);
      speeds.add(v);
    }
    expect(speeds.size).toBeGreaterThanOrEqual(20);
  });

  it('keeps the first stop away from the spawn points it is given', () => {
    const avoid = [{ x: 4, z: 4 }, { x: -4, z: 6 }, { x: 6, z: -6 }];
    for (let s = 0; s < 40; s++) {
      const r = generateRoute(WALLED, CFG, 94_000 + s, avoid);
      for (const q of avoid) {
        expect(Math.hypot(r.stops[0].x - q.x, r.stops[0].z - q.z)).toBeGreaterThanOrEqual(CFG.minSpawnGap - 1e-9);
      }
    }
  });

  it('never fails on 200 consecutive seeds of a room-like area', () => {
    for (let s = 0; s < 200; s++) expect(() => generateRoute(WALLED, CFG, s)).not.toThrow();
  });

  it('throws when the area has no usable free space', () => {
    const solid: RouteArea = { ...OPEN, rects: [{ id: 'all', minX: -20, maxX: 20, minZ: -20, maxZ: 20, margin: 0 }] };
    expect(() => generateRoute(solid, CFG, 1)).toThrow(/routeGen/);
  });
});

import { describe, expect, it } from 'vitest';
import { CORRIDOR, PROP_PLACEMENTS, ROOM } from '../../src/game/layout';
import {
  NPC_RADIUS,
  NPC_ROUTES,
  ROUTE_CLEARANCE,
  ROUTE_OBSTACLES,
  routeIndexForNpc,
  sharedIndexForNpc,
  type Footprint,
} from '../../src/game/waypoints';

const WALL_CLEARANCE = 0.5;
const STEP = 0.02; // m, sampling along each segment

function distToRect(x: number, z: number, r: Footprint): number {
  const dx = Math.max(r.minX - x, 0, x - r.maxX);
  const dz = Math.max(r.minZ - z, 0, z - r.maxZ);
  return Math.hypot(dx, dz);
}

function* samples(a: { x: number; z: number }, b: { x: number; z: number }): Generator<{ x: number; z: number }> {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / STEP));
  for (let i = 0; i <= n; i++) yield { x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n };
}

function segments(route: { x: number; z: number }[]): Array<[{ x: number; z: number }, { x: number; z: number }]> {
  return route.map((p, i) => [p, route[(i + 1) % route.length]]);
}

describe('NPC_ROUTES', () => {
  it('has 5 looping routes with finite points and at least two dwell stops each', () => {
    // D-29 (plan 01-23): routes 0-2 from 01-14 plus hand-placed routes for NPCs 9 and 10 (still no navmesh).
    expect(NPC_ROUTES.length).toBe(5);
    for (const route of NPC_ROUTES) {
      expect(route.length).toBeGreaterThanOrEqual(3);
      for (const p of route) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.dwellSec)).toBe(true);
        expect(p.dwellSec).toBeGreaterThanOrEqual(0);
      }
      expect(route.filter((p) => p.dwellSec > 0).length).toBeGreaterThanOrEqual(2);
      // No zero-length segment (the walker handles it, but it would be a wasted dwell step).
      for (const [a, b] of segments(route)) expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(0.05);
    }
  });

  it('keeps every point inside the room with >= 0.5 m wall clearance', () => {
    for (const route of NPC_ROUTES) {
      for (const p of route) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(ROOM.width / 2 - WALL_CLEARANCE);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(ROOM.depth / 2 - WALL_CLEARANCE);
      }
    }
  });

  it('never walks an NPC capsule through a desk or static furniture', () => {
    const min = NPC_RADIUS + ROUTE_CLEARANCE;
    ROUTE_OBSTACLES.forEach((r) => expect(r.maxX - r.minX).toBeGreaterThan(0));
    NPC_ROUTES.forEach((route, ri) => {
      for (const [a, b] of segments(route)) {
        for (const s of samples(a, b)) {
          for (const r of ROUTE_OBSTACLES) {
            const d = distToRect(s.x, s.z, r);
            if (d < min) {
              throw new Error(
                `route ${ri} segment (${a.x},${a.z})->(${b.x},${b.z}) passes ${d.toFixed(3)} m from ${r.id} at (${s.x.toFixed(2)},${s.z.toFixed(2)})`,
              );
            }
          }
        }
      }
    });
  });

  it('stays out of the spawn / test-box corridor', () => {
    const c: Footprint = { id: 'corridor', ...CORRIDOR };
    for (const route of NPC_ROUTES) {
      for (const [a, b] of segments(route)) {
        for (const s of samples(a, b)) expect(distToRect(s.x, s.z, c)).toBeGreaterThanOrEqual(NPC_RADIUS);
      }
    }
  });

  it('includes the desk, pantry, printer and bookcase stops D-11 asks for', () => {
    const stops = NPC_ROUTES.map((r) => r.filter((p) => p.dwellSec > 0));
    // Coffee machine stop is the longest dwell on route 0.
    expect(Math.max(...stops[0].map((p) => p.dwellSec))).toBe(4);
    expect(stops[1].length).toBe(3); // desk, water cooler, printer
    expect(stops[2].length).toBe(3); // desk, fridge, bookcase
  });

  it('detects a route through a desk (negative control for the clearance check)', () => {
    const deskRect = ROUTE_OBSTACLES.find((r) => r.id === 'd1-desk')!;
    const cx = (deskRect.minX + deskRect.maxX) / 2;
    const bad = [
      { x: cx, z: deskRect.maxZ + 1 },
      { x: cx, z: deskRect.minZ - 1 },
    ];
    let hit = false;
    for (const [a, b] of segments(bad)) for (const s of samples(a, b)) if (distToRect(s.x, s.z, deskRect) < NPC_RADIUS) hit = true;
    expect(hit).toBe(true);
  });
});

/** Floor-standing dynamic props an NPC would shove if its route brushed them (plan 01-23). */
const FLOOR_PROP_ROLES = new Set(['trashcan', 'boxClosed', 'pottedPlant', 'plantSmall']);
const PROP_CLEARANCE = 0.6; // m, centre distance

describe('routes for NPCs 9 and 10 (D-29, D-11 revised)', () => {
  it('keeps routes 3 and 4 >= 0.6 m from every floor-standing trashcan, box and plant', () => {
    const floorProps = PROP_PLACEMENTS.filter((p) => FLOOR_PROP_ROLES.has(p.role) && p.on === undefined);
    expect(floorProps.length).toBeGreaterThanOrEqual(8);
    expect(NPC_ROUTES.length).toBeGreaterThanOrEqual(5);
    for (const ri of [3, 4]) {
      for (const [a, b] of segments(NPC_ROUTES[ri])) {
        for (const s of samples(a, b)) {
          for (const p of floorProps) {
            const d = Math.hypot(s.x - p.x, s.z - p.z);
            if (d < PROP_CLEARANCE) {
              throw new Error(
                `route ${ri} segment (${a.x},${a.z})->(${b.x},${b.z}) passes ${d.toFixed(3)} m from ${p.id} at (${s.x.toFixed(2)},${s.z.toFixed(2)})`,
              );
            }
          }
        }
      }
    }
  });

  it('maps NPCs 1-8 to their 01-14 routes and offsets, 9 and 10 to the new routes', () => {
    const idx = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(idx.map((i) => routeIndexForNpc(i))).toEqual([0, 1, 2, 0, 1, 2, 0, 1, 3, 4]);
    expect(idx.map((i) => sharedIndexForNpc(i))).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 0, 0]);
  });

  it('clamps and truncates out-of-range NPC indices into 0..9', () => {
    expect(routeIndexForNpc(-1)).toBe(0);
    expect(routeIndexForNpc(42)).toBe(4);
    expect(routeIndexForNpc(Number.NaN)).toBe(0);
    expect(routeIndexForNpc(8.9)).toBe(3);
    expect(sharedIndexForNpc(-5)).toBe(0);
    expect(sharedIndexForNpc(100)).toBe(0);
    expect(sharedIndexForNpc(Number.NaN)).toBe(0);
    expect(sharedIndexForNpc(7.99)).toBe(2);
    for (const i of [-3, 0, 5, 9, 10, 1e9, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(routeIndexForNpc(i)).toBeGreaterThanOrEqual(0);
      expect(routeIndexForNpc(i)).toBeLessThan(NPC_ROUTES.length);
    }
  });
});

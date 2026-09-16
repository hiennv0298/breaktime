/**
 * 16/09/2026 operator (quick fix, no plan): NPC đi tuyến riêng theo seed thay vì dùng chung 5 tuyến.
 *
 * Until today every NPC took one of the 5 hand-placed `NPC_ROUTES` (slots 0..9 by the Phase 1 mapping, slots 10..14
 * by a seeded start point on the same 5 loops), so a newly added coworker visibly walked the path of an older one.
 * Two describes that pinned that behaviour were removed here and replaced by the per-NPC route suite below:
 *
 *   - "Phase 1 slot mapping regression (slots 0..9, D-11 bench comparability)" — it asserted routeIndexForNpc /
 *     sharedIndexForNpc / routeStartIndexForNpc / spawnPointForNpc literals for the shared routes. Those functions no
 *     longer exist; slot -> route is now `routeForNpc(i)`, one generated loop per slot.
 *   - "slots 10..14 reuse the 5 routes with seeded start points (D-01, G3r)" — same reason: no slot reuses a route.
 *
 * `NPC_ROUTES` itself is kept byte-identical because `src/bench/benchScript.ts` builds the ?bench=1 player waypoints
 * from it (01-17); the bench timeline must not change. Its geometry tests below therefore stay as they were.
 * Bench fps numbers measured before today (10 NPCs on the shared routes) are not comparable to new runs.
 */
import { describe, expect, it, vi } from 'vitest';
import { CORRIDOR, PROP_PLACEMENTS, ROOM } from '../../src/game/layout';
import { spotBlocked } from '../../src/logic/routeGen';
import {
  MIN_SPAWN_GAP,
  NPC_RADIUS,
  NPC_ROUTES,
  NPC_ROUTE_AREA,
  NPC_ROUTE_CONFIG,
  NPC_SLOT_COUNT,
  PROP_CLEARANCE,
  ROUTE_CLEARANCE,
  ROUTE_OBSTACLES,
  ROUTE_START_INDEX,
  farthestRouteIndex,
  routeForNpc,
  spawnPointForNpc,
  walkSpeedForNpc,
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

describe('NPC_ROUTES (hand-placed reference loops, now only the ?bench=1 waypoint source)', () => {
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

describe('hand-placed routes 3 and 4 keep clear of the floor props (D-29)', () => {
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
});

const SLOTS = Array.from({ length: 15 }, (_, i) => i);
const GAP_EPS = 1e-9;
/** Two stops closer than this count as "the same place" when comparing two NPCs' stop sets. */
const SAME_STOP = 0.5;

function pairsOf<T>(list: readonly T[]): Array<[T, T]> {
  const out: Array<[T, T]> = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) out.push([list[i], list[j]]);
  return out;
}

describe('per-NPC seeded routes (16/09/2026 quick fix: tuyến riêng theo seed)', () => {
  const routes = SLOTS.map((i) => routeForNpc(i));

  it('gives all 15 slots their own loop of 3..5 dwelling stops', () => {
    expect(NPC_SLOT_COUNT).toBe(15);
    for (const [i, route] of routes.entries()) {
      expect(route.length, `slot ${i}`).toBeGreaterThanOrEqual(NPC_ROUTE_CONFIG.minStops);
      expect(route.length, `slot ${i}`).toBeLessThanOrEqual(NPC_ROUTE_CONFIG.maxStops);
      for (const p of route) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
        expect(p.dwellSec).toBeGreaterThanOrEqual(NPC_ROUTE_CONFIG.dwellMin);
        expect(p.dwellSec).toBeLessThanOrEqual(NPC_ROUTE_CONFIG.dwellMax);
      }
      // Its own stops are far enough apart to read as separate destinations, and the loop crosses the room.
      for (const [a, b] of pairsOf(route)) {
        expect(Math.hypot(a.x - b.x, a.z - b.z), `slot ${i}`).toBeGreaterThanOrEqual(NPC_ROUTE_CONFIG.minStopGap - GAP_EPS);
      }
      const spread = Math.max(...pairsOf(route).map(([a, b]) => Math.hypot(a.x - b.x, a.z - b.z)));
      expect(spread, `slot ${i} spread`).toBeGreaterThanOrEqual(NPC_ROUTE_CONFIG.minSpread - GAP_EPS);
    }
  });

  it('is deterministic: same seed and slot give byte-identical routes, whatever order they are asked for', async () => {
    for (const i of SLOTS) expect(routeForNpc(i)).toEqual(routes[i]);
    // A fresh module instance asked in reverse order must produce exactly the same loops (?bench=1 / ?soak=1 replay).
    vi.resetModules();
    const fresh = await import('../../src/game/waypoints');
    const reverse = new Map<number, unknown>();
    for (let i = NPC_SLOT_COUNT - 1; i >= 0; i--) reverse.set(i, fresh.routeForNpc(i));
    for (const i of SLOTS) {
      expect(JSON.stringify(reverse.get(i)), `slot ${i}`).toBe(JSON.stringify(routes[i]));
      expect(fresh.walkSpeedForNpc(i)).toBe(walkSpeedForNpc(i));
    }
  });

  it('gives every slot a different set of stops (the bug: newcomers followed the older NPCs)', () => {
    for (const [i, j] of pairsOf(SLOTS)) {
      expect(JSON.stringify(routes[i]), `slots ${i} and ${j}`).not.toBe(JSON.stringify(routes[j]));
      const shared = routes[i].filter((a) => routes[j].some((b) => Math.hypot(a.x - b.x, a.z - b.z) < SAME_STOP));
      expect(shared.length, `slots ${i} and ${j} share ${shared.length} stops`).toBeLessThanOrEqual(1);
    }
  });

  it('spawns every slot on its first stop, at least 0.6 m from every other spawn', () => {
    // The NPC stands on stop 0 and walks off toward ROUTE_START_INDEX straight away (no dwell-shaped statue on load).
    expect(ROUTE_START_INDEX).toBe(1);
    for (const route of routes) expect(route.length).toBeGreaterThan(ROUTE_START_INDEX);
    const spawns = SLOTS.map((i) => spawnPointForNpc(i));
    spawns.forEach((p, i) => {
      expect(p.x).toBe(routes[i][0].x);
      expect(p.z).toBe(routes[i][0].z);
    });
    for (const [i, j] of pairsOf(SLOTS)) {
      const d = Math.hypot(spawns[i].x - spawns[j].x, spawns[i].z - spawns[j].z);
      if (d < MIN_SPAWN_GAP - GAP_EPS) throw new Error(`slots ${i} and ${j} spawn ${d.toFixed(3)} m apart`);
    }
  });

  it('varies the walk speed per NPC inside the documented band', () => {
    const speeds = SLOTS.map((i) => walkSpeedForNpc(i));
    for (const v of speeds) {
      expect(v).toBeGreaterThanOrEqual(NPC_ROUTE_CONFIG.speedMin);
      expect(v).toBeLessThanOrEqual(NPC_ROUTE_CONFIG.speedMax);
    }
    expect(new Set(speeds).size).toBeGreaterThanOrEqual(10);
    // Dwell times differ too, not just the speeds.
    expect(new Set(routes.flat().map((p) => p.dwellSec)).size).toBeGreaterThanOrEqual(10);
  });

  it('clamps and truncates slot indices into 0..14', () => {
    expect(routeForNpc(-1)).toEqual(routes[0]);
    expect(routeForNpc(Number.NaN)).toEqual(routes[0]);
    expect(routeForNpc(99)).toEqual(routes[14]);
    expect(routeForNpc(Number.POSITIVE_INFINITY)).toEqual(routes[14]);
    expect(routeForNpc(3.9)).toEqual(routes[3]);
    expect(walkSpeedForNpc(-4)).toBe(walkSpeedForNpc(0));
    expect(walkSpeedForNpc(Number.NaN)).toBe(walkSpeedForNpc(0));
  });

  it('describes the office with the furniture and props the routes must clear', () => {
    const ids = NPC_ROUTE_AREA.rects.map((r) => r.id);
    for (const id of ['d1-desk', 'd4-desk', 'd1-chair', 'd4-chair', 'pantry-counter', 'pantry-fridge', 'pantry-cooler', 'bookcase', 'printer', 'corridor']) {
      expect(ids, `NPC_ROUTE_AREA is missing ${id}`).toContain(id);
    }
    const circles = NPC_ROUTE_AREA.circles.map((c) => c.id);
    for (const id of ['trash-1', 'trash-2', 'box-1', 'box-2', 'box-test', 'plant-big', 'plant-small-1', 'plant-small-2']) {
      expect(circles, `NPC_ROUTE_AREA is missing ${id}`).toContain(id);
    }
    expect(NPC_ROUTE_AREA.circles.every((c) => c.radius >= PROP_CLEARANCE)).toBe(true);
  });

  it('never puts a stop or a walked segment inside furniture, a prop or the corridor', () => {
    const rects: Footprint[] = NPC_ROUTE_AREA.rects.map((r) => ({ id: r.id, minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ }));
    const margin = new Map(NPC_ROUTE_AREA.rects.map((r) => [r.id, r.margin]));
    routes.forEach((route, i) => {
      for (const p of route) {
        expect(Math.abs(p.x), `slot ${i} stop x`).toBeLessThanOrEqual(ROOM.width / 2 - WALL_CLEARANCE);
        expect(Math.abs(p.z), `slot ${i} stop z`).toBeLessThanOrEqual(ROOM.depth / 2 - WALL_CLEARANCE);
        expect(spotBlocked(NPC_ROUTE_AREA, p.x, p.z), `slot ${i} stop (${p.x},${p.z})`).toBe(false);
      }
      for (const [a, b] of segments(route)) {
        expect(Math.hypot(b.x - a.x, b.z - a.z), `slot ${i} zero-length segment`).toBeGreaterThan(0.05);
        for (const s of samples(a, b)) {
          for (const r of rects) {
            const d = distToRect(s.x, s.z, r);
            if (d < margin.get(r.id)! - GAP_EPS) {
              throw new Error(
                `slot ${i} segment (${a.x},${a.z})->(${b.x},${b.z}) passes ${d.toFixed(3)} m from ${r.id} at (${s.x.toFixed(2)},${s.z.toFixed(2)})`,
              );
            }
          }
          for (const c of NPC_ROUTE_AREA.circles) {
            const d = Math.hypot(s.x - c.x, s.z - c.z);
            if (d < c.radius - GAP_EPS) {
              throw new Error(
                `slot ${i} segment (${a.x},${a.z})->(${b.x},${b.z}) passes ${d.toFixed(3)} m from ${c.id} at (${s.x.toFixed(2)},${s.z.toFixed(2)})`,
              );
            }
          }
        }
      }
    });
  });
});

describe('farthestRouteIndex', () => {
  const route = [
    { x: 0, z: 0 },
    { x: 3, z: 4 },
    { x: -3, z: -4 },
    { x: 1, z: 1 },
  ];

  it('returns the point farthest from the player, lower index on ties', () => {
    expect(farthestRouteIndex(route, 0, 0)).toBe(1);
    expect(farthestRouteIndex(route, 3, 4)).toBe(2);
    expect(farthestRouteIndex([{ x: 1, z: 0 }, { x: -1, z: 0 }], 0, 0)).toBe(0);
  });

  it('returns -1 for an empty route and ignores non-finite points', () => {
    expect(farthestRouteIndex([], 0, 0)).toBe(-1);
    expect(farthestRouteIndex([{ x: Number.NaN, z: 0 }, { x: 1, z: 1 }, { x: Number.POSITIVE_INFINITY, z: 0 }], 0, 0)).toBe(1);
    expect(farthestRouteIndex([{ x: Number.NaN, z: 0 }], 0, 0)).toBe(-1);
  });

  it('works on the generated routes', () => {
    for (const r of SLOTS.map((i) => routeForNpc(i))) {
      const k = farthestRouteIndex(r, 0, 0);
      expect(k).toBeGreaterThanOrEqual(0);
      const d = Math.hypot(r[k].x, r[k].z);
      for (const p of r) expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(d);
    }
  });
});

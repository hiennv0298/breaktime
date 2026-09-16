/**
 * Seeded per-NPC route generator (quick fix 16/09/2026, operator: "NPC đi tuyến riêng theo seed thay vì dùng chung 5
 * tuyến"). Until today every coworker walked one of the 5 hand-placed `NPC_ROUTES`, so NPC 11 retraced NPC 1 and the
 * office read as a conga line. Each NPC now gets its own loop of 3–5 stops drawn from one seed.
 *
 * Pure TypeScript: no three.js, no Rapier, no DOM, no `Date.now`, no `Math.random` — the only randomness is
 * `mulberry32(seed)`, so `?bench=1` and `?soak=1` replay exactly (TECH-06, D-08). The office is passed in as plain
 * geometry (`RouteArea`) instead of imported from `game/layout.ts`, which keeps this module independent of the game.
 *
 * This is deliberately NOT a navmesh (Phase 3 scope). Stops are lattice points on free floor and legs are straight
 * lines that are rejected unless they clear every keep-out, i.e. a seeded visibility search over a coarse grid.
 */
import { mulberry32 } from './rng';
import type { WaypointPoint } from './waypointWalker';

export interface RoutePoint {
  x: number;
  z: number;
}

/** Axis-aligned keep-out (desk, chair, counter, corridor…). `margin` is the free space kept around it. */
export interface BlockRect {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  margin: number;
}

/** Round keep-out around a floor-standing prop; `radius` is a centre distance. */
export interface BlockCircle {
  id: string;
  x: number;
  z: number;
  radius: number;
}

/** Walkable rectangle (already inset by the wall clearance) plus everything inside it that must be avoided. */
export interface RouteArea {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Spacing of the candidate lattice; stops always land on it, so they are stable, printable numbers. */
  gridStep: number;
  rects: readonly BlockRect[];
  circles: readonly BlockCircle[];
}

export interface RouteGenConfig {
  /** Stops per loop: a uniform draw in [minStops, maxStops]. */
  minStops: number;
  maxStops: number;
  /** Minimum distance between two stops of the same NPC (so a loop is not three points in one corner). */
  minStopGap: number;
  /** The loop's longest leg-to-leg distance must reach this, i.e. the stops span the room. */
  minSpread: number;
  /** Minimum distance between this NPC's first stop (its spawn) and the spawn points it is given. */
  minSpawnGap: number;
  /** Dwell band in seconds: one base per NPC, then ±dwellJitter per stop, clamped back into the band. */
  dwellMin: number;
  dwellMax: number;
  dwellJitter: number;
  /** Walk speed band in m/s (WALK_SPEED 1.4 sits inside it). */
  speedMin: number;
  speedMax: number;
  /** Search bounds; both are hard caps, so the generator always terminates in the same number of steps. */
  triesPerLevel: number;
  nodeBudget: number;
}

export interface NpcRoute {
  stops: WaypointPoint[];
  /** Walk speed in m/s for this NPC (passed to `stepWalker`). */
  speed: number;
}

/**
 * Bands chosen for the office in `game/layout.ts`:
 * - 3–5 stops, at least 2 m apart, spanning at least 6 m of the 15 × 11 m walkable floor;
 * - dwell 1.5–5 s (base per NPC, ±25 % per stop) — long enough to read as "doing something", short enough that a
 *   slapped coworker is back on the move quickly;
 * - speed 1.1–1.6 m/s around the 1.4 m/s `WALK_SPEED` the hand-placed routes used, ±~18 %: visibly different
 *   without looking sped up or stuck.
 */
export const DEFAULT_ROUTE_CONFIG: RouteGenConfig = {
  minStops: 3,
  maxStops: 5,
  minStopGap: 2,
  minSpread: 6,
  minSpawnGap: 0.6,
  dwellMin: 1.5,
  dwellMax: 5,
  dwellJitter: 0.25,
  speedMin: 1.1,
  speedMax: 1.6,
  triesPerLevel: 48,
  nodeBudget: 20_000,
};

/** Tolerance for "exactly on the boundary": a stop at exactly `margin` from a rect is allowed, inside it is not. */
const EPS = 1e-6;

function distToRect(x: number, z: number, r: BlockRect): number {
  const dx = Math.max(r.minX - x, 0, x - r.maxX);
  const dz = Math.max(r.minZ - z, 0, z - r.maxZ);
  return Math.hypot(dx, dz);
}

function outOfBounds(area: RouteArea, p: RoutePoint): boolean {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return true;
  return p.x < area.minX - EPS || p.x > area.maxX + EPS || p.z < area.minZ - EPS || p.z > area.maxZ + EPS;
}

/** True when an NPC cannot stand at (x, z): outside the walkable rectangle, or inside a keep-out. */
export function spotBlocked(area: RouteArea, x: number, z: number): boolean {
  if (outOfBounds(area, { x, z })) return true;
  for (const r of area.rects) if (distToRect(x, z, r) < r.margin - EPS) return true;
  for (const c of area.circles) if (Math.hypot(x - c.x, z - c.z) < c.radius - EPS) return true;
  return false;
}

/** Liang–Barsky: does the segment touch the axis-aligned box at all? */
function segmentHitsBox(a: RoutePoint, b: RoutePoint, minX: number, maxX: number, minZ: number, maxZ: number): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  let t0 = 0;
  let t1 = 1;
  const edges: Array<[number, number]> = [
    [-dx, a.x - minX],
    [dx, maxX - a.x],
    [-dz, a.z - minZ],
    [dz, maxZ - a.z],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t0 <= t1;
}

function distPointToSegment(px: number, pz: number, a: RoutePoint, b: RoutePoint): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - a.x) * dx + (pz - a.z) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
}

/**
 * True when an NPC walking the straight line a -> b would clip a keep-out or leave the walkable rectangle.
 * Rect keep-outs are tested against the box grown by their margin, which is slightly stricter than a true distance
 * at the corners — conservative in the safe direction.
 */
export function segmentBlocked(area: RouteArea, a: RoutePoint, b: RoutePoint): boolean {
  if (outOfBounds(area, a) || outOfBounds(area, b)) return true;
  for (const r of area.rects) {
    const m = Math.max(0, r.margin - EPS);
    if (segmentHitsBox(a, b, r.minX - m, r.maxX + m, r.minZ - m, r.maxZ + m)) return true;
  }
  for (const c of area.circles) {
    if (distPointToSegment(c.x, c.z, a, b) < c.radius - EPS) return true;
  }
  return false;
}

/** Every lattice point an NPC can stand on, in a stable order (x-major, anchored at the area minimum). */
export function freeSpots(area: RouteArea): RoutePoint[] {
  const step = area.gridStep > 0 ? area.gridStep : 1;
  const out: RoutePoint[] = [];
  const nx = Math.floor((area.maxX - area.minX) / step + 1e-9);
  const nz = Math.floor((area.maxZ - area.minZ) / step + 1e-9);
  for (let ix = 0; ix <= nx; ix++) {
    const x = round(area.minX + ix * step, 1e6);
    for (let iz = 0; iz <= nz; iz++) {
      const z = round(area.minZ + iz * step, 1e6);
      if (!spotBlocked(area, x, z)) out.push({ x, z });
    }
  }
  return out;
}

function round(v: number, scale: number): number {
  return Math.round(v * scale) / scale;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function maxPairDistance(points: readonly RoutePoint[]): number {
  let best = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      best = Math.max(best, Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z));
    }
  }
  return best;
}

/**
 * One NPC's patrol loop from one seed. The loop is closed: the walker goes back from the last stop to the first, so
 * that leg is checked too. `avoidSpawns` are the spawn points already taken (the first stops of the earlier NPCs);
 * this NPC's first stop keeps `minSpawnGap` from all of them, so nobody spawns inside a neighbour.
 *
 * Deterministic for a given (area, config, seed, avoidSpawns): every draw comes from `mulberry32(seed)` in a fixed
 * order, the candidate lattice is ordered, and both search limits are fixed counts, not time.
 *
 * Throws when the area has no free floor or no loop can be closed inside the search budget — a broken office layout
 * should be loud, not a silent conga line.
 */
export function generateRoute(
  area: RouteArea,
  cfg: RouteGenConfig,
  seed: number,
  avoidSpawns: readonly RoutePoint[] = [],
): NpcRoute {
  const rng = mulberry32(seed);

  // Per-NPC draws first, so the search's own draws never shift them.
  const span = Math.max(1, Math.trunc(cfg.maxStops - cfg.minStops) + 1);
  const stopCount = cfg.minStops + Math.min(span - 1, Math.floor(rng() * span));
  const speed = round(cfg.speedMin + rng() * (cfg.speedMax - cfg.speedMin), 100);
  const dwellBase = cfg.dwellMin + rng() * (cfg.dwellMax - cfg.dwellMin);
  const dwells: number[] = [];
  for (let k = 0; k < stopCount; k++) {
    const jitter = 1 + (rng() * 2 - 1) * cfg.dwellJitter;
    dwells.push(round(clamp(dwellBase * jitter, cfg.dwellMin, cfg.dwellMax), 20));
  }

  const spots = freeSpots(area);
  if (spots.length < stopCount) {
    throw new Error(`routeGen: seed ${seed} found only ${spots.length} free spots in the area`);
  }

  // Fisher–Yates over the lattice: each NPC walks the candidates in its own order, so two NPCs landing on the same
  // stops would need the same seed.
  const order = spots.map((_, i) => i);
  for (let k = order.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    const t = order[k];
    order[k] = order[j];
    order[j] = t;
  }

  const chosen: number[] = [];
  let budget = cfg.nodeBudget;

  function search(requireSpread: boolean): boolean {
    if (chosen.length === stopCount) {
      const picked = chosen.map((i) => spots[i]);
      if (segmentBlocked(area, picked[picked.length - 1], picked[0])) return false;
      return !requireSpread || maxPairDistance(picked) >= cfg.minSpread - EPS;
    }
    let tried = 0;
    for (const idx of order) {
      if (tried >= cfg.triesPerLevel || budget <= 0) return false;
      const p = spots[idx];
      if (chosen.length === 0) {
        if (avoidSpawns.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < cfg.minSpawnGap - EPS)) continue;
      } else {
        if (chosen.some((c) => Math.hypot(p.x - spots[c].x, p.z - spots[c].z) < cfg.minStopGap - EPS)) continue;
        budget--;
        if (segmentBlocked(area, spots[chosen[chosen.length - 1]], p)) continue;
      }
      tried++;
      chosen.push(idx);
      if (search(requireSpread)) return true;
      chosen.pop();
    }
    return false;
  }

  if (!search(true)) {
    // Fallback: the same search without the spread requirement (a cramped area still gets a valid, if tighter, loop).
    chosen.length = 0;
    budget = cfg.nodeBudget;
    if (!search(false)) throw new Error(`routeGen: seed ${seed} found no closed loop of ${stopCount} stops`);
  }

  return {
    stops: chosen.map((idx, k) => ({ x: spots[idx].x, z: spots[idx].z, dwellSec: dwells[k] })),
    speed,
  };
}

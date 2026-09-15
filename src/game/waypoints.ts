/**
 * Hand-placed NPC routes (D-11): desk <-> pantry loops built from layout.ts constants, plus two more for NPCs 9 and 10
 * (D-29, plan 01-23). Straight segments between points; the walker pauses `dwellSec` at each one. Pure data (no
 * three.js), so Vitest checks the geometry.
 *
 * Aisles: the NPCs stay out of the spawn / test-box corridor (layout CORRIDOR) and reach the pantry along a lane
 * north of the first desk row, entering and leaving the desk area around the west end of the desks.
 *
 * Phase 2 (D-01 cap 15, G3r, plan 02-03): NPC slots 10-14 reuse routes 0..4 with a seeded start point instead of new
 * routes; slots 0..9 keep the Phase 1 mapping exactly (D-11 bench comparability). A navmesh replaces all of this
 * in Phase 3.
 */
import { BENCH_SEED, mulberry32 } from '../logic/rng';
import type { WaypointPoint } from '../logic/waypointWalker';
import { DESKS, PANTRY, PROP_PLACEMENTS } from './layout';

/** NPC capsule radius (npc.ts collider). */
export const NPC_RADIUS = 0.3;
/** Free space kept between an NPC capsule and static furniture along every segment. */
export const ROUTE_CLEARANCE = 0.05;

/** Kenney desk at ROLE_SCALE 2, measured from office.glb (layout.ts: "about 1.47 x 0.78 m"). */
const DESK_HALF_W = 0.735;
const DESK_HALF_D = 0.39;
/**
 * Standing spot behind a chair, from the desk centre. The chair sits at desk z + 0.9 and is 0.63 m deep, so its
 * back is at +1.215; at +1.6 the 0.3 m capsule clears it and the NPC does not shove a sleeping chair every visit.
 */
const BEHIND_CHAIR_Z = 1.6;
/** Extra gap between the lanes and the desk / furniture edges they run along. */
const LANE_GAP = 0.2;

function placement(id: string): { x: number; z: number } {
  const p = PROP_PLACEMENTS.find((q) => q.id === id);
  if (!p) throw new Error('layout has no placement ' + id);
  return { x: p.x, z: p.z };
}

function desk(id: string): { x: number; z: number } {
  const d = DESKS.find((q) => q.id === id);
  if (!d) throw new Error('layout has no desk ' + id);
  return d;
}

function pt(x: number, z: number, dwellSec = 0): WaypointPoint {
  return { x, z, dwellSec };
}

const deskMinX = Math.min(...DESKS.map((d) => d.x)) - DESK_HALF_W;
const deskMinZ = Math.min(...DESKS.map((d) => d.z)) - DESK_HALF_D;
const deskMaxZ = Math.max(...DESKS.map((d) => d.z)) + DESK_HALF_D;

/** West column around the desks, north lane above the first desk row, south lane behind the second row's chairs. */
const WEST_X = deskMinX - NPC_RADIUS - LANE_GAP;
const NORTH_Z = deskMinZ - NPC_RADIUS - LANE_GAP;
const SOUTH_Z = desk('d3').z + BEHIND_CHAIR_Z;
const MID_Z = desk('d1').z + BEHIND_CHAIR_Z;

const d1 = desk('d1');
const d2 = desk('d2');
const d3 = desk('d3');
const d4 = desk('d4');
const printer = placement('printer');
const bookcase = placement('bookcase');

/** Where the north lane turns off toward the pantry counter's east end (route 3); x of the water cooler. */
const PANTRY_LANE_X = 3.6;
/** Route 4: stop by the east wall, the aisle it walks along, and the stop in front of the storage boxes. */
const EAST_WINDOW = { x: 6.2, z: 1.0 } as const;
const EAST_AISLE_X = 3.0;
const STORAGE_Z = 3.9;
const STORAGE_STOP_X = 4.85;

/** Routes 0-2 serve NPCs 1-8 as in plans 01-14..01-16; NPCs 9 and 10 take routes 3 and 4 (D-29, 01-23). */
const LEGACY_ROUTES = 3;
const LEGACY_NPCS = 8;
/** Slots 0..9 are the Phase 1 mapping; slots 10..14 (NPCs 11-15) reuse the routes (G3r). */
const PHASE1_SLOTS = 10;
/** Number of NPC slots (D-01: up to 15 NPCs); the highest slot index is 14. */
export const NPC_SLOT_COUNT = 15;
const MAX_NPC_INDEX = NPC_SLOT_COUNT - 1;
/** Spawn offset on x per earlier NPC sharing the route (game.ts SHARED_ROUTE_OFFSET, slots 0..7). */
export const SHARED_ROUTE_OFFSET = 0.3;
/** Minimum centre distance between a slot 10..14 spawn point and every other slot's spawn point. */
export const MIN_SPAWN_GAP = 0.6;
const SPAWN_GAP_EPS = 1e-9;

function npcIndex(i: number): number {
  if (Number.isNaN(i)) return 0;
  return Math.max(0, Math.min(MAX_NPC_INDEX, Math.trunc(i)));
}

const westSouth = () => pt(WEST_X, SOUTH_Z);
const westMid = () => pt(WEST_X, MID_Z);
const westNorth = () => pt(WEST_X, NORTH_Z);

export const NPC_ROUTES: WaypointPoint[][] = [
  // Route 0: desk d1 <-> coffee machine.
  [
    pt(d1.x, d1.z + BEHIND_CHAIR_Z, 3),
    westMid(),
    westNorth(),
    pt(PANTRY.coffeeMachine.x, PANTRY.coffeeMachine.z + 0.9, 4),
    westNorth(),
    westMid(),
  ],
  // Route 1: desk d4 -> water cooler -> printer.
  [
    pt(d4.x, d4.z + BEHIND_CHAIR_Z, 3),
    westSouth(),
    westNorth(),
    pt(PANTRY.waterCooler.x, PANTRY.waterCooler.z + 0.8, 3),
    westNorth(),
    pt(printer.x + 0.9, printer.z, 3),
    westSouth(),
  ],
  // Route 2: desk d3 -> fridge -> bookcase.
  [
    pt(d3.x, d3.z + BEHIND_CHAIR_Z, 3),
    westSouth(),
    westNorth(),
    // Fridge front, off the counter corner: the gap between counter and fridge is narrower than an NPC.
    pt(PANTRY.fridge.x - 0.4, PANTRY.fridge.z + 0.75, 3),
    // Pantry end of the north lane, so the walk to the bookcase clears the counter's west corner.
    pt(PANTRY.counter.x - 0.9, NORTH_Z),
    pt(bookcase.x, bookcase.z + 0.9, 2),
    westNorth(),
    westSouth(),
  ],
  // Route 3 (NPC 9, D-29): desk d2 <-> east end of the pantry counter, along the same west column and north lane.
  [
    pt(d2.x, d2.z + BEHIND_CHAIR_Z, 3),
    westMid(),
    westNorth(),
    pt(PANTRY_LANE_X, NORTH_Z),
    pt(PANTRY.counter.x + 0.6, PANTRY.counter.z + 1.1, 3),
    pt(PANTRY_LANE_X, NORTH_Z),
    westNorth(),
    westMid(),
  ],
  // Route 4 (NPC 10, D-29): east window <-> storage boxes, east of the spawn corridor and clear of trash-2 and the boxes.
  [
    pt(EAST_WINDOW.x, EAST_WINDOW.z, 3),
    pt(EAST_AISLE_X, EAST_WINDOW.z),
    pt(EAST_AISLE_X, STORAGE_Z),
    pt(STORAGE_STOP_X, STORAGE_Z, 3),
    pt(EAST_AISLE_X, STORAGE_Z),
    pt(EAST_AISLE_X, EAST_WINDOW.z),
  ],
];

/**
 * NPC index -> route. NPCs 1-8 keep the routes they had in plans 01-14..01-16 (i % 3), so earlier measurements stay
 * comparable; NPCs 9 and 10 take the hand-placed routes 3 and 4 (D-29); slots 10..14 take routes (i - 10) % 5 (G3r).
 * The index is truncated and clamped to 0..14.
 */
export function routeIndexForNpc(i: number): number {
  const n = npcIndex(i);
  if (n < LEGACY_NPCS) return n % LEGACY_ROUTES;
  if (n < PHASE1_SLOTS) return LEGACY_ROUTES + (n - LEGACY_NPCS);
  return (n - PHASE1_SLOTS) % NPC_ROUTES.length;
}

/** How many earlier NPCs share this NPC's route (the spawn offset multiplier): 0..7 -> floor(i / 3), 8..14 -> 0. */
export function sharedIndexForNpc(i: number): number {
  const n = npcIndex(i);
  return n < LEGACY_NPCS ? Math.floor(n / LEGACY_ROUTES) : 0;
}

type Point = { readonly x: number; readonly z: number };

/** Lazily computed start indices of slots 10..14, filled in slot order (each depends on the earlier slots). */
const seededStarts: number[] = [];

function minDistance(p: Point, others: readonly Point[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const q of others) best = Math.min(best, Math.hypot(p.x - q.x, p.z - q.z));
  return best;
}

/** Start index of seeded slot n (10..14): computes and memoises every seeded slot up to n in order. */
function seededStartIndex(n: number): number {
  while (seededStarts.length <= n - PHASE1_SLOTS) {
    const slot = PHASE1_SLOTS + seededStarts.length;
    const route = NPC_ROUTES[routeIndexForNpc(slot)];
    const earlier: Point[] = [];
    for (let k = 0; k < slot; k++) earlier.push(spawnPointForNpc(k));
    // Fisher-Yates order of this route's point indices from the slot's own seed.
    const rng = mulberry32(BENCH_SEED + slot);
    const order = route.map((_, k) => k);
    for (let k = order.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      const t = order[k];
      order[k] = order[j];
      order[j] = t;
    }
    let pick = order.find((k) => minDistance(route[k], earlier) >= MIN_SPAWN_GAP - SPAWN_GAP_EPS);
    if (pick === undefined) {
      // No point clears every earlier spawn: take the one farthest from all of them (ties -> lower index).
      pick = 0;
      let bestD = -1;
      route.forEach((p, k) => {
        const d = minDistance(p, earlier);
        if (d > bestD) {
          bestD = d;
          pick = k;
        }
      });
    }
    seededStarts.push(pick);
  }
  return seededStarts[n - PHASE1_SLOTS];
}

/**
 * Route point a slot starts at (and dwells at first). Slots 0..9: i % route.length, exactly as Phase 1. Slots 10..14:
 * the first index of a mulberry32(BENCH_SEED + i) shuffle of the route whose point is >= MIN_SPAWN_GAP from every
 * spawn point of slots 0..i-1 (fallback: the point farthest from all of them). Pure and stable across calls.
 */
export function routeStartIndexForNpc(i: number): number {
  const n = npcIndex(i);
  if (n >= PHASE1_SLOTS) return seededStartIndex(n);
  return n % NPC_ROUTES[routeIndexForNpc(n)].length;
}

/** Spawn position of a slot: its route start point plus sharedIndexForNpc x SHARED_ROUTE_OFFSET on x. */
export function spawnPointForNpc(i: number): { x: number; z: number } {
  const route = NPC_ROUTES[routeIndexForNpc(i)];
  const start = route[routeStartIndexForNpc(i)];
  return { x: start.x + sharedIndexForNpc(i) * SHARED_ROUTE_OFFSET, z: start.z };
}

/**
 * Index of the route point farthest from (px, pz) (quick add away from the player, RESEARCH Pitfall 15). Ties keep
 * the lower index; non-finite points are skipped; -1 when the route is empty or has no finite point. With a
 * non-finite player position every distance is unknown, so the first finite point is returned.
 */
export function farthestRouteIndex(route: readonly { x: number; z: number }[], px: number, pz: number): number {
  let best = -1;
  let bestD = Number.NEGATIVE_INFINITY;
  const playerKnown = Number.isFinite(px) && Number.isFinite(pz);
  route.forEach((p, k) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
    const d = playerKnown ? Math.hypot(p.x - px, p.z - pz) : 0;
    if (best < 0 || d > bestD) {
      best = k;
      bestD = d;
    }
  });
  return best;
}

/** Axis-aligned static footprints the routes must clear (used by the unit test and handy for debugging). */
export interface Footprint {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function rect(id: string, x: number, z: number, halfW: number, halfD: number): Footprint {
  return { id, minX: x - halfW, maxX: x + halfW, minZ: z - halfD, maxZ: z + halfD };
}

/** Desks and pantry/wall furniture that NPCs must never walk through (sizes measured at layout ROLE_SCALE). */
export const ROUTE_OBSTACLES: Footprint[] = [
  ...DESKS.map((d) => rect(`${d.id}-desk`, d.x, d.z, DESK_HALF_W, DESK_HALF_D)),
  rect('pantry-counter', PANTRY.counter.x, PANTRY.counter.z, 0.645, 0.45),
  rect('pantry-fridge', PANTRY.fridge.x, PANTRY.fridge.z, 0.43, 0.29),
  rect('pantry-cooler', PANTRY.waterCooler.x, PANTRY.waterCooler.z, 0.175, 0.175),
  rect('bookcase', bookcase.x, bookcase.z, 0.4, 0.25),
  rect('printer', printer.x, printer.z, 0.45, 0.35),
];

/** z range of the desk block, exposed for tests. */
export const DESK_BLOCK = { minX: deskMinX, minZ: deskMinZ, maxZ: deskMaxZ } as const;

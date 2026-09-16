/**
 * NPC routes and the office geometry they have to respect.
 *
 * 16/09/2026 (operator quick fix, no plan): **each NPC walks its own seeded loop**. Until today slots 0..9 were mapped
 * onto the 5 hand-placed `NPC_ROUTES` and slots 10..14 reused the same 5 loops from a seeded start point (plan 02-03,
 * G3r), so every coworker added after the first few visibly retraced an older one. `routeForNpc(i)` now builds one
 * loop per slot with `logic/routeGen.ts`: 3-5 stops on free floor, its own walk speed and its own dwell times, all
 * from `seedFor(BENCH_SEED, 'npc-route-' + i)`. Same seed + same slot -> same loop, so ?bench=1 / ?soak=1 replay.
 *
 * `NPC_ROUTES` (hand-placed, D-11 / D-29, plans 01-14 and 01-23) is kept exactly as it was: `bench/benchScript.ts`
 * builds the ?bench=1 player waypoints from it (01-17) and the bench timeline must not change. No NPC walks it any
 * more; it stays the reference for where the interesting corners of the office are.
 *
 * Still no navmesh (Phase 3 scope): stops sit on a 0.5 m lattice of free floor and legs are straight lines rejected
 * unless they clear every keep-out.
 */
import {
  DEFAULT_ROUTE_CONFIG,
  generateRoute,
  type BlockCircle,
  type BlockRect,
  type NpcRoute,
  type RouteArea,
  type RouteGenConfig,
} from '../logic/routeGen';
import { BENCH_SEED, seedFor } from '../logic/rng';
import type { WaypointPoint } from '../logic/waypointWalker';
import { CORRIDOR, DESKS, PANTRY, PROP_PLACEMENTS, ROOM } from './layout';

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

/** Number of NPC slots (D-01: up to 15 NPCs); the highest slot index is 14. */
export const NPC_SLOT_COUNT = 15;
const MAX_NPC_INDEX = NPC_SLOT_COUNT - 1;
/** Minimum centre distance between two NPC spawn points (two 0.3 m capsules side by side). */
export const MIN_SPAWN_GAP = 0.6;

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

// ---------------------------------------------------------------------------------------------------------------
// Per-NPC seeded routes (16/09/2026 quick fix)
// ---------------------------------------------------------------------------------------------------------------

/** Free space kept from the walls, matching the >= 0.5 m the route unit test asks for. */
const WALL_MARGIN = 0.5;
/** Free space kept from desks, chairs and pantry furniture: the capsule plus ROUTE_CLEARANCE. */
const FURNITURE_MARGIN = NPC_RADIUS + ROUTE_CLEARANCE;
/** Centre distance kept from floor-standing props, so an NPC never shoves a trashcan, box or plant (plan 01-23). */
export const PROP_CLEARANCE = 0.6;
/** Kenney chairDesk at ROLE_SCALE 2 is about 0.63 m square; its back sits at desk z + 1.215 (see BEHIND_CHAIR_Z). */
const CHAIR_HALF = 0.315;
const CHAIR_Z_OFFSET = 0.9;
/** Floor-standing prop roles: they stand on the floor and get shoved, so routes keep PROP_CLEARANCE from them. */
const FLOOR_PROP_ROLES: ReadonlySet<string> = new Set(['trashcan', 'boxClosed', 'pottedPlant', 'plantSmall']);

function block(f: Footprint, margin: number): BlockRect {
  return { ...f, margin };
}

/** Floor props (`on` undefined: not standing on a desk) an NPC route must keep away from. */
const floorProps: BlockCircle[] = PROP_PLACEMENTS.filter((p) => FLOOR_PROP_ROLES.has(p.role) && p.on === undefined).map(
  (p) => ({ id: p.id, x: p.x, z: p.z, radius: PROP_CLEARANCE }),
);

/**
 * The office as the route generator sees it: the room inset by WALL_MARGIN, minus desks, chairs, pantry furniture,
 * the spawn / test-box corridor and every floor-standing prop. Chairs are in here but deliberately NOT in
 * ROUTE_OBSTACLES: the hand-placed routes stand right behind them on purpose (BEHIND_CHAIR_Z), generated stops do not.
 */
export const NPC_ROUTE_AREA: RouteArea = {
  minX: -ROOM.width / 2 + WALL_MARGIN,
  maxX: ROOM.width / 2 - WALL_MARGIN,
  minZ: -ROOM.depth / 2 + WALL_MARGIN,
  maxZ: ROOM.depth / 2 - WALL_MARGIN,
  gridStep: 0.5,
  rects: [
    ...ROUTE_OBSTACLES.map((f) => block(f, FURNITURE_MARGIN)),
    ...DESKS.map((d) => block(rect(`${d.id}-chair`, d.x, d.z + CHAIR_Z_OFFSET, CHAIR_HALF, CHAIR_HALF), FURNITURE_MARGIN)),
    block({ id: 'corridor', ...CORRIDOR }, NPC_RADIUS),
  ],
  circles: floorProps,
};

/** Bands for this office; only minSpawnGap is pinned to a game constant (two capsules side by side). */
export const NPC_ROUTE_CONFIG: RouteGenConfig = { ...DEFAULT_ROUTE_CONFIG, minSpawnGap: MIN_SPAWN_GAP };

/** One generated loop per slot, filled in slot order: slot n avoids the spawn points of slots 0..n-1 and nothing else. */
const routeCache: NpcRoute[] = [];

function npcRoute(n: number): NpcRoute {
  while (routeCache.length <= n) {
    const slot = routeCache.length;
    const taken = routeCache.map((r) => r.stops[0]);
    routeCache.push(generateRoute(NPC_ROUTE_AREA, NPC_ROUTE_CONFIG, seedFor(BENCH_SEED, `npc-route-${slot}`), taken));
  }
  return routeCache[n];
}

/**
 * This NPC's own patrol loop (3-5 stops, each with its own dwell). The index is truncated and clamped to 0..14.
 * A fresh copy every call, so a caller that edits its route cannot corrupt the slot for the next respawn.
 */
export function routeForNpc(i: number): WaypointPoint[] {
  return npcRoute(npcIndex(i)).stops.map((p) => ({ ...p }));
}

/** This NPC's walk speed in m/s (NPC_ROUTE_CONFIG speed band around WALK_SPEED 1.4). */
export function walkSpeedForNpc(i: number): number {
  return npcRoute(npcIndex(i)).speed;
}

/** Spawn position of a slot: the first stop of its own route. */
export function spawnPointForNpc(i: number): { x: number; z: number } {
  const start = npcRoute(npcIndex(i)).stops[0];
  return { x: start.x, z: start.z };
}

/**
 * Waypoint index a spawned NPC heads for. It stands on stop 0, so aiming at stop 1 makes it set off at once instead of
 * standing still for its first dwell (up to 5 s of statues right after the office loads, and an NPC that a 4 s e2e
 * window never sees move). It still dwells at stop 0 when the loop comes back round.
 */
export const ROUTE_START_INDEX = 1;

/**
 * Hand-placed NPC routes (D-11): desk <-> pantry loops built from layout.ts constants. Straight segments between
 * points; the walker pauses `dwellSec` at each one. Pure data (no three.js), so Vitest checks the geometry.
 *
 * Aisles: the NPCs stay out of the spawn / test-box corridor (layout CORRIDOR) and reach the pantry along a lane
 * north of the first desk row, entering and leaving the desk area around the west end of the desks.
 */
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
const d3 = desk('d3');
const d4 = desk('d4');
const printer = placement('printer');
const bookcase = placement('bookcase');

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
];

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

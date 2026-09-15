/**
 * Office layout (D-10): the single source of room dimensions, spawn and every furniture / prop placement.
 * Units are metres, floor y = 0, and -Z is "up" on screen at camera yaw 0. Phases 2–3 reuse this data
 * (NPC routes desk <-> pantry, coffee prank), so nothing else hardcodes coordinates.
 */

export const ROOM = { width: 16, depth: 12, wallHeight: 2.8 } as const;

export const PLAYER_SPAWN = { x: 0, z: 2 } as const;

/** Kept from plan 01-03 so the controls e2e (E near / far from the box) stays valid. */
export const TEST_BOX = { x: 0, z: -0.5 } as const;
/** Prop id of the box at TEST_BOX; also backs the 01-03 `__bt.box` key. */
export const TEST_BOX_ID = 'box-test';

export const DESKS: ReadonlyArray<{ id: string; x: number; z: number }> = [
  { id: 'd1', x: -5, z: -3 },
  { id: 'd2', x: -2.8, z: -3 },
  { id: 'd3', x: -5, z: 0.4 },
  { id: 'd4', x: -2.8, z: 0.4 },
];

export const PANTRY = {
  counter: { x: 5.5, z: -4.8 },
  coffeeMachine: { x: 5.0, z: -4.8 },
  fridge: { x: 7.2, z: -4.6 },
  waterCooler: { x: 3.6, z: -5.2 },
} as const;

export type PlacementKind = 'static' | 'prop' | 'breakable';

export interface Placement {
  id: string;
  /** office-index.json role, or a primitive role ('printer', 'waterCooler'). */
  role: string;
  /** Centre of the object's footprint. */
  x: number;
  z: number;
  /** Extra height above the supporting surface (floor, or the top of `on`). */
  y?: number;
  yawDeg?: number;
  kind: PlacementKind;
  /** Id of a static placement this object stands on; its top y is measured from the bounding box at runtime. */
  on?: string;
}

/** Roles built from three.js primitives in Furniture Kit colours (not in the kit, CC0 by construction, D-09). */
export const PRIMITIVE_ROLES: ReadonlySet<string> = new Set(['printer', 'waterCooler']);

/**
 * Kenney Furniture Kit models are authored at roughly half real size (desk 0.73 x 0.38 m tall), and the Food Kit
 * mug is 0.34 m wide. Scale factors bring them to metres next to the 1.5 m player capsule. [x, y, z].
 */
export const ROLE_SCALE: Readonly<Record<string, readonly [number, number, number]>> = {
  desk: [2, 2, 2],
  chairDesk: [2, 2, 2],
  computerScreen: [1.6, 1.6, 1.6],
  computerKeyboard: [1.6, 1.6, 1.6],
  computerMouse: [2, 2, 2],
  laptop: [1.4, 1.4, 1.4],
  coffeeMachine: [2, 2, 2],
  fridge: [2, 2, 2],
  pantryCounter: [3, 2, 2], // a stretched kitchen cabinet reads as a counter and carries the coffee machine
  pottedPlant: [2, 2, 2],
  plantSmall: [3, 3, 3],
  trashcan: [1.6, 1.6, 1.6],
  bookcase: [2, 2, 2],
  books: [2, 2, 2],
  boxClosed: [2, 2, 2],
  mug: [0.4, 0.4, 0.4],
  printer: [1, 1, 1],
  waterCooler: [1, 1, 1],
};

export function roleScale(role: string): readonly [number, number, number] {
  return ROLE_SCALE[role] ?? [1, 1, 1];
}

/** Chairs face their desk (the chair model's seat opens toward +Z, so 180° turns it toward -Z). */
const CHAIR_YAW_DEG = 180;

function deskPlacements(): Placement[] {
  const out: Placement[] = [];
  for (const d of DESKS) {
    out.push({ id: `${d.id}-desk`, role: 'desk', x: d.x, z: d.z, kind: 'static' });
    out.push({ id: `${d.id}-chair`, role: 'chairDesk', x: d.x, z: d.z + 0.9, yawDeg: CHAIR_YAW_DEG, kind: 'prop' });
    // Desk top, offsets from the desk centre (desk footprint about 1.47 x 0.78 m).
    const on = `${d.id}-desk`;
    out.push({ id: `${d.id}-screen`, role: 'computerScreen', x: d.x - 0.25, z: d.z - 0.2, kind: 'breakable', on });
    out.push({ id: `${d.id}-keyboard`, role: 'computerKeyboard', x: d.x - 0.25, z: d.z + 0.15, kind: 'prop', on });
    out.push({ id: `${d.id}-mouse`, role: 'computerMouse', x: d.x + 0.12, z: d.z + 0.15, kind: 'prop', on });
    out.push({ id: `${d.id}-mug`, role: 'mug', x: d.x + 0.55, z: d.z - 0.2, kind: 'breakable', on });
  }
  return out;
}

export const PROP_PLACEMENTS: ReadonlyArray<Placement> = [
  ...deskPlacements(),
  // Desk extras.
  { id: 'd4-laptop', role: 'laptop', x: DESKS[3].x + 0.4, z: DESKS[3].z + 0.15, kind: 'prop', on: 'd4-desk' },
  { id: 'd2-books', role: 'books', x: DESKS[1].x + 0.28, z: DESKS[1].z - 0.25, kind: 'prop', on: 'd2-desk' },
  { id: 'd3-books', role: 'books', x: DESKS[2].x + 0.28, z: DESKS[2].z - 0.25, kind: 'prop', on: 'd3-desk' },

  // Pantry corner.
  { id: 'pantry-counter', role: 'pantryCounter', x: PANTRY.counter.x, z: PANTRY.counter.z, kind: 'static' },
  {
    id: 'pantry-coffee',
    role: 'coffeeMachine',
    x: PANTRY.coffeeMachine.x,
    z: PANTRY.coffeeMachine.z,
    kind: 'static',
    on: 'pantry-counter',
  },
  { id: 'pantry-fridge', role: 'fridge', x: PANTRY.fridge.x, z: PANTRY.fridge.z, kind: 'static' },
  { id: 'pantry-cooler', role: 'waterCooler', x: PANTRY.waterCooler.x, z: PANTRY.waterCooler.z, kind: 'prop' },

  // Along the walls.
  { id: 'bookcase', role: 'bookcase', x: 0.8, z: -5.6, kind: 'static' },
  { id: 'printer', role: 'printer', x: -7.2, z: 3.5, kind: 'prop' },
  { id: 'trash-1', role: 'trashcan', x: -1.6, z: -1.2, kind: 'prop' },
  { id: 'trash-2', role: 'trashcan', x: 6.0, z: 2.5, kind: 'prop' },
  { id: 'box-1', role: 'boxClosed', x: 4.5, z: 4.8, kind: 'prop' },
  { id: 'box-2', role: 'boxClosed', x: 5.2, z: 4.8, kind: 'prop' },
  { id: TEST_BOX_ID, role: 'boxClosed', x: TEST_BOX.x, z: TEST_BOX.z, kind: 'prop' },

  // Plants (breakable, D-13).
  { id: 'plant-big', role: 'pottedPlant', x: -7.3, z: -5.3, kind: 'breakable' },
  { id: 'plant-small-1', role: 'plantSmall', x: 7.3, z: 5.2, kind: 'breakable' },
  { id: 'plant-small-2', role: 'plantSmall', x: 2.2, z: -1.8, kind: 'breakable' },
];

/** Corridor from spawn to the test box that must stay free of anything but TEST_BOX. */
export const CORRIDOR = { minX: -1, maxX: 1, minZ: -1.5, maxZ: 3 } as const;

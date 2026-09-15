/**
 * Looped waypoint walker (D-11): an NPC walks straight lines between hand-placed points and pauses at each one.
 * No navmesh, no timetable (DETECT-07 is Phase 2). Pure TypeScript, no three.js / DOM, so Vitest covers it (TECH-06).
 *
 * Coordinates are world metres on the floor plane. The walker owns the position: it integrates it itself, clamped
 * so a step never overshoots, and the entity copies it into its kinematic body. The entity and the walker therefore
 * never disagree about where the NPC is.
 */

export interface WaypointPoint {
  x: number;
  z: number;
  /** Pause at this point in seconds; 0 walks straight on to the next point. */
  dwellSec: number;
}

export interface WalkerState {
  /** Index of the point being walked to (mode 'walk') or dwelt at (mode 'dwell'). */
  index: number;
  x: number;
  z: number;
  mode: 'walk' | 'dwell';
  dwellLeft: number;
  /** A frozen walker neither moves nor counts its dwell down (e.g. while the NPC is a ragdoll). */
  frozen: boolean;
}

export interface WalkerStep {
  state: WalkerState;
  /** Velocity actually made this step in m/s (displacement / dt); 0 while dwelling or frozen. */
  vx: number;
  vz: number;
  /**
   * Three.js Y rotation that faces the direction of travel: atan2(dx, dz), so +Z is 0 and +X is PI/2.
   * Only meaningful while moving; it is 0 when the step made no displacement, so callers keep their last facing.
   */
  facingYaw: number;
}

export const WALK_SPEED = 1.4; // m/s
export const ARRIVE_RADIUS = 0.15; // m

function wrapIndex(i: number, n: number): number {
  if (n <= 0 || !Number.isFinite(i)) return 0;
  const k = Math.trunc(i) % n;
  return k < 0 ? k + n : k;
}

function finiteOr(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

export function createWalker(points: WaypointPoint[], start: { x: number; z: number }, startIndex = 0): WalkerState {
  return {
    index: wrapIndex(startIndex, points.length),
    x: finiteOr(start.x, 0),
    z: finiteOr(start.z, 0),
    mode: 'walk',
    dwellLeft: 0,
    frozen: false,
  };
}

/** Returns a new state; the input state is never mutated. */
export function stepWalker(
  s: WalkerState,
  points: WaypointPoint[],
  dt: number,
  speed = WALK_SPEED,
  arriveRadius = ARRIVE_RADIUS,
): WalkerStep {
  const next: WalkerState = { ...s };
  const n = points.length;
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
  if (s.frozen || n === 0 || step === 0) return { state: next, vx: 0, vz: 0, facingYaw: 0 };

  next.index = wrapIndex(s.index, n);

  if (next.mode === 'dwell') {
    next.dwellLeft = finiteOr(next.dwellLeft, 0) - step;
    if (next.dwellLeft <= 0) {
      next.dwellLeft = 0;
      next.mode = 'walk';
      next.index = wrapIndex(next.index + 1, n);
    }
    return { state: next, vx: 0, vz: 0, facingYaw: 0 };
  }

  const target = points[next.index];
  const dx = target.x - next.x;
  const dz = target.z - next.z;
  const dist = Math.hypot(dx, dz);
  const reach = Math.max(0, finiteOr(speed, WALK_SPEED)) * step;

  let vx = 0;
  let vz = 0;
  let facingYaw = 0;
  let remaining = dist;
  if (dist > 1e-9 && reach > 0) {
    if (reach >= dist) {
      // Land exactly on the point: no overshoot, no floating-point residue.
      next.x = target.x;
      next.z = target.z;
      remaining = 0;
      vx = dx / step;
      vz = dz / step;
    } else {
      const k = reach / dist;
      next.x += dx * k;
      next.z += dz * k;
      remaining = dist - reach;
      vx = (dx * k) / step;
      vz = (dz * k) / step;
    }
    facingYaw = Math.atan2(dx, dz);
  }

  if (remaining <= Math.max(0, finiteOr(arriveRadius, ARRIVE_RADIUS))) {
    const dwell = finiteOr(target.dwellSec, 0);
    if (dwell > 0) {
      next.mode = 'dwell';
      next.dwellLeft = dwell;
    } else {
      next.index = wrapIndex(next.index + 1, n);
    }
  }
  return { state: next, vx, vz, facingYaw };
}

/** Index of the point closest to (x, z); ties go to the lower index; -1 for an empty list. */
export function nearestIndex(points: WaypointPoint[], x: number, z: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = Math.hypot(points[i].x - x, points[i].z - z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

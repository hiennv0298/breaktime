/**
 * NPC strike hit test (D-08, RESEARCH Pattern 5). Pure: no three.js / Rapier / DOM (D-12).
 *
 * The test runs once, at the impact frame at the end of the 0.6 s wind-up. A strike lands only when the player's
 * body edge is within STRIKE_REACH of the NPC centre and inside a STRIKE_FOV_DEG cone around the NPC facing.
 * A player walking away at 3.2 m/s covers 1.9 m during the wind-up and is out of reach, so dodging needs no button.
 *
 * Facing follows the NPC walker convention (waypointWalker facingYaw = atan2(dx, dz)): direction (sin yaw, cos yaw).
 * This differs from the player's (-sin yaw, -cos yaw) in nearest.ts. NPCs only ever strike the player (NPCs never
 * hit other NPCs, CONTEXT Deferred).
 */

/** Reach (m) from the NPC centre to the player's body edge. */
export const STRIKE_REACH = 1.2;
/** Full cone angle (deg) around the NPC facing. */
export const STRIKE_FOV_DEG = 100;
/** Player capsule radius (m). */
export const PLAYER_BODY_RADIUS = 0.3;
/** Edge distance (m) at which a pursuer starts its wind-up (inside STRIKE_REACH, so standing still gets hit). */
export const ATTACK_START_DIST = 1.0;

const EPS = 1e-9;

/** max(0, centre distance - radius); any non-finite input gives Infinity (never in reach). */
export function edgeDistance(ax: number, az: number, bx: number, bz: number, radius: number): number {
  if (!Number.isFinite(ax) || !Number.isFinite(az) || !Number.isFinite(bx) || !Number.isFinite(bz)) return Infinity;
  if (!Number.isFinite(radius)) return Infinity;
  const centre = Math.hypot(bx - ax, bz - az);
  if (!Number.isFinite(centre)) return Infinity;
  return Math.max(0, centre - radius);
}

export function strikeHits(
  p: { npcX: number; npcZ: number; npcYaw: number; targetX: number; targetZ: number; targetRadius?: number },
  opts: { reach?: number; fovDeg?: number } = {},
): boolean {
  if (!Number.isFinite(p.npcYaw)) return false;
  const radius = p.targetRadius ?? PLAYER_BODY_RADIUS;
  const reach = opts.reach ?? STRIKE_REACH;
  const fovDeg = opts.fovDeg ?? STRIKE_FOV_DEG;

  const dist = edgeDistance(p.npcX, p.npcZ, p.targetX, p.targetZ, radius);
  if (!Number.isFinite(dist) || !(dist <= reach + EPS)) return false;

  const dx = p.targetX - p.npcX;
  const dz = p.targetZ - p.npcZ;
  const centre = Math.hypot(dx, dz);
  // A target on top of the NPC has no direction: treat it as in front.
  if (centre <= EPS || fovDeg >= 360) return true;

  const cosHalf = Math.cos(((fovDeg / 2) * Math.PI) / 180);
  const fx = Math.sin(p.npcYaw);
  const fz = Math.cos(p.npcYaw);
  return (dx * fx + dz * fz) / centre >= cosHalf - EPS;
}

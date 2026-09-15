import type { IconName } from '../input/touchButtons';

/** What the context action does to a target (D-18). NPC candidates arrive in plans 01-14 / 01-15. */
export type TargetKind = 'prop' | 'breakable' | 'npc';

export interface Candidate {
  id: string;
  x: number;
  z: number;
  /** Footprint radius; subtracted from the centre distance so big objects are reachable from their edge. */
  radius: number;
  kind: TargetKind;
}

export const DEFAULT_MAX_DIST = 1.6; // m
export const DEFAULT_FOV_DEG = 140;

const EPS = 1e-9;

/**
 * Nearest interactable in front of the player (pure, allocation-free).
 * Facing is (-sin yaw, -cos yaw) like player.ts. Distance = max(0, centre distance - radius); a candidate is in
 * front when the angle between facing and the direction to its centre is <= fovDeg / 2. Ties break by id.
 */
export function pickNearest(
  player: { x: number; z: number; yawRad: number },
  cands: readonly Candidate[],
  opts: { maxDist?: number; fovDeg?: number } = {},
): Candidate | null {
  const maxDist = opts.maxDist ?? DEFAULT_MAX_DIST;
  const fovDeg = opts.fovDeg ?? DEFAULT_FOV_DEG;
  const cosHalf = fovDeg >= 360 ? -1 : Math.cos(((fovDeg / 2) * Math.PI) / 180);
  const fx = -Math.sin(player.yawRad);
  const fz = -Math.cos(player.yawRad);

  let best: Candidate | null = null;
  let bestDist = Infinity;
  for (const c of cands) {
    const dx = c.x - player.x;
    const dz = c.z - player.z;
    const centre = Math.hypot(dx, dz);
    if (!Number.isFinite(centre)) continue;
    const r = Number.isFinite(c.radius) && c.radius > 0 ? c.radius : 0;
    const dist = Math.max(0, centre - r);
    if (dist > maxDist + EPS) continue;
    // A centre on top of the player has no direction: treat it as in front.
    if (centre > EPS && (dx * fx + dz * fz) / centre < cosHalf - EPS) continue;
    if (best === null || dist < bestDist - EPS || (Math.abs(dist - bestDist) <= EPS && c.id < best.id)) {
      best = c;
      bestDist = dist;
    }
  }
  return best;
}

/** Context button icon for the current target (D-18). */
export function iconFor(kind: TargetKind | null): IconName {
  if (kind === 'prop' || kind === 'breakable') return 'push';
  if (kind === 'npc') return 'slap';
  return 'none';
}

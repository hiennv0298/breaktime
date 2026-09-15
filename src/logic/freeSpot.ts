/**
 * Stand-up placement candidates after a knockdown (D-06 "tự đứng dậy", RESEARCH Pattern 8 / Pitfall 4). Pure (D-12).
 *
 * Order: the landing point first, then FREE_SPOT_DIRS directions (k / 8 x 2 PI, starting at +X) on rings every
 * FREE_SPOT_STEP_M up to FREE_SPOT_MAX_M. Every point is clamped inside the room minus a margin. The caller (plan 02-11)
 * tests the player capsule at each candidate with a Rapier intersection query and falls back to the spawn point when
 * all 41 are blocked (T-02-02-03: bounded, never throws).
 */

export const FREE_SPOT_STEP_M = 0.4;
export const FREE_SPOT_MAX_M = 2.0;
export const FREE_SPOT_DIRS = 8;

/** Ring count derived once so the last ring is exactly FREE_SPOT_MAX_M (integer counter, no accumulated 0.4). */
const RINGS = Math.round(FREE_SPOT_MAX_M / FREE_SPOT_STEP_M);

function limit(half: number, margin: number): number {
  const h = Number.isFinite(half) && half > 0 ? half : 0;
  const m = Number.isFinite(margin) && margin > 0 ? margin : 0;
  return Math.max(0, h - m);
}

function clamp(v: number, lim: number): number {
  return Math.max(-lim, Math.min(lim, v));
}

export function freeSpotCandidates(
  x: number,
  z: number,
  bounds: { halfX: number; halfZ: number; margin: number },
): Array<{ x: number; z: number }> {
  const limX = limit(bounds.halfX, bounds.margin);
  const limZ = limit(bounds.halfZ, bounds.margin);
  const finite = Number.isFinite(x) && Number.isFinite(z);
  const cx = clamp(finite ? x : 0, limX);
  const cz = clamp(finite ? z : 0, limZ);

  const out: Array<{ x: number; z: number }> = [{ x: cx, z: cz }];
  for (let ring = 1; ring <= RINGS; ring++) {
    const r = (ring * FREE_SPOT_MAX_M) / RINGS;
    for (let k = 0; k < FREE_SPOT_DIRS; k++) {
      const a = (k / FREE_SPOT_DIRS) * Math.PI * 2;
      out.push({ x: clamp(cx + Math.cos(a) * r, limX), z: clamp(cz + Math.sin(a) * r, limZ) });
    }
  }
  return out;
}

/**
 * `?npcAt=x,z` test/bench parameter (plan 01-15): pins NPC 0 to a floor point with its walker frozen until the first
 * slap. Visitor-controlled, so it is parsed strictly (T-01-15-01): exactly two finite numbers, clamped inside the room
 * minus a margin; anything else is ignored. Pure, no DOM (TECH-06).
 */
export function parseNpcAt(
  search: string,
  bounds: { halfX: number; halfZ: number; margin: number },
): { x: number; z: number } | null {
  const raw = new URLSearchParams(search).get('npcAt');
  if (raw === null || raw.length > 64) return null;
  const parts = raw.split(',');
  if (parts.length !== 2) return null;
  if (parts.some((p) => p.trim() === '')) return null;
  const x = Number(parts[0]);
  const z = Number(parts[1]);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const limX = Math.max(0, bounds.halfX - bounds.margin);
  const limZ = Math.max(0, bounds.halfZ - bounds.margin);
  return { x: Math.min(limX, Math.max(-limX, x)), z: Math.min(limZ, Math.max(-limZ, z)) };
}

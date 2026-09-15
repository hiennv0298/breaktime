/**
 * Pure impact rules (D-13 break, D-15 drop/break SFX; TECH-06). No three, no DOM, no Rapier.
 *
 * Forces are whatever unit the caller measures in; the game passes contact force per kg of the prop (N/kg), because
 * every prop has density 1 and a raw Newton threshold would depend on the object's size (see plan 01-16 summary).
 */

export type BreakRole = 'mug' | 'computerScreen' | 'pottedPlant' | 'plantSmall';

const SHARDS: Readonly<Record<BreakRole, number>> = Object.freeze({
  mug: 5,
  pottedPlant: 6,
  plantSmall: 6,
  computerScreen: 8,
});

/** Pieces of the shared shard kit a breakable bursts into (5..8, D-13). */
export function shardCountFor(role: BreakRole): number {
  return SHARDS[role] ?? 5;
}

/** True only for a finite force at or above the role's threshold. */
export function shouldBreak(role: BreakRole, force: number, thresholds: Record<BreakRole, number>): boolean {
  const t = thresholds[role];
  return Number.isFinite(force) && Number.isFinite(t) && force >= t;
}

/** SFX family for a break: screens are glass, mugs and plant pots are ceramic. */
export function breakSoundFor(role: BreakRole): 'break-glass' | 'break-ceramic' {
  return role === 'computerScreen' ? 'break-glass' : 'break-ceramic';
}

/** Default minimum force for a drop sound. */
export const DROP_MIN_FORCE = 15;
/** Per-prop cooldown between two drop sounds (T-01-16-02). */
export const DROP_COOLDOWN_MS = 250;

const METAL = new Set(['trashcan', 'printer', 'laptop']);
const SOFT = new Set(['books', 'boxClosed', 'waterCooler', 'computerMouse']);

/**
 * Drop SFX for a non-breakable prop hitting something, or null (too soft, or still inside its cooldown).
 * Metal bins/printers/laptops -> drop-metal-0; books, boxes, the plastic cooler and the mouse -> drop-soft-0;
 * chairs, keyboards and anything else -> drop-wood-0, or drop-wood-1 for a landing at least twice minForce.
 */
export function dropSoundFor(
  role: string,
  force: number,
  lastMs: number,
  nowMs: number,
  opts?: { minForce?: number; cooldownMs?: number },
): string | null {
  const minForce = opts?.minForce ?? DROP_MIN_FORCE;
  const cooldownMs = opts?.cooldownMs ?? DROP_COOLDOWN_MS;
  if (!Number.isFinite(force) || !(force >= minForce)) return null;
  if (nowMs - lastMs < cooldownMs) return null;
  if (METAL.has(role)) return 'drop-metal-0';
  if (SOFT.has(role)) return 'drop-soft-0';
  return force >= minForce * 2 ? 'drop-wood-1' : 'drop-wood-0';
}

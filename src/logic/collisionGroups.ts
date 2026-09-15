/**
 * Rapier interaction-group math for ragdolls (D-01 cap 15 = 16 bits, RESEARCH Pitfall 5). Pure: no Rapier import (D-12).
 *
 * Rapier packs groups as (membership << 16) | filter. Two colliders interact when
 * (a.membership & b.filter) != 0 and (b.membership & a.filter) != 0. World colliders keep the default 0xffffffff.
 *
 * - NPC ragdoll index 0..14 owns membership bit 1 + index and filters every other bit: its parts ignore each other
 *   but hit the world, other NPC ragdolls and the player ragdoll.
 * - The player ragdoll owns bit 0 (unused by NPC ragdolls) with the same rule.
 *
 * npcRagdollGroups reproduces src/physics/ragdoll.ts ragdollGroups exactly; plan 02-11 switches ragdoll.ts to these
 * functions (this plan does not touch ragdoll.ts).
 */

/** Highest NPC ragdoll index: 15 NPCs (0..14) use bits 1..15. */
export const NPC_RAGDOLL_MAX_INDEX = 14;

function packGroups(member: number): number {
  return ((member << 16) | (0xffff & ~member)) >>> 0;
}

/** Groups for NPC ragdoll `index` (clamped to 0..NPC_RAGDOLL_MAX_INDEX, truncated; non-finite -> 0). */
export function npcRagdollGroups(index: number): number {
  const g = Math.max(0, Math.min(NPC_RAGDOLL_MAX_INDEX, Math.trunc(Number.isFinite(index) ? index : 0)));
  return packGroups(1 << (1 + g));
}

/** Player ragdoll: membership bit 0, filter every bit except 0 (0x0001fffe). */
export const PLAYER_RAGDOLL_GROUPS: number = packGroups(1);

/** Default Rapier groups of world colliders: member of and interacting with everything. */
export const WORLD_GROUPS = 0xffffffff;

/** Rapier's interaction rule for two packed group values. */
export function groupsInteract(a: number, b: number): boolean {
  return ((a >>> 16) & (b & 0xffff)) !== 0 && ((b >>> 16) & (a & 0xffff)) !== 0;
}

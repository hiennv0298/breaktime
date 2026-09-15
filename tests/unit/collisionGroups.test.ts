import { describe, expect, it } from 'vitest';
import {
  groupsInteract,
  NPC_RAGDOLL_MAX_INDEX,
  npcRagdollGroups,
  PLAYER_RAGDOLL_GROUPS,
  WORLD_GROUPS,
} from '../../src/logic/collisionGroups';

const NPC_INDICES = Array.from({ length: NPC_RAGDOLL_MAX_INDEX + 1 }, (_, i) => i);

describe('collision group constants (D-01)', () => {
  it('15 NPC indices (0..14) plus the player fill the 16 bits', () => {
    expect(NPC_RAGDOLL_MAX_INDEX).toBe(14);
    expect(PLAYER_RAGDOLL_GROUPS).toBe(0x0001fffe);
    expect(WORLD_GROUPS).toBe(0xffffffff);
  });
});

describe('npcRagdollGroups', () => {
  it('reproduces ragdoll.ts ragdollGroups numbers', () => {
    expect(npcRagdollGroups(0)).toBe(0x0002fffd);
    expect(npcRagdollGroups(14)).toBe(0x80007fff);
    for (const i of NPC_INDICES) {
      const member = 1 << (1 + i);
      expect(npcRagdollGroups(i)).toBe(((member << 16) | (0xffff & ~member)) >>> 0);
    }
  });

  it('clamps out-of-range and non-finite indices', () => {
    expect(npcRagdollGroups(99)).toBe(npcRagdollGroups(14));
    expect(npcRagdollGroups(15)).toBe(npcRagdollGroups(14));
    expect(npcRagdollGroups(-3)).toBe(npcRagdollGroups(0));
    expect(npcRagdollGroups(Number.NaN)).toBe(npcRagdollGroups(0));
    expect(npcRagdollGroups(Infinity)).toBe(npcRagdollGroups(0));
    expect(npcRagdollGroups(2.9)).toBe(npcRagdollGroups(2));
  });

  it('always returns an unsigned 32-bit number', () => {
    for (const i of NPC_INDICES) {
      const g = npcRagdollGroups(i);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(0xffffffff);
      expect(Number.isInteger(g)).toBe(true);
    }
  });
});

describe('groupsInteract matrix (16 x 16 + world)', () => {
  it('parts of one NPC ragdoll ignore each other', () => {
    for (const i of NPC_INDICES) expect(groupsInteract(npcRagdollGroups(i), npcRagdollGroups(i))).toBe(false);
  });

  it('different NPC ragdolls collide', () => {
    for (const i of NPC_INDICES)
      for (const j of NPC_INDICES) if (i !== j) expect(groupsInteract(npcRagdollGroups(i), npcRagdollGroups(j))).toBe(true);
  });

  it('every NPC ragdoll collides with the player ragdoll, both ways', () => {
    for (const i of NPC_INDICES) {
      expect(groupsInteract(npcRagdollGroups(i), PLAYER_RAGDOLL_GROUPS)).toBe(true);
      expect(groupsInteract(PLAYER_RAGDOLL_GROUPS, npcRagdollGroups(i))).toBe(true);
    }
  });

  it('parts of the player ragdoll ignore each other', () => {
    expect(groupsInteract(PLAYER_RAGDOLL_GROUPS, PLAYER_RAGDOLL_GROUPS)).toBe(false);
  });

  it('the world collides with every group', () => {
    const all = [...NPC_INDICES.map((i) => npcRagdollGroups(i)), PLAYER_RAGDOLL_GROUPS, WORLD_GROUPS];
    for (const g of all) {
      expect(groupsInteract(WORLD_GROUPS, g)).toBe(true);
      expect(groupsInteract(g, WORLD_GROUPS)).toBe(true);
    }
  });

  it('the 16 memberships are pairwise distinct single bits', () => {
    const memberships = [...NPC_INDICES.map((i) => npcRagdollGroups(i) >>> 16), PLAYER_RAGDOLL_GROUPS >>> 16];
    expect(memberships).toHaveLength(16);
    for (const m of memberships) {
      expect(m).toBeGreaterThan(0);
      expect(m & (m - 1)).toBe(0);
    }
    expect(new Set(memberships).size).toBe(16);
    expect(memberships.reduce((acc, m) => acc | m, 0)).toBe(0xffff);
  });
});

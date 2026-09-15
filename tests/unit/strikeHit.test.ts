import { describe, expect, it } from 'vitest';
import {
  ATTACK_START_DIST,
  edgeDistance,
  PLAYER_BODY_RADIUS,
  STRIKE_FOV_DEG,
  STRIKE_REACH,
  strikeHits,
} from '../../src/logic/strikeHit';

const DEG = Math.PI / 180;

/** Target whose body edge is `edge` metres from an NPC at the origin, `deg` degrees off +Z (yaw 0 facing). */
function at(edge: number, deg: number, radius = PLAYER_BODY_RADIUS): { targetX: number; targetZ: number } {
  const centre = edge + radius;
  return { targetX: Math.sin(deg * DEG) * centre, targetZ: Math.cos(deg * DEG) * centre };
}

describe('strikeHit constants (D-08)', () => {
  it('pin reach, cone, body radius and attack start distance', () => {
    expect(STRIKE_REACH).toBe(1.2);
    expect(STRIKE_FOV_DEG).toBe(100);
    expect(PLAYER_BODY_RADIUS).toBe(0.3);
    expect(ATTACK_START_DIST).toBe(1.0);
  });
});

describe('edgeDistance', () => {
  it('subtracts the radius from the centre distance', () => {
    expect(edgeDistance(0, 0, 1.5, 0, 0.3)).toBe(1.2);
  });

  it('clamps overlap to 0', () => {
    expect(edgeDistance(0, 0, 0.1, 0, 0.3)).toBe(0);
  });

  it('returns Infinity for non-finite input', () => {
    expect(edgeDistance(Number.NaN, 0, 1, 0, 0.3)).toBe(Infinity);
    expect(edgeDistance(0, 0, Infinity, 0, 0.3)).toBe(Infinity);
    expect(edgeDistance(0, 0, 1, Number.NaN, 0.3)).toBe(Infinity);
    expect(edgeDistance(0, 0, 1, 0, Number.NaN)).toBe(Infinity);
  });
});

describe('strikeHits (yaw 0 faces +Z)', () => {
  const npc = { npcX: 0, npcZ: 0, npcYaw: 0 };

  it('hits a target whose edge is exactly at reach (inclusive)', () => {
    expect(strikeHits({ ...npc, targetX: 0, targetZ: 1.5, targetRadius: 0.3 })).toBe(true);
  });

  it('misses just beyond reach', () => {
    expect(strikeHits({ ...npc, targetX: 0, targetZ: 1.5001, targetRadius: 0.3 })).toBe(false);
  });

  it('misses a target behind the NPC', () => {
    expect(strikeHits({ ...npc, targetX: 0, targetZ: -1.0 })).toBe(false);
  });

  it('hits at 50 deg off facing (half cone) and misses at 50.1 deg', () => {
    expect(strikeHits({ ...npc, ...at(1.0, 50) })).toBe(true);
    expect(strikeHits({ ...npc, ...at(1.0, -50) })).toBe(true);
    expect(strikeHits({ ...npc, ...at(1.0, 50.1) })).toBe(false);
    expect(strikeHits({ ...npc, ...at(1.0, -50.1) })).toBe(false);
  });

  it('hits a target standing on top of the NPC', () => {
    expect(strikeHits({ ...npc, targetX: 0, targetZ: 0 })).toBe(true);
  });

  it('defaults targetRadius to PLAYER_BODY_RADIUS', () => {
    expect(strikeHits({ ...npc, targetX: 0, targetZ: 1.5 })).toBe(true);
    expect(strikeHits({ ...npc, targetX: 0, targetZ: 1.5001 })).toBe(false);
  });
});

describe('strikeHits facing convention (sin yaw, cos yaw)', () => {
  it('yaw PI/2 faces +X', () => {
    const npc = { npcX: 0, npcZ: 0, npcYaw: Math.PI / 2 };
    expect(strikeHits({ ...npc, targetX: 1.0, targetZ: 0 })).toBe(true);
    expect(strikeHits({ ...npc, targetX: 0, targetZ: 1.0 })).toBe(false);
  });

  it('works away from the origin', () => {
    const npc = { npcX: 5, npcZ: -3, npcYaw: Math.PI };
    expect(strikeHits({ ...npc, targetX: 5, targetZ: -4 })).toBe(true);
    expect(strikeHits({ ...npc, targetX: 5, targetZ: -2 })).toBe(false);
  });
});

describe('dodging by walking away (D-08)', () => {
  it('a player at edge 1.0 who walks away at 3.2 m/s for the 0.6 s wind-up is out of reach', () => {
    const npc = { npcX: 0, npcZ: 0, npcYaw: 0 };
    const start = at(ATTACK_START_DIST, 0);
    expect(strikeHits({ ...npc, ...start })).toBe(true);
    const moved = 3.2 * 0.6;
    const end = { targetX: start.targetX, targetZ: start.targetZ + moved };
    expect(edgeDistance(0, 0, end.targetX, end.targetZ, PLAYER_BODY_RADIUS)).toBeCloseTo(2.92, 9);
    expect(strikeHits({ ...npc, ...end })).toBe(false);
  });
});

describe('strikeHits robustness and options', () => {
  it('non-finite yaw or positions never hit', () => {
    expect(strikeHits({ npcX: 0, npcZ: 0, npcYaw: Number.NaN, targetX: 0, targetZ: 1 })).toBe(false);
    expect(strikeHits({ npcX: Number.NaN, npcZ: 0, npcYaw: 0, targetX: 0, targetZ: 1 })).toBe(false);
    expect(strikeHits({ npcX: 0, npcZ: Infinity, npcYaw: 0, targetX: 0, targetZ: 1 })).toBe(false);
    expect(strikeHits({ npcX: 0, npcZ: 0, npcYaw: 0, targetX: Number.NaN, targetZ: 1 })).toBe(false);
    expect(strikeHits({ npcX: 0, npcZ: 0, npcYaw: 0, targetX: 0, targetZ: -Infinity })).toBe(false);
  });

  it('opts.reach overrides the default reach', () => {
    const p = { npcX: 0, npcZ: 0, npcYaw: 0, targetX: 0, targetZ: 2.3 };
    expect(strikeHits(p)).toBe(false);
    expect(strikeHits(p, { reach: 2.0 })).toBe(true);
    expect(strikeHits({ ...p, targetZ: 1.2 }, { reach: 0.5 })).toBe(false);
  });

  it('opts.fovDeg overrides the default cone', () => {
    const npc = { npcX: 0, npcZ: 0, npcYaw: 0 };
    expect(strikeHits({ ...npc, ...at(1.0, 80) })).toBe(false);
    expect(strikeHits({ ...npc, ...at(1.0, 80) }, { fovDeg: 170 })).toBe(true);
    expect(strikeHits({ ...npc, ...at(1.0, 20) }, { fovDeg: 30 })).toBe(false);
  });

  it('fovDeg >= 360 accepts any direction', () => {
    const npc = { npcX: 0, npcZ: 0, npcYaw: 0 };
    for (const deg of [0, 90, 179, 180, -135]) {
      expect(strikeHits({ ...npc, ...at(1.0, deg) }, { fovDeg: 360 })).toBe(true);
      expect(strikeHits({ ...npc, ...at(1.0, deg) }, { fovDeg: 720 })).toBe(true);
    }
  });

  it('does not mutate its input', () => {
    const p = { npcX: 1, npcZ: 2, npcYaw: 0.3, targetX: 1.2, targetZ: 3 };
    const copy = { ...p };
    strikeHits(p, { reach: 2 });
    expect(p).toEqual(copy);
  });
});

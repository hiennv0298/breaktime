import { describe, expect, it } from 'vitest';
import { iconFor, pickNearest, type Candidate } from '../../src/logic/nearest';

// Player facing is (-sin yaw, -cos yaw): yaw 0 faces world -Z.
const AT_ORIGIN_FACING_MINUS_Z = { x: 0, z: 0, yawRad: 0 };

function cand(id: string, x: number, z: number, radius = 0, kind: Candidate['kind'] = 'prop'): Candidate {
  return { id, x, z, radius, kind };
}

describe('pickNearest', () => {
  it('prefers the closer candidate straight ahead', () => {
    const near = cand('near', 0, -1.0);
    const far = cand('far', 0, -1.4);
    expect(pickNearest(AT_ORIGIN_FACING_MINUS_Z, [far, near])?.id).toBe('near');
  });

  it('ignores a candidate directly behind the player (outside the 140° fov)', () => {
    const behind = cand('behind', 0, 0.8);
    expect(pickNearest(AT_ORIGIN_FACING_MINUS_Z, [behind])).toBeNull();
    // ...even when something valid but farther is ahead.
    const ahead = cand('ahead', 0, -1.5);
    expect(pickNearest(AT_ORIGIN_FACING_MINUS_Z, [behind, ahead])?.id).toBe('ahead');
  });

  it('returns null beyond 1.6 m', () => {
    expect(pickNearest(AT_ORIGIN_FACING_MINUS_Z, [cand('x', 0, -1.7)])).toBeNull();
  });

  it('breaks equal-distance ties by id ascending', () => {
    const b = cand('b', 0.3, -1.0);
    const a = cand('a', -0.3, -1.0);
    expect(pickNearest(AT_ORIGIN_FACING_MINUS_Z, [b, a])?.id).toBe('a');
    expect(pickNearest(AT_ORIGIN_FACING_MINUS_Z, [a, b])?.id).toBe('a');
  });

  it('subtracts the candidate radius from the centre distance', () => {
    // Centre 1.9 m away is out of range as a point, in range with a 0.4 m radius.
    expect(pickNearest(AT_ORIGIN_FACING_MINUS_Z, [cand('big', 0, -1.9, 0)])).toBeNull();
    expect(pickNearest(AT_ORIGIN_FACING_MINUS_Z, [cand('big', 0, -1.9, 0.4)])?.id).toBe('big');
    // A large radius beats a closer small centre.
    const small = cand('small', 0, -1.0, 0);
    const wide = cand('wide', 0, -1.2, 0.5);
    expect(pickNearest(AT_ORIGIN_FACING_MINUS_Z, [small, wide])?.id).toBe('wide');
  });

  it('respects the fov edge at 70° either side and follows yaw', () => {
    const d = 1.0;
    const inside = cand('in', -Math.sin(65 * (Math.PI / 180)) * d, -Math.cos(65 * (Math.PI / 180)) * d);
    const outside = cand('out', Math.sin(75 * (Math.PI / 180)) * d, -Math.cos(75 * (Math.PI / 180)) * d);
    expect(pickNearest(AT_ORIGIN_FACING_MINUS_Z, [inside])?.id).toBe('in');
    expect(pickNearest(AT_ORIGIN_FACING_MINUS_Z, [outside])).toBeNull();
    // Facing world +X (yaw -90°): a candidate at +X is ahead, one at -Z is 90° off (outside 70°).
    const facingPlusX = { x: 0, z: 0, yawRad: -Math.PI / 2 };
    expect(pickNearest(facingPlusX, [cand('px', 1, 0)])?.id).toBe('px');
    expect(pickNearest(facingPlusX, [cand('mz', 0, -1)])).toBeNull();
  });

  it('honours maxDist / fovDeg options and treats a candidate on top of the player as in range', () => {
    expect(pickNearest(AT_ORIGIN_FACING_MINUS_Z, [cand('x', 0, -2.5)], { maxDist: 3 })?.id).toBe('x');
    expect(pickNearest(AT_ORIGIN_FACING_MINUS_Z, [cand('behind', 0, 1)], { fovDeg: 360 })?.id).toBe('behind');
    expect(pickNearest(AT_ORIGIN_FACING_MINUS_Z, [cand('on', 0, 0)])?.id).toBe('on');
    expect(pickNearest(AT_ORIGIN_FACING_MINUS_Z, [])).toBeNull();
  });

  it('skips candidates with non-finite coordinates', () => {
    expect(pickNearest(AT_ORIGIN_FACING_MINUS_Z, [cand('nan', Number.NaN, -1)])).toBeNull();
  });
});

describe('iconFor', () => {
  it('maps target kinds to context icons', () => {
    expect(iconFor('prop')).toBe('push');
    expect(iconFor('breakable')).toBe('push');
    expect(iconFor('npc')).toBe('slap');
    expect(iconFor(null)).toBe('none');
  });
});

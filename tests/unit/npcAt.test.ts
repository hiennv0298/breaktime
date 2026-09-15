import { describe, expect, it } from 'vitest';
import { parseNpcAt } from '../../src/logic/npcAt';

const ROOM = { halfX: 8, halfZ: 6, margin: 0.5 };

describe('parseNpcAt', () => {
  it('parses two finite numbers', () => {
    expect(parseNpcAt('?npcAt=0.9,1.0', ROOM)).toEqual({ x: 0.9, z: 1 });
    expect(parseNpcAt('?a=1&npcAt=-3,-2.5', ROOM)).toEqual({ x: -3, z: -2.5 });
  });

  it('clamps inside the room minus 0.5 m', () => {
    expect(parseNpcAt('?npcAt=100,-100', ROOM)).toEqual({ x: 7.5, z: -5.5 });
    expect(parseNpcAt('?npcAt=-1e300,1e300', ROOM)).toEqual({ x: -7.5, z: 5.5 });
  });

  it('ignores anything that is not exactly two finite numbers', () => {
    for (const q of [
      '',
      '?npcAt=',
      '?npcAt=1',
      '?npcAt=1,2,3',
      '?npcAt=a,b',
      '?npcAt=NaN,1',
      '?npcAt=Infinity,0',
      '?npcAt=1,',
      '?npcAt=,1',
      '?npcAt=' + '1'.repeat(70) + ',1',
    ]) {
      expect(parseNpcAt(q, ROOM), q).toBeNull();
    }
  });
});

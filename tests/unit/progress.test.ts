import { describe, expect, it } from 'vitest';
import { weightedProgress } from '../../src/logic/progress';

describe('weightedProgress', () => {
  it('weights rapier 70 / office 30 with fractions 1 and 0.5 give 0.85', () => {
    expect(weightedProgress({ rapier: 70, office: 30 }, { rapier: 1, office: 0.5 })).toBeCloseTo(0.85, 10);
  });

  it('no tasks gives 1', () => {
    expect(weightedProgress({}, {})).toBe(1);
  });

  it('clamps fractions to [0, 1]', () => {
    expect(weightedProgress({ a: 1 }, { a: 2 })).toBe(1);
    expect(weightedProgress({ a: 1 }, { a: -1 })).toBe(0);
    expect(weightedProgress({ a: 50, b: 50 }, { a: 5, b: -3 })).toBeCloseTo(0.5, 10);
  });

  it('a task without a reported fraction counts as 0', () => {
    expect(weightedProgress({ a: 1, b: 3 }, { a: 1 })).toBeCloseTo(0.25, 10);
  });
});

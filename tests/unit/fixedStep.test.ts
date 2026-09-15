import { describe, expect, it } from 'vitest';
import { makeStepper } from '../../src/logic/fixedStep';

describe('makeStepper (fixed-step accumulator)', () => {
  it('one 1/60 s frame gives exactly 1 step', () => {
    const step = makeStepper(1 / 60, 4);
    expect(step(1 / 60, 1)).toBe(1);
  });

  it('defaults to dt 1/60 and maxSteps 4', () => {
    const step = makeStepper();
    expect(step(1 / 60, 1)).toBe(1);
    expect(step(10, 1)).toBe(4);
  });

  it('clamps a 0.5 s frame to 0.1 s', () => {
    // Large maxSteps so only the clamp limits the count: 0.1 s / (1/60) ≈ 6 (float may give 5), never 30.
    const step = makeStepper(1 / 60, 100);
    const n = step(0.5, 1);
    expect(n).toBeGreaterThanOrEqual(5);
    expect(n).toBeLessThanOrEqual(6);
  });

  it('caps a 0.5 s frame at 4 steps and drops the backlog', () => {
    const step = makeStepper(1 / 60, 4);
    expect(step(0.5, 1)).toBe(4);
    expect(step(0, 1)).toBe(0);
  });

  it('timeScale 0 gives 0 steps', () => {
    const step = makeStepper(1 / 60, 4);
    expect(step(1 / 60, 0)).toBe(0);
    expect(step(0.05, 0)).toBe(0);
  });

  it('two 1/120 s frames give exactly 1 step in total', () => {
    const step = makeStepper(1 / 60, 4);
    const total = step(1 / 120, 1) + step(1 / 120, 1);
    expect(total).toBe(1);
  });
});

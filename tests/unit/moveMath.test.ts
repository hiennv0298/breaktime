import { describe, expect, it } from 'vitest';
import { cameraRelativeMove } from '../../src/logic/moveMath';

function expectVec(v: { x: number; z: number }, x: number, z: number): void {
  expect(Math.abs(v.x - x)).toBeLessThan(1e-9);
  expect(Math.abs(v.z - z)).toBeLessThan(1e-9);
}

describe('cameraRelativeMove (screen input to world XZ)', () => {
  it('yaw 0: W (0, 1) goes to world -Z', () => {
    expectVec(cameraRelativeMove(0, 1, 0), 0, -1);
  });

  it('yaw 0: D (1, 0) goes to world +X', () => {
    expectVec(cameraRelativeMove(1, 0, 0), 1, 0);
  });

  it('yaw 0: diagonal (1, 1) is normalised to length 1', () => {
    const v = cameraRelativeMove(1, 1, 0);
    expect(Math.abs(Math.hypot(v.x, v.z) - 1)).toBeLessThan(1e-9);
    expectVec(v, Math.SQRT1_2, -Math.SQRT1_2);
  });

  it('no input gives (0, 0)', () => {
    expectVec(cameraRelativeMove(0, 0, 0), 0, 0);
    expectVec(cameraRelativeMove(0, 0, 1.3), 0, 0);
  });

  it('yaw PI/2: W (0, 1) goes to world -X', () => {
    expectVec(cameraRelativeMove(0, 1, Math.PI / 2), -1, 0);
  });

  it('keeps analog magnitude below 1 (no upscaling)', () => {
    const v = cameraRelativeMove(0.5, 0, 0);
    expect(Math.abs(Math.hypot(v.x, v.z) - 0.5)).toBeLessThan(1e-9);
  });

  it('never returns a vector longer than 1, and treats non-finite input as 0', () => {
    const v = cameraRelativeMove(5, -3, 0.7);
    expect(Math.hypot(v.x, v.z)).toBeLessThanOrEqual(1 + 1e-9);
    expectVec(cameraRelativeMove(Number.NaN, Number.POSITIVE_INFINITY, 0), 0, 0);
    expectVec(cameraRelativeMove(0, 1, Number.NaN), 0, -1);
  });
});

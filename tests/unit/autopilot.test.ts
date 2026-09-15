import { describe, expect, it } from 'vitest';
import { AUTOPILOT_ARRIVE_M, createAutopilot } from '../../src/game/autopilot';
import { createInputState } from '../../src/input/inputState';
import { cameraRelativeMove } from '../../src/logic/moveMath';

/* Plan 01-17: the bench autopilot writes screen input that cameraRelativeMove turns back into the target direction. */

describe('createAutopilot', () => {
  for (const yawDeg of [0, 90, 180, 270, 37]) {
    it(`input maps back to the target direction at camera yaw ${yawDeg} deg`, () => {
      const yaw = (yawDeg * Math.PI) / 180;
      const ap = createAutopilot();
      const input = createInputState();
      ap.setTarget(3, -4);
      ap.apply(input, { x: 0, z: 0 }, yaw);
      const w = cameraRelativeMove(input.moveX, input.moveY, yaw);
      expect(w.x).toBeCloseTo(0.6, 6);
      expect(w.z).toBeCloseTo(-0.8, 6);
      expect(Math.hypot(input.moveX, input.moveY)).toBeCloseTo(1, 6);
      expect(ap.arrived()).toBe(false);
    });
  }

  it('stands still and reports arrived within the arrive radius', () => {
    const ap = createAutopilot();
    const input = createInputState();
    ap.setTarget(1, 1);
    ap.apply(input, { x: 1 + AUTOPILOT_ARRIVE_M * 0.9, z: 1 }, 0);
    expect(input.moveX).toBe(0);
    expect(input.moveY).toBe(0);
    expect(ap.arrived()).toBe(true);
  });

  it('writes zero input without a target, after stop() and for non-finite targets or positions', () => {
    const ap = createAutopilot();
    const input = createInputState();
    input.moveX = 1;
    ap.apply(input, { x: 0, z: 0 }, 0);
    expect(input.moveX).toBe(0);
    ap.setTarget(Number.NaN, 2);
    ap.apply(input, { x: 0, z: 0 }, 0);
    expect(input.moveY).toBe(0);
    ap.setTarget(5, 5);
    ap.apply(input, { x: Number.NaN, z: 0 }, 0);
    expect(input.moveX).toBe(0);
    ap.stop();
    ap.apply(input, { x: 0, z: 0 }, 0);
    expect(input.moveX).toBe(0);
    expect(ap.arrived()).toBe(true);
  });
});

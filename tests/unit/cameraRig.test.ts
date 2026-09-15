import { describe, expect, it } from 'vitest';
import { createCameraRig, viewParams } from '../../src/logic/cameraRig';

describe('createCameraRig (90° yaw steps, D-19 / CTRL-05)', () => {
  it('starts at yaw 0, snapped', () => {
    const rig = createCameraRig();
    expect(rig.yawDeg()).toBe(0);
    expect(rig.targetYawDeg()).toBe(0);
    expect(rig.yawDegNormalized()).toBe(0);
    expect(rig.snapped()).toBe(true);
  });

  it('rotate(1) sets the target to exactly 90 without jumping the current yaw', () => {
    const rig = createCameraRig();
    rig.rotate(1);
    expect(rig.targetYawDeg()).toBe(90);
    expect(rig.yawDeg()).toBe(0);
    expect(rig.snapped()).toBe(false);
  });

  it('rotate(-1) twice from 0 targets -180 (unwrapped)', () => {
    const rig = createCameraRig();
    rig.rotate(-1);
    rig.rotate(-1);
    expect(rig.targetYawDeg()).toBe(-180);
  });

  it('update(2.0) damps the yaw onto the target and reports snapped', () => {
    const rig = createCameraRig();
    rig.rotate(1);
    rig.update(2.0);
    expect(Math.abs(rig.yawDeg() - rig.targetYawDeg())).toBeLessThan(0.5);
    expect(rig.snapped()).toBe(true);
  });

  it('damps smoothly: a short update moves part of the way, monotonically toward the target', () => {
    const rig = createCameraRig();
    rig.rotate(1);
    rig.update(1 / 60);
    const a = rig.yawDeg();
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(90);
    rig.update(1 / 60);
    const b = rig.yawDeg();
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThan(90);
    // Default damping 10: one 1/60 s step covers 1 - exp(-10/60) of the gap.
    expect(Math.abs(a - 90 * (1 - Math.exp(-10 / 60)))).toBeLessThan(1e-9);
  });

  it('four rotate(1) target 360 and normalise back to 0 after settling', () => {
    const rig = createCameraRig();
    for (let i = 0; i < 4; i++) rig.rotate(1);
    expect(rig.targetYawDeg()).toBe(360);
    rig.update(2.0);
    expect(rig.yawDegNormalized()).toBe(0);
  });

  it('yawDegNormalized is always in [0, 360)', () => {
    const rig = createCameraRig();
    rig.rotate(-1);
    rig.update(2.0);
    expect(rig.yawDegNormalized()).toBe(270);
    for (let i = 0; i < 7; i++) rig.rotate(-1);
    rig.update(2.0);
    expect(rig.targetYawDeg()).toBe(-720);
    expect(rig.yawDegNormalized()).toBe(0);
  });

  it('honours stepDeg and damping options, and ignores non-finite dt', () => {
    const rig = createCameraRig({ stepDeg: 45, damping: 1 });
    rig.rotate(1);
    expect(rig.targetYawDeg()).toBe(45);
    rig.update(Number.NaN);
    rig.update(-1);
    expect(rig.yawDeg()).toBe(0);
    rig.update(0.5);
    expect(Math.abs(rig.yawDeg() - 45 * (1 - Math.exp(-0.5)))).toBeLessThan(1e-9);
  });
});

describe('viewParams (D-16 portrait pulls the camera back)', () => {
  it('landscape 844/390 -> distance 11, pitch 55', () => {
    expect(viewParams(844 / 390)).toEqual({ distance: 11, pitchDeg: 55 });
  });

  it('portrait 390/844 -> distance 15, pitch 60', () => {
    expect(viewParams(390 / 844)).toEqual({ distance: 15, pitchDeg: 60 });
  });

  it('square counts as landscape; non-finite aspect falls back to landscape', () => {
    expect(viewParams(1)).toEqual({ distance: 11, pitchDeg: 55 });
    expect(viewParams(Number.NaN)).toEqual({ distance: 11, pitchDeg: 55 });
  });
});

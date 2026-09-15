/**
 * Camera yaw rig (pure, Vitest-covered; D-19, CTRL-05).
 * The target yaw moves in exact `stepDeg` steps and is kept unwrapped (four +90 steps give 360, not 0),
 * so the damped yaw always turns the short way the player asked for. The current yaw follows the target
 * with frame-rate independent exponential damping 1 - exp(-damping * dt).
 */
export interface CameraRig {
  rotate(dir: -1 | 1): void;
  update(dt: number): void;
  /** Current (damped) yaw in degrees, unwrapped. */
  yawDeg(): number;
  /** Target yaw in degrees, unwrapped, always a multiple of stepDeg. */
  targetYawDeg(): number;
  /** Current yaw mapped into [0, 360). */
  yawDegNormalized(): number;
  /** True when the current yaw is within 0.5° of the target. */
  snapped(): boolean;
}

const SNAPPED_DEG = 0.5;
/** Below this gap the yaw lands exactly on the target, so settled values are exact multiples of the step. */
const LAND_DEG = 1e-3;

export function createCameraRig(opts: { stepDeg?: number; damping?: number } = {}): CameraRig {
  const stepDeg = Number.isFinite(opts.stepDeg) && opts.stepDeg! > 0 ? opts.stepDeg! : 90;
  const damping = Number.isFinite(opts.damping) && opts.damping! > 0 ? opts.damping! : 10;
  let target = 0;
  let yaw = 0;

  return {
    rotate(dir) {
      if (dir !== 1 && dir !== -1) return;
      target += dir * stepDeg;
    },
    update(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      const k = 1 - Math.exp(-damping * dt);
      yaw += (target - yaw) * k;
      if (Math.abs(target - yaw) < LAND_DEG) yaw = target;
    },
    yawDeg: () => yaw,
    targetYawDeg: () => target,
    yawDegNormalized() {
      const n = ((yaw % 360) + 360) % 360;
      return n >= 360 || Object.is(n, -0) ? 0 : n;
    },
    snapped: () => Math.abs(target - yaw) < SNAPPED_DEG,
  };
}

/** Landscape (aspect >= 1) keeps distance 11 m / pitch 55°; portrait pulls back to 15 m / 60° (D-16). */
export function viewParams(aspect: number): { distance: number; pitchDeg: number } {
  if (Number.isFinite(aspect) && aspect < 1) return { distance: 15, pitchDeg: 60 };
  return { distance: 11, pitchDeg: 55 };
}

import { Vector3, type PerspectiveCamera } from 'three';

export interface CameraView {
  update(dt: number, target: { x: number; y: number; z: number }): void;
}

const PITCH_RAD = (55 * Math.PI) / 180; // looking down (D-19 fixed tilt)
const DISTANCE = 11;
const DAMPING = 8;

/** Fixed in this plan; plan 01-09 adds 90° snaps with Z / C. */
const yaw = 0;

/** Camera yaw in radians (0 = camera behind the player on +Z, looking toward -Z). */
export function getCameraYaw(): number {
  return yaw;
}

/** Tilted follow camera: the look-at point trails the target with exponential damping (frame-rate independent). */
export function createCameraView(camera: PerspectiveCamera): CameraView {
  const focus = new Vector3();
  let initialised = false;

  return {
    update(dt, target) {
      if (!initialised) {
        focus.set(target.x, target.y, target.z);
        initialised = true;
      } else {
        const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
        const k = 1 - Math.exp(-DAMPING * step);
        focus.x += (target.x - focus.x) * k;
        focus.y += (target.y - focus.y) * k;
        focus.z += (target.z - focus.z) * k;
      }
      const horizontal = DISTANCE * Math.cos(PITCH_RAD);
      camera.position.set(
        focus.x + Math.sin(yaw) * horizontal,
        focus.y + DISTANCE * Math.sin(PITCH_RAD),
        focus.z + Math.cos(yaw) * horizontal,
      );
      camera.lookAt(focus);
    },
  };
}

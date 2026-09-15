import { Vector3, type PerspectiveCamera } from 'three';
import { registerDebug } from '../debug/testHook';
import { createCameraRig, viewParams } from '../logic/cameraRig';

export interface CameraView {
  update(dt: number, target: { x: number; y: number; z: number }): void;
}

const FOLLOW_DAMPING = 8;
/** Distance and pitch ease toward the landscape / portrait values (viewParams) when the aspect changes. */
const VIEW_DAMPING = 8;
const DEG = Math.PI / 180;

/** One rig for the page: movement (getCameraYaw) and the view read the same yaw. */
const rig = createCameraRig();

/** Rotate the view by one 90° step: -1 = Z / ArrowLeft / ⟲, +1 = C / ArrowRight / ⟳ (D-19). */
export function rotateCamera(dir: -1 | 1): void {
  rig.rotate(dir);
}

/** Current (damped) camera yaw in radians from the rig (0 = camera behind the player on +Z, looking toward -Z). */
export function getCameraYaw(): number {
  return rig.yawDeg() * DEG;
}

let debugRegistered = false;

/**
 * Tilted follow camera (D-19): the look-at point trails the target, the yaw follows the rig, and distance /
 * pitch follow viewParams(camera.aspect), all with exponential damping (frame-rate independent).
 */
export function createCameraView(camera: PerspectiveCamera): CameraView {
  const focus = new Vector3();
  let initialised = false;
  const start = viewParams(camera.aspect);
  let distance = start.distance;
  let pitchDeg = start.pitchDeg;

  if (!debugRegistered) {
    debugRegistered = true;
    registerDebug('camera', () => ({
      yawDeg: rig.yawDeg(),
      targetYawDeg: rig.targetYawDeg(),
      distance,
      pitchDeg,
    }));
  }

  return {
    update(dt, target) {
      const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
      const want = viewParams(camera.aspect);
      if (!initialised) {
        focus.set(target.x, target.y, target.z);
        distance = want.distance;
        pitchDeg = want.pitchDeg;
        initialised = true;
      } else {
        const k = 1 - Math.exp(-FOLLOW_DAMPING * step);
        focus.x += (target.x - focus.x) * k;
        focus.y += (target.y - focus.y) * k;
        focus.z += (target.z - focus.z) * k;
        const kv = 1 - Math.exp(-VIEW_DAMPING * step);
        distance += (want.distance - distance) * kv;
        pitchDeg += (want.pitchDeg - pitchDeg) * kv;
      }
      rig.update(step);

      const yaw = rig.yawDeg() * DEG;
      const pitch = pitchDeg * DEG;
      const horizontal = distance * Math.cos(pitch);
      camera.position.set(
        focus.x + Math.sin(yaw) * horizontal,
        focus.y + distance * Math.sin(pitch),
        focus.z + Math.cos(yaw) * horizontal,
      );
      camera.lookAt(focus);
    },
  };
}

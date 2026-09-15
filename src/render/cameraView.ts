import { Vector3, type PerspectiveCamera } from 'three';
import { registerDebug } from '../debug/testHook';
import { subscribeQuality } from '../game/qualityManager';
import { createCameraRig, viewParams } from '../logic/cameraRig';
import { mulberry32 } from '../logic/rng';
import { TIERS } from '../logic/quality';

export interface CameraView {
  /** `shakeDt` advances the shake (pass 0 while paused so a shake waits behind the pause menu); defaults to dt. */
  update(dt: number, target: { x: number; y: number; z: number }, shakeDt?: number): void;
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

/** Shake ceilings: a caller can never turn the view into a blur (bounded like the slap constants). */
const MAX_SHAKE_AMPLITUDE = 0.5; // m
const MAX_SHAKE_MS = 1000;
/** Fixed seed: the shake jitters the same way every run (bench replay, D-08). */
const shakeRng = mulberry32(0x5eed5a4e);
let shakeAmplitude = 0;
let shakeDurationMs = 0;
let shakeElapsedMs = 0;

/** Light screen shake (D-12): a decaying random offset amplitude × (1 - t) over durationMs, applied after positioning. */
export function shakeCamera(amplitude: number, durationMs: number): void {
  if (!Number.isFinite(amplitude) || !Number.isFinite(durationMs) || amplitude <= 0 || durationMs <= 0) return;
  shakeAmplitude = Math.min(MAX_SHAKE_AMPLITUDE, amplitude);
  shakeDurationMs = Math.min(MAX_SHAKE_MS, durationMs);
  shakeElapsedMs = 0;
}

function shakeActive(): boolean {
  return shakeElapsedMs < shakeDurationMs;
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

  // Draw distance follows the quality tier (D-21): camera.far 40 / 30 / 22 m for Cao / Vừa / Thấp.
  subscribeQuality((tier) => {
    camera.far = TIERS[tier].far;
    camera.updateProjectionMatrix();
  });

  if (!debugRegistered) {
    debugRegistered = true;
    registerDebug('camera', () => ({
      yawDeg: rig.yawDeg(),
      targetYawDeg: rig.targetYawDeg(),
      distance,
      pitchDeg,
      far: camera.far,
      shakeActive: shakeActive(),
    }));
  }

  return {
    update(dt, target, shakeDt = dt) {
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

      if (shakeActive()) {
        const k = shakeAmplitude * (1 - shakeElapsedMs / shakeDurationMs);
        let ox = shakeRng() * 2 - 1;
        let oy = shakeRng() * 2 - 1;
        let oz = shakeRng() * 2 - 1;
        const len = Math.hypot(ox, oy, oz) || 1;
        ox /= len;
        oy /= len;
        oz /= len;
        // Shifted after lookAt, so the whole view jolts instead of re-aiming at the player.
        camera.position.x += ox * k;
        camera.position.y += oy * k;
        camera.position.z += oz * k;
        const sd = Number.isFinite(shakeDt) && shakeDt > 0 ? shakeDt : 0;
        shakeElapsedMs += sd * 1000;
      }
    },
  };
}

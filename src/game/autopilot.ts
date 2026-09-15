import type { InputState } from '../input/inputState';

/**
 * Bench autopilot (plan 01-17, D-08): steers the player's InputState toward a world XZ target, so the scripted run
 * walks through the same player controller, collisions and camera-relative mapping as a real player.
 * Pure (no three.js, no DOM); the caller passes the player position and the current camera yaw every fixed step.
 */

/** The player counts as arrived within this XZ distance (m). */
export const AUTOPILOT_ARRIVE_M = 0.6;

export interface Autopilot {
  setTarget(x: number, z: number): void;
  /** Clears the target: the player stands still. */
  stop(): void;
  /** Writes moveX / moveY for this step (0, 0 without a target or once arrived). */
  apply(input: InputState, player: { x: number; z: number }, cameraYawRad: number): void;
  /** True once the last apply() found the player within AUTOPILOT_ARRIVE_M of the target (or there is no target). */
  arrived(): boolean;
}

export function createAutopilot(): Autopilot {
  let hasTarget = false;
  let tx = 0;
  let tz = 0;
  let isArrived = true;

  return {
    setTarget(x, z) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      tx = x;
      tz = z;
      hasTarget = true;
      isArrived = false;
    },
    stop() {
      hasTarget = false;
      isArrived = true;
    },
    apply(input, player, cameraYawRad) {
      input.moveX = 0;
      input.moveY = 0;
      if (!hasTarget || !Number.isFinite(player.x) || !Number.isFinite(player.z)) return;
      const dx = tx - player.x;
      const dz = tz - player.z;
      const len = Math.hypot(dx, dz);
      if (len <= AUTOPILOT_ARRIVE_M) {
        isArrived = true;
        return;
      }
      isArrived = false;
      const wx = dx / len;
      const wz = dz / len;
      // Inverse of cameraRelativeMove (moveMath.ts): world = R(yaw) * screen, R orthonormal, so screen = R^T * world.
      const yaw = Number.isFinite(cameraYawRad) ? cameraYawRad : 0;
      const s = Math.sin(yaw);
      const c = Math.cos(yaw);
      input.moveX = wx * c - wz * s;
      input.moveY = -wx * s - wz * c;
    },
    arrived() {
      return isArrived;
    },
  };
}

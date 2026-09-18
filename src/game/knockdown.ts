import type { RigidBody } from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import { FREE_SPOT_DIRS, FREE_SPOT_MAX_M, FREE_SPOT_STEP_M, freeSpotCandidates } from '../logic/freeSpot';
import { CHARACTER_PARTS } from '../render/characters';
import type { GameCtx } from './game';
import type { Ragdoll } from '../physics/ragdoll';
import { createRagdoll } from '../physics/ragdoll';

const TORSO = CHARACTER_PARTS.indexOf('torso');
const CAPSULE_HALF_HEIGHT = 0.45;
const CAPSULE_RADIUS = 0.3;

/**
 * Player ragdoll rig: manages activation, stepping, sync, recovery blend and re-attachment.
 * Reuses src/logic/getUpFsm for the timed blend during recovery.
 */
export interface KnockdownRig {
  /** Activate with impulse and torque. */
  activate(impulse: { x: number; y: number; z: number }, torque: { x: number; y: number; z: number }): void;
  /** Call once per fixed step, return torso linear/angular speed for stun state machine. */
  step(): { torsoSpeed: number; torsoAngSpeed: number };
  /** Copy ragdoll body transforms to parts. */
  sync(): void;
  /** Get torso world position. */
  torsoPos(): { x: number; y: number; z: number };
  /**
   * Prepare recovery: update player rotation to face forward, sync parts, deactivate ragdoll,
   * sample current pose for recovery blend, and return the spawn position.
   */
  beginRecover(): { x: number; z: number; yaw: number };
  /** Blend from recovered pose toward idle pose during recovery animation. */
  blend(t: number): void;
  /** Snap to idle pose (end of recovery). */
  finish(): void;
  /** Reset: deactivate and re-attach if active. */
  reset(): void;
  bodyCount(): number;
  active(): boolean;
  mass(): number;
}

/** Search for a free spot to place the player after knockdown. */
export function findFreeSpot(
  ctx: GameCtx,
  x: number,
  z: number,
  exclude: RigidBody,
): { x: number; z: number; kind: 'free' | 'searched' | 'spawn' } {
  const { world, R } = ctx.physics;

  // Create a one-time capsule shape for testing (cached in caller if reused)
  const capsule = new R.Capsule(CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS);

  // Test each candidate in order
  for (let i = 0; i < FREE_SPOT_DIRS; i++) {
    for (const candidate of freeSpotCandidates(x, z, { halfX: 8, halfZ: 6, margin: 0.5 })) {
      // Intersect at foot position + small clearance for capsule center
      const testY = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS + 0.02;
      const hit = world.intersectionWithShape(
        { x: candidate.x, y: testY, z: candidate.z },
        { x: 0, y: 0, z: 0, w: 1 },
        capsule,
        undefined,
        undefined,
        undefined,
        exclude,
      );

      if (hit === null) {
        // Free spot found
        return { x: candidate.x, z: candidate.z, kind: i === 0 ? 'free' : 'searched' };
      }
    }
  }

  // Fallback to spawn
  return { x, z, kind: 'spawn' };
}

/** Create a player knockdown rig. */
export function createKnockdownRig(ctx: GameCtx, character: any): KnockdownRig {
  const parts = CHARACTER_PARTS.map((name) => character.parts[name]);
  const ragdoll = createRagdoll(ctx, parts, 0, { player: true });

  // Sample idle pose after mixer.update(0)
  character.mixer.update(0);
  const idlePose = parts.map((part) => ({
    pos: part.position.clone(),
    quat: part.quaternion.clone(),
  }));

  // Build re-attach order by depth (torso first, then children)
  const reattachOrder: Array<{ part: any; parent: any }> = [];
  const visit = (part: any) => {
    reattachOrder.push({ part, parent: part.parent });
    for (const child of part.children) {
      if (CHARACTER_PARTS.includes(child.name)) visit(child);
    }
  };
  visit(parts[TORSO]);

  let isActive = false;
  let recoverPose: { pos: Vector3; quat: Quaternion; yaw: number } | null = null;
  let recoverT = 0; // 0..1 blend factor

  const rig: KnockdownRig = {
    activate(impulse, torque) {
      if (isActive) return;
      ragdoll.activate(impulse, torque);
      isActive = true;
    },

    step() {
      if (!isActive) return { torsoSpeed: 0, torsoAngSpeed: 0 };

      ragdoll.fixedUpdate();
      const torsoBody = ragdoll.torso();
      const vel = torsoBody.linvel();
      const angVel = torsoBody.angvel();

      const torsoSpeed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
      const torsoAngSpeed = Math.sqrt(angVel.x * angVel.x + angVel.y * angVel.y + angVel.z * angVel.z);

      return { torsoSpeed, torsoAngSpeed };
    },

    sync() {
      if (!isActive) return;
      ragdoll.sync();
    },

    torsoPos() {
      const t = ragdoll.torso().translation();
      return { x: t.x, y: t.y, z: t.z };
    },

    beginRecover() {
      if (!isActive) return { x: 0, z: 0, yaw: 0 };

      ragdoll.sync();

      // Get torso facing yaw and clamp to room bounds
      const torsoBody = ragdoll.torso();
      const t = torsoBody.translation();
      const r = torsoBody.rotation();

      // Extract yaw from quaternion (rotation around Y axis)
      const yaw = Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.z * r.z));

      // Clamp spawn position to room
      const clampedX = Math.max(-7.5, Math.min(7.5, t.x));
      const clampedZ = Math.max(-5.5, Math.min(5.5, t.z));

      // Store recover pose for blending
      recoverPose = {
        pos: new Vector3(clampedX, t.y, clampedZ),
        quat: new Quaternion().setFromEuler({ x: 0, y: yaw, z: 0 } as any),
        yaw,
      };

      // Deactivate ragdoll
      ragdoll.deactivate();

      // Re-attach parts
      const root = character.model;
      for (const { part, parent } of reattachOrder) {
        if (parent) parent.attach(part);
      }

      isActive = false;
      recoverT = 0;

      return { x: clampedX, z: clampedZ, yaw };
    },

    blend(t) {
      if (!recoverPose) return;
      recoverT = Math.max(0, Math.min(1, t));

      // Smoothstep lerp/slerp from recoverPose to idlePose
      const s = recoverT * recoverT * (3 - 2 * recoverT);

      parts.forEach((part, i) => {
        const idle = idlePose[i];
        const from = recoverPose!;

        // Position: lerp
        part.position.lerpVectors(from.pos, idle.pos, s);

        // Quaternion: slerp
        part.quaternion.slerpQuaternions(from.quat, idle.quat, s);
      });
    },

    finish() {
      parts.forEach((part, i) => {
        const idle = idlePose[i];
        part.position.copy(idle.pos);
        part.quaternion.copy(idle.quat);
      });
      recoverPose = null;
      recoverT = 0;
    },

    reset() {
      if (isActive) {
        ragdoll.deactivate();
        isActive = false;
      }

      // Re-attach parts if not attached
      const root = character.model;
      for (const { part, parent } of reattachOrder) {
        if (parent && part.parent !== parent) parent.attach(part);
      }

      // Snap to idle pose
      parts.forEach((part, i) => {
        const idle = idlePose[i];
        part.position.copy(idle.pos);
        part.quaternion.copy(idle.quat);
      });

      recoverPose = null;
      recoverT = 0;
    },

    bodyCount() {
      return ragdoll.bodyCount();
    },

    active() {
      return isActive;
    },

    mass() {
      return ragdoll.mass();
    },
  };

  return rig;
}

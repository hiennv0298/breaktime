import type { Collider, RigidBody } from '@dimforge/rapier3d-compat';
import type { Physics } from './rapier';

export interface PlayerBody {
  body: RigidBody;
  collider: Collider;
  /** `desired` is the horizontal translation for this step in metres; gravity is added internally from `dt`. */
  move(desired: { x: number; z: number }, dt: number): void;
  position(): { x: number; y: number; z: number };
}

const GRAVITY = 9.81;
const MAX_FALL_SPEED = 20;
export const CAPSULE_HALF_HEIGHT = 0.45;
export const CAPSULE_RADIUS = 0.3;
const SPAWN_Y = 0.9;

/** Kinematic capsule driven by Rapier's KinematicCharacterController (RESEARCH "Don't Hand-Roll"). */
export function createPlayerBody(physics: Physics, spawn: { x: number; z: number }): PlayerBody {
  const { R, world } = physics;
  const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, SPAWN_Y, spawn.z));
  const collider = world.createCollider(R.ColliderDesc.capsule(CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS), body);

  const controller = world.createCharacterController(0.02);
  controller.enableAutostep(0.3, 0.2, true);
  controller.enableSnapToGround(0.3);
  controller.setApplyImpulsesToDynamicBodies(true);

  let vy = 0;
  const delta = { x: 0, y: 0, z: 0 };

  return {
    body,
    collider,
    move(desired, dt) {
      const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
      vy = Math.max(vy - GRAVITY * step, -MAX_FALL_SPEED);
      delta.x = Number.isFinite(desired.x) ? desired.x : 0;
      delta.y = vy * step;
      delta.z = Number.isFinite(desired.z) ? desired.z : 0;

      controller.computeColliderMovement(collider, delta);
      if (controller.computedGrounded()) vy = 0;

      const m = controller.computedMovement();
      const t = body.translation();
      body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
    },
    position() {
      const t = body.translation();
      return { x: t.x, y: t.y, z: t.z };
    },
  };
}

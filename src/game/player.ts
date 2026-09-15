import { BoxGeometry, CapsuleGeometry, Group, Mesh, MeshLambertMaterial } from 'three';
import { registerDebug } from '../debug/testHook';
import type { InputState } from '../input/inputState';
import { cameraRelativeMove } from '../logic/moveMath';
import { createPlayerBody } from '../physics/characterController';
import { getCameraYaw } from '../render/cameraView';
import type { GameCtx } from './game';

export interface Player {
  fixedUpdate(dt: number, input: InputState): void;
  frameUpdate(dt: number): void;
  pos(): { x: number; y: number; z: number };
  /** Facing yaw in radians; facing direction in world XZ is (-sin yaw, -cos yaw). */
  yaw(): number;
}

const SPEED = 3.2; // m/s

export function createPlayer(ctx: GameCtx, spawn: { x: number; z: number }): Player {
  const body = createPlayerBody(ctx.physics, spawn);

  const root = new Group();
  const capsule = new Mesh(new CapsuleGeometry(0.3, 0.9), new MeshLambertMaterial({ color: '#3a7bd5' }));
  root.add(capsule);
  // Small "nose" on the local -Z side shows which way the player faces.
  const nose = new Mesh(new BoxGeometry(0.16, 0.12, 0.2), new MeshLambertMaterial({ color: '#1f3f73' }));
  nose.position.set(0, 0.35, -0.32);
  root.add(nose);
  ctx.scene.add(root);

  let facing = 0;
  const p0 = body.position();
  root.position.set(p0.x, p0.y, p0.z);

  registerDebug('player', () => {
    const p = body.position();
    return { pos: [p.x, p.y, p.z], yaw: facing };
  });

  return {
    fixedUpdate(dt, input) {
      const dir = cameraRelativeMove(input.moveX, input.moveY, getCameraYaw());
      body.move({ x: dir.x * SPEED * dt, z: dir.z * SPEED * dt }, dt);
      if (Math.hypot(dir.x, dir.z) > 1e-3) facing = Math.atan2(-dir.x, -dir.z);
    },
    frameUpdate() {
      const p = body.position();
      root.position.set(p.x, p.y, p.z);
      root.rotation.y = facing;
    },
    pos() {
      return body.position();
    },
    yaw() {
      return facing;
    },
  };
}

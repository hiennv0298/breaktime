import { BoxGeometry, Mesh, MeshLambertMaterial } from 'three';
import { registerDebug } from '../debug/testHook';
import { consumeInteract, createInputState } from '../input/inputState';
import { attachKeyboard } from '../input/keyboard';
import type { Physics } from '../physics/rapier';
import { createCameraView } from '../render/cameraView';
import type { RenderCtx } from '../render/renderer';
import { buildRoom } from '../render/room';
import { createPlayer } from './player';

export interface GameCtx extends RenderCtx {
  physics: Physics;
  loaded: Map<string, unknown>;
}

export interface Game {
  fixedUpdate(dt: number): void;
  frameUpdate(dt: number, nowMs: number): void;
  timeScale(nowMs: number): number;
}

const INTERACT_RADIUS = 1.5; // m, XZ distance player -> box
const PUSH_SPEED = 4; // impulse = mass * speed: bounded constants, not derived from input (T-01-03-01)
const PUSH_UP_SPEED = 1.5;

/** Walking-skeleton slice 2: walled room, WASD kinematic player, E pushes a physics box, follow camera. */
export function createGame(ctx: GameCtx): Game {
  const { R, world } = ctx.physics;

  buildRoom(ctx);

  const input = createInputState();
  attachKeyboard(input);

  const player = createPlayer(ctx, { x: 0, z: 2 });
  const cameraView = createCameraView(ctx.camera);

  const boxMesh = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshLambertMaterial({ color: '#c97b3c' }));
  ctx.scene.add(boxMesh);
  const boxBody = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, 0.25, -0.5));
  world.createCollider(R.ColliderDesc.cuboid(0.25, 0.25, 0.25).setDensity(1), boxBody);

  let interactCount = 0;
  registerDebug('box', () => {
    const p = boxBody.translation();
    return { pos: [p.x, p.y, p.z] };
  });
  registerDebug('interactCount', () => interactCount);

  return {
    fixedUpdate(dt) {
      player.fixedUpdate(dt, input);

      if (consumeInteract(input)) {
        const p = player.pos();
        const b = boxBody.translation();
        if (Math.hypot(b.x - p.x, b.z - p.z) <= INTERACT_RADIUS) {
          const yaw = player.yaw();
          const m = boxBody.mass() > 0 ? boxBody.mass() : 0.125; // 0.5 m cube at density 1
          boxBody.applyImpulse(
            { x: -Math.sin(yaw) * PUSH_SPEED * m, y: PUSH_UP_SPEED * m, z: -Math.cos(yaw) * PUSH_SPEED * m },
            true,
          );
          boxBody.wakeUp();
          interactCount++;
        }
      }
    },
    frameUpdate(dt) {
      player.frameUpdate(dt);
      const p = boxBody.translation();
      const q = boxBody.rotation();
      boxMesh.position.set(p.x, p.y, p.z);
      boxMesh.quaternion.set(q.x, q.y, q.z, q.w);
      cameraView.update(dt, player.pos());
    },
    timeScale() {
      return 1;
    },
  };
}

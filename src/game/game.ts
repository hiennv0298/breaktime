import { BoxGeometry, Mesh, MeshLambertMaterial, PlaneGeometry } from 'three';
import type { Physics } from '../physics/rapier';
import type { RenderCtx } from '../render/renderer';

export interface GameCtx extends RenderCtx {
  physics: Physics;
  loaded: Map<string, unknown>;
}

export interface Game {
  fixedUpdate(dt: number): void;
  frameUpdate(dt: number, nowMs: number): void;
  timeScale(nowMs: number): number;
}

/** Walking-skeleton scene: a 16 x 12 floor and one dynamic 0.5 m box dropped from y 3. */
export function createGame(ctx: GameCtx): Game {
  const { R, world } = ctx.physics;

  const floor = new Mesh(new PlaneGeometry(16, 12), new MeshLambertMaterial({ color: '#d9d4c7' }));
  floor.rotation.x = -Math.PI / 2;
  ctx.scene.add(floor);
  const floorBody = world.createRigidBody(R.RigidBodyDesc.fixed());
  world.createCollider(R.ColliderDesc.cuboid(8, 0.1, 6).setTranslation(0, -0.1, 0), floorBody);

  const boxMesh = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshLambertMaterial({ color: '#e0763c' }));
  ctx.scene.add(boxMesh);
  const boxBody = world.createRigidBody(
    R.RigidBodyDesc.dynamic().setTranslation(0, 3, 0).setRotation({ x: 0.2, y: 0.1, z: 0.05, w: 0.97 }),
  );
  world.createCollider(R.ColliderDesc.cuboid(0.25, 0.25, 0.25), boxBody);

  return {
    fixedUpdate() {
      /* no per-step game logic in the skeleton */
    },
    frameUpdate() {
      const p = boxBody.translation();
      const q = boxBody.rotation();
      boxMesh.position.set(p.x, p.y, p.z);
      boxMesh.quaternion.set(q.x, q.y, q.z, q.w);
    },
    timeScale() {
      return 1;
    },
  };
}

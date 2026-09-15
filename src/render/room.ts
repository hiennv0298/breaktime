import { BoxGeometry, Mesh, MeshLambertMaterial, PlaneGeometry } from 'three';
import { registerDebug } from '../debug/testHook';
import type { GameCtx } from '../game/game';

export interface Room {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

const HALF_W = 8; // room is 16 x 12 m
const HALF_D = 6;
const WALL_HEIGHT = 2.8;
const WALL_HALF_THICK = 0.1;

/** Walking-skeleton room (D-14: flat Lambert colours, no shadow maps): floor, four walls, one desk. */
export function buildRoom(ctx: GameCtx): Room {
  const { R, world } = ctx.physics;
  const fixed = world.createRigidBody(R.RigidBodyDesc.fixed());

  const floor = new Mesh(new PlaneGeometry(HALF_W * 2, HALF_D * 2), new MeshLambertMaterial({ color: '#d9d4c7' }));
  floor.rotation.x = -Math.PI / 2;
  ctx.scene.add(floor);
  world.createCollider(R.ColliderDesc.cuboid(HALF_W, 0.1, HALF_D).setTranslation(0, -0.1, 0), fixed);

  const wallMat = new MeshLambertMaterial({ color: '#e8e3d8' });
  const hy = WALL_HEIGHT / 2;
  // [centre x, centre z, half x, half z]; long walls overlap the corners so no gap opens.
  const walls: Array<[number, number, number, number]> = [
    [HALF_W, 0, WALL_HALF_THICK, HALF_D + WALL_HALF_THICK],
    [-HALF_W, 0, WALL_HALF_THICK, HALF_D + WALL_HALF_THICK],
    [0, HALF_D, HALF_W + WALL_HALF_THICK, WALL_HALF_THICK],
    [0, -HALF_D, HALF_W + WALL_HALF_THICK, WALL_HALF_THICK],
  ];
  for (const [x, z, hx, hz] of walls) {
    const mesh = new Mesh(new BoxGeometry(hx * 2, WALL_HEIGHT, hz * 2), wallMat);
    mesh.position.set(x, hy, z);
    ctx.scene.add(mesh);
    world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, hy, z), fixed);
  }

  const desk = new Mesh(new BoxGeometry(1.6, 0.75, 0.8), new MeshLambertMaterial({ color: '#b08d57' }));
  desk.position.set(3, 0.375, -2);
  ctx.scene.add(desk);
  world.createCollider(R.ColliderDesc.cuboid(0.8, 0.375, 0.4).setTranslation(3, 0.375, -2), fixed);

  const bounds = { minX: -HALF_W, maxX: HALF_W, minZ: -HALF_D, maxZ: HALF_D };
  registerDebug('room', () => ({ bounds: { ...bounds } }));
  return { bounds };
}

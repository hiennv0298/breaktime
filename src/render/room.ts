import {
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  type Material,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { registerDebug } from '../debug/testHook';
import type { GameCtx } from '../game/game';
import { PROP_PLACEMENTS, ROOM, roleScale, type Placement } from '../game/layout';
import type { OfficeAssets } from './officeAssets';

export interface Room {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Top y of a static placement's bounding box (desk tops, counter), for objects placed `on` it. */
  surfaceTop(id: string): number | undefined;
  /** Hide the walls between the camera and the room for the current camera yaw (radians); colliders stay. */
  update(cameraYawRad: number): void;
}

const WALL_HALF_THICK = 0.1;
/** A wall hides when its outward normal points toward the camera by more than this (cosine). */
const WALL_HIDE_DOT = 0.3;

interface Wall {
  name: string;
  mesh: Mesh;
  nx: number;
  nz: number;
}

/**
 * Meshopt/KHR_mesh_quantization stores positions, normals and UVs as normalized integers. Baking a world
 * transform into those would clamp to [-1, 1], so every attribute becomes plain Float32 before merging.
 */
function toFloatGeometry(src: BufferGeometry): BufferGeometry {
  const g = new BufferGeometry();
  for (const name of Object.keys(src.attributes)) {
    const a = src.getAttribute(name);
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) {
      for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
    }
    g.setAttribute(name, new BufferAttribute(out, a.itemSize));
  }
  const index = src.getIndex();
  if (index) g.setIndex(Array.from(index.array as ArrayLike<number>));
  return g;
}

export function placeObject(obj: Object3D, p: Placement, baseY: number): void {
  const [sx, sy, sz] = roleScale(p.role);
  obj.scale.set(sx, sy, sz);
  obj.rotation.set(0, ((p.yawDeg ?? 0) * Math.PI) / 180, 0);
  obj.position.set(p.x, baseY + (p.y ?? 0), p.z);
  obj.updateMatrixWorld(true);
}

/**
 * The office room (D-10, D-14: flat Lambert colours, no shadow maps): floor, four walls and the static furniture
 * from layout.ts. Static placements get fixed cuboid colliders from their bounding boxes and are then merged per
 * material into one mesh each, so the whole static office costs a handful of draw calls (TECH-03).
 */
export function buildRoom(ctx: GameCtx, assets: OfficeAssets): Room {
  const { R, world } = ctx.physics;
  const fixed = world.createRigidBody(R.RigidBodyDesc.fixed());
  const halfW = ROOM.width / 2;
  const halfD = ROOM.depth / 2;

  const floor = new Mesh(new PlaneGeometry(ROOM.width, ROOM.depth), new MeshLambertMaterial({ color: '#d9d4c7' }));
  floor.rotation.x = -Math.PI / 2;
  floor.name = 'floor';
  ctx.scene.add(floor);
  world.createCollider(R.ColliderDesc.cuboid(halfW, 0.1, halfD).setTranslation(0, -0.1, 0), fixed);

  const wallMat = new MeshLambertMaterial({ color: '#e8e3d8' });
  const hy = ROOM.wallHeight / 2;
  // [name, centre x, centre z, half x, half z, outward normal x, z]; long walls overlap the corners so no gap opens.
  const wallSpecs: Array<[string, number, number, number, number, number, number]> = [
    ['east', halfW, 0, WALL_HALF_THICK, halfD + WALL_HALF_THICK, 1, 0],
    ['west', -halfW, 0, WALL_HALF_THICK, halfD + WALL_HALF_THICK, -1, 0],
    ['south', 0, halfD, halfW + WALL_HALF_THICK, WALL_HALF_THICK, 0, 1],
    ['north', 0, -halfD, halfW + WALL_HALF_THICK, WALL_HALF_THICK, 0, -1],
  ];
  const walls: Wall[] = [];
  for (const [name, x, z, hx, hz, nx, nz] of wallSpecs) {
    const mesh = new Mesh(new BoxGeometry(hx * 2, ROOM.wallHeight, hz * 2), wallMat);
    mesh.name = 'wall-' + name;
    mesh.position.set(x, hy, z);
    ctx.scene.add(mesh);
    world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, hy, z), fixed);
    walls.push({ name, mesh, nx, nz });
  }

  // Static furniture: supports first (desks, counter), then what stands on them (coffee machine).
  const statics = PROP_PLACEMENTS.filter((p) => p.kind === 'static');
  const ordered = [...statics.filter((p) => !p.on), ...statics.filter((p) => p.on)];
  const tops = new Map<string, number>();
  const buckets = new Map<Material, BufferGeometry[]>();
  const box = new Box3();

  for (const p of ordered) {
    const baseY = p.on ? (tops.get(p.on) ?? 0) : 0;
    const obj = assets.cloneProp(p.role);
    placeObject(obj, p, baseY);
    box.setFromObject(obj);
    tops.set(p.id, box.max.y);

    const cx = (box.min.x + box.max.x) / 2;
    const cy = (box.min.y + box.max.y) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    world.createCollider(
      R.ColliderDesc.cuboid(
        Math.max(0.03, (box.max.x - box.min.x) / 2),
        Math.max(0.03, (box.max.y - box.min.y) / 2),
        Math.max(0.03, (box.max.z - box.min.z) / 2),
      ).setTranslation(cx, cy, cz),
      fixed,
    );

    obj.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const g = toFloatGeometry(mesh.geometry);
      g.applyMatrix4(mesh.matrixWorld);
      const list = buckets.get(mesh.material);
      if (list) list.push(g);
      else buckets.set(mesh.material, [g]);
    });
  }

  let staticMeshes = 0;
  let staticSources = 0;
  for (const [material, geoms] of buckets) {
    staticSources += geoms.length;
    const merged = mergeGeometries(geoms, false);
    for (const g of geoms) g.dispose();
    if (!merged) throw new Error('static furniture merge failed for material ' + material.name);
    const mesh = new Mesh(merged, material);
    mesh.name = 'static-' + (material.name || staticMeshes);
    mesh.matrixAutoUpdate = false;
    ctx.scene.add(mesh);
    staticMeshes++;
  }

  const bounds = { minX: -halfW, maxX: halfW, minZ: -halfD, maxZ: halfD };
  registerDebug('room', () => ({ bounds: { ...bounds } }));
  registerDebug('scene', () => ({
    staticMeshes,
    staticSources,
    walls: walls.map((w) => ({ name: w.name, visible: w.mesh.visible })),
  }));

  return {
    bounds,
    surfaceTop(id) {
      return tops.get(id);
    },
    update(cameraYawRad) {
      // Horizontal direction from the room toward the camera: the view sits on +Z at yaw 0 (cameraView.ts).
      const sx = Math.sin(cameraYawRad);
      const sz = Math.cos(cameraYawRad);
      for (const w of walls) w.mesh.visible = !(w.nx * sx + w.nz * sz > WALL_HIDE_DOT);
    },
  };
}

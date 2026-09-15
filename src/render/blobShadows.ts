import {
  CanvasTexture,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Scene,
} from 'three';
import { registerDebug } from '../debug/testHook';

export interface BlobShadows {
  /** Register something that casts a blob. `getPos` returns the bottom of the object; returns a handle. */
  addCaster(getPos: () => { x: number; y: number; z: number }, radius: number): number;
  remove(handle: number): void;
  /** Place every blob under its caster. Call once per rendered frame. */
  update(): void;
  count(): number;
}

const FLOOR_Y = 0.01;
/** Above this height the blob has shrunk to half its size. */
const FADE_HEIGHT = 3;

/** 64x64 radial gradient drawn on a canvas: no asset file, no network, CSP-safe (D-14, RESEARCH Pattern 15). */
function gradientTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g2d = c.getContext('2d');
  if (g2d) {
    const grad = g2d.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.45)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g2d.fillStyle = grad;
    g2d.fillRect(0, 0, 64, 64);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

let debugRegistered = false;

/** Soft fake shadows for the player and every dynamic prop in ONE InstancedMesh (one draw call). No shadow maps. */
export function createBlobShadows(scene: Scene, capacity = 64): BlobShadows {
  const geometry = new PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({
    map: gradientTexture(),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.name = 'blob-shadows';
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false; // instances spread over the whole room; the base sphere would cull them wrongly
  mesh.renderOrder = 1;
  scene.add(mesh);

  const casters: Array<{ getPos: () => { x: number; y: number; z: number }; radius: number } | null> = [];
  const free: number[] = [];
  let active = 0;
  const m = new Matrix4();
  const zero = new Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < capacity; i++) mesh.setMatrixAt(i, zero);

  if (!debugRegistered) {
    debugRegistered = true;
    registerDebug('shadows', () => ({ count: active, capacity }));
  }

  return {
    addCaster(getPos, radius) {
      const handle = free.length > 0 ? free.pop()! : casters.length;
      if (handle >= capacity) return -1; // over capacity: no blob rather than a crash
      casters[handle] = { getPos, radius: Number.isFinite(radius) && radius > 0 ? radius : 0.2 };
      active++;
      return handle;
    },
    remove(handle) {
      if (handle < 0 || handle >= casters.length || !casters[handle]) return;
      casters[handle] = null;
      free.push(handle);
      active--;
      mesh.setMatrixAt(handle, zero);
      mesh.instanceMatrix.needsUpdate = true;
    },
    update() {
      for (let i = 0; i < casters.length; i++) {
        const c = casters[i];
        if (!c) continue;
        const p = c.getPos();
        const height = Math.max(0, p.y);
        const s = c.radius * 2 * (1 - Math.min(height / FADE_HEIGHT, 1) * 0.5);
        m.makeScale(s, 1, s);
        m.setPosition(p.x, FLOOR_Y, p.z);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    count() {
      return active;
    },
  };
}

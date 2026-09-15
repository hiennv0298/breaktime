import { Color, type Material, type Mesh, type Object3D } from 'three';

const EMISSIVE = new Color('#ffcc33');
const EMISSIVE_INTENSITY = 0.45;

/** One glowing clone per source material, created on first use and reused forever (T-01-10-01: no per-frame clones). */
const glowCache = new Map<Material, Material>();
/** Meshes currently showing a glow clone -> their original material. */
const swapped = new Map<Mesh, Material | Material[]>();
let current: Object3D | null = null;

function glowOf(src: Material): Material {
  const hit = glowCache.get(src);
  if (hit) return hit;
  const clone = src.clone();
  const withEmissive = clone as Material & { emissive?: Color; emissiveIntensity?: number };
  if (withEmissive.emissive) {
    withEmissive.emissive.copy(EMISSIVE);
    withEmissive.emissiveIntensity = EMISSIVE_INTENSITY;
  }
  glowCache.set(src, clone);
  return clone;
}

function restore(): void {
  for (const [mesh, original] of swapped) mesh.material = original;
  swapped.clear();
}

/** Make `obj` (and only `obj`) glow; null clears. Originals are restored when the highlight moves or clears. */
export function setHighlighted(obj: Object3D | null): void {
  if (obj === current) return;
  restore();
  current = obj;
  if (!obj) return;
  obj.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const original = mesh.material;
    swapped.set(mesh, original);
    mesh.material = Array.isArray(original) ? original.map(glowOf) : glowOf(original);
  });
}

export function getHighlighted(): Object3D | null {
  return current;
}

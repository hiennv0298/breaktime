import { Box3, Group, Mesh, MeshLambertMaterial, Vector3, type Material, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import officeIndex from '../assets/office-index.json';

export interface OfficeAssets {
  /**
   * A new Object3D for `role` whose local origin is the bottom-centre of the model (footprint centred on XZ,
   * lowest point at y 0). Geometry and materials are shared with the source scene, never copied.
   */
  cloneProp(role: string): Object3D;
  /** World-space bounding-box size of `obj` (Box3.setFromObject). */
  sizeOf(obj: Object3D): Vector3;
}

type AnyMaterial = Material & {
  map?: MeshLambertMaterial['map'];
  color?: MeshLambertMaterial['color'];
};

/** Flat Lambert look (D-14): cheaper than the loader's MeshStandardMaterial on mobile, keeps texture and colour. */
function toLambert(src: AnyMaterial, cache: Map<Material, MeshLambertMaterial>): MeshLambertMaterial {
  const hit = cache.get(src);
  if (hit) return hit;
  const m = new MeshLambertMaterial({
    map: src.map ?? null,
    vertexColors: src.vertexColors,
    transparent: src.transparent,
    opacity: src.opacity,
    alphaTest: src.alphaTest,
    side: src.side,
    depthWrite: src.depthWrite,
  });
  if (src.color) m.color.copy(src.color);
  m.name = src.name;
  cache.set(src, m);
  return m;
}

function convertMaterials(root: Object3D, cache: Map<Material, MeshLambertMaterial>): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material;
    mesh.material = Array.isArray(mat)
      ? mat.map((m) => toLambert(m as AnyMaterial, cache))
      : toLambert(mat as AnyMaterial, cache);
  });
}

const tmpBox = new Box3();
const tmpCentre = new Vector3();

/** Parses the committed office.glb and food.glb (plan 01-05) with the meshopt decoder. */
export async function parseOfficeAssets(officeGlb: ArrayBuffer, foodGlb: ArrayBuffer): Promise<OfficeAssets> {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const [office, food] = await Promise.all([loader.parseAsync(officeGlb, ''), loader.parseAsync(foodGlb, '')]);

  const cache = new Map<Material, MeshLambertMaterial>();
  convertMaterials(office.scene, cache);
  convertMaterials(food.scene, cache);
  office.scene.updateMatrixWorld(true);
  food.scene.updateMatrixWorld(true);

  const officeRoles = officeIndex.office as Record<string, string>;
  const foodRoles = officeIndex.food as Record<string, string>;

  // Resolve names inside the right file: office.glb's coffee machine has its own child named "mug" (01-05 note).
  function sourceNode(role: string): Object3D {
    if (Object.prototype.hasOwnProperty.call(officeRoles, role)) {
      const node = office.scene.getObjectByName(officeRoles[role]);
      if (node) return node;
    } else if (Object.prototype.hasOwnProperty.call(foodRoles, role)) {
      const node = food.scene.getObjectByName(foodRoles[role]);
      if (node) return node;
    }
    throw new Error('unknown office asset role ' + role);
  }

  return {
    cloneProp(role) {
      const inner = sourceNode(role).clone();
      const wrapper = new Group();
      wrapper.name = role;
      wrapper.add(inner);
      wrapper.updateMatrixWorld(true);
      tmpBox.setFromObject(wrapper);
      tmpBox.getCenter(tmpCentre);
      inner.position.x -= tmpCentre.x;
      inner.position.z -= tmpCentre.z;
      inner.position.y -= tmpBox.min.y;
      wrapper.updateMatrixWorld(true);
      return wrapper;
    },
    sizeOf(obj) {
      obj.updateWorldMatrix(true, true);
      return new Box3().setFromObject(obj).getSize(new Vector3());
    },
  };
}

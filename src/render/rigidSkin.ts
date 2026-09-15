import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Matrix3,
  Matrix4,
  Skeleton,
  SkinnedMesh,
  Vector3,
  type Material,
  type Mesh,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Rigid skin (plan 01-23, RESEARCH A6, CONTEXT "Hệ quả hiệu năng"): a Blocky character's part meshes merged into ONE
 * SkinnedMesh with one bone per part and every vertex weighted 1.0 to its part's bone, so a character costs 1 draw
 * call instead of 6. The bones are identity children of the named part nodes, so the animation clips (which target the
 * part nodes by name), the ragdoll (which re-parents and drives the part nodes) and the get-up blend all move the skin
 * without knowing about it.
 *
 * The source meshes are kept as hidden children: the ragdoll sizes its colliders from their bounding boxes and the
 * pointer-pick ray still hits them (Raycaster ignores `visible`).
 */

export interface RigidSkin {
  mesh: SkinnedMesh;
  /** One bone per part, in `partNames` order. */
  bones: Bone[];
}

/** Merged geometry per cache key (the parsed asset scene), shared by every clone of that asset. */
const geometryCache = new WeakMap<object, BufferGeometry>();

const tmpM = new Matrix4();
const tmpN = new Matrix3();
const tmpV = new Vector3();

/** The part's own meshes: every Mesh below it that is not inside a nested part node (same rule as ragdoll ownBounds). */
function ownMeshes(part: Object3D, partNames: ReadonlySet<string>): Mesh[] {
  const out: Mesh[] = [];
  const visit = (o: Object3D): void => {
    for (const child of o.children) {
      if (partNames.has(child.name)) continue;
      const mesh = child as Mesh;
      if (mesh.isMesh && mesh.geometry && !(mesh as SkinnedMesh).isSkinnedMesh) out.push(mesh);
      visit(child);
    }
  };
  visit(part);
  return out;
}

/** Float copy of POSITION / NORMAL / UV (quantized normalized input decoded via getComponent), baked into model space. */
function pieceGeometry(mesh: Mesh, toModel: Matrix4, boneIndex: number): BufferGeometry {
  const src = mesh.geometry;
  const pos = src.getAttribute('position');
  if (!pos) throw new Error('rigid skin: mesh without position');
  const count = pos.count;
  const g = new BufferGeometry();

  const position = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    tmpV.set(pos.getComponent(i, 0), pos.getComponent(i, 1), pos.getComponent(i, 2)).applyMatrix4(toModel);
    position[i * 3] = tmpV.x;
    position[i * 3 + 1] = tmpV.y;
    position[i * 3 + 2] = tmpV.z;
  }
  g.setAttribute('position', new BufferAttribute(position, 3));

  const index = src.getIndex();
  if (index) g.setIndex(Array.from({ length: index.count }, (_, i) => index.getComponent(i, 0)));

  const nrm = src.getAttribute('normal');
  if (nrm) {
    tmpN.getNormalMatrix(toModel);
    const normal = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      tmpV.set(nrm.getComponent(i, 0), nrm.getComponent(i, 1), nrm.getComponent(i, 2)).applyMatrix3(tmpN).normalize();
      normal[i * 3] = tmpV.x;
      normal[i * 3 + 1] = tmpV.y;
      normal[i * 3 + 2] = tmpV.z;
    }
    g.setAttribute('normal', new BufferAttribute(normal, 3));
  } else {
    g.computeVertexNormals();
  }

  const uvSrc = src.getAttribute('uv');
  const uv = new Float32Array(count * 2);
  if (uvSrc) {
    for (let i = 0; i < count; i++) {
      uv[i * 2] = uvSrc.getComponent(i, 0);
      uv[i * 2 + 1] = uvSrc.getComponent(i, 1);
    }
  }
  g.setAttribute('uv', new BufferAttribute(uv, 2));

  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    skinIndex[i * 4] = boneIndex;
    skinWeight[i * 4] = 1;
  }
  g.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4));
  return g;
}

/**
 * Merge `model`'s part meshes into one rigid SkinnedMesh. Call it in the bind pose, before any animation is applied.
 * `partNames` gives the bone order; `cacheKey` (e.g. the parsed asset scene) shares the merged geometry between clones.
 */
export function buildRigidSkin(
  model: Object3D,
  partNames: readonly string[],
  material: Material,
  cacheKey: object,
): RigidSkin {
  model.updateMatrixWorld(true);
  const modelInverse = new Matrix4().copy(model.matrixWorld).invert();
  const names = new Set(partNames);

  const parts = partNames.map((name) => {
    const node = model.getObjectByName(name);
    if (!node) throw new Error('rigid skin: no part ' + name);
    return node;
  });
  const meshesPerPart = parts.map((node, i) => {
    const meshes = ownMeshes(node, names);
    if (meshes.length === 0) throw new Error('rigid skin: part ' + partNames[i] + ' has no mesh');
    return meshes;
  });

  let geometry = geometryCache.get(cacheKey);
  if (!geometry) {
    const pieces: BufferGeometry[] = [];
    meshesPerPart.forEach((meshes, i) => {
      for (const mesh of meshes) pieces.push(pieceGeometry(mesh, tmpM.multiplyMatrices(modelInverse, mesh.matrixWorld), i));
    });
    // mergeGeometries needs all pieces indexed or none.
    const list = pieces.every((p) => p.index !== null) ? pieces : pieces.map((p) => (p.index ? p.toNonIndexed() : p));
    const merged = mergeGeometries(list, false);
    for (const p of pieces) p.dispose();
    if (!merged) throw new Error('rigid skin: merge failed');
    merged.name = 'character-skin';
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    geometry = merged;
    geometryCache.set(cacheKey, geometry);
  }

  const bones = parts.map((node, i) => {
    const bone = new Bone();
    bone.name = 'bone-' + partNames[i];
    node.add(bone);
    return bone;
  });

  const mesh = new SkinnedMesh(geometry, material);
  mesh.name = 'character-skin';
  // A ragdoll part can fly ~9 m from the root (01-15), so the cached bind-pose sphere would cull the character wrongly.
  mesh.frustumCulled = false;
  model.add(mesh);
  model.updateMatrixWorld(true);
  mesh.bind(new Skeleton(bones));

  for (const meshes of meshesPerPart) for (const m of meshes) m.visible = false;
  return { mesh, bones };
}

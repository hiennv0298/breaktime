import {
  Box3,
  BoxGeometry,
  BufferAttribute,
  Group,
  Mesh,
  MeshLambertMaterial,
  Vector3,
  type Bone,
  type Object3D,
  type SkinnedMesh,
} from 'three';
import { describe, expect, it } from 'vitest';
import { buildRigidSkin } from '../../src/render/rigidSkin';

/*
 * Plan 01-23 (RESEARCH A6, CONTEXT "Hệ quả hiệu năng"): a Blocky character's rigid part meshes merged into one
 * SkinnedMesh with one rigidly weighted bone per part, so each character is 1 draw call instead of 6.
 */

const PARTS = ['torso', 'head', 'leg-left'] as const;
const EPS = 1e-4;

/** Leg: an Int16 normalized position attribute on a scaled child, the way meshopt quantization ships it (01-05). */
function quantizedLeg(): Mesh {
  const src = new BoxGeometry(0.3, 0.7, 0.3);
  const pos = src.getAttribute('position');
  const q = new Int16Array(pos.count * 3);
  const range = 0.5; // dequantization scale lives on the mesh node
  for (let i = 0; i < pos.count * 3; i++) q[i] = Math.round((pos.array[i] / range) * 32767);
  const attr = new BufferAttribute(q, 3, true);
  src.setAttribute('position', attr);
  // An attribute the skin must drop.
  src.setAttribute('color', new BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3));
  const mesh = new Mesh(src);
  mesh.scale.setScalar(range);
  mesh.position.set(0, -0.35, 0);
  return mesh;
}

function makeModel(): Group {
  const model = new Group();
  model.name = 'model';

  const torso = new Group();
  torso.name = 'torso';
  torso.position.set(0, 0.7, 0);
  torso.add(new Mesh(new BoxGeometry(0.8, 0.9, 0.6)));
  model.add(torso);

  const head = new Group();
  head.name = 'head';
  head.position.set(0, 1.2, 0);
  head.scale.setScalar(0.1);
  head.add(new Mesh(new BoxGeometry(8, 8, 8)));
  torso.add(head);

  const leg = new Group();
  leg.name = 'leg-left';
  leg.position.set(-0.2, 0.7, 0);
  leg.add(quantizedLeg());
  model.add(leg);

  model.updateMatrixWorld(true);
  return model;
}

function part(model: Object3D, name: string): Object3D {
  const o = model.getObjectByName(name);
  if (!o) throw new Error('test model has no ' + name);
  return o;
}

/** The part node's own mesh (first Mesh child). */
function ownMesh(model: Object3D, name: string): Mesh {
  const m = part(model, name).children.find((c) => (c as Mesh).isMesh && !(c as SkinnedMesh).isSkinnedMesh);
  if (!m) throw new Error('test part has no mesh ' + name);
  return m as Mesh;
}

function worldBox(obj: Object3D): Box3 {
  return new Box3().setFromObject(obj, true);
}

function sourceUnion(model: Object3D): Box3 {
  const box = new Box3();
  for (const name of PARTS) box.union(worldBox(ownMesh(model, name)));
  return box;
}

function skinWorldBox(mesh: SkinnedMesh): Box3 {
  mesh.computeBoundingBox();
  return mesh.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
}

/** World box of the skinned vertices bound to one bone. */
function boneBox(mesh: SkinnedMesh, bone: number): Box3 {
  const box = new Box3();
  const skinIndex = mesh.geometry.getAttribute('skinIndex');
  const v = new Vector3();
  for (let i = 0; i < skinIndex.count; i++) {
    if (skinIndex.getComponent(i, 0) !== bone) continue;
    mesh.getVertexPosition(i, v);
    box.expandByPoint(v.applyMatrix4(mesh.matrixWorld));
  }
  return box;
}

function expectBoxClose(actual: Box3, expected: Box3): void {
  for (const k of ['x', 'y', 'z'] as const) {
    expect(Math.abs(actual.min[k] - expected.min[k]), `min.${k} ${actual.min[k]} vs ${expected.min[k]}`).toBeLessThan(EPS);
    expect(Math.abs(actual.max[k] - expected.max[k]), `max.${k} ${actual.max[k]} vs ${expected.max[k]}`).toBeLessThan(EPS);
  }
}

function vertexCount(mesh: Mesh): number {
  return mesh.geometry.getAttribute('position').count;
}

describe('buildRigidSkin', () => {
  it('merges the part meshes into one SkinnedMesh with rigid single-bone weights', () => {
    const model = makeModel();
    const counts = PARTS.map((n) => vertexCount(ownMesh(model, n)));
    const material = new MeshLambertMaterial();
    const { mesh, bones } = buildRigidSkin(model, PARTS, material, {});

    expect(mesh.isSkinnedMesh).toBe(true);
    expect(mesh.material).toBe(material);
    const g = mesh.geometry;
    expect(g.getAttribute('position').count).toBe(counts[0] + counts[1] + counts[2]);
    expect(Object.keys(g.attributes).sort()).toEqual(['normal', 'position', 'skinIndex', 'skinWeight', 'uv']);

    const skinIndex = g.getAttribute('skinIndex');
    const skinWeight = g.getAttribute('skinWeight');
    expect(skinIndex.itemSize).toBe(4);
    expect(skinIndex.array).toBeInstanceOf(Uint16Array);
    expect(skinWeight.itemSize).toBe(4);
    // Merge order = part order: [torso][head][leg]. The torso mesh never gets index 1, the nested head never 0.
    let v = 0;
    PARTS.forEach((_, p) => {
      for (let i = 0; i < counts[p]; i++, v++) {
        expect(skinIndex.getComponent(v, 0)).toBe(p);
        for (let k = 1; k < 4; k++) expect(skinIndex.getComponent(v, k)).toBe(0);
        expect([0, 1, 2, 3].map((k) => skinWeight.getComponent(v, k))).toEqual([1, 0, 0, 0]);
      }
    });

    expect(bones.length).toBe(PARTS.length);
    expect(mesh.skeleton.bones).toEqual(bones);
  });

  it('adds one identity bone per part, hides (but keeps) the source meshes and parents the skin to the model', () => {
    const model = makeModel();
    const sources = PARTS.map((n) => ownMesh(model, n));
    const { mesh, bones } = buildRigidSkin(model, PARTS, new MeshLambertMaterial(), {});

    PARTS.forEach((name, i) => {
      const node = part(model, name);
      const own = node.children.filter((c) => (c as Bone).isBone);
      expect(own.length).toBe(1);
      expect(own[0]).toBe(bones[i]);
      expect(own[0].name).toBe('bone-' + name);
      expect(own[0].position.toArray()).toEqual([0, 0, 0]);
      expect(own[0].quaternion.toArray()).toEqual([0, 0, 0, 1]);
      expect(own[0].scale.toArray()).toEqual([1, 1, 1]);
    });
    sources.forEach((m, i) => {
      expect(m.visible).toBe(false);
      expect(m.parent).toBe(part(model, PARTS[i]));
    });
    expect(mesh.parent).toBe(model);
    expect(mesh.name).toBe('character-skin');
    expect(mesh.frustumCulled).toBe(false);
  });

  it('matches the union of the source meshes in world space, including the decoded Int16 leg', () => {
    const model = makeModel();
    const expected = sourceUnion(model);
    const { mesh } = buildRigidSkin(model, PARTS, new MeshLambertMaterial(), {});
    model.updateMatrixWorld(true);
    expectBoxClose(skinWorldBox(mesh), expected);
    // The leg alone: quantized positions decoded (a raw Int16 copy would be ~32767x too large).
    expectBoxClose(boneBox(mesh, 2), worldBox(ownMesh(model, 'leg-left')));
  });

  it('follows a moved part and a moved or scaled model', () => {
    const model = makeModel();
    const { mesh } = buildRigidSkin(model, PARTS, new MeshLambertMaterial(), {});
    model.updateMatrixWorld(true);
    const torsoBefore = boneBox(mesh, 0);
    const legBefore = boneBox(mesh, 2);

    part(model, 'leg-left').position.x += 2;
    model.updateMatrixWorld(true);
    const legAfter = boneBox(mesh, 2);
    expect(legAfter.max.x - legBefore.max.x).toBeCloseTo(2, 4);
    expect(legAfter.min.x - legBefore.min.x).toBeCloseTo(2, 4);
    expectBoxClose(boneBox(mesh, 0), torsoBefore);
    const skin = skinWorldBox(mesh);
    expect(skin.max.x).toBeCloseTo(legAfter.max.x, 4);
    expectBoxClose(skin, sourceUnion(model));

    model.position.set(3, 1, -2);
    model.scale.setScalar(1.5);
    model.updateMatrixWorld(true);
    expectBoxClose(skinWorldBox(mesh), sourceUnion(model));
  });

  it('keeps the skin in place when a part is re-parented with attach (ragdoll detach)', () => {
    const scene = new Group();
    const model = makeModel();
    model.position.set(1, 0, 2);
    model.rotation.y = 0.7;
    scene.add(model);
    const ragdollRoot = new Group();
    scene.add(ragdollRoot);
    scene.updateMatrixWorld(true);

    const { mesh } = buildRigidSkin(model, PARTS, new MeshLambertMaterial(), {});
    scene.updateMatrixWorld(true);
    const before = skinWorldBox(mesh);

    const torso = part(model, 'torso');
    const sources = PARTS.map((n) => ownMesh(model, n));
    ragdollRoot.attach(torso);
    scene.updateMatrixWorld(true);
    expect(torso.parent).toBe(ragdollRoot);
    expectBoxClose(skinWorldBox(mesh), before);

    // Driven as a ragdoll part in world space, the skin follows.
    torso.position.y += 1;
    scene.updateMatrixWorld(true);
    const union = new Box3();
    for (const m of sources) union.union(worldBox(m));
    expectBoxClose(skinWorldBox(mesh), union);
  });

  it('shares the merged geometry between clones with the same cache key', () => {
    const a = makeModel();
    const b = a.clone();
    const key = {};
    const skinA = buildRigidSkin(a, PARTS, new MeshLambertMaterial(), key);
    const skinB = buildRigidSkin(b, PARTS, new MeshLambertMaterial(), key);
    expect(skinB.mesh.geometry).toBe(skinA.mesh.geometry);
    expect(skinB.mesh).not.toBe(skinA.mesh);
    expect(skinB.mesh.skeleton).not.toBe(skinA.mesh.skeleton);

    const skinC = buildRigidSkin(makeModel(), PARTS, new MeshLambertMaterial(), {});
    expect(skinC.mesh.geometry).not.toBe(skinA.mesh.geometry);
  });

  it('throws on a missing part or a part without its own mesh', () => {
    expect(() => buildRigidSkin(makeModel(), ['torso', 'arm-right'], new MeshLambertMaterial(), {})).toThrow(
      'rigid skin: no part arm-right',
    );
    const model = makeModel();
    const empty = new Group();
    empty.name = 'arm-left';
    part(model, 'torso').add(empty);
    expect(() => buildRigidSkin(model, ['torso', 'arm-left'], new MeshLambertMaterial(), {})).toThrow(
      'rigid skin: part arm-left has no mesh',
    );
  });
});

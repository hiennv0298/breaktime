import {
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Vector3,
  type Scene,
} from 'three';

/**
 * Shared low-poly shard kit (D-13, RESEARCH Pattern 15 / Conflicts C6 resolved: one generic kit, no per-object cuts).
 *
 * Five convex shapes are built in code (no asset, CREDITS lists the kit as made in-repo): tetra, wedge, thin slab,
 * long sliver and chip, each <= 12 triangles with flat normals. Each shape is centred on the origin and scaled so its
 * largest extent is 1; SHARD_ASPECT gives the resulting bounding box so a physics cuboid can match it.
 * One InstancedMesh per shape (capacity instances each, instance index = debris slot) with instanceColor tinting.
 * That is at most 5 draw calls, and 0 while no shard is alive because an empty shape mesh is hidden.
 */

export const SHARD_SHAPES = 5 as const;

type Shape = { verts: ReadonlyArray<readonly [number, number, number]>; faces: ReadonlyArray<readonly [number, number, number]> };

function prismFaces(n: number): Array<[number, number, number]> {
  const f: Array<[number, number, number]> = [];
  for (let i = 1; i < n - 1; i++) {
    f.push([0, i, i + 1]); // bottom fan
    f.push([n, n + i, n + i + 1]); // top fan
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    f.push([i, j, n + j]);
    f.push([i, n + j, n + i]);
  }
  return f;
}

const SHAPES: ReadonlyArray<Shape> = [
  // 0 tetra: 4 triangles
  {
    verts: [
      [0, 0, 0],
      [1, 0, 0.15],
      [0.3, 0.05, 1],
      [0.45, 0.9, 0.4],
    ],
    faces: [
      [0, 1, 2],
      [0, 1, 3],
      [0, 2, 3],
      [1, 2, 3],
    ],
  },
  // 1 wedge: truncated triangular pyramid, 8 triangles
  {
    verts: [
      [0, 0, 0],
      [1, 0, 0.05],
      [0.1, 0, 0.9],
      [0.15, 0.55, 0.12],
      [0.55, 0.55, 0.15],
      [0.2, 0.55, 0.5],
    ],
    faces: prismFaces(3),
  },
  // 2 thin slab: irregular quadrilateral plate, 12 triangles
  {
    verts: [
      [0, 0, 0],
      [1, 0, 0.1],
      [0.8, 0, 0.9],
      [0.1, 0, 0.7],
      [0, 0.18, 0],
      [1, 0.18, 0.1],
      [0.8, 0.18, 0.9],
      [0.1, 0.18, 0.7],
    ],
    faces: prismFaces(4),
  },
  // 3 long sliver: elongated triangular bipyramid, 6 triangles
  {
    verts: [
      [0.4, 0, 0.2],
      [0.4, 0.35, 0],
      [0.4, 0.3, 0.4],
      [0, 0.2, 0.2],
      [1, 0.15, 0.25],
    ],
    faces: [
      [0, 1, 3],
      [1, 2, 3],
      [2, 0, 3],
      [0, 1, 4],
      [1, 2, 4],
      [2, 0, 4],
    ],
  },
  // 4 chip: irregular octahedron, 8 triangles
  {
    verts: [
      [0.5, 0.05, 0],
      [-0.4, 0, 0.1],
      [0, 0.3, 0],
      [0.05, -0.35, 0],
      [0, 0, 0.45],
      [0.1, 0, -0.5],
    ],
    faces: [
      [0, 2, 4],
      [0, 2, 5],
      [0, 3, 4],
      [0, 3, 5],
      [1, 2, 4],
      [1, 2, 5],
      [1, 3, 4],
      [1, 3, 5],
    ],
  },
];

/** Bounding-box size of each unit shape (largest axis = 1), for sizing the matching physics cuboid. */
export const SHARD_ASPECT: ReadonlyArray<Readonly<{ x: number; y: number; z: number }>> = SHAPES.map((s) => {
  const e = extents(s);
  const m = Math.max(e.x, e.y, e.z);
  return Object.freeze({ x: e.x / m, y: e.y / m, z: e.z / m });
});

function extents(s: Shape): { x: number; y: number; z: number; min: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const v of s.verts) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], v[a]);
      max[a] = Math.max(max[a], v[a]);
    }
  }
  return { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2], min };
}

/** Non-indexed geometry, centred, largest extent 1, every triangle wound outward (all shapes are convex). */
function buildGeometry(s: Shape): BufferGeometry {
  const e = extents(s);
  const scale = 1 / Math.max(e.x, e.y, e.z);
  const pts = s.verts.map(
    (v) => new Vector3((v[0] - e.min[0] - e.x / 2) * scale, (v[1] - e.min[1] - e.y / 2) * scale, (v[2] - e.min[2] - e.z / 2) * scale),
  );
  const centroid = new Vector3();
  for (const p of pts) centroid.add(p);
  centroid.divideScalar(pts.length);

  const pos: number[] = [];
  const ab = new Vector3();
  const ac = new Vector3();
  const n = new Vector3();
  const mid = new Vector3();
  for (const [i, j, k] of s.faces) {
    const a = pts[i];
    let b = pts[j];
    let c = pts[k];
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    mid.copy(a).add(b).add(c).divideScalar(3).sub(centroid);
    if (n.dot(mid) < 0) [b, c] = [c, b];
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals(); // non-indexed: one normal per face = flat shading
  g.computeBoundingSphere();
  return g;
}

export interface ShardKit {
  /** Show debris slot `slot` as shape `shape` with world matrix `m` and tint `color`. */
  setInstance(slot: number, shape: number, m: Matrix4, color: Color): void;
  hide(slot: number): void;
  /** Upload changed instance buffers; call once per rendered frame. */
  commit(): void;
}

/** Triangles of every shape (tests and budget notes). */
export const SHARD_TRIANGLES: ReadonlyArray<number> = SHAPES.map((s) => s.faces.length);

export function createShardKit(scene: Scene, capacity: number): ShardKit {
  const size = Math.max(0, Math.floor(capacity));
  const zero = new Matrix4().makeScale(0, 0, 0);
  const white = new Color(1, 1, 1);
  const material = new MeshLambertMaterial({ color: 0xffffff });
  const meshes: InstancedMesh[] = [];
  const liveCount = new Int32Array(SHARD_SHAPES);
  const dirty = new Uint8Array(SHARD_SHAPES);
  /** Shape currently shown in each slot, -1 when hidden. */
  const shapeOf = new Int8Array(size).fill(-1);

  for (let s = 0; s < SHARD_SHAPES; s++) {
    const mesh = new InstancedMesh(buildGeometry(SHAPES[s]), material, size);
    mesh.name = 'shards-' + s;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    for (let i = 0; i < size; i++) {
      mesh.setMatrixAt(i, zero);
      mesh.setColorAt(i, white);
    }
    mesh.instanceColor?.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false; // instances spread over the room; the geometry's own sphere would cull them wrongly
    mesh.visible = false;
    scene.add(mesh);
    meshes.push(mesh);
  }

  function hide(slot: number): void {
    if (slot < 0 || slot >= size) return;
    const s = shapeOf[slot];
    if (s < 0) return;
    meshes[s].setMatrixAt(slot, zero);
    shapeOf[slot] = -1;
    liveCount[s]--;
    dirty[s] = 1;
  }

  return {
    setInstance(slot, shape, m, color) {
      if (slot < 0 || slot >= size) return;
      const s = ((Math.floor(shape) % SHARD_SHAPES) + SHARD_SHAPES) % SHARD_SHAPES;
      if (shapeOf[slot] !== s) {
        hide(slot);
        shapeOf[slot] = s;
        liveCount[s]++;
      }
      const mesh = meshes[s];
      mesh.setMatrixAt(slot, m);
      mesh.setColorAt(slot, color);
      dirty[s] = 1;
    },
    hide,
    commit() {
      for (let s = 0; s < SHARD_SHAPES; s++) {
        if (!dirty[s]) continue;
        dirty[s] = 0;
        const mesh = meshes[s];
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.visible = liveCount[s] > 0;
      }
    },
  };
}

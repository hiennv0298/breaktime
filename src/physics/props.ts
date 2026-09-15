import type { RigidBody } from '@dimforge/rapier3d-compat';
import { Box3, Quaternion, Vector3, type Camera, type Object3D } from 'three';
import { registerDebug } from '../debug/testHook';
import type { GameCtx } from '../game/game';
import { PRIMITIVE_ROLES, roleScale, type Placement } from '../game/layout';
import type { OfficeAssets } from '../render/officeAssets';
import { PRIMITIVE_BUILDERS } from '../render/primitives';

/** Settle-sleep helper thresholds (D-07 step 5; plan 01-20 may tune them). Rapier JS has no activation setters. */
export const SLEEP_LINEAR = 0.05; // m/s
export const SLEEP_ANGULAR = 0.08; // rad/s
export const SLEEP_FRAMES = 60;

/** Push impulse per unit mass: bounded constants, never derived from input magnitude. */
const PUSH_HORIZONTAL = 3.5;
const PUSH_UP = 1.2;
const MIN_HALF_EXTENT = 0.03;
/** Spawn gap above the supporting surface so no body starts in contact penetration. */
const SPAWN_GAP = 0.005;

export interface PropRecord {
  id: string;
  role: string;
  kind: 'prop' | 'breakable';
  body: RigidBody;
  object: Object3D;
  /** Footprint radius on XZ (largest half extent), used for targeting and the blob shadow. */
  radius: number;
  mass: number;
  home: { pos: Vector3; quat: Quaternion };
  /** Collider (bounding box) centre in the object's local frame. */
  centre: Vector3;
}

export interface Props {
  list(): PropRecord[];
  get(id: string): PropRecord | undefined;
  push(id: string, dirX: number, dirZ: number): void;
  fixedUpdate(): void;
  sync(): void;
  byColliderHandle(h: number): PropRecord | undefined;
  /** Current camera, used only by the lazy `__bt.props` screen projection. */
  setCamera(camera: Camera, viewport: () => { width: number; height: number }): void;
}

export interface PropsOptions {
  /** Top y of the static placement a prop stands on (`Placement.on`). */
  surfaceTop?(id: string): number | undefined;
}

const tmpV = new Vector3();

/** Screen position in CSS pixels of the record's collider centre. */
export function projectToScreen(
  rec: PropRecord,
  camera: Camera,
  width: number,
  height: number,
): { x: number; y: number } {
  tmpV.copy(rec.centre).applyMatrix4(rec.object.matrixWorld).project(camera);
  return { x: ((tmpV.x + 1) / 2) * width, y: ((1 - tmpV.y) / 2) * height };
}

/** Dynamic office props (D-13 physics part): tip, slide and fall when pushed or bumped. */
export function createProps(
  ctx: GameCtx,
  placements: ReadonlyArray<Placement>,
  assets: OfficeAssets,
  opts: PropsOptions = {},
): Props {
  const { R, world } = ctx.physics;
  const records: PropRecord[] = [];
  const byId = new Map<string, PropRecord>();
  const byCollider = new Map<number, PropRecord>();
  const calmSteps = new Map<PropRecord, number>();
  const box = new Box3();
  let camera: Camera | null = null;
  let viewport: () => { width: number; height: number } = () => ({ width: innerWidth, height: innerHeight });

  for (const p of placements) {
    if (p.kind === 'static') continue;
    const object = PRIMITIVE_ROLES.has(p.role) ? PRIMITIVE_BUILDERS[p.role]() : assets.cloneProp(p.role);
    const [sx, sy, sz] = roleScale(p.role);
    object.scale.set(sx, sy, sz);
    object.name = p.id;

    // Local bounding box: measured unrotated at the origin, so the collider matches the object's own axes.
    object.position.set(0, 0, 0);
    object.rotation.set(0, 0, 0);
    object.updateMatrixWorld(true);
    box.setFromObject(object);
    const hx = Math.max(MIN_HALF_EXTENT, (box.max.x - box.min.x) / 2);
    const hy = Math.max(MIN_HALF_EXTENT, (box.max.y - box.min.y) / 2);
    const hz = Math.max(MIN_HALF_EXTENT, (box.max.z - box.min.z) / 2);
    const centre = box.getCenter(new Vector3());

    const baseY = (p.on ? (opts.surfaceTop?.(p.on) ?? 0) : 0) + (p.y ?? 0) + SPAWN_GAP;
    const quat = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), ((p.yawDeg ?? 0) * Math.PI) / 180);
    const pos = new Vector3(p.x, baseY, p.z);

    const body = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
        .setLinearDamping(0.2)
        .setAngularDamping(0.5)
        .setCanSleep(true),
    );
    const collider = world.createCollider(
      R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(centre.x, centre.y, centre.z).setDensity(1).setRestitution(0.1),
      body,
    );

    object.position.copy(pos);
    object.quaternion.copy(quat);
    object.updateMatrixWorld(true);
    ctx.scene.add(object);

    const rec: PropRecord = {
      id: p.id,
      role: p.role,
      kind: p.kind,
      body,
      object,
      radius: Math.max(hx, hz),
      mass: body.mass(),
      home: { pos: pos.clone(), quat: quat.clone() },
      centre,
    };
    if (byId.has(rec.id)) throw new Error('duplicate prop id ' + rec.id);
    records.push(rec);
    byId.set(rec.id, rec);
    byCollider.set(collider.handle, rec);
    calmSteps.set(rec, 0);
  }

  let breakableCount = 0;
  for (const r of records) if (r.kind === 'breakable') breakableCount++;

  registerDebug('props', () => {
    const size = viewport();
    let sleepingCount = 0;
    const list = records.map((r) => {
      const t = r.body.translation();
      const sleeping = r.body.isSleeping();
      if (sleeping) sleepingCount++;
      return {
        id: r.id,
        role: r.role,
        kind: r.kind,
        pos: [t.x, t.y, t.z],
        sleeping,
        screen: camera ? projectToScreen(r, camera, size.width, size.height) : { x: -1, y: -1 },
      };
    });
    return { dynamicCount: records.length, breakableCount, sleepingCount, list };
  });

  return {
    list() {
      return records;
    },
    get(id) {
      return byId.get(id);
    },
    push(id, dirX, dirZ) {
      const rec = byId.get(id);
      if (!rec) return;
      const len = Math.hypot(dirX, dirZ);
      if (!Number.isFinite(len) || len < 1e-6) return;
      const m = rec.mass > 0 ? rec.mass : rec.body.mass();
      rec.body.applyImpulse(
        { x: (dirX / len) * PUSH_HORIZONTAL * m, y: PUSH_UP * m, z: (dirZ / len) * PUSH_HORIZONTAL * m },
        true,
      );
      rec.body.wakeUp();
      calmSteps.set(rec, 0);
    },
    fixedUpdate() {
      for (const rec of records) {
        const body = rec.body;
        if (body.isSleeping()) {
          calmSteps.set(rec, 0);
          continue;
        }
        const v = body.linvel();
        const w = body.angvel();
        const calm = Math.hypot(v.x, v.y, v.z) < SLEEP_LINEAR && Math.hypot(w.x, w.y, w.z) < SLEEP_ANGULAR;
        const n = calm ? (calmSteps.get(rec) ?? 0) + 1 : 0;
        if (n >= SLEEP_FRAMES) {
          body.sleep();
          calmSteps.set(rec, 0);
        } else {
          calmSteps.set(rec, n);
        }
      }
    },
    sync() {
      for (const rec of records) {
        const t = rec.body.translation();
        const q = rec.body.rotation();
        rec.object.position.set(t.x, t.y, t.z);
        rec.object.quaternion.set(q.x, q.y, q.z, q.w);
      }
    },
    byColliderHandle(h) {
      return byCollider.get(h);
    },
    setCamera(cam, vp) {
      camera = cam;
      viewport = vp;
    },
  };
}

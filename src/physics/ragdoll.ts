import type { ImpulseJoint, RigidBody } from '@dimforge/rapier3d-compat';
import { Box3, Group, Matrix4, Quaternion, Vector3, type Mesh, type Object3D, type Scene } from 'three';
import { npcRagdollGroups, PLAYER_RAGDOLL_GROUPS } from '../logic/collisionGroups';
import type { GameCtx } from '../game/game';
import { CHARACTER_PARTS } from '../render/characters';

/**
 * Pooled 6-body ragdoll for a Blocky character (D-12, RESEARCH Pattern 14; T-01-15-02).
 *
 * Bodies, colliders and joints are created ONCE at NPC spawn and toggled with setEnabled; a slap allocates nothing in
 * Rapier. Each body's origin is its part node's origin, which is the part's pivot (hip, shoulder, neck), so joint
 * anchors are the child origin on one side and that same point in the torso frame on the other.
 */

export interface Ragdoll {
  /** Detach the parts into world space, enable the bodies and kick the torso. */
  activate(impulse: { x: number; y: number; z: number }, torque: { x: number; y: number; z: number }): void;
  deactivate(): void;
  /**
   * Call once per fixed step before the world steps. Applies the slap kick as soon as Rapier has computed the torso's
   * mass: a body created disabled has mass 0 until the first step after it is enabled, so an impulse applied in the same
   * call as setEnabled(true) is silently lost (measured with rapier3d-compat 0.20).
   */
  fixedUpdate(): void;
  /** Copy body transforms onto the parts (only while active). */
  sync(): void;
  torso(): RigidBody;
  active(): boolean;
  bodyCount(): number;
  /** Sum of the part masses (density 1 × collider volume). */
  mass(): number;
}

const TORSO = CHARACTER_PARTS.indexOf('torso');
const LINEAR_DAMPING = 0.2;
const ANGULAR_DAMPING = 0.5;
const DENSITY = 1;
const MIN_HALF_EXTENT = 0.03;
/** Collision-group bits 1..15 are free for ragdolls (bit 0 is left to the world). */
const MAX_GROUP_INDEX = 14;

const PART_NAMES = new Set<string>(CHARACTER_PARTS);
const all = new Set<Ragdoll>();
const playerRagdolls = new Set<Ragdoll>();
const roots = new WeakMap<Scene, Group>();

/** Every ragdoll ever created on this page (for __bt.ragdolls). Returns NPC numbers only; player tracked separately. */
export function ragdollStats(): {
  active: number;
  bodies: number;
  enabledBodies: number;
  player: { active: boolean; bodies: number };
} {
  let active = 0;
  let bodies = 0;
  let playerActive = false;
  let playerBodies = 0;
  for (const r of all) {
    const count = r.bodyCount();
    if (playerRagdolls.has(r)) {
      if (r.active()) playerActive = true;
      playerBodies = count;
    } else {
      bodies += count;
      if (r.active()) active++;
    }
  }
  return { active, bodies, enabledBodies: active * CHARACTER_PARTS.length, player: { active: playerActive, bodies: playerBodies } };
}

/** One flat, identity-transform group per scene holds every detached ragdoll part. */
function ragdollRoot(scene: Scene): Group {
  let g = roots.get(scene);
  if (!g) {
    g = new Group();
    g.name = 'ragdoll-root';
    scene.add(g);
    roots.set(scene, g);
  }
  return g;
}

/** Rapier interaction groups for NPC ragdoll: membership bit (1 + groupIndex), filter = every bit except that one. */
export const ragdollGroups = npcRagdollGroups;

const tmpM = new Matrix4();
const tmpInv = new Matrix4();
const tmpBox = new Box3();
const tmpPos = new Vector3();
const tmpQuat = new Quaternion();
const tmpScale = new Vector3();
const ONE = new Vector3(1, 1, 1);

/** Part frame = world position + rotation of the part node, without its scale (Rapier bodies have no scale). */
function partFrameInverse(part: Object3D, out: Matrix4): Matrix4 {
  part.matrixWorld.decompose(tmpPos, tmpQuat, tmpScale);
  return out.compose(tmpPos, tmpQuat, ONE).invert();
}

/** Bounds of the part's own meshes (not of nested parts: torso holds the arms and head) in the unscaled part frame. */
function ownBounds(part: Object3D, out: Box3): Box3 {
  out.makeEmpty();
  partFrameInverse(part, tmpInv);
  const visit = (o: Object3D): void => {
    for (const child of o.children) {
      if (PART_NAMES.has(child.name)) continue;
      const mesh = child as Mesh;
      if (mesh.isMesh && mesh.geometry) {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        tmpM.multiplyMatrices(tmpInv, mesh.matrixWorld);
        out.union(tmpBox.copy(mesh.geometry.boundingBox!).applyMatrix4(tmpM));
      }
      visit(child);
    }
  };
  visit(part);
  return out;
}

/**
 * `parts` must be CHARACTER_PARTS in order and in the rest pose (collider sizes are measured from it, never hardcoded).
 * `groupIndex` gives this ragdoll its own collision bit so its parts ignore each other but hit the world, props and
 * other ragdolls. When `opts.player` is true, uses bit 0 (PLAYER_RAGDOLL_GROUPS) instead.
 */
export function createRagdoll(ctx: GameCtx, parts: Object3D[], groupIndex: number, opts?: { player?: boolean }): Ragdoll {
  if (parts.length !== CHARACTER_PARTS.length) throw new Error('ragdoll needs ' + CHARACTER_PARTS.length + ' parts');
  const { R, world } = ctx.physics;
  const isPlayer = opts?.player ?? false;
  const groups = isPlayer ? PLAYER_RAGDOLL_GROUPS : npcRagdollGroups(groupIndex);
  const root = ragdollRoot(ctx.scene);

  const top = parts[TORSO].parent ? topOf(parts[TORSO]) : parts[TORSO];
  top.updateMatrixWorld(true);

  const bodies: RigidBody[] = [];
  let totalMass = 0;
  for (const part of parts) {
    const box = ownBounds(part, new Box3());
    if (box.isEmpty()) throw new Error('ragdoll part ' + part.name + ' has no mesh');
    const hx = Math.max(MIN_HALF_EXTENT, (box.max.x - box.min.x) / 2);
    const hy = Math.max(MIN_HALF_EXTENT, (box.max.y - box.min.y) / 2);
    const hz = Math.max(MIN_HALF_EXTENT, (box.max.z - box.min.z) / 2);
    const c = box.getCenter(new Vector3());

    part.matrixWorld.decompose(tmpPos, tmpQuat, tmpScale);
    const body = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(tmpPos.x, tmpPos.y, tmpPos.z)
        .setRotation({ x: tmpQuat.x, y: tmpQuat.y, z: tmpQuat.z, w: tmpQuat.w })
        .setLinearDamping(LINEAR_DAMPING)
        .setAngularDamping(ANGULAR_DAMPING)
        .setCcdEnabled(true) // a slapped part moves ~0.15 m per step; CCD keeps it from tunnelling through walls
        .setCanSleep(true)
        .setEnabled(false),
    );
    world.createCollider(
      R.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(c.x, c.y, c.z)
        .setDensity(DENSITY)
        .setRestitution(0.1)
        .setFriction(0.8)
        .setCollisionGroups(groups),
      body,
    );
    totalMass += DENSITY * 8 * hx * hy * hz;
    bodies.push(body);
  }

  // Hips, shoulders and neck: child origin (0,0,0) on the child, the same world point in the torso frame.
  const torsoInv = partFrameInverse(parts[TORSO], new Matrix4());
  const joints: ImpulseJoint[] = [];
  parts.forEach((part, i) => {
    if (i === TORSO) return;
    const pivot = part.getWorldPosition(new Vector3()).applyMatrix4(torsoInv);
    const joint = world.createImpulseJoint(
      R.JointData.spherical({ x: pivot.x, y: pivot.y, z: pivot.z }, { x: 0, y: 0, z: 0 }),
      bodies[TORSO],
      bodies[i],
      false,
    );
    joint.setContactsEnabled(false);
    joints.push(joint);
  });

  let isActive = false;
  const zero = { x: 0, y: 0, z: 0 };
  const pendingImpulse = { x: 0, y: 0, z: 0 };
  const pendingTorque = { x: 0, y: 0, z: 0 };
  let kickPending = false;

  const ragdoll: Ragdoll = {
    activate(impulse, torque) {
      if (isActive) return;
      for (const part of parts) part.updateWorldMatrix(true, false);
      // World-preserving detach: afterwards each part's local transform IS its world transform.
      for (const part of parts) root.attach(part);
      parts.forEach((part, i) => {
        const body = bodies[i];
        body.setTranslation(part.position, false);
        body.setRotation(part.quaternion, false);
        body.setLinvel(zero, false);
        body.setAngvel(zero, false);
        body.setEnabled(true);
        body.wakeUp();
      });
      const finite = (v: { x: number; y: number; z: number }) => [v.x, v.y, v.z].every(Number.isFinite);
      if (finite(impulse)) Object.assign(pendingImpulse, { x: impulse.x, y: impulse.y, z: impulse.z });
      else Object.assign(pendingImpulse, zero);
      if (finite(torque)) Object.assign(pendingTorque, { x: torque.x, y: torque.y, z: torque.z });
      else Object.assign(pendingTorque, zero);
      kickPending = true;
      isActive = true;
      ragdoll.fixedUpdate(); // applies at once when the mass is already known (a re-used ragdoll)
    },
    deactivate() {
      for (const body of bodies) body.setEnabled(false);
      isActive = false;
      kickPending = false;
    },
    fixedUpdate() {
      if (!isActive || !kickPending) return;
      const t = bodies[TORSO];
      if (!(t.mass() > 0)) return; // mass not computed yet: try again next step
      t.applyImpulse(pendingImpulse, true);
      t.applyTorqueImpulse(pendingTorque, true);
      kickPending = false;
    },
    sync() {
      if (!isActive) return;
      parts.forEach((part, i) => {
        const t = bodies[i].translation();
        const q = bodies[i].rotation();
        part.position.set(t.x, t.y, t.z);
        part.quaternion.set(q.x, q.y, q.z, q.w);
      });
    },
    torso() {
      return bodies[TORSO];
    },
    active() {
      return isActive;
    },
    bodyCount() {
      return bodies.length;
    },
    mass() {
      return totalMass;
    },
  };
  all.add(ragdoll);
  if (isPlayer) playerRagdolls.add(ragdoll);
  return ragdoll;
}

function topOf(o: Object3D): Object3D {
  let cur = o;
  while (cur.parent) cur = cur.parent;
  return cur;
}

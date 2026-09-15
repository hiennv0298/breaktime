import type { RigidBody } from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3, type Object3D } from 'three';
import { createGetUp, slapGetUp, updateGetUp, type GetUpState } from '../logic/getUpFsm';
import {
  createWalker,
  nearestIndex,
  stepWalker,
  type WalkerState,
  type WaypointPoint,
} from '../logic/waypointWalker';
import { createRagdoll, type Ragdoll } from '../physics/ragdoll';
import { spawnCharacter, type CharacterAsset, type CharacterInstance } from '../render/characters';
import type { GameCtx } from './game';
import { ROOM } from './layout';
import { angleDelta, TURN_RATE } from './player';
import { NPC_RADIUS } from './waypoints';

/** Same capsule as the player: half height 0.45 m, radius 0.3 m, so the centre stands 0.75 m above the floor. */
export const NPC_HALF_HEIGHT = 0.45;
const CENTRE_Y = NPC_HALF_HEIGHT + NPC_RADIUS;
/** A recovered NPC stands at least this far from the walls. */
const WALL_MARGIN = 0.5;

export type NpcMode = WalkerState['mode'] | 'ragdoll' | 'recover';

export interface Npc {
  id: string;
  character: CharacterInstance;
  /** Kinematic capsule used while animated; disabled while the NPC is a ragdoll or getting up. */
  body: RigidBody;
  ragdoll: Ragdoll;
  /** Current walker state (replaced every fixed step). */
  readonly walker: WalkerState;
  /** 'ragdoll' | 'recover' while slapped, otherwise the walker mode. */
  readonly mode: NpcMode;
  /** Only an animated (walking or dwelling) NPC can be targeted and slapped (T-01-15-03). */
  slappable(): boolean;
  /** Switch to ragdoll mode; the caller disables the capsule and activates the ragdoll (game/slap.ts). */
  slap(): void;
  fixedUpdate(dt: number): void;
  frameUpdate(dt: number): void;
  /** Capsule centre while animated, torso while a ragdoll, standing centre while getting up. */
  pos(): { x: number; y: number; z: number };
  /** Point on (or just above) the floor under the NPC, for the blob shadow. */
  foot(): { x: number; y: number; z: number };
  /** False after despawn() until respawn() (plan 01-27): an inactive NPC is hidden, not simulated and not slappable. */
  active(): boolean;
  /**
   * Takes the NPC out of the office without destroying anything in Rapier (plan 01-27, D-29, T-01-27-03): a flying
   * ragdoll is synced, disabled and its parts re-attached first; the capsule is disabled and the character hidden.
   */
  despawn(): void;
  /** Brings an inactive NPC back, standing idle at `spawn` and walking its route again from its start point. */
  respawn(spawn: { x: number; z: number }): void;
}

export interface NpcOptions {
  id: string;
  asset: CharacterAsset;
  texture: string;
  route: WaypointPoint[];
  /** Route point the NPC starts at (and dwells at first). */
  startIndex: number;
  /** Spawn position; defaults to the route point at startIndex. */
  spawn?: { x: number; z: number };
  /** Start with the walker frozen (?npcAt test/bench pin); the first slap releases it. */
  frozen?: boolean;
  /** Collision-group index for this NPC's ragdoll (0..14). */
  groupIndex: number;
}

interface PartPose {
  pos: Vector3;
  quat: Quaternion;
  scale: Vector3;
}

const FORWARD = new Vector3(0, 0, 1);
const tmpFwd = new Vector3();
const tmpQ = new Quaternion();

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/**
 * Coworker NPC (D-11, D-12): a kinematic capsule driven along a hand-placed route by the pure waypoint walker, with an
 * animated Blocky character on top. A slap turns it into a pooled 6-part ragdoll; when the torso settles it blends
 * upright toward the idle pose (procedural get-up, RESEARCH Pattern 14) and walks on from the nearest route point.
 */
export function createNpc(ctx: GameCtx, opts: NpcOptions): Npc {
  const { R, world } = ctx.physics;
  const n = opts.route.length;
  if (n === 0) throw new Error(`npc ${opts.id} has an empty route`);
  const startIndex = ((Math.trunc(opts.startIndex) % n) + n) % n;
  const spawn = opts.spawn ?? opts.route[startIndex];

  const body = world.createRigidBody(
    R.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, CENTRE_Y, spawn.z),
  );
  world.createCollider(R.ColliderDesc.capsule(NPC_HALF_HEIGHT, NPC_RADIUS), body);

  const character = spawnCharacter(opts.asset, opts.texture);
  character.root.position.set(spawn.x, 0, spawn.z);
  ctx.scene.add(character.root);
  character.root.updateMatrixWorld(true);

  // Rest pose: size the ragdoll colliders before any animation is applied.
  const ragdoll = createRagdoll(ctx, character.parts, opts.groupIndex);
  const parents: Object3D[] = character.parts.map((p) => {
    if (!p.parent) throw new Error('character part ' + p.name + ' has no parent');
    return p.parent;
  });
  // Idle pose at time 0, sampled once: the target of the get-up blend.
  character.mixer.update(0);
  const idlePose: PartPose[] = character.parts.map((p) => ({
    pos: p.position.clone(),
    quat: p.quaternion.clone(),
    scale: p.scale.clone(),
  }));
  const fromPose: PartPose[] = character.parts.map(() => ({
    pos: new Vector3(),
    quat: new Quaternion(),
    scale: new Vector3(),
  }));
  // Re-attach order: torso before its children, so each parent's world matrix is final when a child joins it.
  const reattachOrder = character.parts
    .map((p, i) => ({ depth: depthOf(p), i }))
    .sort((a, b) => a.depth - b.depth)
    .map((e) => e.i);

  let isActive = true;
  let walker = createWalker(opts.route, spawn, startIndex);
  if (opts.frozen) walker = { ...walker, frozen: true };
  let getUp: GetUpState = createGetUp();
  let recoverT = 0;
  let targetYaw = 0;
  let yaw = 0;
  const next = { x: spawn.x, y: CENTRE_Y, z: spawn.z };
  const limX = ROOM.width / 2 - WALL_MARGIN;
  const limZ = ROOM.depth / 2 - WALL_MARGIN;

  function beginRecover(): void {
    const torso = ragdoll.torso();
    const t = torso.translation();
    const q = torso.rotation();
    tmpFwd.copy(FORWARD).applyQuaternion(tmpQ.set(q.x, q.y, q.z, q.w));
    // Torso forward projected onto the floor; a torso lying face up or down keeps the previous heading.
    if (Math.hypot(tmpFwd.x, tmpFwd.z) > 0.2) yaw = Math.atan2(tmpFwd.x, tmpFwd.z);
    targetYaw = yaw;
    const x = Number.isFinite(t.x) ? Math.min(limX, Math.max(-limX, t.x)) : walker.x;
    const z = Number.isFinite(t.z) ? Math.min(limZ, Math.max(-limZ, t.z)) : walker.z;

    ragdoll.sync();
    ragdoll.deactivate();
    character.root.position.set(x, 0, z);
    character.root.rotation.y = yaw;
    character.root.updateMatrixWorld(true);
    for (const i of reattachOrder) parents[i].attach(character.parts[i]);
    character.parts.forEach((p, i) => {
      fromPose[i].pos.copy(p.position);
      fromPose[i].quat.copy(p.quaternion);
      fromPose[i].scale.copy(p.scale);
    });
    recoverT = 0;
  }

  function resume(): void {
    const x = character.root.position.x;
    const z = character.root.position.z;
    character.parts.forEach((p, i) => {
      p.position.copy(idlePose[i].pos);
      p.quaternion.copy(idlePose[i].quat);
      p.scale.copy(idlePose[i].scale);
    });
    next.x = x;
    next.z = z;
    body.setTranslation(next, false);
    body.setEnabled(true);
    body.setNextKinematicTranslation(next);
    const index = nearestIndex(opts.route, x, z);
    walker = { ...walker, x, z, index: index < 0 ? 0 : index, mode: 'walk', dwellLeft: 0, frozen: false };
  }

  return {
    id: opts.id,
    character,
    body,
    ragdoll,
    get walker() {
      return walker;
    },
    get mode(): NpcMode {
      if (getUp.mode === 'ragdoll' || getUp.mode === 'recover') return getUp.mode;
      return walker.mode;
    },
    slappable() {
      return isActive && getUp.mode === 'animated';
    },
    slap() {
      getUp = slapGetUp(getUp);
      walker = { ...walker, frozen: true };
    },
    fixedUpdate(dt) {
      if (!isActive) return;
      if (getUp.mode === 'ragdoll') {
        ragdoll.fixedUpdate();
        const torso = ragdoll.torso();
        const v = torso.linvel();
        const w = torso.angvel();
        const r = updateGetUp(getUp, {
          torsoSpeed: Math.hypot(v.x, v.y, v.z),
          torsoAngSpeed: Math.hypot(w.x, w.y, w.z),
          dt,
        });
        getUp = r.state;
        if (r.event === 'start-recover') beginRecover();
        return;
      }
      if (getUp.mode === 'recover') {
        const r = updateGetUp(getUp, { torsoSpeed: 0, torsoAngSpeed: 0, dt });
        getUp = r.state;
        recoverT = r.recoverT;
        if (r.event === 'resumed') resume();
        return;
      }
      const r = stepWalker(walker, opts.route, dt);
      walker = r.state;
      if (r.vx !== 0 || r.vz !== 0) targetYaw = r.facingYaw;
      next.x = walker.x;
      next.z = walker.z;
      body.setNextKinematicTranslation(next);
    },
    frameUpdate(dt) {
      if (!isActive) return;
      if (getUp.mode === 'ragdoll') {
        // The mixer stays still: it would overwrite the detached parts.
        ragdoll.sync();
        return;
      }
      if (getUp.mode === 'recover') {
        const e = smoothstep(recoverT);
        character.parts.forEach((p, i) => {
          p.position.lerpVectors(fromPose[i].pos, idlePose[i].pos, e);
          p.quaternion.slerpQuaternions(fromPose[i].quat, idlePose[i].quat, e);
          p.scale.lerpVectors(fromPose[i].scale, idlePose[i].scale, e);
        });
        return;
      }
      const t = body.translation();
      character.root.position.set(t.x, t.y - CENTRE_Y, t.z);
      const k = dt > 0 ? 1 - Math.exp(-TURN_RATE * dt) : 0;
      yaw += angleDelta(yaw, targetYaw) * k;
      character.root.rotation.y = yaw; // the Blocky model faces +Z, the walker's facingYaw convention
      character.setMotion(walker.mode === 'walk' && !walker.frozen ? 'walk' : 'idle');
      if (dt > 0) character.mixer.update(dt);
    },
    pos() {
      if (getUp.mode === 'ragdoll') {
        const t = ragdoll.torso().translation();
        return { x: t.x, y: t.y, z: t.z };
      }
      if (getUp.mode === 'recover') {
        const p = character.root.position;
        return { x: p.x, y: CENTRE_Y, z: p.z };
      }
      const t = body.translation();
      return { x: t.x, y: t.y, z: t.z };
    },
    foot() {
      if (getUp.mode === 'ragdoll') {
        const t = ragdoll.torso().translation();
        return { x: t.x, y: Math.max(0, t.y - 0.3), z: t.z };
      }
      if (getUp.mode === 'recover') {
        const p = character.root.position;
        return { x: p.x, y: 0, z: p.z };
      }
      const t = body.translation();
      return { x: t.x, y: t.y - CENTRE_Y, z: t.z };
    },
    active() {
      return isActive;
    },
    despawn() {
      if (!isActive) return;
      if (getUp.mode === 'ragdoll' || ragdoll.active()) {
        // Same world-preserving re-attach as beginRecover: torso before its children.
        ragdoll.sync();
        ragdoll.deactivate();
        character.root.updateMatrixWorld(true);
        for (const i of reattachOrder) parents[i].attach(character.parts[i]);
      }
      character.parts.forEach((p, i) => {
        p.position.copy(idlePose[i].pos);
        p.quaternion.copy(idlePose[i].quat);
        p.scale.copy(idlePose[i].scale);
      });
      getUp = createGetUp();
      recoverT = 0;
      walker = { ...walker, frozen: true };
      body.setEnabled(false);
      character.root.visible = false;
      isActive = false;
    },
    respawn(p) {
      if (isActive) return;
      const x = Number.isFinite(p.x) ? p.x : spawn.x;
      const z = Number.isFinite(p.z) ? p.z : spawn.z;
      walker = createWalker(opts.route, { x, z }, startIndex);
      yaw = 0;
      targetYaw = 0;
      next.x = x;
      next.z = z;
      body.setTranslation(next, true);
      body.setEnabled(true);
      body.setNextKinematicTranslation(next);
      character.root.position.set(x, 0, z);
      character.root.rotation.y = 0;
      character.root.visible = true;
      character.setMotion('idle', 0);
      isActive = true;
    },
  };
}

function depthOf(o: Object3D): number {
  let d = 0;
  for (let cur = o.parent; cur; cur = cur.parent) d++;
  return d;
}

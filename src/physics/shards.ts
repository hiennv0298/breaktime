import type { Collider, RigidBody } from '@dimforge/rapier3d-compat';
import { Color, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { GameCtx } from '../game/game';
import { subscribeQuality } from '../game/qualityManager';
import type { DebrisBudget } from '../logic/debrisBudget';
import { TIERS } from '../logic/quality';
import { SHARD_ASPECT, SHARD_SHAPES, type ShardKit } from '../render/shardKit';

/**
 * Pooled shard bodies (D-13 auto-clean + hard cap, D-21 cap by tier; T-01-16-01).
 *
 * Every body and collider is created once, disabled, at game start (one per debris slot). A break only re-enables
 * pooled bodies, resizes their cuboid with Collider.setHalfExtents and sets their velocity, so it allocates nothing in
 * Rapier or three. The debris budget decides which slot a shard gets and recycles the oldest shard when the tier cap
 * is reached. A shard lives SHARD_LIFETIME_S, shrinks to nothing over SHARD_SHRINK_S, then its body is disabled, its
 * instance hidden and its slot released.
 */

export const SHARD_LIFETIME_S = 2.5;
export const SHARD_SHRINK_S = 0.3;

/** A shard's largest extent is this fraction of the broken object's largest extent (rng picks inside the range). */
const SIZE_MIN = 0.18;
const SIZE_MAX = 0.35;
/** Smallest shard edge in metres: thinner cuboids tunnel through the floor and read as noise. */
const MIN_EDGE = 0.03;
/** Scatter speed range (m/s) in a random direction, plus a constant upward pop. */
const SPREAD_MIN = 1.5;
const SPREAD_MAX = 3;
const POP_UP = 1.5;
const SPIN = 12; // rad/s, per axis, random sign
/** Parking spot for idle pooled bodies, far below the floor. */
const PARK_Y = -50;

export interface Shards {
  emit(
    at: { x: number; y: number; z: number },
    size: Vector3,
    color: Color,
    count: number,
    baseVel: { x: number; y: number; z: number },
    rng: () => number,
  ): void;
  fixedUpdate(dt: number): void;
  sync(): void;
  active(): number;
  cap(): number;
  clearAll(): void;
}

export function createShards(ctx: GameCtx, kit: ShardKit, budget: DebrisBudget, capacity = TIERS.high.debrisCap): Shards {
  const { R, world } = ctx.physics;
  const size = Math.max(0, Math.floor(capacity));
  const bodies: RigidBody[] = [];
  const colliders: Collider[] = [];
  const age = new Float32Array(size);
  const live = new Uint8Array(size);
  const dims: Vector3[] = [];
  const colors: Color[] = [];

  for (let i = 0; i < size; i++) {
    const body = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(i * 0.5, PARK_Y, 0)
        .setLinearDamping(0.3)
        .setAngularDamping(0.6)
        .setCcdEnabled(true) // small and fast: CCD keeps shards from tunnelling through the floor
        .setCanSleep(true)
        .setEnabled(false),
    );
    const collider = world.createCollider(
      R.ColliderDesc.cuboid(0.05, 0.05, 0.05).setDensity(1).setRestitution(0.2).setFriction(0.8),
      body,
    );
    bodies.push(body);
    colliders.push(collider);
    dims.push(new Vector3(0.1, 0.1, 0.1));
    colors.push(new Color(1, 1, 1));
  }

  const m = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const p = new Vector3();
  const s = new Vector3();
  const half = { x: 0, y: 0, z: 0 };
  const vec = { x: 0, y: 0, z: 0 };
  const rot = { x: 0, y: 0, z: 0, w: 1 };

  function retire(slot: number): void {
    if (!live[slot]) return;
    live[slot] = 0;
    const body = bodies[slot];
    body.setEnabled(false);
    vec.x = slot * 0.5;
    vec.y = PARK_Y;
    vec.z = 0;
    body.setTranslation(vec, false);
    kit.hide(slot);
  }

  // D-21: the debris cap follows the quality tier; slots above a lowered cap are retired right away.
  subscribeQuality((tier) => {
    for (const slot of budget.setCap(TIERS[tier].debrisCap)) retire(slot);
  });

  return {
    emit(at, objSize, color, count, baseVel, rng) {
      const got = budget.acquire(count);
      for (const slot of got.recycled) retire(slot);
      const largest = Math.max(objSize.x, objSize.y, objSize.z);
      for (const slot of got.slots) {
        if (slot >= size) continue;
        const shape = slot % SHARD_SHAPES;
        const aspect = SHARD_ASPECT[shape];
        const edge = largest * (SIZE_MIN + rng() * (SIZE_MAX - SIZE_MIN));
        const d = dims[slot].set(
          Math.max(MIN_EDGE, edge * aspect.x),
          Math.max(MIN_EDGE, edge * aspect.y),
          Math.max(MIN_EDGE, edge * aspect.z),
        );
        colors[slot].copy(color);

        const body = bodies[slot];
        body.setEnabled(true);
        half.x = d.x / 2;
        half.y = d.y / 2;
        half.z = d.z / 2;
        colliders[slot].setHalfExtents(half);

        vec.x = at.x + (rng() - 0.5) * objSize.x;
        vec.y = at.y + (rng() - 0.5) * objSize.y;
        vec.z = at.z + (rng() - 0.5) * objSize.z;
        body.setTranslation(vec, true);
        e.set(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2);
        q.setFromEuler(e);
        rot.x = q.x;
        rot.y = q.y;
        rot.z = q.z;
        rot.w = q.w;
        body.setRotation(rot, true);

        // Velocity, not an impulse: a re-enabled pooled body may report mass 0 until the next world step (plan 01-15).
        const theta = rng() * Math.PI * 2;
        const cosPhi = rng(); // upper hemisphere
        const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
        const speed = SPREAD_MIN + rng() * (SPREAD_MAX - SPREAD_MIN);
        vec.x = baseVel.x + Math.cos(theta) * sinPhi * speed;
        vec.y = baseVel.y + cosPhi * speed + POP_UP;
        vec.z = baseVel.z + Math.sin(theta) * sinPhi * speed;
        body.setLinvel(vec, true);
        vec.x = (rng() * 2 - 1) * SPIN;
        vec.y = (rng() * 2 - 1) * SPIN;
        vec.z = (rng() * 2 - 1) * SPIN;
        body.setAngvel(vec, true);

        age[slot] = 0;
        live[slot] = 1;
      }
    },
    fixedUpdate(dt) {
      const end = SHARD_LIFETIME_S + SHARD_SHRINK_S;
      for (let slot = 0; slot < size; slot++) {
        if (!live[slot]) continue;
        age[slot] += dt;
        if (age[slot] >= end) {
          retire(slot);
          budget.release(slot);
        }
      }
    },
    sync() {
      for (let slot = 0; slot < size; slot++) {
        if (!live[slot]) continue;
        const body = bodies[slot];
        const t = body.translation();
        const r = body.rotation();
        const a = age[slot];
        const k = a <= SHARD_LIFETIME_S ? 1 : Math.max(0, 1 - (a - SHARD_LIFETIME_S) / SHARD_SHRINK_S);
        p.set(t.x, t.y, t.z);
        q.set(r.x, r.y, r.z, r.w);
        s.copy(dims[slot]).multiplyScalar(k);
        m.compose(p, q, s);
        kit.setInstance(slot, slot % SHARD_SHAPES, m, colors[slot]);
      }
    },
    active: () => budget.active(),
    cap: () => budget.cap(),
    clearAll() {
      for (let slot = 0; slot < size; slot++) {
        if (!live[slot]) continue;
        retire(slot);
        budget.release(slot);
      }
    },
  };
}

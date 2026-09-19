import { registerDebug } from '../debug/testHook';
import type { InputState } from '../input/inputState';
import { cameraRelativeMove } from '../logic/moveMath';
import { CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS, createPlayerBody } from '../physics/characterController';
import {
  createPlayerStun,
  canBeHit as stunCanBeHit,
  inputLocked as getInputLocked,
  stepPlayerStun,
  hitPlayer as stunHitPlayer,
  type PlayerStunState,
} from '../logic/playerStun';
import { mulberry32, seedFor } from '../logic/rng';
import { SLAP_HORIZONTAL, SLAP_UP } from './slap';
import { getCameraYaw } from '../render/cameraView';
import { CHARACTER_PARTS, spawnCharacter, type CharacterAsset } from '../render/characters';
import { createKnockdownRig, findFreeSpot, type KnockdownRig } from './knockdown';
import type { GameCtx } from './game';

export interface Player {
  fixedUpdate(dt: number, input: InputState): void;
  frameUpdate(dt: number): void;
  pos(): { x: number; y: number; z: number };
  /** Facing yaw in radians; facing direction in world XZ is (-sin yaw, -cos yaw). */
  yaw(): number;
  /**
   * Play the arm swing now (D-30). With a finite point at least 1 mm away the player first turns toward it; without
   * one the facing is kept. A swing during a swing restarts the clip.
   */
  swing(towardX?: number, towardZ?: number): void;
  /** Turn toward a world point and play the slap swing (plan 01-15); same as swing(x, z). */
  slapAt(x: number, z: number): void;
  /** Put the capsule back at a floor point, facing the default direction (plan 01-18 soak reset). */
  teleport(x: number, z: number): void;
  /** Knock down the player (returns false if not hittable). */
  knockDown(fromX: number, fromZ: number): boolean;
  /** Whether the player can be hit right now. */
  canBeHit(): boolean;
  /** Whether input is currently locked (ragdoll or early recover). */
  inputLocked(): boolean;
  /** Get current stun state for debugging / UI. */
  stun(): PlayerStunState;
  /** Get the foot position (below torso when ragdolled). */
  foot(): { x: number; y: number; z: number };
  /** Reset knockdown state (after soak). */
  resetKnockdown(): void;
}

const SPEED = 3.2; // m/s
/** Above this measured horizontal speed the walk clip plays, below it idle. */
const WALK_THRESHOLD = 0.2; // m/s
/** Exponential turn damping (1/s): the model reaches ~95 % of a turn in 0.25 s. */
export const TURN_RATE = 12;
/** The Blocky model faces local +Z; the player facing vector is (-sin yaw, -cos yaw), i.e. local -Z. */
const MODEL_YAW_OFFSET = Math.PI;
/** Player keeps texture 'a'; NPCs start at 'b'. */
export const PLAYER_TEXTURE = 'a';
/** How long the slap swing ('attack-melee-right') overrides idle / walk. */
const SLAP_SWING_SEC = 0.45;
const BENCH_SEED = 20260914;

/** Shortest signed angle from `from` to `to`, in (-PI, PI]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export function createPlayer(ctx: GameCtx, spawn: { x: number; z: number }, asset: CharacterAsset): Player {
  const body = createPlayerBody(ctx.physics, spawn);

  const character = spawnCharacter(asset, PLAYER_TEXTURE);
  ctx.scene.add(character.root);

  // Knockdown support
  const rig = createKnockdownRig(ctx, character);
  let stun = createPlayerStun();
  const knockRng = mulberry32(seedFor(BENCH_SEED, 'player-knock'));

  let facing = 0;
  let modelYaw = facing + MODEL_YAW_OFFSET;
  let speed = 0;
  const p0 = body.position();
  let lastX = p0.x;
  let lastZ = p0.z;
  let swingLeft = 0;
  const footY = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS;
  character.root.position.set(p0.x, p0.y - footY, p0.z);
  character.root.rotation.y = modelYaw;

  let recoverFacing = 0; // Facing yaw during recovery
  let recoverSpot: 'none' | 'free' | 'searched' | 'spawn' = 'none';
  let moveIgnored = 0;
  let lockStartMs = 0;

  registerDebug('player', () => {
    const p = body.position();
    return {
      pos: [p.x, p.y, p.z],
      yaw: facing,
      // `motion` is a Phase 1 contract (swing.spec reads it); 02-11 dropped it when it added `stun`,
      // which silently broke five swing tests. Keep both.
      motion: character.motion(),
      stun: { ...stun, moveIgnored, recoverSpot, lastLockMs: lockStartMs },
      // Which bone each body part is currently parented to. Ragdoll knockdown re-parents parts to a
      // flat physics group and back; this is the cheapest way for a test (or a human) to catch a part
      // left behind unattached (e.g. legs orphaned by knockdown.ts's stale 'reattachOrder' walk).
      parts: CHARACTER_PARTS.map((name, i) => ({ name, parent: character.parts[i]?.parent?.name ?? null })),
    };
  });

  function swing(towardX?: number, towardZ?: number): void {
    if (towardX !== undefined && towardZ !== undefined) {
      const p = body.position();
      const dx = towardX - p.x;
      const dz = towardZ - p.z;
      if (Number.isFinite(dx) && Number.isFinite(dz) && Math.hypot(dx, dz) > 1e-3) facing = Math.atan2(-dx, -dz);
    }
    swingLeft = SLAP_SWING_SEC;
    // Start the clip this frame, from time 0 even when a swing is already playing (D-30 instant feedback).
    character.setMotion('attack-melee-right', 0.05, { restart: true });
  }

  /** Put the player back on their feet at a free spot and hand control back to the capsule. */
  function standUp(): void {
    const spot = findFreeSpot(ctx, rig.torsoPos().x, rig.torsoPos().z, body.body);
    body.body.setTranslation({ x: spot.x, y: body.position().y, z: spot.z }, true);
    body.body.setNextKinematicTranslation({ x: spot.x, y: body.position().y, z: spot.z });
    rig.finish();
    body.body.setEnabled(true);
    facing = recoverFacing;
    recoverSpot = spot.kind;
    lastX = spot.x;
    lastZ = spot.z;
  }

  return {
    fixedUpdate(dt, input) {
      // Handle knockdown state machine
      if (stun.mode === 'ragdoll') {
        rig.sync();
        const step = rig.step();
        const r = stepPlayerStun(stun, { torsoSpeed: step.torsoSpeed, torsoAngSpeed: step.torsoAngSpeed, dt });
        stun = r.state;

        if (r.event === 'start-recover') {
          const recover = rig.beginRecover();
          recoverFacing = recover.yaw;
          lockStartMs = performance.now();
        } else if (r.event === 'stood-up') {
          standUp();
        }

        // Drop all input while ragdolled.
        if (Math.hypot(input.moveX, input.moveY) > 1e-3) moveIgnored++;
        return;
      }

      if (stun.mode === 'recover') {
        rig.sync();
        const r = stepPlayerStun(stun, { torsoSpeed: 0, torsoAngSpeed: 0, dt });
        stun = r.state;
        rig.blend(r.recoverT);
        // 'stood-up' is emitted from the FSM's RECOVER branch (playerStun.ts), never from the ragdoll
        // branch. Handling it only above meant the capsule was never re-enabled or repositioned, so
        // one knockdown left the player frozen for the rest of the session: back in 'free' with every
        // key dead and recoverSpot still 'none'.
        if (r.event === 'stood-up') standUp();
        if (Math.hypot(input.moveX, input.moveY) > 1e-3) moveIgnored++;
        return;
      }

      if (stun.mode === 'invulnerable') {
        const r = stepPlayerStun(stun, { torsoSpeed: 0, torsoAngSpeed: 0, dt });
        stun = r.state;
        // Invulnerability is 1.5 s of PROTECTION, not more input lock: the D-06 contract caps the
        // lock at ~3 s across ragdoll + recover. Returning early here kept the player frozen for
        // another 1.5 s (about 4.5 s total) with no way to run from the coworker still standing over
        // them. Fall through to normal movement.
      }

      // Free mode: normal movement
      const t = body.body.translation();
      if (dt > 0) speed = Math.hypot(t.x - lastX, t.z - lastZ) / dt;
      lastX = t.x;
      lastZ = t.z;

      const dir = cameraRelativeMove(input.moveX, input.moveY, getCameraYaw());
      body.move({ x: dir.x * SPEED * dt, z: dir.z * SPEED * dt }, dt);
      if (Math.hypot(dir.x, dir.z) > 1e-3) facing = Math.atan2(-dir.x, -dir.z);
    },

    frameUpdate(dt) {
      if (stun.mode === 'ragdoll') {
        const torsoPos = rig.torsoPos();
        character.root.position.set(torsoPos.x, torsoPos.y - footY, torsoPos.z);
        character.root.rotation.y = modelYaw; // Keep original rotation
        character.mixer.update(0); // Pause animation
        return;
      }

      if (stun.mode === 'recover') {
        const recoverT = (performance.now() - lockStartMs) / 450; // ~0.45 s recover time
        rig.blend(recoverT);
        const tp = rig.torsoPos();
        character.root.position.set(tp.x, body.position().y - footY, tp.z);
        character.root.rotation.y = recoverFacing + MODEL_YAW_OFFSET;
        character.mixer.update(0); // Pause animation
        return;
      }

      if (stun.mode === 'invulnerable') {
        const p = body.position();
        character.root.position.set(p.x, p.y - footY, p.z);
        const target = facing + MODEL_YAW_OFFSET;
        const k = dt > 0 ? 1 - Math.exp(-TURN_RATE * dt) : 0;
        modelYaw += angleDelta(modelYaw, target) * k;
        character.root.rotation.y = modelYaw;
        character.setMotion(speed > WALK_THRESHOLD ? 'walk' : 'idle');
        if (dt > 0) character.mixer.update(dt);
        return;
      }

      // Free mode: normal animation
      const p = body.position();
      character.root.position.set(p.x, p.y - footY, p.z);
      const target = facing + MODEL_YAW_OFFSET;
      const k = dt > 0 ? 1 - Math.exp(-TURN_RATE * dt) : 0;
      modelYaw += angleDelta(modelYaw, target) * k;
      character.root.rotation.y = modelYaw;
      if (swingLeft > 0) {
        character.setMotion('attack-melee-right', 0.05);
        swingLeft -= dt;
      } else {
        character.setMotion(speed > WALK_THRESHOLD ? 'walk' : 'idle');
      }
      if (dt > 0) character.mixer.update(dt);
    },

    pos() {
      if (stun.mode === 'ragdoll' || stun.mode === 'recover') {
        const tp = rig.torsoPos();
        return { x: tp.x, y: tp.y, z: tp.z };
      }
      return body.position();
    },

    yaw() {
      return facing;
    },

    swing,

    slapAt(x, z) {
      swing(x, z);
    },

    teleport(x, z) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      const y = body.position().y;
      const at = { x, y: Math.max(y, footY), z };
      body.body.setTranslation(at, true);
      body.body.setNextKinematicTranslation(at);
      lastX = x;
      lastZ = z;
      speed = 0;
      facing = 0;
      swingLeft = 0;
    },

    knockDown(fromX, fromZ) {
      if (!stunCanBeHit(stun)) return false;

      const p = this.pos();
      const dx = p.x - fromX;
      const dz = p.z - fromZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const dir = dist > 1e-6 ? { x: dx / dist, z: dz / dist } : { x: 0, z: 1 }; // fallback to forward

      const m = rig.mass();
      const impulse = {
        x: m * 0.5 * SLAP_HORIZONTAL * dir.x,
        y: m * 0.5 * SLAP_UP,
        z: m * 0.5 * SLAP_HORIZONTAL * dir.z,
      };
      const torque = {
        x: m * ((knockRng() * 2 - 1) * 3),
        y: m * ((knockRng() * 2 - 1) * 2 + 1.5),
        z: m * ((knockRng() * 2 - 1) * 3),
      };

      body.body.setEnabled(false);
      rig.activate(impulse, torque);
      swingLeft = 0; // Stop any ongoing swing

      // Record hit in stun state
      const hitResult = stunHitPlayer(stun);
      stun = hitResult.state;

      return true;
    },

    canBeHit() {
      return stunCanBeHit(stun);
    },

    inputLocked() {
      return getInputLocked(stun);
    },

    stun() {
      return { ...stun, moveIgnored, recoverSpot, lastLockMs: lockStartMs };
    },

    foot() {
      if (stun.mode === 'ragdoll' || stun.mode === 'recover') {
        const tp = rig.torsoPos();
        return { x: tp.x, y: Math.max(0, tp.y - 0.3), z: tp.z };
      }
      const p = body.position();
      return { x: p.x, y: p.y - footY, z: p.z };
    },

    resetKnockdown() {
      if (rig.active()) rig.reset();
      body.body.setEnabled(true);
      facing = 0;
      swingLeft = 0;
      stun = createPlayerStun();
      moveIgnored = 0;
      recoverSpot = 'none';
    },
  };
}

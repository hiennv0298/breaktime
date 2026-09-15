import { registerDebug } from '../debug/testHook';
import type { InputState } from '../input/inputState';
import { cameraRelativeMove } from '../logic/moveMath';
import { CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS, createPlayerBody } from '../physics/characterController';
import { getCameraYaw } from '../render/cameraView';
import { spawnCharacter, type CharacterAsset } from '../render/characters';
import type { GameCtx } from './game';

export interface Player {
  fixedUpdate(dt: number, input: InputState): void;
  frameUpdate(dt: number): void;
  pos(): { x: number; y: number; z: number };
  /** Facing yaw in radians; facing direction in world XZ is (-sin yaw, -cos yaw). */
  yaw(): number;
  /** Turn toward a world point and play the slap swing (plan 01-15). */
  slapAt(x: number, z: number): void;
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

  registerDebug('player', () => {
    const p = body.position();
    return { pos: [p.x, p.y, p.z], yaw: facing };
  });

  return {
    fixedUpdate(dt, input) {
      // Displacement since the previous fixed step = what the character controller really allowed (walls stop it).
      const t = body.body.translation();
      if (dt > 0) speed = Math.hypot(t.x - lastX, t.z - lastZ) / dt;
      lastX = t.x;
      lastZ = t.z;

      const dir = cameraRelativeMove(input.moveX, input.moveY, getCameraYaw());
      body.move({ x: dir.x * SPEED * dt, z: dir.z * SPEED * dt }, dt);
      if (Math.hypot(dir.x, dir.z) > 1e-3) facing = Math.atan2(-dir.x, -dir.z);
    },
    frameUpdate(dt) {
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
      return body.position();
    },
    yaw() {
      return facing;
    },
    slapAt(x, z) {
      const p = body.position();
      const dx = x - p.x;
      const dz = z - p.z;
      if (Number.isFinite(dx) && Number.isFinite(dz) && Math.hypot(dx, dz) > 1e-3) facing = Math.atan2(-dx, -dz);
      swingLeft = SLAP_SWING_SEC;
    },
  };
}

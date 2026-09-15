import type { RigidBody } from '@dimforge/rapier3d-compat';
import { createWalker, stepWalker, type WalkerState, type WaypointPoint } from '../logic/waypointWalker';
import { spawnCharacter, type CharacterAsset, type CharacterInstance } from '../render/characters';
import type { GameCtx } from './game';
import { angleDelta, TURN_RATE } from './player';
import { NPC_RADIUS } from './waypoints';

/** Same capsule as the player: half height 0.45 m, radius 0.3 m, so the centre stands 0.75 m above the floor. */
export const NPC_HALF_HEIGHT = 0.45;
const CENTRE_Y = NPC_HALF_HEIGHT + NPC_RADIUS;

export interface Npc {
  id: string;
  character: CharacterInstance;
  body: RigidBody;
  /** Current walker state (replaced every fixed step). */
  readonly walker: WalkerState;
  fixedUpdate(dt: number): void;
  frameUpdate(dt: number): void;
  pos(): { x: number; y: number; z: number };
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
}

/**
 * Coworker NPC (D-11): a kinematic capsule driven along a hand-placed route by the pure waypoint walker, with an
 * animated Blocky character on top. Kinematic bodies push dynamic props aside; statics and other NPCs do not stop
 * them (no path finding in Phase 1, the routes are laid out to clear the furniture).
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

  let walker = createWalker(opts.route, spawn, startIndex);
  let targetYaw = 0;
  let yaw = 0;
  const next = { x: spawn.x, y: CENTRE_Y, z: spawn.z };

  return {
    id: opts.id,
    character,
    body,
    get walker() {
      return walker;
    },
    fixedUpdate(dt) {
      const r = stepWalker(walker, opts.route, dt);
      walker = r.state;
      if (r.vx !== 0 || r.vz !== 0) targetYaw = r.facingYaw;
      next.x = walker.x;
      next.z = walker.z;
      body.setNextKinematicTranslation(next);
    },
    frameUpdate(dt) {
      const t = body.translation();
      character.root.position.set(t.x, t.y - CENTRE_Y, t.z);
      const k = dt > 0 ? 1 - Math.exp(-TURN_RATE * dt) : 0;
      yaw += angleDelta(yaw, targetYaw) * k;
      character.root.rotation.y = yaw; // the Blocky model faces +Z, the walker's facingYaw convention
      character.setMotion(walker.mode === 'walk' && !walker.frozen ? 'walk' : 'idle');
      if (dt > 0) character.mixer.update(dt);
    },
    pos() {
      const t = body.translation();
      return { x: t.x, y: t.y, z: t.z };
    },
  };
}

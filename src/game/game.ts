import { Vector3, type Object3D } from 'three';
import { registerDebug } from '../debug/testHook';
import { consumeInteract, createInputState, type InputState } from '../input/inputState';
import { attachJoystick } from '../input/joystick';
import { attachKeyboard } from '../input/keyboard';
import { attachPointerPick } from '../input/pointerPick';
import { attachTouchButtons, setContextIcon } from '../input/touchButtons';
import { createDebrisBudget, DEFAULT_DEBRIS_CAPACITY } from '../logic/debrisBudget';
import { createHitStop, type HitStop } from '../logic/hitStop';
import { iconFor, pickNearest, type Candidate } from '../logic/nearest';
import { parseNpcAt } from '../logic/npcAt';
import { TIERS } from '../logic/quality';
import { BENCH_SEED, mulberry32 } from '../logic/rng';
import { CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS } from '../physics/characterController';
import { createProps, projectToScreen, type PropRecord } from '../physics/props';
import { ragdollStats } from '../physics/ragdoll';
import type { Physics } from '../physics/rapier';
import { createShards } from '../physics/shards';
import { createBlobShadows } from '../render/blobShadows';
import { createCameraView, getCameraYaw } from '../render/cameraView';
import { setHighlighted } from '../render/highlight';
import { parseOfficeAssets } from '../render/officeAssets';
import type { RenderCtx } from '../render/renderer';
import { parseCharacterAsset } from '../render/characters';
import { buildRoom } from '../render/room';
import { createShardKit } from '../render/shardKit';
import { createBreakables } from './breakables';
import { PLAYER_SPAWN, PROP_PLACEMENTS, ROOM, TEST_BOX_ID } from './layout';
import { getPauseState } from './loop';
import { createNpc, type Npc } from './npc';
import { createPlayer, PLAYER_TEXTURE, type Player } from './player';
import { performSlap, slapCount } from './slap';
import { NPC_ROUTES, routeIndexForNpc, sharedIndexForNpc } from './waypoints';

export interface GameCtx extends RenderCtx {
  physics: Physics;
  loaded: Map<string, unknown>;
}

export interface Game {
  /** Shared input written by keyboard and touch controls; the loop consumes pause toggles from it. */
  readonly input: InputState;
  fixedUpdate(dt: number): void;
  frameUpdate(dt: number, nowMs: number): void;
  /** 0 during a hit-stop (plan 01-15), otherwise 1; the loop also forces 0 while paused. */
  timeScale(nowMs: number): number;
  readonly hitStop: HitStop;
  readonly player: Player;
}

/** Coworkers in normal play (D-11). */
export const DEFAULT_NPCS = 3;
/**
 * Player-selectable and benchmark ceiling (D-29, D-11 revised): ?npcs is clamped to it so a URL cannot spawn unbounded
 * bodies (T-01-14-01, T-01-23-01).
 */
export const MAX_NPCS = 10;
/** Slap target footprint: an NPC is reachable within 1.6 m of its 0.4 m radius (plan 01-15). */
const NPC_TARGET_RADIUS = 0.4;
/** Spawn offset per extra NPC sharing a route, so capsules never start inside each other. */
const SHARED_ROUTE_OFFSET = 0.3;
/** ?scenario=smash fires on this fixed step, once everything has settled on its surface (plan 01-16). */
export const SMASH_STEP = 30;

/** T-01-16-03: only the literal value 'smash' is recognised. */
export function scenarioFromQuery(search: string): 'smash' | null {
  return new URLSearchParams(search).get('scenario') === 'smash' ? 'smash' : null;
}

/** ?npcs=N as an integer clamped to [0, MAX_NPCS] = [0, 10]; missing or unparsable gives the default 3. */
export function npcCountFromQuery(search: string): number {
  const raw = new URLSearchParams(search).get('npcs');
  if (raw === null) return DEFAULT_NPCS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_NPCS;
  return Math.max(0, Math.min(MAX_NPCS, n));
}

function loadedBuffer(ctx: GameCtx, id: string): ArrayBuffer {
  const v = ctx.loaded.get(id);
  if (!(v instanceof ArrayBuffer)) throw new Error(`load task ${id} did not produce an ArrayBuffer`);
  return v;
}

/**
 * Office slice (plan 01-10): Kenney open-space office + pantry, physics props, blob shadows, follow camera.
 * Characters (plan 01-14): the player and 3 coworkers (?npcs=0..10, D-29) are Blocky characters from one shared GLB.
 * The nearest prop or coworker in front of the player glows; E, the context button or a left-click on it pushes the
 * prop (D-18, D-20) or slaps the coworker into a ragdoll (plan 01-15, D-12).
 */
export async function createGame(ctx: GameCtx): Promise<Game> {
  const [assets, characterAsset] = await Promise.all([
    parseOfficeAssets(loadedBuffer(ctx, 'office'), loadedBuffer(ctx, 'food')),
    parseCharacterAsset(loadedBuffer(ctx, 'character')),
  ]);

  const room = buildRoom(ctx, assets);
  const props = createProps(ctx, PROP_PLACEMENTS, assets, { surfaceTop: (id) => room.surfaceTop(id) });
  const canvas = ctx.renderer.domElement;
  const viewport = () => ({ width: canvas.clientWidth, height: canvas.clientHeight });
  props.setCamera(ctx.camera, viewport);

  const input = createInputState();
  attachKeyboard(input);
  // Touch controls share the same InputState (D-17, D-18); they live for the page lifetime like the keyboard.
  const uiRoot = document.getElementById('app') ?? document.body;
  attachJoystick(uiRoot, input);
  attachTouchButtons(uiRoot, input);

  const player = createPlayer(ctx, PLAYER_SPAWN, characterAsset);
  const cameraView = createCameraView(ctx.camera);

  // Coworkers on hand-placed routes (D-11). Texture letters follow the player's: b, c, d, …
  const npcs: Npc[] = [];
  const npcCount = npcCountFromQuery(location.search);
  // ?npcAt=x,z pins NPC 0, frozen until slapped, for the slap e2e and the benchmark (T-01-15-01: parsed and clamped).
  const npcAt = parseNpcAt(location.search, { halfX: ROOM.width / 2, halfZ: ROOM.depth / 2, margin: 0.5 });
  const firstNpcLetter = PLAYER_TEXTURE.charCodeAt(0) + 1;
  for (let i = 0; i < npcCount; i++) {
    // NPCs 1-8 keep their 01-14 routes and offsets; 9 and 10 walk the hand-placed routes 3 and 4 (D-29, plan 01-23).
    const route = NPC_ROUTES[routeIndexForNpc(i)];
    const startIndex = i % route.length;
    const shared = sharedIndexForNpc(i);
    const start = route[startIndex];
    const pinned = i === 0 && npcAt !== null;
    npcs.push(
      createNpc(ctx, {
        id: 'npc-' + i,
        asset: characterAsset,
        texture: String.fromCharCode(firstNpcLetter + i),
        route,
        startIndex,
        spawn: pinned && npcAt ? npcAt : { x: start.x + shared * SHARED_ROUTE_OFFSET, z: start.z },
        frozen: pinned,
        groupIndex: i,
      }),
    );
  }
  const npcTexture = new Map(npcs.map((n, i) => [n, String.fromCharCode(firstNpcLetter + i)]));

  // D-14: one InstancedMesh of blobs for the player and every dynamic prop.
  const shadows = createBlobShadows(ctx.scene);
  const playerFoot = { x: 0, y: 0, z: 0 };
  shadows.addCaster(() => {
    const p = player.pos();
    playerFoot.x = p.x;
    playerFoot.y = p.y - CAPSULE_HALF_HEIGHT - CAPSULE_RADIUS;
    playerFoot.z = p.z;
    return playerFoot;
  }, CAPSULE_RADIUS * 1.5);
  const shadowOf = new Map<PropRecord, number>();
  const addPropShadow = (rec: PropRecord) => shadowOf.set(rec, shadows.addCaster(() => rec.object.position, rec.radius * 1.2));
  for (const rec of props.list()) addPropShadow(rec);
  for (const npc of npcs) {
    // Follows the capsule while walking and the torso while the NPC is a ragdoll.
    shadows.addCaster(() => npc.foot(), CAPSULE_RADIUS * 1.5);
  }

  // D-13 debris: shared shard kit (5 InstancedMesh), pooled shard bodies, cap from the quality tier (D-21).
  const shardKit = createShardKit(ctx.scene, DEFAULT_DEBRIS_CAPACITY);
  const debrisBudget = createDebrisBudget(TIERS.high.debrisCap, DEFAULT_DEBRIS_CAPACITY);
  const shards = createShards(ctx, shardKit, debrisBudget, DEFAULT_DEBRIS_CAPACITY);
  const breakables = createBreakables(ctx, props, shards, {
    onBreak(rec) {
      const h = shadowOf.get(rec);
      if (h !== undefined && h >= 0) shadows.remove(h);
      shadowOf.delete(rec);
    },
    onReset() {
      for (const rec of props.list()) if (!shadowOf.has(rec)) addPropShadow(rec);
    },
  });
  const scenario = scenarioFromQuery(location.search);
  let fixedSteps = 0;
  let contactNowMs = 0;
  // Hoisted so draining events allocates no closure per step. Both colliders are mapped: a flying ragdoll part or a
  // chair hitting a mug reports the event on the mug's collider (D-12 + D-13).
  const onContactForceEvent = (e: { collider1(): number; collider2(): number; totalForceMagnitude(): number }) => {
    const force = e.totalForceMagnitude();
    const a = props.byColliderHandle(e.collider1());
    const b = props.byColliderHandle(e.collider2());
    if (a) breakables.onContactForce(a.id, force, contactNowMs);
    if (b) breakables.onContactForce(b.id, force, contactNowMs);
  };

  const testBox = props.get(TEST_BOX_ID);
  if (!testBox) throw new Error('layout has no test box ' + TEST_BOX_ID);

  // Targeting: one reusable candidate per prop and per NPC, refreshed in place each fixed step (no per-step allocation).
  type TargetEntry = { object: Object3D; prop?: PropRecord; npc?: Npc };
  const allCandidates: Candidate[] = [];
  const candidates: Candidate[] = [];
  const entryOf = new Map<Candidate, TargetEntry>();
  for (const rec of props.list()) {
    const c: Candidate = { id: rec.id, x: 0, z: 0, radius: rec.radius, kind: rec.kind };
    allCandidates.push(c);
    entryOf.set(c, { object: rec.object, prop: rec });
  }
  for (const npc of npcs) {
    const c: Candidate = { id: npc.id, x: 0, z: 0, radius: NPC_TARGET_RADIUS, kind: 'npc' };
    allCandidates.push(c);
    entryOf.set(c, { object: npc.character.root, npc });
  }
  const hitStop = createHitStop();
  const centreWorld = new Vector3();
  const npcScreen = new Vector3();
  const playerQuery = { x: 0, z: 0, yawRad: 0 };
  let target: Candidate | null = null;
  let pickQueued: string | null = null;
  let interactCount = 0;

  setContextIcon(iconFor(null));

  attachPointerPick(
    canvas,
    ctx.camera,
    () => (target ? { id: target.id, object: entryOf.get(target)!.object } : null),
    (id) => {
      pickQueued = id;
    },
    () => getPauseState().isPaused(),
  );

  function refreshTarget(): void {
    candidates.length = 0;
    for (const c of allCandidates) {
      const entry = entryOf.get(c)!;
      if (entry.prop) {
        const rec = entry.prop;
        if (rec.broken) continue; // a shattered object cannot be targeted
        // Collider centre in world space (the object origin is the bottom of the model).
        centreWorld.copy(rec.centre).applyQuaternion(rec.object.quaternion).add(rec.object.position);
        c.x = centreWorld.x;
        c.z = centreWorld.z;
      } else if (entry.npc) {
        // Only an animated NPC is a slap target: a ragdoll or an NPC getting up cannot be slapped again (T-01-15-03).
        if (!entry.npc.slappable()) continue;
        const t = entry.npc.body.translation();
        c.x = t.x;
        c.z = t.z;
      }
      candidates.push(c);
    }
    const p = player.pos();
    playerQuery.x = p.x;
    playerQuery.z = p.z;
    playerQuery.yawRad = player.yaw();
    const next = pickNearest(playerQuery, candidates);
    if (next !== target) {
      target = next;
      setHighlighted(next ? entryOf.get(next)!.object : null);
      setContextIcon(iconFor(next ? next.kind : null));
    }
  }

  function interactTarget(): void {
    if (!target) return;
    const entry = entryOf.get(target)!;
    if (entry.npc) {
      performSlap(game, entry.npc, performance.now());
      // Drop the glow right away: the hit-stop runs no fixed step for 60 ms.
      refreshTarget();
      return;
    }
    const p = player.pos();
    let dx = target.x - p.x;
    let dz = target.z - p.z;
    if (Math.hypot(dx, dz) < 1e-3) {
      const yaw = player.yaw();
      dx = -Math.sin(yaw);
      dz = -Math.cos(yaw);
    }
    props.push(target.id, dx, dz);
    interactCount++;
  }

  registerDebug('box', () => {
    const p = testBox.body.translation();
    return { pos: [p.x, p.y, p.z] };
  });
  registerDebug('interactCount', () => interactCount);
  registerDebug('npcs', () =>
    npcs.map((n) => {
      const p = n.pos();
      return { id: n.id, pos: [p.x, p.y, p.z], mode: n.mode, texture: npcTexture.get(n) };
    }),
  );
  registerDebug('highlight', () => {
    const size = viewport();
    const entry = target ? entryOf.get(target) : undefined;
    // Projected lazily when read, so the frame loop never pays for the test hook.
    let screen: { x: number; y: number } | null = null;
    if (entry?.prop) {
      screen = projectToScreen(entry.prop, ctx.camera, size.width, size.height);
    } else if (entry?.npc) {
      const t = entry.npc.body.translation(); // capsule centre = torso height
      npcScreen.set(t.x, t.y, t.z).project(ctx.camera);
      screen = { x: ((npcScreen.x + 1) / 2) * size.width, y: ((1 - npcScreen.y) / 2) * size.height };
    }
    return {
      id: target ? target.id : null,
      kind: target ? target.kind : null,
      icon: iconFor(target ? target.kind : null),
      screen,
    };
  });
  registerDebug('slap', () => ({ count: slapCount() }));
  registerDebug('hitStop', () => ({ count: hitStop.count(), active: hitStop.active(performance.now()) }));
  registerDebug('ragdolls', () => ragdollStats());

  const game: Game = {
    input,
    hitStop,
    player,
    fixedUpdate(dt) {
      // Contact force events of the previous world step (the queue auto-clears when the next step starts).
      contactNowMs = performance.now();
      ctx.physics.eventQueue.drainContactForceEvents(onContactForceEvent);
      fixedSteps++;
      if (scenario === 'smash' && fixedSteps === SMASH_STEP) breakables.smashAll(mulberry32(BENCH_SEED));

      player.fixedUpdate(dt, input);
      for (const npc of npcs) npc.fixedUpdate(dt);
      refreshTarget();

      const pressed = consumeInteract(input);
      const picked = pickQueued;
      pickQueued = null;
      // A click only counts if it hit the object that is still the target (a stale click never acts).
      if (pressed || (picked !== null && target !== null && picked === target.id)) interactTarget();

      props.fixedUpdate();
      shards.fixedUpdate(dt);
    },
    frameUpdate(dt, nowMs) {
      // Animations stand still while paused (the loop still renders paused frames) and during a hit-stop freeze.
      const paused = getPauseState().isPaused();
      const animDt = paused || hitStop.active(nowMs) ? 0 : dt;
      player.frameUpdate(animDt);
      for (const npc of npcs) npc.frameUpdate(animDt);
      props.sync();
      shards.sync();
      shardKit.commit();
      // The shake keeps running through the hit-stop (that is the point) but waits while paused.
      cameraView.update(dt, player.pos(), paused ? 0 : dt);
      room.update(getCameraYaw());
      shadows.update();
    },
    timeScale(nowMs) {
      return hitStop.active(nowMs) ? 0 : 1;
    },
  };
  return game;
}

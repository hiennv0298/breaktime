import { Vector3 } from 'three';
import { registerDebug } from '../debug/testHook';
import { consumeInteract, createInputState, type InputState } from '../input/inputState';
import { attachJoystick } from '../input/joystick';
import { attachKeyboard } from '../input/keyboard';
import { attachPointerPick } from '../input/pointerPick';
import { attachTouchButtons, setContextIcon } from '../input/touchButtons';
import { iconFor, pickNearest, type Candidate } from '../logic/nearest';
import { CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS } from '../physics/characterController';
import { createProps, projectToScreen, type PropRecord } from '../physics/props';
import type { Physics } from '../physics/rapier';
import { createBlobShadows } from '../render/blobShadows';
import { createCameraView, getCameraYaw } from '../render/cameraView';
import { setHighlighted } from '../render/highlight';
import { parseOfficeAssets } from '../render/officeAssets';
import type { RenderCtx } from '../render/renderer';
import { parseCharacterAsset } from '../render/characters';
import { buildRoom } from '../render/room';
import { PLAYER_SPAWN, PROP_PLACEMENTS, TEST_BOX_ID } from './layout';
import { getPauseState } from './loop';
import { createNpc, type Npc } from './npc';
import { createPlayer, PLAYER_TEXTURE } from './player';
import { NPC_ROUTES } from './waypoints';

export interface GameCtx extends RenderCtx {
  physics: Physics;
  loaded: Map<string, unknown>;
}

export interface Game {
  /** Shared input written by keyboard and touch controls; the loop consumes pause toggles from it. */
  readonly input: InputState;
  fixedUpdate(dt: number): void;
  frameUpdate(dt: number, nowMs: number): void;
  timeScale(nowMs: number): number;
}

/** Coworkers in normal play (D-11). */
export const DEFAULT_NPCS = 3;
/** Benchmark ceiling (D-11, Tier 1): ?npcs is clamped to it so a URL cannot spawn unbounded bodies (T-01-14-01). */
export const MAX_NPCS = 8;
/** Spawn offset per extra NPC sharing a route, so capsules never start inside each other. */
const SHARED_ROUTE_OFFSET = 0.3;

/** ?npcs=N as an integer clamped to [0, 8]; missing or unparsable gives the default 3. */
export function npcCountFromQuery(search: string): number {
  const raw = new URLSearchParams(search).get('npcs');
  if (raw === null) return DEFAULT_NPCS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_NPCS;
  return Math.max(0, Math.min(8, n));
}

function loadedBuffer(ctx: GameCtx, id: string): ArrayBuffer {
  const v = ctx.loaded.get(id);
  if (!(v instanceof ArrayBuffer)) throw new Error(`load task ${id} did not produce an ArrayBuffer`);
  return v;
}

/**
 * Office slice (plan 01-10): Kenney open-space office + pantry, physics props, blob shadows, follow camera.
 * Characters (plan 01-14): the player and 3 coworkers (?npcs=0..8) are Blocky characters from one shared GLB.
 * The nearest prop in front of the player glows; E, the context button or a left-click on it pushes it (D-18, D-20).
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
  const firstNpcLetter = PLAYER_TEXTURE.charCodeAt(0) + 1;
  for (let i = 0; i < npcCount; i++) {
    const route = NPC_ROUTES[i % NPC_ROUTES.length];
    const startIndex = i % route.length;
    const shared = Math.floor(i / NPC_ROUTES.length);
    const start = route[startIndex];
    npcs.push(
      createNpc(ctx, {
        id: 'npc-' + i,
        asset: characterAsset,
        texture: String.fromCharCode(firstNpcLetter + i),
        route,
        startIndex,
        spawn: { x: start.x + shared * SHARED_ROUTE_OFFSET, z: start.z },
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
  for (const rec of props.list()) {
    shadows.addCaster(() => rec.object.position, rec.radius * 1.2);
  }
  for (const npc of npcs) {
    const foot = { x: 0, y: 0, z: 0 };
    shadows.addCaster(() => {
      const t = npc.body.translation();
      foot.x = t.x;
      foot.y = t.y - CAPSULE_HALF_HEIGHT - CAPSULE_RADIUS;
      foot.z = t.z;
      return foot;
    }, CAPSULE_RADIUS * 1.5);
  }

  const testBox = props.get(TEST_BOX_ID);
  if (!testBox) throw new Error('layout has no test box ' + TEST_BOX_ID);

  // Targeting: one reusable candidate per prop, refreshed in place each fixed step (no per-step allocation).
  const candidates: Candidate[] = [];
  const recordOf = new Map<Candidate, PropRecord>();
  for (const rec of props.list()) {
    const c: Candidate = { id: rec.id, x: 0, z: 0, radius: rec.radius, kind: rec.kind };
    candidates.push(c);
    recordOf.set(c, rec);
  }
  const centreWorld = new Vector3();
  const playerQuery = { x: 0, z: 0, yawRad: 0 };
  let target: Candidate | null = null;
  let pickQueued: string | null = null;
  let interactCount = 0;

  setContextIcon(iconFor(null));

  attachPointerPick(
    canvas,
    ctx.camera,
    () => (target ? { id: target.id, object: recordOf.get(target)!.object } : null),
    (id) => {
      pickQueued = id;
    },
    () => getPauseState().isPaused(),
  );

  function refreshTarget(): void {
    for (const c of candidates) {
      const rec = recordOf.get(c)!;
      // Collider centre in world space (the object origin is the bottom of the model).
      centreWorld.copy(rec.centre).applyQuaternion(rec.object.quaternion).add(rec.object.position);
      c.x = centreWorld.x;
      c.z = centreWorld.z;
    }
    const p = player.pos();
    playerQuery.x = p.x;
    playerQuery.z = p.z;
    playerQuery.yawRad = player.yaw();
    const next = pickNearest(playerQuery, candidates);
    if (next !== target) {
      target = next;
      setHighlighted(next ? recordOf.get(next)!.object : null);
      setContextIcon(iconFor(next ? next.kind : null));
    }
  }

  function pushTarget(): void {
    if (!target) return;
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
      return { id: n.id, pos: [p.x, p.y, p.z], mode: n.walker.mode, texture: npcTexture.get(n) };
    }),
  );
  registerDebug('highlight', () => {
    const size = viewport();
    const rec = target ? recordOf.get(target) : undefined;
    return {
      id: target ? target.id : null,
      kind: target ? target.kind : null,
      icon: iconFor(target ? target.kind : null),
      // Projected lazily when read, so the frame loop never pays for the test hook.
      screen: rec ? projectToScreen(rec, ctx.camera, size.width, size.height) : null,
    };
  });

  return {
    input,
    fixedUpdate(dt) {
      player.fixedUpdate(dt, input);
      for (const npc of npcs) npc.fixedUpdate(dt);
      refreshTarget();

      const pressed = consumeInteract(input);
      const picked = pickQueued;
      pickQueued = null;
      // A click only counts if it hit the object that is still the target (a stale click never pushes).
      if (pressed || (picked !== null && target !== null && picked === target.id)) pushTarget();

      props.fixedUpdate();
    },
    frameUpdate(dt) {
      // Animations stand still while paused (the loop still renders paused frames).
      const animDt = getPauseState().isPaused() ? 0 : dt;
      player.frameUpdate(animDt);
      for (const npc of npcs) npc.frameUpdate(animDt);
      props.sync();
      cameraView.update(dt, player.pos());
      room.update(getCameraYaw());
      shadows.update();
    },
    timeScale() {
      return 1;
    },
  };
}

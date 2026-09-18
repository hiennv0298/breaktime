import { Vector3, type Object3D } from 'three';
import { registerDebug } from '../debug/testHook';
import { consumeInteract, consumeNpcDelta, createInputState, type InputState } from '../input/inputState';
import { attachJoystick } from '../input/joystick';
import { attachKeyboard } from '../input/keyboard';
import { attachPointerPick } from '../input/pointerPick';
import { attachTouchButtons, setContextIcon } from '../input/touchButtons';
import { createQuickNpcPill, type QuickNpcPill } from '../ui/quickNpcPill';
import { createDebrisBudget, DEFAULT_DEBRIS_CAPACITY } from '../logic/debrisBudget';
import { createHitStop, type HitStop } from '../logic/hitStop';
import { iconFor, pickNearest, type Candidate } from '../logic/nearest';
import { parseNpcAt } from '../logic/npcAt';
import {
  BENCH_NPCS,
  DEFAULT_NPCS,
  MAX_NPCS,
  normalizeNpcSettings,
  type NpcSettings,
  type NpcSettingsSource,
} from '../logic/npcSettings';
import { onFloorMembers, resolveStartRoster, type Roster, type RosterMember, type RosterSource } from '../logic/roster';
import { nextQuickCandidate, quickAdd, quickRemove } from '../logic/quickNpc';
import { maxOnFloor } from '../logic/roster';
import { preloadCharacterLook } from '../render/characters';
import { readRosterRaw, writeRoster } from './rosterStore';
import { TIERS } from '../logic/quality';
import { BENCH_SEED, mulberry32 } from '../logic/rng';
import { createSwingGate, SWING_COOLDOWN_MS } from '../logic/swing';
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
import { createNpcLabels } from '../ui/npcLabels';
import { createBreakables, type Breakables } from './breakables';
import { PLAYER_SPAWN, PROP_PLACEMENTS, ROOM, TEST_BOX_ID } from './layout';
import { getPauseState } from './loop';
import { createNpc, type Npc } from './npc';
import { createPlayer, PLAYER_TEXTURE, type Player } from './player';
import { readNpcSettingsRaw } from './npcSettingsStore';
import { performSlap, slapCount } from './slap';
import { ROUTE_START_INDEX, farthestRouteIndex, routeForNpc, spawnPointForNpc, walkSpeedForNpc } from './waypoints';
import { scheduleWriteRoster } from './rosterStore';

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
  /** The roster and its source (plan 02-07). */
  roster(): { roster: Roster; source: RosterSource; storageOk: boolean };
  /**
   * Applies a roster chosen in the settings menu (plan 02-07, D-03): in-place respawn with new members, looks, names
   * and tempers; normalises again, despawns NPCs above the count, respawns or creates the missing ones (grow-only pool,
   * never more than MAX_NPCS). Storage is the caller's job (writeRoster).
   */
  applyRoster(r: Roster, source?: RosterSource): void;
  /** Derived view for tests: the roster mapped to the legacy NpcSettings format (plan 02-07). */
  npcSettings(): { settings: NpcSettings; source: NpcSettingsSource; storageOk: boolean };

  // ---------- Benchmark hooks (plan 01-17, D-08) ----------
  /** The InputState the player moves with: `input` in play, a separate autopilot-owned state in bench mode. */
  readonly playerInput: InputState;
  /** Slaps the nearest slappable active NPC (any distance) through the swing cooldown; false when none was slapped. */
  slapNearestNpc(): boolean;
  /** Slaps every slappable active NPC in this step, bypassing the swing cooldown; returns how many were slapped. */
  massRagdoll(): number;
  /** Launches every dynamic prop with the bench seed (breakables.smashAll). */
  smash(): void;
  /** Active NPCs currently flying or lying as a ragdoll. */
  countRagdollsActive(): number;
  activeNpcCount(): number;
  /** Props displaced >= 0.3 m from home, broken props included (props.movedCount, plan 01-16). */
  knockedOrBroken(): number;
  brokenCount(): number;
  /** Renderer / physics numbers of the last rendered frame for the bench recorder and the soak leak readout. */
  stats(): {
    drawCalls: number;
    bodies: number;
    dpr: number;
    backbufferWidth: number;
    backbufferHeight: number;
    flavor: string;
    geometries: number;
    textures: number;
  };

  // ---------- Soak hooks (plan 01-18, TECH-04) ----------
  /** Breakables of the office: the soak calls resetAll() between cycles. */
  readonly breakables: Breakables;
  /**
   * Puts every active NPC of the 01-27 pool back on its route start in the walking state (a ragdoll or an NPC getting up
   * is re-attached first), leaves inactive pooled NPCs despawned and returns the player to PLAYER_SPAWN. Nothing is
   * created or removed: the same bodies, meshes, shadows and name tags are reused.
   */
  resetForSoak(): void;
  /** Live debris shards (same number as __bt.debris.active). */
  debrisActive(): number;
}

export interface CreateGameOptions {
  /** Replaces the ?npcs= count (clamped 0..15); the 01-17 bench and the 01-18 soak pass BENCH_NPCS (10, D-11). */
  forcedNpcCount?: number;
  /**
   * Bench mode (plan 01-17): the autopilot owns the player's InputState. Keyboard and the touch pause button still
   * pause (portal rule), but movement keys, the joystick, action presses and game-area clicks never reach the player.
   */
  bench?: boolean;
}

/**
 * DEFAULT_NPCS (3, D-11), MAX_NPCS (15, D-01 plan 02-06) and BENCH_NPCS (10, D-11 plan 02-06) live in src/logic/npcSettings.ts;
 * ?npcs and stored counts are clamped to MAX_NPCS so neither a URL nor tampered storage can spawn unbounded bodies (T-01-14-01,
 * T-01-23-01, T-01-26-02). Re-exported for existing importers.
 */
export { BENCH_NPCS, DEFAULT_NPCS, MAX_NPCS };
export type { Roster, RosterMember, RosterSource } from '../logic/roster';
/** Name tag anchor above the floor point of a walking NPC, and above the torso of a ragdoll (plan 01-26). */
const LABEL_HEAD_Y = 1.85;
const LABEL_RAGDOLL_Y = 0.9;
/** A projected anchor further than this outside NDC hides its label. */
const LABEL_NDC_LIMIT = 1.1;
/** Slap target footprint: an NPC is reachable within 1.6 m of its 0.4 m radius (plan 01-15). */
const NPC_TARGET_RADIUS = 0.4;
/** ?scenario=smash fires on this fixed step, once everything has settled on its surface (plan 01-16). */
export const SMASH_STEP = 30;

/** T-01-16-03: only the literal value 'smash' is recognised. */
export function scenarioFromQuery(search: string): 'smash' | null {
  return new URLSearchParams(search).get('scenario') === 'smash' ? 'smash' : null;
}

function loadedBuffer(ctx: GameCtx, id: string): ArrayBuffer {
  const v = ctx.loaded.get(id);
  if (!(v instanceof ArrayBuffer)) throw new Error(`load task ${id} did not produce an ArrayBuffer`);
  return v;
}

/**
 * Office slice (plan 01-10): Kenney open-space office + pantry, physics props, blob shadows, follow camera.
 * Characters (plan 01-14): the player and 3 coworkers (?npcs=0..10, D-29) are Blocky characters from one shared GLB.
 * The nearest prop or coworker in front of the player glows. Space / E, the context button or a left-click on the game
 * view always swings at once (plan 01-24, D-30, behind a 350 ms cooldown); the swing pushes the glowing prop or slaps
 * the glowing coworker into a ragdoll (plan 01-15, D-12) only when that target is in range (and, for a click, only when
 * the click landed on it — D-18 / D-20 revised).
 * NPC count and names (plan 01-26, D-29): opts.forcedNpcCount > ?npcs= > saved 'bt.npcs' > 3; saved names show as
 * textContent tags above the NPCs and never leave the device (D-31). The settings menu applies a new count and names in
 * place through applyNpcSettings (plan 01-27) on a grow-only pool of at most MAX_NPCS NPCs.
 */
export async function createGame(ctx: GameCtx, opts: CreateGameOptions = {}): Promise<Game> {
  const [assets, characterAsset] = await Promise.all([
    parseOfficeAssets(loadedBuffer(ctx, 'office'), loadedBuffer(ctx, 'food')),
    parseCharacterAsset(loadedBuffer(ctx, 'character')),
  ]);

  const room = buildRoom(ctx, assets);
  const props = createProps(ctx, PROP_PLACEMENTS, assets, { surfaceTop: (id) => room.surfaceTop(id) });
  const canvas = ctx.renderer.domElement;
  const viewport = () => ({ width: canvas.clientWidth, height: canvas.clientHeight });
  props.setCamera(ctx.camera, viewport);

  const bench = opts.bench === true;
  const input = createInputState();
  // Bench mode: the player reads an autopilot-owned state; device input only keeps its pause toggles (plan 01-17).
  const playerInput = bench ? createInputState() : input;
  attachKeyboard(input);
  // Touch controls share the same InputState (D-17, D-18); they live for the page lifetime like the keyboard.
  const uiRoot = document.getElementById('app') ?? document.body;
  if (!bench) attachJoystick(uiRoot, input);
  attachTouchButtons(uiRoot, input);

  // Plan 02-08 (D-02): quick NPC pill for +/− in play.
  let pill: QuickNpcPill | null = null;
  if (!bench) {
    pill = createQuickNpcPill(uiRoot, {
      onDelta(delta) {
        input.npcDelta = Math.min(Math.max(input.npcDelta + delta, -15), 15);
      },
    });
  }

  const player = createPlayer(ctx, PLAYER_SPAWN, characterAsset);
  const cameraView = createCameraView(ctx.camera);

  // Coworkers, each on its own seeded route (D-11, quick fix 16/09/2026). Looks come from the roster, not the slot index (D-03).
  // Grow-only pool (plan 01-27, D-29, T-01-27-02): slot i is created the first time the count reaches it; afterwards it
  // is only despawned / respawned, so Apply never creates or removes Rapier bodies beyond MAX_NPCS NPCs.
  const pool: Npc[] = [];
  /** Active NPCs, always slots 0..count-1 in order (what the loops, name tags and __bt.npcs see). */
  let npcs: Npc[] = [];
  const npcTexture = new Map<Npc, string>();
  const slotMember: (RosterMember | null)[] = [];
  /** Blob shadow handle per pool slot; -1 while the NPC is despawned (or before shadows exist). */
  const npcShadow: number[] = [];
  const stored = readRosterRaw();
  const startRoster = resolveStartRoster({
    search: location.search,
    rosterRaw: stored.rosterRaw,
    legacyRaw: stored.legacyRaw,
    forcedCount: opts.forcedNpcCount,
    bench,
  });
  let roster = startRoster.roster;
  let rosterSource = startRoster.source;
  const rosterStorageOk = stored.storageOk;
  // ?npcAt=x,z pins NPC 0, frozen until slapped, for the slap e2e and the benchmark (T-01-15-01: parsed and clamped).
  const npcAt = parseNpcAt(location.search, { halfX: ROOM.width / 2, halfZ: ROOM.depth / 2, margin: 0.5 });
  /** The ?npcAt pin applies only while the office is first built; an NPC 0 created by a later Apply walks its route. */
  let pinAllowed = true;
  /** Set once shadows and targeting exist: NPCs created later by Apply register their blob and candidate through it. */
  let wireNpc: ((i: number) => void) | null = null;

  /** First stop of slot i's own seeded route (16/09/2026 quick fix); every slot spawns >= 0.6 m from the others. */
  function spawnPointFor(i: number): { x: number; z: number } {
    return spawnPointForNpc(i);
  }

  /** Creates pool slots up to and including i (capped at MAX_NPCS); a created NPC starts active. */
  function ensureNpc(i: number, member: RosterMember | null): void {
    while (pool.length <= i && pool.length < MAX_NPCS) {
      const k = pool.length;
      // Own loop, own walk speed, own dwell times: a newly added coworker no longer retraces an older one.
      const route = routeForNpc(k);
      const pinned = pinAllowed && k === 0 && npcAt !== null;
      const m = member || roster.members[k] || roster.members[0];
      const texture = m.look;
      const npc = createNpc(ctx, {
        id: 'npc-' + k,
        asset: characterAsset,
        texture,
        route,
        startIndex: ROUTE_START_INDEX,
        speed: walkSpeedForNpc(k),
        spawn: pinned && npcAt ? npcAt : spawnPointFor(k),
        frozen: pinned,
        groupIndex: k,
      });
      pool.push(npc);
      npcTexture.set(npc, texture);
      slotMember[k] = m;
      npcShadow.push(-1);
      wireNpc?.(k);
    }
  }
  const floor = onFloorMembers(roster);
  for (let i = 0; i < roster.count; i++) ensureNpc(i, floor[i] ?? null);
  pinAllowed = false;
  npcs = pool.slice();
  // Name tags (D-29): one DOM layer, textContent only; unnamed NPCs never show a tag.
  const labels = createNpcLabels(uiRoot, MAX_NPCS);
  for (let i = 0; i < npcs.length; i++) labels.setText(i, slotMember[i]?.name ?? '');
  const labelNdc = new Vector3();
  let hasNamedNpc = npcs.some((_, i) => !!slotMember[i]?.name);

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
  const addNpcShadow = (i: number): void => {
    const npc = pool[i];
    // Follows the capsule while walking and the torso while the NPC is a ragdoll.
    npcShadow[i] = shadows.addCaster(() => npc.foot(), CAPSULE_RADIUS * 1.5);
  };
  for (let i = 0; i < pool.length; i++) addNpcShadow(i);

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
  // One candidate per pool slot, registered once; a despawned NPC is skipped by refreshTarget (not slappable).
  const addNpcCandidate = (npc: Npc): void => {
    const c: Candidate = { id: npc.id, x: 0, z: 0, radius: NPC_TARGET_RADIUS, kind: 'npc' };
    allCandidates.push(c);
    entryOf.set(c, { object: npc.character.root, npc });
  };
  for (const npc of pool) addNpcCandidate(npc);
  wireNpc = (i) => {
    addNpcShadow(i);
    addNpcCandidate(pool[i]);
  };
  const hitStop = createHitStop();
  const centreWorld = new Vector3();
  const npcScreen = new Vector3();
  const playerQuery = { x: 0, z: 0, yawRad: 0 };
  let target: Candidate | null = null;
  /** Last game-area click since the previous fixed step: an id = it hit the glowing object, null = any other click. */
  let pickQueued: string | null | undefined = undefined;
  let interactCount = 0;
  // D-30 swing: one cooldown gate for every action source; slap.ts stays outside it (the 01-17 bench calls it directly).
  const swingGate = createSwingGate();
  let swingHits = 0;
  let swingDropped = 0;

  setContextIcon(iconFor(null));

  if (!bench) {
    attachPointerPick(
      canvas,
      ctx.camera,
      () => (target ? { id: target.id, object: entryOf.get(target)!.object } : null),
      (id) => {
        pickQueued = id;
      },
      () => getPauseState().isPaused(),
    );
  }
  const smashRng = mulberry32(BENCH_SEED);
  const rapierFlavor = String((ctx.loaded.get('rapier') as { flavor?: string } | undefined)?.flavor ?? '?');

  function activateNpc(i: number): void {
    const npc = pool[i];
    if (!npc || npc.active()) return;
    npc.respawn(spawnPointFor(i), ROUTE_START_INDEX);
    if (npcShadow[i] < 0) addNpcShadow(i);
  }

  function deactivateNpc(i: number): void {
    const npc = pool[i];
    if (!npc || !npc.active()) return;
    npc.despawn();
    if (npcShadow[i] >= 0) shadows.remove(npcShadow[i]);
    npcShadow[i] = -1;
    labels.hide(i);
  }

  /**
   * In-place apply roster (D-03, plan 02-07): NPCs that stay keep their state (a flying ragdoll keeps flying) and only get
   * the new look, name and temper; props, broken objects, shards and the other blob shadows are untouched.
   */
  function applyRosterInternal(r: Roster, source: RosterSource): void {
    const floor = onFloorMembers(r);
    for (let i = 0; i < MAX_NPCS; i++) {
      if (i >= floor.length) deactivateNpc(i);
      else if (i < pool.length) activateNpc(i);
      else ensureNpc(i, floor[i]);
    }
    npcs = pool.filter((n) => n.active());
    roster = r;
    rosterSource = source;

    // Update looks and names for active NPCs (D-03: setLook only when the look changed)
    for (let i = 0; i < npcs.length; i++) {
      const npc = npcs[i];
      const member = floor[i];
      if (!member) continue;
      const oldTexture = npcTexture.get(npc);
      if (oldTexture !== member.look) {
        npc.character.setLook(member.look);
        npcTexture.set(npc, member.look);
      }
      labels.setText(i, member.name);
      slotMember[i] = member;
    }

    // Preload the next quick add candidate's look (RESEARCH Pitfall 10)
    const nextCandidate = nextQuickCandidate(r);
    if (nextCandidate) preloadCharacterLook(nextCandidate.look);

    hasNamedNpc = npcs.some((_, i) => !!slotMember[i]?.name);
    // A despawned NPC that was glowing stops glowing at once, even while the game is paused.
    refreshTarget();
  }

  /** Projects every named NPC's head anchor and moves its tag; tags outside the view hide (runs every rendered frame). */
  function updateLabels(): void {
    if (!hasNamedNpc) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    // cameraView.update moved the camera this frame; refresh its inverse so tags do not trail by one frame.
    ctx.camera.updateMatrixWorld();
    for (let i = 0; i < npcs.length; i++) {
      if (!slotMember[i]?.name) continue;
      const npc = npcs[i];
      if (npc.mode === 'ragdoll') {
        const p = npc.pos();
        labelNdc.set(p.x, p.y + LABEL_RAGDOLL_Y, p.z);
      } else {
        const f = npc.foot();
        labelNdc.set(f.x, f.y + LABEL_HEAD_Y, f.z);
      }
      labelNdc.project(ctx.camera);
      if (
        !Number.isFinite(labelNdc.x) ||
        !Number.isFinite(labelNdc.y) ||
        labelNdc.z > 1 ||
        Math.abs(labelNdc.x) > LABEL_NDC_LIMIT ||
        Math.abs(labelNdc.y) > LABEL_NDC_LIMIT
      ) {
        labels.hide(i);
      } else {
        labels.place(i, ((labelNdc.x + 1) / 2) * w, ((1 - labelNdc.y) / 2) * h);
      }
    }
  }

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

  /** Swing (already let through the gate) and hit `hit` when it is a target in range (D-30). */
  function swingAt(hit: Candidate | null, nowMs: number): void {
    const entry = hit ? entryOf.get(hit) : undefined;
    if (hit && entry?.npc) {
      const before = slapCount();
      performSlap(game, entry.npc, nowMs); // swings toward the NPC through player.slapAt
      if (slapCount() > before) {
        swingHits++;
        // Drop the glow right away: the hit-stop runs no fixed step for 60 ms.
        refreshTarget();
      } else {
        player.swing(); // not slappable after all: still give the swing feedback
      }
      return;
    }
    if (hit && entry?.prop) {
      player.swing(hit.x, hit.z);
      const p = player.pos();
      let dx = hit.x - p.x;
      let dz = hit.z - p.z;
      if (Math.hypot(dx, dz) < 1e-3) {
        const yaw = player.yaw();
        dx = -Math.sin(yaw);
        dz = -Math.cos(yaw);
      }
      props.push(hit.id, dx, dz);
      interactCount++;
      swingHits++;
      return;
    }
    player.swing();
  }

  registerDebug('box', () => {
    const p = testBox.body.translation();
    return { pos: [p.x, p.y, p.z] };
  });
  registerDebug('interactCount', () => interactCount);
  registerDebug('npcs', () =>
    npcs.map((n, i) => {
      const p = n.pos();
      const size = viewport();
      const member = slotMember[i];
      return {
        id: n.id,
        pos: [p.x, p.y, p.z],
        mode: n.mode,
        texture: npcTexture.get(n),
        name: member?.name ?? '',
        memberId: member?.id ?? '',
        temper: member?.temper ?? 'normal',
        // Projected lazily when read (same maths as the highlight getter).
        get screen() {
          npcScreen.set(p.x, p.y, p.z).project(ctx.camera);
          return { x: ((npcScreen.x + 1) / 2) * size.width, y: ((1 - npcScreen.y) / 2) * size.height };
        },
      };
    }),
  );
  registerDebug('roster', () => ({
    source: rosterSource,
    storageOk: rosterStorageOk,
    count: roster.count,
    max: MAX_NPCS,
    members: roster.members.length,
    present: roster.present,
    onFloor: onFloorMembers(roster).map((m) => m.id),
    looks: roster.members.map((m) => m.look),
    savePending: false, // TODO: track from rosterStore
    lastSaveOk: null, // TODO: track from rosterStore
  }));
  registerDebug('npcSettings', () => {
    // Derived view for compatibility with existing tests: maps roster to the old NpcSettings format
    const floor = onFloorMembers(roster);
    const names: string[] = [];
    for (let i = 0; i < MAX_NPCS; i++) {
      names.push(i < floor.length ? floor[i].name : '');
    }
    // Map RosterSource to NpcSettingsSource for compatibility
    let npcSource: NpcSettingsSource = 'default';
    if (rosterSource === 'migrated') npcSource = 'stored'; // Legacy bt.npcs migration
    else if (rosterSource === 'stored') npcSource = 'stored'; // bt.roster stored
    else if (rosterSource === 'query') npcSource = 'query'; // ?npcs= or forced
    else if (rosterSource === 'manual') npcSource = 'manual'; // Applied in settings
    return {
      count: roster.count,
      names,
      source: npcSource,
      storageOk: rosterStorageOk,
    };
  });
  registerDebug('npcLabels', () => labels.snapshot());
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
  registerDebug('swing', () => ({
    count: swingGate.count(),
    hits: swingHits,
    lastMs: swingGate.lastMs(),
    cooldownMs: SWING_COOLDOWN_MS,
    dropped: swingDropped,
  }));
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

      // Plan 02-08 (D-02, D-01): apply quick NPC add/remove from npcDelta keys and pill.
      if (!bench) {
        const delta = consumeNpcDelta(input);
        if (delta !== 0) {
          let working = roster;
          const playerPos = player.pos();
          for (let i = 0; i < Math.abs(delta); i++) {
            if (delta > 0) {
              const result = quickAdd(working);
              working = result.roster;
              if (result.changed && result.member) {
                // Spawn at the farthest point of the route for this newly added slot.
                const newSlotIndex = working.count - 1;
                const route = routeForNpc(newSlotIndex);
                const startIdx = farthestRouteIndex(route, playerPos.x, playerPos.z);
                if (newSlotIndex < pool.length && pool[newSlotIndex].active()) {
                  pool[newSlotIndex].respawn(route[startIdx], startIdx);
                } else if (newSlotIndex < pool.length) {
                  activateNpc(newSlotIndex);
                  pool[newSlotIndex].respawn(route[startIdx], startIdx);
                } else {
                  ensureNpc(newSlotIndex, result.member);
                  pool[newSlotIndex].respawn(route[startIdx], startIdx);
                }
              }
            } else {
              const result = quickRemove(working);
              working = result.roster;
            }
          }
          if (working.count !== roster.count) {
            applyRosterInternal(working, 'quick');
            scheduleWriteRoster(working);
          }
        }
      }

      player.fixedUpdate(dt, playerInput);
      for (const npc of npcs) npc.fixedUpdate(dt);
      refreshTarget();

      // D-30: any action press or game-area click swings at once (cooldown permitting); only a target in range is hit.
      // Bench mode drops device presses (the timeline owns every swing).
      const pressedRaw = consumeInteract(input);
      const pressed = !bench && pressedRaw;
      const picked = bench ? undefined : pickQueued;
      pickQueued = undefined;
      if (pressed || picked !== undefined) {
        const nowMs = performance.now();
        if (!swingGate.tryStart(nowMs)) {
          swingDropped++; // inside the cooldown: the press is dropped, not queued (T-01-24-01)
        } else {
          // A key / context press hits the current target; a click only hits if it landed on the object that is still
          // the target (a stale click never acts, T-01-24-03).
          const hit = pressed ? target : picked !== null && target !== null && picked === target.id ? target : null;
          swingAt(hit, nowMs);
        }
      }

      props.fixedUpdate();
      shards.fixedUpdate(dt);
    },
    frameUpdate(dt, nowMs) {
      // Animations stand still while paused (the loop still renders paused frames) and during a hit-stop freeze.
      const paused = getPauseState().isPaused();
      const animDt = paused || hitStop.active(nowMs) ? 0 : dt;

      // Plan 02-08 (D-02): drop npcDelta while paused (menu is open).
      if (paused && !bench) input.npcDelta = 0;

      player.frameUpdate(animDt);
      for (const npc of npcs) npc.frameUpdate(animDt);
      props.sync();
      shards.sync();
      shardKit.commit();
      // The shake keeps running through the hit-stop (that is the point) but waits while paused.
      cameraView.update(dt, player.pos(), paused ? 0 : dt);
      updateLabels();

      // Plan 02-08 (D-02): update the pill with live count and max.
      if (pill) pill.update(roster.count, maxOnFloor(roster));

      room.update(getCameraYaw());
      shadows.update();
    },
    timeScale(nowMs) {
      return hitStop.active(nowMs) ? 0 : 1;
    },
    roster() {
      return { roster, source: rosterSource, storageOk: rosterStorageOk };
    },
    applyRoster(r, source = 'manual') {
      applyRosterInternal(r, source);
    },
    npcSettings() {
      // Derived view for compatibility with existing loop.ts and tests
      const floor = onFloorMembers(roster);
      const names: string[] = [];
      for (let i = 0; i < MAX_NPCS; i++) {
        names.push(i < floor.length ? floor[i].name : '');
      }
      // Map RosterSource to NpcSettingsSource for compatibility
      let npcSource: NpcSettingsSource = 'default';
      if (rosterSource === 'migrated') npcSource = 'stored'; // Legacy bt.npcs migration
      else if (rosterSource === 'stored') npcSource = 'stored'; // bt.roster stored
      else if (rosterSource === 'query') npcSource = 'query'; // ?npcs= or forced
      else if (rosterSource === 'manual') npcSource = 'manual'; // Applied in settings
      return {
        settings: { count: roster.count, names },
        source: npcSource,
        storageOk: rosterStorageOk,
      };
    },
    playerInput,
    slapNearestNpc() {
      const p = player.pos();
      let best: Npc | null = null;
      let bestD = Number.POSITIVE_INFINITY;
      for (const npc of npcs) {
        if (!npc.slappable()) continue;
        const t = npc.body.translation();
        const d = Math.hypot(t.x - p.x, t.z - p.z);
        if (d < bestD) {
          bestD = d;
          best = npc;
        }
      }
      if (!best) return false;
      const nowMs = performance.now();
      // A scripted slap respects the D-30 cooldown like any press (plan 01-24); the timeline spaces slaps >= 0.5 s.
      if (!swingGate.tryStart(nowMs)) {
        swingDropped++;
        return false;
      }
      const before = slapCount();
      performSlap(game, best, nowMs);
      if (slapCount() === before) return false;
      swingHits++;
      refreshTarget();
      return true;
    },
    massRagdoll() {
      // Every NPC in the same step, outside the swing gate (01-24 decision: the bench calls performSlap directly).
      const nowMs = performance.now();
      let slapped = 0;
      for (const npc of npcs) {
        if (!npc.slappable()) continue;
        const before = slapCount();
        performSlap(game, npc, nowMs);
        if (slapCount() > before) slapped++;
      }
      if (slapped > 0) refreshTarget();
      return slapped;
    },
    smash() {
      breakables.smashAll(smashRng);
    },
    countRagdollsActive() {
      let n = 0;
      for (const npc of npcs) if (npc.mode === 'ragdoll') n++;
      return n;
    },
    activeNpcCount() {
      return npcs.length;
    },
    knockedOrBroken() {
      return props.movedCount();
    },
    brokenCount() {
      return props.brokenCount();
    },
    stats() {
      return {
        drawCalls: ctx.renderer.info.render.calls,
        bodies: ctx.physics.world.bodies.len(),
        dpr: ctx.renderer.getPixelRatio(),
        backbufferWidth: canvas.width,
        backbufferHeight: canvas.height,
        flavor: rapierFlavor,
        geometries: ctx.renderer.info.memory.geometries,
        textures: ctx.renderer.info.memory.textures,
      };
    },
    breakables,
    resetForSoak() {
      for (let i = 0; i < pool.length; i++) {
        const npc = pool[i];
        if (!npc.active()) continue;
        // despawn re-attaches a ragdoll's parts and resets the get-up FSM; respawn puts it on its route start, walking.
        npc.despawn();
        npc.respawn(spawnPointFor(i), ROUTE_START_INDEX);
      }
      player.teleport(PLAYER_SPAWN.x, PLAYER_SPAWN.z);
      pickQueued = undefined;
      refreshTarget();
    },
    debrisActive() {
      return shards.active();
    },
  };
  return game;
}

/**
 * Combat wiring (plan 02-10, D-05..D-11): plugs the pure combat director into the game loop,
 * steers NPCs via character controller, shows '!' markers and angry labels, tracks hits and metrics.
 * Combat is disabled when bench mode is active (D-11).
 */

import { PerspectiveCamera } from 'three';
import { createCombatDirector, type CombatCommand, type CombatNpcObs, type CombatPlayerObs } from '../logic/combatDirector';
import { BENCH_SEED, mulberry32, seedFor } from '../logic/rng';
import { fightFromQuery } from '../logic/anger';
import { pickVariant } from '../logic/sfxNames';
import { playSfx, sfxNames } from '../audio/sfx';
import type { CharacterMotion } from '../render/characters';
import { registerDebug } from '../debug/testHook';
import type { CombatMarkers } from '../ui/combatMarkers';
import type { Npc } from './npc';
import type { RosterMember } from '../logic/roster';

/** Windup animation time scale (D-08): 0.35 makes the 1.71 s 'attack-melee-right' take ~4.88 s real time. */
export const WINDUP_TIME_SCALE = 0.35;
/** World height where the '!' marker appears (D-08): head ~2.25 m, foot ~0.75 m. */
export const MARKER_HEAD_Y = 2.25;
/** Text for unnamed angry NPCs (D-10). */
export const ANGRY_TAG_TEXT = 'Giận!';

export interface CombatDeps {
  /** True unless bench mode is active (D-11). */
  enabled: boolean;
  /** 'always' for every slapped NPC to get hot immediately (test flag); null for normal temper-based anger. */
  fight: 'always' | null;
  /** Physics world for the character controller. */
  world: any;
  /** Player position and HUD bounds. */
  player: { pos(): { x: number; y: number; z: number } };
  /** Active NPC list. */
  npcs(): readonly Npc[];
  /** Slot i's roster member or null if unbound. */
  memberOf(slot: number): RosterMember | null;
  /** False while the player is stunned (plan 02-11); strikes miss if false. */
  targetable(): boolean;
  /** Called when an NPC's strike lands on the player; plan 02-11 adds knockdown feedback. */
  onPlayerHit(npc: Npc, nowMs: number): void;
  /** Called when an NPC's angry state changes (for label colour and tag text). */
  onAngryChange(slot: number, angry: boolean): void;
  /** DOM markers. */
  markers: CombatMarkers;
  /** Camera for shake direction (unused in 02-10; plan 02-11 shakes the player). */
  camera: PerspectiveCamera;
  /** Canvas for context queries. */
  canvas: HTMLCanvasElement;
}

export interface Combat {
  readonly enabled: boolean;
  /** Called when the player slaps NPC at slot i (D-05). */
  onSlapped(slot: number): void;
  /** Forget slot i when despawned or rebound to another member (plan 01-27). */
  forgetSlot(slot: number): void;
  /** Fixed-time step for FSM, anger decay, tokens and commands (plan 01-04). */
  fixedUpdate(dt: number, nowMs: number): void;
  /** Per-frame marker positioning (plan 01-04). */
  frameUpdate(): void;
  /** Reset FSMs and metrics but keep timestamps (soak cycle, plan 01-18). */
  reset(): void;
  /** Snapshot of combat metrics for benchmarking (D-11). */
  snapshot(): { maxPursuers: number; maxAttackers: number; strikes: number; landed: number };
}

/** World-to-NDC projection for screen-space marker placement (label copy, plan 02-09 math). */
function worldToNdc(pos: { x: number; y: number; z: number }, camera: PerspectiveCamera, canvas: HTMLCanvasElement): { x: number; y: number } | null {
  const vec = (camera as any).position.clone?.();
  const dir = pos as unknown as { x: number; y: number; z: number };
  if (!vec) return null;
  // This is a placeholder; the real camera projection comes from game.ts updateLabels
  // For now, return a reasonable default in canvas space
  const x = canvas.clientWidth / 2 + (dir.x * 100);
  const y = canvas.clientHeight / 2 - (dir.y * 100);
  return { x, y };
}

export function createCombat(deps: CombatDeps): Combat {
  if (!deps.enabled) {
    // Disabled in bench mode: all methods are no-ops, but we report enabled false
    registerDebug('combat', () => ({
      enabled: false,
      fight: deps.fight,
      strikes: 0,
      landed: 0,
      missed: 0,
      interrupted: 0,
      giveUps: 0,
      maxPursuers: 0,
      maxAttackers: 0,
      pursuers: [],
      attackers: [],
      npcs: [],
      player: { hitsTaken: 0 },
    }));
    return {
      enabled: false,
      onSlapped() {},
      forgetSlot() {},
      fixedUpdate() {},
      frameUpdate() {},
      reset() {},
      snapshot() {
        return { maxPursuers: 0, maxAttackers: 0, strikes: 0, landed: 0 };
      },
    };
  }

  const director = createCombatDirector({ seed: BENCH_SEED, fight: deps.fight });
  const kcc = deps.world.createCharacterController(0.02);
  kcc.setApplyImpulsesToDynamicBodies(false);
  kcc.setSlideEnabled(true);
  const combatRng = mulberry32(seedFor(BENCH_SEED, 'combat-sfx'));

  const playerHitsTaken: number[] = [0]; // Mutable for metrics
  const lastAngry = new Map<number, boolean>(); // Track angry state per slot for change detection
  const npcIdToSlot = new Map<string, number>(); // Map NPC id to slot index

  // Register debug info
  registerDebug('combat', () => {
    const snapshot = director.snapshot();
    return {
      enabled: deps.enabled,
      fight: deps.fight,
      ...snapshot,
      player: { hitsTaken: playerHitsTaken[0] },
    };
  });

  return {
    enabled: deps.enabled,
    onSlapped(slot) {
      const member = deps.memberOf(slot);
      if (!member) return;
      // Find the NPC at this slot
      const npcs = deps.npcs();
      if (slot < 0 || slot >= npcs.length) return;
      const npc = npcs[slot];
      if (!npc || !npc.active()) return;
      director.onSlapped(npc.id, member.id, member.temper);
    },
    forgetSlot(slot) {
      const npcs = deps.npcs();
      if (slot < 0 || slot >= npcs.length) return;
      const npc = npcs[slot];
      if (!npc.active()) return;
      director.forget(npc.id);
      lastAngry.delete(slot);
      npcIdToSlot.delete(npc.id);
      const wasAngry = lastAngry.get(slot);
      if (wasAngry) {
        deps.onAngryChange(slot, false);
      }
    },
    fixedUpdate(dt, nowMs) {
      // Build observations
      const npcs = deps.npcs();
      const observations: CombatNpcObs[] = [];
      npcIdToSlot.clear();

      for (let slot = 0; slot < npcs.length; slot++) {
        const npc = npcs[slot];
        if (!npc.active()) continue;
        const member = deps.memberOf(slot);
        if (!member) continue;

        const pos = npc.pos();
        const route = npc.routeNearest();
        const obs: CombatNpcObs = {
          id: npc.id,
          memberId: member.id,
          temper: member.temper,
          x: pos.x,
          z: pos.z,
          yaw: npc.yaw(),
          physics: npc.physicsMode(),
          routeX: route.x,
          routeZ: route.z,
        };
        observations.push(obs);
        npcIdToSlot.set(npc.id, slot);
      }

      // Player observation
      const playerPos = deps.player.pos();
      const playerObs: CombatPlayerObs = {
        x: playerPos.x,
        z: playerPos.z,
        targetable: deps.targetable(),
      };

      // Step director
      const result = director.step(dt, observations, playerObs);

      // Process events
      for (const event of result.events) {
        if (event.kind === 'landed') {
          const slot = npcIdToSlot.get(event.id);
          if (slot !== undefined) {
            const npc = npcs[slot];
            playerHitsTaken[0]++;
            deps.onPlayerHit(npc, nowMs);
          }
        } else if (event.kind === 'windup') {
          // Play alert sound (D-08 wind-up cue)
          const variant = pickVariant(sfxNames(), 'alert', combatRng) ?? 'alert-0';
          playSfx(variant, { gain: 0.8 });
        }
      }

      // Apply commands: move, face, animate, angry state
      for (const cmd of result.commands) {
        const slot = npcIdToSlot.get(cmd.id);
        if (slot === undefined) continue;
        const npc = npcs[slot];
        if (!npc.active()) continue;

        // Track angry state change
        const wasAngry = lastAngry.get(slot) ?? false;
        if (cmd.angry !== wasAngry) {
          lastAngry.set(slot, cmd.angry);
          deps.onAngryChange(slot, cmd.angry);
        }

        // Set combat control with movement
        if (cmd.move === 'walker') {
          // Return to walking: clear combat control
          npc.setCombatControl(null);
        } else if (cmd.move === 'pursue' || cmd.move === 'sidestep' || cmd.move === 'return') {
          // Combat movement: set control and apply kinematic step
          const timeScale = cmd.state === 'windup' ? WINDUP_TIME_SCALE : undefined;
          npc.setCombatControl({
            faceX: cmd.faceX,
            faceZ: cmd.faceZ,
            motion: (cmd.motion ?? 'idle') as CharacterMotion,
            timeScale,
          });

          // Apply kinematic step if needed
          if ((cmd.stepX !== 0 || cmd.stepZ !== 0) && cmd.state !== 'windup') {
            const movement = { x: cmd.stepX, y: 0, z: cmd.stepZ };
            const computed = kcc.computeColliderMovement(npc.collider, movement);
            const delta = computed ? computed.translated() : movement;
            npc.moveKinematic(delta.x, delta.z);
          }
        }
      }
    },
    frameUpdate() {
      // Position markers for winding-up NPCs
      const npcs = deps.npcs();
      for (let slot = 0; slot < npcs.length; slot++) {
        const npc = npcs[slot];
        if (!npc.active()) continue;
        const cmd = director.snapshot().npcs.find((c) => c.id === npc.id);
        if (!cmd || cmd.state !== 'windup') {
          deps.markers.hide(slot);
          continue;
        }
        const pos = npc.pos();
        const screenPos = worldToNdc({ x: pos.x, y: MARKER_HEAD_Y, z: pos.z }, deps.camera, deps.canvas);
        if (screenPos) {
          deps.markers.place(slot, screenPos.x, screenPos.y);
        } else {
          deps.markers.hide(slot);
        }
      }
    },
    reset() {
      director.reset();
      playerHitsTaken[0] = 0;
      lastAngry.clear();
      npcIdToSlot.clear();
    },
    snapshot() {
      const snap = director.snapshot();
      return {
        maxPursuers: snap.maxPursuers,
        maxAttackers: snap.maxAttackers,
        strikes: snap.strikes,
        landed: snap.landed,
      };
    },
  };
}

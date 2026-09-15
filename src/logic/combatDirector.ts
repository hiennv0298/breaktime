/**
 * Multi-NPC combat brain (D-05, D-07, D-08, G9, NPC-06). Pure: no three.js / Rapier / DOM, no clock, no shared rng
 * (D-12, TECH-06). Owns per NPC: the anger meter, the combat FSM, a seeded stream and the token wants; per director:
 * the token holdings and the metrics.
 *
 * Game integration is plan 02-10: each fixed step the game passes observations (NPC slot id, roster member, temper,
 * position, walker yaw, physics mode, route point) and the player (position, targetable) and applies the returned
 * commands through each NPC's character controller. move 'walker' means the existing waypoint walker keeps control,
 * so an NPC that is not angry behaves exactly as in Phase 1.
 *
 * Step order (per call):
 *   1. forget entries whose id is no longer observed; recreate an entry whose memberId changed (slot rebound)
 *   2. tickAnger(dt, { holdDecay: physics !== 'animated' }) for every NPC (decay delay runs only while standing)
 *   3. tokens = arbitrate(contenders built from the PREVIOUS step's wants, previous holdings), contenders sorted by id
 *   4. stepCombatFsm per NPC in id order; the reaction delay is drawn from the member stream only when entering fume
 *   5. 'strike': landed = player.targetable && strikeHits(...); applyStrikeResult; landed -> satisfyAnger + 'landed'
 *   6. 'give-up': satisfyAnger
 *   7. holdings drop tokens the FSM no longer wants (released the same step); commands are built in id order
 *
 * Randomness: every member draws from mulberry32(seedFor(seed, memberId)), never from a shared stream, so adding NPCs
 * or reordering observations never changes another member's decisions (RESEARCH Pitfall 7). All loops run in sorted
 * id order and arbitration ranks by id on ties, never by Map iteration order.
 *
 * Only token holders (<= 3) get non-zero movement; angry NPCs without a token fume in place with zero step vectors and
 * never converge on a shared waiting point (RESEARCH M3). NPCs only ever strike the player, never other NPCs, and only
 * get angry from being slapped themselves (CONTEXT out of scope).
 *
 * reset() re-seeds every member stream as well, so a soak cycle after reset replays the same decisions.
 */

import {
  createAnger,
  effectiveTemper,
  isAngry,
  isCalm,
  onSlapped as angerOnSlapped,
  reactionDelaySec,
  satisfyAnger,
  tickAnger,
  type AngerState,
} from './anger';
import { arbitrate, type Contender } from './attackTokens';
import {
  applyStrikeResult,
  CHASE_SPEED,
  createCombatFsm,
  RETURN_SPEED,
  SIDESTEP_SPEED,
  stepCombatFsm,
  type CombatFsmEvent,
  type CombatFsmState,
  type CombatMove,
  type CombatState,
} from './combatFsm';
import { mulberry32, seedFor } from './rng';
import { ATTACK_START_DIST, edgeDistance, PLAYER_BODY_RADIUS, strikeHits } from './strikeHit';
import type { Temper } from './temper';

/** Pursuers stop this far inside the wind-up start distance (edge, m). */
const PURSUE_STOP_MARGIN = 0.05;

export interface CombatNpcObs {
  /** NPC slot id (stable per spawned slot). */
  id: string;
  /** Roster member bound to the slot. */
  memberId: string;
  temper: Temper;
  x: number;
  z: number;
  /** Walker yaw convention: facing (sin yaw, cos yaw). */
  yaw: number;
  physics: 'animated' | 'ragdoll' | 'recover';
  /** Route point to walk back to after giving up. */
  routeX: number;
  routeZ: number;
}

export interface CombatPlayerObs {
  x: number;
  z: number;
  /** false while the player is knocked down or invulnerable (playerStun). */
  targetable: boolean;
}

export interface CombatCommand {
  id: string;
  state: CombatState;
  move: CombatMove;
  /** Horizontal translation (m) for this step. */
  stepX: number;
  stepZ: number;
  /** Point to face. */
  faceX: number;
  faceZ: number;
  motion: 'idle' | 'walk' | 'sprint' | 'emote-no' | 'attack-melee-right' | null;
  /** Angry label colour (D-10). */
  angry: boolean;
  /** '!' marker over the head (wind-up only, D-08). */
  marker: boolean;
  token: 'pursue' | 'strike' | null;
  anger: number;
}

export type CombatEvent = { kind: CombatFsmEvent | 'landed' | 'missed' | 'slapped'; id: string };

export interface CombatStepResult {
  commands: CombatCommand[];
  events: CombatEvent[];
}

export interface CombatSnapshot {
  strikes: number;
  landed: number;
  missed: number;
  interrupted: number;
  giveUps: number;
  maxPursuers: number;
  maxAttackers: number;
  pursuers: string[];
  attackers: string[];
  npcs: Array<{
    id: string;
    memberId: string;
    temper: Temper;
    state: CombatState;
    anger: number;
    token: 'pursue' | 'strike' | null;
  }>;
}

export interface CombatDirector {
  onSlapped(id: string, memberId: string, temper: Temper): void;
  step(dt: number, npcs: readonly CombatNpcObs[], player: CombatPlayerObs): CombatStepResult;
  /** Slot despawned or rebound to another member: drop FSM, anger, tokens. */
  forget(id: string): void;
  /** Everything back to routine, metrics kept. */
  reset(): void;
  snapshot(): CombatSnapshot;
}

interface Entry {
  memberId: string;
  temper: Temper;
  fsm: CombatFsmState;
  anger: AngerState;
  rng: () => number;
  wantsPursue: boolean;
  wantsStrike: boolean;
}

function byId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function finiteOr0(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

export function createCombatDirector(opts: { seed: number; fight: 'always' | null }): CombatDirector {
  const seed = Number.isFinite(opts.seed) ? opts.seed : 0;
  const fight = opts.fight === 'always' ? 'always' : null;
  const entries = new Map<string, Entry>();
  let pursue = new Set<string>();
  let strike = new Set<string>();
  let pending: CombatEvent[] = [];
  const metrics = { strikes: 0, landed: 0, missed: 0, interrupted: 0, giveUps: 0, maxPursuers: 0, maxAttackers: 0 };

  function makeEntry(memberId: string, temper: Temper): Entry {
    return {
      memberId,
      temper,
      fsm: createCombatFsm(),
      anger: createAnger(),
      rng: mulberry32(seedFor(seed, memberId)),
      wantsPursue: false,
      wantsStrike: false,
    };
  }

  function dropTokens(id: string): void {
    if (pursue.has(id) || strike.has(id)) {
      pursue = new Set([...pursue].filter((k) => k !== id));
      strike = new Set([...strike].filter((k) => k !== id));
    }
  }

  function forget(id: string): void {
    entries.delete(id);
    dropTokens(id);
  }

  function entryFor(id: string, memberId: string, temper: Temper): Entry {
    const existing = entries.get(id);
    if (existing && existing.memberId === memberId) {
      existing.temper = temper;
      return existing;
    }
    if (existing) forget(id);
    const created = makeEntry(memberId, temper);
    entries.set(id, created);
    return created;
  }

  function tokenOf(id: string): 'pursue' | 'strike' | null {
    return strike.has(id) ? 'strike' : pursue.has(id) ? 'pursue' : null;
  }

  function onSlapped(id: string, memberId: string, temper: Temper): void {
    const e = entryFor(id, memberId, temper);
    e.anger = angerOnSlapped(e.anger, effectiveTemper(temper, fight), e.rng, { jitter: fight !== 'always' });
    pending.push({ kind: 'slapped', id });
  }

  function step(dt: number, npcs: readonly CombatNpcObs[], player: CombatPlayerObs): CombatStepResult {
    const events: CombatEvent[] = pending;
    pending = [];

    // 1. Observations by id (first duplicate wins), forget vanished ids, rebind changed members.
    const obsById = new Map<string, CombatNpcObs>();
    for (const o of npcs) if (!obsById.has(o.id)) obsById.set(o.id, o);
    for (const id of [...entries.keys()].sort(byId)) if (!obsById.has(id)) forget(id);
    const ids = [...obsById.keys()].sort(byId);
    for (const id of ids) {
      const o = obsById.get(id) as CombatNpcObs;
      entryFor(id, o.memberId, o.temper);
    }

    // 2. Anger decay, held while down.
    for (const id of ids) {
      const e = entries.get(id) as Entry;
      const o = obsById.get(id) as CombatNpcObs;
      e.anger = tickAnger(e.anger, dt, { holdDecay: o.physics !== 'animated' });
    }

    // 3. Tokens from the previous step's wants.
    const dists = new Map<string, number>();
    const contenders: Contender[] = [];
    for (const id of ids) {
      const e = entries.get(id) as Entry;
      const o = obsById.get(id) as CombatNpcObs;
      const dist = edgeDistance(o.x, o.z, player.x, player.z, PLAYER_BODY_RADIUS);
      dists.set(id, dist);
      contenders.push({ id, anger: e.anger.value, dist, wantsPursue: e.wantsPursue, wantsStrike: e.wantsStrike });
    }
    const tokens = arbitrate(contenders, { pursue, strike });
    pursue = tokens.pursue;
    strike = tokens.strike;

    // 4-6. FSM, strike resolution, give-up.
    const moves = new Map<string, CombatMove>();
    for (const id of ids) {
      const e = entries.get(id) as Entry;
      const o = obsById.get(id) as CombatNpcObs;
      const angry = isAngry(e.anger);
      const enteringFume = o.physics === 'animated' && angry && (e.fsm.state === 'routine' || e.fsm.state === 'down');
      const reactSec = enteringFume ? reactionDelaySec(e.rng) : 0;
      const routeDist = Math.hypot(o.routeX - o.x, o.routeZ - o.z);
      const r = stepCombatFsm(e.fsm, {
        dt,
        physics: o.physics,
        angry,
        calm: isCalm(e.anger),
        dist: dists.get(id) as number,
        playerTargetable: player.targetable === true,
        hasPursueToken: pursue.has(id),
        hasStrikeToken: strike.has(id),
        routeDist,
        reactSec,
      });
      e.fsm = r.state;
      e.wantsPursue = r.wantsPursue;
      e.wantsStrike = r.wantsStrike;
      moves.set(id, r.move);
      if (r.event !== 'none') events.push({ kind: r.event, id });

      if (r.event === 'strike') {
        metrics.strikes++;
        const landed =
          player.targetable === true &&
          strikeHits({ npcX: o.x, npcZ: o.z, npcYaw: o.yaw, targetX: player.x, targetZ: player.z });
        e.fsm = applyStrikeResult(e.fsm, landed);
        if (landed) {
          metrics.landed++;
          e.anger = satisfyAnger(e.anger);
          events.push({ kind: 'landed', id });
        } else {
          metrics.missed++;
          events.push({ kind: 'missed', id });
        }
      } else if (r.event === 'give-up') {
        metrics.giveUps++;
        e.anger = satisfyAnger(e.anger);
      } else if (r.event === 'interrupted') {
        metrics.interrupted++;
      }
    }

    // 7. Release tokens the FSM no longer wants, then build commands.
    const nextPursue = new Set<string>();
    const nextStrike = new Set<string>();
    for (const id of ids) {
      const e = entries.get(id) as Entry;
      if (pursue.has(id) && e.wantsPursue) nextPursue.add(id);
      if (strike.has(id) && e.wantsStrike && nextPursue.has(id)) nextStrike.add(id);
    }
    pursue = nextPursue;
    strike = nextStrike;
    metrics.maxPursuers = Math.max(metrics.maxPursuers, pursue.size);
    metrics.maxAttackers = Math.max(metrics.maxAttackers, strike.size);

    const commands: CombatCommand[] = [];
    for (const id of ids) {
      const e = entries.get(id) as Entry;
      const o = obsById.get(id) as CombatNpcObs;
      commands.push(buildCommand(id, e, o, moves.get(id) as CombatMove, dt, player, dists.get(id) as number));
    }
    return { commands, events };
  }

  function buildCommand(
    id: string,
    e: Entry,
    o: CombatNpcObs,
    move: CombatMove,
    dt: number,
    player: CombatPlayerObs,
    dist: number,
  ): CombatCommand {
    const sdt = Number.isFinite(dt) && dt > 0 ? dt : 0;
    const state = e.fsm.state;
    let stepX = 0;
    let stepZ = 0;

    const toPlayerX = player.x - o.x;
    const toPlayerZ = player.z - o.z;
    const centre = Math.hypot(toPlayerX, toPlayerZ);
    if (move === 'pursue' && Number.isFinite(centre) && centre > 1e-9 && Number.isFinite(dist)) {
      const len = Math.min(CHASE_SPEED * sdt, Math.max(0, dist - (ATTACK_START_DIST - PURSUE_STOP_MARGIN)));
      stepX = (toPlayerX / centre) * len;
      stepZ = (toPlayerZ / centre) * len;
    } else if (move === 'sidestep' && Number.isFinite(centre) && centre > 1e-9) {
      // Left-hand perpendicular of the direction (ux, uz) in the y-up world is (uz, -ux).
      const ux = toPlayerX / centre;
      const uz = toPlayerZ / centre;
      const len = SIDESTEP_SPEED * sdt * e.fsm.sidestepSign;
      stepX = uz * len;
      stepZ = -ux * len;
    } else if (move === 'return') {
      const rx = o.routeX - o.x;
      const rz = o.routeZ - o.z;
      const routeDist = Math.hypot(rx, rz);
      if (Number.isFinite(routeDist) && routeDist > 1e-9) {
        const len = Math.min(RETURN_SPEED * sdt, routeDist);
        stepX = (rx / routeDist) * len;
        stepZ = (rz / routeDist) * len;
      }
    }
    stepX = finiteOr0(stepX);
    stepZ = finiteOr0(stepZ);

    let faceX = o.x;
    let faceZ = o.z;
    if (state === 'fume' || state === 'pursue' || state === 'windup' || state === 'cooldown') {
      faceX = player.x;
      faceZ = player.z;
    } else if (state === 'return') {
      faceX = o.routeX;
      faceZ = o.routeZ;
    }

    let motion: CombatCommand['motion'] = null;
    if (state === 'fume') motion = 'emote-no';
    else if (state === 'pursue') motion = move === 'pursue' || move === 'sidestep' ? 'sprint' : 'idle';
    else if (state === 'windup') motion = 'attack-melee-right';
    else if (state === 'cooldown') motion = 'idle';
    else if (state === 'return') motion = 'walk';

    return {
      id,
      state,
      move,
      stepX,
      stepZ,
      faceX,
      faceZ,
      motion,
      angry: state === 'fume' || state === 'pursue' || state === 'windup' || state === 'cooldown',
      marker: state === 'windup',
      token: tokenOf(id),
      anger: e.anger.value,
    };
  }

  function reset(): void {
    for (const [id, e] of entries) entries.set(id, makeEntry(e.memberId, e.temper));
    pursue = new Set();
    strike = new Set();
    pending = [];
  }

  function snapshot(): CombatSnapshot {
    const ids = [...entries.keys()].sort(byId);
    return {
      ...metrics,
      pursuers: [...pursue].sort(byId),
      attackers: [...strike].sort(byId),
      npcs: ids.map((id) => {
        const e = entries.get(id) as Entry;
        return { id, memberId: e.memberId, temper: e.temper, state: e.fsm.state, anger: e.anger.value, token: tokenOf(id) };
      }),
    };
  }

  return { onSlapped, step, forget, reset, snapshot };
}

import { describe, expect, it } from 'vitest';
import {
  createCombatDirector,
  type CombatCommand,
  type CombatDirector,
  type CombatEvent,
  type CombatNpcObs,
  type CombatPlayerObs,
} from '../../src/logic/combatDirector';
import { CHASE_SPEED, RETURN_SPEED, SIDESTEP_SPEED } from '../../src/logic/combatFsm';
import { RAGDOLL_TIMEOUT_SEC, RECOVER_SEC } from '../../src/logic/getUpFsm';
import { ATTACK_START_DIST, edgeDistance, PLAYER_BODY_RADIUS } from '../../src/logic/strikeHit';
import type { Temper } from '../../src/logic/temper';

const DT = 1 / 60;
const RAGDOLL_STEPS = Math.round(RAGDOLL_TIMEOUT_SEC / DT);
const RECOVER_STEPS = Math.round(RECOVER_SEC / DT);

interface SimNpc {
  id: string;
  memberId: string;
  temper: Temper;
  x: number;
  z: number;
  yaw: number;
  routeX: number;
  routeZ: number;
  ragdollLeft: number;
  recoverLeft: number;
}

function npc(id: string, memberId: string, temper: Temper, x: number, z: number): SimNpc {
  return { id, memberId, temper, x, z, yaw: 0, routeX: x, routeZ: z, ragdollLeft: 0, recoverLeft: 0 };
}

function physicsOf(n: SimNpc): CombatNpcObs['physics'] {
  return n.ragdollLeft > 0 ? 'ragdoll' : n.recoverLeft > 0 ? 'recover' : 'animated';
}

function obsOf(n: SimNpc): CombatNpcObs {
  return {
    id: n.id,
    memberId: n.memberId,
    temper: n.temper,
    x: n.x,
    z: n.z,
    yaw: n.yaw,
    physics: physicsOf(n),
    routeX: n.routeX,
    routeZ: n.routeZ,
  };
}

function slap(d: CombatDirector, n: SimNpc, ragdollSteps = RAGDOLL_STEPS, recoverSteps = RECOVER_STEPS): void {
  d.onSlapped(n.id, n.memberId, n.temper);
  n.ragdollLeft = ragdollSteps;
  n.recoverLeft = recoverSteps;
}

/** One director step with the given NPCs, then movement and physics timers applied like the game would. */
function tick(d: CombatDirector, npcs: SimNpc[], player: CombatPlayerObs) {
  const r = d.step(DT, npcs.map(obsOf), player);
  for (const n of npcs) {
    const c = r.commands.find((k) => k.id === n.id);
    if (c) {
      n.x += c.stepX;
      n.z += c.stepZ;
      const fx = c.faceX - n.x;
      const fz = c.faceZ - n.z;
      if (Math.hypot(fx, fz) > 1e-9) n.yaw = Math.atan2(fx, fz);
    }
    if (n.ragdollLeft > 0) n.ragdollLeft--;
    else if (n.recoverLeft > 0) n.recoverLeft--;
  }
  return r;
}

function cmdOf(r: { commands: CombatCommand[] }, id: string): CombatCommand {
  const c = r.commands.find((k) => k.id === id);
  if (!c) throw new Error(`no command for ${id}`);
  return c;
}

function kinds(events: CombatEvent[], id: string): string[] {
  return events.filter((e) => e.id === id).map((e) => e.kind);
}

interface Logged {
  step: number;
  cmd: CombatCommand;
  events: string[];
  player: CombatPlayerObs;
  npcX: number;
  npcZ: number;
}

function edgeOf(l: { npcX: number; npcZ: number; player: CombatPlayerObs }): number {
  return edgeDistance(l.npcX, l.npcZ, l.player.x, l.player.z, PLAYER_BODY_RADIUS);
}

describe('createCombatDirector basics', () => {
  it('an unslapped NPC stays on its route (walker, zero step, no token)', () => {
    const d = createCombatDirector({ seed: 1, fight: null });
    const n = npc('n0', 'm1', 'hot', 0, 0);
    for (let i = 0; i < 120; i++) {
      const r = tick(d, [n], { x: 1, z: 1, targetable: true });
      const c = cmdOf(r, 'n0');
      expect(c).toMatchObject({ state: 'routine', move: 'walker', stepX: 0, stepZ: 0, motion: null, angry: false, marker: false, token: null, anger: 0 });
    }
  });

  it("onSlapped records a 'slapped' event on the next step", () => {
    const d = createCombatDirector({ seed: 1, fight: null });
    const n = npc('n0', 'm1', 'normal', 0, 0);
    d.onSlapped('n0', 'm1', 'normal');
    const r = d.step(DT, [obsOf(n)], { x: 5, z: 5, targetable: true });
    expect(kinds(r.events, 'n0')).toContain('slapped');
    const r2 = d.step(DT, [obsOf(n)], { x: 5, z: 5, targetable: true });
    expect(kinds(r2.events, 'n0')).not.toContain('slapped');
  });

  it("fight 'always' makes one slap enough (hot, no jitter)", () => {
    for (const temper of ['calm', 'normal', 'hot'] as const) {
      const d = createCombatDirector({ seed: 7, fight: 'always' });
      d.onSlapped('n0', 'm1', temper);
      expect(d.snapshot().npcs[0].anger).toBe(100);
    }
  });

  it('slapping one NPC never changes another NPC (no anger from witnessing)', () => {
    const d = createCombatDirector({ seed: 3, fight: null });
    const a = npc('n0', 'm1', 'hot', 0, 0);
    const b = npc('n1', 'm2', 'hot', 1, 0);
    slap(d, a);
    for (let i = 0; i < 400; i++) tick(d, [a, b], { x: 0, z: 3, targetable: true });
    const snap = d.snapshot();
    const nb = snap.npcs.find((k) => k.id === 'n1');
    expect(nb?.anger).toBe(0);
    expect(nb?.state).toBe('routine');
  });
});

describe('two slaps for a normal NPC (D-05, anger decay held while down)', () => {
  it('first slap then stand 1.5 s -> routine; second slap -> fume on standing, seeds 0..99', () => {
    for (let seed = 0; seed < 100; seed++) {
      const d = createCombatDirector({ seed, fight: null });
      const n = npc('n0', 'm1', 'normal', 0, 0);
      const player = { x: 0, z: 20, targetable: true };
      slap(d, n);
      let last: CombatCommand | null = null;
      for (let i = 0; i < RAGDOLL_STEPS + RECOVER_STEPS + 90; i++) last = cmdOf(tick(d, [n], player), 'n0');
      expect(last?.state).toBe('routine');
      expect(last?.angry).toBe(false);
      slap(d, n);
      for (let i = 0; i < RAGDOLL_STEPS + RECOVER_STEPS; i++) {
        const c = cmdOf(tick(d, [n], player), 'n0');
        expect(c.state).toBe('down');
      }
      const stand = cmdOf(tick(d, [n], player), 'n0');
      expect(stand.state).toBe('fume');
      expect(stand.angry).toBe(true);
    }
  });
});

describe('scenario: hot NPC 8 m away (D-05, D-07, D-08, G9)', () => {
  function runScenario(opts: { dodge: boolean; steps: number }) {
    const d = createCombatDirector({ seed: 42, fight: null });
    const n = npc('n0', 'm1', 'hot', 0, 0);
    const player = { x: 0, z: 8 + PLAYER_BODY_RADIUS, targetable: true };
    slap(d, n, 180, 27);
    const log: Logged[] = [];
    let windupStep = -1;
    for (let step = 0; step < opts.steps; step++) {
      if (opts.dodge && windupStep >= 0 && step > windupStep && step <= windupStep + 36) player.z += 3.2 * DT;
      const npcX = n.x;
      const npcZ = n.z;
      const r = tick(d, [n], player);
      const cmd = cmdOf(r, 'n0');
      const ev = kinds(r.events, 'n0');
      if (ev.includes('windup') && windupStep < 0) windupStep = step;
      log.push({ step, cmd, events: ev, player: { ...player }, npcX, npcZ });
    }
    return { d, log, n };
  }

  const stepOf = (log: Logged[], kind: string, from = 0) => log.findIndex((l, i) => i >= from && l.events.includes(kind));

  it('down while ragdoll + recover, fumes 0.2-0.5 s, pursues, winds up once, lands, returns to routine', () => {
    const { log, d } = runScenario({ dodge: false, steps: 1400 });
    for (let i = 0; i < 207; i++) {
      expect(log[i].cmd.state).toBe('down');
      expect(log[i].cmd.stepX).toBe(0);
      expect(log[i].cmd.stepZ).toBe(0);
    }
    const fume = stepOf(log, 'fume');
    expect(fume).toBe(207);
    expect(log[fume].cmd.motion).toBe('emote-no');
    expect(log[fume].cmd.angry).toBe(true);
    const pursue = stepOf(log, 'pursue');
    // Seeded reaction 0.2-0.5 s, plus the one-step token arbitration lag and the transition step.
    expect((pursue - fume) * DT).toBeGreaterThanOrEqual(0.2);
    expect((pursue - fume) * DT).toBeLessThanOrEqual(0.5 + 2 * DT + 1e-9);
    for (let i = fume; i < pursue; i++) {
      expect(log[i].cmd.state).toBe('fume');
      expect(log[i].cmd.stepX).toBe(0);
      expect(log[i].cmd.stepZ).toBe(0);
    }
    expect(log[pursue].cmd.token).toBe('pursue');
    expect(log[pursue].cmd.motion).toBe('sprint');

    const windups = log.filter((l) => l.events.includes('windup'));
    expect(windups).toHaveLength(1);
    const windup = windups[0].step;
    expect(edgeOf(log[windup])).toBeLessThanOrEqual(ATTACK_START_DIST + 1e-6);
    expect(edgeOf(log[windup])).toBeGreaterThanOrEqual(ATTACK_START_DIST - 0.05 - 1e-6);
    for (let i = pursue; i < windup; i++) {
      const len = Math.hypot(log[i].cmd.stepX, log[i].cmd.stepZ);
      expect(len).toBeLessThanOrEqual(CHASE_SPEED * DT + 1e-9);
    }
    for (let i = windup; i < windup + 36; i++) {
      expect(log[i].cmd.state).toBe('windup');
      expect(log[i].cmd.marker).toBe(true);
      expect(log[i].cmd.motion).toBe('attack-melee-right');
      expect(log[i].cmd.token).toBe('strike');
      expect(log[i].cmd.stepX).toBe(0);
    }
    const strike = stepOf(log, 'strike');
    expect(strike - windup).toBe(36);
    expect(log[strike].events).toContain('landed');
    expect(log.some((l) => l.events.includes('missed'))).toBe(false);
    expect(log[strike].cmd.state).toBe('cooldown');
    expect(log[strike].cmd.marker).toBe(false);
    expect(log[strike].cmd.anger).toBe(0);

    const giveUp = stepOf(log, 'give-up');
    expect(giveUp - strike).toBe(90);
    expect(log[giveUp].cmd.state).toBe('return');
    expect(log[giveUp].cmd.motion).toBe('walk');
    expect(log[giveUp].cmd.angry).toBe(false);
    const resume = stepOf(log, 'resume', giveUp);
    expect(resume).toBeGreaterThan(giveUp);
    for (let i = giveUp; i < resume; i++) {
      const routeDist = Math.hypot(log[i].npcX, log[i].npcZ);
      expect(Math.hypot(log[i].cmd.stepX, log[i].cmd.stepZ)).toBeLessThanOrEqual(Math.min(RETURN_SPEED * DT, routeDist) + 1e-9);
    }
    expect(Math.hypot(log[resume].npcX, log[resume].npcZ)).toBeLessThanOrEqual(0.5 + 1e-6);
    expect(log[resume].cmd.state).toBe('routine');
    expect(log[resume].cmd.move).toBe('walker');
    expect(log[log.length - 1].cmd.state).toBe('routine');

    const snap = d.snapshot();
    expect(snap.strikes).toBe(1);
    expect(snap.landed).toBe(1);
    expect(snap.missed).toBe(0);
    expect(snap.giveUps).toBe(1);
    expect(snap.strikes).toBe(snap.landed + snap.missed);
    expect(snap.maxPursuers).toBe(1);
    expect(snap.maxAttackers).toBe(1);
  });

  it('dodge: walking away at 3.2 m/s during the wind-up misses, then pursues again after the cooldown', () => {
    const { log, d } = runScenario({ dodge: true, steps: 700 });
    const windup = stepOf(log, 'windup');
    const strike = stepOf(log, 'strike');
    expect(strike - windup).toBe(36);
    expect(log[strike].events).toContain('missed');
    expect(log[strike].events).not.toContain('landed');
    const again = stepOf(log, 'pursue', strike);
    expect(again - strike).toBe(90);
    expect(log[again].cmd.state).toBe('pursue');
    expect(d.snapshot().missed).toBeGreaterThanOrEqual(1);
    const snap = d.snapshot();
    expect(snap.strikes).toBe(snap.landed + snap.missed);
  });
});

describe('interrupt: counter-slap during the wind-up (D-08)', () => {
  it("cancels the strike, releases tokens within one step and adds anger", () => {
    const d = createCombatDirector({ seed: 9, fight: null });
    const n = npc('n0', 'm1', 'hot', 0, 0);
    const player = { x: 0, z: 3 + PLAYER_BODY_RADIUS, targetable: false };
    slap(d, n, 60, 27);
    let step = 0;
    // Hold at reach while the player is not targetable until the anger starts to cool (below 100).
    while (step < 2000 && !(d.snapshot().npcs[0].anger < 100)) {
      tick(d, [n], player);
      step++;
    }
    expect(d.snapshot().npcs[0].anger).toBeLessThan(100);
    expect(d.snapshot().npcs[0].state).toBe('pursue');
    player.targetable = true;
    let windupSeen = -1;
    for (let i = 0; i < 10 && windupSeen < 0; i++) {
      const r = tick(d, [n], player);
      if (kinds(r.events, 'n0').includes('windup')) windupSeen = i;
    }
    expect(windupSeen).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < 18; i++) {
      const r = tick(d, [n], player);
      expect(cmdOf(r, 'n0').state).toBe('windup');
    }
    const before = d.snapshot().npcs[0].anger;
    slap(d, n, 60, 27);
    const after = d.snapshot().npcs[0].anger;
    expect(after).toBeGreaterThan(before);
    const r = tick(d, [n], player);
    expect(kinds(r.events, 'n0')).toContain('interrupted');
    expect(cmdOf(r, 'n0').state).toBe('down');
    const r2 = tick(d, [n], player);
    expect(cmdOf(r2, 'n0').token).toBeNull();
    expect(d.snapshot().pursuers).toEqual([]);
    expect(d.snapshot().attackers).toEqual([]);
    let strikes = 0;
    for (let i = 0; i < 86; i++) {
      const rr = tick(d, [n], player);
      if (kinds(rr.events, 'n0').includes('strike')) strikes++;
    }
    expect(strikes).toBe(0);
    expect(d.snapshot().interrupted).toBe(1);
    expect(d.snapshot().strikes).toBe(0);
  });
});

describe('tokens with 15 angry NPCs (D-07, RESEARCH M3)', () => {
  it('at most 3 pursuers and 1 wind-up; everyone else fumes in place', () => {
    const d = createCombatDirector({ seed: 11, fight: 'always' });
    const npcs: SimNpc[] = [];
    for (let i = 0; i < 15; i++) {
      const a = (i / 15) * Math.PI * 2;
      npcs.push(npc(`n${String(i).padStart(2, '0')}`, `m${i + 1}`, 'calm', 6 * Math.sin(a), 6 * Math.cos(a)));
    }
    for (const n of npcs) d.onSlapped(n.id, n.memberId, n.temper);
    const player = { x: 0, z: 0, targetable: true };
    let maxFumeWaiting = 0;
    let strikes = 0;
    for (let step = 0; step < 600; step++) {
      const r = tick(d, npcs, player);
      expect(r.commands).toHaveLength(15);
      const holders = r.commands.filter((c) => c.token !== null);
      expect(holders.length).toBeLessThanOrEqual(3);
      expect(r.commands.filter((c) => c.state === 'windup').length).toBeLessThanOrEqual(1);
      expect(r.commands.filter((c) => c.token === 'strike').length).toBeLessThanOrEqual(1);
      let waiting = 0;
      for (const c of r.commands) {
        if (c.token === null && (c.state === 'fume' || c.state === 'pursue' || c.state === 'windup' || c.state === 'cooldown')) {
          expect(c.state).toBe('fume');
          expect(c.stepX).toBe(0);
          expect(c.stepZ).toBe(0);
          waiting++;
        }
      }
      maxFumeWaiting = Math.max(maxFumeWaiting, waiting);
      strikes += r.events.filter((e) => e.kind === 'strike').length;
    }
    expect(maxFumeWaiting).toBeGreaterThanOrEqual(12);
    expect(strikes).toBeGreaterThan(0);
    const snap = d.snapshot();
    expect(snap.maxPursuers).toBe(3);
    expect(snap.maxAttackers).toBe(1);
    expect(snap.strikes).toBe(snap.landed + snap.missed);
  });

  it('commands and events do not depend on observation order', () => {
    function run(reverse: boolean) {
      const d = createCombatDirector({ seed: 5, fight: null });
      const npcs = [npc('a', 'm1', 'hot', 0, 4), npc('b', 'm2', 'hot', 4, 0), npc('c', 'm3', 'normal', -4, 0), npc('d', 'm4', 'hot', 0, -4)];
      const out: unknown[] = [];
      for (let step = 0; step < 500; step++) {
        if (step === 0) for (const n of npcs) slap(d, n, 30, 27);
        const order = reverse ? [...npcs].reverse() : npcs;
        const r = tick(d, order, { x: 0, z: 0, targetable: true });
        out.push(r.commands, r.events);
      }
      return out;
    }
    expect(run(true)).toEqual(run(false));
  });
});

describe('invulnerable player (D-06, D-09)', () => {
  it('no wind-up while the player is not targetable; pursuers hold at about 1.0 m', () => {
    const d = createCombatDirector({ seed: 2, fight: 'always' });
    const npcs = [npc('n0', 'm1', 'hot', 0, 5), npc('n1', 'm2', 'hot', 5, 0), npc('n2', 'm3', 'hot', -5, 0)];
    for (const n of npcs) d.onSlapped(n.id, n.memberId, n.temper);
    const player = { x: 0, z: 0, targetable: false };
    let windups = 0;
    for (let step = 0; step < 300; step++) {
      const r = tick(d, npcs, player);
      windups += r.events.filter((e) => e.kind === 'windup' || e.kind === 'strike').length;
    }
    expect(windups).toBe(0);
    for (const n of npcs) {
      const edge = edgeDistance(n.x, n.z, player.x, player.z, PLAYER_BODY_RADIUS);
      expect(edge).toBeGreaterThanOrEqual(ATTACK_START_DIST - 0.05 - 1e-6);
      expect(edge).toBeLessThanOrEqual(ATTACK_START_DIST + 1e-6);
    }
    expect(d.snapshot().npcs.every((k) => k.state === 'pursue')).toBe(true);
  });
});

describe('command geometry', () => {
  it('sidestep is perpendicular, left-hand for sign +1, at SIDESTEP_SPEED', () => {
    const d = createCombatDirector({ seed: 4, fight: 'always' });
    const n = npc('n0', 'm1', 'hot', 0, 0);
    d.onSlapped('n0', 'm1', 'hot');
    const player = { x: 0, z: 5 + PLAYER_BODY_RADIUS, targetable: true };
    let side: CombatCommand | null = null;
    // Positions are never integrated here, so the pursuer makes no progress and gets stuck.
    for (let i = 0; i < 200 && !side; i++) {
      const c = cmdOf(d.step(DT, [obsOf(n)], player), 'n0');
      if (c.move === 'sidestep') side = c;
    }
    expect(side).not.toBeNull();
    expect(side?.stepX).toBeCloseTo(SIDESTEP_SPEED * DT, 9);
    expect(side?.stepZ).toBeCloseTo(0, 9);
    expect(side?.motion).toBe('sprint');
    expect(side?.faceX).toBe(player.x);
    expect(side?.faceZ).toBe(player.z);
  });

  it('non-finite positions never produce non-finite commands', () => {
    const d = createCombatDirector({ seed: 4, fight: 'always' });
    d.onSlapped('n0', 'm1', 'hot');
    for (let i = 0; i < 200; i++) {
      const r = d.step(DT, [{ id: 'n0', memberId: 'm1', temper: 'hot', x: NaN, z: 0, yaw: 0, physics: 'animated', routeX: 0, routeZ: 0 }], { x: 0, z: 1, targetable: true });
      for (const c of r.commands) {
        expect(Number.isFinite(c.stepX)).toBe(true);
        expect(Number.isFinite(c.stepZ)).toBe(true);
      }
    }
  });
});

describe('forget / reset / rebind', () => {
  it('forget(id) removes the NPC from the snapshot and the holdings', () => {
    const d = createCombatDirector({ seed: 1, fight: 'always' });
    const n = npc('n0', 'm1', 'hot', 0, 3);
    d.onSlapped('n0', 'm1', 'hot');
    for (let i = 0; i < 60; i++) tick(d, [n], { x: 0, z: 0, targetable: true });
    expect(d.snapshot().pursuers).toEqual(['n0']);
    d.forget('n0');
    const snap = d.snapshot();
    expect(snap.npcs).toEqual([]);
    expect(snap.pursuers).toEqual([]);
    expect(snap.attackers).toEqual([]);
  });

  it('an id missing from the observations is forgotten', () => {
    const d = createCombatDirector({ seed: 1, fight: 'always' });
    const a = npc('n0', 'm1', 'hot', 0, 3);
    const b = npc('n1', 'm2', 'hot', 3, 0);
    tick(d, [a, b], { x: 0, z: 0, targetable: true });
    tick(d, [b], { x: 0, z: 0, targetable: true });
    expect(d.snapshot().npcs.map((k) => k.id)).toEqual(['n1']);
  });

  it('reset() puts every NPC back in routine with anger 0 and empty holdings, metrics kept', () => {
    const d = createCombatDirector({ seed: 1, fight: 'always' });
    const npcs = [npc('n0', 'm1', 'hot', 0, 3), npc('n1', 'm2', 'hot', 3, 0)];
    for (const n of npcs) d.onSlapped(n.id, n.memberId, n.temper);
    for (let i = 0; i < 200; i++) tick(d, npcs, { x: 0, z: 0, targetable: true });
    const before = d.snapshot();
    expect(before.strikes).toBeGreaterThan(0);
    d.reset();
    const snap = d.snapshot();
    expect(snap.pursuers).toEqual([]);
    expect(snap.attackers).toEqual([]);
    for (const k of snap.npcs) {
      expect(k.state).toBe('routine');
      expect(k.anger).toBe(0);
      expect(k.token).toBeNull();
    }
    expect(snap.strikes).toBe(before.strikes);
    expect(snap.maxPursuers).toBe(before.maxPursuers);
  });

  it('a slot rebound to another member starts fresh', () => {
    const d = createCombatDirector({ seed: 1, fight: 'always' });
    const n = npc('n0', 'm1', 'hot', 0, 3);
    d.onSlapped('n0', 'm1', 'hot');
    tick(d, [n], { x: 0, z: 0, targetable: true });
    expect(d.snapshot().npcs[0].anger).toBe(100);
    n.memberId = 'm7';
    const r = tick(d, [n], { x: 0, z: 0, targetable: true });
    expect(cmdOf(r, 'n0').state).toBe('routine');
    expect(d.snapshot().npcs[0]).toMatchObject({ memberId: 'm7', anger: 0, state: 'routine' });
  });
});

describe('per-member streams (RESEARCH Pitfall 7)', () => {
  it('adding NPCs or reordering them does not change the anger rolls of a member', () => {
    function angerTrace(extra: boolean, reverse: boolean): number[] {
      const d = createCombatDirector({ seed: 99, fight: null });
      const main = npc('n3', 'm1', 'calm', 0, 0);
      const others = extra ? [npc('n0', 'm4', 'calm', 2, 0), npc('n1', 'm5', 'normal', 4, 0), npc('n2', 'm6', 'calm', 6, 0)] : [];
      const all = reverse ? [...others, main].reverse() : [main, ...others];
      const out: number[] = [];
      const player = { x: 0, z: 30, targetable: true };
      for (let k = 0; k < 3; k++) {
        for (const o of others) slap(d, o, 10, 5);
        slap(d, main, 10, 5);
        out.push(d.snapshot().npcs.find((x) => x.id === 'n3')?.anger ?? -1);
        for (let i = 0; i < 20; i++) tick(d, all, player);
      }
      return out;
    }
    const alone = angerTrace(false, false);
    expect(angerTrace(true, false)).toEqual(alone);
    expect(angerTrace(true, true)).toEqual(alone);
  });
});

describe('commands for idle states', () => {
  it('routine and down commands face the current position with no motion', () => {
    const d = createCombatDirector({ seed: 1, fight: null });
    const n = npc('n0', 'm1', 'hot', 2, 3);
    const r = d.step(DT, [obsOf(n)], { x: 0, z: 0, targetable: true });
    expect(cmdOf(r, 'n0')).toMatchObject({ faceX: 2, faceZ: 3, motion: null, marker: false });
    slap(d, n);
    const r2 = d.step(DT, [obsOf(n)], { x: 0, z: 0, targetable: true });
    expect(cmdOf(r2, 'n0')).toMatchObject({ state: 'down', faceX: 2, faceZ: 3, motion: null, stepX: 0, stepZ: 0 });
  });
});

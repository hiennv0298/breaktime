/**
 * NPC-06 determinism: a scripted 600-step fight (6 NPCs, tempers hot / normal / calm x 2, a moving player with a
 * knocked-down window, fixed slap steps, scripted ragdoll / recover windows, positions integrated from the commands)
 * must give the same trace for the same seed and a different trace for seed + 1. Token invariants (D-07) are checked
 * at every step of every run.
 */
import { describe, expect, it } from 'vitest';
import { createCombatDirector, type CombatNpcObs } from '../../src/logic/combatDirector';
import type { Temper } from '../../src/logic/temper';

const DT = 1 / 60;
const STEPS = 600;
const RAGDOLL_STEPS = 60;
const RECOVER_STEPS = 27;
const SEED = 20260916;

type TraceRow = [number, string, string, string, number, string | null];

interface Sim {
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

const TEMPERS: Temper[] = ['hot', 'normal', 'calm', 'hot', 'normal', 'calm'];

/** step -> NPC indices slapped at that step (hot 1 slap, normal 2, calm 3; a counter-slap on n0 at 350). */
const SLAPS: Record<number, number[]> = {
  10: [0],
  20: [1],
  30: [2],
  40: [3],
  50: [4],
  60: [5],
  120: [2],
  130: [1],
  150: [5],
  160: [4],
  210: [2],
  240: [5],
  350: [0],
};

function playerAt(step: number): { x: number; z: number; targetable: boolean } {
  return {
    x: 3 * Math.sin(step / 120),
    z: 2 * Math.cos(step / 90),
    // Scripted knockdown + invulnerability window.
    targetable: !(step >= 250 && step < 400),
  };
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function runFight(seed: number, fight: 'always' | null) {
  const d = createCombatDirector({ seed, fight });
  const sims: Sim[] = TEMPERS.map((temper, i) => {
    const a = (i / TEMPERS.length) * Math.PI * 2;
    const x = 5 * Math.sin(a);
    const z = 5 * Math.cos(a);
    return { id: `n${i}`, memberId: `m${i + 1}`, temper, x, z, yaw: 0, routeX: x, routeZ: z, ragdollLeft: 0, recoverLeft: 0 };
  });
  const trace: TraceRow[] = [];
  const firstSlapAnger: number[] = [];
  const slapped = new Set<number>();
  let maxHolders = 0;
  let maxWindup = 0;
  let violations = 0;

  for (let step = 0; step < STEPS; step++) {
    for (const idx of SLAPS[step] ?? []) {
      const s = sims[idx];
      d.onSlapped(s.id, s.memberId, s.temper);
      if (!slapped.has(idx)) {
        slapped.add(idx);
        firstSlapAnger.push(d.snapshot().npcs.find((k) => k.id === s.id)?.anger ?? -1);
      }
      s.ragdollLeft = RAGDOLL_STEPS;
      s.recoverLeft = RECOVER_STEPS;
    }
    const player = playerAt(step);
    const obs: CombatNpcObs[] = sims.map((s) => ({
      id: s.id,
      memberId: s.memberId,
      temper: s.temper,
      x: s.x,
      z: s.z,
      yaw: s.yaw,
      physics: s.ragdollLeft > 0 ? 'ragdoll' : s.recoverLeft > 0 ? 'recover' : 'animated',
      routeX: s.routeX,
      routeZ: s.routeZ,
    }));
    const r = d.step(DT, obs, player);

    const holders = r.commands.filter((c) => c.token !== null).length;
    const windups = r.commands.filter((c) => c.state === 'windup').length;
    maxHolders = Math.max(maxHolders, holders);
    maxWindup = Math.max(maxWindup, windups);
    if (holders > 3 || windups > 1) violations++;

    for (const c of r.commands) {
      const ev = r.events.filter((e) => e.id === c.id).map((e) => e.kind);
      trace.push([step, c.id, c.state, ev.length ? ev.join(',') : 'none', round3(c.anger), c.token]);
      const s = sims.find((k) => k.id === c.id);
      if (!s) continue;
      s.x += c.stepX;
      s.z += c.stepZ;
      const fx = c.faceX - s.x;
      const fz = c.faceZ - s.z;
      if (Math.hypot(fx, fz) > 1e-9) s.yaw = Math.atan2(fx, fz);
    }
    for (const s of sims) {
      if (s.ragdollLeft > 0) s.ragdollLeft--;
      else if (s.recoverLeft > 0) s.recoverLeft--;
    }
  }
  return { trace, snapshot: d.snapshot(), firstSlapAnger, maxHolders, maxWindup, violations };
}

describe('combat determinism (NPC-06)', () => {
  const a = runFight(SEED, null);
  const b = runFight(SEED, null);
  const c = runFight(SEED + 1, null);
  const always = runFight(SEED, 'always');

  it('runs 600 steps for 6 NPCs', () => {
    expect(a.trace).toHaveLength(STEPS * 6);
    expect(a.trace[a.trace.length - 1][0]).toBe(STEPS - 1);
  });

  it('the same seed gives a deep-equal trace', () => {
    expect(b.trace).toEqual(a.trace);
    expect(b.snapshot).toEqual(a.snapshot);
  });

  it('seed + 1 changes the trace', () => {
    expect(c.trace).not.toEqual(a.trace);
    const differs = a.trace.some((row, i) => JSON.stringify(row) !== JSON.stringify(c.trace[i]));
    expect(differs).toBe(true);
  });

  it('the scripted fight actually fights (fume, pursue, wind-up, strike)', () => {
    const states = new Set(a.trace.map((r) => r[2]));
    expect(states.has('fume')).toBe(true);
    expect(states.has('pursue')).toBe(true);
    expect(states.has('windup')).toBe(true);
    expect(a.snapshot.strikes).toBeGreaterThan(0);
    expect(a.snapshot.strikes).toBe(a.snapshot.landed + a.snapshot.missed);
  });

  it("fight 'always' makes every slapped NPC angry after one slap", () => {
    expect(always.firstSlapAnger).toHaveLength(6);
    for (const v of always.firstSlapAnger) expect(v).toBeGreaterThanOrEqual(100);
    expect(a.firstSlapAnger.filter((v) => v >= 100)).toHaveLength(2);
  });

  it('pursuers <= 3 and wind-ups <= 1 at every step of every run', () => {
    for (const run of [a, b, c, always]) {
      expect(run.violations).toBe(0);
      expect(run.maxHolders).toBeLessThanOrEqual(3);
      expect(run.maxWindup).toBeLessThanOrEqual(1);
      expect(run.snapshot.maxPursuers).toBeLessThanOrEqual(3);
      expect(run.snapshot.maxAttackers).toBeLessThanOrEqual(1);
    }
  });
});

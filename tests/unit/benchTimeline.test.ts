import { describe, expect, it } from 'vitest';
import {
  benchFromQuery,
  buildTimeline,
  parseBenchDuration,
  soakFromQuery,
  soakOptionsFromQuery,
  type BenchAction,
} from '../../src/logic/benchTimeline';

/*
 * Plan 01-17 (D-08, D-11 revised, D-29): the ?bench=1 scenario is pure data driven by the simulation-step index, so a
 * run with the same parameters replays the same events and a short &dur= keeps the order of events.
 */

const WAYPOINTS = [
  { x: 0, z: 2 },
  { x: -6.2, z: -1.4 },
  { x: -6.2, z: -3.9 },
  { x: -3, z: -4.5 },
  { x: 3.6, z: -3.9 },
  { x: 6.2, z: 1 },
  { x: 3, z: 3.9 },
  { x: 4.85, z: 3.9 },
  { x: -2, z: 0.2 },
];

const SEED = 20260914;

function timeline(durationSec: number, seed = SEED): BenchAction[] {
  return buildTimeline({ durationSec, seed, waypoints: WAYPOINTS });
}

function stepsOf(t: BenchAction[], kind: BenchAction['kind']): number[] {
  return t.filter((a) => a.kind === kind).map((a) => a.step);
}

describe('buildTimeline determinism', () => {
  it('same options twice give deep-equal timelines', () => {
    expect(timeline(60)).toEqual(timeline(60));
    expect(timeline(8)).toEqual(timeline(8));
  });

  it('a different seed changes at least one walkTo target or step', () => {
    const a = timeline(60, SEED).filter((x) => x.kind === 'walkTo');
    const b = timeline(60, 1).filter((x) => x.kind === 'walkTo');
    expect(a).not.toEqual(b);
  });

  it('does not mutate the waypoint list it was given', () => {
    const copy = WAYPOINTS.map((p) => ({ ...p }));
    timeline(60);
    expect(WAYPOINTS).toEqual(copy);
  });

  it('walkTo targets are always points of the given waypoint list', () => {
    for (const a of timeline(60)) {
      if (a.kind !== 'walkTo') continue;
      expect(WAYPOINTS.some((p) => p.x === a.x && p.z === a.z)).toBe(true);
    }
  });
});

describe('buildTimeline shape', () => {
  it('60 s at 60 Hz ends with { kind end, step 3600 }', () => {
    const t = timeline(60);
    expect(t[t.length - 1]).toEqual({ step: 3600, kind: 'end' });
    expect(t.filter((a) => a.kind === 'end')).toHaveLength(1);
  });

  it('8 s ends at step 480', () => {
    const t = timeline(8);
    expect(t[t.length - 1]).toEqual({ step: 480, kind: 'end' });
  });

  it('stepHz scales the step numbers', () => {
    const t = buildTimeline({ durationSec: 10, stepHz: 30, seed: SEED, waypoints: WAYPOINTS });
    expect(t[t.length - 1]).toEqual({ step: 300, kind: 'end' });
  });

  for (const dur of [60, 8, 5]) {
    it(`${dur} s: integer non-decreasing steps, one massRagdoll, >= 1 smash after it, >= 3 slaps before it`, () => {
      const t = timeline(dur);
      let prev = -1;
      for (const a of t) {
        expect(Number.isInteger(a.step)).toBe(true);
        expect(a.step).toBeGreaterThanOrEqual(0);
        expect(a.step).toBeGreaterThanOrEqual(prev);
        prev = a.step;
      }
      const mass = stepsOf(t, 'massRagdoll');
      expect(mass).toHaveLength(1);
      const smash = stepsOf(t, 'smash');
      expect(smash.length).toBeGreaterThanOrEqual(1);
      for (const s of smash) expect(s).toBeGreaterThan(mass[0]);
      const slapsBefore = stepsOf(t, 'slapNearest').filter((s) => s < mass[0]);
      expect(slapsBefore.length).toBeGreaterThanOrEqual(3);
      expect(stepsOf(t, 'walkTo').length).toBeGreaterThanOrEqual(3);
    });
  }

  for (const dur of [60, 8]) {
    it(`${dur} s: massRagdoll in 55-70 % and smash in 70-85 % of the duration`, () => {
      const t = timeline(dur);
      const total = dur * 60;
      const mass = stepsOf(t, 'massRagdoll')[0];
      expect(mass / total).toBeGreaterThanOrEqual(0.55);
      expect(mass / total).toBeLessThanOrEqual(0.7);
      for (const s of stepsOf(t, 'smash')) {
        expect(s / total).toBeGreaterThanOrEqual(0.7);
        expect(s / total).toBeLessThanOrEqual(0.85);
      }
    });
  }

  it('the order of event kinds is the same at 60 s and 8 s apart from the number of walk/slap repeats', () => {
    const squash = (t: BenchAction[]) =>
      t
        .map((a) => (a.kind === 'walkTo' || a.kind === 'slapNearest' ? 'roam' : a.kind))
        .filter((k, i, arr) => i === 0 || k !== arr[i - 1]);
    expect(squash(timeline(8))).toEqual(squash(timeline(60)));
  });

  it('slaps are at least 0.5 s apart, so the 350 ms swing cooldown never drops one', () => {
    for (const dur of [60, 8, 5]) {
      const s = stepsOf(timeline(dur), 'slapNearest');
      for (let i = 1; i < s.length; i++) expect(s[i] - s[i - 1]).toBeGreaterThanOrEqual(30);
    }
  });

  it('rejects a non-finite or non-positive duration', () => {
    expect(() => buildTimeline({ durationSec: 0, seed: SEED, waypoints: WAYPOINTS })).toThrow();
    expect(() => buildTimeline({ durationSec: Number.NaN, seed: SEED, waypoints: WAYPOINTS })).toThrow();
  });

  it('an empty waypoint list still gives slaps, mass ragdoll, smash and end (no walkTo)', () => {
    const t = buildTimeline({ durationSec: 8, seed: SEED, waypoints: [] });
    expect(stepsOf(t, 'walkTo')).toHaveLength(0);
    expect(stepsOf(t, 'massRagdoll')).toHaveLength(1);
    expect(t[t.length - 1].kind).toBe('end');
  });
});

describe('parseBenchDuration (T-01-17-01)', () => {
  it('absent or malformed values give the 60 s default', () => {
    for (const raw of [null, undefined, '', 'abc', '8.5', '1e3', '0x10', ' ', '+8', '99999999']) {
      expect(parseBenchDuration(raw)).toBe(60);
    }
  });

  it('integers are clamped to 5..60', () => {
    expect(parseBenchDuration('8')).toBe(8);
    expect(parseBenchDuration(' 30 ')).toBe(30);
    expect(parseBenchDuration('1')).toBe(5);
    expect(parseBenchDuration('0')).toBe(5);
    expect(parseBenchDuration('-4')).toBe(5);
    expect(parseBenchDuration('600')).toBe(60);
  });
});

describe('benchFromQuery', () => {
  it('only bench=1 turns the bench on', () => {
    expect(benchFromQuery('?bench=1&dur=8')).toBe(true);
    expect(benchFromQuery('?bench=true')).toBe(false);
    expect(benchFromQuery('?bench=0')).toBe(false);
    expect(benchFromQuery('')).toBe(false);
  });
});

describe('soak query (plan 01-18, T-01-18-05)', () => {
  it('only soak=1 turns the soak on', () => {
    expect(soakFromQuery('?soak=1')).toBe(true);
    expect(soakFromQuery('?soak=true')).toBe(false);
    expect(soakFromQuery('?bench=1')).toBe(false);
    expect(soakFromQuery('')).toBe(false);
  });

  it('defaults: 15 minutes, 60 s cycles, no cycle limit', () => {
    expect(soakOptionsFromQuery('?soak=1')).toEqual({ minutes: 15, cycleSec: 60 });
  });

  it('soakMin is a plain integer clamped to 1..30', () => {
    expect(soakOptionsFromQuery('?soak=1&soakMin=5').minutes).toBe(5);
    expect(soakOptionsFromQuery('?soak=1&soakMin=0').minutes).toBe(1);
    expect(soakOptionsFromQuery('?soak=1&soakMin=-3').minutes).toBe(1);
    expect(soakOptionsFromQuery('?soak=1&soakMin=999').minutes).toBe(30);
    // '+' in a query string decodes to a space, so a literal plus sign is %2B.
    for (const raw of ['', 'abc', '2.5', '1e2', '%2B5']) expect(soakOptionsFromQuery('?soak=1&soakMin=' + raw).minutes).toBe(15);
  });

  it('soakCycles is optional and clamped to 1..100', () => {
    expect(soakOptionsFromQuery('?soak=1&soakCycles=3').maxCycles).toBe(3);
    expect(soakOptionsFromQuery('?soak=1&soakCycles=0').maxCycles).toBe(1);
    expect(soakOptionsFromQuery('?soak=1&soakCycles=5000').maxCycles).toBe(100);
    for (const raw of ['', 'x', '3.5', '1e1']) {
      expect(soakOptionsFromQuery('?soak=1&soakCycles=' + raw).maxCycles).toBeUndefined();
      expect('maxCycles' in soakOptionsFromQuery('?soak=1&soakCycles=' + raw)).toBe(false);
    }
  });

  it('dur sets the cycle length through parseBenchDuration (5..60)', () => {
    expect(soakOptionsFromQuery('?soak=1&dur=6').cycleSec).toBe(6);
    expect(soakOptionsFromQuery('?soak=1&dur=2').cycleSec).toBe(5);
    expect(soakOptionsFromQuery('?soak=1&dur=900').cycleSec).toBe(60);
    expect(soakOptionsFromQuery('?soak=1&soakCycles=3&dur=6')).toEqual({ minutes: 15, cycleSec: 6, maxCycles: 3 });
  });
});

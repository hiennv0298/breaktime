import { describe, expect, it } from 'vitest';
import { createGetUp, RECOVER_SEC, slapGetUp } from '../../src/logic/getUpFsm';
import {
  canBeHit,
  createPlayerStun,
  hitPlayer,
  inputLocked,
  PLAYER_INVULN_SEC,
  PLAYER_KNOCK_SCALE,
  PLAYER_LOCK_MAX_SEC,
  PLAYER_RAGDOLL_TIMEOUT_SEC,
  stepPlayerStun,
  type PlayerStunState,
  type StunMode,
} from '../../src/logic/playerStun';

const DT = 1 / 60;

interface Trace {
  state: PlayerStunState;
  events: Array<{ step: number; event: string; lockSec: number; mode: StunMode }>;
  recoverTs: number[];
  modes: StunMode[];
}

function run(s: PlayerStunState, steps: number, torsoSpeed: number, torsoAngSpeed = 0.5): Trace {
  const events: Trace['events'] = [];
  const recoverTs: number[] = [];
  const modes: StunMode[] = [];
  let state = s;
  for (let i = 1; i <= steps; i++) {
    const r = stepPlayerStun(state, { torsoSpeed, torsoAngSpeed, dt: DT });
    state = r.state;
    if (r.event !== 'none') events.push({ step: i, event: r.event, lockSec: state.lockSec, mode: state.mode });
    recoverTs.push(r.recoverT);
    modes.push(state.mode);
  }
  return { state, events, recoverTs, modes };
}

function knocked(): PlayerStunState {
  return hitPlayer(createPlayerStun()).state;
}

function stepOf(t: Trace, event: string): number {
  const e = t.events.find((x) => x.event === event);
  return e ? e.step : -1;
}

describe('playerStun constants (D-06)', () => {
  it('pin lock, invulnerability, player timeout and knock scale', () => {
    expect(PLAYER_RAGDOLL_TIMEOUT_SEC).toBe(2.5);
    expect(PLAYER_LOCK_MAX_SEC).toBe(3.0);
    expect(PLAYER_INVULN_SEC).toBe(1.5);
    expect(PLAYER_KNOCK_SCALE).toBe(0.5);
    expect(PLAYER_RAGDOLL_TIMEOUT_SEC + RECOVER_SEC).toBeLessThanOrEqual(PLAYER_LOCK_MAX_SEC);
  });
});

describe('createPlayerStun (D-09 no HP)', () => {
  it('starts free with zeroed counters', () => {
    const s = createPlayerStun();
    expect(s.mode).toBe('free');
    expect(s.hitsTaken).toBe(0);
    expect(s.knockdowns).toBe(0);
    expect(s.invulnLeft).toBe(0);
    expect(s.lockSec).toBe(0);
    expect(s.getUp).toEqual(createGetUp());
  });

  it('has no hp, health or life field anywhere in the state', () => {
    const banned = /^(hp|health|life)$/i;
    const s = createPlayerStun();
    for (const k of Object.keys(s)) expect(banned.test(k)).toBe(false);
    for (const k of Object.keys(s.getUp)) expect(banned.test(k)).toBe(false);
    const hit = knocked();
    for (const k of Object.keys(hit)) expect(banned.test(k)).toBe(false);
  });
});

describe('hitPlayer', () => {
  it('accepts a hit while free and knocks the player down', () => {
    const r = hitPlayer(createPlayerStun());
    expect(r.accepted).toBe(true);
    expect(r.state.mode).toBe('ragdoll');
    expect(r.state.hitsTaken).toBe(1);
    expect(r.state.knockdowns).toBe(1);
    expect(r.state.lockSec).toBe(0);
    expect(r.state.invulnLeft).toBe(0);
    expect(r.state.getUp.mode).toBe('ragdoll');
  });

  it('rejects hits during ragdoll, recover and invulnerable and returns an unchanged state', () => {
    const ragdoll = run(knocked(), 10, 5).state;
    const recover = run(knocked(), 40, 0.1).state;
    const invulnerable = run(knocked(), 70, 0.1).state;
    expect(ragdoll.mode).toBe('ragdoll');
    expect(recover.mode).toBe('recover');
    expect(invulnerable.mode).toBe('invulnerable');
    for (const s of [ragdoll, recover, invulnerable]) {
      const copy = structuredClone(s);
      const r = hitPlayer(s);
      expect(r.accepted).toBe(false);
      expect(r.state).toEqual(copy);
      expect(r.state.hitsTaken).toBe(1);
      expect(s).toEqual(copy);
    }
  });

  it('counts a second knockdown only after the player is free again', () => {
    const free = run(knocked(), 63 + 90, 0.1).state;
    expect(free.mode).toBe('free');
    const r = hitPlayer(free);
    expect(r.accepted).toBe(true);
    expect(r.state.hitsTaken).toBe(2);
    expect(r.state.knockdowns).toBe(2);
    expect(r.state.lockSec).toBe(0);
    expect(r.state.getUp).toEqual(slapGetUp(createGetUp()));
  });
});

describe('canBeHit / inputLocked', () => {
  it('only a free player can be hit; ragdoll and recover lock input', () => {
    const states: Record<StunMode, PlayerStunState> = {
      free: createPlayerStun(),
      ragdoll: knocked(),
      recover: run(knocked(), 40, 0.1).state,
      invulnerable: run(knocked(), 70, 0.1).state,
    };
    for (const mode of Object.keys(states) as StunMode[]) expect(states[mode].mode).toBe(mode);
    expect(canBeHit(states.free)).toBe(true);
    expect(canBeHit(states.ragdoll)).toBe(false);
    expect(canBeHit(states.recover)).toBe(false);
    expect(canBeHit(states.invulnerable)).toBe(false);
    expect(inputLocked(states.free)).toBe(false);
    expect(inputLocked(states.ragdoll)).toBe(true);
    expect(inputLocked(states.recover)).toBe(true);
    expect(inputLocked(states.invulnerable)).toBe(false);
  });
});

describe('stepPlayerStun timings', () => {
  it('a never-calm torso starts recovering at 2.5 s and stands up with lock <= 3.0 s', () => {
    const t = run(knocked(), 200, 5, 5);
    const recoverStep = stepOf(t, 'start-recover');
    expect(recoverStep).toBeGreaterThanOrEqual(150);
    expect(recoverStep).toBeLessThanOrEqual(151);
    const stood = t.events.find((e) => e.event === 'stood-up');
    expect(stood).toBeDefined();
    expect(stood!.mode).toBe('invulnerable');
    expect(stood!.lockSec).toBeLessThanOrEqual(PLAYER_LOCK_MAX_SEC + 1e-6);
    const atStood = run(knocked(), stood!.step, 5, 5).state;
    expect(atStood.invulnLeft).toBe(PLAYER_INVULN_SEC);
    // Input stays locked for every step before stood-up and never after.
    for (let i = 0; i < t.modes.length; i++) {
      const locked = t.modes[i] === 'ragdoll' || t.modes[i] === 'recover';
      expect(locked).toBe(i + 1 < stood!.step);
    }
  });

  it('a torso calm from the first step starts recovering at 0.6 s and stands up at 1.05 s', () => {
    const t = run(knocked(), 80, 0.1, 0.1);
    const recoverStep = stepOf(t, 'start-recover');
    const stoodStep = stepOf(t, 'stood-up');
    expect(Math.abs(recoverStep - 36)).toBeLessThanOrEqual(1);
    expect(Math.abs(stoodStep - 63)).toBeLessThanOrEqual(1);
    expect(t.events.find((e) => e.event === 'stood-up')!.lockSec).toBeCloseTo(1.05, 6);
  });

  it('forces recover when lockSec reaches PLAYER_LOCK_MAX_SEC - RECOVER_SEC, whatever the get-up timer says', () => {
    // A ragdoll whose get-up timer is far from its own timeout but whose lock is almost at the cap.
    // After this step lockSec lands on the cap threshold, as it does on the 1/60 s grid (153 steps).
    const s: PlayerStunState = { ...knocked(), lockSec: PLAYER_LOCK_MAX_SEC - RECOVER_SEC - DT };
    expect(s.getUp.ragdollSec).toBe(0);
    const r = stepPlayerStun(s, { torsoSpeed: 5, torsoAngSpeed: 5, dt: DT });
    expect(r.event).toBe('start-recover');
    expect(r.state.mode).toBe('recover');
    expect(r.state.getUp.mode).toBe('recover');
    expect(r.recoverT).toBe(0);
    // The recover then completes and the total lock stays within the cap.
    const t = run(r.state, 40, 5, 5);
    const stood = t.events.find((e) => e.event === 'stood-up');
    expect(stood).toBeDefined();
    expect(stood!.lockSec).toBeLessThanOrEqual(PLAYER_LOCK_MAX_SEC + 1e-6);
  });

  it('one step before the cap without a get-up timeout keeps the ragdoll', () => {
    const s: PlayerStunState = { ...knocked(), lockSec: PLAYER_LOCK_MAX_SEC - RECOVER_SEC - DT * 2 };
    const r = stepPlayerStun(s, { torsoSpeed: 5, torsoAngSpeed: 5, dt: DT });
    expect(r.event).toBe('none');
    expect(r.state.mode).toBe('ragdoll');
  });

  it('invulnerability lasts exactly 90 steps (1.5 s) after stood-up, then the player is vulnerable', () => {
    const stood = run(knocked(), 63, 0.1, 0.1);
    expect(stood.state.mode).toBe('invulnerable');
    const at89 = run(stood.state, 89, 0, 0);
    expect(at89.state.mode).toBe('invulnerable');
    expect(at89.events).toEqual([]);
    const at90 = stepPlayerStun(at89.state, { torsoSpeed: 0, torsoAngSpeed: 0, dt: DT });
    expect(at90.event).toBe('vulnerable');
    expect(at90.state.mode).toBe('free');
    expect(at90.state.invulnLeft).toBe(0);
    expect(canBeHit(at90.state)).toBe(true);
  });

  it('recoverT goes 0 -> 1 during recover', () => {
    const t = run(knocked(), 70, 0.1, 0.1);
    const start = stepOf(t, 'start-recover');
    const stood = stepOf(t, 'stood-up');
    const during = t.recoverTs.slice(start - 1, stood);
    expect(during[0]).toBe(0);
    expect(during[during.length - 1]).toBe(1);
    for (let i = 1; i < during.length; i++) expect(during[i]).toBeGreaterThanOrEqual(during[i - 1]);
    for (const v of during) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('free does nothing', () => {
    const r = stepPlayerStun(createPlayerStun(), { torsoSpeed: 5, torsoAngSpeed: 5, dt: 10 });
    expect(r.event).toBe('none');
    expect(r.state).toEqual(createPlayerStun());
    expect(r.recoverT).toBe(0);
  });

  it('non-finite or non-positive dt makes no progress in any mode', () => {
    const states = [knocked(), run(knocked(), 40, 0.1).state, run(knocked(), 70, 0.1).state];
    for (const s of states) {
      for (const dt of [Number.NaN, Infinity, -1, 0]) {
        const r = stepPlayerStun(s, { torsoSpeed: 0, torsoAngSpeed: 0, dt });
        expect(r.event).toBe('none');
        expect(r.state).toEqual(s);
      }
    }
  });

  it('never mutates its inputs', () => {
    const states = [createPlayerStun(), knocked(), run(knocked(), 40, 0.1).state, run(knocked(), 70, 0.1).state];
    for (const s of states) {
      const copy = structuredClone(s);
      const input = { torsoSpeed: 0.1, torsoAngSpeed: 0.1, dt: DT };
      stepPlayerStun(s, input);
      hitPlayer(s);
      canBeHit(s);
      inputLocked(s);
      expect(s).toEqual(copy);
      expect(input).toEqual({ torsoSpeed: 0.1, torsoAngSpeed: 0.1, dt: DT });
    }
  });
});

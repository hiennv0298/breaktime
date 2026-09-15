import { describe, expect, it } from 'vitest';
import {
  applyStrikeResult,
  CHASE_SPEED,
  COOLDOWN_SEC,
  createCombatFsm,
  GIVE_UP_CHASE_SEC,
  GIVE_UP_DIST,
  GIVE_UP_DIST_HOLD_SEC,
  MAX_STUCK,
  RETURN_ARRIVE,
  RETURN_SPEED,
  SIDESTEP_SEC,
  SIDESTEP_SPEED,
  STUCK_MIN_PROGRESS,
  STUCK_WINDOW_SEC,
  stepCombatFsm,
  WINDUP_SEC,
  type CombatFsmState,
  type CombatInput,
  type CombatState,
} from '../../src/logic/combatFsm';

const DT = 1 / 60;

function input(over: Partial<CombatInput> = {}): CombatInput {
  return {
    dt: DT,
    physics: 'animated',
    angry: false,
    calm: false,
    dist: 5,
    playerTargetable: true,
    hasPursueToken: false,
    hasStrikeToken: false,
    routeDist: 3,
    reactSec: 0.3,
    ...over,
  };
}

function inState(state: CombatState, over: Partial<CombatFsmState> = {}): CombatFsmState {
  return { ...createCombatFsm(), state, ...over };
}

/** Pursue state with an open stuck window at the given start distance. */
function pursuing(dist: number, over: Partial<CombatFsmState> = {}): CombatFsmState {
  return inState('pursue', { windowStartDist: dist, ...over });
}

describe('combatFsm constants', () => {
  it('pins the locked numbers (D-08, G9)', () => {
    expect(WINDUP_SEC).toBe(0.6);
    expect(COOLDOWN_SEC).toBe(1.5);
    expect(CHASE_SPEED).toBe(2.2);
    expect(RETURN_SPEED).toBe(1.4);
    expect(SIDESTEP_SPEED).toBe(1.6);
    expect(GIVE_UP_CHASE_SEC).toBe(8);
    expect(GIVE_UP_DIST).toBe(9);
    expect(GIVE_UP_DIST_HOLD_SEC).toBe(1.0);
    expect(STUCK_WINDOW_SEC).toBe(1.0);
    expect(STUCK_MIN_PROGRESS).toBe(0.3);
    expect(SIDESTEP_SEC).toBe(0.5);
    expect(MAX_STUCK).toBe(2);
    expect(RETURN_ARRIVE).toBe(0.5);
    expect(CHASE_SPEED).toBeLessThan(3.2);
  });

  it('createCombatFsm starts in routine with cleared timers', () => {
    const s = createCombatFsm();
    expect(s).toEqual({
      state: 'routine',
      reactLeft: 0,
      chaseSec: 0,
      farSec: 0,
      windowSec: 0,
      windowStartDist: 0,
      stuck: 0,
      sidestepLeft: 0,
      sidestepSign: 1,
      windupLeft: 0,
      cooldownLeft: 0,
      grudgeSatisfied: false,
    });
  });
});

describe('down layer (D-05: act only after get-up)', () => {
  const states: CombatState[] = ['routine', 'fume', 'pursue', 'cooldown', 'return'];
  for (const st of states) {
    it(`${st} + ragdoll -> down with event 'down', nothing wanted, timers reset`, () => {
      const s = inState(st, { chaseSec: 3, farSec: 0.5, stuck: 1, cooldownLeft: 1, reactLeft: 0.2, grudgeSatisfied: true });
      const r = stepCombatFsm(s, input({ physics: 'ragdoll', angry: true, hasPursueToken: true }));
      expect(r.state).toEqual({ ...createCombatFsm(), state: 'down' });
      expect(r.event).toBe('down');
      expect(r.wantsPursue).toBe(false);
      expect(r.wantsStrike).toBe(false);
      expect(r.move).toBe('walker');
    });
  }

  it("windup + ragdoll -> down with event 'interrupted' (D-08 cắt đòn)", () => {
    const r = stepCombatFsm(inState('windup', { windupLeft: 0.3 }), input({ physics: 'ragdoll', hasStrikeToken: true, hasPursueToken: true }));
    expect(r.state.state).toBe('down');
    expect(r.event).toBe('interrupted');
    expect(r.state.windupLeft).toBe(0);
    expect(r.wantsStrike).toBe(false);
    expect(r.wantsPursue).toBe(false);
  });

  it("windup + recover also interrupts", () => {
    expect(stepCombatFsm(inState('windup', { windupLeft: 0.1 }), input({ physics: 'recover' })).event).toBe('interrupted');
  });

  it("already down stays down with event 'none'", () => {
    const r = stepCombatFsm(inState('down'), input({ physics: 'recover', angry: true }));
    expect(r.state.state).toBe('down');
    expect(r.event).toBe('none');
    expect(r.move).toBe('walker');
  });

  it("down + animated + angry -> fume with reactLeft = reactSec", () => {
    const r = stepCombatFsm(inState('down'), input({ angry: true, reactSec: 0.37 }));
    expect(r.state.state).toBe('fume');
    expect(r.event).toBe('fume');
    expect(r.state.reactLeft).toBeCloseTo(0.37, 12);
    expect(r.wantsPursue).toBe(false);
    expect(r.move).toBe('hold');
  });

  it("down + animated + not angry -> routine with event 'resume'", () => {
    const r = stepCombatFsm(inState('down'), input({ angry: false }));
    expect(r.state.state).toBe('routine');
    expect(r.event).toBe('resume');
    expect(r.move).toBe('walker');
  });
});

describe('routine', () => {
  it('not angry keeps the walker', () => {
    const r = stepCombatFsm(createCombatFsm(), input());
    expect(r.state.state).toBe('routine');
    expect(r.event).toBe('none');
    expect(r.move).toBe('walker');
    expect(r.wantsPursue).toBe(false);
    expect(r.wantsStrike).toBe(false);
  });

  it('angry -> fume', () => {
    const r = stepCombatFsm(createCombatFsm(), input({ angry: true, reactSec: 0.25 }));
    expect(r.state.state).toBe('fume');
    expect(r.event).toBe('fume');
    expect(r.state.reactLeft).toBeCloseTo(0.25, 12);
    expect(r.move).toBe('hold');
  });
});

describe('fume (D-07: no token -> fume in place)', () => {
  it('holds and does not want pursue while the reaction delay runs, then wants pursue', () => {
    let s = inState('fume', { reactLeft: 0.2 });
    const wants: boolean[] = [];
    for (let i = 0; i < 13; i++) {
      const r = stepCombatFsm(s, input({ angry: true }));
      expect(r.move).toBe('hold');
      expect(r.state.state).toBe('fume');
      wants.push(r.wantsPursue);
      s = r.state;
    }
    // 0.2 s = 12 steps: steps 1..11 still reacting, step 12 done.
    expect(wants.slice(0, 11).every((w) => !w)).toBe(true);
    expect(wants[11]).toBe(true);
    expect(wants[12]).toBe(true);
  });

  it('without a token keeps fuming forever', () => {
    let s = inState('fume');
    for (let i = 0; i < 600; i++) {
      const r = stepCombatFsm(s, input({ angry: true }));
      expect(r.state.state).toBe('fume');
      expect(r.move).toBe('hold');
      expect(r.wantsPursue).toBe(true);
      s = r.state;
    }
  });

  it('with the pursue token -> pursue; chaseSec and farSec kept, window restarted', () => {
    const s = inState('fume', { chaseSec: 2.5, farSec: 0.4, windowSec: 0.7, windowStartDist: 9, stuck: 1 });
    const r = stepCombatFsm(s, input({ angry: true, hasPursueToken: true, dist: 4 }));
    expect(r.state.state).toBe('pursue');
    expect(r.event).toBe('pursue');
    expect(r.state.chaseSec).toBe(2.5);
    expect(r.state.farSec).toBe(0.4);
    expect(r.state.windowSec).toBe(0);
    expect(r.state.windowStartDist).toBe(4);
    expect(r.state.stuck).toBe(0);
    expect(r.wantsPursue).toBe(true);
  });

  it('a token is not taken while still reacting', () => {
    const r = stepCombatFsm(inState('fume', { reactLeft: 0.4 }), input({ angry: true, hasPursueToken: true }));
    expect(r.state.state).toBe('fume');
    expect(r.wantsPursue).toBe(false);
  });

  it("calm -> return with event 'give-up'", () => {
    const r = stepCombatFsm(inState('fume'), input({ calm: true }));
    expect(r.state.state).toBe('return');
    expect(r.event).toBe('give-up');
    expect(r.wantsPursue).toBe(false);
    expect(r.move).toBe('return');
  });
});

describe('pursue (G9)', () => {
  it('wants pursue and moves toward the player', () => {
    const r = stepCombatFsm(pursuing(5), input({ angry: true, hasPursueToken: true, dist: 5 }));
    expect(r.state.state).toBe('pursue');
    expect(r.event).toBe('none');
    expect(r.wantsPursue).toBe(true);
    expect(r.wantsStrike).toBe(false);
    expect(r.move).toBe('pursue');
  });

  it('losing the token -> fume with reactLeft 0', () => {
    const r = stepCombatFsm(pursuing(5, { chaseSec: 1 }), input({ angry: true, hasPursueToken: false, dist: 5 }));
    expect(r.state.state).toBe('fume');
    expect(r.event).toBe('fume');
    expect(r.state.reactLeft).toBe(0);
    expect(r.wantsPursue).toBe(true);
    expect(r.move).toBe('hold');
  });

  it('chaseSec accumulates only in pursue and gives up at 8 s total', () => {
    let s = pursuing(8);
    let steps = 0;
    let event = 'none';
    // Pursue 4 s, fume 2 s (token lost), pursue again until give-up.
    for (let i = 0; i < 240; i++) {
      // 0.4 m of progress per window keeps it from counting as stuck.
      const r = stepCombatFsm(s, input({ angry: true, hasPursueToken: true, dist: 8 - (i + 1) * (0.4 / 60) }));
      s = r.state;
      steps++;
    }
    expect(s.state).toBe('pursue');
    expect(s.chaseSec).toBeCloseTo(4, 6);
    for (let i = 0; i < 120; i++) {
      const r = stepCombatFsm(s, input({ angry: true, hasPursueToken: false }));
      s = r.state;
    }
    expect(s.state).toBe('fume');
    expect(s.chaseSec).toBeCloseTo(4, 6);
    let giveUpStep = -1;
    for (let i = 0; i < 400 && giveUpStep < 0; i++) {
      const r = stepCombatFsm(s, input({ angry: true, hasPursueToken: true, dist: 6 - i * (0.4 / 60) }));
      s = r.state;
      event = r.event;
      if (r.event === 'give-up') giveUpStep = i;
    }
    expect(event).toBe('give-up');
    expect(s.state).toBe('return');
    // Step 0 is the fume -> pursue transition; 240 more pursue steps reach 8 s.
    expect(giveUpStep).toBe(240);
    expect(steps).toBe(240);
  });

  it('gives up after the player is farther than 9 m for 1.0 s', () => {
    let s = pursuing(12);
    let giveUp = -1;
    for (let i = 1; i <= 80 && giveUp < 0; i++) {
      const r = stepCombatFsm(s, input({ angry: true, hasPursueToken: true, dist: 12 - i * 0.4 }));
      s = r.state;
      if (r.event === 'give-up') giveUp = i;
    }
    // dist stays > 9 during the first 7 steps only (12 - 0.4 * 7 = 9.2), so no give-up there.
    expect(giveUp).toBe(-1);
    let s2 = pursuing(12);
    for (let i = 1; i <= 80 && giveUp < 0; i++) {
      const r = stepCombatFsm(s2, input({ angry: true, hasPursueToken: true, dist: 12 + (i % 60) * 0.01 }));
      s2 = r.state;
      if (r.event === 'give-up') giveUp = i;
    }
    expect(giveUp).toBe(60);
    expect(s2.state).toBe('return');
  });

  it('9.2 m dropping below 9 within 0.5 s does not give up', () => {
    let s = pursuing(9.2);
    for (let i = 1; i <= 120; i++) {
      const dist = i <= 29 ? 9.2 : 8.8 - (i % 60) * 0.01;
      const r = stepCombatFsm(s, input({ angry: true, hasPursueToken: true, dist }));
      expect(r.event).not.toBe('give-up');
      s = r.state;
    }
    expect(s.farSec).toBe(0);
  });

  it('a slapped NPC farther than 9 m does not quit at once', () => {
    const r = stepCombatFsm(pursuing(15), input({ angry: true, hasPursueToken: true, dist: 15 }));
    expect(r.state.state).toBe('pursue');
    expect(r.event).toBe('none');
  });

  it('calm -> give-up', () => {
    const r = stepCombatFsm(pursuing(4), input({ calm: true, hasPursueToken: true, dist: 4 }));
    expect(r.state.state).toBe('return');
    expect(r.event).toBe('give-up');
  });

  it('stuck twice -> sidestep +1, sidestep -1, then give-up', () => {
    let s = pursuing(5);
    const moves: string[] = [];
    const events: string[] = [];
    const signs: number[] = [];
    for (let i = 0; i < 300 && s.state === 'pursue'; i++) {
      const r = stepCombatFsm(s, input({ angry: true, hasPursueToken: true, dist: 5 }));
      moves.push(r.move);
      events.push(r.event);
      s = r.state;
      signs.push(s.sidestepSign);
    }
    // Window 1: 60 steps of no progress -> stuck 1 at step 60 (index 59), sidestep sign +1.
    expect(moves.slice(0, 59).every((m) => m === 'pursue')).toBe(true);
    expect(moves[59]).toBe('sidestep');
    expect(signs[59]).toBe(1);
    // Sidestep lasts 0.5 s (30 steps) including the step that started it.
    expect(moves.slice(59, 89).every((m) => m === 'sidestep')).toBe(true);
    expect(moves[89]).toBe('pursue');
    // Window 2 restarts when the sidestep ends: stuck 2 -> give-up.
    const giveUpIndex = events.indexOf('give-up');
    expect(giveUpIndex).toBeGreaterThan(89);
    expect(s.state).toBe('return');
    expect(events.filter((e) => e === 'give-up')).toHaveLength(1);
  });

  it('stuck 1 sidesteps with sign +1 for 0.5 s; stuck 2 reaches MAX_STUCK and gives up', () => {
    // With MAX_STUCK 2 the even-count sign (-1) is never used before the give-up.
    const s1 = pursuing(5, { windowSec: 1 - DT });
    const r1 = stepCombatFsm(s1, input({ angry: true, hasPursueToken: true, dist: 5 }));
    expect(r1.state.stuck).toBe(1);
    expect(r1.state.sidestepSign).toBe(1);
    expect(r1.state.sidestepLeft).toBeCloseTo(0.5, 9);
    const s2 = pursuing(5, { windowSec: 1 - DT, stuck: 1 });
    const r2 = stepCombatFsm(s2, input({ angry: true, hasPursueToken: true, dist: 5 }));
    expect(r2.state.stuck).toBe(0);
    expect(r2.event).toBe('give-up');
  });

  it('enough progress in a window is not stuck', () => {
    let s = pursuing(6);
    for (let i = 1; i <= 240; i++) {
      const r = stepCombatFsm(s, input({ angry: true, hasPursueToken: true, dist: 6 - i * (0.31 / 60) }));
      expect(r.move).toBe('pursue');
      s = r.state;
    }
    expect(s.stuck).toBe(0);
  });

  it('within 1.0 m the window resets and never counts as stuck', () => {
    let s = pursuing(0.9);
    for (let i = 0; i < 300; i++) {
      const r = stepCombatFsm(s, input({ angry: true, hasPursueToken: true, dist: 0.9, playerTargetable: false }));
      expect(r.move).toBe('hold');
      s = r.state;
    }
    expect(s.stuck).toBe(0);
    expect(s.windowSec).toBe(0);
  });
});

describe('strike (D-08)', () => {
  it('in reach and targetable wants strike and holds; with the strike token -> windup', () => {
    const r1 = stepCombatFsm(pursuing(1), input({ angry: true, hasPursueToken: true, dist: 1.0 }));
    expect(r1.state.state).toBe('pursue');
    expect(r1.wantsStrike).toBe(true);
    expect(r1.move).toBe('hold');
    const r2 = stepCombatFsm(r1.state, input({ angry: true, hasPursueToken: true, hasStrikeToken: true, dist: 0.99 }));
    expect(r2.state.state).toBe('windup');
    expect(r2.event).toBe('windup');
    expect(r2.state.windupLeft).toBeCloseTo(0.6, 12);
    expect(r2.move).toBe('hold');
    expect(r2.wantsStrike).toBe(true);
    expect(r2.wantsPursue).toBe(true);
  });

  it('not targetable (player invulnerable) holds without wanting strike', () => {
    const r = stepCombatFsm(pursuing(0.8), input({ angry: true, hasPursueToken: true, hasStrikeToken: true, dist: 0.8, playerTargetable: false }));
    expect(r.state.state).toBe('pursue');
    expect(r.wantsStrike).toBe(false);
    expect(r.move).toBe('hold');
  });

  it('just outside 1.0 m keeps pursuing', () => {
    const r = stepCombatFsm(pursuing(1.1), input({ angry: true, hasPursueToken: true, hasStrikeToken: true, dist: 1.05 }));
    expect(r.state.state).toBe('pursue');
    expect(r.wantsStrike).toBe(false);
    expect(r.move).toBe('pursue');
  });

  it('windup lasts exactly 36 steps of 1/60 s, then strike -> cooldown', () => {
    let s = inState('windup', { windupLeft: WINDUP_SEC });
    const events: string[] = [];
    for (let i = 1; i <= 36; i++) {
      const r = stepCombatFsm(s, input({ angry: true, hasPursueToken: true, hasStrikeToken: true, dist: 0.9 }));
      events.push(r.event);
      if (i < 36) {
        expect(r.state.state).toBe('windup');
        expect(r.move).toBe('hold');
        expect(r.wantsStrike).toBe(true);
        expect(r.wantsPursue).toBe(true);
      } else {
        expect(r.state.state).toBe('cooldown');
        expect(r.state.cooldownLeft).toBeCloseTo(1.5, 12);
        expect(r.event).toBe('strike');
        expect(r.wantsStrike).toBe(false);
      }
      s = r.state;
    }
    expect(events.filter((e) => e === 'strike')).toHaveLength(1);
    expect(events[34]).toBe('none');
  });

  it('applyStrikeResult records whether the grudge is satisfied', () => {
    const s = inState('cooldown', { cooldownLeft: 1.5 });
    expect(applyStrikeResult(s, true).grudgeSatisfied).toBe(true);
    expect(applyStrikeResult(inState('cooldown', { grudgeSatisfied: true }), false).grudgeSatisfied).toBe(false);
    expect(s.grudgeSatisfied).toBe(false);
  });
});

describe('cooldown', () => {
  function runCooldown(s: CombatFsmState, over: Partial<CombatInput>) {
    let st = s;
    let last = stepCombatFsm(st, input(over));
    let steps = 1;
    while (last.state.state === 'cooldown' && steps < 200) {
      expect(last.move).toBe('hold');
      expect(last.wantsPursue).toBe(true);
      expect(last.wantsStrike).toBe(false);
      st = last.state;
      last = stepCombatFsm(st, input(over));
      steps++;
    }
    return { last, steps };
  }

  it('landed hit -> return give-up after 1.5 s', () => {
    const { last, steps } = runCooldown(applyStrikeResult(inState('cooldown', { cooldownLeft: COOLDOWN_SEC }), true), { angry: true, hasPursueToken: true });
    expect(steps).toBe(90);
    expect(last.state.state).toBe('return');
    expect(last.event).toBe('give-up');
    expect(last.state.grudgeSatisfied).toBe(false);
  });

  it('missed + calm -> give-up', () => {
    const { last } = runCooldown(inState('cooldown', { cooldownLeft: COOLDOWN_SEC }), { calm: true, hasPursueToken: true });
    expect(last.state.state).toBe('return');
    expect(last.event).toBe('give-up');
  });

  it('missed + token -> pursue again', () => {
    const { last, steps } = runCooldown(inState('cooldown', { cooldownLeft: COOLDOWN_SEC, chaseSec: 3 }), { angry: true, hasPursueToken: true, dist: 3 });
    expect(steps).toBe(90);
    expect(last.state.state).toBe('pursue');
    expect(last.event).toBe('pursue');
    expect(last.state.chaseSec).toBe(3);
    expect(last.state.windowStartDist).toBe(3);
  });

  it('missed without token -> fume', () => {
    const { last } = runCooldown(inState('cooldown', { cooldownLeft: COOLDOWN_SEC }), { angry: true, hasPursueToken: false });
    expect(last.state.state).toBe('fume');
    expect(last.event).toBe('fume');
    expect(last.state.reactLeft).toBe(0);
  });
});

describe('return', () => {
  it('walks back and resumes the route within 0.5 m', () => {
    const r1 = stepCombatFsm(inState('return'), input({ routeDist: 2 }));
    expect(r1.state.state).toBe('return');
    expect(r1.move).toBe('return');
    expect(r1.wantsPursue).toBe(false);
    expect(r1.event).toBe('none');
    const r2 = stepCombatFsm(r1.state, input({ routeDist: 0.5 }));
    expect(r2.state.state).toBe('routine');
    expect(r2.event).toBe('resume');
    expect(r2.move).toBe('walker');
  });

  it('give-up resets grudge timers', () => {
    const r = stepCombatFsm(pursuing(4, { chaseSec: 7.99, farSec: 0.5, stuck: 1, grudgeSatisfied: true }), input({ angry: true, hasPursueToken: true, dist: 4 }));
    expect(r.event).toBe('give-up');
    expect(r.state).toEqual({ ...createCombatFsm(), state: 'return' });
  });
});

describe('robustness', () => {
  it('non-finite dt makes no progress', () => {
    const s = inState('windup', { windupLeft: 0.5 });
    for (const dt of [NaN, Infinity, -Infinity, -1, 0]) {
      const r = stepCombatFsm(s, input({ dt, angry: true, hasPursueToken: true, hasStrikeToken: true, dist: 0.9 }));
      expect(r.state.state).toBe('windup');
      expect(r.state.windupLeft).toBe(0.5);
    }
    const c = inState('cooldown', { cooldownLeft: 1 });
    expect(stepCombatFsm(c, input({ dt: NaN, hasPursueToken: true })).state.cooldownLeft).toBe(1);
  });

  it('NaN dist counts as far and never as in reach', () => {
    let s = pursuing(5);
    let giveUp = -1;
    for (let i = 1; i <= 70 && giveUp < 0; i++) {
      const r = stepCombatFsm(s, input({ angry: true, hasPursueToken: true, hasStrikeToken: true, dist: NaN }));
      expect(r.state.state === 'windup').toBe(false);
      expect(r.wantsStrike).toBe(false);
      s = r.state;
      if (r.event === 'give-up') giveUp = i;
    }
    expect(giveUp).toBe(60);
  });

  it('never mutates its inputs', () => {
    const s = Object.freeze(pursuing(5, { chaseSec: 1 }));
    const i = Object.freeze(input({ angry: true, hasPursueToken: true, dist: 5 }));
    const before = JSON.stringify(s);
    expect(() => stepCombatFsm(s, i)).not.toThrow();
    expect(() => applyStrikeResult(s, true)).not.toThrow();
    expect(JSON.stringify(s)).toBe(before);
  });
});

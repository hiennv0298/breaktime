import { describe, expect, it } from 'vitest';
import {
  ANGER_MAX,
  ANGER_THRESHOLD,
  CALM_BELOW,
  DECAY_DELAY_SEC,
  DECAY_PER_SEC,
  REACT_MAX_SEC,
  REACT_MIN_SEC,
  SLAP_ANGER,
  SLAP_JITTER_MAX,
  createAnger,
  effectiveTemper,
  fightFromQuery,
  isAngry,
  isCalm,
  onSlapped,
  reactionDelaySec,
  satisfyAnger,
  tickAnger,
  type AngerState,
} from '../../src/logic/anger';
import { RAGDOLL_TIMEOUT_SEC, RECOVER_SEC } from '../../src/logic/getUpFsm';
import { mulberry32 } from '../../src/logic/rng';
import {
  DEFAULT_TEMPER,
  SLAPS_TO_ANGER,
  TEMPERS,
  TEMPER_LABEL_VI,
  isTemper,
  type Temper,
} from '../../src/logic/temper';

const STEP = 1 / 60;
const SEEDS = 1000;

/** Advance in fixed 1/60 s steps (the sim step), like the combat director will. */
function tickFor(s: AngerState, sec: number, holdDecay: boolean): AngerState {
  const steps = Math.round(sec / STEP);
  let cur = s;
  for (let i = 0; i < steps; i++) cur = tickAnger(cur, STEP, { holdDecay });
  return cur;
}

/** Slap `slaps` times with a gap between consecutive slaps; returns isAngry after each slap. */
function angryAfterEachSlap(temper: Temper, seed: number, slaps: number, walkSec: number | null): boolean[] {
  const rng = mulberry32(seed);
  let s = createAnger();
  const out: boolean[] = [];
  for (let i = 0; i < slaps; i++) {
    if (i > 0 && walkSec !== null) {
      // Down: ragdoll timeout + get-up blend, decay clock paused.
      s = tickFor(s, RAGDOLL_TIMEOUT_SEC + RECOVER_SEC, true);
      // Standing again and walking back into reach.
      s = tickFor(s, walkSec, false);
    }
    s = onSlapped(s, temper, rng);
    out.push(isAngry(s));
  }
  return out;
}

describe('temper table (D-03, D-05)', () => {
  it('has the locked counts, labels and order', () => {
    expect(SLAPS_TO_ANGER).toEqual({ hot: 1, normal: 2, calm: 3 });
    expect(TEMPER_LABEL_VI).toEqual({ hot: 'Nóng', normal: 'Thường', calm: 'Hiền' });
    expect([...TEMPERS]).toEqual(['hot', 'normal', 'calm']);
    expect(DEFAULT_TEMPER).toBe('normal');
  });

  it('isTemper accepts only the exact lower-case names', () => {
    expect(isTemper('hot')).toBe(true);
    expect(isTemper('normal')).toBe(true);
    expect(isTemper('calm')).toBe(true);
    expect(isTemper('Hot')).toBe(false);
    expect(isTemper(undefined)).toBe(false);
    expect(isTemper(null)).toBe(false);
    expect(isTemper(1)).toBe(false);
  });
});

describe('anger constants', () => {
  it('pins the tuned values', () => {
    expect(ANGER_MAX).toBe(100);
    expect(ANGER_THRESHOLD).toBe(100);
    expect(SLAP_ANGER).toEqual({ hot: 100, normal: 60, calm: 42 });
    expect(SLAP_JITTER_MAX).toBe(5);
    expect(DECAY_DELAY_SEC).toBe(6);
    expect(DECAY_PER_SEC).toBe(8);
    expect(CALM_BELOW).toBe(40);
    expect(REACT_MIN_SEC).toBe(0.2);
    expect(REACT_MAX_SEC).toBe(0.5);
  });
});

describe('onSlapped thresholds over 1000 seeds (D-05)', () => {
  for (const t of TEMPERS) {
    it(`${t}: angry after exactly ${SLAPS_TO_ANGER[t]} back-to-back slaps, never one earlier`, () => {
      for (let seed = 0; seed < SEEDS; seed++) {
        const rng = mulberry32(seed);
        let s = createAnger();
        for (let i = 0; i < SLAPS_TO_ANGER[t] - 1; i++) s = onSlapped(s, t, rng);
        expect(isAngry(s)).toBe(false);
        s = onSlapped(s, t, rng);
        expect(isAngry(s)).toBe(true);
        expect(s.value).toBe(ANGER_MAX);
      }
    });
  }

  it('realistic gap (ragdoll timeout + recover held, then 1.5 s walk) keeps 1 / 2 / 3 for every seed', () => {
    const walkSec = 1.5;
    expect(RAGDOLL_TIMEOUT_SEC + RECOVER_SEC + walkSec).toBeCloseTo(5.95, 9);
    for (let seed = 0; seed < SEEDS; seed++) {
      expect(angryAfterEachSlap('hot', seed, 1, walkSec)).toEqual([true]);
      expect(angryAfterEachSlap('normal', seed, 2, walkSec)).toEqual([false, true]);
      expect(angryAfterEachSlap('calm', seed, 3, walkSec)).toEqual([false, false, true]);
    }
  });

  it('slow walk back (7.0 s standing between slaps, 8 anger lost per gap) keeps 1 / 2 / 3 for every seed', () => {
    const walkSec = 7.0;
    for (let seed = 0; seed < SEEDS; seed++) {
      expect(angryAfterEachSlap('hot', seed, 1, walkSec)).toEqual([true]);
      expect(angryAfterEachSlap('normal', seed, 2, walkSec)).toEqual([false, true]);
      expect(angryAfterEachSlap('calm', seed, 3, walkSec)).toEqual([false, false, true]);
    }
  });

  it('early-anger guard: maximum jitter never makes normal or calm angry one slap early', () => {
    const maxRng = () => 0.999999;
    const n = onSlapped(createAnger(), 'normal', maxRng);
    expect(n.value).toBe(65);
    expect(isAngry(n)).toBe(false);
    const c = onSlapped(onSlapped(createAnger(), 'calm', maxRng), 'calm', maxRng);
    expect(c.value).toBe(94);
    expect(isAngry(c)).toBe(false);
  });
});

describe('onSlapped rng use and immutability', () => {
  it('draws exactly one number per slap with jitter on', () => {
    let calls = 0;
    const rng = () => {
      calls++;
      return 0.5;
    };
    let s = createAnger();
    for (let i = 0; i < 5; i++) {
      s = onSlapped(s, 'calm', rng);
      expect(calls).toBe(i + 1);
    }
  });

  it('never draws with { jitter: false } and adds exactly SLAP_ANGER', () => {
    let calls = 0;
    const rng = () => {
      calls++;
      return 0.999999;
    };
    for (const t of TEMPERS) {
      const s = onSlapped(createAnger(), t, rng, { jitter: false });
      expect(s.value).toBe(Math.min(ANGER_MAX, SLAP_ANGER[t]));
    }
    expect(calls).toBe(0);
  });

  it('jitter stays within 0..SLAP_JITTER_MAX even for a misbehaving rng', () => {
    for (const r of [0, 0.5, 0.999999, 1, 7, -3, Number.NaN]) {
      const s = onSlapped(createAnger(), 'calm', () => r);
      expect(s.value).toBeGreaterThanOrEqual(SLAP_ANGER.calm);
      expect(s.value).toBeLessThanOrEqual(SLAP_ANGER.calm + SLAP_JITTER_MAX);
      expect(Number.isInteger(s.value)).toBe(true);
    }
  });

  it('resets sinceSlapSec, counts slaps and does not mutate the input', () => {
    const input: AngerState = Object.freeze({ value: 10, sinceSlapSec: 3.5, slaps: 2 });
    const out = onSlapped(input, 'normal', () => 0);
    expect(out).not.toBe(input);
    expect(out).toEqual({ value: 70, sinceSlapSec: 0, slaps: 3 });
    expect(input).toEqual({ value: 10, sinceSlapSec: 3.5, slaps: 2 });
  });
});

describe('tickAnger decay (D-05 nguội dần)', () => {
  it('holds full anger for 6 s, then drops 8 per second', () => {
    let s: AngerState = { value: 100, sinceSlapSec: 0, slaps: 1 };
    for (let i = 0; i < 420; i++) {
      s = tickAnger(s, STEP);
      if (s.sinceSlapSec <= DECAY_DELAY_SEC + 1e-6) expect(s.value).toBeGreaterThanOrEqual(100 - 1e-6);
    }
    expect(s.sinceSlapSec).toBeCloseTo(7, 6);
    expect(Math.abs(s.value - 92)).toBeLessThan(1e-6);
  });

  it('stays at 100 just before the delay ends', () => {
    let s: AngerState = { value: 100, sinceSlapSec: 0, slaps: 1 };
    for (let i = 0; i < 359; i++) s = tickAnger(s, STEP);
    expect(s.value).toBe(100);
  });

  it('never goes below 0 after 30 s', () => {
    let s: AngerState = { value: 100, sinceSlapSec: 0, slaps: 1 };
    for (let i = 0; i < 1800; i++) {
      s = tickAnger(s, STEP);
      expect(s.value).toBeGreaterThanOrEqual(0);
    }
    expect(s.value).toBe(0);
  });

  it('ignores non-finite, zero or negative dt', () => {
    const s: AngerState = { value: 50, sinceSlapSec: 8, slaps: 1 };
    for (const dt of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 0]) {
      expect(tickAnger(s, dt)).toEqual(s);
    }
  });

  it('holdDecay pauses both the delay clock and the value', () => {
    const start: AngerState = { value: 80, sinceSlapSec: 5, slaps: 2 };
    let s = start;
    for (let i = 0; i < 600; i++) s = tickAnger(s, STEP, { holdDecay: true });
    expect(s).toEqual(start);
    const past: AngerState = { value: 80, sinceSlapSec: 9, slaps: 2 };
    let p = past;
    for (let i = 0; i < 600; i++) p = tickAnger(p, STEP, { holdDecay: true });
    expect(p).toEqual(past);
  });

  it('does not mutate the input state', () => {
    const input: AngerState = Object.freeze({ value: 100, sinceSlapSec: 6.5, slaps: 1 });
    const out = tickAnger(input, 0.5);
    expect(out).not.toBe(input);
    expect(out.value).toBeCloseTo(92, 9);
    expect(input.value).toBe(100);
  });
});

describe('isCalm / satisfyAnger', () => {
  it('isCalm is strictly below 40', () => {
    expect(isCalm({ value: 39.999, sinceSlapSec: 0, slaps: 0 })).toBe(true);
    expect(isCalm({ value: 40, sinceSlapSec: 0, slaps: 0 })).toBe(false);
  });

  it('satisfyAnger zeroes the value and keeps the clock and slap count', () => {
    const s = satisfyAnger({ value: 100, sinceSlapSec: 1.25, slaps: 3 });
    expect(s).toEqual({ value: 0, sinceSlapSec: 1.25, slaps: 3 });
    expect(isAngry(s)).toBe(false);
  });

  it('createAnger starts empty', () => {
    expect(createAnger()).toEqual({ value: 0, sinceSlapSec: 0, slaps: 0 });
  });
});

describe('reactionDelaySec', () => {
  it('maps the rng into [0.2, 0.5)', () => {
    expect(reactionDelaySec(() => 0)).toBe(0.2);
    expect(reactionDelaySec(() => 0.999999)).toBeLessThan(0.5);
    const rng = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const d = reactionDelaySec(rng);
      expect(d).toBeGreaterThanOrEqual(0.2);
      expect(d).toBeLessThan(0.5);
    }
  });
});

describe('?fight=always (NPC-06 test flag)', () => {
  it('accepts only the exact literal', () => {
    expect(fightFromQuery('?fight=always')).toBe('always');
    expect(fightFromQuery('?x=1&fight=always')).toBe('always');
    expect(fightFromQuery('')).toBeNull();
    expect(fightFromQuery('?fight=ALWAYS')).toBeNull();
    expect(fightFromQuery('?fight=1')).toBeNull();
    expect(fightFromQuery('?fight=always%20')).toBeNull();
    expect(fightFromQuery('?fight=')).toBeNull();
  });

  it('effectiveTemper forces hot only with the flag', () => {
    expect(effectiveTemper('calm', 'always')).toBe('hot');
    expect(effectiveTemper('calm', null)).toBe('calm');
    expect(effectiveTemper('normal', null)).toBe('normal');
  });
});

describe('determinism (NPC-06)', () => {
  function trace(seed: number): AngerState[] {
    const rng = mulberry32(seed);
    let s = createAnger();
    const out: AngerState[] = [];
    for (let i = 0; i < 200; i++) {
      if (i % 10 === 0) s = onSlapped(s, 'calm', rng);
      else s = tickAnger(s, 1.5, { holdDecay: i % 10 < 3 });
      out.push(s);
    }
    return out;
  }

  it('same seed gives the same trace, different seeds differ', () => {
    expect(trace(1)).toEqual(trace(1));
    const a = trace(1);
    const b = trace(2);
    expect(a.some((s, i) => s.value !== b[i].value)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  MAX_ATTACKERS,
  MAX_PURSUERS,
  arbitrate,
  emptyHoldings,
  type Contender,
  type TokenHoldings,
} from '../../src/logic/attackTokens';
import { mulberry32 } from '../../src/logic/rng';

function c(id: string, anger: number, dist: number, wantsPursue = true, wantsStrike = true): Contender {
  return { id, anger, dist, wantsPursue, wantsStrike };
}

function holdings(pursue: string[], strike: string[] = []): TokenHoldings {
  return { pursue: new Set(pursue), strike: new Set(strike) };
}

function sorted(s: ReadonlySet<string>): string[] {
  return [...s].sort();
}

function deepFreeze<T extends object>(list: T[]): readonly T[] {
  for (const item of list) Object.freeze(item);
  return Object.freeze(list);
}

describe('token caps (D-07)', () => {
  it('pins the caps', () => {
    expect(MAX_PURSUERS).toBe(3);
    expect(MAX_ATTACKERS).toBe(1);
  });

  it('emptyHoldings returns two empty sets', () => {
    const h = emptyHoldings();
    expect(h.pursue.size).toBe(0);
    expect(h.strike.size).toBe(0);
    expect(emptyHoldings().pursue).not.toBe(h.pursue);
  });

  it('15 contenders wanting everything get 3 pursue and 1 strike, strike inside pursue', () => {
    const list = Array.from({ length: 15 }, (_, i) => c(`n${i}`, 100, 2 + i));
    const r = arbitrate(list, emptyHoldings());
    expect(r.pursue.size).toBe(3);
    expect(r.strike.size).toBe(1);
    for (const id of r.strike) expect(r.pursue.has(id)).toBe(true);
  });

  it('empty input gives empty sets', () => {
    const r = arbitrate([], holdings(['x'], ['x']));
    expect(r.pursue.size).toBe(0);
    expect(r.strike.size).toBe(0);
  });
});

describe('ranking and tie-breaks', () => {
  it('free pursue slots go to highest anger, then smaller dist, then id', () => {
    const list = [
      c('e', 50, 1),
      c('d', 100, 5),
      c('c', 100, 3),
      c('b', 100, 3),
      c('a', 90, 0.5),
    ];
    const r = arbitrate(list, emptyHoldings());
    expect(sorted(r.pursue)).toEqual(['b', 'c', 'd']);
    expect(sorted(r.strike)).toEqual(['b']);
  });

  it('strike goes to the best-ranked pursue holder that wants strike', () => {
    const list = [c('a', 100, 1, true, false), c('b', 90, 1, true, true), c('c', 95, 2, true, true)];
    const r = arbitrate(list, emptyHoldings());
    expect(sorted(r.pursue)).toEqual(['a', 'b', 'c']);
    expect(sorted(r.strike)).toEqual(['c']);
  });

  it('contenders that do not want pursue never get a token', () => {
    const list = [c('a', 100, 1, false, true), c('b', 10, 9, true, false)];
    const r = arbitrate(list, emptyHoldings());
    expect(sorted(r.pursue)).toEqual(['b']);
    expect(r.strike.size).toBe(0);
  });

  it('non-finite dist sorts after every finite dist', () => {
    const list = [
      c('a', 100, Number.NaN),
      c('b', 100, Number.POSITIVE_INFINITY),
      c('c', 100, 50),
      c('d', 100, 40),
      c('e', 100, Number.NEGATIVE_INFINITY),
    ];
    const r = arbitrate(list, emptyHoldings());
    // c, d finite first; then the non-finite ones by id: a.
    expect(sorted(r.pursue)).toEqual(['a', 'c', 'd']);
    expect(sorted(r.strike)).toEqual(['d']);
  });

  it('NaN anger counts as 0', () => {
    const list = [c('a', Number.NaN, 0.1), c('b', 1, 9), c('c', 0, 5), c('d', 2, 9)];
    const r = arbitrate(list, emptyHoldings());
    // b (1) and d (2) rank above a (0, dist 0.1) which ranks above c (0, dist 5).
    expect(sorted(r.pursue)).toEqual(['a', 'b', 'd']);
    expect(sorted(r.strike)).toEqual(['d']);
  });
});

describe('stickiness (holders keep their tokens)', () => {
  it('pursue holders that still want pursue keep it against a higher-anger newcomer', () => {
    const list = [c('n1', 100, 0.5), c('n5', 40, 6), c('n6', 40, 7), c('n7', 40, 8)];
    const r = arbitrate(list, holdings(['n5', 'n6', 'n7']));
    expect(sorted(r.pursue)).toEqual(['n5', 'n6', 'n7']);
  });

  it('a holder that no longer wants pursue loses it and the slot is refilled in the same call', () => {
    const list = [c('n1', 100, 0.5), c('n5', 40, 6, false, false), c('n6', 40, 7), c('n7', 40, 8)];
    const r = arbitrate(list, holdings(['n5', 'n6', 'n7']));
    expect(sorted(r.pursue)).toEqual(['n1', 'n6', 'n7']);
  });

  it('more held pursue tokens than allowed are trimmed in rank order', () => {
    const list = [c('a', 10, 1), c('b', 20, 1), c('c', 30, 1), c('d', 40, 1)];
    const r = arbitrate(list, holdings(['a', 'b', 'c', 'd']));
    expect(sorted(r.pursue)).toEqual(['b', 'c', 'd']);
  });

  it('a strike holder that still wants strike and holds pursue keeps strike against higher anger', () => {
    const list = [c('hi', 100, 1), c('low', 40, 5)];
    const r = arbitrate(list, holdings(['hi', 'low'], ['low']));
    expect(sorted(r.strike)).toEqual(['low']);
  });

  it('a strike holder that stops wanting strike loses it to the best-ranked pursue holder', () => {
    const list = [c('hi', 100, 1), c('low', 40, 5, true, false)];
    const r = arbitrate(list, holdings(['hi', 'low'], ['low']));
    expect(sorted(r.strike)).toEqual(['hi']);
  });

  it('a strike holder that loses pursue loses strike too', () => {
    const list = [c('hi', 100, 1), c('low', 40, 5, false, true)];
    const r = arbitrate(list, holdings(['hi', 'low'], ['low']));
    expect(r.pursue.has('low')).toBe(false);
    expect(sorted(r.strike)).toEqual(['hi']);
  });

  it('wantsStrike without a pursue token never gets strike', () => {
    const list = [c('p1', 10, 1, true, false), c('p2', 10, 2, true, false), c('p3', 10, 3, true, false), c('x', 100, 0.1)];
    const r = arbitrate(list, holdings(['p1', 'p2', 'p3']));
    expect(sorted(r.pursue)).toEqual(['p1', 'p2', 'p3']);
    expect(r.strike.size).toBe(0);
  });

  it('held strike without held pursue in the input is still gated by the new pursue set', () => {
    const list = [c('p1', 10, 1), c('p2', 10, 2), c('p3', 10, 3), c('x', 100, 0.1)];
    const r = arbitrate(list, holdings(['p1', 'p2', 'p3'], ['x']));
    expect(r.strike.has('x')).toBe(false);
    expect(sorted(r.strike)).toEqual(['p1']);
  });

  it('holdings naming ids missing from contenders are dropped', () => {
    const list = [c('a', 50, 1), c('b', 40, 1)];
    const r = arbitrate(list, holdings(['ghost1', 'ghost2', 'ghost3'], ['ghost1']));
    expect(sorted(r.pursue)).toEqual(['a', 'b']);
    expect(sorted(r.strike)).toEqual(['a']);
  });
});

describe('determinism and input safety (NPC-06, T-02-01-02)', () => {
  it('any permutation of the contenders gives the same result (20 seeded shuffles)', () => {
    const rngData = mulberry32(7);
    const base: Contender[] = Array.from({ length: 12 }, (_, i) =>
      c(
        `m${i}`,
        [100, 100, 80, Number.NaN][i % 4],
        [3, 3, Number.POSITIVE_INFINITY, Math.floor(rngData() * 10)][i % 4],
        i % 5 !== 0,
        i % 3 !== 0,
      ),
    );
    const held = holdings(['m4', 'm7', 'ghost'], ['m7']);
    const ref = arbitrate(base, held);
    const refP = sorted(ref.pursue);
    const refS = sorted(ref.strike);
    const rng = mulberry32(2026);
    for (let k = 0; k < 20; k++) {
      const arr = base.slice();
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      const r = arbitrate(arr, held);
      expect(sorted(r.pursue)).toEqual(refP);
      expect(sorted(r.strike)).toEqual(refS);
    }
  });

  it('duplicate ids: the first occurrence is used', () => {
    const list = [c('a', 10, 1, false, false), c('a', 100, 0.1), c('b', 5, 1)];
    const r = arbitrate(list, emptyHoldings());
    expect(sorted(r.pursue)).toEqual(['b']);
    expect(sorted(r.strike)).toEqual(['b']);
  });

  it('never mutates its inputs', () => {
    const list = deepFreeze([c('a', 100, 1), c('b', 90, 2), c('c', 80, 3), c('d', 70, 4)]);
    const heldP = new Set(['d']);
    const heldS = new Set(['d']);
    const r = arbitrate(list, { pursue: heldP, strike: heldS });
    expect(sorted(r.pursue)).toEqual(['a', 'b', 'd']);
    expect(sorted(r.strike)).toEqual(['d']);
    expect([...heldP]).toEqual(['d']);
    expect([...heldS]).toEqual(['d']);
    expect(list.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(r.pursue).not.toBe(heldP);
    expect(r.strike).not.toBe(heldS);
  });
});

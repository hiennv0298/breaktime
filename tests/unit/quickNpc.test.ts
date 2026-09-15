import { describe, expect, it } from 'vitest';
import { nextQuickCandidate, quickAdd, quickRemove } from '../../src/logic/quickNpc';
import { defaultRoster, maxOnFloor, normalizeRoster, onFloorMembers, type Roster } from '../../src/logic/roster';

/* Plan 02-04 Task 2: quick add / remove in play (D-02: next present member in roster order, last added leaves first;
   D-01: at most min(15, present members) on the floor). */

function deepFreeze<T>(v: T): T {
  if (typeof v === 'object' && v !== null) {
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
    Object.freeze(v);
  }
  return v;
}

const range = (n: number): string[] => Array.from({ length: n }, (_, i) => `m${i + 1}`);

function roster(members: number, present: string[], count: number): Roster {
  return deepFreeze(
    normalizeRoster({ members: range(members).map((id) => ({ id, name: id.toUpperCase() })), present, count }),
  );
}

describe('quickAdd', () => {
  it('default count 3 -> m4 enters, count 4', () => {
    const r = deepFreeze(defaultRoster());
    const out = quickAdd(r);
    expect(out.changed).toBe(true);
    expect(out.member?.id).toBe('m4');
    expect(out.roster.count).toBe(4);
    expect(r.count).toBe(3);
  });

  it('repeats up to 15, then changed false and member null', () => {
    let r: Roster = deepFreeze(defaultRoster());
    const entered: string[] = [];
    for (let i = 0; i < 12; i++) {
      const out = quickAdd(r);
      expect(out.changed).toBe(true);
      entered.push(out.member?.id ?? '');
      r = deepFreeze(out.roster);
    }
    expect(entered).toEqual(range(15).slice(3));
    expect(r.count).toBe(15);
    const last = quickAdd(r);
    expect(last.changed).toBe(false);
    expect(last.member).toBeNull();
    expect(last.roster).toEqual(r);
  });

  it('5 present and count 5 -> no-op', () => {
    const r = roster(8, range(5), 5);
    const out = quickAdd(r);
    expect(out.changed).toBe(false);
    expect(out.member).toBeNull();
    expect(out.roster.count).toBe(5);
  });

  it('skips members that are not present', () => {
    const r = roster(6, ['m1', 'm3', 'm6'], 1);
    const out = quickAdd(r);
    expect(out.member?.id).toBe('m3');
    expect(onFloorMembers(out.roster).map((m) => m.id)).toEqual(['m1', 'm3']);
  });

  it('30 members all present still stops at 15', () => {
    const r = roster(30, range(30), 15);
    expect(maxOnFloor(r)).toBe(15);
    expect(quickAdd(r).changed).toBe(false);
  });
});

describe('quickRemove', () => {
  it('count 4 -> m4 leaves, count 3', () => {
    const r = roster(15, range(15), 4);
    const out = quickRemove(r);
    expect(out.changed).toBe(true);
    expect(out.member?.id).toBe('m4');
    expect(out.member?.name).toBe('M4');
    expect(out.roster.count).toBe(3);
  });

  it('at 0 -> no-op', () => {
    const r = roster(15, range(15), 0);
    const out = quickRemove(r);
    expect(out.changed).toBe(false);
    expect(out.member).toBeNull();
    expect(out.roster.count).toBe(0);
  });

  it('add then remove returns the same member (LIFO)', () => {
    const r = deepFreeze(defaultRoster());
    const added = quickAdd(r);
    const removed = quickRemove(deepFreeze(added.roster));
    expect(removed.member).toEqual(added.member);
    expect(removed.roster).toEqual(defaultRoster());
  });

  it('nothing present -> no-op at both ends', () => {
    const r = roster(5, [], 0);
    expect(quickAdd(r).changed).toBe(false);
    expect(quickRemove(r).changed).toBe(false);
  });
});

describe('nextQuickCandidate', () => {
  it('default -> m4', () => {
    expect(nextQuickCandidate(deepFreeze(defaultRoster()))?.id).toBe('m4');
  });

  it('at maxOnFloor -> null', () => {
    expect(nextQuickCandidate(roster(8, range(5), 5))).toBeNull();
    expect(nextQuickCandidate(roster(20, range(20), 15))).toBeNull();
  });
});

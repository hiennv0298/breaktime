import { describe, expect, it } from 'vitest';
import {
  addMember,
  DEFAULT_NAMES,
  defaultRoster,
  LEGACY_SLOTS,
  removeMember,
  renameMember,
  resetRoster,
  setMemberLook,
  setMemberPresent,
  setMemberTemper,
  maxOnFloor,
  migrateLegacyNpcs,
  normalizeRoster,
  NPC_CAP,
  NPC_LOOKS,
  onFloorMembers,
  parseRoster,
  presentMembers,
  resolveStartRoster,
  ROSTER_DEFAULT_COUNT,
  ROSTER_KEY,
  ROSTER_MAX_MEMBERS,
  ROSTER_MAX_RAW,
  ROSTER_VERSION,
  rosterCountFromQuery,
  serializeRoster,
  type Roster,
} from '../../src/logic/roster';

/* Plan 02-04 Task 1: roster schema, hostile input, bt.roster serialisation, bt.npcs v1 migration, start resolution
   (D-01, D-03, G4, security V5). Hostile characters are built with String.fromCodePoint, never escape sequences. */

const ids = (r: Roster): string[] => r.members.map((m) => m.id);
const range = (n: number): string[] => Array.from({ length: n }, (_, i) => `m${i + 1}`);

function member(id: string, name = '', look = 'b', temper = 'normal'): Record<string, unknown> {
  return { id, name, look, temper };
}

function stored(members: unknown[], present: unknown[], count: unknown): string {
  return JSON.stringify({ v: 1, members, present, count });
}

describe('constants', () => {
  it('pins the roster limits and keys', () => {
    expect(ROSTER_KEY).toBe('bt.roster');
    expect(ROSTER_VERSION).toBe(1);
    expect(ROSTER_MAX_MEMBERS).toBe(30);
    expect(ROSTER_MAX_RAW).toBe(8192);
    expect(NPC_CAP).toBe(15);
    expect(NPC_LOOKS).toBe('bcdefghijklmnopqr');
    expect(NPC_LOOKS.length).toBe(17);
    expect(NPC_LOOKS.includes('a')).toBe(false);
    expect(ROSTER_DEFAULT_COUNT).toBe(3);
    expect(LEGACY_SLOTS).toBe(10);
  });
});

describe('defaultRoster', () => {
  it('has m1..m15 with the default job titles, looks b..p, normal temper, all present, count 3', () => {
    const r = defaultRoster();
    expect(ids(r)).toEqual(range(15));
    expect(r.members.map((m) => m.name)).toEqual([...DEFAULT_NAMES]);
    expect(r.members.map((m) => m.look).join('')).toBe('bcdefghijklmnop');
    expect(r.members.every((m) => m.temper === 'normal')).toBe(true);
    expect(r.present).toEqual(range(15));
    expect(r.count).toBe(3);
  });

  it('returns a fresh object every call', () => {
    const a = defaultRoster();
    const b = defaultRoster();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.members[0]).not.toBe(b.members[0]);
  });
});

describe('normalizeRoster (hostile input)', () => {
  it.each([null, undefined, 42, 'x', [], true])('non-object %s -> empty roster', (input) => {
    expect(normalizeRoster(input)).toEqual({ members: [], present: [], count: 0 });
  });

  it('keeps at most 30 members', () => {
    const members = Array.from({ length: 40 }, (_, i) => member(`m${i + 1}`));
    const r = normalizeRoster({ members, present: [], count: 0 });
    expect(r.members.length).toBe(30);
    expect(ids(r)).toEqual(range(30));
  });

  it('scans only the first 200 member entries', () => {
    const junk = Array.from({ length: 200 }, () => 1);
    const r = normalizeRoster({ members: [...junk, member('m1')], present: ['m1'], count: 1 });
    expect(r.members).toEqual([]);
    expect(r.present).toEqual([]);
    expect(r.count).toBe(0);
  });

  it('scans only the first 200 present entries', () => {
    const junk = Array.from({ length: 200 }, () => 'm999');
    const r = normalizeRoster({ members: [member('m1')], present: [...junk, 'm1'], count: 1 });
    expect(r.present).toEqual([]);
  });

  it('skips non-object entries, malformed and duplicate ids', () => {
    const r = normalizeRoster({
      members: [
        null,
        'm1',
        [member('m9')],
        member('m1', 'first'),
        member('m1', 'dup'),
        member('x1'),
        member('m1234'),
        member('M2'),
        member(' m2'),
        { id: 2 },
        member('m2', 'second'),
      ],
      present: [],
      count: 0,
    });
    expect(ids(r)).toEqual(['m1', 'm2']);
    expect(r.members[0].name).toBe('first');
  });

  it('falls back for unknown looks and tempers', () => {
    const r = normalizeRoster({
      members: [
        member('m1', '', 'a', 'angry'),
        member('m2', '', 'bb', 'HOT'),
        { id: 'm3' },
        member('m4', '', 'r', 'calm'),
      ],
      present: [],
      count: 0,
    });
    expect(r.members.map((m) => m.look)).toEqual(['b', 'c', 'd', 'r']);
    expect(r.members.map((m) => m.temper)).toEqual(['normal', 'normal', 'normal', 'calm']);
  });

  it('look fallback wraps at 17', () => {
    const members = Array.from({ length: 19 }, (_, i) => ({ id: `m${i + 1}` }));
    const r = normalizeRoster({ members, present: [], count: 0 });
    expect(r.members[16].look).toBe('r');
    expect(r.members[17].look).toBe('b');
    expect(r.members[18].look).toBe('c');
  });

  it('present keeps known member ids, de-duplicated, in member order, at most 15', () => {
    const members = Array.from({ length: 20 }, (_, i) => member(`m${i + 1}`));
    const r = normalizeRoster({
      members,
      present: ['m3', 'm1', 'm3', 'm999', 7, null, ...range(20).reverse()],
      count: 2,
    });
    expect(r.present).toEqual(range(15));
    expect(r.count).toBe(2);
  });

  it('count: trunc of a finite number clamped to 0..min(15, present); otherwise min(3, present)', () => {
    const members = range(5).map((id) => member(id));
    const base = { members, present: range(5) };
    expect(normalizeRoster({ ...base, count: 4.9 }).count).toBe(4);
    expect(normalizeRoster({ ...base, count: 99 }).count).toBe(5);
    expect(normalizeRoster({ ...base, count: -3 }).count).toBe(0);
    expect(normalizeRoster({ ...base, count: Number.NaN }).count).toBe(3);
    expect(normalizeRoster({ ...base, count: Number.POSITIVE_INFINITY }).count).toBe(3);
    expect(normalizeRoster({ ...base, count: '4' }).count).toBe(3);
    expect(normalizeRoster({ members, present: ['m1', 'm2'] }).count).toBe(2);
    expect(normalizeRoster({ members, present: [] }).count).toBe(0);
  });

  it('prototype pollution payload copies only whitelisted fields', () => {
    const raw =
      '{"v":1,"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":1}},' +
      '"members":[{"id":"m1","name":"A","look":"b","temper":"hot","__proto__":{"x":1}}],' +
      '"present":["m1","m1","m999","__proto__"],"count":99}';
    const { roster, valid } = parseRoster(raw);
    expect(valid).toBe(true);
    expect(roster.members.length).toBe(1);
    expect(Object.keys(roster.members[0]).sort()).toEqual(['id', 'look', 'name', 'temper']);
    expect(roster.members[0]).toEqual({ id: 'm1', name: 'A', look: 'b', temper: 'hot' });
    expect(Object.getPrototypeOf(roster.members[0])).toBe(Object.prototype);
    expect((roster.members[0] as unknown as Record<string, unknown>).x).toBeUndefined();
    expect(roster.present).toEqual(['m1']);
    expect(roster.count).toBe(1);
    expect(Object.keys(roster).sort()).toEqual(['count', 'members', 'present']);
    expect(Object.getPrototypeOf(roster)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((Object.prototype as unknown as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('names go through the Phase 1 sanitiser', () => {
    const emoji = String.fromCodePoint(0x1f600);
    const rlo = String.fromCodePoint(0x202e);
    const r = normalizeRoster({
      members: [member('m1', emoji.repeat(20)), member('m2', `${rlo}gnp.exe`), member('m3', '<img src=x onerror=alert(1)>'), { id: 'm4', name: 42 }],
      present: [],
      count: 0,
    });
    expect(Array.from(r.members[0].name)).toEqual(Array.from({ length: 16 }, () => emoji));
    expect(r.members[1].name).toBe('gnp.exe');
    expect(r.members[2].name).toBe('<img src=x onerr');
    expect(r.members[3].name).toBe('');
  });

  it('a valid roster normalises to itself', () => {
    const r = defaultRoster();
    expect(normalizeRoster(r)).toEqual(r);
  });
});

describe('parseRoster', () => {
  it.each([
    ['null input', null],
    ['empty', ''],
    ['bad json', '{bad'],
    ['json null', 'null'],
    ['array', '[]'],
    ['other version', JSON.stringify({ v: 2, members: [], present: [], count: 0 })],
    ['no version', JSON.stringify({ members: [], present: [], count: 0 })],
  ])('%s -> invalid default roster', (_label, raw) => {
    const out = parseRoster(raw);
    expect(out.valid).toBe(false);
    expect(out.roster).toEqual(defaultRoster());
  });

  it('raw longer than 8192 characters is rejected before parsing', () => {
    const base = stored([member('m1')], ['m1'], 1);
    const raw = base.slice(0, -1) + ' '.repeat(8193 - base.length) + '}';
    expect(raw.length).toBe(8193);
    expect(JSON.parse(raw)).toBeTruthy();
    const out = parseRoster(raw);
    expect(out.valid).toBe(false);
    expect(out.roster).toEqual(defaultRoster());
  });

  it('a valid v1 string is valid', () => {
    const out = parseRoster(stored([member('m1', 'Minh', 'c', 'calm')], ['m1'], 1));
    expect(out.valid).toBe(true);
    expect(out.roster).toEqual({
      members: [{ id: 'm1', name: 'Minh', look: 'c', temper: 'calm' }],
      present: ['m1'],
      count: 1,
    });
  });
});

describe('serializeRoster', () => {
  it('round-trips through parseRoster', () => {
    const r = normalizeRoster({
      members: [member('m2', 'Lan', 'q', 'hot'), member('m1', 'Minh', 'b', 'calm')],
      present: ['m1', 'm2'],
      count: 1,
    });
    const out = parseRoster(serializeRoster(r));
    expect(out.valid).toBe(true);
    expect(out.roster).toEqual(r);
  });

  it('writes keys in the order v, members, present, count', () => {
    const s = serializeRoster(defaultRoster());
    expect(Object.keys(JSON.parse(s))).toEqual(['v', 'members', 'present', 'count']);
    expect(s.startsWith('{"v":1,"members":[{"id":"m1","name":"BOSS","look":"b","temper":"normal"}')).toBe(true);
  });

  it('30 members with 16-emoji names and 15 present fit in ROSTER_MAX_RAW', () => {
    const emoji = String.fromCodePoint(0x1f600);
    const members = Array.from({ length: 30 }, (_, i) => member(`m${i + 100}`, emoji.repeat(16), 'r', 'normal'));
    const r = normalizeRoster({ members, present: members.map((m) => m.id), count: 15 });
    expect(r.members.length).toBe(30);
    expect(r.present.length).toBe(15);
    const s = serializeRoster(r);
    expect(s.length).toBeLessThanOrEqual(ROSTER_MAX_RAW);
    expect(parseRoster(s).roster).toEqual(r);
  });

  it('normalises before writing', () => {
    const dirty = { members: [member('m1', 'A'), member('m1', 'B')], present: ['m1', 'm1'], count: 9 } as unknown as Roster;
    expect(JSON.parse(serializeRoster(dirty))).toEqual({
      v: 1,
      members: [{ id: 'm1', name: 'A', look: 'b', temper: 'normal' }],
      present: ['m1'],
      count: 1,
    });
  });
});

describe('migrateLegacyNpcs (bt.npcs v1, one way)', () => {
  it('puts the 10 legacy names on m1..m10 with the same looks, keeps count, 15 present', () => {
    const r = migrateLegacyNpcs('{"v":1,"count":5,"names":["Minh","Lan","","","","","","","",""]}');
    expect(r).not.toBeNull();
    const m = r as Roster;
    expect(ids(m)).toEqual(range(15));
    // Slots the player never named fall back to their job title instead of showing a blank tag.
    expect(m.members.map((x) => x.name)).toEqual(['Minh', 'Lan', ...DEFAULT_NAMES.slice(2)]);
    expect(m.members.map((x) => x.look).join('')).toBe('bcdefghijklmnop');
    expect(m.members.every((x) => x.temper === 'normal')).toBe(true);
    expect(m.present).toEqual(range(15));
    expect(m.count).toBe(5);
  });

  it('ignores legacy names beyond LEGACY_SLOTS and keeps the default titles there', () => {
    const list = Array.from({ length: 14 }, (_, i) => `N${i + 1}`);
    const m = migrateLegacyNpcs(JSON.stringify({ v: 1, count: 10, names: list })) as Roster;
    expect(m.members.map((x) => x.name)).toEqual([...list.slice(0, 10), ...DEFAULT_NAMES.slice(10)]);
    expect(m.count).toBe(10);
  });

  it.each([null, '', '{bad', '[]', JSON.stringify({ v: 2, count: 3, names: [] })])('invalid legacy %s -> null', (raw) => {
    expect(migrateLegacyNpcs(raw)).toBeNull();
  });

  it('sanitises legacy names', () => {
    const rlo = String.fromCodePoint(0x202e);
    const m = migrateLegacyNpcs(JSON.stringify({ v: 1, count: 1, names: [`${rlo}gnp.exe`] })) as Roster;
    expect(m.members[0].name).toBe('gnp.exe');
  });
});

describe('rosterCountFromQuery', () => {
  it.each([
    ['', null],
    ['?npcs=abc', null],
    ['?other=1', null],
    ['?npcs=7', 7],
    ['?npcs=99', 15],
    ['?npcs=-1', 0],
    ['?npcs=2.9', 2],
    ['?npcs=15', 15],
    ['?npcs=0', 0],
  ])('%s -> %s', (search, expected) => {
    expect(rosterCountFromQuery(search)).toBe(expected);
  });
});

describe('resolveStartRoster', () => {
  const legacy = '{"v":1,"count":5,"names":["Minh","Lan","","","","","","","",""]}';
  const fivePresent = stored(
    range(8).map((id, i) => member(id, `N${i + 1}`)),
    range(5),
    2,
  );

  it('nothing stored -> default, count 3', () => {
    const out = resolveStartRoster({ search: '', rosterRaw: null, legacyRaw: null });
    expect(out.source).toBe('default');
    expect(out.roster).toEqual(defaultRoster());
    expect(out.roster.count).toBe(3);
  });

  it('valid bt.roster -> stored; legacy ignored', () => {
    const out = resolveStartRoster({ search: '', rosterRaw: fivePresent, legacyRaw: legacy });
    expect(out.source).toBe('stored');
    expect(out.roster).toEqual(parseRoster(fivePresent).roster);
    expect(out.roster.count).toBe(2);
  });

  it('invalid bt.roster + valid legacy -> migrated', () => {
    const out = resolveStartRoster({ search: '', rosterRaw: '{bad', legacyRaw: legacy });
    expect(out.source).toBe('migrated');
    expect(out.roster).toEqual(migrateLegacyNpcs(legacy));
  });

  it('invalid bt.roster + invalid legacy -> default', () => {
    const out = resolveStartRoster({ search: '', rosterRaw: '{bad', legacyRaw: '[]' });
    expect(out.source).toBe('default');
    expect(out.roster).toEqual(defaultRoster());
  });

  it('?npcs=7 over a stored roster with 5 present -> count 5, source query, stored members', () => {
    const out = resolveStartRoster({ search: '?npcs=7', rosterRaw: fivePresent, legacyRaw: null });
    expect(out.source).toBe('query');
    expect(out.roster.count).toBe(5);
    expect(out.roster.members).toEqual(parseRoster(fivePresent).roster.members);
  });

  it('?npcs= over a migrated roster keeps the legacy names', () => {
    const out = resolveStartRoster({ search: '?npcs=12', rosterRaw: null, legacyRaw: legacy });
    expect(out.source).toBe('query');
    expect(out.roster.count).toBe(12);
    expect(out.roster.members[0].name).toBe('Minh');
  });

  it('forcedCount 10 beats ?npcs=3', () => {
    const out = resolveStartRoster({ search: '?npcs=3', rosterRaw: null, legacyRaw: null, forcedCount: 10 });
    expect(out.source).toBe('query');
    expect(out.roster.count).toBe(10);
  });

  it('non-finite forcedCount is ignored', () => {
    for (const forcedCount of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const q = resolveStartRoster({ search: '?npcs=4', rosterRaw: null, legacyRaw: null, forcedCount });
      expect(q.source).toBe('query');
      expect(q.roster.count).toBe(4);
      const d = resolveStartRoster({ search: '', rosterRaw: null, legacyRaw: null, forcedCount });
      expect(d.source).toBe('default');
      expect(d.roster.count).toBe(3);
    }
  });

  it('forcedCount is truncated and clamped to the cap', () => {
    expect(resolveStartRoster({ search: '', rosterRaw: null, legacyRaw: null, forcedCount: 99 }).roster.count).toBe(15);
    expect(resolveStartRoster({ search: '', rosterRaw: null, legacyRaw: null, forcedCount: 4.7 }).roster.count).toBe(4);
    expect(resolveStartRoster({ search: '', rosterRaw: null, legacyRaw: null, forcedCount: -2 }).roster.count).toBe(0);
  });

  it('bench uses the default members regardless of stored text', () => {
    const out = resolveStartRoster({ search: '', rosterRaw: fivePresent, legacyRaw: legacy, forcedCount: 10, bench: true });
    expect(out.source).toBe('query');
    expect(out.roster.members).toEqual(defaultRoster().members);
    expect(out.roster.present).toEqual(range(15));
    expect(out.roster.count).toBe(10);
  });
});

describe('present / on-floor helpers', () => {
  it('follow member order', () => {
    const r = defaultRoster();
    expect(presentMembers(r).map((m) => m.id)).toEqual(range(15));
    expect(onFloorMembers(r).map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(maxOnFloor(r)).toBe(15);
  });

  it('unticking m2 in the default roster puts m1, m3, m4 on the floor', () => {
    const d = defaultRoster();
    const r = normalizeRoster({ members: d.members, present: d.present.filter((id) => id !== 'm2'), count: 3 });
    expect(onFloorMembers(r).map((m) => m.id)).toEqual(['m1', 'm3', 'm4']);
    expect(maxOnFloor(r)).toBe(14);
  });

  it('maxOnFloor is capped at 15 and by present members', () => {
    const members = range(30).map((id) => member(id));
    expect(maxOnFloor(normalizeRoster({ members, present: range(30), count: 0 }))).toBe(15);
    expect(maxOnFloor(normalizeRoster({ members, present: ['m7', 'm2'], count: 0 }))).toBe(2);
    expect(presentMembers(normalizeRoster({ members, present: ['m7', 'm2'], count: 0 })).map((m) => m.id)).toEqual(['m2', 'm7']);
  });
});

/* Plan 02-04 Task 2: edit operations for the settings editor (D-03) and the 01-27 adapter. Inputs are deep-frozen, so
   any mutation throws in strict-mode ESM. */

function deepFreeze<T>(v: T): T {
  if (typeof v === 'object' && v !== null) {
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
    Object.freeze(v);
  }
  return v;
}

const frozenDefault = (): Roster => deepFreeze(defaultRoster());
const neverRng = (): number => {
  throw new Error('rng must not be drawn while a look is free');
};

describe('addMember', () => {
  it('default roster: m16 with the first unused look q, not present (15 already), count unchanged', () => {
    const r = frozenDefault();
    const out = addMember(r, neverRng);
    expect(out.added).toEqual({ id: 'm16', name: '', look: 'q', temper: 'normal' });
    expect(ids(out.roster)).toEqual(range(16));
    expect(out.roster.present).toEqual(range(15));
    expect(out.roster.count).toBe(3);
    expect(r).toEqual(defaultRoster());
  });

  it('30 members -> added null and roster unchanged', () => {
    const full = deepFreeze(normalizeRoster({ members: range(30).map((id) => member(id)), present: range(15), count: 4 }));
    const out = addMember(full, neverRng);
    expect(out.added).toBeNull();
    expect(out.roster).toEqual(full);
  });

  it('reuses the smallest free id and becomes present while fewer than 15 are present', () => {
    const r = deepFreeze(removeMember(frozenDefault(), 'm3'));
    const out = addMember(r, neverRng);
    expect(out.added).toEqual({ id: 'm3', name: '', look: 'd', temper: 'normal' });
    expect(out.roster.members[out.roster.members.length - 1].id).toBe('m3');
    expect(out.roster.present.length).toBe(15);
    expect(out.roster.present.includes('m3')).toBe(true);
  });

  it('when all 17 looks are used the look is NPC_LOOKS[floor(rng() x 17)]', () => {
    const all = deepFreeze(
      normalizeRoster({ members: range(17).map((id, i) => member(id, '', NPC_LOOKS[i])), present: [], count: 0 }),
    );
    expect(addMember(all, () => 0).added?.look).toBe('b');
    expect(addMember(all, () => 0.5).added?.look).toBe(NPC_LOOKS[8]);
    expect(addMember(all, () => 0.9999999).added?.look).toBe('r');
    expect(addMember(all, () => 1).added?.look).toBe('r');
    expect(addMember(all, () => Number.NaN).added?.look).toBe('b');
    expect(addMember(all, () => -1).added?.look).toBe('b');
    expect(addMember(all, () => 0.5).added?.id).toBe('m18');
  });
});

describe('removeMember', () => {
  it('drops the member and its present entry and clamps count', () => {
    const small = deepFreeze(normalizeRoster({ members: range(3).map((id) => member(id)), present: range(3), count: 3 }));
    const out = removeMember(small, 'm2');
    expect(ids(out)).toEqual(['m1', 'm3']);
    expect(out.present).toEqual(['m1', 'm3']);
    expect(out.count).toBe(2);
  });

  it('unknown id -> unchanged', () => {
    const r = frozenDefault();
    expect(removeMember(r, 'm99')).toEqual(defaultRoster());
    expect(removeMember(r, '__proto__')).toEqual(defaultRoster());
  });
});

describe('renameMember / setMemberLook / setMemberTemper', () => {
  it('renameMember sanitises', () => {
    const rlo = String.fromCodePoint(0x202e);
    const r = frozenDefault();
    const out = renameMember(r, 'm2', `  ${rlo}Lan   Anh  `);
    expect(out.members[1].name).toBe('Lan Anh');
    expect(renameMember(r, 'm2', 42).members[1].name).toBe('');
    expect(renameMember(r, 'm99', 'X')).toEqual(defaultRoster());
  });

  it('setMemberLook accepts only one NPC_LOOKS letter', () => {
    const r = frozenDefault();
    expect(setMemberLook(r, 'm1', 'r').members[0].look).toBe('r');
    for (const bad of ['a', 'bb', '', 'B', 3, null, 'z']) {
      expect(setMemberLook(r, 'm1', bad), String(bad)).toEqual(defaultRoster());
    }
    expect(setMemberLook(r, 'm99', 'r')).toEqual(defaultRoster());
  });

  it('setMemberTemper accepts only hot / normal / calm', () => {
    const r = frozenDefault();
    expect(setMemberTemper(r, 'm1', 'hot').members[0].temper).toBe('hot');
    expect(setMemberTemper(r, 'm1', 'calm').members[0].temper).toBe('calm');
    for (const bad of ['HOT', 'angry', '', null, 1]) {
      expect(setMemberTemper(r, 'm1', bad), String(bad)).toEqual(defaultRoster());
    }
  });
});

describe('setMemberPresent', () => {
  it('on adds only while fewer than 15 are present', () => {
    const r = deepFreeze(addMember(frozenDefault(), neverRng).roster);
    expect(setMemberPresent(r, 'm16', true)).toEqual(r);
    const freed = deepFreeze(setMemberPresent(r, 'm1', false));
    const out = setMemberPresent(freed, 'm16', true);
    expect(out.present).toEqual([...range(15).slice(1), 'm16']);
  });

  it('off removes and clamps count', () => {
    const small = deepFreeze(normalizeRoster({ members: range(3).map((id) => member(id)), present: range(3), count: 3 }));
    const out = setMemberPresent(small, 'm1', false);
    expect(out.present).toEqual(['m2', 'm3']);
    expect(out.count).toBe(2);
  });

  it('unknown id or no change -> unchanged', () => {
    const r = frozenDefault();
    expect(setMemberPresent(r, 'm99', true)).toEqual(defaultRoster());
    expect(setMemberPresent(r, 'm1', true)).toEqual(defaultRoster());
  });
});

describe('resetRoster', () => {
  it('deep-equals defaultRoster()', () => {
    expect(resetRoster()).toEqual(defaultRoster());
  });
});
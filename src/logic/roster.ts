/**
 * Coworker roster (plan 02-04; D-01 cap 15 on the floor, D-03 roster shape, D-04 free-typed names, G4 storage).
 * Pure: no three.js, no Rapier, no DOM, no storage, no clock and no Math.random (D-12, NPC-06), so it runs in Node
 * under Vitest. The game reads and writes the serialized form itself, inside try/catch.
 *
 * Shape: up to 30 members (id m<digits>, name, one of 17 Blocky looks 'b'..'r' — 'a' stays the player's — and a temper);
 * up to 15 of them are ticked present, and the office shows the first `count` present members in roster order.
 *
 * Storage (G4, RESEARCH Pitfall 2): localStorage['bt.roster'] is the only key this build ever writes for coworkers.
 * localStorage['bt.npcs'] (Phase 1 v1 record) is read-only here: old builds under /b/<sha>/ share the origin and keep
 * writing it, so it is migrated one way on first read and never written back.
 *
 * Privacy / content (D-04, Phase 1 D-29 / D-31): names stay on this device and are never sent anywhere. Player-typed
 * names may be real people's names; the operator accepted this for the play-test only, review before Phase 9.
 *
 * Tampering (T-02-04-01/02): raw text over 8192 characters is ignored before JSON.parse; the record must be a plain
 * object with v === 1; only the first 200 entries of each array are scanned; parsing copies whitelisted fields into
 * fresh { id, name, look, temper } literals and fresh arrays, never merging parsed objects.
 */

import { parseNpcSettings, sanitizeNpcName } from './npcSettings';
import { DEFAULT_TEMPER, isTemper, type Temper } from './temper';

/** The only storage key this build writes for coworkers (G4). */
export const ROSTER_KEY = 'bt.roster';
export const ROSTER_VERSION = 1;
/** Most members a roster keeps (D-03). */
export const ROSTER_MAX_MEMBERS = 30;
/** A stored string longer than this is ignored without parsing (T-02-04-02). */
export const ROSTER_MAX_RAW = 8192;
/** Most coworkers present / on the floor at once (D-01). */
export const NPC_CAP = 15;
/** 17 Blocky looks for coworkers; 'a' stays the player's (D-03). */
export const NPC_LOOKS = 'bcdefghijklmnopqr';
/** On-floor count when nothing says otherwise (Phase 1 D-11). */
export const ROSTER_DEFAULT_COUNT = 3;
/** Name slots of the Phase 1 bt.npcs v1 record. */
export const LEGACY_SLOTS = 10;

/** Array entries scanned per list; the rest are ignored (T-02-04-02). */
const SCAN_LIMIT = 200;
const ID_PATTERN = /^m[0-9]{1,3}$/;

export interface RosterMember {
  id: string;
  name: string;
  look: string;
  temper: Temper;
}

export interface Roster {
  members: RosterMember[];
  present: string[];
  count: number;
}

/** 'manual' = settings editor, 'quick' = +/− in play, 'query' = ?npcs= or a forced (bench / soak) count. */
export type RosterSource = 'default' | 'stored' | 'migrated' | 'query' | 'manual' | 'quick';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function ownField(obj: Record<string, unknown>, key: string): unknown {
  return hasOwn(obj, key) ? obj[key] : undefined;
}

function isLook(v: unknown): v is string {
  return typeof v === 'string' && v.length === 1 && NPC_LOOKS.includes(v);
}

/** m1..m15, names '', looks b..p, temper normal, all present, count 3. */
export function defaultRoster(): Roster {
  const members: RosterMember[] = [];
  const present: string[] = [];
  for (let i = 0; i < NPC_CAP; i++) {
    const id = `m${i + 1}`;
    members.push({ id, name: '', look: NPC_LOOKS[i], temper: DEFAULT_TEMPER });
    present.push(id);
  }
  return { members, present, count: ROSTER_DEFAULT_COUNT };
}

function clampCount(v: unknown, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return Math.min(ROSTER_DEFAULT_COUNT, max);
  return Math.max(0, Math.min(max, Math.trunc(v)));
}

/** Any value → a bounded roster built only from whitelisted fields. */
export function normalizeRoster(input: unknown): Roster {
  if (!isPlainObject(input)) return { members: [], present: [], count: 0 };

  const members: RosterMember[] = [];
  const seen = new Set<string>();
  const rawMembers = ownField(input, 'members');
  if (Array.isArray(rawMembers)) {
    const n = Math.min(rawMembers.length, SCAN_LIMIT);
    for (let i = 0; i < n && members.length < ROSTER_MAX_MEMBERS; i++) {
      const entry: unknown = rawMembers[i];
      if (!isPlainObject(entry)) continue;
      const id = ownField(entry, 'id');
      if (typeof id !== 'string' || !ID_PATTERN.test(id) || seen.has(id)) continue;
      const look = ownField(entry, 'look');
      const temper = ownField(entry, 'temper');
      seen.add(id);
      members.push({
        id,
        name: sanitizeNpcName(ownField(entry, 'name')),
        look: isLook(look) ? look : NPC_LOOKS[members.length % NPC_LOOKS.length],
        temper: isTemper(temper) ? temper : DEFAULT_TEMPER,
      });
    }
  }

  const wanted = new Set<string>();
  const rawPresent = ownField(input, 'present');
  if (Array.isArray(rawPresent)) {
    const n = Math.min(rawPresent.length, SCAN_LIMIT);
    for (let i = 0; i < n; i++) {
      const id: unknown = rawPresent[i];
      if (typeof id === 'string' && seen.has(id)) wanted.add(id);
    }
  }
  const present: string[] = [];
  for (const m of members) {
    if (present.length >= NPC_CAP) break;
    if (wanted.has(m.id)) present.push(m.id);
  }

  return { members, present, count: clampCount(ownField(input, 'count'), Math.min(NPC_CAP, present.length)) };
}

/** Parses stored text; anything missing, oversized, malformed or of another version gives the default roster. */
export function parseRoster(raw: string | null): { roster: Roster; valid: boolean } {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > ROSTER_MAX_RAW) {
    return { roster: defaultRoster(), valid: false };
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { roster: defaultRoster(), valid: false };
  }
  if (!isPlainObject(data) || ownField(data, 'v') !== ROSTER_VERSION) return { roster: defaultRoster(), valid: false };
  return { roster: normalizeRoster(data), valid: true };
}

/** {"v":1,"members":[…],"present":[…],"count":n} of the normalised roster. */
export function serializeRoster(r: Roster): string {
  const n = normalizeRoster(r);
  return JSON.stringify({
    v: ROSTER_VERSION,
    members: n.members.map((m) => ({ id: m.id, name: m.name, look: m.look, temper: m.temper })),
    present: n.present,
    count: n.count,
  });
}

/**
 * One-way migration of a Phase 1 bt.npcs v1 record: the default roster with the 10 legacy names on m1..m10 (NPC k kept
 * texture 'b'+k, so the office looks exactly as before the upgrade), count kept, 15 present. null when invalid.
 * Never writes anything back to bt.npcs.
 */
export function migrateLegacyNpcs(legacyRaw: string | null): Roster | null {
  const legacy = parseNpcSettings(legacyRaw);
  if (!legacy.valid) return null;
  const base = defaultRoster();
  const members: RosterMember[] = base.members.map((m, i) => ({
    id: m.id,
    name: i < LEGACY_SLOTS ? sanitizeNpcName(legacy.settings.names[i]) : '',
    look: m.look,
    temper: m.temper,
  }));
  return normalizeRoster({ members, present: base.present, count: legacy.settings.count });
}

/** ?npcs=N as an integer clamped to [0, NPC_CAP]; null when absent or unparsable. */
export function rosterCountFromQuery(search: string): number | null {
  const raw = new URLSearchParams(search).get('npcs');
  if (raw === null) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(NPC_CAP, n));
}

function withCount(r: Roster, count: number): Roster {
  return normalizeRoster({ members: r.members, present: r.present, count: Math.min(count, maxOnFloor(r)) });
}

/**
 * Start roster. Members: bench → default members; else valid bt.roster ('stored') > valid bt.npcs migration
 * ('migrated') > default. Count: finite forcedCount (bench / soak) > ?npcs= > the roster's own count; a forced or
 * query count reports source 'query' and is clamped to the present members.
 */
export function resolveStartRoster(o: {
  search: string;
  rosterRaw: string | null;
  legacyRaw: string | null;
  forcedCount?: number;
  bench?: boolean;
}): { roster: Roster; source: RosterSource } {
  const forced =
    typeof o.forcedCount === 'number' && Number.isFinite(o.forcedCount)
      ? Math.max(0, Math.min(NPC_CAP, Math.trunc(o.forcedCount)))
      : null;
  const q = forced !== null ? forced : rosterCountFromQuery(o.search);

  let roster: Roster;
  let source: RosterSource;
  if (o.bench === true) {
    roster = defaultRoster();
    source = 'default';
  } else {
    const stored = parseRoster(o.rosterRaw);
    const migrated = stored.valid ? null : migrateLegacyNpcs(o.legacyRaw);
    if (stored.valid) {
      roster = stored.roster;
      source = 'stored';
    } else if (migrated !== null) {
      roster = migrated;
      source = 'migrated';
    } else {
      roster = defaultRoster();
      source = 'default';
    }
  }

  if (q !== null) return { roster: withCount(roster, q), source: 'query' };
  return { roster, source };
}

/** Present members in roster order. */
export function presentMembers(r: Roster): RosterMember[] {
  const on = new Set(r.present);
  return r.members.filter((m) => on.has(m.id)).slice(0, NPC_CAP);
}

/** The members in the office: the first `count` present members. */
export function onFloorMembers(r: Roster): RosterMember[] {
  return presentMembers(r).slice(0, Math.max(0, r.count));
}

/** Highest possible on-floor count: min(15, present members). */
export function maxOnFloor(r: Roster): number {
  return Math.min(NPC_CAP, presentMembers(r).length);
}

/* ---- Edit operations (settings editor, D-03). Each returns normalizeRoster(result) built from fresh objects and never
   mutates its input. ---- */

/** Same as defaultRoster() (settings editor "reset"). */
export function resetRoster(): Roster {
  return defaultRoster();
}

function copyMember(m: RosterMember): RosterMember {
  return { id: m.id, name: m.name, look: m.look, temper: m.temper };
}

/** Index into a list of `size` from one rng draw; non-finite or out-of-range draws are clamped. */
function pickIndex(draw: number, size: number): number {
  if (!Number.isFinite(draw)) return 0;
  return Math.max(0, Math.min(size - 1, Math.floor(draw * size)));
}

/** Rebuilds the roster with one member changed by `edit`; unknown id → normalised copy. */
function editMember(r: Roster, id: string, edit: (m: RosterMember) => RosterMember): Roster {
  const base = normalizeRoster(r);
  const members = base.members.map((m) => (m.id === id ? edit(copyMember(m)) : copyMember(m)));
  return normalizeRoster({ members, present: base.present.slice(), count: base.count });
}

/**
 * New member at the end: smallest free id m1.., name '', temper normal, the first NPC_LOOKS letter no member uses (or
 * NPC_LOOKS[floor(rng() × 17)] when all are used), present while fewer than 15 are present. Count unchanged.
 * At 30 members → added null.
 */
export function addMember(r: Roster, rng: () => number): { roster: Roster; added: RosterMember | null } {
  const base = normalizeRoster(r);
  if (base.members.length >= ROSTER_MAX_MEMBERS) return { roster: base, added: null };

  const ids = new Set(base.members.map((m) => m.id));
  let k = 1;
  while (ids.has(`m${k}`)) k++;
  const id = `m${k}`;

  const usedLooks = new Set(base.members.map((m) => m.look));
  let look = '';
  for (const letter of NPC_LOOKS) {
    if (!usedLooks.has(letter)) {
      look = letter;
      break;
    }
  }
  if (look === '') look = NPC_LOOKS[pickIndex(rng(), NPC_LOOKS.length)];

  const added: RosterMember = { id, name: '', look, temper: DEFAULT_TEMPER };
  const members = base.members.map(copyMember);
  members.push(added);
  const present = base.present.slice();
  if (present.length < NPC_CAP) present.push(id);
  const roster = normalizeRoster({ members, present, count: base.count });
  return { roster, added: copyMember(added) };
}

/** Drops the member and its present entry; count clamps. Unknown id → unchanged. */
export function removeMember(r: Roster, id: string): Roster {
  const base = normalizeRoster(r);
  return normalizeRoster({
    members: base.members.filter((m) => m.id !== id).map(copyMember),
    present: base.present.filter((p) => p !== id),
    count: base.count,
  });
}

/** Renames through the Phase 1 sanitiser. */
export function renameMember(r: Roster, id: string, name: unknown): Roster {
  const clean = sanitizeNpcName(name);
  return editMember(r, id, (m) => ({ id: m.id, name: clean, look: m.look, temper: m.temper }));
}

/** Accepts only one NPC_LOOKS letter ('a' is the player's). */
export function setMemberLook(r: Roster, id: string, look: unknown): Roster {
  if (!isLook(look)) return normalizeRoster(r);
  return editMember(r, id, (m) => ({ id: m.id, name: m.name, look, temper: m.temper }));
}

/** Accepts only hot / normal / calm. */
export function setMemberTemper(r: Roster, id: string, temper: unknown): Roster {
  if (!isTemper(temper)) return normalizeRoster(r);
  return editMember(r, id, (m) => ({ id: m.id, name: m.name, look: m.look, temper }));
}

/** Ticks a member present (only while fewer than 15 are present) or unticks it (count clamps). */
export function setMemberPresent(r: Roster, id: string, on: boolean): Roster {
  const base = normalizeRoster(r);
  if (!base.members.some((m) => m.id === id)) return base;
  const isOn = base.present.includes(id);
  let present = base.present.slice();
  if (on && !isOn) {
    if (present.length >= NPC_CAP) return base;
    present.push(id);
  } else if (!on && isOn) {
    present = present.filter((p) => p !== id);
  } else {
    return base;
  }
  return normalizeRoster({ members: base.members.map(copyMember), present, count: base.count });
}

/**
 * Adapter that lets the existing 01-27 settings section (count stepper + one name field per slot) edit the roster
 * until plan 02-09 replaces that section and deletes this function. names[i] renames the i-th present member (roster
 * order); members without a slot entry keep their names. A finite count is truncated and clamped to maxOnFloor;
 * a non-finite count keeps the current one.
 */
export function withSlotEdits(r: Roster, count: number, names: readonly unknown[]): Roster {
  const base = normalizeRoster(r);
  const slots = presentMembers(base);
  const renamed = new Map<string, string>();
  const n = Math.min(Array.isArray(names) ? names.length : 0, slots.length);
  for (let i = 0; i < n; i++) renamed.set(slots[i].id, sanitizeNpcName(names[i]));
  const members = base.members.map((m) => {
    const name = renamed.get(m.id);
    return { id: m.id, name: name === undefined ? m.name : name, look: m.look, temper: m.temper };
  });
  const next =
    typeof count === 'number' && Number.isFinite(count)
      ? Math.max(0, Math.min(maxOnFloor(base), Math.trunc(count)))
      : base.count;
  return normalizeRoster({ members, present: base.present.slice(), count: next });
}

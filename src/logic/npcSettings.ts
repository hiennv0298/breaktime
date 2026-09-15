/**
 * NPC settings model (plan 01-26, D-29, CTRL-07): how many coworkers start in the office (0–10, default 3) and the name
 * shown above each of them. Pure: no three.js, no DOM, no storage — src/game/npcSettingsStore.ts reads and writes the
 * serialized form, src/game/game.ts applies it at start, plan 01-27 builds the settings screen that edits it.
 *
 * Privacy (D-29): names stay on this device. They are kept only in localStorage['bt.npcs'] and are never sent anywhere.
 * Content risk (D-31): player-typed names may be real people's names (PROJECT Out of Scope exception). The operator
 * accepted this for the play-test build only; it must be reviewed before the Phase 8 CrazyGames submission (replace
 * with a preset name list or a filter).
 *
 * Tampering (T-01-26-02..04): stored strings longer than 4096 characters are ignored before JSON.parse, the record must
 * be a plain object with v === 1, the count is clamped to 0..10 and every name goes through sanitizeNpcName.
 */

/** Player-selectable and benchmark ceiling (D-29, D-11 revised). */
export const MAX_NPCS = 10;
/** Coworkers in normal play (D-11). */
export const DEFAULT_NPCS = 3;
/** Longest name, in code points after NFC normalisation (D-29). */
export const NPC_NAME_MAX = 16;
/** Storage key of the serialized settings (read and written by src/game/npcSettingsStore.ts). */
export const NPC_SETTINGS_KEY = 'bt.npcs';
/** A stored string longer than this is ignored without parsing (T-01-26-04). */
export const NPC_SETTINGS_MAX_RAW = 4096;
/** Per-name UTF-16 pre-slice that bounds the normalise / regex work on hostile input. */
const NAME_PRESLICE = 256;
const VERSION = 1;

export interface NpcSettings {
  count: number;
  /** Always MAX_NPCS entries; '' = that NPC has no label. */
  names: string[];
}

/** 'manual' is set by the settings screen (plan 01-27). */
export type NpcSettingsSource = 'default' | 'stored' | 'query' | 'manual';

/** Tab, CR and LF become spaces before the strip, so "line\nbreak" stays two words. */
const LINE_CHARS = /[\t\n\r]/g;
/**
 * C0 / C1 controls, soft hyphen, Arabic letter mark, Mongolian vowel separator, zero-width and directional marks,
 * line / paragraph separators, bidi embeddings / overrides, word joiner … bidi isolates, invisible operators, BOM.
 */
const STRIP_CHARS = /[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g;
const SPACE_RUNS = /\s+/g;

/** Cleans one name (T-01-26-03): '' for non-strings, otherwise stripped, collapsed, NFC and ≤ 16 code points. */
export function sanitizeNpcName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let s = raw.slice(0, NAME_PRESLICE).normalize('NFC');
  s = s.replace(LINE_CHARS, ' ').replace(STRIP_CHARS, '').replace(SPACE_RUNS, ' ').trim();
  return Array.from(s).slice(0, NPC_NAME_MAX).join('').trimEnd();
}

function normalizeCount(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_NPCS;
  return Math.max(0, Math.min(MAX_NPCS, Math.trunc(v)));
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Clamps the count and returns exactly MAX_NPCS sanitised names. */
export function normalizeNpcSettings(input: unknown): NpcSettings {
  const obj = isPlainObject(input) ? input : {};
  const list = Array.isArray(obj.names) ? obj.names : [];
  const names: string[] = [];
  for (let i = 0; i < MAX_NPCS; i++) names.push(i < list.length ? sanitizeNpcName(list[i]) : '');
  return { count: normalizeCount(obj.count), names };
}

function defaults(): NpcSettings {
  return normalizeNpcSettings(null);
}

/** Parses the stored string; anything missing, oversized, malformed or of another version gives the defaults. */
export function parseNpcSettings(raw: string | null): { settings: NpcSettings; valid: boolean } {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > NPC_SETTINGS_MAX_RAW) {
    return { settings: defaults(), valid: false };
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { settings: defaults(), valid: false };
  }
  if (!isPlainObject(data) || data.v !== VERSION) return { settings: defaults(), valid: false };
  return { settings: normalizeNpcSettings(data), valid: true };
}

/** {"v":1,"count":n,"names":[…10]} of the normalised settings. */
export function serializeNpcSettings(s: NpcSettings): string {
  const n = normalizeNpcSettings(s);
  return JSON.stringify({ v: VERSION, count: n.count, names: n.names });
}

/** ?npcs=N as an integer clamped to [0, MAX_NPCS]; null when absent or unparsable. */
export function npcCountFromQuery(search: string): number | null {
  const raw = new URLSearchParams(search).get('npcs');
  if (raw === null) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(MAX_NPCS, n));
}

/**
 * Start settings: count from a finite forcedCount (bench / soak) > ?npcs= > stored record > default 3; names always come
 * from the stored record when it is valid. A forced or query count reports source 'query'.
 */
export function resolveStartNpcSettings(
  search: string,
  storedRaw: string | null,
  forcedCount?: number,
): { settings: NpcSettings; source: NpcSettingsSource } {
  const stored = parseNpcSettings(storedRaw);
  const q =
    typeof forcedCount === 'number' && Number.isFinite(forcedCount)
      ? Math.max(0, Math.min(MAX_NPCS, Math.trunc(forcedCount)))
      : npcCountFromQuery(search);
  if (q !== null) return { settings: { count: q, names: stored.settings.names }, source: 'query' };
  if (stored.valid) return { settings: stored.settings, source: 'stored' };
  return { settings: stored.settings, source: 'default' };
}

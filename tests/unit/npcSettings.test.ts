import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NPCS,
  MAX_NPCS,
  normalizeNpcSettings,
  NPC_NAME_MAX,
  NPC_SETTINGS_KEY,
  NPC_SETTINGS_MAX_RAW,
  npcCountFromQuery,
  parseNpcSettings,
  resolveStartNpcSettings,
  sanitizeNpcName,
  serializeNpcSettings,
  type NpcSettings,
} from '../../src/logic/npcSettings';

/* Plan 01-26: NPC count + names settings model (D-29, CTRL-07, T-01-26-02..04). */

const EMPTY10 = Array.from({ length: 10 }, () => '');

function names(...first: string[]): string[] {
  return [...first, ...EMPTY10].slice(0, 10);
}

function stored(count: unknown, list: unknown[] = []): string {
  return JSON.stringify({ v: 1, count, names: list });
}

describe('limits', () => {
  it('pins the settings constants', () => {
    expect(MAX_NPCS).toBe(10);
    expect(DEFAULT_NPCS).toBe(3);
    expect(NPC_NAME_MAX).toBe(16);
    expect(NPC_SETTINGS_KEY).toBe('bt.npcs');
    expect(NPC_SETTINGS_MAX_RAW).toBe(4096);
  });
});

describe('sanitizeNpcName (T-01-26-03)', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitizeNpcName('  Sếp   Tùng  ')).toBe('Sếp Tùng');
    expect(sanitizeNpcName('line\nbreak')).toBe('line break');
    expect(sanitizeNpcName('tab\there\r\nx')).toBe('tab here x');
    expect(sanitizeNpcName('   ')).toBe('');
  });

  it('NFC-normalises combining marks', () => {
    const decomposed = 'Te\u0302\u0301t';
    const out = sanitizeNpcName(decomposed);
    expect(out).toBe('Tết');
    expect(out.codePointAt(1)).toBe(0x1ebf); // precomposed e with circumflex and acute
    expect(Array.from(out)).toHaveLength(3);
  });

  it('cuts to 16 code points without splitting surrogate pairs', () => {
    expect(sanitizeNpcName('ABCDEFGHIJKLMNOPQRSTUV')).toBe('ABCDEFGHIJKLMNOP');
    const out = sanitizeNpcName('😀'.repeat(20));
    expect(out).toBe('😀'.repeat(16));
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(out)).toBe(false);
  });

  it('strips bidi, zero-width and control characters', () => {
    expect(sanitizeNpcName('\u202Egnp.exe')).toBe('gnp.exe');
    expect(sanitizeNpcName('a\u0000b\u200Bc\uFEFF')).toBe('abc');
    expect(sanitizeNpcName('x\u2066y\u2069z\u061C\u00AD\u180E\u0085\u007F\u2028w')).toBe('xyzw');
    expect(sanitizeNpcName('\u200F\u200E ok \u2060')).toBe('ok');
  });

  it('keeps markup as literal text, capped at 16 code points', () => {
    expect(sanitizeNpcName('<img src=x onerror=alert(1)>')).toBe('<img src=x onerr');
  });

  it('does not end with a space after the cut', () => {
    expect(sanitizeNpcName('ABCDEFGHIJKLMNO PQ')).toBe('ABCDEFGHIJKLMNO');
  });

  it('turns non-strings into empty names', () => {
    for (const v of [123, null, undefined, {}, [], true]) expect(sanitizeNpcName(v), String(v)).toBe('');
  });

  it('handles a 10 000-character string', () => {
    const out = sanitizeNpcName('x'.repeat(10_000));
    expect(Array.from(out)).toHaveLength(16);
  });
});

describe('normalizeNpcSettings (T-01-26-02)', () => {
  it('clamps and truncates the count', () => {
    expect(normalizeNpcSettings({ count: 42, names: [] }).count).toBe(10);
    expect(normalizeNpcSettings({ count: -3, names: [] }).count).toBe(0);
    expect(normalizeNpcSettings({ count: 2.7, names: [] }).count).toBe(2);
    expect(normalizeNpcSettings({ count: 0, names: [] }).count).toBe(0);
  });

  it('falls back to 3 for non-number counts', () => {
    for (const count of ['5', Number.NaN, undefined, null, Infinity, {}]) {
      expect(normalizeNpcSettings({ count, names: [] }).count, String(count)).toBe(3);
    }
    expect(normalizeNpcSettings({ names: [] }).count).toBe(3);
    expect(normalizeNpcSettings(null)).toEqual({ count: 3, names: EMPTY10 });
    expect(normalizeNpcSettings('x')).toEqual({ count: 3, names: EMPTY10 });
  });

  it('always yields ten sanitised names', () => {
    expect(normalizeNpcSettings({ count: 3, names: 'abc' }).names).toEqual(EMPTY10);
    const many = Array.from({ length: 14 }, (_, i) => 'N' + i);
    expect(normalizeNpcSettings({ count: 3, names: many }).names).toEqual(many.slice(0, 10));
    expect(normalizeNpcSettings({ count: 3, names: ['A', 5, null, ' B '] }).names).toEqual(names('A', '', '', 'B'));
    expect(normalizeNpcSettings({ count: 3 }).names).toHaveLength(10);
  });
});

describe('parseNpcSettings', () => {
  const def: NpcSettings = { count: 3, names: EMPTY10 };

  it('rejects missing, malformed and wrong-shape data', () => {
    for (const raw of [null, '', '{not json', 'null', '[]', '5', '"x"', JSON.stringify({ v: 2, count: 5, names: ['A'] })]) {
      expect(parseNpcSettings(raw), String(raw)).toEqual({ settings: def, valid: false });
    }
    expect(parseNpcSettings(JSON.stringify({ count: 5, names: ['A'] }))).toEqual({ settings: def, valid: false });
  });

  it('rejects raw strings longer than the cap before parsing', () => {
    const big = JSON.stringify({ v: 1, count: 5, names: ['A'], pad: 'x'.repeat(NPC_SETTINGS_MAX_RAW) });
    expect(big.length).toBeGreaterThan(NPC_SETTINGS_MAX_RAW);
    expect(parseNpcSettings(big)).toEqual({ settings: def, valid: false });
  });

  it('reads a version 1 record', () => {
    expect(parseNpcSettings(stored(5, ['A', 'B']))).toEqual({ settings: { count: 5, names: names('A', 'B') }, valid: true });
  });

  it('normalises a tampered version 1 record', () => {
    const r = parseNpcSettings(stored(42, ['\u202E<b>x</b>', 7]));
    expect(r.valid).toBe(true);
    expect(r.settings).toEqual({ count: 10, names: names('<b>x</b>') });
  });
});

describe('serializeNpcSettings', () => {
  it('writes version 1 and round-trips', () => {
    const s: NpcSettings = { count: 7, names: names('Sếp Tùng', 'Ánh', '', 'ABCDEFGHIJKLMNOP') };
    const raw = serializeNpcSettings(s);
    expect(JSON.parse(raw)).toEqual({ v: 1, count: 7, names: s.names });
    expect(parseNpcSettings(raw)).toEqual({ settings: s, valid: true });
  });

  it('normalises before writing', () => {
    const raw = serializeNpcSettings({ count: 99, names: ['  a  '] });
    expect(JSON.parse(raw)).toEqual({ v: 1, count: 10, names: names('a') });
  });

  it('the largest record fits the raw cap', () => {
    const s: NpcSettings = { count: 10, names: Array.from({ length: 10 }, () => '😀'.repeat(16)) };
    expect(serializeNpcSettings(s).length).toBeLessThanOrEqual(NPC_SETTINGS_MAX_RAW);
    expect(parseNpcSettings(serializeNpcSettings(s))).toEqual({ settings: s, valid: true });
  });
});

describe('npcCountFromQuery', () => {
  it('parses and clamps ?npcs=', () => {
    expect(npcCountFromQuery('')).toBeNull();
    expect(npcCountFromQuery('?autoplay=1')).toBeNull();
    expect(npcCountFromQuery('?npcs=abc')).toBeNull();
    expect(npcCountFromQuery('?npcs=')).toBeNull();
    expect(npcCountFromQuery('?npcs=7')).toBe(7);
    expect(npcCountFromQuery('?npcs=99')).toBe(10);
    expect(npcCountFromQuery('?npcs=-1')).toBe(0);
    expect(npcCountFromQuery('?npcs=2.9')).toBe(2);
    expect(npcCountFromQuery('?npcs=0')).toBe(0);
  });
});

describe('resolveStartNpcSettings (precedence)', () => {
  it('defaults with nothing stored', () => {
    expect(resolveStartNpcSettings('', null)).toEqual({ settings: { count: 3, names: EMPTY10 }, source: 'default' });
  });

  it('uses the stored record', () => {
    expect(resolveStartNpcSettings('', stored(5, ['A', 'B']))).toEqual({
      settings: { count: 5, names: names('A', 'B') },
      source: 'stored',
    });
    expect(resolveStartNpcSettings('?npcs=abc', stored(5)).settings.count).toBe(5);
    expect(resolveStartNpcSettings('?npcs=abc', stored(5)).source).toBe('stored');
  });

  it('?npcs= overrides the stored count but keeps stored names', () => {
    expect(resolveStartNpcSettings('?npcs=7', stored(2, ['A', 'B']))).toEqual({
      settings: { count: 7, names: names('A', 'B') },
      source: 'query',
    });
    expect(resolveStartNpcSettings('?npcs=99', '{bad')).toEqual({
      settings: { count: 10, names: EMPTY10 },
      source: 'query',
    });
  });

  it('a finite forcedCount overrides ?npcs= and the stored count', () => {
    expect(resolveStartNpcSettings('?npcs=3', stored(2, ['A', 'B']), 10)).toEqual({
      settings: { count: 10, names: names('A', 'B') },
      source: 'query',
    });
    expect(resolveStartNpcSettings('', stored(2), 99).settings.count).toBe(10);
    expect(resolveStartNpcSettings('', stored(2), -4).settings.count).toBe(0);
    expect(resolveStartNpcSettings('', stored(2), 4.8).settings.count).toBe(4);
  });

  it('ignores a non-finite forcedCount', () => {
    expect(resolveStartNpcSettings('?npcs=7', null, Number.NaN).settings.count).toBe(7);
    expect(resolveStartNpcSettings('?npcs=7', null, Number.NaN).source).toBe('query');
    expect(resolveStartNpcSettings('', stored(2), Infinity)).toEqual({
      settings: { count: 2, names: EMPTY10 },
      source: 'stored',
    });
    expect(resolveStartNpcSettings('', null, undefined).source).toBe('default');
  });
});

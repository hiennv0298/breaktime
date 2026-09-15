import { describe, expect, it } from 'vitest';
import { sanitizeNpcName } from '../../src/logic/npcSettings';
import { PRESET_NAMES, randomPresetName } from '../../src/logic/presetNames';
import { mulberry32 } from '../../src/logic/rng';

/* Plan 02-04 Task 2: preset nicknames for the random-name button (D-04). */

describe('PRESET_NAMES', () => {
  it('has exactly 32 unique entries', () => {
    expect(PRESET_NAMES.length).toBe(32);
    expect(new Set(PRESET_NAMES).size).toBe(32);
  });

  it('every entry is already clean, NFC, non-empty and at most 16 code points', () => {
    for (const name of PRESET_NAMES) {
      expect(name.length, name).toBeGreaterThan(0);
      expect(sanitizeNpcName(name), name).toBe(name);
      expect(name.normalize('NFC'), name).toBe(name);
      expect(Array.from(name).length, name).toBeLessThanOrEqual(16);
    }
  });

  it('keeps the planned first and last names', () => {
    expect(PRESET_NAMES[0]).toBe('Anh Photocopy');
    expect(PRESET_NAMES[2]).toBe('Sếp Họp Hoài');
    expect(PRESET_NAMES[31]).toBe('Anh Cây Nước');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(PRESET_NAMES)).toBe(true);
  });
});

describe('randomPresetName', () => {
  it('is deterministic for the same seed', () => {
    const a = mulberry32(1);
    const b = mulberry32(1);
    const seqA = Array.from({ length: 10 }, () => randomPresetName(a, []));
    const seqB = Array.from({ length: 10 }, () => randomPresetName(b, []));
    expect(seqA).toEqual(seqB);
    for (const n of seqA) expect(PRESET_NAMES.includes(n)).toBe(true);
  });

  it('returns the only name not taken', () => {
    const left = PRESET_NAMES[17];
    const taken = PRESET_NAMES.filter((n) => n !== left);
    for (const r of [0, 0.3, 0.9999999]) expect(randomPresetName(() => r, taken)).toBe(left);
  });

  it('with every name taken still returns a preset name', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 20; i++) expect(PRESET_NAMES.includes(randomPresetName(rng, PRESET_NAMES))).toBe(true);
  });

  it('compares taken names after sanitising', () => {
    const left = PRESET_NAMES[5];
    const taken = PRESET_NAMES.filter((n) => n !== left).map((n, i) => (i % 2 ? `  ${n.normalize('NFD')}  ` : n));
    expect(randomPresetName(() => 0.5, taken)).toBe(left);
  });

  it('picks uniformly by index among free names and survives bad draws', () => {
    expect(randomPresetName(() => 0, [])).toBe(PRESET_NAMES[0]);
    expect(randomPresetName(() => 0.9999999, [])).toBe(PRESET_NAMES[31]);
    expect(randomPresetName(() => 1, [])).toBe(PRESET_NAMES[31]);
    expect(randomPresetName(() => Number.NaN, [])).toBe(PRESET_NAMES[0]);
    expect(randomPresetName(() => -3, [])).toBe(PRESET_NAMES[0]);
    expect(randomPresetName(() => 0, [PRESET_NAMES[0]])).toBe(PRESET_NAMES[1]);
  });
});

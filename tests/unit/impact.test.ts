import { describe, expect, it } from 'vitest';
import { breakSoundFor, dropSoundFor, shardCountFor, shouldBreak, type BreakRole } from '../../src/logic/impact';

const ROLES: BreakRole[] = ['mug', 'computerScreen', 'pottedPlant', 'plantSmall'];
const THRESHOLDS: Record<BreakRole, number> = { mug: 12, plantSmall: 14, pottedPlant: 18, computerScreen: 25 };

describe('shardCountFor', () => {
  it('mug 5, plants 6, monitor 8', () => {
    expect(shardCountFor('mug')).toBe(5);
    expect(shardCountFor('pottedPlant')).toBe(6);
    expect(shardCountFor('plantSmall')).toBe(6);
    expect(shardCountFor('computerScreen')).toBe(8);
  });

  it('every breakable uses 5..8 pieces of the shared kit (D-13)', () => {
    for (const r of ROLES) {
      expect(shardCountFor(r)).toBeGreaterThanOrEqual(5);
      expect(shardCountFor(r)).toBeLessThanOrEqual(8);
    }
  });
});

describe('shouldBreak', () => {
  it('is true only when force >= threshold', () => {
    for (const r of ROLES) {
      const t = THRESHOLDS[r];
      expect(shouldBreak(r, t, THRESHOLDS)).toBe(true);
      expect(shouldBreak(r, t + 0.5, THRESHOLDS)).toBe(true);
      expect(shouldBreak(r, t - 0.01, THRESHOLDS)).toBe(false);
      expect(shouldBreak(r, 0, THRESHOLDS)).toBe(false);
    }
  });

  it('rejects NaN, negative and infinite-garbage forces, and roles without a threshold', () => {
    expect(shouldBreak('mug', Number.NaN, THRESHOLDS)).toBe(false);
    expect(shouldBreak('mug', -100, THRESHOLDS)).toBe(false);
    expect(shouldBreak('mug', 50, {} as Record<BreakRole, number>)).toBe(false);
    expect(shouldBreak('chairDesk' as BreakRole, 1e6, THRESHOLDS)).toBe(false);
  });
});

describe('breakSoundFor', () => {
  it('monitor -> glass; mug and plants -> ceramic', () => {
    expect(breakSoundFor('computerScreen')).toBe('break-glass');
    expect(breakSoundFor('mug')).toBe('break-ceramic');
    expect(breakSoundFor('pottedPlant')).toBe('break-ceramic');
    expect(breakSoundFor('plantSmall')).toBe('break-ceramic');
  });
});

describe('dropSoundFor', () => {
  it('a hard landing of a chair returns a drop- name', () => {
    const s = dropSoundFor('chairDesk', 30, 0, 1000);
    expect(s).not.toBeNull();
    expect(s!.startsWith('drop-')).toBe(true);
  });

  it('returns null inside the 250 ms per-prop cooldown', () => {
    expect(dropSoundFor('chairDesk', 30, 900, 1000)).toBeNull();
    expect(dropSoundFor('chairDesk', 30, 750, 1000)).not.toBeNull();
    expect(dropSoundFor('chairDesk', 30, 751, 1000)).toBeNull();
  });

  it('returns null below minForce (default 15)', () => {
    expect(dropSoundFor('chairDesk', 14.9, 0, 1000)).toBeNull();
    expect(dropSoundFor('chairDesk', 15, 0, 1000)).not.toBeNull();
    expect(dropSoundFor('chairDesk', Number.NaN, 0, 1000)).toBeNull();
  });

  it('honours custom minForce and cooldownMs', () => {
    expect(dropSoundFor('chairDesk', 30, 0, 1000, { minForce: 60 })).toBeNull();
    expect(dropSoundFor('chairDesk', 61, 0, 1000, { minForce: 60 })).not.toBeNull();
    expect(dropSoundFor('chairDesk', 30, 900, 1000, { cooldownMs: 50 })).not.toBeNull();
  });

  it('a prop that never played (lastMs -Infinity) is not in cooldown', () => {
    expect(dropSoundFor('trashcan', 30, Number.NEGATIVE_INFINITY, 0)).toBe('drop-metal-0');
  });

  it('maps roles to the wood / soft / metal families', () => {
    expect(dropSoundFor('trashcan', 30, 0, 1000)).toBe('drop-metal-0');
    expect(dropSoundFor('books', 30, 0, 1000)).toBe('drop-soft-0');
    expect(dropSoundFor('boxClosed', 30, 0, 1000)).toBe('drop-soft-0');
    for (const role of ['chairDesk', 'computerKeyboard']) {
      expect(dropSoundFor(role, 30, 0, 1000)).toMatch(/^drop-wood-[01]$/);
      expect(dropSoundFor(role, 500, 0, 1000)).toMatch(/^drop-wood-[01]$/);
    }
  });

  it('only returns names that exist in the SFX set', () => {
    const names = new Set(['drop-metal-0', 'drop-soft-0', 'drop-wood-0', 'drop-wood-1']);
    for (const role of ['chairDesk', 'computerKeyboard', 'computerMouse', 'laptop', 'printer', 'waterCooler', 'books', 'boxClosed', 'trashcan', 'unknownRole']) {
      for (const f of [15, 30, 60, 200, 1e4]) {
        const s = dropSoundFor(role, f, 0, 1000);
        expect(s === null || names.has(s)).toBe(true);
        expect(s).not.toBeNull();
      }
    }
  });
});

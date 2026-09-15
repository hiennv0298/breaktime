import { describe, expect, it } from 'vitest';
import { pickVariant, sfxNameFromPath, variantsOf } from '../../src/logic/sfxNames';

const ALL = [
  'slap-0',
  'slap-1',
  'slap-2',
  'break-glass-0',
  'break-glass-1',
  'break-ceramic-0',
  'break-ceramic-1',
  'drop-wood-0',
  'drop-wood-1',
  'drop-soft-0',
  'drop-metal-0',
];

describe('sfxNameFromPath', () => {
  it('strips folders and the .mp3 extension from a glob key', () => {
    expect(sfxNameFromPath('../assets/sfx/slap-1.mp3')).toBe('slap-1');
  });

  it('works for absolute paths with multi-dash names', () => {
    expect(sfxNameFromPath('/x/drop-soft-0.mp3')).toBe('drop-soft-0');
  });

  it('handles hashed build urls, query strings and backslashes', () => {
    expect(sfxNameFromPath('./assets/break-glass-1.mp3?url')).toBe('break-glass-1');
    expect(sfxNameFromPath('C:\\a\\sfx\\drop-metal-0.mp3')).toBe('drop-metal-0');
    expect(sfxNameFromPath('slap-2.mp3#t=0')).toBe('slap-2');
  });

  it('returns a bare name unchanged', () => {
    expect(sfxNameFromPath('slap-0')).toBe('slap-0');
  });
});

describe('variantsOf', () => {
  it('returns the prefix variants sorted by index', () => {
    expect(variantsOf(['drop-wood-1', 'slap-2', 'slap-0', 'slap-1'], 'slap')).toEqual(['slap-0', 'slap-1', 'slap-2']);
  });

  it('does not mix sibling families that share the first word', () => {
    expect(variantsOf(ALL, 'break-glass')).toEqual(['break-glass-0', 'break-glass-1']);
    expect(variantsOf(ALL, 'break-glass')).not.toContain('break-ceramic-0');
  });

  it('requires a numeric suffix, so a partial prefix matches nothing', () => {
    expect(variantsOf(ALL, 'drop')).toEqual([]);
    expect(variantsOf(ALL, 'sla')).toEqual([]);
  });

  it('sorts numerically, not lexically', () => {
    expect(variantsOf(['slap-10', 'slap-2', 'slap-1'], 'slap')).toEqual(['slap-1', 'slap-2', 'slap-10']);
  });

  it('treats regex characters in the prefix literally', () => {
    expect(variantsOf(['a.b-0', 'axb-0'], 'a.b')).toEqual(['a.b-0']);
  });

  it('does not mutate the input', () => {
    const input = ['slap-2', 'slap-0'];
    variantsOf(input, 'slap');
    expect(input).toEqual(['slap-2', 'slap-0']);
  });
});

describe('pickVariant', () => {
  it('rng 0 picks the first variant', () => {
    expect(pickVariant(ALL, 'slap', () => 0)).toBe('slap-0');
  });

  it('rng 0.999 picks the last variant', () => {
    expect(pickVariant(ALL, 'slap', () => 0.999)).toBe('slap-2');
  });

  it('rng 0.5 picks the middle of three', () => {
    expect(pickVariant(ALL, 'slap', () => 0.5)).toBe('slap-1');
  });

  it('unknown prefix returns null', () => {
    expect(pickVariant(ALL, 'explosion', () => 0.3)).toBeNull();
  });

  it('out-of-range or non-finite rng output stays inside the list', () => {
    expect(pickVariant(ALL, 'slap', () => 1)).toBe('slap-2');
    expect(pickVariant(ALL, 'slap', () => -0.2)).toBe('slap-0');
    expect(pickVariant(ALL, 'slap', () => Number.NaN)).toBe('slap-0');
  });

  it('a single-variant family always returns that variant', () => {
    expect(pickVariant(ALL, 'drop-soft', () => 0.99)).toBe('drop-soft-0');
  });
});

import { describe, it, expect } from 'vitest';
import {
  SHA_RE,
  RELEASE_NAME_RE,
  validateSha,
  parseReleaseListing,
  selectReleasesToDelete,
} from '../../scripts/lib/releases.mjs';

/** n releases, index 0 is the newest; names are 12-hex and sort opposite to mtime. */
function makeReleases(n) {
  return Array.from({ length: n }, (_, i) => ({
    name: `${'0'.repeat(10)}${(99 - i).toString(16).padStart(2, '0')}`,
    mtime: 1_800_000_000 - i * 60,
  }));
}

describe('regexes', () => {
  it('SHA_RE accepts exactly 12 lowercase hex', () => {
    expect(SHA_RE.test('0123456789ab')).toBe(true);
    expect(SHA_RE.test('0123456789a')).toBe(false);
    expect(SHA_RE.test('0123456789abc')).toBe(false);
    expect(SHA_RE.test('0123456789AB')).toBe(false);
  });
  it('RELEASE_NAME_RE accepts 7 to 40 lowercase hex only', () => {
    expect(RELEASE_NAME_RE.test('abc1234')).toBe(true);
    expect(RELEASE_NAME_RE.test('a'.repeat(40))).toBe(true);
    expect(RELEASE_NAME_RE.test('abc123')).toBe(false);
    expect(RELEASE_NAME_RE.test('a'.repeat(41))).toBe(false);
    expect(RELEASE_NAME_RE.test('.incoming-0123456789ab')).toBe(false);
    expect(RELEASE_NAME_RE.test('../0123456789ab')).toBe(false);
  });
});

describe('validateSha', () => {
  it('returns a valid 12-hex sha', () => {
    expect(validateSha('0123456789ab')).toBe('0123456789ab');
  });
  it('throws on short, long, uppercase, injected or non-string input', () => {
    expect(() => validateSha('abc')).toThrow();
    expect(() => validateSha('0123456789abcd')).toThrow();
    expect(() => validateSha('0123456789AB')).toThrow();
    expect(() => validateSha('0123456789ab;rm')).toThrow();
    expect(() => validateSha('0123456789ab\n')).toThrow();
    expect(() => validateSha(undefined)).toThrow();
    expect(() => validateSha(123456789012)).toThrow();
  });
});

describe('parseReleaseListing', () => {
  it('parses __REL__ lines into name + mtime', () => {
    const text = '__ACTIVATED__ 0123456789ab\n__REL__ 0123456789ab 1800000000\n__REL__ abc1234 1799999000\n__CURRENT__ 0123456789ab\n__END__\n';
    expect(parseReleaseListing(text)).toEqual([
      { name: '0123456789ab', mtime: 1800000000 },
      { name: 'abc1234', mtime: 1799999000 },
    ]);
  });
  it('ignores lines without the prefix, invalid names and invalid epochs; tolerates CRLF', () => {
    const text = [
      'noise 0123456789ab 1800000000',
      ' __REL__ 0123456789ab 1800000000',
      '__REL__ .incoming-0123456789ab 1800000000',
      '__REL__ ../etc 1800000000',
      '__REL__ ZZZZZZZ 1800000000',
      '__REL__ 0123456789ab notanumber',
      '__REL__ 0123456789ab',
      '__REL__ 0123456789ab 1800000000 extra',
      '__REL__ fedcba987654 1800000001\r',
    ].join('\n');
    expect(parseReleaseListing(text)).toEqual([{ name: 'fedcba987654', mtime: 1800000001 }]);
  });
  it('returns [] for empty or non-string input', () => {
    expect(parseReleaseListing('')).toEqual([]);
    expect(parseReleaseListing(undefined)).toEqual([]);
  });
});

describe('selectReleasesToDelete', () => {
  it('12 releases, keep 10, current newest -> the 2 oldest', () => {
    const list = makeReleases(12);
    const out = selectReleasesToDelete(list, 10, list[0].name);
    expect(out.sort()).toEqual([list[10].name, list[11].name].sort());
  });

  it('never returns current; current oldest of 12 -> only the 1 oldest non-current beyond the 10 newest', () => {
    const list = makeReleases(12);
    const current = list[11].name;
    const out = selectReleasesToDelete(list, 10, current);
    expect(out).not.toContain(current);
    expect(out).toEqual([list[10].name]);
  });

  it('does not depend on input order', () => {
    const list = makeReleases(12);
    const shuffled = [list[5], list[11], list[0], list[7], list[10], list[1], list[9], list[2], list[8], list[3], list[6], list[4]];
    expect(selectReleasesToDelete(shuffled, 10, list[0].name).sort()).toEqual([list[10].name, list[11].name].sort());
  });

  it('breaks mtime ties by name so the result is deterministic', () => {
    const list = [
      { name: 'bbbbbbbbbbbb', mtime: 100 },
      { name: 'aaaaaaaaaaaa', mtime: 100 },
      { name: 'cccccccccccc', mtime: 100 },
    ];
    expect(selectReleasesToDelete(list, 2, 'aaaaaaaaaaaa')).toEqual(['cccccccccccc']);
  });

  it('8 releases -> []', () => {
    const list = makeReleases(8);
    expect(selectReleasesToDelete(list, 10, list[0].name)).toEqual([]);
  });

  it('keep 0, negative, fractional or non-number throws', () => {
    const list = makeReleases(12);
    expect(() => selectReleasesToDelete(list, 0, list[0].name)).toThrow();
    expect(() => selectReleasesToDelete(list, -1, list[0].name)).toThrow();
    expect(() => selectReleasesToDelete(list, 1.5, list[0].name)).toThrow();
    expect(() => selectReleasesToDelete(list, '10', list[0].name)).toThrow();
  });

  it('throws when current is not a valid release name (cannot protect what it cannot identify)', () => {
    const list = makeReleases(12);
    expect(() => selectReleasesToDelete(list, 10, '')).toThrow();
    expect(() => selectReleasesToDelete(list, 10, 'releases/../x')).toThrow();
  });

  it('ignores input names that do not match RELEASE_NAME_RE (they are neither kept nor deleted)', () => {
    const list = [
      ...makeReleases(10),
      { name: '.incoming-0123456789ab', mtime: 1 },
      { name: '../../etc', mtime: 2 },
      { name: 'current', mtime: 3 },
      { name: 'abc1234', mtime: 4 },
    ];
    expect(selectReleasesToDelete(list, 10, list[0].name)).toEqual(['abc1234']);
  });

  it('ignores entries with a non-finite mtime and duplicate names', () => {
    const list = [
      ...makeReleases(10),
      { name: 'dddddddddddd', mtime: Number.NaN },
      { name: '000000000063', mtime: 5 }, // duplicate of the newest name with an older mtime
    ];
    expect(selectReleasesToDelete(list, 10, list[0].name)).toEqual([]);
  });
});

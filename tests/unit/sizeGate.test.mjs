import { describe, it, expect } from 'vitest';
import {
  SIDECAR_RE,
  MB,
  DIST_MAX_RAW,
  DIST_MAX_FILES,
  FIRST_LOAD_TARGET,
  groupOf,
  evaluateDist,
  evaluateFirstLoad,
} from '../../scripts/lib/sizeGate.mjs';

describe('constants', () => {
  it('uses decimal megabytes and the TECH-02 limits', () => {
    expect(MB).toBe(1_000_000);
    expect(DIST_MAX_RAW).toBe(20_000_000);
    expect(DIST_MAX_FILES).toBe(1500);
    expect(FIRST_LOAD_TARGET).toBe(8_000_000);
  });

  it('SIDECAR_RE matches .br and .gz only', () => {
    expect(SIDECAR_RE.test('assets/a.js.br')).toBe(true);
    expect(SIDECAR_RE.test('assets/a.js.gz')).toBe(true);
    expect(SIDECAR_RE.test('assets/a.js')).toBe(false);
    expect(SIDECAR_RE.test('assets/brick.png')).toBe(false);
  });
});

describe('groupOf', () => {
  it('classifies the entry chunk', () => {
    expect(groupOf('assets/index-Ab12Cd34.js')).toBe('entry-js');
  });
  it('classifies rapier chunks case-insensitively', () => {
    expect(groupOf('assets/rapier3d-simd-compat-x1y2z3w4.js')).toBe('rapier');
    expect(groupOf('assets/Rapier-B56lzdAg.js')).toBe('rapier');
  });
  it('classifies models, textures, audio and other', () => {
    expect(groupOf('assets/office-1a2b3c4d.glb')).toBe('models');
    expect(groupOf('assets/texture-a-1a2b3c4d.png')).toBe('textures');
    expect(groupOf('assets/slap-1a2b3c4d.mp3')).toBe('audio');
    expect(groupOf('version.json')).toBe('other');
    expect(groupOf('assets/game-CGeMq5CF.js')).toBe('other');
  });
  it('accepts Windows separators and a leading slash', () => {
    expect(groupOf('assets\\index-Ab12Cd34.js')).toBe('entry-js');
    expect(groupOf('/assets/index-Ab12Cd34.js')).toBe('entry-js');
  });
  it('does not treat a nested or non-js index as entry-js', () => {
    expect(groupOf('assets/index-BdB3_1S_.css')).toBe('other');
    expect(groupOf('index.html')).toBe('other');
  });
});

describe('evaluateDist', () => {
  const ok = [
    { path: 'index.html', raw: 1000 },
    { path: 'assets/index-Ab12Cd34.js', raw: 6000 },
  ];

  it('passes a clean dist and reports totals', () => {
    const r = evaluateDist(ok);
    expect(r.errors).toEqual([]);
    expect(r.totalRaw).toBe(7000);
    expect(r.fileCount).toBe(2);
  });

  it('fails on a source map', () => {
    const r = evaluateDist([...ok, { path: 'assets/a.js.map', raw: 10 }]);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors.join('\n')).toContain('.map');
  });

  it('fails on a .env file anywhere', () => {
    const r = evaluateDist([...ok, { path: '.env.production', raw: 10 }]);
    expect(r.errors.join('\n')).toContain('.env');
    const nested = evaluateDist([...ok, { path: 'assets/.env', raw: 10 }]);
    expect(nested.errors.join('\n')).toContain('.env');
  });

  it('fails above 1,500 files and passes at exactly 1,500', () => {
    const many = (n) => Array.from({ length: n }, (_, i) => ({ path: `f${i}.txt`, raw: 1 }));
    const over = evaluateDist(many(1501));
    expect(over.fileCount).toBe(1501);
    expect(over.errors.some((e) => /file/i.test(e) && e.includes('1501'))).toBe(true);
    expect(evaluateDist(many(1500)).errors).toEqual([]);
  });

  it('fails above 20,000,000 raw bytes and passes at exactly 20,000,000', () => {
    const over = evaluateDist([{ path: 'assets/big.glb', raw: 20_000_001 }]);
    expect(over.totalRaw).toBe(20_000_001);
    expect(over.errors.some((e) => e.includes('20000001'))).toBe(true);
    expect(evaluateDist([{ path: 'assets/big.glb', raw: 20_000_000 }]).errors).toEqual([]);
  });

  it('excludes .br/.gz sidecars from fileCount and totalRaw', () => {
    const r = evaluateDist([
      ...ok,
      { path: 'assets/index-Ab12Cd34.js.br', raw: 20_000_000 },
      { path: 'assets/index-Ab12Cd34.js.gz', raw: 20_000_000 },
    ]);
    expect(r.fileCount).toBe(2);
    expect(r.totalRaw).toBe(7000);
    expect(r.errors).toEqual([]);
  });

  it('rejects invalid sizes instead of silently counting 0', () => {
    expect(evaluateDist([{ path: 'a.js', raw: -1 }]).errors.length).toBeGreaterThan(0);
    expect(evaluateDist([{ path: 'a.js', raw: Number.NaN }]).errors.length).toBeGreaterThan(0);
  });

  it('fails an empty dist', () => {
    expect(evaluateDist([]).errors.length).toBeGreaterThan(0);
  });
});

describe('evaluateFirstLoad', () => {
  it('is ok at or below 8 MB', () => {
    expect(evaluateFirstLoad(7_999_999, null).level).toBe('ok');
    expect(evaluateFirstLoad(8_000_000, null).level).toBe('ok');
  });

  it('fails above 8 MB without SIZE-REASON.md', () => {
    const r = evaluateFirstLoad(8_500_000, null);
    expect(r.level).toBe('fail');
    expect(r.message).toContain('SIZE-REASON.md');
  });

  it('fails above 8 MB when the reason does not state the measured number', () => {
    const r = evaluateFirstLoad(8_500_000, 'we need big textures');
    expect(r.level).toBe('fail');
    expect(r.message).toContain('SIZE-REASON.md');
  });

  it('warns above 8 MB when the reason states the measured number in MB', () => {
    const r = evaluateFirstLoad(8_500_000, 'First load is 8.5 MB because of Rapier.');
    expect(r.level).toBe('warn');
    expect(r.message).toContain('8.5');
  });

  it('fails above 20 MB regardless of reason', () => {
    const r = evaluateFirstLoad(20_000_001, 'First load is 20.0 MB, accepted');
    expect(r.level).toBe('fail');
    expect(r.message).toContain('20');
  });

  it('fails on a non-positive or non-finite total (nothing measured is not a pass)', () => {
    expect(evaluateFirstLoad(0, null).level).toBe('fail');
    expect(evaluateFirstLoad(Number.NaN, null).level).toBe('fail');
  });
});

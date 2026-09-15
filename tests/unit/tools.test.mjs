import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { nodeBin, GIT } from '../../scripts/lib/tools.mjs';

describe('nodeBin', () => {
  it('resolves a map-form bin to an absolute existing file', () => {
    const p = nodeBin('vite', 'vite');
    expect(isAbsolute(p)).toBe(true);
    expect(existsSync(p)).toBe(true);
    expect(p.replace(/\\/g, '/')).toMatch(/node_modules\/vite\/bin\/vite\.js$/);
  });

  it('resolves a scoped package bin', () => {
    const p = nodeBin('@playwright/test', 'playwright');
    expect(existsSync(p)).toBe(true);
    expect(p.replace(/\\/g, '/')).toMatch(/node_modules\/@playwright\/test\/cli\.js$/);
  });

  it('throws for an unknown bin name or package (no silent fallback)', () => {
    expect(() => nodeBin('vite', 'not-a-bin')).toThrow(/not-a-bin/);
    expect(() => nodeBin('definitely-not-installed-pkg-xyz', 'x')).toThrow();
  });
});

describe('GIT', () => {
  it('is git or an absolute git.exe path', () => {
    expect(GIT === 'git' || /git\.exe$/i.test(GIT)).toBe(true);
  });
});

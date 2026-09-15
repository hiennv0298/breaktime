import { describe, it, expect } from 'vitest';
import { evaluateResponse, findEntryAsset, runSmoke } from '../../scripts/lib/smoke.mjs';

const okRes = (over = {}) => ({
  status: 200,
  headers: { 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' },
  body: '<meta content="script-src \'self\' \'wasm-unsafe-eval\'">',
  location: '',
  ...over,
});

describe('evaluateResponse', () => {
  it('fails on a status mismatch and names the expected statuses', () => {
    const r = evaluateResponse({ name: 'root', expectStatus: [200] }, okRes({ status: 502 }));
    expect(r.ok).toBe(false);
    expect(r.name).toBe('root');
    expect(r.detail).toContain('200');
    expect(r.detail).toContain('502');
  });

  it('lists every accepted status when several are allowed', () => {
    const r = evaluateResponse({ name: 'www', expectStatus: [301, 308] }, okRes({ status: 200 }));
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('301');
    expect(r.detail).toContain('308');
  });

  it('fails when a header does not match and names the header', () => {
    const r = evaluateResponse(
      { name: 'asset', expectStatus: [200], headers: { 'cache-control': /immutable/ } },
      okRes(),
    );
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('cache-control');
  });

  it('fails when a required header is missing', () => {
    const r = evaluateResponse(
      { name: 'root', expectStatus: [200], headers: { 'x-content-type-options': /nosniff/ } },
      okRes({ headers: {} }),
    );
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('x-content-type-options');
  });

  it('reads headers case-insensitively from a plain object or a Headers instance', () => {
    const check = { name: 'root', expectStatus: [200], headers: { 'Cache-Control': /no-cache/ } };
    expect(evaluateResponse(check, okRes({ headers: { 'CACHE-CONTROL': 'no-cache' } })).ok).toBe(true);
    expect(evaluateResponse(check, okRes({ headers: new Headers({ 'cache-control': 'no-cache' }) })).ok).toBe(true);
  });

  it('fails on a location mismatch', () => {
    const r = evaluateResponse(
      { name: 'noslash', expectStatus: [308], location: /\/b\/0123456789ab\/$/ },
      okRes({ status: 308, location: '/somewhere-else' }),
    );
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('location');
  });

  it('fails when the location is absent but required', () => {
    const r = evaluateResponse(
      { name: 'www', expectStatus: [301, 308], location: /^https:\/\/doibung\.com/ },
      okRes({ status: 301, location: undefined }),
    );
    expect(r.ok).toBe(false);
  });

  it('fails when the body misses a required substring', () => {
    const r = evaluateResponse(
      { name: 'root', expectStatus: [200], bodyIncludes: ['wasm-unsafe-eval', '<div id="app">'] },
      okRes(),
    );
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('<div id="app">');
  });

  it('fails when a JSON field differs or the body is not JSON', () => {
    const check = { name: 'version', expectStatus: [200], jsonEquals: { sha: '0123456789ab' } };
    expect(evaluateResponse(check, okRes({ body: '{"sha":"ffffffffffff"}' })).ok).toBe(false);
    expect(evaluateResponse(check, okRes({ body: 'not json' })).ok).toBe(false);
    expect(evaluateResponse(check, okRes({ body: '{"sha":"0123456789ab","time":"x"}' })).ok).toBe(true);
  });

  it('fails a transport error (status 0) even when 0 is not otherwise mentioned', () => {
    const r = evaluateResponse({ name: 'root', expectStatus: [200] }, { status: 0, error: 'fetch failed' });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('fetch failed');
  });

  it('passes when every rule is satisfied', () => {
    const r = evaluateResponse(
      {
        name: 'root',
        expectStatus: [200],
        headers: { 'cache-control': /no-cache/, 'x-content-type-options': /^nosniff$/ },
        bodyIncludes: ['wasm-unsafe-eval'],
      },
      okRes(),
    );
    expect(r).toEqual({ name: 'root', ok: true, detail: expect.any(String) });
  });

  it('rejects a check without expected statuses (nothing to verify is not a pass)', () => {
    expect(evaluateResponse({ name: 'x', expectStatus: [] }, okRes()).ok).toBe(false);
  });
});

describe('findEntryAsset', () => {
  it('returns the first assets/index-*.js referenced by index.html', () => {
    const html =
      '<script type="module" crossorigin src="./assets/index-AbC_12-x.js"></script>' +
      '<link rel="stylesheet" href="./assets/index-Zz99yy00.css"><script src="./assets/index-second00.js"></script>';
    expect(findEntryAsset(html)).toBe('assets/index-AbC_12-x.js');
  });

  it('returns null when there is no entry script', () => {
    expect(findEntryAsset('<html><link href="./assets/index-Zz99yy00.css"></html>')).toBeNull();
    expect(findEntryAsset('')).toBeNull();
  });
});

describe('runSmoke with a fake fetch', () => {
  const SHA = '0123456789ab';
  const ENTRY = 'assets/index-Dq3kP9xa.js';

  function fakeServer(overrides = {}) {
    const routes = {
      'https://breaktime.doibung.com/version.json': () => ({ status: 200, body: JSON.stringify({ sha: SHA }) }),
      'https://breaktime.doibung.com/': () => ({
        status: 200,
        headers: { 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' },
        body: `<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'wasm-unsafe-eval'"><script src="./${ENTRY}"></script>`,
      }),
      [`https://breaktime.doibung.com/b/${SHA}/`]: () => ({ status: 200, body: '<html></html>' }),
      [`https://breaktime.doibung.com/b/${SHA}/version.json`]: () => ({
        status: 200,
        body: JSON.stringify({ sha: SHA }),
      }),
      [`https://breaktime.doibung.com/b/${SHA}`]: () => ({ status: 308, headers: { location: `/b/${SHA}/` } }),
      [`https://breaktime.doibung.com/${ENTRY}`]: () => ({
        status: 200,
        headers: { 'cache-control': 'public, max-age=31536000, immutable' },
        body: 'x',
      }),
      'https://breaktime.doibung.com/b/zzz/': () => ({ status: 404, body: '' }),
      'https://doibung.com/': () => ({ status: 200, body: '<html>doibung</html>' }),
      'https://www.doibung.com/': () => ({ status: 301, headers: { location: 'https://doibung.com/' } }),
      ...overrides,
    };
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      const route = routes[url];
      if (!route) return new Response('nope', { status: 599 });
      const r = route();
      if (r instanceof Error) throw r;
      return new Response(r.status === 308 || r.status === 301 || r.status === 404 ? null : r.body ?? '', {
        status: r.status,
        headers: r.headers ?? {},
      });
    };
    return { fetchImpl, calls };
  }

  it('passes every check against a correct server and uses redirect manual', async () => {
    const { fetchImpl, calls } = fakeServer();
    const results = await runSmoke({ sha: SHA, firstActivation: false, fetchImpl, sleep: async () => {} });
    const failed = results.filter((r) => !r.ok);
    expect(failed).toEqual([]);
    expect(results.length).toBeGreaterThanOrEqual(9);
    expect(calls.every((c) => c.init?.redirect === 'manual')).toBe(true);
    expect(calls.some((c) => c.url.endsWith(ENTRY))).toBe(true);
  });

  it('rejects an invalid sha before any request', async () => {
    const { fetchImpl, calls } = fakeServer();
    await expect(runSmoke({ sha: 'zzz', firstActivation: false, fetchImpl })).rejects.toThrow(/sha/);
    expect(calls.length).toBe(0);
  });

  it('fails version.json after the retry window when the sha never matches', async () => {
    const { fetchImpl } = fakeServer({
      'https://breaktime.doibung.com/version.json': () => ({ status: 200, body: '{"sha":"ffffffffffff"}' }),
    });
    let slept = 0;
    let now = 0;
    const results = await runSmoke({
      sha: SHA,
      firstActivation: false,
      fetchImpl,
      sleep: async (ms) => {
        slept += 1;
        now += ms;
      },
      now: () => now,
    });
    const v = results.find((r) => r.name.includes('version.json') && !r.name.includes('/b/'));
    expect(v.ok).toBe(false);
    expect(slept).toBeGreaterThan(0);
    expect(now).toBeLessThanOrEqual(20_000 + 3_000);
  });

  it('waits up to 120 s on the first activation', async () => {
    let now = 0;
    let n = 0;
    const { fetchImpl } = fakeServer({
      'https://breaktime.doibung.com/version.json': () => {
        n += 1;
        return now >= 60_000 ? { status: 200, body: JSON.stringify({ sha: SHA }) } : new Error('cert not ready');
      },
    });
    const results = await runSmoke({
      sha: SHA,
      firstActivation: true,
      fetchImpl,
      sleep: async (ms) => {
        now += ms;
      },
      now: () => now,
    });
    expect(results.every((r) => r.ok)).toBe(true);
    expect(n).toBeGreaterThan(1);
  });

  it('fails when doibung.com is not 200, www does not redirect, or a bad sha is served', async () => {
    const { fetchImpl } = fakeServer({
      'https://doibung.com/': () => ({ status: 502, body: '' }),
      'https://www.doibung.com/': () => ({ status: 200, body: 'www' }),
      'https://breaktime.doibung.com/b/zzz/': () => ({ status: 200, body: '<html>' }),
    });
    const results = await runSmoke({ sha: SHA, firstActivation: false, fetchImpl, sleep: async () => {} });
    const failedNames = results.filter((r) => !r.ok).map((r) => r.name);
    expect(failedNames.length).toBe(3);
    expect(failedNames.join(' ')).toContain('doibung.com/');
    expect(failedNames.join(' ')).toContain('www');
    expect(failedNames.join(' ')).toContain('zzz');
  });

  it('fails the asset check when index.html references no entry script', async () => {
    const { fetchImpl } = fakeServer({
      'https://breaktime.doibung.com/': () => ({
        status: 200,
        headers: { 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' },
        body: "<meta content=\"'wasm-unsafe-eval'\">",
      }),
    });
    const results = await runSmoke({ sha: SHA, firstActivation: false, fetchImpl, sleep: async () => {} });
    const asset = results.find((r) => r.name.includes('asset'));
    expect(asset.ok).toBe(false);
  });
});

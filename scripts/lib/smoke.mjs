// scripts/lib/smoke.mjs — post-deploy smoke (D-03, D-04, PLAT-01/02, RESEARCH Pattern 12/13).
// Default TLS verification only: a MITM or wrong certificate must fail the smoke (T-01-07-04).
import { validateSha } from './releases.mjs';

const BREAKTIME = 'https://game.doibung.com';
const DOIBUNG = 'https://doibung.com/';
const WWW = 'https://www.doibung.com/';
const REQUEST_TIMEOUT_MS = 15000;
const RETRY_EVERY_MS = 3000;

function getHeader(headers, name) {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') return headers.get(name) ?? undefined;
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === want) return Array.isArray(v) ? v.join(', ') : v;
  }
  return undefined;
}

function matches(re, value) {
  if (typeof value !== 'string') return false;
  re.lastIndex = 0;
  return re.test(value);
}

/**
 * Pure evaluation of one response against one check. Every rule is checked; all problems are reported.
 * @param {{ name: string, expectStatus: number[], headers?: Record<string, RegExp>, bodyIncludes?: string[],
 *           location?: RegExp, jsonEquals?: Record<string, unknown> }} check
 * @param {{ status: number, headers?: any, body?: string, location?: string, error?: string }} res
 * @returns {{ name: string, ok: boolean, detail: string }}
 */
export function evaluateResponse(check, res) {
  const name = check?.name ?? '(unnamed)';
  const problems = [];
  const expect = Array.isArray(check?.expectStatus) ? check.expectStatus : [];
  const status = res?.status;
  if (expect.length === 0) problems.push('check has no expected status');
  if (res?.error) problems.push(`request failed: ${res.error}`);
  if (!expect.includes(status)) problems.push(`status ${status} expected one of ${expect.join('/')}`);

  for (const [header, re] of Object.entries(check?.headers ?? {})) {
    const value = getHeader(res?.headers, header);
    if (!matches(re, value)) problems.push(`header ${header.toLowerCase()}=${value ?? '(missing)'} does not match ${re}`);
  }

  if (check?.location) {
    const loc = res?.location || getHeader(res?.headers, 'location');
    if (!matches(check.location, loc)) problems.push(`location ${loc || '(missing)'} does not match ${check.location}`);
  }

  const body = typeof res?.body === 'string' ? res.body : '';
  for (const needle of check?.bodyIncludes ?? []) {
    if (!body.includes(needle)) problems.push(`body does not include «${needle}»`);
  }

  if (check?.jsonEquals) {
    let json;
    try {
      json = JSON.parse(body);
    } catch {
      problems.push('body is not JSON');
    }
    if (json !== undefined) {
      for (const [k, v] of Object.entries(check.jsonEquals)) {
        if (json?.[k] !== v) problems.push(`json ${k}=${JSON.stringify(json?.[k])} expected ${JSON.stringify(v)}`);
      }
    }
  }

  return problems.length === 0
    ? { name, ok: true, detail: `status ${status}` }
    : { name, ok: false, detail: problems.join('; ') };
}

/** First `assets/index-<hash>.js` referenced by index.html, without a leading ./ or /. */
export function findEntryAsset(html) {
  const m = /assets\/index-[A-Za-z0-9_-]+\.js/.exec(typeof html === 'string' ? html : '');
  return m ? m[0] : null;
}

/**
 * Live smoke of breaktime, doibung.com and www. Never throws for HTTP/TLS failures: each becomes a
 * failed result. Throws only for an invalid sha (before any request).
 * @param {{ sha: string, firstActivation: boolean, fetchImpl?: typeof fetch,
 *           sleep?: (ms: number) => Promise<void>, now?: () => number }} opts
 * @returns {Promise<{ name: string, ok: boolean, detail: string }[]>}
 */
export async function runSmoke({
  sha,
  firstActivation,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  now = Date.now,
}) {
  validateSha(sha);

  const get = async (url) => {
    try {
      const res = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      const body = await res.text();
      return { status: res.status, headers: res.headers, body, location: res.headers.get('location') ?? '' };
    } catch (e) {
      const cause = e?.cause?.code ?? e?.cause?.message;
      return { status: 0, error: `${e?.name === 'TimeoutError' ? 'timeout' : e?.message ?? e}${cause ? ` (${cause})` : ''}` };
    }
  };
  const one = async (check, url) => evaluateResponse(check, await get(url));
  const results = [];

  // 1. version.json carries the new sha; the first activation waits for ACME (up to 120 s).
  const windowMs = firstActivation ? 120000 : 20000;
  const versionCheck = { name: 'breaktime /version.json sha', expectStatus: [200], jsonEquals: { sha } };
  const started = now();
  let attempts = 0;
  let version;
  for (;;) {
    attempts += 1;
    version = await one(versionCheck, `${BREAKTIME}/version.json`);
    if (version.ok || now() - started + RETRY_EVERY_MS > windowMs) break;
    await sleep(RETRY_EVERY_MS);
  }
  results.push({ ...version, detail: `${version.detail} (attempts=${attempts}, window=${windowMs / 1000}s)` });

  // 2. / with the security and cache headers; its body names the hashed entry asset.
  const rootRes = await get(`${BREAKTIME}/`);
  results.push(
    evaluateResponse(
      {
        name: 'breaktime /',
        expectStatus: [200],
        headers: { 'cache-control': /no-cache/, 'x-content-type-options': /^nosniff$/i },
        bodyIncludes: ['wasm-unsafe-eval'],
      },
      rootRes,
    ),
  );

  results.push(await one({ name: `breaktime /b/${sha}/`, expectStatus: [200] }, `${BREAKTIME}/b/${sha}/`));
  results.push(
    await one(
      { name: `breaktime /b/${sha}/version.json sha`, expectStatus: [200], jsonEquals: { sha } },
      `${BREAKTIME}/b/${sha}/version.json`,
    ),
  );
  results.push(
    await one(
      {
        name: `breaktime /b/${sha} (no slash)`,
        expectStatus: [308],
        location: new RegExp(`/b/${sha}/$`),
      },
      `${BREAKTIME}/b/${sha}`,
    ),
  );

  const entry = findEntryAsset(rootRes.body);
  if (entry) {
    results.push(
      await one(
        { name: `breaktime asset ${entry}`, expectStatus: [200], headers: { 'cache-control': /immutable/ } },
        `${BREAKTIME}/${entry}`,
      ),
    );
  } else {
    results.push({ name: 'breaktime asset assets/index-*.js', ok: false, detail: 'no entry script found in / body' });
  }

  results.push(await one({ name: 'breaktime /b/zzz/ (bad sha)', expectStatus: [404] }, `${BREAKTIME}/b/zzz/`));
  results.push(await one({ name: DOIBUNG, expectStatus: [200] }, DOIBUNG));
  results.push(
    await one({ name: WWW, expectStatus: [301, 308], location: /^https:\/\/doibung\.com(\/|$)/ }, WWW),
  );
  return results;
}

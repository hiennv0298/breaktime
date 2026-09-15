import { expect, test } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPageProblems, waitForBtState } from './helpers';
import { evaluateFirstLoad, groupOf } from '../../scripts/lib/sizeGate.mjs';

// TECH-02: sum every same-origin response the page needs until __bt.state is ready-to-play.
// Desktop project only (mobile-emu ignores this file in playwright.config.ts).

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = resolve(REPO_ROOT, 'test-results');
const OUT_FILE = resolve(OUT_DIR, 'first-load.json');
const REASON_FILE = resolve(REPO_ROOT, 'SIZE-REASON.md');

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'first-load is measured on the desktop project only');
});

test('first load until ready-to-play stays inside the TECH-02 budget', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const problems = collectPageProblems(page, baseURL!);
  const sizes = new Map<string, number>();
  const pending: Promise<void>[] = [];

  // Registered before navigation so the document and every chunk are seen.
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin !== origin || response.status() !== 200) return;
    pending.push(
      response
        .body()
        .then((body) => {
          sizes.set(url.pathname, body.length);
        })
        .catch(() => {
          /* body unavailable (e.g. navigation replaced); not counted */
        }),
    );
  });

  await page.goto('./');
  await waitForBtState(page, 'ready-to-play', 90_000);
  await Promise.all(pending);

  const files = [...sizes.entries()]
    .map(([path, raw]) => ({ path, raw }))
    .sort((a, b) => b.raw - a.raw);
  const totalRaw = files.reduce((sum, f) => sum + f.raw, 0);
  const reasonText = existsSync(REASON_FILE) ? readFileSync(REASON_FILE, 'utf8') : null;
  const verdict = evaluateFirstLoad(totalRaw, reasonText);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify({ totalRaw, level: verdict.level, files }, null, 2) + '\n');
  console.log(`FIRST_LOAD_RAW=${totalRaw}`);
  console.log(`FIRST_LOAD_LEVEL=${verdict.level} ${verdict.message}`);

  // Guard against a vacuous pass: the document and the entry chunk must have been observed.
  expect(files.some((f) => f.path === '/' || f.path.endsWith('/index.html'))).toBe(true);
  expect(files.some((f) => groupOf(f.path.replace(/^\//, '')) === 'entry-js')).toBe(true);
  expect(verdict.level, verdict.message).not.toBe('fail');

  const flavor = await page.evaluate(
    () => (window as unknown as { __bt: { rapierFlavor?: string } }).__bt.rapierFlavor,
  );
  expect(['simd', 'compat']).toContain(flavor);
  if (flavor === 'simd') {
    expect(files.filter((f) => f.path.includes('rapier3d-compat'))).toEqual([]);
    // Vite names both Rapier builds rapier-<hash>.js, so the name check above alone cannot see the
    // fallback. Each flavour chunk is > 1 MB and the loader is tiny: exactly one big Rapier chunk
    // proves the compat fallback was not fetched.
    const bigRapier = files.filter((f) => groupOf(f.path.replace(/^\//, '')) === 'rapier' && f.raw > 1_000_000);
    expect(bigRapier, JSON.stringify(bigRapier)).toHaveLength(1);
  }

  expect(problems.errors).toEqual([]);
  expect(problems.offOrigin).toEqual([]);
});

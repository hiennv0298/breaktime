import { expect, test, type Page } from '@playwright/test';
import { collectPageProblems, waitForBtState, type PageProblems } from './helpers';

/*
 * Plan 01-17 (D-08, D-11 revised, D-21, D-24, D-29): ?bench=1 plays a fixed, seeded scenario with 10 NPCs and ends on a
 * results screen. Headless SwiftShader fps says nothing about phones (D-24), so this spec only checks that the run
 * completes, the result has the right shape and the scene stays inside the draw-call / body budget.
 */

type BenchResult = {
  sha: string;
  durationSec: number;
  frames: number;
  avgFps: number;
  low1Fps: number;
  peakDrawCalls: number;
  peakBodies: number;
  tier: string;
  tierSource: string;
  tierChanges: string[];
  flavor: string;
  dpr: number;
  backbuffer: string;
  throttled: boolean;
  npcCount: number;
  maxSimultaneousRagdolls: number;
  knockedOrBroken: number;
  broken: number;
  userAgent: string;
};

type Bt = {
  bench?: { running: boolean; done: boolean; result: BenchResult | null };
  keyHints?: { visible: boolean; touchHintVisible: boolean };
  npcSettings?: { count: number; source: string };
};

const BENCH_URL = './?bench=1&dur=8&autoplay=1';
const NPCS_KEY = 'bt.npcs';

function bt<K extends keyof Bt>(page: Page, key: K): Promise<Bt[K]> {
  return page.evaluate((k) => (window as unknown as { __bt: Bt }).__bt[k as keyof Bt], key) as Promise<Bt[K]>;
}

async function runBench(page: Page, baseURL: string, url: string): Promise<{ result: BenchResult; problems: PageProblems }> {
  const problems = collectPageProblems(page, baseURL);
  await page.goto(url);
  await waitForBtState(page, 'playing', 60_000);
  await page.waitForFunction(() => (window as unknown as { __bt: Bt }).__bt.bench?.running === true, undefined, {
    timeout: 10_000,
    polling: 50,
  });
  // D-28 panels are suppressed while the bench runs.
  const hints = await bt(page, 'keyHints');
  expect(hints!.visible).toBe(false);
  expect(hints!.touchHintVisible).toBe(false);

  await page.waitForFunction(() => (window as unknown as { __bt: Bt }).__bt.bench?.done === true, undefined, {
    timeout: 90_000,
    polling: 200,
  });
  const bench = await bt(page, 'bench');
  expect(bench!.running).toBe(false);
  expect(bench!.result).not.toBeNull();
  return { result: bench!.result!, problems };
}

function expectClean(problems: PageProblems): void {
  expect(problems.errors).toEqual([]);
  expect(problems.offOrigin).toEqual([]);
}

test.describe('bench desktop', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'bench tests run in the desktop project only');
  });

  test('?bench=1&dur=8 completes with 10 NPCs inside the draw-call and body budget', async ({ page, baseURL }) => {
    const { result: r, problems } = await runBench(page, baseURL!, BENCH_URL);

    expect(r.frames).toBeGreaterThan(30);
    expect(r.durationSec).toBe(8);
    expect(r.peakBodies).toBeGreaterThan(40);
    expect(r.peakBodies).toBeLessThanOrEqual(200);
    expect(r.peakDrawCalls).toBeGreaterThan(0);
    expect(r.peakDrawCalls).toBeLessThanOrEqual(120);
    expect(r.sha).toMatch(/^[0-9a-f]{12}$/);
    expect(['low', 'med', 'high']).toContain(r.tier);
    expect(['auto', 'manual', 'forced']).toContain(r.tierSource);
    expect(Array.isArray(r.tierChanges)).toBe(true);
    expect(['simd', 'compat']).toContain(r.flavor);
    expect(r.dpr).toBeGreaterThan(0);
    expect(r.backbuffer).toMatch(/^\d+x\d+$/);
    expect(typeof r.throttled).toBe('boolean');
    expect(r.npcCount).toBe(10);
    expect(r.maxSimultaneousRagdolls).toBe(10);
    expect(r.knockedOrBroken).toBeGreaterThanOrEqual(20);
    expect(r.broken).toBeGreaterThanOrEqual(0);
    expect(r.broken).toBeLessThanOrEqual(r.knockedOrBroken);
    expect(r.avgFps).toBeGreaterThan(0);
    expect(r.low1Fps).toBeGreaterThan(0);
    expect(r.userAgent.length).toBeGreaterThan(0);

    const results = page.locator('#bench-results');
    await expect(results).toBeVisible();
    for (const text of ['FPS TB', '1% thấp', 'NPC', r.sha, 'Tier', 'Draw call đỉnh', 'Physics body đỉnh', 'Bị giới hạn 30 fps?']) {
      await expect(results).toContainText(text);
    }
    // One phone screenshot: the overlay never scrolls at the desktop viewport either.
    const fits = await results.evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
    expect(fits).toBe(true);

    expectClean(problems);
  });

  test('a saved NPC count of 2 still benches 10 NPCs and the saved value is left unchanged', async ({ page, baseURL }) => {
    const stored = JSON.stringify({ v: 1, count: 2, names: ['An', 'Bình', '', '', '', '', '', '', '', ''] });
    await page.addInitScript(
      ([key, v]) => {
        try {
          if (sessionStorage.getItem('bt.test.seeded') === '1') return;
          localStorage.setItem(key, v);
          sessionStorage.setItem('bt.test.seeded', '1');
        } catch {
          // storage unavailable: the test then fails on the stored-value check
        }
      },
      [NPCS_KEY, stored] as const,
    );
    const { result: r, problems } = await runBench(page, baseURL!, BENCH_URL);

    expect(r.npcCount).toBe(10);
    expect(r.maxSimultaneousRagdolls).toBe(10);
    const settings = await bt(page, 'npcSettings');
    expect(settings!.count).toBe(10);
    expect(settings!.source).toBe('query');
    const after = await page.evaluate((key) => localStorage.getItem(key), NPCS_KEY);
    expect(after).toBe(stored);

    expectClean(problems);
  });

  test('&q=low forces the low tier and reports it as forced', async ({ page, baseURL }) => {
    const { result: r, problems } = await runBench(page, baseURL!, BENCH_URL + '&q=low');

    expect(r.tier).toBe('low');
    expect(r.tierSource).toBe('forced');
    expect(r.tierChanges).toEqual([]);
    expect(r.npcCount).toBe(10);

    expectClean(problems);
  });
});

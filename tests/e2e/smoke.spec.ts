import { expect, test, type Page } from '@playwright/test';
import { collectPageProblems, waitForBtState } from './helpers';

type Bt = { state?: string; loadProgress?: number; rapierFlavor?: string; simStep?: number };

test.beforeEach(({}, testInfo) => {
  test.skip(!['desktop', 'mobile-emu'].includes(testInfo.project.name), 'smoke runs on WebGL projects only');
});

function bt<K extends keyof Bt>(page: Page, key: K): Promise<Bt[K]> {
  return page.evaluate((k) => (window as unknown as { __bt: Bt }).__bt[k as keyof Bt], key) as Promise<Bt[K]>;
}

/** simStep growth measured inside the page over exactly 1000 ms of wall time. */
function simStepGrowthOver1s(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const b = (window as unknown as { __bt: Bt }).__bt;
        const s0 = b.simStep ?? 0;
        setTimeout(() => resolve((b.simStep ?? 0) - s0), 1000);
      }),
  );
}

async function expectOneSizedCanvas(page: Page): Promise<void> {
  const canvases = await page.evaluate(() =>
    Array.from(document.querySelectorAll('canvas')).map((c) => {
      const r = c.getBoundingClientRect();
      return { w: r.width, h: r.height, bw: c.width, bh: c.height };
    }),
  );
  expect(canvases).toHaveLength(1);
  expect(canvases[0].w).toBeGreaterThan(0);
  expect(canvases[0].h).toBeGreaterThan(0);
  expect(canvases[0].bw).toBeGreaterThan(0);
  expect(canvases[0].bh).toBeGreaterThan(0);
}

test('boot reaches ready-to-play with a Chơi button, full progress, clean console and same-origin only', async ({ page, baseURL }) => {
  const problems = collectPageProblems(page, baseURL!);
  let requests = 0;
  page.on('request', () => requests++);
  await page.goto('./');
  await waitForBtState(page, 'ready-to-play', 60_000);

  await expect(page.getByRole('button', { name: 'Chơi' })).toBeVisible();
  expect(await bt(page, 'loadProgress')).toBe(1);
  await expect(page.locator('#loading')).toHaveCount(0);
  expect(requests).toBeGreaterThan(1);
  expect(problems.errors).toEqual([]);
  expect(problems.offOrigin).toEqual([]);
});

test('clicking Chơi starts the loop: playing, simStep advancing, Rapier flavor, one canvas', async ({ page, baseURL }) => {
  const problems = collectPageProblems(page, baseURL!);
  await page.goto('./');
  await waitForBtState(page, 'ready-to-play', 60_000);
  await page.getByRole('button', { name: 'Chơi' }).click();
  await waitForBtState(page, 'playing', 30_000);

  await expect(page.locator('#play')).toHaveCount(0);
  expect(await simStepGrowthOver1s(page)).toBeGreaterThan(20);
  expect(['simd', 'compat']).toContain(await bt(page, 'rapierFlavor'));
  await expectOneSizedCanvas(page);
  expect(problems.errors).toEqual([]);
  expect(problems.offOrigin).toEqual([]);
});

test('?autoplay=1 reaches playing without a click', async ({ page, baseURL }) => {
  const problems = collectPageProblems(page, baseURL!);
  await page.goto('./?autoplay=1');
  await waitForBtState(page, 'playing', 60_000);

  await expect(page.locator('#play')).toHaveCount(0);
  expect(await simStepGrowthOver1s(page)).toBeGreaterThan(20);
  await expectOneSizedCanvas(page);
  expect(problems.errors).toEqual([]);
  expect(problems.offOrigin).toEqual([]);
});

test('?autoplay=1&simd0 forces the compat Rapier build', async ({ page, baseURL }) => {
  const problems = collectPageProblems(page, baseURL!);
  await page.goto('./?autoplay=1&simd0');
  await waitForBtState(page, 'playing', 60_000);

  expect(await bt(page, 'rapierFlavor')).toBe('compat');
  expect(await simStepGrowthOver1s(page)).toBeGreaterThan(20);
  expect(problems.errors).toEqual([]);
  expect(problems.offOrigin).toEqual([]);
});

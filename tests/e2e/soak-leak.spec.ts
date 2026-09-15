import { expect, test, type Page } from '@playwright/test';
import { collectPageProblems, waitForBtState, type PageProblems } from './helpers';

/*
 * Plan 01-18 (TECH-04, D-08, D-24). Headless Chromium cannot prove "15 minutes on Safari iOS without a crash"; that is
 * the real-device gate (01-19). These tests are the automated proxy:
 *  - ?soak=1 cycles the benchmark scene and resets it every cycle; renderer geometries/textures and physics bodies
 *    must return to the end-of-cycle-1 baseline, so repeated cycles do not leak GPU resources or Rapier bodies;
 *  - the localStorage crash beacon turns a renderer crash into a banner on the next load, and a normal close does not.
 */

type CycleEnd = { cycle: number; geometries: number; textures: number; bodies: number; debrisActive: number };

type Soak = {
  running: boolean;
  done: boolean;
  cycles: number;
  elapsedSec: number;
  minFpsPerMinute: number[];
  geometries: number;
  textures: number;
  bodies: number;
  contextLost: number;
  baseline: { geometries: number; textures: number; bodies: number } | null;
  cycleEnds: CycleEnd[];
};

type Bt = {
  sha?: string;
  soak?: Soak;
  debris?: { active: number };
  beacon?: { prevCrash: { crashedAfterSec: number; sha: string } | null };
  keyHints?: { visible: boolean; touchHintVisible: boolean };
};

const SOAK_URL = './?soak=1&soakCycles=3&dur=6&autoplay=1';

function bt<K extends keyof Bt>(page: Page, key: K): Promise<Bt[K]> {
  return page.evaluate((k) => (window as unknown as { __bt: Bt }).__bt[k as keyof Bt], key) as Promise<Bt[K]>;
}

function expectClean(problems: PageProblems): void {
  expect(problems.errors).toEqual([]);
  expect(problems.offOrigin).toEqual([]);
}

test.describe('soak leak proxy and crash beacon (desktop)', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'soak and crash tests run in the desktop project only');
  });

  test('?soak=1 runs 3 cycles and GPU resources and bodies return to the cycle-1 baseline', async ({ page, baseURL }) => {
    test.setTimeout(180_000);
    const problems = collectPageProblems(page, baseURL!);
    await page.goto(SOAK_URL);
    await waitForBtState(page, 'playing', 60_000);
    await page.waitForFunction(() => (window as unknown as { __bt: Bt }).__bt.soak?.running === true, undefined, {
      timeout: 10_000,
      polling: 50,
    });
    // The soak hides the D-28 hint panels for the whole run, like the bench.
    const hints = await bt(page, 'keyHints');
    expect(hints!.visible).toBe(false);
    expect(hints!.touchHintVisible).toBe(false);

    await page.waitForFunction(() => (window as unknown as { __bt: Bt }).__bt.soak?.done === true, undefined, {
      timeout: 120_000,
      polling: 250,
    });
    const soak = (await bt(page, 'soak'))!;
    expect(soak.running).toBe(false);
    expect(soak.cycles).toBe(3);
    expect(soak.elapsedSec).toBeGreaterThan(10);
    expect(soak.cycleEnds.map((c) => c.cycle)).toEqual([1, 2, 3]);

    // Every cycle ends with the scene reset: no live shards.
    for (const c of soak.cycleEnds) expect(c.debrisActive).toBe(0);
    const debris = await bt(page, 'debris');
    expect(debris!.active).toBe(0);

    const base = soak.baseline!;
    expect(base).not.toBeNull();
    expect(base).toEqual({
      geometries: soak.cycleEnds[0].geometries,
      textures: soak.cycleEnds[0].textures,
      bodies: soak.cycleEnds[0].bodies,
    });
    expect(base.geometries).toBeGreaterThan(0);
    expect(base.textures).toBeGreaterThan(0);
    expect(base.bodies).toBeGreaterThan(40);
    const final = soak.cycleEnds[2];
    expect(final.geometries - base.geometries).toBeLessThanOrEqual(2);
    expect(final.textures - base.textures).toBeLessThanOrEqual(1);
    expect(final.bodies - base.bodies).toBeLessThanOrEqual(2);

    expect(Array.isArray(soak.minFpsPerMinute)).toBe(true);
    expect(soak.minFpsPerMinute.length).toBeGreaterThanOrEqual(1);
    expect(soak.contextLost).toBe(0);

    const panel = page.locator('#soak-panel');
    await expect(panel).toBeVisible();
    for (const text of ['Phút', 'Chu kỳ', 'FPS thấp nhất/phút', 'Mất ngữ cảnh', 'Geometries', 'Textures', 'Bodies']) {
      await expect(panel).toContainText(text);
    }
    await expect(panel).toContainText('không crash');

    expectClean(problems);
  });

  test('a crashed renderer shows the crash banner with the sha on the next load; a normal close does not', async ({
    page,
    context,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    await page.goto('./?autoplay=1');
    await waitForBtState(page, 'playing', 60_000);
    const sha = (await bt(page, 'sha'))!;
    expect(sha).toMatch(/^[0-9a-f]{12}$/);
    // No banner on a fresh device.
    await expect(page.locator('#crash-banner')).toHaveCount(0);
    // At least one heartbeat after boot.
    await page.waitForTimeout(6_000);

    const crashed = page.waitForEvent('crash', { timeout: 15_000 });
    const cdp = await context.newCDPSession(page);
    void cdp.send('Page.crash').catch(() => undefined);
    await crashed;

    const second = await context.newPage();
    const problems = collectPageProblems(second, baseURL!);
    await second.goto('./');
    const banner = second.locator('#crash-banner');
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText(sha);
    await expect(banner).toContainText('Lần chơi trước bị dừng đột ngột sau');
    const beacon = await bt(second, 'beacon');
    expect(beacon!.prevCrash).not.toBeNull();
    expect(beacon!.prevCrash!.sha).toBe(sha);
    expect(beacon!.prevCrash!.crashedAfterSec).toBeGreaterThanOrEqual(0);
    // The page under the banner still boots normally.
    await waitForBtState(second, 'ready-to-play', 60_000);
    expectClean(problems);

    await second.close({ runBeforeUnload: true });

    const third = await context.newPage();
    const problems3 = collectPageProblems(third, baseURL!);
    await third.goto('./');
    await waitForBtState(third, 'ready-to-play', 60_000);
    await expect(third.locator('#crash-banner')).toHaveCount(0);
    const beacon3 = await bt(third, 'beacon');
    expect(beacon3!.prevCrash).toBeNull();
    expectClean(problems3);
  });
});

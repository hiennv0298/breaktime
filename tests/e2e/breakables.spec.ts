import { expect, test, type Page } from '@playwright/test';
import { collectPageProblems, waitForBtState, type PageProblems } from './helpers';

/*
 * Plan 01-16: breakables and debris (D-13, D-15, D-21). ?scenario=smash knocks every dynamic prop and breaks every
 * breakable a moment after start; shards come from one shared kit, live 2.5 s + 0.3 s shrink and never exceed the
 * tier's debris cap.
 */

type Vec3 = [number, number, number];
type Bt = {
  debris?: { active: number; cap: number; broken: number };
  props?: { dynamicCount: number; breakableCount: number; movedCount: number };
  audio?: { requests: number; requested: string[] };
  box?: { pos: Vec3 };
  player?: { pos: Vec3 };
  interactCount?: number;
  quality?: { tier: string };
};

type Watch = {
  maxActive: number;
  overCap: string[];
  lastBreakAt: number;
  lastBroken: number;
  sawBreakSound: boolean;
};

function bt<K extends keyof Bt>(page: Page, key: K): Promise<Bt[K]> {
  return page.evaluate((k) => (window as unknown as { __bt: Bt }).__bt[k as keyof Bt], key) as Promise<Bt[K]>;
}

async function startPlaying(page: Page, baseURL: string, url: string): Promise<PageProblems> {
  const problems = collectPageProblems(page, baseURL);
  await page.goto(url);
  await waitForBtState(page, 'playing', 60_000);
  await page.waitForFunction(
    () => {
      const b = (window as unknown as { __bt: Bt }).__bt;
      return !!b.debris && typeof b.props?.movedCount === 'number' && !!b.audio;
    },
    undefined,
    { timeout: 10_000, polling: 100 },
  );
  return problems;
}

/** Records debris stats on every animation frame, so a short over-cap spike or a break SFX cannot slip between polls. */
async function watchDebris(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __bt: Bt; __debrisWatch?: Watch };
    const watch: Watch = { maxActive: 0, overCap: [], lastBreakAt: performance.now(), lastBroken: 0, sawBreakSound: false };
    w.__debrisWatch = watch;
    const tick = () => {
      const d = w.__bt.debris;
      if (d) {
        if (d.active > watch.maxActive) watch.maxActive = d.active;
        if (d.active > d.cap && watch.overCap.length < 5) watch.overCap.push(`${d.active}>${d.cap}`);
        if (d.broken !== watch.lastBroken) {
          watch.lastBroken = d.broken;
          watch.lastBreakAt = performance.now();
        }
      }
      if (!watch.sawBreakSound && w.__bt.audio?.requested.some((n) => n.startsWith('break-'))) watch.sawBreakSound = true;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function readWatch(page: Page): Promise<Watch> {
  return page.evaluate(() => (window as unknown as { __debrisWatch: Watch }).__debrisWatch);
}

function expectClean(problems: PageProblems): void {
  expect(problems.errors).toEqual([]);
  expect(problems.offOrigin).toEqual([]);
}

test.describe('breakables desktop', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'breakables tests run in the desktop project only');
  });

  test('?scenario=smash breaks >= 10, moves >= 20, stays under the cap and cleans up', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!, './?autoplay=1&scenario=smash');
    await watchDebris(page);

    const props = await bt(page, 'props');
    expect(props!.breakableCount).toBeGreaterThanOrEqual(10);
    expect(props!.dynamicCount).toBeGreaterThanOrEqual(20);

    await page.waitForFunction(
      () => {
        const b = (window as unknown as { __bt: Bt }).__bt;
        return (b.debris?.broken ?? 0) >= 10 && (b.props?.movedCount ?? 0) >= 20;
      },
      undefined,
      { timeout: 8000, polling: 50 },
    );
    const peak = await bt(page, 'debris');
    expect(peak!.broken).toBeGreaterThanOrEqual(10);

    // Wait until nothing has broken for 4 s, then every shard must be gone (2.5 s life + 0.3 s shrink).
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __debrisWatch: Watch };
        return performance.now() - w.__debrisWatch.lastBreakAt >= 4000;
      },
      undefined,
      { timeout: 20_000, polling: 100 },
    );
    const done = await bt(page, 'debris');
    expect(done!.active).toBe(0);

    const watch = await readWatch(page);
    expect(watch.overCap).toEqual([]);
    expect(watch.maxActive).toBeGreaterThan(0);
    expect(watch.maxActive).toBeLessThanOrEqual(60);
    expect(watch.sawBreakSound).toBe(true);

    const moved = await bt(page, 'props');
    expect(moved!.movedCount).toBeGreaterThanOrEqual(20);
    expectClean(problems);
  });

  test('?scenario=smash&q=low caps live shards at 20', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!, './?autoplay=1&scenario=smash&q=low');
    await watchDebris(page);
    expect((await bt(page, 'quality'))!.tier).toBe('low');
    expect((await bt(page, 'debris'))!.cap).toBe(20);

    await page.waitForFunction(
      () => ((window as unknown as { __bt: Bt }).__bt.debris?.broken ?? 0) >= 10,
      undefined,
      { timeout: 8000, polling: 50 },
    );
    // Let the burst play out while the watcher keeps sampling.
    await page.waitForTimeout(1000);
    const watch = await readWatch(page);
    expect(watch.overCap).toEqual([]);
    expect(watch.maxActive).toBeGreaterThan(0);
    expect(watch.maxActive).toBeLessThanOrEqual(20);
    expect((await bt(page, 'debris'))!.cap).toBe(20);
    expectClean(problems);
  });

  test('pushing the test box (not breakable) never breaks anything', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!, './?autoplay=1&npcs=0');
    await page.waitForFunction(() => !!(window as unknown as { __bt: Bt }).__bt.player, undefined, { timeout: 10_000 });
    await page.waitForTimeout(600);
    expect((await bt(page, 'debris'))!.broken).toBe(0);

    await page.keyboard.down('KeyW');
    await page.waitForFunction(
      () => {
        const b = (window as unknown as { __bt: Bt }).__bt;
        const p = b.player!.pos;
        const x = b.box!.pos;
        return Math.hypot(p[0] - x[0], p[2] - x[2]) < 1.2;
      },
      undefined,
      { timeout: 4000, polling: 16 },
    );
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(100);

    const box0 = (await bt(page, 'box'))!.pos;
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(700);
    }
    const box1 = (await bt(page, 'box'))!.pos;
    expect(Math.hypot(box1[0] - box0[0], box1[2] - box0[2])).toBeGreaterThanOrEqual(0.3);
    expect(await bt(page, 'interactCount')).toBeGreaterThanOrEqual(1);

    await page.waitForTimeout(1500);
    expect((await bt(page, 'debris'))!.broken).toBe(0);
    expect((await bt(page, 'debris'))!.active).toBe(0);
    expectClean(problems);
  });
});

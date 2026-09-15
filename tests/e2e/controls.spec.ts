import { expect, test, type Page } from '@playwright/test';
import { collectPageProblems, waitForBtState, type PageProblems } from './helpers';

type Vec3 = [number, number, number];
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
type Bt = {
  player?: { pos: Vec3; yaw: number };
  box?: { pos: Vec3 };
  room?: { bounds: Bounds };
  interactCount?: number;
};

/** Wall inner faces sit 0.1 m inside the bounds; the capsule centre must stay at least 0.2 m inside. */
const WALL_MARGIN = 0.2;

function bt<K extends keyof Bt>(page: Page, key: K): Promise<Bt[K]> {
  return page.evaluate((k) => (window as unknown as { __bt: Bt }).__bt[k as keyof Bt], key) as Promise<Bt[K]>;
}

async function playerPos(page: Page): Promise<Vec3> {
  const p = await bt(page, 'player');
  if (!p) throw new Error('__bt.player missing');
  return p.pos;
}

async function boxPos(page: Page): Promise<Vec3> {
  const b = await bt(page, 'box');
  if (!b) throw new Error('__bt.box missing');
  return b.pos;
}

function distXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

async function holdKey(page: Page, code: string, ms: number): Promise<void> {
  await page.keyboard.down(code);
  await page.waitForTimeout(ms);
  await page.keyboard.up(code);
}

async function startPlaying(page: Page, baseURL: string): Promise<PageProblems> {
  const problems = collectPageProblems(page, baseURL);
  await page.goto('./?autoplay=1');
  await waitForBtState(page, 'playing', 60_000);
  // The player and box keys exist once the game is created.
  await page.waitForFunction(
    () => {
      const b = (window as unknown as { __bt: Bt }).__bt;
      return !!b.player && !!b.box && !!b.room && typeof b.interactCount === 'number';
    },
    undefined,
    { timeout: 10_000, polling: 100 },
  );
  // Let the capsule snap to the floor and the box settle before measuring.
  await page.waitForTimeout(400);
  return problems;
}

function expectClean(problems: PageProblems): void {
  expect(problems.errors).toEqual([]);
  expect(problems.offOrigin).toEqual([]);
}

test.describe('desktop', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop keyboard controls run in the desktop project only');
  });

  test('WASD moves player', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);

    const p0 = await playerPos(page);
    await holdKey(page, 'KeyW', 1000);
    const p1 = await playerPos(page);
    expect(distXZ(p0, p1)).toBeGreaterThanOrEqual(1.0);
    expect(p1[2]).toBeLessThan(p0[2]); // W is world -Z at camera yaw 0

    await holdKey(page, 'KeyD', 800);
    const p2 = await playerPos(page);
    expect(p2[0] - p1[0]).toBeGreaterThanOrEqual(0.6);

    expectClean(problems);
  });

  test('walls block', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    const room = await bt(page, 'room');
    if (!room) throw new Error('__bt.room missing');
    const b = room.bounds;

    await page.keyboard.down('KeyW');
    const samples: Vec3[] = [];
    for (let i = 0; i < 16; i++) {
      await page.waitForTimeout(500);
      samples.push(await playerPos(page));
    }
    await page.keyboard.up('KeyW');

    for (const s of samples) {
      expect(s[0]).toBeGreaterThanOrEqual(b.minX + WALL_MARGIN);
      expect(s[0]).toBeLessThanOrEqual(b.maxX - WALL_MARGIN);
      expect(s[2]).toBeGreaterThanOrEqual(b.minZ + WALL_MARGIN);
      expect(s[2]).toBeLessThanOrEqual(b.maxZ - WALL_MARGIN);
    }
    // Guard against a vacuous pass: the player really walked up to the far wall (not frozen at spawn).
    const last = samples[samples.length - 1];
    expect(last[2]).toBeLessThan(b.minZ + 1.5);

    expectClean(problems);
  });

  test('E far from box does nothing', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);

    const p = await playerPos(page);
    const box0 = await boxPos(page);
    expect(distXZ(p, box0)).toBeGreaterThan(1.5);

    await page.keyboard.press('KeyE');
    await page.waitForTimeout(500);

    expect(await bt(page, 'interactCount')).toBe(0);
    const box1 = await boxPos(page);
    expect(Math.hypot(box1[0] - box0[0], box1[1] - box0[1], box1[2] - box0[2])).toBeLessThan(0.01);

    expectClean(problems);
  });

  test('E near box pushes it', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);

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

    const box0 = await boxPos(page);
    expect(distXZ(await playerPos(page), box0)).toBeLessThanOrEqual(1.5);
    expect(await bt(page, 'interactCount')).toBe(0);

    await page.keyboard.press('KeyE');
    await page.waitForFunction(
      (start) => {
        const b = (window as unknown as { __bt: Bt }).__bt;
        const x = b.box!.pos;
        return b.interactCount === 1 && Math.hypot(x[0] - start[0], x[1] - start[1], x[2] - start[2]) >= 0.3;
      },
      box0,
      { timeout: 1000, polling: 16 },
    );
    expect(await bt(page, 'interactCount')).toBe(1);

    expectClean(problems);
  });
});

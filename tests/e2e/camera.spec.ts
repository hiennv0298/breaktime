import { expect, test, type Page } from '@playwright/test';
import { collectPageProblems, touchTap, waitForBtState, type PageProblems } from './helpers';

/* Plan 01-09: camera rotation in 90° steps (D-19, CTRL-05) and fullscreen on the Chơi tap (D-23, D-26). */

type Vec3 = [number, number, number];
type Bt = {
  player?: { pos: Vec3; yaw: number };
  camera?: { yawDeg: number; targetYawDeg: number; distance: number; pitchDeg: number };
  fullscreen?: { enabled: boolean; requested: boolean; error: string | null };
};

function bt<K extends keyof Bt>(page: Page, key: K): Promise<Bt[K]> {
  return page.evaluate((k) => (window as unknown as { __bt: Bt }).__bt[k as keyof Bt], key) as Promise<Bt[K]>;
}

async function camera(page: Page): Promise<NonNullable<Bt['camera']>> {
  const c = await bt(page, 'camera');
  if (!c) throw new Error('__bt.camera missing');
  return c;
}

async function playerPos(page: Page): Promise<Vec3> {
  const p = await bt(page, 'player');
  if (!p) throw new Error('__bt.player missing');
  return p.pos;
}

async function startPlaying(page: Page, baseURL: string): Promise<PageProblems> {
  const problems = collectPageProblems(page, baseURL);
  await page.goto('./?autoplay=1');
  await waitForBtState(page, 'playing', 60_000);
  await page.waitForFunction(
    () => {
      const b = (window as unknown as { __bt: Bt }).__bt;
      return !!b.player && !!b.camera;
    },
    undefined,
    { timeout: 10_000, polling: 100 },
  );
  await page.waitForTimeout(400);
  return problems;
}

function expectClean(problems: PageProblems): void {
  expect(problems.errors).toEqual([]);
  expect(problems.offOrigin).toEqual([]);
}

/** Target is exact; the damped yaw has settled within 1°. */
async function expectYawAfter1s(page: Page, want: number): Promise<void> {
  await page.waitForTimeout(1000);
  const c = await camera(page);
  expect(c.targetYawDeg).toBe(want);
  expect(Math.abs(c.yawDeg - want)).toBeLessThan(1);
}

async function centreOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} has no bounding box (hidden or missing)`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe('camera desktop', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'keyboard camera rotation runs in the desktop project');
  });

  test('Z / C and arrow aliases rotate the target yaw by exactly 90°, E never rotates', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    const c0 = await camera(page);
    expect(c0.targetYawDeg).toBe(0);
    expect(Math.abs(c0.yawDeg)).toBeLessThan(1);
    // Fixed tilt, landscape distance (1280x720).
    expect(c0.pitchDeg).toBeCloseTo(55, 3);
    expect(c0.distance).toBeCloseTo(11, 3);

    await page.keyboard.press('KeyC');
    await expectYawAfter1s(page, 90);

    await page.keyboard.press('KeyZ');
    await expectYawAfter1s(page, 0);

    await page.keyboard.press('ArrowLeft');
    await expectYawAfter1s(page, -90);

    await page.keyboard.press('ArrowRight');
    await expectYawAfter1s(page, 0);

    // E is interact (Pitfall 10 / C1): it must never touch the camera.
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(500);
    const c1 = await camera(page);
    expect(c1.targetYawDeg).toBe(0);
    expect(Math.abs(c1.yawDeg)).toBeLessThan(1);
    expect(c1.pitchDeg).toBeCloseTo(55, 3);

    expectClean(problems);
  });

  test('WASD stays camera-relative after a rotation', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);

    await page.keyboard.press('KeyC');
    await page.waitForFunction(
      () => {
        const c = (window as unknown as { __bt: Bt }).__bt.camera!;
        return c.targetYawDeg === 90 && Math.abs(c.yawDeg - c.targetYawDeg) < 0.5;
      },
      undefined,
      { timeout: 3000, polling: 16 },
    );

    const p0 = await playerPos(page);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(800);
    await page.keyboard.up('KeyW');
    const p1 = await playerPos(page);
    // At camera yaw 90° forward on screen is world -X.
    expect(p0[0] - p1[0]).toBeGreaterThanOrEqual(0.5);
    expect(Math.abs(p1[2] - p0[2])).toBeLessThan(0.2);

    expectClean(problems);
  });
});

test.describe('camera mobile', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-emu', 'touch camera buttons run in the mobile-emu project');
  });

  test('⟳ and ⟲ buttons rotate the camera by 90° steps', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    await expect(page.locator('#btn-rot-right')).toBeVisible();
    await expect(page.locator('#btn-rot-left')).toBeVisible();
    await expect(page.locator('#btn-rot-right')).toHaveAttribute('data-hud-button', /.*/);
    await expect(page.locator('#btn-rot-left')).toHaveAttribute('data-hud-button', /.*/);

    // Top-right corner (D-19): both buttons sit in the right half and the top half.
    const vp = page.viewportSize()!;
    for (const sel of ['#btn-rot-left', '#btn-rot-right']) {
      const c = await centreOf(page, sel);
      expect(c.x).toBeGreaterThan(vp.width / 2);
      expect(c.y).toBeLessThan(vp.height / 2);
    }

    const right = await centreOf(page, '#btn-rot-right');
    await touchTap(page, right.x, right.y);
    await expectYawAfter1s(page, 90);

    const left = await centreOf(page, '#btn-rot-left');
    await touchTap(page, left.x, left.y);
    await page.waitForTimeout(100);
    await touchTap(page, left.x, left.y);
    await expectYawAfter1s(page, -90);

    expectClean(problems);
  });
});

test.describe('fullscreen', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'fullscreen request runs in the desktop project');
  });

  test('Chơi requests fullscreen only when document.fullscreenEnabled, with no error', async ({ page, baseURL }) => {
    const problems = collectPageProblems(page, baseURL!);
    await page.goto('./');
    await waitForBtState(page, 'ready-to-play', 60_000);

    const before = await bt(page, 'fullscreen');
    expect(before).toBeDefined();
    expect(before!.requested).toBe(false);

    await page.getByRole('button', { name: 'Chơi' }).click();
    await waitForBtState(page, 'playing', 30_000);
    await page.waitForTimeout(300);

    const enabled = await page.evaluate(() => document.fullscreenEnabled);
    const after = await bt(page, 'fullscreen');
    expect(after!.requested).toBe(enabled);
    expect(after!.enabled).toBe(enabled);

    expectClean(problems);
  });

  test('iPhone-like browser (fullscreenEnabled false): Chơi never requests fullscreen and play starts cleanly', async ({
    page,
    baseURL,
  }) => {
    const problems = collectPageProblems(page, baseURL!);
    await page.addInitScript(() => {
      Object.defineProperty(Document.prototype, 'fullscreenEnabled', { configurable: true, get: () => false });
      const w = window as unknown as { __fsCalls: number };
      w.__fsCalls = 0;
      Element.prototype.requestFullscreen = function () {
        w.__fsCalls++;
        return Promise.reject(new TypeError('not supported'));
      };
    });
    await page.goto('./');
    await waitForBtState(page, 'ready-to-play', 60_000);
    await page.getByRole('button', { name: 'Chơi' }).click();
    await waitForBtState(page, 'playing', 30_000);
    await page.waitForTimeout(300);

    const fs = await bt(page, 'fullscreen');
    expect(fs).toEqual({ enabled: false, requested: false, error: null });
    expect(await page.evaluate(() => (window as unknown as { __fsCalls: number }).__fsCalls)).toBe(0);

    expectClean(problems);
  });
});

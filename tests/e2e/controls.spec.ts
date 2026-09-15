import { expect, test, type Page } from '@playwright/test';
import {
  collectPageProblems,
  touchDown,
  touchDrag,
  touchMove,
  touchTap,
  touchUp,
  waitForBtState,
  type PageProblems,
} from './helpers';

type Vec3 = [number, number, number];
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
type Bt = {
  player?: { pos: Vec3; yaw: number };
  box?: { pos: Vec3 };
  room?: { bounds: Bounds };
  interactCount?: number;
  simStep?: number;
  paused?: boolean;
  pauseReason?: string | null;
  joystick?: { active: boolean; x: number; y: number };
  touchUi?: { visible: boolean; contextIcon: string };
  camera?: { yawDeg: number; targetYawDeg: number };
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

  // Plan 01-22 (D-27, CTRL-01 reworded 15/09/2026): arrow keys move exactly like WASD; they no longer rotate (D-19 revised).
  test('arrow keys move like WASD and never rotate the camera', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);

    const p0 = await playerPos(page);
    await holdKey(page, 'ArrowUp', 1000);
    const p1 = await playerPos(page);
    expect(distXZ(p0, p1)).toBeGreaterThanOrEqual(1.0);
    expect(p1[2]).toBeLessThan(p0[2]); // ArrowUp is world -Z at camera yaw 0

    await holdKey(page, 'ArrowRight', 800);
    const p2 = await playerPos(page);
    expect(p2[0] - p1[0]).toBeGreaterThanOrEqual(0.6);

    expect((await bt(page, 'camera'))?.targetYawDeg).toBe(0);

    expectClean(problems);
  });

  // Plan 01-22 (D-27, D-18 revised 15/09/2026): Space is the action key and does what E does; it never pauses.
  test('Space near box pushes it like E', async ({ page, baseURL }) => {
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

    await page.keyboard.press('Space');
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
    expect(await bt(page, 'paused')).toBe(false);

    expectClean(problems);
  });
});

/* ---------- plan 01-08: touch controls (D-17, D-18, CTRL-02) and pause (D-20, CTRL-04) ---------- */

async function waitPaused(page: Page, paused: boolean): Promise<void> {
  await page.waitForFunction((want) => (window as unknown as { __bt: Bt }).__bt.paused === want, paused, {
    timeout: 3000,
    polling: 16,
  });
}

async function waitJoystickActive(page: Page, active: boolean): Promise<void> {
  await page.waitForFunction((want) => (window as unknown as { __bt: Bt }).__bt.joystick?.active === want, active, {
    timeout: 3000,
    polling: 16,
  });
}

async function centreOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} has no bounding box (hidden or missing)`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** simStep growth inside the page over `ms` of wall time. */
function simStepGrowth(page: Page, ms: number): Promise<number> {
  return page.evaluate(
    (wait) =>
      new Promise<number>((resolve) => {
        const b = (window as unknown as { __bt: Bt }).__bt;
        const s0 = b.simStep ?? 0;
        setTimeout(() => resolve((b.simStep ?? 0) - s0), wait);
      }),
    ms,
  );
}

async function expectFrozen(page: Page): Promise<void> {
  // The toggle is consumed at the start of a frame; give it a frame before sampling.
  await page.waitForTimeout(50);
  expect(await simStepGrowth(page, 500)).toBe(0);
}

test.describe('touch', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-emu', 'touch controls run in the mobile-emu project only');
  });

  test('floating joystick spawns under the left thumb and moves the player', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    expect((await bt(page, 'joystick'))?.active).toBe(false);
    await expect(page.locator('#joystick-base')).toBeHidden();

    await touchDown(page, 150, 250);
    await waitJoystickActive(page, true);
    await expect(page.locator('#joystick-base')).toBeVisible();
    const c = await centreOf(page, '#joystick-base');
    expect(Math.abs(c.x - 150)).toBeLessThanOrEqual(4);
    expect(Math.abs(c.y - 250)).toBeLessThanOrEqual(4);

    const p0 = await playerPos(page);
    await touchDrag(page, { x: 150, y: 250 }, { x: 150, y: 170 }, 20, 1000);
    const p1 = await playerPos(page);
    expect(distXZ(p0, p1)).toBeGreaterThanOrEqual(0.8);
    expect(p1[2]).toBeLessThan(p0[2]); // dragging up is forward (-Z at camera yaw 0)

    await touchUp(page);
    await waitJoystickActive(page, false);
    await expect(page.locator('#joystick-base')).toBeHidden();
    // Movement really stopped after lifting (no stuck input).
    await page.waitForTimeout(100);
    const p2 = await playerPos(page);
    await page.waitForTimeout(300);
    expect(distXZ(p2, await playerPos(page))).toBeLessThan(0.05);

    // The right half never spawns the joystick.
    await touchDown(page, 700, 250);
    await page.waitForTimeout(300);
    expect((await bt(page, 'joystick'))?.active).toBe(false);
    await expect(page.locator('#joystick-base')).toBeHidden();
    await touchUp(page);

    expectClean(problems);
  });

  test('context button interacts with the push box while the joystick is held', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    await expect(page.locator('#btn-context')).toBeVisible();
    await expect(page.locator('#btn-context')).toHaveAttribute('data-hud-button', /.*/);
    // Plan 01-10 (D-18): the icon follows the nearest target, so it is 'none' at spawn with nothing in range.
    expect(await bt(page, 'touchUi')).toEqual({ visible: true, contextIcon: 'none' });

    await touchDown(page, 150, 250);
    await touchMove(page, 150, 170);
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
    // Thumb back to the centre: the joystick stays down (dead zone) but the player stops.
    await touchMove(page, 150, 250);
    await page.waitForTimeout(100);
    expect((await bt(page, 'joystick'))?.active).toBe(true);

    const box0 = await boxPos(page);
    expect(distXZ(await playerPos(page), box0)).toBeLessThanOrEqual(1.5);
    expect(await bt(page, 'interactCount')).toBe(0);

    // A second finger taps the context button while the first stays on the joystick (multi-touch).
    const btn = await centreOf(page, '#btn-context');
    await touchTap(page, btn.x, btn.y, 1);
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
    expect((await bt(page, 'joystick'))?.active).toBe(true);

    await touchUp(page);
    await waitJoystickActive(page, false);
    expectClean(problems);
  });
});

test.describe('pause', () => {
  // Plan 01-22: replaces the old Escape/Space pause test of plan 01-08 (D-27 / CTRL-04 reworded 15/09/2026, D-20 replaced):
  // Space no longer pauses (it is the action key), Escape or a lone Ctrl opens the menu, and Ctrl+key browser
  // shortcuts are neither swallowed (no preventDefault) nor turned into game input.
  test('Escape and a lone Ctrl toggle the menu; Space never pauses; Ctrl combos are not swallowed', async (
    { page, baseURL },
    testInfo,
  ) => {
    test.skip(testInfo.project.name !== 'desktop', 'keyboard pause runs in the desktop project');
    const problems = await startPlaying(page, baseURL!);
    expect(await bt(page, 'paused')).toBe(false);
    await expect(page.locator('#pause-menu')).toBeHidden();
    await expect(page.locator('#btn-pause')).toBeHidden(); // no touch UI on a fine pointer without touches

    // Record whether the game prevented the default action of every Space and KeyZ keydown (this listener is added
    // after the game's own window listeners, so it sees their decision).
    await page.evaluate(() => {
      const w = window as unknown as { __keyLog: { code: string; ctrl: boolean; prevented: boolean }[] };
      w.__keyLog = [];
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' || e.code === 'KeyZ') {
          w.__keyLog.push({ code: e.code, ctrl: e.ctrlKey, prevented: e.defaultPrevented });
        }
      });
    });

    // Escape opens and closes the menu.
    await page.keyboard.press('Escape');
    await waitPaused(page, true);
    expect(await bt(page, 'pauseReason')).toBe('user');
    await expect(page.locator('#pause-menu')).toBeVisible();
    await expect(page.locator('#pause-menu h2')).toHaveText('Tạm dừng');
    await expect(page.locator('#pause-resume')).toHaveText('Tiếp tục');
    await expectFrozen(page);

    await page.keyboard.press('Escape');
    await waitPaused(page, false);
    expect(await bt(page, 'pauseReason')).toBeNull();
    await expect(page.locator('#pause-menu')).toBeHidden();
    expect(await simStepGrowth(page, 500)).toBeGreaterThan(5);

    // A lone Ctrl (left or right) opens and closes it too.
    for (const key of ['Control', 'ControlRight']) {
      await page.keyboard.press(key);
      await waitPaused(page, true);
      expect(await bt(page, 'pauseReason')).toBe('user');
      await expect(page.locator('#pause-menu')).toBeVisible();
      await expectFrozen(page);

      await page.keyboard.press(key);
      await waitPaused(page, false);
      await expect(page.locator('#pause-menu')).toBeHidden();
      expect(await simStepGrowth(page, 500)).toBeGreaterThan(5);
    }

    // Space never pauses, and never scrolls the page.
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    expect(await bt(page, 'paused')).toBe(false);

    // Ctrl+Z: not a pause, not a rotation, and the browser keeps its shortcut (no preventDefault).
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyZ');
    await page.keyboard.up('Control');
    await page.waitForTimeout(300);
    expect(await bt(page, 'paused')).toBe(false);
    expect((await bt(page, 'camera'))?.targetYawDeg).toBe(0);

    // Ctrl + mouse click is not a lone Ctrl tap.
    await page.keyboard.down('Control');
    await page.mouse.click(640, 200);
    await page.keyboard.up('Control');
    await page.waitForTimeout(300);
    expect(await bt(page, 'paused')).toBe(false);

    // Ctrl + ArrowUp neither moves the player nor pauses.
    const pc0 = await playerPos(page);
    await page.keyboard.down('Control');
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(500);
    await page.keyboard.up('ArrowUp');
    await page.keyboard.up('Control');
    await page.waitForTimeout(100);
    expect(distXZ(pc0, await playerPos(page))).toBeLessThan(0.05);
    expect(await bt(page, 'paused')).toBe(false);

    const scroll = await page.evaluate(() => ({
      y: window.scrollY,
      top: document.scrollingElement?.scrollTop ?? 0,
      log: (window as unknown as { __keyLog: { code: string; ctrl: boolean; prevented: boolean }[] }).__keyLog,
    }));
    expect(scroll.y).toBe(0);
    expect(scroll.top).toBe(0);
    expect(scroll.log).toEqual([
      { code: 'Space', ctrl: false, prevented: true },
      { code: 'KeyZ', ctrl: true, prevented: false },
    ]);

    // The menu button resumes too.
    await page.keyboard.press('Escape');
    await waitPaused(page, true);
    await page.locator('#pause-resume').click();
    await waitPaused(page, false);
    await expect(page.locator('#pause-menu')).toBeHidden();

    expectClean(problems);
  });

  test('pause button pauses, Tiếp tục resumes, hidden tab auto-pauses', async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-emu', 'touch pause runs in the mobile-emu project');
    const problems = await startPlaying(page, baseURL!);
    await expect(page.locator('#btn-pause')).toBeVisible();
    await expect(page.locator('#btn-pause')).toHaveAttribute('data-hud-button', /.*/);

    const pb = await centreOf(page, '#btn-pause');
    await touchTap(page, pb.x, pb.y);
    await waitPaused(page, true);
    expect(await bt(page, 'pauseReason')).toBe('user');
    await expect(page.locator('#pause-menu')).toBeVisible();
    await expectFrozen(page);

    const resume = page.getByRole('button', { name: 'Tiếp tục' });
    await expect(resume).toBeVisible();
    await resume.tap();
    await waitPaused(page, false);
    await expect(page.locator('#pause-menu')).toBeHidden();
    expect(await simStepGrowth(page, 500)).toBeGreaterThan(5);

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitPaused(page, true);
    expect(await bt(page, 'pauseReason')).toBe('hidden');

    // Coming back does not resume on its own: only the menu or the toggle does.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.locator('#pause-menu')).toBeVisible();
    await expectFrozen(page);
    await resume.tap();
    await waitPaused(page, false);

    expectClean(problems);
  });
});

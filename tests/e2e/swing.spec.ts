import { expect, test, type Page } from '@playwright/test';
import { collectPageProblems, touchDown, touchMove, touchTap, touchUp, waitForBtState, type PageProblems } from './helpers';

/*
 * Plan 01-24 (D-30, D-18 / D-20 revised): every attack press (Space, E, the mobile context button, a left-click on the
 * game view) plays the player's arm swing right away, even with nothing in range; only a target in range is slapped or
 * pushed; a 350 ms cooldown drops presses that arrive during it. Presses in this file that are closer than 350 ms are
 * intentional cooldown checks.
 */

type Vec3 = [number, number, number];
type Screen = { x: number; y: number };
type Swing = { count: number; hits: number; lastMs: number; cooldownMs: number; dropped: number };
type Bt = {
  player?: { pos: Vec3; yaw: number; motion: string };
  box?: { pos: Vec3 };
  swing?: Swing;
  interactCount?: number;
  highlight?: { id: string | null; kind: string | null; icon: string; screen: Screen | null };
  slap?: { count: number };
  npcs?: Array<{ id: string; pos: Vec3; mode: string }>;
  paused?: boolean;
  joystick?: { active: boolean; x: number; y: number };
  touchUi?: { visible: boolean; contextIcon: string };
};

const TEST_BOX_ID = 'box-test';
const EMPTY_URL = './?autoplay=1&npcs=0';
/** NPC 0 pinned 1.35 m ahead-right of the player spawn, inside the pick cone (same as slap.spec). */
const NPC_URL = './?autoplay=1&npcs=1&npcAt=0.9,1.0';

function bt<K extends keyof Bt>(page: Page, key: K): Promise<Bt[K]> {
  return page.evaluate((k) => (window as unknown as { __bt: Bt }).__bt[k as keyof Bt], key) as Promise<Bt[K]>;
}

async function swing(page: Page): Promise<Swing> {
  const s = await bt(page, 'swing');
  if (!s) throw new Error('__bt.swing missing');
  return s;
}

async function startPlaying(page: Page, baseURL: string, url: string): Promise<PageProblems> {
  const problems = collectPageProblems(page, baseURL);
  await page.goto(url);
  await waitForBtState(page, 'playing', 60_000);
  await page.waitForFunction(
    () => {
      const b = (window as unknown as { __bt: Bt }).__bt;
      return !!b.player && !!b.box && !!b.highlight && typeof b.interactCount === 'number';
    },
    undefined,
    { timeout: 10_000, polling: 100 },
  );
  // Let the capsule snap to the floor and the props settle before measuring.
  await page.waitForTimeout(400);
  return problems;
}

function expectClean(problems: PageProblems): void {
  expect(problems.errors).toEqual([]);
  expect(problems.offOrigin).toEqual([]);
}

function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

async function waitSwingCount(page: Page, n: number, timeout = 1000): Promise<void> {
  await page.waitForFunction((want) => (window as unknown as { __bt: Bt }).__bt.swing?.count === want, n, {
    timeout,
    polling: 16,
  });
}

/** Swing accepted and the player already in the swing clip, read in one evaluate. */
async function waitSwingPlaying(page: Page, n: number, timeout = 1000): Promise<void> {
  await page.waitForFunction(
    (want) => {
      const b = (window as unknown as { __bt: Bt }).__bt;
      return b.swing?.count === want && b.player?.motion === 'attack-melee-right';
    },
    n,
    { timeout, polling: 16 },
  );
}

function pageNow(page: Page): Promise<number> {
  return page.evaluate(() => performance.now());
}

async function waitPaused(page: Page, paused: boolean): Promise<void> {
  await page.waitForFunction((want) => (window as unknown as { __bt: Bt }).__bt.paused === want, paused, {
    timeout: 3000,
    polling: 16,
  });
}

test.describe('swing desktop', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop swing tests run in the desktop project only');
  });

  test('Space with nothing in range still swings', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!, EMPTY_URL);
    expect((await bt(page, 'highlight'))!.id).toBeNull();
    expect((await swing(page)).count).toBe(0);
    expect((await bt(page, 'player'))!.motion).toBe('idle');
    const box0 = (await bt(page, 'box'))!.pos;

    const t0 = await pageNow(page);
    await page.keyboard.press('Space');
    await waitSwingPlaying(page, 1);
    const s = await swing(page);
    // The swing started within 150 ms of the key press (gate time = the fixed step that consumed the press).
    expect(s.lastMs - t0).toBeLessThan(150);
    expect(s.hits).toBe(0);
    expect(s.cooldownMs).toBe(350);
    expect(await bt(page, 'interactCount')).toBe(0);
    expect(dist3(box0, (await bt(page, 'box'))!.pos)).toBeLessThan(0.01);

    await page.waitForTimeout(800);
    expect((await bt(page, 'player'))!.motion).toBe('idle');
    expect((await swing(page)).count).toBe(1);
    expectClean(problems);
  });

  test('mashing E is limited by the cooldown', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!, EMPTY_URL);

    // Three presses spread over ~120 ms, so they land on different fixed steps, all inside one cooldown.
    const t0 = await pageNow(page);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(60);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(60);
    await page.keyboard.press('KeyE');
    const t1 = await pageNow(page);
    await page.waitForTimeout(100);
    const s1 = await swing(page);
    expect(t1 - t0, 'presses must all fall inside one 350 ms cooldown').toBeLessThan(300);
    expect(s1.count).toBe(1);
    // Non-vacuous: at least one of the extra presses reached the gate and was dropped (not merged into one frame).
    expect(s1.dropped).toBeGreaterThanOrEqual(1);

    await page.waitForTimeout(400);
    await page.keyboard.press('KeyE');
    await waitSwingCount(page, 2);
    expect((await swing(page)).hits).toBe(0);
    expectClean(problems);
  });

  test('clicking the game view swings; clicking the glowing box hits it', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!, EMPTY_URL);
    expect((await bt(page, 'highlight'))!.id).toBeNull();

    await page.mouse.click(640, 240);
    await waitSwingPlaying(page, 1);
    expect((await swing(page)).hits).toBe(0);
    expect(await bt(page, 'interactCount')).toBe(0);

    await page.keyboard.down('KeyW');
    try {
      await page.waitForFunction(
        (id) => (window as unknown as { __bt: Bt }).__bt.highlight?.id === id,
        TEST_BOX_ID,
        { timeout: 4000, polling: 16 },
      );
    } finally {
      await page.keyboard.up('KeyW');
    }
    await page.waitForTimeout(400);

    const h = (await bt(page, 'highlight'))!;
    expect(h.id).toBe(TEST_BOX_ID);
    expect(h.screen).not.toBeNull();
    // In range is proven by the glow itself (the pick reach is measured from the prop's edge, not its centre).
    const box0 = (await bt(page, 'box'))!.pos;

    await page.mouse.click(h.screen!.x, h.screen!.y);
    await page.waitForFunction(
      (start) => {
        const b = (window as unknown as { __bt: Bt }).__bt;
        const x = b.box!.pos;
        return b.swing?.count === 2 && Math.hypot(x[0] - start[0], x[1] - start[1], x[2] - start[2]) >= 0.2;
      },
      box0,
      { timeout: 1000, polling: 16 },
    );
    const s = await swing(page);
    expect(s.count).toBe(2);
    expect(s.hits).toBe(1);
    expect(await bt(page, 'interactCount')).toBe(1);
    expectClean(problems);
  });

  test('Space on a coworker swings and slaps', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!, NPC_URL);
    await page.waitForFunction(() => (window as unknown as { __bt: Bt }).__bt.highlight?.kind === 'npc', undefined, {
      timeout: 5000,
      polling: 50,
    });

    await page.keyboard.press('Space');
    await page.waitForFunction(() => (window as unknown as { __bt: Bt }).__bt.slap?.count === 1, undefined, {
      timeout: 1000,
      polling: 16,
    });
    const s = await swing(page);
    expect(s.count).toBe(1);
    expect(s.hits).toBe(1);
    expect((await bt(page, 'npcs'))![0].mode).toBe('ragdoll');
    expect((await bt(page, 'player'))!.motion).toBe('attack-melee-right');
    expectClean(problems);
  });

  test('no swing while paused', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!, EMPTY_URL);
    const count0 = (await swing(page)).count;

    await page.keyboard.press('Escape');
    await waitPaused(page, true);
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    expect((await swing(page)).count).toBe(count0);

    await page.keyboard.press('Escape');
    await waitPaused(page, false);
    // The press made while paused must not fire on resume either.
    await page.waitForTimeout(300);
    expect((await swing(page)).count).toBe(count0);
    expectClean(problems);
  });

  // D-28 panel contract shared with plan 01-25: a click inside [data-hud-panel] never reaches the swing.
  test('clicks on a [data-hud-panel] never swing', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!, EMPTY_URL);
    await page.evaluate(() => {
      const panel = document.createElement('div');
      panel.id = 'test-hud-panel';
      panel.setAttribute('data-hud-panel', '');
      panel.style.cssText = 'position:fixed;left:24px;bottom:24px;width:220px;height:120px;z-index:1000;';
      const label = document.createElement('span');
      label.id = 'test-hud-panel-label';
      label.textContent = 'Space';
      panel.appendChild(label);
      document.body.appendChild(panel);
    });
    const label = (await page.locator('#test-hud-panel-label').boundingBox())!;
    await page.mouse.click(label.x + label.width / 2, label.y + label.height / 2);
    await page.waitForTimeout(400);
    expect((await swing(page)).count).toBe(0);

    // Control: the same kind of click on the game view does swing, so the check above was not vacuous.
    await page.mouse.click(640, 240);
    await waitSwingCount(page, 1);
    expectClean(problems);
  });
});

test.describe('swing touch', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-emu', 'touch swing tests run in the mobile-emu project only');
  });

  test('context button swings without a target and while the joystick is held', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!, EMPTY_URL);
    await expect(page.locator('#btn-context')).toBeVisible();
    // Planner note #7: the icon still reads 'none' with nothing in range, even though the button now always swings.
    expect((await bt(page, 'touchUi'))!.contextIcon).toBe('none');

    const box = (await page.locator('#btn-context').boundingBox())!;
    const bx = box.x + box.width / 2;
    const by = box.y + box.height / 2;
    await touchTap(page, bx, by, 1);
    await waitSwingPlaying(page, 1);
    expect((await swing(page)).hits).toBe(0);

    // Finger 0 holds the joystick while finger 1 taps the context button again after the cooldown.
    await touchDown(page, 150, 250);
    try {
      await touchMove(page, 150, 200);
      await page.waitForTimeout(400);
      await touchTap(page, bx, by, 1);
      await waitSwingCount(page, 2);
      expect((await bt(page, 'joystick'))!.active).toBe(true);
    } finally {
      await touchUp(page);
    }
    expectClean(problems);
  });
});

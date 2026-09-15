import { expect, test, type Page } from '@playwright/test';
import { collectPageProblems, touchDown, touchMove, touchTap, touchUp, waitForBtState, type PageProblems } from './helpers';

/* Plan 01-10: Kenney open-space office + pantry, physics props, blob shadows, highlight + E / click / context (D-10, D-13, D-14, D-18, D-20). */

type Vec3 = [number, number, number];
type Screen = { x: number; y: number };
type PropItem = { id: string; role: string; kind: 'prop' | 'breakable'; pos: Vec3; sleeping: boolean; screen: Screen };
type Bt = {
  player?: { pos: Vec3; yaw: number };
  box?: { pos: Vec3 };
  props?: { dynamicCount: number; breakableCount: number; sleepingCount: number; list: PropItem[] };
  highlight?: { id: string | null; kind: string | null; icon: string; screen: Screen | null };
  shadows?: { count: number };
  renderer?: { shadowMapEnabled: boolean };
  touchUi?: { visible: boolean; contextIcon: string };
  interactCount?: number;
};

/** The 01-03 push box keeps its place in the corridor (layout TEST_BOX at x 0, z -0.5). */
const TEST_BOX_ID = 'box-test';

function bt<K extends keyof Bt>(page: Page, key: K): Promise<Bt[K]> {
  return page.evaluate((k) => (window as unknown as { __bt: Bt }).__bt[k as keyof Bt], key) as Promise<Bt[K]>;
}

async function props(page: Page): Promise<NonNullable<Bt['props']>> {
  const p = await bt(page, 'props');
  if (!p) throw new Error('__bt.props missing');
  return p;
}

async function propPos(page: Page, id: string): Promise<Vec3> {
  const item = (await props(page)).list.find((p) => p.id === id);
  if (!item) throw new Error(`prop ${id} missing from __bt.props.list`);
  return item.pos;
}

function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

async function startPlaying(page: Page, baseURL: string): Promise<PageProblems> {
  const problems = collectPageProblems(page, baseURL);
  await page.goto('./?autoplay=1');
  await waitForBtState(page, 'playing', 60_000);
  await page.waitForFunction(
    () => {
      const b = (window as unknown as { __bt: Bt }).__bt;
      return !!b.player && !!b.props && !!b.shadows && !!b.box;
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

async function waitHighlightKey(page: Page): Promise<void> {
  await page.waitForFunction(() => !!(window as unknown as { __bt: Bt }).__bt.highlight, undefined, {
    timeout: 5000,
    polling: 100,
  });
}

async function waitHighlighted(page: Page, id: string, timeout = 3000): Promise<void> {
  await page.waitForFunction((want) => (window as unknown as { __bt: Bt }).__bt.highlight?.id === want, id, {
    timeout,
    polling: 16,
  });
}

async function waitMoved(page: Page, id: string, from: Vec3, minDist: number, timeout = 1000): Promise<void> {
  await page.waitForFunction(
    ({ id: pid, start, min }) => {
      const item = (window as unknown as { __bt: Bt }).__bt.props!.list.find((p) => p.id === pid);
      if (!item) return false;
      const d = Math.hypot(item.pos[0] - start[0], item.pos[1] - start[1], item.pos[2] - start[2]);
      return d >= min;
    },
    { id, start: from, min: minDist },
    { timeout, polling: 16 },
  );
}

/** Hold W (forward, world -Z at camera yaw 0) until the test box glows, then stop. */
async function walkUntilBoxHighlighted(page: Page): Promise<void> {
  await page.keyboard.down('KeyW');
  try {
    await waitHighlighted(page, TEST_BOX_ID);
  } finally {
    await page.keyboard.up('KeyW');
  }
  await page.waitForTimeout(100);
}

test.describe('room desktop', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop room tests run in the desktop project only');
  });

  test('counts: props, breakables, shadows, no shadow map', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    const p = await props(page);
    expect(p.dynamicCount).toBeGreaterThanOrEqual(24);
    expect(p.breakableCount).toBeGreaterThanOrEqual(10);
    expect(p.list.length).toBe(p.dynamicCount);
    expect(p.list.filter((i) => i.kind === 'breakable').length).toBe(p.breakableCount);

    // The breakable set is the D-13 one: 4 monitors, 4 mugs, 3 plants.
    const breakRoles = p.list.filter((i) => i.kind === 'breakable').map((i) => i.role);
    expect(breakRoles.filter((r) => r === 'computerScreen').length).toBe(4);
    expect(breakRoles.filter((r) => r === 'mug').length).toBe(4);
    expect(breakRoles.filter((r) => r === 'pottedPlant' || r === 'plantSmall').length).toBe(3);

    // The test box is a real prop at its 01-03 place in the corridor.
    const box = p.list.find((i) => i.id === TEST_BOX_ID);
    expect(box).toBeDefined();
    expect(Math.abs(box!.pos[0] - 0)).toBeLessThan(0.1);
    expect(Math.abs(box!.pos[2] - -0.5)).toBeLessThan(0.1);
    // __bt.box (01-03 key) is backed by the same body.
    expect(dist3((await bt(page, 'box'))!.pos, box!.pos)).toBeLessThan(0.05);

    const shadows = await bt(page, 'shadows');
    expect(shadows!.count).toBeGreaterThanOrEqual(p.dynamicCount + 1);
    expect((await bt(page, 'renderer'))!.shadowMapEnabled).toBe(false);

    expectClean(problems);
  });

  test('sleep: props settle', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    await page.waitForTimeout(10_000);
    const p = await props(page);
    expect(p.dynamicCount).toBeGreaterThanOrEqual(24);
    expect(p.sleepingCount).toBeGreaterThanOrEqual(p.dynamicCount - 2);
    expect(p.list.filter((i) => i.sleeping).length).toBe(p.sleepingCount);
    expectClean(problems);
  });

  test('E pushes highlighted', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    await waitHighlightKey(page);
    const h0 = await bt(page, 'highlight');
    expect(h0!.id).toBeNull();
    expect(h0!.icon).toBe('none');

    await walkUntilBoxHighlighted(page);
    const h1 = await bt(page, 'highlight');
    expect(h1!.id).toBe(TEST_BOX_ID);
    expect(h1!.kind).toBe('prop');
    expect(h1!.icon).toBe('push');

    const before = await propPos(page, TEST_BOX_ID);
    const count0 = await bt(page, 'interactCount');
    await page.keyboard.press('KeyE');
    await waitMoved(page, TEST_BOX_ID, before, 0.2);
    expect(await bt(page, 'interactCount')).toBe(count0! + 1);

    expectClean(problems);
  });

  test('click only highlighted', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    await waitHighlightKey(page);
    await walkUntilBoxHighlighted(page);

    const h = await bt(page, 'highlight');
    expect(h!.id).toBe(TEST_BOX_ID);
    expect(h!.screen).not.toBeNull();
    const count0 = await bt(page, 'interactCount');

    // 1) While the box glows, click a visible prop that is NOT highlighted: nothing moves, nothing counts.
    //    (Done first, so a pick that ignored the ray would push the glowing box and fail here.)
    const vp = page.viewportSize()!;
    const now = await props(page);
    const boxBefore = now.list.find((i) => i.id === TEST_BOX_ID)!.pos;
    const others = now.list.filter(
      (i) =>
        i.id !== TEST_BOX_ID &&
        i.screen.x > 40 &&
        i.screen.x < vp.width - 40 &&
        i.screen.y > 40 &&
        i.screen.y < vp.height - 40 &&
        Math.hypot(i.screen.x - h!.screen!.x, i.screen.y - h!.screen!.y) > 120,
    );
    // Prefer a prop that is already asleep so "did not move" cannot be confused with settling.
    const other = others.find((i) => i.sleeping) ?? others[0];
    expect(other, 'a visible non-highlighted prop to click').toBeDefined();

    await page.mouse.click(other!.screen.x, other!.screen.y);
    await page.waitForTimeout(500);
    expect(dist3(other!.pos, await propPos(page, other!.id))).toBeLessThanOrEqual(0.01);
    expect(dist3(boxBefore, await propPos(page, TEST_BOX_ID))).toBeLessThanOrEqual(0.01);
    expect(await bt(page, 'interactCount')).toBe(count0);
    expect((await bt(page, 'highlight'))!.id).toBe(TEST_BOX_ID); // still a live target: the guard was exercised

    // 2) Click the glowing box itself: it moves.
    const h2 = await bt(page, 'highlight');
    await page.mouse.click(h2!.screen!.x, h2!.screen!.y);
    await waitMoved(page, TEST_BOX_ID, boxBefore, 0.2);
    expect(await bt(page, 'interactCount')).toBe(count0! + 1);

    expectClean(problems);
  });
});

test.describe('room touch', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-emu', 'touch room test runs in the mobile-emu project only');
  });

  test('touch context icon', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    await waitHighlightKey(page);
    await expect(page.locator('#btn-context')).toBeVisible();
    expect((await bt(page, 'touchUi'))!.contextIcon).toBe('none');

    await touchDown(page, 150, 250);
    await touchMove(page, 150, 170);
    try {
      await waitHighlighted(page, TEST_BOX_ID);
    } finally {
      // Thumb back to the centre: the joystick stays down (dead zone) and the player stops.
      await touchMove(page, 150, 250);
    }
    await page.waitForTimeout(100);
    expect((await bt(page, 'touchUi'))!.contextIcon).toBe('push');

    const before = await propPos(page, TEST_BOX_ID);
    const box = await page.locator('#btn-context').boundingBox();
    await touchTap(page, box!.x + box!.width / 2, box!.y + box!.height / 2, 1);
    await waitMoved(page, TEST_BOX_ID, before, 0.2);

    await touchUp(page);
    expectClean(problems);
  });
});

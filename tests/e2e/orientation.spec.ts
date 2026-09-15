import { expect, test, type Page } from '@playwright/test';
import { collectPageProblems, waitForBtState, type PageProblems } from './helpers';

/* Plan 01-09: portrait and landscape both fill the viewport, resizes are guarded (D-16, CTRL-03). */

type Rect = { x: number; y: number; w: number; h: number };
type Bt = {
  camera?: { yawDeg: number; targetYawDeg: number; distance: number; pitchDeg: number };
  renderer?: { resizeCount: number; width: number; height: number; dpr: number; shadowMapEnabled: boolean };
};

function bt<K extends keyof Bt>(page: Page, key: K): Promise<Bt[K]> {
  return page.evaluate((k) => (window as unknown as { __bt: Bt }).__bt[k as keyof Bt], key) as Promise<Bt[K]>;
}

async function startPlaying(page: Page, baseURL: string): Promise<PageProblems> {
  const problems = collectPageProblems(page, baseURL);
  await page.goto('./?autoplay=1');
  await waitForBtState(page, 'playing', 60_000);
  await page.waitForFunction(
    () => {
      const b = (window as unknown as { __bt: Bt }).__bt;
      return !!b.camera && !!b.renderer && !!document.getElementById('btn-rot-right');
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

async function layout(page: Page): Promise<{ vw: number; vh: number; canvas: Rect[]; buttons: Array<Rect & { id: string }>; portrait: boolean }> {
  return page.evaluate(() => {
    const r = (el: Element): { x: number; y: number; w: number; h: number } => {
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    };
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      canvas: Array.from(document.querySelectorAll('canvas')).map(r),
      buttons: Array.from(document.querySelectorAll('[data-hud-button]'))
        .filter((el) => !(el as HTMLElement).hidden)
        .map((el) => ({ id: el.id, ...r(el) })),
      portrait: document.body.classList.contains('portrait'),
    };
  });
}

/** Canvas equals the viewport (±1 px) and every visible HUD button lies fully inside it. */
async function expectFilled(page: Page, width: number, height: number): Promise<void> {
  const l = await layout(page);
  expect(l.vw).toBe(width);
  expect(l.vh).toBe(height);
  expect(l.canvas).toHaveLength(1);
  const c = l.canvas[0];
  expect(Math.abs(c.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(c.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(c.w - width)).toBeLessThanOrEqual(1);
  expect(Math.abs(c.h - height)).toBeLessThanOrEqual(1);

  // Context, pause and both rotate buttons must be on screen (guards against an empty list passing vacuously).
  const ids = l.buttons.map((b) => b.id).sort();
  expect(ids).toEqual(['btn-context', 'btn-pause', 'btn-rot-left', 'btn-rot-right']);
  for (const b of l.buttons) {
    expect(b.w, `${b.id} width`).toBeGreaterThanOrEqual(56);
    expect(b.h, `${b.id} height`).toBeGreaterThanOrEqual(56);
    expect(b.x, `${b.id} left`).toBeGreaterThanOrEqual(0);
    expect(b.y, `${b.id} top`).toBeGreaterThanOrEqual(0);
    expect(b.x + b.w, `${b.id} right`).toBeLessThanOrEqual(width);
    expect(b.y + b.h, `${b.id} bottom`).toBeLessThanOrEqual(height);
  }
  // No two HUD buttons overlap.
  for (let i = 0; i < l.buttons.length; i++) {
    for (let j = i + 1; j < l.buttons.length; j++) {
      const a = l.buttons[i];
      const b = l.buttons[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
    }
  }
}

/** Distance and pitch ease toward viewParams: poll until both have settled (within 0.05). */
async function expectView(page: Page, distance: number, pitchDeg: number): Promise<void> {
  await expect
    .poll(
      async () => {
        const c = await bt(page, 'camera');
        return !!c && Math.abs(c.distance - distance) < 0.05 && Math.abs(c.pitchDeg - pitchDeg) < 0.05;
      },
      { timeout: 3000, intervals: [50] },
    )
    .toBe(true);
}

test.describe('orientation', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-emu', 'orientation layout runs in the mobile-emu project');
  });

  test('landscape and portrait both fill the viewport; portrait pulls the camera back', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);

    await expectFilled(page, 844, 390);
    expect((await layout(page)).portrait).toBe(false);
    await expectView(page, 11, 55);
    const r0 = await bt(page, 'renderer');
    expect(r0!.width).toBe(844);
    expect(r0!.height).toBe(390);
    expect(r0!.shadowMapEnabled).toBe(false);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await expectFilled(page, 390, 844);
    expect((await layout(page)).portrait).toBe(true);
    const r1 = await bt(page, 'renderer');
    expect(r1!.width).toBe(390);
    expect(r1!.height).toBe(844);
    await expectView(page, 15, 60);

    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(300);
    await expectFilled(page, 844, 390);
    expect((await layout(page)).portrait).toBe(false);
    await expectView(page, 11, 55);

    // The game never asks the player to rotate the device (D-16).
    const text = (await page.evaluate(() => document.body.innerText)).toLowerCase();
    expect(text).not.toContain('xoay máy');
    expect(text).not.toContain('rotate your');

    expectClean(problems);
  });

  test('a resize storm is debounced: ten flips within 100 ms resize the renderer at most twice', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    const before = (await bt(page, 'renderer'))!.resizeCount;

    // Back-to-back viewport changes (even count, so the storm ends where it started); the duration is reported on failure.
    const t0 = Date.now();
    for (let i = 0; i < 10; i++) {
      await page.setViewportSize(i % 2 === 0 ? { width: 390, height: 844 } : { width: 844, height: 390 });
    }
    const storm = Date.now() - t0;
    await page.waitForTimeout(400);

    const after = (await bt(page, 'renderer'))!.resizeCount;
    expect(after - before, `storm took ${storm} ms`).toBeLessThanOrEqual(2);
    // Ended back in landscape: still filled and still correct.
    await expectFilled(page, 844, 390);
    await expectView(page, 11, 55);

    // Negative control: a real, settled resize does count, so the counter is live.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    expect((await bt(page, 'renderer'))!.resizeCount).toBeGreaterThan(after);

    expectClean(problems);
  });

  test('page hardening cancels zoom, pull-to-refresh and long-press defaults', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    const prevented = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')!;
      const fire = (e: Event): boolean => {
        canvas.dispatchEvent(e);
        return e.defaultPrevented;
      };
      const touch = new Touch({ identifier: 7, target: canvas, clientX: 200, clientY: 200 });
      return {
        contextmenu: fire(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
        dblclick: fire(new MouseEvent('dblclick', { bubbles: true, cancelable: true })),
        gesturestart: fire(new Event('gesturestart', { bubbles: true, cancelable: true })),
        touchmove: fire(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] })),
        // Negative control: an unrelated cancelable event is left alone, so the checks above are not vacuous.
        unrelated: fire(new MouseEvent('mouseover', { bubbles: true, cancelable: true })),
      };
    });
    expect(prevented).toEqual({ contextmenu: true, dblclick: true, gesturestart: true, touchmove: true, unrelated: false });
    expectClean(problems);
  });
});

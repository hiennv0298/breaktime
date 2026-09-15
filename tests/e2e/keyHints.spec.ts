import { expect, test, type Page } from '@playwright/test';
import { collectPageProblems, touchDown, touchUp, waitForBtState, type PageProblems } from './helpers';

/* Plan 01-25: desktop key hint panel, settings toggle, touch hint (D-28, CTRL-06). */

type Rect = { x: number; y: number; w: number; h: number };
type KeyHintsDebug = {
  enabled: boolean;
  visible: boolean;
  dimmed: boolean;
  touchUi: boolean;
  touchHintVisible: boolean;
  storageOk: boolean;
};

const TOUCH_HINT_MS = 6000; // mirrors src/logic/uiPrefs.ts

function keyHints(page: Page): Promise<KeyHintsDebug | undefined> {
  return page.evaluate(() => (window as unknown as { __bt: { keyHints?: KeyHintsDebug } }).__bt.keyHints);
}

async function startPlaying(page: Page, baseURL: string): Promise<PageProblems> {
  const problems = collectPageProblems(page, baseURL);
  await page.goto('./?autoplay=1');
  await waitForBtState(page, 'playing', 60_000);
  return problems;
}

function expectClean(problems: PageProblems): void {
  expect(problems.errors).toEqual([]);
  expect(problems.offOrigin).toEqual([]);
}

function opacity(page: Page, selector: string): Promise<number> {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    return el ? Number(getComputedStyle(el).opacity) : -1;
  }, selector);
}

function rectOf(page: Page, selector: string): Promise<Rect | null> {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }, selector);
}

function visibleHudButtons(page: Page): Promise<Array<Rect & { id: string }>> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-hud-button]'))
      .filter((el) => !(el as HTMLElement).hidden && el.getBoundingClientRect().width > 0)
      .map((el) => {
        const b = el.getBoundingClientRect();
        return { id: el.id, x: b.x, y: b.y, w: b.width, h: b.height };
      }),
  );
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** #touch-hint is in the right half, fully on screen, and covers no visible HUD button. */
async function expectTouchHintPlacement(page: Page, vw: number, vh: number): Promise<void> {
  await expect(page.locator('#touch-hint')).toBeVisible();
  const hint = (await rectOf(page, '#touch-hint'))!;
  expect(hint.w).toBeGreaterThan(0);
  expect(hint.x, 'hint left edge in the right half').toBeGreaterThanOrEqual(vw / 2 - 1);
  expect(hint.y).toBeGreaterThanOrEqual(0);
  expect(hint.x + hint.w).toBeLessThanOrEqual(vw);
  expect(hint.y + hint.h).toBeLessThanOrEqual(vh);
  const buttons = await visibleHudButtons(page);
  expect(buttons.length, 'guards against a vacuous empty button list').toBeGreaterThanOrEqual(4);
  for (const b of buttons) expect(overlaps(hint, b), `#touch-hint overlaps ${b.id}`).toBe(false);
}

test.describe('desktop key hints', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop key hint panel runs in the desktop project');
  });

  test('panel lists the keys, dims, and comes back on hover', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    const panel = page.locator('#key-hints');
    await expect(panel).toBeVisible();
    const startOpacity = await opacity(page, '#key-hints');
    expect(startOpacity).toBeGreaterThanOrEqual(0.95);

    const text = (await panel.textContent()) ?? '';
    for (const k of ['←↑→↓', 'Space', 'Ctrl/Esc', 'Z/C']) expect(text).toContain(k);
    await expect(panel.locator('.row')).toHaveCount(4);
    expect(await panel.getAttribute('data-hud-panel')).not.toBeNull();

    const vh = page.viewportSize()!.height;
    const box = (await rectOf(page, '#key-hints'))!;
    expect(box.x).toBeLessThan(40);
    expect(box.y + box.h).toBeGreaterThan(vh - 200);
    expect(box.w).toBeLessThan(360);
    const badge = await rectOf(page, '#build-badge');
    expect(badge).not.toBeNull();
    expect(overlaps(box, badge!), '#key-hints overlaps #build-badge').toBe(false);

    await page.waitForTimeout(4600);
    const dimmed = await opacity(page, '#key-hints');
    expect(dimmed).toBeGreaterThanOrEqual(0.25);
    expect(dimmed).toBeLessThanOrEqual(0.35);
    expect((await keyHints(page))!.dimmed).toBe(true);

    await page.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
    await expect.poll(() => opacity(page, '#key-hints'), { timeout: 500, intervals: [50] }).toBeGreaterThanOrEqual(0.95);
    await page.mouse.move(900, 200);
    await expect.poll(() => opacity(page, '#key-hints'), { timeout: 600, intervals: [50] }).toBeLessThanOrEqual(0.35);

    await expect(page.locator('#touch-hint')).toBeHidden();
    const d = (await keyHints(page))!;
    expect(d.enabled).toBe(true);
    expect(d.visible).toBe(true);
    expect(d.touchUi).toBe(false);
    expect(d.touchHintVisible).toBe(false);
    expect(d.storageOk).toBe(true);
    expectClean(problems);
  });

  test('toggle in the settings menu hides the panel and survives reload', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    const panel = page.locator('#key-hints');
    const toggle = page.locator('#key-hints-toggle');
    await expect(panel).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-menu')).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-menu')).toBeHidden();
    await expect(panel).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('bt.keyHints'))).toBe('0');

    await page.goto('./?autoplay=1');
    await waitForBtState(page, 'playing', 60_000);
    await page.waitForTimeout(300);
    await expect(panel).toBeHidden();
    expect((await keyHints(page))!.enabled).toBe(false);

    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-menu')).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(panel).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('bt.keyHints'))).toBe('1');
    expectClean(problems);
  });

  test('storage failure keeps the panel on', async ({ page, baseURL }) => {
    await page.addInitScript(() => {
      Storage.prototype.getItem = function (): string | null {
        throw new Error('storage disabled');
      };
      Storage.prototype.setItem = function (): void {
        throw new Error('storage disabled');
      };
    });
    const problems = await startPlaying(page, baseURL!);
    const panel = page.locator('#key-hints');
    await expect(panel).toBeVisible();
    expect((await keyHints(page))!.storageOk).toBe(false);

    await page.keyboard.press('Escape');
    await page.locator('#key-hints-toggle').click();
    await expect(page.locator('#key-hints-toggle')).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    expect((await keyHints(page))!.enabled).toBe(false);

    expect(problems.errors.filter((e) => e.startsWith('pageerror'))).toEqual([]);
    expectClean(problems);
  });
});

test.describe('touch key hints', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-emu', 'touch hint runs in the mobile-emu project');
  });

  test('touch UI: translucent buttons and a one-time hint that avoids the joystick half and buttons', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    const startMs = Date.now();
    await page.waitForFunction(() => !!document.getElementById('btn-rot-right'), undefined, { timeout: 10_000 });

    await expect(page.locator('#key-hints')).toBeHidden();
    const ctxOpacity = await opacity(page, '#btn-context');
    expect(ctxOpacity).toBeGreaterThanOrEqual(0.5);
    expect(ctxOpacity).toBeLessThanOrEqual(0.7);

    const hint = page.locator('#touch-hint');
    await expect(hint).toBeVisible();
    expect(((await hint.textContent()) ?? '').trim().length).toBeGreaterThan(0);
    expect(await hint.getAttribute('data-hud-panel')).not.toBeNull();
    await expectTouchHintPlacement(page, 844, 390);
    const d = (await keyHints(page))!;
    expect(d.touchUi).toBe(true);
    expect(d.visible).toBe(false);
    expect(d.touchHintVisible).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.body.classList.contains('portrait'))).toBe(true);
    await expectTouchHintPlacement(page, 390, 844);

    const left = TOUCH_HINT_MS + 1500 - (Date.now() - startMs);
    await expect(hint).toBeHidden({ timeout: Math.max(left, 100) });
    expect(await page.evaluate(() => localStorage.getItem('bt.touchHintSeen'))).toBe('1');

    await page.goto('./?autoplay=1');
    await waitForBtState(page, 'playing', 60_000);
    await page.waitForTimeout(1500);
    await expect(hint).toBeHidden();
    expect((await keyHints(page))!.touchHintVisible).toBe(false);
    expectClean(problems);
  });

  test('first touch dismisses the hint', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    const hint = page.locator('#touch-hint');
    await expect(hint).toBeVisible();
    await touchDown(page, 150, 250);
    await touchUp(page);
    await expect(hint).toBeHidden({ timeout: 700 });
    expectClean(problems);
  });
});

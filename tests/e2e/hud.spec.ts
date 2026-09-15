import { expect, test, type Page } from '@playwright/test';
import { collectPageProblems, touchTap, waitForBtState, type PageProblems } from './helpers';

type Bt = {
  hud?: {
    visible: boolean;
    fps: number;
    drawCalls: number;
    triangles: number;
    bodies: number;
    sleeping: number;
    peakBodies: number;
  };
  quality?: { tier: 'low' | 'med' | 'high'; source: 'auto' | 'manual' | 'forced'; dpr: number; label: string };
  renderer?: { dpr: number; tier: string };
  paused?: boolean;
  pauseReason?: string | null;
  contextLostCount?: number;
};

function bt<K extends keyof Bt>(page: Page, key: K): Promise<Bt[K]> {
  return page.evaluate((k) => (window as unknown as { __bt: Bt }).__bt[k as keyof Bt], key) as Promise<Bt[K]>;
}

async function startPlaying(page: Page, baseURL: string, query = ''): Promise<PageProblems> {
  const problems = collectPageProblems(page, baseURL);
  await page.goto(`./?autoplay=1${query}`);
  await waitForBtState(page, 'playing', 60_000);
  await page.waitForFunction(
    () => {
      const b = (window as unknown as { __bt: Bt }).__bt;
      return !!b.hud && !!b.quality;
    },
    undefined,
    { timeout: 10_000, polling: 100 },
  );
  return problems;
}

function desktopOnly(projectName: string): void {
  test.skip(projectName !== 'desktop', 'desktop HUD / quality checks run in the desktop project only');
}

test.describe('desktop', () => {
  test('Backquote toggles the HUD and it reports live numbers', async ({ page, baseURL }, testInfo) => {
    desktopOnly(testInfo.project.name);
    const problems = await startPlaying(page, baseURL!);
    const hud = page.locator('#debug-hud');

    await expect(hud).toBeHidden();
    expect((await bt(page, 'hud'))!.visible).toBe(false);

    await page.keyboard.press('Backquote');
    await expect(hud).toBeVisible();
    await page.waitForTimeout(600);

    const h = (await bt(page, 'hud'))!;
    expect(h.visible).toBe(true);
    expect(h.fps).toBeGreaterThan(0);
    expect(h.drawCalls).toBeGreaterThan(0);
    expect(h.triangles).toBeGreaterThan(0);
    expect(h.bodies).toBeGreaterThan(0);
    expect(h.peakBodies).toBeGreaterThanOrEqual(h.bodies);
    expect(h.sleeping).toBeGreaterThanOrEqual(0);
    expect(h.sleeping).toBeLessThanOrEqual(h.bodies);

    const text = (await hud.textContent()) ?? '';
    for (const word of ['FPS', 'Draw', 'Bodies', 'Tier']) expect(text).toContain(word);

    // The text is refreshed at 4 Hz, so it changes over a second of play.
    const first = text;
    await expect.poll(async () => (await hud.textContent()) !== first, { timeout: 3000 }).toBe(true);

    await page.keyboard.press('Backquote');
    await expect(hud).toBeHidden();
    expect((await bt(page, 'hud'))!.visible).toBe(false);

    expect(problems.errors).toEqual([]);
    expect(problems.offOrigin).toEqual([]);
  });

  test('?debug=1 shows the HUD from the start', async ({ page, baseURL }, testInfo) => {
    desktopOnly(testInfo.project.name);
    const problems = await startPlaying(page, baseURL!, '&debug=1');
    await expect(page.locator('#debug-hud')).toBeVisible();
    expect((await bt(page, 'hud'))!.visible).toBe(true);
    expect(problems.errors).toEqual([]);
  });

  test('?q=low forces the low tier and caps DPR at 1', async ({ page, baseURL }, testInfo) => {
    desktopOnly(testInfo.project.name);
    const problems = await startPlaying(page, baseURL!, '&q=low');
    const q = (await bt(page, 'quality'))!;
    expect(q.tier).toBe('low');
    expect(q.source).toBe('forced');
    expect(q.label).toBe('Thấp');
    expect(q.dpr).toBeLessThanOrEqual(1);
    expect((await bt(page, 'renderer'))!.tier).toBe('low');
    expect(problems.errors).toEqual([]);
  });

  test('a manual tier from the pause menu overrides auto and survives a reload', async ({ page, baseURL }, testInfo) => {
    desktopOnly(testInfo.project.name);
    const problems = await startPlaying(page, baseURL!);
    expect((await bt(page, 'quality'))!.source).toBe('auto');

    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-menu')).toBeVisible();
    for (const t of ['low', 'med', 'high']) await expect(page.locator(`button[data-tier="${t}"]`)).toBeVisible();

    await page.locator('button[data-tier="med"]').click();
    await expect.poll(async () => (await bt(page, 'quality'))!.source).toBe('manual');
    const q = (await bt(page, 'quality'))!;
    expect(q.tier).toBe('med');
    expect(q.label).toBe('Vừa');
    await expect(page.locator('button[data-tier="med"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('button[data-tier="high"]')).toHaveAttribute('aria-pressed', 'false');

    await page.goto('./?autoplay=1');
    await waitForBtState(page, 'playing', 60_000);
    await page.waitForFunction(() => !!(window as unknown as { __bt: Bt }).__bt.quality, undefined, { timeout: 10_000 });
    const after = (await bt(page, 'quality'))!;
    expect(after.tier).toBe('med');
    expect(after.source).toBe('manual');

    expect(problems.errors).toEqual([]);
  });

  test('losing the WebGL context pauses and shows a reload prompt', async ({ page, baseURL }, testInfo) => {
    desktopOnly(testInfo.project.name);
    const problems = await startPlaying(page, baseURL!);
    expect(await bt(page, 'contextLostCount')).toBe(0);
    await expect(page.locator('#context-lost')).toBeHidden();

    const lost = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')!;
      const gl = canvas.getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_lose_context');
      if (!ext) return false;
      ext.loseContext();
      return true;
    });
    expect(lost).toBe(true);

    await expect(page.locator('#context-lost')).toBeVisible();
    await expect(page.locator('#context-lost')).toContainText('Mất kết nối đồ hoạ');
    await expect(page.locator('#context-lost button')).toHaveText('Tải lại');
    await expect.poll(() => bt(page, 'paused')).toBe(true);
    expect(await bt(page, 'pauseReason')).toBe('context-lost');
    expect(await bt(page, 'contextLostCount')).toBe(1);

    // Frames keep ticking on a lost context without throwing.
    await page.waitForTimeout(500);
    expect(problems.errors.filter((e) => e.startsWith('pageerror'))).toEqual([]);
  });
});

test.describe('mobile', () => {
  test('pause menu HUD debug toggle shows the HUD', async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-emu', 'touch HUD toggle runs in the mobile-emu project');
    const problems = await startPlaying(page, baseURL!);
    await expect(page.locator('#debug-hud')).toBeHidden();
    expect((await bt(page, 'quality'))!.tier).toBe('med'); // coarse pointer starts at Vừa (D-21)

    const box = (await page.locator('#btn-pause').boundingBox())!;
    await touchTap(page, box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('#pause-menu')).toBeVisible();

    await page.locator('#hud-toggle').tap();
    await expect(page.locator('#debug-hud')).toBeVisible();
    expect((await bt(page, 'hud'))!.visible).toBe(true);

    expect(problems.errors).toEqual([]);
    expect(problems.offOrigin).toEqual([]);
  });
});

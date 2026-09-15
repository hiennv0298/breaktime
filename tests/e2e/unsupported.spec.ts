import { expect, test } from '@playwright/test';
import { waitForBtState } from './helpers';

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'no-webgl', 'unsupported screen is tested with WebGL disabled only');
});

test('no WebGL shows the Vietnamese unsupported screen, never a black page', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('./');
  await waitForBtState(page, 'unsupported', 30_000);

  const screen = page.locator('#unsupported');
  await expect(screen).toBeVisible();
  const text = (await screen.textContent()) ?? '';
  expect(text).toContain('WebGL2');
  expect(text).toContain('Trình duyệt này chưa chạy được Break Time');

  const state = await page.evaluate(() => (window as unknown as { __bt: { state: string } }).__bt.state);
  expect(state).toBe('unsupported');
  expect(await page.locator('canvas').count()).toBe(0);
  expect(await page.locator('#play').count()).toBe(0);
  expect(pageErrors).toEqual([]);
});

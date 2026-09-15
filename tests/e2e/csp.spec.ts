import { expect, test } from '@playwright/test';
import { collectPageProblems, waitForBtState } from './helpers';

type Bt = { sha?: string; state?: string; buildTime?: string };

test('badge shows "Break Time · <sha>" matching version.json and window.__bt', async ({ page, request }) => {
  const res = await request.get('./version.json');
  expect(res.status()).toBe(200);
  const version = (await res.json()) as { sha: string; time: string };
  expect(version.sha).toMatch(/^[0-9a-f]{12}$/);

  await page.goto('./');
  const badge = page.locator('#build-badge');
  await expect(badge).toBeVisible();
  const text = (await badge.textContent()) ?? '';
  expect(text).toMatch(/^Break Time · [0-9a-f]{12}$/);
  expect(text).toBe(`Break Time · ${version.sha}`);

  await waitForBtState(page, 'booting');
  const bt = await page.evaluate(() => {
    const b = (window as unknown as { __bt: Bt }).__bt;
    return { sha: b.sha, state: b.state };
  });
  expect(bt.sha).toBe(version.sha);
  expect(bt.state).toBe('booting');
});

test('served index.html carries the CSP meta and no external reference', async ({ request }) => {
  const res = await request.get('./');
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body.length).toBeGreaterThan(100);
  expect(body).toContain('http-equiv="Content-Security-Policy"');
  expect(body).toContain("'wasm-unsafe-eval'");
  expect(body).not.toContain('http://');
  expect(body).not.toContain('https://');
  expect(body.toLowerCase()).not.toContain('robots');
});

test('load produces zero console errors, page errors and off-origin requests', async ({ page, baseURL }) => {
  const problems = collectPageProblems(page, baseURL!);
  let requests = 0;
  page.on('request', () => requests++);
  await page.goto('./', { waitUntil: 'networkidle' });
  await waitForBtState(page, 'booting');
  await expect(page.locator('#build-badge')).toBeVisible();
  expect(requests).toBeGreaterThan(1); // the listener really saw the document + its module script
  expect(problems.errors).toEqual([]);
  expect(problems.offOrigin).toEqual([]);
});

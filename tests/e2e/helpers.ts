import type { Page } from '@playwright/test';

export interface PageProblems {
  errors: string[];
  offOrigin: string[];
}

/**
 * Attach listeners BEFORE page.goto. Arrays fill live while the page runs.
 * errors: console 'error' messages + uncaught page errors.
 * offOrigin: any request whose origin differs from baseURL (data: and blob: ignored).
 */
export function collectPageProblems(page: Page, baseURL: string): PageProblems {
  const origin = new URL(baseURL).origin;
  const problems: PageProblems = { errors: [], offOrigin: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') problems.errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.errors.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('data:') || u.startsWith('blob:')) return;
    let reqOrigin: string;
    try {
      reqOrigin = new URL(u).origin;
    } catch {
      problems.offOrigin.push(u);
      return;
    }
    if (reqOrigin !== origin) problems.offOrigin.push(u);
  });
  return problems;
}

/** Poll window.__bt?.state until it equals `state`. */
export async function waitForBtState(page: Page, state: string, timeoutMs = 30_000): Promise<void> {
  await page.waitForFunction(
    (s) => (window as unknown as { __bt?: { state?: string } }).__bt?.state === s,
    state,
    { timeout: timeoutMs, polling: 100 },
  );
}

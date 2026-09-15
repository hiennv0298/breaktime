import { expect, test, type Page } from '@playwright/test';
import { collectPageProblems, waitForBtState, type PageProblems } from './helpers';

/* Plan 01-26: saved NPC count + names applied at start, safe name labels, broken storage, no network (D-29, D-31). */

type Screen = { x: number; y: number };
type NpcMode = 'walk' | 'dwell' | 'ragdoll' | 'recover';
type LabelSnap = { index: number; text: string; visible: boolean; x: number; y: number };
type Bt = {
  state?: string;
  npcs?: Array<{ id: string; mode: NpcMode; name: string; screen: Screen }>;
  npcSettings?: { count: number; names: string[]; source: string; storageOk: boolean };
  npcLabels?: LabelSnap[];
  highlight?: { kind: string | null };
  ragdolls?: { active: number };
};

const KEY = 'bt.npcs';

function bt<K extends keyof Bt>(page: Page, key: K): Promise<Bt[K]> {
  return page.evaluate((k) => (window as unknown as { __bt: Bt }).__bt[k as keyof Bt], key) as Promise<Bt[K]>;
}

/** Seeds localStorage['bt.npcs'] once per tab (later navigations keep whatever the page stored since). */
async function seedStorage(page: Page, value: string): Promise<void> {
  await page.addInitScript(
    ([key, v]) => {
      try {
        if (sessionStorage.getItem('bt.test.seeded') === '1') return;
        localStorage.setItem(key, v);
        sessionStorage.setItem('bt.test.seeded', '1');
      } catch {
        /* about:blank or storage disabled */
      }
    },
    [KEY, value] as const,
  );
}

function record(count: number, names: string[]): string {
  return JSON.stringify({ v: 1, count, names });
}

async function startPlaying(page: Page, baseURL: string, url = './?autoplay=1'): Promise<PageProblems> {
  const problems = collectPageProblems(page, baseURL);
  await page.goto(url);
  await waitForBtState(page, 'playing', 60_000);
  await page.waitForFunction(
    () => {
      const b = (window as unknown as { __bt: Bt }).__bt;
      return !!b.npcs && !!b.npcSettings && !!b.npcLabels;
    },
    undefined,
    { timeout: 10_000, polling: 100 },
  );
  return problems;
}

function expectClean(problems: PageProblems): void {
  expect(problems.errors).toEqual([]);
  expect(problems.offOrigin).toEqual([]);
}

function labelAt(labels: LabelSnap[] | undefined, index: number): LabelSnap | undefined {
  return labels?.find((l) => l.index === index);
}

test.describe('npc names desktop', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'npc name tests run in the desktop project only');
  });

  test('stored names appear above their NPCs as plain text', async ({ page, baseURL }) => {
    await seedStorage(
      page,
      record(5, ['  Sếp   Tùng  ', '<img src=x onerror=alert(1)>', 'Ánh', '', 'ABCDEFGHIJKLMNOPQRSTUV']),
    );
    const dialogs: string[] = [];
    page.on('dialog', (d) => {
      dialogs.push(d.message());
      void d.dismiss();
    });
    const problems = await startPlaying(page, baseURL!);

    expect((await bt(page, 'npcs'))!.length).toBe(5);
    const settings = (await bt(page, 'npcSettings'))!;
    expect(settings.source).toBe('stored');
    expect(settings.count).toBe(5);
    expect(settings.storageOk).toBe(true);

    await page.waitForFunction(
      () => ((window as unknown as { __bt: Bt }).__bt.npcLabels ?? []).some((l) => l.visible),
      undefined,
      { timeout: 5000, polling: 50 },
    );
    const labels = (await bt(page, 'npcLabels'))!;
    expect(labelAt(labels, 0)?.text).toBe('Sếp Tùng');
    expect(labelAt(labels, 1)?.text).toBe('<img src=x onerr');
    expect(labelAt(labels, 2)?.text).toBe('Ánh');
    expect(labelAt(labels, 4)?.text).toBe('ABCDEFGHIJKLMNOP');
    expect(labelAt(labels, 3)?.visible ?? false).toBe(false);
    const names = (await bt(page, 'npcs'))!.map((n) => n.name);
    expect(names).toEqual(['Sếp Tùng', '<img src=x onerr', 'Ánh', '', 'ABCDEFGHIJKLMNOP']);

    // textContent only: the payload is literal text, no element, no script ran.
    expect(await page.evaluate(() => document.querySelector('#npc-labels img'))).toBeNull();
    expect(await page.evaluate(() => document.querySelectorAll('#npc-labels *:not(.npc-label)').length)).toBe(0);
    expect(await page.locator('#npc-labels .npc-label[data-npc="1"]').textContent()).toBe('<img src=x onerr');
    expect(await page.locator('#npc-labels').getAttribute('aria-hidden')).toBe('true');
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('npc-labels')!).pointerEvents)).toBe('none');

    // Label of npc-0 sits over its NPC: centred on it and above its torso.
    const vp = page.viewportSize()!;
    await page.waitForFunction(
      ([w, h]) => {
        const b = (window as unknown as { __bt: Bt }).__bt;
        const s = b.npcs?.[0]?.screen;
        const l = b.npcLabels?.find((x) => x.index === 0);
        return !!s && !!l && l.visible && s.x > 40 && s.x < w - 40 && s.y > 80 && s.y < h - 20;
      },
      [vp.width, vp.height] as const,
      { timeout: 15_000, polling: 50 },
    );
    const placed = await page.evaluate(() => {
      const b = (window as unknown as { __bt: Bt }).__bt;
      const el = document.querySelector('#npc-labels .npc-label[data-npc="0"]')!;
      const r = el.getBoundingClientRect();
      return { screen: b.npcs![0].screen, cx: r.left + r.width / 2, bottom: r.bottom, width: r.width };
    });
    expect(placed.width).toBeGreaterThan(0);
    expect(Math.abs(placed.cx - placed.screen.x), JSON.stringify(placed)).toBeLessThanOrEqual(30);
    expect(placed.bottom, JSON.stringify(placed)).toBeLessThan(placed.screen.y);

    await page.waitForTimeout(300);
    expect(dialogs).toEqual([]);
    expectClean(problems);
  });

  test('corrupt storage falls back to three unnamed NPCs', async ({ page, baseURL }) => {
    await seedStorage(page, '{not json');
    const problems = await startPlaying(page, baseURL!);
    expect((await bt(page, 'npcs'))!.length).toBe(3);
    const settings = (await bt(page, 'npcSettings'))!;
    expect(settings.source).toBe('default');
    expect(settings.count).toBe(3);
    expect(settings.names.every((n) => n === '')).toBe(true);
    await page.waitForTimeout(500);
    expect((await bt(page, 'npcLabels'))!.filter((l) => l.visible)).toEqual([]);
    await expect(page.locator('#npc-labels .npc-label:not([hidden])')).toHaveCount(0);
    expectClean(problems);
  });

  test('throwing storage does not crash', async ({ page, baseURL }) => {
    await page.addInitScript(() => {
      Storage.prototype.getItem = function (): string | null {
        throw new Error('storage disabled');
      };
      Storage.prototype.setItem = function (): void {
        throw new Error('storage disabled');
      };
    });
    const problems = await startPlaying(page, baseURL!);
    expect(await bt(page, 'state')).toBe('playing');
    expect((await bt(page, 'npcs'))!.length).toBe(3);
    const settings = (await bt(page, 'npcSettings'))!;
    expect(settings.storageOk).toBe(false);
    expect(settings.source).toBe('default');
    expect(problems.errors.filter((e) => e.startsWith('pageerror'))).toEqual([]);
    expectClean(problems);
  });

  test('?npcs overrides the stored count, names still apply', async ({ page, baseURL }) => {
    await seedStorage(page, record(2, ['Minh', 'Lan']));
    const problems = await startPlaying(page, baseURL!, './?autoplay=1&npcs=7');
    expect((await bt(page, 'npcs'))!.length).toBe(7);
    const settings = (await bt(page, 'npcSettings'))!;
    expect(settings.source).toBe('query');
    expect(settings.count).toBe(7);
    const labels = (await bt(page, 'npcLabels'))!;
    expect(labelAt(labels, 0)?.text).toBe('Minh');
    expect(labelAt(labels, 1)?.text).toBe('Lan');
    for (let i = 2; i < 7; i++) expect(labelAt(labels, i)?.visible ?? false).toBe(false);

    // A tampered count (42) plus ?npcs=99: both clamp to 10.
    await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ v: 1, count: 42, names: [] })), KEY);
    await page.goto('./?autoplay=1&npcs=99');
    await waitForBtState(page, 'playing', 60_000);
    await page.waitForFunction(() => !!(window as unknown as { __bt: Bt }).__bt.npcSettings, undefined, {
      timeout: 10_000,
    });
    expect((await bt(page, 'npcs'))!.length).toBe(10);
    expect((await bt(page, 'npcSettings'))!.count).toBe(10);
    expectClean(problems);
  });

  test('label follows a slapped NPC', async ({ page, baseURL }) => {
    await seedStorage(page, record(1, ['Bốp']));
    const problems = await startPlaying(page, baseURL!, './?autoplay=1&npcs=1&npcAt=0.9,1.0');
    await page.waitForFunction(
      () => {
        const b = (window as unknown as { __bt: Bt }).__bt;
        return b.highlight?.kind === 'npc' && !!b.npcLabels?.find((l) => l.index === 0 && l.visible);
      },
      undefined,
      { timeout: 5000, polling: 50 },
    );
    const before = labelAt(await bt(page, 'npcLabels'), 0)!;
    expect(before.text).toBe('Bốp');

    await page.keyboard.press('Space');
    await page.waitForFunction(() => (window as unknown as { __bt: Bt }).__bt.ragdolls?.active === 1, undefined, {
      timeout: 1000,
      polling: 16,
    });
    await page.waitForFunction(
      (b0) => {
        const l = (window as unknown as { __bt: Bt }).__bt.npcLabels?.find((x) => x.index === 0);
        if (!l) return false;
        if (!l.visible) return true; // the ragdoll flew out of view
        return Math.abs(l.x - b0.x) > 20 || Math.abs(l.y - b0.y) > 20;
      },
      before,
      { timeout: 1000, polling: 16 },
    );
    expectClean(problems);
  });

  test('names never leave the device', async ({ page, baseURL }) => {
    await seedStorage(page, record(3, ['Sếp Tùng']));
    const origin = new URL(baseURL!).origin;
    const requests: Array<{ url: string; method: string; post: string | null; afterPlaying: boolean }> = [];
    let playing = false;
    page.on('request', (r) => {
      requests.push({ url: r.url(), method: r.method(), post: r.postData(), afterPlaying: playing });
    });
    const problems = await startPlaying(page, baseURL!);
    playing = true;
    expect(labelAt(await bt(page, 'npcLabels'), 0)?.text).toBe('Sếp Tùng');
    await page.waitForTimeout(2500);

    expect(requests.length).toBeGreaterThan(0);
    for (const r of requests) {
      if (r.url.startsWith('data:') || r.url.startsWith('blob:')) continue;
      expect(new URL(r.url).origin, r.url).toBe(origin);
      expect(r.url).not.toContain('S%E1%BA%BFp');
      expect(r.url).not.toContain('Sếp');
      expect(r.post ?? '').not.toContain('Sếp');
      if (r.afterPlaying) expect(['GET', 'HEAD'], `${r.method} ${r.url}`).toContain(r.method);
    }
    expectClean(problems);
  });
});

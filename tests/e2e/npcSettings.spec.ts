import { expect, test, type Page } from '@playwright/test';
import { collectPageProblems, touchTap, waitForBtState, type PageProblems } from './helpers';

/*
 * Plan 01-27: settings menu NPC section (D-29, CTRL-07, CTRL-04, D-27, D-16). Pick 0–10 NPCs with − / +, name them,
 * Áp dụng applies in place (grow-only pool, safe despawn during a ragdoll), saves on this device, typing never drives
 * the game, the fields work on phones, and the key hint panel stays click-safe (D-28 panel contract).
 */

type Vec3 = [number, number, number];
type NpcMode = 'walk' | 'dwell' | 'ragdoll' | 'recover';
type LabelSnap = { index: number; text: string; visible: boolean; x: number; y: number };
type Bt = {
  state?: string;
  paused?: boolean;
  npcs?: Array<{ id: string; pos: Vec3; mode: NpcMode; name: string }>;
  npcSettings?: { count: number; names: string[]; source: string; storageOk: boolean };
  npcLabels?: LabelSnap[];
  highlight?: { kind: string | null };
  ragdolls?: { active: number; bodies: number };
  shadows?: { count: number };
  debris?: { broken: number };
  props?: { dynamicCount: number; brokenCount: number; movedCount: number };
  hud?: { visible: boolean; bodies: number };
  camera?: { targetYawDeg: number };
  swing?: { count: number };
};

const ROSTER_KEY = 'bt.roster';

function bt<K extends keyof Bt>(page: Page, key: K): Promise<Bt[K]> {
  return page.evaluate((k) => (window as unknown as { __bt: Bt }).__bt[k as keyof Bt], key) as Promise<Bt[K]>;
}

async function startPlaying(page: Page, baseURL: string, url = './?autoplay=1'): Promise<PageProblems> {
  const problems = collectPageProblems(page, baseURL);
  await page.goto(url);
  await waitForReady(page);
  return problems;
}

async function waitForReady(page: Page): Promise<void> {
  await waitForBtState(page, 'playing', 60_000);
  await page.waitForFunction(
    () => {
      const b = (window as unknown as { __bt: Bt }).__bt;
      return !!b.npcs && !!b.npcSettings && !!b.npcLabels && !!b.ragdolls && !!b.swing;
    },
    undefined,
    { timeout: 10_000, polling: 100 },
  );
}

function expectClean(problems: PageProblems): void {
  expect(problems.errors).toEqual([]);
  expect(problems.offOrigin).toEqual([]);
}

async function waitPaused(page: Page, paused: boolean): Promise<void> {
  await page.waitForFunction((want) => (window as unknown as { __bt: Bt }).__bt.paused === want, paused, {
    timeout: 2000,
    polling: 16,
  });
}

async function openMenuWithEscape(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await waitPaused(page, true);
  await expect(page.locator('#pause-menu')).toBeVisible();
}

async function closeMenuWithEscape(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await waitPaused(page, false);
  await expect(page.locator('#pause-menu')).toBeHidden();
}

/** Clicks − or + until #npc-count-value shows `n`. */
async function setCount(page: Page, n: number): Promise<void> {
  const value = page.locator('#npc-count-value');
  for (let guard = 0; guard < 12; guard++) {
    const current = Number(await value.textContent());
    if (current === n) return;
    await page.locator(current < n ? '#npc-count-inc' : '#npc-count-dec').click();
  }
  await expect(value).toHaveText(String(n));
}

async function waitNpcCount(page: Page, n: number, timeout = 1000): Promise<void> {
  await page.waitForFunction((want) => (window as unknown as { __bt: Bt }).__bt.npcs?.length === want, n, {
    timeout,
    polling: 16,
  });
}

async function storedRecord(page: Page): Promise<{ count: number; names: string[] } | null> {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const roster = JSON.parse(raw) as { count: number; members: Array<{ name: string; id: string }> };
    const names: string[] = [];
    // Derive names from the first `count` present members (on-floor members)
    for (let i = 0; i < 15; i++) {
      const member = roster.members[i];
      names.push(i < roster.count && member ? member.name : '');
    }
    return { count: roster.count, names };
  }, ROSTER_KEY);
}

function labelText(labels: LabelSnap[] | undefined, index: number): string | undefined {
  return labels?.find((l) => l.index === index)?.text;
}

async function slapPinnedNpc(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __bt: Bt }).__bt.highlight?.kind === 'npc', undefined, {
    timeout: 5000,
    polling: 50,
  });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => (window as unknown as { __bt: Bt }).__bt.ragdolls?.active === 1, undefined, {
    timeout: 1000,
    polling: 16,
  });
}

test.describe('npc settings desktop', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'npc settings desktop tests run in the desktop project only');
  });

  test('set ten named NPCs from the menu, applied at once and kept after reload', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    expect((await bt(page, 'npcs'))!.length).toBe(3);

    await openMenuWithEscape(page);
    const value = page.locator('#npc-count-value');
    await expect(value).toHaveText('3');
    for (let i = 0; i < 7; i++) await page.locator('#npc-count-inc').click();
    await expect(value).toHaveText('10');
    // Stepper now stops at 15 (plan 02-06, D-01), not 10.
    await expect(page.locator('#npc-count-inc')).not.toBeDisabled();
    for (let i = 0; i < 5; i++) await page.locator('#npc-count-inc').click();
    await expect(value).toHaveText('15');
    await expect(page.locator('#npc-count-inc')).toBeDisabled();

    const fields = page.locator('input.npc-name');
    // 15 name fields at the new cap (plan 02-06, D-01).
    await expect(fields).toHaveCount(15);
    for (let i = 0; i < 15; i++) await expect(fields.nth(i)).toBeVisible();

    // Set back to 10 for the rest of the test.
    for (let i = 0; i < 5; i++) await page.locator('#npc-count-dec').click();
    await expect(value).toHaveText('10');

    await page.locator('input.npc-name[data-index="0"]').fill('  Sếp   Tùng  ');
    await page.locator('input.npc-name[data-index="1"]').fill('ABCDEFGHIJKLMNOPQRSTUV');

    await page.locator('#npc-apply').click();
    await waitNpcCount(page, 10, 1000);
    expect(await bt(page, 'paused')).toBe(true);
    await expect(page.locator('input.npc-name[data-index="0"]')).toHaveValue('Sếp Tùng');
    await expect(page.locator('input.npc-name[data-index="1"]')).toHaveValue('ABCDEFGHIJKLMNOP');
    expect((await bt(page, 'npcSettings'))!.source).toBe('manual');
    await expect(page.locator('#npc-apply-status')).toContainText('Đã lưu');

    await closeMenuWithEscape(page);
    await page.waitForFunction(
      () => {
        const l = (window as unknown as { __bt: Bt }).__bt.npcLabels ?? [];
        return (
          l.find((x) => x.index === 0)?.text === 'Sếp Tùng' && l.find((x) => x.index === 1)?.text === 'ABCDEFGHIJKLMNOP'
        );
      },
      undefined,
      { timeout: 2000, polling: 50 },
    );
    const names = (await bt(page, 'npcs'))!.map((n) => n.name);
    expect(names.slice(0, 2)).toEqual(['Sếp Tùng', 'ABCDEFGHIJKLMNOP']);
    const stored = (await storedRecord(page))!;
    expect(stored.count).toBe(10);
    expect(stored.names[0]).toBe('Sếp Tùng');

    await page.goto('./?autoplay=1');
    await waitForReady(page);
    expect((await bt(page, 'npcs'))!.length).toBe(10);
    expect((await bt(page, 'npcSettings'))!.source).toBe('stored');
    await page.waitForFunction(() => ((window as unknown as { __bt: Bt }).__bt.hud?.bodies ?? 0) > 0, undefined, {
      timeout: 5000,
    });
    expect((await bt(page, 'hud'))!.bodies).toBeLessThanOrEqual(200);
    expectClean(problems);
  });

  test('typing a name never drives the game', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    await page.waitForFunction(() => !!(window as unknown as { __bt: Bt }).__bt.camera && !!(window as unknown as { __bt: Bt }).__bt.hud);
    await openMenuWithEscape(page);
    const yaw = (await bt(page, 'camera'))!.targetYawDeg;
    const hudVisible = (await bt(page, 'hud'))!.visible;
    const swings = (await bt(page, 'swing'))!.count;

    const field = page.locator('input.npc-name[data-index="0"]');
    await field.focus();
    await page.keyboard.type('Zz Cc` WASD');
    await expect(field).toHaveValue('Zz Cc` WASD');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Space');
    await page.keyboard.press('ControlLeft');
    // The caret moved left and Space typed a space: neither key was swallowed by the game.
    await expect(field).toHaveValue('Zz Cc` WAS D');
    await page.waitForTimeout(300);

    expect((await bt(page, 'camera'))!.targetYawDeg).toBe(yaw);
    expect((await bt(page, 'hud'))!.visible).toBe(hudVisible);
    expect((await bt(page, 'swing'))!.count).toBe(swings);
    expect(await bt(page, 'paused')).toBe(true);
    await expect(page.locator('#pause-menu')).toBeVisible();

    // Escape still closes the menu from inside the field.
    await expect(field).toBeFocused();
    await closeMenuWithEscape(page);
    expectClean(problems);
  });

  test('shrinking and growing while a ragdoll flies is safe', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!, './?autoplay=1&npcs=3&npcAt=0.9,1.0');
    await slapPinnedNpc(page);
    await openMenuWithEscape(page);
    await page.waitForTimeout(100);

    const before = {
      dynamic: (await bt(page, 'props'))!.dynamicCount,
      broken: (await bt(page, 'props'))!.brokenCount,
      debris: (await bt(page, 'debris'))!.broken,
      shadows: (await bt(page, 'shadows'))!.count,
    };
    expect((await bt(page, 'ragdolls'))!.active).toBe(1);

    await setCount(page, 0);
    await page.locator('#npc-apply').click();
    await waitNpcCount(page, 0);
    expect((await bt(page, 'ragdolls'))!.active).toBe(0);
    expect((await bt(page, 'shadows'))!.count).toBe(before.shadows - 3);
    expect((await bt(page, 'props'))!.dynamicCount).toBe(before.dynamic);
    expect((await bt(page, 'props'))!.brokenCount).toBe(before.broken);
    expect((await bt(page, 'debris'))!.broken).toBe(before.debris);

    await setCount(page, 10);
    await page.locator('#npc-apply').click();
    await waitNpcCount(page, 10);
    expect((await bt(page, 'ragdolls'))!.bodies).toBe(60);
    expect((await bt(page, 'ragdolls'))!.active).toBe(0);
    expect((await bt(page, 'shadows'))!.count).toBe(before.shadows - 3 + 10);

    // Same 10 again: the grow-only pool allocates nothing new.
    await page.locator('#npc-apply').click();
    await page.waitForTimeout(200);
    expect((await bt(page, 'npcs'))!.length).toBe(10);
    expect((await bt(page, 'ragdolls'))!.bodies).toBe(60);
    expect((await bt(page, 'shadows'))!.count).toBe(before.shadows - 3 + 10);

    await closeMenuWithEscape(page);
    await page.waitForTimeout(1500);
    const npcs = (await bt(page, 'npcs'))!;
    expect(npcs.length).toBe(10);
    for (const n of npcs) {
      expect(n.pos.every(Number.isFinite), JSON.stringify(n)).toBe(true);
      expect(Math.abs(n.pos[0]), JSON.stringify(n)).toBeLessThan(8);
      expect(Math.abs(n.pos[2]), JSON.stringify(n)).toBeLessThan(6);
      expect(['walk', 'dwell'], JSON.stringify(n)).toContain(n.mode);
    }
    expectClean(problems);
  });

  test('renaming keeps a flying ragdoll flying', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!, './?autoplay=1&npcs=1&npcAt=0.9,1.0');
    await slapPinnedNpc(page);
    await openMenuWithEscape(page);

    await page.locator('input.npc-name[data-index="0"]').fill('Bốp');
    await expect(page.locator('#npc-count-value')).toHaveText('1');
    await page.locator('#npc-apply').click();
    await expect(page.locator('#npc-apply-status')).toContainText('Đã lưu');
    expect((await bt(page, 'npcs'))![0].mode).toBe('ragdoll');
    expect((await bt(page, 'ragdolls'))!.active).toBe(1);
    expect((await bt(page, 'npcs'))![0].name).toBe('Bốp');

    await closeMenuWithEscape(page);
    await page.waitForFunction(
      () => {
        const m = (window as unknown as { __bt: Bt }).__bt.npcs?.[0]?.mode;
        return m === 'walk' || m === 'dwell';
      },
      undefined,
      { timeout: 7000, polling: 50 },
    );
    expect(labelText(await bt(page, 'npcLabels'), 0)).toBe('Bốp');
    expectClean(problems);
  });

  test('?npcs is overridden by an explicit Apply', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!, './?autoplay=1&npcs=7');
    expect((await bt(page, 'npcs'))!.length).toBe(7);
    await openMenuWithEscape(page);
    await expect(page.locator('#npc-count-value')).toHaveText('7');
    await page.locator('#npc-count-dec').click();
    await page.locator('#npc-count-dec').click();
    await expect(page.locator('#npc-count-value')).toHaveText('5');
    await page.locator('#npc-apply').click();
    await waitNpcCount(page, 5);
    expect((await bt(page, 'npcSettings'))!.source).toBe('manual');
    expect((await bt(page, 'npcSettings'))!.count).toBe(5);
    expect((await storedRecord(page))!.count).toBe(5);
    expectClean(problems);
  });

  test('storage failure: applies but says not saved', async ({ page, baseURL }) => {
    await page.addInitScript(() => {
      Storage.prototype.getItem = function (): string | null {
        throw new Error('storage disabled');
      };
      Storage.prototype.setItem = function (): void {
        throw new Error('storage disabled');
      };
    });
    const problems = await startPlaying(page, baseURL!);
    expect((await bt(page, 'npcs'))!.length).toBe(3);
    await openMenuWithEscape(page);
    await setCount(page, 4);
    await page.locator('#npc-apply').click();
    await waitNpcCount(page, 4);
    await expect(page.locator('#npc-apply-status')).toContainText('Không lưu được');
    expect(problems.errors.filter((e) => e.startsWith('pageerror'))).toEqual([]);
    expectClean(problems);
  });

  test('clicking the key hint panel does not swing', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!, './?autoplay=1&npcs=0');
    const panel = page.locator('#key-hints');
    await expect(panel).toBeVisible();
    expect(await panel.getAttribute('data-hud-panel')).not.toBeNull();
    expect((await bt(page, 'swing'))!.count).toBe(0);
    const box = (await panel.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300);
    expect((await bt(page, 'swing'))!.count).toBe(0);
    // Negative control: a click on the open game view does swing, so the check above is not vacuous.
    await page.mouse.click(640, 300);
    await expect.poll(async () => (await bt(page, 'swing'))!.count, { timeout: 1000 }).toBe(1);
    expectClean(problems);
  });
});

test.describe('npc settings mobile-emu', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-emu', 'phone settings test runs in the mobile-emu project');
  });

  async function tapPause(page: Page): Promise<void> {
    await page.waitForFunction(() => !!document.getElementById('btn-pause'), undefined, { timeout: 10_000 });
    const box = (await page.locator('#btn-pause').boundingBox())!;
    await touchTap(page, box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('#pause-menu')).toBeVisible();
  }

  test('phone: count, name and apply from the ⏸ menu', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    expect((await bt(page, 'npcs'))!.length).toBe(3);
    await tapPause(page);

    await page.locator('#npc-count-inc').tap();
    await expect(page.locator('#npc-count-value')).toHaveText('4');
    const field = page.locator('input.npc-name[data-index="0"]');
    await field.tap();
    await expect(field).toBeFocused();
    await page.keyboard.type('Minh');
    await expect(field).toHaveValue('Minh');

    const style = await field.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        userSelect: cs.userSelect,
        webkitUserSelect: cs.getPropertyValue('-webkit-user-select'),
        fontSize: parseFloat(cs.fontSize),
      };
    });
    expect(style.userSelect === 'text' || style.webkitUserSelect === 'text', JSON.stringify(style)).toBe(true);
    expect(style.fontSize).toBeGreaterThanOrEqual(16);
    // Long-press paste: the page must not cancel the context menu on the field.
    const contextPrevented = await field.evaluate((el) => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(contextPrevented).toBe(false);

    await page.locator('#npc-apply').scrollIntoViewIfNeeded();
    await page.locator('#npc-apply').tap();
    await waitNpcCount(page, 4);
    await page.locator('#pause-resume').tap();
    await waitPaused(page, false);
    expect(labelText(await bt(page, 'npcLabels'), 0)).toBe('Minh');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await tapPause(page);
    for (const sel of ['input.npc-name[data-index="3"]', '#npc-apply']) {
      const el = page.locator(sel);
      await expect(el).toBeVisible();
      await el.scrollIntoViewIfNeeded();
      const b = (await el.boundingBox())!;
      expect(b.y, sel).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height, sel).toBeLessThanOrEqual(844);
    }
    await expect(page.locator('input.npc-name[data-index="4"]')).toBeHidden();
    expectClean(problems);
  });
});

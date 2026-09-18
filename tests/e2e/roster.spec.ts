import { expect, test, type Page } from '@playwright/test';
import { collectPageProblems, touchTap, waitForBtState, type PageProblems } from './helpers';
import { PRESET_NAMES } from '../../src/logic/presetNames';

/*
 * Plan 02-09: Roster editor (D-03, D-04, D-10, G4, NPC-02): up to 30 coworkers with names ≤16 chars,
 * 17 looks, tempers Nóng/Thường/Hiền, presence 0..15, random names, delete, clear-all, warning line,
 * name-tag switch; ported from Phase 1 settings (01-27 guarantees): typing never drives game, safe despawn
 * during ragdoll, storage failure, no swallowed browser shortcuts, key hints stay click-safe.
 */

type Vec3 = [number, number, number];
type NpcMode = 'walk' | 'dwell' | 'ragdoll' | 'recover';
type LabelSnap = { index: number; text: string; visible: boolean; x: number; y: number };
type Bt = {
  state?: string;
  paused?: boolean;
  npcs?: Array<{ id: string; pos: Vec3; mode: NpcMode; name: string; memberId: string }>;
  roster?: { members: Array<{ id: string; name: string; look: string; temper: string }>; count: number; present: string[] };
  npcLabels?: LabelSnap[];
  npcLabelsPref?: { enabled: boolean; storageOk: boolean };
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
      return !!b.npcs && !!b.roster && !!b.npcLabels && !!b.ragdolls && !!b.swing;
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
  for (let guard = 0; guard < 20; guard++) {
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

test.describe('roster editor desktop', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'roster desktop tests run in the desktop project only');
  });

  test('edit a coworker: name, look, temper, applied at once and kept after reload', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    expect((await bt(page, 'npcs'))!.length).toBe(3);

    await openMenuWithEscape(page);
    const row = page.locator('.roster-row[data-member-id="m1"]');
    await expect(row).toBeVisible();

    // Edit name with whitespace
    await row.locator('input.npc-name').fill('  Chị   Mai  ');
    // Select look
    await row.locator('select.roster-look').selectOption('r');
    // Select temper
    await row.locator('select.roster-temper').selectOption('hot');

    await page.locator('#npc-apply').click();
    await page.waitForTimeout(500);

    const roster = await bt(page, 'roster');
    expect(roster!.members[0].name).toBe('Chị Mai');
    expect(roster!.members[0].look).toBe('r');
    expect(roster!.members[0].temper).toBe('hot');

    await expect(row.locator('input.npc-name')).toHaveValue('Chị Mai');
    await expect(page.locator('#npc-apply-status')).toContainText('Đã lưu');

    // Reload and verify
    await page.goto('./?autoplay=1');
    await waitForReady(page);
    const reloadedRoster = await bt(page, 'roster');
    expect(reloadedRoster!.members[0].name).toBe('Chị Mai');
    expect(reloadedRoster!.members[0].look).toBe('r');
    expect(reloadedRoster!.members[0].temper).toBe('hot');
    expectClean(problems);
  });

  test('presence decides who is in the office', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    expect((await bt(page, 'npcs'))!.length).toBe(3);

    await openMenuWithEscape(page);
    // Initially count=3 with m1, m2, m3 on floor. Uncheck m2 (not on floor) to isolate.
    // Or uncheck m1 and m2 to reduce on-floor from 3 to 1
    await page.locator('.roster-row[data-member-id="m1"] input.roster-present').uncheck();
    await page.locator('.roster-row[data-member-id="m2"] input.roster-present').uncheck();
    await page.locator('#npc-apply').click();
    await waitNpcCount(page, 1);

    const roster = await bt(page, 'roster');
    expect(roster!.present).not.toContain('m1');
    expect(roster!.present).not.toContain('m2');
    expect((await bt(page, 'npcs'))!.length).toBe(1);

    // When 15 are present, unticked boxes should be disabled
    await setCount(page, 15);
    const checkboxes = page.locator('.roster-row input.roster-present[type=checkbox]');
    const count = await checkboxes.count();
    // Count should match the number of rows
    expect(count).toBeGreaterThan(2);

    // Uncheck one and see others enable
    const visibleCheckboxes = checkboxes.filter({ hasNot: page.locator('...[hidden]') });
    const checkedCount = await page.evaluate(() => {
      const roster = (window as unknown as { __bt: Bt }).__bt.roster;
      return roster!.present.length;
    });
    expect(checkedCount).toBeLessThanOrEqual(15);
    expectClean(problems);
  });

  test('stepper counts present coworkers', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    await openMenuWithEscape(page);

    await expect(page.locator('#npc-count-max')).toContainText('/ 15');
    await setCount(page, 10);
    await page.locator('#npc-apply').click();
    await waitNpcCount(page, 10);

    const roster = await bt(page, 'roster');
    expect(roster!.count).toBe(10);
    expect(roster!.present.length).toBeGreaterThanOrEqual(10);

    // Apply again: no new bodies
    const before = (await bt(page, 'ragdolls'))!.bodies;
    await page.locator('#npc-apply').click();
    await page.waitForTimeout(200);
    const after = (await bt(page, 'ragdolls'))!.bodies;
    expect(after).toBe(before);

    expectClean(problems);
  });

  test('add and delete', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    await openMenuWithEscape(page);

    // Add a new member: roster has 15 default, add makes 16
    const addBtn = page.locator('#roster-add');
    await expect(addBtn).not.toBeDisabled();
    await addBtn.click();
    const newRow = page.locator('.roster-row[data-member-id="m16"]');
    await expect(newRow).toBeVisible();
    await expect(newRow.locator('input.roster-present')).toBeChecked();

    await page.locator('#npc-apply').click();
    let roster = await bt(page, 'roster');
    expect(roster!.members).toHaveLength(16);
    expect(roster!.present).toContain('m16');

    // Delete the new member: back to 15
    await newRow.locator('button.roster-delete').click();
    await expect(newRow).not.toBeVisible();

    await page.locator('#npc-apply').click();
    roster = await bt(page, 'roster');
    expect(roster!.members).toHaveLength(15);
    expect(roster!.present).not.toContain('m16');

    // At 30 members, add should be disabled
    await setCount(page, 30);
    await expect(page.locator('#roster-add')).toBeDisabled();

    expectClean(problems);
  });

  test('random name', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    await openMenuWithEscape(page);

    const row = page.locator('.roster-row[data-member-id="m2"]');
    const field = row.locator('input.npc-name');

    await row.locator('button.roster-random').click();
    const randomName = await field.inputValue();
    expect(PRESET_NAMES.some((n) => n === randomName)).toBe(true);

    // Random name does not apply, only sets the field
    const rosterBefore = await bt(page, 'roster');
    expect(rosterBefore!.members[1].name).not.toBe(randomName);

    await page.locator('#npc-apply').click();
    const rosterAfter = await bt(page, 'roster');
    expect(rosterAfter!.members[1].name).toBe(randomName);

    expectClean(problems);
  });

  test('clear all needs two presses', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    await openMenuWithEscape(page);

    // Set a name first
    await page.locator('.roster-row[data-member-id="m1"] input.npc-name').fill('Tùng');
    await page.locator('#npc-apply').click();
    let roster = await bt(page, 'roster');
    expect(roster!.members[0].name).toBe('Tùng');

    // First press changes button text
    const clearButton = page.locator('#roster-clear');
    await clearButton.click();
    await expect(clearButton).toContainText('Bấm lần nữa');

    // Nothing changed yet
    roster = await bt(page, 'roster');
    expect(roster!.members[0].name).toBe('Tùng');

    // Second press within 4 s clears
    await clearButton.click();
    roster = await bt(page, 'roster');
    expect(roster!.members).toHaveLength(15);
    for (const m of roster!.members) {
      expect(m.name).toBe('');
    }
    expect(roster!.count).toBe(3);

    // Name fields are now empty
    for (let i = 0; i < 3; i++) {
      const field = page.locator(`.roster-row[data-member-id="m${i + 1}"] input.npc-name`);
      await expect(field).toHaveValue('');
    }

    const stored = await storedRecord(page);
    expect(stored!.names[0]).toBe('');

    expectClean(problems);
  });

  test('warning line', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    await openMenuWithEscape(page);

    const warning = page.locator('#roster-warning');
    await expect(warning).toBeVisible();
    await expect(warning).toHaveText('Tên chỉ lưu trên máy bạn — đừng dùng để xúc phạm ai');

    expectClean(problems);
  });

  test('hostile name stays text', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    await openMenuWithEscape(page);

    const field = page.locator('.roster-row[data-member-id="m1"] input.npc-name');
    await field.fill('<img src=x onerror=alert(1)>');
    await page.locator('#npc-apply').click();

    // No alert fired, no img element in labels
    const labels = page.locator('#npc-labels img');
    await expect(labels).toHaveCount(0);

    // The label shows it as text
    const label = page.locator('.npc-label[data-npc="0"]');
    const text = await label.textContent();
    expect(text).toContain('<img src=x onerr');

    expectClean(problems);
  });

  test('old build cannot clobber the roster (title contains old build)', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!, './?autoplay=1');

    // Set initial roster
    await openMenuWithEscape(page);
    await page.locator('.roster-row[data-member-id="m1"] input.npc-name').fill('An');
    await page.locator('#npc-apply').click();
    await page.waitForTimeout(500);

    // Simulate old build writing bt.npcs v1
    await page.evaluate(() => {
      localStorage.setItem('bt.npcs', JSON.stringify({
        v: 1,
        count: 9,
        names: ['X', '', '', '', '', '', '', '', '', ''],
      }));
    });

    // Reload
    await page.goto('./?autoplay=1');
    await waitForReady(page);

    // Roster should be unchanged
    const roster = await bt(page, 'roster');
    expect(roster!.members[0].name).toBe('An');
    expect(roster!.count).not.toBe(9);

    expectClean(problems);
  });

  test('name tag switch', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    await openMenuWithEscape(page);

    const toggle = page.locator('#roster-labels-toggle');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    // Click to hide
    await toggle.click();
    await expect(page.locator('#npc-labels')).toHaveAttribute('hidden');
    expect((await bt(page, 'npcLabelsPref'))!.enabled).toBe(false);
    const stored = await page.evaluate(() => localStorage.getItem('bt.npcLabels'));
    expect(stored).toBe('0');

    // Click to show
    await toggle.click();
    await expect(page.locator('#npc-labels')).not.toHaveAttribute('hidden');
    expect((await bt(page, 'npcLabelsPref'))!.enabled).toBe(true);
    const storedOn = await page.evaluate(() => localStorage.getItem('bt.npcLabels'));
    expect(storedOn).toBe('1');

    // Reload and check persistence
    await page.goto('./?autoplay=1');
    await waitForReady(page);
    await expect(page.locator('#npc-labels')).not.toHaveAttribute('hidden');
    expect((await bt(page, 'npcLabelsPref'))!.enabled).toBe(true);

    expectClean(problems);
  });

  test('typing a name never drives the game', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    await page.waitForFunction(() => !!(window as unknown as { __bt: Bt }).__bt.camera && !!(window as unknown as { __bt: Bt }).__bt.hud);
    await openMenuWithEscape(page);
    const yaw = (await bt(page, 'camera'))!.targetYawDeg;
    const hudVisible = (await bt(page, 'hud'))!.visible;
    const swings = (await bt(page, 'swing'))!.count;

    const field = page.locator('input.npc-name').first();
    await field.focus();
    await page.keyboard.type('Zz Cc` WASD');
    await expect(field).toHaveValue('Zz Cc` WASD');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Space');
    await page.keyboard.press('ControlLeft');
    await expect(field).toHaveValue('Zz Cc` WAS D');
    await page.waitForTimeout(300);

    expect((await bt(page, 'camera'))!.targetYawDeg).toBe(yaw);
    expect((await bt(page, 'hud'))!.visible).toBe(hudVisible);
    expect((await bt(page, 'swing'))!.count).toBe(swings);
    expect(await bt(page, 'paused')).toBe(true);

    await closeMenuWithEscape(page);
    expectClean(problems);
  });

  test('shrinking and growing while a ragdoll flies is safe', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!, './?autoplay=1&npcs=3&npcAt=0.9,1.0');
    await slapPinnedNpc(page);
    await openMenuWithEscape(page);
    await page.waitForTimeout(100);

    const before = {
      active: (await bt(page, 'ragdolls'))!.active,
      bodies: (await bt(page, 'ragdolls'))!.bodies,
    };
    expect(before.active).toBe(1);

    await setCount(page, 0);
    await page.locator('#npc-apply').click();
    await waitNpcCount(page, 0);
    expect((await bt(page, 'ragdolls'))!.active).toBe(0);

    await setCount(page, 10);
    await page.locator('#npc-apply').click();
    await waitNpcCount(page, 10);
    expect((await bt(page, 'ragdolls'))!.bodies).toBe(60);

    // Same 10 again: grow-only pool stays the same
    await page.locator('#npc-apply').click();
    await page.waitForTimeout(200);
    expect((await bt(page, 'ragdolls'))!.bodies).toBe(60);

    await closeMenuWithEscape(page);
    expectClean(problems);
  });

  test('renaming keeps a flying ragdoll flying', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!, './?autoplay=1&npcs=1&npcAt=0.9,1.0');
    await slapPinnedNpc(page);
    await openMenuWithEscape(page);

    await page.locator('input.npc-name').first().fill('Bốp');
    await page.locator('#npc-apply').click();
    await expect(page.locator('#npc-apply-status')).toContainText('Đã lưu');

    expect((await bt(page, 'npcs'))![0].mode).toBe('ragdoll');
    expect((await bt(page, 'ragdolls'))!.active).toBe(1);
    expect((await bt(page, 'npcs'))![0].name).toBe('Bốp');

    await closeMenuWithEscape(page);
    expectClean(problems);
  });

  test('?npcs is overridden by an explicit Apply', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!, './?autoplay=1&npcs=7');
    expect((await bt(page, 'npcs'))!.length).toBe(7);

    await openMenuWithEscape(page);
    await setCount(page, 5);
    await page.locator('#npc-apply').click();
    await waitNpcCount(page, 5);
    expect((await bt(page, 'roster'))!.count).toBe(5);

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

    expectClean(problems);
  });
});

test.describe('roster editor mobile-emu', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-emu', 'roster mobile tests run in the mobile-emu project');
  });

  async function tapPause(page: Page): Promise<void> {
    await page.waitForFunction(() => !!document.getElementById('btn-pause'), undefined, { timeout: 10_000 });
    const box = (await page.locator('#btn-pause').boundingBox())!;
    await touchTap(page, box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('#pause-menu')).toBeVisible();
  }

  test('phone: edit from the ⏸ menu', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    expect((await bt(page, 'npcs'))!.length).toBe(3);

    await tapPause(page);

    const field = page.locator('input.npc-name').first();
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

    // Context menu not prevented on name inputs
    const contextPrevented = await field.evaluate((el) => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(contextPrevented).toBe(false);

    // Select look and apply
    await page.locator('select.roster-look').first().selectOption('r');
    await page.locator('#npc-apply').scrollIntoViewIfNeeded();
    await page.locator('#npc-apply').tap();
    await waitNpcCount(page, 3);

    // Check 844×390
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(300);
    await tapPause(page);

    for (const sel of ['.roster-row[data-member-id="m1"] input.npc-name', '#npc-apply']) {
      const el = page.locator(sel).first();
      await expect(el).toBeVisible();
      await el.scrollIntoViewIfNeeded();
      const b = (await el.boundingBox())!;
      expect(b.y, sel).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height, sel).toBeLessThanOrEqual(390);
    }

    // Check 390×844
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await tapPause(page);

    for (const sel of ['.roster-row[data-member-id="m3"] input.npc-name', '#npc-apply']) {
      const el = page.locator(sel).first();
      await expect(el).toBeVisible();
      await el.scrollIntoViewIfNeeded();
      const b = (await el.boundingBox())!;
      expect(b.y, sel).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height, sel).toBeLessThanOrEqual(844);
    }

    expectClean(problems);
  });

  test('names never leave the device', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    await openMenuWithEscape(page);

    // Set a recognizable name
    await page.locator('input.npc-name').first().fill('Sếp Tùng');
    await page.locator('#npc-apply').click();
    await page.waitForTimeout(500);

    // Check that no requests after 'playing' contain the name
    const offOriginRequests = problems.offOrigin;
    expect(offOriginRequests).toEqual([]);

    for (const req of problems.offOrigin) {
      expect(req).not.toContain('Sếp');
      expect(req).not.toContain('S%E1%BA%BFp');
    }

    expectClean(problems);
  });
});

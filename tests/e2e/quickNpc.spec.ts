import { expect, test, type Page } from '@playwright/test';
import { collectPageProblems, touchDown, touchTap, touchUp, waitForBtState, type PageProblems } from './helpers';

/*
 * Plan 02-08 (D-02, D-01): +/− keys and HUD "− N +" pill add or remove coworkers in play
 * without opening settings, bound 0..min(15, roster.present), and save the count.
 */

type Vec3 = [number, number, number];
type Npc = { id: string; pos: Vec3 };
type Roster = { count: number; max: number; source: string; savePending?: boolean };
type Ragdolls = { bodies: number };
type Bt = {
  player?: { pos: Vec3 };
  roster?: Roster;
  npcs?: Npc[];
  ragdolls?: Ragdolls;
  state?: string;
  swing?: { count: number };
};

function bt<K extends keyof Bt>(page: Page, key: K): Promise<Bt[K]> {
  return page.evaluate((k) => (window as unknown as { __bt: Bt }).__bt[k as keyof Bt], key) as Promise<Bt[K]>;
}

async function startPlaying(page: Page, baseURL: string, url: string): Promise<PageProblems> {
  const problems = collectPageProblems(page, baseURL);
  await page.goto(url);
  await waitForBtState(page, 'playing', 60_000);
  await page.waitForFunction(
    () => {
      const b = (window as unknown as { __bt: Bt }).__bt;
      return !!b.player && !!b.roster && !!b.npcs && typeof b.state === 'string';
    },
    undefined,
    { timeout: 10_000 },
  );
  return problems;
}

function expectClean(problems: PageProblems): void {
  expect(problems.errors).toEqual([]);
  expect(problems.offOrigin).toEqual([]);
}

test.describe('quickNpc', () => {
  test.describe('desktop', () => {
    test.beforeEach(({}, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'desktop quickNpc tests run in the desktop project');
    });

    test('keys add and remove coworkers in play', async ({ page, baseURL }) => {
      const problems = await startPlaying(page, baseURL!, './?autoplay=1');
      const r1 = (await bt(page, 'roster'))!;
      expect(r1.count).toBe(3);

      await page.keyboard.press('Equal');
      await page.waitForTimeout(100);
      const r2 = (await bt(page, 'roster'))!;
      expect(r2.count).toBe(4);
      expect(r2.source).toBe('quick');

      await page.keyboard.press('NumpadAdd');
      await page.waitForTimeout(100);
      const r3 = (await bt(page, 'roster'))!;
      expect(r3.count).toBe(5);

      await page.keyboard.press('Minus');
      await page.waitForTimeout(100);
      const r4 = (await bt(page, 'roster'))!;
      expect(r4.count).toBe(4);

      await page.keyboard.press('NumpadSubtract');
      await page.waitForTimeout(100);
      const r5 = (await bt(page, 'roster'))!;
      expect(r5.count).toBe(3);

      expectClean(problems);
    });

    test('bounds and pool', async ({ page, baseURL }) => {
      const problems = await startPlaying(page, baseURL!, './?autoplay=1');
      const start = (await bt(page, 'ragdolls'))!.bodies;

      // Press Equal 20 times with 40 ms apart to hit the cap
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press('Equal');
        await page.waitForTimeout(40);
      }
      const r15 = (await bt(page, 'roster'))!;
      expect(r15.count).toBe(15);
      const bodies15 = (await bt(page, 'ragdolls'))!.bodies;
      expect(bodies15).toBe(90); // 15 NPCs × 6 bodies per NPC

      // Press Minus 20 times to drop to 0
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press('Minus');
        await page.waitForTimeout(40);
      }
      const r0 = (await bt(page, 'roster'))!;
      expect(r0.count).toBe(0);
      const bodies0 = (await bt(page, 'ragdolls'))!.bodies;
      expect(bodies0).toBe(90); // Pool stays same size

      expectClean(problems);
    });

    test('saved and restored', async ({ page, baseURL }) => {
      const problems = await startPlaying(page, baseURL!, './?autoplay=1');

      // Add 2 more (start at 3, go to 5)
      await page.keyboard.press('Equal');
      await page.keyboard.press('Equal');
      await page.waitForTimeout(100);

      // Wait 800 ms for the debounce to flush
      await page.waitForTimeout(800);

      const stored = await page.evaluate(() => {
        const raw = localStorage.getItem('bt.roster');
        return raw ? JSON.parse(raw) : null;
      });
      expect(stored).not.toBeNull();
      expect(stored.count).toBe(5);

      const rSave = (await bt(page, 'roster'))!;
      expect(rSave.savePending).toBe(false);

      const storageNpcs = await page.evaluate(() => localStorage.getItem('bt.npcs'));
      expect(storageNpcs).toBeNull();

      // Reload and check the count persists
      await page.goto('./?autoplay=1');
      await waitForBtState(page, 'playing', 60_000);
      const rReload = (await bt(page, 'roster'))!;
      expect(rReload.count).toBe(5);
      expect(rReload.source).toBe('stored');

      expectClean(problems);
    });

    test("newcomer spawns away from the player", async ({ page, baseURL }) => {
      const problems = await startPlaying(page, baseURL!, './?autoplay=1');

      const playerPos = (await bt(page, 'player'))!.pos;
      const beforeNpcs = (await bt(page, 'npcs'))!;

      // Press Equal to add one
      await page.keyboard.press('Equal');
      await page.waitForTimeout(100);

      const afterNpcs = (await bt(page, 'npcs'))!;
      expect(afterNpcs.length).toBe(beforeNpcs.length + 1);

      const newNpc = afterNpcs[afterNpcs.length - 1];
      const dx = newNpc.pos[0] - playerPos[0];
      const dz = newNpc.pos[2] - playerPos[2];
      const distance = Math.sqrt(dx * dx + dz * dz);

      expect(distance).toBeGreaterThanOrEqual(1.0);

      expectClean(problems);
    });

    test('guards: Ctrl+Equal/Minus do not change count', async ({ page, baseURL }) => {
      const problems = await startPlaying(page, baseURL!, './?autoplay=1');

      const r1 = (await bt(page, 'roster'))!.count;

      const defaultPrevented: boolean[] = [];
      await page.evaluateHandle(() => {
        (window as unknown as { captureDpEvents?: (a: boolean[]) => void }).captureDpEvents = (arr) => {
          window.addEventListener('keydown', (e) => {
            if (e.code === 'Equal' || e.code === 'Minus') {
              arr.push(e.defaultPrevented);
            }
          });
        };
      });
      await page.evaluate((arr) => (window as unknown as { captureDpEvents?: (a: boolean[]) => void }).captureDpEvents?.(arr), defaultPrevented);

      await page.keyboard.press('Control+Equal');
      await page.keyboard.press('Control+Minus');
      await page.waitForTimeout(100);

      const r2 = (await bt(page, 'roster'))!.count;
      expect(r2).toBe(r1);
      expect(defaultPrevented).not.toContain(true);

      expectClean(problems);
    });

    test('guards: repeating keys do not change count', async ({ page, baseURL }) => {
      const problems = await startPlaying(page, baseURL!, './?autoplay=1');

      const r1 = (await bt(page, 'roster'))!.count;

      await page.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Equal', repeat: true }));
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Minus', repeat: true }));
      });
      await page.waitForTimeout(100);

      const r2 = (await bt(page, 'roster'))!.count;
      expect(r2).toBe(r1);

      expectClean(problems);
    });

    test('guards: typing into a focused input does not change count', async ({ page, baseURL }) => {
      const problems = await startPlaying(page, baseURL!, './?autoplay=1');

      const r1 = (await bt(page, 'roster'))!.count;

      await page.evaluate(() => {
        const input = document.createElement('input');
        input.type = 'text';
        document.body.appendChild(input);
        input.focus();
        input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Equal', bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Minus', bubbles: true }));
      });
      await page.waitForTimeout(100);

      const r2 = (await bt(page, 'roster'))!.count;
      expect(r2).toBe(r1);

      const inputValue = await page.evaluate(() => {
        const input = document.querySelector('input') as HTMLInputElement | null;
        return input ? input.value : '';
      });
      // The input may or may not capture the keys; we just verify the roster count didn't change
      expect(r2).toBe(r1);

      expectClean(problems);
    });

    test('guards: keys pressed while pause menu is open change nothing', async ({ page, baseURL }) => {
      const problems = await startPlaying(page, baseURL!, './?autoplay=1');

      const r1 = (await bt(page, 'roster'))!.count;

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await expect(page.locator('#pause-menu')).toBeVisible();

      await page.keyboard.press('Equal');
      await page.keyboard.press('Equal');
      await page.waitForTimeout(100);

      const r2 = (await bt(page, 'roster'))!.count;
      expect(r2).toBe(r1);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);

      expectClean(problems);
    });

    test('pill clicks never swing and respect bounds', async ({ page, baseURL }) => {
      const problems = await startPlaying(page, baseURL!, './?autoplay=1');

      const pill = page.locator('#npc-pill');
      await expect(pill).toBeVisible();

      const value = page.locator('#npc-pill-value');
      const dec = page.locator('#npc-pill-dec');
      const inc = page.locator('#npc-pill-inc');

      const initText = (await value.textContent())!;
      expect(initText).toBe('3');

      // Click inc
      await inc.click();
      await page.waitForTimeout(100);
      expect(await value.textContent()).toBe('4');

      // Click dec
      await dec.click();
      await page.waitForTimeout(100);
      expect(await value.textContent()).toBe('3');

      // Verify swing count stays 0
      const swingCount = await page.evaluate(() => (window as unknown as { __bt: { swing?: { count: number } } }).__bt.swing?.count ?? 0);
      expect(swingCount).toBe(0);

      // Fill to 15 and check inc is disabled
      for (let i = 0; i < 12; i++) {
        await inc.click();
        await page.waitForTimeout(50);
      }
      expect(await value.textContent()).toBe('15');
      expect(await inc.getAttribute('disabled')).not.toBeNull();

      // Drop to 0 and check dec is disabled
      for (let i = 0; i < 15; i++) {
        await dec.click();
        await page.waitForTimeout(50);
      }
      expect(await value.textContent()).toBe('0');
      expect(await dec.getAttribute('disabled')).not.toBeNull();

      expectClean(problems);
    });

    test('bench hides the pill and ignores keys', async ({ page, baseURL }) => {
      const problems = await startPlaying(page, baseURL!, './?bench=1&dur=5&autoplay=1');

      const pill = page.locator('#npc-pill');
      await expect(pill).toBeHidden();

      const r1 = (await bt(page, 'npcs'))!.length;
      expect(r1).toBe(10);

      // Try pressing Equal
      await page.keyboard.press('Equal');
      await page.waitForTimeout(100);

      const r2 = (await bt(page, 'npcs'))!.length;
      expect(r2).toBe(10);

      expectClean(problems);
    });
  });

  test.describe('mobile-emu', () => {
    test.beforeEach(({}, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-emu', 'mobile-emu quickNpc tests run in the mobile-emu project');
    });

    test('pill taps work next to the joystick and do not move the player', async ({ page, baseURL }) => {
      const problems = await startPlaying(page, baseURL!, './?autoplay=1');

      const pill = page.locator('#npc-pill');
      await expect(pill).toBeVisible();

      const inc = page.locator('#npc-pill-inc');
      const bbox = (await inc.boundingBox())!;
      const centerX = bbox.x + bbox.width / 2;
      const centerY = bbox.y + bbox.height / 2;

      const playerPosBefore = (await bt(page, 'player'))!.pos;

      // Tap inc twice
      await touchTap(page, centerX, centerY);
      await page.waitForTimeout(100);
      await touchTap(page, centerX, centerY);
      await page.waitForTimeout(100);

      const r = (await bt(page, 'roster'))!;
      expect(r.count).toBe(5);

      const playerPosAfter = (await bt(page, 'player'))!.pos;
      const dx = playerPosAfter[0] - playerPosBefore[0];
      const dz = playerPosAfter[2] - playerPosBefore[2];
      const moved = Math.sqrt(dx * dx + dz * dz);
      expect(moved).toBeLessThan(0.05);

      expectClean(problems);
    });
  });
});

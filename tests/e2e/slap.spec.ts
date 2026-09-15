import { expect, test, type Page } from '@playwright/test';
import { collectPageProblems, touchTap, waitForBtState, type PageProblems } from './helpers';

/* Plan 01-15: slap an NPC -> 60 ms hit-stop, light shake, punch SFX, 6-part ragdoll, get up, walk on (D-12, D-15, D-18, D-20). */

type Vec3 = [number, number, number];
type Screen = { x: number; y: number };
type NpcMode = 'walk' | 'dwell' | 'ragdoll' | 'recover';
type Bt = {
  npcs?: Array<{ id: string; pos: Vec3; mode: NpcMode }>;
  highlight?: { id: string | null; kind: string | null; icon: string; screen: Screen | null };
  slap?: { count: number };
  hitStop?: { count: number; active: boolean };
  ragdolls?: { active: number };
  camera?: { shakeActive: boolean };
  audio?: { requests: number; requested: string[] };
};

/** NPC 0 is pinned 1.35 m ahead-right of the player spawn (0, 2), inside the 1.6 m / 140 deg pick cone. */
const URL = './?autoplay=1&npcs=1&npcAt=0.9,1.0';

function bt<K extends keyof Bt>(page: Page, key: K): Promise<Bt[K]> {
  return page.evaluate((k) => (window as unknown as { __bt: Bt }).__bt[k as keyof Bt], key) as Promise<Bt[K]>;
}

async function startPlaying(page: Page, baseURL: string): Promise<PageProblems> {
  const problems = collectPageProblems(page, baseURL);
  await page.goto(URL);
  await waitForBtState(page, 'playing', 60_000);
  await page.waitForFunction(
    () => {
      const b = (window as unknown as { __bt: Bt }).__bt;
      return !!b.npcs && !!b.highlight && !!b.slap && !!b.hitStop && !!b.ragdolls && !!b.camera;
    },
    undefined,
    { timeout: 10_000, polling: 100 },
  );
  // The NPC target glows once the player capsule has settled on the floor.
  await page.waitForFunction(
    () => (window as unknown as { __bt: Bt }).__bt.highlight?.kind === 'npc',
    undefined,
    { timeout: 5000, polling: 50 },
  );
  return problems;
}

function expectClean(problems: PageProblems): void {
  expect(problems.errors).toEqual([]);
  expect(problems.offOrigin).toEqual([]);
}

/** Watch __bt.camera.shakeActive on every animation frame, so a 180 ms shake cannot slip between two polls. */
async function watchShake(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __bt: Bt; __sawShake?: boolean };
    w.__sawShake = false;
    const tick = () => {
      if (w.__bt.camera?.shakeActive) w.__sawShake = true;
      if (!w.__sawShake) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function waitSlapCount(page: Page, n: number, timeout: number): Promise<void> {
  await page.waitForFunction((want) => (window as unknown as { __bt: Bt }).__bt.slap?.count === want, n, {
    timeout,
    polling: 16,
  });
}

test.describe('slap desktop', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop slap tests run in the desktop project only');
  });

  test('E slaps: hit-stop, shake, punch SFX, ragdoll flies, gets up and walks on', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);

    const h = await bt(page, 'highlight');
    expect(h!.kind).toBe('npc');
    expect(h!.icon).toBe('slap');
    expect(h!.id).toBe('npc-0');

    const before = (await bt(page, 'npcs'))![0];
    expect(before.mode === 'walk' || before.mode === 'dwell').toBe(true);
    expect((await bt(page, 'slap'))!.count).toBe(0);
    expect((await bt(page, 'hitStop'))!.count).toBe(0);
    expect((await bt(page, 'ragdolls'))!.active).toBe(0);

    await watchShake(page);
    await page.keyboard.press('KeyE');
    await waitSlapCount(page, 1, 300);
    expect((await bt(page, 'hitStop'))!.count).toBe(1);
    expect((await bt(page, 'npcs'))![0].mode).toBe('ragdoll');
    expect((await bt(page, 'ragdolls'))!.active).toBe(1);
    await page.waitForFunction(() => (window as unknown as { __sawShake?: boolean }).__sawShake === true, undefined, {
      timeout: 1000,
      polling: 16,
    });

    // The NPC flies: its torso travels at least 2 m horizontally within 1.5 s (D-12 exaggerated slapstick).
    await page.waitForFunction(
      (start) => {
        const n = (window as unknown as { __bt: Bt }).__bt.npcs?.[0];
        return !!n && Math.hypot(n.pos[0] - start[0], n.pos[2] - start[2]) >= 2.0;
      },
      before.pos,
      { timeout: 1500, polling: 16 },
    );

    // The punch request went through playSfx with a slap-* variant (audio stays locked under autoplay).
    const audio = await bt(page, 'audio');
    expect(audio!.requested.some((name) => name.startsWith('slap-'))).toBe(true);

    // Gets up and resumes its route.
    await page.waitForFunction(
      () => {
        const b = (window as unknown as { __bt: Bt }).__bt;
        const mode = b.npcs?.[0]?.mode;
        return (mode === 'walk' || mode === 'dwell') && b.ragdolls?.active === 0;
      },
      undefined,
      { timeout: 7000, polling: 50 },
    );
    const after = (await bt(page, 'npcs'))![0];
    for (const v of after.pos) expect(Number.isFinite(v)).toBe(true);
    expect(Math.abs(after.pos[0])).toBeLessThan(8);
    expect(Math.abs(after.pos[2])).toBeLessThan(6);
    expect((await bt(page, 'slap'))!.count).toBe(1);

    expectClean(problems);
  });

  test('left-click on the highlighted NPC slaps it', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    const h = await bt(page, 'highlight');
    expect(h!.kind).toBe('npc');
    expect(h!.screen).not.toBeNull();
    await page.mouse.click(h!.screen!.x, h!.screen!.y);
    await waitSlapCount(page, 1, 1000);
    expect((await bt(page, 'npcs'))![0].mode).toBe('ragdoll');
    expectClean(problems);
  });
});

test.describe('slap touch', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-emu', 'touch slap test runs in the mobile-emu project only');
  });

  test('context button slaps the NPC', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);
    await expect(page.locator('#btn-context')).toBeVisible();
    const box = await page.locator('#btn-context').boundingBox();
    await touchTap(page, box!.x + box!.width / 2, box!.y + box!.height / 2, 1);
    await waitSlapCount(page, 1, 1000);
    expect((await bt(page, 'npcs'))![0].mode).toBe('ragdoll');
    expectClean(problems);
  });
});

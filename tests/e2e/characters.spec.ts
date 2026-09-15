import { expect, test, type Page } from '@playwright/test';
import { collectPageProblems, waitForBtState, type PageProblems } from './helpers';

/*
 * Plan 01-23: every Blocky character is ONE rigid SkinnedMesh (RESEARCH A6, CONTEXT "Hệ quả hiệu năng"), so ten
 * coworkers fit the bench budget of <= 120 draw calls and <= 200 bodies (RESEARCH Performance budget, D-11 revised,
 * D-29). The MEASURE lines are copied into 01-23-SUMMARY.md.
 */

type Vec3 = [number, number, number];
type SkinEntry = { letter: string; centre: Vec3; height: number };
type Hud = { drawCalls: number; peakDrawCalls: number; bodies: number; peakBodies: number };
type Bt = {
  characters?: { texturesLoaded: number; skinnedMeshes: number; drawsPerCharacter: number; skin: SkinEntry[] };
  hud?: Hud;
  npcs?: Array<{ id: string; pos: Vec3; mode: string; texture: string }>;
  player?: { pos: Vec3 };
  ragdolls?: { active: number };
  highlight?: { kind: string | null };
  debris?: { broken: number };
};

/** Budget from RESEARCH "Performance budget" (bench scene). */
const MAX_DRAW_CALLS = 120;
const MAX_BODIES = 200;

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
      return !!b.characters && !!b.hud && !!b.npcs && !!b.player && !!b.ragdolls && !!b.debris;
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

function xzDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function measure(label: string, hud: Hud): void {
  console.log(
    `MEASURE ${label} drawCalls=${hud.drawCalls} peakDrawCalls=${hud.peakDrawCalls} bodies=${hud.bodies} peakBodies=${hud.peakBodies}`,
  );
}

async function waitBroken(page: Page, n: number): Promise<void> {
  await page.waitForFunction((want) => ((window as unknown as { __bt: Bt }).__bt.debris?.broken ?? 0) >= want, n, {
    timeout: 10_000,
    polling: 50,
  });
}

test.describe('characters desktop', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'character budget tests run in the desktop project only');
  });

  test('3 NPCs render one draw per character', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!, './?autoplay=1');
    await page.waitForTimeout(1500);

    const chars = (await bt(page, 'characters'))!;
    expect(chars.skinnedMeshes).toBe(4); // player + 3 NPCs
    expect(chars.drawsPerCharacter).toBe(1);
    const hud = (await bt(page, 'hud'))!;
    measure('npcs=3', hud);
    // 01-14..01-16 measured 104 before the merge (4 characters x 6 draws).
    expect(hud.drawCalls).toBeLessThanOrEqual(90);
    expectClean(problems);
  });

  test('skin follows walking and ragdoll parts', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!, './?autoplay=1&npcs=1&npcAt=0.9,1.0');
    await page.waitForFunction(
      () => (window as unknown as { __bt: Bt }).__bt.highlight?.kind === 'npc',
      undefined,
      { timeout: 5000, polling: 50 },
    );

    const skin = (await bt(page, 'characters'))!.skin;
    const player = (await bt(page, 'player'))!;
    const npc = (await bt(page, 'npcs'))![0];
    const a = skin.find((s) => s.letter === 'a');
    const b = skin.find((s) => s.letter === 'b');
    expect(a, 'skin entry for the player').toBeTruthy();
    expect(b, 'skin entry for NPC 0').toBeTruthy();
    expect(xzDistance(a!.centre, player.pos), `player skin ${a!.centre} vs ${player.pos}`).toBeLessThan(0.6);
    expect(a!.height).toBeGreaterThanOrEqual(1.2);
    expect(a!.height).toBeLessThanOrEqual(1.8);
    expect(xzDistance(b!.centre, npc.pos), `npc skin ${b!.centre} vs ${npc.pos}`).toBeLessThan(0.6);

    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => (window as unknown as { __bt: Bt }).__bt.ragdolls?.active === 1, undefined, {
      timeout: 5000,
      polling: 16,
    });
    await page.waitForTimeout(400);

    // Read both in one evaluate so the flying torso cannot move between the two reads.
    const [flying, torso] = await page.evaluate(() => {
      const w = (window as unknown as { __bt: Bt }).__bt;
      return [w.characters!.skin.find((s) => s.letter === 'b')!, w.npcs![0]] as const;
    });
    expect(torso.mode).toBe('ragdoll');
    expect(xzDistance(flying.centre, torso.pos), `ragdoll skin ${flying.centre} vs torso ${torso.pos}`).toBeLessThan(1.0);
    expectClean(problems);
  });

  test('10 NPCs smash within the bench budget', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!, './?autoplay=1&npcs=10&scenario=smash');

    const list = (await bt(page, 'npcs'))!;
    expect(list.length).toBe(10);
    expect(new Set(list.map((n) => n.texture)).size).toBe(10);
    expect(list.map((n) => n.texture)).not.toContain('a');

    await waitBroken(page, 10);
    await page.waitForTimeout(1500);

    const hud = (await bt(page, 'hud'))!;
    measure('npcs=10', hud);
    expect(hud.peakDrawCalls).toBeLessThanOrEqual(MAX_DRAW_CALLS);
    expect(hud.peakBodies).toBeLessThanOrEqual(MAX_BODIES);
    expect((await bt(page, 'characters'))!.skinnedMeshes).toBe(11);
    expectClean(problems);
  });

  // Operator ask for 01-23: the SUMMARY reports idle AND smash-peak numbers at both 3 and 10 NPCs; the two tests
  // above give 3 idle and 10 smash, this one adds 10 idle and 3 smash under the same budget.
  test('budget measured idle with ten coworkers and at the smash peak with three', async ({ page, baseURL }) => {
    const problems10 = await startPlaying(page, baseURL!, './?autoplay=1&npcs=10');
    await page.waitForTimeout(1500);
    const idle10 = (await bt(page, 'hud'))!;
    measure('npcs=10 idle', idle10);
    expect((await bt(page, 'characters'))!.skinnedMeshes).toBe(11);
    expect(idle10.peakDrawCalls).toBeLessThanOrEqual(MAX_DRAW_CALLS);
    expect(idle10.peakBodies).toBeLessThanOrEqual(MAX_BODIES);
    expectClean(problems10);

    const problems3 = await startPlaying(page, baseURL!, './?autoplay=1&scenario=smash');
    await waitBroken(page, 10);
    await page.waitForTimeout(1500);
    const smash3 = (await bt(page, 'hud'))!;
    measure('npcs=3 smash', smash3);
    expect(smash3.peakDrawCalls).toBeLessThanOrEqual(MAX_DRAW_CALLS);
    expect(smash3.peakBodies).toBeLessThanOrEqual(MAX_BODIES);
    expectClean(problems3);
  });
});

import { expect, test, type Page } from '@playwright/test';
import { collectPageProblems, waitForBtState, type PageProblems } from './helpers';

/* Plan 01-14: Blocky player + NPCs walking hand-placed desk <-> pantry routes (D-09, D-11, D-14). */

type Vec3 = [number, number, number];
type NpcItem = { id: string; pos: Vec3; mode: 'walk' | 'dwell'; texture: string };
type Bt = {
  npcs?: NpcItem[];
  characters?: { texturesLoaded: number };
  props?: { dynamicCount: number };
  shadows?: { count: number };
};

/** layout.ts ROOM is 16 x 12 m centred on the origin. */
const ROOM_HALF_X = 8;
const ROOM_HALF_Z = 6;

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
      return !!b.npcs && !!b.characters && !!b.props && !!b.shadows;
    },
    undefined,
    { timeout: 10_000, polling: 100 },
  );
  return problems;
}

async function npcs(page: Page): Promise<NpcItem[]> {
  const list = await bt(page, 'npcs');
  if (!list) throw new Error('__bt.npcs missing');
  return list;
}

function expectInsideRoom(list: NpcItem[]): void {
  for (const n of list) {
    for (const v of n.pos) expect(Number.isFinite(v), `${n.id} pos ${n.pos.join(',')}`).toBe(true);
    expect(Math.abs(n.pos[0]), `${n.id} x`).toBeLessThan(ROOM_HALF_X);
    expect(Math.abs(n.pos[2]), `${n.id} z`).toBeLessThan(ROOM_HALF_Z);
  }
}

function expectClean(problems: PageProblems): void {
  expect(problems.errors).toEqual([]);
  expect(problems.offOrigin).toEqual([]);
}

test.describe('npc desktop', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'NPC tests run in the desktop project only');
  });

  test('three NPCs walk their routes', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!);

    const first = await npcs(page);
    expect(first.length).toBe(3);
    expect(new Set(first.map((n) => n.id)).size).toBe(3);
    // The player keeps texture 'a'; NPCs take b, c, d.
    expect(first.map((n) => n.texture)).toEqual(['b', 'c', 'd']);
    expectInsideRoom(first);

    const texturesLoaded = (await bt(page, 'characters'))!.texturesLoaded;
    // Player + 3 NPCs + preloaded next quick-add look (RESEARCH Pitfall 10, plan 02-07)
    expect(texturesLoaded).toBeGreaterThanOrEqual(1);
    expect(texturesLoaded).toBeLessThanOrEqual(5);

    // Blob shadows for every dynamic prop, the player and each NPC (D-14).
    const dynamicCount = (await bt(page, 'props'))!.dynamicCount;
    expect((await bt(page, 'shadows'))!.count).toBeGreaterThanOrEqual(dynamicCount + 4);

    // Watch for 4 s: every NPC either travels >= 1 m or is seen dwelling and then walking again.
    const travelled = first.map(() => 0);
    const last = first.map((n) => n.pos);
    const sawDwell = first.map((n) => n.mode === 'dwell');
    const dwellThenWalk = first.map(() => false);
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      await page.waitForTimeout(50);
      const now = await npcs(page);
      expect(now.length).toBe(3);
      expectInsideRoom(now);
      now.forEach((n, i) => {
        travelled[i] += Math.hypot(n.pos[0] - last[i][0], n.pos[2] - last[i][2]);
        last[i] = n.pos;
        if (n.mode === 'dwell') sawDwell[i] = true;
        else if (sawDwell[i]) dwellThenWalk[i] = true;
      });
      if (travelled.every((d, i) => d >= 1.0 || dwellThenWalk[i])) break;
    }
    first.forEach((n, i) => {
      expect(travelled[i] >= 1.0 || dwellThenWalk[i], `${n.id} travelled ${travelled[i].toFixed(2)} m`).toBe(true);
    });

    expectClean(problems);
  });

  // D-29 / D-11 revised (plan 01-23): the player can pick up to 10 coworkers and the benchmark measures that ceiling.
  test('npcs=10 spawns ten from the shared character', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!, '&npcs=10');
    const list = await npcs(page);
    expect(list.length).toBe(10);
    expect(new Set(list.map((n) => n.id)).size).toBe(10);
    expect(new Set(list.map((n) => n.texture)).size).toBe(10);
    expect(list.map((n) => n.texture)).not.toContain('a');
    await page.waitForTimeout(1000);
    expectInsideRoom(await npcs(page));

    // Player + 10 NPCs on top of the dynamic props.
    const dynamicCount = (await bt(page, 'props'))!.dynamicCount;
    expect((await bt(page, 'shadows'))!.count).toBeGreaterThanOrEqual(dynamicCount + 11);
    expectClean(problems);
  });

  // D-01 (plan 02-06): the ceiling moved from 10 to 15; the clamp still bounds bodies.
  test('npcs clamps to 0..15', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!, '&npcs=99');
    expect((await npcs(page)).length).toBe(15);
    expectClean(problems);

    const problems0 = await startPlaying(page, baseURL!, '&npcs=0');
    expect((await npcs(page)).length).toBe(0);
    expectClean(problems0);
  });

  // D-01, G3r, D-11: up to 15 NPCs spawn at least 0.5 m apart; bench and soak still use 10.
  test('npcs=15 spawns fifteen apart', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL!, '&autoplay=1&npcs=15');
    const list = await npcs(page);
    expect(list.length).toBe(15);
    expect(new Set(list.map((n) => n.id)).size).toBe(15);
    expect(list.map((n) => n.texture)).toEqual(['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p']);
    expectInsideRoom(list);

    // Every pair that includes an index >= 10 must be >= 0.5 m apart (G3r, waypoints.test.ts validates 0.6 m).
    for (let i = 10; i < 15; i++) {
      for (let j = 0; j < i; j++) {
        const dist = Math.hypot(list[i].pos[0] - list[j].pos[0], list[i].pos[2] - list[j].pos[2]);
        expect(dist, `NPC ${i} to ${j}: ${dist.toFixed(3)} m`).toBeGreaterThanOrEqual(0.5);
      }
    }

    expectClean(problems);
  });
});

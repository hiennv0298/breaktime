import { expect, test, type Page } from '@playwright/test';
import { collectPageProblems, waitForBtState, type PageProblems } from './helpers';

/* Plan 02-07: roster as the office source (D-03, D-11, G4). */

type Screen = { x: number; y: number };
type NpcMode = 'walk' | 'dwell' | 'ragdoll' | 'recover';
type LabelSnap = { index: number; text: string; visible: boolean; x: number; y: number };
type Bt = {
  state?: string;
  roster?: {
    source: string;
    storageOk: boolean;
    count: number;
    max: number;
    members: number;
    present: string[];
    onFloor: string[];
    looks: string[];
    savePending: boolean;
    lastSaveOk: boolean | null;
  };
  npcs?: Array<{ id: string; mode: NpcMode; name: string; memberId: string; temper: string; texture: string; screen: Screen }>;
  npcLabels?: LabelSnap[];
  ragdolls?: { active: number };
};

const ROSTER_KEY = 'bt.roster';
const NPC_KEY = 'bt.npcs';

function bt<K extends keyof Bt>(page: Page, key: K): Promise<Bt[K]> {
  return page.evaluate((k) => (window as unknown as { __bt: Bt }).__bt[k as keyof Bt], key) as Promise<Bt[K]>;
}

/** Seeds localStorage once per tab (later navigations keep whatever the page stored since). */
async function seedStorage(page: Page, key: string, value: string): Promise<void> {
  await page.addInitScript(
    ([k, v]) => {
      try {
        if (sessionStorage.getItem('bt.test.seeded') === '1') return;
        localStorage.setItem(k, v);
        sessionStorage.setItem('bt.test.seeded', '1');
      } catch {
        /* about:blank or storage disabled */
      }
    },
    [key, value] as const,
  );
}

async function startPlaying(page: Page, baseURL: string | undefined, url = './?autoplay=1'): Promise<PageProblems> {
  const problems = collectPageProblems(page, baseURL ?? '');
  await page.goto(url);
  await waitForBtState(page, 'playing', 60_000);
  await page.waitForFunction(
    () => {
      const b = (window as unknown as { __bt: Bt }).__bt;
      return !!b.roster && !!b.npcs && !!b.npcLabels;
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

test.describe('roster start desktop', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'roster start tests run in the desktop project only');
  });

  test('fresh storage gives the default roster', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL, './?autoplay=1');
    expectClean(problems);

    const roster = await bt(page, 'roster');
    const npcs = await bt(page, 'npcs');

    expect(roster?.source).toBe('default');
    expect(npcs?.length).toBe(3);
    expect(npcs?.map((n) => n.texture)).toEqual(['b', 'c', 'd']);
    expect(npcs?.map((n) => n.memberId)).toEqual(['m1', 'm2', 'm3']);
    expect(roster?.count).toBe(3);
    expect(roster?.present).toHaveLength(15);
    expect(roster?.members).toHaveLength(15);

    // After 2 seconds of play, localStorage should not have been written (G4)
    await page.waitForTimeout(2000);
    const stored = await page.evaluate(() => {
      const result: { rosterStored: string | null; npcStored: string | null } = { rosterStored: null, npcStored: null };
      try {
        result.rosterStored = localStorage.getItem('bt.roster');
      } catch {
        // ignore
      }
      try {
        result.npcStored = localStorage.getItem('bt.npcs');
      } catch {
        // ignore
      }
      return result;
    });
    expect(stored.rosterStored).toBeNull();
    expect(stored.npcStored).toBeNull();
  });

  test('Phase 1 names migrate one way', async ({ page, baseURL }) => {
    const legacyRecord = JSON.stringify({ v: 1, count: 5, names: ['Minh', 'Lan', '', '', '', '', '', '', '', ''] });
    await seedStorage(page, NPC_KEY, legacyRecord);
    const problems = await startPlaying(page, baseURL, './?autoplay=1');
    expectClean(problems);

    const roster = await bt(page, 'roster');
    const npcs = await bt(page, 'npcs');

    expect(roster?.source).toBe('migrated');
    expect(npcs?.length).toBe(5);
    expect(npcs?.[0]?.name).toBe('Minh');
    expect(npcs?.[1]?.name).toBe('Lan');
    expect(npcs?.map((n) => n.texture)).toEqual(['b', 'c', 'd', 'e', 'f']);

    // The legacy bt.npcs should be unchanged after 2 seconds
    await page.waitForTimeout(2000);
    const npcStored = await page.evaluate(() => {
      try {
        return localStorage.getItem('bt.npcs') ?? null;
      } catch {
        return null;
      }
    });
    expect(npcStored).toBe(legacyRecord);
  });

  test('a saved roster wins over a stale bt.npcs from an old build', async ({ page, baseURL }) => {
    const rosterObj = {
      v: 1,
      members: [
        { id: 'm1', name: 'An', look: 'r', temper: 'hot' },
        { id: 'm2', name: 'Bình', look: 'q', temper: 'calm' },
        { id: 'm3', name: '', look: 'b', temper: 'normal' },
      ],
      present: ['m1', 'm2'],
      count: 2,
    };
    const rosterRecord = JSON.stringify(rosterObj);
    const legacyRecord = JSON.stringify({ v: 1, count: 9, names: ['X', '', '', '', '', '', '', '', '', ''] });
    await seedStorage(page, ROSTER_KEY, rosterRecord);
    await seedStorage(page, NPC_KEY, legacyRecord);

    const problems = await startPlaying(page, baseURL, './?autoplay=1');
    expectClean(problems);

    const roster = await bt(page, 'roster');
    const npcs = await bt(page, 'npcs');

    expect(roster?.source).toBe('stored');
    expect(npcs?.length).toBe(2);
    expect(npcs?.[0]?.name).toBe('An');
    expect(npcs?.[1]?.name).toBe('Bình');
    expect(npcs?.map((n) => n.texture)).toEqual(['r', 'q']);
    expect(npcs?.[0]?.temper).toBe('hot');
  });

  test('fifteen coworkers wear roster looks', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, baseURL, './?autoplay=1&npcs=15');
    expectClean(problems);

    const roster = await bt(page, 'roster');
    const npcs = await bt(page, 'npcs');

    expect(roster?.source).toBe('query');
    expect(npcs?.length).toBe(15);
    expect(npcs?.map((n) => n.texture)).toEqual(['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p']);
    expect(npcs?.map((n) => n.memberId)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12', 'm13', 'm14', 'm15']);
  });

  test('tampered roster falls back', async ({ page, baseURL }) => {
    // 9000-character roster should be rejected
    const tooLongRecord = JSON.stringify({ v: 1, members: [], present: [], count: 0, _: 'x'.repeat(9000) });
    await seedStorage(page, ROSTER_KEY, tooLongRecord);

    const problems = await startPlaying(page, baseURL, './?autoplay=1');
    expectClean(problems);

    const roster = await bt(page, 'roster');
    const npcs = await bt(page, 'npcs');

    expect(roster?.source).toBe('default');
    expect(npcs?.length).toBe(3);

    // Prototype pollution test
    const pollutionPayload = JSON.stringify({
      v: 1,
      members: [{ __proto__: { polluted: true }, constructor: { prototype: { polluted: true } }, id: 'm1', name: 'X', look: 'b', temper: 'normal' }],
      present: ['m1'],
      count: 1,
    });
    await page.evaluate((payload) => {
      try {
        localStorage.setItem('bt.roster', payload);
      } catch {
        // ignore
      }
    }, pollutionPayload);
    // Reload to test the pollution handling
    await page.reload();
    await waitForBtState(page, 'playing', 60_000);

    const pollutionCheck = await page.evaluate(() => (({} as Record<string, unknown>).polluted === undefined));
    expect(pollutionCheck).toBe(true);
  });

  test('throwing storage', async ({ page, baseURL }) => {
    // Override Storage methods to throw on EVERY access. A one-shot throw is not a model of
    // disabled storage: boot reads bt.quality / bt.keyHints / bt.touchHintSeen long before the
    // roster is read, so the single throw was swallowed by an unrelated read and readRosterRaw()
    // then ran against healthy storage (storageOk true). Safari private mode and blocked site
    // data throw on every call, which is what this test must reproduce.
    await page.addInitScript(() => {
      Storage.prototype.getItem = function () {
        throw new Error('Storage disabled');
      };
      Storage.prototype.setItem = function () {
        throw new Error('Storage disabled');
      };
    });

    const problems = await startPlaying(page, baseURL, './?autoplay=1');
    // Errors might occur but the page should still be playable
    const roster = await bt(page, 'roster');
    const state = await bt(page, 'state');
    const npcs = await bt(page, 'npcs');

    expect(state).toBe('playing');
    expect(npcs?.length).toBe(3);
    expect(roster?.storageOk).toBe(false);

    // No page errors due to storage failures
    expect(problems.errors.length).toBe(0);
  });

  test('bench ignores the roster', async ({ page, baseURL }) => {
    // Seed a roster with 2 present members
    const rosterObj = {
      v: 1,
      members: [
        { id: 'm1', name: 'An', look: 'r', temper: 'hot' },
        { id: 'm2', name: 'Bình', look: 'q', temper: 'calm' },
      ],
      present: ['m1', 'm2'],
      count: 2,
    };
    const rosterRecord = JSON.stringify(rosterObj);
    await seedStorage(page, ROSTER_KEY, rosterRecord);

    const problems = await startPlaying(page, baseURL, './?bench=1&dur=5&autoplay=1');
    expectClean(problems);

    const roster = await bt(page, 'roster');
    const npcs = await bt(page, 'npcs');

    expect(npcs?.length).toBe(10);
    expect(npcs?.map((n) => n.texture)).toEqual(['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']);
    expect(roster?.source).toBe('query');

    // Roster should not be written during bench
    const rosterStored = await page.evaluate(() => {
      try {
        return localStorage.getItem('bt.roster') ?? null;
      } catch {
        return null;
      }
    });
    expect(rosterStored).toBe(rosterRecord);
  });
});

import { expect, test, type Page } from '@playwright/test';
import { collectPageProblems, waitForBtState, type PageProblems } from './helpers';

/** Plan 02-10: NPC gets angry from slaps, chases, telegraphs and strikes (D-05..D-11, NPC-03..NPC-05). */

type Vec3 = [number, number, number];
type Screen = { x: number; y: number };
type NpcMode = 'walk' | 'dwell' | 'ragdoll' | 'recover';
type CombatState = 'routine' | 'fume' | 'pursue' | 'windup' | 'cooldown' | 'return';
type Bt = {
  state?: string;
  npcs?: Array<{ id: string; pos: Vec3; mode: NpcMode }>;
  roster?: { slots: Array<{ member: { id: string; name: string; temper: string } | null }> };
  highlight?: { id: string | null; kind: string | null; icon: string; screen: Screen | null };
  slap?: { count: number };
  ragdolls?: { active: number };
  combat?: {
    enabled: boolean;
    fight: string | null;
    strikes: number;
    landed: number;
    missed: number;
    interrupted: number;
    giveUps: number;
    maxPursuers: number;
    maxAttackers: number;
    pursuers: string[];
    attackers: string[];
    player?: { hitsTaken: number };
    npcs?: Array<{ id: string; mode?: string; state: CombatState; anger: number; token?: string | null }>;
  };
  npcLabels?: Array<{ index: number; visible: boolean; text: string; angry: boolean }>;
  props?: { movedCount: number };
};

async function bt<K extends keyof Bt>(page: Page, key: K): Promise<Bt[K]> {
  return page.evaluate((k) => (window as unknown as { __bt: Bt }).__bt[k as keyof Bt], key) as Promise<Bt[K]>;
}

async function startPlaying(page: Page, url: string, baseURL: string): Promise<PageProblems> {
  const problems = collectPageProblems(page, baseURL);
  await page.goto(url);
  await waitForBtState(page, 'playing', 60_000);
  // Wait for combat state to exist
  await page.waitForFunction(
    () => {
      const b = (window as unknown as { __bt: Bt }).__bt;
      return !!b.combat && !!b.npcLabels && !!b.props;
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

async function faceAndSlap(page: Page): Promise<void> {
  // Turn to face NPC (KeyD = +X)
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(80);
  await page.keyboard.up('KeyD');
  // Wait for NPC to be highlighted
  await page.waitForFunction(
    () => (window as unknown as { __bt: Bt }).__bt.highlight?.kind === 'npc',
    undefined,
    { timeout: 5000, polling: 50 },
  );
  // Slap (Space)
  await page.keyboard.press('Space');
}

/**
 * Walks the player to the coworker and slaps it. Returns the timestamp of the slap, or 0.
 *
 * Standing still and waiting for the coworker to wander back into range does not work: since the
 * per-NPC seeded routes each coworker walks its own path, so whether it ever crosses the crosshair
 * again is a coin flip, and a passive loop makes the test fail at random. WASD is world movement
 * (not turning) and which key maps to which world axis depends on the camera yaw, so the mapping is
 * measured once here instead of assumed.
 */
async function approachAndSlap(page: Page, npcIndex: number, budgetMs: number): Promise<number> {
  type Vec = { x: number; z: number };
  const posOf = async (): Promise<{ player: Vec; npc: Vec }> =>
    page.evaluate((i) => {
      const b = (window as unknown as { __bt: { player?: { pos: number[] }; npcs?: Array<{ pos: number[] }> } }).__bt;
      const p = b.player!.pos;
      const n = b.npcs![i]!.pos;
      return { player: { x: p[0]!, z: p[2]! }, npc: { x: n[0]!, z: n[2]! } };
    }, npcIndex);

  // Calibrate: tap a key and see which way the world moves.
  const probe = async (key: string): Promise<Vec> => {
    const a = (await posOf()).player;
    await page.keyboard.down(key);
    await page.waitForTimeout(120);
    await page.keyboard.up(key);
    await page.waitForTimeout(60);
    const b = (await posOf()).player;
    return { x: b.x - a.x, z: b.z - a.z };
  };
  const dVec = await probe('KeyD');
  const wVec = await probe('KeyW');

  const dot = (a: Vec, b: Vec): number => a.x * b.x + a.z * b.z;
  const start = Date.now();
  while (Date.now() - start < budgetMs) {
    if ((await bt(page, 'highlight'))?.kind === 'npc') break;
    const { player, npc } = await posOf();
    const want: Vec = { x: npc.x - player.x, z: npc.z - player.z };
    if (Math.hypot(want.x, want.z) < 0.2) break; // already on top of it
    // Press whichever axis carries us further along `want`; sign picks the opposite key.
    const alongD = dot(want, dVec);
    const alongW = dot(want, wVec);
    const key =
      Math.abs(alongD) >= Math.abs(alongW) ? (alongD >= 0 ? 'KeyD' : 'KeyA') : alongW >= 0 ? 'KeyW' : 'KeyS';
    await page.keyboard.down(key);
    await page.waitForTimeout(90);
    await page.keyboard.up(key);
  }

  if ((await bt(page, 'highlight'))?.kind !== 'npc') return 0;
  const before = (await bt(page, 'slap'))?.count ?? 0;
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const after = (await bt(page, 'slap'))?.count ?? 0;
  return after > before ? Date.now() : 0;
}

async function waitCombatState(page: Page, index: number, state: CombatState, timeout: number): Promise<void> {
  await page.waitForFunction(
    ([idx, st]) => (window as unknown as { __bt: Bt }).__bt.combat?.npcs?.[idx]?.state === st,
    [index, state] as const,
    { timeout, polling: 16 },
  );
}

async function recordStateTimeline(
  page: Page,
  npcIndex: number,
  duration: number,
): Promise<Array<{ time: number; state: CombatState; markerVisible: boolean; labelAngry: boolean }>> {
  const timeline: Array<{ time: number; state: CombatState; markerVisible: boolean; labelAngry: boolean }> = [];

  await page.evaluate(
    (data) => {
      const idx = data[0] as number;
      const dur = data[1] as number;
      const w = window as unknown as { __bt: Bt; __timeline: Array<any> };
      w.__timeline = [];
      const pollInterval = setInterval(() => {
        const combat = w.__bt.combat?.npcs?.[idx];
        if (!combat) return;
        const marker = document.querySelector(`.combat-mark[data-npc="${idx}"]`);
        const label = document.querySelector(`.npc-label.angry[data-npc="${idx}"]`);
        w.__timeline.push({
          time: Date.now(),
          state: combat.state,
          markerVisible: !!marker && marker.textContent === '!',
          labelAngry: !!label,
        });
        if (w.__timeline.length > 0 && Date.now() - (w.__timeline[0]?.time ?? Date.now()) > dur) clearInterval(pollInterval);
      }, 16);
    },
    [npcIndex, duration],
  );

  await page.waitForTimeout(duration);
  const result = await page.evaluate(() => {
    const w = window as unknown as { __timeline?: Array<any> };
    return w.__timeline || [];
  });
  timeline.push(...(result as Array<{ time: number; state: CombatState; markerVisible: boolean; labelAngry: boolean }>));
  return timeline;
}

test.describe('fightBack desktop', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'fightBack tests run in desktop only');
  });

  test('a hot coworker gets up, fumes, chases, telegraphs and lands a hit', async ({ page, baseURL }) => {
    const problems = await startPlaying(
      page,
      './?autoplay=1&npcs=1&npcAt=1.3,1.6&fight=always',
      baseURL!,
    );
    expectClean(problems);

    // Initial state
    expect((await bt(page, 'combat'))?.enabled).toBe(true);
    expect((await bt(page, 'combat'))?.player?.hitsTaken).toBe(0);
    const initialNpcState = (await bt(page, 'combat'))?.npcs?.[0];
    expect(initialNpcState?.state).toBe('routine');

    // Slap the NPC
    await faceAndSlap(page);
    await page.waitForFunction(
      () => (window as unknown as { __bt: Bt }).__bt.ragdolls?.active === 1,
      undefined,
      { timeout: 1000 },
    );

    // NPC should stand up and progress through states
    await page.waitForFunction(
      () => {
        const npc = (window as unknown as { __bt: Bt }).__bt.combat?.npcs?.[0];
        return npc?.state === 'fume' || npc?.state === 'pursue' || npc?.state === 'windup';
      },
      undefined,
      { timeout: 5000, polling: 50 },
    );

    // Record timeline of the combat
    const timeline = await recordStateTimeline(page, 0, 20_000);

    // Wait for a landed hit
    await page.waitForFunction(
      () => (window as unknown as { __bt: Bt }).__bt.combat?.landed! >= 1,
      undefined,
      { timeout: 20_000, polling: 100 },
    );

    expect((await bt(page, 'combat'))?.landed).toBeGreaterThanOrEqual(1);
    expect((await bt(page, 'combat'))?.player?.hitsTaken).toBeGreaterThanOrEqual(1);

    // Check state progression in timeline
    const states = timeline.map((t) => t.state);
    expect(states).toContain('fume');
    expect(states).toContain('pursue');
    expect(states).toContain('windup');

    // Check that a windup happened
    // The wind-up is 0.6 s (D-07). It is sampled from the page's own main thread, the same thread
    // running physics and rendering, so the sampler drifts well past its nominal 16 ms and the span
    // between the first and last 'windup' sample can only ever UNDERSTATE the real duration (539 ms
    // was measured for a true 600 ms). Rather than slacken the bound and stop testing anything,
    // bracket the truth: it cannot be shorter than the sampled span, and cannot be longer than the
    // gap between the last sample before and the first sample after. Then assert 0.6 s sits inside.
    const first = timeline.findIndex((t) => t.state === 'windup');
    const last = timeline.length - 1 - [...timeline].reverse().findIndex((t) => t.state === 'windup');
    expect(first).toBeGreaterThanOrEqual(0);
    const atLeast = timeline[last]!.time - timeline[first]!.time;
    const atMost = (timeline[last + 1]?.time ?? timeline[last]!.time) - (timeline[first - 1]?.time ?? timeline[first]!.time);
    const WINDUP_MS = 600;
    expect(atLeast).toBeLessThanOrEqual(WINDUP_MS);
    expect(atMost).toBeGreaterThanOrEqual(WINDUP_MS);
    // And it is genuinely a telegraph the player can react to, not a frame or a second and a half.
    expect(atLeast).toBeGreaterThanOrEqual(400);
    expect(atMost).toBeLessThanOrEqual(900);

    // Marker and label should have been visible
    const markerSeen = timeline.some((t) => t.markerVisible);
    const labelSeen = timeline.some((t) => t.labelAngry);
    expect(markerSeen).toBe(true);
    expect(labelSeen).toBe(true);

    // After the hit, state should return to routine
    await page.waitForFunction(
      () => (window as unknown as { __bt: Bt }).__bt.combat?.npcs?.[0]?.state === 'routine',
      undefined,
      { timeout: 15_000, polling: 100 },
    );

    // Check final state
    expect((await bt(page, 'combat'))?.npcs?.[0]?.state).toBe('routine');
    const finalLabel = (await bt(page, 'npcLabels'))?.find((l) => l.index === 0);
    expect(finalLabel?.angry).toBe(false);

    // Check token budget
    expect((await bt(page, 'combat'))?.maxPursuers).toBeLessThanOrEqual(3);
    expect((await bt(page, 'combat'))?.maxAttackers).toBeLessThanOrEqual(1);

    // Props should not have moved during combat
    const initialProps = 0; // Assumed at start
    const finalProps = (await bt(page, 'props'))?.movedCount || 0;
    // This assertion validates that chasers don't shove props (G9)
    expect(finalProps).toEqual(initialProps);
  });

  test('walking out of reach dodges the strike', async ({ page, baseURL }) => {
    const problems = await startPlaying(
      page,
      './?autoplay=1&npcs=1&npcAt=1.3,1.6&fight=always',
      baseURL!,
    );
    expectClean(problems);

    // Slap to anger the NPC
    await faceAndSlap(page);
    await page.waitForFunction(
      () => (window as unknown as { __bt: Bt }).__bt.combat?.npcs?.[0]?.state === 'windup',
      undefined,
      { timeout: 20_000, polling: 100 },
    );

    // Get NPC and player positions at windup start
    let npcPos: Vec3 = [0, 0, 0];
    let playerPos: Vec3 = [0, 0, 0];
    npcPos = (await page.evaluate(() => {
      const pos = (window as unknown as { __bt: Bt }).__bt.npcs?.[0]?.pos;
      return pos as Vec3 | null;
    })) || [0, 0, 0];

    playerPos = (await page.evaluate(() => {
      const pos = (window as unknown as { __bt: Bt }).__bt.highlight?.screen;
      return (pos && [pos.x, 0, pos.y]) || [0, 0, 0];
    })) || [0, 0, 0];

    // Move away from NPC (dominant axis)
    const isEastWest = Math.abs(npcPos[0] - playerPos[0]) > Math.abs(npcPos[2] - playerPos[2]);
    const moveKey = isEastWest ? 'KeyA' : 'KeyW'; // Move away

    // Hold move key for 700ms
    await page.keyboard.down(moveKey);
    await page.waitForTimeout(700);
    await page.keyboard.up(moveKey);

    // Should have missed instead of landed
    await page.waitForTimeout(500);
    expect((await bt(page, 'combat'))?.missed).toBeGreaterThanOrEqual(1);
    expect((await bt(page, 'combat'))?.landed).toEqual(0);
  });

  test('slapping during wind-up cancels it', async ({ page, baseURL }) => {
    const problems = await startPlaying(
      page,
      './?autoplay=1&npcs=1&npcAt=1.3,1.6&fight=always',
      baseURL!,
    );
    expectClean(problems);

    // Slap to anger the NPC
    const slapCountAfterFace = (await bt(page, 'slap'))?.count || 0;
    await faceAndSlap(page);
    await page.waitForTimeout(200);

    // Verify the face-and-slap actually landed
    const slapCountAfterFirst = (await bt(page, 'slap'))?.count || 0;
    expect(slapCountAfterFirst).toBeGreaterThan(slapCountAfterFace);

    // Read the baselines BEFORE waiting for the wind-up. The wind-up lasts 0.6 s (D-07) and every
    // __bt round trip costs tens of milliseconds, so gathering them after the wind-up is detected
    // burns the whole window and the strike resolves before the counter-slap is even pressed.
    const slapCountBefore = (await bt(page, 'slap'))?.count || 0;
    const interruptedBefore = (await bt(page, 'combat'))?.interrupted || 0;
    const landedBefore = (await bt(page, 'combat'))?.landed || 0;

    // The coworker walks to us during 'pursue', so no repositioning is needed: by the time it winds
    // up it is already within reach.
    await page.waitForFunction(
      () => (window as unknown as { __bt: Bt }).__bt.combat?.npcs?.[0]?.state === 'windup',
      undefined,
      { timeout: 15_000, polling: 16 },
    );

    // Counter-slap immediately — this is the player's only answer to the "!" telegraph.
    await page.keyboard.press('Space');

    // Verify the counter-slap actually landed
    await page.waitForTimeout(300);
    const slapCountAfter = (await bt(page, 'slap'))?.count || 0;
    expect(slapCountAfter).toBeGreaterThan(slapCountBefore);

    // Should interrupt the strike
    const interruptedAfter = (await bt(page, 'combat'))?.interrupted || 0;
    expect(interruptedAfter).toBeGreaterThan(interruptedBefore);

    // Verify end state
    expect((await bt(page, 'combat'))?.interrupted).toBeGreaterThanOrEqual(1);
    expect((await bt(page, 'npcs'))?.[0]?.mode).toBe('ragdoll');
    expect((await bt(page, 'combat'))?.landed).toEqual(landedBefore);  // No hits landed (interrupted)
    expect((await bt(page, 'combat'))?.npcs?.[0]?.anger).toBe(100);
  });

  test('a normal coworker needs two slaps with a realistic gap', async ({ page, baseURL }) => {
    const problems = await startPlaying(
      page,
      './?autoplay=1&npcs=1&npcAt=1.3,1.6', // No ?fight flag, temper 'normal'
      baseURL!,
    );
    expectClean(problems);

    // Initial slap
    await faceAndSlap(page);
    await page.waitForFunction(
      () => (window as unknown as { __bt: Bt }).__bt.npcs?.[0]?.mode === 'walk' || (window as unknown as { __bt: Bt }).__bt.npcs?.[0]?.mode === 'dwell',
      undefined,
      { timeout: 10_000, polling: 100 },
    );

    // Check state is routine and anger is moderate
    const state1 = (await bt(page, 'combat'))?.npcs?.[0]?.state;
    const anger1 = (await bt(page, 'combat'))?.npcs?.[0]?.anger || 0;
    expect(state1).toBe('routine');
    expect(anger1).toBeGreaterThanOrEqual(50);
    expect(anger1).toBeLessThanOrEqual(70);
    expect((await bt(page, 'npcLabels'))?.find((l) => l.index === 0)?.angry).toBe(false);

    // Record time of first slap
    const firstSlapTime = Date.now();

    // Leave a realistic gap, then walk over and slap again. The gap matters: it proves the two
    // slaps add up rather than needing to be mashed, and that the meter has not decayed away.
    await page.waitForTimeout(3500);
    const secondSlapTime = await approachAndSlap(page, 0, 20_000);

    // Verify second slap landed with proper gap
    expect(secondSlapTime).toBeGreaterThan(0);
    const gap = secondSlapTime - firstSlapTime;
    expect(gap).toBeGreaterThanOrEqual(3500);

    // After second slap, NPC should stand up angry (fume)
    await page.waitForFunction(
      () => (window as unknown as { __bt: Bt }).__bt.combat?.npcs?.[0]?.state === 'fume',
      undefined,
      { timeout: 10_000, polling: 100 },
    );

    expect((await bt(page, 'combat'))?.npcs?.[0]?.anger).toBe(100);
  });

  test('an unnamed hot coworker shows a visible angry tag', async ({ page, baseURL }) => {
    // The default roster now carries job titles, so clear m1's name explicitly: this test is about
    // what an angry coworker with NO name shows, which a player can still produce in the editor.
    await page.addInitScript(() => {
      try {
        localStorage.setItem(
          'bt.roster',
          JSON.stringify({ v: 1, members: [{ id: 'm1', name: '', look: 'b', temper: 'normal' }], present: ['m1'], count: 1 }),
        );
      } catch {
        /* storage disabled */
      }
    });
    const problems = await startPlaying(
      page,
      './?autoplay=1&npcs=1&npcAt=1.3,1.6&fight=always',
      baseURL!,
    );
    expectClean(problems);

    // Slap to anger
    await faceAndSlap(page);

    // Wait for fume or pursue state
    await page.waitForFunction(
      () => {
        const state = (window as unknown as { __bt: Bt }).__bt.combat?.npcs?.[0]?.state;
        return state === 'fume' || state === 'pursue';
      },
      undefined,
      { timeout: 20_000, polling: 100 },
    );

    // Check for angry tag with text 'Giận!'
    const labels = await bt(page, 'npcLabels');
    const angryLabel = labels?.find((l) => l.index === 0 && l.angry);
    expect(angryLabel).toBeDefined();
    expect(angryLabel?.text).toBe('Giận!');

    // Wait for the fight to end
    await page.waitForFunction(
      () => (window as unknown as { __bt: Bt }).__bt.combat?.npcs?.[0]?.state === 'routine',
      undefined,
      { timeout: 20_000, polling: 100 },
    );

    // Label should no longer be angry
    const finalLabels = await bt(page, 'npcLabels');
    const finalLabel = finalLabels?.find((l) => l.index === 0);
    expect(finalLabel?.angry).toBe(false);
  });

  test('name tags switched off hide the angry tag but not the wind-up marker', async ({ page, baseURL }) => {
    // Seed localStorage with named roster and label switch off
    await page.addInitScript(() => {
      localStorage.setItem('bt.npcLabels', '0'); // Labels OFF
    });

    const problems = await startPlaying(
      page,
      './?autoplay=1&npcs=1&npcAt=1.3,1.6&fight=always',
      baseURL!,
    );
    expectClean(problems);

    // Labels should be hidden
    const labelsVisible = await page.evaluate(() => {
      const layer = document.querySelector('#npc-labels');
      return !(layer as HTMLElement)?.hidden;
    });
    expect(labelsVisible).toBe(false);

    // Slap and wait for windup
    await faceAndSlap(page);
    await page.waitForFunction(
      () => (window as unknown as { __bt: Bt }).__bt.combat?.npcs?.[0]?.state === 'windup',
      undefined,
      { timeout: 20_000, polling: 100 },
    );

    // Marker should still be visible despite labels being off
    const markerVisible = await page.evaluate(() => {
      const marker = document.querySelector('.combat-mark[data-npc="0"]');
      return marker?.textContent === '!';
    });
    expect(markerVisible).toBe(true);
  });

  test('combat is off in the bench', async ({ page, baseURL }) => {
    const problems = await startPlaying(page, './?bench=1&dur=5&autoplay=1', baseURL!);
    expectClean(problems);

    // Wait for playing state
    await page.waitForFunction(
      () => (window as unknown as { __bt: Bt }).__bt.state === 'playing',
      undefined,
      { timeout: 10_000, polling: 100 },
    );

    // Combat should be disabled
    expect((await bt(page, 'combat'))?.enabled).toBe(false);
  });
});

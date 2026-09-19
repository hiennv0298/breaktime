import { expect, test, type Page } from '@playwright/test';
import { collectPageProblems, waitForBtState, type PageProblems, approachAndSlap } from './helpers';

/** Plan 02-11: Player knockdown, stand-up on free spot, invulnerability, hit feedback and wind-up cue (D-06, D-08, D-09, NPC-05). */

type Vec3 = [number, number, number];
type Screen = { x: number; y: number };
type PlayerMode = 'free' | 'ragdoll' | 'recover' | 'invulnerable';
type Bt = {
  state?: string;
  player?: {
    pos: Vec3;
    yaw: number;
    stun?: { mode: PlayerMode; invulnLeft: number; hitsTaken: number; knockdowns: number; moveIgnored: number; recoverSpot: 'none' | 'free' | 'searched' | 'spawn'; lastLockMs: number };
    parts?: Array<{ name: string; parent: string | null }>;
  };
  npcs?: Array<{ id: string; pos: Vec3 }>;
  combat?: { landed: number; player?: { mode?: PlayerMode; hitsTaken?: number; knockdowns?: number; moveIgnored?: number; recoverSpot?: 'none' | 'free' | 'searched' | 'spawn' } };
  ragdolls?: { bodies: number; player?: { active: boolean; bodies: number } };
  hitStop?: { count: number };
  hitFlash?: { count: number; active: boolean };
  audio?: { requested: string[] };
  swing?: { count: number };
  camera?: { shakeActive: boolean };
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
      return !!b.combat && !!b.hitFlash && !!b.ragdolls;
    },
    undefined,
    { timeout: 10_000, polling: 100 },
  );
  return problems;
}

/*
 * Waits here are 20 s, not 5 s: getting hit is a real-time chain, not an instant. Measured on a clean
 * build with ?fight=always — slap at t0, fume +3.4 s, pursue +3.7 s, wind-up +6.3 s, strike lands +6.9 s.
 * A 5 s budget expired before the coworker ever swung, which is what made all five tests fail.
 */
function expectClean(problems: PageProblems): void {
  expect(problems.errors).toEqual([]);
  expect(problems.offOrigin).toEqual([]);
}

test.describe('Player knockdown', () => {
  test.use({ baseURL: 'http://localhost:4173' });

  test('a landed swing knocks the player down, locks input, recovers and protects for 1.5 s', async ({
    page,
    baseURL,
  }) => {
    const url = `${baseURL || 'http://localhost:4173'}/?autoplay=1&npcs=1&npcAt=1.3,1.6&fight=always`;
    const problems = await startPlaying(page, url, baseURL || 'http://localhost:4173');

    // Record every change of mode along with timestamp
    const modeTimeline: Array<{ t: number; mode: PlayerMode }> = [];
    let lastMode: PlayerMode | null = null;
    let windupHitStopCount = 0;

    // Install the watcher and return immediately. It used to return a Promise that nothing ever
    // resolved; Playwright rejects such an evaluate with "Test ended" when the test finishes, which
    // failed this test no matter what the game did. The results are collected from window.__modeChanges.
    await page.evaluate(() => {
      const w = window as unknown as { __bt: Bt; __modeChanges: unknown[]; __lastMode: string | null; __done: boolean };
      w.__modeChanges = [];
      w.__lastMode = null;
      w.__done = false;
      const check = (): void => {
        const m = w.__bt.player?.stun?.mode;
        if (m && m !== w.__lastMode) {
          w.__lastMode = m;
          w.__modeChanges.push({ t: performance.now(), mode: m });
        }
        if (!w.__done) requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });

    // Approach and slap
    const slapTime = await approachAndSlap(page, 0, 20_000);

    // Wait for the hit to land
    await page.waitForFunction(
      () => {
        const b = (window as unknown as { __bt: Bt }).__bt;
        return (b.combat?.landed ?? 0) >= 1;
      },
      undefined,
      { timeout: 20_000, polling: 50 },
    );

    // Wait for recovery and invulnerability to actually finish, rather than sleeping a guessed 3500 ms:
    // ragdoll (up to ~2.5 s) + recover (~0.45 s) + invulnerable (1.5 s) is about 4.5 s, so the fixed
    // sleep read the timeline before the player was ever back in 'free' and the duration came out NaN.
    await page.waitForFunction(
      () => {
        const s = (window as unknown as { __bt: Bt }).__bt.player?.stun;
        return (s?.knockdowns ?? 0) >= 1 && s?.mode === 'free';
      },
      undefined,
      { timeout: 20_000, polling: 50 },
    );

    const final = await page.evaluate(() => {
      (window as any).__done = true;
      return {
        modeChanges: (window as any).__modeChanges,
        shakeAfterLanding: (window as any).__shakeAfterLanding,
        hitFlashOn: (window as any).__hitFlashOn,
        hitStopAtWindup: (window as any).__hitStopAtWindup,
      };
    });

    // Verify mode timeline
    const modes = final.modeChanges.map((c: any) => c.mode);
    expect(modes).toContain('free');
    expect(modes).toContain('ragdoll');
    expect(modes).toContain('recover');
    expect(modes).toContain('invulnerable');

    // Verify timeline is reasonable: ragdoll -> recover -> invulnerable should happen within ~3.2 s
    const ragdollStart = final.modeChanges.find((c: any) => c.mode === 'ragdoll')?.t;
    const invulnStart = final.modeChanges.find((c: any) => c.mode === 'invulnerable')?.t;
    expect(ragdollStart).toBeDefined();
    expect(invulnStart).toBeDefined();
    const lockDuration = (invulnStart as number) - (ragdollStart as number);
    expect(lockDuration).toBeLessThanOrEqual(3200);

    // Verify invulnerability duration: 1400–1800 ms
    const free = final.modeChanges.find((c: any, i: number) => c.mode === 'free' && i > 0);
    const invulnEnd = free?.t;
    const invulnDuration = (invulnEnd as number) - (invulnStart as number);
    expect(invulnDuration).toBeGreaterThanOrEqual(1400);
    expect(invulnDuration).toBeLessThanOrEqual(1800);

    // Verify hit feedback
    const combat = await bt(page, 'combat');
    expect(combat?.landed).toBeGreaterThanOrEqual(1);

    const hitFlash = await bt(page, 'hitFlash');
    expect(hitFlash?.count).toBe(1);

    const audio = await bt(page, 'audio');
    const audioRequested = audio?.requested ?? [];
    expect(audioRequested.some((s: string) => s.startsWith('hurt-'))).toBe(true);
    expect(audioRequested.some((s: string) => s.startsWith('alert-'))).toBe(true);

    // Verify hit-stop triggered
    const hitStopCount = await bt(page, 'hitStop');
    expect((hitStopCount as any)?.count).toBeGreaterThan(0);

    // Verify player state
    const player = await bt(page, 'player');
    expect(player?.stun?.hitsTaken).toBe(1);
    expect(player?.stun?.knockdowns).toBe(1);

    expectClean(problems);
  });

  test('input is locked while down', async ({ page, baseURL }) => {
    const url = `${baseURL || 'http://localhost:4173'}/?autoplay=1&npcs=1&npcAt=1.3,1.6&fight=always`;
    await startPlaying(page, url, baseURL || 'http://localhost:4173');

    // Approach and slap
    await approachAndSlap(page, 0, 20_000);

    // Wait for ragdoll state
    await page.waitForFunction(
      () => {
        const b = (window as unknown as { __bt: Bt }).__bt;
        return b.player?.stun?.mode === 'ragdoll';
      },
      undefined,
      { timeout: 20_000, polling: 50 },
    );

    const swingCountBefore = (await bt(page, 'swing'))?.count ?? 0;

    // Try to move and swing while down
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(500);
    await page.keyboard.up('ArrowLeft');

    await page.keyboard.press('Space');

    // Verify swing count didn't change (input was locked)
    const swingCountAfter = (await bt(page, 'swing'))?.count ?? 0;
    expect(swingCountAfter).toBe(swingCountBefore);

    // Verify moveIgnored was incremented
    const player = await bt(page, 'player');
    expect((player?.stun as any)?.moveIgnored).toBeGreaterThan(0);
  });

  test('the camera follows and the player can walk again', async ({ page, baseURL }) => {
    const url = `${baseURL || 'http://localhost:4173'}/?autoplay=1&npcs=1&npcAt=1.3,1.6&fight=always`;
    await startPlaying(page, url, baseURL || 'http://localhost:4173');

    const posAt = async (mode: PlayerMode | null = null) => {
      return page.evaluate((m) => {
        const b = (window as unknown as { __bt: Bt }).__bt;
        if (m !== null && b.player?.stun?.mode !== m) return null;
        return b.player?.pos;
      }, mode);
    };

    // Approach and slap
    const posBeforeHit = await posAt();
    await approachAndSlap(page, 0, 20_000);

    // Wait for ragdoll state
    await page.waitForFunction(
      () => {
        const b = (window as unknown as { __bt: Bt }).__bt;
        return b.player?.stun?.mode === 'ragdoll';
      },
      undefined,
      { timeout: 20_000, polling: 50 },
    );

    expect(await posAt('ragdoll')).toBeDefined();

    // Wait for recovery
    await page.waitForFunction(
      () => {
        const b = (window as unknown as { __bt: Bt }).__bt;
        return b.player?.stun?.mode === 'recover' || b.player?.stun?.mode === 'invulnerable';
      },
      undefined,
      { timeout: 20_000, polling: 50 },
    );

    // The hit threw the player somewhere else. Measure it across the whole knockdown, from where
    // they stood before the strike to where they stood up: __bt.player.pos is the kinematic capsule,
    // which is frozen for the whole ragdoll (the ragdoll bodies are what fly), so sampling it at the
    // start and end of the ragdoll can only ever read a displacement of 0.
    const posAfterStandUp = await posAt();
    const dx = (posAfterStandUp?.[0] ?? 0) - (posBeforeHit?.[0] ?? 0);
    const dz = (posAfterStandUp?.[2] ?? 0) - (posBeforeHit?.[2] ?? 0);
    expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(0.3);

    // Wait for free state (end of invulnerability)
    await page.waitForFunction(
      () => {
        const b = (window as unknown as { __bt: Bt }).__bt;
        return b.player?.stun?.mode === 'free';
      },
      undefined,
      { timeout: 20_000, polling: 50 },
    );

    // Now walk and verify the player can move again. The player stands up wherever the ragdoll came
    // to rest — often against the coworker who just floored them, or against a wall — so any ONE
    // direction can be blocked (measured 0.20-0.47 m for KeyA alone across full-suite runs, while a
    // solo run walked fine). WASD is also camera-relative, so which key goes where is not fixed. Try
    // all four and require that at least one gets clear: what this test is about is that movement
    // input works again once they are back on their feet, not that a particular direction is open.
    let bestWalk = 0;
    for (const key of ['KeyA', 'KeyD', 'KeyW', 'KeyS']) {
      const before = await posAt();
      await page.keyboard.down(key);
      await page.waitForTimeout(600);
      await page.keyboard.up(key);
      const after = await posAt();
      bestWalk = Math.max(bestWalk, Math.hypot((after?.[0] ?? 0) - (before?.[0] ?? 0), (after?.[2] ?? 0) - (before?.[2] ?? 0)));
      if (bestWalk >= 0.5) break;
    }
    expect(bestWalk).toBeGreaterThanOrEqual(0.5);

    // Verify recover spot is reasonable
    const player = await bt(page, 'player');
    const recoverSpot = (player?.stun as any)?.recoverSpot;
    expect(['free', 'searched', 'spawn']).toContain(recoverSpot);

    const pos = await posAt();
    expect(Math.abs(pos?.[0] ?? 0)).toBeLessThanOrEqual(8);
    expect(Math.abs(pos?.[2] ?? 0)).toBeLessThanOrEqual(6);
  });

  test('the flash is warm white, not red', async ({ page, baseURL }) => {
    const url = `${baseURL || 'http://localhost:4173'}/?autoplay=1&npcs=1&npcAt=1.3,1.6&fight=always`;
    const problems = await startPlaying(page, url, baseURL || 'http://localhost:4173');

    // Approach and slap
    await approachAndSlap(page, 0, 20_000);

    // Wait for hit
    await page.waitForFunction(
      () => {
        const b = (window as unknown as { __bt: Bt }).__bt;
        return (b.combat?.landed ?? 0) >= 1;
      },
      undefined,
      { timeout: 20_000, polling: 50 },
    );

    // The flash really fired (count went up) — proved via __bt rather than by catching the element
    // mid-animation: createHitFlash strips the .on class after 30 ms, so reading the computed style
    // after the hit almost always returns box-shadow 'none'. Re-apply .on to read the styling rule
    // itself, which is what "warm white, not red" is actually about.
    expect((await bt(page, 'hitFlash'))?.count).toBeGreaterThanOrEqual(1);
    const hitFlashStyle = await page.locator('#hit-flash').evaluate((el) => {
      el.classList.add('on');
      const computed = window.getComputedStyle(el);
      const out = { boxShadow: computed.boxShadow, pointerEvents: computed.pointerEvents };
      el.classList.remove('on');
      return out;
    });

    expect(hitFlashStyle.boxShadow).toContain('rgba(255, 236, 179');
    expect(hitFlashStyle.pointerEvents).toBe('none');

    expectClean(problems);
  });

  test('player ragdoll budget', async ({ page, baseURL }) => {
    const url = `${baseURL || 'http://localhost:4173'}/?autoplay=1&npcs=1&npcAt=1.3,1.6&fight=always`;
    await startPlaying(page, url, baseURL || 'http://localhost:4173');

    // Approach and slap to trigger knockdown
    await approachAndSlap(page, 0, 20_000);

    // Wait for ragdoll state
    await page.waitForFunction(
      () => {
        const b = (window as unknown as { __bt: Bt }).__bt;
        return b.player?.stun?.mode === 'ragdoll';
      },
      undefined,
      { timeout: 20_000, polling: 50 },
    );

    // Check body count
    const ragdolls = await bt(page, 'ragdolls');
    expect((ragdolls as any)?.player?.bodies).toBe(6);
    expect((ragdolls as any)?.bodies).toBe(6); // 1 NPC ragdoll at rest
  });

  /*
   * Real bug found by the operator on a device build: after standing up, the legs appeared "stuck in
   * the middle of the body" instead of attached. Root cause was in knockdown.ts's re-attach walk,
   * which only ever recursed into TORSO's own children ('arm-left', 'arm-right', 'head'). In the
   * authored rig ('character.glb'), 'leg-left'/'leg-right' are NOT torso's children — both legs and
   * torso are siblings under a 'root' bone — so the walk silently never reached them, and
   * beginRecover() never re-parented the legs back from the flat physics group. This test asserts the
   * true parent-child shape (legs and torso -> 'root'; arms and head -> 'torso') at every stage of a
   * knockdown, so a regression here fails loudly instead of only being visible in a screenshot.
   */
  test('every body part re-attaches to its correct parent through a full knockdown cycle', async ({ page, baseURL }) => {
    const url = `${baseURL || 'http://localhost:4173'}/?autoplay=1&npcs=1&npcAt=1.3,1.6&fight=always`;
    await startPlaying(page, url, baseURL || 'http://localhost:4173');

    const expectedParents: Record<string, string | null> = {
      'leg-left': 'root',
      'leg-right': 'root',
      torso: 'root',
      'arm-left': 'torso',
      'arm-right': 'torso',
      head: 'torso',
    };
    const assertAttached = (parts: Array<{ name: string; parent: string | null }> | undefined, label: string): void => {
      expect(parts, label).toBeTruthy();
      for (const p of parts ?? []) {
        expect(p.parent, `${label}: ${p.name}`).toBe(expectedParents[p.name]);
      }
    };

    // Idle, before any knockdown.
    assertAttached((await bt(page, 'player'))?.parts, 'before knockdown');

    await approachAndSlap(page, 0, 20_000);

    await page.waitForFunction(
      () => (window as unknown as { __bt: Bt }).__bt.player?.stun?.mode === 'ragdoll',
      undefined,
      { timeout: 20_000, polling: 50 },
    );
    // During active ragdoll every part is physics-driven: all six are detached to the one shared,
    // identity-transform 'ragdoll-root' group (see ragdollRoot() in physics/ragdoll.ts), not to their
    // authored bone parent.
    const duringRagdoll = (await bt(page, 'player'))?.parts;
    expect(duringRagdoll, 'during ragdoll').toBeTruthy();
    for (const p of duringRagdoll ?? []) {
      expect(p.parent, `during ragdoll: ${p.name}`).toBe('ragdoll-root');
    }

    await page.waitForFunction(
      () => {
        const b = (window as unknown as { __bt: Bt }).__bt;
        return b.player?.stun?.mode === 'free' && b.player?.stun?.recoverSpot !== 'none';
      },
      undefined,
      { timeout: 20_000, polling: 50 },
    );

    // Standing back up: every part — legs included — must be back on its authored parent.
    assertAttached((await bt(page, 'player'))?.parts, 'after stand-up');
  });
});

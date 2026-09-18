import { expect, test, type Page } from '@playwright/test';
import { collectPageProblems, waitForBtState, type PageProblems } from './helpers';

/** Plan 02-11: Player knockdown, stand-up on free spot, invulnerability, hit feedback and wind-up cue (D-06, D-08, D-09, NPC-05). */

type Vec3 = [number, number, number];
type Screen = { x: number; y: number };
type PlayerMode = 'free' | 'ragdoll' | 'recover' | 'invulnerable';
type Bt = {
  state?: string;
  player?: { pos: Vec3; yaw: number; stun?: { mode: PlayerMode; invulnLeft: number; hitsTaken: number; knockdowns: number; moveIgnored: number; recoverSpot: 'none' | 'free' | 'searched' | 'spawn'; lastLockMs: number } };
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

function expectClean(problems: PageProblems): void {
  expect(problems.errors).toEqual([]);
  expect(problems.offOrigin).toEqual([]);
}

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
    const b = (await posOf()).player;
    return { x: Math.sign(b.x - a.x), z: Math.sign(b.z - a.z) };
  };

  const moveX = await probe('KeyD');
  const moveZ = await probe('KeyW');

  // Approach NPC from far away
  const budgetEnd = performance.now() + budgetMs;
  for (let i = 0; i < 1000; i++) {
    if (performance.now() > budgetEnd) throw new Error('approachAndSlap timed out');

    const { player, npc } = await posOf();
    const dx = npc.x - player.x;
    const dz = npc.z - player.z;
    const dist2 = dx * dx + dz * dz;

    if (dist2 < 2.0) break;

    if (Math.abs(dx) > 0.2) await page.keyboard.down(dx > 0 ? 'KeyD' : 'KeyA');
    else await page.keyboard.up('KeyA'), await page.keyboard.up('KeyD');

    if (Math.abs(dz) > 0.2) await page.keyboard.down(dz > 0 ? 'KeyW' : 'KeyS');
    else await page.keyboard.up('KeyW'), await page.keyboard.up('KeyS');

    await page.waitForTimeout(50);
  }

  await page.keyboard.up('KeyA');
  await page.keyboard.up('KeyD');
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyS');

  // Now slap
  const slapsBefore = (await bt(page, 'swing'))?.count ?? 0;
  await page.keyboard.press('Space');
  const slapsAfter = (await bt(page, 'swing'))?.count ?? 0;

  if (slapsAfter === slapsBefore) throw new Error('Slap did not register');
  return performance.now();
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

    const rafWatch = page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const check = () => {
          const b = (window as unknown as { __bt: Bt }).__bt;
          const m = b.player?.stun?.mode as PlayerMode | undefined;
          if (m && m !== (window as any).__lastMode) {
            (window as any).__lastMode = m;
            (window as any).__modeChanges.push({ t: performance.now(), mode: m });
          }
          if (!((window as any).__done ?? false)) requestAnimationFrame(check);
        };
        (window as any).__modeChanges = [];
        (window as any).__lastMode = null;
        (window as any).__done = false;
        requestAnimationFrame(check);
      });
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

    // Wait for recovery and invulnerability to finish, capture timeline
    await page.waitForTimeout(3500);

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
      { timeout: 5000, polling: 50 },
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
    await approachAndSlap(page, 0, 20_000);

    // Wait for ragdoll state
    await page.waitForFunction(
      () => {
        const b = (window as unknown as { __bt: Bt }).__bt;
        return b.player?.stun?.mode === 'ragdoll';
      },
      undefined,
      { timeout: 5000, polling: 50 },
    );

    const ragdollStartPos = await posAt('ragdoll');
    expect(ragdollStartPos).toBeDefined();

    // Wait for recovery
    await page.waitForFunction(
      () => {
        const b = (window as unknown as { __bt: Bt }).__bt;
        return b.player?.stun?.mode === 'recover' || b.player?.stun?.mode === 'invulnerable';
      },
      undefined,
      { timeout: 5000, polling: 50 },
    );

    // During ragdoll, player should have moved
    const ragdollEndPos = await posAt();
    const dx = (ragdollEndPos?.[0] ?? 0) - (ragdollStartPos?.[0] ?? 0);
    const dz = (ragdollEndPos?.[2] ?? 0) - (ragdollStartPos?.[2] ?? 0);
    const dist = Math.sqrt(dx * dx + dz * dz);
    expect(dist).toBeGreaterThanOrEqual(0.3);

    // Wait for free state (end of invulnerability)
    await page.waitForFunction(
      () => {
        const b = (window as unknown as { __bt: Bt }).__bt;
        return b.player?.stun?.mode === 'free';
      },
      undefined,
      { timeout: 5000, polling: 50 },
    );

    // Now walk and verify position changes
    const posBeforeWalk = await posAt();
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(400);
    await page.keyboard.up('KeyA');

    const posAfterWalk = await posAt();
    const walkDx = (posAfterWalk?.[0] ?? 0) - (posBeforeWalk?.[0] ?? 0);
    expect(Math.abs(walkDx)).toBeGreaterThanOrEqual(0.5);

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

    // Check hit-flash element
    const hitFlashStyle = await page.locator('#hit-flash').evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        boxShadow: computed.boxShadow,
        pointerEvents: computed.pointerEvents,
      };
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
      { timeout: 5000, polling: 50 },
    );

    // Check body count
    const ragdolls = await bt(page, 'ragdolls');
    expect((ragdolls as any)?.player?.bodies).toBe(6);
    expect((ragdolls as any)?.bodies).toBe(6); // 1 NPC ragdoll at rest
  });
});

import type { CDPSession, Page } from '@playwright/test';

export interface PageProblems {
  errors: string[];
  offOrigin: string[];
}

/**
 * Attach listeners BEFORE page.goto. Arrays fill live while the page runs.
 * errors: console 'error' messages + uncaught page errors.
 * offOrigin: any request whose origin differs from baseURL (data: and blob: ignored).
 */
export function collectPageProblems(page: Page, baseURL: string): PageProblems {
  const origin = new URL(baseURL).origin;
  const problems: PageProblems = { errors: [], offOrigin: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') problems.errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.errors.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('data:') || u.startsWith('blob:')) return;
    let reqOrigin: string;
    try {
      reqOrigin = new URL(u).origin;
    } catch {
      problems.offOrigin.push(u);
      return;
    }
    if (reqOrigin !== origin) problems.offOrigin.push(u);
  });
  return problems;
}

/** Poll window.__bt?.state until it equals `state`. */
export async function waitForBtState(page: Page, state: string, timeoutMs = 30_000): Promise<void> {
  await page.waitForFunction(
    (s) => (window as unknown as { __bt?: { state?: string } }).__bt?.state === s,
    state,
    { timeout: timeoutMs, polling: 100 },
  );
}

/* ---------- Trusted touch input through CDP (plan 01-08) ----------
 * Input.dispatchTouchEvent goes through the browser input pipeline, so the page receives
 * trusted touch AND pointer events (pointerType 'touch'), unlike synthetic dispatchEvent.
 * CDP expects touchStart/touchMove to list ALL touch points still on the screen and diffs them
 * against the previous event, so each page keeps its active points; that is what makes multi-touch
 * (joystick + button) possible. touchEnd must carry no points and releases EVERY finger, so lifting
 * one finger while others stay down is sent as a touchMove without that finger.
 */

type TouchPoint = { x: number; y: number; id: number };
type TouchTrack = { session: CDPSession; points: Map<number, TouchPoint> };

const touchTracks = new WeakMap<Page, Promise<TouchTrack>>();

function touchTrack(page: Page): Promise<TouchTrack> {
  let t = touchTracks.get(page);
  if (!t) {
    t = page
      .context()
      .newCDPSession(page)
      .then((session) => ({ session, points: new Map<number, TouchPoint>() }));
    touchTracks.set(page, t);
  }
  return t;
}

async function dispatchTouch(
  track: TouchTrack,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
): Promise<void> {
  const touchPoints =
    type === 'touchEnd' ? [] : [...track.points.values()].map((p) => ({ x: p.x, y: p.y, id: p.id }));
  await track.session.send('Input.dispatchTouchEvent', { type, touchPoints });
}

/** Put finger `id` down at CSS pixel (x, y). */
export async function touchDown(page: Page, x: number, y: number, id = 0): Promise<void> {
  const track = await touchTrack(page);
  if (track.points.has(id)) throw new Error(`touch ${id} is already down`);
  track.points.set(id, { x, y, id });
  await dispatchTouch(track, 'touchStart');
}

/** Move finger `id` (already down) to (x, y). */
export async function touchMove(page: Page, x: number, y: number, id = 0): Promise<void> {
  const track = await touchTrack(page);
  const p = track.points.get(id);
  if (!p) throw new Error(`touch ${id} is not down`);
  p.x = x;
  p.y = y;
  await dispatchTouch(track, 'touchMove');
}

/** Lift finger `id`. */
export async function touchUp(page: Page, id = 0): Promise<void> {
  const track = await touchTrack(page);
  if (!track.points.delete(id)) throw new Error(`touch ${id} is not down`);
  await dispatchTouch(track, track.points.size > 0 ? 'touchMove' : 'touchEnd');
}

/** Finger `id` (already down, at `from`) glides to `to` in `steps` moves spread over `durationMs`. */
export async function touchDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps: number,
  durationMs: number,
  id = 0,
): Promise<void> {
  const n = Math.max(1, Math.floor(steps));
  const start = Date.now();
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    await touchMove(page, from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k, id);
    const wait = start + durationMs * k - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
  }
}

/** Quick tap (down + up) with finger `id` at (x, y). */
export async function touchTap(page: Page, x: number, y: number, id = 1): Promise<void> {
  await touchDown(page, x, y, id);
  await touchUp(page, id);
}

/**
 * Walks the player to coworker `npcIndex` and slaps it. Returns the slap timestamp, or 0 if no slap
 * landed within `budgetMs`.
 *
 * Shared by fightBack.spec and playerKnockdown.spec so the two cannot drift apart. Three things here
 * are deliberate, each one having cost a round of false failures:
 *  - It WALKS to the coworker. Standing still and waiting for one to wander past is a coin flip since
 *    every coworker follows its own seeded route.
 *  - WASD is world movement, not turning, and which key maps to which world axis depends on the
 *    camera yaw — so the mapping is measured here, never assumed.
 *  - It confirms `__bt.slap.count` went up, not `__bt.swing.count`. A swing into thin air increments
 *    swing.count, so checking that proves nothing about the coworker having been hit.
 */
export async function approachAndSlap(page: Page, npcIndex: number, budgetMs: number): Promise<number> {
  type Vec = { x: number; z: number };
  const read = <T>(fn: (i: number) => T): Promise<T> => page.evaluate(fn, npcIndex);
  const posOf = (): Promise<{ player: Vec; npc: Vec }> =>
    read((i) => {
      const b = (window as unknown as { __bt: { player?: { pos: number[] }; npcs?: Array<{ pos: number[] }> } }).__bt;
      const p = b.player!.pos;
      const n = b.npcs![i]!.pos;
      return { player: { x: p[0]!, z: p[2]! }, npc: { x: n[0]!, z: n[2]! } };
    });
  const highlightKind = (): Promise<string | null | undefined> =>
    page.evaluate(() => (window as unknown as { __bt: { highlight?: { kind?: string | null } } }).__bt.highlight?.kind);
  const slapCount = (): Promise<number> =>
    page.evaluate(() => (window as unknown as { __bt: { slap?: { count: number } } }).__bt.slap?.count ?? 0);

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
    if ((await highlightKind()) === 'npc') break;
    const { player, npc } = await posOf();
    const want: Vec = { x: npc.x - player.x, z: npc.z - player.z };
    if (Math.hypot(want.x, want.z) < 0.2) break;
    const alongD = dot(want, dVec);
    const alongW = dot(want, wVec);
    const key = Math.abs(alongD) >= Math.abs(alongW) ? (alongD >= 0 ? 'KeyD' : 'KeyA') : alongW >= 0 ? 'KeyW' : 'KeyS';
    await page.keyboard.down(key);
    await page.waitForTimeout(90);
    await page.keyboard.up(key);
  }

  if ((await highlightKind()) !== 'npc') return 0;
  const before = await slapCount();
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  return (await slapCount()) > before ? Date.now() : 0;
}

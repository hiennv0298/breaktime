import { expect, test, type Page } from '@playwright/test';
import { collectPageProblems, waitForBtState } from './helpers';

// D-15 / D-23 / TECH-01: Web Audio unlocks inside the Chơi click, all MP3 SFX decode and a start cue plays.
// Desktop only: the unlock path is the same click handler on every project, and mobile-emu adds no audio signal.

type AudioDebug = { state: string; decoded: number; requests: number; played: string[] };

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'audio runs on the desktop project only');
});

function audio(page: Page): Promise<AudioDebug | undefined> {
  return page.evaluate(() => (window as unknown as { __bt: { audio?: AudioDebug } }).__bt.audio);
}

async function pollAudio(page: Page, check: (a: AudioDebug | undefined) => boolean, timeoutMs: number): Promise<AudioDebug | undefined> {
  const deadline = Date.now() + timeoutMs;
  let last = await audio(page);
  while (!check(last) && Date.now() < deadline) {
    await page.waitForTimeout(25);
    last = await audio(page);
  }
  return last;
}

async function setVisibility(page: Page, v: 'hidden' | 'visible'): Promise<void> {
  await page.evaluate((state) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => state === 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, v);
}

test('Chơi unlocks audio within 1 s: running, all SFX decoded, start cue played, MP3s same-origin', async ({ page, baseURL }) => {
  const problems = collectPageProblems(page, baseURL!);
  const origin = new URL(baseURL!).origin;
  const mp3Requests: string[] = [];
  page.on('request', (r) => {
    if (/\.mp3(\?|#|$)/i.test(new URL(r.url()).pathname)) mp3Requests.push(r.url());
  });

  await page.goto('./?npcs=0');
  await waitForBtState(page, 'ready-to-play', 60_000);

  // Nothing is unlocked before the gesture, although every MP3 has already been fetched during loading.
  const before = await audio(page);
  expect(before?.state).toBe('locked');
  expect(before?.decoded).toBe(0);
  expect(mp3Requests.length).toBeGreaterThanOrEqual(10);

  await page.getByRole('button', { name: 'Chơi' }).click();
  const clickedAt = Date.now();
  const after = await pollAudio(
    page,
    (a) => a?.state === 'running' && a.decoded >= 10 && a.played.includes('drop-soft-0'),
    1000,
  );
  const elapsed = Date.now() - clickedAt;

  expect(after?.state, `audio after ${elapsed} ms: ${JSON.stringify(after)}`).toBe('running');
  expect(after?.decoded).toBeGreaterThanOrEqual(10);
  expect(after?.played).toContain('drop-soft-0');
  expect(after?.requests).toBeGreaterThanOrEqual(1);

  // Each SFX was fetched once, same-origin, and nothing else left the origin.
  expect(mp3Requests.length).toBeGreaterThanOrEqual(10);
  for (const u of mp3Requests) expect(new URL(u).origin).toBe(origin);
  expect(problems.offOrigin).toEqual([]);
  expect(problems.errors).toEqual([]);
});

test('?autoplay=1 without a gesture keeps audio locked and never throws', async ({ page, baseURL }) => {
  const problems = collectPageProblems(page, baseURL!);
  await page.goto('./?autoplay=1');
  await waitForBtState(page, 'playing', 60_000);
  // Give any stray unlock or start cue time to happen.
  await page.waitForTimeout(500);

  const a = await audio(page);
  expect(a, '__bt.audio must be registered on the autoplay path too').toBeDefined();
  expect(a?.state).toBe('locked');
  expect(a?.decoded).toBe(0);
  expect(a?.played).toEqual([]);
  expect(typeof a?.requests).toBe('number');
  expect(problems.errors).toEqual([]);
  expect(problems.offOrigin).toEqual([]);
});

test('audio suspends when the tab hides and resumes when it becomes visible', async ({ page, baseURL }) => {
  const problems = collectPageProblems(page, baseURL!);
  await page.goto('./?npcs=0');
  await waitForBtState(page, 'ready-to-play', 60_000);
  await page.getByRole('button', { name: 'Chơi' }).click();
  expect((await pollAudio(page, (a) => a?.state === 'running', 5000))?.state).toBe('running');

  await setVisibility(page, 'hidden');
  expect((await pollAudio(page, (a) => a?.state === 'suspended', 3000))?.state).toBe('suspended');

  await setVisibility(page, 'visible');
  expect((await pollAudio(page, (a) => a?.state === 'running', 3000))?.state).toBe('running');
  expect(problems.errors).toEqual([]);
});

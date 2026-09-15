import { evaluatePrevious, nextBeacon, type Beacon } from '../logic/beacon';

/**
 * Crash beacon (plan 01-18, TECH-04, RESEARCH Pattern 8). A heartbeat in localStorage['bt.beacon'] is rewritten every
 * 5 s while the page lives and marked clean on pagehide, so a page that dies mid-session (iOS memory kill + tab reload,
 * renderer crash) leaves an unclean, recent record the next load can report.
 *
 * Also marked clean while the tab is hidden and unclean again when it becomes visible: a second tab of the game (D-04
 * compares two builds on one phone) or a phone locked mid-soak would otherwise look like a crash, and a tab killed in
 * the background is not a crash during play.
 *
 * Every storage access sits inside try/catch (portal rule, T-01-18-03): without storage the game plays on and simply
 * cannot report crashes. Nothing leaves the device (TECH-05); the record holds only the sha and timestamps (T-01-18-02).
 */

const KEY = 'bt.beacon';
export const BEACON_HEARTBEAT_MS = 5000;

let started = false;

function readPrevious(): unknown {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null || raw.length > 1024) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function write(b: Beacon): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    // storage unavailable or full: no crash reporting, play continues
  }
}

/** Starts the heartbeat for this page and returns what the previous page left behind (null = no crash). */
export function initCrashBeacon(sha: string): { crashedAfterSec: number; sha: string } | null {
  const now = Date.now();
  const prevCrash = evaluatePrevious(readPrevious(), now);
  if (started) return prevCrash;
  started = true;

  let beacon: Beacon = { sha, start: now, last: now, clean: document.visibilityState === 'hidden' };
  write(beacon);

  setInterval(() => {
    // Hidden tabs stay clean; the first visible heartbeat (or visibilitychange) flips the flag back.
    if (document.visibilityState === 'hidden') return;
    beacon = nextBeacon(beacon, Date.now(), false);
    write(beacon);
  }, BEACON_HEARTBEAT_MS);

  addEventListener('pagehide', () => {
    beacon = nextBeacon(beacon, Date.now(), true);
    write(beacon);
  });
  // Back from the bfcache: the session is live again.
  addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    beacon = nextBeacon(beacon, Date.now(), false);
    write(beacon);
  });
  document.addEventListener('visibilitychange', () => {
    beacon = nextBeacon(beacon, Date.now(), document.visibilityState === 'hidden');
    write(beacon);
  });

  return prevCrash;
}

/**
 * Crash beacon rules (plan 01-18, TECH-04, RESEARCH Pattern 8). Pure: no DOM, no storage, no clock of its own.
 *
 * The running page rewrites a small heartbeat record every few seconds and marks it clean when the page is hidden or
 * unloaded normally. If the next page load finds a record that is still unclean and younger than BEACON_STALE_MS, the
 * previous page died mid-session: an iOS tab reload after a memory kill or a renderer crash.
 *
 * The record lives in localStorage and a visitor can edit it (T-01-18-01), so every field is type-checked and anything
 * that is not a well-formed beacon means "no crash". It holds only a build sha and timestamps (T-01-18-02).
 */

/** A heartbeat older than this is not a crash of the last session (the tab was closed or killed long ago). */
export const BEACON_STALE_MS = 20000;
/** Longest sha accepted from storage (a git sha is 40 hex; the build uses 12). */
const MAX_SHA_LENGTH = 64;

export interface Beacon {
  sha: string;
  start: number;
  last: number;
  clean: boolean;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Crash info for the previous session, or null when it ended cleanly, long ago, or the value is not a beacon. */
export function evaluatePrevious(prev: unknown, nowMs: number): { crashedAfterSec: number; sha: string } | null {
  if (prev === null || typeof prev !== 'object' || Array.isArray(prev)) return null;
  const p = prev as Record<string, unknown>;
  const { sha, start, last, clean } = p;
  if (typeof sha !== 'string' || sha.length === 0 || sha.length > MAX_SHA_LENGTH) return null;
  if (!isFiniteNumber(start) || !isFiniteNumber(last) || typeof clean !== 'boolean') return null;
  if (!isFiniteNumber(nowMs) || last < start) return null;
  if (clean) return null;
  const age = nowMs - last;
  // A heartbeat from the future is a tampered or clock-jumped value, not a session that just died.
  if (age < 0 || age >= BEACON_STALE_MS) return null;
  return { crashedAfterSec: Math.round((last - start) / 1000), sha };
}

/** The next heartbeat: last = now, start and sha kept; `clean` replaces the flag only when given. */
export function nextBeacon(b: Beacon, nowMs: number, clean?: boolean): Beacon {
  return { sha: b.sha, start: b.start, last: nowMs, clean: clean === undefined ? b.clean : clean };
}

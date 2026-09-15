import { describe, expect, it } from 'vitest';
import { BEACON_STALE_MS, evaluatePrevious, nextBeacon, type Beacon } from '../../src/logic/beacon';

/*
 * Plan 01-18 (TECH-04, RESEARCH Pattern 8): a localStorage heartbeat that was never marked clean and is younger than
 * BEACON_STALE_MS means the previous page died mid-session (iOS tab reload, renderer crash). The stored value can be
 * edited by the visitor (T-01-18-01), so anything that is not a well-formed beacon counts as "no crash".
 */

const NOW = 1_800_000_000_000;
const SHA = '0123456789ab';

describe('evaluatePrevious', () => {
  it('stale window is 20 s', () => {
    expect(BEACON_STALE_MS).toBe(20000);
  });

  it('null / undefined / primitives give null', () => {
    expect(evaluatePrevious(null, NOW)).toBeNull();
    expect(evaluatePrevious(undefined, NOW)).toBeNull();
    expect(evaluatePrevious('crash', NOW)).toBeNull();
    expect(evaluatePrevious(42, NOW)).toBeNull();
    expect(evaluatePrevious([], NOW)).toBeNull();
  });

  it('malformed objects give null', () => {
    const good = { sha: SHA, start: NOW - 65000, last: NOW - 5000, clean: false };
    expect(evaluatePrevious({}, NOW)).toBeNull();
    expect(evaluatePrevious({ ...good, sha: 7 }, NOW)).toBeNull();
    expect(evaluatePrevious({ ...good, sha: '' }, NOW)).toBeNull();
    expect(evaluatePrevious({ ...good, sha: 'x'.repeat(65) }, NOW)).toBeNull();
    expect(evaluatePrevious({ ...good, start: '1' }, NOW)).toBeNull();
    expect(evaluatePrevious({ ...good, last: Number.NaN }, NOW)).toBeNull();
    expect(evaluatePrevious({ ...good, start: Number.POSITIVE_INFINITY }, NOW)).toBeNull();
    expect(evaluatePrevious({ ...good, clean: 'false' }, NOW)).toBeNull();
    expect(evaluatePrevious({ ...good, clean: undefined }, NOW)).toBeNull();
    // A heartbeat before the session start or in the future is not a real session.
    expect(evaluatePrevious({ ...good, start: NOW - 1000, last: NOW - 5000 }, NOW)).toBeNull();
    expect(evaluatePrevious({ ...good, last: NOW + 5000 }, NOW)).toBeNull();
  });

  it('an unclean beacon 5 s old reports the session length in seconds and its sha', () => {
    expect(evaluatePrevious({ clean: false, last: NOW - 5000, start: NOW - 65000, sha: SHA }, NOW)).toEqual({
      crashedAfterSec: 60,
      sha: SHA,
    });
  });

  it('seconds are rounded', () => {
    expect(evaluatePrevious({ clean: false, last: NOW - 1000, start: NOW - 1000 - 12_600, sha: SHA }, NOW)).toEqual({
      crashedAfterSec: 13,
      sha: SHA,
    });
    expect(evaluatePrevious({ clean: false, last: NOW - 1000, start: NOW - 1000 - 12_400, sha: SHA }, NOW)).toEqual({
      crashedAfterSec: 12,
      sha: SHA,
    });
  });

  it('an unclean beacon older than 20 s gives null (tab closed long ago, killed in the background)', () => {
    expect(evaluatePrevious({ clean: false, last: NOW - 30000, start: NOW - 90000, sha: SHA }, NOW)).toBeNull();
    expect(evaluatePrevious({ clean: false, last: NOW - BEACON_STALE_MS, start: NOW - 90000, sha: SHA }, NOW)).toBeNull();
  });

  it('a clean beacon gives null however recent', () => {
    expect(evaluatePrevious({ clean: true, last: NOW - 1000, start: NOW - 60000, sha: SHA }, NOW)).toBeNull();
  });

  it('extra fields are ignored', () => {
    expect(
      evaluatePrevious({ clean: false, last: NOW - 5000, start: NOW - 65000, sha: SHA, prevCrash: { x: 1 } }, NOW),
    ).toEqual({ crashedAfterSec: 60, sha: SHA });
  });
});

describe('nextBeacon', () => {
  const b: Beacon = { sha: SHA, start: NOW - 10000, last: NOW - 5000, clean: false };

  it('updates last to now and keeps start and sha', () => {
    const n = nextBeacon(b, NOW);
    expect(n).toEqual({ sha: SHA, start: NOW - 10000, last: NOW, clean: false });
  });

  it('clean true marks the session clean', () => {
    expect(nextBeacon(b, NOW, true)).toEqual({ sha: SHA, start: NOW - 10000, last: NOW, clean: true });
  });

  it('clean false marks a clean session unclean again (page shown after a pagehide)', () => {
    expect(nextBeacon({ ...b, clean: true }, NOW, false).clean).toBe(false);
  });

  it('without the clean argument the flag is kept, and the input is not mutated', () => {
    const c: Beacon = { ...b, clean: true };
    expect(nextBeacon(c, NOW).clean).toBe(true);
    expect(c.last).toBe(NOW - 5000);
  });

  it('a beacon produced by nextBeacon and never cleaned is reported as a crash a few seconds later', () => {
    const live = nextBeacon({ sha: SHA, start: NOW - 30000, last: NOW - 30000, clean: false }, NOW);
    expect(evaluatePrevious(JSON.parse(JSON.stringify(live)), NOW + 4000)).toEqual({ crashedAfterSec: 30, sha: SHA });
  });
});

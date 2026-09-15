import { createAutoTierPolicy, parseTierParam, type AutoTierPolicy, type Tier } from '../logic/quality';

/** Where the current tier came from: auto-tiering, the pause menu (persisted) or ?q= (benchmarks). */
export type TierSource = 'auto' | 'manual' | 'forced';

export interface QualityManager {
  current(): Tier;
  source(): TierSource;
  /** Pause-menu choice (D-21): overrides auto-tiering and persists in localStorage. */
  setManual(t: Tier): void;
  /** One rendered frame: `intervalMs` since the previous frame, `workMs` of CPU work in it. Only used in 'auto'. */
  feedFrame(nowMs: number, intervalMs: number, workMs: number): void;
  /** Called on every tier change; returns an unsubscribe function. */
  onChange(cb: (t: Tier) => void): () => void;
}

export const QUALITY_STORAGE_KEY = 'bt.quality';

/** Portal rule + T-01-11-02: storage may be missing, disabled or throw on access; the game then runs with defaults. */
function readStoredTier(): Tier | null {
  try {
    return parseTierParam(window.localStorage.getItem(QUALITY_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeStoredTier(t: Tier): void {
  try {
    window.localStorage.setItem(QUALITY_STORAGE_KEY, t);
  } catch {
    // Quota exceeded / private mode: the choice still applies for this session.
  }
}

let singleton: QualityManager | undefined;
/** Subscribers that asked before the manager existed (the renderer and camera are created before the loop). */
const early = new Set<(t: Tier) => void>();

/**
 * Runtime tier state shared by renderer, camera and (plan 01-16) debris. Start tier: ?q= ('forced'), else a stored
 * manual choice ('manual'), else Vừa on coarse pointers / Cao elsewhere ('auto'). Created once by loop.ts.
 */
export function createQualityManager(opts: { coarse: boolean; params: URLSearchParams; startMs: number }): QualityManager {
  if (singleton) return singleton;

  const forced = parseTierParam(opts.params.get('q'));
  const stored = forced ? null : readStoredTier();
  let source: TierSource = forced ? 'forced' : stored ? 'manual' : 'auto';
  let tier: Tier = forced ?? stored ?? (opts.coarse ? 'med' : 'high');
  const policy: AutoTierPolicy = createAutoTierPolicy({ start: tier, startMs: opts.startMs });
  const listeners = new Set<(t: Tier) => void>();

  function set(t: Tier): void {
    if (t === tier) return;
    tier = t;
    for (const cb of [...listeners]) cb(t);
  }

  const manager: QualityManager = {
    current: () => tier,
    source: () => source,
    setManual(t) {
      const valid = parseTierParam(t);
      if (!valid) return;
      source = 'manual';
      writeStoredTier(valid);
      set(valid);
    },
    feedFrame(nowMs, intervalMs, workMs) {
      if (source !== 'auto') return;
      const r = policy.feed(nowMs, intervalMs, workMs);
      if (r.changed) set(r.tier);
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };

  singleton = manager;
  for (const cb of early) {
    listeners.add(cb);
    cb(tier);
  }
  early.clear();
  return manager;
}

/** The manager created by loop.ts. Throws before the loop has started. */
export function getQuality(): QualityManager {
  if (!singleton) throw new Error('quality manager not created yet');
  return singleton;
}

/** Run `cb(tier)` now if the manager exists (or as soon as it is created) and again on every tier change. */
export function subscribeQuality(cb: (t: Tier) => void): void {
  if (singleton) {
    singleton.onChange(cb);
    cb(singleton.current());
  } else {
    early.add(cb);
  }
}

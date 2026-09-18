import { ROSTER_KEY, serializeRoster, type Roster } from '../logic/roster';
import { NPC_SETTINGS_KEY } from '../logic/npcSettings';

/**
 * localStorage access for the roster (plan 02-07, G4, D-03). Every access sits in try/catch (portal rule,
 * T-02-07-07): incognito, disabled storage or a full quota never break the game. The names and preferences stay on
 * this device — this module is the only place they are persisted and nothing here (or anywhere) sends them over the
 * network (D-04, inherited from Phase 1 D-31).
 *
 * Migration (G4, RESEARCH Pitfall 2): this build never writes the legacy 'bt.npcs' key. Old builds under /b/<sha>/
 * share the origin and keep writing it, so the game reads it once for migration (one-way) but never writes it back.
 * A saved roster always wins over a stale bt.npcs.
 */

export const ROSTER_SAVE_DEBOUNCE_MS = 500;

let pendingWrite: { roster: Roster; timer: ReturnType<typeof setTimeout> } | null = null;
let lastWriteOk: boolean | null = null;

/** Raw stored strings; storageOk false when reading threw. */
export function readRosterRaw(): { rosterRaw: string | null; legacyRaw: string | null; storageOk: boolean } {
  try {
    return {
      rosterRaw: window.localStorage.getItem(ROSTER_KEY),
      legacyRaw: window.localStorage.getItem(NPC_SETTINGS_KEY),
      storageOk: true,
    };
  } catch {
    return { rosterRaw: null, legacyRaw: null, storageOk: false };
  }
}

/**
 * Stores the serialised roster; false when storage throws (the roster still applies for this session).
 * Cancels any pending debounced write first, so only the last call to either writeRoster or scheduleWriteRoster
 * persists to storage.
 */
export function writeRoster(r: Roster): boolean {
  if (pendingWrite) {
    clearTimeout(pendingWrite.timer);
    pendingWrite = null;
  }
  try {
    window.localStorage.setItem(ROSTER_KEY, serializeRoster(r));
    lastWriteOk = true;
    return true;
  } catch {
    lastWriteOk = false;
    return false;
  }
}

/**
 * Schedules a write to storage after delayMs (default ROSTER_SAVE_DEBOUNCE_MS); cancels any pending write first.
 * Intended for frequent updates (e.g., the settings editor). The first schedule registers a pagehide listener
 * to flush any pending write before the page unloads.
 */
export function scheduleWriteRoster(r: Roster, delayMs?: number): void {
  if (pendingWrite) {
    clearTimeout(pendingWrite.timer);
  }
  const delay = delayMs ?? ROSTER_SAVE_DEBOUNCE_MS;
  const timer = window.setTimeout(() => {
    writeRoster(r);
    pendingWrite = null;
  }, delay);
  pendingWrite = { roster: r, timer };

  // Register the pagehide listener once
  if (!pagehideListenerRegistered) {
    window.addEventListener('pagehide', flushRosterWrite);
    pagehideListenerRegistered = true;
  }
}

let pagehideListenerRegistered = false;

/**
 * Writes any pending roster write immediately. Returns true/false if a write occurred, null if nothing was pending.
 */
export function flushRosterWrite(): boolean | null {
  if (!pendingWrite) return null;
  const { roster } = pendingWrite;
  pendingWrite = null;
  return writeRoster(roster);
}

/** State of the roster save operation: whether a write is pending and the result of the last completed write. */
export function rosterSaveState(): { pending: boolean; lastOk: boolean | null } {
  return {
    pending: pendingWrite !== null,
    lastOk: lastWriteOk,
  };
}

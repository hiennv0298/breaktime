/**
 * Swing cooldown gate (D-30): every attack press (Space / E / context button / game-area click) plays the arm swing
 * right away, but a press that arrives within the cooldown of the last accepted swing is dropped, so mashing or an
 * auto-clicker cannot spam swings or hits (T-01-24-01). Pure, no DOM, no clock: callers pass nowMs (TECH-06).
 */

/** Minimum time between two accepted swings. */
export const SWING_COOLDOWN_MS = 350;

export interface SwingGate {
  /** True (and records nowMs) when a swing may start; false during the cooldown or for a non-finite time. */
  tryStart(nowMs: number): boolean;
  /** Accepted swings so far. */
  count(): number;
  /** Time of the last accepted swing; 0 before the first. */
  lastMs(): number;
}

export function createSwingGate(cooldownMs: number = SWING_COOLDOWN_MS): SwingGate {
  const cooldown = Number.isFinite(cooldownMs) && cooldownMs >= 0 ? cooldownMs : SWING_COOLDOWN_MS;
  let last = 0;
  let accepted = 0;
  return {
    tryStart(nowMs) {
      if (!Number.isFinite(nowMs)) return false;
      // A dropped press never moves `last`, so it cannot extend the cooldown.
      if (accepted > 0 && !(nowMs - last >= cooldown)) return false;
      last = nowMs;
      accepted++;
      return true;
    },
    count() {
      return accepted;
    },
    lastMs() {
      return last;
    },
  };
}

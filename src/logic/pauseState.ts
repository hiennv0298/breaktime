/** Why the simulation is paused (D-20, CTRL-04). */
export type PauseReason = 'user' | 'hidden' | 'context-lost';

export interface PauseState {
  isPaused(): boolean;
  /** null while running. */
  reason(): PauseReason | null;
  /** Running -> paused ('user'); paused for any reason -> running. */
  toggle(): void;
  /** Pause (or re-label the current pause) with reason `r`. */
  pauseFor(r: PauseReason): void;
  resume(): void;
}

/** Pure pause state: no DOM, no timers. The loop reads it once per frame. */
export function createPauseState(): PauseState {
  let current: PauseReason | null = null;
  return {
    isPaused: () => current !== null,
    reason: () => current,
    toggle() {
      current = current === null ? 'user' : null;
    },
    pauseFor(r) {
      current = r;
    },
    resume() {
      current = null;
    },
  };
}

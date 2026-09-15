/** Device-agnostic input written by keyboard (this plan) and touch (plan 01-08), read once per sim step. */
export interface InputState {
  /** -1 left (A) .. +1 right (D) */
  moveX: number;
  /** -1 back (S) .. +1 forward (W) */
  moveY: number;
  /** Set on an interact press (E); cleared by consumeInteract. */
  interactQueued: boolean;
}

export function createInputState(): InputState {
  return { moveX: 0, moveY: 0, interactQueued: false };
}

/** Returns true once per queued interact press and clears the flag. */
export function consumeInteract(s: InputState): boolean {
  const queued = s.interactQueued;
  s.interactQueued = false;
  return queued;
}

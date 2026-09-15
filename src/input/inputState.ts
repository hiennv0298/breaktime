/** Device-agnostic input written by keyboard, joystick and touch buttons; the loop and sim read it. */
export interface InputState {
  /** -1 left (A) .. +1 right (D) */
  moveX: number;
  /** -1 back (S) .. +1 forward (W) */
  moveY: number;
  /** Set on an interact press (E / context button); cleared by consumeInteract. */
  interactQueued: boolean;
  /** Set on a pause toggle press (Escape / Space / pause button); cleared by consumePauseToggle. */
  pauseToggleQueued: boolean;
}

export function createInputState(): InputState {
  return { moveX: 0, moveY: 0, interactQueued: false, pauseToggleQueued: false };
}

/** Returns true once per queued interact press and clears the flag. */
export function consumeInteract(s: InputState): boolean {
  const queued = s.interactQueued;
  s.interactQueued = false;
  return queued;
}

/** Returns true once per queued pause toggle and clears the flag. */
export function consumePauseToggle(s: InputState): boolean {
  const queued = s.pauseToggleQueued;
  s.pauseToggleQueued = false;
  return queued;
}

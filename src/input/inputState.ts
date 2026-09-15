/** Device-agnostic input written by keyboard, joystick and touch buttons; the loop and sim read it. */
export interface InputState {
  /** -1 left (A / ArrowLeft) .. +1 right (D / ArrowRight) */
  moveX: number;
  /** -1 back (S / ArrowDown) .. +1 forward (W / ArrowUp) */
  moveY: number;
  /** Set on an action press (Space / E / context button / click on the glowing object); cleared by consumeInteract. */
  interactQueued: boolean;
  /** Set on a pause toggle (Escape / lone Ctrl press-and-release / pause button, D-27); cleared by consumePauseToggle. */
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

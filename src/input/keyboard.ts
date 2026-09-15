import type { InputState } from './inputState';

const MOVE_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
const PAUSE_CODES = new Set(['Escape', 'Space']);

/**
 * Desktop keyboard (D-20, CTRL-01, CTRL-04): KeyW/KeyA/KeyS/KeyD move, KeyE interacts, Escape/Space toggle pause.
 * Uses KeyboardEvent.code only, so the layout (AZERTY, Vietnamese IME) does not change the physical keys.
 * Camera rotation keys (Z/C, plan 01-09) are deliberately not bound here.
 * Returns a detach function.
 */
export function attachKeyboard(s: InputState): () => void {
  const held = new Set<string>();

  function recompute(): void {
    s.moveX = (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0);
    s.moveY = (held.has('KeyW') ? 1 : 0) - (held.has('KeyS') ? 1 : 0);
  }

  function clear(): void {
    held.clear();
    recompute();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (MOVE_CODES.has(e.code)) {
      held.add(e.code);
      recompute();
    } else if (e.code === 'KeyE' && !e.repeat) {
      s.interactQueued = true;
    } else if (PAUSE_CODES.has(e.code)) {
      // Space would scroll the page or click a focused button (and toggle twice): always swallow it.
      if (e.code === 'Space') e.preventDefault();
      if (!e.repeat) s.pauseToggleQueued = true;
    }
  }

  function onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space') e.preventDefault(); // a focused button activates on Space keyup
    if (held.delete(e.code)) recompute();
  }

  function onVisibility(): void {
    if (document.visibilityState === 'hidden') clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  // A key released while the window has no focus never sends keyup: drop held keys so the player does not run away.
  window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', clear);
    document.removeEventListener('visibilitychange', onVisibility);
    clear();
    s.interactQueued = false;
    s.pauseToggleQueued = false;
  };
}

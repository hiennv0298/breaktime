import { axisFromHeld, classifyKey, createCtrlTap, isTypingTarget } from '../logic/keyMap';
import type { InputState } from './inputState';

/** The one code whose default action (page scroll, focused-button click) is swallowed on keydown and keyup. */
const SPACE = 'Space';

/**
 * Desktop keyboard, key map D-27 (15/09/2026; CTRL-01, CTRL-04, D-18 / D-20 revised):
 * arrow keys or WASD move, Space (or E) acts, Escape or a lone Ctrl press-and-release toggles the pause / settings menu.
 * Keys pressed with Ctrl, Meta or Alt held are ignored and never default-prevented, so browser shortcuts keep working.
 * Keys typed into a text field never drive the game (only Escape passes, to close the menu).
 * Camera rotation (Z / C) lives in cameraKeys.ts. Uses KeyboardEvent.code only, so the layout does not matter.
 * Returns a detach function.
 */
export function attachKeyboard(s: InputState): () => void {
  const held = new Set<string>();
  const ctrlTap = createCtrlTap();

  function recompute(): void {
    const axis = axisFromHeld(held);
    s.moveX = axis.x;
    s.moveY = axis.y;
  }

  function clear(): void {
    held.clear();
    recompute();
    ctrlTap.reset();
  }

  function onKeyDown(e: KeyboardEvent): void {
    const typing = isTypingTarget(e.target);
    if (typing && e.code !== 'Escape') return;
    ctrlTap.down(e.code, e.repeat);

    const intent = classifyKey(e.code, e);
    switch (intent) {
      case 'up':
      case 'down':
      case 'left':
      case 'right':
        held.add(e.code);
        recompute();
        // Arrow keys would scroll a scrollable ancestor.
        if (e.code.startsWith('Arrow')) e.preventDefault();
        break;
      case 'action':
        // Space would scroll the page or click a focused button: always swallow it (repeats too).
        if (e.code === SPACE) e.preventDefault();
        if (!e.repeat) s.interactQueued = true;
        break;
      case 'pause':
        if (!e.repeat) s.pauseToggleQueued = true;
        break;
      case 'npc-add':
        if (!e.repeat) s.npcDelta = Math.min(s.npcDelta + 1, 15);
        break;
      case 'npc-remove':
        if (!e.repeat) s.npcDelta = Math.max(s.npcDelta - 1, -15);
        break;
      default:
        // 'ctrl', rotate intents (cameraKeys.ts) and unbound or modified keys: untouched, never default-prevented.
        break;
    }
  }

  function onKeyUp(e: KeyboardEvent): void {
    // Always release, even inside a text field, so no key sticks after focus moves.
    if (held.delete(e.code)) recompute();
    const tap = ctrlTap.up(e.code);
    if (isTypingTarget(e.target)) return;
    if (e.code === SPACE) e.preventDefault(); // a focused button activates on Space keyup
    if (tap) s.pauseToggleQueued = true;
  }

  function onInterrupt(): void {
    ctrlTap.interrupt();
  }

  function onVisibility(): void {
    if (document.visibilityState === 'hidden') clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  // Ctrl + click / Ctrl + wheel (zoom) are not a lone Ctrl tap.
  window.addEventListener('pointerdown', onInterrupt, { capture: true });
  window.addEventListener('wheel', onInterrupt, { passive: true });
  // A key released while the window has no focus never sends keyup: drop held keys so the player does not run away.
  window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('pointerdown', onInterrupt, { capture: true });
    window.removeEventListener('wheel', onInterrupt);
    window.removeEventListener('blur', clear);
    document.removeEventListener('visibilitychange', onVisibility);
    clear();
    s.interactQueued = false;
    s.pauseToggleQueued = false;
  };
}

/**
 * Desktop key map D-27 (15/09/2026; replaces D-20, revises D-18 / D-19; CTRL-01, CTRL-04).
 * Pure: no three.js, no DOM globals, so it runs in Node under Vitest (TECH-06).
 *
 * - Arrow keys and WASD move (camera-relative; both at once are not faster).
 * - Space is the action key; E is its secondary alias.
 * - Escape, or Ctrl pressed and released alone, toggles the settings / pause menu.
 * - Z / C rotate the camera; arrow keys never rotate.
 * - D-02 (plan 02-04): + / − (Equal or NumpadAdd, Minus or NumpadSubtract) add or remove a coworker in play; wired in
 *   plan 02-08 (keyboard.ts ignores these intents until then). Ctrl± stays browser zoom.
 * - Any key with Ctrl, Meta or Alt held is not a game key, so browser shortcuts keep working.
 *
 * Codes are KeyboardEvent.code values, so the physical keys do not change with the layout (AZERTY, Vietnamese IME).
 */

export type KeyIntent =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'action'
  | 'pause'
  | 'ctrl'
  | 'rotate-left'
  | 'rotate-right'
  | 'npc-add'
  | 'npc-remove'
  | null;

export interface KeyMods {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

type Bound = Exclude<KeyIntent, null>;

const BINDINGS: Readonly<Record<string, Bound>> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'action',
  KeyE: 'action',
  Escape: 'pause',
  ControlLeft: 'ctrl',
  ControlRight: 'ctrl',
  KeyZ: 'rotate-left',
  KeyC: 'rotate-right',
  Equal: 'npc-add',
  NumpadAdd: 'npc-add',
  Minus: 'npc-remove',
  NumpadSubtract: 'npc-remove',
};

function isCtrlCode(code: string): boolean {
  return code === 'ControlLeft' || code === 'ControlRight';
}

/** Intent of one key event; null for unbound keys and for anything pressed with a modifier held. */
export function classifyKey(code: string, mods: KeyMods): KeyIntent {
  if (!Object.prototype.hasOwnProperty.call(BINDINGS, code)) return null;
  if (mods.metaKey || mods.altKey) return null;
  // A Control keydown itself reports ctrlKey true; every other key with Ctrl held is a browser shortcut.
  if (mods.ctrlKey && !isCtrlCode(code)) return null;
  return BINDINGS[code];
}

/** Movement axes from the set of held codes: x -1 left .. +1 right, y -1 back .. +1 forward. */
export function axisFromHeld(held: ReadonlySet<string>): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  for (const code of held) {
    if (!Object.prototype.hasOwnProperty.call(BINDINGS, code)) continue;
    const intent = BINDINGS[code];
    if (intent === 'up') up = true;
    else if (intent === 'down') down = true;
    else if (intent === 'left') left = true;
    else if (intent === 'right') right = true;
  }
  return { x: sign(right, left), y: sign(up, down) };
}

function sign(pos: boolean, neg: boolean): -1 | 0 | 1 {
  if (pos === neg) return 0;
  return pos ? 1 : -1;
}

/**
 * Lone-Ctrl detector (D-27): fires only when Control is pressed and released with no other key down,
 * pointer press or wheel in between. Keys already held before Control (walking) and key releases do not disarm it.
 */
export interface CtrlTap {
  /** Every keydown, in order. */
  down(code: string, repeat: boolean): void;
  /** Every keyup; returns true when this release completes a lone Ctrl tap. */
  up(code: string): boolean;
  /** A pointer press or wheel while Control is held: not a lone tap. */
  interrupt(): void;
  /** Focus lost / tab hidden: forget everything. */
  reset(): void;
}

export function createCtrlTap(): CtrlTap {
  let controlHeld = false;
  let armed = false;
  return {
    down(code, repeat) {
      if (isCtrlCode(code)) {
        if (!repeat) {
          controlHeld = true;
          armed = true;
        }
        return;
      }
      if (controlHeld) armed = false;
    },
    up(code) {
      if (!isCtrlCode(code)) return false;
      const tap = armed;
      controlHeld = false;
      armed = false;
      return tap;
    },
    interrupt() {
      armed = false;
    },
    reset() {
      controlHeld = false;
      armed = false;
    },
  };
}

/** Input types that do not take typed text (keys pressed on them stay game keys). */
const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/**
 * True when a key event target takes typed text (text-like input, textarea, select, contenteditable).
 * Inspects plain properties of an unknown value, so it needs no DOM globals.
 */
export function isTypingTarget(t: unknown): boolean {
  if (typeof t !== 'object' || t === null) return false;
  const el = t as { tagName?: unknown; type?: unknown; isContentEditable?: unknown };
  if (el.isContentEditable === true) return true;
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = typeof el.type === 'string' ? el.type.toLowerCase() : '';
  return !NON_TEXT_INPUT_TYPES.has(type);
}

/** Desktop key hint rows (D-28), rendered by the key hint panel of plan 01-25. */
export const KEY_HINTS: ReadonlyArray<{ keys: string; label: string }> = [
  { keys: '←↑→↓', label: 'đi' },
  { keys: 'Space', label: 'đánh' },
  { keys: 'Ctrl/Esc', label: 'settings' },
  { keys: 'Z/C', label: 'xoay' },
];

import { describe, expect, it } from 'vitest';
import {
  axisFromHeld,
  classifyKey,
  createCtrlTap,
  isTypingTarget,
  KEY_HINTS,
  type KeyIntent,
  type KeyMods,
} from '../../src/logic/keyMap';

/* Plan 01-22: desktop key map D-27 (D-18 / D-19 / D-20 revised 15/09/2026, CTRL-01, CTRL-04). */

const NONE: KeyMods = { ctrlKey: false, metaKey: false, altKey: false };
const CTRL: KeyMods = { ctrlKey: true, metaKey: false, altKey: false };
const META: KeyMods = { ctrlKey: false, metaKey: true, altKey: false };
const ALT: KeyMods = { ctrlKey: false, metaKey: false, altKey: true };

const BOUND: ReadonlyArray<[string, KeyIntent]> = [
  ['KeyW', 'up'],
  ['ArrowUp', 'up'],
  ['KeyS', 'down'],
  ['ArrowDown', 'down'],
  ['KeyA', 'left'],
  ['ArrowLeft', 'left'],
  ['KeyD', 'right'],
  ['ArrowRight', 'right'],
  ['Space', 'action'],
  ['KeyE', 'action'],
  ['Escape', 'pause'],
  ['ControlLeft', 'ctrl'],
  ['ControlRight', 'ctrl'],
  ['KeyZ', 'rotate-left'],
  ['KeyC', 'rotate-right'],
];

describe('classifyKey without modifiers', () => {
  it.each(BOUND)('%s -> %s', (code, intent) => {
    expect(classifyKey(code, NONE)).toBe(intent);
  });

  it.each(['KeyQ', 'Backquote', 'Tab', 'Enter', 'ShiftLeft', 'KeyR', ''])('%s -> null', (code) => {
    expect(classifyKey(code, NONE)).toBeNull();
  });

  it('uses KeyboardEvent.code, not the typed character', () => {
    expect(classifyKey('w', NONE)).toBeNull();
    expect(classifyKey(' ', NONE)).toBeNull();
    expect(classifyKey('Esc', NONE)).toBeNull();
  });
});

describe('classifyKey with modifiers (browser shortcuts are never game keys)', () => {
  const nonCtrl = BOUND.filter(([code]) => code !== 'ControlLeft' && code !== 'ControlRight');

  it.each(nonCtrl)('Ctrl+%s -> null', (code) => {
    expect(classifyKey(code, CTRL)).toBeNull();
  });

  it.each(nonCtrl)('Meta+%s -> null', (code) => {
    expect(classifyKey(code, META)).toBeNull();
  });

  it.each(nonCtrl)('Alt+%s -> null', (code) => {
    expect(classifyKey(code, ALT)).toBeNull();
  });

  it('named shortcuts: Ctrl+W, Ctrl+R, Ctrl+Z, Meta+R, Alt+ArrowLeft, Ctrl+Space, Ctrl+Escape', () => {
    expect(classifyKey('KeyW', CTRL)).toBeNull();
    expect(classifyKey('KeyR', CTRL)).toBeNull();
    expect(classifyKey('KeyZ', CTRL)).toBeNull();
    expect(classifyKey('KeyR', META)).toBeNull();
    expect(classifyKey('ArrowLeft', ALT)).toBeNull();
    expect(classifyKey('Space', CTRL)).toBeNull();
    expect(classifyKey('Escape', CTRL)).toBeNull();
  });

  it('a Control keydown reports ctrlKey true and stays ctrl', () => {
    expect(classifyKey('ControlLeft', CTRL)).toBe('ctrl');
    expect(classifyKey('ControlRight', CTRL)).toBe('ctrl');
  });

  it('Control with Meta or Alt held is null', () => {
    expect(classifyKey('ControlLeft', META)).toBeNull();
    expect(classifyKey('ControlRight', ALT)).toBeNull();
    expect(classifyKey('ControlLeft', { ctrlKey: true, metaKey: true, altKey: false })).toBeNull();
    expect(classifyKey('ControlRight', { ctrlKey: true, metaKey: false, altKey: true })).toBeNull();
  });
});

describe('axisFromHeld', () => {
  it('empty set is idle', () => {
    expect(axisFromHeld(new Set())).toEqual({ x: 0, y: 0 });
  });

  it('D is right', () => {
    expect(axisFromHeld(new Set(['KeyD']))).toEqual({ x: 1, y: 0 });
  });

  it('D and ArrowRight together are not faster', () => {
    expect(axisFromHeld(new Set(['KeyD', 'ArrowRight']))).toEqual({ x: 1, y: 0 });
  });

  it('A and D cancel', () => {
    expect(axisFromHeld(new Set(['KeyA', 'KeyD']))).toEqual({ x: 0, y: 0 });
  });

  it('ArrowLeft and KeyD cancel', () => {
    expect(axisFromHeld(new Set(['ArrowLeft', 'KeyD']))).toEqual({ x: 0, y: 0 });
  });

  it('ArrowUp is forward', () => {
    expect(axisFromHeld(new Set(['ArrowUp']))).toEqual({ x: 0, y: 1 });
  });

  it('S and ArrowUp cancel', () => {
    expect(axisFromHeld(new Set(['KeyS', 'ArrowUp']))).toEqual({ x: 0, y: 0 });
  });

  it('ArrowDown + KeyA is back-left', () => {
    expect(axisFromHeld(new Set(['ArrowDown', 'KeyA']))).toEqual({ x: -1, y: -1 });
  });

  it('unrelated codes are ignored', () => {
    expect(axisFromHeld(new Set(['KeyE', 'Space', 'KeyZ', 'ControlLeft', 'KeyW']))).toEqual({ x: 0, y: 1 });
  });
});

describe('createCtrlTap (lone Ctrl opens the menu, combos never do)', () => {
  it('ControlLeft down then up is a tap', () => {
    const t = createCtrlTap();
    t.down('ControlLeft', false);
    expect(t.up('ControlLeft')).toBe(true);
  });

  it('ControlRight down then up is a tap', () => {
    const t = createCtrlTap();
    t.down('ControlRight', false);
    expect(t.up('ControlRight')).toBe(true);
  });

  it('Ctrl+R is not a tap', () => {
    const t = createCtrlTap();
    t.down('ControlLeft', false);
    t.down('KeyR', false);
    expect(t.up('ControlLeft')).toBe(false);
  });

  it('Ctrl+Shift is not a tap', () => {
    const t = createCtrlTap();
    t.down('ControlLeft', false);
    t.down('ShiftLeft', false);
    expect(t.up('ControlLeft')).toBe(false);
  });

  it('auto-repeat Control downs keep the tap armed', () => {
    const t = createCtrlTap();
    t.down('ControlLeft', false);
    for (let i = 0; i < 5; i++) t.down('ControlLeft', true);
    expect(t.up('ControlLeft')).toBe(true);
  });

  it('interrupt (pointer / wheel) disarms', () => {
    const t = createCtrlTap();
    t.down('ControlLeft', false);
    t.interrupt();
    expect(t.up('ControlLeft')).toBe(false);
  });

  it('a movement key already held before Control does not disarm', () => {
    const t = createCtrlTap();
    t.down('KeyW', false);
    t.down('ControlLeft', false);
    expect(t.up('ControlLeft')).toBe(true);
  });

  it('releasing another key while Control is held does not disarm', () => {
    const t = createCtrlTap();
    t.down('ControlLeft', false);
    expect(t.up('KeyW')).toBe(false);
    expect(t.up('ControlLeft')).toBe(true);
  });

  it('Control up without a down is not a tap', () => {
    const t = createCtrlTap();
    expect(t.up('ControlLeft')).toBe(false);
  });

  it('reset clears a pending tap', () => {
    const t = createCtrlTap();
    t.down('ControlLeft', false);
    t.reset();
    expect(t.up('ControlLeft')).toBe(false);
  });

  it('a second tap after a successful one works again', () => {
    const t = createCtrlTap();
    t.down('ControlLeft', false);
    expect(t.up('ControlLeft')).toBe(true);
    expect(t.up('ControlLeft')).toBe(false);
    t.down('ControlRight', false);
    expect(t.up('ControlRight')).toBe(true);
  });

  it('a failed combo does not poison the next lone tap', () => {
    const t = createCtrlTap();
    t.down('ControlLeft', false);
    t.down('KeyZ', false);
    expect(t.up('ControlLeft')).toBe(false);
    t.down('ControlLeft', false);
    expect(t.up('ControlLeft')).toBe(true);
  });
});

describe('isTypingTarget', () => {
  it('text-like inputs are typing targets', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isTypingTarget({ isContentEditable: true })).toBe(true);
  });

  it('non-text inputs are not typing targets', () => {
    expect(isTypingTarget({ tagName: 'INPUT', type: 'button' })).toBe(false);
    expect(isTypingTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isTypingTarget({ tagName: 'INPUT', type: 'range' })).toBe(false);
  });

  it('everything else is not a typing target', () => {
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTypingTarget({ tagName: 'DIV' })).toBe(false);
    expect(isTypingTarget({ isContentEditable: false, tagName: 'DIV' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(undefined)).toBe(false);
    expect(isTypingTarget(42)).toBe(false);
    expect(isTypingTarget('INPUT')).toBe(false);
  });
});

describe('npc-add / npc-remove (plan 02-04, D-02)', () => {
  const NPC_KEYS: ReadonlyArray<[string, KeyIntent]> = [
    ['Equal', 'npc-add'],
    ['NumpadAdd', 'npc-add'],
    ['Minus', 'npc-remove'],
    ['NumpadSubtract', 'npc-remove'],
  ];

  it.each(NPC_KEYS)('%s -> %s', (code, intent) => {
    expect(classifyKey(code, NONE)).toBe(intent);
  });

  it.each(NPC_KEYS)('Ctrl / Meta / Alt + %s -> null (browser zoom and shortcuts stay browser keys)', (code) => {
    expect(classifyKey(code, CTRL)).toBeNull();
    expect(classifyKey(code, META)).toBeNull();
    expect(classifyKey(code, ALT)).toBeNull();
  });

  it("Shift is not a modifier here, so Shift+Equal ('+' on US layouts) is still npc-add", () => {
    // KeyMods has no shiftKey; a real KeyboardEvent with shiftKey true passes the same three flags.
    const shiftEqual = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: true };
    expect(classifyKey('Equal', shiftEqual)).toBe('npc-add');
  });

  it('axisFromHeld ignores the four codes', () => {
    expect(axisFromHeld(new Set(['Equal', 'KeyW']))).toEqual({ x: 0, y: 1 });
    expect(axisFromHeld(new Set(['Equal', 'NumpadAdd', 'Minus', 'NumpadSubtract']))).toEqual({ x: 0, y: 0 });
  });
});

describe('KEY_HINTS (D-28 rows, rendered by plan 01-25)', () => {
  it('is exactly the four rows in order', () => {
    expect(KEY_HINTS).toEqual([
      { keys: '←↑→↓', label: 'đi' },
      { keys: 'Space', label: 'đánh' },
      { keys: 'Ctrl/Esc', label: 'settings' },
      { keys: 'Z/C', label: 'xoay' },
    ]);
  });
});

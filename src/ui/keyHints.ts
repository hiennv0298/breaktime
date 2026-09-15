import { registerDebug } from '../debug/testHook';
import { isTouchUi } from '../input/touchButtons';
import { KEY_HINTS } from '../logic/keyMap';
import {
  KEY_HINT_DIM_MS,
  KEY_HINTS_STORAGE_KEY,
  parseKeyHintsPref,
  serializeKeyHintsPref,
  shouldShowTouchHint,
  TOUCH_HINT_MS,
  TOUCH_HINT_SEEN_KEY,
} from '../logic/uiPrefs';
import './keyHints.css';

/**
 * Key hints (D-28, CTRL-06).
 * - Desktop: aside#key-hints bottom-left lists the KEY_HINTS rows of the key map (single source with the bindings),
 *   dims after KEY_HINT_DIM_MS and comes back while hovered (pure CSS).
 * - Touch: the panel is hidden; div#touch-hint shows once per device in the right half (never over the joystick half
 *   or a HUD button) and hides after TOUCH_HINT_MS or on the first touch.
 * - The pause menu toggle persists in localStorage; every storage access sits in try/catch (portal rule, T-01-25-02).
 * Built with createElement/textContent only (T-01-25-04). Both layers carry data-hud-panel, so clicks never swing.
 */
export interface KeyHints {
  enabled(): boolean;
  setEnabled(on: boolean): void;
  /** Called on every enabled change; returns an unsubscribe function. */
  onChange(cb: (on: boolean) => void): () => void;
}

const TOUCH_HINT_TEXT = 'Chạm nửa trái màn hình để đi · nút tròn để đánh · nút tạm dừng để mở cài đặt';

let instance: KeyHints | null = null;
let suppressed = false;
let applyAll: (() => void) | null = null;

/** Hides the panel and the touch hint without touching the stored choice (bench / soak runs, plans 01-17 / 01-18). */
export function suppressKeyHints(on: boolean): void {
  suppressed = on;
  applyAll?.();
}

function readStored(key: string): { ok: boolean; value: string | null } {
  try {
    return { ok: true, value: window.localStorage.getItem(key) };
  } catch {
    return { ok: false, value: null };
  }
}

function writeStored(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    // Quota exceeded / private mode / storage disabled: the choice still applies for this session.
    return false;
  }
}

/** Mounts #key-hints and #touch-hint once and returns the shared controller. */
export function createKeyHints(): KeyHints {
  if (instance) return instance;

  const pref = readStored(KEY_HINTS_STORAGE_KEY);
  const seen = readStored(TOUCH_HINT_SEEN_KEY);
  let storageOk = pref.ok && seen.ok;
  let enabled = parseKeyHintsPref(pref.value);
  let touchSeen = false;
  const listeners = new Set<(on: boolean) => void>();

  // ---------- Desktop panel ----------
  const panel = document.createElement('aside');
  panel.id = 'key-hints';
  panel.setAttribute('data-hud-panel', '');
  panel.setAttribute('aria-label', 'Phím điều khiển');
  for (const row of KEY_HINTS) {
    const r = document.createElement('div');
    r.className = 'row';
    const kbd = document.createElement('kbd');
    kbd.textContent = row.keys;
    const label = document.createElement('span');
    label.textContent = row.label;
    r.append(kbd, label);
    panel.appendChild(r);
  }

  // ---------- Touch hint ----------
  const touchHint = document.createElement('div');
  touchHint.id = 'touch-hint';
  touchHint.setAttribute('data-hud-panel', '');
  touchHint.setAttribute('aria-live', 'polite');
  touchHint.textContent = TOUCH_HINT_TEXT;
  touchHint.hidden = true;

  const touchUi = (): boolean => touchSeen || isTouchUi();

  // Shown once per device: decided when play starts (a hint appearing mid-game on a touch laptop would only be
  // dismissed by the same touch that would reveal it).
  let touchHintActive = touchUi() && shouldShowTouchHint(seen.value) && !suppressed;
  if (touchHintActive && !writeStored(TOUCH_HINT_SEEN_KEY, '1')) storageOk = false;

  function apply(): void {
    panel.hidden = !(enabled && !suppressed && !touchUi());
    touchHint.hidden = !(touchHintActive && !suppressed);
  }
  applyAll = apply;

  function dismissTouchHint(): void {
    if (!touchHintActive) return;
    touchHintActive = false;
    apply();
  }

  // First touch anywhere: dismiss the hint, and switch a touch laptop to the touch UI (panel hidden).
  function onFirstTouch(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return;
    touchSeen = true;
    window.removeEventListener('pointerdown', onFirstTouch, { capture: true });
    dismissTouchHint();
    apply();
  }
  window.addEventListener('pointerdown', onFirstTouch, { capture: true });

  const mq = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null;
  mq?.addEventListener('change', apply);

  window.setTimeout(() => panel.classList.add('dim'), KEY_HINT_DIM_MS);
  if (touchHintActive) window.setTimeout(dismissTouchHint, TOUCH_HINT_MS);

  apply();
  document.body.append(panel, touchHint);

  instance = {
    enabled: () => enabled,
    setEnabled(on) {
      if (!writeStored(KEY_HINTS_STORAGE_KEY, serializeKeyHintsPref(on))) storageOk = false;
      if (on === enabled) return;
      enabled = on;
      apply();
      for (const cb of listeners) cb(on);
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };

  registerDebug('keyHints', () => ({
    enabled,
    visible: !panel.hidden,
    dimmed: panel.classList.contains('dim'),
    touchUi: touchUi(),
    touchHintVisible: !touchHint.hidden,
    storageOk,
  }));

  return instance;
}

/** Pause-menu section: button#key-hints-toggle "Bảng phím" (aria-pressed mirrors the enabled state). */
export function createKeyHintsSection(hints: KeyHints): HTMLElement {
  const section = document.createElement('div');
  section.className = 'hints-section';

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = 'Hướng dẫn phím';

  const toggle = document.createElement('button');
  toggle.id = 'key-hints-toggle';
  toggle.type = 'button';
  toggle.textContent = 'Bảng phím';
  const mark = (on: boolean): void => toggle.setAttribute('aria-pressed', String(on));
  mark(hints.enabled());
  hints.onChange(mark);
  toggle.addEventListener('click', () => hints.setEnabled(!hints.enabled()));

  section.append(label, toggle);
  return section;
}

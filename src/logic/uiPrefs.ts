/**
 * Key hint preference rules (D-28, CTRL-06). Pure: no three.js, no DOM globals and no storage access, so it runs in
 * Node under Vitest (TECH-06). The key hint UI reads and writes storage itself, inside try/catch.
 *
 * Stored values can be edited by the visitor (T-01-25-01): only the literal '0' turns the panel off and only the
 * literal '1' marks the touch hint as seen; anything else falls back to the defaults.
 */

/** '1' panel on, '0' panel off. */
export const KEY_HINTS_STORAGE_KEY = 'bt.keyHints';
/** '1' once the one-time touch hint has been shown on this device. */
export const TOUCH_HINT_SEEN_KEY = 'bt.touchHintSeen';

/** The desktop panel dims this long after play starts. */
export const KEY_HINT_DIM_MS = 4000;
/** Opacity of the dimmed panel (the CSS uses the same value). */
export const KEY_HINT_DIM_OPACITY = 0.3;
/** The touch hint hides on its own after this long. */
export const TOUCH_HINT_MS = 6000;

/** Panel enabled from a stored value: on unless the value is exactly '0'. */
export function parseKeyHintsPref(raw: string | null): boolean {
  return raw !== '0';
}

export function serializeKeyHintsPref(on: boolean): '1' | '0' {
  return on ? '1' : '0';
}

/** Touch hint should show unless the stored value is exactly '1'. */
export function shouldShowTouchHint(raw: string | null): boolean {
  return raw !== '1';
}

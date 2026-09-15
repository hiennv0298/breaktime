import { describe, expect, it } from 'vitest';
import {
  KEY_HINT_DIM_MS,
  KEY_HINT_DIM_OPACITY,
  KEY_HINTS_STORAGE_KEY,
  parseKeyHintsPref,
  serializeKeyHintsPref,
  shouldShowTouchHint,
  TOUCH_HINT_MS,
  TOUCH_HINT_SEEN_KEY,
} from '../../src/logic/uiPrefs';

describe('key hint preference (D-28, T-01-25-01)', () => {
  it('uses the bt.* storage keys', () => {
    expect(KEY_HINTS_STORAGE_KEY).toBe('bt.keyHints');
    expect(TOUCH_HINT_SEEN_KEY).toBe('bt.touchHintSeen');
  });

  it("only the literal '0' turns the panel off", () => {
    expect(parseKeyHintsPref('0')).toBe(false);
    for (const raw of ['1', null, '', 'true', 'false', 'garbage', '00', ' 0', '0 ']) {
      expect(parseKeyHintsPref(raw), JSON.stringify(raw)).toBe(true);
    }
  });

  it('serializes to 1 / 0 and round-trips', () => {
    expect(serializeKeyHintsPref(true)).toBe('1');
    expect(serializeKeyHintsPref(false)).toBe('0');
    for (const on of [true, false]) expect(parseKeyHintsPref(serializeKeyHintsPref(on))).toBe(on);
  });
});

describe('one-time touch hint', () => {
  it("shows unless the stored value is exactly '1'", () => {
    for (const raw of [null, '', '0', 'yes', 'true', ' 1', '11']) {
      expect(shouldShowTouchHint(raw), JSON.stringify(raw)).toBe(true);
    }
    expect(shouldShowTouchHint('1')).toBe(false);
  });
});

describe('timing constants', () => {
  it('dims after a few seconds to about 30%', () => {
    expect(KEY_HINT_DIM_MS).toBeGreaterThanOrEqual(2000);
    expect(KEY_HINT_DIM_MS).toBeLessThanOrEqual(6000);
    expect(KEY_HINT_DIM_OPACITY).toBe(0.3);
  });

  it('shows the touch hint for 4 to 8 seconds', () => {
    expect(TOUCH_HINT_MS).toBeGreaterThanOrEqual(4000);
    expect(TOUCH_HINT_MS).toBeLessThanOrEqual(8000);
  });
});

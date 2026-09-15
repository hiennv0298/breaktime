import { describe, expect, it } from 'vitest';
import { createSwingGate, SWING_COOLDOWN_MS } from '../../src/logic/swing';

describe('swing gate (D-30)', () => {
  it('uses a 350 ms cooldown by default', () => {
    expect(SWING_COOLDOWN_MS).toBe(350);
  });

  it('accepts the first press, drops presses inside the cooldown, accepts again at exactly 350 ms', () => {
    const g = createSwingGate();
    expect(g.count()).toBe(0);
    expect(g.tryStart(1000)).toBe(true);
    expect(g.tryStart(1100)).toBe(false);
    expect(g.tryStart(1349)).toBe(false);
    expect(g.tryStart(1350)).toBe(true);
    expect(g.count()).toBe(2);
    expect(g.lastMs()).toBe(1350);
  });

  it('a dropped press does not extend the cooldown', () => {
    const g = createSwingGate();
    expect(g.tryStart(0)).toBe(true);
    expect(g.tryStart(349)).toBe(false);
    expect(g.tryStart(350)).toBe(true);
    expect(g.lastMs()).toBe(350);
  });

  it('the very first press is accepted whatever the clock reads', () => {
    expect(createSwingGate().tryStart(0)).toBe(true);
    expect(createSwingGate().tryStart(10)).toBe(true);
  });

  it('a non-finite time is rejected and changes nothing', () => {
    const g = createSwingGate();
    expect(g.tryStart(NaN)).toBe(false);
    expect(g.tryStart(Infinity)).toBe(false);
    expect(g.count()).toBe(0);
    expect(g.tryStart(1000)).toBe(true);
    expect(g.tryStart(NaN)).toBe(false);
    expect(g.count()).toBe(1);
    expect(g.lastMs()).toBe(1000);
  });

  it('a clock that goes backwards never starts a swing inside the cooldown', () => {
    const g = createSwingGate();
    expect(g.tryStart(1000)).toBe(true);
    expect(g.tryStart(500)).toBe(false);
    expect(g.count()).toBe(1);
  });

  it('cooldown 0 accepts every call', () => {
    const g = createSwingGate(0);
    for (const t of [0, 0, 1, 1, 2, 100]) expect(g.tryStart(t)).toBe(true);
    expect(g.count()).toBe(6);
  });

  it('a negative or NaN cooldown falls back to SWING_COOLDOWN_MS', () => {
    for (const bad of [-1, -350, NaN]) {
      const g = createSwingGate(bad);
      expect(g.tryStart(1000)).toBe(true);
      expect(g.tryStart(1000 + SWING_COOLDOWN_MS - 1)).toBe(false);
      expect(g.tryStart(1000 + SWING_COOLDOWN_MS)).toBe(true);
    }
  });
});

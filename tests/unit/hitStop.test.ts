import { describe, expect, it } from 'vitest';
import { createHitStop } from '../../src/logic/hitStop';

describe('hitStop', () => {
  it('is inactive before any trigger', () => {
    const h = createHitStop();
    expect(h.active(0)).toBe(false);
    expect(h.active(1e9)).toBe(false);
    expect(h.count()).toBe(0);
  });

  it('trigger(1000, 60) is active at 1030 and over at 1061', () => {
    const h = createHitStop();
    h.trigger(1000, 60);
    expect(h.active(999)).toBe(false);
    expect(h.active(1000)).toBe(true);
    expect(h.active(1030)).toBe(true);
    expect(h.active(1061)).toBe(false);
    expect(h.count()).toBe(1);
  });

  it('an overlapping trigger extends the freeze from its own start', () => {
    const h = createHitStop();
    h.trigger(1000, 60);
    h.trigger(1040, 60);
    expect(h.active(1090)).toBe(true);
    expect(h.active(1101)).toBe(false);
    expect(h.count()).toBe(2);
  });

  it('a shorter later trigger never cuts an active freeze short', () => {
    const h = createHitStop();
    h.trigger(1000, 60);
    h.trigger(1010, 10);
    expect(h.active(1050)).toBe(true);
    expect(h.active(1061)).toBe(false);
  });

  it('ignores non-finite or negative input and does not count it', () => {
    const h = createHitStop();
    h.trigger(Number.NaN, 60);
    h.trigger(1000, Number.POSITIVE_INFINITY);
    h.trigger(1000, -5);
    expect(h.count()).toBe(0);
    expect(h.active(1000)).toBe(false);
    expect(h.active(Number.NaN)).toBe(false);
  });

  it('caps one freeze at 1 s', () => {
    const h = createHitStop();
    h.trigger(0, 1e7);
    expect(h.active(999)).toBe(true);
    expect(h.active(1001)).toBe(false);
  });
});

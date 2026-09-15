import { describe, expect, it } from 'vitest';
import { createFpsMeter, looksThrottled, median, summarize } from '../../src/logic/benchStats';

describe('summarize (D-08)', () => {
  it('100 frames of 16.667 ms are 60 fps average and 60 fps 1% low', () => {
    const r = summarize(new Array(100).fill(16.667));
    expect(r.frames).toBe(100);
    expect(Math.abs(r.avgFps - 60)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(r.low1Fps - 60)).toBeLessThanOrEqual(0.5);
  });

  it('one 100 ms hitch in 100 frames makes the 1% low 10 fps', () => {
    const frames = [...new Array(99).fill(16.667), 100];
    const r = summarize(frames);
    expect(r.frames).toBe(100);
    expect(Math.abs(r.low1Fps - 10)).toBeLessThanOrEqual(0.1);
    expect(r.avgFps).toBeLessThan(60);
  });

  it('an empty list is all zeros', () => {
    expect(summarize([])).toEqual({ avgFps: 0, low1Fps: 0, frames: 0 });
  });

  it('does not reorder the input', () => {
    const frames = [30, 10, 20];
    summarize(frames);
    expect(frames).toEqual([30, 10, 20]);
  });
});

describe('median', () => {
  it('returns the middle value of an odd list and does not mutate it', () => {
    const a = [5, 1, 3];
    expect(median(a)).toBe(3);
    expect(a).toEqual([5, 1, 3]);
  });

  it('averages the two middle values of an even list', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('is 0 for an empty list', () => {
    expect(median([])).toBe(0);
  });
});

describe('looksThrottled (Pitfall 3)', () => {
  it('33.4 ms intervals with 4 ms work look like a rAF cap', () => {
    expect(looksThrottled(new Array(90).fill(33.4), new Array(90).fill(4))).toBe(true);
  });

  it('33.4 ms intervals with 20 ms work are really slow', () => {
    expect(looksThrottled(new Array(90).fill(33.4), new Array(90).fill(20))).toBe(false);
  });

  it('16.7 ms intervals are not throttled', () => {
    expect(looksThrottled(new Array(180).fill(16.7), new Array(180).fill(4))).toBe(false);
  });

  it('empty samples are not throttled', () => {
    expect(looksThrottled([], [])).toBe(false);
  });
});

describe('createFpsMeter', () => {
  it('reads about 60 fps after 2 s of 16.667 ms frames with a 1000 ms window', () => {
    const m = createFpsMeter(1000);
    for (let t = 0; t <= 2000; t += 16.667) m.push(t);
    expect(Math.abs(m.fps() - 60)).toBeLessThanOrEqual(1);
  });

  it('only counts frames inside the window', () => {
    const m = createFpsMeter(1000);
    for (let t = 0; t <= 1000; t += 10) m.push(t); // 100 fps
    for (let t = 1050; t <= 3000; t += 50) m.push(t); // then 20 fps
    expect(Math.abs(m.fps() - 20)).toBeLessThanOrEqual(1);
  });

  it('is 0 with fewer than two frames', () => {
    const m = createFpsMeter();
    expect(m.fps()).toBe(0);
    m.push(100);
    expect(m.fps()).toBe(0);
  });
});

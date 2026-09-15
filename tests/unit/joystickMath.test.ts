import { describe, expect, it } from 'vitest';
import { stick } from '../../src/logic/joystickMath';

const EPS = 1e-9;

describe('stick (pointer offset to move vector, D-17)', () => {
  it('finger on the origin gives no movement', () => {
    const s = stick(100, 100, 100, 100, 60);
    expect(Math.abs(s.x)).toBeLessThan(EPS);
    expect(Math.abs(s.y)).toBeLessThan(EPS);
    expect(Math.abs(s.knobX)).toBeLessThan(EPS);
    expect(Math.abs(s.knobY)).toBeLessThan(EPS);
  });

  it('offset equal to the radius to the right gives full x', () => {
    const s = stick(100, 100, 160, 100, 60);
    expect(Math.abs(s.x - 1)).toBeLessThan(EPS);
    expect(Math.abs(s.y)).toBeLessThan(EPS);
    expect(Math.abs(s.knobX - 60)).toBeLessThan(EPS);
  });

  it('offset beyond the radius clamps the knob to the radius and the vector to length 1', () => {
    const s = stick(100, 100, 300, 100, 60);
    expect(Math.abs(Math.hypot(s.knobX, s.knobY) - 60)).toBeLessThan(EPS);
    expect(Math.abs(Math.hypot(s.x, s.y) - 1)).toBeLessThan(EPS);
    expect(s.x).toBeGreaterThan(0);
  });

  it('clamps diagonals too (length 1, direction kept)', () => {
    const s = stick(0, 0, 300, -400, 60);
    expect(Math.abs(Math.hypot(s.x, s.y) - 1)).toBeLessThan(EPS);
    expect(Math.abs(s.x - 0.6)).toBeLessThan(EPS);
    expect(Math.abs(s.y + 0.8)).toBeLessThan(EPS);
  });

  it('inside the 0.12 dead zone gives no movement but the knob still follows', () => {
    const s = stick(100, 100, 105, 100, 60);
    expect(s.x).toBe(0);
    expect(s.y).toBe(0);
    expect(Math.abs(s.knobX - 5)).toBeLessThan(EPS);
  });

  it('just outside the dead zone moves proportionally', () => {
    const s = stick(100, 100, 100, 130, 60); // half radius down (screen +y)
    expect(Math.abs(s.x)).toBeLessThan(EPS);
    expect(Math.abs(s.y - 0.5)).toBeLessThan(EPS);
  });

  it('a custom dead zone is honoured', () => {
    expect(stick(0, 0, 20, 0, 60, 0.5)).toMatchObject({ x: 0, y: 0 });
    expect(stick(0, 0, 40, 0, 60, 0.5).x).toBeGreaterThan(0.6);
  });
});

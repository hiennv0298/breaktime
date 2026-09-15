import { describe, expect, it } from 'vitest';
import {
  createWalker,
  nearestIndex,
  stepWalker,
  type WaypointPoint,
  type WalkerState,
} from '../../src/logic/waypointWalker';

const EPS = 1e-6;

function pt(x: number, z: number, dwellSec = 0): WaypointPoint {
  return { x, z, dwellSec };
}

function finite(s: WalkerState): boolean {
  return Number.isFinite(s.x) && Number.isFinite(s.z) && Number.isFinite(s.dwellLeft);
}

describe('createWalker', () => {
  it('starts walking toward startIndex from the given position', () => {
    const points = [pt(0, 0, 1), pt(2, 0, 1)];
    const s = createWalker(points, { x: 0.5, z: -1 }, 1);
    expect(s).toEqual({ index: 1, x: 0.5, z: -1, mode: 'walk', dwellLeft: 0, frozen: false });
  });

  it('defaults startIndex to 0 and wraps an out-of-range index', () => {
    const points = [pt(0, 0), pt(1, 0), pt(2, 0)];
    expect(createWalker(points, { x: 0, z: 0 }).index).toBe(0);
    expect(createWalker(points, { x: 0, z: 0 }, 4).index).toBe(1);
  });
});

describe('stepWalker', () => {
  it('moves at 1.4 m/s toward the target and faces it (atan2(dx, dz))', () => {
    const points = [pt(2, 0, 3)];
    const s = createWalker(points, { x: 0, z: 0 });
    const r = stepWalker(s, points, 0.5);
    expect(r.state.x).toBeCloseTo(0.7, 6);
    expect(Math.abs(r.state.z)).toBeLessThan(EPS);
    expect(r.vx).toBeCloseTo(1.4, 6);
    expect(Math.abs(r.vz)).toBeLessThan(EPS);
    expect(Math.abs(r.facingYaw - Math.PI / 2)).toBeLessThan(EPS);
    expect(r.state.mode).toBe('walk');
  });

  it('faces +Z as yaw 0 and -Z as yaw PI', () => {
    const plusZ = [pt(0, 3)];
    expect(Math.abs(stepWalker(createWalker(plusZ, { x: 0, z: 0 }), plusZ, 0.1).facingYaw)).toBeLessThan(EPS);
    const minusZ = [pt(0, -3)];
    const yaw = stepWalker(createWalker(minusZ, { x: 0, z: 0 }), minusZ, 0.1).facingYaw;
    expect(Math.abs(Math.abs(yaw) - Math.PI)).toBeLessThan(EPS);
  });

  it('does not mutate the input state', () => {
    const points = [pt(2, 0, 3)];
    const s = createWalker(points, { x: 0, z: 0 });
    const copy = { ...s };
    stepWalker(s, points, 0.5);
    expect(s).toEqual(copy);
  });

  it('stops exactly at the point on a long step and switches to dwell', () => {
    const points = [pt(2, 0, 3), pt(0, 0, 1)];
    const r = stepWalker(createWalker(points, { x: 0, z: 0 }), points, 5);
    expect(r.state.x).toBe(2);
    expect(r.state.z).toBe(0);
    expect(r.state.mode).toBe('dwell');
    expect(r.state.dwellLeft).toBe(3);
    expect(r.state.index).toBe(0);
    // The reported velocity matches the displacement actually made this step.
    expect(r.vx).toBeCloseTo(2 / 5, 6);
  });

  it('enters dwell once within the arrive radius', () => {
    const points = [pt(1, 0, 2)];
    // 0.9 m travelled leaves 0.1 m, inside the default 0.15 m radius.
    const r = stepWalker(createWalker(points, { x: 0, z: 0 }), points, 0.9, 1);
    expect(r.state.mode).toBe('dwell');
    expect(r.state.x).toBeCloseTo(0.9, 6);
    // A tighter radius keeps walking.
    const tight = stepWalker(createWalker(points, { x: 0, z: 0 }), points, 0.9, 1, 0.05);
    expect(tight.state.mode).toBe('walk');
  });

  it('holds still while dwelling, then advances to the next index', () => {
    const points = [pt(2, 0, 1), pt(4, 0, 1)];
    let r = stepWalker(createWalker(points, { x: 0, z: 0 }), points, 5);
    expect(r.state.mode).toBe('dwell');

    r = stepWalker(r.state, points, 0.6);
    expect(r.vx).toBe(0);
    expect(r.vz).toBe(0);
    expect(r.state.mode).toBe('dwell');
    expect(r.state.dwellLeft).toBeCloseTo(0.4, 6);
    expect(r.state.x).toBe(2);

    r = stepWalker(r.state, points, 0.4);
    expect(r.vx).toBe(0);
    expect(r.state.mode).toBe('walk');
    expect(r.state.index).toBe(1);
    expect(r.state.dwellLeft).toBe(0);
    expect(r.state.x).toBe(2);
  });

  it('wraps to index 0 after the last point', () => {
    const points = [pt(0, 0, 1), pt(1, 0, 1)];
    let s = createWalker(points, { x: 0, z: 0 }, 1);
    s = stepWalker(s, points, 5).state; // arrive at index 1
    expect(s.mode).toBe('dwell');
    s = stepWalker(s, points, 1).state; // dwell done
    expect(s.index).toBe(0);
    expect(s.mode).toBe('walk');
  });

  it('loops a whole route repeatedly without drift', () => {
    const points = [pt(0, 0, 0.5), pt(3, 0, 0.5), pt(3, 2, 0.5)];
    let s = createWalker(points, { x: 0, z: 0 });
    const visited: number[] = [];
    for (let i = 0; i < 2000; i++) {
      const before = s.mode;
      s = stepWalker(s, points, 1 / 60).state;
      if (before === 'walk' && s.mode === 'dwell') visited.push(s.index);
      expect(finite(s)).toBe(true);
    }
    expect(visited.slice(0, 6)).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it('passes through a zero-dwell point without stopping a step', () => {
    const points = [pt(1, 0, 0), pt(1, 5, 2)];
    const r = stepWalker(createWalker(points, { x: 0, z: 0 }), points, 1, 1);
    expect(r.state.mode).toBe('walk');
    expect(r.state.index).toBe(1);
    expect(r.state.x).toBe(1);
  });

  it('enters dwell on a zero-length segment without NaN', () => {
    const points = [pt(1, 1, 2)];
    const r = stepWalker(createWalker(points, { x: 1, z: 1 }), points, 1 / 60);
    expect(r.state.mode).toBe('dwell');
    expect(r.state.dwellLeft).toBe(2);
    expect(r.vx).toBe(0);
    expect(r.vz).toBe(0);
    expect(Number.isFinite(r.facingYaw)).toBe(true);
    expect(finite(r.state)).toBe(true);
  });

  it('frozen keeps velocity 0 and position unchanged', () => {
    const points = [pt(2, 0, 3)];
    const s: WalkerState = { ...createWalker(points, { x: 0.3, z: 0.4 }), frozen: true };
    const r = stepWalker(s, points, 1);
    expect(r.vx).toBe(0);
    expect(r.vz).toBe(0);
    expect(r.state.x).toBe(0.3);
    expect(r.state.z).toBe(0.4);
    expect(r.state.frozen).toBe(true);
    // A frozen dweller does not count its dwell down either.
    const d: WalkerState = { index: 0, x: 2, z: 0, mode: 'dwell', dwellLeft: 1, frozen: true };
    expect(stepWalker(d, points, 5).state.dwellLeft).toBe(1);
  });

  it('treats a non-finite or negative dt as zero and survives an empty route', () => {
    const points = [pt(2, 0, 3)];
    const s = createWalker(points, { x: 0, z: 0 });
    for (const dt of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      const r = stepWalker(s, points, dt);
      expect(r.state.x).toBe(0);
      expect(r.vx).toBe(0);
      expect(finite(r.state)).toBe(true);
    }
    const empty = stepWalker(s, [], 1);
    expect(empty.vx).toBe(0);
    expect(finite(empty.state)).toBe(true);
  });
});

describe('nearestIndex', () => {
  it('returns the index of the closest point', () => {
    const points = [pt(0, 0), pt(5, 5), pt(2, -1)];
    expect(nearestIndex(points, 4, 4)).toBe(1);
    expect(nearestIndex(points, 1.8, -0.5)).toBe(2);
    expect(nearestIndex(points, -1, 0.2)).toBe(0);
  });

  it('breaks ties toward the lower index and returns -1 for no points', () => {
    expect(nearestIndex([pt(1, 0), pt(-1, 0)], 0, 0)).toBe(0);
    expect(nearestIndex([], 0, 0)).toBe(-1);
  });
});

import { describe, expect, it } from 'vitest';
import {
  createGetUp,
  RAGDOLL_TIMEOUT_SEC,
  RECOVER_SEC,
  SETTLE_ANG,
  SETTLE_HOLD_SEC,
  SETTLE_SPEED,
  slapGetUp,
  updateGetUp,
  type GetUpState,
} from '../../src/logic/getUpFsm';

const DT = 1 / 60;

function run(
  s: GetUpState,
  seconds: number,
  torsoSpeed: number,
  torsoAngSpeed: number,
): { state: GetUpState; events: Array<{ step: number; event: string }>; recoverTs: number[] } {
  const steps = Math.round(seconds / DT);
  const events: Array<{ step: number; event: string }> = [];
  const recoverTs: number[] = [];
  let state = s;
  for (let i = 1; i <= steps; i++) {
    const r = updateGetUp(state, { torsoSpeed, torsoAngSpeed, dt: DT });
    state = r.state;
    if (r.event !== 'none') events.push({ step: i, event: r.event });
    recoverTs.push(r.recoverT);
  }
  return { state, events, recoverTs };
}

describe('getUpFsm constants', () => {
  it('match RESEARCH Pattern 14 / D-12', () => {
    expect(SETTLE_SPEED).toBe(0.35);
    expect(SETTLE_ANG).toBe(1.0);
    expect(SETTLE_HOLD_SEC).toBe(0.6);
    expect(RAGDOLL_TIMEOUT_SEC).toBe(4.0);
    expect(RECOVER_SEC).toBe(0.45);
  });
});

describe('getUpFsm', () => {
  it('starts animated with zeroed timers', () => {
    expect(createGetUp()).toEqual({ mode: 'animated', settleSec: 0, ragdollSec: 0, recoverSec: 0 });
  });

  it('animated ignores updates', () => {
    const r = updateGetUp(createGetUp(), { torsoSpeed: 0, torsoAngSpeed: 0, dt: 10 });
    expect(r.state.mode).toBe('animated');
    expect(r.event).toBe('none');
  });

  it('slapGetUp turns animated into ragdoll', () => {
    const s = slapGetUp(createGetUp());
    expect(s.mode).toBe('ragdoll');
    expect(s.ragdollSec).toBe(0);
    expect(s.settleSec).toBe(0);
  });

  it('settled for 0.6 s starts recovering exactly once', () => {
    const { state, events } = run(slapGetUp(createGetUp()), 0.6, 0.2, 0.5);
    expect(events).toEqual([{ step: 36, event: 'start-recover' }]);
    expect(state.mode).toBe('recover');
    // Staying settled afterwards never emits start-recover again.
    const more = run(state, 0.2, 0.2, 0.5);
    expect(more.events.filter((e) => e.event === 'start-recover')).toEqual([]);
  });

  it('0.58 s settled is not enough', () => {
    const { state, events } = run(slapGetUp(createGetUp()), 35 * DT, 0.2, 0.5);
    expect(events).toEqual([]);
    expect(state.mode).toBe('ragdoll');
  });

  it('any fast step resets the settle hold', () => {
    let s = run(slapGetUp(createGetUp()), 0.5, 0.2, 0.5).state;
    s = updateGetUp(s, { torsoSpeed: 0.2, torsoAngSpeed: 1.5, dt: DT }).state; // spinning
    expect(s.settleSec).toBe(0);
    const { events } = run(s, 0.5, 0.2, 0.5);
    expect(events).toEqual([]);
  });

  it('never settling recovers by the 4 s timeout', () => {
    const { state, events } = run(slapGetUp(createGetUp()), 4.0, 2.0, 0.5);
    expect(events).toEqual([{ step: 240, event: 'start-recover' }]);
    expect(state.mode).toBe('recover');
  });

  it('recover lasts 0.45 s, recoverT goes 0 -> 1, then resumes animated', () => {
    const start = updateGetUp(
      run(slapGetUp(createGetUp()), 0.6 - DT, 0.2, 0.5).state,
      { torsoSpeed: 0.2, torsoAngSpeed: 0.5, dt: DT },
    );
    expect(start.event).toBe('start-recover');
    expect(start.recoverT).toBe(0);

    const { state, events, recoverTs } = run(start.state, 0.45, 0, 0);
    expect(events).toEqual([{ step: 27, event: 'resumed' }]);
    expect(state.mode).toBe('animated');
    expect(recoverTs[recoverTs.length - 1]).toBe(1);
    for (let i = 1; i < recoverTs.length; i++) expect(recoverTs[i]).toBeGreaterThanOrEqual(recoverTs[i - 1]);
    for (const t of recoverTs) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    }
    expect(recoverTs[13]).toBeGreaterThan(0.4);
    expect(recoverTs[13]).toBeLessThan(0.6);
  });

  it('slapGetUp during recover goes back to ragdoll with fresh timers', () => {
    const recovering = run(slapGetUp(createGetUp()), 4.1, 2.0, 2.0).state;
    expect(recovering.mode).toBe('recover');
    expect(recovering.recoverSec).toBeGreaterThan(0);
    const s = slapGetUp(recovering);
    expect(s).toEqual({ mode: 'ragdoll', settleSec: 0, ragdollSec: 0, recoverSec: 0 });
  });

  it('slapGetUp during ragdoll leaves ragdollSec unchanged', () => {
    const s = run(slapGetUp(createGetUp()), 1.0, 2.0, 2.0).state;
    const again = slapGetUp(s);
    expect(again.mode).toBe('ragdoll');
    expect(again.ragdollSec).toBe(s.ragdollSec);
    expect(again.settleSec).toBe(s.settleSec);
  });

  it('does not mutate its input', () => {
    const s = slapGetUp(createGetUp());
    const copy = { ...s };
    updateGetUp(s, { torsoSpeed: 0, torsoAngSpeed: 0, dt: 1 });
    slapGetUp(s);
    expect(s).toEqual(copy);
  });

  it('non-finite input neither advances time nor counts as settled', () => {
    let s = slapGetUp(createGetUp());
    s = updateGetUp(s, { torsoSpeed: 0.1, torsoAngSpeed: 0.1, dt: Number.NaN }).state;
    expect(s.ragdollSec).toBe(0);
    s = updateGetUp(s, { torsoSpeed: Number.NaN, torsoAngSpeed: 0.1, dt: 0.5 }).state;
    expect(s.settleSec).toBe(0);
    expect(s.ragdollSec).toBe(0.5);
  });
});

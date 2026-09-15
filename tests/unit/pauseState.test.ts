import { describe, expect, it } from 'vitest';
import { createPauseState } from '../../src/logic/pauseState';

describe('createPauseState (D-20, CTRL-04)', () => {
  it('starts running with no reason', () => {
    const p = createPauseState();
    expect(p.isPaused()).toBe(false);
    expect(p.reason()).toBeNull();
  });

  it('toggle flips isPaused and uses reason user', () => {
    const p = createPauseState();
    p.toggle();
    expect(p.isPaused()).toBe(true);
    expect(p.reason()).toBe('user');
    p.toggle();
    expect(p.isPaused()).toBe(false);
    expect(p.reason()).toBeNull();
  });

  it("pauseFor('hidden') pauses with reason hidden", () => {
    const p = createPauseState();
    p.pauseFor('hidden');
    expect(p.isPaused()).toBe(true);
    expect(p.reason()).toBe('hidden');
  });

  it('resume clears the pause and the reason', () => {
    const p = createPauseState();
    p.pauseFor('context-lost');
    p.resume();
    expect(p.isPaused()).toBe(false);
    expect(p.reason()).toBeNull();
  });

  it('toggle while paused for another reason resumes', () => {
    const p = createPauseState();
    p.pauseFor('hidden');
    p.toggle();
    expect(p.isPaused()).toBe(false);
    expect(p.reason()).toBeNull();
  });

  it('resume while running is a no-op', () => {
    const p = createPauseState();
    p.resume();
    expect(p.isPaused()).toBe(false);
    expect(p.reason()).toBeNull();
  });

  it('instances are independent', () => {
    const a = createPauseState();
    const b = createPauseState();
    a.toggle();
    expect(b.isPaused()).toBe(false);
  });
});

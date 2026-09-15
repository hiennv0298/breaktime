import { describe, expect, it } from 'vitest';
import { createDebugRegistry } from '../../src/debug/testHook';

describe('createDebugRegistry', () => {
  it('exposes a registered getter as a live read-only property', () => {
    const obj: Record<string, unknown> = {};
    const reg = createDebugRegistry(obj);
    let v = 1;
    reg.register('a', () => v);
    expect(obj.a).toBe(1);
    v = 2;
    expect(obj.a).toBe(2);
  });

  it('throws on a duplicate key', () => {
    const reg = createDebugRegistry({});
    reg.register('a', () => 1);
    expect(() => reg.register('a', () => 2)).toThrow('duplicate debug key a');
  });

  it('rejects writes from outside', () => {
    const obj: Record<string, unknown> = {};
    const reg = createDebugRegistry(obj);
    reg.register('a', () => 1);
    let threw = false;
    try {
      obj.a = 5; // ESM is strict mode: writing a getter-only property throws
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(obj.a).toBe(1);
  });

  it('cannot be redefined or deleted', () => {
    const obj: Record<string, unknown> = {};
    createDebugRegistry(obj).register('a', () => 1);
    expect(() => Object.defineProperty(obj, 'a', { value: 9 })).toThrow();
    expect(() => delete obj.a).toThrow();
    expect(obj.a).toBe(1);
  });

  it('has a built-in state key driven by setState', () => {
    const obj: Record<string, unknown> = {};
    const reg = createDebugRegistry(obj);
    expect(obj.state).toBe('booting');
    reg.setState('loading');
    expect(obj.state).toBe('loading');
    expect(() => reg.register('state', () => 'x')).toThrow('duplicate debug key state');
  });

  it('keeps target and lists registered keys as enumerable', () => {
    const obj = {};
    const reg = createDebugRegistry(obj);
    reg.register('sha', () => 'abc');
    expect(reg.target).toBe(obj);
    expect(Object.keys(obj).sort()).toEqual(['sha', 'state']);
  });
});

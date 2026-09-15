import { BUILD_SHA, BUILD_TIME } from '../boot/buildInfo';

export type BootState = 'booting' | 'unsupported' | 'loading' | 'ready-to-play' | 'playing';

export interface DebugRegistry {
  register(key: string, getter: () => unknown): void;
  setState(s: BootState): void;
  target: object;
}

/**
 * Pure registry: each key becomes an enumerable, getter-only, non-configurable
 * property on `target`, so tests read live values but nothing can overwrite them.
 * `state` is built in and only changes through setState.
 */
export function createDebugRegistry(target: object): DebugRegistry {
  const keys = new Set<string>();
  let state: BootState = 'booting';

  function register(key: string, getter: () => unknown): void {
    if (keys.has(key) || Object.prototype.hasOwnProperty.call(target, key)) {
      throw new Error('duplicate debug key ' + key);
    }
    Object.defineProperty(target, key, { get: getter, enumerable: true, configurable: false });
    keys.add(key);
  }

  register('state', () => state);

  return {
    register,
    setState(s: BootState) {
      state = s;
    },
    target,
  };
}

let globalRegistry: DebugRegistry | undefined;

function getGlobalRegistry(): DebugRegistry {
  if (globalRegistry) return globalRegistry;
  const target = Object.create(null) as object;
  globalRegistry = createDebugRegistry(target);
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, '__bt', { value: target, writable: false, configurable: false, enumerable: false });
  }
  globalRegistry.register('sha', () => BUILD_SHA);
  globalRegistry.register('buildTime', () => BUILD_TIME);
  return globalRegistry;
}

/** Register a read-only key on window.__bt. Throws "duplicate debug key <key>" on reuse. */
export function registerDebug(key: string, getter: () => unknown): void {
  getGlobalRegistry().register(key, getter);
}

export function setBootState(state: BootState): void {
  getGlobalRegistry().setState(state);
}

// Built-in keys exist from module load in the browser.
if (typeof window !== 'undefined') getGlobalRegistry();

// window.__bt is non-configurable: re-evaluating this module in dev HMR would throw, so force a full reload.
(import.meta as unknown as { hot?: { decline(): void } }).hot?.decline();

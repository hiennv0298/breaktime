import { registerDebug } from '../debug/testHook';

/*
 * Fullscreen on the Chơi tap (D-23), feature-detected (D-26, RESEARCH Pitfall 4 / C2, T-01-09-02).
 * iPhone Safari has no element fullscreen (document.fullscreenEnabled is false): nothing is requested and the
 * game simply fills the viewport (100dvh + viewport-fit=cover). A rejected request is stored, never thrown,
 * never shown to the player, and never blocks play.
 */

let enabled = readEnabled();
let requested = false;
let error: string | null = null;

function readEnabled(): boolean {
  return typeof document !== 'undefined' && document.fullscreenEnabled === true;
}

function describe(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}

/** Call synchronously inside the Chơi gesture (onPlayGesture) so the browser sees user activation. */
export function requestFullscreenIfSupported(): void {
  try {
    enabled = readEnabled();
    if (!enabled) return;
    const el = document.documentElement;
    if (typeof el.requestFullscreen !== 'function') return;
    requested = true;
    const p = el.requestFullscreen({ navigationUI: 'hide' });
    if (p && typeof p.catch === 'function') {
      p.catch((e: unknown) => {
        error = describe(e);
      });
    }
  } catch (e) {
    error = describe(e);
  }
}

if (typeof window !== 'undefined') {
  registerDebug('fullscreen', () => ({ enabled, requested, error }));
}

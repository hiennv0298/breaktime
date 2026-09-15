// Replaced at compile time by vite.config.ts `define`.
declare const __BUILD_SHA__: string;
declare const __BUILD_TIME__: string;

// typeof guards keep this module importable where no define runs (e.g. Vitest in Node).
export const BUILD_SHA: string = typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : '000000000000';
export const BUILD_TIME: string = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';

/** Corner badge "Break Time · <sha>" (D-23). textContent only, never HTML. */
export function mountBuildBadge(): void {
  if (document.getElementById('build-badge')) return;
  const el = document.createElement('div');
  el.id = 'build-badge';
  el.textContent = 'Break Time · ' + BUILD_SHA;
  document.body.appendChild(el);
}

import { registerDebug } from '../debug/testHook';
import './crashBanner.css';

/**
 * "The last session died" banner (plan 01-18, TECH-04). Numbers and a sha from storage are rendered with textContent
 * only (T-01-18-01); it never blocks input to the game below except its own close button.
 */
export function mountCrashBanner(prevCrash: { crashedAfterSec: number; sha: string } | null): void {
  registerDebug('beacon', () => ({ prevCrash: prevCrash ? { ...prevCrash } : null }));
  if (!prevCrash || document.getElementById('crash-banner')) return;

  const el = document.createElement('div');
  el.id = 'crash-banner';
  el.setAttribute('role', 'alert');
  // A click on the banner is not a game-area click (pointerPick ignores [data-hud-panel]).
  el.setAttribute('data-hud-panel', '');
  const msg = document.createElement('span');
  msg.textContent = `Lần chơi trước bị dừng đột ngột sau ${prevCrash.crashedAfterSec} giây (bản ${prevCrash.sha}).`;
  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', 'Đóng');
  close.textContent = '×';
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    el.remove();
  });
  el.append(msg, close);
  document.body.appendChild(el);
}

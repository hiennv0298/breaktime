/**
 * Screen-edge warm-white flash that plays when the player gets hit.
 * Flash lasts 250 ms (HIT_FLASH_MS), fades out via CSS transition.
 */

import './hitFlash.css';

export const HIT_FLASH_MS = 250;

export interface HitFlash {
  flash(nowMs: number): void;
  count(): number;
  active(nowMs: number): boolean;
}

export function createHitFlash(root: HTMLElement): HitFlash {
  const el = document.createElement('div');
  el.id = 'hit-flash';
  el.setAttribute('aria-hidden', 'true');
  root.appendChild(el);

  let flashCount = 0;
  let lastFlashMs = 0;

  return {
    flash(nowMs) {
      flashCount++;
      lastFlashMs = nowMs;
      el.classList.add('on');

      // Remove class after 30ms so CSS fade-out finishes by HIT_FLASH_MS
      window.setTimeout(() => {
        el.classList.remove('on');
      }, 30);
    },

    count() {
      return flashCount;
    },

    active(nowMs) {
      return nowMs - lastFlashMs < HIT_FLASH_MS;
    },
  };
}

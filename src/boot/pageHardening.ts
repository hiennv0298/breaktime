/**
 * Page hardening for iOS / Android (RESEARCH Pattern 5, T-01-09-04). CSS in hud.css already sets touch-action,
 * overscroll-behavior and user-select; these listeners do the parts CSS cannot:
 * - gesturestart: iOS Safari pinch zoom (Safari-only event, iOS ignores user-scalable=no for accessibility)
 * - touchmove (passive false): page scroll, pull-to-refresh and rubber-banding
 * - contextmenu: long-press menus
 * - dblclick: double-tap zoom
 * Only cancelable events are prevented, so Chrome logs no intervention warning. A one-finger drag inside the
 * pause menu stays scrollable (its sections can overflow on small screens).
 */
let installed = false;

function prevent(e: Event): void {
  if (e.cancelable) e.preventDefault();
}

function onTouchMove(e: TouchEvent): void {
  if (e.touches.length === 1 && e.target instanceof Element && e.target.closest('#pause-menu')) return;
  prevent(e);
}

export function installPageHardening(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('gesturestart', prevent);
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('contextmenu', prevent);
  document.addEventListener('dblclick', prevent);
}

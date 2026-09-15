import { registerDebug } from '../debug/testHook';
import type { InputState } from './inputState';

/** Fixed icon set for the context button (D-18). 'none' renders an empty icon. */
export type IconName = 'hand' | 'push' | 'slap' | 'none';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Constant stroke path data on a 24x24 grid. Never built from input, never parsed as HTML (T-01-08-01). */
const ICON_PATHS: Record<IconName, readonly string[]> = {
  hand: [
    'M8 12V5.5a1.5 1.5 0 0 1 3 0V11',
    'M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5',
    'M14 10.5V5a1.5 1.5 0 0 1 3 0v6',
    'M17 11V8a1.5 1.5 0 0 1 3 0v6c0 4-3 7-7 7h-1.5c-2.5 0-4.2-1.3-5.6-3.4L3.3 13a1.5 1.5 0 0 1 2.5-1.6L8 14',
  ],
  push: ['M3 12h11', 'M10 7l5 5-5 5', 'M19 4v16'],
  slap: ['M12 2.5l2.4 5.6 6.1.6-4.6 4 1.4 6-5.3-3.2-5.3 3.2 1.4-6-4.6-4 6.1-.6z', 'M2 21l3-3', 'M22 21l-3-3'],
  none: [],
};

const PAUSE_PATHS: readonly string[] = ['M9 5v14', 'M15 5v14'];

function buildSvg(paths: readonly string[], strokeWidth: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(strokeWidth));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

let contextIcon: IconName = 'hand';
let contextButton: HTMLButtonElement | null = null;
let touchSeen = false;
let debugRegistered = false;

function coarsePointer(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

/** True when the touch UI should show: a coarse primary pointer, or a touch has been seen. */
export function isTouchUi(): boolean {
  return touchSeen || coarsePointer();
}

/** Swap the context button icon (plans 01-10 and 01-15 call this with the nearest target's action). */
export function setContextIcon(name: IconName): void {
  if (!Object.prototype.hasOwnProperty.call(ICON_PATHS, name)) return;
  contextIcon = name;
  if (contextButton) contextButton.replaceChildren(buildSvg(ICON_PATHS[name], 2));
}

function makeButton(id: string, label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.id = id;
  b.type = 'button';
  b.tabIndex = -1; // keyboard players use E / Escape / Space; a focused button would also react to Space
  b.setAttribute('data-hud-button', '');
  b.setAttribute('aria-label', label);
  return b;
}

/**
 * Context button (#btn-context, D-18: same action as E) and pause button (#btn-pause, D-20).
 * Each has its own pointerdown listener with preventDefault so it works while another finger drives
 * the joystick (multi-touch, CTRL-02). Returns a detach function.
 */
export function attachTouchButtons(root: HTMLElement, s: InputState): () => void {
  const ctxBtn = makeButton('btn-context', 'Tương tác');
  const pauseBtn = makeButton('btn-pause', 'Tạm dừng');
  pauseBtn.appendChild(buildSvg(PAUSE_PATHS, 3));

  contextButton = ctxBtn;
  setContextIcon(contextIcon);

  function applyVisibility(): void {
    const show = isTouchUi();
    ctxBtn.hidden = !show;
    pauseBtn.hidden = !show;
  }

  function pressable(e: PointerEvent): boolean {
    return e.pointerType !== 'mouse' || e.button === 0;
  }

  function onContext(e: PointerEvent): void {
    if (!pressable(e)) return;
    e.preventDefault();
    s.interactQueued = true;
  }

  function onPause(e: PointerEvent): void {
    if (!pressable(e)) return;
    e.preventDefault();
    s.pauseToggleQueued = true;
  }

  // First touch anywhere reveals the touch UI (touch laptops, desktop-mode browsers on phones).
  function onAnyPointer(e: PointerEvent): void {
    if (e.pointerType === 'touch' && !touchSeen) {
      touchSeen = true;
      applyVisibility();
    }
  }

  const mq = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null;

  ctxBtn.addEventListener('pointerdown', onContext);
  pauseBtn.addEventListener('pointerdown', onPause);
  window.addEventListener('pointerdown', onAnyPointer, { capture: true });
  mq?.addEventListener('change', applyVisibility);

  applyVisibility();
  root.append(ctxBtn, pauseBtn);

  if (!debugRegistered) {
    debugRegistered = true;
    registerDebug('touchUi', () => ({
      visible: !!contextButton && !contextButton.hidden,
      contextIcon,
    }));
  }

  return () => {
    ctxBtn.removeEventListener('pointerdown', onContext);
    pauseBtn.removeEventListener('pointerdown', onPause);
    window.removeEventListener('pointerdown', onAnyPointer, { capture: true });
    mq?.removeEventListener('change', applyVisibility);
    ctxBtn.remove();
    pauseBtn.remove();
    if (contextButton === ctxBtn) contextButton = null;
  };
}

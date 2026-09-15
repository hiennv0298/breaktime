import { registerDebug } from '../debug/testHook';
import { stick } from '../logic/joystickMath';
import type { InputState } from './inputState';

/** Joystick base radius in CSS px (base is 2 * RADIUS wide). */
const RADIUS = 60;

let debugRegistered = false;
let debugState = { active: false, x: 0, y: 0 };

/**
 * Floating joystick (D-17, CTRL-02, RESEARCH Pattern 4).
 * A transparent full-screen #touch-zone sits above the canvas and below the HUD buttons.
 * A touch/pen press on the left half spawns #joystick-base centred under the finger; dragging writes
 * moveX/moveY (screen up = forward); lifting, cancel or losing capture resets movement (T-01-08-02).
 * Mouse presses and presses on the right half are ignored. HUD buttons are separate elements with
 * their own listeners, so the joystick and a button work at the same time (multi-touch).
 * Returns a detach function.
 */
export function attachJoystick(root: HTMLElement, s: InputState): () => void {
  const zone = document.createElement('div');
  zone.id = 'touch-zone';

  const base = document.createElement('div');
  base.id = 'joystick-base';
  base.hidden = true;
  const knob = document.createElement('div');
  knob.id = 'joystick-knob';
  base.appendChild(knob);
  zone.appendChild(base);
  root.appendChild(zone);

  let activeId: number | null = null;
  let originX = 0;
  let originY = 0;

  function setMove(x: number, y: number): void {
    s.moveX = x;
    s.moveY = y;
    debugState = { active: activeId !== null, x, y };
  }

  function placeKnob(kx: number, ky: number): void {
    knob.style.transform = `translate(${kx}px, ${ky}px)`;
  }

  function onDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' || activeId !== null || e.clientX > window.innerWidth / 2) return;
    activeId = e.pointerId;
    try {
      zone.setPointerCapture(e.pointerId); // Safari 13+; can throw if the pointer is already gone
    } catch {
      // Without capture, moves still arrive while the finger stays over the zone.
    }
    originX = e.clientX;
    originY = e.clientY;
    base.style.transform = `translate(${originX}px, ${originY}px)`;
    placeKnob(0, 0);
    base.hidden = false;
    setMove(0, 0);
    e.preventDefault();
  }

  function onMove(e: PointerEvent): void {
    if (e.pointerId !== activeId) return;
    const v = stick(originX, originY, e.clientX, e.clientY, RADIUS);
    placeKnob(v.knobX, v.knobY);
    setMove(v.x, -v.y);
    e.preventDefault();
  }

  function reset(): void {
    activeId = null;
    base.hidden = true;
    placeKnob(0, 0);
    setMove(0, 0);
  }

  function onEnd(e: PointerEvent): void {
    if (e.pointerId !== activeId) return;
    reset();
  }

  function onVisibility(): void {
    if (document.visibilityState === 'hidden' && activeId !== null) reset();
  }

  zone.addEventListener('pointerdown', onDown);
  zone.addEventListener('pointermove', onMove);
  zone.addEventListener('pointerup', onEnd);
  zone.addEventListener('pointercancel', onEnd);
  zone.addEventListener('lostpointercapture', onEnd);
  document.addEventListener('visibilitychange', onVisibility);

  if (!debugRegistered) {
    debugRegistered = true;
    registerDebug('joystick', () => ({ ...debugState }));
  }
  debugState = { active: false, x: 0, y: 0 };

  return () => {
    zone.removeEventListener('pointerdown', onDown);
    zone.removeEventListener('pointermove', onMove);
    zone.removeEventListener('pointerup', onEnd);
    zone.removeEventListener('pointercancel', onEnd);
    zone.removeEventListener('lostpointercapture', onEnd);
    document.removeEventListener('visibilitychange', onVisibility);
    if (activeId !== null) reset();
    zone.remove();
  };
}

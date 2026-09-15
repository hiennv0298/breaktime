import { rotateCamera } from '../render/cameraView';

/** Rotate codes (D-19 revised, RESEARCH C1): the interact key is deliberately absent, it must never rotate. */
const ROTATE: Readonly<Record<string, -1 | 1>> = {
  KeyZ: -1,
  ArrowLeft: -1,
  KeyC: 1,
  ArrowRight: 1,
};

/**
 * Desktop camera keys: KeyZ / ArrowLeft rotate -90°, KeyC / ArrowRight rotate +90°.
 * Its own window listener (movement/interact/pause stay in keyboard.ts). Uses KeyboardEvent.code, so the
 * physical keys do not change with the layout. Held keys do not auto-repeat rotations. Returns a detach function.
 */
export function attachCameraKeys(): () => void {
  function onKeyDown(e: KeyboardEvent): void {
    if (!Object.prototype.hasOwnProperty.call(ROTATE, e.code)) return;
    // Arrow keys would otherwise scroll a scrollable ancestor.
    e.preventDefault();
    if (e.repeat) return;
    rotateCamera(ROTATE[e.code]);
  }

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}

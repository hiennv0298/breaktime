import { Raycaster, Vector2, type Camera, type Object3D } from 'three';

/**
 * Desktop "click the glowing object" (D-20, CTRL-01). Listens on window because the transparent #touch-zone covers
 * the canvas (plan 01-08). Mouse left button only: touch uses the context button, never canvas taps.
 * The ray is cast only on a click and only against the highlighted object (T-01-10-01), so clicking anything
 * that is not highlighted does nothing. Returns a detach function.
 */
export function attachPointerPick(
  canvas: HTMLCanvasElement,
  camera: Camera,
  getHighlighted: () => { id: string; object: Object3D } | null,
  onPick: (id: string) => void,
  isBlocked: () => boolean = () => false,
): () => void {
  const raycaster = new Raycaster();
  const ndc = new Vector2();

  function onPointerDown(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (isBlocked()) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('[data-hud-button], #pause-menu, button')) return;
    const h = getHighlighted();
    if (!h) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.intersectObject(h.object, true).length > 0) onPick(h.id);
  }

  window.addEventListener('pointerdown', onPointerDown);
  return () => window.removeEventListener('pointerdown', onPointerDown);
}

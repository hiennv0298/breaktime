import { Raycaster, Vector2, type Camera, type Object3D } from 'three';

/**
 * Desktop left-click action (D-20 revised, D-30, CTRL-01). Listens on window because the transparent #touch-zone covers
 * the canvas (plan 01-08). Mouse left button only: touch uses the context button, never canvas taps.
 * D-30: any click on the game area swings; only the glowing object is hit. The ray is cast only on a click and only
 * against the highlighted object (T-01-10-01): onPick(id) when it hits it, onPick(null) for every other game-area
 * click (including when nothing glows). Clicks on HUD buttons, HUD panels ([data-hud-panel], D-28 contract shared with
 * plan 01-25), the pause menu or form controls, and any click while paused, never call onPick (T-01-24-02).
 * Returns a detach function.
 */
const NOT_GAME_AREA = '[data-hud-button], [data-hud-panel], #pause-menu, button, input, textarea, select';

export function attachPointerPick(
  canvas: HTMLCanvasElement,
  camera: Camera,
  getHighlighted: () => { id: string; object: Object3D } | null,
  onPick: (id: string | null) => void,
  isBlocked: () => boolean = () => false,
): () => void {
  const raycaster = new Raycaster();
  const ndc = new Vector2();

  function hitsHighlighted(e: PointerEvent, h: { object: Object3D }): boolean {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObject(h.object, true).length > 0;
  }

  function onPointerDown(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (isBlocked()) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest(NOT_GAME_AREA)) return;
    const h = getHighlighted();
    if (h && hitsHighlighted(e, h)) onPick(h.id);
    else onPick(null);
  }

  window.addEventListener('pointerdown', onPointerDown);
  return () => window.removeEventListener('pointerdown', onPointerDown);
}

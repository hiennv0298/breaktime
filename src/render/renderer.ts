import {
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Color,
  WebGLRenderer,
} from 'three';
import { registerDebug } from '../debug/testHook';

export interface RenderCtx {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
}

/** Throws when WebGL2 is unavailable (WebGLRenderer does); main.ts catches and shows the unsupported screen. */
export function createRenderer(container: HTMLElement): RenderCtx {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const renderer = new WebGLRenderer({ antialias: !coarse, powerPreference: 'high-performance' });
  // Size, pixel ratio and camera aspect are applied by installResizeGuard below (CSS 100vw x 100dvh drives the box).
  renderer.shadowMap.enabled = false; // D-14: no real-time shadow maps, ever
  renderer.outputColorSpace = SRGBColorSpace;

  const canvas = renderer.domElement;
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  container.appendChild(canvas);

  const scene = new Scene();
  scene.background = new Color('#cfd8dc');

  const hemi = new HemisphereLight(0xffffff, 0x8899aa, 1.2);
  scene.add(hemi);
  const sun = new DirectionalLight(0xffffff, 1.0);
  sun.castShadow = false;
  sun.position.set(4, 10, 6);
  scene.add(sun);

  const initial = viewportSize();
  const camera = new PerspectiveCamera(50, initial.width / Math.max(1, initial.height), 0.1, 60);
  camera.position.set(0, 9, 9);
  camera.lookAt(0, 0, 0);

  installResizeGuard(renderer, camera);

  return { renderer, scene, camera };
}

const RESIZE_DEBOUNCE_MS = 100;
const MAX_DPR = 2;

/** CSS size of the visible viewport: visualViewport when available (tracks the iOS URL bar), else innerWidth/innerHeight. */
function viewportSize(): { width: number; height: number } {
  const vv = typeof window.visualViewport === 'object' ? window.visualViewport : null;
  const w = vv && Number.isFinite(vv.width) && vv.width > 0 ? vv.width : innerWidth;
  const h = vv && Number.isFinite(vv.height) && vv.height > 0 ? vv.height : innerHeight;
  return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
}

function setPortraitClass(width: number, height: number): void {
  document.body.classList.toggle('portrait', height > width);
}

/**
 * Resize guard (RESEARCH Pattern 5, T-01-09-01): window resize, visualViewport resize and orientationchange
 * are debounced by 100 ms, and renderer.setSize / camera.aspect only change when the integer backbuffer size
 * (CSS size x capped DPR) really changed, so iOS URL-bar animations do not thrash the canvas.
 * body.portrait follows every event right away so the HUD layout never lags the rotation (D-16).
 * The canvas box itself is CSS (100vw x 100dvh), so it always equals the viewport, even inside the debounce window.
 */
function installResizeGuard(renderer: WebGLRenderer, camera: PerspectiveCamera): void {
  let resizeCount = 0;
  let width = 0;
  let height = 0;
  let dpr = 0;
  let backW = -1;
  let backH = -1;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function apply(initial: boolean): void {
    const size = viewportSize();
    setPortraitClass(size.width, size.height);
    const ratio = Math.min(Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1, MAX_DPR);
    const bw = Math.floor(size.width * ratio);
    const bh = Math.floor(size.height * ratio);
    if (bw === backW && bh === backH) return;
    backW = bw;
    backH = bh;
    width = size.width;
    height = size.height;
    if (ratio !== dpr) {
      dpr = ratio;
      renderer.setPixelRatio(ratio);
    }
    renderer.setSize(size.width, size.height, false);
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
    if (!initial) resizeCount++;
  }

  function schedule(): void {
    const size = viewportSize();
    setPortraitClass(size.width, size.height);
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      apply(false);
    }, RESIZE_DEBOUNCE_MS);
  }

  apply(true);
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.visualViewport?.addEventListener('resize', schedule);

  registerDebug('renderer', () => ({
    resizeCount,
    width,
    height,
    dpr,
    shadowMapEnabled: renderer.shadowMap.enabled,
  }));
}

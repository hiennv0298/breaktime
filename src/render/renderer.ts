import {
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Color,
  WebGLRenderer,
} from 'three';

export interface RenderCtx {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
}

/** Throws when WebGL2 is unavailable (WebGLRenderer does); main.ts catches and shows the unsupported screen. */
export function createRenderer(container: HTMLElement): RenderCtx {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const renderer = new WebGLRenderer({ antialias: !coarse, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
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

  const camera = new PerspectiveCamera(50, innerWidth / Math.max(1, innerHeight), 0.1, 60);
  camera.position.set(0, 9, 9);
  camera.lookAt(0, 0, 0);

  // Plain resize handler; plan 01-09 replaces it with a debounced, size-change-guarded version.
  window.addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / Math.max(1, innerHeight);
    camera.updateProjectionMatrix();
  });

  return { renderer, scene, camera };
}

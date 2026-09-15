import './ui/hud.css';
import { mountBuildBadge } from './boot/buildInfo';
import { detect } from './boot/capabilities';
import { registerDebug, setBootState } from './debug/testHook';
import { showBootError, showUnsupported } from './ui/unsupported';
import type { RenderCtx } from './render/renderer';
import type { RapierApi } from './physics/rapier';

mountBuildBadge();
setBootState('booting');

async function boot(): Promise<void> {
  // Capability gate runs before any three.js code is fetched (D-22).
  const caps = detect();
  registerDebug('caps', () => ({ ...caps }));
  if (!caps.webgl2 || !caps.wasm) {
    showUnsupported(caps);
    setBootState('unsupported');
    return;
  }

  setBootState('loading');
  // Loaded lazily so the unsupported path above never downloads three or Rapier.
  const [{ createLoadingView, runLoadTasks }, { gameLoadTasks }, { waitForPlay }] = await Promise.all([
    import('./boot/loading'),
    import('./game/assets'),
    import('./boot/playGate'),
  ]);

  const view = createLoadingView();
  let loadProgress = 0;
  let rapierFlavor: 'simd' | 'compat' | undefined;
  registerDebug('loadProgress', () => loadProgress);
  registerDebug('rapierFlavor', () => rapierFlavor);

  const loaded = await runLoadTasks(gameLoadTasks(caps), (p) => {
    loadProgress = p;
    view.set(p);
  });
  const rapier = loaded.get('rapier') as { R: RapierApi; flavor: 'simd' | 'compat' };
  rapierFlavor = rapier.flavor;
  view.hide();
  setBootState('ready-to-play');

  await waitForPlay({ autoplay: new URLSearchParams(location.search).has('autoplay') });

  const [{ createRenderer }, { createPhysics }, { createGame }, { startLoop }, { attachCameraKeys }, { attachCameraButtons }] =
    await Promise.all([
      import('./render/renderer'),
      import('./physics/rapier'),
      import('./game/game'),
      import('./game/loop'),
      import('./input/cameraKeys'),
      import('./input/cameraButtons'),
    ]);

  let renderCtx: RenderCtx;
  try {
    renderCtx = createRenderer(document.getElementById('app') ?? document.body);
  } catch (e) {
    console.warn('WebGLRenderer creation failed', e);
    showUnsupported({ ...caps, webgl2: false });
    setBootState('unsupported');
    return;
  }

  // Camera rotation (D-19, CTRL-05): Z / C / arrows on desktop, ⟲ ⟳ on touch. They live for the page lifetime.
  attachCameraKeys();
  attachCameraButtons(document.getElementById('app') ?? document.body);

  const physics = createPhysics(rapier.R);
  const ctx = { ...renderCtx, physics, loaded };
  const game = createGame(ctx);
  startLoop(ctx, game);
  setBootState('playing');
}

boot().catch((e: unknown) => {
  console.error('Boot failed', e);
  showBootError();
});

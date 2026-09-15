import './ui/hud.css';
import './ui/layout.css';
import { BUILD_SHA, mountBuildBadge } from './boot/buildInfo';
import { detect } from './boot/capabilities';
import { initCrashBeacon } from './boot/crashBeacon';
import { requestFullscreenIfSupported } from './boot/fullscreen';
import { installPageHardening } from './boot/pageHardening';
import { registerDebug, setBootState } from './debug/testHook';
import { mountCrashBanner } from './ui/crashBanner';
import { showBootError, showUnsupported } from './ui/unsupported';
import type { RenderCtx } from './render/renderer';
import type { RapierApi } from './physics/rapier';

// No pinch / double-tap zoom, pull-to-refresh or long-press menus from the very first frame (RESEARCH Pattern 5).
installPageHardening();
mountBuildBadge();
// Crash beacon (plan 01-18, TECH-04): heartbeat from boot on, banner when the previous page died mid-session.
mountCrashBanner(initCrashBeacon(BUILD_SHA));
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
  // The SFX module is three-free but still lazy, so the unsupported path never downloads it (D-15).
  const [
    { createLoadingView, runLoadTasks },
    { gameLoadTasks },
    { waitForPlay, onPlayGesture },
    { sfxLoadTask, unlockFromGesture },
  ] = await Promise.all([
    import('./boot/loading'),
    import('./game/assets'),
    import('./boot/playGate'),
    import('./audio/sfx'),
  ]);

  const view = createLoadingView();
  let loadProgress = 0;
  let rapierFlavor: 'simd' | 'compat' | undefined;
  registerDebug('loadProgress', () => loadProgress);
  registerDebug('rapierFlavor', () => rapierFlavor);

  const loaded = await runLoadTasks([...gameLoadTasks(caps), sfxLoadTask()], (p) => {
    loadProgress = p;
    view.set(p);
  });
  const rapier = loaded.get('rapier') as { R: RapierApi; flavor: 'simd' | 'compat' };
  rapierFlavor = rapier.flavor;
  view.hide();
  setBootState('ready-to-play');

  // Both run synchronously inside the Chơi click and keep its user activation (D-23). Audio goes first: the
  // fullscreen request may consume the transient activation, and iOS only unlocks Web Audio inside the gesture (D-15).
  onPlayGesture(unlockFromGesture);
  onPlayGesture(requestFullscreenIfSupported);
  await waitForPlay({ autoplay: new URLSearchParams(location.search).has('autoplay') });

  const [
    { createRenderer },
    { createPhysics },
    { createGame, MAX_NPCS },
    { startLoop },
    { attachCameraKeys },
    { attachCameraButtons },
    { benchFromQuery, parseBenchDuration, soakFromQuery, soakOptionsFromQuery },
  ] = await Promise.all([
    import('./render/renderer'),
    import('./physics/rapier'),
    import('./game/game'),
    import('./game/loop'),
    import('./input/cameraKeys'),
    import('./input/cameraButtons'),
    // Loaded with the game (after Chơi), so the index chunk and the unsupported path stay as they were.
    import('./logic/benchTimeline'),
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
  // ?bench=1 (plan 01-17, D-08, D-11 revised): always 10 NPCs; the saved 'bt.npcs' count is neither used nor written.
  // ?soak=1 (plan 01-18, TECH-04) loops the same scene for 15 minutes and takes precedence over ?bench=1.
  const soakOn = soakFromQuery(location.search);
  const benchOn = !soakOn && benchFromQuery(location.search);
  // Async since plan 01-10: the office GLBs fetched before Chơi are parsed here, after three.js has loaded.
  const game = await createGame(ctx, soakOn || benchOn ? { forcedNpcCount: MAX_NPCS, bench: true } : {});
  if (soakOn) {
    const [{ startSoak }, { suppressKeyHints }] = await Promise.all([import('./bench/soak'), import('./ui/keyHints')]);
    // Hidden for the whole soak, before the loop mounts the hint panels (D-28).
    suppressKeyHints(true);
    startLoop(ctx, game);
    startSoak(game, soakOptionsFromQuery(location.search));
  } else if (benchOn) {
    const [{ startBench }, { suppressKeyHints }] = await Promise.all([import('./bench/benchScript'), import('./ui/keyHints')]);
    // Before the loop mounts the hint panels, so the one-time touch hint is not spent on a scripted run (D-28).
    suppressKeyHints(true);
    startLoop(ctx, game);
    startBench(game, { durationSec: parseBenchDuration(new URLSearchParams(location.search).get('dur')) });
  } else {
    startLoop(ctx, game);
  }
  setBootState('playing');
}

boot().catch((e: unknown) => {
  console.error('Boot failed', e);
  showBootError();
});

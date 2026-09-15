import { registerDebug } from '../debug/testHook';
import { createAutopilot } from '../game/autopilot';
import type { Game } from '../game/game';
import { getPauseState, onFrame, onStep } from '../game/loop';
import { createFpsMeter } from '../logic/benchStats';
import { buildTimeline, type BenchAction, type SoakOptions } from '../logic/benchTimeline';
import { BENCH_SEED } from '../logic/rng';
import { getCameraYaw } from '../render/cameraView';
import { getContextLostCount } from '../render/renderer';
import { benchWaypoints, MASS_RAGDOLL_WINDOW_STEPS } from './benchScript';
import './soak.css';

/**
 * ?soak=1 (plan 01-18, TECH-04, D-24). Loops the 01-17 benchmark scene (10 NPCs, roam + slaps, mass ragdoll, smash) for
 * `minutes`, one `cycleSec` timeline per cycle and no results screen. Between cycles every active NPC returns to its
 * route, breakables.resetAll() clears the shards and restores the props, and the player goes back to spawn. At the end
 * of every cycle renderer geometries / textures and Rapier bodies are sampled (baseline = end of cycle 1): a real
 * leak shows as numbers that keep climbing. Headless runs pass soakCycles to stop early (the leak proxy e2e); the
 * 15-minute Safari iOS run is the real-device gate (01-19). The screen wake lock is requested where supported so a phone
 * does not dim mid-soak. Nothing leaves the device (TECH-05).
 */

export interface SoakCycleEnd {
  cycle: number;
  geometries: number;
  textures: number;
  bodies: number;
  debrisActive: number;
}

/** A frame within this long after the start or a resume is not used for the per-minute minimum (the meter refills). */
const FPS_SETTLE_MS = 1000;
/** Panel refresh rate. */
const PANEL_REFRESH_MS = 250;

interface ScreenWakeLock {
  request(type: 'screen'): Promise<{ release(): Promise<void> }>;
}

function wakeLockApi(): ScreenWakeLock | null {
  return 'wakeLock' in navigator ? ((navigator as unknown as { wakeLock?: ScreenWakeLock }).wakeLock ?? null) : null;
}

let started = false;

export function startSoak(game: Game, opts: SoakOptions): void {
  if (started) throw new Error('soak already started');
  started = true;

  const minutes = opts.minutes;
  const maxCycles = opts.maxCycles;
  const actions: BenchAction[] = buildTimeline({ durationSec: opts.cycleSec, seed: BENCH_SEED, waypoints: benchWaypoints() });
  const autopilot = createAutopilot();
  const pause = getPauseState();
  const fpsMeter = createFpsMeter(1000);

  let running = true;
  let done = false;
  let cycles = 0;
  let next = 0;
  let cycleBase = -1;
  let massWindowLeft = 0;
  let elapsedMs = 0;
  let lastTs = -1;
  let settleUntil = -1;
  let nextPanelMs = 0;
  const minFpsPerMinute: number[] = [];
  const cycleEnds: SoakCycleEnd[] = [];
  let baseline: { geometries: number; textures: number; bodies: number } | null = null;

  // ---------- screen wake lock (ignored where unsupported or refused) ----------
  let lock: { release(): Promise<void> } | null = null;
  function requestWakeLock(): void {
    const api = wakeLockApi();
    if (!api || done) return;
    api
      .request('screen')
      .then((l) => {
        if (done) void l.release().catch(() => undefined);
        else lock = l;
      })
      .catch(() => undefined);
  }
  function releaseWakeLock(): void {
    const l = lock;
    lock = null;
    if (l) void l.release().catch(() => undefined);
  }
  // The browser drops the lock whenever the page is hidden; ask again when it comes back.
  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') requestWakeLock();
  };
  document.addEventListener('visibilitychange', onVisibility);
  requestWakeLock();

  // ---------- panel ----------
  const panel = document.createElement('div');
  panel.id = 'soak-panel';
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = 'SOAK';
  panel.appendChild(title);
  function row(label: string): HTMLSpanElement {
    const r = document.createElement('div');
    r.className = 'row';
    const l = document.createElement('span');
    l.textContent = label;
    const v = document.createElement('span');
    r.append(l, v);
    panel.appendChild(r);
    return v;
  }
  const vMinutes = row('Phút');
  const vCycles = row('Chu kỳ');
  const vMinFps = row('FPS thấp nhất/phút');
  const vContext = row('Mất ngữ cảnh');
  const vGeometries = row('Geometries');
  const vTextures = row('Textures');
  const vBodies = row('Bodies');
  const status = document.createElement('div');
  status.className = 'status';
  panel.appendChild(status);
  document.body.appendChild(panel);

  function mmss(ms: number): string {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function withBase(live: number, base: number | undefined): string {
    return base === undefined ? String(live) : `${live} (gốc ${base})`;
  }

  function renderPanel(): void {
    const s = game.stats();
    vMinutes.textContent = `${mmss(elapsedMs)} / ${minutes}:00`;
    vCycles.textContent = maxCycles === undefined ? String(cycles) : `${cycles} / ${maxCycles}`;
    vMinFps.textContent = minFpsPerMinute.length === 0 ? '—' : minFpsPerMinute.join(' · ');
    vContext.textContent = String(getContextLostCount());
    vGeometries.textContent = withBase(s.geometries, baseline?.geometries);
    vTextures.textContent = withBase(s.textures, baseline?.textures);
    vBodies.textContent = withBase(s.bodies, baseline?.bodies);
    if (done) {
      status.classList.add('done');
      status.textContent =
        maxCycles !== undefined && cycles >= maxCycles && elapsedMs < minutes * 60_000
          ? `Xong ${cycles} chu kỳ — không crash`
          : `Xong ${minutes} phút — không crash`;
    } else {
      status.textContent = pause.isPaused() ? 'Tạm dừng' : 'Đang chạy…';
    }
  }

  // ---------- cycle driver ----------
  function run(a: BenchAction): void {
    switch (a.kind) {
      case 'walkTo':
        autopilot.setTarget(a.x, a.z);
        break;
      case 'slapNearest':
        game.slapNearestNpc();
        break;
      case 'massRagdoll':
        game.massRagdoll();
        massWindowLeft = MASS_RAGDOLL_WINDOW_STEPS;
        break;
      case 'smash':
        game.smash();
        break;
      case 'end':
        endCycle();
        break;
    }
  }

  function endCycle(): void {
    autopilot.stop();
    massWindowLeft = 0;
    // Reset before sampling: the cycle-end numbers describe the scene as the next cycle starts it.
    game.resetForSoak();
    game.breakables.resetAll();
    autopilot.apply(game.playerInput, game.player.pos(), getCameraYaw());
    cycles++;
    const s = game.stats();
    const end: SoakCycleEnd = {
      cycle: cycles,
      geometries: s.geometries,
      textures: s.textures,
      bodies: s.bodies,
      debrisActive: game.debrisActive(),
    };
    cycleEnds.push(end);
    if (baseline === null) baseline = { geometries: end.geometries, textures: end.textures, bodies: end.bodies };
    next = 0;
    cycleBase = -1;
    if (maxCycles !== undefined && cycles >= maxCycles) finish();
  }

  function finish(): void {
    if (done) return;
    done = true;
    running = false;
    autopilot.stop();
    autopilot.apply(game.playerInput, game.player.pos(), getCameraYaw());
    unsubStep();
    unsubFrame();
    document.removeEventListener('visibilitychange', onVisibility);
    releaseWakeLock();
    renderPanel();
  }

  const unsubStep = onStep((step) => {
    if (done) return;
    if (cycleBase < 0) cycleBase = step;
    const local = step - cycleBase;
    while (next < actions.length && actions[next].step <= local) {
      const a = actions[next++];
      run(a);
      if (done || a.kind === 'end') return;
    }
    if (massWindowLeft > 0) {
      massWindowLeft--;
      if (game.countRagdollsActive() < game.activeNpcCount()) game.massRagdoll();
      if (game.countRagdollsActive() >= game.activeNpcCount()) massWindowLeft = 0;
    }
    autopilot.apply(game.playerInput, game.player.pos(), getCameraYaw());
  });

  const unsubFrame = onFrame((ts) => {
    if (done) return;
    if (pause.isPaused()) {
      // Paused time (menu, hidden tab, lost context) is not soak time; the gap after a resume is skipped.
      lastTs = -1;
      settleUntil = -1;
    } else {
      if (lastTs >= 0 && ts > lastTs) elapsedMs += ts - lastTs;
      if (settleUntil < 0) settleUntil = ts + FPS_SETTLE_MS;
      lastTs = ts;
      fpsMeter.push(ts);
      if (ts >= settleUntil) {
        const fps = Math.round(fpsMeter.fps());
        const minute = Math.floor(elapsedMs / 60_000);
        if (fps > 0) {
          if (minFpsPerMinute.length <= minute) {
            while (minFpsPerMinute.length < minute) minFpsPerMinute.push(0);
            minFpsPerMinute.push(fps);
          } else if (fps < minFpsPerMinute[minute]) {
            minFpsPerMinute[minute] = fps;
          }
        }
      }
      if (elapsedMs >= minutes * 60_000) {
        finish();
        return;
      }
    }
    if (ts >= nextPanelMs) {
      nextPanelMs = ts + PANEL_REFRESH_MS;
      renderPanel();
    }
  });

  renderPanel();

  registerDebug('soak', () => {
    const s = game.stats();
    return {
      running,
      done,
      cycles,
      elapsedSec: Math.round(elapsedMs / 100) / 10,
      minFpsPerMinute: [...minFpsPerMinute],
      geometries: s.geometries,
      textures: s.textures,
      bodies: s.bodies,
      contextLost: getContextLostCount(),
      baseline: baseline ? { ...baseline } : null,
      cycleEnds: cycleEnds.map((c) => ({ ...c })),
    };
  });
}

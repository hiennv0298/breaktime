import { isTypingTarget } from '../logic/keyMap';
import './debugHud.css';

/** One 4 Hz sample shown by the HUD (TECH-07). */
export interface HudStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  bodies: number;
  sleeping: number;
  peakBodies: number;
  tierLabel: string;
  source: string;
  dpr: number;
  rapierFlavor: string;
}

export interface DebugHud {
  visible(): boolean;
  toggle(): void;
  sample(stats: HudStats): void;
  /** Called after every show/hide (the pause-menu button mirrors it); returns an unsubscribe function. */
  onToggle(cb: (visible: boolean) => void): () => void;
}

/**
 * Toggleable debug HUD: Backquote (KeyboardEvent.code, layout-independent), ?debug=1, or the pause-menu button.
 * Built with createElement/textContent only; lines are rewritten only while visible.
 */
export function createDebugHud(initialVisible: boolean): DebugHud {
  const root = document.createElement('div');
  root.id = 'debug-hud';
  root.setAttribute('aria-hidden', 'true');
  const lines = Array.from({ length: 5 }, () => {
    const line = document.createElement('div');
    root.appendChild(line);
    return line;
  });
  let shown = initialVisible;
  root.hidden = !shown;
  document.body.appendChild(root);

  let last: HudStats | undefined;
  const toggleListeners = new Set<(visible: boolean) => void>();

  function render(): void {
    if (!shown || !last) return;
    const s = last;
    lines[0].textContent = `FPS ${Math.round(s.fps)}`;
    lines[1].textContent = `Draw ${s.drawCalls} / Tris ${s.triangles}`;
    lines[2].textContent = `Bodies ${s.bodies} (ngủ ${s.sleeping}, đỉnh ${s.peakBodies})`;
    lines[3].textContent = `Tier ${s.tierLabel} (${s.source}) DPR ${Number(s.dpr.toFixed(2))}`;
    lines[4].textContent = `Rapier ${s.rapierFlavor}`;
  }

  const hud: DebugHud = {
    visible: () => shown,
    toggle() {
      shown = !shown;
      root.hidden = !shown;
      render();
      for (const cb of [...toggleListeners]) cb(shown);
    },
    sample(stats) {
      last = stats;
      render();
    },
    onToggle(cb) {
      toggleListeners.add(cb);
      return () => toggleListeners.delete(cb);
    },
  };

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Backquote' || e.repeat) return;
    // Not a game key inside a text field or as part of a browser shortcut (D-27).
    if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
    hud.toggle();
  });

  return hud;
}

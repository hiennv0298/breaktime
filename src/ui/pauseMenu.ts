import { getQuality } from '../game/qualityManager';
import { TIER_LABEL_VI, type Tier } from '../logic/quality';
import type { DebugHud } from './debugHud';

const TIER_ORDER: readonly Tier[] = ['low', 'med', 'high'];

/**
 * Pause-menu section (D-21, TECH-07): Thấp / Vừa / Cao buttons (data-tier, aria-pressed on the current tier) that set a
 * manual tier through getQuality(), and #hud-toggle "HUD debug". Call after the quality manager exists.
 */
export function createQualityControls(hud: DebugHud): HTMLElement {
  const quality = getQuality();
  const section = document.createElement('div');
  section.className = 'quality-section';

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = 'Chất lượng';

  const row = document.createElement('div');
  row.className = 'tier-buttons';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', 'Chất lượng');

  const buttons = TIER_ORDER.map((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.tier = t;
    b.textContent = TIER_LABEL_VI[t];
    b.addEventListener('click', () => {
      getQuality().setManual(t);
      mark(); // re-selecting the current tier fires no change event
    });
    row.appendChild(b);
    return b;
  });

  function mark(): void {
    const current = quality.current();
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.tier === current));
  }
  mark();
  quality.onChange(mark);

  const hudToggle = document.createElement('button');
  hudToggle.id = 'hud-toggle';
  hudToggle.type = 'button';
  hudToggle.textContent = 'HUD debug';
  const markHud = (visible: boolean): void => hudToggle.setAttribute('aria-pressed', String(visible));
  markHud(hud.visible());
  hud.onToggle(markHud);
  hudToggle.addEventListener('click', () => hud.toggle());

  section.append(label, row, hudToggle);
  return section;
}

/** Pause overlay (D-20, CTRL-04). Built with createElement/textContent only (T-01-08-01). */
export interface PauseMenu {
  show(): void;
  hide(): void;
  /** Append a section below the resume button (plan 01-11 adds quality tier and HUD controls). */
  addSection(el: HTMLElement): void;
}

export function createPauseMenu(onResume: () => void): PauseMenu {
  const root = document.createElement('div');
  root.id = 'pause-menu';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'pause-title');

  const panel = document.createElement('div');
  panel.className = 'panel';

  const title = document.createElement('h2');
  title.id = 'pause-title';
  title.textContent = 'Tạm dừng';

  const resume = document.createElement('button');
  resume.id = 'pause-resume';
  resume.type = 'button';
  resume.textContent = 'Tiếp tục';
  resume.addEventListener('click', () => onResume());

  const sections = document.createElement('div');
  sections.className = 'sections';

  panel.append(title, resume, sections);
  root.append(panel);
  document.body.appendChild(root);

  return {
    show() {
      root.hidden = false;
    },
    hide() {
      root.hidden = true;
      // Do not leave focus on a (now hidden) menu button.
      const active = document.activeElement;
      if (active instanceof HTMLElement && root.contains(active)) active.blur();
    },
    addSection(el) {
      sections.appendChild(el);
    },
  };
}

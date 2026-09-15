import './npcLabels.css';

/**
 * Name tags over NPC heads (plan 01-26, D-29): plain DOM, so they cost 0 draw calls and stay crisp at any DPR.
 * Text is written with textContent only (T-01-26-01) — a stored "<img onerror>" shows as literal characters. The layer
 * is aria-hidden and pointer-events none, so it never steals a click or touch from the game view.
 */
export interface NpcLabels {
  /** Sets the label text of NPC i; an empty text hides the label. */
  setText(i: number, text: string): void;
  /** Places the bottom-centre of label i at CSS pixel (x, y) and shows it (when it has text). */
  place(i: number, x: number, y: number): void;
  hide(i: number): void;
  snapshot(): Array<{ index: number; text: string; visible: boolean; x: number; y: number }>;
}

interface LabelSlot {
  el: HTMLDivElement;
  text: string;
  x: number;
  y: number;
}

export function createNpcLabels(root: HTMLElement, capacity: number): NpcLabels {
  const layer = document.createElement('div');
  layer.id = 'npc-labels';
  layer.setAttribute('aria-hidden', 'true');
  root.appendChild(layer);

  const slots: Array<LabelSlot | undefined> = [];
  const inRange = (i: number): boolean => Number.isInteger(i) && i >= 0 && i < capacity;

  function slot(i: number): LabelSlot {
    let s = slots[i];
    if (!s) {
      const el = document.createElement('div');
      el.className = 'npc-label';
      el.setAttribute('data-npc', String(i));
      el.hidden = true;
      layer.appendChild(el);
      s = { el, text: '', x: Number.NaN, y: Number.NaN };
      slots[i] = s;
    }
    return s;
  }

  return {
    setText(i, text) {
      if (!inRange(i)) return;
      const s = slot(i);
      s.text = typeof text === 'string' ? text : '';
      s.el.textContent = s.text;
      if (s.text === '') s.el.hidden = true;
    },
    place(i, x, y) {
      if (!inRange(i)) return;
      const s = slot(i);
      if (s.text === '') {
        s.el.hidden = true;
        return;
      }
      const rx = Math.round(x);
      const ry = Math.round(y);
      if (rx !== s.x || ry !== s.y) {
        s.x = rx;
        s.y = ry;
        s.el.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -100%)`;
      }
      if (s.el.hidden) s.el.hidden = false;
    },
    hide(i) {
      if (!inRange(i)) return;
      const s = slots[i];
      if (s && !s.el.hidden) s.el.hidden = true;
    },
    snapshot() {
      const out: Array<{ index: number; text: string; visible: boolean; x: number; y: number }> = [];
      slots.forEach((s, index) => {
        if (s) out.push({ index, text: s.text, visible: !s.el.hidden, x: s.x, y: s.y });
      });
      return out;
    },
  };
}

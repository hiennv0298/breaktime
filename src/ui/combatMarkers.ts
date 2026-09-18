/**
 * DOM '!' markers over winding-up NPCs (plan 02-10, D-08): textContent only, 0 draw calls,
 * positioned using the same projection math as labels (plan 02-09).
 */
import './combatMarkers.css';

export interface CombatMarkers {
  /** Show '!' marker over NPC at (x, y) in world space. */
  place(i: number, x: number, y: number): void;
  /** Hide marker for NPC i. */
  hide(i: number): void;
  /** Snapshot of current markers for testing. */
  snapshot(): Array<{ index: number; visible: boolean; text: string }>;
}

export function createCombatMarkers(root: HTMLElement, capacity: number): CombatMarkers {
  const layer = document.createElement('div');
  layer.id = 'combat-markers';
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '91',
    pointerEvents: 'none',
    overflow: 'hidden',
  });
  root.appendChild(layer);

  const marks = new Map<number, HTMLElement>();

  function getOrCreate(index: number): HTMLElement {
    let mark = marks.get(index);
    if (!mark) {
      mark = document.createElement('div');
      mark.className = 'combat-mark';
      mark.setAttribute('data-npc', String(index));
      mark.textContent = '!';
      Object.assign(mark.style, {
        position: 'fixed',
        font: '800 22px system-ui',
        color: '#1d1f24',
        backgroundColor: 'rgba(255, 200, 61, 0.9)',
        borderRadius: '50%',
        width: '28px',
        height: '28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: 'translate(-50%, -50%)',
      });
      layer.appendChild(mark);
      marks.set(index, mark);
    }
    return mark;
  }

  return {
    place(i, x, y) {
      const mark = getOrCreate(i);
      mark.style.left = `${x}px`;
      mark.style.top = `${y}px`;
      mark.style.display = 'flex';
    },
    hide(i) {
      const mark = marks.get(i);
      if (mark) mark.style.display = 'none';
    },
    snapshot() {
      const result: Array<{ index: number; visible: boolean; text: string }> = [];
      for (const [index, mark] of marks) {
        result.push({
          index,
          visible: mark.style.display !== 'none',
          text: mark.textContent || '',
        });
      }
      return result;
    },
  };
}

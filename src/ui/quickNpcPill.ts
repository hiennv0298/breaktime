import './quickNpcPill.css';

/**
 * Plan 02-08 (D-02): HUD "− N +" pill to add or remove coworkers in play.
 * Pure DOM (createElement/textContent only, CSP safe); no three.js, no state.
 * Creates div#npc-pill with three children: button#npc-pill-dec (−), output#npc-pill-value (N), button#npc-pill-inc (+).
 */

export interface QuickNpcPill {
  /** Updates the count display and button states; no-op when values unchanged. */
  update(count: number, max: number): void;
  /** Shows or hides the pill (used by bench mode). */
  setHidden(hidden: boolean): void;
}

export function createQuickNpcPill(
  root: HTMLElement,
  opts: { onDelta(delta: 1 | -1): void },
): QuickNpcPill {
  const pill = document.createElement('div');
  pill.id = 'npc-pill';
  pill.setAttribute('data-hud-panel', '');
  pill.setAttribute('role', 'group');
  pill.setAttribute('aria-label', 'Số đồng nghiệp');

  const dec = document.createElement('button');
  dec.id = 'npc-pill-dec';
  dec.type = 'button';
  dec.tabIndex = -1;
  dec.textContent = '−'; // U+2212 minus sign
  dec.setAttribute('aria-label', 'Bớt một đồng nghiệp');

  const value = document.createElement('output');
  value.id = 'npc-pill-value';
  value.setAttribute('aria-live', 'polite');
  value.textContent = '0';

  const inc = document.createElement('button');
  inc.id = 'npc-pill-inc';
  inc.type = 'button';
  inc.tabIndex = -1;
  inc.textContent = '+';
  inc.setAttribute('aria-label', 'Thêm một đồng nghiệp');

  // Only mouse left button or touch/pen triggers the callback; preventDefault blocks swinging (D-30).
  function onPointerDown(e: PointerEvent, delta: 1 | -1): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    opts.onDelta(delta);
  }

  dec.addEventListener('pointerdown', (e) => onPointerDown(e, -1));
  inc.addEventListener('pointerdown', (e) => onPointerDown(e, 1));

  pill.appendChild(dec);
  pill.appendChild(value);
  pill.appendChild(inc);
  root.appendChild(pill);

  let lastCount = -1;
  let lastMax = -1;

  return {
    update(count: number, max: number) {
      // Update count display only when it changes
      if (count !== lastCount) {
        value.textContent = String(count);
      }
      // Update disabled states when count or max changes
      if (count !== lastCount || max !== lastMax) {
        const decDisabled = count === 0;
        const incDisabled = count >= max;
        dec.disabled = decDisabled;
        inc.disabled = incDisabled;
        if (decDisabled) dec.setAttribute('disabled', '');
        else dec.removeAttribute('disabled');
        if (incDisabled) inc.setAttribute('disabled', '');
        else inc.removeAttribute('disabled');
      }
      lastCount = count;
      lastMax = max;
    },
    setHidden(hidden: boolean) {
      pill.hidden = hidden;
    },
  };
}

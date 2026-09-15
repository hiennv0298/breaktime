import { rotateCamera } from '../render/cameraView';

function coarsePointer(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Constant circular-arrow path data on a 24x24 grid: ⟲ counter-clockwise, ⟳ clockwise. SVG instead of the
 * U+27F2 / U+27F3 characters so the icons do not depend on the phone fonts. Never built from input (T-01-09-03). */
const ROT_PATHS: Readonly<Record<-1 | 1, readonly string[]>> = {
  [-1]: ['M3 12a9 9 0 1 0 2.64-6.36L3 8', 'M3 3v5h5'],
  [1]: ['M21 12a9 9 0 1 1-2.64-6.36L21 8', 'M21 3v5h-5'],
};

function buildIcon(dir: -1 | 1): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of ROT_PATHS[dir]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

function makeButton(id: string, dir: -1 | 1, label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.id = id;
  b.type = 'button';
  b.tabIndex = -1; // keyboard players rotate with Z / C; a focused button would also react to Space
  b.setAttribute('data-hud-button', '');
  b.setAttribute('aria-label', label);
  b.appendChild(buildIcon(dir));
  return b;
}

/**
 * ⟲ (#btn-rot-left, -90°) and ⟳ (#btn-rot-right, +90°) touch buttons at the top-right (D-19).
 * Each has its own pointerdown listener with preventDefault, so it works while another finger holds the
 * joystick. Visible on a coarse pointer or after the first touch, like the other touch buttons.
 * Positions live in layout.css (landscape top-right, portrait bottom-left). Returns a detach function.
 */
export function attachCameraButtons(root: HTMLElement): () => void {
  const left = makeButton('btn-rot-left', -1, 'Xoay camera trái');
  const right = makeButton('btn-rot-right', 1, 'Xoay camera phải');
  let touchSeen = false;

  function applyVisibility(): void {
    const show = touchSeen || coarsePointer();
    left.hidden = !show;
    right.hidden = !show;
  }

  function press(dir: -1 | 1) {
    return (e: PointerEvent): void => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      rotateCamera(dir);
    };
  }
  const onLeft = press(-1);
  const onRight = press(1);

  function onAnyPointer(e: PointerEvent): void {
    if (e.pointerType === 'touch' && !touchSeen) {
      touchSeen = true;
      applyVisibility();
    }
  }

  const mq = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null;

  left.addEventListener('pointerdown', onLeft);
  right.addEventListener('pointerdown', onRight);
  window.addEventListener('pointerdown', onAnyPointer, { capture: true });
  mq?.addEventListener('change', applyVisibility);

  // Temporary inline top-right placement; layout.css takes over (portrait stacking, safe areas).
  left.style.top = '12px';
  left.style.right = '148px';
  right.style.top = '12px';
  right.style.right = '80px';

  applyVisibility();
  root.append(left, right);

  return () => {
    left.removeEventListener('pointerdown', onLeft);
    right.removeEventListener('pointerdown', onRight);
    window.removeEventListener('pointerdown', onAnyPointer, { capture: true });
    mq?.removeEventListener('change', applyVisibility);
    left.remove();
    right.remove();
  };
}

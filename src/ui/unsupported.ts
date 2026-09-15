// Unsupported device screen (D-22) and boot failure screen. Must not import three. textContent only.
import type { Caps } from '../boot/capabilities';

function textEl<K extends keyof HTMLElementTagNameMap>(tag: K, text: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
}

function removeOverlays(): void {
  for (const id of ['loading', 'play', 'unsupported', 'boot-error']) document.getElementById(id)?.remove();
}

export function showUnsupported(caps: Caps): void {
  removeOverlays();
  const section = document.createElement('section');
  section.id = 'unsupported';
  const inner = document.createElement('div'); // #unsupported is a flex row; one child keeps the text stacked
  inner.appendChild(textEl('h1', 'Trình duyệt này chưa chạy được Break Time'));
  inner.appendChild(
    textEl(
      'p',
      'Game cần WebGL2 và WebAssembly. Hãy mở bằng Chrome, Edge hoặc Firefox bản mới, hoặc Safari trên iOS 16.4 trở lên.',
    ),
  );
  const missing: string[] = [];
  if (!caps.webgl2) missing.push('WebGL2');
  if (!caps.wasm) missing.push('WebAssembly');
  inner.appendChild(textEl('p', 'Thiếu: ' + (missing.length ? missing.join(', ') : 'không rõ')));
  section.appendChild(inner);
  document.body.appendChild(section);
}

/** Generic "could not load" screen with a reload button. Styled via CSSOM (no HTML strings). */
export function showBootError(): void {
  removeOverlays();
  const section = document.createElement('section');
  section.id = 'boot-error';
  section.style.cssText =
    'position:fixed;inset:0;z-index:700;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;background:#1d1f24;color:#f2f2f2;font-size:18px;';
  section.appendChild(textEl('h1', 'Không tải được game'));
  const btn = textEl('button', 'Tải lại');
  btn.type = 'button';
  btn.style.cssText =
    'min-width:160px;min-height:52px;border:0;border-radius:12px;font:inherit;font-weight:700;color:#1d1f24;background:#ffc83d;cursor:pointer;';
  btn.addEventListener('click', () => location.reload());
  section.appendChild(btn);
  document.body.appendChild(section);
}

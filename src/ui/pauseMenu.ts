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
      // Do not leave focus on the (now hidden) resume button.
      if (document.activeElement === resume) resume.blur();
    },
    addSection(el) {
      sections.appendChild(el);
    },
  };
}

import { MAX_NPCS, normalizeNpcSettings, type NpcSettings } from '../logic/npcSettings';
import './settings.css';

/**
 * Pause-menu NPC section (plan 01-27, D-29, CTRL-07; menu from CTRL-04 / D-27): a 0–10 count stepper, one name field per
 * NPC and an "Áp dụng" button that applies at once. Built with createElement / textContent / value only (T-01-27-01).
 * Typed names are cleaned by normalizeNpcSettings on Apply and written back into the fields, so what the player sees
 * is exactly what the tags show and what is stored. This module never touches storage or the network (T-01-27-06):
 * the caller saves (writeNpcSettings) and applies (Game.applyNpcSettings), and reports whether the save worked.
 */
export interface NpcSettingsSectionOptions {
  initial: NpcSettings;
  onApply(s: NpcSettings): { saved: boolean };
}

/** Field length cap in UTF-16 units: generous so a Vietnamese IME composition is never cut mid-letter (names clean to 16). */
const FIELD_MAX_LENGTH = 32;
const STATUS_SAVED = 'Đã lưu trên máy này';
const STATUS_NOT_SAVED = 'Không lưu được (trình duyệt chặn lưu) — chỉ áp dụng lần này';

export function createNpcSettingsSection(opts: NpcSettingsSectionOptions): HTMLElement {
  const start = normalizeNpcSettings(opts.initial);
  let count = start.count;

  const section = document.createElement('section');
  section.className = 'npc-section';

  const label = document.createElement('div');
  label.className = 'label';
  label.id = 'npc-section-label';
  label.textContent = 'NPC trong văn phòng';
  section.setAttribute('aria-labelledby', label.id);

  const stepper = document.createElement('div');
  stepper.className = 'npc-stepper';
  stepper.setAttribute('role', 'group');
  stepper.setAttribute('aria-label', 'Số NPC');

  const dec = document.createElement('button');
  dec.id = 'npc-count-dec';
  dec.type = 'button';
  dec.textContent = '−';
  dec.setAttribute('aria-label', 'Bớt một NPC');

  const value = document.createElement('output');
  value.id = 'npc-count-value';
  value.setAttribute('aria-live', 'polite');

  const inc = document.createElement('button');
  inc.id = 'npc-count-inc';
  inc.type = 'button';
  inc.textContent = '+';
  inc.setAttribute('aria-label', 'Thêm một NPC');

  stepper.append(dec, value, inc);

  const nameList = document.createElement('div');
  nameList.className = 'npc-names';
  const rows: HTMLLabelElement[] = [];
  const fields: HTMLInputElement[] = [];
  for (let i = 0; i < MAX_NPCS; i++) {
    const row = document.createElement('label');
    row.className = 'npc-name-row';
    const input = document.createElement('input');
    input.className = 'npc-name';
    input.type = 'text';
    input.dataset.index = String(i);
    input.maxLength = FIELD_MAX_LENGTH;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.enterKeyHint = 'done';
    input.placeholder = 'Tên NPC ' + (i + 1);
    input.setAttribute('aria-label', 'Tên NPC ' + (i + 1));
    input.value = start.names[i] ?? '';
    // Keep the focused field above the on-screen keyboard inside the scrollable panel (D-16 portrait and landscape).
    input.addEventListener('focus', () => {
      if (typeof input.scrollIntoView === 'function') input.scrollIntoView({ block: 'nearest' });
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        apply();
      }
    });
    row.append(input);
    nameList.append(row);
    rows.push(row);
    fields.push(input);
  }

  const applyButton = document.createElement('button');
  applyButton.id = 'npc-apply';
  applyButton.type = 'button';
  applyButton.textContent = 'Áp dụng';

  const status = document.createElement('div');
  status.id = 'npc-apply-status';
  status.setAttribute('aria-live', 'polite');

  function render(): void {
    value.textContent = String(count);
    dec.disabled = count <= 0;
    inc.disabled = count >= MAX_NPCS;
    rows.forEach((row, i) => {
      row.hidden = i >= count;
    });
  }

  function step(delta: number): void {
    const next = Math.max(0, Math.min(MAX_NPCS, count + delta));
    if (next === count) return;
    count = next;
    status.textContent = '';
    render();
  }

  function apply(): void {
    const s = normalizeNpcSettings({ count, names: fields.map((f) => f.value) });
    fields.forEach((f, i) => {
      if (f.value !== s.names[i]) f.value = s.names[i];
    });
    count = s.count;
    render();
    const result = opts.onApply(s);
    status.textContent = result.saved ? STATUS_SAVED : STATUS_NOT_SAVED;
  }

  dec.addEventListener('click', () => step(-1));
  inc.addEventListener('click', () => step(1));
  applyButton.addEventListener('click', () => apply());

  render();
  section.append(label, stepper, nameList, applyButton, status);
  return section;
}

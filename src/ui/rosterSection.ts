import {
  addMember,
  maxOnFloor,
  normalizeRoster,
  NPC_LOOKS,
  removeMember,
  renameMember,
  resetRoster,
  setMemberLook,
  setMemberPresent,
  setMemberTemper,
  type Roster,
  type RosterMember,
} from '../logic/roster';
import { randomPresetName } from '../logic/presetNames';
import { mulberry32 } from '../logic/rng';
import { TEMPER_LABEL_VI, TEMPERS } from '../logic/temper';
import './settings.css';

/**
 * Roster editor in the pause menu (plan 02-09, D-03, D-04, D-10): up to 30 coworkers with name, look, temper,
 * presence (0..15), random names, add, delete, clear-all, warning line, name-tag switch (NPC-02, NPC-05).
 * Built with createElement / textContent / value / checked / disabled and setAttribute only (T-02-09-02).
 */

export interface RosterSectionOptions {
  initial: Roster;
  onApply(r: Roster): { saved: boolean };
  onLookPreview(letter: string): void;
  labelsEnabled(): boolean;
  onLabelsToggle(on: boolean): { saved: boolean };
}

export interface RosterSection {
  el: HTMLElement;
  refresh(r: Roster): void;
}

const FIELD_MAX_LENGTH = 32;
const STATUS_SAVED = 'Đã lưu trên máy này';
const STATUS_NOT_SAVED = 'Không lưu được (trình duyệt chặn lưu) — chỉ áp dụng lần này';
const STATUS_CLEARED = 'Đã xoá hết tên';
const WARNING_TEXT = 'Tên chỉ lưu trên máy bạn — đừng dùng để xúc phạm ai';

export function createRosterSection(opts: RosterSectionOptions): RosterSection {
  let draft = normalizeRoster(opts.initial);
  // UI rng for random names and addMember looks (UI module, not a logic file)
  const uiRng = mulberry32((Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0);

  const section = document.createElement('section');
  section.className = 'roster-section';

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = 'Đồng nghiệp';
  section.append(label);

  const warning = document.createElement('p');
  warning.id = 'roster-warning';
  warning.textContent = WARNING_TEXT;
  section.append(warning);

  // Stepper: −, count, max, +
  const stepper = document.createElement('div');
  stepper.className = 'npc-stepper';
  stepper.setAttribute('role', 'group');
  stepper.setAttribute('aria-label', 'Số đồng nghiệp hiện tại');

  const dec = document.createElement('button');
  dec.id = 'npc-count-dec';
  dec.type = 'button';
  dec.textContent = '−';
  dec.setAttribute('aria-label', 'Bớt một đồng nghiệp');

  const value = document.createElement('output');
  value.id = 'npc-count-value';
  value.setAttribute('aria-live', 'polite');

  const max = document.createElement('span');
  max.id = 'npc-count-max';
  max.textContent = '/ 15';

  const inc = document.createElement('button');
  inc.id = 'npc-count-inc';
  inc.type = 'button';
  inc.textContent = '+';
  inc.setAttribute('aria-label', 'Thêm một đồng nghiệp');

  stepper.append(dec, value, max, inc);
  section.append(stepper);

  // Roster list: rows per member
  const rosterList = document.createElement('div');
  rosterList.className = 'roster-list';

  const rows = new Map<string, HTMLElement>();
  const fields = new Map<string, HTMLInputElement>();
  const presents = new Map<string, HTMLInputElement>();
  const looks = new Map<string, HTMLSelectElement>();
  const tempers = new Map<string, HTMLSelectElement>();

  function createRow(member: RosterMember, visible: boolean): HTMLElement {
    const row = document.createElement('div');
    row.className = 'roster-row';
    row.setAttribute('data-member-id', member.id);
    if (!visible) row.hidden = true;

    // Checkbox: present
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'roster-present';
    checkbox.checked = draft.present.includes(member.id);
    checkbox.setAttribute('aria-label', `${member.name || member.id} có mặt`);

    // Name field
    const field = document.createElement('input');
    field.className = 'npc-name';
    field.type = 'text';
    field.maxLength = FIELD_MAX_LENGTH;
    field.autocomplete = 'off';
    field.spellcheck = false;
    field.enterKeyHint = 'done';
    field.placeholder = 'Tên đồng nghiệp';
    field.setAttribute('aria-label', `Tên ${member.id}`);
    field.value = member.name;

    // Random name button
    const randomBtn = document.createElement('button');
    randomBtn.className = 'roster-random';
    randomBtn.type = 'button';
    randomBtn.textContent = 'Ngẫu nhiên';

    // Look select
    const lookSelect = document.createElement('select');
    lookSelect.className = 'roster-look';
    for (let i = 0; i < NPC_LOOKS.length; i++) {
      const opt = document.createElement('option');
      opt.value = NPC_LOOKS[i];
      opt.textContent = `Kiểu ${i + 1}`;
      lookSelect.append(opt);
    }
    lookSelect.value = member.look;

    // Temper select
    const temperSelect = document.createElement('select');
    temperSelect.className = 'roster-temper';
    for (const t of TEMPERS) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = TEMPER_LABEL_VI[t];
      temperSelect.append(opt);
    }
    temperSelect.value = member.temper;

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'roster-delete';
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Xoá';

    field.addEventListener('focus', () => {
      if (typeof field.scrollIntoView === 'function') field.scrollIntoView({ block: 'nearest' });
    });

    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        apply();
      }
    });

    checkbox.addEventListener('change', () => {
      const checked = checkbox.checked;
      if (checked && draft.present.length >= 15) {
        checkbox.checked = false;
        return;
      }
      if (checked) {
        setMemberPresent(draft, member.id, true);
      } else {
        setMemberPresent(draft, member.id, false);
      }
      render();
    });

    randomBtn.addEventListener('click', () => {
      const taken = draft.members.map((m) => m.name);
      const name = randomPresetName(uiRng, taken);
      field.value = name;
    });

    lookSelect.addEventListener('change', () => {
      const letter = lookSelect.value;
      if (NPC_LOOKS.includes(letter)) {
        setMemberLook(draft, member.id, letter);
        opts.onLookPreview(letter);
      }
    });

    temperSelect.addEventListener('change', () => {
      const temper = temperSelect.value;
      if (temper === 'hot' || temper === 'normal' || temper === 'calm') {
        setMemberTemper(draft, member.id, temper as 'hot' | 'normal' | 'calm');
      }
    });

    deleteBtn.addEventListener('click', () => {
      removeMember(draft, member.id);
      render();
    });

    row.append(checkbox, field, randomBtn, lookSelect, temperSelect, deleteBtn);
    rows.set(member.id, row);
    fields.set(member.id, field);
    presents.set(member.id, checkbox);
    looks.set(member.id, lookSelect);
    tempers.set(member.id, temperSelect);

    return row;
  }

  section.append(rosterList);

  // Add button
  const addBtn = document.createElement('button');
  addBtn.id = 'roster-add';
  addBtn.type = 'button';
  addBtn.textContent = 'Thêm đồng nghiệp';

  addBtn.addEventListener('click', () => {
    if (draft.members.length >= 30) return;
    const member = addMember(draft, uiRng);
    if (member) {
      draft = normalizeRoster(draft);
      render();
    }
  });

  section.append(addBtn);

  // Clear all button
  const clearBtn = document.createElement('button');
  clearBtn.id = 'roster-clear';
  clearBtn.type = 'button';
  clearBtn.textContent = 'Xoá hết';

  let clearArmed = false;
  let clearTimer: number | null = null;

  function disarmClear(): void {
    if (clearArmed) {
      clearArmed = false;
      clearBtn.textContent = 'Xoá hết';
      clearBtn.removeAttribute('data-armed');
      if (clearTimer !== null) {
        clearTimeout(clearTimer);
        clearTimer = null;
      }
    }
  }

  clearBtn.addEventListener('click', () => {
    if (!clearArmed) {
      clearArmed = true;
      clearBtn.setAttribute('data-armed', '');
      clearBtn.textContent = 'Bấm lần nữa để xoá hết';
      clearTimer = window.setTimeout(disarmClear, 4000);
    } else {
      draft = resetRoster();
      disarmClear();
      render();
      // Apply the reset
      const result = opts.onApply(draft);
      status.textContent = result.saved ? (STATUS_SAVED + '; ' + STATUS_CLEARED) : (STATUS_NOT_SAVED + '; ' + STATUS_CLEARED);
    }
  });

  section.append(clearBtn);

  // Label toggle
  const labelsToggle = document.createElement('button');
  labelsToggle.id = 'roster-labels-toggle';
  labelsToggle.type = 'button';
  labelsToggle.textContent = 'Hiện tên trên đầu';
  labelsToggle.setAttribute('aria-pressed', String(opts.labelsEnabled()));

  labelsToggle.addEventListener('click', () => {
    const newEnabled = !opts.labelsEnabled();
    const result = opts.onLabelsToggle(newEnabled);
    labelsToggle.setAttribute('aria-pressed', String(newEnabled));
    status.textContent = result.saved ? STATUS_SAVED : STATUS_NOT_SAVED;
  });

  section.append(labelsToggle);

  // Apply button
  const applyBtn = document.createElement('button');
  applyBtn.id = 'npc-apply';
  applyBtn.type = 'button';
  applyBtn.textContent = 'Áp dụng';

  const status = document.createElement('div');
  status.id = 'npc-apply-status';
  status.setAttribute('aria-live', 'polite');

  function apply(): void {
    disarmClear();

    // Sync field values into the draft
    for (const [id, field] of fields) {
      const member = draft.members.find((m) => m.id === id);
      if (member) {
        renameMember(draft, id, field.value);
      }
    }

    draft = normalizeRoster(draft);

    // Write cleaned names back into fields
    for (const [id, field] of fields) {
      const member = draft.members.find((m) => m.id === id);
      if (member) {
        field.value = member.name;
      }
    }

    const result = opts.onApply(draft);
    status.textContent = result.saved ? STATUS_SAVED : STATUS_NOT_SAVED;
  }

  applyBtn.addEventListener('click', () => apply());
  section.append(applyBtn, status);

  function render(): void {
    // Update stepper
    value.textContent = String(draft.count);
    dec.disabled = draft.count <= 0;
    inc.disabled = draft.count >= maxOnFloor(draft);
    addBtn.disabled = draft.members.length >= 30;

    // Update present checkboxes
    for (const [id, checkbox] of presents) {
      const isPresent = draft.present.includes(id);
      checkbox.checked = isPresent;
      const isFull = draft.present.length >= 15;
      // Disable unchecked boxes when 15 are present
      checkbox.disabled = isFull && !isPresent;
    }

    // Update rows visibility
    for (let i = 0; i < draft.members.length; i++) {
      const member = draft.members[i];
      let row = rows.get(member.id);
      if (!row) {
        row = createRow(member, true);
        rosterList.append(row);
      } else {
        row.hidden = false;
      }
    }

    // Hide extra rows
    for (const [id, row] of rows) {
      if (!draft.members.some((m) => m.id === id)) {
        row.hidden = true;
      }
    }

    // Update other fields from draft
    for (const [id, field] of fields) {
      const member = draft.members.find((m) => m.id === id);
      if (member) {
        field.value = member.name;
        looks.get(id)!.value = member.look;
        tempers.get(id)!.value = member.temper;
      }
    }
  }

  function refresh(r: Roster): void {
    draft = normalizeRoster(r);
    status.textContent = '';
    render();
  }

  // Initial render
  render();

  // Stepper clicks
  dec.addEventListener('click', () => {
    if (draft.count > 0) {
      draft = normalizeRoster({ members: draft.members, present: draft.present, count: draft.count - 1 });
      status.textContent = '';
      render();
    }
  });

  inc.addEventListener('click', () => {
    const max = maxOnFloor(draft);
    if (draft.count < max) {
      draft = normalizeRoster({ members: draft.members, present: draft.present, count: draft.count + 1 });
      status.textContent = '';
      render();
    }
  });

  return { el: section, refresh };
}

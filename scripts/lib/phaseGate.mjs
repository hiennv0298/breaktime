// scripts/lib/phaseGate.mjs — pure D-12 entry-guard logic for Phase 2 integration plans (02-06..02-13).
// No fs access: the CLI (scripts/phase-gate-guard.mjs) reads 01-GATE.md / STATE.md and writes STATE.md back.
//
// D-12 says "VERDICT=PASS mới làm" (integration only after the Phase 1 device gate passes) and "stop if Phase 1
// stops to change stack". Interpretation (operator confirmed 2026-09-16, 02-CONTEXT D-12): a gate that failed
// (VERDICT=FAIL, 01-19) and then passed after the single D-07 optimisation pass (VERDICT_AFTER_OPT=PASS, 01-21)
// also means Phase 1 did not stop, so integration continues.
//
// Fail-closed: only an anchored `VERDICT=PASS` line (or `VERDICT=FAIL` + anchored `VERDICT_AFTER_OPT=PASS`)
// continues. Lines are compared after removing only a trailing CR, so indented, prefixed, lower-case or
// misspelled lines (`  VERDICT=PASS`, `XVERDICT=PASS`, `VERDICT=PASSED`) do not count. When a key appears more
// than once the last anchored line wins (a re-measured gate appends its new verdict). A STATE.md line containing
// `STOP: Three.js + Rapier failed` (written by 01-21 on a second failure) overrides everything.

export const GATE_FILE = '.planning/phases/01-spike-k-thu-t-ng-deploy/01-GATE.md';
export const STATE_FILE = '.planning/STATE.md';

export const STACK_STOP_TEXT = 'STOP: Three.js + Rapier failed';
const BLOCKERS_HEADING = '### Blockers/Concerns';

export const BLOCKER_PREFIX = '- [Phase 2] Tích hợp chờ cổng máy thật Phase 1';

const VERDICT_RE = /^VERDICT=(PASS|FAIL|REMEASURE)$/;
const AFTER_OPT_RE = /^VERDICT_AFTER_OPT=(PASS|FAIL|REMEASURE)$/;

/** Last anchored match of `re` over the lines of `text` (trailing CR removed only), or null. */
function lastValue(lines, re) {
  let value = null;
  for (const line of lines) {
    const m = re.exec(line);
    if (m) value = m[1];
  }
  return value;
}

/**
 * @param {string|null|undefined} gateText contents of 01-GATE.md, null when the file does not exist
 * @param {string|null|undefined} stateText contents of STATE.md ('' or null when unknown)
 * @returns {{ status: 'pass'|'pending'|'stop', reason: string, verdict: string|null, afterOpt: string|null }}
 */
export function readGateVerdict(gateText, stateText) {
  const hasGate = typeof gateText === 'string';
  const lines = hasGate ? gateText.split('\n').map((l) => l.replace(/\r$/, '')) : [];
  const verdict = hasGate ? lastValue(lines, VERDICT_RE) : null;
  const afterOpt = hasGate ? lastValue(lines, AFTER_OPT_RE) : null;
  const out = (status, reason) => ({ status, reason, verdict, afterOpt });

  if (typeof stateText === 'string' && stateText.includes(STACK_STOP_TEXT)) return out('stop', 'stack-stop');
  if (!hasGate) return out('pending', 'gate-missing');
  if (verdict === null) return out('pending', 'verdict-missing');
  if (verdict === 'PASS') return out('pass', 'passed');
  if (verdict === 'REMEASURE') return out('pending', 'remeasure');
  // verdict === 'FAIL': wait for the single D-07 pass (01-20) and its re-measurement (01-21).
  if (afterOpt === null) return out('pending', 'awaiting-d07');
  if (afterOpt === 'PASS') return out('pass', 'passed-after-d07');
  if (afterOpt === 'FAIL') return out('stop', 'failed-after-d07');
  return out('pending', 'remeasure-after-d07');
}

/**
 * The one STATE.md blocker line. It deliberately contains no plan id, so integration plans running in parallel
 * worktrees write identical bytes; the plan id goes to stdout and each plan SUMMARY.
 * @param {string} reason
 */
export function blockerLine(reason) {
  return `${BLOCKER_PREFIX} (01-GATE.md: ${reason}) — các plan tích hợp 02-06..02-13 dừng ở entry guard, chưa sửa code (D-12)`;
}

/** Splits text into { content, eol } lines so that joining content + eol gives back the exact input. */
function toLines(text) {
  const pieces = String(text ?? '').split('\n');
  const lines = [];
  pieces.forEach((piece, i) => {
    const last = i === pieces.length - 1;
    if (last) {
      if (piece.length > 0) lines.push({ content: piece, eol: '' });
    } else if (piece.endsWith('\r')) {
      lines.push({ content: piece.slice(0, -1), eol: '\r\n' });
    } else {
      lines.push({ content: piece, eol: '\n' });
    }
  });
  return lines;
}

function fromLines(lines) {
  return lines.map((l) => l.content + l.eol).join('');
}

function eolOf(text) {
  return String(text ?? '').includes('\r\n') ? '\r\n' : '\n';
}

const isBlocker = (l) => l.content.startsWith(BLOCKER_PREFIX);

/**
 * Ensures exactly one line starting with BLOCKER_PREFIX: inserted as the first bullet under `### Blockers/Concerns`
 * (a new section is appended when the heading is missing), replaced in place when the reason changed, kept when
 * identical. Every other byte is preserved; the new line uses CRLF when the input contains CRLF.
 * @param {string} stateText
 * @param {string} reason
 * @returns {{ text: string, changed: boolean }}
 */
export function upsertBlocker(stateText, reason) {
  const input = String(stateText ?? '');
  const eol = eolOf(input);
  const wanted = blockerLine(reason);
  const lines = toLines(input);

  const existing = lines.findIndex(isBlocker);
  if (existing >= 0) {
    const kept = lines.filter((l, i) => i === existing || !isBlocker(l));
    kept[kept.indexOf(lines[existing])] = { content: wanted, eol: lines[existing].eol };
    const text = fromLines(kept);
    return { text, changed: text !== input };
  }

  const heading = lines.findIndex((l) => l.content === BLOCKERS_HEADING);
  if (heading < 0) {
    let text = input;
    if (text.length > 0 && !text.endsWith('\n')) text += eol;
    if (text.length > 0) text += eol;
    text += BLOCKERS_HEADING + eol + eol + wanted + eol;
    return { text, changed: true };
  }

  if (lines[heading].eol === '') lines[heading] = { ...lines[heading], eol };
  let at = heading + 1;
  while (at < lines.length && lines[at].content.trim() === '') at++;
  const insert = [{ content: wanted, eol }];
  if (at < lines.length && lines[at].content.startsWith('#')) insert.push({ content: '', eol });
  if (at >= lines.length && at > heading + 1 && lines[at - 1].eol === '') lines[at - 1] = { ...lines[at - 1], eol };
  lines.splice(at, 0, ...insert);
  return { text: fromLines(lines), changed: true };
}

/**
 * Drops every line starting with BLOCKER_PREFIX (normally exactly one) and nothing else.
 * @param {string} stateText
 * @returns {{ text: string, changed: boolean }}
 */
export function removeBlocker(stateText) {
  const input = String(stateText ?? '');
  const lines = toLines(input);
  if (!lines.some(isBlocker)) return { text: input, changed: false };
  const kept = lines.filter((l) => !isBlocker(l));
  // A removed final line without EOL would leave the previous line's EOL dangling; that is still byte-preserving
  // for every other line, so it is left as is.
  return { text: fromLines(kept), changed: true };
}

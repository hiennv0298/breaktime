import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GATE_FILE,
  STATE_FILE,
  BLOCKER_PREFIX,
  readGateVerdict,
  blockerLine,
  upsertBlocker,
  removeBlocker,
} from '../../scripts/lib/phaseGate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GUARD = path.join(ROOT, 'scripts', 'phase-gate-guard.mjs');

const STATE_LF = [
  '# Project State',
  '',
  '## Accumulated Context',
  '',
  '### Blockers/Concerns',
  '',
  '- [Phase 1] Model máy đo chưa ghi',
  '- VPS chỉ 1 vCPU / 3,6 GB RAM',
  '',
  '## Deferred Items',
  '',
  '| a | b |',
  '',
].join('\n');
const STATE_CRLF = STATE_LF.replace(/\n/g, '\r\n');

function countPrefixLines(text) {
  return text.split(/\r?\n/).filter((l) => l.startsWith(BLOCKER_PREFIX)).length;
}

describe('constants', () => {
  it('points at the Phase 1 gate file and STATE.md', () => {
    expect(GATE_FILE).toBe('.planning/phases/01-spike-k-thu-t-ng-deploy/01-GATE.md');
    expect(STATE_FILE).toBe('.planning/STATE.md');
    expect(BLOCKER_PREFIX).toBe('- [Phase 2] Tích hợp chờ cổng máy thật Phase 1');
  });

  it('builds the exact plan-independent blocker line', () => {
    expect(blockerLine('gate-missing')).toBe(
      '- [Phase 2] Tích hợp chờ cổng máy thật Phase 1 (01-GATE.md: gate-missing) — các plan tích hợp 02-06..02-13 dừng ở entry guard, chưa sửa code (D-12)',
    );
  });
});

describe('readGateVerdict', () => {
  const v = (gate, state = '') => {
    const r = readGateVerdict(gate, state);
    return [r.status, r.reason];
  };

  it('is pending when the gate file is missing', () => {
    expect(v(null, '')).toEqual(['pending', 'gate-missing']);
    expect(v(undefined, '')).toEqual(['pending', 'gate-missing']);
  });

  it('passes on an anchored VERDICT=PASS line (LF and CRLF)', () => {
    expect(v('SHA=abc\nVERDICT=PASS\n')).toEqual(['pass', 'passed']);
    expect(v('SHA=abc\r\nVERDICT=PASS\r\n')).toEqual(['pass', 'passed']);
    const r = readGateVerdict('VERDICT=PASS', '');
    expect(r.verdict).toBe('PASS');
    expect(r.afterOpt).toBeNull();
  });

  it('follows the D-07 pass after VERDICT=FAIL', () => {
    const fail = 'VERDICT=FAIL\nFAILED=GATE_ANDROID_FPS\n';
    expect(v(fail)).toEqual(['pending', 'awaiting-d07']);
    expect(v(fail + 'VERDICT_AFTER_OPT=PASS\n')).toEqual(['pass', 'passed-after-d07']);
    expect(v(fail + 'VERDICT_AFTER_OPT=FAIL\n')).toEqual(['stop', 'failed-after-d07']);
    expect(v(fail + 'VERDICT_AFTER_OPT=REMEASURE\n')).toEqual(['pending', 'remeasure-after-d07']);
    const r = readGateVerdict((fail + 'VERDICT_AFTER_OPT=PASS\n').replace(/\n/g, '\r\n'), '');
    expect([r.status, r.verdict, r.afterOpt]).toEqual(['pass', 'FAIL', 'PASS']);
  });

  it('is pending on REMEASURE or without a verdict line', () => {
    expect(v('VERDICT=REMEASURE\n')).toEqual(['pending', 'remeasure']);
    expect(v('SHA=abc\nGATE_ANDROID_FPS=PASS\n')).toEqual(['pending', 'verdict-missing']);
    expect(v('')).toEqual(['pending', 'verdict-missing']);
  });

  it('fails closed on indented, prefixed or misspelled verdict lines', () => {
    expect(v('  VERDICT=PASS\n')[0]).not.toBe('pass');
    expect(v('XVERDICT=PASS\n')[0]).not.toBe('pass');
    expect(v('VERDICT=PASSED\n')[0]).not.toBe('pass');
    expect(v('VERDICT=PASS \n')[0]).not.toBe('pass');
    expect(v('verdict=PASS\n')[0]).not.toBe('pass');
    expect(v('VERDICT=FAIL\nVERDICT_AFTER_OPT=PASSED\n')).toEqual(['pending', 'awaiting-d07']);
    expect(v('VERDICT=FAIL\n  VERDICT_AFTER_OPT=PASS\n')).toEqual(['pending', 'awaiting-d07']);
  });

  it('does not accept VERDICT_AFTER_OPT=PASS without a VERDICT line', () => {
    expect(v('VERDICT_AFTER_OPT=PASS\n')).toEqual(['pending', 'verdict-missing']);
  });

  it('stops on the STATE.md stack STOP even when the gate passes or is missing', () => {
    const state = '- [Phase 1] STOP: Three.js + Rapier failed the Phase 1 gate after one D-07 pass\n';
    expect(v('VERDICT=PASS\n', state)).toEqual(['stop', 'stack-stop']);
    expect(v(null, state)).toEqual(['stop', 'stack-stop']);
    expect(v('VERDICT=PASS\n', null)).toEqual(['pass', 'passed']);
  });
});

describe('upsertBlocker / removeBlocker', () => {
  for (const [name, text, eol] of [
    ['LF', STATE_LF, '\n'],
    ['CRLF', STATE_CRLF, '\r\n'],
  ]) {
    it(`inserts the line as the first bullet under the heading (${name})`, () => {
      const r = upsertBlocker(text, 'gate-missing');
      expect(r.changed).toBe(true);
      const expected = text.replace(
        `### Blockers/Concerns${eol}${eol}`,
        `### Blockers/Concerns${eol}${eol}${blockerLine('gate-missing')}${eol}`,
      );
      expect(r.text).toBe(expected);
      expect(countPrefixLines(r.text)).toBe(1);
      if (eol === '\r\n') expect(r.text.replace(/\r\n/g, '')).not.toContain('\n');
    });

    it(`keeps identical text for the same reason and replaces in place for a new one (${name})`, () => {
      const first = upsertBlocker(text, 'gate-missing');
      const again = upsertBlocker(first.text, 'gate-missing');
      expect(again.changed).toBe(false);
      expect(again.text).toBe(first.text);
      const other = upsertBlocker(first.text, 'remeasure');
      expect(other.changed).toBe(true);
      expect(countPrefixLines(other.text)).toBe(1);
      expect(other.text).toBe(first.text.replace(blockerLine('gate-missing'), blockerLine('remeasure')));
    });

    it(`removes only that line (${name})`, () => {
      const withLine = upsertBlocker(text, 'awaiting-d07').text;
      const r = removeBlocker(withLine);
      expect(r.changed).toBe(true);
      expect(r.text).toBe(text);
      const none = removeBlocker(text);
      expect(none.changed).toBe(false);
      expect(none.text).toBe(text);
    });
  }

  it('appends a Blockers/Concerns section when the heading is missing', () => {
    const text = '# State\n\nsome text\n';
    const r = upsertBlocker(text, 'gate-missing');
    expect(r.changed).toBe(true);
    expect(r.text.startsWith(text)).toBe(true);
    expect(r.text).toBe(text + '\n### Blockers/Concerns\n\n' + blockerLine('gate-missing') + '\n');
    const crlf = '# State\r\n\r\nsome text';
    const c = upsertBlocker(crlf, 'gate-missing');
    expect(c.text).toBe(crlf + '\r\n\r\n### Blockers/Concerns\r\n\r\n' + blockerLine('gate-missing') + '\r\n');
    expect(removeBlocker(c.text).changed).toBe(true);
  });

  it('inserts under a heading that has no bullets yet, before the next heading', () => {
    const text = '### Blockers/Concerns\n\n## Next\n';
    const r = upsertBlocker(text, 'gate-missing');
    expect(r.text).toBe('### Blockers/Concerns\n\n' + blockerLine('gate-missing') + '\n\n## Next\n');
  });

  it('collapses duplicate blocker lines to exactly one', () => {
    const dup = STATE_LF.replace(
      '- VPS',
      `${blockerLine('remeasure')}\n${blockerLine('gate-missing')}\n- VPS`,
    );
    const r = upsertBlocker(dup, 'gate-missing');
    expect(countPrefixLines(r.text)).toBe(1);
    expect(r.changed).toBe(true);
    expect(countPrefixLines(removeBlocker(dup).text)).toBe(0);
  });
});

describe('phase-gate-guard CLI', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-phase-gate-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  let n = 0;

  function tmp(content) {
    const p = path.join(dir, `f${n++}.md`);
    if (content !== null) fs.writeFileSync(p, content, 'utf8');
    return p;
  }

  function run(args) {
    const r = spawnSync(process.execPath, [GUARD, ...args], { cwd: ROOT, encoding: 'utf8' });
    return { code: r.status, out: r.stdout, err: r.stderr };
  }

  it('continues on PASS and removes a pre-existing blocker line', () => {
    const gate = tmp('SHA=abc\r\nVERDICT=PASS\r\n');
    const withLine = upsertBlocker(STATE_CRLF, 'gate-missing').text;
    const state = tmp(withLine);
    const r = run(['--plan', '02-06', '--gate', gate, '--state', state]);
    expect(r.code).toBe(0);
    expect(r.out).toBe('GUARD_CONTINUE plan=02-06 reason=passed\n');
    expect(fs.readFileSync(state, 'utf8')).toBe(STATE_CRLF);
  });

  it('exits pending when the gate is missing and adds the blocker', () => {
    const gate = tmp(null);
    const state = tmp(STATE_CRLF);
    const r = run(['--plan', '02-07', '--gate', gate, '--state', state]);
    expect(r.code).toBe(0);
    expect(r.out).toBe('PLAN_EXIT_GATE_PENDING plan=02-07 reason=gate-missing\n');
    expect(fs.readFileSync(state, 'utf8')).toBe(upsertBlocker(STATE_CRLF, 'gate-missing').text);
  });

  it('exits on a stack STOP', () => {
    const gate = tmp('VERDICT=PASS\n');
    const stopState = STATE_LF.replace('- VPS', '- [Phase 1] STOP: Three.js + Rapier failed the Phase 1 gate\n- VPS');
    const state = tmp(stopState);
    const r = run(['--plan', '02-10', '--gate', gate, '--state', state]);
    expect(r.code).toBe(0);
    expect(r.out).toBe('PLAN_EXIT_STACK_STOP plan=02-10 reason=stack-stop\n');
    expect(fs.readFileSync(state, 'utf8')).toBe(upsertBlocker(stopState, 'stack-stop').text);
  });

  it('writes byte-identical state for different plan ids', () => {
    const gate = tmp('VERDICT=FAIL\n');
    const a = tmp(STATE_CRLF);
    const b = tmp(STATE_CRLF);
    expect(run(['--plan', '02-08', '--gate', gate, '--state', a]).out).toBe(
      'PLAN_EXIT_GATE_PENDING plan=02-08 reason=awaiting-d07\n',
    );
    expect(run(['--plan', '02-09', '--gate', gate, '--state', b]).out).toBe(
      'PLAN_EXIT_GATE_PENDING plan=02-09 reason=awaiting-d07\n',
    );
    const ba = fs.readFileSync(a);
    expect(ba.equals(fs.readFileSync(b))).toBe(true);
    expect(ba.equals(Buffer.from(STATE_CRLF, 'utf8'))).toBe(false);
  });

  it('never writes with --dry-run', () => {
    const gate = tmp(null);
    const state = tmp(STATE_LF);
    const r = run(['--plan', '02-11', '--gate', gate, '--state', state, '--dry-run']);
    expect(r.code).toBe(0);
    expect(r.out).toBe('PLAN_EXIT_GATE_PENDING plan=02-11 reason=gate-missing\n');
    expect(fs.readFileSync(state, 'utf8')).toBe(STATE_LF);
  });

  it('rejects a missing or malformed --plan with exit 2', () => {
    for (const args of [[], ['--plan'], ['--plan', '2-06'], ['--plan', '02-6'], ['--plan', '03-06'], ['--plan', '02-061']]) {
      const r = run(args);
      expect(r.code).toBe(2);
      expect(r.err).toContain('GUARD_USAGE');
      expect(r.out).toBe('');
    }
  });
});

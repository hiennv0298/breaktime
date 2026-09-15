import { describe, it, expect } from 'vitest';
import {
  STATE_KEYS,
  parseStateCheck,
  evaluateState,
  DRIFT_MESSAGE,
} from '../../scripts/lib/stateCheck.mjs';

const GOOD = {
  HOST_IMPORT: '1',
  HOST_MOUNT_NODB: '1',
  HOST_MOUNT_WITHDB: '1',
  LIVE_MOUNT: '1',
  LIVE_IMPORT: '1',
  LIVE_SITE: '0',
  SITE_FILE_SHA: '',
  CADDY_RUNNING: 'true',
};

function fixture(values, { end = true, omit = [] } = {}) {
  const lines = STATE_KEYS.filter((k) => !omit.includes(k)).map((k) => `${k}=${values[k]}`);
  if (end) lines.push('END=1');
  return lines.join('\n') + '\n';
}

describe('STATE_KEYS', () => {
  it('lists exactly the eight drift-check keys', () => {
    expect(STATE_KEYS).toEqual([
      'HOST_IMPORT',
      'HOST_MOUNT_NODB',
      'HOST_MOUNT_WITHDB',
      'LIVE_MOUNT',
      'LIVE_IMPORT',
      'LIVE_SITE',
      'SITE_FILE_SHA',
      'CADDY_RUNNING',
    ]);
  });
});

describe('parseStateCheck', () => {
  it('parses a full fixture ending with END=1 as ok', () => {
    const r = parseStateCheck(fixture(GOOD));
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.values.HOST_IMPORT).toBe('1');
    expect(r.values.SITE_FILE_SHA).toBe('');
    expect(r.values.CADDY_RUNNING).toBe('true');
  });

  it('is not ok without END=1 as the last non-empty line', () => {
    expect(parseStateCheck(fixture(GOOD, { end: false })).ok).toBe(false);
    expect(parseStateCheck('END=1\n' + fixture(GOOD, { end: false })).ok).toBe(false);
  });

  it('lists a missing key and is not ok', () => {
    const r = parseStateCheck(fixture(GOOD, { omit: ['LIVE_MOUNT'] }));
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('LIVE_MOUNT');
  });

  it('is not ok for empty output', () => {
    const r = parseStateCheck('');
    expect(r.ok).toBe(false);
    expect(r.missing.length).toBe(STATE_KEYS.length);
  });

  it('splits on the first "=" only and tolerates CRLF', () => {
    const text = fixture({ ...GOOD, SITE_FILE_SHA: 'ab=cd' }).replace(/\n/g, '\r\n');
    const r = parseStateCheck(text);
    expect(r.ok).toBe(true);
    expect(r.values.SITE_FILE_SHA).toBe('ab=cd');
  });
});

describe('evaluateState', () => {
  it('passes when all counts are 1, no site file and requireSite false', () => {
    expect(evaluateState(GOOD, { requireSite: false })).toEqual({ pass: true, failures: [] });
  });

  it('fails host-only drift (HOST_IMPORT=0 while LIVE_IMPORT=1) with a failure mentioning host', () => {
    const r = evaluateState({ ...GOOD, HOST_IMPORT: '0' }, { requireSite: false });
    expect(r.pass).toBe(false);
    expect(r.failures.join('\n').toLowerCase()).toContain('host');
  });

  it('fails when LIVE_MOUNT=0', () => {
    const r = evaluateState({ ...GOOD, LIVE_MOUNT: '0' }, { requireSite: false });
    expect(r.pass).toBe(false);
    expect(r.failures.some((f) => f.includes('LIVE_MOUNT'))).toBe(true);
  });

  it('fails when a site file exists but the live config has no site', () => {
    const r = evaluateState({ ...GOOD, SITE_FILE_SHA: 'a'.repeat(64), LIVE_SITE: '0' }, { requireSite: false });
    expect(r.pass).toBe(false);
    expect(r.failures.some((f) => f.includes('LIVE_SITE'))).toBe(true);
  });

  it('fails LIVE_SITE=0 when requireSite is true', () => {
    expect(evaluateState(GOOD, { requireSite: true }).pass).toBe(false);
    expect(evaluateState({ ...GOOD, LIVE_SITE: '1' }, { requireSite: true }).pass).toBe(true);
  });

  it('fails when CADDY_RUNNING is not "true"', () => {
    expect(evaluateState({ ...GOOD, CADDY_RUNNING: 'false' }, { requireSite: false }).pass).toBe(false);
    expect(evaluateState({ ...GOOD, CADDY_RUNNING: '' }, { requireSite: false }).pass).toBe(false);
  });

  it('fails empty or non-numeric counts (never treats "" as ok)', () => {
    expect(evaluateState({ ...GOOD, HOST_MOUNT_NODB: '' }, { requireSite: false }).pass).toBe(false);
    expect(evaluateState({ ...GOOD, HOST_MOUNT_WITHDB: 'x' }, { requireSite: false }).pass).toBe(false);
  });
});

describe('DRIFT_MESSAGE', () => {
  it('points at infra:apply with the approval flow and HANDOFF.md', () => {
    expect(DRIFT_MESSAGE).toBe(
      'Caddy của doibung đã mất cấu hình sites (có thể do deploy whattoeat ghi đè /opt/doibung). Chạy `npm run infra:apply` để xem preflight và mã duyệt, operator gõ `APPROVE-CADDY-<mã>`, rồi `npm run infra:apply -- --approve=APPROVE-CADDY-<mã>` (idempotent, có backup) và deploy lại. Chi tiết: deploy/HANDOFF.md',
    );
  });
});

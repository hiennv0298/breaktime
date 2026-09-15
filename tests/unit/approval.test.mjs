import { describe, it, expect } from 'vitest';
import {
  APPROVAL_FIELDS,
  TOKEN_RE,
  approvalCode,
  expectedToken,
  readApprovalToken,
  decideApply,
} from '../../scripts/lib/approval.mjs';

const BASE = Object.freeze({
  APP_ID: '3d8218aa11bb22cc33dd44ee55ff66007788990011223344556677889900aabb',
  PG_ID: 'db14d6aa11bb22cc33dd44ee55ff66007788990011223344556677889900aabb',
  CERT_FP_BEFORE: 'sha256 Fingerprint=AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
  HOST_IMPORT: '0',
  HOST_MOUNT_NODB: '0',
  HOST_MOUNT_WITHDB: '0',
  LIVE_MOUNT: '0',
  LIVE_IMPORT: '0',
  NEED_HOST_EDIT: '1',
  NEED_RECREATE: '1',
  NONCE: '0123456789abcdef0123456789abcdef',
});

const with_ = (patch) => ({ ...BASE, ...patch });

/** Flip one hex character of the code while keeping the token well-formed. */
function offByOne(token) {
  const last = token.at(-1);
  return token.slice(0, -1) + (last === '0' ? '1' : '0');
}

describe('APPROVAL_FIELDS / TOKEN_RE', () => {
  it('binds the token to container IDs, cert, flags and the nonce', () => {
    expect(APPROVAL_FIELDS).toEqual([
      'APP_ID',
      'PG_ID',
      'CERT_FP_BEFORE',
      'HOST_IMPORT',
      'HOST_MOUNT_NODB',
      'HOST_MOUNT_WITHDB',
      'LIVE_MOUNT',
      'LIVE_IMPORT',
      'NEED_HOST_EDIT',
      'NEED_RECREATE',
      'NONCE',
    ]);
    expect(TOKEN_RE.test('APPROVE-CADDY-1a2b3c4d')).toBe(true);
    expect(TOKEN_RE.test('APPROVE-CADDY-1a2b3c4d\n')).toBe(false);
  });
});

describe('approvalCode', () => {
  it('is 8 lowercase hex and deterministic for a fixed fixture', () => {
    const a = approvalCode(BASE);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(approvalCode({ ...BASE })).toBe(a);
    expect(approvalCode(BASE)).toBe(a);
    expect(expectedToken(BASE)).toBe(`APPROVE-CADDY-${a}`);
  });

  it.each([
    ['APP_ID', { APP_ID: BASE.APP_ID.replace(/.$/, 'c') }],
    ['PG_ID', { PG_ID: BASE.PG_ID.replace(/.$/, 'c') }],
    ['CERT_FP_BEFORE', { CERT_FP_BEFORE: BASE.CERT_FP_BEFORE.replace(/99$/, '98') }],
    ['NEED_RECREATE', { NEED_RECREATE: '0' }],
    ['LIVE_IMPORT', { LIVE_IMPORT: '1' }],
    ['NONCE', { NONCE: 'f123456789abcdef0123456789abcdef' }],
  ])('changes when %s changes', (_name, patch) => {
    expect(approvalCode(with_(patch))).not.toBe(approvalCode(BASE));
  });

  it('throws when NONCE is missing, short or uppercase', () => {
    const { NONCE: _drop, ...noNonce } = BASE;
    expect(() => approvalCode(noNonce)).toThrow();
    expect(() => approvalCode(with_({ NONCE: '0123456789abcdef0123456789abcde' }))).toThrow();
    expect(() => approvalCode(with_({ NONCE: '0123456789ABCDEF0123456789ABCDEF' }))).toThrow();
    expect(() => approvalCode(with_({ NONCE: '' }))).toThrow();
  });
});

describe('decideApply', () => {
  it('returns noop when nothing needs to change, with or without a token', () => {
    const done = with_({ NEED_HOST_EDIT: '0', NEED_RECREATE: '0' });
    expect(decideApply(done, null)).toEqual({ action: 'noop' });
    expect(decideApply(done, 'APPROVE-CADDY-00000000')).toEqual({ action: 'noop' });
    expect(decideApply(done, expectedToken(done))).toEqual({ action: 'noop' });
  });

  it('refuses missing-token when a recreate is needed, and shows the expected code', () => {
    const d = decideApply(BASE, null);
    expect(d).toEqual({ action: 'refuse', reason: 'missing-token', code: approvalCode(BASE) });
  });

  it('refuses missing-token for a host-only edit too (any doibung file change needs approval)', () => {
    const hostOnly = with_({ NEED_HOST_EDIT: '1', NEED_RECREATE: '0' });
    const d = decideApply(hostOnly, null);
    expect(d.action).toBe('refuse');
    expect(d.reason).toBe('missing-token');
    expect(d.code).toBe(approvalCode(hostOnly));
  });

  it('never treats unknown/missing flags as noop', () => {
    expect(decideApply(with_({ NEED_HOST_EDIT: '', NEED_RECREATE: '0' }), null).action).toBe('refuse');
    const { NEED_RECREATE: _d, ...noFlag } = with_({ NEED_HOST_EDIT: '0' });
    expect(decideApply(noFlag, null).action).toBe('refuse');
  });

  it.each([
    'approve-caddy-1a2b3c4d',
    'APPROVE-CADDY-1A2B3C4D',
    'APPROVE-CADDY-1a2b3c4',
    'APPROVE-CADDY-1a2b3c4d ',
    'approve-caddy-zz',
  ])('refuses bad-format for %j', (token) => {
    const d = decideApply(BASE, token);
    expect(d.action).toBe('refuse');
    expect(d.reason).toBe('bad-format');
  });

  it('refuses mismatch for a well-formed token one character off', () => {
    const wrong = offByOne(expectedToken(BASE));
    expect(wrong).toMatch(TOKEN_RE);
    const d = decideApply(BASE, wrong);
    expect(d.action).toBe('refuse');
    expect(d.reason).toBe('mismatch');
  });

  it('refuses mismatch when the state changed after the code was shown (stale token)', () => {
    const shown = expectedToken(BASE);
    const later = with_({ APP_ID: BASE.APP_ID.replace(/.$/, 'c') });
    expect(decideApply(later, shown)).toMatchObject({ action: 'refuse', reason: 'mismatch' });
    const newNonce = with_({ NONCE: 'abcdefabcdefabcdefabcdefabcdefab' });
    expect(decideApply(newNonce, shown)).toMatchObject({ action: 'refuse', reason: 'mismatch' });
  });

  it('refuses no-nonce when NONCE is missing or malformed, even with a well-formed token', () => {
    const { NONCE: _drop, ...noNonce } = BASE;
    expect(decideApply(noNonce, 'APPROVE-CADDY-1a2b3c4d')).toMatchObject({ action: 'refuse', reason: 'no-nonce' });
    expect(decideApply(with_({ NONCE: 'XYZ' }), 'APPROVE-CADDY-1a2b3c4d')).toMatchObject({
      action: 'refuse',
      reason: 'no-nonce',
    });
    expect(decideApply(noNonce, null)).toMatchObject({ action: 'refuse', reason: 'no-nonce' });
  });

  it('applies only for exactly expectedToken(values)', () => {
    expect(decideApply(BASE, expectedToken(BASE))).toEqual({ action: 'apply' });
    expect(decideApply(BASE, 'APPROVE-CADDY-00000000').action).toBe('refuse');
    expect(decideApply(BASE, '').action).toBe('refuse');
  });
});

describe('readApprovalToken', () => {
  it('reads --approve=<token> from argv', () => {
    expect(readApprovalToken(['apply', '--approve=APPROVE-CADDY-1a2b3c4d'], {})).toBe('APPROVE-CADDY-1a2b3c4d');
  });

  it('prefers the flag over env BREAKTIME_CADDY_APPROVAL', () => {
    expect(
      readApprovalToken(['apply', '--approve=APPROVE-CADDY-1a2b3c4d'], {
        BREAKTIME_CADDY_APPROVAL: 'APPROVE-CADDY-ffffffff',
      }),
    ).toBe('APPROVE-CADDY-1a2b3c4d');
  });

  it('falls back to env BREAKTIME_CADDY_APPROVAL', () => {
    expect(readApprovalToken(['apply'], { BREAKTIME_CADDY_APPROVAL: 'APPROVE-CADDY-ffffffff' })).toBe(
      'APPROVE-CADDY-ffffffff',
    );
  });

  it('returns null with neither flag nor env', () => {
    expect(readApprovalToken(['apply'], {})).toBeNull();
    expect(readApprovalToken(['apply', '--approve='], { BREAKTIME_CADDY_APPROVAL: '' })).toBeNull();
  });

  it('does not trim, so a trailing space still fails the format check', () => {
    const t = readApprovalToken(['apply', '--approve=APPROVE-CADDY-1a2b3c4d '], {});
    expect(t).toBe('APPROVE-CADDY-1a2b3c4d ');
  });
});

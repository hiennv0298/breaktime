// scripts/lib/approval.mjs — operator approval lock for the doibung Caddy change (D-02).
// Pure: node:crypto only. No I/O, no clock, no randomness (the nonce comes from the server).
// The token is APPROVE-CADDY-<first 8 hex of sha256 over the preflight state + nonce>, so it
// changes whenever the server state or the one-time nonce changes and cannot be reused.
import { createHash, timingSafeEqual } from 'node:crypto';

export const APPROVAL_FIELDS = [
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
];

export const TOKEN_RE = /^APPROVE-CADDY-[0-9a-f]{8}$/;
const NONCE_RE = /^[0-9a-f]{32}$/;
const TOKEN_PREFIX = 'APPROVE-CADDY-';
const FLAG = '--approve=';

function hasValidNonce(values) {
  return typeof values?.NONCE === 'string' && NONCE_RE.test(values.NONCE);
}

/** @param {Record<string,string>} values */
export function approvalCode(values) {
  if (!hasValidNonce(values)) {
    throw new Error('approvalCode: NONCE must be 32 lowercase hex characters from the server');
  }
  const canonical = APPROVAL_FIELDS.map((k) => k + '=' + (values[k] ?? '')).join('\n');
  return createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 8);
}

/** @param {Record<string,string>} values */
export function expectedToken(values) {
  return TOKEN_PREFIX + approvalCode(values);
}

/**
 * `--approve=<token>` wins over env BREAKTIME_CADDY_APPROVAL. Values are not trimmed.
 * @param {string[]} argv
 * @param {Record<string,string|undefined>} env
 * @returns {string|null}
 */
export function readApprovalToken(argv, env) {
  const flags = (argv ?? []).filter((a) => typeof a === 'string' && a.startsWith(FLAG));
  if (flags.length > 0) {
    const v = flags[flags.length - 1].slice(FLAG.length);
    return v.length > 0 ? v : null;
  }
  const e = env?.BREAKTIME_CADDY_APPROVAL;
  return typeof e === 'string' && e.length > 0 ? e : null;
}

/**
 * @param {Record<string,string>} values  preflight KEY=VALUE map (incl. NONCE)
 * @param {string|null} token
 * @returns {{ action: 'noop' } | { action: 'apply' } |
 *           { action: 'refuse', reason: 'missing-token'|'bad-format'|'mismatch'|'no-nonce', code?: string }}
 */
export function decideApply(values, token) {
  const v = values ?? {};
  // Only an explicit "nothing to do" from preflight skips approval; unknown flags require it.
  if (v.NEED_HOST_EDIT === '0' && v.NEED_RECREATE === '0') return { action: 'noop' };

  if (!hasValidNonce(v)) return { action: 'refuse', reason: 'no-nonce' };
  const code = approvalCode(v);

  if (token === null || token === undefined || token === '') {
    return { action: 'refuse', reason: 'missing-token', code };
  }
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) {
    return { action: 'refuse', reason: 'bad-format', code };
  }
  const want = Buffer.from(TOKEN_PREFIX + code, 'utf8');
  const got = Buffer.from(token, 'utf8');
  if (want.length !== got.length || !timingSafeEqual(want, got)) {
    return { action: 'refuse', reason: 'mismatch', code };
  }
  return { action: 'apply' };
}

// scripts/lib/stateCheck.mjs — pure parser/evaluator for deploy/remote/state-check.sh output.
// Host and live container are checked separately (RESEARCH Pattern 12, Pitfall 2).

export const STATE_KEYS = [
  'HOST_IMPORT',
  'HOST_MOUNT_NODB',
  'HOST_MOUNT_WITHDB',
  'LIVE_MOUNT',
  'LIVE_IMPORT',
  'LIVE_SITE',
  'SITE_FILE_SHA',
  'CADDY_RUNNING',
];

export const DRIFT_MESSAGE =
  'Caddy của doibung đã mất cấu hình sites (có thể do deploy whattoeat ghi đè /opt/doibung). Chạy `npm run infra:apply` để xem preflight và mã duyệt, operator gõ `APPROVE-CADDY-<mã>`, rồi `npm run infra:apply -- --approve=APPROVE-CADDY-<mã>` (idempotent, có backup) và deploy lại. Chi tiết: deploy/HANDOFF.md';

/**
 * @param {string} text
 * @returns {{ ok: boolean, values: Record<string,string>, missing: string[] }}
 */
export function parseStateCheck(text) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim().length > 0);
  /** @type {Record<string,string>} */
  const values = {};
  for (const line of lines) {
    const i = line.indexOf('=');
    if (i <= 0) continue;
    values[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const endLast = lines.length > 0 && lines[lines.length - 1].trim() === 'END=1';
  const missing = STATE_KEYS.filter((k) => !Object.prototype.hasOwnProperty.call(values, k));
  return { ok: endLast && missing.length === 0, values, missing };
}

function count(v) {
  return typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN;
}

const DESCRIBE = {
  HOST_IMPORT: 'host /opt/doibung/Caddyfile.nodb thiếu dòng import sites',
  HOST_MOUNT_NODB: 'host /opt/doibung/docker-compose.nodb.yml thiếu mount /srv/sites',
  HOST_MOUNT_WITHDB: 'host /opt/doibung/docker-compose.withdb.yml thiếu mount /srv/sites',
  LIVE_MOUNT: 'live container doibung-caddy-1 thiếu mount /srv/sites (ro)',
  LIVE_IMPORT: 'live container doibung-caddy-1 thiếu dòng import sites',
};

/**
 * @param {Record<string,string>} values
 * @param {{ requireSite: boolean }} opts
 * @returns {{ pass: boolean, failures: string[] }}
 */
export function evaluateState(values, { requireSite } = { requireSite: false }) {
  const v = values ?? {};
  const failures = [];
  for (const key of ['HOST_IMPORT', 'HOST_MOUNT_NODB', 'HOST_MOUNT_WITHDB', 'LIVE_MOUNT', 'LIVE_IMPORT']) {
    const n = count(v[key]);
    if (!(n >= 1)) failures.push(`${key}=${v[key] ?? '(missing)'}: ${DESCRIBE[key]}`);
  }
  if (v.CADDY_RUNNING !== 'true') {
    failures.push(`CADDY_RUNNING=${v.CADDY_RUNNING ?? '(missing)'}: live container doibung-caddy-1 không chạy`);
  }
  const siteFile = typeof v.SITE_FILE_SHA === 'string' && v.SITE_FILE_SHA.length > 0;
  if (requireSite || siteFile) {
    const n = count(v.LIVE_SITE);
    if (!(n >= 1)) {
      failures.push(
        `LIVE_SITE=${v.LIVE_SITE ?? '(missing)'}: config Caddy đang chạy không có breaktime.doibung.com` +
          (siteFile ? ' dù /srv/sites/breaktime.caddy tồn tại' : ''),
      );
    }
  }
  return { pass: failures.length === 0, failures };
}

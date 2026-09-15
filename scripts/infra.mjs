#!/usr/bin/env node
// scripts/infra.mjs — server wiring for doibung's Caddy (D-02). The local whattoeat repo is never touched;
// every server change happens on the VPS through deploy/infra/*.sh sent over ssh stdin.
//
//   check                                   read-only drift check (host files + live container)
//   apply    [--approve=APPROVE-CADDY-<8 hex>]    token-gated, idempotent wiring
//   rollback <BACKUP_DIR> --approve=<token>       token-gated restore from a backup dir
//
// Approval: without the exact operator-typed token bound to the current preflight state and the
// server's one-time nonce, apply/rollback exit 3 before any backup, edit or recreate.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { sshScript } from './lib/run.mjs';
import { STATE_KEYS, parseStateCheck, evaluateState, DRIFT_MESSAGE } from './lib/stateCheck.mjs';
import { startPoller } from './lib/poller.mjs';
import { APPROVAL_FIELDS, decideApply, readApprovalToken } from './lib/approval.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_CHECK = resolve(ROOT, 'deploy/remote/state-check.sh');
const APPLY_SCRIPT = resolve(ROOT, 'deploy/infra/apply-caddy-sites.sh');
const ROLLBACK_SCRIPT = resolve(ROOT, 'deploy/infra/rollback-caddy-sites.sh');
const BACKUP_RE = /^\/root\/breaktime-infra-backup\/[0-9]{8}T[0-9]{6}Z$/;
const DOIBUNG = 'https://doibung.com/';
const WWW = 'https://www.doibung.com/';
const REFUSAL_RULE =
  'Operator phải tự gõ APPROVE-CADDY-<mã> sau khi đọc preflight; executor không được tự ghép mã';

const EXIT = {
  ok: 0,
  error: 1,
  drift: 2,
  refused: 3,
  rolledBack: 4,
  longOutage: 5,
  stepFailed: 6,
};

function parseKeyValues(text) {
  /** @type {Record<string,string>} */
  const values = {};
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    const i = line.indexOf('=');
    if (i <= 0 || /\s/.test(line.slice(0, i))) continue;
    values[line.slice(0, i)] = line.slice(i + 1);
  }
  return values;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(url) {
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
    try {
      await res.body?.cancel();
    } catch {
      /* ignore */
    }
    return { status: res.status, location: res.headers.get('location') ?? '' };
  } catch (e) {
    return { status: 0, location: '', error: String(e?.message ?? e) };
  }
}

async function waitFor200(url, totalMs = 60000, everyMs = 2000) {
  const end = Date.now() + totalMs;
  let last;
  do {
    last = await probe(url);
    if (last.status === 200) return { ok: true, last };
    await sleep(everyMs);
  } while (Date.now() < end);
  return { ok: false, last };
}

async function wwwRedirectOk() {
  let last;
  for (let i = 0; i < 5; i += 1) {
    last = await probe(WWW);
    if ((last.status === 301 || last.status === 308) && last.location.startsWith('https://doibung.com')) {
      return { ok: true, last };
    }
    await sleep(2000);
  }
  return { ok: false, last };
}

export async function runCheck({ requireSite = false } = {}) {
  let out;
  try {
    ({ out } = await sshScript(STATE_CHECK, [], { marker: 'END=1', timeoutMs: 60000 }));
  } catch (e) {
    console.error(`STATE_CHECK_ERROR ${e.message}`);
    return EXIT.error;
  }
  const parsed = parseStateCheck(out);
  for (const k of STATE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(parsed.values, k)) console.log(`${k}=${parsed.values[k]}`);
  }
  if (!parsed.ok) {
    console.error(`STATE_CHECK_PARSE_FAIL missing=${parsed.missing.join(',') || '(none)'} (END=1 phải là dòng cuối)`);
    return EXIT.error;
  }
  console.log('STATE_CHECK_PARSED');
  const verdict = evaluateState(parsed.values, { requireSite });
  if (verdict.pass) {
    console.log('INFRA_CHECK_OK');
    return EXIT.ok;
  }
  for (const f of verdict.failures) console.error(`DRIFT ${f}`);
  console.error(DRIFT_MESSAGE);
  return EXIT.drift;
}

async function runPreflight(script, args) {
  const { out } = await sshScript(script, args, { marker: 'PREFLIGHT_OK', timeoutMs: 120000 });
  const values = parseKeyValues(out);
  const missing = APPROVAL_FIELDS.filter((k) => k !== 'NONCE' && !(k in values));
  if (missing.length > 0) throw new Error(`preflight output missing ${missing.join(',')}`);
  return { out, values };
}

function printPreflight(values) {
  console.log('--- PREFLIGHT (server) ---');
  for (const k of APPROVAL_FIELDS) {
    if (k === 'NONCE') continue; // the nonce itself is not shown; the code already binds it
    console.log(`${k}=${values[k] ?? ''}`);
  }
  if ('NONCE_AGE_S' in values) console.log(`NONCE_AGE_S=${values.NONCE_AGE_S}`);
  console.log('PREFLIGHT_OK');
}

function printRefusal(decision) {
  if (decision.code) console.log(`APPROVAL_CODE=${decision.code}`);
  const marker = decision.reason === 'missing-token' ? 'APPROVAL_TOKEN_MISSING' : 'APPROVAL_TOKEN_INVALID';
  console.log(`${marker} reason=${decision.reason}`);
  console.log(REFUSAL_RULE);
  console.log('Không có backup, không sửa file, không recreate container nào.');
}

function summarizePoll(poll) {
  console.log(
    `POLLER count=${poll.count} non200=${poll.non200} maxConsecutiveNon200Ms=${poll.maxConsecutiveNon200Ms}`,
  );
}

function rollbackHint(backupDir) {
  return backupDir
    ? `Rollback (cần mã duyệt mới): npm run infra:rollback -- ${backupDir}  → đọc preflight, operator gõ APPROVE-CADDY-<mã>, rồi npm run infra:rollback -- ${backupDir} --approve=APPROVE-CADDY-<mã>`
    : 'Không có BACKUP_DIR trong output: script dừng trước khi sao lưu, chưa có gì bị sửa.';
}

async function autoRollback(backupDir) {
  if (!backupDir || !BACKUP_RE.test(backupDir)) {
    console.error('AUTO_ROLLBACK_SKIPPED: không có BACKUP_DIR hợp lệ');
    return false;
  }
  console.error(`AUTO_ROLLBACK_START ${backupDir}`);
  try {
    await sshScript(ROLLBACK_SCRIPT, ['restore-auto', backupDir], {
      marker: 'ROLLBACK_DONE',
      timeoutMs: 300000,
      echo: true,
    });
  } catch (e) {
    console.error(`AUTO_ROLLBACK_FAIL ${e.message}`);
    return false;
  }
  const up = await waitFor200(DOIBUNG);
  console.error(`AUTO_ROLLBACK_DONE doibung.com=${up.last.status}`);
  return up.ok;
}

async function runApply(argv, env) {
  const token = readApprovalToken(argv, env);
  let pre;
  try {
    pre = await runPreflight(APPLY_SCRIPT, ['preflight']);
  } catch (e) {
    console.error(`PREFLIGHT_ERROR ${e.message}`);
    return EXIT.error;
  }
  const { values } = pre;
  printPreflight(values);

  const decision = decideApply(values, token);
  if (decision.action === 'noop') {
    console.log('Không cần làm gì: host và container caddy đã có cấu hình sites.');
    console.log('INFRA_APPLY_OK');
    return EXIT.ok;
  }
  if (decision.action === 'refuse') {
    printRefusal(decision);
    return EXIT.refused;
  }

  console.log('APPROVAL_TOKEN_OK');
  const poller = startPoller(DOIBUNG, { intervalMs: 500 });
  let applyOut = '';
  let applyError = null;
  try {
    ({ out: applyOut } = await sshScript(APPLY_SCRIPT, ['apply', values.NONCE], {
      marker: 'APPLY_DONE',
      timeoutMs: 300000,
      echo: true,
    }));
  } catch (e) {
    applyError = e;
    applyOut = e.out ?? '';
  }
  const poll = await poller.stop();
  summarizePoll(poll);

  const backupDir = (applyOut.match(/^(?:APPLY_DONE )?BACKUP_DIR=(\S+)\s*$/m) ?? [])[1] ?? '';
  // State became already-applied between preflight and apply: the server printed APPLY_NOOP (no marker).
  const noopOnServer = /^APPLY_NOOP\s*$/m.test(applyOut);
  const stepFailed = applyError !== null && !noopOnServer;
  if (stepFailed) console.error(`APPLY_STEP_FAILED ${applyError.message.split('\n')[0]}`);

  const up = await waitFor200(DOIBUNG);
  console.log(`DOIBUNG_STATUS=${up.last.status}`);
  if (!up.ok) {
    console.error('doibung.com không trả 200 trong 60 s → tự rollback từ backup vừa tạo.');
    await autoRollback(backupDir);
    return EXIT.rolledBack;
  }
  if (stepFailed) {
    console.error(rollbackHint(backupDir));
    return EXIT.stepFailed;
  }

  const www = await wwwRedirectOk();
  console.log(`WWW_STATUS=${www.last.status} WWW_LOCATION=${www.last.location}`);
  if (!www.ok) {
    console.error('www.doibung.com không còn redirect 301/308 về https://doibung.com');
    console.error(rollbackHint(backupDir));
    return EXIT.stepFailed;
  }
  if (poll.maxConsecutiveNon200Ms > 30000) {
    console.error(`doibung.com gián đoạn liên tục ${poll.maxConsecutiveNon200Ms} ms (> 30000 ms).`);
    console.error(rollbackHint(backupDir));
    return EXIT.longOutage;
  }

  const check = await runCheck({ requireSite: false });
  if (check !== EXIT.ok) return check;
  console.log('INFRA_APPLY_OK');
  return EXIT.ok;
}

async function runRollback(argv, env) {
  const dir = argv[3];
  if (typeof dir !== 'string' || !BACKUP_RE.test(dir)) {
    console.error('Usage: npm run infra:rollback -- /root/breaktime-infra-backup/<YYYYMMDDTHHMMSSZ> --approve=<token>');
    return EXIT.error;
  }
  const token = readApprovalToken(argv, env);
  let pre;
  try {
    pre = await runPreflight(ROLLBACK_SCRIPT, ['preflight', dir]);
  } catch (e) {
    console.error(`PREFLIGHT_ERROR ${e.message}`);
    return EXIT.error;
  }
  if (!pre.out.includes('BACKUP_OK=')) {
    console.error('PREFLIGHT_ERROR backup dir not confirmed (BACKUP_OK missing)');
    return EXIT.error;
  }
  printPreflight(pre.values);
  console.log(`BACKUP_OK=${dir}`);

  // A rollback always needs approval (never noop), and its code must differ from an apply code
  // computed from the same state + nonce, so the flags are bound to the rollback target.
  const approvalValues = { ...pre.values, NEED_HOST_EDIT: 'ROLLBACK', NEED_RECREATE: `ROLLBACK:${dir}` };
  const decision = decideApply(approvalValues, token);
  if (decision.action !== 'apply') {
    printRefusal(decision.action === 'refuse' ? decision : { reason: 'missing-token' });
    return EXIT.refused;
  }

  console.log('APPROVAL_TOKEN_OK');
  const poller = startPoller(DOIBUNG, { intervalMs: 500 });
  let error = null;
  try {
    await sshScript(ROLLBACK_SCRIPT, ['restore', dir, pre.values.NONCE], {
      marker: 'ROLLBACK_DONE',
      timeoutMs: 300000,
      echo: true,
    });
  } catch (e) {
    error = e;
  }
  const poll = await poller.stop();
  summarizePoll(poll);
  if (error) {
    console.error(`ROLLBACK_STEP_FAILED ${error.message.split('\n')[0]}`);
  }
  const up = await waitFor200(DOIBUNG);
  console.log(`DOIBUNG_STATUS=${up.last.status}`);
  const www = await wwwRedirectOk();
  console.log(`WWW_STATUS=${www.last.status} WWW_LOCATION=${www.last.location}`);
  if (error || !up.ok || !www.ok) return EXIT.stepFailed;
  console.log('INFRA_ROLLBACK_OK');
  return EXIT.ok;
}

async function main(argv, env) {
  switch (argv[2]) {
    case 'check':
      return runCheck({ requireSite: false });
    case 'apply':
      return runApply(argv, env);
    case 'rollback':
      return runRollback(argv, env);
    default:
      console.error('Usage: node scripts/infra.mjs <check|apply [--approve=...]|rollback <BACKUP_DIR> [--approve=...]>');
      return EXIT.error;
  }
}

// Run only when executed directly, so deploy.mjs can import runCheck without side effects.
// Windows paths are case-insensitive (d:\ vs D:\); a false negative here would exit 0 doing nothing.
const samePath = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
const invokedDirectly =
  Boolean(process.argv[1]) && samePath(resolve(process.argv[1]), fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main(process.argv, process.env).then(
    (code) => process.exit(code),
    (e) => {
      console.error(`INFRA_FATAL ${e?.stack ?? e}`);
      process.exit(EXIT.error);
    },
  );
}

#!/usr/bin/env node
// scripts/infra.mjs — server wiring for doibung's Caddy (D-02).
//   check     read-only drift check (host files + live container)
//   apply     token-gated, idempotent wiring (Task 3)
//   rollback  token-gated restore from a backup dir (Task 3)
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { sshScript } from './lib/run.mjs';
import { STATE_KEYS, parseStateCheck, evaluateState, DRIFT_MESSAGE } from './lib/stateCheck.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_CHECK = resolve(ROOT, 'deploy/remote/state-check.sh');

export async function runCheck({ requireSite = false } = {}) {
  let out;
  try {
    ({ out } = await sshScript(STATE_CHECK, [], { marker: 'END=1', timeoutMs: 60000 }));
  } catch (e) {
    console.error(`STATE_CHECK_ERROR ${e.message}`);
    return 1;
  }
  const parsed = parseStateCheck(out);
  for (const k of STATE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(parsed.values, k)) console.log(`${k}=${parsed.values[k]}`);
  }
  if (!parsed.ok) {
    console.error(`STATE_CHECK_PARSE_FAIL missing=${parsed.missing.join(',') || '(none)'} (END=1 phải là dòng cuối)`);
    return 1;
  }
  console.log('STATE_CHECK_PARSED');
  const verdict = evaluateState(parsed.values, { requireSite });
  if (verdict.pass) {
    console.log('INFRA_CHECK_OK');
    return 0;
  }
  for (const f of verdict.failures) console.error(`DRIFT ${f}`);
  console.error(DRIFT_MESSAGE);
  return 2;
}

async function main(argv) {
  const cmd = argv[2];
  switch (cmd) {
    case 'check':
      return runCheck({ requireSite: false });
    case 'apply':
    case 'rollback':
      console.error(`infra ${cmd}: not implemented`);
      return 1;
    default:
      console.error('Usage: node scripts/infra.mjs <check|apply|rollback>');
      return 1;
  }
}

main(process.argv).then(
  (code) => process.exit(code),
  (e) => {
    console.error(`INFRA_FATAL ${e?.stack ?? e}`);
    process.exit(1);
  },
);

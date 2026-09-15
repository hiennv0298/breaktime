#!/usr/bin/env node
// scripts/phase-gate-guard.mjs — D-12 entry guard every Phase 2 integration plan (02-06..02-13) runs first.
//
//   node scripts/phase-gate-guard.mjs --plan 02-NN [--gate <path>] [--state <path>] [--dry-run]
//
// Prints exactly one marker line and exits 0 for every outcome (a pending or stopped gate ends the plan cleanly
// instead of blocking on a human checkpoint forever):
//   GUARD_CONTINUE plan=<id> reason=<r>          gate passed: continue; the Phase 2 gate blocker is removed
//   PLAN_EXIT_GATE_PENDING plan=<id> reason=<r>  gate missing / re-measure / waiting for D-07: end the plan
//   PLAN_EXIT_STACK_STOP plan=<id> reason=<r>    Phase 1 stopped the stack: end the plan
// On pending / stop STATE.md keeps exactly one plan-independent blocker line (scripts/lib/phaseGate.mjs).
// Usage errors print GUARD_USAGE on stderr and exit 2. --dry-run never writes.
import fs from 'node:fs';
import {
  GATE_FILE,
  STATE_FILE,
  readGateVerdict,
  upsertBlocker,
  removeBlocker,
} from './lib/phaseGate.mjs';

const USAGE = 'GUARD_USAGE: node scripts/phase-gate-guard.mjs --plan 02-NN [--gate <path>] [--state <path>] [--dry-run]';

class UsageError extends Error {}

function usage(detail) {
  throw new UsageError(detail);
}

function parseArgs(argv) {
  const opts = { plan: null, gate: GATE_FILE, state: STATE_FILE, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') {
      opts.dryRun = true;
    } else if (a === '--plan' || a === '--gate' || a === '--state') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) usage(`${a} needs a value`);
      opts[a.slice(2)] = value;
      i++;
    } else {
      usage(`unknown argument ${a}`);
    }
  }
  if (typeof opts.plan !== 'string' || !/^02-\d{2}$/.test(opts.plan)) usage('--plan must match 02-NN');
  return opts;
}

/** utf8 contents, or null when the file does not exist. */
function readOrNull(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * @param {{ plan: string, gate: string, state: string, dryRun: boolean }} opts
 */
function run(opts) {
  const gateText = readOrNull(opts.gate);
  const stateText = readOrNull(opts.state);
  const verdict = readGateVerdict(gateText, stateText ?? '');

  const marker =
    verdict.status === 'pass'
      ? 'GUARD_CONTINUE'
      : verdict.status === 'stop'
        ? 'PLAN_EXIT_STACK_STOP'
        : 'PLAN_EXIT_GATE_PENDING';

  // A missing STATE.md is never created from here; the marker still decides the plan outcome.
  if (!opts.dryRun && stateText !== null) {
    const r = verdict.status === 'pass' ? removeBlocker(stateText) : upsertBlocker(stateText, verdict.reason);
    if (r.changed) fs.writeFileSync(opts.state, r.text, 'utf8');
  }

  process.stdout.write(`${marker} plan=${opts.plan} reason=${verdict.reason}\n`);
  process.exitCode = 0;
}

let opts = null;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (err) {
  if (!(err instanceof UsageError)) throw err;
  process.stderr.write(`${USAGE}${err.message ? ` (${err.message})` : ''}\n`);
  process.exitCode = 2;
}
if (opts) run(opts);

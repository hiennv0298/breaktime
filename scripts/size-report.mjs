// scripts/size-report.mjs — TECH-02 size report: raw/gzip/brotli per file and per group, totals,
// optional first-load summary (test-results/first-load.json) and `--gate` enforcement.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { GROUPS, SIDECAR_RE, evaluateDist, evaluateFirstLoad, groupOf } from './lib/sizeGate.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const FIRST_LOAD = join(ROOT, 'test-results', 'first-load.json');
const REASON = join(ROOT, 'SIZE-REASON.md');
const gate = process.argv.includes('--gate');

function walk(dir, out = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p); // symlinks and other entries are listed too, so the gate sees them
  }
  return out;
}

/** Sidecars from precompress.mjs use the same settings; reuse their size when they are not stale. */
function compressedSize(file, buf, ext, compress) {
  const side = `${file}.${ext}`;
  if (existsSync(side) && statSync(side).mtimeMs >= statSync(file).mtimeMs) return statSync(side).size;
  return compress(buf).length;
}

const kb = (n) => (n / 1000).toFixed(1).padStart(10);

if (!existsSync(DIST) || !statSync(DIST).isDirectory()) {
  console.error(`SIZE_REPORT_FAIL dist missing: ${DIST} (run npx vite build first)`);
  process.exit(1);
}

const rows = [];
for (const abs of walk(DIST)) {
  const path = relative(DIST, abs).replace(/\\/g, '/');
  if (SIDECAR_RE.test(path)) continue;
  const st = statSync(abs);
  if (!st.isFile()) {
    rows.push({ path, raw: st.size, gzip: 0, brotli: 0, group: groupOf(path) });
    continue;
  }
  const buf = readFileSync(abs);
  const gzip = compressedSize(abs, buf, 'gz', (b) => gzipSync(b, { level: 9 }));
  const brotli = compressedSize(abs, buf, 'br', (b) =>
    brotliCompressSync(b, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: b.length },
    }),
  );
  rows.push({ path, raw: buf.length, gzip, brotli, group: groupOf(path) });
}

console.log(`Size report for ${DIST} (kB = 1000 bytes)`);
console.log(`${'group / file'.padEnd(52)}${'raw kB'.padStart(10)}${'gzip kB'.padStart(10)}${'br kB'.padStart(10)}`);
const totals = { raw: 0, gzip: 0, brotli: 0 };
for (const group of GROUPS) {
  const inGroup = rows.filter((r) => r.group === group).sort((a, b) => b.raw - a.raw);
  const sub = inGroup.reduce(
    (s, r) => ({ raw: s.raw + r.raw, gzip: s.gzip + r.gzip, brotli: s.brotli + r.brotli }),
    { raw: 0, gzip: 0, brotli: 0 },
  );
  console.log(`[${group}] ${inGroup.length} file(s)`.padEnd(52) + kb(sub.raw) + kb(sub.gzip) + kb(sub.brotli));
  for (const r of inGroup) {
    console.log(`    ${r.path}`.padEnd(52) + kb(r.raw) + kb(r.gzip) + kb(r.brotli));
  }
  totals.raw += sub.raw;
  totals.gzip += sub.gzip;
  totals.brotli += sub.brotli;
}
console.log('TOTAL'.padEnd(52) + kb(totals.raw) + kb(totals.gzip) + kb(totals.brotli));
console.log(`DIST_FILES=${rows.length} DIST_RAW=${totals.raw} DIST_GZIP=${totals.gzip} DIST_BROTLI=${totals.brotli}`);

if (existsSync(FIRST_LOAD)) {
  try {
    const fl = JSON.parse(readFileSync(FIRST_LOAD, 'utf8'));
    const files = Array.isArray(fl.files) ? fl.files : [];
    const reason = existsSync(REASON) ? readFileSync(REASON, 'utf8') : null;
    const verdict = evaluateFirstLoad(fl.totalRaw, reason);
    console.log(`\nFirst load (test-results/first-load.json, ${files.length} responses until ready-to-play)`);
    for (const f of [...files].sort((a, b) => b.raw - a.raw)) {
      console.log(`    ${f.path}`.padEnd(52) + kb(f.raw));
    }
    console.log(`FIRST_LOAD_TOTAL_RAW=${fl.totalRaw} FIRST_LOAD_LEVEL=${verdict.level}`);
    console.log(`  ${verdict.message}`);
  } catch (e) {
    console.log(`\nFirst load: test-results/first-load.json unreadable (${e.message})`);
  }
} else {
  console.log('\nFirst load: not measured yet (run npx playwright test tests/e2e/first-load.spec.ts --project=desktop)');
}

if (gate) {
  const { errors, totalRaw, fileCount } = evaluateDist(rows.map(({ path, raw }) => ({ path, raw })));
  if (errors.length > 0) {
    for (const e of errors) console.error(`SIZE_GATE_ERROR ${e}`);
    console.error(`SIZE_GATE_FAIL errors=${errors.length}`);
    process.exit(1);
  }
  console.log(`SIZE_GATE_OK totalRaw=${totalRaw} files=${fileCount}`);
}

// scripts/precompress.mjs — write .br (quality 11) and .gz (level 9) sidecars next to compressible
// dist files so Caddy `precompressed br gzip` serves them without compressing on the 1 vCPU VPS.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { SIDECAR_RE } from './lib/sizeGate.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const EXTS = new Set(['.js', '.css', '.html', '.json', '.wasm', '.glb', '.svg', '.txt']);
const MIN_BYTES = 1024;

function walk(dir, out = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile()) out.push(p);
  }
  return out;
}

if (!existsSync(DIST) || !statSync(DIST).isDirectory()) {
  console.error(`PRECOMPRESS_FAIL dist missing: ${DIST}`);
  process.exit(1);
}

let n = 0;
let rawSum = 0;
let brSum = 0;
let gzSum = 0;
for (const file of walk(DIST)) {
  if (SIDECAR_RE.test(file)) continue;
  if (!EXTS.has(extname(file).toLowerCase())) continue;
  const buf = readFileSync(file);
  if (buf.length < MIN_BYTES) continue;
  const br = brotliCompressSync(buf, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
    },
  });
  const gz = gzipSync(buf, { level: 9 });
  writeFileSync(`${file}.br`, br);
  writeFileSync(`${file}.gz`, gz);
  n += 1;
  rawSum += buf.length;
  brSum += br.length;
  gzSum += gz.length;
}

if (n === 0) {
  console.error('PRECOMPRESS_FAIL no compressible files found in dist');
  process.exit(1);
}
console.log(`PRECOMPRESS_DONE files=${n} raw=${rawSum} br=${brSum} gz=${gzSum}`);

// Dev-time only. Fetches the four CC0 Kenney packs used by the spike into the
// gitignored assets-src/downloads folder, verifies each zip and its CC0 license,
// extracts it, and writes an inventory of usable source files.
// Node 22, no dependencies. Never called by build or deploy.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readSync, closeSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOWNLOADS = join(ROOT, 'assets-src', 'downloads');
const SLUGS = ['blocky-characters', 'furniture-kit', 'food-kit', 'impact-sounds'];
const ORIGIN = 'https://kenney.nl';
const MIN_ZIP_BYTES = 10000;
const SYSTEM_TAR = 'C:/Windows/System32/tar.exe';

function fail(msg) {
  console.error(`FETCH_FAIL ${msg}`);
  process.exit(1);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile()) out.push(p);
  }
  return out;
}

function readMagic(file) {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(4);
    const n = readSync(fd, buf, 0, 4, 0);
    return n === 4 ? buf : null;
  } finally {
    closeSync(fd);
  }
}

async function fetchPack(slug) {
  const pageUrl = `${ORIGIN}/assets/${slug}`;
  const page = await fetch(pageUrl, { redirect: 'follow' });
  if (!page.ok) fail(`${slug} page HTTP ${page.status}`);
  const html = await page.text();
  const re = new RegExp(`media/pages/assets/${escapeRe(slug)}/[^'"\\s>]+\\.zip`);
  const match = html.match(re);
  if (!match) fail(`${slug} no zip link on ${pageUrl}`);
  const zipUrl = `${ORIGIN}/${match[0]}`;
  if (!zipUrl.startsWith('https://')) fail(`${slug} non-https zip url`);
  const zipName = basename(match[0]);
  if (!/^[\w.-]+\.zip$/.test(zipName)) fail(`${slug} unexpected zip name ${zipName}`);
  const zipPath = join(DOWNLOADS, zipName);

  const res = await fetch(zipUrl, { redirect: 'follow' });
  if (!res.ok) fail(`${slug} zip HTTP ${res.status}`);
  const len = Number(res.headers.get('content-length') ?? NaN);
  if (Number.isFinite(len) && existsSync(zipPath) && statSync(zipPath).size === len) {
    await res.body?.cancel();
  } else {
    const buf = Buffer.from(await res.arrayBuffer());
    if (Number.isFinite(len) && buf.length !== len) fail(`${slug} truncated download ${buf.length}/${len}`);
    await writeFile(zipPath, buf);
  }

  const bytes = statSync(zipPath).size;
  if (bytes <= MIN_ZIP_BYTES) fail(`${slug} zip too small (${bytes} bytes)`);
  const magic = readMagic(zipPath);
  if (!magic || !magic.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) fail(`${slug} not a zip (bad PK magic)`);

  const outDir = join(DOWNLOADS, slug);
  mkdirSync(outDir, { recursive: true });
  const tar = existsSync(SYSTEM_TAR) ? SYSTEM_TAR : 'tar';
  // bsdtar strips absolute paths and '..' components by default (T-01-05-02).
  const r = spawnSync(tar, ['-xf', zipPath, '-C', outDir], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.error) fail(`${slug} tar spawn error ${r.error.message}`);
  if (r.status !== 0) fail(`${slug} tar exit ${r.status}`);

  const files = walk(outDir);
  if (files.length === 0) fail(`${slug} extraction produced no files`);
  const licenses = files.filter((f) => basename(f).toLowerCase() === 'license.txt');
  if (licenses.length === 0) fail(`${slug} License.txt not found`);
  for (const lic of licenses) {
    const text = readFileSync(lic, 'utf8');
    if (!text.includes('CC0')) fail(`${slug} ${relative(ROOT, lic)} does not mention CC0`);
  }
  console.log(`FETCHED ${slug} ${bytes} license=CC0`);
  return { slug, zipName, bytes, files };
}

async function main() {
  mkdirSync(DOWNLOADS, { recursive: true });
  const packs = [];
  for (const slug of SLUGS) packs.push(await fetchPack(slug));

  const lines = [];
  for (const { slug, files } of packs) {
    for (const f of files) {
      const rel = relative(DOWNLOADS, f).split(sep).join('/');
      const lower = rel.toLowerCase();
      const segs = lower.split('/');
      const isGlb = lower.endsWith('.glb');
      const isTex = lower.endsWith('.png') && segs.slice(0, -1).includes('textures');
      const isOgg = lower.endsWith('.ogg');
      if (isGlb || isTex || isOgg) lines.push(rel);
    }
    const zip = packs.find((p) => p.slug === slug).zipName;
    lines.push(`# ${slug} zip=${zip}`);
  }
  lines.sort();
  const count = lines.filter((l) => !l.startsWith('#')).length;
  if (count === 0) fail('inventory is empty');
  writeFileSync(join(DOWNLOADS, 'inventory.txt'), lines.join('\n') + '\n');
  console.log(`INVENTORY ${count} files -> assets-src/downloads/inventory.txt`);
}

main().catch((err) => fail(err?.stack ?? String(err)));

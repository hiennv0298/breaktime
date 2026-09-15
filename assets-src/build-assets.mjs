// Dev-time asset pipeline (D-09, D-15, D-25). Never called by build or deploy.
// Rebuilds every committed runtime asset under src/assets from the CC0 Kenney
// packs fetched by `npm run assets:fetch`, using only devDependencies:
//   - @gltf-transform/cli (spawned with process.execPath, no shell)
//   - ffmpeg-static (binary spawned directly; nothing is installed on Windows)
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import ffmpegPath from 'ffmpeg-static';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAP_PATH = join(ROOT, 'assets-src', 'asset-map.json');
const DOWNLOADS = join(ROOT, 'assets-src', 'downloads');
const TMP = join(ROOT, 'assets-src', '.tmp');
const OUT = join(ROOT, 'src', 'assets');
const OUT_TEX = join(OUT, 'tex');
const OUT_SFX = join(OUT, 'sfx');
const MAX_RAW_BYTES = 2_000_000;
const TEXTURE_SIZE = 512;
const PACK_DIR = {
  office: join(DOWNLOADS, 'furniture-kit'),
  food: join(DOWNLOADS, 'food-kit'),
  character: join(DOWNLOADS, 'blocky-characters'),
  sfx: join(DOWNLOADS, 'impact-sounds'),
};
const REQUIRED_OFFICE_ROLES = [
  'desk', 'chairDesk', 'computerScreen', 'computerKeyboard', 'computerMouse', 'laptop',
  'coffeeMachine', 'fridge', 'pantryCounter', 'pottedPlant', 'plantSmall', 'trashcan',
  'bookcase', 'books', 'boxClosed',
];
const REQUIRED_FOOD_ROLES = ['mug', 'cupCoffee'];
const CHARACTER_NODES = ['leg-left', 'leg-right', 'torso', 'arm-left', 'arm-right', 'head'];
const CHARACTER_CLIPS = ['idle', 'walk', 'die', 'attack-melee-right', 'interact-right'];
const CHARACTER_CLIP_COUNT = 27;
const TEXTURE_LETTERS = 'abcdefghijklmnopqr'.split('');

class BuildError extends Error {}
function fail(msg) {
  throw new BuildError(msg);
}
const rel = (p) => relative(ROOT, p).split(sep).join('/');

// ---------- tool resolution ----------
function gltfTransformCli() {
  // The package "exports" map hides ./package.json, so read it from node_modules directly.
  const pkgPath = join(ROOT, 'node_modules', '@gltf-transform', 'cli', 'package.json');
  if (!existsSync(pkgPath)) fail('@gltf-transform/cli is not installed (npm ci)');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.['gltf-transform'];
  if (!bin) fail('@gltf-transform/cli package.json has no gltf-transform bin entry');
  const cli = join(dirname(pkgPath), bin);
  if (!existsSync(cli)) fail(`gltf-transform CLI entry missing: ${cli}`);
  return cli;
}

function run(label, cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (r.error || r.status !== 0) {
    if (r.stdout) process.stderr.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    fail(`${label} failed (${r.error ? r.error.message : `exit ${r.status}`})`);
  }
}

let CLI;
const gltf = (label, args) => run(`gltf-transform ${label}`, process.execPath, [CLI, ...args]);
const ffmpeg = (label, args) => run(`ffmpeg ${label}`, ffmpegPath, args);

// ---------- GLB / PNG / MP3 parsing ----------
function readGlbJson(file) {
  const b = readFileSync(file);
  if (b.length < 20 || b.readUInt32LE(0) !== 0x46546c67) fail(`${rel(file)} is not a GLB (bad magic)`);
  if (b.readUInt32LE(4) !== 2) fail(`${rel(file)} is not glTF 2.0`);
  const chunkLen = b.readUInt32LE(12);
  const chunkType = b.readUInt32LE(16);
  if (chunkType !== 0x4e4f534a) fail(`${rel(file)} first chunk is not JSON`);
  return JSON.parse(b.subarray(20, 20 + chunkLen).toString('utf8'));
}

function sourceRootName(file) {
  const j = readGlbJson(file);
  const scene = j.scenes?.[j.scene ?? 0];
  const roots = scene?.nodes ?? [];
  if (roots.length !== 1) fail(`${rel(file)} must have exactly one root node (found ${roots.length})`);
  const name = j.nodes[roots[0]]?.name;
  if (!name) fail(`${rel(file)} root node has no name`);
  return name;
}

function pngSize(file) {
  const b = readFileSync(file);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (b.length < 33 || !b.subarray(0, 8).equals(sig) || b.toString('latin1', 12, 16) !== 'IHDR') fail(`${rel(file)} is not a PNG`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25] };
}

function assertMp3(file) {
  const b = readFileSync(file);
  if (b.length <= 1000) fail(`${rel(file)} too small (${b.length} bytes)`);
  const id3 = b.toString('latin1', 0, 3) === 'ID3';
  const sync = b[0] === 0xff && b[1] >= 0xe0;
  if (!id3 && !sync) fail(`${rel(file)} has no ID3 tag or MPEG frame sync`);
}

// ---------- steps ----------
function srcPath(pack, relPath) {
  const p = resolve(PACK_DIR[pack], relPath);
  if (!p.startsWith(PACK_DIR[pack] + sep)) fail(`${pack} path escapes pack folder: ${relPath}`);
  if (!existsSync(p)) fail(`missing source ${rel(p)} (run npm run assets:fetch)`);
  return p;
}

// Merge a role → GLB set into one optimised GLB and return role → node name.
function buildMerged(group, roles, required, outFile) {
  const missingRoles = required.filter((r) => !roles[r]);
  if (missingRoles.length) fail(`asset-map.json ${group} lacks roles: ${missingRoles.join(', ')}`);
  const work = join(TMP, group);
  mkdirSync(work, { recursive: true });
  const inputs = [];
  const rootByRole = {};
  const copied = new Set();
  for (const role of required) {
    const src = srcPath(group, roles[role]);
    const name = basename(src);
    if (copied.has(name)) fail(`${group}: two roles use the same file name ${name}`);
    copied.add(name);
    const texDir = join(dirname(src), 'Textures');
    if (existsSync(texDir) && !existsSync(join(work, 'Textures'))) cpSync(texDir, join(work, 'Textures'), { recursive: true });
    const dst = join(work, name);
    copyFileSync(src, dst);
    inputs.push(dst);
    rootByRole[role] = sourceRootName(dst);
  }
  const names = Object.values(rootByRole);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  if (dup.length) fail(`${group}: source root node names collide: ${[...new Set(dup)].join(', ')}`);

  const merged = join(TMP, `${group}-merged.glb`);
  gltf(`merge ${group}`, ['merge', ...inputs, merged, '--merge-scenes']);
  gltf(`optimize ${group}`, [
    'optimize', merged, outFile,
    '--compress', 'meshopt', '--palette', 'true', '--texture-compress', 'false',
    '--flatten', 'false', '--join', 'false', '--instance', 'false', '--simplify', 'false',
  ]);

  const j = readGlbJson(outFile);
  const nodeNames = (j.nodes ?? []).map((n) => n.name);
  const index = {};
  const unmapped = [];
  for (const role of required) {
    const n = rootByRole[role];
    const hits = nodeNames.filter((x) => x === n).length;
    if (hits === 1) index[role] = n;
    else unmapped.push(`${role} (${n}: ${hits} matches)`);
  }
  if (unmapped.length) fail(`${rel(outFile)} unmapped roles: ${unmapped.join(', ')}`);
  return { index, materials: (j.materials ?? []).length };
}

function buildCharacter(charMap) {
  const src = srcPath('character', charMap.base);
  const texDir = srcPath('character', charMap.texturesDir);
  const work = join(TMP, 'char');
  mkdirSync(work, { recursive: true });
  cpSync(texDir, join(work, 'Textures'), { recursive: true });
  const base = join(work, basename(src));
  copyFileSync(src, base);
  const resized = join(work, 'char-512.glb');
  const out = join(OUT, 'character.glb');
  gltf('resize character', ['resize', base, resized, '--width', String(TEXTURE_SIZE), '--height', String(TEXTURE_SIZE)]);
  gltf('optimize character', [
    'optimize', resized, out, '--compress', 'meshopt', '--texture-compress', 'false', '--prune-attributes', 'false',
  ]);

  const j = readGlbJson(out);
  const names = new Set((j.nodes ?? []).map((n) => n.name));
  const missingNodes = CHARACTER_NODES.filter((n) => !names.has(n));
  if (missingNodes.length) fail(`character.glb missing nodes: ${missingNodes.join(', ')}`);
  const clips = (j.animations ?? []).map((a) => a.name);
  if (clips.length !== CHARACTER_CLIP_COUNT) fail(`character.glb has ${clips.length} animations, expected ${CHARACTER_CLIP_COUNT}`);
  const missingClips = CHARACTER_CLIPS.filter((c) => !clips.includes(c));
  if (missingClips.length) fail(`character.glb missing clips: ${missingClips.join(', ')}`);
  const noNormal = [];
  for (const m of j.meshes ?? []) {
    m.primitives.forEach((p, i) => {
      if (p.attributes?.NORMAL === undefined) noNormal.push(`${m.name}#${i}`);
    });
  }
  if (!(j.meshes ?? []).length) fail('character.glb has no meshes');
  if (noNormal.length) fail(`character.glb primitives without NORMAL (Pitfall 9): ${noNormal.join(', ')}`);
  console.log(`character.glb nodes=${CHARACTER_NODES.length}/6 clips=${clips.length} meshes=${j.meshes.length} normals=ok`);
}

function buildTextures(charMap) {
  const texDir = srcPath('character', charMap.texturesDir);
  mkdirSync(OUT_TEX, { recursive: true });
  for (const f of readdirSync(OUT_TEX)) if (/^character-[a-z]\.png$/.test(f)) rmSync(join(OUT_TEX, f));
  for (const letter of TEXTURE_LETTERS) {
    const input = join(texDir, `texture-${letter}.png`);
    if (!existsSync(input)) fail(`missing texture ${rel(input)}`);
    const output = join(OUT_TEX, `character-${letter}.png`);
    ffmpeg(`texture-${letter}`, [
      '-y', '-v', 'error', '-i', input,
      '-vf', `scale=${TEXTURE_SIZE}:${TEXTURE_SIZE}:flags=area`, '-pix_fmt', 'rgba', output,
    ]);
    const { width, height } = pngSize(output);
    if (width !== TEXTURE_SIZE || height !== TEXTURE_SIZE) fail(`${rel(output)} is ${width}x${height}, expected ${TEXTURE_SIZE}x${TEXTURE_SIZE}`);
  }
}

function buildSfx(sfxMap) {
  const roles = Object.keys(sfxMap);
  if (roles.length < 10) fail(`asset-map.json has ${roles.length} sfx roles, need >= 10`);
  mkdirSync(OUT_SFX, { recursive: true });
  for (const f of readdirSync(OUT_SFX)) if (f.endsWith('.mp3')) rmSync(join(OUT_SFX, f));
  for (const role of roles) {
    if (!/^[a-z]+(-[a-z]+)*-\d$/.test(role)) fail(`bad sfx role name ${role}`);
    const input = srcPath('sfx', sfxMap[role]);
    const output = join(OUT_SFX, `${role}.mp3`);
    ffmpeg(role, ['-y', '-v', 'error', '-i', input, '-ac', '1', '-ar', '44100', '-b:a', '96k', output]);
    assertMp3(output);
  }
}

function listOutputs(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listOutputs(p));
    else out.push(p);
  }
  return out;
}

function report(files) {
  let raw = 0;
  let gz = 0;
  const rows = files.map((f) => {
    const buf = readFileSync(f);
    if (buf.length === 0) fail(`${rel(f)} is empty`);
    const g = gzipSync(buf, { level: 9 }).length;
    raw += buf.length;
    gz += g;
    return [rel(f), buf.length, g];
  });
  const w = Math.max(...rows.map((r) => r[0].length), 5);
  console.log(`${'file'.padEnd(w)}  ${'raw'.padStart(9)}  ${'gzip'.padStart(9)}`);
  for (const [n, r, g] of rows) console.log(`${n.padEnd(w)}  ${String(r).padStart(9)}  ${String(g).padStart(9)}`);
  console.log(`${'TOTAL'.padEnd(w)}  ${String(raw).padStart(9)}  ${String(gz).padStart(9)}`);
  return raw;
}

function main() {
  if (!ffmpegPath || !existsSync(ffmpegPath)) fail('ffmpeg-static binary not found (npm ci)');
  CLI = gltfTransformCli();
  const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
  for (const k of ['office', 'food', 'character', 'sfx']) if (!map[k]) fail(`asset-map.json missing key ${k}`);

  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUT, { recursive: true });

  const office = buildMerged('office', map.office, REQUIRED_OFFICE_ROLES, join(OUT, 'office.glb'));
  console.log(`office.glb roles=${Object.keys(office.index).length} materials=${office.materials}`);
  if (office.materials > 4) console.warn(`WARN office.glb has ${office.materials} materials (> 4)`);
  const food = buildMerged('food', map.food, REQUIRED_FOOD_ROLES, join(OUT, 'food.glb'));
  console.log(`food.glb roles=${Object.keys(food.index).length} materials=${food.materials}`);
  const indexFile = join(OUT, 'office-index.json');
  writeFileSync(indexFile, JSON.stringify({ office: office.index, food: food.index }, null, 2) + '\n');

  buildCharacter(map.character);
  buildTextures(map.character);
  buildSfx(map.sfx);

  const files = [
    join(OUT, 'office.glb'), join(OUT, 'food.glb'), indexFile, join(OUT, 'character.glb'),
    ...listOutputs(OUT_TEX).filter((f) => f.endsWith('.png')).sort(),
    ...listOutputs(OUT_SFX).filter((f) => f.endsWith('.mp3')).sort(),
  ];
  const stray = listOutputs(OUT).filter((f) => /ffmpeg/i.test(f));
  if (stray.length) fail(`ffmpeg files under src/assets: ${stray.map(rel).join(', ')}`);
  const raw = report(files);
  rmSync(TMP, { recursive: true, force: true });
  if (raw > MAX_RAW_BYTES) fail(`raw asset total ${raw} exceeds ${MAX_RAW_BYTES} bytes`);
  console.log(`ASSETS_OK files=${files.length} bytes=${raw}`);
}

try {
  main();
} catch (err) {
  console.error(`ASSETS_FAIL ${err instanceof BuildError ? err.message : err?.stack ?? err}`);
  process.exit(1);
}

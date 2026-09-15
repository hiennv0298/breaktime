// scripts/lib/sizeGate.mjs — pure TECH-02 size rules (no fs). MB = 1,000,000 bytes.
// Used by scripts/size-report.mjs (dist gate) and tests/e2e/first-load.spec.ts (first-load gate).

export const MB = 1_000_000;
export const DIST_MAX_RAW = 20 * MB;
export const DIST_MAX_FILES = 1500;
export const FIRST_LOAD_TARGET = 8 * MB;
export const FIRST_LOAD_MAX = 20 * MB;
export const SIDECAR_RE = /\.(br|gz)$/;
export const GROUPS = ['entry-js', 'rapier', 'models', 'textures', 'audio', 'other'];

function norm(path) {
  return String(path ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
}

function baseName(path) {
  const p = norm(path);
  return p.slice(p.lastIndexOf('/') + 1);
}

/** @returns {'entry-js'|'rapier'|'models'|'textures'|'audio'|'other'} */
export function groupOf(path) {
  const p = norm(path);
  const name = baseName(p);
  if (/^assets\/index-[^/]+\.js$/.test(p)) return 'entry-js';
  if (/rapier/i.test(name)) return 'rapier';
  if (/\.(glb|gltf|bin)$/i.test(name)) return 'models';
  if (/\.(png|jpe?g|webp|ktx2|avif)$/i.test(name)) return 'textures';
  if (/\.(mp3|ogg|wav|m4a)$/i.test(name)) return 'audio';
  return 'other';
}

/**
 * @param {{ path: string, raw: number }[]} files
 * @returns {{ errors: string[], totalRaw: number, fileCount: number }}
 */
export function evaluateDist(files) {
  const errors = [];
  let totalRaw = 0;
  let fileCount = 0;
  for (const f of files ?? []) {
    const p = norm(f?.path);
    if (SIDECAR_RE.test(p)) continue;
    const name = baseName(p);
    if (name.endsWith('.map')) errors.push(`source map in dist (.map): ${p}`);
    if (name === '.env' || name.startsWith('.env.')) errors.push(`env file in dist (.env*): ${p}`);
    if (typeof f?.raw !== 'number' || !Number.isFinite(f.raw) || f.raw < 0) {
      errors.push(`invalid size for ${p}: ${f?.raw}`);
      continue;
    }
    totalRaw += f.raw;
    fileCount += 1;
  }
  if (fileCount === 0) errors.push('dist is empty (0 non-sidecar files)');
  if (fileCount > DIST_MAX_FILES) {
    errors.push(`too many files in dist: ${fileCount} > ${DIST_MAX_FILES}`);
  }
  if (totalRaw > DIST_MAX_RAW) {
    errors.push(`dist raw size ${totalRaw} bytes > ${DIST_MAX_RAW} (20 MB)`);
  }
  return { errors, totalRaw, fileCount };
}

/**
 * First-load rule: > 20 MB fails; > 8 MB fails unless SIZE-REASON.md states the measured number
 * (either "<x.y>" MB with one decimal or the exact byte count).
 * @param {number} totalRaw
 * @param {string|null} reasonText
 * @returns {{ level: 'ok'|'warn'|'fail', message: string }}
 */
export function evaluateFirstLoad(totalRaw, reasonText) {
  if (typeof totalRaw !== 'number' || !Number.isFinite(totalRaw) || totalRaw <= 0) {
    return { level: 'fail', message: `first-load total is not a positive number (${totalRaw}); nothing measured` };
  }
  const mb = (totalRaw / MB).toFixed(1);
  if (totalRaw > FIRST_LOAD_MAX) {
    return { level: 'fail', message: `first load ${mb} MB (${totalRaw} bytes) > 20 MB hard cap` };
  }
  if (totalRaw <= FIRST_LOAD_TARGET) {
    return { level: 'ok', message: `first load ${mb} MB (${totalRaw} bytes) <= 8 MB target` };
  }
  const text = typeof reasonText === 'string' ? reasonText : '';
  if (text.includes(mb) || text.includes(String(totalRaw))) {
    return {
      level: 'warn',
      message: `first load ${mb} MB (${totalRaw} bytes) > 8 MB target; accepted by SIZE-REASON.md`,
    };
  }
  return {
    level: 'fail',
    message: `first load ${mb} MB (${totalRaw} bytes) > 8 MB target; write SIZE-REASON.md at repo root stating ${mb} MB and why`,
  };
}

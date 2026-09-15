// scripts/lib/tools.mjs — resolve local tool entry points without npx/shell (PATH can drop mid-session,
// RESEARCH Pitfall 7). Node bins are run as `process.execPath <abs js entry>`.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Absolute JS entry of a package bin from node_modules/<pkg>/package.json.
 * @param {string} pkg package name, scoped names allowed
 * @param {string} binName bin key (string-form bins are named after the unscoped package name)
 * @returns {string}
 */
export function nodeBin(pkg, binName) {
  const pkgDir = join(ROOT, 'node_modules', ...pkg.split('/'));
  const manifest = join(pkgDir, 'package.json');
  if (!existsSync(manifest)) throw new Error(`nodeBin: ${pkg} is not installed (${manifest} missing)`);
  const { name, bin } = JSON.parse(readFileSync(manifest, 'utf8'));
  let rel;
  if (typeof bin === 'string') {
    const unscoped = String(name ?? pkg).replace(/^@[^/]+\//, '');
    if (binName === unscoped) rel = bin;
  } else if (bin && typeof bin === 'object' && typeof bin[binName] === 'string') {
    rel = bin[binName];
  }
  if (!rel) throw new Error(`nodeBin: ${pkg} has no bin named ${binName}`);
  const abs = resolve(pkgDir, rel);
  if (!existsSync(abs)) throw new Error(`nodeBin: ${pkg} bin ${binName} points at a missing file ${abs}`);
  return abs;
}

const GIT_FALLBACK = 'C:/Program Files/Git/cmd/git.exe';

function resolveGit() {
  const probe = spawnSync('git', ['--version'], { windowsHide: true, encoding: 'utf8' });
  if (!probe.error && probe.status === 0 && /git version/.test(probe.stdout ?? '')) return 'git';
  if (process.platform === 'win32' && existsSync(GIT_FALLBACK)) return GIT_FALLBACK;
  return 'git';
}

/** 'git' when it can be spawned, else the Git for Windows absolute path on win32. */
export const GIT = resolveGit();

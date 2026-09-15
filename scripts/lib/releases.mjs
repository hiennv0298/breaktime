// scripts/lib/releases.mjs — pure release retention (D-04). The server re-validates every name
// (deploy/remote/release.sh cleanup), so this list is a request, never an unchecked delete.

export const SHA_RE = /^[0-9a-f]{12}$/;
export const RELEASE_NAME_RE = /^[0-9a-f]{7,40}$/;

/** @returns {string} the sha when it is exactly 12 lowercase hex; throws otherwise. */
export function validateSha(s) {
  if (typeof s !== 'string' || !SHA_RE.test(s)) {
    throw new Error(`invalid sha (expected 12 lowercase hex): ${JSON.stringify(s)}`);
  }
  return s;
}

/**
 * Parse release.sh output lines of the form "__REL__ <name> <epoch>".
 * @returns {{ name: string, mtime: number }[]}
 */
export function parseReleaseListing(text) {
  if (typeof text !== 'string') return [];
  const out = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const m = /^__REL__ ([^ ]+) ([0-9]+)$/.exec(line);
    if (!m || !RELEASE_NAME_RE.test(m[1])) continue;
    const mtime = Number(m[2]);
    if (!Number.isSafeInteger(mtime)) continue;
    out.push({ name: m[1], mtime });
  }
  return out;
}

/**
 * Keep the `keep` newest releases (mtime descending, name ascending on ties) plus `current`;
 * return the names of the rest. Invalid names, non-finite mtimes and duplicates are ignored.
 * @param {{ name: string, mtime: number }[]} list
 * @param {number} keep
 * @param {string} current
 * @returns {string[]}
 */
export function selectReleasesToDelete(list, keep, current) {
  if (typeof keep !== 'number' || !Number.isInteger(keep) || keep < 1) {
    throw new Error(`keep must be an integer >= 1, got ${JSON.stringify(keep)}`);
  }
  if (typeof current !== 'string' || !RELEASE_NAME_RE.test(current)) {
    throw new Error(`current must be a valid release name, got ${JSON.stringify(current)}`);
  }
  const byName = new Map();
  for (const r of Array.isArray(list) ? list : []) {
    if (!r || typeof r.name !== 'string' || !RELEASE_NAME_RE.test(r.name)) continue;
    if (typeof r.mtime !== 'number' || !Number.isFinite(r.mtime)) continue;
    const prev = byName.get(r.name);
    if (!prev || r.mtime > prev.mtime) byName.set(r.name, { name: r.name, mtime: r.mtime });
  }
  const sorted = [...byName.values()].sort((a, b) =>
    b.mtime !== a.mtime ? b.mtime - a.mtime : a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  return sorted
    .slice(keep)
    .map((r) => r.name)
    .filter((name) => name !== current);
}

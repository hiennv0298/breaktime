// Pure SFX naming helpers (D-15, TECH-06). No three.js, no DOM: file names like `slap-1.mp3` become
// the name `slap-1`, and a family (`slap`) is every name made of the prefix plus a numeric suffix.

/** '../assets/sfx/slap-1.mp3' -> 'slap-1'. Strips folders (/ or \), query/hash and the last extension. */
export function sfxNameFromPath(p: string): string {
  const noQuery = p.split(/[?#]/, 1)[0];
  const base = noQuery.slice(Math.max(noQuery.lastIndexOf('/'), noQuery.lastIndexOf('\\')) + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

function suffixIndex(name: string, prefix: string): number | null {
  if (!name.startsWith(prefix + '-')) return null;
  const rest = name.slice(prefix.length + 1);
  return /^\d+$/.test(rest) ? Number(rest) : null;
}

/** Names of the form `${prefix}-<digits>`, sorted by the numeric suffix. 'break-glass' never matches 'break-ceramic-0'. */
export function variantsOf(names: string[], prefix: string): string[] {
  const found: Array<{ name: string; index: number }> = [];
  for (const name of names) {
    const index = suffixIndex(name, prefix);
    if (index !== null) found.push({ name, index });
  }
  found.sort((a, b) => a.index - b.index || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return found.map((f) => f.name);
}

/** One variant chosen by rng() in [0, 1); out-of-range or NaN values are clamped. Unknown prefix -> null. */
export function pickVariant(names: string[], prefix: string, rng: () => number): string | null {
  const list = variantsOf(names, prefix);
  if (list.length === 0) return null;
  const r = rng();
  const i = Number.isFinite(r) ? Math.floor(r * list.length) : 0;
  return list[Math.min(list.length - 1, Math.max(0, i))];
}

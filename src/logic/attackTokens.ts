/**
 * Pursue / strike token arbiter (D-07: tối đa 3 NPC đuổi, 1 NPC vung đòn). Pure, no three.js / Rapier / DOM, no clock
 * (D-12, TECH-06).
 *
 * RESEARCH M3: 30 NPCs chasing at once cost 8-10 ms per physics step; capping pursuers at 3 keeps the step at
 * 0.07-0.16 ms even at 40 NPCs (Pitfall 1). Angry NPCs without a token fume in place with their own spacing; they must
 * never converge on a shared waiting point (the M3 ring measured as a pile-up too).
 *
 * Deterministic: holders keep their tokens while they still want them (no thrash); free slots go by rank
 * (anger desc, NaN / non-finite anger as 0; dist asc, non-finite dist last; id asc). The result never depends on the
 * order of the input array (except which of several duplicate ids is used: the first).
 */

export const MAX_PURSUERS = 3;
export const MAX_ATTACKERS = 1;

export interface Contender {
  id: string;
  anger: number;
  /** Distance to the player (m). */
  dist: number;
  wantsPursue: boolean;
  wantsStrike: boolean;
}

export interface TokenHoldings {
  pursue: ReadonlySet<string>;
  strike: ReadonlySet<string>;
}

export function emptyHoldings(): TokenHoldings {
  return { pursue: new Set<string>(), strike: new Set<string>() };
}

function angerKey(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

function compareRank(a: Contender, b: Contender): number {
  const angerDiff = angerKey(b.anger) - angerKey(a.anger);
  if (angerDiff !== 0) return angerDiff;
  const aFinite = Number.isFinite(a.dist);
  const bFinite = Number.isFinite(b.dist);
  if (aFinite !== bFinite) return aFinite ? -1 : 1;
  if (aFinite && a.dist !== b.dist) return a.dist - b.dist;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function arbitrate(
  contenders: readonly Contender[],
  held: TokenHoldings,
): { pursue: Set<string>; strike: Set<string> } {
  // De-duplicate by first id, then rank.
  const seen = new Set<string>();
  const ranked: Contender[] = [];
  for (const entry of contenders) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    ranked.push(entry);
  }
  ranked.sort(compareRank);

  const pursue = new Set<string>();
  // 1. Holders that still want pursue keep it (trimmed in rank order if more than allowed).
  for (const entry of ranked) {
    if (pursue.size >= MAX_PURSUERS) break;
    if (entry.wantsPursue && held.pursue.has(entry.id)) pursue.add(entry.id);
  }
  // 2. Free slots by rank.
  for (const entry of ranked) {
    if (pursue.size >= MAX_PURSUERS) break;
    if (entry.wantsPursue) pursue.add(entry.id);
  }

  const strike = new Set<string>();
  // 3. The current strike holder keeps it while it wants strike and holds pursue.
  for (const entry of ranked) {
    if (strike.size >= MAX_ATTACKERS) break;
    if (entry.wantsStrike && held.strike.has(entry.id) && pursue.has(entry.id)) strike.add(entry.id);
  }
  // Otherwise the best-ranked pursue holder that wants strike.
  for (const entry of ranked) {
    if (strike.size >= MAX_ATTACKERS) break;
    if (entry.wantsStrike && pursue.has(entry.id)) strike.add(entry.id);
  }

  return { pursue, strike };
}

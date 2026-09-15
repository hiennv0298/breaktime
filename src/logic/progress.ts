/**
 * Weighted load progress in [0, 1]. Each task's fraction is clamped to [0, 1]; a task with no
 * reported fraction counts as 0. No tasks (or zero total weight) means nothing to wait for: 1.
 */
export function weightedProgress(weights: Record<string, number>, fractions: Record<string, number>): number {
  let total = 0;
  let done = 0;
  for (const id of Object.keys(weights)) {
    const w = weights[id];
    if (!Number.isFinite(w) || w <= 0) continue;
    const raw = fractions[id];
    const f = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
    total += w;
    done += w * f;
  }
  if (total === 0) return 1;
  return Math.min(1, Math.max(0, done / total));
}

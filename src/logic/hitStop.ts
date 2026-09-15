/**
 * Hit-stop (D-12, RESEARCH Pattern 3): a slap freezes the simulation for a few milliseconds while rendering and the
 * camera shake carry on. The loop turns `active(now)` into timeScale 0. Pure, no DOM (TECH-06).
 */

export interface HitStop {
  /** Freeze from nowMs for durationMs. An overlapping trigger extends the freeze; it never shortens it. */
  trigger(nowMs: number, durationMs: number): void;
  active(nowMs: number): boolean;
  /** Number of accepted triggers. */
  count(): number;
}

/** One freeze never lasts longer than this, whatever the caller passes. */
const MAX_FREEZE_MS = 1000;

export function createHitStop(): HitStop {
  let start = 0;
  let end = -Infinity;
  let triggers = 0;
  return {
    trigger(nowMs, durationMs) {
      if (!Number.isFinite(nowMs) || !Number.isFinite(durationMs) || durationMs < 0) return;
      const until = nowMs + Math.min(durationMs, MAX_FREEZE_MS);
      if (until > end) {
        if (nowMs >= end) start = nowMs;
        end = until;
      }
      triggers++;
    },
    active(nowMs) {
      return Number.isFinite(nowMs) && nowMs >= start && nowMs < end;
    },
    count() {
      return triggers;
    },
  };
}

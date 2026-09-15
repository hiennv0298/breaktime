/**
 * NPC temper (D-03 tính khí Nóng / Thường / Hiền, D-05 giận sau 1 / 2 / 3 cú tát). Pure, no three.js / Rapier / DOM
 * (D-12, TECH-06). The anger meter (anger.ts) keys its per-slap anger by this type; the roster (plans 02-04, 02-09)
 * stores it per member.
 */

export type Temper = 'hot' | 'normal' | 'calm';

/** Display / cycle order. */
export const TEMPERS: readonly Temper[] = Object.freeze(['hot', 'normal', 'calm'] as const);

/** Temper of a member created without one. */
export const DEFAULT_TEMPER: Temper = 'normal';

/** Vietnamese labels shown in the UI. */
export const TEMPER_LABEL_VI: Readonly<Record<Temper, string>> = Object.freeze({
  hot: 'Nóng',
  normal: 'Thường',
  calm: 'Hiền',
});

/** Locked design counts (D-05): consecutive slaps that make an NPC of this temper angry. */
export const SLAPS_TO_ANGER: Readonly<Record<Temper, number>> = Object.freeze({
  hot: 1,
  normal: 2,
  calm: 3,
});

export function isTemper(v: unknown): v is Temper {
  return v === 'hot' || v === 'normal' || v === 'calm';
}

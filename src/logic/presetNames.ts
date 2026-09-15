/**
 * Preset coworker nicknames for the random-name button (plan 02-04, D-04). Pure: no Math.random, no DOM (D-12, NPC-06);
 * the caller passes a seeded rng. Every entry is a harmless Vietnamese office nickname, already clean for
 * sanitizeNpcName and at most 16 code points (unit-tested, T-02-04-06). Free typing stays allowed (D-04).
 */

import { sanitizeNpcName } from './npcSettings';

export const PRESET_NAMES: readonly string[] = Object.freeze([
  'Anh Photocopy',
  'Chị Cà Phê',
  'Sếp Họp Hoài',
  'Bạn Deadline',
  'Chú Bảo Vệ',
  'Em Thực Tập',
  'Anh IT',
  'Chị Kế Toán',
  'Cô Lễ Tân',
  'Anh Excel',
  'Chị Trà Sữa',
  'Bạn Ngủ Gật',
  'Anh Họp Online',
  'Chị Nhân Sự',
  'Anh Sale',
  'Bạn Mượn Bút',
  'Anh Quên Pass',
  'Chị Order Cơm',
  'Sếp Nhỏ',
  'Anh Máy In',
  'Chị Pantry',
  'Anh Slide',
  'Bạn Báo Cáo',
  'Anh Wifi Yếu',
  'Em Pha Trà',
  'Anh Gõ Phím',
  'Chị Lịch Họp',
  'Bạn Ăn Vặt',
  'Anh Tai Nghe',
  'Chị Sticker',
  'Sếp Tổng',
  'Anh Cây Nước',
]);

/**
 * One rng draw, uniform among preset names not in `taken` (compared after sanitizeNpcName); when every name is taken,
 * uniform among all of them. Non-finite or out-of-range draws are clamped.
 */
export function randomPresetName(rng: () => number, taken: readonly string[]): string {
  const used = new Set<string>();
  for (const t of taken) used.add(sanitizeNpcName(t));
  const free = PRESET_NAMES.filter((n) => !used.has(n));
  const pool = free.length > 0 ? free : PRESET_NAMES;
  const draw = rng();
  const i = Number.isFinite(draw) ? Math.max(0, Math.min(pool.length - 1, Math.floor(draw * pool.length))) : 0;
  return pool[i];
}

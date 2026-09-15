/**
 * Pure floating-joystick math (RESEARCH Pattern 4, D-17).
 * Converts a pointer position relative to the joystick origin (CSS px) into:
 * - x, y: move vector in screen axes (y grows downward), length <= 1, zero inside the dead zone
 * - knobX, knobY: knob offset in px, clamped to `radius`
 */
export function stick(
  originX: number,
  originY: number,
  x: number,
  y: number,
  radius: number,
  dead = 0.12,
): { x: number; y: number; knobX: number; knobY: number } {
  let dx = x - originX;
  let dy = y - originY;
  const len = Math.hypot(dx, dy);
  const k = len > radius ? radius / len : 1;
  dx *= k;
  dy *= k;
  const mag = Math.min(len / radius, 1);
  return mag < dead ? { x: 0, y: 0, knobX: dx, knobY: dy } : { x: dx / radius, y: dy / radius, knobX: dx, knobY: dy };
}

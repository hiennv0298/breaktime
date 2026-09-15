import { playSfx, sfxNames } from '../audio/sfx';
import { BENCH_SEED, mulberry32 } from '../logic/rng';
import { pickVariant } from '../logic/sfxNames';
import { shakeCamera } from '../render/cameraView';
import type { Game } from './game';
import type { Npc } from './npc';

/**
 * Slap (D-12 slapstick, D-15 punch SFX, D-18 / D-20 input): hit-stop, light shake, player swing, and the NPC leaves
 * as a ragdoll that flies far and spins. Impulse constants are fixed and scaled by the ragdoll's own mass, so input can
 * never make them bigger (T-01-15-03).
 */

/** Horizontal fly-away speed (m/s) given to the whole ragdoll, applied on the torso. */
export const SLAP_HORIZONTAL = 9;
/** Upward kick (m/s). */
export const SLAP_UP = 5;

/** Seeded, so spin and pitch variation replay the same way in a benchmark run (D-08). */
const rng = mulberry32(BENCH_SEED);
let slaps = 0;

/** Slaps performed on this page (__bt.slap.count). */
export function slapCount(): number {
  return slaps;
}

export function performSlap(game: Game, npc: Npc, nowMs: number): void {
  if (!npc.slappable()) return; // already a ragdoll or getting up

  const p = game.player.pos();
  const t = npc.body.translation();
  let dx = t.x - p.x;
  let dz = t.z - p.z;
  let len = Math.hypot(dx, dz);
  if (!Number.isFinite(len) || len < 1e-3) {
    const yaw = game.player.yaw();
    dx = -Math.sin(yaw);
    dz = -Math.cos(yaw);
    len = 1;
  }
  dx /= len;
  dz /= len;

  const m = npc.ragdoll.mass();
  const impulse = { x: m * dx * SLAP_HORIZONTAL, y: m * SLAP_UP, z: m * dz * SLAP_HORIZONTAL };
  const torque = {
    x: m * ((rng() * 2 - 1) * 6),
    y: m * ((rng() * 2 - 1) * 4 + 3),
    z: m * ((rng() * 2 - 1) * 6),
  };

  game.hitStop.trigger(nowMs, 60);
  shakeCamera(0.12, 180);
  game.player.slapAt(t.x, t.z);

  npc.body.setEnabled(false);
  npc.slap();
  npc.ragdoll.activate(impulse, torque);
  slaps++;

  playSfx(pickVariant(sfxNames(), 'slap', rng) ?? 'slap-0', { rate: 0.95 + rng() * 0.13 });
}

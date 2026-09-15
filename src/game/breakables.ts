import { Color, Quaternion, SRGBColorSpace, Vector2, Vector3, type Mesh, type Object3D, type Texture } from 'three';
import { playSfx, sfxNames } from '../audio/sfx';
import { registerDebug } from '../debug/testHook';
import { breakSoundFor, dropSoundFor, shardCountFor, shouldBreak, type BreakRole } from '../logic/impact';
import { BENCH_SEED, mulberry32 } from '../logic/rng';
import { pickVariant } from '../logic/sfxNames';
import type { PropRecord, Props } from '../physics/props';
import type { Shards } from '../physics/shards';
import type { GameCtx } from './game';

/**
 * Breakables (D-13, D-15; RESEARCH Pattern 15). Monitors, mugs and plants shatter into pieces of the shared shard kit
 * when a contact force exceeds their threshold; every other dynamic prop only tips, slides and falls, with a drop SFX
 * on a hard landing. Thresholds are in newtons PER KG of the prop (see CONTACT_FORCE_EVENT_THRESHOLD in props.ts):
 * a mug knocked off a 0.76 m desk peaks at ~255 N/kg, a gentle push landing at ~80 N/kg (measured, Rapier 0.20).
 */

export const BREAK_FORCE: Readonly<Record<BreakRole, number>> = Object.freeze({
  mug: 96,
  plantSmall: 112,
  pottedPlant: 144,
  computerScreen: 160,
});

/**
 * ?scenario=smash arms every breakable: until it breaks (or resetAll) it shatters at this fraction of its threshold, so
 * the benchmark reliably breaks all of them even when one lands on a chair seat (measured 10/11 unarmed with 8 NPCs).
 */
export const SMASH_ARMED_FACTOR = 0.5;

/** Minimum force (N/kg) for a drop SFX in play: ~1 m/s landing. Below it a settling prop would clatter constantly. */
export const DROP_MIN_FORCE_PER_KG = 60;

/** ?scenario=smash (T-01-16-03): every dynamic prop gets this horizontal speed range (m/s) and upward pop. */
const SMASH_HORIZONTAL_MIN = 2;
const SMASH_HORIZONTAL_MAX = 3.5;
const SMASH_UP = 3;
/** Extra upward speed for breakables so they come down hard enough to shatter. */
const SMASH_BREAKABLE_UP = 3;

/** Used when the palette texel cannot be read (no image, tainted canvas, no UVs). */
const FALLBACK_COLOR: Readonly<Record<BreakRole, number>> = Object.freeze({
  mug: 0xe9e4da,
  computerScreen: 0x3d4148,
  pottedPlant: 0x5f9147,
  plantSmall: 0x6aa04f,
});

export interface Breakables {
  /** One contact force event (total force in newtons) touching prop `propId`. */
  onContactForce(propId: string, force: number, nowMs: number): void;
  smashAll(rng: () => number): void;
  brokenCount(): number;
  movedCount(): number;
  resetAll(): void;
}

export interface BreakablesOptions {
  onBreak?(rec: PropRecord): void;
  onReset?(): void;
}

function isBreakRole(role: string): role is BreakRole {
  return Object.prototype.hasOwnProperty.call(BREAK_FORCE, role);
}

const texelCache = new Map<Texture, ImageData | null>();

function imageDataOf(tex: Texture): ImageData | null {
  if (texelCache.has(tex)) return texelCache.get(tex)!;
  let data: ImageData | null = null;
  try {
    const img = tex.image as (CanvasImageSource & { width: number; height: number }) | undefined;
    if (img && img.width > 0 && img.height > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const g = canvas.getContext('2d', { willReadFrequently: true });
      if (g) {
        g.drawImage(img, 0, 0);
        data = g.getImageData(0, 0, img.width, img.height);
      }
    }
  } catch {
    data = null;
  }
  texelCache.set(tex, data);
  return data;
}

/**
 * The object's dominant colour: the most common palette texel under its vertices, times the material colour.
 * Kenney kits are palette-textured (material colour is white), so the material colour alone would tint every shard white.
 */
function dominantColour(object: Object3D, fallback: number): Color {
  const counts = new Map<number, number>();
  const uv = new Vector2();
  let tint: Color | null = null;
  object.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const mat = material as { map?: Texture | null; color?: Color };
    if (!tint && mat.color) tint = mat.color;
    const uvAttr = mesh.geometry.getAttribute('uv');
    if (!mat.map || !uvAttr) return;
    const data = imageDataOf(mat.map);
    if (!data) return;
    mat.map.updateMatrix();
    const step = Math.max(1, Math.floor(uvAttr.count / 256));
    for (let i = 0; i < uvAttr.count; i += step) {
      uv.set(uvAttr.getX(i), uvAttr.getY(i));
      mat.map.transformUv(uv);
      const x = Math.min(data.width - 1, Math.max(0, Math.floor(uv.x * data.width)));
      const y = Math.min(data.height - 1, Math.max(0, Math.floor(uv.y * data.height)));
      const k = (y * data.width + x) * 4;
      const key = (data.data[k] << 16) | (data.data[k + 1] << 8) | data.data[k + 2];
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  });
  const out = new Color(fallback);
  let best = -1;
  let bestN = 0;
  for (const [key, n] of counts) {
    if (n > bestN) {
      best = key;
      bestN = n;
    }
  }
  if (best >= 0) out.setRGB(((best >> 16) & 255) / 255, ((best >> 8) & 255) / 255, (best & 255) / 255, SRGBColorSpace);
  const t = tint as Color | null;
  if (best >= 0 && t) out.multiply(t);
  return out;
}

export function createBreakables(ctx: GameCtx, props: Props, shards: Shards, opts: BreakablesOptions = {}): Breakables {
  void ctx;
  /** Seeded: scatter and SFX variant replay identically in a benchmark run (D-08). */
  const rng = mulberry32(BENCH_SEED ^ 0x16);
  const lastDropMs = new Map<PropRecord, number>();
  const colourOf = new Map<string, Color>();
  const centre = new Vector3();
  const rot = new Quaternion();
  const size = new Vector3();
  const vel = { x: 0, y: 0, z: 0 };
  const impulse = { x: 0, y: 0, z: 0 };
  let breaks = 0;
  let drops = 0;
  const armed = new Set<PropRecord>();
  /** Last break for tuning (plan 01-20): which prop, and the force per kg that broke it. */
  const lastBreak = { id: '', role: '', force: 0, armed: false };
  const armedThresholds: Record<BreakRole, number> = { mug: 0, plantSmall: 0, pottedPlant: 0, computerScreen: 0 };
  for (const role of Object.keys(BREAK_FORCE) as BreakRole[]) armedThresholds[role] = BREAK_FORCE[role] * SMASH_ARMED_FACTOR;

  for (const rec of props.list()) {
    if (rec.kind === 'breakable' && isBreakRole(rec.role) && !colourOf.has(rec.role)) {
      colourOf.set(rec.role, dominantColour(rec.object, FALLBACK_COLOR[rec.role]));
    }
  }

  function breakProp(rec: PropRecord, role: BreakRole, perKg: number): void {
    lastBreak.id = rec.id;
    lastBreak.role = role;
    lastBreak.force = Math.round(perKg);
    lastBreak.armed = armed.has(rec);
    const body = rec.body;
    const t = body.translation();
    const r = body.rotation();
    const v = body.linvel();
    vel.x = v.x;
    vel.y = Math.max(0, v.y);
    vel.z = v.z;
    centre.copy(rec.centre).applyQuaternion(rot.set(r.x, r.y, r.z, r.w));
    centre.x += t.x;
    centre.y += t.y;
    centre.z += t.z;
    size.copy(rec.halfExtents).multiplyScalar(2);

    // Disabled, not removed: the collider handle, mass and pooled body stay valid for resetAll (no allocation).
    rec.broken = true;
    armed.delete(rec);
    rec.object.visible = false;
    body.setEnabled(false);
    breaks++;

    shards.emit(centre, size, colourOf.get(role) ?? new Color(FALLBACK_COLOR[role]), shardCountFor(role), vel, rng);
    const family = breakSoundFor(role);
    playSfx(pickVariant(sfxNames(), family, rng) ?? family + '-0', { rate: 0.92 + rng() * 0.16 });
    opts.onBreak?.(rec);
  }

  registerDebug('debris', () => ({
    active: shards.active(),
    cap: shards.cap(),
    broken: props.brokenCount(),
    breaks,
    drops,
    lastBreak: { ...lastBreak },
  }));

  return {
    onContactForce(propId, force, nowMs) {
      const rec = props.get(propId);
      if (!rec || rec.broken) return;
      const mass = rec.mass > 0 ? rec.mass : rec.body.mass();
      if (!(mass > 0) || !Number.isFinite(force)) return;
      const perKg = force / mass;
      if (rec.kind === 'breakable' && isBreakRole(rec.role)) {
        if (shouldBreak(rec.role, perKg, armed.has(rec) ? armedThresholds : BREAK_FORCE)) breakProp(rec, rec.role, perKg);
        return;
      }
      const name = dropSoundFor(rec.role, perKg, lastDropMs.get(rec) ?? Number.NEGATIVE_INFINITY, nowMs, {
        minForce: DROP_MIN_FORCE_PER_KG,
      });
      if (name) {
        lastDropMs.set(rec, nowMs);
        drops++;
        playSfx(name, { gain: 0.7, rate: 0.9 + rng() * 0.2 });
      }
    },
    smashAll(smashRng) {
      for (const rec of props.list()) {
        if (rec.broken) continue;
        const m = rec.mass > 0 ? rec.mass : rec.body.mass();
        const theta = smashRng() * Math.PI * 2;
        const speed = SMASH_HORIZONTAL_MIN + smashRng() * (SMASH_HORIZONTAL_MAX - SMASH_HORIZONTAL_MIN);
        const up = SMASH_UP + (rec.kind === 'breakable' ? SMASH_BREAKABLE_UP : 0);
        impulse.x = Math.cos(theta) * speed * m;
        impulse.y = up * m;
        impulse.z = Math.sin(theta) * speed * m;
        rec.body.applyImpulse(impulse, true);
        if (rec.kind === 'breakable') armed.add(rec);
      }
    },
    brokenCount: () => props.brokenCount(),
    movedCount: () => props.movedCount(),
    /**
     * Soak cycle reset (plan 01-18): live shards retired to their pool, every prop home and at rest, broken props shown
     * again with their disabled body re-enabled. Broken and moved counts are derived from the records (rec.broken,
     * distance from home), so both read 0 afterwards. Nothing is created: the same Object3D, geometry, material and
     * Rapier body come back, so repeated cycles allocate no GPU resources or bodies. `breaks` / `drops` stay
     * cumulative for the whole page (debug counters), the last-break record is cleared.
     */
    resetAll() {
      shards.clearAll();
      props.resetAll();
      lastDropMs.clear();
      armed.clear();
      lastBreak.id = '';
      lastBreak.role = '';
      lastBreak.force = 0;
      lastBreak.armed = false;
      opts.onReset?.();
    },
  };
}

import {
  AnimationMixer,
  Box3,
  Group,
  LinearFilter,
  LoopRepeat,
  MeshLambertMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Material,
  type Mesh,
  type Object3D,
  type SkinnedMesh,
  type Texture,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { registerDebug } from '../debug/testHook';
import { characterTextureUrl } from '../game/assets';
import { buildRigidSkin } from './rigidSkin';

/**
 * Kenney Blocky Characters (D-09): one shared character.glb (6 rigid parts, 27 clips) cloned per character with a
 * per-letter 512² texture on MeshLambertMaterial (RESEARCH "Loading a shared Blocky character", Pitfall 8/9).
 */

/** Named part nodes. Under meshopt quantization each mesh sits on an unnamed child of these nodes (01-05). */
export const CHARACTER_PARTS = ['leg-left', 'leg-right', 'torso', 'arm-left', 'arm-right', 'head'] as const;

export type CharacterMotion = 'idle' | 'walk' | 'attack-melee-right' | 'interact-right';

export interface CharacterAsset {
  scene: Object3D;
  clips: Record<string, AnimationClip>;
}

export interface CharacterInstance {
  /** Local origin = between the feet on the floor; the model faces local +Z. */
  root: Object3D;
  mixer: AnimationMixer;
  /** CHARACTER_PARTS resolved by name, same order. */
  parts: Object3D[];
  /** Shared by every character using the same texture letter. */
  material: MeshLambertMaterial;
  /**
   * The one rendered mesh (plan 01-23, RESEARCH A6): the 6 part meshes merged with one rigid bone per part, so a
   * character is 1 draw call. The original part meshes stay as hidden children (ragdoll sizing, pointer pick).
   */
  skinned: SkinnedMesh;
  /**
   * Crossfade to `name`. Setting the current motion again does nothing, unless `opts.restart` is true: then the clip
   * jumps back to time 0 and plays again (plan 01-24, D-30: a new swing during a swing starts over at once).
   */
  setMotion(name: CharacterMotion, fadeSec?: number, opts?: { restart?: boolean }): void;
  /** The motion last set (__bt.player.motion). */
  motion(): CharacterMotion;
  dispose(): void;
}

/** Rendered height in metres; matches the 1.5 m player capsule (2 × (0.45 + 0.3)). */
export const CHARACTER_HEIGHT = 1.5;
const DEFAULT_FADE = 0.15;
const REQUIRED_CLIPS: readonly CharacterMotion[] = ['idle', 'walk', 'attack-melee-right', 'interact-right'];

const textures = new Map<string, Texture>();
const materials = new Map<string, MeshLambertMaterial>();
/** Model scale and foot offset per parsed asset, measured once from the bind pose. */
const fit = new WeakMap<Object3D, { scale: number; offsetY: number }>();
/** Live characters (spawned and not disposed), for __bt.characters. */
const live = new Set<{ letter: string; skinned: SkinnedMesh }>();
let debugRegistered = false;

function ensureDebug(): void {
  if (debugRegistered) return;
  debugRegistered = true;
  registerDebug('characters', () => ({
    texturesLoaded: textures.size,
    skinnedMeshes: live.size,
    drawsPerCharacter: 1,
    // World bounds of each skin, computed only when the test hook is read (per-vertex bone transform).
    get skin() {
      const out: Array<{ letter: string; centre: [number, number, number]; height: number }> = [];
      for (const c of live) {
        c.skinned.computeBoundingBox();
        const box = new Box3().copy(c.skinned.boundingBox!).applyMatrix4(c.skinned.matrixWorld);
        const centre = box.getCenter(new Vector3());
        out.push({ letter: c.letter, centre: [centre.x, centre.y, centre.z], height: box.max.y - box.min.y });
      }
      return out;
    },
  }));
}

export async function parseCharacterAsset(glb: ArrayBuffer): Promise<CharacterAsset> {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(glb, '');

  const clips: Record<string, AnimationClip> = {};
  for (const c of gltf.animations) clips[c.name] = c;
  for (const name of REQUIRED_CLIPS) {
    if (!clips[name]) throw new Error('character.glb has no clip ' + name);
  }

  const scene = gltf.scene;
  for (const name of CHARACTER_PARTS) {
    if (!scene.getObjectByName(name)) throw new Error('character.glb has no part ' + name);
  }

  // The embedded texture-a material is unlit PBR; every clone gets a Lambert material instead (Pitfall 9).
  const embedded = new Set<Material>();
  scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) embedded.add(m);
  });
  for (const m of embedded) {
    (m as Material & { map?: Texture | null }).map?.dispose();
    m.dispose();
  }

  scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(scene);
  const height = box.max.y - box.min.y;
  if (!Number.isFinite(height) || height <= 0) throw new Error('character.glb has an empty bounding box');
  const scale = CHARACTER_HEIGHT / height;
  fit.set(scene, { scale, offsetY: -box.min.y * scale });

  ensureDebug();
  return { scene, clips };
}

function materialFor(letter: string): MeshLambertMaterial {
  const hit = materials.get(letter);
  if (hit) return hit;
  let map = textures.get(letter);
  if (!map) {
    map = new TextureLoader().load(characterTextureUrl(letter));
    map.colorSpace = SRGBColorSpace;
    map.flipY = false; // glTF UV convention
    // Mirror the GLB sampler: the Blocky UVs sit outside [0, 1] (head V 1.0..1.37, legs U -0.25..0) and rely on
    // REPEAT; TextureLoader's default clamp paints every part with edge texels. LINEAR without mipmaps as authored,
    // which also keeps atlas regions from bleeding into each other and saves VRAM (Pitfall 8).
    map.wrapS = RepeatWrapping;
    map.wrapT = RepeatWrapping;
    map.minFilter = LinearFilter;
    map.generateMipmaps = false;
    map.name = 'character-' + letter;
    textures.set(letter, map);
  }
  const material = new MeshLambertMaterial({ map });
  material.name = 'character-' + letter;
  materials.set(letter, material);
  return material;
}

/** Spawns a character using texture `textureLetter` ('a'..'r'); plays 'idle'. */
export function spawnCharacter(asset: CharacterAsset, textureLetter: string): CharacterInstance {
  if (!/^[a-r]$/.test(textureLetter)) throw new Error('bad character texture letter ' + textureLetter);
  ensureDebug();
  const f = fit.get(asset.scene) ?? { scale: 1, offsetY: 0 };

  const model = SkeletonUtils.clone(asset.scene);
  model.scale.setScalar(f.scale);
  model.position.y = f.offsetY;

  const material = materialFor(textureLetter);
  model.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) mesh.material = material;
  });

  const parts = CHARACTER_PARTS.map((name) => {
    const node = model.getObjectByName(name);
    if (!node) throw new Error('character clone has no part ' + name);
    return node;
  });

  // One draw call per character (plan 01-23). Built in the bind pose, before the mixer touches the parts.
  const skinned = buildRigidSkin(model, CHARACTER_PARTS, material, asset.scene).mesh;
  const liveEntry = { letter: textureLetter, skinned };
  live.add(liveEntry);

  const root = new Group();
  root.name = 'character-' + textureLetter;
  root.add(model);

  const mixer = new AnimationMixer(model);
  const actions = new Map<CharacterMotion, AnimationAction>();
  function action(name: CharacterMotion): AnimationAction {
    let a = actions.get(name);
    if (!a) {
      a = mixer.clipAction(asset.clips[name]);
      a.setLoop(LoopRepeat, Infinity);
      actions.set(name, a);
    }
    return a;
  }

  let current: CharacterMotion = 'idle';
  action('idle').play();

  return {
    root,
    mixer,
    parts,
    material,
    skinned,
    setMotion(name, fadeSec = DEFAULT_FADE, opts) {
      if (name === current) {
        if (opts?.restart) {
          // Same clip again: back to time 0 at full weight, no crossfade (D-30 swing restart).
          // reset() also cancels a fade-in still running on this action.
          action(name).reset().setEffectiveWeight(1).play();
        }
        return;
      }
      const prev = action(current);
      const next = action(name);
      const fade = Number.isFinite(fadeSec) && fadeSec > 0 ? fadeSec : 0;
      next.reset().setEffectiveWeight(1).play();
      if (fade > 0) next.crossFadeFrom(prev, fade, false);
      else prev.stop();
      current = name;
    },
    motion() {
      return current;
    },
    dispose() {
      mixer.stopAllAction();
      for (const a of actions.values()) mixer.uncacheAction(a.getClip(), model);
      mixer.uncacheRoot(model);
      actions.clear();
      root.removeFromParent();
      live.delete(liveEntry);
      skinned.skeleton.dispose(); // this character's bone texture
      // Geometry, textures and materials are shared and cached; they stay alive for other characters.
    },
  };
}

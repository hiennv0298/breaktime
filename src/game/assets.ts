import type { Caps } from '../boot/capabilities';
import { fetchWithProgress, type LoadTask } from '../boot/loading';
import { loadRapier } from '../physics/rapier';
import characterGlbUrl from '../assets/character.glb?url';
import foodGlbUrl from '../assets/food.glb?url';
import officeGlbUrl from '../assets/office.glb?url';

/**
 * Per-character 512² textures (plan 01-05), keyed by letter 'a'..'r'. Only the hashed URLs are bundled here; each
 * texture is fetched lazily when the first character using it spawns, so it is not part of the loading bar.
 */
const CHARACTER_TEXTURE_URLS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../assets/tex/character-*.png', { query: '?url', import: 'default', eager: true }),
  ).flatMap(([path, url]) => {
    const m = /character-([a-z])\.png$/.exec(path);
    return m ? [[m[1], url] as const] : [];
  }),
);

/** Same-origin URL of the character texture for `letter`; throws for a letter that has no texture. */
export function characterTextureUrl(letter: string): string {
  if (!Object.prototype.hasOwnProperty.call(CHARACTER_TEXTURE_URLS, letter)) {
    throw new Error('no character texture ' + letter);
  }
  return CHARACTER_TEXTURE_URLS[letter];
}

/** Letters with a texture, sorted ('a', 'b', …). */
export function characterTextureLetters(): string[] {
  return Object.keys(CHARACTER_TEXTURE_URLS).sort();
}

/**
 * Everything the game needs before "Chơi". The GLBs are only fetched here (ArrayBuffers, no three.js in this
 * chunk); they are parsed after the play gesture together with the renderer. office-index.json is bundled.
 */
export function gameLoadTasks(caps: Caps): LoadTask[] {
  return [
    {
      id: 'rapier',
      weight: 70,
      run: () => loadRapier(caps.simd),
    },
    {
      id: 'office',
      weight: 10,
      run: (report) => fetchWithProgress(officeGlbUrl, report),
    },
    {
      id: 'food',
      weight: 3,
      run: (report) => fetchWithProgress(foodGlbUrl, report),
    },
    {
      // One shared Blocky character (geometry + 27 clips); every player/NPC is a clone with its own texture (D-09).
      id: 'character',
      weight: 5,
      run: (report) => fetchWithProgress(characterGlbUrl, report),
    },
  ];
}

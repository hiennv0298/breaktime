import type { Caps } from '../boot/capabilities';
import { fetchWithProgress, type LoadTask } from '../boot/loading';
import { loadRapier } from '../physics/rapier';
import foodGlbUrl from '../assets/food.glb?url';
import officeGlbUrl from '../assets/office.glb?url';

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
  ];
}

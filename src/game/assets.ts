import type { Caps } from '../boot/capabilities';
import type { LoadTask } from '../boot/loading';
import { loadRapier } from '../physics/rapier';

/** Everything the game needs before "Chơi". Later plans append tasks (office GLB, SFX, ...). */
export function gameLoadTasks(caps: Caps): LoadTask[] {
  return [
    {
      id: 'rapier',
      weight: 70,
      run: () => loadRapier(caps.simd),
    },
  ];
}

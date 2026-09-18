import { NPC_SETTINGS_KEY } from '../logic/npcSettings';

/**
 * Legacy localStorage access for the NPC settings (plan 01-26, D-29). Reads bt.npcs v1 for one-way migration only
 * (plan 02-04, G4). This module never writes: the new bt.roster key is written only by rosterStore.ts.
 */

/** Raw legacy stored string ('bt.npcs'); storageOk false when reading threw. */
export function readNpcSettingsRaw(): { raw: string | null; storageOk: boolean } {
  try {
    return { raw: window.localStorage.getItem(NPC_SETTINGS_KEY), storageOk: true };
  } catch {
    return { raw: null, storageOk: false };
  }
}

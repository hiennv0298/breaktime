import { NPC_SETTINGS_KEY, serializeNpcSettings, type NpcSettings } from '../logic/npcSettings';

/**
 * localStorage access for the NPC settings (plan 01-26, D-29). Every access sits in try/catch (portal rule,
 * T-01-26-05): incognito, disabled storage or a full quota never break the game. The names stay on this device — this
 * module is the only place they are persisted and nothing here (or anywhere) sends them over the network (D-31).
 */

/** Raw stored string ('bt.npcs'); storageOk false when reading threw. */
export function readNpcSettingsRaw(): { raw: string | null; storageOk: boolean } {
  try {
    return { raw: window.localStorage.getItem(NPC_SETTINGS_KEY), storageOk: true };
  } catch {
    return { raw: null, storageOk: false };
  }
}

/** Stores the normalised settings; false when storage throws (the settings still apply for this session). */
export function writeNpcSettings(s: NpcSettings): boolean {
  try {
    window.localStorage.setItem(NPC_SETTINGS_KEY, serializeNpcSettings(s));
    return true;
  } catch {
    return false;
  }
}

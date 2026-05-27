import AsyncStorage from '@react-native-async-storage/async-storage';
import type {Preset} from './types';

const PRESETS_KEY = 'sn_restyle_presets';
const PRESET_COUNT = 4;

const emptyPresets = (): (Preset | null)[] => Array(PRESET_COUNT).fill(null);

export async function loadPresets(): Promise<(Preset | null)[]> {
  try {
    const raw = await AsyncStorage.getItem(PRESETS_KEY);
    if (!raw) return emptyPresets();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== PRESET_COUNT) return emptyPresets();
    return parsed;
  } catch {
    return emptyPresets();
  }
}

export async function savePresets(presets: (Preset | null)[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // Presets are a convenience — fail silently rather than surfacing a storage error
  }
}

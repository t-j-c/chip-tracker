import { create } from 'zustand';

const STORAGE_KEY = 'dmi.settings';

export interface Settings {
  soundOn: boolean;
  hapticsOn: boolean;
  reduceMotion: boolean;
}

const DEFAULTS: Settings = { soundOn: true, hapticsOn: true, reduceMotion: false };

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function save(settings: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode / storage full: settings just won't persist.
  }
}

export interface SettingsStore extends Settings {
  toggle: (key: keyof Settings) => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...load(),
  toggle: (key) => {
    const { soundOn, hapticsOn, reduceMotion } = get();
    const next: Settings = { soundOn, hapticsOn, reduceMotion, [key]: !get()[key] };
    save(next);
    set(next);
  },
}));

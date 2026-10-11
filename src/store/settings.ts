// User settings, persisted separately from the game save so a corrupt save never loses them
// (and the other way round).
import { create } from "zustand";

import type { LangSetting } from "@/i18n";
import { readText, writeText } from "@/platform/storage";

const FILE = "settings.json";

export type NumberFormat = "suffix" | "sci";
export type PanelThemeId = "day" | "night";

export interface Settings {
  language: LangSetting;
  haptics: boolean;
  sfx: boolean;
  music: boolean;
  sfxVolume: number; // 0..1
  musicVolume: number; // 0..1
  reduceMotion: boolean;
  batterySaver: boolean; // 30 fps
  theme: PanelThemeId;
  numberFormat: NumberFormat;
  keepAwake: boolean;
  notifications: boolean;
  notifyCargo: boolean;
  notifyRepair: boolean;
  notifyAttention: boolean;
  notifyDaily: boolean;
  backupReminder: boolean;
  /** Debug panel unlocked by tapping the logo seven times. */
  debug: boolean;
  perfHud: boolean;
  tutorialDone: boolean;
  /** Mode of the save that was played last: the menu's "continue" opens it. */
  lastMode: string;
}

export const DEFAULT_SETTINGS: Settings = {
  language: "system",
  haptics: true,
  sfx: true,
  music: true,
  sfxVolume: 0.8,
  musicVolume: 0.35,
  reduceMotion: false,
  batterySaver: false,
  theme: "day",
  numberFormat: "suffix",
  keepAwake: false,
  notifications: false,
  notifyCargo: true,
  notifyRepair: true,
  notifyAttention: true,
  notifyDaily: false,
  backupReminder: true,
  debug: false,
  perfHud: false,
  tutorialDone: false,
  lastMode: "story",
};

function load(): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  try {
    const raw = readText(FILE);
    if (!raw) return out;
    const saved = JSON.parse(raw) as Record<string, unknown>;
    const target = out as unknown as Record<string, unknown>;
    // Only accept known keys with the right type, so a damaged file cannot break the UI.
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      const def = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[key];
      const val = saved[key];
      if (typeof val === typeof def && !(typeof val === "number" && !Number.isFinite(val))) target[key] = val;
    }
    out.sfxVolume = Math.min(1, Math.max(0, out.sfxVolume));
    out.musicVolume = Math.min(1, Math.max(0, out.musicVolume));
    if (!["system", "cs", "en"].includes(out.language)) out.language = "system";
    if (out.theme !== "day" && out.theme !== "night") out.theme = "day";
    if (out.numberFormat !== "suffix" && out.numberFormat !== "sci") out.numberFormat = "suffix";
  } catch (e) {
    console.warn("settings load", e);
  }
  return out;
}

interface SettingsStore extends Settings {
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
  reset(): void;
}

function pick(s: SettingsStore): Settings {
  const out = {} as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS)) out[key] = (s as unknown as Record<string, unknown>)[key];
  return out as unknown as Settings;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...load(),
  set: (key, value) => {
    set({ [key]: value } as Partial<SettingsStore>);
    writeText(FILE, JSON.stringify(pick(get())));
  },
  reset: () => {
    set({ ...DEFAULT_SETTINGS });
    writeText(FILE, JSON.stringify(DEFAULT_SETTINGS));
  },
}));

export const getSettings = (): Settings => pick(useSettings.getState());

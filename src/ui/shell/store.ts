// Transient shell state shared by the game screen, the overlays and the engine-event fan-out.
// Nothing here is saved. Per-frame values are Reanimated mutables so they never re-render React.
import { makeMutable } from "react-native-reanimated";
import { create } from "zustand";

import type { OfflineReport } from "@/engine/types";
import type { ViewportHandle } from "@/render/types";

export interface KippEntry {
  key: number;
  text: string;
}

const KIPP_KEEP = 8;
let kippKey = 1;

interface ShellStore {
  /** Newest first. */
  kipp: KippEntry[];
  pushKipp(text: string): void;
  kippOpen: boolean;
  setKippOpen(open: boolean): void;
  offline: OfflineReport | null;
  setOffline(report: OfflineReport | null): void;
  rescueOpen: boolean;
  setRescueOpen(open: boolean): void;
  safeBanner: boolean;
  setSafeBanner(show: boolean): void;
  intro: boolean;
  setIntro(show: boolean): void;
  /** The ending prompt was postponed for this session. */
  endingLater: boolean;
  setEndingLater(later: boolean): void;
  /** A crew log arrived that the player has not opened the Log tab for yet. */
  newLog: boolean;
  setNewLog(flag: boolean): void;
  /** App is in the foreground. */
  active: boolean;
  setActive(active: boolean): void;
}

export const useShell = create<ShellStore>((set) => ({
  kipp: [],
  pushKipp: (text) => set((s) => (s.kipp[0]?.text === text ? s : { kipp: [{ key: kippKey++, text }, ...s.kipp].slice(0, KIPP_KEEP) })),
  kippOpen: false,
  setKippOpen: (kippOpen) => set({ kippOpen }),
  offline: null,
  setOffline: (offline) => set({ offline }),
  rescueOpen: false,
  setRescueOpen: (rescueOpen) => set({ rescueOpen }),
  safeBanner: false,
  setSafeBanner: (safeBanner) => set({ safeBanner }),
  intro: false,
  setIntro: (intro) => set({ intro }),
  endingLater: false,
  setEndingLater: (endingLater) => set({ endingLater }),
  newLog: false,
  setNewLog: (newLog) => set({ newLog }),
  active: true,
  setActive: (active) => set({ active }),
}));

/** LED levels (0..1) the fan-out flashes and the status strip shows. */
export const leds = {
  sale: makeMutable(0),
  alert: makeMutable(0),
  kipp: makeMutable(0),
};

/** Frame time reported by the viewport, for the perf HUD. */
export const viewportPerf = { frameMs: 0, draws: 0 };

/** Where the viewport sits on screen and the last tap inside it (window coordinates). */
export const viewportBox = { width: 0, height: 0, tapX: 0, tapY: 0, tapAt: 0 };

let handle: ViewportHandle | null = null;

export function setViewportHandle(h: ViewportHandle | null): void {
  handle = h;
}

/** Imperative viewport effects; silently ignored while no viewport is mounted. */
export const fx: ViewportHandle = {
  burst: (kind, x, y) => {
    try {
      handle?.burst(kind, x, y);
    } catch {
      // effects are decoration
    }
  },
  shake: (amount) => {
    try {
      handle?.shake(amount);
    } catch {
      // effects are decoration
    }
  },
  flash: (color, ms) => {
    try {
      handle?.flash(color, ms);
    } catch {
      // effects are decoration
    }
  },
};

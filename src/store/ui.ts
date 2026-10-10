// Transient UI state shared between the shell and the tab screens (not persisted).
import { create } from "zustand";

export const TAB_IDS = ["ship", "craft", "grid", "nav", "crew", "meta", "log", "settings"] as const;
export type TabId = (typeof TAB_IDS)[number];

interface UiStore {
  tab: TabId;
  /** Optional deep link inside a tab (for example "research", "prestige", "codex", "station"). */
  section: string | null;
  /** Bumped when the same tab/section is requested again, so screens can scroll to top. */
  nonce: number;
  setTab(tab: TabId, section?: string | null): void;
  /** True while a full-screen overlay covers the viewport (the render loop pauses). */
  viewportCovered: boolean;
  setViewportCovered(covered: boolean): void;
}

export const useUi = create<UiStore>((set) => ({
  tab: "ship",
  section: null,
  nonce: 0,
  setTab: (tab, section = null) => set((s) => ({ tab, section, nonce: s.nonce + 1 })),
  viewportCovered: false,
  setViewportCovered: (viewportCovered) => set({ viewportCovered }),
}));

/** Navigate from anywhere (goals strip, toasts, engine event handlers). */
export const goTo = (tab: TabId, section?: string | null): void => useUi.getState().setTab(tab, section);

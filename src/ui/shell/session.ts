// Entering and leaving a play session from the main menu.
import { getGame, getMode, startLoop, startNewGame, stopLoop, bootGame, type GameMode } from "@/store/game";
import { applySandbox } from "@/store/sandbox";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";

import { useShell } from "./store";

function resetShell(): void {
  useShell.setState({ kipp: [], kippOpen: false, offline: null, rescueOpen: false, intro: false, endingLater: false, epilogue: false, newLog: false, tutorial: -1 });
  useUi.getState().setTab("ship");
}

function enter(mode: GameMode): void {
  useSettings.getState().set("lastMode", mode);
  useShell.getState().setMenu(false);
  startLoop();
}

/** Continues the save of the given mode (loads it if the other mode is currently in memory). */
export function continueGame(mode: GameMode): void {
  if (getMode() !== mode) {
    resetShell();
    const result = bootGame(Date.now(), mode);
    if (result.offline) useShell.getState().setOffline(result.offline);
  }
  enter(mode);
}

/** Starts over in the given mode. The story gets its intro and tutorial again; the sandbox gets neither. */
export function beginNewGame(mode: GameMode): void {
  resetShell();
  startNewGame(mode, mode === "sandbox" ? applySandbox : undefined);
  if (mode === "story") useSettings.getState().set("tutorialDone", false);
  enter(mode);
}

/** Saves, stops the engine and shows the main menu. */
export function backToMenu(): void {
  stopLoop(true);
  useShell.getState().setMenu(true);
}

export const currentIsSandbox = (): boolean => getGame().state.flags.sandbox > 0;

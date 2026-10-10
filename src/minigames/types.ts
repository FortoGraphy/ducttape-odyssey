// Contract between mini-games and their host. Owned by the orchestrator.
// Rules for every game: one thumb, portrait, 30-90 s, three tiers, works in "lite" builds
// (React Native views + Reanimated + gesture-handler + react-native-svg only, NEVER Skia),
// per-frame values in Reanimated shared values (no React state per frame), haptic-coupled via
// src/platform/feedback, all text bilingual, deterministic layout from `seed`.
import type { ComponentType } from "react";

import type { L10n, MinigameId, MinigameResult, MinigameTier } from "@/engine/types";

export interface MinigameProps {
  tier: MinigameTier;
  /** Deterministic puzzle/layout seed. */
  seed: number;
  /** Play area in points. The host has already applied safe-area insets. */
  width: number;
  height: number;
  reduceMotion: boolean;
  /** Call exactly once when the game ends (win, lose or timeout). */
  onFinish(result: MinigameResult): void;
}

export interface MinigameMeta {
  id: MinigameId;
  name: L10n;
  /** One-line how-to shown on the intro card. */
  hint: L10n;
  icon: string;
  /** Time limit in seconds per tier. */
  seconds: [number, number, number];
}

export interface MinigameEntry {
  meta: MinigameMeta;
  /** Lazy so a game's code is only evaluated when first played. */
  load(): ComponentType<MinigameProps>;
}

export type MinigameRegistry = Record<MinigameId, MinigameEntry>;

/** Shared scoring helper: maps a 0..1 score to the result object. */
export function makeResult(score: number, startedAtMs: number): MinigameResult {
  const s = Math.max(0, Math.min(1, score));
  return { score: s, success: s >= 0.5, perfect: s >= 0.95, durationMs: Date.now() - startedAtMs };
}

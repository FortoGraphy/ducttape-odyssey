// Haptic and sound vocabulary shared by the whole UI. Every interactive element calls these
// instead of expo-haptics / expo-audio directly. Sound playback is provided by src/audio, which
// registers a backend at startup; until then sfx() is a no-op.
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export type HapticKind = "key" | "tap" | "detent" | "success" | "warning" | "error" | "impact" | "heavy";

/** One file per id in assets/audio/sfx (see scripts/audio). Keep in sync with src/audio. */
export const SFX_IDS = [
  "keyDown",
  "keyUp",
  "knobTick",
  "toggle",
  "tab",
  "uiOpen",
  "uiClose",
  "buy",
  "buyMax",
  "milestone",
  "deny",
  "coin",
  "collect",
  "craftStart",
  "craftDone",
  "moduleInstall",
  "moduleBreak",
  "repairTick",
  "repairDone",
  "weld",
  "zap",
  "tape",
  "valve",
  "beepGood",
  "beepBad",
  "stepHit",
  "stepMiss",
  "laser",
  "explosion",
  "impact",
  "alarm",
  "alert",
  "notify",
  "jumpCharge",
  "jumpGo",
  "arrive",
  "scanPing",
  "discovery",
  "eventOpen",
  "choice",
  "success",
  "fail",
  "overdrive",
  "overheat",
  "levelUp",
  "achievement",
  "chapter",
  "kippBlip",
  "dock",
  "thruster",
  "towArrive",
  "prestige",
] as const;
export type SfxId = (typeof SFX_IDS)[number];

export interface SfxOptions {
  volume?: number; // 0..1 relative
  rate?: number; // playback rate for pitch variation
}

type SfxBackend = (id: SfxId, opts?: SfxOptions) => void;

const settings = { haptics: true, sfx: true };
let backend: SfxBackend | null = null;

// Rate limits so rapid input never turns into a buzz.
const MIN_GAP_MS: Record<HapticKind, number> = { key: 35, tap: 35, detent: 28, success: 150, warning: 250, error: 250, impact: 90, heavy: 160 };
const lastAt: Partial<Record<HapticKind, number>> = {};
let lastAny = 0;

export function configureFeedback(next: Partial<typeof settings>): void {
  Object.assign(settings, next);
}

export function registerSfxBackend(fn: SfxBackend | null): void {
  backend = fn;
}

export function haptic(kind: HapticKind): void {
  if (!settings.haptics || Platform.OS === "web") return;
  const now = Date.now();
  if (now - (lastAt[kind] ?? 0) < MIN_GAP_MS[kind] || now - lastAny < 20) return;
  lastAt[kind] = now;
  lastAny = now;
  try {
    switch (kind) {
      case "key":
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(noop);
        break;
      case "tap":
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(noop);
        break;
      case "detent":
        Haptics.selectionAsync().catch(noop);
        break;
      case "impact":
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(noop);
        break;
      case "heavy":
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(noop);
        break;
      case "success":
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(noop);
        break;
      case "warning":
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(noop);
        break;
      case "error":
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(noop);
        break;
    }
  } catch {
    // haptics must never break gameplay
  }
}

export function sfx(id: SfxId, opts?: SfxOptions): void {
  if (!settings.sfx || !backend) return;
  try {
    backend(id, opts);
  } catch {
    // audio must never break gameplay
  }
}

/** Convenience for the most common pairing. */
export function press(): void {
  haptic("key");
  sfx("keyDown");
}

function noop(): void {}

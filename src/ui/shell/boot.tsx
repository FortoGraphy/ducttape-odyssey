// Boot helpers for the root layout: the guarded game boot, platform services that follow the
// settings, app-state handling (save, notifications, offline catch-up) and the root error boundary
// with its recovery screen. Every step is wrapped: a failure in one never hides the game.
import * as Clipboard from "expo-clipboard";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { Component, useEffect, useState, type ReactNode } from "react";
import { AppState, Platform, Pressable, ScrollView, Text, View } from "react-native";

import { exportCode } from "@/engine/core";
import { planNotifications } from "@/engine/meta";
import { applyLanguage, t, tr } from "@/i18n";
import { recordError, setSafeModePreference, suspendLaunchCheck } from "@/platform/crashGuard";
import { configureFeedback } from "@/platform/feedback";
import { clearScheduled, scheduleAll } from "@/platform/notifications";
import { setRuntimeRenderOverride } from "@/render/mode";
import { allowSaving, bootGame, getGame, hasGame, modeHasSave, resumeLoop, startLoop, stopLoop, type BootResult, type GameMode } from "@/store/game";
import { getSettings, useSettings } from "@/store/settings";
import { fonts } from "@/ui/fonts";
import { Dialog, setReduceMotion, toast } from "@/ui/kit";
import { MAX_FONT_SCALE, palette } from "@/ui/theme";

import { musicEnabled, musicVolume, sfxVolume, startAudio } from "./audio";
import { useShell } from "./store";

const KEEP_AWAKE_TAG = "ducttape-game";

export function guard<T>(label: string, fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (e) {
    console.warn(`boot: ${label} failed`, e);
    return fallback;
  }
}

// ---------- game boot ---------------------------------------------------------------------

let booted: BootResult | null = null;

/** Loads the save (or starts a new game) and starts the loop. Idempotent, never throws. */
export function ensureBooted(): BootResult {
  if (booted) return booted;
  // The save played last is loaded behind the main menu, so settings work there and "continue" is instant.
  const last: GameMode = useSettings.getState().lastMode === "sandbox" && modeHasSave("sandbox") ? "sandbox" : "story";
  const result = guard("game", () => bootGame(Date.now(), last), { fresh: true, recoveredFromBackup: false, saveUnreadable: false, offline: null } as BootResult);
  if (!hasGame()) guard("game retry", () => bootGame(Date.now(), last), result);
  booted = result;
  if (!useShell.getState().menu) guard("loop", () => startLoop(), undefined);
  if (result.offline) useShell.getState().setOffline(result.offline);
  return result;
}

/** True once the real game (not a dev preset) was booted by ensureBooted. */
export const isRealBoot = (): boolean => booted !== null;

// ---------- settings-driven services ----------------------------------------------------------

/** Keeps language, feedback, motion, audio and keep-awake in step with the settings store. */
export function useServices(): void {
  const language = useSettings((s) => s.language);
  const haptics = useSettings((s) => s.haptics);
  const sfxOn = useSettings((s) => s.sfx);
  const music = useSettings((s) => s.music);
  const sfxVol = useSettings((s) => s.sfxVolume);
  const musicVol = useSettings((s) => s.musicVolume);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const keepAwake = useSettings((s) => s.keepAwake);

  useEffect(() => {
    guard("language", () => applyLanguage(language), undefined);
  }, [language]);
  useEffect(() => {
    guard("feedback", () => configureFeedback({ haptics, sfx: sfxOn }), undefined);
  }, [haptics, sfxOn]);
  useEffect(() => {
    guard("motion", () => setReduceMotion(reduceMotion), undefined);
  }, [reduceMotion]);
  useEffect(() => {
    const s = getSettings();
    startAudio({ sfxVolume: s.sfxVolume, musicVolume: s.musicVolume, musicEnabled: s.music });
  }, []);
  useEffect(() => musicEnabled(music), [music]);
  useEffect(() => musicVolume(musicVol), [musicVol]);
  useEffect(() => sfxVolume(sfxVol), [sfxVol]);
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (keepAwake) activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    else deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
  }, [keepAwake]);
}

// ---------- app state -----------------------------------------------------------------------

function scheduleNotifications(): void {
  const s = getSettings();
  if (!s.notifications || !hasGame()) return;
  const allowed: Record<string, boolean> = { cargo: s.notifyCargo, repair: s.notifyRepair, attention: s.notifyAttention, rescue: s.notifyAttention, expedition: s.notifyAttention, quests: s.notifyDaily };
  const plan = planNotifications(getGame())
    .filter((n) => allowed[n.id] !== false)
    .map((n) => ({ id: n.id, inSeconds: n.inSeconds, title: tr(n.title), body: tr(n.body) }));
  scheduleAll(plan).catch(() => {});
}

/** Background: save, stop ticking, plan notifications. Foreground: clear them and catch up. */
export function useAppLifecycle(): void {
  useEffect(() => {
    let state = AppState.currentState;
    const sub = AppState.addEventListener("change", (next) => {
      const wasActive = state === "active";
      state = next;
      if (next === "active") {
        useShell.getState().setActive(true);
        if (!isRealBoot()) return;
        guard("notifications clear", () => clearScheduled().catch(() => {}), undefined);
        if (!useShell.getState().menu) guard("resume", () => resumeLoop(), null);
      } else if (wasActive) {
        useShell.getState().setActive(false);
        guard("launch check", () => suspendLaunchCheck(), undefined);
        if (!isRealBoot()) return;
        guard("stop", () => stopLoop(), undefined);
        guard("notifications", scheduleNotifications, undefined);
      }
    });
    return () => sub.remove();
  }, []);
}

// ---------- boot notices ------------------------------------------------------------------

/** Tells the player about a save that could not be read, or one restored from a backup. */
export function BootNotices({ result }: { result: BootResult | null }) {
  const [unreadable, setUnreadable] = useState(result?.saveUnreadable === true);
  useEffect(() => {
    if (result?.recoveredFromBackup) toast(t("world:boot.recovered") as string, { tone: "warn", icon: "save", duration: 6000 });
  }, [result]);
  return (
    <Dialog
      visible={unreadable}
      title={t("world:boot.unreadableTitle") as string}
      body={t("world:boot.unreadableBody") as string}
      icon="warning"
      tone="bad"
      testID="save-unreadable"
      choices={[
        {
          label: t("world:boot.startNew") as string,
          sublabel: t("world:boot.startNewSub") as string,
          tone: "orange",
          onPress: () => {
            allowSaving();
            setUnreadable(false);
          },
        },
        {
          label: t("world:boot.retry") as string,
          tone: "black",
          onPress: () => {
            guard("reload", () => {
              stopLoop(false);
              const again = bootGame();
              startLoop();
              if (!again.saveUnreadable) {
                setUnreadable(false);
                if (again.offline) useShell.getState().setOffline(again.offline);
              } else {
                toast(t("world:boot.stillBroken") as string, "bad");
              }
            }, undefined);
          },
        },
      ]}
    />
  );
}

// ---------- root error boundary -----------------------------------------------------------------

function RecoveryKey({ label, primary, onPress, testID }: { label: string; primary?: boolean; onPress(): void; testID: string }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({ minHeight: 50, borderRadius: 7, backgroundColor: primary ? palette.orange : "#191B21", borderBottomWidth: 3, borderBottomColor: primary ? palette.rust1 : "#08090C", alignItems: "center", justifyContent: "center", paddingHorizontal: 12, opacity: pressed ? 0.8 : 1, transform: [{ translateY: pressed ? 2 : 0 }] })}
    >
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: fonts.monoBold, fontSize: 12, letterSpacing: 0.6, color: primary ? "#15171C" : palette.bone2, textTransform: "uppercase", textAlign: "center" }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Plain React Native on purpose: it must render even when the kit or the theme is what broke. */
function RecoveryScreen({ error, onRetry }: { error: string; onRetry(): void }) {
  const [note, setNote] = useState("");
  const w = (key: string): string => guard("text", () => t(`world:recovery.${key}`) as string, key);
  const copy = () => {
    try {
      if (!hasGame()) {
        setNote(w("noSave"));
        return;
      }
      Clipboard.setStringAsync(exportCode(getGame().state)).then(
        () => setNote(w("copied")),
        () => setNote(w("copyFailed")),
      );
    } catch {
      setNote(w("copyFailed"));
    }
  };
  const safe = () => {
    guard("safe mode", () => {
      setSafeModePreference("safe");
      setRuntimeRenderOverride("lite");
      useShell.getState().setSafeBanner(true);
    }, undefined);
    onRetry();
  };
  return (
    <View testID="recovery" style={{ flex: 1, backgroundColor: palette.void0, paddingTop: 64, paddingBottom: 34, paddingHorizontal: 16 }}>
      <View style={{ flex: 1, backgroundColor: palette.bone1, borderRadius: 14, borderTopWidth: 2, borderTopColor: palette.bone2, borderBottomWidth: 3, borderBottomColor: palette.bone0, padding: 16, gap: 12 }}>
        <View style={{ backgroundColor: "#0B100E", borderRadius: 5, padding: 10, borderWidth: 2, borderColor: "#15171C" }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: fonts.lcd, fontSize: 22, lineHeight: 28, color: palette.orange }}>
            ERR 0x1F
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: fonts.lcdDim, fontSize: 12, lineHeight: 16, color: "#C9F5D5" }}>
            {w("lcd")}
          </Text>
        </View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: fonts.pixelBold, fontSize: 22, lineHeight: 28, color: "#15171C" }}>
          {w("title")}
        </Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: fonts.mono, fontSize: 13, lineHeight: 19, color: "#15171C" }}>
          {w("body")}
        </Text>
        <ScrollView style={{ flex: 1, backgroundColor: "#D6D2C5", borderRadius: 6 }} contentContainerStyle={{ padding: 8 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: fonts.mono, fontSize: 10, lineHeight: 14, color: "#5A5E69" }}>
            {error}
          </Text>
        </ScrollView>
        {note ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: fonts.monoMedium, fontSize: 11, lineHeight: 15, color: "#1F7A3F" }}>
            {note}
          </Text>
        ) : null}
        <RecoveryKey testID="recovery-retry" label={w("retry")} primary onPress={onRetry} />
        <RecoveryKey testID="recovery-safe" label={w("safe")} onPress={safe} />
        <RecoveryKey testID="recovery-copy" label={w("copy")} onPress={copy} />
      </View>
    </View>
  );
}

export class RootBoundary extends Component<{ children: ReactNode }, { error: string | null; attempt: number }> {
  state: { error: string | null; attempt: number } = { error: null, attempt: 0 };
  static getDerivedStateFromError(error: unknown): { error: string } {
    return { error: String((error as Error)?.message ?? error).slice(0, 600) };
  }
  componentDidCatch(error: unknown): void {
    console.warn("root boundary", error);
    recordError(error);
  }
  render(): ReactNode {
    if (this.state.error !== null) return <RecoveryScreen error={this.state.error} onRetry={() => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }))} />;
    return <View key={this.state.attempt} style={{ flex: 1 }}>{this.props.children}</View>;
  }
}

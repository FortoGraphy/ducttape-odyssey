// Smaller overlays: first-run intro with the optional rename, KIPP's recent lines, the weekly
// backup reminder, the Safe Mode banner and the perf HUD.
import { memo, useCallback, useEffect, useState } from "react";
import { Platform, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useT } from "@/i18n";
import { setSafeModePreference } from "@/platform/crashGuard";
import { haptic, sfx } from "@/platform/feedback";
import { act, getGame, hasGame, perf, useGame } from "@/store/game";
import { useSettings } from "@/store/settings";
import { goTo } from "@/store/ui";
import { Dialog, Icon, IconKey, Key, KeyRow, Lcd, LcdText, Led, MicroLabel, Panel, Sheet, Sticker, Txt, Well, toast, useTheme } from "@/ui/kit";
import { fonts } from "@/ui/fonts";
import { palette, space } from "@/ui/theme";

import { useShell, viewportPerf } from "../store";

type TFn = (key: string, vars?: Record<string, unknown>) => string;

const NAME_MAX = 20;
const WEEK_MS = 7 * 24 * 3600 * 1000;
export const INTRO_FLAG = "introSeen";

function cleanName(raw: string, fallback: string): string {
  // letters, digits, spaces and plain punctuation only: the name is printed in the pixel fonts
  const s = raw.replace(/[^\p{L}\p{N} .,'\-]/gu, "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  return s.length > 0 ? s : fallback;
}

/** True when this save has never seen the intro and is still in its first minutes. */
export function introPending(): boolean {
  if (!hasGame()) return false;
  const s = getGame().state;
  return !(s.flags[INTRO_FLAG] >= 1) && s.played < 300 && !(s.stats.purchases > 0);
}

export const Intro = memo(function Intro() {
  const t = useT("story") as TFn;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const close = useShell((s) => s.setIntro);
  const [page, setPage] = useState(0);
  const [name, setName] = useState(() => getGame().state.player.name);
  const [ship, setShip] = useState(() => getGame().state.player.ship);

  const finish = useCallback(
    (rename: boolean) => {
      act((g) => {
        // the save has no action for these two: they are labels, not game rules
        if (rename) {
          g.state.player.name = cleanName(name, g.state.player.name);
          g.state.player.ship = cleanName(ship, g.state.player.ship);
        }
        g.state.flags[INTRO_FLAG] = 1;
      });
      sfx("success");
      haptic("success");
      close(false);
    },
    [name, ship, close],
  );

  const input = { fontFamily: fonts.monoBold, fontSize: 15, color: theme.ink, paddingVertical: 8, paddingHorizontal: 10, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null) };
  const last = page === 3;

  return (
    <View testID="intro" style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(5,6,10,0.94)", paddingTop: insets.top + space.lg, paddingBottom: Math.max(space.md, insets.bottom) + space.sm, paddingHorizontal: space.md, justifyContent: "flex-end", gap: space.md }]} onStartShouldSetResponder={() => true}>
      <View style={{ flex: 1, justifyContent: "center", gap: space.md }}>
        {page === 0 ? (
          <>
            <Lcd padding={10} gap={4}>
              <LcdText size="s" tone="dim" upper>
                {t("intro.cryoKicker")}
              </LcdText>
              <LcdText size="l">{t("intro.cryoLcd")}</LcdText>
              <LcdText size="s" tone="warn" marquee>
                {t("intro.cryoWarn")}
              </LcdText>
            </Lcd>
            <Txt variant="body" color={palette.bone1}>
              {t("intro.cryoText")}
            </Txt>
          </>
        ) : null}
        {page === 1 ? (
          <>
            <View style={{ alignSelf: "center", backgroundColor: palette.yellow, paddingHorizontal: space.lg, paddingVertical: space.lg, transform: [{ rotate: "-3deg" }], borderRadius: 2, maxWidth: 280 }}>
              <View style={{ position: "absolute", top: -9, alignSelf: "center", width: 74, height: 18, backgroundColor: palette.bone0, opacity: 0.85, transform: [{ rotate: "2deg" }] }} />
              <Txt align="center" style={{ fontFamily: fonts.pixelBold, fontSize: 24, lineHeight: 30, color: "#15171C" }}>
                {t("intro.note")}
              </Txt>
              <Txt variant="label" align="center" color="#3A3D45" style={{ marginTop: space.sm }}>
                {t("intro.noteSign")}
              </Txt>
            </View>
            <Txt variant="body" color={palette.bone1}>
              {t("intro.noteText")}
            </Txt>
          </>
        ) : null}
        {page === 2 ? (
          <Panel screws padding={space.md} gap={space.sm}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <Icon name="kipp" size={32} chip />
              <View style={{ flex: 1 }}>
                <Txt variant="heading">KIPP</Txt>
                <MicroLabel>{t("intro.kippRole")}</MicroLabel>
              </View>
              <Led state="blink" color="orange" size={7} />
            </View>
            <Txt variant="body">{t("intro.kippLine")}</Txt>
          </Panel>
        ) : null}
        {last ? (
          <Panel screws padding={space.md} gap={space.sm} title={t("intro.badgeTitle")}>
            <MicroLabel size="label">{t("intro.nameLabel")}</MicroLabel>
            <Well padding={0}>
              <TextInput testID="intro-name" value={name} onChangeText={setName} maxLength={NAME_MAX} autoCorrect={false} autoCapitalize="words" returnKeyType="done" style={input} placeholderTextColor={theme.inkDim} accessibilityLabel={t("intro.nameLabel")} />
            </Well>
            <MicroLabel size="label">{t("intro.shipLabel")}</MicroLabel>
            <Well padding={0}>
              <TextInput testID="intro-ship" value={ship} onChangeText={setShip} maxLength={NAME_MAX} autoCorrect={false} autoCapitalize="words" returnKeyType="done" style={input} placeholderTextColor={theme.inkDim} accessibilityLabel={t("intro.shipLabel")} />
            </Well>
            <Txt variant="label" color="inkDim">
              {t("intro.renameHint")}
            </Txt>
            <Sticker variant="warranty" style={{ alignSelf: "flex-end" }} />
          </Panel>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 6 }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: 18, height: 4, borderRadius: 2, backgroundColor: i <= page ? palette.orange : palette.steel0 }} />
        ))}
      </View>
      <KeyRow>
        <Key label={t("intro.skip")} onPress={() => finish(false)} testID="intro-skip" />
        <Key label={last ? t("intro.start") : t("continue")} tone="orange" flex={2} onPress={() => (last ? finish(true) : setPage((p) => p + 1))} testID="intro-next" />
      </KeyRow>
    </View>
  );
});

export const KippSheet = memo(function KippSheet({ visible }: { visible: boolean }) {
  const t = useT("world") as TFn;
  const lines = useShell((s) => s.kipp);
  const setOpen = useShell((s) => s.setKippOpen);
  const close = useCallback(() => setOpen(false), [setOpen]);
  return (
    <Sheet visible={visible} onClose={close} title={t("kipp.title")} testID="kipp-sheet">
      {lines.length === 0 ? (
        <Txt variant="body" color="inkDim">
          {t("kipp.empty")}
        </Txt>
      ) : (
        lines.map((line, i) => (
          <Well key={line.key} padding={space.sm} style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start", opacity: i === 0 ? 1 : 0.8 }}>
            <Icon name="kipp" size={16} chip />
            <Txt variant="body" style={{ flex: 1 }}>
              {line.text}
            </Txt>
          </Well>
        ))
      )}
      <MicroLabel numberOfLines={2}>{t("kipp.footer")}</MicroLabel>
    </Sheet>
  );
});

/** Weekly, off in settings, never while something else wants the screen. */
export function useBackupDue(quiet: boolean): boolean {
  const enabled = useSettings((s) => s.backupReminder);
  const due = useGame(
    (g) => {
      const s = g.state;
      const since = Math.max(s.backup?.lastExport ?? 0, s.backup?.lastReminder ?? 0, s.created ?? 0);
      return s.played > 3600 && Date.now() - since > WEEK_MS;
    },
    undefined,
    50,
  );
  return enabled && due && quiet;
}

export const BackupReminder = memo(function BackupReminder({ visible }: { visible: boolean }) {
  const t = useT("world") as TFn;
  const snooze = useCallback(() => {
    act((g) => {
      g.state.backup.lastReminder = Date.now();
    });
  }, []);
  return (
    <Dialog
      visible={visible}
      title={t("backup.title")}
      body={t("backup.body")}
      icon="save"
      tone="info"
      testID="backup-reminder"
      onRequestClose={snooze}
      choices={[
        {
          label: t("backup.open"),
          onPress: () => {
            snooze();
            goTo("settings", "backup");
          },
        },
        { label: t("backup.later"), onPress: snooze },
      ]}
    />
  );
});

export const SafeModeBanner = memo(function SafeModeBanner() {
  const t = useT("world") as TFn;
  const hide = useShell((s) => s.setSafeBanner);
  return (
    <View testID="safe-banner" accessibilityRole="alert" style={{ backgroundColor: palette.void2, borderRadius: 7, borderWidth: 1, borderColor: palette.amber, padding: space.sm, gap: space.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Icon name="warning" size={16} />
        <Txt variant="heading" color={palette.amber} numberOfLines={1} style={{ flex: 1, fontSize: 14, lineHeight: 18 }}>
          {t("safe.title")}
        </Txt>
        <IconKey icon="close" size="sm" width={44} onPress={() => hide(false)} accessibilityLabel={t("safe.dismiss")} />
      </View>
      <Txt variant="label" color={palette.bone1}>
        {t("safe.body")}
      </Txt>
      <Key
        label={t("safe.tryFull")}
        tone="yellow"
        size="sm"
        testID="safe-try-full"
        onPress={() => {
          setSafeModePreference("full");
          toast(t("safe.nextLaunch"), "info");
          hide(false);
        }}
      />
    </View>
  );
});

export const PerfHud = memo(function PerfHud() {
  const [text, setText] = useState("");
  useEffect(() => {
    const id = setInterval(() => {
      const fps = viewportPerf.frameMs > 0 ? Math.round(1000 / viewportPerf.frameMs) : 0;
      setText(`${fps} FPS ${viewportPerf.frameMs.toFixed(1)} MS\nTICK ${perf.tickMs} MS X${perf.ticksPerPulse}\nPULSE ${perf.pulseMs} MS`);
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <View pointerEvents="none" testID="perf-hud" style={{ alignSelf: "flex-end", backgroundColor: "rgba(7,9,15,0.8)", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3 }}>
      <Txt variant="micro" color={palette.mint} style={{ lineHeight: 11 }}>
        {text || "PERF"}
      </Txt>
    </View>
  );
});

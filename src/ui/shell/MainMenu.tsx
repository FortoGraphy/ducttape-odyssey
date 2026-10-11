// Main menu: continue, new game (story or sandbox), settings, info. The save played last is already
// loaded behind it (see boot.tsx), so "continue" is instant and the settings screen works here too.
import Constants from "expo-constants";
import { useCallback, useMemo, useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, useWindowDimensions, View, type ImageStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { formatDuration } from "@/engine/core";
import { useT } from "@/i18n";
import { getGame, getMode, hasGame, modeHasSave, type GameMode } from "@/store/game";
import { Col, Dialog, Key, MicroLabel, Rule, Sheet, Txt, useTheme } from "@/ui/kit";
import SettingsScreen from "@/ui/screens/settings";
import { palette, radius, space } from "@/ui/theme";

import { beginNewGame, continueGame } from "./session";

const ART = require("../../../assets/icon.png");
const pixelated = (Platform.OS === "web" ? { imageRendering: "pixelated" } : null) as ImageStyle | null;
/** From this width the menu puts the art beside the keys (unfolded foldables, tablets, landscape). */
const WIDE = 600;

type Panel = null | "mode" | "settings" | "info";

function useSaves(nonce: number): Record<GameMode, boolean> {
  return useMemo(() => ({ story: modeHasSave("story"), sandbox: modeHasSave("sandbox") }), [nonce]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Depth and play time of the save that is currently in memory, for the continue key. */
function loadedInfo(t: (k: string, o?: Record<string, unknown>) => string): string {
  if (!hasGame()) return "";
  const s = getGame().state;
  return t("saveInfo", { depth: s.nav.depth, time: formatDuration(s.played, 2) });
}

export function MainMenu() {
  const t = useT("menu");
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const wide = width >= WIDE && width > height * 0.8;
  const [panel, setPanel] = useState<Panel>(null);
  const [confirm, setConfirm] = useState<GameMode | null>(null);
  const [nonce] = useState(0);
  const saves = useSaves(nonce);
  const loaded = getMode();
  const info = loadedInfo(t as never);
  const version = Constants.expoConfig?.version ?? "1.0.0";

  const start = useCallback(
    (mode: GameMode) => {
      if (saves[mode]) setConfirm(mode);
      else beginNewGame(mode);
    },
    [saves],
  );
  const close = useCallback(() => setPanel(null), []);

  const artSize = wide ? Math.min(height - insets.top - insets.bottom - 160, width * 0.4, 360) : Math.min(width - 96, height * 0.3, 280);

  const art = (
    <View style={styles.artWrap}>
      <View style={[styles.artFrame, { width: artSize + 12, height: artSize + 12, borderColor: palette.steel0 }]}>
        <Image source={ART} style={[{ width: artSize, height: artSize, borderRadius: radius.panel - 4 }, pixelated]} />
      </View>
      <View style={styles.title}>
        <Txt variant="lcdXL" style={[styles.titleLine, { color: palette.bone2 }]}>
          DUCT TAPE
        </Txt>
        <Txt variant="lcdXL" style={[styles.titleLine, { color: palette.orange }]}>
          ODYSSEY
        </Txt>
        <MicroLabel style={{ color: palette.steel3, marginTop: space.xs }}>{t("tagline")}</MicroLabel>
      </View>
    </View>
  );

  const keys = (
    <Col gap="sm" style={wide ? styles.keysWide : styles.keys}>
      {saves[loaded] ? (
        <Key
          size="lg"
          tone="orange"
          icon="play"
          label={t(loaded === "sandbox" ? "continueSandbox" : "continueStory")}
          sublabel={t(loaded === "sandbox" ? "continueSandboxSub" : "continueStorySub", { info })}
          onPress={() => continueGame(loaded)}
          testID="menu-continue"
        />
      ) : null}
      {saves.story && loaded !== "story" ? <Key size="md" icon="book" label={t("continueStory")} sublabel={t("story")} onPress={() => continueGame("story")} testID="menu-continue-story" /> : null}
      {saves.sandbox && loaded !== "sandbox" ? (
        <Key size="md" icon="wrench" label={t("continueSandbox")} sublabel={t("sandbox")} onPress={() => continueGame("sandbox")} testID="menu-continue-sandbox" />
      ) : null}
      <Key size={saves[loaded] ? "md" : "lg"} tone={saves[loaded] ? "black" : "orange"} icon="plus" label={t("newGame")} onPress={() => setPanel("mode")} testID="menu-new" />
      <Key size="md" tone="cobalt" icon="gear" label={t("settings")} onPress={() => setPanel("settings")} testID="menu-settings" />
      <Key size="md" icon="info" label={t("info")} onPress={() => setPanel("info")} testID="menu-info" />
    </Col>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.md, paddingLeft: insets.left + space.lg, paddingRight: insets.right + space.lg }]}>
      {wide ? (
        <View style={styles.rowWide}>
          {art}
          <View style={styles.sideWide}>{keys}</View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.column} showsVerticalScrollIndicator={false} bounces={false}>
          {art}
          {keys}
        </ScrollView>
      )}
      <View style={styles.footer}>
        <MicroLabel style={{ color: palette.steel2 }}>{t("footer")}</MicroLabel>
        <MicroLabel style={{ color: palette.steel2 }}>{t("version", { v: version })}</MicroLabel>
      </View>

      <Sheet visible={panel === "mode"} onClose={close} title={t("modeTitle")} testID="menu-mode-sheet">
        <Col gap="md">
          <ModeCard
            title={t("story")}
            desc={t("storyDesc")}
            note={saves.story ? t("hasSave") : undefined}
            keyLabel={t("storyKey")}
            icon="book"
            tone="orange"
            onPress={() => {
              close();
              start("story");
            }}
            testID="menu-story"
          />
          <ModeCard
            title={t("sandbox")}
            desc={t("sandboxDesc")}
            note={saves.sandbox ? t("hasSave") : undefined}
            keyLabel={t("sandboxKey")}
            icon="wrench"
            tone="cobalt"
            onPress={() => {
              close();
              start("sandbox");
            }}
            testID="menu-sandbox"
          />
        </Col>
      </Sheet>

      <Sheet visible={panel === "info"} onClose={close} title={t("infoTitle")} testID="menu-info-sheet">
        <Col gap="sm">
          <Txt variant="body">{t("info1")}</Txt>
          <Rule label={t("howTitle")} />
          {(["how1", "how2", "how3", "how4", "how5"] as const).map((k, i) => (
            <View key={k} style={styles.howRow}>
              <Txt variant="bodyBold" color="orange" style={styles.howNum}>
                {i + 1}
              </Txt>
              <Txt variant="body" style={styles.howText}>
                {t(k)}
              </Txt>
            </View>
          ))}
          <Rule label={t("backupTitle")} />
          <Txt variant="body">{t("backup1")}</Txt>
          <Rule label={t("creditsTitle")} />
          <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
            {t("credits1")}
          </Txt>
        </Col>
      </Sheet>

      {panel === "settings" ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.body, paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.sm }]}>
          <View style={[styles.settingsHead, { paddingLeft: insets.left + space.md, paddingRight: insets.right + space.md }]}>
            <Txt variant="heading">{t("settings")}</Txt>
            <Key size="sm" icon="close" label={t("close")} onPress={close} testID="menu-settings-close" />
          </View>
          <View style={styles.settingsBody}>
            <SettingsScreen />
          </View>
        </View>
      ) : null}

      <Dialog
        visible={confirm !== null}
        title={t("overwriteTitle")}
        body={t(confirm === "sandbox" ? "overwriteSandbox" : "overwriteStory")}
        icon="warning"
        tone="warn"
        onRequestClose={() => setConfirm(null)}
        choices={[
          {
            label: t("overwriteYes"),
            tone: "red",
            onPress: () => {
              const mode = confirm;
              setConfirm(null);
              if (mode) beginNewGame(mode);
            },
            testID: "menu-overwrite-yes",
          },
          { label: t("overwriteNo"), onPress: () => setConfirm(null), testID: "menu-overwrite-no" },
        ]}
      />
    </View>
  );
}

function ModeCard({ title, desc, note, keyLabel, icon, tone, onPress, testID }: { title: string; desc: string; note?: string; keyLabel: string; icon: string; tone: "orange" | "cobalt"; onPress(): void; testID: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.mode, { backgroundColor: theme.well, borderColor: theme.rule }]}>
      <Txt variant="heading">{title}</Txt>
      <Txt variant="body" color="inkDim">
        {desc}
      </Txt>
      {note ? (
        <Txt variant="label" color="orange">
          {note}
        </Txt>
      ) : null}
      <Key size="md" tone={tone} icon={icon} label={keyLabel} onPress={onPress} testID={testID} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void0 },
  column: { flexGrow: 1, justifyContent: "center", alignItems: "center", gap: space.xl, paddingVertical: space.lg },
  rowWide: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xxl },
  sideWide: { width: 320 },
  artWrap: { alignItems: "center", gap: space.md },
  artFrame: { borderRadius: radius.panel, borderWidth: 2, alignItems: "center", justifyContent: "center", backgroundColor: palette.void2 },
  title: { alignItems: "center" },
  titleLine: { fontSize: 32, lineHeight: 36, letterSpacing: 2 },
  keys: { alignSelf: "stretch", maxWidth: 360, width: "100%" },
  keysWide: { alignSelf: "stretch" },
  footer: { flexDirection: "row", justifyContent: "space-between", paddingTop: space.sm },
  mode: { borderRadius: radius.well, borderWidth: 1, padding: space.md, gap: space.sm },
  howRow: { flexDirection: "row", gap: space.sm },
  howNum: { width: 16 },
  howText: { flex: 1 },
  settingsHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: space.sm },
  settingsBody: { flex: 1 },
});

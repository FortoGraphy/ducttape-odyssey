// Test bench for the mini-game host: nine games x three tiers, played through the real host.
// Not part of the shipped flow. Query params make every state reachable from a URL:
//   /minigames?game=weld&tier=2&seed=7&lang=cs&theme=night&rm=1&debug=1
// `debug=1` publishes layout data on globalThis.__mg so automated tests can use real pointer input.
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { MinigameId, MinigameResult, MinigameTier } from "@/engine/types";
import { applyLanguage, tr, useLang, useT } from "@/i18n";
import { MINIGAME_IDS, minigames } from "@/minigames";
import { mgDebug } from "@/minigames/host/debug";
import { MinigameHost, gradeOf } from "@/minigames/host/MinigameHost";
import { MiniKey, MiniThemeContext } from "@/minigames/shared";
import { Icon, hasIcon } from "@/ui/kit/Icon";
import { MAX_FONT_SCALE, dayTheme, nightTheme, radius, space, type } from "@/ui/theme";

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const TIER_LABEL = ["I", "II", "III"] as const;

type Outcome = { game: MinigameId; tier: MinigameTier; result?: MinigameResult; note?: "auto" | "closed" };

export default function MinigameGallery() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const t = useT("minigames");
  const lang = useLang();

  const [night, setNight] = useState(one(params.theme) === "night");
  const [reduceMotion, setReduceMotion] = useState(one(params.rm) === "1");
  const [seed, setSeed] = useState(() => Number(one(params.seed)) || 1);
  const [open, setOpen] = useState<{ game: MinigameId; tier: MinigameTier; run: number } | null>(() => {
    const g = one(params.game);
    const n = Number(one(params.tier));
    return g && (MINIGAME_IDS as readonly string[]).includes(g) ? { game: g as MinigameId, tier: n === 2 || n === 3 ? n : 1, run: 0 } : null;
  });
  const [last, setLast] = useState<Outcome | null>(null);

  const debug = one(params.debug) === "1";
  const langParam = one(params.lang);
  useEffect(() => {
    if (langParam === "cs" || langParam === "en") applyLanguage(langParam);
  }, [langParam]);
  useEffect(() => {
    if (!debug) return;
    mgDebug.on = true;
    (globalThis as { __mg?: unknown }).__mg = mgDebug.data;
    return () => {
      mgDebug.on = false;
    };
  }, [debug]);

  const play = useCallback((game: MinigameId, tier: MinigameTier) => setOpen((o) => ({ game, tier, run: (o?.run ?? 0) + 1 })), []);
  const finish = useCallback((outcome: Outcome) => {
    if (mgDebug.on) {
      mgDebug.data.doneCalls = (Number(mgDebug.data.doneCalls) || 0) + 1;
      mgDebug.data.lastResult = outcome.result ?? outcome.note;
    }
    setLast(outcome);
    setOpen(null);
  }, []);

  const theme = night ? nightTheme : dayTheme;
  let lastText = t("gallery.none");
  if (last) {
    const head = `${tr(minigames[last.game].meta.name).toUpperCase()} ${TIER_LABEL[last.tier - 1]}`;
    if (last.result) {
      const r = last.result;
      lastText = `${head} · ${Math.round(r.score * 100)}% · ${t(`result.grade.${gradeOf(r.score)}`).toUpperCase()} · ${(r.durationMs / 1000).toFixed(1)} s`;
    } else {
      lastText = `${head} · ${t(last.note === "auto" ? "gallery.auto" : "gallery.closed")}`;
    }
  }

  return (
    <MiniThemeContext.Provider value={theme}>
      <View style={{ flex: 1, backgroundColor: "#07090F", paddingTop: insets.top + space.sm, paddingBottom: insets.bottom }}>
        <ScrollView contentContainerStyle={{ padding: space.md, gap: space.md }}>
          <View style={{ backgroundColor: theme.body, borderRadius: radius.panel, padding: space.md, gap: space.sm, borderTopWidth: 2, borderTopColor: theme.bodyHi, borderBottomWidth: 3, borderBottomColor: theme.bodyLo }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[type.title, { color: theme.ink }]}>
              {t("gallery.title")}
            </Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[type.body, { color: theme.inkDim }]}>
              {t("gallery.subtitle")}
            </Text>
            <View style={{ backgroundColor: theme.lcdBg, borderRadius: radius.lcd, padding: space.sm, gap: 2 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[type.micro, { color: theme.lcdOn, opacity: 0.6 }]}>
                {t("gallery.last")}
              </Text>
              <Text testID="gallery-last" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[type.lcdS, { color: last?.result && !last.result.success ? theme.lcdWarn : theme.lcdOn }]}>
                {lastText}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Setting label={t("gallery.lang")} value={lang.toUpperCase()} onPress={() => applyLanguage(lang === "cs" ? "en" : "cs")} />
              <Setting label={t("gallery.theme")} value={t(night ? "gallery.night" : "gallery.day")} onPress={() => setNight((v) => !v)} />
            </View>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Setting label={t("gallery.motion")} value={t(reduceMotion ? "gallery.reduced" : "gallery.full")} onPress={() => setReduceMotion((v) => !v)} />
              <Setting label={t("gallery.seed")} value={String(seed)} onPress={() => setSeed((s) => (s % 99) + 1)} />
            </View>
          </View>

          <View style={{ backgroundColor: theme.body, borderRadius: radius.panel, paddingVertical: space.xs, borderTopWidth: 2, borderTopColor: theme.bodyHi, borderBottomWidth: 3, borderBottomColor: theme.bodyLo }}>
            {MINIGAME_IDS.map((id, row) => {
              const meta = minigames[id].meta;
              return (
                <View key={id} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.xs, borderTopWidth: row === 0 ? 0 : 1, borderTopColor: theme.rule }}>
                  {hasIcon(meta.icon) && <Icon name={meta.icon} size={24} chip />}
                  <View style={{ flex: 1 }}>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={[type.heading, { color: theme.ink }]}>
                      {tr(meta.name)}
                    </Text>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[type.micro, { color: theme.inkDim }]}>
                      {meta.seconds.join(" / ")} s
                    </Text>
                  </View>
                  {([1, 2, 3] as const).map((tier) => (
                    <MiniKey key={tier} label={TIER_LABEL[tier - 1]} tone={tier === 3 ? "orange" : tier === 2 ? "cobalt" : "black"} onPress={() => play(id, tier)} style={{ width: 48 }} />
                  ))}
                </View>
              );
            })}
          </View>
        </ScrollView>

        {open && (
          <MinigameHost
            key={`${open.game}-${open.tier}-${open.run}`}
            game={open.game}
            tier={open.tier}
            seed={seed}
            purposeLabel={t("gallery.purpose")}
            canAuto
            theme={theme}
            reduceMotion={reduceMotion}
            onDone={(result) => finish({ game: open.game, tier: open.tier, result })}
            onAuto={() => finish({ game: open.game, tier: open.tier, note: "auto" })}
            onClose={() => finish({ game: open.game, tier: open.tier, note: "closed" })}
          />
        )}
      </View>
    </MiniThemeContext.Provider>
  );
}

function Setting({ label, value, onPress }: { label: string; value: string; onPress(): void }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <MiniKey label={`${label}: ${value}`} onPress={onPress} />
    </View>
  );
}

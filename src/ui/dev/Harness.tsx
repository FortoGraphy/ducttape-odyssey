// Preview harness for tab screens and overlays: boots a deterministic game from a preset (never
// touching the real save), provides the theme and the toast/number-pop hosts, and lays the child out
// in the same box the real shell gives a tab (the Control Deck area below a viewport placeholder).
// Query params: ?preset=fresh|early|mid|late|damaged &theme=day|night &lang=cs|en &failure=<kind>
// &event=<id> &full=1 (child gets the whole screen: for overlays).
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import i18n from "@/i18n";
import { bootDev, startLoop, stopLoop } from "@/store/game";
import { applyExtras, applyPreset, PRESETS, type PresetId } from "@/store/presets";
import { MicroLabel, NumberPopHost, ThemeProvider, ToastHost, type ThemeName } from "@/ui/kit";
import { palette, VIEWPORT_SHARE } from "@/ui/theme";

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export function DevHarness({ children }: { children: ReactNode }) {
  const params = useLocalSearchParams();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const preset = (PRESETS as readonly string[]).includes(one(params.preset) ?? "") ? (one(params.preset) as PresetId) : "mid";
  const theme: ThemeName = one(params.theme) === "night" ? "night" : "day";
  const lang = one(params.lang) === "en" ? "en" : "cs";
  const full = one(params.full) === "1";
  const failure = one(params.failure);
  const event = one(params.event);

  useEffect(() => {
    i18n.changeLanguage(lang);
    bootDev(12345, (g) => {
      applyPreset(g, preset);
      applyExtras(g, { failure, event });
    });
    startLoop();
    // Preview-only: the game must exist before children mount, and it is created in this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
    return () => stopLoop(false);
  }, [preset, lang, failure, event]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: palette.void0 }} />;

  const viewportHeight = Math.round(height * VIEWPORT_SHARE);
  return (
    <ThemeProvider theme={theme}>
      <View style={{ flex: 1, backgroundColor: palette.void0 }}>
        {full ? (
          <View style={{ flex: 1 }}>{children}</View>
        ) : (
          <>
            <View style={{ height: viewportHeight, paddingTop: insets.top, alignItems: "center", justifyContent: "center" }}>
              <MicroLabel>VIEWPORT</MicroLabel>
            </View>
            <View style={{ flex: 1 }}>{children}</View>
          </>
        )}
        <ToastHost />
        <NumberPopHost />
      </View>
    </ThemeProvider>
  );
}

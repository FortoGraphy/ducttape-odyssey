// Test bench for the minigames-b games (valves, calibrate, tape). Not part of the shipped flow:
// the shared host and registry mount the same components. Query params make every state
// reachable from a URL for screenshots and automation:
//   /mg-b?g=valves&t=2&size=small&lang=cs&theme=night&seed=7&auto=win&rm=1
import { useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState, type ComponentType } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { MinigameResult, MinigameTier } from "@/engine/types";
import { applyLanguage, tr, useLang, type Lang } from "@/i18n";
import CalibrateGame, { meta as calibrateMeta } from "@/minigames/calibrate";
import { MiniThemeContext } from "@/minigames/shared";
import TapeGame, { meta as tapeMeta } from "@/minigames/tape";
import type { MinigameMeta, MinigameProps } from "@/minigames/types";
import ValvesGame, { meta as valvesMeta } from "@/minigames/valves";
import { dayTheme, nightTheme, palette, radius, space, type } from "@/ui/theme";

type Auto = "win" | "lose" | "idle";
type BenchGame = ComponentType<MinigameProps & { debugAuto?: Auto }>;
type GameKey = "valves" | "calibrate" | "tape";

const GAMES: Record<GameKey, { meta: MinigameMeta; Game: BenchGame }> = {
  valves: { meta: valvesMeta, Game: ValvesGame },
  calibrate: { meta: calibrateMeta, Game: CalibrateGame },
  tape: { meta: tapeMeta, Game: TapeGame },
};
const ORDER: GameKey[] = ["valves", "calibrate", "tape"];
const SIZES = { small: { w: 343, h: 380 }, large: { w: 375, h: 620 } } as const;
type SizeKey = keyof typeof SIZES;

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default function MinigamesBench() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const lang = useLang();

  const initialGame = one(params.g);
  const [game, setGame] = useState<GameKey | null>(initialGame && initialGame in GAMES ? (initialGame as GameKey) : null);
  const [tier, setTier] = useState<MinigameTier>(() => {
    const n = Number(one(params.t));
    return n === 2 || n === 3 ? n : 1;
  });
  const [size, setSize] = useState<SizeKey>(one(params.size) === "small" ? "small" : "large");
  const [night, setNight] = useState(one(params.theme) === "night");
  const [seed, setSeed] = useState(() => Number(one(params.seed)) || 1);
  const [run, setRun] = useState(0);
  const [finishes, setFinishes] = useState<MinigameResult[]>([]);

  const autoParam = one(params.auto);
  const auto: Auto | undefined = autoParam === "win" || autoParam === "lose" || autoParam === "idle" ? autoParam : undefined;
  const reduceMotion = one(params.rm) === "1";
  const langParam = one(params.lang);

  // Applied during the first render so memoised game parts never show the previous language.
  useState(() => {
    if (langParam === "cs" || langParam === "en") applyLanguage(langParam);
    return langParam;
  });

  const start = useCallback((g: GameKey, tr2: MinigameTier) => {
    setFinishes([]);
    setGame(g);
    setTier(tr2);
    setRun((r) => r + 1);
  }, []);

  const onFinish = useCallback((r: MinigameResult) => setFinishes((list) => [...list, r]), []);

  const theme = night ? nightTheme : dayTheme;
  const dims = SIZES[size];
  const last = finishes[finishes.length - 1];
  const report = useMemo(
    () => JSON.stringify({ calls: finishes.length, score: last ? Math.round(last.score * 1000) / 1000 : null, success: last?.success ?? null, perfect: last?.perfect ?? null, ms: last?.durationMs ?? null }),
    [finishes, last],
  );
  const entry = game ? GAMES[game] : null;

  return (
    <View style={{ flex: 1, backgroundColor: palette.void1, paddingTop: insets.top + space.sm, paddingBottom: insets.bottom }}>
      <View style={{ paddingHorizontal: space.md, gap: space.sm }}>
        <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap" }}>
          {ORDER.map((g) =>
            ([1, 2, 3] as MinigameTier[]).map((tr2) => (
              <Chip key={`${g}${tr2}`} label={`${g.slice(0, 3).toUpperCase()} ${tr2}`} active={game === g && tier === tr2} onPress={() => start(g, tr2)} />
            )),
          )}
        </View>
        <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap", alignItems: "center" }}>
          <Chip label={size === "small" ? "343x380" : "375x620"} onPress={() => setSize(size === "small" ? "large" : "small")} />
          <Chip label={night ? "NIGHT" : "DAY"} onPress={() => setNight(!night)} />
          <Chip label={lang.toUpperCase()} onPress={() => applyLanguage((lang === "cs" ? "en" : "cs") satisfies Lang)} />
          <Chip
            label={`SEED ${seed}`}
            onPress={() => {
              setSeed(seed + 1);
              setFinishes([]);
              setRun((r) => r + 1);
            }}
          />
          <Text testID="mg-result" style={[type.micro, { color: palette.steel3, flexShrink: 1 }]}>
            {report}
          </Text>
        </View>
      </View>

      <View style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
        {entry ? (
          <MiniThemeContext.Provider value={theme}>
            <View style={{ width: dims.w, height: dims.h, backgroundColor: theme.body, borderTopLeftRadius: radius.panel, borderTopRightRadius: radius.panel, overflow: "hidden" }}>
              <entry.Game key={`${game}-${tier}-${seed}-${run}-${size}`} tier={tier} seed={seed} width={dims.w} height={dims.h} reduceMotion={reduceMotion} onFinish={onFinish} debugAuto={auto} />
            </View>
          </MiniThemeContext.Provider>
        ) : (
          <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: space.xl, gap: space.md }}>
            {ORDER.map((g) => (
              <View key={g} style={{ gap: space.xxs }}>
                <Text style={[type.heading, { color: palette.bone1 }]}>{tr(GAMES[g].meta.name)}</Text>
                <Text style={[type.body, { color: palette.steel3 }]}>{tr(GAMES[g].meta.hint)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress(): void }) {
  return (
    <Pressable onPress={onPress} hitSlop={4} style={{ minHeight: 30, paddingHorizontal: space.sm, borderRadius: radius.key, backgroundColor: active ? palette.orange : palette.steel0, justifyContent: "center" }}>
      <Text style={[type.key, { color: active ? "#15171C" : palette.bone1 }]}>{label}</Text>
    </Pressable>
  );
}

// Test route for the minigames-c set (defense, dock, hack). Mounts a game directly with a tier
// picker; the real host and registry live elsewhere. Query parameters (all optional) make it
// scriptable for screenshots and Playwright:
//   game=defense|dock|hack  tier=1|2|3  seed=<int>  lang=cs|en  theme=day|night
//   size=min|max|<w>x<h>    rm=1 (reduce motion)   auto=win|lose   secs=<time limit override>
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { MinigameResult, MinigameTier } from "@/engine/types";
import { applyLanguage, tr } from "@/i18n";
import DefenseGame, { meta as defenseMeta } from "@/minigames/defense";
import DockGame, { meta as dockMeta } from "@/minigames/dock";
import HackGame, { meta as hackMeta } from "@/minigames/hack";
import { MiniThemeContext } from "@/minigames/shared";
import type { MinigameMeta, MinigameProps } from "@/minigames/types";
import { Txt } from "@/ui/kit/Txt";
import { dayTheme, nightTheme, radius, space } from "@/ui/theme";

type GameId = "defense" | "dock" | "hack";
interface Debug {
  autoplay?: "win" | "lose";
  seconds?: number;
}
type GameComponent = ComponentType<MinigameProps & { debug?: Debug }>;

const GAMES: Record<GameId, { meta: MinigameMeta; Game: GameComponent }> = {
  defense: { meta: defenseMeta, Game: DefenseGame },
  dock: { meta: dockMeta, Game: DockGame },
  hack: { meta: hackMeta, Game: HackGame },
};
const IDS: GameId[] = ["defense", "dock", "hack"];

interface Report {
  calls: number;
  results: MinigameResult[];
}
const globalReport = globalThis as unknown as { __mgc?: Report };

/** Playwright reads this to count onFinish calls. */
function resetReport(): void {
  globalReport.__mgc = { calls: 0, results: [] };
}

function recordResult(r: MinigameResult): number {
  const report = globalReport.__mgc ?? { calls: 0, results: [] };
  report.calls++;
  report.results.push(r);
  globalReport.__mgc = report;
  return report.calls;
}

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress(): void }) {
  return (
    <Pressable onPress={onPress} hitSlop={4} style={{ minHeight: 32, paddingHorizontal: space.md, borderRadius: radius.key, backgroundColor: active ? "#FF6A1A" : "#20242F", alignItems: "center", justifyContent: "center" }}>
      <Txt variant="key" color={active ? "#15171C" : "#E7E3D8"}>
        {label}
      </Txt>
    </Pressable>
  );
}

export default function MinigamesCRoute() {
  const params = useLocalSearchParams();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const lang = one(params.lang) === "en" ? "en" : one(params.lang) === "cs" ? "cs" : undefined;
  // Applied before the first render of a game so tr() already answers in the right language.
  useMemo(() => {
    if (lang) applyLanguage(lang);
  }, [lang]);

  const initialGame = IDS.includes(one(params.game) as GameId) ? (one(params.game) as GameId) : "defense";
  const initialTier = Math.max(1, Math.min(3, Number(one(params.tier)) || 1)) as MinigameTier;
  const [game, setGame] = useState<GameId>(initialGame);
  const [tier, setTier] = useState<MinigameTier>(initialTier);
  const [seed, setSeed] = useState(() => Number(one(params.seed)) || 20261010);
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<MinigameResult | null>(null);
  const [calls, setCalls] = useState(0);

  const themeName = one(params.theme) === "night" ? "night" : "day";
  const theme = themeName === "night" ? nightTheme : dayTheme;
  const reduceMotion = one(params.rm) === "1";
  const auto = one(params.auto);
  const debug = useMemo<Debug | undefined>(() => {
    const autoplay = auto === "win" || auto === "lose" ? auto : undefined;
    const seconds = Number(one(params.secs)) || undefined;
    return autoplay || seconds ? { autoplay, seconds } : undefined;
    // Query parameters do not change while the route is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const barH = 84;
  const size = one(params.size);
  let playW = Math.min(375, window.width);
  let playH = Math.max(380, Math.min(620, window.height - insets.top - insets.bottom - barH));
  if (size === "min") {
    playW = 343;
    playH = 380;
  } else if (size === "max") {
    playW = 375;
    playH = 620;
  } else if (size && /^\d+x\d+$/.test(size)) {
    const [w, h] = size.split("x").map(Number);
    playW = w;
    playH = h;
  }

  useEffect(resetReport, []);

  const restart = (nextGame: GameId, nextTier: MinigameTier, nextSeed: number) => {
    setGame(nextGame);
    setTier(nextTier);
    setSeed(nextSeed);
    setResult(null);
    setCalls(0);
    resetReport();
    setRun((r) => r + 1);
  };

  const onFinish = (r: MinigameResult) => {
    setCalls(recordResult(r));
    setResult(r);
  };

  const { Game, meta } = GAMES[game];

  return (
    <View style={{ flex: 1, backgroundColor: "#07090F", paddingTop: insets.top, alignItems: "center" }}>
      <View style={{ height: barH, width: "100%", paddingHorizontal: space.md, justifyContent: "center", gap: space.sm }}>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          {IDS.map((id) => (
            <Chip key={id} label={tr(GAMES[id].meta.name).toUpperCase()} active={id === game} onPress={() => restart(id, tier, seed)} />
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
          {([1, 2, 3] as MinigameTier[]).map((k) => (
            <Chip key={k} label={`T${k}`} active={k === tier} onPress={() => restart(game, k, seed)} />
          ))}
          <Chip label="SEED +1" active={false} onPress={() => restart(game, tier, seed + 1)} />
          <Txt variant="micro" color="#9BA1B0" numberOfLines={1} style={{ flexShrink: 1 }}>
            {`${seed} · ${playW}×${playH} · ${meta.seconds[tier - 1]} s`}
          </Txt>
        </View>
      </View>

      <MiniThemeContext.Provider value={theme}>
        <View style={{ width: playW, height: playH, borderRadius: radius.well, overflow: "hidden", backgroundColor: theme.body }}>
          <Game key={`${game}-${tier}-${seed}-${run}`} tier={tier} seed={seed} width={playW} height={playH} reduceMotion={reduceMotion} onFinish={onFinish} debug={debug} />
        </View>
      </MiniThemeContext.Provider>

      {result ? (
        <View style={{ width: playW, marginTop: space.sm, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm }}>
          <View style={{ flex: 1 }}>
            <Txt testID="mgc-result" variant="lcdM" color={result.success ? "#C9F5D5" : "#FF6A1A"}>
              {`SCORE ${result.score.toFixed(3)}`}
            </Txt>
            <Txt variant="micro" color="#9BA1B0" numberOfLines={1}>
              {`${result.success ? "SUCCESS" : "FAIL"}${result.perfect ? " · PERFECT" : ""} · ${(result.durationMs / 1000).toFixed(1)} s · onFinish ×${calls}`}
            </Txt>
          </View>
          <Chip label="AGAIN" active onPress={() => restart(game, tier, seed)} />
          <Chip label="NEXT" active={false} onPress={() => restart(game, tier, seed + 1)} />
        </View>
      ) : (
        <Txt variant="micro" color="#6B7284" style={{ marginTop: space.sm }} numberOfLines={2} align="center">
          {tr(meta.hint)}
        </Txt>
      )}
    </View>
  );
}

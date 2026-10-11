// Full-screen overlay that runs one mini-game: intro card -> 3-2-1 -> the game -> result card.
// The game itself is loaded lazily from the registry inside an error boundary, and every screen
// that could gate the player offers the auto-resolve key instead.
import { Component, memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, View, useWindowDimensions, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Animated, { Easing, ReduceMotion, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { MinigameId, MinigameResult, MinigameTier } from "@/engine/types";
import { tr, useT } from "@/i18n";
import { fonts } from "@/ui/fonts";
import { Icon, hasIcon } from "@/ui/kit/Icon";
import { MAX_FONT_SCALE, palette, radius, space, type, type PanelTheme } from "@/ui/theme";

import { minigames } from "../index";
import { MiniKey, MiniThemeContext, haptic, sfx } from "../shared";
import type { MinigameProps } from "../types";
import { mgDebug } from "./debug";

export interface MinigameHostProps {
  game: MinigameId;
  tier: MinigameTier;
  seed: number;
  /** What the game is being played for, e.g. "Repair: Mining laser". */
  purposeLabel?: string;
  canAuto: boolean;
  /** Replaces the default auto-resolve caption, e.g. to show its cost. */
  autoLabel?: string;
  theme: PanelTheme;
  reduceMotion: boolean;
  onDone(result: MinigameResult): void;
  onAuto(): void;
  onClose?(): void;
}

type Phase = "intro" | "count" | "play" | "result" | "error";

const BACKDROP = "#07090F";
const HEADER_H = 48;
const MARGIN = 12;
const PLAY_MAX_W = 375;
const PLAY_MAX_H = 620;
const never = ReduceMotion.Never;
const LINES = { success: 3, fail: 3, perfect: 2 } as const;

/** 0 Scrappy .. 4 Pristine, the same ladder crafted modules use. */
export function gradeOf(score: number): 0 | 1 | 2 | 3 | 4 {
  return score >= 0.95 ? 4 : score >= 0.85 ? 3 : score >= 0.7 ? 2 : score >= 0.5 ? 1 : 0;
}
const GRADE_COLOR = [palette.steel3, palette.mint, palette.mint, palette.cobalt2, palette.yellow] as const;

function T({ style, children, lines }: { style?: StyleProp<TextStyle>; children: ReactNode; lines?: number }) {
  return (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={lines} style={style}>
      {children}
    </Text>
  );
}

/** Springy entrance for cards; a plain cut when motion is reduced. */
function Pop({ children, reduceMotion, style }: { children: ReactNode; reduceMotion: boolean; style?: StyleProp<ViewStyle> }) {
  const v = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (!reduceMotion) v.set(withSpring(1, { duration: 420, dampingRatio: 0.68, reduceMotion: never }));
    return () => cancelAnimation(v);
  }, [reduceMotion, v]);
  const anim = useAnimatedStyle(() => ({
    opacity: Math.min(1, v.value * 1.8),
    transform: [{ translateY: (1 - v.value) * 22 }, { scale: 0.93 + 0.07 * v.value }],
  }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

function Screw({ theme }: { theme: PanelTheme }) {
  return (
    <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: theme.rule, alignItems: "center", justifyContent: "center", borderBottomWidth: 1, borderBottomColor: theme.bodyHi }}>
      <View style={{ width: 6, height: 1.5, backgroundColor: theme.inkDim, opacity: 0.6, transform: [{ rotate: "35deg" }] }} />
    </View>
  );
}

/** Engraved vent slots: fills spare panel height the way real hardware does. */
function Vents({ theme, children }: { theme: PanelTheme; children?: ReactNode }) {
  const [h, setH] = useState(0);
  const slots = Math.max(0, Math.min(14, Math.floor((h - 8) / 13)));
  return (
    <View style={{ flex: 1, justifyContent: "center", gap: 7, overflow: "hidden" }} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      {Array.from({ length: slots }, (_, i) => (
        <View key={i} style={{ height: 6, borderRadius: 3, marginHorizontal: space.xl, backgroundColor: theme.well, borderTopWidth: 1, borderTopColor: theme.rule }} />
      ))}
      {children}
    </View>
  );
}

function TierPips({ tier, theme }: { tier: MinigameTier; theme: PanelTheme }) {
  return (
    <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i <= tier ? theme.orange : theme.ledOff, borderWidth: 1, borderColor: "rgba(0,0,0,0.3)" }} />
      ))}
    </View>
  );
}

class GameBoundary extends Component<{ children: ReactNode; onError(): void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(error: unknown): void {
    console.warn("minigame crashed", error);
    this.props.onError();
  }
  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/** Resolves the game inside the boundary so a module that throws while loading is contained too. */
function GameMount({ game, ...rest }: MinigameProps & { game: MinigameId }) {
  const [Game] = useState(() => minigames[game].load());
  return <Game {...rest} />;
}

const MeterLed = memo(function MeterLed({ i, fill, chase }: { i: number; fill: SharedValue<number>; chase: SharedValue<number> }) {
  const color = i >= 15 ? palette.yellow : i >= 8 ? palette.mint : palette.orange;
  const style = useAnimatedStyle(() => {
    const lit = fill.value > i + 0.5;
    const d = Math.abs(chase.value - i);
    const spark = chase.value >= 0 && d < 1.6 ? 1 - d / 1.6 : 0;
    return { opacity: lit ? 1 : 0.22, backgroundColor: lit ? color : palette.steel2, transform: [{ scale: 1 + spark * 0.5 }] };
  });
  return <Animated.View style={[{ flex: 1, height: 10, borderRadius: 3, borderWidth: 1, borderColor: "rgba(0,0,0,0.3)" }, style]} />;
});

/** 16-step LED row used as the score meter; a perfect run adds a running light. */
function ScoreMeter({ score, perfect, reduceMotion }: { score: number; perfect: boolean; reduceMotion: boolean }) {
  const steps = Math.round(score * 16);
  const fill = useSharedValue(reduceMotion ? steps : 0);
  const chase = useSharedValue(-1);
  useEffect(() => {
    if (reduceMotion) return;
    fill.set(withDelay(180, withTiming(steps, { duration: 520 + steps * 25, easing: Easing.out(Easing.quad), reduceMotion: never })));
    if (perfect) chase.set(withDelay(900, withRepeat(withTiming(17, { duration: 900, easing: Easing.linear, reduceMotion: never }), -1, false)));
    return () => {
      cancelAnimation(fill);
      cancelAnimation(chase);
    };
  }, [chase, fill, perfect, reduceMotion, steps]);
  return (
    <View style={{ flexDirection: "row", gap: 3, alignSelf: "stretch" }}>
      {Array.from({ length: 16 }, (_, i) => (
        <MeterLed key={i} i={i} fill={fill} chase={chase} />
      ))}
    </View>
  );
}

/** Counts up to `to`; discrete steps, so plain state is fine. */
function useCountUp(to: number, enabled: boolean): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const started = Date.now();
    const id = setInterval(() => {
      const k = Math.min(1, (Date.now() - started) / 650);
      setN(Math.round(to * (1 - (1 - k) * (1 - k))));
      if (k >= 1) clearInterval(id);
    }, 40);
    return () => clearInterval(id);
  }, [enabled, to]);
  return enabled ? n : to;
}

function Sticker({ label, reduceMotion }: { label: string; reduceMotion: boolean }) {
  const v = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (!reduceMotion) v.set(withDelay(650, withSpring(1, { duration: 520, dampingRatio: 0.45, reduceMotion: never })));
    return () => cancelAnimation(v);
  }, [reduceMotion, v]);
  const anim = useAnimatedStyle(() => ({ opacity: Math.min(1, v.value * 3), transform: [{ rotate: "-7deg" }, { scale: 2.2 - 1.2 * v.value }] }));
  return (
    <Animated.View style={[{ backgroundColor: palette.yellow, borderRadius: 3, paddingHorizontal: space.sm, paddingVertical: 3, borderWidth: 1.5, borderColor: "#15171C" }, anim]}>
      <T style={[type.key, { color: "#15171C" }]}>{label}</T>
    </Animated.View>
  );
}

function CountDigit({ label, reduceMotion, theme }: { label: string; reduceMotion: boolean; theme: PanelTheme }) {
  const v = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    v.set(1.35);
    v.set(withSpring(1, { duration: 340, dampingRatio: 0.55, reduceMotion: never }));
  }, [label, reduceMotion, v]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: v.value }] }));
  return (
    <Animated.View style={anim}>
      <T style={{ fontFamily: fonts.lcd, fontSize: label.length > 1 ? 54 : 110, lineHeight: label.length > 1 ? 64 : 120, color: theme.lcdOn, textAlign: "center" }}>{label}</T>
    </Animated.View>
  );
}

export function MinigameHost({ game, tier, seed, purposeLabel, canAuto, autoLabel, theme, reduceMotion, onDone, onAuto, onClose }: MinigameHostProps) {
  const t = useT("minigames");
  const insets = useSafeAreaInsets();
  const { width: sw, height: sh } = useWindowDimensions();
  const meta = minigames[game].meta;

  const playW = Math.min(PLAY_MAX_W, sw - MARGIN * 2);
  const playH = Math.min(PLAY_MAX_H, sh - insets.top - insets.bottom - MARGIN * 2 - HEADER_H - 4);

  const [phase, setPhase] = useState<Phase>("intro");
  const [count, setCount] = useState(3);
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<MinigameResult | null>(null);
  const resultRef = useRef<MinigameResult | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);
  // The host reports back exactly once, however often a key is hit while it closes.
  const closed = useRef(false);
  const leave = useCallback((fn: () => void) => {
    if (closed.current) return;
    closed.current = true;
    fn();
  }, []);

  useEffect(() => {
    sfx("uiOpen");
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (phase !== "count") return;
    const STEP = 680;
    sfx("beepGood", { rate: 0.9 });
    haptic("tap");
    const ids = [
      setTimeout(() => {
        setCount(2);
        sfx("beepGood", { rate: 0.9 });
        haptic("tap");
      }, STEP),
      setTimeout(() => {
        setCount(1);
        sfx("beepGood", { rate: 0.9 });
        haptic("tap");
      }, STEP * 2),
      setTimeout(() => {
        setCount(0);
        sfx("beepGood", { rate: 1.35 });
        haptic("impact");
      }, STEP * 3),
      setTimeout(() => setPhase("play"), STEP * 3 + 420),
    ];
    return () => ids.forEach(clearTimeout);
  }, [phase, run]);

  const start = useCallback(() => {
    sfx("choice");
    resultRef.current = null;
    setResult(null);
    setCount(3);
    setRun((r) => r + 1);
    setPhase("count");
  }, []);

  const handleFinish = useCallback(
    (r: MinigameResult) => {
      if (mgDebug.on) mgDebug.data.finishCalls = (Number(mgDebug.data.finishCalls) || 0) + 1;
      // A game must report once; anything after the first result is ignored.
      if (resultRef.current) return;
      resultRef.current = r;
      // Leave the final state on screen for a beat before the card covers it.
      later(() => {
        setResult(r);
        setPhase("result");
        if (r.perfect) {
          sfx("achievement");
          haptic("success");
        } else if (r.success) {
          sfx("success");
          haptic("success");
        } else {
          sfx("fail");
          haptic("error");
        }
      }, 480);
    },
    [later],
  );

  const handleCrash = useCallback(() => {
    if (resultRef.current) return;
    sfx("deny");
    haptic("error");
    setPhase("error");
  }, []);

  return (
    <MiniThemeContext.Provider value={theme}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: BACKDROP, paddingTop: insets.top, paddingBottom: insets.bottom, alignItems: "center", justifyContent: "center" }]} onStartShouldSetResponder={() => true}>
        <Pop reduceMotion={reduceMotion} style={{ width: playW, borderRadius: radius.panel, backgroundColor: theme.body, overflow: "hidden", borderTopWidth: 2, borderTopColor: theme.bodyHi, borderBottomWidth: 3, borderBottomColor: theme.bodyLo }}>
          <View style={{ height: HEADER_H, flexDirection: "row", alignItems: "center", paddingHorizontal: space.md, gap: space.sm, borderBottomWidth: 1, borderBottomColor: theme.rule }}>
            <Screw theme={theme} />
            <T lines={1} style={[type.label, { color: theme.inkDim, flex: 1 }]}>
              {(purposeLabel ?? t("host.kicker")).toUpperCase()}
            </T>
            <TierPips tier={tier} theme={theme} />
            {onClose && phase === "intro" ? <MiniKey label="×" onPress={() => leave(onClose)} style={{ width: 44 }} textStyle={{ fontSize: 16 }} /> : <Screw theme={theme} />}
          </View>

          <View style={{ width: playW, height: playH }}>
            {phase === "intro" && (
              <Pop reduceMotion={reduceMotion} style={{ flex: 1, padding: space.lg, gap: space.md }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                  {hasIcon(meta.icon) && <Icon name={meta.icon} size={32} chip />}
                  <View style={{ flex: 1 }}>
                    <T style={[type.micro, { color: theme.inkDim }]}>{t("host.kicker")}</T>
                    <T style={[type.title, { fontSize: 26, lineHeight: 32, color: theme.ink }]}>{tr(meta.name)}</T>
                  </View>
                </View>
                <View style={{ backgroundColor: theme.lcdBg, borderRadius: radius.lcd, padding: space.md, flexDirection: "row", borderWidth: 2, borderColor: theme.keyLo }}>
                  <View style={{ flex: 1.3 }}>
                    <T style={[type.micro, { color: theme.lcdOn, opacity: 0.6 }]}>{t("host.tier")}</T>
                    <T lines={1} style={[type.lcdM, { color: theme.lcdOn, marginTop: 2 }]}>
                      {tier}/3 {t(`host.tierName.${tier}`).toUpperCase()}
                    </T>
                  </View>
                  <View style={{ flex: 1, alignItems: "flex-end" }}>
                    <T style={[type.micro, { color: theme.lcdOn, opacity: 0.6 }]}>{t("host.limit")}</T>
                    <T style={[type.lcdM, { color: theme.lcdOn, marginTop: 2 }]}>{t("host.seconds", { n: meta.seconds[tier - 1] })}</T>
                  </View>
                </View>
                <View style={{ backgroundColor: theme.well, borderRadius: radius.well, padding: space.md, borderWidth: 1, borderColor: theme.rule }}>
                  <T style={[type.body, { color: theme.ink }]}>{tr(meta.hint)}</T>
                </View>
                <Vents theme={theme}>
                  <View style={{ position: "absolute", right: space.sm, bottom: space.md, backgroundColor: theme.yellow, paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: 2, transform: [{ rotate: "-5deg" }], borderWidth: 1, borderColor: "rgba(0,0,0,0.35)" }}>
                    <T style={[type.micro, { color: "#15171C" }]}>{t("host.sticker")}</T>
                  </View>
                </Vents>
                {canAuto && <T style={[type.body, { fontSize: 11, lineHeight: 16, color: theme.inkDim }]}>{t("host.autoNote")}</T>}
                <MiniKey label={t("host.start")} tone="orange" onPress={start} textStyle={{ fontSize: 14, paddingVertical: 10 }} />
                {canAuto && <MiniKey label={autoLabel ?? t("host.auto")} onPress={() => leave(onAuto)} />}
              </Pop>
            )}

            {phase === "count" && (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space.lg }}>
                <T style={[type.label, { color: theme.inkDim }]}>{t("host.ready")}</T>
                <View style={{ width: 190, height: 170, borderRadius: radius.lcd + 4, backgroundColor: theme.lcdBg, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: theme.keyLo }}>
                  <CountDigit label={count > 0 ? String(count) : t("host.go")} reduceMotion={reduceMotion} theme={theme} />
                </View>
                <T style={[type.heading, { color: theme.ink }]}>{tr(meta.name)}</T>
              </View>
            )}

            {phase === "play" && (
              <GameBoundary key={run} onError={handleCrash}>
                <GameMount game={game} tier={tier} seed={seed} width={playW} height={playH} reduceMotion={reduceMotion} onFinish={handleFinish} />
              </GameBoundary>
            )}

            {phase === "result" && result && <ResultCard result={result} seed={seed} theme={theme} reduceMotion={reduceMotion} name={tr(meta.name)} onContinue={() => leave(() => onDone(result))} />}

            {phase === "error" && (
              <Pop reduceMotion={reduceMotion} style={{ flex: 1, padding: space.lg, gap: space.md, justifyContent: "center" }}>
                <View style={{ backgroundColor: theme.lcdBg, borderRadius: radius.lcd, padding: space.md, borderWidth: 2, borderColor: theme.keyLo }}>
                  <T style={[type.lcdM, { color: theme.lcdWarn }]}>ERR 0x2A</T>
                </View>
                <T style={[type.title, { color: theme.ink }]}>{t("error.title")}</T>
                <T style={[type.body, { color: theme.inkDim }]}>{t("error.body")}</T>
                <MiniKey label={autoLabel ?? t("host.auto")} tone="orange" onPress={() => leave(onAuto)} textStyle={{ fontSize: 13, paddingVertical: 8 }} />
                <MiniKey label={t("error.retry")} onPress={start} />
              </Pop>
            )}
          </View>
        </Pop>
      </View>
    </MiniThemeContext.Provider>
  );
}

function ResultCard({ result, seed, theme, reduceMotion, name, onContinue }: { result: MinigameResult; seed: number; theme: PanelTheme; reduceMotion: boolean; name: string; onContinue(): void }) {
  const t = useT("minigames");
  const grade = gradeOf(result.score);
  const pct = useCountUp(Math.round(result.score * 100), !reduceMotion);
  const kind = result.perfect ? "perfect" : result.success ? "success" : "fail";
  const line = t(`result.line.${kind}${Math.abs(seed) % LINES[kind]}`);
  const secs = Math.max(0, Math.round(result.durationMs / 1000));
  const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  return (
    <Pop reduceMotion={reduceMotion} style={{ flex: 1, padding: space.lg, gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View>
          <T style={[type.micro, { color: theme.inkDim }]}>{t("result.kicker")}</T>
          <T style={[type.heading, { color: theme.ink }]}>{name}</T>
        </View>
        <View style={{ backgroundColor: result.success ? theme.mint : theme.red, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs, borderWidth: 1, borderColor: "rgba(0,0,0,0.3)" }}>
          <T style={[type.key, { color: result.success ? "#15171C" : palette.bone2 }]}>{t(result.success ? "result.success" : "result.fail")}</T>
        </View>
      </View>

      <View style={{ backgroundColor: theme.lcdBg, borderRadius: radius.lcd, padding: space.md, gap: space.md, borderWidth: 2, borderColor: theme.keyLo }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
          <View>
            <T style={[type.micro, { color: theme.lcdOn, opacity: 0.6 }]}>{t("result.quality")}</T>
            <T style={{ fontFamily: fonts.lcd, fontSize: 52, lineHeight: 58, color: result.success ? theme.lcdOn : theme.lcdWarn }}>{pct}%</T>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <T style={[type.micro, { color: theme.lcdOn, opacity: 0.6 }]}>{t("result.time")}</T>
            <T style={[type.lcdL, { color: theme.lcdOn }]}>{time}</T>
          </View>
        </View>
        <ScoreMeter score={result.score} perfect={result.perfect} reduceMotion={reduceMotion} />
        {result.perfect && (
          <View style={{ position: "absolute", right: space.sm, top: space.sm }}>
            <Sticker label={t("result.perfect")} reduceMotion={reduceMotion} />
          </View>
        )}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View style={{ flexDirection: "row", gap: 5 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: i <= grade ? GRADE_COLOR[grade] : theme.ledOff, borderWidth: 1, borderColor: "rgba(0,0,0,0.35)", transform: [{ rotate: "45deg" }] }} />
          ))}
        </View>
        <T lines={1} style={[type.title, { color: theme.ink, flex: 1 }]}>
          {t(`result.grade.${grade}`)}
        </T>
      </View>

      <View style={{ backgroundColor: theme.well, borderRadius: radius.well, padding: space.md, borderWidth: 1, borderColor: theme.rule }}>
        <T style={[type.body, { color: theme.ink }]}>{line}</T>
      </View>
      <Vents theme={theme} />
      <MiniKey label={t("result.continue")} tone="orange" onPress={onContinue} textStyle={{ fontSize: 14, paddingVertical: 10 }} />
    </Pop>
  );
}

export default MinigameHost;

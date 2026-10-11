// Small shared toolkit so all nine mini-games look and behave like one family. Owned by the
// orchestrator. Views + Reanimated only (works in "lite" builds and on web).
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";

import { mulberry } from "@/engine/prng";
import type { L10n } from "@/engine/types";
import { tr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { dayTheme, MAX_FONT_SCALE, radius, space, type, type PanelTheme } from "@/ui/theme";

/** The host provides the active panel theme. */
export const MiniThemeContext = createContext<PanelTheme>(dayTheme);
export const useMiniTheme = (): PanelTheme => useContext(MiniThemeContext);

/** Deterministic random stream for puzzle generation: `const rnd = miniRng(seed); rnd()`. */
export function miniRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    const r = mulberry(s);
    s = r.state;
    return r.value;
  };
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Countdown that lives on the UI thread. `left` goes 1 -> 0 over `seconds`; `onTimeout` fires once.
 * Call `stop()` when the game ends early.
 */
export function useCountdown(seconds: number, onTimeout: () => void): { left: SharedValue<number>; stop(): void; startedAt: number } {
  const left = useSharedValue(1);
  const [startedAt] = useState(() => Date.now());
  const done = useRef(false);
  const cb = useRef(onTimeout);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    cb.current = onTimeout;
  });

  useEffect(() => {
    left.value = withTiming(0, { duration: seconds * 1000, easing: Easing.linear });
    timer.current = setTimeout(() => {
      if (!done.current) {
        done.current = true;
        cb.current();
      }
    }, seconds * 1000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      cancelAnimation(left);
    };
    // The countdown starts once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    left,
    startedAt,
    stop: () => {
      done.current = true;
      if (timer.current) clearTimeout(timer.current);
      cancelAnimation(left);
    },
  };
}

/** Top strip: title, LCD score readout and the time bar. Height is MINI_HUD_HEIGHT. */
export const MINI_HUD_HEIGHT = 58;

export function MiniHud({ title, left, score, warnBelow = 0.25 }: { title: L10n; left: SharedValue<number>; score?: string; warnBelow?: number }) {
  const t = useMiniTheme();
  const bar = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(1, left.value)) * 100}%`,
    backgroundColor: left.value < warnBelow ? t.orange : t.mint,
  }));
  return (
    <View style={{ height: MINI_HUD_HEIGHT, paddingHorizontal: space.md, justifyContent: "center", gap: space.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={[type.heading, { color: t.ink, flexShrink: 1 }]}>
          {tr(title)}
        </Text>
        {score !== undefined && (
          <View style={{ backgroundColor: t.lcdBg, borderRadius: radius.lcd, paddingHorizontal: space.sm, paddingVertical: 2, minWidth: 64, alignItems: "flex-end" }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[type.lcdM, { color: t.lcdOn }]}>
              {score}
            </Text>
          </View>
        )}
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: t.well, overflow: "hidden" }}>
        <Animated.View style={[{ height: 8, borderRadius: 4 }, bar]} />
      </View>
    </View>
  );
}

/** Rubber key with press travel, haptic and click. */
export function MiniKey({
  label,
  onPress,
  tone = "black",
  disabled,
  style,
  textStyle,
}: {
  label: string;
  onPress(): void;
  tone?: "black" | "orange" | "cobalt" | "mint" | "red";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const t = useMiniTheme();
  const down = useSharedValue(0);
  const bg = tone === "black" ? t.key : tone === "orange" ? t.orange : tone === "cobalt" ? t.cobalt : tone === "mint" ? t.mint : t.red;
  const fg = tone === "black" || tone === "cobalt" || tone === "red" ? t.keyText : "#15171C";
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: down.value * 3 }] }));
  return (
    <Pressable
      disabled={disabled}
      hitSlop={6}
      onPressIn={() => {
        down.value = withTiming(1, { duration: 40 });
        haptic("key");
        sfx("keyDown");
      }}
      onPressOut={() => {
        down.value = withTiming(0, { duration: 90 });
      }}
      onPress={onPress}
      style={style}
    >
      <View style={{ borderRadius: radius.key, backgroundColor: t.keyLo, paddingBottom: 3, opacity: disabled ? 0.45 : 1 }}>
        <Animated.View style={[{ minHeight: 44, borderRadius: radius.key, backgroundColor: bg, alignItems: "center", justifyContent: "center", paddingHorizontal: space.md }, anim]}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[type.key, { color: fg }, textStyle]}>
            {label}
          </Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

/** Panel-colored play surface with an inset well, so every game sits in the same frame. */
export function MiniStage({ width, height, children, dark }: { width: number; height: number; children: React.ReactNode; dark?: boolean }) {
  const t = useMiniTheme();
  return (
    <View style={{ width, height, backgroundColor: t.body }}>
      <View style={{ flex: 1, margin: space.sm, borderRadius: radius.well, backgroundColor: dark ? t.lcdBg : t.well, overflow: "hidden", borderWidth: 1, borderColor: t.rule }}>{children}</View>
    </View>
  );
}

export { haptic, sfx };

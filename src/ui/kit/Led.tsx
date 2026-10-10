// LEDs and the 16-step LED row. Brightness lives in shared values: a row driven by a shared
// progress value animates without a single React render.
import { memo, useEffect } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { timingTo, useDriven, useReduceMotion } from "./motion";
import { useTheme, type Accent, type KitTheme } from "./theme-context";

export type LedColor = Accent | "lcd";
export type LedState = "off" | "on" | "blink";

function ledColor(theme: KitTheme, color: LedColor): string {
  return color === "lcd" ? theme.lcdOn : theme[color];
}

interface LensProps {
  size: number;
  color: string;
  off: string;
  litStyle: ReturnType<typeof useAnimatedStyle<ViewStyle>>;
}

/** Unlit lens with a lit lens and a 2 pt halo stacked on top; one opacity drives both. */
function Lens({ size, color, off, litStyle }: LensProps) {
  const r = size / 2;
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ width: size, height: size, borderRadius: r, backgroundColor: off }} />
      <Animated.View pointerEvents="none" style={[{ position: "absolute", top: -2, left: -2, width: size + 4, height: size + 4 }, litStyle]}>
        <View style={{ position: "absolute", width: size + 4, height: size + 4, borderRadius: r + 2, backgroundColor: color, opacity: 0.28 }} />
        <View style={{ position: "absolute", top: 2, left: 2, width: size, height: size, borderRadius: r, backgroundColor: color }} />
        <View
          style={{
            position: "absolute",
            top: 2 + size * 0.18,
            left: 2 + size * 0.2,
            width: size * 0.3,
            height: size * 0.3,
            borderRadius: size * 0.15,
            backgroundColor: "#FFFFFF",
            opacity: 0.55,
          }}
        />
      </Animated.View>
    </View>
  );
}

export interface LedProps {
  state?: LedState;
  /** Shorthand for state="on" / "off". */
  on?: boolean;
  color?: LedColor;
  size?: number;
  /** Full blink period in ms. */
  blinkMs?: number;
  /** Drive brightness (0..1) from the UI thread; overrides `state`. */
  level?: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
}

export const Led = memo(function Led({ state, on, color = "orange", size = 6, blinkMs = 700, level, style }: LedProps) {
  const theme = useTheme();
  const reduce = useReduceMotion();
  const mode: LedState = state ?? (on ? "on" : "off");
  const own = useSharedValue(mode === "off" ? 0 : 1);

  useEffect(() => {
    if (level) return;
    cancelAnimation(own);
    if (mode === "blink" && !reduce) {
      const half = { duration: blinkMs / 2, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.Never };
      own.set(withRepeat(withSequence(withTiming(1, half), withTiming(0.12, half)), -1, false, undefined, ReduceMotion.Never));
    } else {
      own.set(timingTo(mode === "off" ? 0 : 1, "fast"));
    }
    return () => cancelAnimation(own);
  }, [mode, reduce, blinkMs, level, own]);

  const litStyle = useAnimatedStyle(() => ({ opacity: level ? level.value : own.value }));
  return (
    <View style={style} accessibilityElementsHidden importantForAccessibility="no">
      <Lens size={size} color={ledColor(theme, color)} off={theme.ledOff} litStyle={litStyle} />
    </View>
  );
});

// ---------------------------------------------------------------------------------------------
// LedRow

export type LedStep = "off" | "on" | "dim" | LedColor;

export interface LedRowProps {
  /** Number of LEDs. 16 is the house standard (sequencer steps, progress). */
  steps?: number;
  /** 0..1. The leading LED fades in, so slow progress still visibly moves. */
  progress?: number | SharedValue<number>;
  /** Explicit per-step states; a color name lights that step in that color. Overrides progress. */
  states?: readonly LedStep[];
  /** Step index highlighted as the play cursor (sequencers). */
  cursor?: number;
  /** Running light with a short tail: "busy" indicator. */
  chase?: boolean;
  chaseMs?: number;
  color?: LedColor;
  /** Color for the last `hotSteps` LEDs (overload zone of a meter). */
  hotColor?: LedColor;
  hotSteps?: number;
  size?: number;
  gap?: number;
  /** Spread LEDs across the full width instead of using a fixed gap. */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
}

interface StepProps {
  index: number;
  steps: number;
  size: number;
  color: string;
  off: string;
  progress: SharedValue<number>;
  phase: SharedValue<number>;
  /** 0 = progress, 1 = chase, 2 = fixed level. */
  mode: 0 | 1 | 2;
  fixed: number;
}

const Step = memo(function Step({ index, steps, size, color, off, progress, phase, mode, fixed }: StepProps) {
  const litStyle = useAnimatedStyle(() => {
    if (mode === 2) return { opacity: fixed };
    if (mode === 1) {
      const d = (((phase.value - index) % steps) + steps) % steps;
      return { opacity: d < 3 ? 1 - d / 3 : 0 };
    }
    const v = progress.value * steps - index;
    return { opacity: v <= 0 ? 0 : v >= 1 ? 1 : v };
  });
  return <Lens size={size} color={color} off={off} litStyle={litStyle} />;
});

export const LedRow = memo(function LedRow({
  steps = 16,
  progress = 0,
  states,
  cursor,
  chase,
  chaseMs = 1100,
  color = "orange",
  hotColor,
  hotSteps = 3,
  size = 6,
  gap = 4,
  fill = true,
  style,
}: LedRowProps) {
  const theme = useTheme();
  const reduce = useReduceMotion();
  const p = useDriven(progress, "base");
  const phase = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(phase);
    phase.set(0);
    if (chase && !reduce) {
      phase.set(withRepeat(withTiming(steps, { duration: chaseMs, easing: Easing.linear, reduceMotion: ReduceMotion.Never }), -1, false, undefined, ReduceMotion.Never));
    }
    return () => cancelAnimation(phase);
  }, [chase, reduce, steps, chaseMs, phase]);

  const items = [];
  for (let i = 0; i < steps; i++) {
    let c: LedColor = hotColor && i >= steps - hotSteps ? hotColor : color;
    let mode: 0 | 1 | 2 = chase ? (reduce ? 2 : 1) : 0;
    let fixed = chase && reduce ? (i % 4 === 0 ? 1 : 0) : 0;
    if (states) {
      const s = states[i] ?? "off";
      mode = 2;
      if (s === "off") fixed = 0;
      else if (s === "on") fixed = 1;
      else if (s === "dim") fixed = 0.35;
      else {
        fixed = 1;
        c = s;
      }
    }
    if (cursor === i) {
      mode = 2;
      fixed = 1;
      c = "lcd";
    }
    items.push(
      <Step key={i} index={i} steps={steps} size={size} color={ledColor(theme, c)} off={theme.ledOff} progress={p} phase={phase} mode={mode} fixed={fixed} />,
    );
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ flexDirection: "row", alignItems: "center", justifyContent: fill ? "space-between" : "flex-start", gap: fill ? undefined : gap, paddingVertical: 2 }, style]}
    >
      {items}
    </View>
  );
});

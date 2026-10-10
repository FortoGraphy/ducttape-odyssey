// Bars and dials. Every moving part is a transform or a color driven by a shared value, so a
// meter can follow the engine at 60 fps while React stays idle.
import { memo, useCallback, useEffect, useRef, type ReactNode } from "react";
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Line, Path } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import { palette, space } from "@/ui/theme";

import { isShared, springTo, useDriven } from "./motion";
import { MicroLabel } from "./Txt";
import { useTheme, type Accent, type KitTheme } from "./theme-context";

export type BarTone = Accent | "ink" | "good";

function barColor(theme: KitTheme, tone: BarTone): string {
  if (tone === "ink") return theme.ink;
  if (tone === "good") return theme.id === "day" ? palette.green1 : theme.mint;
  return theme[tone];
}

/** Colored stretch of a bar, starting at `from` (0..1) and running to the next zone or the end. */
export interface BarZone {
  from: number;
  tone: BarTone;
}

interface TrackProps {
  p: SharedValue<number>;
  height: number;
  zones: readonly BarZone[];
  segments?: number;
  style?: StyleProp<ViewStyle>;
}

/** Recessed slot with a fill that is revealed by a sliding clip (zones stay where they are). */
const Track = memo(function Track({ p, height, zones, segments, style }: TrackProps) {
  const theme = useTheme();
  const width = useSharedValue(0);
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      width.set(e.nativeEvent.layout.width);
    },
    [width],
  );
  const clipStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -(1 - Math.min(1, Math.max(0, p.value))) * width.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - Math.min(1, Math.max(0, p.value))) * width.value }] }));

  const dividers = [];
  if (segments && segments > 1) {
    for (let i = 1; i < segments; i++) {
      dividers.push(<View key={i} style={{ position: "absolute", top: 0, bottom: 0, width: 1, left: `${(i / segments) * 100}%`, backgroundColor: theme.bezel, opacity: 0.55 }} />);
    }
  }

  return (
    <View
      style={[
        { height: height + 2, borderRadius: 3, backgroundColor: theme.bezel, borderTopWidth: 1, borderTopColor: theme.keyLo, borderBottomWidth: 1, borderBottomColor: theme.bodyHi, overflow: "hidden" },
        style,
      ]}
    >
      <View onLayout={onLayout} style={{ flex: 1, overflow: "hidden" }}>
        <Animated.View style={[StyleSheet.absoluteFill, { overflow: "hidden" }, clipStyle]}>
          <Animated.View style={[StyleSheet.absoluteFill, fillStyle]}>
            {zones.map((z, i) => (
              <View key={i} style={{ position: "absolute", top: 0, bottom: 0, right: 0, left: `${z.from * 100}%`, backgroundColor: barColor(theme, z.tone) }} />
            ))}
          </Animated.View>
        </Animated.View>
        {dividers}
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------------------------
// ProgressBar

export interface ProgressBarProps {
  /** 0..1. Pass a shared value to animate without re-rendering. */
  value: number | SharedValue<number>;
  tone?: BarTone;
  height?: number;
  /** Draw the bar as this many blocks. */
  segments?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export const ProgressBar = memo(function ProgressBar({ value, tone = "orange", height = 6, segments, accessibilityLabel, style }: ProgressBarProps) {
  const p = useDriven(value, "base");
  const zones = ZONE_CACHE[tone];
  return (
    <View
      accessible={!!accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={isShared(value) ? undefined : { min: 0, max: 100, now: Math.round(value * 100) }}
      style={style}
    >
      <Track p={p} height={height} zones={zones} segments={segments} />
    </View>
  );
});

const ZONE_CACHE: Record<BarTone, readonly BarZone[]> = {
  orange: [{ from: 0, tone: "orange" }],
  cobalt: [{ from: 0, tone: "cobalt" }],
  yellow: [{ from: 0, tone: "yellow" }],
  mint: [{ from: 0, tone: "mint" }],
  red: [{ from: 0, tone: "red" }],
  ink: [{ from: 0, tone: "ink" }],
  good: [{ from: 0, tone: "good" }],
};

// ---------------------------------------------------------------------------------------------
// Meter

export interface MeterProps {
  value: number | SharedValue<number>;
  label?: string;
  /** Printed at the right end of the legend ("72 %"). */
  valueText?: string;
  tone?: BarTone;
  /** Zones override `tone`: for example mint to 0.6, yellow to 0.85, red above. */
  zones?: readonly BarZone[];
  ticks?: number;
  height?: number;
  segments?: number;
  style?: StyleProp<ViewStyle>;
}

/** Bar with a printed scale under it and an optional legend above. */
export const Meter = memo(function Meter({ value, label, valueText, tone = "mint", zones, ticks = 11, height = 8, segments, style }: MeterProps) {
  const theme = useTheme();
  const p = useDriven(value, "base");
  const marks = [];
  for (let i = 0; i < ticks; i++) {
    const strong = i === 0 || i === ticks - 1 || (ticks % 2 === 1 && i === (ticks - 1) / 2);
    marks.push(<View key={i} style={{ width: 1, height: strong ? 4 : 2, backgroundColor: strong ? theme.ink : theme.inkDim }} />);
  }
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={valueText ? { text: valueText } : isShared(value) ? undefined : { min: 0, max: 100, now: Math.round(value * 100) }}
      style={[{ gap: space.xxs }, style]}
    >
      {label || valueText ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <MicroLabel>{label ?? ""}</MicroLabel>
          {valueText ? <MicroLabel color="ink">{valueText}</MicroLabel> : null}
        </View>
      ) : null}
      <Track p={p} height={height} zones={zones ?? ZONE_CACHE[tone]} segments={segments} />
      <View pointerEvents="none" style={{ flexDirection: "row", justifyContent: "space-between", height: 4, paddingHorizontal: 0.5 }}>
        {marks}
      </View>
    </View>
  );
});

/** Ready-made zones for heat / pressure style meters. */
export const HEAT_ZONES: readonly BarZone[] = [
  { from: 0, tone: "mint" },
  { from: 0.6, tone: "yellow" },
  { from: 0.85, tone: "red" },
];

// ---------------------------------------------------------------------------------------------
// TimerBar

export interface TimerBarProps {
  /** Countdown length in ms. Ignored when `remaining` is given. */
  duration?: number;
  running?: boolean;
  /** Change it to restart the countdown. */
  resetKey?: string | number;
  onDone?: () => void;
  /** Externally driven remaining fraction (1 = full, 0 = out of time). */
  remaining?: SharedValue<number>;
  tone?: Accent;
  /** Remaining fraction under which the bar turns red. */
  warnAt?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

/** Depleting bar. Runs on the UI thread and keeps moving under reduce-motion: it is information. */
export const TimerBar = memo(function TimerBar({ duration = 10000, running = true, resetKey, onDone, remaining, tone = "orange", warnAt = 0.25, height = 6, style }: TimerBarProps) {
  const theme = useTheme();
  const own = useSharedValue(1);
  const r = remaining ?? own;
  const width = useSharedValue(0);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  const done = useCallback(() => onDoneRef.current?.(), []);

  // The remaining fraction is tracked on the JS side too, so pause / resume never has to read
  // the shared value back from the UI thread.
  const clock = useRef({ key: resetKey, fraction: 1, startedAt: 0, ticking: false });
  useEffect(() => {
    if (remaining) return;
    const c = clock.current;
    const now = Date.now();
    if (c.ticking) c.fraction = Math.max(0, c.fraction - (now - c.startedAt) / Math.max(1, duration));
    if (c.key !== resetKey) {
      c.key = resetKey;
      c.fraction = 1;
    }
    cancelAnimation(own);
    own.set(c.fraction);
    c.ticking = running && c.fraction > 0;
    c.startedAt = now;
    if (c.ticking) {
      own.set(
        withTiming(0, { duration: duration * c.fraction, easing: Easing.linear, reduceMotion: ReduceMotion.Never }, (finished) => {
          if (finished) scheduleOnRN(done);
        }),
      );
    }
    return () => cancelAnimation(own);
  }, [running, duration, resetKey, remaining, own, done]);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      width.set(e.nativeEvent.layout.width);
    },
    [width],
  );
  const base = theme[tone];
  const hot = theme.red;
  const fillStyle = useAnimatedStyle(() => {
    const v = Math.min(1, Math.max(0, r.value));
    return {
      transform: [{ translateX: -(1 - v) * width.value }],
      backgroundColor: interpolateColor(v, [warnAt * 0.6, warnAt], [hot, base]),
    };
  });

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        { height: height + 2, borderRadius: 3, backgroundColor: theme.bezel, borderTopWidth: 1, borderTopColor: theme.keyLo, borderBottomWidth: 1, borderBottomColor: theme.bodyHi, overflow: "hidden" },
        style,
      ]}
    >
      <View onLayout={onLayout} style={{ flex: 1, overflow: "hidden" }}>
        <Animated.View style={[StyleSheet.absoluteFill, fillStyle]} />
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------------------------
// Gauge

export interface GaugeProps {
  /** 0..1. A plain number makes the needle swing with a spring; a shared value is followed exactly. */
  value: number | SharedValue<number>;
  /** Dial diameter. */
  size?: number;
  label?: string;
  /** Start of the caution and danger zones (0..1). */
  warnFrom?: number;
  dangerFrom?: number;
  /** Placed in the lower part of the dial (a small readout). */
  children?: ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const GAUGE_SWEEP = 240;

function polar(c: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [c + Math.sin(a) * r, c - Math.cos(a) * r];
}

function arc(c: number, r: number, from: number, to: number): string {
  const a0 = -GAUGE_SWEEP / 2 + from * GAUGE_SWEEP;
  const a1 = -GAUGE_SWEEP / 2 + to * GAUGE_SWEEP;
  const [x0, y0] = polar(c, r, a0);
  const [x1, y1] = polar(c, r, a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

interface FaceProps {
  size: number;
  warnFrom: number;
  dangerFrom: number;
  ok: string;
  warn: string;
  danger: string;
  tick: string;
}

const GaugeFace = memo(function GaugeFace({ size, warnFrom, dangerFrom, ok, warn, danger, tick }: FaceProps) {
  const c = size / 2;
  const r = size / 2 - 8;
  const ticks = [];
  for (let i = 0; i <= 10; i++) {
    const deg = -GAUGE_SWEEP / 2 + (i / 10) * GAUGE_SWEEP;
    const strong = i % 5 === 0;
    const [x0, y0] = polar(c, r - 4, deg);
    const [x1, y1] = polar(c, r - (strong ? 9 : 7), deg);
    ticks.push(<Line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={tick} strokeWidth={strong ? 1.5 : 1} opacity={strong ? 0.9 : 0.5} />);
  }
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path d={arc(c, r, 0, warnFrom - 0.01)} stroke={ok} strokeWidth={3} fill="none" />
      <Path d={arc(c, r, warnFrom + 0.01, dangerFrom - 0.01)} stroke={warn} strokeWidth={3} fill="none" />
      <Path d={arc(c, r, dangerFrom + 0.01, 1)} stroke={danger} strokeWidth={3} fill="none" />
      {ticks}
    </Svg>
  );
});

/** Round instrument dial with a spring-loaded needle: heat, pressure, reactor load. */
export const Gauge = memo(function Gauge({ value, size = 88, label, warnFrom = 0.6, dangerFrom = 0.85, children, accessibilityLabel, style }: GaugeProps) {
  const theme = useTheme();
  const shared = isShared(value);
  const own = useSharedValue(shared ? 0 : value);
  const plain = shared ? 0 : value;
  useEffect(() => {
    if (!shared) own.set(springTo(plain, "needle"));
  }, [shared, plain, own]);
  const v = shared ? value : own;

  const needleStyle = useAnimatedStyle(() => {
    // Let the spring overshoot a little past the end stops, like a real needle.
    const clamped = Math.min(1.04, Math.max(-0.04, v.value));
    return { transform: [{ rotate: `${(((clamped - 0.5) * GAUGE_SWEEP) / 180) * Math.PI}rad` }] };
  });

  const r = size / 2 - 8;
  const hub = Math.max(10, Math.round(size * 0.16));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityValue={shared ? undefined : { min: 0, max: 100, now: Math.round(value * 100) }}
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.bezel, borderTopWidth: 1, borderTopColor: theme.keyLo, borderBottomWidth: 1, borderBottomColor: theme.bodyHi }, style]}
    >
      <GaugeFace size={size} warnFrom={warnFrom} dangerFrom={dangerFrom} ok={theme.mint} warn={theme.yellow} danger={theme.red} tick={palette.bone1} />
      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: size * 0.62, alignItems: "center", gap: 1 }}>
        {label ? <MicroLabel color={palette.steel3}>{label}</MicroLabel> : null}
        {children}
      </View>
      <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: -1, width: size, height: size, alignItems: "center" }, needleStyle]}>
        <View style={{ marginTop: size / 2 - (r - 6), width: 2, height: r - 6 + hub * 0.2, borderRadius: 1, backgroundColor: theme.orange }} />
      </Animated.View>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: size / 2 - hub / 2,
          top: size / 2 - hub / 2 - 1,
          width: hub,
          height: hub,
          borderRadius: hub / 2,
          backgroundColor: theme.keyHi,
          borderTopWidth: 1,
          borderTopColor: palette.steel1,
        }}
      />
    </View>
  );
});

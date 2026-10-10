// LCD glass and its readouts. Unlit cells stay faintly visible ("ghost segments"); numbers roll
// between values on the UI thread through an animated text prop, with no React state per frame.
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, TextInput, View, type LayoutChangeEvent, type StyleProp, type TextInputProps, type TextStyle, type ViewProps, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { MAX_FONT_SCALE, radius, space, type } from "@/ui/theme";

import { useDriven, useReduceMotion } from "./motion";
import { LINE_HEIGHT, Txt } from "./Txt";
import { useTheme, type KitTheme } from "./theme-context";

export type LcdSize = "xl" | "l" | "m" | "s";
export type LcdTone = "normal" | "warn" | "dim";

const VARIANT = { xl: "lcdXL", l: "lcdL", m: "lcdM", s: "lcdS" } as const;

function litColor(theme: KitTheme, tone: LcdTone): string {
  return tone === "warn" ? theme.lcdWarn : theme.lcdOn;
}

// ---------------------------------------------------------------------------------------------
// Lcd

export interface LcdProps extends ViewProps {
  padding?: number;
  gap?: number;
  children?: ReactNode;
}

/** Near-black glass in a plastic bezel. Put LcdNumber / LcdText / LcdMeter inside. */
export function Lcd({ padding = space.sm, gap, style, children, ...rest }: LcdProps) {
  const theme = useTheme();
  return (
    <View {...rest} style={[{ backgroundColor: theme.bezel, borderRadius: radius.lcd + 2, padding: 2, borderBottomWidth: 1, borderBottomColor: theme.bodyHi }, style]}>
      <View
        style={{
          backgroundColor: theme.lcdBg,
          borderRadius: radius.lcd,
          borderTopWidth: 1,
          borderTopColor: "#000000",
          paddingHorizontal: padding + 2,
          paddingVertical: padding,
          gap,
          overflow: "hidden",
        }}
      >
        {children}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// LcdNumber

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/** Digit cells (and the `pad` leading or trailing padding cells) show a faint "8"; letters, units and separators stay clear. */
function ghostOf(text: string, pad: number, padLeft: boolean): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const isPad = padLeft ? i < pad : i >= text.length - pad;
    out += isPad || (code >= 48 && code <= 57) ? "8" : " ";
  }
  return out;
}

export interface LcdNumberProps {
  /** The formatted target, exactly as it should read ("1 234", "12,5 M", "00:42"). */
  text: string;
  /** Numeric value behind the text. Only its direction of change is used (digits roll up or down). */
  value: number;
  size?: LcdSize;
  tone?: LcdTone;
  align?: "left" | "right" | "center";
  /** Minimum number of character cells (pads the ghost so the readout does not jump in width). */
  minChars?: number;
  ghost?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const ROLL_MIN_MS = 90;
const ROLL_MAX_MS = 320;

export const LcdNumber = memo(function LcdNumber({ text, value, size = "l", tone = "normal", align = "right", minChars = 0, ghost = true, accessibilityLabel, style }: LcdNumberProps) {
  const theme = useTheme();
  const reduce = useReduceMotion();
  const variant = VARIANT[size];
  const from = useSharedValue(text);
  const to = useSharedValue(text);
  const dir = useSharedValue(1);
  const progress = useSharedValue(1);
  const last = useRef({ text, value, at: 0 });

  useEffect(() => {
    const prev = last.current;
    if (prev.text === text) return;
    const now = Date.now();
    // A value that changes every engine pulse should flow, not restart a long ease each time.
    const gap = now - prev.at;
    const steady = gap < ROLL_MAX_MS;
    dir.set(value >= prev.value ? 1 : -1);
    from.set(prev.text);
    to.set(text);
    last.current = { text, value, at: now };
    if (reduce) {
      progress.set(1);
      return;
    }
    progress.set(0);
    progress.set(
      withTiming(1, {
        duration: steady ? Math.max(ROLL_MIN_MS, gap) : ROLL_MAX_MS,
        easing: steady ? Easing.linear : Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [text, value, reduce, from, to, dir, progress]);

  const animatedProps = useAnimatedProps(() => {
    const target = to.value;
    const p = progress.value;
    if (p >= 1) return { text: target, defaultValue: target } as TextInputProps;
    const source = from.value;
    const up = dir.value > 0;
    const shift = source.length - target.length;
    let out = "";
    for (let i = 0; i < target.length; i++) {
      const cb = target.charCodeAt(i);
      if (cb < 48 || cb > 57) {
        out += target[i];
        continue;
      }
      const j = i + shift;
      const ca = j >= 0 ? source.charCodeAt(j) : 48;
      const da = ca >= 48 && ca <= 57 ? ca - 48 : 0;
      const db = cb - 48;
      if (da === db) {
        out += target[i];
        continue;
      }
      const delta = up ? (db - da + 10) % 10 : -((da - db + 10) % 10);
      out += String.fromCharCode(48 + (((Math.round(da + delta * p) % 10) + 10) % 10));
    }
    return { text: out, defaultValue: out } as TextInputProps;
  });

  const pad = Math.max(0, minChars - text.length);
  const cells = align === "left" ? text + " ".repeat(pad) : " ".repeat(pad) + text;
  const lineHeight = LINE_HEIGHT[variant];
  // No lineHeight on the inputs: a single-line field centers its text by itself, and a lineHeight
  // style would push the baseline down on iOS.
  const font: TextStyle = { ...(type[variant] as TextStyle), height: lineHeight, textAlign: align, padding: 0, margin: 0 };
  const lit = litColor(theme, tone);

  return (
    <View pointerEvents="none" accessible accessibilityRole="text" accessibilityLabel={accessibilityLabel ?? text} style={[{ height: lineHeight }, style]}>
      {/* Invisible sizer: gives the readout its width; the inputs below fill it. */}
      <Txt variant={variant} numberOfLines={1} style={{ opacity: 0 }}>
        {cells}
      </Txt>
      {ghost ? (
        <TextInput
          editable={false}
          focusable={false}
          accessible={false}
          importantForAccessibility="no"
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          value={ghostOf(cells, pad, align !== "left")}
          style={[StyleSheet.absoluteFill, font, { color: theme.lcdDim }]}
        />
      ) : null}
      <AnimatedTextInput
        editable={false}
        focusable={false}
        accessible={false}
        importantForAccessibility="no"
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        defaultValue={text}
        animatedProps={animatedProps}
        style={[StyleSheet.absoluteFill, font, { color: lit, opacity: tone === "dim" ? 0.55 : 1 }]}
      />
    </View>
  );
});

// ---------------------------------------------------------------------------------------------
// LcdText

export interface LcdTextProps {
  children: string;
  size?: LcdSize;
  tone?: LcdTone;
  align?: "left" | "right" | "center";
  /** Scroll the line when it does not fit (KIPP's longer remarks). Otherwise it is cut with "…". */
  marquee?: boolean;
  /** Marquee speed in points per second. */
  speed?: number;
  upper?: boolean;
  style?: StyleProp<ViewStyle>;
}

const MARQUEE_GAP = 40;
const MARQUEE_HOLD_MS = 1200;

export const LcdText = memo(function LcdText({ children, size = "m", tone = "normal", align = "left", marquee, speed = 42, upper, style }: LcdTextProps) {
  const theme = useTheme();
  const reduce = useReduceMotion();
  const variant = VARIANT[size];
  const lineHeight = LINE_HEIGHT[variant];
  const color = litColor(theme, tone);
  const opacity = tone === "dim" ? 0.55 : 1;
  const [box, setBox] = useState(0);
  const [content, setContent] = useState(0);
  const x = useSharedValue(0);
  const scrolling = !!marquee && !reduce && box > 0 && content > box + 1;

  useEffect(() => {
    cancelAnimation(x);
    x.set(0);
    if (!scrolling) return;
    const distance = content + MARQUEE_GAP;
    x.set(
      withRepeat(
        withSequence(
          withDelay(MARQUEE_HOLD_MS, withTiming(-distance, { duration: (distance / speed) * 1000, easing: Easing.linear, reduceMotion: ReduceMotion.Never })),
          withTiming(0, { duration: 0, reduceMotion: ReduceMotion.Never }),
        ),
        -1,
        false,
        undefined,
        ReduceMotion.Never,
      ),
    );
    return () => cancelAnimation(x);
  }, [scrolling, content, speed, x]);

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const onBox = useCallback((e: LayoutChangeEvent) => setBox(e.nativeEvent.layout.width), []);
  const onContent = useCallback((e: LayoutChangeEvent) => setContent(e.nativeEvent.layout.width), []);

  if (!marquee) {
    return (
      <Txt variant={variant} color={color} align={align} upper={upper} numberOfLines={1} style={[{ opacity }, style as StyleProp<TextStyle>]}>
        {children}
      </Txt>
    );
  }

  return (
    <View onLayout={onBox} accessible accessibilityRole="text" accessibilityLabel={children} style={[{ height: lineHeight, overflow: "hidden", alignSelf: "stretch" }, style]}>
      <Animated.View style={[marqueeStyles.row, rowStyle]}>
        <Txt variant={variant} color={color} upper={upper} numberOfLines={1} onLayout={onContent} style={{ opacity }}>
          {children}
        </Txt>
        {scrolling ? (
          <Txt variant={variant} color={color} upper={upper} numberOfLines={1} style={{ opacity, marginLeft: MARQUEE_GAP }}>
            {children}
          </Txt>
        ) : null}
      </Animated.View>
    </View>
  );
});

// A fixed, generous width lets the row lay its text out unwrapped regardless of the box width.
const marqueeStyles = StyleSheet.create({ row: { position: "absolute", left: 0, top: 0, width: 6000, flexDirection: "row" } });

// ---------------------------------------------------------------------------------------------
// LcdMeter

export interface LcdMeterProps {
  /** 0..1, plain or shared (shared values animate with no re-render). */
  value: number | SharedValue<number>;
  segments?: number;
  height?: number;
  tone?: LcdTone;
  /** Fraction from which the bar is drawn in the warning color (an overload zone). */
  warnFrom?: number;
  style?: StyleProp<ViewStyle>;
}

/** Segmented bar on the glass. Whole segments only, like a real LCD bargraph. */
export const LcdMeter = memo(function LcdMeter({ value, segments = 16, height = 8, tone = "normal", warnFrom, style }: LcdMeterProps) {
  const theme = useTheme();
  const p = useDriven(value, "fast");
  const width = useSharedValue(0);
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      width.set(e.nativeEvent.layout.width);
    },
    [width],
  );

  // The lit bar is revealed by sliding a clip window while its content slides back: transforms
  // only, no layout pass per frame.
  const clipStyle = useAnimatedStyle(() => {
    const q = Math.round(Math.min(1, Math.max(0, p.value)) * segments) / segments;
    return { transform: [{ translateX: -(1 - q) * width.value }] };
  });
  const barStyle = useAnimatedStyle(() => {
    const q = Math.round(Math.min(1, Math.max(0, p.value)) * segments) / segments;
    return { transform: [{ translateX: (1 - q) * width.value }] };
  });

  const dividers = [];
  for (let i = 1; i < segments; i++) {
    dividers.push(<View key={i} style={{ position: "absolute", top: 0, bottom: 0, width: 2, marginLeft: -1, left: `${(i / segments) * 100}%`, backgroundColor: theme.lcdBg }} />);
  }
  const lit = litColor(theme, tone);
  // The warning zone starts on a segment boundary, never inside a segment.
  const warnEdge = warnFrom === undefined ? undefined : Math.round(warnFrom * segments) / segments;

  return (
    <View onLayout={onLayout} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ height, overflow: "hidden", alignSelf: "stretch" }, style]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.lcdDim }]} />
      <Animated.View style={[StyleSheet.absoluteFill, { overflow: "hidden" }, clipStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: lit, opacity: tone === "dim" ? 0.55 : 1 }, barStyle]}>
          {warnEdge !== undefined ? <View style={{ position: "absolute", top: 0, bottom: 0, right: 0, left: `${warnEdge * 100}%`, backgroundColor: theme.lcdWarn }} /> : null}
        </Animated.View>
      </Animated.View>
      {dividers}
    </View>
  );
});

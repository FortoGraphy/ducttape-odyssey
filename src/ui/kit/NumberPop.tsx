// Floating number pops ("+123" rising from where the player tapped). A fixed pool of views is
// mounted once; a pop only writes a few shared values, so nothing is allocated or rendered per pop.
import { memo, useEffect, useMemo } from "react";
import { StyleSheet, TextInput, View, type GestureResponderEvent, type TextInputProps } from "react-native";
import Animated, { Easing, makeMutable, ReduceMotion, useAnimatedProps, useAnimatedStyle, withTiming, type SharedValue } from "react-native-reanimated";

import { fonts } from "@/ui/fonts";
import { MAX_FONT_SCALE, palette } from "@/ui/theme";

import { reduceMotionFlag } from "./motion";
import { useTheme, type Tone } from "./theme-context";

export type PopTone = Tone | "plain";

const TONES: readonly PopTone[] = ["plain", "good", "warn", "bad", "info"];
const FONT_SIZE = 16;
const CELL = FONT_SIZE * 0.6; // Doto is monospaced, 600/1000 em
const TAG_H = 22;
const TAG_PAD = 5;
const RISE = 40;
const LIFE_MS = 850;

interface Slot {
  text: SharedValue<string>;
  x: SharedValue<number>;
  y: SharedValue<number>;
  tone: SharedValue<number>;
  /** 0 at birth, 1 when gone. Idle slots rest at 1. */
  t: SharedValue<number>;
}

interface Pool {
  slots: Slot[];
  next: number;
}

function createPool(size: number): Pool {
  const slots: Slot[] = [];
  for (let i = 0; i < size; i++) {
    slots.push({ text: makeMutable(""), x: makeMutable(0), y: makeMutable(0), tone: makeMutable(0), t: makeMutable(1) });
  }
  return { slots, next: 0 };
}

const pools: Pool[] = [];

/**
 * Pops `text` at window coordinates (x, y), for example a press event's pageX / pageY.
 * Uses the top-most mounted <NumberPopHost />; without one the call is ignored.
 */
export function popNumber(text: string, x: number, y: number, tone: PopTone = "plain"): void {
  const pool = pools[pools.length - 1];
  if (!pool) return;
  const slot = pool.slots[pool.next];
  pool.next = (pool.next + 1) % pool.slots.length;
  slot.text.set(text);
  slot.x.set(x);
  slot.y.set(y);
  slot.tone.set(Math.max(0, TONES.indexOf(tone)));
  slot.t.set(0);
  slot.t.set(withTiming(1, { duration: LIFE_MS, easing: Easing.linear, reduceMotion: ReduceMotion.Never }));
}

/** Convenience for press handlers: pops at the touch point. */
export function popNumberAt(event: GestureResponderEvent, text: string, tone: PopTone = "plain"): void {
  popNumber(text, event.nativeEvent.pageX, event.nativeEvent.pageY - 18, tone);
}

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface PopViewProps {
  slot: Slot;
  index: number;
  colors: readonly string[];
  glass: string;
}

const PopView = memo(function PopView({ slot, index, colors, glass }: PopViewProps) {
  // Neighbouring slots drift to alternating sides so rapid pops fan out instead of stacking.
  const drift = ((index % 3) - 1) * 10;
  const boxStyle = useAnimatedStyle(() => {
    const t = slot.t.value;
    if (t >= 1) return { opacity: 0, transform: [{ translateX: -1000 }, { translateY: 0 }, { scale: 1 }] };
    const still = reduceMotionFlag.value;
    const eased = 1 - (1 - t) * (1 - t) * (1 - t);
    const w = slot.text.value.length * CELL + TAG_PAD * 2;
    return {
      opacity: t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4,
      transform: [
        { translateX: slot.x.value - w / 2 + (still ? 0 : drift * eased) },
        { translateY: slot.y.value - TAG_H / 2 - (still ? 0 : RISE * eased) },
        { scale: still || t > 0.12 ? 1 : 0.7 + (t / 0.12) * 0.3 },
      ],
    };
  });
  const tagStyle = useAnimatedStyle(() => ({ width: slot.text.value.length * CELL + TAG_PAD * 2 }));
  const inkStyle = useAnimatedStyle(() => ({ color: colors[slot.tone.value] ?? colors[0] }));
  const animatedProps = useAnimatedProps(() => ({ text: slot.text.value, defaultValue: slot.text.value }) as TextInputProps);

  return (
    <Animated.View style={[styles.box, boxStyle]}>
      <Animated.View style={[styles.tag, { backgroundColor: glass }, tagStyle]}>
        <AnimatedTextInput
          editable={false}
          focusable={false}
          accessible={false}
          importantForAccessibility="no"
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          animatedProps={animatedProps}
          style={[styles.text, inkStyle]}
        />
      </Animated.View>
    </Animated.View>
  );
});

export interface NumberPopHostProps {
  /** Number of pooled views = maximum simultaneous pops (older ones are recycled). */
  pool?: number;
}

/** Mount once above the screen content (and it is mounted for you inside Sheet and Dialog). */
export const NumberPopHost = memo(function NumberPopHost({ pool: size = 12 }: NumberPopHostProps) {
  const theme = useTheme();
  const pool = useMemo(() => createPool(size), [size]);

  useEffect(() => {
    pools.push(pool);
    return () => {
      const i = pools.indexOf(pool);
      if (i >= 0) pools.splice(i, 1);
    };
  }, [pool]);

  const colors = useMemo(() => [palette.bone2, theme.lcdOn, palette.yellow, "#FF8795", palette.cobalt2], [theme.lcdOn]);

  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      {pool.slots.map((slot, i) => (
        <PopView key={i} slot={slot} index={i} colors={colors} glass={theme.lcdBg} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  box: { position: "absolute", left: 0, top: 0 },
  tag: { height: TAG_H, borderRadius: 4, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  text: { fontFamily: fonts.lcd, fontSize: FONT_SIZE, height: TAG_H, textAlign: "center", padding: 0, margin: 0, alignSelf: "stretch" },
});

// Motion vocabulary for the kit: spring presets, the reduce-motion switch and a press-scale helper.
// Springs use Reanimated 4's duration/dampingRatio form so they read the same on every device.
import { useEffect, useSyncExternalStore } from "react";
import type { ViewStyle } from "react-native";
import {
  Easing,
  makeMutable,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
  type WithSpringConfig,
  type WithTimingConfig,
} from "react-native-reanimated";

// Functional feedback (key travel, timers, meters) must still move when the system setting is on,
// so the kit opts out of Reanimated's automatic handling and decides per component.
const never = ReduceMotion.Never;

export const springs = {
  /** Key caps and switches returning to rest: quick, a hint of bounce. */
  key: { duration: 180, dampingRatio: 0.62, reduceMotion: never },
  /** Selection changes, toggles, fader caps. */
  snappy: { duration: 220, dampingRatio: 0.85, reduceMotion: never },
  /** Sheets and dialogs arriving. */
  sheet: { duration: 380, dampingRatio: 0.82, reduceMotion: never },
  /** Gauge needles: visibly mechanical. */
  needle: { duration: 420, dampingRatio: 0.55, reduceMotion: never },
  /** Calm settle without overshoot. */
  gentle: { duration: 320, dampingRatio: 1, reduceMotion: never },
} as const satisfies Record<string, WithSpringConfig>;
export type SpringName = keyof typeof springs;

export const timings = {
  press: { duration: 45, easing: Easing.out(Easing.quad), reduceMotion: never },
  fast: { duration: 120, easing: Easing.out(Easing.quad), reduceMotion: never },
  base: { duration: 220, easing: Easing.out(Easing.cubic), reduceMotion: never },
  slow: { duration: 420, easing: Easing.inOut(Easing.cubic), reduceMotion: never },
  linear: { duration: 1000, easing: Easing.linear, reduceMotion: never },
} as const satisfies Record<string, WithTimingConfig>;
export type TimingName = keyof typeof timings;

let reduce = false;
const listeners = new Set<() => void>();
/** Readable from worklets (`reduceMotionFlag.value`). */
export const reduceMotionFlag = makeMutable(false);

/** Called by the shell from the settings store. Decorative loops stop, entrances become cuts. */
export function setReduceMotion(next: boolean): void {
  if (reduce === next) return;
  reduce = next;
  reduceMotionFlag.set(next);
  listeners.forEach((fn) => fn());
}

export function getReduceMotion(): boolean {
  return reduce;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useReduceMotion(): boolean {
  return useSyncExternalStore(subscribe, getReduceMotion, getReduceMotion);
}

/** Spring to `to`, or cut straight to it when motion is reduced. Safe on both threads. */
export function springTo(to: number, name: SpringName = "snappy"): number {
  "worklet";
  if (reduceMotionFlag.value) return withTiming(to, { duration: 0, reduceMotion: never });
  return withSpring(to, springs[name]);
}

/** Timing to `to`, or a cut when motion is reduced. Safe on both threads. */
export function timingTo(to: number, name: TimingName = "base", duration?: number): number {
  "worklet";
  if (reduceMotionFlag.value) return withTiming(to, { duration: 0, reduceMotion: never });
  const cfg = timings[name];
  return withTiming(to, duration === undefined ? cfg : { duration, easing: cfg.easing, reduceMotion: never });
}

export interface PressScale {
  pressed: SharedValue<number>;
  /** Spread on an Animated.View. */
  style: ReturnType<typeof useAnimatedStyle<ViewStyle>>;
  onPressIn: () => void;
  onPressOut: () => void;
}

/**
 * Subtle scale-down for flat pressables (rows, chips, cards). Keys use real travel instead.
 * The animation runs on the UI thread; only the trigger comes from the press event.
 */
export function usePressScale(to = 0.97): PressScale {
  const pressed = useSharedValue(0);
  const style = useAnimatedStyle<ViewStyle>(() => ({ transform: [{ scale: 1 - (1 - to) * pressed.value }] }));
  return {
    pressed,
    style,
    onPressIn: () => {
      pressed.set(withTiming(1, timings.press));
    },
    onPressOut: () => {
      pressed.set(springTo(0, "key"));
    },
  };
}

/** Accepts either a plain number or a shared value and always hands back a shared value. */
export function isShared(v: unknown): v is SharedValue<number> {
  return typeof v === "object" && v !== null && "value" in v;
}

/**
 * Lets a component take `number | SharedValue<number>`: plain numbers are eased on the UI thread,
 * shared values are used as they are (the caller animates them, nothing re-renders).
 */
export function useDriven(value: number | SharedValue<number>, timing: TimingName | null = "base"): SharedValue<number> {
  const shared = isShared(value);
  const own = useSharedValue(shared ? 0 : value);
  const plain = shared ? 0 : value;
  useEffect(() => {
    if (shared) return;
    own.set(timing ? timingTo(plain, timing) : plain);
  }, [shared, plain, timing, own]);
  return shared ? value : own;
}

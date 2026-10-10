// Toasts: `toast("Saved")` from anywhere, shown by the top-most mounted <ToastHost />.
// One toast at a time, the rest wait in a short queue; identical messages are not stacked.
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { palette, space } from "@/ui/theme";

import { Icon } from "./Icon";
import { Led } from "./Led";
import { springTo, timings } from "./motion";
import { Txt } from "./Txt";
import { TONE_ACCENT, useTheme, type Tone } from "./theme-context";

export interface ToastOptions {
  tone?: Tone;
  /** Small upper-case heading above the message. */
  title?: string;
  icon?: string;
  /** Visible time in ms (default scales with the text length). */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  key: number;
  message: string;
}

const MAX_QUEUE = 6;
const queue: ToastItem[] = [];
const hosts: (() => void)[] = [];
let nextKey = 1;

function pump(): void {
  // Only the top-most host (the one inside an open sheet, if any) is asked to show the next toast.
  hosts[hosts.length - 1]?.();
}

/** Queue a toast. Safe to call from anywhere on the JS thread, also before a host is mounted. */
export function toast(message: string, options?: ToastOptions | Tone): void {
  const opts: ToastOptions = typeof options === "string" ? { tone: options } : (options ?? {});
  const lastQueued = queue[queue.length - 1];
  if (lastQueued && lastQueued.message === message && lastQueued.title === opts.title) return;
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push({ key: nextKey++, message, ...opts });
  pump();
}

/** Drops everything that is waiting (for example when a run is reset). */
export function clearToasts(): void {
  queue.length = 0;
}

export interface ToastHostProps {
  position?: "top" | "bottom";
  /** Distance from the safe-area edge. */
  offset?: number;
}

export const ToastHost = memo(function ToastHost({ position = "top", offset = space.sm }: ToastHostProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<ToastItem | null>(null);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = useSharedValue(0);

  const showNext = useCallback(() => {
    if (busy.current) return;
    const item = queue.shift();
    if (!item) return;
    busy.current = true;
    setCurrent(item);
  }, []);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    t.set(withTiming(0, timings.fast));
    timer.current = setTimeout(() => {
      busy.current = false;
      setCurrent(null);
      pump();
    }, 140);
  }, [t]);

  useEffect(() => {
    hosts.push(showNext);
    showNext();
    return () => {
      const i = hosts.indexOf(showNext);
      if (i >= 0) hosts.splice(i, 1);
      if (timer.current) clearTimeout(timer.current);
      busy.current = false;
      pump();
    };
  }, [showNext]);

  useEffect(() => {
    if (!current) return;
    t.set(0);
    t.set(springTo(1, "snappy"));
    AccessibilityInfo.announceForAccessibility(current.title ? `${current.title}. ${current.message}` : current.message);
    const duration = current.duration ?? Math.min(5000, 1600 + current.message.length * 45);
    timer.current = setTimeout(dismiss, duration);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [current, dismiss, t]);

  const dir = position === "top" ? -1 : 1;
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, t.value * 1.4),
    transform: [{ translateY: (1 - t.value) * 16 * dir }],
  }));

  if (!current) return null;
  const tone = current.tone ?? "info";
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: position === "top" ? "flex-start" : "flex-end" }]}>
      <Animated.View
        style={[{ marginHorizontal: space.md, marginTop: insets.top + offset, marginBottom: insets.bottom + offset }, style]}
      >
        <Pressable
          onPress={dismiss}
          accessibilityRole="alert"
          accessibilityLabel={current.message}
          style={[styles.strip, { backgroundColor: theme.bezel, borderTopColor: theme.keyHi, borderBottomColor: theme.keyLo, boxShadow: `0px 2px 4px ${theme.shadow}` }]}
        >
          {current.icon ? <Icon name={current.icon} size={16} color={palette.bone1} /> : <Led state={tone === "bad" ? "blink" : "on"} color={TONE_ACCENT[tone]} size={6} style={styles.led} />}
          <View style={styles.text}>
            {current.title ? (
              <Txt variant="micro" color={palette.steel3} upper numberOfLines={1}>
                {current.title}
              </Txt>
            ) : null}
            <Txt variant="body" color={palette.bone1} numberOfLines={3}>
              {current.message}
            </Txt>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  strip: { minHeight: 44, borderRadius: 7, borderTopWidth: 1, borderBottomWidth: 1, paddingHorizontal: space.md, paddingVertical: space.sm, flexDirection: "row", alignItems: "center", gap: space.sm },
  led: { marginHorizontal: 2 },
  text: { flex: 1, minWidth: 0 },
});

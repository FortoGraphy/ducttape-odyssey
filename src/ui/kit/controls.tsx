// Continuous and selector controls: rotary encoder, fader, slide switch and the segmented key row.
// Gestures run as worklets; JS only hears about a change when the (quantized) value really moved.
import { memo, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";
import Svg, { Circle, Line } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import { haptic, sfx } from "@/platform/feedback";
import { HIT, palette, space } from "@/ui/theme";

import { Key, KeyRow, type KeySize, type KeyTone } from "./Key";
import { springTo } from "./motion";
import { MicroLabel } from "./Txt";
import { useTheme, type Accent } from "./theme-context";

const SWEEP_DEG = 270;
const SWEEP_RAD = (SWEEP_DEG * Math.PI) / 180;
/** Continuous (step-less) controls report at most this often while dragging. */
const EMIT_GAP_MS = 50;

// ---------------------------------------------------------------------------------------------
// Knob

export interface KnobProps {
  value?: number;
  min?: number;
  max?: number;
  /** Detent size. Each detent ticks (haptic + sound) and reports once. */
  step?: number;
  onChange?: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  /** Endless encoder: no end stops, reports relative detents through `onTurn`. */
  endless?: boolean;
  /** +n / -n detents since the last call (endless mode). */
  onTurn?: (detents: number) => void;
  /** Detents per revolution in endless mode. */
  detents?: number;
  /** Cap diameter. The dial (cap + tick ring) is 16 pt larger. */
  size?: number;
  label?: string;
  /** Color of the painted indicator line. */
  indicator?: Accent | "bone";
  disabled?: boolean;
  /** Mirror of the live value for UI-thread consumers (an LcdMeter next to the knob...). */
  live?: SharedValue<number>;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

interface DialProps {
  size: number;
  endless: boolean;
  tick: string;
  tickStrong: string;
}

const Dial = memo(function Dial({ size, endless, tick, tickStrong }: DialProps) {
  const w = size + 16;
  const c = w / 2;
  const r0 = size / 2 + 3;
  const marks: ReactNode[] = [];
  if (endless) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      marks.push(<Circle key={i} cx={c + Math.sin(a) * (r0 + 1.5)} cy={c - Math.cos(a) * (r0 + 1.5)} r={i % 6 === 0 ? 1.1 : 0.7} fill={i % 6 === 0 ? tickStrong : tick} />);
    }
  } else {
    for (let i = 0; i <= 10; i++) {
      const a = ((-135 + i * 27) * Math.PI) / 180;
      const strong = i === 0 || i === 5 || i === 10;
      const r1 = r0 + (strong ? 4 : 2.5);
      marks.push(
        <Line
          key={i}
          x1={c + Math.sin(a) * r0}
          y1={c - Math.cos(a) * r0}
          x2={c + Math.sin(a) * r1}
          y2={c - Math.cos(a) * r1}
          stroke={strong ? tickStrong : tick}
          strokeWidth={strong ? 1.5 : 1}
        />,
      );
    }
  }
  return (
    <Svg width={w} height={w} style={StyleSheet.absoluteFill} pointerEvents="none">
      {marks}
    </Svg>
  );
});

export const Knob = memo(function Knob({
  value = 0,
  min = 0,
  max = 1,
  step,
  onChange,
  onChangeEnd,
  endless = false,
  onTurn,
  detents = 24,
  size = 56,
  label,
  indicator = "orange",
  disabled,
  live,
  accessibilityLabel,
  style,
}: KnobProps) {
  const theme = useTheme();
  const w = size + 16;
  const span = max - min || 1;

  // `raw` follows the finger continuously; `shown` is what the cap displays (snapped to detents).
  const raw = useSharedValue(endless ? 0 : value);
  const shown = useSharedValue(endless ? 0 : value);
  const dragging = useSharedValue(false);
  const prevAngle = useSharedValue(0);
  const prevX = useSharedValue(0);
  const prevY = useSharedValue(0);
  const lastEmit = useSharedValue(0);

  useEffect(() => {
    if (endless || dragging.value) return;
    raw.set(value);
    shown.set(value);
    if (live) live.set(value);
  }, [value, endless, raw, shown, dragging, live]);

  const emitDetent = useCallback(
    (v: number) => {
      haptic("detent");
      sfx("knobTick");
      onChange?.(v);
    },
    [onChange],
  );
  const emitSmooth = useCallback((v: number) => onChange?.(v), [onChange]);
  const emitEnd = useCallback((v: number) => onChangeEnd?.(v), [onChangeEnd]);
  const emitTurn = useCallback(
    (n: number) => {
      haptic("detent");
      sfx("knobTick");
      onTurn?.(n);
    },
    [onTurn],
  );

  const gesture = useMemo(() => {
    const detentRad = (Math.PI * 2) / Math.max(1, detents);
    return Gesture.Pan()
      .enabled(!disabled)
      .minDistance(0)
      .maxPointers(1)
      .shouldCancelWhenOutside(false)
      .onBegin((e) => {
        dragging.set(true);
        prevX.set(e.x);
        prevY.set(e.y);
        prevAngle.set(Math.atan2(e.y - w / 2, e.x - w / 2));
      })
      .onUpdate((e) => {
        const dx = e.x - w / 2;
        const dy = e.y - w / 2;
        const angle = Math.atan2(dy, dx);
        let turn: number;
        if (dx * dx + dy * dy < 144) {
          // Too close to the axis for a stable angle: read the drag as a straight pull instead.
          turn = ((e.x - prevX.value - (e.y - prevY.value)) * Math.PI) / 110;
        } else {
          turn = angle - prevAngle.value;
          if (turn > Math.PI) turn -= Math.PI * 2;
          else if (turn < -Math.PI) turn += Math.PI * 2;
        }
        prevAngle.set(angle);
        prevX.set(e.x);
        prevY.set(e.y);
        if (turn === 0) return;

        if (endless) {
          const before = Math.round(raw.value / detentRad);
          raw.set(raw.value + turn);
          const after = Math.round(raw.value / detentRad);
          if (after !== before) {
            shown.set(after * detentRad);
            scheduleOnRN(emitTurn, after - before);
          }
          return;
        }

        const next = Math.min(max, Math.max(min, raw.value + (turn / SWEEP_RAD) * span));
        raw.set(next);
        const q = step ? Math.min(max, Math.max(min, min + Math.round((next - min) / step) * step)) : next;
        if (q === shown.value) return;
        shown.set(q);
        if (live) live.set(q);
        if (step) {
          scheduleOnRN(emitDetent, q);
        } else {
          // Runs in the gesture worklet, not during render.
          // eslint-disable-next-line react-hooks/purity
          const now = Date.now();
          if (now - lastEmit.value >= EMIT_GAP_MS) {
            lastEmit.set(now);
            scheduleOnRN(emitSmooth, q);
          }
        }
      })
      .onFinalize(() => {
        if (!dragging.value) return;
        dragging.set(false);
        if (endless) return;
        raw.set(shown.value);
        if (!step) scheduleOnRN(emitSmooth, shown.value);
        scheduleOnRN(emitEnd, shown.value);
      });
  }, [disabled, detents, endless, min, max, span, step, w, live, raw, shown, dragging, prevAngle, prevX, prevY, lastEmit, emitDetent, emitSmooth, emitEnd, emitTurn]);

  const pointerStyle = useAnimatedStyle(() => {
    const rad = endless ? shown.value : ((shown.value - min) / span - 0.5) * SWEEP_RAD;
    return { transform: [{ rotate: `${rad}rad` }] };
  });

  const stepA11y = step ?? span / 20;
  const onA11y = useCallback(
    (e: { nativeEvent: { actionName: string } }) => {
      const dir = e.nativeEvent.actionName === "increment" ? 1 : e.nativeEvent.actionName === "decrement" ? -1 : 0;
      if (!dir) return;
      if (endless) {
        onTurn?.(dir);
        return;
      }
      const next = Math.min(max, Math.max(min, value + dir * stepA11y));
      onChange?.(next);
      onChangeEnd?.(next);
    },
    [endless, onTurn, onChange, onChangeEnd, value, min, max, stepA11y],
  );

  const paint = indicator === "bone" ? palette.bone2 : theme[indicator];
  const inner = size - 14;
  return (
    <View style={[{ alignItems: "center", gap: space.xxs, opacity: disabled ? 0.42 : 1 }, style]}>
      <GestureDetector gesture={gesture} touchAction="none">
        <View
          collapsable={false}
          style={{ width: w, height: w, alignItems: "center", justifyContent: "center" }}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityValue={endless ? undefined : { min, max, now: value }}
          accessibilityActions={A11Y_ACTIONS}
          onAccessibilityAction={onA11y}
          accessibilityState={{ disabled: !!disabled }}
        >
          <Dial size={size} endless={endless} tick={theme.inkDim} tickStrong={theme.ink} />
          <View
            pointerEvents="none"
            style={{ position: "absolute", top: 8 + 3, width: size, height: size, borderRadius: size / 2, backgroundColor: theme.keyLo, boxShadow: `0px 2px 3px ${theme.shadow}` }}
          />
          <View pointerEvents="none" style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.key, borderTopWidth: 1, borderTopColor: theme.keyHi, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: theme.keyHi, alignItems: "center", justifyContent: "center" }}>
              <View style={{ width: inner - 2, height: inner - 2, borderRadius: (inner - 2) / 2, backgroundColor: theme.key, marginTop: 1 }} />
            </View>
            <Animated.View style={[StyleSheet.absoluteFill, { alignItems: "center" }, pointerStyle]}>
              <View style={{ marginTop: 3, width: 3, height: size * 0.3, borderRadius: 1.5, backgroundColor: paint }} />
            </Animated.View>
          </View>
        </View>
      </GestureDetector>
      {label ? <MicroLabel align="center">{label}</MicroLabel> : null}
    </View>
  );
});

const A11Y_ACTIONS = [{ name: "increment" }, { name: "decrement" }] as const;

// ---------------------------------------------------------------------------------------------
// Fader

export interface FaderProps {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  /** Color of the stripe on the cap. */
  tone?: Accent;
  /** Number of printed tick marks under the slot. */
  ticks?: number;
  disabled?: boolean;
  live?: SharedValue<number>;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const FADER_CAP_W = 24;
const FADER_CAP_H = 30;

export const Fader = memo(function Fader({ value = 0, min = 0, max = 1, step, onChange, onChangeEnd, tone = "orange", ticks = 11, disabled, live, accessibilityLabel, style }: FaderProps) {
  const theme = useTheme();
  const span = max - min || 1;
  const width = useSharedValue(0);
  const shown = useSharedValue(value);
  const start = useSharedValue(0);
  const dragging = useSharedValue(false);
  const grip = useSharedValue(0);
  const lastEmit = useSharedValue(0);

  useEffect(() => {
    if (dragging.value) return;
    shown.set(value);
    if (live) live.set(value);
  }, [value, shown, dragging, live]);

  const emitDetent = useCallback(
    (v: number) => {
      haptic("detent");
      sfx("knobTick");
      onChange?.(v);
    },
    [onChange],
  );
  const emitSmooth = useCallback((v: number) => onChange?.(v), [onChange]);
  const emitEnd = useCallback((v: number) => onChangeEnd?.(v), [onChangeEnd]);

  const gesture = useMemo(() => {
    const apply = (target: number) => {
      "worklet";
      const clamped = Math.min(max, Math.max(min, target));
      const q = step ? Math.min(max, Math.max(min, min + Math.round((clamped - min) / step) * step)) : clamped;
      if (q === shown.value) return;
      shown.set(q);
      if (live) live.set(q);
      if (step) {
        scheduleOnRN(emitDetent, q);
      } else {
        // Runs in the gesture worklet, not during render.
        // eslint-disable-next-line react-hooks/purity
        const now = Date.now();
        if (now - lastEmit.value >= EMIT_GAP_MS) {
          lastEmit.set(now);
          scheduleOnRN(emitSmooth, q);
        }
      }
    };
    const pan = Gesture.Pan()
      .enabled(!disabled)
      .maxPointers(1)
      .activeOffsetX([-4, 4])
      .failOffsetY([-14, 14])
      .shouldCancelWhenOutside(false)
      .onBegin(() => {
        start.set(shown.value);
        grip.set(springTo(1, "key"));
      })
      .onStart(() => {
        dragging.set(true);
      })
      .onUpdate((e) => {
        const travel = Math.max(1, width.value - FADER_CAP_W);
        apply(start.value + (e.translationX / travel) * span);
      })
      .onFinalize(() => {
        grip.set(springTo(0, "key"));
        if (!dragging.value) return;
        dragging.set(false);
        if (!step) scheduleOnRN(emitSmooth, shown.value);
        scheduleOnRN(emitEnd, shown.value);
      });
    const tap = Gesture.Tap()
      .enabled(!disabled)
      .maxDuration(300)
      .onEnd((e, ok) => {
        if (!ok) return;
        const travel = Math.max(1, width.value - FADER_CAP_W);
        apply(min + ((e.x - FADER_CAP_W / 2) / travel) * span);
        if (!step) scheduleOnRN(emitSmooth, shown.value);
        scheduleOnRN(emitEnd, shown.value);
      });
    return Gesture.Exclusive(pan, tap);
  }, [disabled, min, max, span, step, live, width, shown, start, dragging, grip, lastEmit, emitDetent, emitSmooth, emitEnd]);

  const capStyle = useAnimatedStyle(() => {
    const travel = Math.max(0, width.value - FADER_CAP_W);
    return { transform: [{ translateX: ((shown.value - min) / span) * travel }, { translateY: grip.value }] };
  });

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      width.set(e.nativeEvent.layout.width);
    },
    [width],
  );

  const stepA11y = step ?? span / 20;
  const onA11y = useCallback(
    (e: { nativeEvent: { actionName: string } }) => {
      const dir = e.nativeEvent.actionName === "increment" ? 1 : e.nativeEvent.actionName === "decrement" ? -1 : 0;
      if (!dir) return;
      const next = Math.min(max, Math.max(min, value + dir * stepA11y));
      onChange?.(next);
      onChangeEnd?.(next);
    },
    [onChange, onChangeEnd, value, min, max, stepA11y],
  );

  const marks = [];
  for (let i = 0; i < ticks; i++) {
    const strong = i === 0 || i === ticks - 1 || (ticks % 2 === 1 && i === (ticks - 1) / 2);
    marks.push(<View key={i} style={{ width: 1, height: strong ? 5 : 3, backgroundColor: strong ? theme.ink : theme.inkDim }} />);
  }

  return (
    <GestureDetector gesture={gesture} touchAction="pan-y">
      <View
        collapsable={false}
        onLayout={onLayout}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min, max, now: value }}
        accessibilityActions={A11Y_ACTIONS}
        onAccessibilityAction={onA11y}
        accessibilityState={{ disabled: !!disabled }}
        style={[{ height: HIT, justifyContent: "center", opacity: disabled ? 0.42 : 1 }, style]}
      >
        <View pointerEvents="none" style={[faderStyles.slot, { backgroundColor: theme.bezel, borderTopColor: theme.keyLo, borderBottomColor: theme.bodyHi }]} />
        <View pointerEvents="none" style={faderStyles.ticks}>
          {marks}
        </View>
        <Animated.View pointerEvents="none" style={[faderStyles.cap, capStyle]}>
          <View style={[faderStyles.capSkirt, { backgroundColor: theme.keyLo, boxShadow: `0px 2px 3px ${theme.shadow}` }]} />
          <View style={[faderStyles.capFace, { backgroundColor: theme.key, borderTopColor: theme.keyHi }]}>
            <View style={{ width: 2, height: FADER_CAP_H - 10, borderRadius: 1, backgroundColor: theme[tone] }} />
          </View>
        </Animated.View>
      </View>
    </GestureDetector>
  );
});

const faderStyles = StyleSheet.create({
  slot: { position: "absolute", left: FADER_CAP_W / 2 - 3, right: FADER_CAP_W / 2 - 3, top: 15, height: 6, borderRadius: 3, borderTopWidth: 1, borderBottomWidth: 1 },
  ticks: { position: "absolute", left: FADER_CAP_W / 2, right: FADER_CAP_W / 2, bottom: 2, height: 5, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  cap: { position: "absolute", left: 0, top: 2, width: FADER_CAP_W, height: FADER_CAP_H + 2 },
  capSkirt: { position: "absolute", left: 0, right: 0, top: 2, bottom: 0, borderRadius: 4 },
  capFace: { position: "absolute", left: 0, right: 0, top: 0, height: FADER_CAP_H, borderRadius: 4, borderTopWidth: 1, alignItems: "center", justifyContent: "center" },
});

// ---------------------------------------------------------------------------------------------
// Toggle

export interface ToggleProps {
  value: boolean;
  onChange?: (next: boolean) => void;
  /** Paint revealed in the slot when the switch is on. */
  color?: Accent;
  disabled?: boolean;
  /** Printed legends on both sides of the switch (for example "OFF" / "ON"). */
  offLabel?: string;
  onLabel?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const TOGGLE_W = 48;
const TOGGLE_H = 26;
const THUMB_W = 22;
const THUMB_TRAVEL = TOGGLE_W - THUMB_W - 4;

/** Hardware slide switch. */
export const Toggle = memo(function Toggle({ value, onChange, color = "orange", disabled, offLabel, onLabel, accessibilityLabel, style }: ToggleProps) {
  const theme = useTheme();
  const t = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    t.set(springTo(value ? 1 : 0, "snappy"));
  }, [value, t]);

  const onPress = useCallback(() => {
    haptic("tap");
    sfx("toggle");
    onChange?.(!value);
  }, [onChange, value]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: t.value * THUMB_TRAVEL }] }));
  const paintStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, t.value)) }));

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      hitSlop={{ top: (HIT - TOGGLE_H) / 2, bottom: (HIT - TOGGLE_H) / 2 }}
      style={[{ flexDirection: "row", alignItems: "center", gap: 6, opacity: disabled ? 0.42 : 1 }, style]}
    >
      {offLabel ? <MicroLabel color={value ? "inkDim" : "ink"}>{offLabel}</MicroLabel> : null}
      <View style={[toggleStyles.slot, { backgroundColor: theme.bezel, borderTopColor: theme.keyLo, borderBottomColor: theme.bodyHi }]}>
        <Animated.View style={[toggleStyles.paint, { backgroundColor: theme[color] }, paintStyle]} />
        <Animated.View style={[toggleStyles.thumb, thumbStyle]}>
          <View style={[toggleStyles.thumbSkirt, { backgroundColor: theme.keyLo }]} />
          <View style={[toggleStyles.thumbFace, { backgroundColor: theme.keyHi, borderTopColor: palette.steel1 }]}>
            <View style={[toggleStyles.ridge, { backgroundColor: theme.key }]} />
            <View style={[toggleStyles.ridge, { backgroundColor: theme.key }]} />
            <View style={[toggleStyles.ridge, { backgroundColor: theme.key }]} />
          </View>
        </Animated.View>
      </View>
      {onLabel ? <MicroLabel color={value ? "ink" : "inkDim"}>{onLabel}</MicroLabel> : null}
    </Pressable>
  );
});

const toggleStyles = StyleSheet.create({
  slot: { width: TOGGLE_W, height: TOGGLE_H, borderRadius: 6, borderTopWidth: 1, borderBottomWidth: 1, justifyContent: "center" },
  paint: { position: "absolute", left: 4, width: 16, top: 5, bottom: 5, borderRadius: 2 },
  thumb: { position: "absolute", left: 2, top: 1, width: THUMB_W, height: TOGGLE_H - 4 },
  thumbSkirt: { position: "absolute", left: 0, right: 0, top: 2, bottom: 0, borderRadius: 4 },
  thumbFace: { position: "absolute", left: 0, right: 0, top: 0, bottom: 2, borderRadius: 4, borderTopWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2 },
  ridge: { width: 2, height: 10, borderRadius: 1 },
});

// ---------------------------------------------------------------------------------------------
// Segmented

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: string;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: KeySize;
  /** Cap color of the selected segment. */
  tone?: KeyTone;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}

interface SegmentProps {
  option: SegmentedOption<string>;
  selected: boolean;
  onChange: (value: string) => void;
  size: KeySize;
  tone: KeyTone;
}

const Segment = memo(function Segment({ option, selected, onChange, size, tone }: SegmentProps) {
  const onPress = useCallback(() => onChange(option.value), [onChange, option.value]);
  return (
    <Key
      label={option.label}
      icon={option.icon}
      size={size}
      tone={selected ? tone : "black"}
      latched={selected}
      disabled={option.disabled}
      onPress={onPress}
      sound="toggle"
      hapticKind="tap"
      style={segStyles.key}
    />
  );
});

/** Interlocked key row: one segment stays down (x1 / x10 / x100 / MAX). */
export function Segmented<T extends string>({ options, value, onChange, size = "sm", tone = "orange", gap = space.xs, style }: SegmentedProps<T>) {
  return (
    <KeyRow gap={gap} style={style}>
      {options.map((o) => (
        <Segment key={o.value} option={o} selected={o.value === value} onChange={onChange as (v: string) => void} size={size} tone={tone} />
      ))}
    </KeyRow>
  );
}

const segStyles = StyleSheet.create({ key: { minWidth: 0 } });

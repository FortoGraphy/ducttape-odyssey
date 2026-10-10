// Rubber keys. The cap really travels 3 pt into its skirt and the cast shadow collapses with it;
// both are driven by one shared value, so the motion itself never touches the JS thread.
import { createContext, memo, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type GestureResponderEvent, type Insets, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { haptic, sfx, type HapticKind, type SfxId } from "@/platform/feedback";
import { HIT, palette, radius, space } from "@/ui/theme";

import { Icon } from "./Icon";
import { Led, type LedColor } from "./Led";
import { springTo, timings, timingTo } from "./motion";
import { MicroLabel, Txt } from "./Txt";
import { useTheme, type KitTheme } from "./theme-context";

export type KeyTone = "black" | "orange" | "cobalt" | "yellow" | "mint" | "red";
export type KeySize = "sm" | "md" | "lg";

/** Cap travel in points. */
export const KEY_TRAVEL = 3;
const LATCH_TRAVEL = 2;

const SIZES: Record<KeySize, { height: number; padH: number; icon: number }> = {
  sm: { height: 40, padH: 10, icon: 16 },
  md: { height: 48, padH: 12, icon: 16 },
  lg: { height: 60, padH: 16, icon: 24 },
};

interface CapColors {
  face: string;
  hi: string;
  lo: string;
  text: string;
}

function capColors(theme: KitTheme, tone: KeyTone): CapColors {
  const lift = "rgba(255,255,255,0.42)";
  switch (tone) {
    case "orange":
      return { face: palette.orange, hi: palette.amber, lo: palette.rust1, text: theme.onAccent };
    case "cobalt":
      return { face: palette.cobalt1, hi: palette.cobalt2, lo: palette.cobalt0, text: palette.bone2 };
    case "yellow":
      return { face: palette.yellow, hi: lift, lo: palette.amber, text: theme.onAccent };
    case "mint":
      return { face: palette.mint, hi: lift, lo: palette.teal2, text: theme.onAccent };
    case "red":
      return { face: palette.red1, hi: lift, lo: palette.red0, text: palette.bone2 };
    default:
      return { face: theme.key, hi: theme.keyHi, lo: theme.keyLo, text: theme.keyText };
  }
}

const RowContext = createContext(false);

export interface KeyProps {
  label?: string;
  /** Second, smaller line under the label (a cost, a hint). */
  sublabel?: string;
  /** Icon name (see docs/ICONS.md). */
  icon?: string;
  tone?: KeyTone;
  size?: KeySize;
  disabled?: boolean;
  /** Held down and lit: selected segment, active tab, armed switch. */
  latched?: boolean;
  /** The press event is passed along so callers can pop a number at the touch point. */
  onPress?: (event: GestureResponderEvent) => void;
  /**
   * Fired once after a hold, or repeatedly (and accelerating) when `repeat` is set: buy-hold.
   * Without an `onLongPress`, `repeat` repeats `onPress`. Repeats receive the event of the hold.
   */
  onLongPress?: (event: GestureResponderEvent) => void;
  repeat?: boolean;
  /** Extra touch area around the key (narrow keys in a dense row). */
  hitSlop?: Insets;
  /** Sound on key down. `null` silences the key (the caller plays its own). */
  sound?: SfxId | null;
  hapticKind?: HapticKind | null;
  /** Take a share of the row. Defaults to 1 inside a KeyRow. */
  flex?: number;
  /** Fixed width; otherwise the key hugs its label (min 44 pt). */
  width?: number;
  /** Replaces icon + label. */
  children?: ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const REPEAT_START_MS = 240;
const REPEAT_MIN_MS = 55;

export const Key = memo(function Key({
  label,
  sublabel,
  icon,
  tone = "black",
  size = "md",
  disabled,
  latched,
  onPress,
  onLongPress,
  repeat,
  hitSlop,
  sound = "keyDown",
  hapticKind = "key",
  flex,
  width,
  children,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: KeyProps) {
  const theme = useTheme();
  const inRow = useContext(RowContext);
  const dims = SIZES[size];
  const c = capColors(theme, tone);
  const pressed = useSharedValue(0);
  const rest = useSharedValue(latched ? 1 : 0);

  useEffect(() => {
    rest.set(timingTo(latched ? 1 : 0, "fast"));
  }, [latched, rest]);

  // Buy-hold repeat. Timers live on the JS thread because the callback does.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const repeatCb = useRef(onLongPress ?? onPress);
  useEffect(() => {
    repeatCb.current = onLongPress ?? onPress;
  }, [onLongPress, onPress]);
  const stopRepeat = useCallback(() => {
    held.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => stopRepeat, [stopRepeat]);
  useEffect(() => {
    if (disabled) {
      stopRepeat();
      pressed.set(timingTo(0, "fast"));
    }
  }, [disabled, stopRepeat, pressed]);

  const handleIn = useCallback(() => {
    pressed.set(withTiming(1, timings.press));
    if (hapticKind) haptic(hapticKind);
    if (sound) sfx(sound);
  }, [pressed, hapticKind, sound]);

  const handleOut = useCallback(() => {
    pressed.set(springTo(0, "key"));
    if (sound) sfx("keyUp");
    stopRepeat();
  }, [pressed, sound, stopRepeat]);

  const handleLong = useCallback(
    (event: GestureResponderEvent) => {
      if (!repeat) {
        onLongPress?.(event);
        return;
      }
      held.current = true;
      let interval = REPEAT_START_MS;
      const tick = () => {
        if (!held.current) return;
        repeatCb.current?.(event);
        haptic("tap");
        interval = Math.max(REPEAT_MIN_MS, interval * 0.84);
        timer.current = setTimeout(tick, interval);
      };
      tick();
    },
    [repeat, onLongPress],
  );

  const capStyle = useAnimatedStyle(() => {
    const down = Math.max(pressed.value * KEY_TRAVEL, rest.value * LATCH_TRAVEL);
    return { transform: [{ translateY: down }] };
  });
  const shadowStyle = useAnimatedStyle(() => {
    const down = Math.max(pressed.value, (rest.value * LATCH_TRAVEL) / KEY_TRAVEL);
    return { opacity: 1 - 0.85 * down };
  });

  const capHeight = dims.height - KEY_TRAVEL;
  const slopV = Math.max(0, (HIT - dims.height) / 2);
  const content = children ?? (
    <View style={styles.content}>
      {icon ? <Icon name={icon} size={label ? dims.icon : Math.max(dims.icon, 24)} color={c.text} /> : null}
      {label ? (
        <View style={styles.labels}>
          <Txt variant="key" color={c.text} upper numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} align="center" style={size === "lg" ? styles.labelLg : undefined}>
            {label}
          </Txt>
          {sublabel ? (
            <Txt variant="micro" color={c.text} numberOfLines={1} align="center" style={styles.sublabel}>
              {sublabel}
            </Txt>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPressIn={handleIn}
      onPressOut={handleOut}
      onPress={onPress}
      onLongPress={onLongPress || repeat ? handleLong : undefined}
      delayLongPress={repeat ? 320 : 420}
      hitSlop={slopV > 0 || hitSlop ? { top: slopV, bottom: slopV, ...hitSlop } : undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, selected: !!latched }}
      style={[
        { height: dims.height, minWidth: HIT, opacity: disabled ? 0.42 : 1 },
        width !== undefined ? { width } : null,
        (flex ?? (inRow && width === undefined ? 1 : undefined)) !== undefined ? { flex: flex ?? 1 } : null,
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.shadow, { top: KEY_TRAVEL + 2, backgroundColor: c.lo, boxShadow: `0px 2px 3px ${theme.shadow}` }, shadowStyle]}
      />
      <View pointerEvents="none" style={[styles.skirt, { top: KEY_TRAVEL, backgroundColor: c.lo }]} />
      <Animated.View
        pointerEvents="none"
        style={[styles.cap, { height: capHeight, backgroundColor: c.face, borderTopColor: c.hi, paddingHorizontal: dims.padH }, capStyle]}
      >
        {content}
      </Animated.View>
    </Pressable>
  );
});

// ---------------------------------------------------------------------------------------------
// KeyRow

export interface KeyRowProps {
  gap?: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Lays keys out in a row; keys without an explicit width share the space equally. */
export function KeyRow({ gap = space.sm, children, style }: KeyRowProps) {
  return (
    <RowContext.Provider value={true}>
      <View style={[{ flexDirection: "row", alignItems: "flex-end", gap }, style]}>{children}</View>
    </RowContext.Provider>
  );
}

// ---------------------------------------------------------------------------------------------
// IconKey

export interface IconKeyProps extends Omit<KeyProps, "label" | "sublabel" | "children" | "icon" | "accessibilityLabel"> {
  icon: string;
  /** Printed under the key on the body, like silk-screen legends on real hardware. */
  caption?: string;
  /** Required: an icon alone says nothing to VoiceOver. */
  accessibilityLabel: string;
}

/** Square icon-only key. */
export const IconKey = memo(function IconKey({ caption, size = "md", width, style, ...rest }: IconKeyProps) {
  const side = width ?? Math.max(HIT, SIZES[size].height);
  const key = <Key {...rest} size={size} width={side} flex={rest.flex} style={caption ? undefined : style} />;
  if (!caption) return key;
  return (
    <View style={[{ width: side, gap: space.xs }, style]}>
      {key}
      {/* The legend may be a little wider than the key; it must not push the neighbours apart. */}
      <View style={{ width: side + 16, alignSelf: "center" }}>
        <MicroLabel align="center">{caption}</MicroLabel>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------------------------
// TabKeys

export interface TabKeyItem {
  id: string;
  icon: string;
  /** Short printed legend (about 6 characters fit when 8 tabs share the row). */
  label?: string;
  /** Dot (true) or attention dot for a count > 0. */
  badge?: boolean | number;
  locked?: boolean;
  accessibilityLabel?: string;
}

export interface TabKeysProps {
  items: readonly TabKeyItem[];
  value: string;
  onChange: (id: string) => void;
  /** LED above the active tab. */
  ledColor?: LedColor;
  /** Cap color of the active tab. */
  activeTone?: KeyTone;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}

interface TabProps {
  item: TabKeyItem;
  active: boolean;
  onChange: (id: string) => void;
  ledColor: LedColor;
  activeTone: KeyTone;
}

const Tab = memo(function Tab({ item, active, onChange, ledColor, activeTone }: TabProps) {
  const theme = useTheme();
  const onPress = useCallback(() => onChange(item.id), [onChange, item.id]);
  const hasBadge = typeof item.badge === "number" ? item.badge > 0 : !!item.badge;
  return (
    <View style={styles.tab}>
      <Led on={active} color={ledColor} size={4} />
      <View style={styles.tabKey}>
        <Key
          icon={item.locked ? "lock" : item.icon}
          tone={active ? activeTone : "black"}
          latched={active}
          disabled={item.locked}
          onPress={onPress}
          sound="tab"
          hapticKind="tap"
          accessibilityLabel={item.accessibilityLabel ?? item.label ?? item.id}
          hitSlop={TAB_SLOP}
          style={styles.tabKeyInner}
        />
        {hasBadge ? <View pointerEvents="none" style={[styles.badgeDot, { backgroundColor: theme.red, borderColor: theme.body }]} /> : null}
      </View>
      {item.label ? (
        <MicroLabel align="center" color={active ? "ink" : "inkDim"} style={styles.tabLabel}>
          {item.label}
        </MicroLabel>
      ) : null}
    </View>
  );
});

// 2 pt on each side turns a 40 pt cap (8 tabs on a 375 pt screen) into a 44 pt target.
const TAB_SLOP: Insets = { left: 2, right: 2 };

/** Bottom tab row: a key per tab, an LED above the active one, badge dots for news. */
export const TabKeys = memo(function TabKeys({ items, value, onChange, ledColor = "orange", activeTone = "cobalt", gap = space.xs, style }: TabKeysProps) {
  return (
    <View accessibilityRole="tablist" style={[{ flexDirection: "row", gap }, style]}>
      {items.map((item) => (
        <Tab key={item.id} item={item} active={item.id === value} onChange={onChange} ledColor={ledColor} activeTone={activeTone} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  shadow: { position: "absolute", left: 1, right: 1, bottom: 0, borderRadius: radius.key },
  skirt: { position: "absolute", left: 0, right: 0, bottom: 0, borderRadius: radius.key },
  // In flow (not absolute) so a key without a width hugs its label.
  cap: {
    borderRadius: radius.key,
    borderTopWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, maxWidth: "100%" },
  labels: { flexShrink: 1, alignItems: "center" },
  labelLg: { fontSize: 13, lineHeight: 18 },
  sublabel: { opacity: 0.72, marginTop: -1 },
  tab: { flex: 1, alignItems: "center", gap: space.xs, minWidth: 0 },
  tabKey: { alignSelf: "stretch" },
  tabKeyInner: { minWidth: 0, alignSelf: "stretch" },
  tabLabel: { alignSelf: "stretch" },
  badgeDot: { position: "absolute", top: -3, right: -3, width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
});

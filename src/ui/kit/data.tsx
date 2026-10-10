// Data display: list rows, cards, badges, chips, quality pips, cost tags and stat deltas.
import { memo, useCallback, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";

import { useLang } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { fonts } from "@/ui/fonts";
import { HIT, palette, radius, space } from "@/ui/theme";

import { Icon } from "./Icon";
import { usePressScale } from "./motion";
import { MicroLabel, Txt } from "./Txt";
import { useTheme, type Accent, type KitTheme, type Tone } from "./theme-context";

// ---------------------------------------------------------------------------------------------
// ListRow

/** Fixed row height: use it for FlatList `getItemLayout`. */
export const LIST_ROW_HEIGHT = 56;

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Icon name, shown on a dark chip. */
  icon?: string;
  /** Custom leading element instead of `icon` (a portrait, an LED). */
  left?: ReactNode;
  /** Trailing slot: a CostTag, a Key, a Badge... */
  right?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  /** Dims the row and shows it as not yet available. */
  locked?: boolean;
  selected?: boolean;
  /** Engraved line under the row. */
  divider?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export const ListRow = memo(function ListRow({
  title,
  subtitle,
  icon,
  left,
  right,
  chevron,
  onPress,
  disabled,
  locked,
  selected,
  divider = true,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: ListRowProps) {
  const theme = useTheme();
  const onIn = useCallback(() => {
    haptic("tap");
    sfx("keyDown", { volume: 0.6 });
  }, []);
  const body = (
    <>
      {left ?? (icon ? <Icon name={locked ? "lock" : icon} size={24} chip /> : null)}
      <View style={rowStyles.text}>
        <Txt variant="bodyBold" numberOfLines={1} color={locked ? "inkDim" : "ink"}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="label" color="inkDim" numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right ? <View style={rowStyles.right}>{right}</View> : null}
      {chevron ? <Icon name="right" size={16} color="inkDim" /> : null}
      {divider ? <View pointerEvents="none" style={[rowStyles.divider, { backgroundColor: theme.rule }]} /> : null}
      {selected ? <View pointerEvents="none" style={[rowStyles.selected, { backgroundColor: theme.orange }]} /> : null}
    </>
  );
  if (!onPress) {
    return (
      <View testID={testID} accessible accessibilityLabel={accessibilityLabel} style={[rowStyles.row, { opacity: disabled ? 0.45 : 1 }, style]}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onPressIn={onIn}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      style={({ pressed }) => [rowStyles.row, { backgroundColor: pressed ? theme.platePressed : "transparent", opacity: disabled ? 0.45 : 1 }, style]}
    >
      {body}
    </Pressable>
  );
});

const rowStyles = StyleSheet.create({
  row: { height: LIST_ROW_HEIGHT, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm, borderRadius: 4 },
  text: { flex: 1, minWidth: 0, justifyContent: "center" },
  right: { flexShrink: 0, alignItems: "flex-end", justifyContent: "center" },
  divider: { position: "absolute", left: space.sm, right: space.sm, bottom: 0, height: StyleSheet.hairlineWidth },
  selected: { position: "absolute", left: 0, top: 10, bottom: 10, width: 3, borderRadius: 1.5 },
});

// ---------------------------------------------------------------------------------------------
// Card

export interface CardProps {
  title?: string;
  /** Right end of the title line. */
  titleRight?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  padding?: number;
  gap?: number;
  accessibilityLabel?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Raised plate on the body: one step lighter, same two-tone bevel as the panel. */
export function Card({ title, titleRight, onPress, disabled, padding = space.md, gap = space.sm, accessibilityLabel, children, style }: CardProps) {
  const theme = useTheme();
  const scale = usePressScale(0.98);
  const frame: ViewStyle = {
    backgroundColor: theme.plate,
    borderRadius: radius.well,
    borderTopWidth: 1,
    borderTopColor: theme.id === "day" ? "#FFFFFF" : theme.bodyHi,
    borderBottomWidth: 1,
    borderBottomColor: theme.bodyLo,
    padding,
    gap,
    opacity: disabled ? 0.45 : 1,
  };
  const body = (
    <>
      {title || titleRight ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
          {title ? <MicroLabel size="label">{title}</MicroLabel> : <View />}
          {titleRight}
        </View>
      ) : null}
      {children}
    </>
  );
  if (!onPress) return <View style={[frame, style]}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        scale.onPressIn();
        haptic("tap");
      }}
      onPressOut={scale.onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={style}
    >
      <Animated.View style={[frame, scale.style]}>{body}</Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------------------------
// Badge

export type BadgeTone = Tone | Accent | "neutral";

function badgeColors(theme: KitTheme, tone: BadgeTone): { bg: string; fg: string } {
  switch (tone) {
    case "info":
    case "cobalt":
      return { bg: palette.cobalt1, fg: palette.bone2 };
    case "bad":
    case "red":
      return { bg: palette.red1, fg: palette.bone2 };
    case "good":
      return { bg: palette.green1, fg: palette.bone2 };
    case "mint":
      return { bg: palette.mint, fg: theme.onAccent };
    case "warn":
    case "yellow":
      return { bg: palette.yellow, fg: theme.onAccent };
    case "orange":
      return { bg: palette.orange, fg: theme.onAccent };
    default:
      return { bg: theme.ink, fg: theme.body };
  }
}

export interface BadgeProps {
  /** Text or count. Counts above `max` show as "99+". */
  label: string | number;
  tone?: BadgeTone;
  max?: number;
  style?: StyleProp<ViewStyle>;
}

/** Small filled label: counts, "NEW", states. */
export const Badge = memo(function Badge({ label, tone = "neutral", max = 99, style }: BadgeProps) {
  const theme = useTheme();
  const c = badgeColors(theme, tone);
  const text = typeof label === "number" ? (label > max ? `${max}+` : String(label)) : label;
  return (
    <View style={[{ minWidth: 16, height: 16, borderRadius: 3, paddingHorizontal: 4, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" }, style]}>
      <Txt variant="micro" color={c.fg} upper numberOfLines={1} style={{ fontFamily: fonts.monoBold }}>
        {text}
      </Txt>
    </View>
  );
});

// ---------------------------------------------------------------------------------------------
// Chip

export interface ChipProps {
  label: string;
  icon?: string;
  /** Small colored dot in front of the label. */
  dot?: Accent;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Outlined tag; pressable chips work as filters (selected = inked in). */
export const Chip = memo(function Chip({ label, icon, dot, selected, onPress, disabled, accessibilityLabel, style }: ChipProps) {
  const theme = useTheme();
  const fg = selected ? theme.body : theme.ink;
  const frame: ViewStyle = {
    height: 24,
    borderRadius: 4,
    paddingHorizontal: space.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: selected ? theme.ink : theme.inkDim,
    backgroundColor: selected ? theme.ink : "transparent",
    opacity: disabled ? 0.45 : 1,
    alignSelf: "flex-start",
  };
  const body = (
    <>
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme[dot] }} /> : null}
      {icon ? <Icon name={icon} size={16} color={fg} /> : null}
      <Txt variant="label" color={fg} upper numberOfLines={1}>
        {label}
      </Txt>
    </>
  );
  if (!onPress) return <View style={[frame, style]}>{body}</View>;
  const slop = (HIT - 24) / 2;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => haptic("tap")}
      disabled={disabled}
      hitSlop={{ top: slop, bottom: slop, left: 4, right: 4 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      style={({ pressed }) => [frame, pressed ? { backgroundColor: selected ? theme.inkDim : theme.platePressed } : null, style]}
    >
      {body}
    </Pressable>
  );
});

// ---------------------------------------------------------------------------------------------
// QualityPips

export const QUALITY_COLORS = [palette.steel2, palette.green1, palette.cobalt1, palette.violet2, palette.orange] as const;

export interface QualityPipsProps {
  /** 0..4 (matches the q0..q4 icons). */
  quality: number;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** Five pips, lit up to the item's quality in that tier's color. */
export const QualityPips = memo(function QualityPips({ quality, size = 5, style }: QualityPipsProps) {
  const theme = useTheme();
  const q = Math.max(0, Math.min(4, Math.floor(quality)));
  const pips = [];
  for (let i = 0; i < 5; i++) {
    pips.push(<View key={i} style={{ width: size, height: size + 3, borderRadius: 1, backgroundColor: i <= q ? QUALITY_COLORS[q] : theme.ledOff, opacity: i <= q ? 1 : 0.5 }} />);
  }
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ flexDirection: "row", gap: 2, alignItems: "center" }, style]}>
      {pips}
    </View>
  );
});

// ---------------------------------------------------------------------------------------------
// CostTag

export interface CostTagProps {
  /** Icon name of the currency or resource ("coin", "rp", "scrap"...). */
  icon: string;
  /** Preformatted amount. */
  amount: string;
  /** False paints the amount red. */
  affordable?: boolean;
  size?: "sm" | "md";
  /** Recessed pill behind the tag. */
  boxed?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export const CostTag = memo(function CostTag({ icon, amount, affordable = true, size = "md", boxed, accessibilityLabel, style }: CostTagProps) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? amount}
      style={[
        { flexDirection: "row", alignItems: "center", gap: space.xs, alignSelf: "flex-start" },
        boxed
          ? { backgroundColor: theme.well, borderRadius: 4, borderTopWidth: 1, borderTopColor: theme.rule, borderBottomWidth: 1, borderBottomColor: theme.bodyHi, paddingHorizontal: 6, height: 24 }
          : null,
        style,
      ]}
    >
      <Icon name={icon} size={16} chip={!boxed && theme.id === "day"} />
      <Txt variant={size === "sm" ? "label" : "bodyBold"} color={affordable ? "ink" : "bad"} numberOfLines={1} tabular>
        {amount}
      </Txt>
    </View>
  );
});

// ---------------------------------------------------------------------------------------------
// StatDelta

export interface StatDeltaProps {
  /** Change as a fraction: 0.12 is +12 %. */
  value: number;
  /** Preformatted text instead of the built-in percent formatting (keep the sign in it). */
  text?: string;
  /** For stats where lower is better (heat, wear): a negative change is the good one. */
  invert?: boolean;
  size?: "sm" | "md";
  style?: StyleProp<ViewStyle>;
}

/** Formats a fraction as a signed percentage in the current language ("+12 %" / "+12%"). */
export function formatDelta(value: number, lang: "cs" | "en"): string {
  const pct = Math.abs(value * 100);
  const digits = pct < 10 && pct % 1 !== 0 ? 1 : 0;
  let num = pct.toFixed(digits);
  if (lang === "cs") num = num.replace(".", ",");
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return lang === "cs" ? `${sign}${num} %` : `${sign}${num}%`;
}

export const StatDelta = memo(function StatDelta({ value, text, invert, size = "md", style }: StatDeltaProps) {
  const lang = useLang();
  const good = invert ? value < 0 : value > 0;
  const color = value === 0 ? "inkDim" : good ? "good" : "bad";
  const arrow = value > 0 ? "↑" : value < 0 ? "↓" : "";
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start" }, style]}>
      {arrow ? (
        <Txt variant={size === "sm" ? "label" : "bodyBold"} color={color} style={{ fontFamily: fonts.monoBold }}>
          {arrow}
        </Txt>
      ) : null}
      <Txt variant={size === "sm" ? "label" : "bodyBold"} color={color} numberOfLines={1} tabular>
        {text ?? formatDelta(value, lang)}
      </Txt>
    </View>
  );
});

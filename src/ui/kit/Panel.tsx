// The hardware body: panels with a two-tone bevel, recessed wells, engraved rules, screws and
// the stickers somebody left on the casing.
import { memo, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import Svg, { Circle, Path, Polygon } from "react-native-svg";

import { useT } from "@/i18n";
import { palette, radius, space } from "@/ui/theme";

import { MicroLabel, Txt } from "./Txt";
import { useTheme } from "./theme-context";

// ---------------------------------------------------------------------------------------------
// Screw

export interface ScrewProps {
  size?: number;
  /** Slot rotation in degrees. Give neighbours different angles so they look hand-tightened. */
  angle?: number;
  style?: StyleProp<ViewStyle>;
}

export const Screw = memo(function Screw({ size = 10, angle = 28, style }: ScrewProps) {
  const theme = useTheme();
  return (
    <View
      pointerEvents="none"
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.rule, alignItems: "center", justifyContent: "center" }, style]}
    >
      <View
        style={{
          position: "absolute",
          top: 0.5,
          left: 1,
          width: size - 2,
          height: size - 2,
          borderRadius: (size - 2) / 2,
          backgroundColor: theme.bodyHi,
        }}
      />
      <View style={{ width: size - 3, height: 1.5, borderRadius: 1, backgroundColor: theme.rule, transform: [{ rotate: `${angle}deg` }] }} />
    </View>
  );
});

// ---------------------------------------------------------------------------------------------
// Rule

export interface RuleProps {
  vertical?: boolean;
  /** Printed label that interrupts the line ("── OUTPUT ──"). Horizontal rules only. */
  label?: string;
  /** Space before and after the rule on its main axis. */
  gap?: number;
  style?: StyleProp<ViewStyle>;
}

/** Engraved line: a dark cut with a light lip under it. */
export const Rule = memo(function Rule({ vertical, label, gap = 0, style }: RuleProps) {
  const theme = useTheme();
  if (vertical) {
    return (
      <View pointerEvents="none" style={[{ flexDirection: "row", alignSelf: "stretch", marginHorizontal: gap }, style]}>
        <View style={{ width: 1, backgroundColor: theme.rule }} />
        <View style={{ width: 1, backgroundColor: theme.bodyHi }} />
      </View>
    );
  }
  const line = (
    <View style={{ flex: 1 }}>
      <View style={{ height: 1, backgroundColor: theme.rule }} />
      <View style={{ height: 1, backgroundColor: theme.bodyHi }} />
    </View>
  );
  return (
    <View pointerEvents="none" style={[{ flexDirection: "row", alignItems: "center", alignSelf: "stretch", marginVertical: gap }, style]}>
      {line}
      {label ? (
        <>
          <MicroLabel style={{ marginHorizontal: space.sm }}>{label}</MicroLabel>
          {line}
        </>
      ) : null}
    </View>
  );
});

// ---------------------------------------------------------------------------------------------
// Panel

export interface PanelProps extends ViewProps {
  /** Printed title strip at the top. */
  title?: string;
  /** Right end of the title strip (serial number, LED, small key). */
  titleRight?: ReactNode;
  screws?: boolean;
  padding?: number;
  /** Corner radius. Use 0 on edges that dock to the screen or to another panel. */
  radius?: number;
  gap?: number;
  children?: ReactNode;
}

const SCREW_INSET = 5;

export function Panel({ title, titleRight, screws, padding, radius: r = radius.panel, gap = space.sm, style, children, ...rest }: PanelProps) {
  const theme = useTheme();
  const pad = padding ?? (screws ? space.lg : space.md);
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: theme.body,
          borderRadius: r,
          borderTopWidth: 1,
          borderTopColor: theme.bodyHi,
          borderBottomWidth: 2,
          borderBottomColor: theme.bodyLo,
          padding: pad,
          gap,
        },
        style,
      ]}
    >
      {title || titleRight ? (
        <View style={styles.titleStrip}>
          {title ? (
            <MicroLabel size="label" color="ink" style={screws ? { marginLeft: space.sm } : undefined}>
              {title}
            </MicroLabel>
          ) : null}
          <Rule style={{ flex: 1, alignSelf: "center" }} />
          {titleRight ? <View style={screws ? { marginRight: space.sm } : undefined}>{titleRight}</View> : null}
        </View>
      ) : null}
      {children}
      {screws ? (
        <>
          <Screw angle={24} style={{ position: "absolute", top: SCREW_INSET, left: SCREW_INSET }} />
          <Screw angle={-52} style={{ position: "absolute", top: SCREW_INSET, right: SCREW_INSET }} />
          <Screw angle={78} style={{ position: "absolute", bottom: SCREW_INSET, left: SCREW_INSET }} />
          <Screw angle={-12} style={{ position: "absolute", bottom: SCREW_INSET, right: SCREW_INSET }} />
        </>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Well

export interface WellProps extends ViewProps {
  padding?: number;
  radius?: number;
  /** "dark" is the socket color used behind keys and switches. */
  tone?: "well" | "dark";
  gap?: number;
  children?: ReactNode;
}

/** Recessed area: shaded at the top edge, lit at the bottom edge (the inverse of a panel). */
export function Well({ padding = space.sm, radius: r = radius.well, tone = "well", gap, style, children, ...rest }: WellProps) {
  const theme = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: tone === "dark" ? theme.bezel : theme.well,
          borderRadius: r,
          borderTopWidth: 1,
          borderTopColor: tone === "dark" ? theme.keyLo : theme.rule,
          borderBottomWidth: 1,
          borderBottomColor: theme.bodyHi,
          padding,
          gap,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Sticker

export type StickerVariant = "warranty" | "inspected" | "fragile" | "property";

export interface StickerProps {
  variant: StickerVariant;
  /** Override the built-in (localized) copy. */
  title?: string;
  subtitle?: string;
  /** Rotation in degrees; every variant has its own slightly crooked default. */
  rotate?: number;
  style?: StyleProp<ViewStyle>;
}

const STICKER_ROTATE: Record<StickerVariant, number> = { warranty: -3, inspected: 4, fragile: -5, property: 2 };
const STICKER_W = 132;
const STICKER_H = 40;
const INK = "#15171C";

function HazardStripes({ color }: { color: string }) {
  // Four slanted bars inside a 16 x 36 box.
  return (
    <Svg width={16} height={36} viewBox="0 0 16 36">
      {[0, 1, 2, 3].map((i) => {
        const y = i * 12 - 6;
        return <Polygon key={i} points={`0,${y + 10} 16,${y} 16,${y + 6} 0,${y + 16}`} fill={color} />;
      })}
    </Svg>
  );
}

function Stamp({ color }: { color: string }) {
  return (
    <Svg width={28} height={28} viewBox="0 0 28 28">
      <Circle cx={14} cy={14} r={12.5} stroke={color} strokeWidth={1.5} fill="none" />
      <Circle cx={14} cy={14} r={9.5} stroke={color} strokeWidth={0.75} strokeDasharray="1.5 1.5" fill="none" />
      <Path d="M9 14.5l3.4 3.4L19.5 10" stroke={color} strokeWidth={2} fill="none" strokeLinecap="square" />
    </Svg>
  );
}

function FragileGlass({ color }: { color: string }) {
  return (
    <Svg width={18} height={28} viewBox="0 0 18 28">
      <Path d="M3 2h12v7a6 6 0 0 1-5 5.9V24h4v2H4v-2h4v-9.1A6 6 0 0 1 3 9z" fill={color} />
      <Path d="M9 4l-2 4 3 2-1 3" stroke={palette.red1} strokeWidth={1.2} fill="none" />
    </Svg>
  );
}

function Barcode({ color }: { color: string }) {
  const bars = [2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1, 1];
  return (
    <View style={{ flexDirection: "row", height: 26, alignItems: "stretch", gap: 1 }}>
      {bars.map((w, i) => (
        <View key={i} style={{ width: w, backgroundColor: i % 3 === 2 ? "transparent" : color }} />
      ))}
    </View>
  );
}

/** Label art stuck on the casing. Decorative: not focusable, ignores touches. */
export const Sticker = memo(function Sticker({ variant, title, subtitle, rotate, style }: StickerProps) {
  const t = useT("common");
  const heading = title ?? t(`sticker.${variant}.title`);
  const sub = subtitle ?? t(`sticker.${variant}.subtitle`);

  const look = {
    warranty: { bg: palette.yellow, ink: INK },
    inspected: { bg: palette.bone2, ink: palette.green0 },
    fragile: { bg: palette.red1, ink: palette.bone2 },
    property: { bg: palette.cobalt1, ink: palette.bone2 },
  }[variant];

  const art =
    variant === "warranty" ? (
      <HazardStripes color={INK} />
    ) : variant === "inspected" ? (
      <Stamp color={palette.green1} />
    ) : variant === "fragile" ? (
      <FragileGlass color={palette.bone2} />
    ) : (
      <Barcode color={palette.bone2} />
    );

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: STICKER_W,
          height: STICKER_H,
          borderRadius: 3,
          backgroundColor: look.bg,
          transform: [{ rotate: `${rotate ?? STICKER_ROTATE[variant]}deg` }],
          boxShadow: "0px 1px 1.5px rgba(0,0,0,0.28)",
        },
        style,
      ]}
    >
      <View style={[StyleSheet.absoluteFill, styles.stickerInner, { borderColor: look.ink }]} />
      <View style={styles.stickerRow}>
        <View style={styles.stickerArt}>{art}</View>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Txt variant="key" color={look.ink} upper numberOfLines={1} style={styles.stickerTitle}>
            {heading}
          </Txt>
          <Txt variant="micro" color={look.ink} upper numberOfLines={2} style={styles.stickerSub}>
            {sub}
          </Txt>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  titleStrip: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 16 },
  stickerInner: { margin: 2, borderWidth: 1, borderRadius: 2, opacity: 0.55 },
  stickerRow: { flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 6, gap: 6 },
  stickerArt: { width: 28, alignItems: "center", justifyContent: "center", height: 36, overflow: "hidden" },
  stickerTitle: { fontSize: 9.5, lineHeight: 13, letterSpacing: 0.4 },
  stickerSub: { fontSize: 6.5, lineHeight: 9, letterSpacing: 0.4 },
});

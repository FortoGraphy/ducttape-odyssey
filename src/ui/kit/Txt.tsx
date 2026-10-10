// The only text primitive of the app. Fonts come from theme.type, Dynamic Type is clamped so the
// panel layout cannot break, and every variant gets a line box tall enough for Czech capitals
// with carons and rings (Ř, Ů, Ž) in all three bundled faces.
import { memo } from "react";
import { Text, type StyleProp, type TextProps, type TextStyle } from "react-native";

import { MAX_FONT_SCALE, type, type TypeKey } from "@/ui/theme";

import { resolveColor, useTheme, type ColorToken } from "./theme-context";

/** Line heights on (or next to) the 4 pt grid, never below the font's natural 1.2-1.3 em box. */
export const LINE_HEIGHT: Record<TypeKey, number> = {
  lcdXL: 36,
  lcdL: 28,
  lcdM: 20,
  lcdS: 16,
  title: 28,
  heading: 20,
  pixel: 20,
  body: 19,
  bodyBold: 19,
  label: 14,
  micro: 12,
  key: 16,
};

export interface TxtProps extends Omit<TextProps, "style"> {
  variant?: TypeKey;
  /** Theme token ("ink", "inkDim", "orange", "good"...) or any color string. */
  color?: ColorToken | (string & {});
  align?: "left" | "center" | "right";
  /** Upper-case the content (strings only). Uses the locale-aware transform, so "ž" becomes "Ž". */
  upper?: boolean;
  /** Tabular digits where the face supports it (the mono and LCD faces are monospaced anyway). */
  tabular?: boolean;
  style?: StyleProp<TextStyle>;
}

function TxtBase({ variant = "body", color, align, upper, tabular, style, children, ...rest }: TxtProps) {
  const theme = useTheme();
  const isLcd = variant === "lcdXL" || variant === "lcdL" || variant === "lcdM" || variant === "lcdS";
  const base = type[variant] as TextStyle;
  return (
    <Text
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      {...rest}
      style={[
        base,
        {
          lineHeight: base.lineHeight ?? LINE_HEIGHT[variant],
          color: resolveColor(theme, color, isLcd ? theme.lcdOn : theme.ink),
        },
        align ? { textAlign: align } : null,
        upper ? UPPER : null,
        tabular ? TABULAR : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

const UPPER: TextStyle = { textTransform: "uppercase" };
const TABULAR: TextStyle = { fontVariant: ["tabular-nums"] };

export const Txt = memo(TxtBase);

export interface MicroLabelProps extends Omit<TxtProps, "variant" | "upper"> {
  /** "label" is 10 pt, "micro" is 8.5 pt (silk-screen print next to controls). */
  size?: "label" | "micro";
}

/** Printed silk-screen label: mono, upper case, letter-spaced, dim ink by default. */
export const MicroLabel = memo(function MicroLabel({ size = "micro", color = "inkDim", numberOfLines = 1, ...rest }: MicroLabelProps) {
  return <Txt variant={size} color={color} upper numberOfLines={numberOfLines} {...rest} />;
});

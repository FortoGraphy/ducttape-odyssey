// Design tokens for the Control Deck. Colors come from assets/palette.json ("Night Shift").
// Two panel themes: "day" (warm off-white hardware, the default) and "night" (graphite).
// The viewport above the panel is always dark.
import { fonts } from "./fonts";

export const palette = {
  void0: "#05060A",
  void1: "#0A0D14",
  void2: "#111726",
  void3: "#1A2238",
  steel0: "#2A2F3C",
  steel1: "#444A5A",
  steel2: "#6B7284",
  steel3: "#9BA1B0",
  bone0: "#C9C5B8",
  bone1: "#E7E3D8",
  bone2: "#F6F3EA",
  violet0: "#231A42",
  violet1: "#3C2B6E",
  violet2: "#6247A6",
  violet3: "#9C7BE0",
  teal0: "#12303B",
  teal1: "#1F5C6B",
  teal2: "#36A0A6",
  mint: "#7DE0B5",
  cobalt0: "#17307E",
  cobalt1: "#2F5BD6",
  cobalt2: "#7FA4FF",
  rust0: "#3B1A14",
  rust1: "#7A2E18",
  orange: "#FF6A1A",
  amber: "#FFA63D",
  yellow: "#FFD84A",
  red0: "#7C1626",
  red1: "#E0344A",
  green0: "#1E4A30",
  green1: "#43A85F",
  lime: "#B5F27A",
} as const;
export type PaletteKey = keyof typeof palette;

export interface PanelTheme {
  id: "day" | "night";
  /** Panel body and its bevels. */
  body: string;
  bodyHi: string;
  bodyLo: string;
  /** Recessed wells (lists, sockets). */
  well: string;
  /** Engraved rules and screws. */
  rule: string;
  /** Printed text on the body. */
  ink: string;
  inkDim: string;
  /** Rubber keys. */
  key: string;
  keyHi: string;
  keyLo: string;
  keyText: string;
  /** LCD glass. */
  lcdBg: string;
  lcdOn: string;
  lcdDim: string; // unlit segment ghosts
  lcdWarn: string;
  /** Accents (identical in both themes). */
  orange: string;
  cobalt: string;
  yellow: string;
  mint: string;
  red: string;
  ledOff: string;
}

const accents = { orange: palette.orange, cobalt: palette.cobalt1, yellow: palette.yellow, mint: palette.mint, red: palette.red1 };

export const dayTheme: PanelTheme = {
  id: "day",
  body: palette.bone1,
  bodyHi: palette.bone2,
  bodyLo: palette.bone0,
  well: "#D6D2C5",
  rule: "#B9B5A8",
  ink: "#15171C",
  inkDim: "#5A5E69",
  key: "#191B21",
  keyHi: "#2E313A",
  keyLo: "#08090C",
  keyText: palette.bone2,
  lcdBg: "#0B100E",
  lcdOn: "#C9F5D5",
  lcdDim: "#1C2A24",
  lcdWarn: palette.orange,
  ...accents,
  ledOff: "#8D897D",
};

export const nightTheme: PanelTheme = {
  id: "night",
  body: palette.steel0,
  bodyHi: "#363C4B",
  bodyLo: palette.void3,
  well: "#20242F",
  rule: "#1A1D26",
  ink: palette.bone1,
  inkDim: palette.steel3,
  key: "#0E1016",
  keyHi: "#232733",
  keyLo: "#040508",
  keyText: palette.bone1,
  lcdBg: "#070B0A",
  lcdOn: "#C9F5D5",
  lcdDim: "#16211D",
  lcdWarn: palette.orange,
  ...accents,
  ledOff: "#3A3F4C",
};

/** Spacing on a 4 pt grid. */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { key: 7, well: 6, panel: 14, lcd: 5, pill: 999 } as const;
/** Minimum hit target (Apple HIG). */
export const HIT = 44;

/** Viewport takes this share of the screen height (rest is the Control Deck). */
export const VIEWPORT_SHARE = 0.48;

/**
 * Text styles. Sizes are fixed points: pass `allowFontScaling={false}` or `maxFontSizeMultiplier={1.15}`
 * (the kit's Text components do) so Dynamic Type can never break the panel layout.
 */
export const type = {
  lcdXL: { fontFamily: fonts.lcd, fontSize: 30, letterSpacing: 0.5 },
  lcdL: { fontFamily: fonts.lcd, fontSize: 22, letterSpacing: 0.5 },
  lcdM: { fontFamily: fonts.lcd, fontSize: 16, letterSpacing: 0.4 },
  lcdS: { fontFamily: fonts.lcdDim, fontSize: 12, letterSpacing: 0.4 },
  title: { fontFamily: fonts.pixelBold, fontSize: 20 },
  heading: { fontFamily: fonts.pixelBold, fontSize: 16 },
  pixel: { fontFamily: fonts.pixel, fontSize: 14 },
  body: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 19 },
  bodyBold: { fontFamily: fonts.monoBold, fontSize: 13, lineHeight: 19 },
  label: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.8 }, // micro labels, upper-case
  micro: { fontFamily: fonts.monoMedium, fontSize: 8.5, letterSpacing: 1 },
  key: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 0.6 },
} as const;
export type TypeKey = keyof typeof type;

export const MAX_FONT_SCALE = 1.15;

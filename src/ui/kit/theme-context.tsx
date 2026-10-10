// Panel theme context. Everything in the kit reads colors through useTheme(), so a subtree can be
// switched between the "day" (bone) and "night" (graphite) hardware with one provider.
import { createContext, useContext, useMemo, type ReactNode } from "react";

import { dayTheme, nightTheme, palette, type PanelTheme } from "@/ui/theme";

export type ThemeName = "day" | "night";

/** Colors the kit needs on top of PanelTheme. All of them are palette colors or blends of two. */
export interface KitTheme extends PanelTheme {
  /** Screen background behind panels (always dark, same as the viewport surround). */
  backdrop: string;
  /** Raised plates (cards) and pressed list rows. */
  plate: string;
  platePressed: string;
  /** Semantic text tones that stay legible on the body in both themes. */
  good: string;
  bad: string;
  warn: string;
  info: string;
  /** Printed ink on a colored cap or sticker. */
  onAccent: string;
  /** Scrim behind sheets and dialogs. */
  scrim: string;
  /** Black plastic bezel around LCD glass. */
  bezel: string;
  shadow: string;
}

const dayKit: KitTheme = {
  ...dayTheme,
  backdrop: "#07090F",
  plate: palette.bone2,
  platePressed: "#DDD9CD",
  good: "#1F7A3F",
  bad: "#C0263B",
  warn: "#B8480C",
  info: palette.cobalt1,
  onAccent: "#15171C",
  scrim: "rgba(5,6,10,0.62)",
  bezel: "#15171C",
  shadow: "rgba(21,23,28,0.32)",
};

const nightKit: KitTheme = {
  ...nightTheme,
  backdrop: "#07090F",
  plate: "#333948",
  platePressed: "#262B37",
  good: palette.mint,
  bad: "#FF6B7D",
  warn: palette.amber,
  info: palette.cobalt2,
  onAccent: "#15171C",
  scrim: "rgba(5,6,10,0.72)",
  bezel: "#0A0C11",
  shadow: "rgba(0,0,0,0.5)",
};

export const kitThemes: Record<ThemeName, KitTheme> = { day: dayKit, night: nightKit };

const ThemeContext = createContext<KitTheme>(dayKit);

export interface ThemeProviderProps {
  theme?: ThemeName;
  children: ReactNode;
}

export function ThemeProvider({ theme = "day", children }: ThemeProviderProps) {
  const value = useMemo(() => kitThemes[theme], [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): KitTheme {
  return useContext(ThemeContext);
}

/** Named colors accepted by Txt, Led, Badge... Anything else is treated as a raw color string. */
export type ColorToken =
  | "ink"
  | "inkDim"
  | "keyText"
  | "lcdOn"
  | "lcdDim"
  | "lcdWarn"
  | "orange"
  | "cobalt"
  | "yellow"
  | "mint"
  | "red"
  | "good"
  | "bad"
  | "warn"
  | "info"
  | "onAccent";

const TOKENS: Record<ColorToken, true> = {
  ink: true,
  inkDim: true,
  keyText: true,
  lcdOn: true,
  lcdDim: true,
  lcdWarn: true,
  orange: true,
  cobalt: true,
  yellow: true,
  mint: true,
  red: true,
  good: true,
  bad: true,
  warn: true,
  info: true,
  onAccent: true,
};

export function resolveColor(theme: KitTheme, color: ColorToken | (string & {}) | undefined, fallback: string): string {
  if (!color) return fallback;
  return (TOKENS as Record<string, true | undefined>)[color] ? theme[color as ColorToken] : color;
}

export type Accent = "orange" | "cobalt" | "yellow" | "mint" | "red";
export type Tone = "info" | "good" | "warn" | "bad";

/** Accent used for LEDs and fills that represent a semantic tone. */
export const TONE_ACCENT: Record<Tone, Accent> = { info: "cobalt", good: "mint", warn: "yellow", bad: "red" };

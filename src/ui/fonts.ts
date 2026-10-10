// Bundled OFL fonts. Keys equal the PostScript names written by scripts/assets/build_fonts.py,
// which is what iOS uses to address a font. All of them cover Czech diacritics (checked by that script).
export const fontAssets = {
  "Doto-Bold": require("../../assets/fonts/Doto-Bold.ttf"),
  "Doto-Black": require("../../assets/fonts/Doto-Black.ttf"),
  "PixelifySans-Regular": require("../../assets/fonts/PixelifySans-Regular.ttf"),
  "PixelifySans-Bold": require("../../assets/fonts/PixelifySans-Bold.ttf"),
  "IBMPlexMono-Regular": require("../../assets/fonts/IBMPlexMono-Regular.ttf"),
  "IBMPlexMono-Medium": require("../../assets/fonts/IBMPlexMono-Medium.ttf"),
  "IBMPlexMono-Bold": require("../../assets/fonts/IBMPlexMono-Bold.ttf"),
} as const;

export const fonts = {
  /** Dot-matrix LCD readouts. */
  lcd: "Doto-Black",
  lcdDim: "Doto-Bold",
  /** Pixel display face for titles and viewport captions. */
  pixel: "PixelifySans-Regular",
  pixelBold: "PixelifySans-Bold",
  /** Clean mono for micro labels and body text. */
  mono: "IBMPlexMono-Regular",
  monoMedium: "IBMPlexMono-Medium",
  monoBold: "IBMPlexMono-Bold",
} as const;

export type FontKey = keyof typeof fonts;

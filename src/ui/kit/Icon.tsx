// Pixel icon. Looks the name up in the generated icon map (src/ui/icons.generated.ts, produced by
// the asset pipeline). Until that file or a given name exists, a built-in 16x16 glyph is drawn
// instead, so screens can be written before the art lands.
import { memo } from "react";
import { Image, Platform, View, type ImageSourcePropType, type ImageStyle, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

import { palette } from "@/ui/theme";

import { resolveColor, useTheme, type ColorToken } from "./theme-context";

type IconMap = Record<string, ImageSourcePropType>;

function loadGenerated(): IconMap | null {
  try {
    // Optional module: Metro treats a require inside try/catch as an optional dependency.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("../icons.generated") as { icons?: IconMap } | undefined;
    return mod?.icons ?? null;
  } catch {
    return null;
  }
}

const generated = loadGenerated();

/** True when the asset pipeline provides art for this name. */
export function hasIcon(name: string): boolean {
  return !!generated && name in generated;
}

// Built-in fallback glyphs, 16x16, '#' = ink.
const RIGHT = [
  "................",
  "................",
  ".....##.........",
  ".....###........",
  "......###.......",
  ".......###......",
  "........###.....",
  ".........###....",
  ".........###....",
  "........###.....",
  ".......###......",
  "......###.......",
  ".....###........",
  ".....##.........",
  "................",
  "................",
];
const mirror = (rows: string[]) => rows.map((r) => r.split("").reverse().join(""));
const transpose = (rows: string[]) => rows.map((_, y) => rows.map((r) => r[y]).join(""));
const LEFT = mirror(RIGHT);
const DOWN = transpose(RIGHT);
const UP = [...DOWN].reverse();

const GLYPHS: Record<string, string[]> = {
  missing: [
    "................",
    ".##.##.##.##.##.",
    ".#............#.",
    "................",
    ".#....####....#.",
    ".#...##..##...#.",
    ".........##.....",
    ".#......##....#.",
    ".#.....##.....#.",
    ".......##.......",
    ".#............#.",
    ".#.....##.....#.",
    ".......##.......",
    ".#............#.",
    ".##.##.##.##.##.",
    "................",
  ],
  close: [
    "................",
    "................",
    "..##........##..",
    "..###......###..",
    "...###....###...",
    "....###..###....",
    ".....######.....",
    "......####......",
    "......####......",
    ".....######.....",
    "....###..###....",
    "...###....###...",
    "..###......###..",
    "..##........##..",
    "................",
    "................",
  ],
  plus: [
    "................",
    "................",
    "................",
    "......####......",
    "......####......",
    "......####......",
    "...##########...",
    "...##########...",
    "...##########...",
    "...##########...",
    "......####......",
    "......####......",
    "......####......",
    "................",
    "................",
    "................",
  ],
  minus: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "...##########...",
    "...##########...",
    "...##########...",
    "...##########...",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  check: [
    "................",
    "................",
    "................",
    "............##..",
    "...........###..",
    "..........###...",
    ".........###....",
    "..##....###.....",
    "..###..###......",
    "...######.......",
    "....####........",
    ".....##.........",
    "................",
    "................",
    "................",
    "................",
  ],
  lock: [
    "................",
    ".....######.....",
    "....##....##....",
    "....##....##....",
    "....##....##....",
    "....##....##....",
    "..############..",
    "..############..",
    "..#####..#####..",
    "..#####..#####..",
    "..#####..#####..",
    "..############..",
    "..############..",
    "..############..",
    "................",
    "................",
  ],
  warning: [
    "................",
    ".......##.......",
    "......####......",
    "......####......",
    ".....##..##.....",
    ".....##..##.....",
    "....###..###....",
    "....###..###....",
    "...####..####...",
    "...####..####...",
    "..############..",
    "..#####..#####..",
    ".######..######.",
    ".##############.",
    "................",
    "................",
  ],
  info: [
    "................",
    ".....######.....",
    "...##########...",
    "..#####..#####..",
    "..#####..#####..",
    ".##############.",
    ".######..######.",
    ".######..######.",
    ".######..######.",
    ".######..######.",
    ".######..######.",
    "..#####..#####..",
    "..############..",
    "...##########...",
    ".....######.....",
    "................",
  ],
  star: [
    "................",
    ".......##.......",
    ".......##.......",
    "......####......",
    "......####......",
    ".##############.",
    "..############..",
    "...##########...",
    "....########....",
    "....########....",
    "...####..####...",
    "...###....###...",
    "..###......###..",
    "..#..........#..",
    "................",
    "................",
  ],
  coin: [
    "................",
    ".....######.....",
    "...##########...",
    "..###......###..",
    "..##........##..",
    ".##...####...##.",
    ".##...####...##.",
    ".##...####...##.",
    ".##...####...##.",
    ".##...####...##.",
    ".##...####...##.",
    "..##........##..",
    "..###......###..",
    "...##########...",
    ".....######.....",
    "................",
  ],
  right: RIGHT,
  left: LEFT,
  back: LEFT,
  up: UP,
  down: DOWN,
};

const pathCache = new Map<string, string>();

function glyphPath(name: string): string {
  const key = name in GLYPHS ? name : "missing";
  let d = pathCache.get(key);
  if (d === undefined) {
    d = "";
    const rows = GLYPHS[key];
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      let x = 0;
      while (x < row.length) {
        if (row[x] !== "#") {
          x++;
          continue;
        }
        let end = x;
        while (end < row.length && row[end] === "#") end++;
        d += `M${x} ${y}h${end - x}v1h${x - end}z`;
        x = end;
      }
    }
    pathCache.set(key, d);
  }
  return d;
}

export interface IconProps {
  name: string;
  /** 16, 24 or 32 keep the pixel grid on integer ratios at @3x. */
  size?: number;
  /** Dark rounded chip behind the icon so light pixel art reads on the bone panel. */
  chip?: boolean;
  /** Tint of the built-in fallback glyph (generated art is never tinted). */
  color?: ColorToken | (string & {});
  style?: StyleProp<ViewStyle>;
}

const PIXELATED = Platform.OS === "web" ? ({ imageRendering: "pixelated" } as unknown as ImageStyle) : null;

export const Icon = memo(function Icon({ name, size = 16, chip, color, style }: IconProps) {
  const theme = useTheme();
  const source = generated ? (generated[name] ?? generated.missing) : undefined;
  const tint = resolveColor(theme, color, chip ? palette.bone1 : theme.ink);

  const art = source ? (
    <Image source={source} style={[{ width: size, height: size }, PIXELATED]} resizeMode="contain" fadeDuration={0} />
  ) : (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Path d={glyphPath(name)} fill={tint} />
    </Svg>
  );

  if (!chip) {
    return (
      <View style={[{ width: size, height: size }, style]} accessibilityElementsHidden importantForAccessibility="no">
        {art}
      </View>
    );
  }
  const pad = size >= 24 ? 6 : 4;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        {
          width: size + pad * 2,
          height: size + pad * 2,
          borderRadius: 5,
          backgroundColor: theme.bezel,
          borderTopWidth: 1,
          borderTopColor: theme.keyLo,
          borderBottomWidth: 1,
          borderBottomColor: theme.bodyHi,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      {art}
    </View>
  );
});

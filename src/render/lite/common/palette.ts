// Shared by both renderers (pure data, no Skia, no React). Everything the viewport draws is one of
// the 32 "Night Shift" colors, addressed by index so the UI thread never parses color strings.
import paletteJson from "../../../../assets/palette.json";

const colors = paletteJson.colors as Record<string, string>;

export const PAL_KEYS: string[] = Object.keys(colors);
export const PAL_HEX: string[] = PAL_KEYS.map((k) => colors[k]);

/** Flat RGB triples in 0..1, 3 per palette entry. */
export const PAL_RGB: number[] = [];
for (const hex of PAL_HEX) {
  const n = parseInt(hex.slice(1), 16);
  PAL_RGB.push(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const INDEX: Record<string, number> = {};
PAL_KEYS.forEach((k, i) => {
  INDEX[k] = i;
});

/** Palette index of a key; `fallback` when the key is unknown. */
export function pi(key: string, fallback = "steel2"): number {
  const i = INDEX[key];
  return i === undefined ? INDEX[fallback] : i;
}

export function hex(key: string): string {
  return PAL_HEX[pi(key)];
}

/** RGB triples (0..1) for a list of palette keys, flattened. */
export function rampRgb(keys: string[]): number[] {
  const out: number[] = [];
  for (const k of keys) {
    const i = pi(k) * 3;
    out.push(PAL_RGB[i], PAL_RGB[i + 1], PAL_RGB[i + 2]);
  }
  return out;
}

/**
 * Cosmetic values ("paint" and "trail") are palette keys or free-form cosmetic values. Anything
 * that contains a palette family name maps to that family, so "orange", "paint_cobalt" and
 * "cobalt1" all resolve. Returns a 4-step ramp of palette keys, dark to light.
 */
const FAMILIES: [string, string[]][] = [
  ["bone", ["steel2", "bone0", "bone1", "bone2"]],
  ["steel", ["steel0", "steel1", "steel2", "steel3"]],
  ["orange", ["rust0", "rust1", "orange", "amber"]],
  ["rust", ["rust0", "rust1", "orange", "amber"]],
  ["amber", ["rust1", "orange", "amber", "yellow"]],
  ["yellow", ["rust1", "amber", "yellow", "bone2"]],
  ["red", ["rust0", "red0", "red1", "amber"]],
  ["cobalt", ["void3", "cobalt0", "cobalt1", "cobalt2"]],
  ["blue", ["void3", "cobalt0", "cobalt1", "cobalt2"]],
  ["violet", ["violet0", "violet1", "violet2", "violet3"]],
  ["teal", ["teal0", "teal1", "teal2", "mint"]],
  ["mint", ["teal0", "teal1", "teal2", "mint"]],
  ["green", ["green0", "green1", "lime", "bone2"]],
  ["lime", ["green0", "green1", "lime", "bone2"]],
  ["void", ["void1", "void2", "void3", "steel0"]],
];

export function familyRamp(value: string | undefined, fallback: string): string[] {
  const v = (value ?? "").toLowerCase();
  for (const [name, ramp] of FAMILIES) if (v.includes(name)) return ramp;
  for (const [name, ramp] of FAMILIES) if (name === fallback) return ramp;
  return FAMILIES[0][1];
}

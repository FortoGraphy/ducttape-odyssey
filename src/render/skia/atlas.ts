// Sprite sources for the Skia renderer: the procedural sheet (always available) plus the generated
// atlas when the asset pipeline has produced one. A generated frame replaces the procedural frame of
// the same name; lamps come from its `_e` twin and are simply absent when the atlas has none.
import { AlphaType, ColorType, Skia } from "@shopify/react-native-skia";
import type { DataSourceParam, SkImage } from "@shopify/react-native-skia";

import { FRAME_ID, FRAME_NAMES, SHIP_CELL, SHIP_EMITTER, SHIP_NOZZLE, getSpriteSet, packSheet } from "../lite/common/sprites";
import type { SpriteSet } from "../lite/common/sprites";

interface GeneratedFrame {
  atlas: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Point {
  x: number;
  y: number;
}
interface GeneratedAtlas {
  atlases: Record<string, DataSourceParam>;
  frames: Record<string, GeneratedFrame>;
  /** Optional attachment points per group (frame pixels of the resting frame), e.g. anchors.ship_tug. */
  anchors?: Record<string, { center?: Point; engine?: Point; laser?: Point }>;
}

function loadGenerated(): GeneratedAtlas | null {
  try {
    // Optional module: Metro bundles it when the file exists and leaves a throwing stub otherwise.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("../atlas.generated");
    const data = (mod && (mod.default ?? mod.atlas ?? mod.ATLAS ?? mod)) as Partial<GeneratedAtlas> | undefined;
    if (data && typeof data.atlases === "object" && data.atlases && typeof data.frames === "object" && data.frames) {
      return { atlases: data.atlases, frames: data.frames, anchors: data.anchors ?? mod.anchors };
    }
  } catch {
    // no generated atlas yet: procedural sprites only
  }
  return null;
}

// EXPO_PUBLIC_VIEWPORT_ATLAS=off forces the procedural sprites (QA of the fallback path).
const generated = process.env.EXPO_PUBLIC_VIEWPORT_ATLAS === "off" ? null : loadGenerated();

export const generatedAtlasNames: string[] = generated ? Object.keys(generated.atlases) : [];
export function generatedAtlasSource(name: string): DataSourceParam {
  return generated ? generated.atlases[name] : null;
}

interface ProceduralImages {
  base: SkImage;
  emissive: SkImage;
  rects: Int16Array;
  lit: Uint8Array;
}

const proceduralCache = new Map<SpriteSet, ProceduralImages | null>();

function buildProcedural(paint: string): ProceduralImages | null {
  const set = getSpriteSet(paint);
  if (proceduralCache.has(set)) return proceduralCache.get(set) ?? null;
  const sheet = packSheet(set);
  // the 1x1 and 2x2 particle texels are pure white so the per-sprite color is exact
  for (const id of [FRAME_ID.px, FRAME_ID.px2]) {
    const x0 = sheet.rects[id * 4];
    const y0 = sheet.rects[id * 4 + 1];
    for (let y = 0; y < sheet.rects[id * 4 + 3]; y++)
      for (let x = 0; x < sheet.rects[id * 4 + 2]; x++) sheet.base.fill(255, ((y0 + y) * sheet.width + x0 + x) * 4, ((y0 + y) * sheet.width + x0 + x) * 4 + 4);
  }
  const info = { width: sheet.width, height: sheet.height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul };
  let result: ProceduralImages | null = null;
  try {
    const base = Skia.Image.MakeImage(info, Skia.Data.fromBytes(sheet.base), sheet.width * 4);
    const emissive = Skia.Image.MakeImage(info, Skia.Data.fromBytes(sheet.emissive), sheet.width * 4);
    if (base && emissive) {
      const lit = new Uint8Array(set.sprites.length);
      set.sprites.forEach((s, i) => {
        lit[i] = s.em.some((v) => v !== 0) ? 1 : 0;
      });
      result = { base, emissive, rects: sheet.rects, lit };
    }
  } catch (e) {
    console.warn("viewport: could not build the procedural sprite sheet", e);
  }
  proceduralCache.set(set, result);
  return result;
}

export interface BuiltAssets {
  imgs: SkImage[];
  /** 10 numbers per frame slot: [img, x, y, w, h, imgE, ex, ey, ew, eh]. */
  fr: number[];
  /** Ship origin inside its frame, then nozzle and laser offsets from that origin (see AssetsU.an). */
  an: number[];
}

/**
 * `loaded` holds the decoded generated atlases by name (missing or null = not available yet).
 * Returns null only when not even the procedural sheet could be created.
 */
export function buildAssets(paint: string, hull: string, loaded: Record<string, SkImage | null>): BuiltAssets | null {
  const proc = buildProcedural(paint);
  if (!proc) return null;
  const imgs: SkImage[] = [proc.base, proc.emissive];
  const imgIndex: Record<string, number> = {};
  for (const name of generatedAtlasNames) {
    const img = loaded[name];
    if (img) {
      imgIndex[name] = imgs.length;
      imgs.push(img);
    }
  }
  const fr: number[] = [];
  FRAME_NAMES.forEach((slot, i) => {
    const r = proc.rects;
    const name = slot.startsWith("ship_") ? `ship_${hull || "tug"}_${slot.slice(5)}` : slot;
    // utility texels (stars, particles, streaks) always come from the procedural sheet
    const g = i >= FRAME_ID.ship_00 ? generated?.frames[name] : undefined;
    if (g && imgIndex[g.atlas] !== undefined) {
      fr.push(imgIndex[g.atlas], g.x, g.y, g.w, g.h);
      const e = generated?.frames[`${name}_e`];
      if (e && imgIndex[e.atlas] !== undefined) fr.push(imgIndex[e.atlas], e.x, e.y, e.w, e.h);
      else fr.push(-1, 0, 0, 0, 0);
      return;
    }
    fr.push(0, r[i * 4], r[i * 4 + 1], r[i * 4 + 2], r[i * 4 + 3]);
    if (proc.lit[i]) fr.push(1, r[i * 4], r[i * 4 + 1], r[i * 4 + 2], r[i * 4 + 3]);
    else fr.push(-1, 0, 0, 0, 0);
  });
  // attachment points: from the generated atlas when the ship itself comes from it
  const half = SHIP_CELL / 2;
  let an = [half, half, SHIP_NOZZLE.x, SHIP_NOZZLE.y, SHIP_EMITTER.x, SHIP_EMITTER.y];
  const shipSlot = FRAME_ID.ship_00 * 10;
  if (fr[shipSlot] > 1) {
    const w = fr[shipSlot + 3];
    const h = fr[shipSlot + 4];
    const a = generated?.anchors?.[`ship_${hull || "tug"}`];
    const c = a?.center ?? { x: w / 2, y: h / 2 };
    const engine = a?.engine ?? { x: 0, y: h / 2 };
    const laser = a?.laser ?? { x: w - 1, y: h / 2 };
    an = [Math.round(c.x), Math.round(c.y), Math.round(engine.x - c.x), Math.round(engine.y - c.y), Math.round(laser.x - c.x), Math.round(laser.y - c.y)];
  }
  return { imgs, fr, an };
}

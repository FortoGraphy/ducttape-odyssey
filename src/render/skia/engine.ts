// The viewport frame loop. Everything here runs on the UI thread (worklets).
//
// Rendering model: the whole scene is drawn imperatively into ONE low-resolution offscreen surface
// (about 188x195 px on an iPhone 13 mini), snapshotted, and the on-screen <Canvas> upscales that
// image by an integer factor with nearest sampling (see SkiaViewport.tsx). Drawing at the internal
// resolution is ~36x less fill than a full-resolution pass, keeps every edge on the pixel grid and
// lets the bloom run on a tiny target.
//
// Allocation rules: the state object (surface, paints, rect/transform/color pools, typed arrays for
// stars and particles, uniform arrays) is created once per size/quality. A steady-state frame only
// mutates it. Shader objects are immutable in Skia, so the nebula/star/planet shaders are cached
// and rebuilt only when their quantized inputs change (nebula: when the drift crosses a pixel,
// planet: one rotation step every ~0.45 s); the previous shader is disposed immediately.
import { AlphaType, BlendMode, ColorType, FilterMode, MipmapMode, PaintStyle, Skia, TileMode } from "@shopify/react-native-skia";
import type { SkCanvas, SkColor, SkHostRect, SkImage, SkPaint, SkRSXform, SkShader, SkSurface } from "@shopify/react-native-skia";
import type { SharedValue } from "react-native-reanimated";

import { PAL_RGB, pi } from "../lite/common/palette";
import type { SceneU } from "../lite/common/scene";
import { salvageX, salvageY } from "../lite/common/scene";
import { FRAME_ID } from "../lite/common/sprites";

import { NEBULA_FLOATS, PLANET_FLOATS, STAR_FLOATS, nebulaEffect, planetEffects, starEffect } from "./shaders";

export interface QualityU {
  level: number;
  fps: number;
  calm: number;
}

/** Images and the frame table: 10 numbers per frame slot [img, x, y, w, h, imgE, ex, ey, ew, eh], img -1 = none. */
export interface AssetsU {
  imgs: SkImage[];
  fr: number[];
  /** Ship attachment points: [originX, originY] inside the frame, then nozzle and laser emitter offsets from that origin. */
  an: number[];
}

const BLEND_PLUS = BlendMode.Plus;
const BLEND_MODULATE = BlendMode.Modulate;
const BLEND_SRC_OVER = BlendMode.SrcOver;
const STYLE_STROKE = PaintStyle.Stroke;
const TILE_DECAL = TileMode.Decal;
const NEAREST = { filter: FilterMode.Nearest, mipmap: MipmapMode.None };
const PROBE_INFO = { width: 1, height: 1, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul };

const N_FAR = 60;
const N_MID = 36;
const N_NEAR = 16;
const N_STARS = N_FAR + N_MID + N_NEAR;
const N_ROCKS = 5;
const N_METEORS = 4;
const BATCH_CAP = 48;
const SMOKE_CAP = 64;
const P_CAPS = [40, 110, 240];
const STAR_PAD = 16;

const C = {
  void0: pi("void0"), void1: pi("void1"), void2: pi("void2"), void3: pi("void3"),
  steel0: pi("steel0"), steel1: pi("steel1"), steel2: pi("steel2"), steel3: pi("steel3"),
  bone0: pi("bone0"), bone1: pi("bone1"), bone2: pi("bone2"),
  violet0: pi("violet0"), violet1: pi("violet1"), violet2: pi("violet2"), violet3: pi("violet3"),
  teal0: pi("teal0"), teal1: pi("teal1"), teal2: pi("teal2"), mint: pi("mint"),
  cobalt0: pi("cobalt0"), cobalt1: pi("cobalt1"), cobalt2: pi("cobalt2"),
  rust0: pi("rust0"), rust1: pi("rust1"), orange: pi("orange"), amber: pi("amber"), yellow: pi("yellow"),
  red0: pi("red0"), red1: pi("red1"), green0: pi("green0"), green1: pi("green1"), lime: pi("lime"),
};

// Particle kinds: each fades through a palette ramp over its life.
const K_SPARK = 1;
const K_SMOKE = 2;
const K_COLLECT = 3;
const K_JUMP = 4;
const K_LEVEL = 5;
const K_BOOM = 6;
const K_SCAN = 7;
const K_VENT = 8;
const K_CHARGE = 9;
const K_EMBER = 10;
const K_FROST = 11;
const K_TOXIC = 12;
const K_RAD = 13;
const K_TRAIL = 14;
const K_RIFT = 15;
const RAMPS: number[][] = [
  [C.bone2, C.yellow, C.amber, C.orange, C.rust1],
  [C.bone2, C.yellow, C.amber, C.orange],
  [C.steel2, C.steel1, C.steel0, C.void3],
  [C.bone2, C.mint, C.teal2, C.teal1],
  [C.bone2, C.cobalt2, C.violet3, C.violet2, C.violet1],
  [C.bone2, C.yellow, C.lime, C.green1],
  [C.bone2, C.yellow, C.amber, C.orange, C.red1, C.rust1, C.rust0],
  [C.mint, C.teal2, C.teal1, C.teal0],
  [C.bone2, C.bone1, C.steel3, C.steel2, C.steel1],
  [C.bone2, C.cobalt2, C.cobalt1, C.violet2],
  [C.yellow, C.amber, C.orange, C.rust1],
  [C.bone2, C.cobalt2, C.steel3],
  [C.green1, C.green0, C.teal0],
  [C.bone2, C.lime, C.mint, C.violet3],
  [C.bone2, C.amber, C.orange, C.rust1, C.rust0],
  [C.bone2, C.violet3, C.violet2, C.mint, C.violet1],
];
const RAMP_OFF: number[] = [];
const RAMP_LEN: number[] = [];
const RAMP_DATA: number[] = [];
for (const r of RAMPS) {
  RAMP_OFF.push(RAMP_DATA.length);
  RAMP_LEN.push(r.length);
  for (const c of r) RAMP_DATA.push(c);
}
/** Kinds that are not light sources: drawn in the base pass and excluded from the bloom. */
const DULL = [0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0];

const F_HOMING = 1;
const F_GRAVITY = 2;
const F_DRAG = 4;
const F_BIG = 8;

const FR_PX = FRAME_ID.px;
const FR_PX2 = FRAME_ID.px2;
const FR_GLINT = FRAME_ID.glint;
const FR_SPARKLE = FRAME_ID.sparkle;
const FR_STREAK = FRAME_ID.streak4;
const FR_SHIP = FRAME_ID.ship_00;
const FR_DRONE = FRAME_ID.drone_hauler_0;
const FR_STATION = FRAME_ID.station_0;
const FR_STATION_FAR = FRAME_ID.station_far;
const FR_ASTEROID = FRAME_ID.asteroid_0;
const FR_SALVAGE = FRAME_ID.salvage_crate;
const FR_TOW = FRAME_ID.tow_0;
const FR_METEOR = FRAME_ID.meteor_0;
const FR_PIRATE = FRAME_ID.pirate_0;
const FR_DERELICT = FRAME_ID.derelict_0;


/** Mutable render state, owned by the UI thread. */
export interface VP {
  surface: SkSurface;
  canvas: SkCanvas;
  gpu: boolean;
  web: boolean;
  W: number;
  H: number;
  level: number;
  img: SkImage | null;
  prev: SkImage | null;
  prev2: SkImage | null;
  fill: SkPaint;
  shP: SkPaint;
  atlasP: SkPaint;
  lineP: SkPaint;
  bloomP: SkPaint | null;
  rect: SkHostRect;
  col: SkColor[];
  white: SkColor;
  dim: SkColor;
  tmp: SkColor;
  t: number;
  frame: number;
  acc: number;
  rs: number;
  calls: number;
  // smoothed scene values
  thrust: number;
  charge: number;
  damage: number;
  warp: number;
  orbit: number;
  dock: number;
  mine: number;
  shipX: number;
  shipY: number;
  spin: number;
  sFar: number;
  sMid: number;
  sNear: number;
  sNeb: number;
  // stars
  starSeed: number;
  starX: Float32Array;
  starY: Float32Array;
  starPh: Float32Array;
  starC: Uint8Array;
  starK: Uint8Array;
  sSrc: SkHostRect[];
  sXf: SkRSXform[];
  sCol: SkColor[];
  // drifting rocks and meteors
  rockX: Float32Array;
  rockY: Float32Array;
  rockV: Uint8Array;
  metX: Float32Array;
  metY: Float32Array;
  // sprite batch
  bImg: number;
  bN: number;
  bHigh: number;
  bSrc: SkHostRect[];
  bXf: SkRSXform[];
  bCol: SkColor[];
  // particles
  pCap: number;
  pNext: number;
  pX: Float32Array;
  pY: Float32Array;
  pVX: Float32Array;
  pVY: Float32Array;
  pLife: Float32Array;
  pMax: Float32Array;
  pKind: Uint8Array;
  pFlag: Uint8Array;
  trail: Uint8Array;
  eSrc: SkHostRect[];
  eXf: SkRSXform[];
  eCol: SkColor[];
  eN: number;
  eHigh: number;
  dSrc: SkHostRect[];
  dXf: SkRSXform[];
  dCol: SkColor[];
  dN: number;
  dHigh: number;
  aTrail: number;
  aSpark: number;
  aSmoke: number;
  aHaz: number;
  aFail: number;
  aCharge: number;
  // cached shaders
  uNeb: number[];
  uStar: number[];
  uPlanet: number[];
  nebSh: SkShader | null;
  nebKey: number;
  nebOx: number;
  starSh: SkShader | null;
  starKey: number;
  pSh: SkShader | null;
  pShE: SkShader | null;
  pKey: number;
  pStep: number;
  pR: number;
  pExt: number;
  pCx: number;
  pCy: number;
  pKindNow: number;
  // effects
  shake: number;
  shakeX: number;
  shakeY: number;
  flashA: number;
  flashDecay: number;
  flashC: SkColor;
  pulse: number;
  pulseX: number;
  pulseY: number;
  pulseC: number;
  boltT: number;
  boltLife: number;
  boltSeed: number;
  hzNow: number;
  // laser target of the current frame
  beam: number;
  beamX: number;
  beamY: number;
  // perf
  perfT: number;
  perfN: number;
  perfCpu: number;
  perfPub: number;
  failed: boolean;
}

function rnd(st: VP): number {
  "worklet";
  st.rs = (Math.imul(st.rs, 1664525) + 1013904223) >>> 0;
  return st.rs / 4294967296;
}

function hash1(n: number): number {
  "worklet";
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * True when the surface really holds the frame that was just drawn (every frame starts with an
 * opaque clear, so alpha must be 255). Used once after the first frames: a GPU surface that reads
 * back empty is replaced by a CPU one, and a CPU one that fails hands over to the lite renderer.
 */
export function surfaceWorks(st: VP): boolean {
  "worklet";
  try {
    const px = st.canvas.readPixels(st.W >> 1, st.H >> 1, PROBE_INFO);
    return !!px && px.length >= 4 && px[3] > 0;
  } catch {
    return false;
  }
}

export function createState(W: number, H: number, level: number, web: boolean, forceCpu: boolean): VP | null {
  "worklet";
  let surface: SkSurface | null = null;
  let gpu = !forceCpu;
  try {
    surface = forceCpu ? null : Skia.Surface.MakeOffscreen(W, H);
  } catch {
    surface = null;
  }
  if (!surface) {
    gpu = false;
    try {
      surface = Skia.Surface.Make(W, H);
    } catch {
      surface = null;
    }
  }
  if (!surface) return null;

  const fill = Skia.Paint();
  fill.setAntiAlias(false);
  const shP = Skia.Paint();
  shP.setAntiAlias(false);
  const atlasP = Skia.Paint();
  atlasP.setAntiAlias(false);
  const lineP = Skia.Paint();
  lineP.setAntiAlias(false);
  lineP.setStyle(STYLE_STROKE);
  lineP.setStrokeWidth(1);

  // Bloom: the emissive pass is drawn a second time into a layer whose paint blurs it and adds it
  // back (Plus). Level 2 mixes a tight and a wide blur; level 1 uses the tight one only.
  let bloomP: SkPaint | null = null;
  if (level > 0) {
    const boost = (k: number) => Skia.ColorFilter.MakeMatrix([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, k, 0]);
    const tight = Skia.ImageFilter.MakeColorFilter(boost(1.1), Skia.ImageFilter.MakeBlur(1.5, 1.5, TILE_DECAL, null));
    let filter = tight;
    if (level > 1) {
      const wide = Skia.ImageFilter.MakeColorFilter(boost(0.8), Skia.ImageFilter.MakeBlur(5.5, 5.5, TILE_DECAL, null));
      filter = Skia.ImageFilter.MakeBlend(BLEND_PLUS, tight, wide);
    }
    bloomP = Skia.Paint();
    bloomP.setImageFilter(filter);
    bloomP.setBlendMode(BLEND_PLUS);
  }

  const col: SkColor[] = [];
  for (let i = 0; i < PAL_RGB.length; i += 3) col.push(Float32Array.of(PAL_RGB[i], PAL_RGB[i + 1], PAL_RGB[i + 2], 1));
  const white = Float32Array.of(1, 1, 1, 1);

  const pool = <T>(n: number, make: () => T): T[] => {
    const out: T[] = [];
    for (let i = 0; i < n; i++) out.push(make());
    return out;
  };
  const mkRect = () => Skia.XYWHRect(0, 0, 1, 1);
  const mkXf = () => Skia.RSXform(0, 0, 0, 0);
  const pCap = P_CAPS[level];

  const st: VP = {
    surface,
    canvas: surface.getCanvas(),
    gpu,
    web,
    W,
    H,
    level,
    img: null,
    prev: null,
    prev2: null,
    fill,
    shP,
    atlasP,
    lineP,
    bloomP,
    rect: Skia.XYWHRect(0, 0, 1, 1),
    col,
    white,
    dim: Float32Array.of(0.34, 0.37, 0.5, 1),
    tmp: Float32Array.of(0, 0, 0, 1),
    t: 0,
    frame: 0,
    acc: 1,
    rs: 0x9e3779b9,
    calls: 0,
    thrust: 0.3,
    charge: 0,
    damage: 0,
    warp: 0,
    orbit: 0,
    dock: 0,
    mine: 0,
    shipX: W * 0.4,
    shipY: H * 0.56,
    spin: 0,
    sFar: 0,
    sMid: 0,
    sNear: 0,
    sNeb: 0,
    starSeed: -1,
    starX: new Float32Array(N_STARS),
    starY: new Float32Array(N_STARS),
    starPh: new Float32Array(N_STARS),
    starC: new Uint8Array(N_STARS * 3),
    starK: new Uint8Array(N_STARS),
    sSrc: pool(N_STARS, mkRect),
    sXf: pool(N_STARS, mkXf),
    sCol: pool(N_STARS, () => white),
    rockX: new Float32Array(N_ROCKS),
    rockY: new Float32Array(N_ROCKS),
    rockV: new Uint8Array(N_ROCKS),
    metX: new Float32Array(N_METEORS),
    metY: new Float32Array(N_METEORS),
    bImg: -1,
    bN: 0,
    bHigh: 0,
    bSrc: pool(BATCH_CAP, mkRect),
    bXf: pool(BATCH_CAP, mkXf),
    bCol: pool(BATCH_CAP, () => white),
    pCap,
    pNext: 0,
    pX: new Float32Array(pCap),
    pY: new Float32Array(pCap),
    pVX: new Float32Array(pCap),
    pVY: new Float32Array(pCap),
    pLife: new Float32Array(pCap),
    pMax: new Float32Array(pCap),
    pKind: new Uint8Array(pCap),
    pFlag: new Uint8Array(pCap),
    trail: new Uint8Array(5),
    eSrc: pool(pCap, mkRect),
    eXf: pool(pCap, mkXf),
    eCol: pool(pCap, () => white),
    eN: 0,
    eHigh: 0,
    dSrc: pool(SMOKE_CAP, mkRect),
    dXf: pool(SMOKE_CAP, mkXf),
    dCol: pool(SMOKE_CAP, () => white),
    dN: 0,
    dHigh: 0,
    aTrail: 0,
    aSpark: 0,
    aSmoke: 0,
    aHaz: 0,
    aFail: 0,
    aCharge: 0,
    uNeb: pool(NEBULA_FLOATS, () => 0),
    uStar: pool(STAR_FLOATS, () => 0),
    uPlanet: pool(PLANET_FLOATS, () => 0),
    nebSh: null,
    nebKey: -1,
    nebOx: -1e9,
    starSh: null,
    starKey: -1,
    pSh: null,
    pShE: null,
    pKey: -1,
    pStep: -1,
    pR: 30,
    pExt: 34,
    pCx: W * 0.7,
    pCy: H * 0.3,
    pKindNow: 0,
    shake: 0,
    shakeX: 0,
    shakeY: 0,
    flashA: 0,
    flashDecay: 4,
    flashC: Float32Array.of(1, 1, 1, 1),
    pulse: 0,
    pulseX: 0,
    pulseY: 0,
    pulseC: C.cobalt2,
    boltT: 1.5,
    boltLife: 0,
    boltSeed: 1,
    hzNow: 0,
    beam: 0,
    beamX: 0,
    beamY: 0,
    perfT: 0,
    perfN: 0,
    perfCpu: 0,
    perfPub: 0,
    failed: false,
  };
  for (let i = 0; i < N_METEORS; i++) {
    st.metX[i] = rnd(st) * (W + 60);
    st.metY[i] = rnd(st) * H;
  }
  return st;
}

export function disposeState(st: VP | null, frame: SharedValue<SkImage | null>): void {
  "worklet";
  if (!st) return;
  try {
    frame.value = null;
    if (st.nebSh) st.nebSh.dispose();
    if (st.starSh) st.starSh.dispose();
    if (st.pSh) st.pSh.dispose();
    if (st.pShE) st.pShE.dispose();
    if (st.prev2) st.prev2.dispose();
    if (st.prev) st.prev.dispose();
    if (st.img) st.img.dispose();
    st.surface.dispose();
  } catch {
    // disposal is best effort: the objects are garbage collected otherwise
  }
}

function seedStars(st: VP, seed: number): void {
  "worklet";
  st.starSeed = seed;
  const keep = st.rs;
  st.rs = (seed * 2654435761 + 12345) >>> 0;
  const span = st.W + STAR_PAD * 2;
  for (let i = 0; i < N_STARS; i++) {
    st.starX[i] = rnd(st) * span;
    st.starY[i] = rnd(st) * st.H;
    st.starPh[i] = rnd(st);
    const tintRoll = rnd(st);
    const o = i * 3;
    if (i < N_FAR) {
      st.starK[i] = 0;
      st.starC[o] = C.void3;
      st.starC[o + 1] = tintRoll < 0.3 ? C.steel1 : C.steel0;
      st.starC[o + 2] = C.steel2;
    } else if (i < N_FAR + N_MID) {
      st.starK[i] = 0;
      st.starC[o] = C.steel1;
      st.starC[o + 1] = tintRoll < 0.12 ? C.cobalt1 : tintRoll < 0.2 ? C.violet2 : C.steel2;
      st.starC[o + 2] = C.steel3;
    } else {
      st.starK[i] = tintRoll < 0.14 ? 2 : tintRoll < 0.5 ? 1 : 0;
      st.starC[o] = C.steel3;
      st.starC[o + 1] = tintRoll > 0.85 ? C.amber : tintRoll > 0.7 ? C.cobalt2 : C.bone1;
      st.starC[o + 2] = C.bone2;
    }
  }
  for (let i = 0; i < N_ROCKS; i++) {
    st.rockX[i] = rnd(st) * (st.W + 80);
    st.rockY[i] = 16 + rnd(st) * (st.H - 32);
    st.rockV[i] = Math.floor(rnd(st) * 4);
  }
  st.rs = keep;
}

function fillRect(st: VP, x: number, y: number, w: number, h: number, c: number, a: number): void {
  "worklet";
  st.rect.setXYWH(x, y, w, h);
  st.fill.setColor(st.col[c]);
  if (a < 1) st.fill.setAlphaf(a);
  st.canvas.drawRect(st.rect, st.fill);
  st.calls++;
}

function fillCircle(st: VP, x: number, y: number, r: number, c: number, a: number): void {
  "worklet";
  st.fill.setColor(st.col[c]);
  if (a < 1) st.fill.setAlphaf(a);
  st.canvas.drawCircle(x, y, r, st.fill);
  st.calls++;
}

function line(st: VP, x0: number, y0: number, x1: number, y1: number, c: number, w: number, a: number): void {
  "worklet";
  st.lineP.setColor(st.col[c]);
  if (a < 1) st.lineP.setAlphaf(a);
  st.lineP.setStrokeWidth(w);
  st.canvas.drawLine(x0 + 0.5, y0 + 0.5, x1 + 0.5, y1 + 0.5, st.lineP);
  st.calls++;
}

function flush(st: VP, as: AssetsU): void {
  "worklet";
  const n = st.bN;
  if (n === 0) return;
  for (let i = n; i < st.bHigh; i++) st.bXf[i].set(0, 0, 0, 0);
  st.bHigh = n;
  const img = as.imgs[st.bImg];
  if (img) {
    st.canvas.drawAtlas(img, st.bSrc, st.bXf, st.atlasP, BLEND_MODULATE, st.bCol, NEAREST);
    st.calls++;
  }
  st.bN = 0;
}

/** Queues one sprite centred on (cx, cy). `e` = 1 selects the emissive frame of the slot. */
function sprite(st: VP, as: AssetsU, slot: number, e: number, cx: number, cy: number, color: SkColor): void {
  "worklet";
  const o = slot * 10 + e * 5;
  const img = as.fr[o];
  if (img < 0) return;
  if (st.bN > 0 && (st.bImg !== img || st.bN >= BATCH_CAP)) flush(st, as);
  st.bImg = img;
  const i = st.bN++;
  const w = as.fr[o + 3];
  const h = as.fr[o + 4];
  st.bSrc[i].setXYWH(as.fr[o + 1], as.fr[o + 2], w, h);
  st.bXf[i].set(1, 0, Math.round(cx - w / 2), Math.round(cy - h / 2));
  st.bCol[i] = color;
}

/** Queues the ship: placed by its anchor origin instead of the frame centre. */
function shipSprite(st: VP, as: AssetsU, frame: number, e: number, x: number, y: number, color: SkColor): void {
  "worklet";
  const o = (FR_SHIP + frame) * 10 + e * 5;
  sprite(st, as, FR_SHIP + frame, e, x - as.an[0] + as.fr[o + 3] / 2, y - as.an[1] + as.fr[o + 4] / 2, color);
}

function spawn(st: VP, kind: number, x: number, y: number, vx: number, vy: number, life: number, flag: number): void {
  "worklet";
  const i = st.pNext;
  st.pNext = (i + 1) % st.pCap;
  st.pX[i] = x;
  st.pY[i] = y;
  st.pVX[i] = vx;
  st.pVY[i] = vy;
  st.pLife[i] = life;
  st.pMax[i] = life;
  st.pKind[i] = kind;
  st.pFlag[i] = flag;
}

function radial(st: VP, kind: number, n: number, x: number, y: number, v0: number, v1: number, l0: number, l1: number, flag: number): void {
  "worklet";
  for (let i = 0; i < n; i++) {
    const a = rnd(st) * 6.2832;
    const v = v0 + rnd(st) * (v1 - v0);
    spawn(st, kind, x, y, Math.cos(a) * v, Math.sin(a) * v, l0 + rnd(st) * (l1 - l0), flag);
  }
}

/** kind: index into ViewportBurst order (collect, impact, jump, spark, levelUp, explosion, scan). x/y in 0..1 or < 0 for "at the ship". */
export function spawnBurst(st: VP | null, kind: number, x01: number, y01: number): void {
  "worklet";
  if (!st) return;
  const x = x01 < 0 ? st.shipX : x01 * st.W;
  const y = y01 < 0 ? st.shipY : y01 * st.H;
  const scale = st.level === 0 ? 0.4 : st.level === 1 ? 0.6 : 1;
  if (kind === 0) {
    radial(st, K_COLLECT, Math.ceil(16 * scale), x, y, 20, 55, 0.7, 1.1, F_HOMING);
  } else if (kind === 1) {
    radial(st, K_SPARK, Math.ceil(18 * scale), x, y, 20, 80, 0.25, 0.55, F_DRAG);
    radial(st, K_SMOKE, Math.ceil(5 * scale), x, y, 4, 14, 0.8, 1.4, F_BIG);
  } else if (kind === 2) {
    radial(st, K_JUMP, Math.ceil(44 * scale), x, y, 50, 120, 0.5, 0.9, F_DRAG);
    st.pulse = 1;
    st.pulseX = x;
    st.pulseY = y;
    st.pulseC = C.cobalt2;
  } else if (kind === 3) {
    radial(st, K_SPARK, Math.ceil(8 * scale), x, y, 15, 60, 0.2, 0.45, F_DRAG);
  } else if (kind === 4) {
    const n = Math.ceil(28 * scale);
    for (let i = 0; i < n; i++) spawn(st, K_LEVEL, x + (rnd(st) - 0.5) * 16, y, (rnd(st) - 0.5) * 50, -40 - rnd(st) * 50, 0.8 + rnd(st) * 0.6, F_GRAVITY);
    st.pulse = 0.7;
    st.pulseX = x;
    st.pulseY = y;
    st.pulseC = C.yellow;
  } else if (kind === 5) {
    radial(st, K_BOOM, Math.ceil(40 * scale), x, y, 10, 90, 0.4, 1.0, F_DRAG);
    radial(st, K_BOOM, Math.ceil(10 * scale), x, y, 4, 30, 0.5, 0.9, F_BIG | F_DRAG);
    radial(st, K_SMOKE, Math.ceil(12 * scale), x, y, 6, 22, 1.0, 1.8, F_BIG);
    st.pulse = 1;
    st.pulseX = x;
    st.pulseY = y;
    st.pulseC = C.amber;
  } else {
    const n = Math.ceil(48 * scale);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.2832;
      spawn(st, K_SCAN, x, y, Math.cos(a) * 70, Math.sin(a) * 70, 1.1, 0);
    }
  }
}

export function setShake(st: VP | null, amount: number): void {
  "worklet";
  if (!st) return;
  const a = amount > 1 ? 1 : amount > 0 ? amount : 0;
  if (a > st.shake) st.shake = a;
}

export function setFlash(st: VP | null, r: number, g: number, b: number, ms: number): void {
  "worklet";
  if (!st) return;
  st.flashC[0] = r;
  st.flashC[1] = g;
  st.flashC[2] = b;
  st.flashA = 0.6;
  st.flashDecay = 600 / Math.max(60, ms);
}

function drawStars(st: VP, as: AssetsU, sc: SceneU, calm: number): void {
  "worklet";
  const span = st.W + STAR_PAD * 2;
  const t = st.t;
  const fr = as.fr;
  for (let i = 0; i < N_STARS; i++) {
    const layer = i < N_FAR ? 0 : i < N_FAR + N_MID ? 1 : 2;
    const s = layer === 0 ? st.sFar : layer === 1 ? st.sMid : st.sNear;
    let x = (st.starX[i] - s) % span;
    if (x < 0) x += span;
    x -= STAR_PAD;
    const y = st.starY[i];
    const ph = st.starPh[i];
    const tw = Math.sin(t * (0.7 + ph * 1.9) * (0.4 + 0.6 * calm) + ph * 40);
    const o = i * 3;
    let c = st.starC[o + 1];
    if (tw > 0.72) c = st.starC[o + 2];
    else if (tw < -0.8) c = st.starC[o];
    let slot = FR_PX;
    const len = st.warp * (layer === 0 ? 5 : layer === 1 ? 13 : 30);
    if (len > 2.5) {
      slot = FR_STREAK + (len > 22 ? 3 : len > 11 ? 2 : len > 5 ? 1 : 0);
      c = layer === 0 ? C.cobalt1 : layer === 1 ? (ph > 0.5 ? C.cobalt2 : C.violet3) : C.bone2;
    } else if (st.starK[i] === 2 && tw > 0.2) slot = FR_SPARKLE;
    else if (st.starK[i] >= 1) slot = FR_GLINT;
    const f = slot * 10;
    const w = fr[f + 3];
    const h = fr[f + 4];
    st.sSrc[i].setXYWH(fr[f + 1], fr[f + 2], w, h);
    st.sXf[i].set(1, 0, Math.round(x - (h > 1 ? w / 2 : 0)), Math.round(y - h / 2));
    st.sCol[i] = slot === FR_PX || slot >= FR_STREAK ? st.col[c] : st.white;
  }
  const img = as.imgs[0];
  if (img) {
    st.canvas.drawAtlas(img, st.sSrc, st.sXf, st.atlasP, BLEND_MODULATE, st.sCol, NEAREST);
    st.calls++;
  }
}

function updateSkyShaders(st: VP, sc: SceneU): void {
  "worklet";
  if (st.level === 0) return;
  const ox = Math.floor(st.sNeb);
  if (nebulaEffect && (st.nebKey !== sc.skyHash || st.nebOx !== ox)) {
    const u = st.uNeb;
    u[0] = ox;
    u[1] = Math.floor(ox * 0.12);
    u[2] = sc.seed * 0.1;
    for (let i = 0; i < 18; i++) {
      u[3 + i] = sc.nebA[i];
      u[21 + i] = sc.nebB[i];
    }
    const old = st.nebSh;
    st.nebSh = nebulaEffect.makeShader(u);
    if (old) old.dispose();
    st.nebKey = sc.skyHash;
    st.nebOx = ox;
  }
  if (starEffect && st.starKey !== sc.skyHash) {
    const u = st.uStar;
    u[0] = 64;
    u[1] = 64;
    u[2] = sc.starR;
    u[3] = sc.starKind;
    u[4] = sc.starGlow;
    u[5] = sc.starRays;
    for (let i = 0; i < 15; i++) u[6 + i] = sc.starRamp[i];
    const old = st.starSh;
    st.starSh = starEffect.makeShader(u);
    if (old) old.dispose();
    st.starKey = sc.skyHash;
  }
}

function updatePlanetShader(st: VP, sc: SceneU, calm: number): void {
  "worklet";
  const planetEffect = planetEffects[sc.pKind];
  if (st.level === 0 || !planetEffect || sc.planet === 0) return;
  const step = Math.floor(st.t / (calm < 1 ? 1.8 : 0.45));
  if (st.pKey === sc.pHash && st.pStep === step) return;
  const R = Math.round((sc.pRings ? 22 : 26) + sc.pSize * (sc.pRings ? 16 : 26));
  const ext = sc.pRings ? Math.ceil(R * 2.35) : R + 5;
  st.pR = R;
  st.pExt = ext;
  st.pCx = Math.round(st.W * (sc.pRings ? 0.66 : 0.7) + (R - 26) * 0.2);
  st.pCy = Math.round(st.H * 0.3);
  st.pKindNow = sc.pKind;
  const u = st.uPlanet;
  u[0] = ext;
  u[1] = ext;
  u[2] = R;
  u[3] = sc.pSeed * 0.1;
  u[4] = step / R;
  u[5] = sc.pKind;
  u[6] = sc.pRings;
  u[7] = 0;
  u[8] = sc.pAtmo;
  u[9] = -0.55;
  u[10] = -0.44;
  u[11] = 0.71;
  for (let i = 0; i < 18; i++) u[12 + i] = sc.pRamp[i];
  const old = st.pSh;
  const oldE = st.pShE;
  st.pSh = planetEffect.makeShader(u);
  u[7] = 1;
  st.pShE = planetEffect.makeShader(u);
  if (old) old.dispose();
  if (oldE) oldE.dispose();
  st.pKey = sc.pHash;
  st.pStep = step;
}

function planetOffset(st: VP): number {
  "worklet";
  const e = 1 - st.orbit;
  return Math.round(e * e * (st.W - st.pCx + st.pExt + 8));
}

function drawPlanet(st: VP, sc: SceneU, emissive: boolean): void {
  "worklet";
  if (st.orbit < 0.01) return;
  const off = planetOffset(st);
  if (st.level === 0 || !st.pSh || !st.pShE) {
    if (emissive) return;
    // flat fallback: three discs suggest the lit side
    const R = Math.round(26 + sc.pSize * 26);
    const cx = Math.round(st.W * 0.7) + Math.round((1 - st.orbit) * (1 - st.orbit) * (st.W * 0.3 + R + 8));
    const cy = Math.round(st.H * 0.3);
    fillCircle(st, cx, cy, R, sc.pRampIdx[1], 1);
    fillCircle(st, cx - R * 0.1, cy - R * 0.08, R * 0.88, sc.pRampIdx[2], 1);
    fillCircle(st, cx - R * 0.21, cy - R * 0.17, R * 0.7, sc.pRampIdx[3], 1);
    return;
  }
  const c = st.canvas;
  c.save();
  c.translate(st.pCx - st.pExt + off, st.pCy - st.pExt);
  st.shP.setShader(emissive ? st.pShE : st.pSh);
  st.rect.setXYWH(0, 0, st.pExt * 2, st.pExt * 2);
  c.drawRect(st.rect, st.shP);
  c.restore();
  st.calls++;
}

function drawStar(st: VP, sc: SceneU, emissive: boolean, bloom: boolean): void {
  "worklet";
  const a = 1 - st.warp;
  if (a < 0.05) return;
  const sx = Math.round(st.W * 0.17);
  const sy = Math.round(st.H * 0.19);
  const hole = sc.starKind === 1;
  if (emissive) {
    if (hole) {
      if (bloom) fillCircle(st, sx, sy, sc.starR * 2.2, sc.starRampIdx[1], 0.25 * a);
      return;
    }
    const r = sc.starKind === 3 ? sc.starR * 0.6 : sc.starR;
    fillCircle(st, sx + 0.5, sy + 0.5, r, sc.starRampIdx[4], a);
    if (bloom) fillCircle(st, sx + 0.5, sy + 0.5, sc.starR * 2.4, sc.starRampIdx[2], 0.5 * a);
    return;
  }
  if (st.level === 0 || !st.starSh) {
    fillCircle(st, sx + 0.5, sy + 0.5, sc.starR * 2.2, sc.starRampIdx[0], a);
    fillCircle(st, sx + 0.5, sy + 0.5, sc.starR * 1.5, sc.starRampIdx[1], a);
    fillCircle(st, sx + 0.5, sy + 0.5, sc.starR, sc.starRampIdx[hole ? 0 : 4], a);
    return;
  }
  const c = st.canvas;
  c.save();
  c.translate(sx - 64, sy - 64);
  st.shP.setShader(st.starSh);
  st.shP.setAlphaf(a);
  st.rect.setXYWH(0, 0, 128, 128);
  c.drawRect(st.rect, st.shP);
  st.shP.setAlphaf(1);
  c.restore();
  st.calls++;
}

function updateParticles(st: VP, dt: number): void {
  "worklet";
  const sx = st.shipX;
  const sy = st.shipY;
  for (let i = 0; i < st.pCap; i++) {
    let life = st.pLife[i];
    if (life <= 0) continue;
    life -= dt;
    const flag = st.pFlag[i];
    if (flag & F_HOMING) {
      const dx = sx - st.pX[i];
      const dy = sy - st.pY[i];
      const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
      const age = st.pMax[i] - life;
      if (age > 0.22) {
        const pull = 420 * dt;
        st.pVX[i] += (dx / d) * pull;
        st.pVY[i] += (dy / d) * pull;
        if (d < 6) life = 0;
      }
      const k = Math.exp(-dt * 4);
      st.pVX[i] *= k;
      st.pVY[i] *= k;
    }
    if (flag & F_GRAVITY) st.pVY[i] += 90 * dt;
    if (flag & F_DRAG) {
      const k = Math.exp(-dt * 3);
      st.pVX[i] *= k;
      st.pVY[i] *= k;
    }
    st.pX[i] += st.pVX[i] * dt;
    st.pY[i] += st.pVY[i] * dt;
    st.pLife[i] = life;
  }
}

/** Sorts live particles into the emissive and dull atlas batches (transforms only, no draw). */
function batchParticles(st: VP, as: AssetsU): void {
  "worklet";
  const fr = as.fr;
  let e = 0;
  let d = 0;
  for (let i = 0; i < st.pCap; i++) {
    const life = st.pLife[i];
    if (life <= 0) continue;
    const kind = st.pKind[i];
    const len = RAMP_LEN[kind];
    let step = Math.floor((1 - life / st.pMax[i]) * len);
    if (step >= len) step = len - 1;
    const c = kind === K_TRAIL ? st.trail[step] : RAMP_DATA[RAMP_OFF[kind] + step];
    const f = (st.pFlag[i] & F_BIG ? FR_PX2 : FR_PX) * 10;
    const x = Math.round(st.pX[i]);
    const y = Math.round(st.pY[i]);
    if (DULL[kind]) {
      if (d >= SMOKE_CAP) continue;
      st.dSrc[d].setXYWH(fr[f + 1], fr[f + 2], fr[f + 3], fr[f + 4]);
      st.dXf[d].set(1, 0, x, y);
      st.dCol[d] = st.col[c];
      d++;
    } else {
      st.eSrc[e].setXYWH(fr[f + 1], fr[f + 2], fr[f + 3], fr[f + 4]);
      st.eXf[e].set(1, 0, x, y);
      st.eCol[e] = st.col[c];
      e++;
    }
  }
  for (let i = e; i < st.eHigh; i++) st.eXf[i].set(0, 0, 0, 0);
  for (let i = d; i < st.dHigh; i++) st.dXf[i].set(0, 0, 0, 0);
  st.eN = e;
  st.eHigh = e;
  st.dN = d;
  st.dHigh = d;
}

function emit(st: VP, acc: number, rate: number, dt: number): number {
  "worklet";
  const v = acc + rate * dt;
  return v > 12 ? 12 : v;
}

/** One weather particle: entering from its edge, or anywhere in the view when `anywhere` is set. */
function ambient(st: VP, hz: number, W: number, H: number, anywhere: boolean): void {
  "worklet";
  const ax = rnd(st) * W;
  const ay = rnd(st) * H;
  if (hz === 1) spawn(st, K_EMBER, anywhere ? ax : rnd(st) * (W + 30), anywhere ? ay : H + 2, -10 - rnd(st) * 10, -12 - rnd(st) * 18, 2 + rnd(st) * 2.5, 0);
  else if (hz === 2) spawn(st, K_FROST, anywhere ? ax : rnd(st) * (W + 40), anywhere ? ay : -2, -9 - rnd(st) * 8, 7 + rnd(st) * 10, 5 + rnd(st) * 4, rnd(st) < 0.2 ? F_BIG : 0);
  else if (hz === 3) spawn(st, K_RAD, ax, ay, 0, 0, 0.05 + rnd(st) * 0.07, rnd(st) < 0.12 ? F_BIG : 0);
  else if (hz === 4) spawn(st, K_TOXIC, anywhere ? ax : W + 4, ay, -8 - rnd(st) * 10, (rnd(st) - 0.5) * 5, 6 + rnd(st) * 5, rnd(st) < 0.5 ? F_BIG : 0);
  else if (hz === 5) spawn(st, K_SMOKE, anywhere ? ax : W + 2, anywhere ? ay : rnd(st) * H * 1.2 - H * 0.2, -70 - rnd(st) * 60, 22 + rnd(st) * 20, 2.2, 0);
  else if (hz === 6) spawn(st, K_FROST, anywhere ? ax : rnd(st) * (W + 80), anywhere ? ay : -2, -70, 120 + rnd(st) * 30, 1.8, 0);
}

function simulate(st: VP, sc: SceneU, as: AssetsU, dt: number, calm: number): void {
  "worklet";
  const NOZ_X = as.an[2];
  const NOZ_Y = as.an[3];
  const W = st.W;
  const H = st.H;
  const sx = st.shipX;
  const sy = st.shipY;
  const q = st.level === 0 ? 0.3 : st.level === 1 ? 0.55 : 1;
  const steady = st.spin % 16 < 0.5 && st.dock < 0.6;
  const engineOk = sc.failure !== 4 && (sc.failure !== 5 || hash1(Math.floor(st.t * 9)) < 0.45);

  // engine trail
  if (steady && engineOk && st.thrust > 0.03) {
    st.aTrail = emit(st, st.aTrail, (14 + st.thrust * 50 + sc.overdrive * 30 + st.warp * 60) * q, dt);
    while (st.aTrail >= 1) {
      st.aTrail -= 1;
      const v = 22 + st.thrust * 40 + st.warp * 120;
      spawn(st, K_TRAIL, sx + NOZ_X - 2, sy + NOZ_Y + (rnd(st) - 0.5) * 6, -v * (0.7 + rnd(st) * 0.6), (rnd(st) - 0.5) * 9, 0.35 + rnd(st) * 0.55, rnd(st) < 0.25 ? F_BIG : 0);
    }
  }
  // hull damage: sparks, then smoke
  if (st.damage > 0.12) {
    st.aSpark = emit(st, st.aSpark, st.damage * st.damage * 34 * q, dt);
    while (st.aSpark >= 1) {
      st.aSpark -= 1;
      const a = rnd(st) * 6.2832;
      const v = 18 + rnd(st) * 45;
      spawn(st, K_SPARK, sx + (rnd(st) - 0.5) * 36, sy + (rnd(st) - 0.5) * 14, Math.cos(a) * v, Math.sin(a) * v, 0.2 + rnd(st) * 0.35, F_GRAVITY);
    }
  }
  const smoke = (st.damage > 0.4 ? (st.damage - 0.4) * 44 : 0) + (sc.failure === 5 ? 16 : 0);
  if (smoke > 0) {
    st.aSmoke = emit(st, st.aSmoke, smoke * q, dt);
    while (st.aSmoke >= 1) {
      st.aSmoke -= 1;
      spawn(st, K_SMOKE, sx - 10 + (rnd(st) - 0.5) * 22, sy - 4 + (rnd(st) - 0.5) * 6, -18 - rnd(st) * 16, -5 - rnd(st) * 9, 1.0 + rnd(st) * 1.4, rnd(st) < 0.7 ? F_BIG : 0);
    }
  }
  // failures
  let failRate = 0;
  if (sc.failure === 2) failRate = 34;
  else if (sc.failure === 4) failRate = 2.2;
  else if (sc.failure === 5) failRate = 7;
  else if (sc.failure === 8) failRate = 46;
  if (failRate > 0) {
    st.aFail = emit(st, st.aFail, failRate * q, dt);
    while (st.aFail >= 1) {
      st.aFail -= 1;
      if (sc.failure === 2) {
        spawn(st, K_VENT, sx + 5 + (rnd(st) - 0.5) * 3, sy - 6, -14 - rnd(st) * 26, -34 - rnd(st) * 30, 0.4 + rnd(st) * 0.6, rnd(st) < 0.4 ? F_DRAG | F_BIG : F_DRAG);
      } else if (sc.failure === 4) {
        spawn(st, K_SMOKE, sx + NOZ_X - 2, sy + NOZ_Y, -10 - rnd(st) * 8, (rnd(st) - 0.5) * 8, 0.6 + rnd(st) * 0.5, F_BIG);
      } else if (sc.failure === 5) {
        const a = 3.14 + (rnd(st) - 0.5) * 1.6;
        spawn(st, K_SPARK, sx + NOZ_X, sy + NOZ_Y, Math.cos(a) * 50, Math.sin(a) * 50, 0.2 + rnd(st) * 0.3, F_GRAVITY);
      } else {
        const a = rnd(st) * 6.2832;
        const r = 10 + rnd(st) * 14;
        const ax = W * 0.74;
        const ay = H * 0.36;
        spawn(st, K_RIFT, ax + Math.cos(a) * r, ay + Math.sin(a) * r * 0.8, -Math.sin(a) * 34 - Math.cos(a) * 9, Math.cos(a) * 28 - Math.sin(a) * 9, 0.6 + rnd(st) * 0.7, 0);
      }
    }
  }
  // hyperdrive charge: motes fall into the hull
  if (st.charge > 0.04 && st.warp < 0.5) {
    st.aCharge = emit(st, st.aCharge, st.charge * 46 * q, dt);
    while (st.aCharge >= 1) {
      st.aCharge -= 1;
      const a = rnd(st) * 6.2832;
      const r = 30 + rnd(st) * 18;
      spawn(st, K_CHARGE, sx + Math.cos(a) * r, sy + Math.sin(a) * r * 0.75, -Math.sin(a) * 30, Math.cos(a) * 30, 0.55 + rnd(st) * 0.3, F_HOMING);
    }
  }
  // hazards and weather
  const hz = sc.hazard === 0 && sc.failure === 6 ? 3 : sc.hazard;
  let hazRate = 0;
  if (hz === 1) hazRate = 9;
  else if (hz === 2) hazRate = 13;
  else if (hz === 3) hazRate = 520;
  else if (hz === 4) hazRate = 7;
  else if (hz === 5) hazRate = 16;
  else if (hz === 6) hazRate = 34;
  if (st.hzNow !== hz) {
    // a hazard that just started fills the whole view at once instead of creeping in from an edge
    st.hzNow = hz;
    const n = hz === 3 || hz === 0 ? 0 : Math.round((hz === 2 || hz === 6 ? 44 : 22) * q);
    for (let i = 0; i < n; i++) {
      const slot = st.pNext;
      ambient(st, hz, W, H, true);
      st.pLife[slot] *= 0.3 + rnd(st) * 0.7;
    }
  }
  if (hazRate > 0) {
    st.aHaz = emit(st, st.aHaz, hazRate * q * (hz === 3 ? 1 : 0.4 + 0.6 * calm), dt);
    while (st.aHaz >= 1) {
      st.aHaz -= 1;
      ambient(st, hz, W, H, false);
    }
  }
  if (hz === 5) {
    for (let i = 0; i < N_METEORS; i++) {
      st.metX[i] -= (70 + i * 16) * dt * (0.4 + 0.6 * calm);
      st.metY[i] += (26 + i * 7) * dt * (0.4 + 0.6 * calm);
      if (st.metX[i] < -12 || st.metY[i] > H + 12) {
        st.metX[i] = W * 0.3 + rnd(st) * W;
        st.metY[i] = -10 - rnd(st) * 30;
      }
    }
  }
  if (hz === 6) {
    st.boltT -= dt;
    if (st.boltT <= 0) {
      st.boltT = 1.4 + rnd(st) * 3.2;
      st.boltLife = 0.16;
      st.boltSeed = Math.floor(rnd(st) * 100000);
    }
  }
  if (st.boltLife > 0) st.boltLife -= dt;
  // laser impact
  if (st.beam > 0.5 && rnd(st) < 30 * dt * q) {
    const a = rnd(st) * 6.2832;
    spawn(st, K_SPARK, st.beamX, st.beamY, Math.cos(a) * 30 - 14, Math.sin(a) * 30, 0.2 + rnd(st) * 0.3, F_GRAVITY);
  }
  updateParticles(st, dt);
}

function drawBolt(st: VP, bloom: boolean): void {
  "worklet";
  if (st.boltLife <= 0) return;
  let x = 20 + hash1(st.boltSeed) * (st.W - 40);
  let y = 0;
  const flicker = st.boltLife > 0.1 || st.boltLife < 0.05;
  if (!flicker) return;
  for (let i = 0; i < 9; i++) {
    const nx = x + (hash1(st.boltSeed + i * 7.3) - 0.5) * 22;
    const ny = y + 6 + hash1(st.boltSeed + i * 3.1) * 14;
    if (bloom) line(st, x, y, nx, ny, C.cobalt2, 3, 0.8);
    line(st, x, y, nx, ny, C.bone2, 1, 1);
    x = nx;
    y = ny;
    if (y > st.H * 0.72) break;
  }
}

/** Everything that emits light. Drawn twice: crisp on the scene, then blurred and added as bloom. */
function drawEmissive(st: VP, sc: SceneU, as: AssetsU, bloom: boolean, bob: number): void {
  "worklet";
  const W = st.W;
  const H = st.H;
  const t = st.t;
  const sx = Math.round(st.shipX);
  const sy = Math.round(st.shipY) + bob;
  const lights = sc.powerOut === 0;
  const NOZ_X = as.an[2];
  const NOZ_Y = as.an[3];
  const EMI_X = as.an[4];
  const EMI_Y = as.an[5];
  drawStar(st, sc, true, bloom);
  drawPlanet(st, sc, true);

  // lamps of everything in the scene
  if (sc.station === 1 && st.dock < 0.5 && st.warp < 0.3) sprite(st, as, FR_STATION_FAR, 1, W * 0.84, H * 0.74 + Math.sin(t * 0.4) * 1.5, st.white);
  if (st.dock > 0.02) sprite(st, as, FR_STATION + (sc.seed % 4), 1, W - 6 - as.fr[(FR_STATION + (sc.seed % 4)) * 10 + 3] / 2 + (1 - st.dock) * 96, H * 0.5, st.white);
  for (let i = 0; i < sc.salN; i++) {
    const x = salvageX(sc.salX[i], W);
    const y = salvageY(sc.salY[i], H) + Math.round(Math.sin(t * 1.4 + sc.salUid[i] * 1.7) * 1.6);
    sprite(st, as, FR_SALVAGE + sc.salKind[i], 1, x, y, st.white);
    // a glint sweeps each blob now and then so they read as "tap me"
    const g = (t * 0.45 + hash1(sc.salUid[i]) * 3) % 3;
    if (g < 0.14) sprite(st, as, FR_SPARKLE, 0, x - 3, y - 4, st.white);
    else if (g < 0.26) sprite(st, as, FR_GLINT, 0, x - 3, y - 4, st.white);
  }
  if (sc.tow === 1) sprite(st, as, FR_TOW + (Math.floor(t * 3) % 4), 1, sx + 70, sy - 12 + Math.round(Math.sin(t * 0.7 + 2) * 1.5), st.white);
  if (sc.failure === 7) {
    const f = Math.floor(t * 4) % 4;
    sprite(st, as, FR_PIRATE + f, 1, sx - 26 + Math.sin(t * 0.5) * 3, sy - 46, st.white);
    sprite(st, as, FR_PIRATE + ((f + 2) % 4), 1, sx + 38 + Math.sin(t * 0.4 + 1) * 3, sy + 42, st.white);
  }
  if (sc.hazard === 5) for (let i = 0; i < N_METEORS; i++) sprite(st, as, FR_METEOR + i, 1, st.metX[i], st.metY[i], st.white);
  for (let i = 0; i < sc.drones; i++) {
    const a = t * (0.55 + i * 0.07) + (i * 6.2832) / Math.max(1, sc.drones);
    sprite(st, as, FR_DRONE + (i % 4) * 4 + (Math.floor(t * 6 + i) % 4), 1, sx + Math.cos(a) * (36 + i * 3), sy - 3 + Math.sin(a) * (17 + i * 2), st.white);
  }
  const frame = Math.floor(st.spin) % 16;
  const flicker = st.damage > 0.25 && hash1(Math.floor(t * 13) + 5) < st.damage * 0.55;
  if (lights && !flicker) shipSprite(st, as, frame, 1, sx, sy, st.white);
  flush(st, as);
  if (st.damage > 0.5 && frame === 0) {
    // exposed, glowing wounds
    const g = Math.floor(t * 11);
    if (hash1(g) > 0.35) fillRect(st, sx - 6, sy - 3, 1, 1, hash1(g + 3) > 0.5 ? C.yellow : C.orange, 1);
    if (hash1(g + 9) > 0.5) fillRect(st, sx + 8, sy + 2, 1, 1, C.orange, 1);
    if (st.damage > 0.75 && hash1(g + 17) > 0.4) fillRect(st, sx + 12, sy - 1, 1, 2, C.amber, 1);
  }
  // blackout: a lone emergency beacon keeps blinking
  if (!lights && t % 1.6 < 0.12 && frame === 0) fillRect(st, sx + 2, sy - 14, 1, 1, C.red1, 1);

  // engine flame: 3-frame flicker cycle, length follows thrust
  const engineOk = sc.failure !== 4 && (sc.failure !== 5 || hash1(Math.floor(t * 9)) < 0.45);
  if (frame === 0 && engineOk && st.thrust > 0.03 && st.dock < 0.6) {
    const cyc = Math.floor(t * 15) % 3;
    const L = Math.round((3 + st.thrust * 9) * (1 + sc.overdrive * 0.5 + st.warp * 0.8)) + cyc;
    const nx = sx + NOZ_X + 1;
    const ny = sy + NOZ_Y;
    const hot = sc.overdrive === 1 || st.warp > 0.4;
    fillRect(st, nx - L, ny, L, 1, st.trail[3], 1);
    fillRect(st, nx - Math.round(L * 0.8), ny - 1, Math.round(L * 0.8), 3, st.trail[2], 1);
    fillRect(st, nx - Math.round(L * 0.55), ny - 2, Math.round(L * 0.55), 5, st.trail[2], 1);
    fillRect(st, nx - Math.round(L * 0.3), ny - 3, Math.round(L * 0.3), 7, st.trail[2], 1);
    fillRect(st, nx - Math.round(L * 0.6), ny, Math.round(L * 0.6), 1, st.trail[1], 1);
    fillRect(st, nx - Math.round(L * 0.4), ny - 1, Math.round(L * 0.4), 3, st.trail[1], 1);
    fillRect(st, nx - Math.round(L * 0.22), ny - 2, Math.round(L * 0.22), 5, st.trail[1], 1);
    fillRect(st, nx - Math.max(1, Math.round(L * 0.25)), ny - 1, Math.max(1, Math.round(L * 0.25)), 3, hot ? C.cobalt2 : C.yellow, 1);
    fillRect(st, nx - Math.max(1, Math.round(L * 0.14)), ny, Math.max(1, Math.round(L * 0.14)), 1, C.bone2, 1);
    if (bloom) fillCircle(st, nx - 2, ny + 0.5, 3 + st.thrust * 3, st.trail[2], 0.4);
  }

  // mining laser
  if (st.beam > 0.5) {
    const ex = sx + EMI_X;
    const ey = sy + EMI_Y;
    const hot = sc.overdrive === 1;
    const wob = Math.floor(t * 20) % 2;
    line(st, ex, ey, st.beamX, st.beamY, hot ? C.amber : C.red1, 3, 0.85);
    line(st, ex, ey, st.beamX, st.beamY + wob, hot ? C.yellow : C.orange, 1, 1);
    line(st, ex, ey, st.beamX, st.beamY, C.bone2, 1, 1);
    fillRect(st, st.beamX - 1, st.beamY - 1, 3, 3, C.bone2, 1);
    fillRect(st, ex - 1, ey - 1, 2, 2, C.bone2, 1);
    if (bloom) fillCircle(st, st.beamX + 0.5, st.beamY + 0.5, 5 + wob, hot ? C.amber : C.orange, 0.8);
  }
  drawBolt(st, bloom);

  if (st.eN > 0 || st.eHigh > 0) {
    const img = as.imgs[0];
    if (img) {
      st.canvas.drawAtlas(img, st.eSrc, st.eXf, st.atlasP, BLEND_MODULATE, st.eCol, NEAREST);
      st.calls++;
    }
  }

  // soft lights exist only in the bloom layer
  if (bloom) {
    if (st.charge > 0.03 && st.warp < 0.9) fillCircle(st, sx - 6, sy, 5 + st.charge * 9, C.cobalt1, st.charge * 0.5 * (1 - st.warp));
    if (st.pulse > 0.02) fillCircle(st, st.pulseX, st.pulseY, 10 + (1 - st.pulse) * 46, st.pulseC, st.pulse * 0.85);
    if (sc.failure === 8) fillCircle(st, W * 0.74, H * 0.36, 8 + Math.sin(t * 3) * 2, C.violet2, 0.55);
    if (st.boltLife > 0) fillRect(st, 0, 0, W, H, C.cobalt1, 0.18);
  }
}

export function renderFrame(st: VP, sc: SceneU, as: AssetsU, q: QualityU, dtMs: number): void {
  "worklet";
  const canvas = st.canvas;
  const W = st.W;
  const H = st.H;
  const EMI_X = as.an[4];
  const EMI_Y = as.an[5];
  const calm = q.calm ? 0.25 : 1;
  let dt = dtMs / 1000;
  if (!(dt > 0)) dt = 0;
  if (dt > 0.1) dt = 0.1;
  st.t += dt;
  st.frame++;
  st.calls = 0;
  const t = st.t;

  // ---- smooth the 10 Hz scene into per-frame values
  const k4 = 1 - Math.exp(-dt * 4);
  const k2 = 1 - Math.exp(-dt * 2.4);
  st.thrust += (sc.thrust - st.thrust) * k4;
  st.charge += (sc.charge - st.charge) * k4;
  st.damage += (sc.damage - st.damage) * k4;
  st.warp += ((sc.mode === 2 ? 1 : 0) - st.warp) * k2;
  st.orbit += ((sc.planet === 1 && sc.mode !== 2 ? 1 : 0) - st.orbit) * k2;
  st.dock += ((sc.mode === 3 ? 1 : 0) - st.dock) * k2;
  st.mine += (sc.mining - st.mine) * (1 - Math.exp(-dt * 7));
  for (let i = 0; i < 5; i++) st.trail[i] = sc.trail[i];

  let tx = W * 0.4;
  let ty = H * 0.56;
  if (sc.mode === 1 && sc.planet === 1) {
    tx = W * 0.34;
    ty = H * 0.64;
  } else if (sc.mode === 2) {
    tx = W * 0.42;
    ty = H * 0.53;
  } else if (sc.mode === 3) {
    // nose against the left edge of whichever station variant this system has
    tx = W - 6 - as.fr[(FR_STATION + (sc.seed % 4)) * 10 + 3] - EMI_X - 1;
    ty = H * 0.5 - EMI_Y;
  }
  st.shipX += (tx - st.shipX) * k2;
  st.shipY += (ty - st.shipY) * k2;
  if (sc.tumble === 1) st.spin += dt * 7 * (0.5 + 0.5 * calm);
  else if (st.spin % 16 > 0.01) {
    const before = Math.floor(st.spin / 16);
    st.spin += dt * 10;
    if (Math.floor(st.spin / 16) !== before) st.spin = 0;
  }
  const speed = (0.22 + st.thrust * 0.9) * (1 - st.dock * 0.94) * calm;
  const wsp = st.warp * calm;
  st.sFar += (speed * 1.6 + wsp * 80) * dt;
  st.sMid += (speed * 4.2 + wsp * 210) * dt;
  st.sNear += (speed * 10 + wsp * 460) * dt;
  st.sNeb += (speed * 0.7 + wsp * 26) * dt;

  if (st.starSeed !== sc.seed) seedStars(st, sc.seed);
  updateSkyShaders(st, sc);
  updatePlanetShader(st, sc, calm);

  const bob = sc.tumble === 1 ? 0 : Math.round(Math.sin(t * 0.9) * 1.7 * (0.3 + 0.7 * calm) + (st.warp > 0.5 && calm === 1 ? hash1(st.frame) - 0.5 : 0));
  const sx = Math.round(st.shipX);
  const sy = Math.round(st.shipY) + bob;

  // laser target: the planet limb in orbit, otherwise a rock held in front of the ship
  st.beam = sc.mining === 1 && st.dock < 0.5 && st.warp < 0.3 && st.spin % 16 < 0.5 ? 1 : 0;
  const rockW = as.fr[(FR_ASTEROID + 4) * 10 + 3];
  const rockX = sx + EMI_X + 26 + Math.round(rockW / 2) + Math.round((1 - st.mine) * 60);
  const rockY = sy + EMI_Y - 2;
  if (st.orbit > 0.6 && sc.mode === 1) {
    const px = st.pCx + planetOffset(st);
    const dx = sx + EMI_X - px;
    const dy = sy + EMI_Y - st.pCy;
    const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
    st.beamX = Math.round(px + (dx / d) * st.pR * 0.86);
    st.beamY = Math.round(st.pCy + (dy / d) * st.pR * 0.86);
  } else {
    st.beamX = rockX - Math.round(rockW / 2) + 3;
    st.beamY = rockY + 2;
  }

  simulate(st, sc, as, dt, calm);
  batchParticles(st, as);

  // ---- shake
  st.shake *= Math.exp(-dt * 5);
  if (st.shake < 0.02 || q.calm) {
    st.shake = 0;
    st.shakeX = 0;
    st.shakeY = 0;
  } else {
    st.shakeX = Math.round((rnd(st) - 0.5) * 6 * st.shake);
    st.shakeY = Math.round((rnd(st) - 0.5) * 6 * st.shake);
  }
  st.pulse *= Math.exp(-dt * 3.2);

  // ---- base pass
  canvas.clear(st.col[C.void0]);
  canvas.save();
  canvas.translate(st.shakeX, st.shakeY);

  if (st.level > 0 && st.nebSh) {
    st.shP.setShader(st.nebSh);
    st.rect.setXYWH(-4, -4, W + 8, H + 8);
    canvas.drawRect(st.rect, st.shP);
    st.calls++;
    if (st.warp > 0.02) fillRect(st, -4, -4, W + 8, H + 8, C.void0, st.warp * 0.8);
  }
  drawStars(st, as, sc, calm);
  drawStar(st, sc, false, false);
  drawPlanet(st, sc, false);

  // objects behind the ship
  if (sc.salN >= 6 && st.warp < 0.3) sprite(st, as, FR_DERELICT + (sc.seed % 3), 0, W * 0.7 - ((st.sMid * 0.3) % 30), H * 0.82, st.white);
  if (sc.station === 1 && st.dock < 0.5 && st.warp < 0.3) sprite(st, as, FR_STATION_FAR, 0, W * 0.84, H * 0.74 + Math.sin(t * 0.4) * 1.5, st.white);
  if (st.dock > 0.02) sprite(st, as, FR_STATION + (sc.seed % 4), 0, W - 6 - as.fr[(FR_STATION + (sc.seed % 4)) * 10 + 3] / 2 + (1 - st.dock) * 96, H * 0.5, st.white);
  if (st.dock < 0.5 && st.warp < 0.3 && st.orbit < 0.5) {
    const span = W + 80;
    for (let i = 0; i < N_ROCKS; i++) {
      let x = (st.rockX[i] - st.sMid * (0.7 + i * 0.25)) % span;
      if (x < 0) x += span;
      sprite(st, as, FR_ASTEROID + st.rockV[i], 0, x - 40, st.rockY[i] + Math.sin(t * 0.3 + i) * 2, st.white);
    }
  }
  if (st.mine > 0.03 && !(st.orbit > 0.6 && sc.mode === 1) && st.dock < 0.5) sprite(st, as, FR_ASTEROID + 4, 0, rockX, rockY, st.white);
  for (let i = 0; i < sc.salN; i++) {
    const x = salvageX(sc.salX[i], W);
    const y = salvageY(sc.salY[i], H) + Math.round(Math.sin(t * 1.4 + sc.salUid[i] * 1.7) * 1.6);
    sprite(st, as, FR_SALVAGE + sc.salKind[i], 0, x, y, st.white);
  }
  if (sc.hazard === 5) for (let i = 0; i < N_METEORS; i++) sprite(st, as, FR_METEOR + i, 0, st.metX[i], st.metY[i], st.white);
  if (sc.failure === 7) {
    const f = Math.floor(t * 4) % 4;
    sprite(st, as, FR_PIRATE + f, 0, sx - 26 + Math.sin(t * 0.5) * 3, sy - 46, st.white);
    sprite(st, as, FR_PIRATE + ((f + 2) % 4), 0, sx + 38 + Math.sin(t * 0.4 + 1) * 3, sy + 42, st.white);
  }
  const towY = sy - 12 + Math.round(Math.sin(t * 0.7 + 2) * 1.5);
  if (sc.tow === 1) sprite(st, as, FR_TOW + (Math.floor(t * 3) % 4), 0, sx + 70, towY, st.white);
  for (let i = 0; i < sc.drones; i++) {
    const a = t * (0.55 + i * 0.07) + (i * 6.2832) / Math.max(1, sc.drones);
    if (Math.sin(a) < 0) sprite(st, as, FR_DRONE + (i % 4) * 4 + (Math.floor(t * 6 + i) % 4), 0, sx + Math.cos(a) * (36 + i * 3), sy - 3 + Math.sin(a) * (17 + i * 2), st.white);
  }
  flush(st, as);
  if (sc.tow === 1) line(st, sx + EMI_X - 2, sy + EMI_Y - 2, sx + 70 - Math.round(as.fr[FR_TOW * 10 + 3] / 2) + 1, towY + 2, C.steel2, 1, 1);
  if (sc.failure === 7) {
    line(st, sx - 4, sy - 8, sx - 22, sy - 38, C.steel1, 1, 1);
    line(st, sx + 10, sy + 8, sx + 32, sy + 34, C.steel1, 1, 1);
  }

  // ship
  shipSprite(st, as, Math.floor(st.spin) % 16, 0, sx, sy, sc.powerOut === 1 ? st.dim : st.white);
  flush(st, as);
  if (st.damage > 0.3 && Math.floor(st.spin) % 16 === 0) {
    // soot and torn plating grow with damage
    fillRect(st, sx - 7, sy - 3, 3, 2, C.void2, 1);
    fillRect(st, sx + 7, sy + 2, 2, 2, C.void3, 1);
    if (st.damage > 0.5) {
      fillRect(st, sx - 15, sy + 1, 2, 3, C.void2, 1);
      fillRect(st, sx + 1, sy - 4, 4, 1, C.void3, 1);
      fillRect(st, sx - 5, sy - 2, 1, 1, C.void0, 1);
    }
    if (st.damage > 0.75) {
      fillRect(st, sx + 11, sy - 2, 3, 3, C.void2, 1);
      fillRect(st, sx - 11, sy + 5, 4, 2, C.void1, 1);
      fillRect(st, sx + 12, sy - 1, 1, 1, C.void0, 1);
    }
  }
  for (let i = 0; i < sc.drones; i++) {
    const a = t * (0.55 + i * 0.07) + (i * 6.2832) / Math.max(1, sc.drones);
    if (Math.sin(a) >= 0) sprite(st, as, FR_DRONE + (i % 4) * 4 + (Math.floor(t * 6 + i) % 4), 0, sx + Math.cos(a) * (36 + i * 3), sy - 3 + Math.sin(a) * (17 + i * 2), st.white);
  }
  flush(st, as);

  if (st.dN > 0 || st.dHigh > 0) {
    const img = as.imgs[0];
    if (img) {
      canvas.drawAtlas(img, st.dSrc, st.dXf, st.atlasP, BLEND_MODULATE, st.dCol, NEAREST);
      st.calls++;
    }
  }

  // ---- light: crisp emissive pixels, then the same pass blurred and added
  drawEmissive(st, sc, as, false, bob);
  if (st.bloomP) {
    canvas.saveLayer(st.bloomP);
    drawEmissive(st, sc, as, true, bob);
    canvas.restore();
    st.calls++;
  }

  if (sc.failure === 8) {
    // the rift itself stays black inside its own glow
    fillCircle(st, W * 0.74 + 0.5, H * 0.36 + 0.5, 4.5, C.void0, 1);
    fillRect(st, W * 0.74 - 1, H * 0.36 - 7, 2, 2, C.violet3, 1);
  }

  // ---- hazard and failure tints (additive, so they read as light in the cabin window)
  const hz = sc.hazard === 0 && sc.failure === 6 ? 3 : sc.hazard;
  if (hz !== 0) {
    st.fill.setBlendMode(BLEND_PLUS);
    const pulse = 0.75 + 0.25 * Math.sin(t * (hz === 3 ? 9 : 1.3));
    if (hz === 1) fillRect(st, 0, 0, W, H, C.rust1, 0.2 * pulse);
    else if (hz === 2) fillRect(st, 0, 0, W, H, C.cobalt0, 0.3 * pulse);
    else if (hz === 3) fillRect(st, 0, 0, W, H, C.violet1, 0.13 * pulse);
    else if (hz === 4) fillRect(st, 0, 0, W, H, C.green0, 0.34 * pulse);
    else if (hz === 5) fillRect(st, 0, 0, W, H, C.steel0, 0.1);
    else fillRect(st, 0, 0, W, H, C.cobalt0, 0.2);
    st.fill.setBlendMode(BLEND_SRC_OVER);
  }
  if (sc.failure === 7 || sc.failure === 2) {
    st.fill.setBlendMode(BLEND_PLUS);
    fillRect(st, 0, 0, W, H, C.red0, t % 1.2 < 0.6 ? 0.2 : 0.06);
    st.fill.setBlendMode(BLEND_SRC_OVER);
  }
  canvas.restore();

  if (st.flashA > 0.01 && !q.calm) {
    st.flashC[3] = 1;
    st.fill.setColor(st.flashC);
    st.fill.setAlphaf(st.flashA);
    st.rect.setXYWH(0, 0, W, H);
    canvas.drawRect(st.rect, st.fill);
    st.calls++;
  }
  st.flashA *= Math.exp(-dt * st.flashDecay);
}

/** Flushes the surface and hands the new frame to the on-screen canvas. */
export function publishFrame(st: VP, frame: SharedValue<SkImage | null>): void {
  "worklet";
  st.surface.flush();
  if (st.web) {
    // CanvasKit: the offscreen surface lives in its own WebGL context, so the snapshot has to be
    // copied to a CPU image before the on-screen canvas can sample it. Older frames are released
    // two frames late because the canvas may still be drawing them.
    const snap = st.surface.makeImageSnapshot();
    const img = st.gpu ? snap.makeNonTextureImage() : snap;
    if (st.gpu) snap.dispose();
    const old = st.prev2;
    st.prev2 = st.prev;
    st.prev = img;
    frame.value = img;
    if (old) old.dispose();
  } else if (st.img === null) {
    st.img = st.surface.makeImageSnapshot();
    frame.value = st.img;
  } else {
    // native: reuse the same JS wrapper for every snapshot, so a frame allocates no JS object
    st.surface.makeImageSnapshot(undefined, st.img);
    frame.modify(undefined, true);
  }
}

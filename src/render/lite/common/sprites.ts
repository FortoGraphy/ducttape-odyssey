// Procedural pixel sprites, authored in code so the viewport never depends on generated art.
// The real atlas (src/render/atlas.generated.ts, built by the asset pipeline) overrides these
// frame by frame when it exists; frame names follow docs/ART_BIBLE.md.
//
// Pure data: used by the Skia renderer (packed into one RGBA sheet) and by the lite renderer
// (converted to SVG paths). Lighting convention: key light from the upper left, 1 px darker
// outline on the lower right, lit pixels (windows, LEDs, engines) live in a separate emissive map.
import { PAL_KEYS, PAL_RGB, familyRamp, pi } from "./palette";

export interface Sprite {
  w: number;
  h: number;
  /** Palette index + 1 per pixel, 0 = transparent. */
  px: Uint8Array;
  /** Emissive overlay, same encoding. Drawn only when the lights are on, and fed to the bloom. */
  em: Uint8Array;
}

const LIGHTER: Record<string, string> = {
  void0: "void1", void1: "void2", void2: "void3", void3: "steel0",
  steel0: "steel1", steel1: "steel2", steel2: "steel3", steel3: "bone0",
  bone0: "bone1", bone1: "bone2", bone2: "bone2",
  violet0: "violet1", violet1: "violet2", violet2: "violet3", violet3: "bone1",
  teal0: "teal1", teal1: "teal2", teal2: "mint", mint: "bone2",
  cobalt0: "cobalt1", cobalt1: "cobalt2", cobalt2: "bone1",
  rust0: "rust1", rust1: "orange", orange: "amber", amber: "yellow", yellow: "bone2",
  red0: "red1", red1: "amber", green0: "green1", green1: "lime", lime: "bone2",
};
const DARKER: Record<string, string> = {
  void0: "void0", void1: "void0", void2: "void1", void3: "void2",
  steel0: "void3", steel1: "steel0", steel2: "steel1", steel3: "steel2",
  bone0: "steel2", bone1: "bone0", bone2: "bone1",
  violet0: "void2", violet1: "violet0", violet2: "violet1", violet3: "violet2",
  teal0: "void2", teal1: "teal0", teal2: "teal1", mint: "teal2",
  cobalt0: "void3", cobalt1: "cobalt0", cobalt2: "cobalt1",
  rust0: "void2", rust1: "rust0", orange: "rust1", amber: "orange", yellow: "amber",
  red0: "rust0", red1: "red0", green0: "void3", green1: "green0", lime: "green1",
};
const LIGHTER_I = PAL_KEYS.map((k) => pi(LIGHTER[k] ?? k) + 1);
const DARKER_I = PAL_KEYS.map((k) => pi(DARKER[k] ?? k) + 1);

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Pix implements Sprite {
  w: number;
  h: number;
  px: Uint8Array;
  em: Uint8Array;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h);
    this.em = new Uint8Array(w * h);
  }
  set(x: number, y: number, key: string) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = key === "" ? 0 : pi(key) + 1;
  }
  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.px[y * this.w + x];
  }
  rect(x: number, y: number, w: number, h: number, key: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, key);
  }
  /** Shaded plate: ramp = [shadow, base, light, highlight]. */
  panel(x: number, y: number, w: number, h: number, ramp: string[]) {
    this.rect(x, y, w, h, ramp[1]);
    this.rect(x, y, w, 1, ramp[2]);
    this.rect(x, y, 1, h, ramp[2]);
    this.rect(x, y + h - 1, w, 1, ramp[0]);
    this.rect(x + w - 1, y, 1, h, ramp[0]);
    this.set(x, y, ramp[3]);
  }
  line(x0: number, y0: number, x1: number, y1: number, key: string) {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, key);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
  disc(cx: number, cy: number, r: number, key: string) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r + 0.3) this.set(x, y, key);
  }
  /** A light: `lit` goes to the emissive map, `unlit` is what remains when the power is out. */
  lamp(x: number, y: number, lit: string, unlit: string) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.set(x, y, unlit);
    this.em[y * this.w + x] = pi(lit) + 1;
  }
  lampRect(x: number, y: number, w: number, h: number, lit: string, unlit: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.lamp(x + i, y + j, lit, unlit);
  }
  /** Rim light on upper-left silhouette edges, shade on lower-right ones. */
  rim() {
    const out = new Uint8Array(this.px);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const c = this.get(x, y);
        if (!c) continue;
        if (!this.get(x, y - 1) || !this.get(x - 1, y)) out[y * this.w + x] = LIGHTER_I[c - 1];
        else if (!this.get(x, y + 1) || !this.get(x + 1, y)) out[y * this.w + x] = DARKER_I[c - 1];
      }
    this.px = out;
    return this;
  }
  /** 1 px dark outline on the lower right of the silhouette. */
  outline(key = "void0") {
    const out = new Uint8Array(this.px);
    const o = pi(key) + 1;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        if (this.get(x - 1, y) || this.get(x, y - 1)) out[y * this.w + x] = o;
      }
    this.px = out;
    return this;
  }
}

const STEEL = ["steel0", "steel1", "steel2", "steel3"];
const DARK = ["void2", "void3", "steel0", "steel1"];
const RUST = ["rust0", "rust1", "orange", "amber"];
const TEAL = ["teal0", "teal1", "teal2", "mint"];
const COBALT = ["void3", "cobalt0", "cobalt1", "cobalt2"];
const YELLOW = ["rust1", "amber", "yellow", "bone2"];
const BONE = ["steel2", "bone0", "bone1", "bone2"];

/** The S.S. Gaffer: stubby salvage tug, facing right. 48x28, laser emitter at (47, 19). */
function buildTug(paint: string[]): Pix {
  const p = new Pix(48, 28);
  // oversized engine bell (flared, ringed) and its housing
  for (let x = 1; x <= 8; x++) {
    const inset = Math.floor((x - 1) / 3);
    p.rect(x, 8 + inset, 1, 15 - inset * 2, x === 3 || x === 6 ? "steel2" : "steel1");
  }
  p.rect(1, 8, 1, 15, "steel0");
  p.rect(2, 9, 7, 1, "steel3");
  p.rect(2, 21, 6, 1, "void3");
  p.lampRect(1, 11, 1, 9, "amber", "void2");
  p.lampRect(2, 12, 1, 7, "orange", "void3");
  p.panel(9, 9, 6, 13, STEEL);
  p.rect(11, 9, 2, 13, "rust1");
  p.set(11, 9, "orange");
  p.set(12, 9, "orange");
  p.rect(11, 21, 2, 1, "rust0");
  // main hull
  p.panel(15, 10, 23, 12, paint);
  p.set(15, 10, "");
  p.set(15, 21, "");
  p.set(16, 10, paint[3]);
  // worn signal stripe
  p.rect(16, 14, 6, 1, "orange");
  p.rect(24, 14, 2, 1, "orange");
  p.rect(33, 14, 4, 1, "orange");
  // patched plates in mismatched colors, with rivets
  p.panel(18, 15, 6, 5, RUST);
  p.set(18, 15, "rust0");
  p.set(23, 19, "void3");
  p.panel(27, 16, 6, 4, TEAL);
  p.set(27, 16, "teal0");
  p.set(32, 19, "void3");
  p.panel(23, 11, 4, 3, STEEL);
  // duct tape: a pale cross slapped over a seam
  p.line(28, 11, 32, 14, "steel3");
  p.line(29, 11, 33, 14, "bone2");
  p.line(32, 11, 29, 14, "steel3");
  p.line(33, 11, 30, 14, "bone2");
  // hull seams
  p.rect(26, 15, 1, 6, DARKER[paint[1]] ?? "steel2");
  p.rect(34, 15, 1, 6, DARKER[paint[1]] ?? "steel2");
  // cockpit with slanted glass
  p.panel(31, 5, 10, 6, STEEL);
  p.set(40, 5, "");
  p.set(39, 5, "steel2");
  p.set(40, 6, "steel2");
  p.lampRect(34, 6, 5, 3, "teal2", "teal0");
  p.lamp(39, 7, "teal2", "teal0");
  p.lamp(39, 8, "teal2", "teal0");
  p.lamp(34, 6, "mint", "teal1");
  p.lamp(35, 6, "mint", "teal1");
  p.lamp(34, 7, "mint", "teal0");
  // nose wedge with hazard bumper
  for (let x = 38; x <= 44; x++) {
    const inset = Math.floor((x - 38) / 2);
    p.rect(x, 11 + inset, 1, 10 - inset * 2, "steel1");
    p.set(x, 11 + inset, "steel3");
    p.set(x, 20 - inset, "steel0");
  }
  p.rect(45, 14, 1, 4, "yellow");
  p.set(45, 15, "void2");
  p.set(45, 17, "void2");
  // mining laser barrel under the nose
  p.rect(40, 19, 7, 2, "steel0");
  p.rect(40, 19, 7, 1, "steel2");
  p.lamp(47, 19, "red1", "red0");
  p.set(47, 20, "steel0");
  // dorsal pipe, tank and dish
  p.rect(16, 9, 14, 1, "steel1");
  p.rect(17, 7, 6, 2, "cobalt1");
  p.rect(17, 7, 6, 1, "cobalt2");
  p.set(22, 8, "cobalt0");
  p.set(16, 8, "cobalt0");
  p.set(23, 8, "cobalt0");
  // bent antenna with a beacon
  p.line(27, 9, 27, 5, "steel3");
  p.line(27, 5, 29, 3, "steel3");
  p.line(29, 3, 29, 1, "steel2");
  p.lamp(30, 0, "red1", "red0");
  // cargo cradle with a strapped crate
  p.rect(17, 22, 1, 5, "steel1");
  p.rect(33, 22, 1, 5, "steel1");
  p.rect(17, 26, 17, 1, "steel0");
  p.rect(18, 26, 15, 1, "steel1");
  p.panel(20, 22, 9, 4, YELLOW);
  p.rect(23, 22, 1, 4, "rust1");
  p.rect(26, 22, 1, 4, "rust1");
  p.panel(30, 23, 3, 3, TEAL);
  // side thruster and running lights
  p.rect(12, 22, 3, 2, "steel0");
  p.rect(12, 22, 3, 1, "steel2");
  p.lamp(16, 12, "lime", "green0");
  p.lamp(36, 20, "red1", "red0");
  p.lamp(10, 11, "amber", "rust0");
  return p.outline();
}

function buildDrone(kind: number, frame: number): Pix {
  const p = new Pix(11, 9);
  const ramps = [YELLOW, COBALT, RUST, TEAL];
  const lights = ["amber", "cobalt2", "orange", "mint"];
  const r = ramps[kind];
  p.panel(3, 3, 6, 4, r);
  p.set(3, 3, "");
  p.set(8, 6, "");
  p.rect(5, 2, 2, 1, "steel2");
  p.set(6, 1, "steel3");
  if (kind === 0) p.rect(4, 7, 4, 1, "steel1"); // hauler: cargo claw
  if (kind === 1) p.line(8, 2, 9, 0, "steel3"); // probe: whip antenna
  if (kind === 2) {
    p.set(9, 5, "steel3"); // salvager: grabber
    p.set(10, 4, "steel3");
    p.set(10, 6, "steel3");
  }
  if (kind === 3) p.set(9, 6, "steel3"); // fixer: welding arm
  p.lamp(7, 4, lights[kind], "void3");
  if (kind === 3 && frame % 2 === 0) p.lamp(10, 7, "bone2", "");
  // thruster flicker (2-3 frame cycle)
  const len = [2, 1, 2, 0][frame];
  for (let i = 0; i < len; i++) p.lamp(2 - i, 5, i === 0 ? "yellow" : "orange", "");
  if (frame === 1) p.lamp(6, 1, "red1", "steel3");
  return p.outline();
}

function buildStation(frame: number): Pix {
  const p = new Pix(64, 96);
  // spine
  p.panel(28, 2, 8, 92, STEEL);
  for (let y = 8; y < 92; y += 9) p.rect(28, y, 8, 1, "steel0");
  // habitat drum
  p.panel(18, 30, 28, 22, BONE);
  p.rect(18, 36, 28, 1, "steel2");
  p.rect(18, 45, 28, 1, "steel2");
  p.rect(19, 40, 26, 2, "orange");
  p.rect(27, 40, 3, 2, "bone1");
  p.panel(22, 26, 20, 4, STEEL);
  p.panel(22, 52, 20, 4, STEEL);
  // solar wings
  for (const y of [10, 66]) {
    p.panel(2, y, 24, 12, COBALT);
    p.panel(38, y, 24, 12, COBALT);
    for (let x = 6; x < 26; x += 5) p.rect(x, y + 1, 1, 10, "void3");
    for (let x = 42; x < 62; x += 5) p.rect(x, y + 1, 1, 10, "void3");
    p.rect(2, y + 6, 24, 1, "void3");
    p.rect(38, y + 6, 24, 1, "void3");
  }
  // docking arm reaching left, with a clamp
  p.panel(4, 46, 14, 5, STEEL);
  p.rect(2, 44, 3, 9, "steel1");
  p.rect(2, 44, 3, 1, "steel3");
  p.rect(1, 44, 1, 2, "yellow");
  p.rect(1, 51, 1, 2, "yellow");
  // dish and mast
  p.line(32, 2, 32, 0, "steel3");
  p.disc(42, 60, 3, "steel2");
  p.disc(42, 60, 1.5, "steel0");
  // windows: a few stay dark, the rest flicker by frame
  const rnd = mulberry(77);
  for (let y = 32; y < 50; y += 3)
    for (let x = 20; x < 44; x += 3) {
      if (y >= 39 && y <= 42) continue;
      const v = rnd();
      if (v < 0.3) p.set(x, y, "void3");
      else if (v < 0.36 && frame % 2 === 1) p.set(x, y, "void3");
      else p.lamp(x, y, v > 0.8 ? "mint" : "amber", "void3");
    }
  for (let y = 5; y < 92; y += 9) p.lamp(32, y, y % 2 ? "teal2" : "amber", "void3");
  // beacons blink around the frame cycle
  if (frame === 0 || frame === 2) {
    p.lamp(32, 0, "red1", "red0");
    p.lamp(2, 48, "lime", "green0");
  } else {
    p.set(32, 0, "red0");
    p.set(2, 48, "green0");
  }
  if (frame === 1) p.lamp(31, 94, "red1", "red0");
  return p.outline();
}

function buildStationFar(): Pix {
  const p = new Pix(18, 22);
  p.rect(8, 1, 2, 20, "steel1");
  p.rect(8, 1, 1, 20, "steel2");
  p.panel(5, 8, 8, 6, BONE);
  p.rect(1, 3, 6, 3, "cobalt0");
  p.rect(11, 3, 6, 3, "cobalt0");
  p.rect(1, 16, 6, 3, "cobalt0");
  p.rect(11, 16, 6, 3, "cobalt0");
  p.rect(1, 3, 6, 1, "cobalt1");
  p.rect(11, 3, 6, 1, "cobalt1");
  p.rect(1, 16, 6, 1, "cobalt1");
  p.rect(11, 16, 6, 1, "cobalt1");
  p.lamp(7, 10, "amber", "void3");
  p.lamp(10, 11, "amber", "void3");
  p.lamp(8, 0, "red1", "red0");
  return p.outline();
}

/** Lumpy rock lit from the upper left. */
function buildRock(seed: number, radius: number, ramp: string[], hot = false): Pix {
  const size = Math.ceil(radius * 2 + 5);
  const p = new Pix(size, size);
  const rnd = mulberry(seed * 7919 + 13);
  const lobes: number[] = [];
  for (let i = 0; i < 8; i++) lobes.push(0.72 + rnd() * 0.42);
  const c = size / 2 - 0.5;
  const craters: number[] = [];
  for (let i = 0; i < Math.max(1, Math.floor(radius / 2.5)); i++) craters.push((rnd() - 0.5) * radius * 1.1, (rnd() - 0.5) * radius * 1.1, 0.8 + rnd() * radius * 0.22);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = x - c;
      const dy = y - c;
      const a = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) * 8;
      const i0 = Math.floor(a) % 8;
      const f = a - Math.floor(a);
      const s = f * f * (3 - 2 * f);
      const edge = radius * (lobes[i0] * (1 - s) + lobes[(i0 + 1) % 8] * s);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > edge) continue;
      const nz = Math.sqrt(Math.max(0, 1 - (d * d) / (edge * edge)));
      let light = (-dx / edge) * 0.62 + (-dy / edge) * 0.52 + nz * 0.58;
      light += (rnd() - 0.5) * 0.18;
      for (let k = 0; k < craters.length; k += 3) {
        const cd = Math.hypot(dx - craters[k], dy - craters[k + 1]);
        if (cd < craters[k + 2]) light -= 0.3;
        else if (cd < craters[k + 2] + 1 && dx - craters[k] > 0) light += 0.18;
      }
      const idx = light > 0.72 ? 3 : light > 0.36 ? 2 : light > 0.02 ? 1 : 0;
      p.set(x, y, ramp[idx]);
      if (hot && dx > edge * 0.35 && d > edge - 1.6) p.lamp(x, y, dx > edge * 0.7 ? "yellow" : "orange", ramp[idx]);
    }
  return p.outline();
}

function buildSalvage(kind: "crate" | "pod" | "wreck" | "crystal"): Pix {
  if (kind === "crate") {
    const p = new Pix(11, 11);
    p.panel(1, 1, 8, 8, YELLOW);
    p.rect(1, 4, 8, 1, "rust1");
    p.rect(4, 1, 1, 8, "rust1");
    p.set(4, 4, "void3");
    p.lamp(7, 2, "lime", "green0");
    return p.outline();
  }
  if (kind === "pod") {
    const p = new Pix(13, 10);
    p.panel(2, 2, 8, 6, BONE);
    p.rect(1, 3, 1, 4, "bone0");
    p.rect(10, 3, 1, 4, "steel2");
    p.rect(2, 5, 8, 1, "orange");
    p.lampRect(6, 3, 3, 2, "teal2", "teal0");
    p.lamp(6, 3, "mint", "teal1");
    p.lamp(3, 6, "red1", "red0");
    return p.outline();
  }
  if (kind === "wreck") {
    const p = new Pix(16, 13);
    p.panel(2, 3, 9, 6, STEEL);
    p.panel(8, 6, 6, 5, RUST);
    p.set(2, 3, "");
    p.set(3, 3, "");
    p.set(2, 4, "");
    p.set(10, 3, "");
    p.set(13, 10, "");
    p.line(4, 2, 6, 0, "steel2");
    p.line(11, 5, 14, 2, "steel1");
    p.rect(5, 6, 2, 2, "void2");
    p.set(4, 9, "steel0");
    p.set(3, 10, "steel0");
    p.set(12, 11, "rust0");
    p.lamp(9, 7, "amber", "rust0");
    return p.outline();
  }
  const p = new Pix(11, 14);
  const shard = (x: number, top: number, bottom: number, w: number, lit: string, mid: string, dark: string) => {
    for (let y = top; y <= bottom; y++) {
      const t = (y - top) / Math.max(1, bottom - top);
      const half = t < 0.3 ? Math.round((t / 0.3) * w) : t > 0.8 ? Math.round(((1 - t) / 0.2) * w) : w;
      for (let i = -half; i <= half; i++) p.set(x + i, y, i < 0 ? lit : i === 0 ? mid : dark);
    }
  };
  shard(5, 0, 12, 2, "violet3", "violet2", "violet1");
  shard(2, 5, 12, 1, "mint", "teal2", "teal1");
  shard(8, 4, 12, 1, "violet3", "violet2", "violet0");
  p.lamp(4, 3, "bone2", "violet3");
  p.lamp(5, 1, "violet3", "violet2");
  p.lamp(2, 7, "mint", "teal2");
  return p.outline();
}

function buildTow(frame: number): Pix {
  const p = new Pix(32, 18);
  p.panel(6, 5, 18, 9, RUST);
  p.rect(7, 9, 16, 2, "yellow");
  for (let x = 8; x < 23; x += 4) p.rect(x, 9, 2, 2, "void3");
  p.panel(17, 2, 7, 4, STEEL);
  p.lampRect(19, 3, 4, 2, "teal2", "teal0");
  p.rect(24, 7, 3, 6, "steel1");
  p.rect(27, 8, 2, 4, "steel0");
  p.rect(2, 6, 4, 7, "steel1");
  p.rect(2, 6, 4, 1, "steel3");
  p.lampRect(1, 8, 1, 3, "amber", "void3");
  p.rect(10, 14, 2, 2, "steel0");
  p.rect(19, 14, 2, 2, "steel0");
  p.line(12, 4, 12, 2, "steel2");
  // rotating beacon
  if (frame % 2 === 0) p.lampRect(11, 1, 3, 1, "amber", "rust1");
  else p.lamp(12, 1, "yellow", "rust1");
  if (frame === 3) p.lamp(28, 10, "red1", "red0");
  return p.outline();
}

function buildPirate(frame: number): Pix {
  const p = new Pix(30, 16);
  for (let x = 2; x < 26; x++) {
    const t = (x - 2) / 24;
    const half = Math.round(1 + (1 - Math.abs(t - 0.35) * 1.6) * 4);
    p.rect(x, 8 - half, 1, half * 2, x % 7 === 0 ? "void3" : "steel0");
  }
  p.line(8, 4, 3, 0, "steel1");
  p.line(8, 11, 3, 15, "steel1");
  p.line(9, 4, 4, 0, "steel0");
  p.line(9, 11, 4, 15, "steel0");
  p.rect(10, 7, 12, 1, "red0");
  p.lampRect(19, 6, 3, 1, "red1", "red0");
  p.lampRect(25, 7, 2, 2, frame % 2 ? "red1" : "amber", "rust0");
  p.lampRect(1, 6, 1, 4, frame % 2 ? "orange" : "amber", "void3");
  if (frame === 2) p.lamp(12, 3, "red1", "red0");
  return p.rim().outline();
}

function buildDerelict(variant: number): Pix {
  const p = new Pix(40, 24);
  const rnd = mulberry(900 + variant * 31);
  p.panel(4, 6, 26, 11, DARK);
  p.panel(22, 3, 10, 6, DARK);
  for (let i = 0; i < 9; i++) {
    const x = 4 + Math.floor(rnd() * 26);
    const y = 6 + Math.floor(rnd() * 11);
    p.rect(x, y, 1 + Math.floor(rnd() * 3), 1 + Math.floor(rnd() * 2), rnd() > 0.5 ? "void1" : "");
  }
  p.line(30, 10, 37, 6 + variant * 3, "steel0");
  p.line(4, 12, 0, 16 - variant * 2, "void3");
  p.rect(10, 17, 2, 4, "void3");
  p.rect(12 + variant * 4, 4, 1, 2, "steel0");
  return p.rim().outline();
}

function buildProbe(frame: number): Pix {
  const p = new Pix(15, 9);
  p.panel(5, 2, 5, 5, BONE);
  p.rect(0, 3, 5, 3, "cobalt0");
  p.rect(10, 3, 5, 3, "cobalt0");
  p.rect(0, 3, 5, 1, "cobalt1");
  p.rect(10, 3, 5, 1, "cobalt1");
  p.set(2, 4, "void3");
  p.set(12, 4, "void3");
  p.line(7, 1, 8, 0, "steel3");
  p.lamp(7, 4, frame ? "mint" : "teal2", "teal0");
  return p.outline();
}

function buildUtility(name: string): Pix {
  if (name === "px") {
    const p = new Pix(1, 1);
    p.set(0, 0, "bone2");
    return p;
  }
  if (name === "px2") {
    const p = new Pix(2, 2);
    p.rect(0, 0, 2, 2, "bone2");
    return p;
  }
  if (name === "glint") {
    const p = new Pix(3, 3);
    p.set(1, 0, "steel3");
    p.set(0, 1, "steel3");
    p.set(2, 1, "steel3");
    p.set(1, 2, "steel3");
    p.set(1, 1, "bone2");
    return p;
  }
  if (name === "sparkle") {
    const p = new Pix(5, 5);
    p.rect(2, 0, 1, 5, "steel3");
    p.rect(0, 2, 5, 1, "steel3");
    p.rect(2, 1, 1, 3, "bone1");
    p.rect(1, 2, 3, 1, "bone1");
    p.set(2, 2, "bone2");
    return p;
  }
  // warp streaks: bright head on the right, tail fading through the grey ramp (tinted per star)
  const len = Number(name.slice(6));
  const p = new Pix(len, 1);
  for (let i = 0; i < len; i++) {
    const t = 1 - i / (len - 1);
    p.set(i, 0, t > 0.85 ? "bone2" : t > 0.6 ? "steel3" : t > 0.3 ? "steel2" : "steel1");
  }
  return p;
}

/** Nearest-neighbour rotation with a 3x3 majority vote so rotated plates keep clean edges. */
function rotateSprite(src: Sprite, angle: number, cell: number): Pix {
  const out = new Pix(cell, cell);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const sx = src.w / 2;
  const sy = src.h / 2;
  const c = cell / 2;
  const votes = new Uint8Array(9);
  const pick = (map: Uint8Array, x: number, y: number): number => {
    let n = 0;
    let opaque = 0;
    for (let j = 0; j < 3; j++)
      for (let i = 0; i < 3; i++) {
        const dx = x + (i + 0.5) / 3 - c;
        const dy = y + (j + 0.5) / 3 - c;
        const u = Math.floor(dx * cos - dy * sin + sx);
        const v = Math.floor(dx * sin + dy * cos + sy);
        const val = u < 0 || v < 0 || u >= src.w || v >= src.h ? 0 : map[v * src.w + u];
        votes[n++] = val;
        if (val) opaque++;
      }
    if (opaque < 5) return 0;
    let best = 0;
    let bestCount = 0;
    for (let i = 0; i < 9; i++) {
      if (!votes[i]) continue;
      let count = 0;
      for (let k = 0; k < 9; k++) if (votes[k] === votes[i]) count++;
      if (count > bestCount) {
        bestCount = count;
        best = votes[i];
      }
    }
    return best;
  };
  for (let y = 0; y < cell; y++)
    for (let x = 0; x < cell; x++) {
      out.px[y * cell + x] = pick(src.px, x, y);
      // lamps are tiny: sample the emissive map at the pixel centre instead of voting
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const u = Math.floor(dx * cos - dy * sin + sx);
      const v = Math.floor(dx * sin + dy * cos + sy);
      const e = u < 0 || v < 0 || u >= src.w || v >= src.h ? 0 : src.em[v * src.w + u];
      if (e && out.px[y * cell + x]) out.em[y * cell + x] = e;
    }
  return out;
}

export const DRONE_KINDS = ["hauler", "probe", "salvager", "fixer"] as const;
export const SALVAGE_KINDS = ["crate", "pod", "wreck", "crystal"] as const;
export const STREAK_LENGTHS = [4, 8, 16, 32] as const;
/** Cell size of the 16 ship rotation frames (frame 00 is the side view at rest). */
export const SHIP_CELL = 56;
/** Nozzle and laser emitter offsets from the ship sprite centre, facing right. */
export const SHIP_NOZZLE = { x: -24, y: 1 };
export const SHIP_EMITTER = { x: 24, y: 5 };

/**
 * Logical frame slots, in a fixed order: the index is the frame id used on the UI thread.
 * Animated sets (drone, tow, pirate, probe) cycle their frames; station/asteroid/meteor/derelict
 * frames are variants picked by seed.
 */
export const FRAME_NAMES: string[] = (() => {
  const names: string[] = ["px", "px2", "glint", "sparkle"];
  for (const l of STREAK_LENGTHS) names.push(`streak${l}`);
  for (let i = 0; i < 16; i++) names.push(`ship_${String(i).padStart(2, "0")}`);
  for (const k of DRONE_KINDS) for (let i = 0; i < 4; i++) names.push(`drone_${k}_${i}`);
  for (let i = 0; i < 4; i++) names.push(`station_${i}`);
  names.push("station_far");
  for (let i = 0; i < 6; i++) names.push(`asteroid_${i}`);
  for (const k of SALVAGE_KINDS) names.push(`salvage_${k}`);
  for (let i = 0; i < 4; i++) names.push(`tow_${i}`);
  for (let i = 0; i < 4; i++) names.push(`meteor_${i}`);
  for (let i = 0; i < 4; i++) names.push(`pirate_${i}`);
  for (let i = 0; i < 3; i++) names.push(`derelict_${i}`);
  for (let i = 0; i < 2; i++) names.push(`probe_${i}`);
  return names;
})();

export const FRAME_ID: Record<string, number> = {};
FRAME_NAMES.forEach((n, i) => {
  FRAME_ID[n] = i;
});

const ROCK = ["void3", "steel0", "steel1", "steel2"];
const METEOR = ["rust0", "steel0", "steel1", "steel2"];

function buildFrame(name: string, paint: string[], tug: Pix): Sprite {
  const parts = name.split("_");
  const last = Number(parts[parts.length - 1]);
  switch (parts[0]) {
    case "ship":
      return last === 0 ? centerIn(tug, SHIP_CELL) : rotateSprite(tug, (last / 16) * Math.PI * 2, SHIP_CELL);
    case "drone":
      return buildDrone(DRONE_KINDS.indexOf(parts[1] as (typeof DRONE_KINDS)[number]), last);
    case "station":
      return parts[1] === "far" ? buildStationFar() : buildStation(last);
    case "asteroid":
      return buildRock(last + 1, 3.5 + last * 1.5, ROCK);
    case "salvage":
      return buildSalvage(parts[1] as (typeof SALVAGE_KINDS)[number]);
    case "tow":
      return buildTow(last);
    case "meteor":
      return buildRock(40 + last, 2.5 + last * 0.7, METEOR, true);
    case "pirate":
      return buildPirate(last);
    case "derelict":
      return buildDerelict(last);
    case "probe":
      return buildProbe(last);
    default:
      return buildUtility(name);
  }
}

function centerIn(src: Sprite, cell: number): Pix {
  const out = new Pix(cell, cell);
  const ox = Math.floor((cell - src.w) / 2);
  const oy = Math.floor((cell - src.h) / 2);
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      out.px[(y + oy) * cell + x + ox] = src.px[y * src.w + x];
      out.em[(y + oy) * cell + x + ox] = src.em[y * src.w + x];
    }
  return out;
}

export interface SpriteSet {
  /** One sprite per FRAME_NAMES entry. */
  sprites: Sprite[];
}

const setCache: Record<string, SpriteSet> = {};

/** All procedural sprites for a hull paint (palette key or cosmetic value). Cached per paint family. */
export function getSpriteSet(paint: string | undefined): SpriteSet {
  const ramp = familyRamp(paint, "bone");
  const key = ramp.join(",");
  const cached = setCache[key];
  if (cached) return cached;
  const tug = buildTug(ramp);
  const set: SpriteSet = { sprites: FRAME_NAMES.map((n) => buildFrame(n, ramp, tug)) };
  setCache[key] = set;
  return set;
}

export interface PackedSheet {
  width: number;
  height: number;
  /** RGBA8888, unpremultiplied (alpha is 0 or 255). */
  base: Uint8Array;
  emissive: Uint8Array;
  /** x, y, w, h per frame id (same rectangle in both layers). */
  rects: Int16Array;
}

/** Shelf-packs a sprite set into two same-layout RGBA sheets (base and emissive). */
export function packSheet(set: SpriteSet): PackedSheet {
  const width = 512;
  const order = set.sprites.map((_, i) => i).sort((a, b) => set.sprites[b].h - set.sprites[a].h);
  const rects = new Int16Array(set.sprites.length * 4);
  let x = 1;
  let y = 1;
  let shelf = 0;
  for (const i of order) {
    const s = set.sprites[i];
    if (x + s.w + 1 > width) {
      x = 1;
      y += shelf + 1;
      shelf = 0;
    }
    rects[i * 4] = x;
    rects[i * 4 + 1] = y;
    rects[i * 4 + 2] = s.w;
    rects[i * 4 + 3] = s.h;
    x += s.w + 1;
    if (s.h > shelf) shelf = s.h;
  }
  let height = 64;
  while (height < y + shelf + 1) height *= 2;
  const base = new Uint8Array(width * height * 4);
  const emissive = new Uint8Array(width * height * 4);
  set.sprites.forEach((s, i) => {
    const ox = rects[i * 4];
    const oy = rects[i * 4 + 1];
    for (let py = 0; py < s.h; py++)
      for (let px = 0; px < s.w; px++) {
        const o = ((oy + py) * width + ox + px) * 4;
        const c = s.px[py * s.w + px];
        if (c) {
          base[o] = Math.round(PAL_RGB[(c - 1) * 3] * 255);
          base[o + 1] = Math.round(PAL_RGB[(c - 1) * 3 + 1] * 255);
          base[o + 2] = Math.round(PAL_RGB[(c - 1) * 3 + 2] * 255);
          base[o + 3] = 255;
        }
        const e = s.em[py * s.w + px];
        if (e) {
          emissive[o] = Math.round(PAL_RGB[(e - 1) * 3] * 255);
          emissive[o + 1] = Math.round(PAL_RGB[(e - 1) * 3 + 1] * 255);
          emissive[o + 2] = Math.round(PAL_RGB[(e - 1) * 3 + 2] * 255);
          emissive[o + 3] = 255;
        }
      }
  });
  return { width, height, base, emissive, rects };
}

/**
 * SVG path data per palette index for a sprite (horizontal runs), for the lite renderer.
 * `lights` adds the emissive map on top of the base colors.
 */
export function spritePaths(s: Sprite, lights: boolean): { color: number; d: string }[] {
  const byColor: Record<number, string[]> = {};
  for (let y = 0; y < s.h; y++) {
    let x = 0;
    while (x < s.w) {
      const o = y * s.w + x;
      const c = (lights && s.em[o]) || s.px[o];
      if (!c) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < s.w) {
        const o2 = y * s.w + x + run;
        if (((lights && s.em[o2]) || s.px[o2]) !== c) break;
        run++;
      }
      (byColor[c] ??= []).push(`M${x} ${y}h${run}v1h${-run}z`);
      x += run;
    }
  }
  return Object.keys(byColor).map((k) => ({ color: Number(k) - 1, d: byColor[Number(k)].join("") }));
}

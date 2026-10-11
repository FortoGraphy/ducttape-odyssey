// CPU twin of the planet shader for the lite renderer: a static pixel planet (no rotation) with the
// same palette ramp, biome kinds and ordered-dither terminator, returned as a Sprite. Runs once per
// planet on the JS thread (at most ~10k pixels), never per frame.
import type { Sprite } from "./sprites";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const a = lerp(lerp(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), lerp(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v);
  const b = lerp(lerp(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), lerp(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v);
  return lerp(a, b, w);
}

function fbm3(x: number, y: number, z: number): number {
  let s = 0;
  let a = 0.5;
  for (let i = 0; i < 3; i++) {
    s += a * vnoise3(x, y, z);
    x = x * 2.02 + 13.1;
    y = y * 2.02 + 7.7;
    z = z * 2.02 + 5.3;
    a *= 0.5;
  }
  return s / 0.875;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * kind: index into SHADER_KINDS. ramp: 6 palette indexes (shadow, deep, dark, mid, light, accent).
 * The sprite is square; the planet centre is the sprite centre.
 */
export function buildPlanetSprite(kind: number, seed: number, R: number, rings: boolean, ramp: number[]): Sprite {
  const ext = rings ? Math.ceil(R * 2.35) : R + 2;
  const size = ext * 2;
  const px = new Uint8Array(size * size);
  const em = new Uint8Array(size * size);
  const L = [-0.55, -0.44, 0.71];
  const so = seed * 0.1;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5 - ext) / R;
      const ny = (y + 0.5 - ext) / R;
      const r2 = nx * nx + ny * ny;
      const dth = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
      let ring = 0;
      let ringFront = false;
      if (rings) {
        const qx = nx * 0.9397 + ny * 0.342;
        const qy = -nx * 0.342 + ny * 0.9397;
        const rr = Math.hypot(qx, qy / 0.27);
        if (rr > 1.35 && rr < 2.25) {
          const band = vnoise3(rr * 11, so * 7, 0.5);
          const dens = smooth(0.22, 0.5, band) * (0.55 + 0.45 * vnoise3(rr * 31, so * 3 + 4, 0.5)) * smooth(1.35, 1.45, rr) * smooth(2.25, 2.1, rr);
          if (dens > dth * 0.8 + 0.12) {
            ring = ramp[Math.min(4, 2 + Math.floor(band * 2.2 + dth * 0.6))] + 1;
            ringFront = qy > 0;
          }
        }
      }
      const o = y * size + x;
      if (r2 >= 1) {
        if (ring) px[o] = ring;
        continue;
      }
      const z = Math.sqrt(1 - r2);
      const sx = nx * 0.9397 - ny * 0.342 + so * 1.7;
      const sy = nx * 0.342 + ny * 0.9397 + so * 2.3;
      const sz = z + so * 0.9;
      const lat = nx * 0.342 + ny * 0.9397;
      let alb = 0.5;
      let glow = false;
      const h = fbm3(sx * 2.3, sy * 2.3, sz * 2.3);
      if (kind === 1) {
        const warp = fbm3(sx * 1.4, sy * 4.5, sz * 1.4) - 0.5;
        alb = vnoise3((lat + warp * 0.2) * 6.5 + so * 5, 3.3, 0.5) * 0.72 + vnoise3((lat + warp * 0.3) * 17, 9.1, 0.5) * 0.28;
      } else if (kind === 2) {
        alb = 0.5 + h * 0.5 - smooth(0.035, 0, Math.abs(fbm3(sx * 4.2 + 7, sy * 4.2 + 7, sz * 4.2 + 7) - 0.5)) * 0.6;
        alb += (1 - alb) * smooth(0.6, 0.78, Math.abs(lat) + h * 0.22);
      } else if (kind === 3) {
        alb = 0.08 + h * 0.5;
        glow = Math.abs(fbm3(sx * 3.1 + 4, sy * 3.1 + 4, sz * 3.1 + 4) - 0.5) < 0.012 || h > 0.78;
      } else if (kind === 4) {
        const land = h > 0.55;
        alb = land ? 0.6 + (h - 0.55) * 1.7 : 0.02 + h * 0.72;
        if (fbm3(sx * 2.7 + 9, sy * 2.7, sz * 2.7) > 0.62) alb = 1;
      } else if (kind === 5) {
        alb = 0.3 + fbm3(sx * 2, sy * 9, sz * 2) * 0.36 + h * 0.42 - smooth(0.6, 0.68, fbm3(sx * 3 + 12, sy * 3 + 12, sz * 3 + 12)) * 0.5;
      } else if (kind === 6) {
        const w = fbm3(sx * 2, sy * 2, sz * 2) - 0.5;
        const hh = fbm3(sx * 1.8 + w * 2.6, sy * 1.8 - w * 2.6, sz * 1.8 + w);
        alb = hh * 1.05;
        glow = Math.abs(hh - 0.55) < 0.02;
      } else if (kind === 7) {
        const cell = hash3(Math.floor(sx * 3.3), Math.floor(sy * 3.3), Math.floor(sz * 3.3));
        alb = 0.15 + cell * 0.85;
        glow = cell > 0.9;
      } else {
        alb = h * 0.9 + 0.08;
      }
      alb = Math.min(1, Math.max(0, alb));
      const light = Math.min(1, Math.max(0, (nx * L[0] + ny * L[1] + z * L[2]) * 1.2 + 0.1));
      const a = Math.floor(1 + alb * 3.3 + (dth - 0.5) * 0.35 + 0.5);
      let idx = a - Math.floor((1 - light) * 3.7 + dth);
      idx = Math.min(4, Math.max(0, idx));
      if (glow && (light > 0.3 || kind === 3)) idx = 5;
      px[o] = ring && ringFront ? ring : ramp[idx] + 1;
      if (glow && !(ring && ringFront)) em[o] = ramp[5] + 1;
    }
  return { w: size, h: size, px, em };
}

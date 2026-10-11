// Seeded seam generator: a serpentine of slanted straight runs joined by rounded corners and
// U-turns, resampled at an even spacing so the game can treat it as a list of bead positions.
import type { MinigameTier } from "@/engine/types";

import { miniRng } from "../shared";

export interface Seam {
  n: number;
  xs: number[];
  ys: number[];
  /** Tangent angle per sample, radians. */
  ang: number[];
  spacing: number;
  length: number;
  /** SVG path through all samples. */
  d: string;
}

export interface SeamRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MAX_SAMPLES = 132;
const MIN_SPACING = 9;

// Per tier: horizontal runs, bends per run, bend depth (share of the row gap), corner radius.
const SHAPE = [
  { rows: 2, bends: 1, depth: 0.16, corner: 26 },
  { rows: 3, bends: 2, depth: 0.22, corner: 17 },
  { rows: 4, bends: 3, depth: 0.25, corner: 11 },
] as const;

export function buildSeam(seed: number, tier: MinigameTier, rect: SeamRect): Seam {
  const rnd = miniRng(seed ^ 0x5eed);
  const shape = SHAPE[tier - 1];
  // Tall plates get one more run so the seam fills the plate instead of floating in the middle.
  const rows = shape.rows + (rect.h >= 300 && tier < 3 ? 1 : 0);
  const gap = Math.min(tier === 3 ? 150 : 120, rect.h / (rows - 1));
  const top = rect.y + (rect.h - gap * (rows - 1)) / 2;
  const flip = rnd() < 0.5;

  const px: number[] = [];
  const py: number[] = [];
  for (let r = 0; r < rows; r++) {
    const y = top + r * gap;
    const leftToRight = (r % 2 === 0) !== flip;
    const xa = leftToRight ? rect.x : rect.x + rect.w;
    const xb = leftToRight ? rect.x + rect.w : rect.x;
    px.push(xa);
    py.push(y);
    let sign = rnd() < 0.5 ? -1 : 1;
    for (let k = 1; k <= shape.bends; k++) {
      const f = (k + (rnd() - 0.5) * 0.36) / (shape.bends + 1);
      // The outer rows only bend inwards so the seam stays inside the plate.
      const dir = r === 0 ? 1 : r === rows - 1 ? -1 : sign;
      px.push(xa + (xb - xa) * f);
      py.push(y + dir * gap * shape.depth * (0.55 + 0.45 * rnd()));
      sign = -sign;
    }
    px.push(xb);
    py.push(y);
  }

  // Dense polyline with quadratic corners.
  const dx: number[] = [px[0]];
  const dy: number[] = [py[0]];
  for (let i = 1; i < px.length - 1; i++) {
    const inX = px[i] - px[i - 1];
    const inY = py[i] - py[i - 1];
    const outX = px[i + 1] - px[i];
    const outY = py[i + 1] - py[i];
    const inLen = Math.hypot(inX, inY) || 1;
    const outLen = Math.hypot(outX, outY) || 1;
    const r = Math.min(shape.corner, inLen * 0.45, outLen * 0.45);
    const ax = px[i] - (inX / inLen) * r;
    const ay = py[i] - (inY / inLen) * r;
    const bx = px[i] + (outX / outLen) * r;
    const by = py[i] + (outY / outLen) * r;
    for (let s = 0; s <= 8; s++) {
      const u = s / 8;
      const v = 1 - u;
      dx.push(v * v * ax + 2 * v * u * px[i] + u * u * bx);
      dy.push(v * v * ay + 2 * v * u * py[i] + u * u * by);
    }
  }
  dx.push(px[px.length - 1]);
  dy.push(py[py.length - 1]);

  const cum: number[] = [0];
  for (let i = 1; i < dx.length; i++) cum.push(cum[i - 1] + Math.hypot(dx[i] - dx[i - 1], dy[i] - dy[i - 1]));
  const length = cum[cum.length - 1];
  const n = Math.max(2, Math.min(MAX_SAMPLES, Math.floor(length / MIN_SPACING) + 1));
  const spacing = length / (n - 1);

  const xs: number[] = [];
  const ys: number[] = [];
  let seg = 1;
  for (let i = 0; i < n; i++) {
    const target = i * spacing;
    while (seg < cum.length - 1 && cum[seg] < target) seg++;
    const span = cum[seg] - cum[seg - 1] || 1;
    const u = Math.max(0, Math.min(1, (target - cum[seg - 1]) / span));
    xs.push(dx[seg - 1] + (dx[seg] - dx[seg - 1]) * u);
    ys.push(dy[seg - 1] + (dy[seg] - dy[seg - 1]) * u);
  }
  const ang: number[] = [];
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    ang.push(Math.atan2(ys[b] - ys[a], xs[b] - xs[a]));
    d += `${i === 0 ? "M" : "L"}${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`;
  }
  return { n, xs, ys, ang, spacing, length, d };
}

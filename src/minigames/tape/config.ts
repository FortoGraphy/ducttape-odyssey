// Pure layout, coverage math and scoring for the duct-tape game.
import type { MinigameTier } from "@/engine/types";

import { miniRng } from "../shared";

export interface LeakDef {
  x: number;
  y: number;
  /** Direction of the crack in radians; the tape has to run along it. */
  angle: number;
  len: number;
  /** Direction the air escapes (drawn only). */
  jet: number;
  spawnAt: number;
  /** Tier 3: the crack creeps back and forth along `moveDir`. */
  moveAmp: number;
  moveW: number;
  movePh: number;
  moveDir: number;
  /** Jagged outline, as perpendicular offsets at evenly spaced stations. */
  jag: number[];
}

export interface TapeConfig {
  seconds: number;
  leaks: LeakDef[];
  /** Severity gained per second while a leak is open (starts at 1, capped at MAX_SEV). */
  growth: number;
  /** Pressure lost per second by one fully open leak at severity 1. */
  drain: number;
  /** Tape on the roll in points, or -1 when the roll is not limited. */
  budget: number;
  /** Tape a tidy player needs for everything. */
  ideal: number;
}

export const SECONDS: [number, number, number] = [40, 50, 60];
export const TAPE_W = 26;
export const MAX_SEV = 2.2;
export const SAMPLES = 5;
export const FULL_MASK = (1 << SAMPLES) - 1;
export const MIN_SWIPE = 28;
/** Tape overhang a clean wrap needs past each end of a crack. */
export const OVERHANG = 8;
export const PT_PER_CM = 4;

const COUNT = [5, 8, 10] as const;
const GAP = [4.6, 3.6, 3.3] as const;
const GROWTH = [0.1, 0.14, 0.16] as const;
const DRAIN = [0.016, 0.017, 0.018] as const;

export function makeTapeConfig(tier: MinigameTier, seed: number, w: number, h: number): TapeConfig {
  const rnd = miniRng(seed ^ 0x7a9e);
  const k = tier - 1;
  const n = COUNT[k];
  const leaks: LeakDef[] = [];
  const margin = 46;
  let at = 0;
  let ideal = 0;
  for (let i = 0; i < n; i++) {
    const len = 46 + rnd() * 34;
    let x = 0;
    let y = 0;
    // Keep a new crack clear of the last few so two jets never sit on top of each other.
    for (let tries = 0; tries < 24; tries++) {
      x = margin + rnd() * (w - margin * 2);
      y = margin + rnd() * (h - margin * 2);
      let ok = true;
      for (let j = Math.max(0, i - 4); j < i; j++) {
        const dx = leaks[j].x - x;
        const dy = leaks[j].y - y;
        if (dx * dx + dy * dy < 84 * 84) ok = false;
      }
      if (ok) break;
    }
    const angle = rnd() * Math.PI;
    const jag: number[] = [];
    for (let s = 0; s < 7; s++) jag.push(s === 0 || s === 6 ? 0 : (rnd() - 0.5) * 9);
    leaks.push({
      x,
      y,
      angle,
      len,
      jet: angle + (rnd() < 0.5 ? 1 : -1) * (Math.PI / 2) + (rnd() - 0.5) * 0.7,
      spawnAt: at,
      moveAmp: tier === 3 ? 14 + rnd() * 16 : 0,
      moveW: (Math.PI * 2) / (5 + rnd() * 3),
      movePh: rnd() * Math.PI * 2,
      moveDir: rnd() * Math.PI * 2,
      jag,
    });
    ideal += len + OVERHANG * 2;
    at += i === 0 ? 1.4 : GAP[k] * (0.8 + rnd() * 0.4);
  }
  return { seconds: SECONDS[k], leaks, growth: GROWTH[k], drain: DRAIN[k], budget: tier === 3 ? Math.round(ideal * 1.5) : -1, ideal };
}

/** Squared distance from point (px, py) to the segment a-b. */
export function distSqToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  "worklet";
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  let u = l2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0;
  if (u < 0) u = 0;
  else if (u > 1) u = 1;
  const dx = ax + vx * u - px;
  const dy = ay + vy * u - py;
  return dx * dx + dy * dy;
}

/**
 * Which of the crack's sample stations a strip of tape a-b covers, as a bit mask. A swipe along the
 * crack and at least as long covers all of them; a short or crooked one only a few.
 */
export function coverMask(cx: number, cy: number, angle: number, len: number, ax: number, ay: number, bx: number, by: number): number {
  "worklet";
  const reach = TAPE_W * 0.5;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  let mask = 0;
  for (let s = 0; s < SAMPLES; s++) {
    const o = (s / (SAMPLES - 1) - 0.5) * len;
    if (distSqToSegment(cx + ux * o, cy + uy * o, ax, ay, bx, by) <= reach * reach) mask |= 1 << s;
  }
  return mask;
}

export function bitCount(mask: number): number {
  "worklet";
  let c = 0;
  for (let s = 0; s < SAMPLES; s++) if (mask & (1 << s)) c++;
  return c;
}

export type TapeEnd = "win" | "vented" | "noTape" | "timeout";

/**
 * `pressure` 0..1 is what is left in the section, `sealed` how many leaks are closed, `used` the
 * tape laid in points and `idealUsed` what the sealed leaks needed.
 */
export function scoreTape(cfg: TapeConfig, end: TapeEnd, pressure: number, sealed: number, used: number, idealUsed: number): number {
  const p = Math.max(0, Math.min(1, pressure));
  const eff = used > 0 ? Math.max(0, Math.min(1, idealUsed / used)) : 0;
  const share = sealed / cfg.leaks.length;
  if (end === "win") return Math.min(1, 0.5 + 0.5 * (0.65 * p + 0.35 * eff));
  if (end === "timeout") return 0.5 * p * share * (0.8 + 0.2 * eff);
  return 0.3 * share * (0.8 + 0.2 * eff);
}

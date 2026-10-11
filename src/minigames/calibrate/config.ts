// Pure difficulty generation, signal math and scoring for the calibration game.
import type { MinigameTier } from "@/engine/types";

import { miniRng } from "../shared";

export interface CalibrateConfig {
  seconds: number;
  locks: number;
  /** Coarse ring + fine knob (tiers 2 and 3) instead of one knob. */
  dual: boolean;
  /** Half-width of the lock window in tuning units (the whole dial is 0..1). */
  window: number;
  /** Seconds the signal must stay inside the window. */
  hold: number;
  fuses: number;
  /** Seconds a brisk player needs per lock; drives the speed score. */
  par: number;
  start: number;
  targets: number[];
  driftAmp: number;
  driftW: number;
  driftPh: number[];
  /** Tier 3: interference bursts that bury the trace (start times, seconds). */
  noiseAt: number[];
  noiseLen: number;
}

export const SECONDS: [number, number, number] = [30, 45, 60];

/** Dial travel per full turn. */
export const TURN_SINGLE = 1 / 1.5;
export const TURN_RING = 0.9;
export const TURN_FINE = 0.1;

const LOCKS = [1, 2, 3] as const;
const WINDOW = [0.035, 0.016, 0.011] as const;
const HOLD = [1, 1, 0.9] as const;
const DRIFT_AMP = [0, 0.02, 0.02] as const;
const DRIFT_PERIOD = [1, 11, 8] as const;

export function makeCalibrateConfig(tier: MinigameTier, seed: number): CalibrateConfig {
  const rnd = miniRng(seed ^ 0x0ca11b);
  const k = tier - 1;
  const locks = LOCKS[k];
  const start = 0.12 + rnd() * 0.76;
  const targets: number[] = [];
  const driftPh: number[] = [];
  let prev = start;
  for (let i = 0; i < locks; i++) {
    // Every target sits a real search away from where the dial currently is.
    let x = 0.1 + rnd() * 0.8;
    for (let tries = 0; tries < 12 && Math.abs(x - prev) < 0.24; tries++) x = 0.1 + rnd() * 0.8;
    if (Math.abs(x - prev) < 0.24) x = prev < 0.5 ? prev + 0.3 : prev - 0.3;
    targets.push(x);
    driftPh.push(rnd() * Math.PI * 2);
    prev = x;
  }
  const noiseAt: number[] = [];
  if (tier === 3) {
    let at = 4 + rnd() * 3;
    while (at < SECONDS[k] - 3) {
      noiseAt.push(at);
      at += 5 + rnd() * 3.5;
    }
  }
  return {
    seconds: SECONDS[k],
    locks,
    dual: tier > 1,
    window: WINDOW[k],
    hold: HOLD[k],
    fuses: 5,
    par: tier === 1 ? 2 : 3,
    start,
    targets,
    driftAmp: DRIFT_AMP[k],
    driftW: (Math.PI * 2) / DRIFT_PERIOD[k],
    driftPh,
    noiseAt,
    noiseLen: 1,
  };
}

/** Resonance quality 0..1 for a detune `d`: 1 on the spot, about 0.72 at the window edge. */
export function quality(d: number, window: number): number {
  "worklet";
  const r = d / (window * 1.6);
  return 1 / (1 + r * r);
}

/** Deterministic 0..1 hash usable inside worklets (no allocation, no Math.random). */
export function hash01(a: number, b: number): number {
  "worklet";
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

export type CalibrateEnd = "win" | "fuses" | "timeout";

export function scoreCalibrate(cfg: CalibrateConfig, end: CalibrateEnd, locksDone: number, hold: number, overshoots: number, elapsedS: number): number {
  if (end === "win") {
    const par = cfg.par * cfg.locks;
    const speed = Math.max(0, Math.min(1, 1 - (elapsedS - par) / ((cfg.seconds - par) * 0.5)));
    return Math.max(0.5, Math.min(1, 0.6 + 0.4 * speed - 0.05 * overshoots));
  }
  const progress = Math.min(1, (locksDone + Math.max(0, Math.min(1, hold)) * 0.5) / cfg.locks);
  if (end === "fuses") return 0.3 * progress;
  return Math.max(0, 0.45 * progress - 0.03 * overshoots);
}

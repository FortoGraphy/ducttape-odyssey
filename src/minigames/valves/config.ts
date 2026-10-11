// Pure layout/difficulty generation and scoring for the pressure-valve game. No React here so the
// numbers can be reasoned about (and reused by a test) without mounting anything.
import type { MinigameTier } from "@/engine/types";

import { miniRng } from "../shared";

export interface ValvesConfig {
  n: number;
  seconds: number;
  /** Seconds of "every gauge in band" needed to finish the repair. */
  need: number;
  maxBursts: number;
  /** First-order response time of a pipe in seconds. */
  tau: number;
  base: number;
  couple: number;
  bandLo: number[];
  bandHi: number[];
  gain: number[];
  driftAmp: number[];
  driftW: number[];
  driftPh: number[];
  /** Initial valve positions and pressures. */
  v0: number[];
  p0: number[];
  /** Tier 3: timed pressure surges (parallel arrays) and one leaking pipe. */
  surgeAt: number[];
  surgePipe: number[];
  leakPipe: number;
  leakAt: number;
}

export const SECONDS: [number, number, number] = [40, 50, 60];
export const SURGE_WARN = 1.1; // telegraph before a surge hits
export const SURGE_LEN = 1.8;
export const SURGE_AMP = 0.14;
export const LEAK_DROP = 0.18;
export const DANGER = 0.86;
/** Share of the fill rate the stable meter loses while any gauge is out of band. */
export const DRAIN = 0.3;
/** After a burst the manifold is relieved for a moment: no second pipe can burst inside this window. */
export const BURST_GRACE = 1.5;

const PIPES = [3, 4, 5] as const;
const NEED = [8, 9, 10] as const;
const COUPLE = [0.1, 0.14, 0.17] as const;
const HALF_BAND = [0.11, 0.1, 0.09] as const;
const TAU = [0.65, 0.75, 0.85] as const;
const DRIFT = [
  [0.05, 0.08, 14, 20],
  [0.07, 0.1, 11, 15],
  [0.05, 0.08, 11, 16],
] as const;

export function targetAt(cfg: ValvesConfig, i: number, v: number, vl: number, vr: number, t: number): number {
  "worklet";
  return cfg.base + cfg.gain[i] * v + cfg.couple * (vl + vr) + cfg.driftAmp[i] * Math.sin(cfg.driftW[i] * t + cfg.driftPh[i]);
}

export function makeValvesConfig(tier: MinigameTier, seed: number): ValvesConfig {
  const rnd = miniRng(seed ^ 0x51f15e);
  const k = tier - 1;
  const n = PIPES[k];
  const cfg: ValvesConfig = {
    n,
    seconds: SECONDS[k],
    need: NEED[k],
    maxBursts: 3,
    tau: TAU[k],
    base: 0.05,
    couple: COUPLE[k],
    bandLo: [],
    bandHi: [],
    gain: [],
    driftAmp: [],
    driftW: [],
    driftPh: [],
    v0: [],
    p0: [],
    surgeAt: [],
    surgePipe: [],
    leakPipe: -1,
    leakAt: 0,
  };
  const [ampLo, ampHi, perLo, perHi] = DRIFT[k];
  const flip = rnd() < 0.5 ? 0 : 1;
  for (let i = 0; i < n; i++) {
    const center = 0.44 + rnd() * 0.2;
    cfg.bandLo.push(center - HALF_BAND[k]);
    cfg.bandHi.push(center + HALF_BAND[k]);
    cfg.gain.push(0.72 + rnd() * 0.18);
    cfg.driftAmp.push(ampLo + rnd() * (ampHi - ampLo));
    cfg.driftW.push((Math.PI * 2) / (perLo + rnd() * (perHi - perLo)));
    cfg.driftPh.push(rnd() * Math.PI * 2);
    // Alternate low/high starts so the opening picture is clearly "wrong" but nothing bursts at once.
    cfg.v0.push((i + flip) % 2 === 0 ? 0.12 + rnd() * 0.16 : 0.7 + rnd() * 0.16);
  }
  for (let pass = 0; pass < 10; pass++) {
    for (let i = 0; i < n; i++) {
      const tgt = targetAt(cfg, i, cfg.v0[i], i > 0 ? cfg.v0[i - 1] : 0, i < n - 1 ? cfg.v0[i + 1] : 0, 0);
      if (tgt + cfg.driftAmp[i] > 0.8) cfg.v0[i] = Math.max(0.1, cfg.v0[i] - 0.06);
    }
  }
  for (let i = 0; i < n; i++) {
    const tgt = targetAt(cfg, i, cfg.v0[i], i > 0 ? cfg.v0[i - 1] : 0, i < n - 1 ? cfg.v0[i + 1] : 0, 0);
    cfg.p0.push(Math.max(0.04, Math.min(0.8, tgt)));
  }
  if (tier === 3) {
    let at = 6 + rnd() * 3;
    while (at < cfg.seconds - 4) {
      cfg.surgeAt.push(at);
      cfg.surgePipe.push(Math.floor(rnd() * n));
      at += 6.5 + rnd() * 4;
    }
    cfg.leakPipe = Math.floor(rnd() * n);
    cfg.leakAt = 10 + rnd() * 6;
  }
  return cfg;
}

export type ValvesEnd = "win" | "burst" | "timeout";

/**
 * `meter` is the stable meter (0..1), `inBand` the share of elapsed time with every gauge in band.
 * A finished repair is always a success; speed and bursts decide how good. Anything else stays
 * below 0.5.
 */
export function scoreValves(cfg: ValvesConfig, end: ValvesEnd, meter: number, inBand: number, bursts: number, elapsedS: number): number {
  const q = Math.max(0, Math.min(1, 0.6 * meter + 0.4 * inBand));
  if (end === "win") {
    // Overhead = time spent beyond the unavoidable `need` seconds. A near-flawless run keeps it tiny.
    const overhead = elapsedS - cfg.need * 1.05;
    const speed = Math.max(0, Math.min(1, 1 - overhead / ((cfg.seconds - cfg.need) * 0.5)));
    return Math.max(0.5, Math.min(1, 0.55 + 0.45 * speed - 0.1 * bursts));
  }
  if (end === "burst") return 0.25 * q;
  return Math.max(0, 0.45 * q - 0.08 * bursts);
}

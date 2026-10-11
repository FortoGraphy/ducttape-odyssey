// Seeded step patterns for the rhythm repair. Notes are never closer than two sixteenth steps
// (one thumb has to be able to play them) and step 15 stays empty so bars can loop into step 0.
import type { MinigameTier } from "@/engine/types";

import { miniRng } from "../shared";

export interface Song {
  bpm: number;
  stepMs: number;
  bars: number;
  /** Count-in before bar 0. */
  leadMs: number;
  /** Whole run including count-in and tail. */
  totalMs: number;
  perfectMs: number;
  goodMs: number;
  /** patterns[bar][step] = 1 when the step has to be played. */
  patterns: number[][];
  /** Note times in ms relative to bar 0, ascending, with the pad each one belongs to. */
  noteTime: number[];
  notePad: number[];
}

export const STEPS = 16;
export const TAIL_MS = 600;

// order: which pattern (A = 0, B = 1 ...) each bar plays.
export const RHYTHM_TIERS = [
  { bpm: 90, order: [0, 0, 0, 0, 1, 1, 1, 1], perfectMs: 55, goodMs: 120 },
  { bpm: 110, order: [0, 0, 1, 1, 0, 0, 1, 1], perfectMs: 48, goodMs: 105 },
  { bpm: 130, order: [0, 0, 1, 1, 2, 2, 3, 3], perfectMs: 42, goodMs: 92 },
] as const;

export function songMs(tier: MinigameTier): number {
  const cfg = RHYTHM_TIERS[tier - 1];
  const stepMs = 60000 / cfg.bpm / 4;
  return (cfg.order.length + 1) * STEPS * stepMs + TAIL_MS;
}

type Rnd = () => number;

function pickSome(from: number[], count: number, rnd: Rnd): number[] {
  const pool = from.slice();
  const out: number[] = [];
  while (out.length < count && pool.length > 0) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
}

/** Quarter notes with a couple of off-beat eighths. */
function straight(rnd: Rnd): number[] {
  const steps = [0, 8];
  if (rnd() < 0.75) steps.push(4);
  if (rnd() < 0.75) steps.push(12);
  steps.push(...pickSome([2, 6, 10, 14], steps.length >= 4 ? 1 : 2, rnd));
  return steps;
}

/** Eighth-note groove with one isolated sixteenth pushed in. */
function busy(rnd: Rnd): number[] {
  const steps = [0, ...pickSome([2, 4, 6, 8, 10, 12, 14], 4, rnd)];
  const odd = [1, 3, 5, 7, 9, 11, 13].filter((s) => !steps.includes(s - 1) && !steps.includes(s + 1));
  if (odd.length > 0) steps.push(odd[Math.floor(rnd() * odd.length)]);
  return steps;
}

/** Syncopated: uneven gaps of two to four steps, so most notes land off the beat. */
function syncopated(rnd: Rnd): number[] {
  const gaps = [2, 3, 3, 3, 4];
  for (let tries = 0; tries < 40; tries++) {
    const steps = [0];
    let pos = 0;
    for (;;) {
      pos += gaps[Math.floor(rnd() * gaps.length)];
      if (pos > 14) break;
      steps.push(pos);
    }
    if (steps.length >= 5 && steps.filter((s) => s % 2 === 1).length >= 2) return steps;
  }
  return [0, 3, 6, 8, 11, 14];
}

export function buildSong(seed: number, tier: MinigameTier): Song {
  const rnd = miniRng(seed ^ 0xbea7);
  const cfg = RHYTHM_TIERS[tier - 1];
  const gen = tier === 1 ? straight : tier === 2 ? busy : syncopated;
  const kinds = Math.max(...cfg.order) + 1;
  const variants: string[] = [];
  const rows: number[][] = [];
  for (let k = 0; k < kinds; k++) {
    let steps = gen(rnd);
    // A new section should actually sound different from the ones before it.
    for (let tries = 0; tries < 8 && variants.includes(steps.slice().sort((a, b) => a - b).join(",")); tries++) steps = gen(rnd);
    variants.push(steps.slice().sort((a, b) => a - b).join(","));
    const row = new Array<number>(STEPS).fill(0);
    for (const s of steps) row[s] = 1;
    rows.push(row);
  }
  const stepMs = 60000 / cfg.bpm / 4;
  const bars = cfg.order.length;
  const patterns = cfg.order.map((k) => rows[k]);
  const noteTime: number[] = [];
  const notePad: number[] = [];
  for (let b = 0; b < bars; b++) {
    for (let s = 0; s < STEPS; s++) {
      if (!patterns[b][s]) continue;
      noteTime.push((b * STEPS + s) * stepMs);
      notePad.push(s);
    }
  }
  return { bpm: cfg.bpm, stepMs, bars, leadMs: STEPS * stepMs, totalMs: songMs(tier), perfectMs: cfg.perfectMs, goodMs: cfg.goodMs, patterns, noteTime, notePad };
}

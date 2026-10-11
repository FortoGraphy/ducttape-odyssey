import { describe, expect, it } from "vitest";

import { mulberry } from "@/engine/prng";
import type { MinigameTier } from "@/engine/types";
import {
  clicksBetween,
  computePar,
  computePower,
  generateBoard,
  HACK_SPEC,
  hackScore,
  moveBudget,
  pathProgress,
  pickIceTarget,
  rotMask,
  solveBoard,
  type HackBoard,
} from "@/minigames/hack/logic";

// Same stream as miniRng() in src/minigames/shared.tsx (which cannot be imported in Node: it pulls in
// React Native).
function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    const r = mulberry(s);
    s = r.state;
    return r.value;
  };
}

const TIERS: MinigameTier[] = [1, 2, 3];
const SEEDS = 500;
const seedOf = (k: number): number => (k * 2654435761) | 0;

function board(tier: MinigameTier, k: number): HackBoard {
  return generateBoard(tier, rng(seedOf(k)));
}

describe("hack generator", () => {
  for (const tier of TIERS) {
    it(`tier ${tier}: ${SEEDS} seeds are solvable, unsolved at the start and deterministic`, () => {
      const spec = HACK_SPEC[tier];
      let parSum = 0;
      let parMin = Infinity;
      let parMax = 0;
      let deadEnds = 0;
      let solverNodes = 0;
      for (let k = 0; k < SEEDS; k++) {
        const b = board(tier, k);
        const cells = spec.size * spec.size;
        expect(b.size).toBe(spec.size);
        expect(b.shape.length).toBe(cells);
        expect(b.rot.length).toBe(cells);
        expect(b.sinkRows.length).toBe(spec.sinks);
        expect(new Set(b.sinkRows).size).toBe(spec.sinks);

        // Deterministic: the same seed gives the same board.
        expect(board(tier, k)).toEqual(b);

        // Not solved when the player first sees it.
        const start = computePower(b, b.rot);
        expect(start.solved, `seed ${k} starts solved`).toBe(false);

        // 1) The generator's witness solves it and never turns a locked tile.
        const witness = computePower(b, b.solution);
        expect(witness.solved, `seed ${k} witness`).toBe(true);
        for (let i = 0; i < cells; i++) {
          if (b.locked[i] && b.onPath[i]) expect(clicksBetween(b.shape[i], b.rot[i], b.solution[i])).toBe(0);
        }

        // 2) Following the witness tap by tap (clockwise only, unlocked tiles only) solves it in
        //    exactly `par` taps.
        const rot = b.rot.slice();
        let taps = 0;
        for (let i = 0; i < cells; i++) {
          if (!b.onPath[i]) continue;
          const n = clicksBetween(b.shape[i], rot[i], b.solution[i]);
          if (n > 0) expect(b.locked[i], `seed ${k} needs a locked tile`).toBe(false);
          rot[i] = (rot[i] + n) % 4;
          taps += n;
        }
        expect(computePower(b, rot).solved).toBe(true);
        expect(taps).toBe(b.par);
        expect(b.par).toBe(computePar(b, b.rot));
        expect(b.par).toBeGreaterThanOrEqual(spec.minPar);
        expect(b.budget).toBe(moveBudget(b.par));
        expect(b.budget).toBeGreaterThan(b.par + 4);

        // 3) An independent search (no access to the witness) also finds a solution, and it only
        //    differs from the start on unlocked tiles.
        const found = solveBoard(b);
        expect(found, `seed ${k} solver`).not.toBeNull();
        const solved = found as number[];
        expect(computePower(b, solved).solved).toBe(true);
        for (let i = 0; i < cells; i++) if (b.locked[i]) expect(solved[i]).toBe(b.rot[i]);
        solverNodes++;

        // Tier shape.
        const locks = b.locked.filter(Boolean).length;
        expect(locks).toBe(spec.locks);
        const pipes = b.shape.filter((s) => s !== "blank").length;
        const pathLen = b.onPath.filter(Boolean).length;
        if (tier === 1) expect(pipes).toBe(pathLen);
        else deadEnds += b.shape.filter((s, i) => s === "cap" && !b.onPath[i]).length;
        expect(b.locked[b.sourceRow * b.size]).toBe(false);
        expect(pathProgress(b, b.solution)).toBe(1);
        expect(pathProgress(b, b.rot)).toBeLessThan(1);

        parSum += b.par;
        parMin = Math.min(parMin, b.par);
        parMax = Math.max(parMax, b.par);
      }
      expect(solverNodes).toBe(SEEDS);
      if (tier > 1) expect(deadEnds / SEEDS).toBeGreaterThan(1.5);
      console.log(`hack tier ${tier}: ${SEEDS}/${SEEDS} solvable, par ${parMin}..${parMax} (avg ${(parSum / SEEDS).toFixed(1)})` + (tier > 1 ? `, dead ends avg ${(deadEnds / SEEDS).toFixed(1)}` : ""));
    });
  }

  it("tiers differ in real difficulty", () => {
    const avg = (tier: MinigameTier) => {
      let s = 0;
      for (let k = 0; k < 200; k++) s += board(tier, k).par;
      return s / 200;
    };
    const a = avg(1);
    const b = avg(2);
    const c = avg(3);
    expect(b).toBeGreaterThan(a + 2);
    expect(c).toBeGreaterThan(b + 4);
  });
});

describe("hack rules", () => {
  it("rotMask turns clockwise and wraps", () => {
    expect(rotMask(1, 1)).toBe(2);
    expect(rotMask(8, 1)).toBe(1);
    expect(rotMask(5, 1)).toBe(10);
    expect(rotMask(3, 4)).toBe(3);
    expect(rotMask(3, -1)).toBe(9);
  });

  it("an ICE scramble never breaks solvability and costs one tap to repair", () => {
    for (let k = 0; k < 200; k++) {
      const b = board(3, k);
      const rnd = rng(seedOf(k) ^ 0x1ce);
      const rot = b.solution.slice();
      for (let round = 0; round < 12; round++) {
        const i = pickIceTarget(b, rot, rnd);
        if (i < 0) break;
        expect(b.locked[i]).toBe(false);
        expect(b.onPath[i]).toBe(true);
        rot[i] = (rot[i] + 3) % 4;
        expect(clicksBetween(b.shape[i], rot[i], b.solution[i])).toBe(1);
        expect(solveBoard({ ...b, rot })).not.toBeNull();
      }
      // Repairing every scrambled tile brings the solved state back.
      for (let i = 0; i < rot.length; i++) if (b.onPath[i]) rot[i] = (rot[i] + clicksBetween(b.shape[i], rot[i], b.solution[i])) % 4;
      expect(computePower(b, rot).solved).toBe(true);
    }
  });

  it("the ICE has nothing to hit on a board where no path tile is solved", () => {
    const b = board(3, 7);
    const rot = b.rot.map((r, i) => (b.onPath[i] && !b.locked[i] && b.shape[i] !== "cross" ? (b.solution[i] + 1) % 4 : r));
    const i = pickIceTarget(b, rot, rng(1));
    if (i >= 0) expect(clicksBetween(b.shape[i], rot[i], b.solution[i])).toBe(0);
  });

  it("scores: success from 0.5, perfect is rare, failures stay below 0.5", () => {
    const par = 12;
    expect(hackScore({ solved: true, moves: par, par, timeLeft: 0.7, progress: 1 })).toBeCloseTo(1, 5);
    expect(hackScore({ solved: true, moves: par, par, timeLeft: 0.4, progress: 1 })).toBeLessThan(0.95);
    expect(hackScore({ solved: true, moves: par + 3, par, timeLeft: 0.7, progress: 1 })).toBeLessThan(0.95);
    expect(hackScore({ solved: true, moves: par * 3, par, timeLeft: 0, progress: 1 })).toBeCloseTo(0.5, 5);
    expect(hackScore({ solved: true, moves: par - 2, par, timeLeft: 1, progress: 1 })).toBe(1);
    for (const progress of [0, 0.3, 0.8, 1]) {
      const s = hackScore({ solved: false, moves: 30, par, timeLeft: 0, progress });
      expect(s).toBeLessThan(0.5);
      expect(s).toBeGreaterThan(0);
    }
    // More taps never score higher; less time left never scores higher.
    let prev = 2;
    for (let moves = par; moves < par * 3; moves++) {
      const s = hackScore({ solved: true, moves, par, timeLeft: 0.5, progress: 1 });
      expect(s).toBeLessThanOrEqual(prev);
      prev = s;
    }
  });
});

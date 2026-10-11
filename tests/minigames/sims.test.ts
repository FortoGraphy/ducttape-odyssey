// Headless runs of the defense and dock simulations (the same worklet code the UI thread executes).
// They prove that every seed can be won, that doing nothing loses, and that scores land where the
// contract wants them (>= 0.5 success, < 0.5 failure).
import { describe, expect, it } from "vitest";

import { mulberry } from "@/engine/prng";
import type { MinigameTier } from "@/engine/types";
import { DEFENSE_SECONDS, KIND_BIG, KIND_CRATE, KIND_FAST, buildDefense, createDefenseSim, defenseScore, stepDefense, tapDefense } from "@/minigames/defense/sim";
import { DOCK_SECONDS, KEY_NONE, STATE_DOCKED, STATE_FLYING, STATE_LOST, buildDock, createDockSim, dockScore, stepDock } from "@/minigames/dock/sim";

function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    const r = mulberry(s);
    s = r.state;
    return r.value;
  };
}

const TIERS: MinigameTier[] = [1, 2, 3];
const SIZES: [number, number][] = [
  [343 - 18, 380 - 58 - 36 - 18],
  [375 - 18, 620 - 58 - 36 - 18],
];
const DT = 1 / 60;
const seedOf = (k: number): number => (k * 2654435761) | 0;

function runDefense(tier: MinigameTier, seed: number, w: number, h: number, bot: number) {
  const cfg = buildDefense(tier, rng(seed), w, h, false, bot);
  const s = createDefenseSim(cfg);
  const limit = DEFENSE_SECONDS[tier - 1];
  let t = 0;
  while (s.over === 0 && t < limit) {
    stepDefense(s, cfg, DT);
    s.evN = 0;
    t += DT;
  }
  const score = defenseScore({ hull: s.hull, hullMax: cfg.hullMax, shots: s.shots, hits: s.hits, cratesShot: s.cratesShot, progress: Math.min(1, t / limit) });
  return { cfg, s, t, score, timedOut: s.over === 0 };
}

describe("defense simulation", () => {
  for (const tier of TIERS) {
    it(`tier ${tier}: a competent gunner clears every seed, an idle one loses the hull`, () => {
      let winSum = 0;
      let winMin = 1;
      let loseMax = 0;
      let endMax = 0;
      let runs = 0;
      for (const [w, h] of SIZES) {
        for (let k = 0; k < 60; k++) {
          const win = runDefense(tier, seedOf(k), w, h, 1);
          expect(win.timedOut, `seed ${k} ${w}x${h} ran out of time`).toBe(false);
          expect(win.s.over).toBe(1);
          expect(win.s.hull).toBeGreaterThan(0);
          expect(win.score).toBeGreaterThanOrEqual(0.5);
          expect(win.s.cratesShot).toBe(0);
          winSum += win.score;
          winMin = Math.min(winMin, win.score);
          endMax = Math.max(endMax, win.t);
          runs++;

          const lose = runDefense(tier, seedOf(k), w, h, 0);
          expect(lose.s.over).toBe(2);
          expect(lose.s.hull).toBe(0);
          expect(lose.score).toBeLessThan(0.5);
          loseMax = Math.max(loseMax, lose.score);
        }
      }
      // The schedule ends before the clock does.
      expect(endMax).toBeLessThan(DEFENSE_SECONDS[tier - 1] - 1);
      console.log(`defense tier ${tier}: bot avg ${(winSum / runs).toFixed(3)} min ${winMin.toFixed(3)}, idle max ${loseMax.toFixed(3)}, longest clear ${endMax.toFixed(1)} s of ${DEFENSE_SECONDS[tier - 1]} s`);
    });
  }

  it("tiers add what the design says", () => {
    const count = (tier: MinigameTier, kind: number) => {
      let n = 0;
      for (let k = 0; k < 40; k++) n += buildDefense(tier, rng(seedOf(k)), 325, 268, false, 0).spawns.filter((sp) => sp.kind === kind).length;
      return n / 40;
    };
    expect(count(1, KIND_FAST)).toBe(0);
    expect(count(1, KIND_CRATE)).toBe(0);
    expect(count(1, KIND_BIG)).toBeGreaterThan(1);
    expect(count(2, KIND_FAST)).toBeGreaterThan(5);
    expect(count(2, KIND_CRATE)).toBeGreaterThan(3);
    expect(count(3, KIND_CRATE)).toBe(5);
    const t3 = buildDefense(3, rng(1), 325, 268, false, 0);
    expect(t3.waves.length).toBe(5);
    expect(t3.chargeMax).toBe(5);
    expect(t3.spawns.some((sp) => sp.amp !== 0)).toBe(true);
    expect(buildDefense(2, rng(1), 325, 268, false, 0).chargeMax).toBe(0);
    // Same seed, same run.
    expect(buildDefense(2, rng(9), 325, 268, false, 0)).toEqual(buildDefense(2, rng(9), 325, 268, false, 0));
  });

  it("a boulder splits, a crate is a mistake, an empty laser does not fire", () => {
    const cfg = buildDefense(3, rng(5), 325, 268, false, 0);
    const s = createDefenseSim(cfg);
    // Run until a boulder and a crate are on screen.
    let big = -1;
    let crate = -1;
    for (let i = 0; i < 60 * 20 && (big < 0 || crate < 0); i++) {
      stepDefense(s, cfg, DT);
      big = s.m.findIndex((m) => m.on === 1 && m.kind === KIND_BIG && m.y > 20);
      crate = s.m.findIndex((m) => m.on === 1 && m.kind === KIND_CRATE && m.y > 20);
    }
    expect(big).toBeGreaterThanOrEqual(0);
    expect(crate).toBeGreaterThanOrEqual(0);
    s.charge = cfg.chargeMax;
    const before = s.m.filter((m) => m.on === 1).length;
    tapDefense(s, cfg, s.m[big].x, s.m[big].y);
    expect(s.m[big].on).toBe(0);
    expect(s.m.filter((m) => m.on === 1).length).toBe(before + 1);
    expect(s.hits).toBe(1);
    tapDefense(s, cfg, s.m[crate].x, s.m[crate].y);
    expect(s.cratesShot).toBe(1);
    expect(s.hits).toBe(1);
    expect(s.shots).toBe(2);
    s.charge = 0.4;
    tapDefense(s, cfg, 10, 10);
    expect(s.shots).toBe(2);
  });

  it("scores", () => {
    const base = { hullMax: 6, cratesShot: 0, progress: 1 };
    expect(defenseScore({ ...base, hull: 6, shots: 20, hits: 20 })).toBe(1);
    expect(defenseScore({ ...base, hull: 6, shots: 20, hits: 17 })).toBeLessThan(0.95);
    expect(defenseScore({ ...base, hull: 6, shots: 20, hits: 18 })).toBeGreaterThanOrEqual(0.95);
    expect(defenseScore({ ...base, hull: 5, shots: 20, hits: 18 })).toBeLessThan(0.95);
    expect(defenseScore({ ...base, hull: 1, shots: 40, hits: 10 })).toBeGreaterThanOrEqual(0.5);
    expect(defenseScore({ ...base, hull: 3, shots: 20, hits: 20, cratesShot: 3 })).toBeLessThan(defenseScore({ ...base, hull: 3, shots: 20, hits: 20 }));
    expect(defenseScore({ ...base, hull: 0, shots: 20, hits: 20 })).toBeLessThan(0.5);
    expect(defenseScore({ ...base, hull: 0, shots: 0, hits: 0, progress: 0.2 })).toBeGreaterThan(0);
  });
});

function runDock(tier: MinigameTier, seed: number, w: number, h: number, bot: number) {
  const cfg = buildDock(tier, rng(seed), w, h, false, bot);
  const s = createDockSim(cfg);
  const limit = DOCK_SECONDS[tier - 1];
  let t = 0;
  while (s.state === STATE_FLYING && t < limit) {
    stepDock(s, cfg, DT, KEY_NONE);
    s.evN = 0;
    t += DT;
  }
  const docked = s.state === STATE_DOCKED;
  const score = dockScore({
    docked,
    u: s.cu,
    tolU: cfg.tolU,
    da: s.cda,
    tolA: cfg.tolA,
    speed: s.cspeed,
    vLimit: cfg.vLimit,
    used: s.used,
    timeLeft: Math.max(0, 1 - t / limit),
    bumps: s.bumps,
    progress: Math.max(0, Math.min(1, 1 - s.minGap / s.gap0)),
  });
  return { cfg, s, t, score, docked };
}

describe("dock simulation", () => {
  for (const tier of TIERS) {
    it(`tier ${tier}: the autopilot docks, full throttle crashes, drifting times out`, () => {
      let sum = 0;
      let min = 1;
      let tSum = 0;
      let tMax = 0;
      let fuelSum = 0;
      let fuelMax = 0;
      let bumps = 0;
      let runs = 0;
      let failed = 0;
      for (const [w, hFull] of SIZES) {
        // The dock layout trades the 36 pt strip for a 34 pt LCD and a 56 pt key row.
        const h = hFull - 54;
        for (let k = 0; k < 60; k++) {
          const win = runDock(tier, seedOf(k), w, h, 1);
          if (!win.docked) failed++;
          else {
            expect(win.score).toBeGreaterThanOrEqual(0.5);
            sum += win.score;
            min = Math.min(min, win.score);
            tSum += win.t;
            tMax = Math.max(tMax, win.t);
            fuelSum += win.s.used;
            fuelMax = Math.max(fuelMax, win.s.used);
            bumps += win.s.bumps;
          }
          runs++;

          const crash = runDock(tier, seedOf(k), w, h, 2);
          expect(crash.s.state, `seed ${k} full throttle`).toBe(STATE_LOST);
          expect(crash.score).toBeLessThan(0.5);

          const idle = runDock(tier, seedOf(k), w, h, 0);
          expect(idle.s.state, `seed ${k} idle`).toBe(STATE_FLYING);
          expect(idle.t).toBeGreaterThanOrEqual(DOCK_SECONDS[tier - 1] - DT);
          expect(idle.score).toBeLessThan(0.5);
        }
      }
      const ok = runs - failed;
      console.log(
        `dock tier ${tier}: autopilot ${ok}/${runs} docked, score avg ${(sum / ok).toFixed(3)} min ${min.toFixed(3)}, time avg ${(tSum / ok).toFixed(1)} s max ${tMax.toFixed(1)} s of ${DOCK_SECONDS[tier - 1]} s, fuel avg ${(fuelSum / ok).toFixed(0)} max ${fuelMax.toFixed(0)}, bumps ${bumps}`,
      );
      expect(failed).toBe(0);
    });
  }

  it("tiers add what the design says", () => {
    const t1 = buildDock(1, rng(3), 325, 218, false, 0);
    const t2 = buildDock(2, rng(3), 325, 218, false, 0);
    const t3 = buildDock(3, rng(3), 325, 218, false, 0);
    expect(t1.phiAmp).toBe(0);
    expect(t1.drift).toBe(0);
    expect(t1.debris.length).toBe(0);
    expect(t2.phiAmp).toBeGreaterThan(0);
    expect(t2.drift).not.toBe(0);
    expect(t2.fuelLimited).toBe(false);
    expect(t3.phiAmp).toBeGreaterThan(t2.phiAmp);
    expect(t3.debris.length).toBe(1);
    expect(buildDock(3, rng(3), 357, 458, false, 0).debris.length).toBe(3);
    expect(t3.fuelLimited).toBe(true);
    expect(t3.tolU).toBeLessThan(t1.tolU);
    expect(t3.vLimit).toBeLessThan(t1.vLimit);
    expect(buildDock(3, rng(9), 357, 400, false, 0)).toEqual(buildDock(3, rng(9), 357, 400, false, 0));
  });

  it("scores", () => {
    const base = { docked: true, tolU: 10, tolA: 0.2, vLimit: 20, bumps: 0, progress: 1 };
    expect(dockScore({ ...base, u: 0, da: 0, speed: 6, used: 30, timeLeft: 0.7 })).toBe(1);
    expect(dockScore({ ...base, u: 4, da: 0.05, speed: 12, used: 50, timeLeft: 0.5 })).toBeLessThan(0.95);
    expect(dockScore({ ...base, u: 9.9, da: 0.19, speed: 20, used: 100, timeLeft: 0 })).toBeCloseTo(0.5, 1);
    expect(dockScore({ ...base, u: 0, da: 0, speed: 6, used: 30, timeLeft: 0.7, bumps: 2 })).toBeCloseTo(0.84, 5);
    expect(dockScore({ ...base, docked: false, u: 0, da: 0, speed: 0, used: 0, timeLeft: 0, progress: 1 })).toBeLessThan(0.5);
    expect(dockScore({ ...base, docked: false, u: 0, da: 0, speed: 0, used: 0, timeLeft: 0, progress: 0, bumps: 3 })).toBeGreaterThan(0);
  });
});

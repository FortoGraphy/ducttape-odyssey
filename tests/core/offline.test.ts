import { describe, expect, it } from "vitest";
import * as B from "../../src/engine/big";
import { MAX_SEGMENTS, addModule, findModule, installModule, queueCraft, setKeep, syncRates } from "../../src/engine/core";
import { addBuff, addItem, applyOffline, tick } from "../../src/engine/kernel";
import type { Game, OfflineReport } from "../../src/engine/types";
import { levels, makeGame, midGame, num, system } from "./fixture";

/** Tick-by-tick reference: the same span with every producing rate scaled by `eff`. */
function simulate(g: Game, seconds: number, eff: number): void {
  addBuff(g, { stat: "allProd", mul: eff }, seconds + 10, "offline-reference");
  // salvage and bots are active-play systems the offline pass does not model
  g.state.active.nextSalvageAt = 1e12;
  const n = Math.round(seconds * 10);
  for (let i = 0; i < n; i++) tick(g, 0.1);
}

function relDiff(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(1e-9, Math.abs(b));
}

function pair(build: () => Game): [Game, Game] {
  return [build(), build()];
}

describe("offline closed form", () => {
  it("matches a tick simulation of a simple mining state within 10 %", () => {
    const [off, ref] = pair(() => {
      const g = makeGame({ seed: 5 });
      levels(g, { mining: 12, lift: 14, cargo: 6, reactor: 4 });
      return g;
    });
    const seconds = 2 * 3600;
    const report = applyOffline(off, seconds);
    expect(report.efficiency).toBeCloseTo(0.35, 9);
    expect(report.credited).toBe(seconds);
    simulate(ref, seconds, report.efficiency);

    const earned = num(off.state.credits);
    const expected = num(ref.state.credits);
    expect(expected).toBeGreaterThan(1000);
    expect(relDiff(earned, expected)).toBeLessThan(0.1);
    expect(relDiff(num(report.credits), expected)).toBeLessThan(0.1);
    for (const id of ["scrap", "ice", "silicates"]) {
      expect(relDiff(num(off.state.inv[id]), num(ref.state.inv[id]))).toBeLessThan(0.1);
      expect(relDiff(num(report.items[id]), num(ref.state.inv[id]))).toBeLessThan(0.1);
    }
    expect(off.state.t).toBeCloseTo(ref.state.t, 0);
  });

  it("is far more precise than 10 % in the plain case", () => {
    const [off, ref] = pair(() => {
      const g = makeGame({ seed: 5, sys: system(3, [{ item: "scrap", w: 2 }, { item: "ice", w: 1 }]) });
      levels(g, { mining: 30, lift: 25, cargo: 20, reactor: 6, bridge: 5 });
      return g;
    });
    const report = applyOffline(off, 3600);
    simulate(ref, 3600, report.efficiency);
    expect(report.efficiency).toBeCloseTo(0.35 * 1.01, 9); // bridge level 5: +1 %
    expect(relDiff(num(off.state.credits), num(ref.state.credits))).toBeLessThan(0.01);
    expect(relDiff(num(off.state.hopper), num(ref.state.hopper))).toBeLessThan(0.02); // lift is the bottleneck
  });

  it("handles a short absence where reserves are still filling", () => {
    const [off, ref] = pair(() => makeGame({ seed: 5 }));
    const report = applyOffline(off, 90);
    simulate(ref, 90, report.efficiency);
    expect(relDiff(num(off.state.credits), num(ref.state.credits))).toBeLessThan(0.1);
    expect(relDiff(num(off.state.inv.scrap), num(ref.state.inv.scrap))).toBeLessThan(0.1);
  });

  it("advances craft queues at the offline efficiency", () => {
    const [off, ref] = pair(() => {
      const g = makeGame({ seed: 9, sys: system(0, [{ item: "scrap", w: 3 }, { item: "ice", w: 1 }]) });
      levels(g, { mining: 20, lift: 22, cargo: 14, refinery: 3, reactor: 6 });
      queueCraft(g, "r_alloy", -1);
      return g;
    });
    const seconds = 4 * 3600;
    const report = applyOffline(off, seconds);
    simulate(ref, seconds, report.efficiency);
    expect(num(ref.state.inv.alloy)).toBeGreaterThan(10);
    expect(relDiff(num(off.state.credits), num(ref.state.credits))).toBeLessThan(0.1);
    expect(relDiff(num(off.state.inv.alloy), num(ref.state.inv.alloy))).toBeLessThan(0.1);
    expect(relDiff(off.state.stats.crafts, ref.state.stats.crafts)).toBeLessThan(0.1);
    expect(off.state.craft.refinery.queue.length).toBe(1); // the repeat job is still there
    expect(report.items.alloy.m).toBeGreaterThan(0);
  });

  it("finishes finite jobs, builds modules and counts research", () => {
    const g = makeGame({ seed: 3 });
    levels(g, { refinery: 1, fabricator: 1, lab: 4, reactor: 5 });
    for (const id of ["ice", "water", "circuit", "alloy"]) setKeep(g, id, 1);
    addItem(g, "ice", 50);
    addItem(g, "circuit", 10);
    addItem(g, "alloy", 15);
    queueCraft(g, "r_water", 7);
    queueCraft(g, "r_laser", 2);
    const report = applyOffline(g, 3600);
    expect(num(g.state.inv.water)).toBeCloseTo(7, 6);
    expect(g.state.craft.refinery.queue.length).toBe(0);
    expect(g.state.modules.length).toBe(2);
    expect(g.state.craft.fabricator.queue.length).toBe(0);
    expect(num(g.state.inv.circuit)).toBe(6);
    expect(g.state.stats.crafts).toBe(9);
    expect(g.state.stats.modulesBuilt).toBe(2);
    expect(num(report.rp)).toBeCloseTo(0.2 * 4 * 3600 * 0.35, 3);
    expect(num(g.state.rp)).toBeCloseTo(num(report.rp), 0); // plus the three settle ticks after the pass
  });

  it("wears modules at 35 % down to the 25 % floor and reports it", () => {
    const g = makeGame({ seed: 4 });
    g.state.grid.open = 9;
    levels(g, { reactor: 8 });
    const make = (item: string) => findModule(g, addModule(g, item, 1))!;
    const fresh = make("mod_laser_mk1");
    const tired = make("mod_cargo_mk1");
    const low = make("mod_shield_mk1");
    const stored = make("mod_engine_mk1");
    installModule(g, fresh.uid, 0);
    installModule(g, tired.uid, 2);
    installModule(g, low.uid, 6);
    tired.hp = 27;
    low.hp = 22; // already under the floor: left alone
    const report = applyOffline(g, 8 * 3600);
    // 5 %/h * 0.35 * 8 h = 14 %
    expect(fresh.hp).toBeCloseTo(86, 4);
    expect(tired.hp).toBe(25);
    expect(low.hp).toBe(22);
    expect(stored.hp).toBe(100);
    expect(report.wear).toEqual([
      { uid: fresh.uid, from: 100, to: fresh.hp },
      { uid: tired.uid, from: 27, to: 25 },
    ]);
    expect(report.safeMode).toBe(false);
  });

  it("recomputes rates when a module wears through the 50 % threshold", () => {
    const build = (hp: number) => {
      const g = makeGame({ seed: 4, sys: system(0, [{ item: "scrap", w: 1 }]) });
      g.state.grid.open = 9;
      levels(g, { lift: 30, reactor: 8 });
      setKeep(g, "scrap", 0);
      const uid = addModule(g, "mod_laser_mk1", 1);
      installModule(g, uid, 0);
      g.state.modules[0].hp = hp;
      g.state.modules[0].lvl = 40; // +20 % * 5 = mining x2 while healthy
      g.dirty = true;
      syncRates(g);
      return g;
    };
    const healthy = build(100);
    const worn = build(57); // crosses 50 % after 4 of 8 hours, ends at 43 %
    const a = applyOffline(healthy, 8 * 3600);
    const b = applyOffline(worn, 8 * 3600);
    expect(worn.state.modules[0].hp).toBeCloseTo(43, 4);
    const ratio = num(b.credits) / num(a.credits);
    // first half at full bonus, second half sliding from 1.0 to 0.86 of it: about 0.98 of the healthy run
    expect(ratio).toBeLessThan(0.995);
    expect(ratio).toBeGreaterThan(0.95);
    expect(b.hooks.some((h) => h.kind === "repair")).toBe(true);
    expect(a.hooks.some((h) => h.kind === "repair")).toBe(false);
  });

  it("stops filling a full hold, keeps selling and leaves a cargoFull hook", () => {
    const g = makeGame({ seed: 6 });
    for (const id of ["scrap", "ice", "silicates"]) setKeep(g, id, 1); // never sell: the hold must fill
    syncRates(g);
    const report = applyOffline(g, 4 * 3600);
    const used = num(g.state.inv.scrap) + num(g.state.inv.ice) + num(g.state.inv.silicates);
    expect(used).toBeCloseTo(400, 3);
    expect(num(g.rates.cargoUsed)).toBeLessThanOrEqual(400 + 1e-6);
    expect(report.hooks.map((h) => h.kind)).toContain("cargoFull");
    expect(report.hooks[0].text.cs.length).toBeGreaterThan(10);
    // 0.35 units/s for 4 h is 5040 units: 400 stored, the rest sold
    expect(num(report.credits)).toBeGreaterThan(4000 * 0.6);
    const [off, ref] = pair(() => {
      const h = makeGame({ seed: 6 });
      for (const id of ["scrap", "ice", "silicates"]) setKeep(h, id, 1);
      syncRates(h);
      return h;
    });
    const r2 = applyOffline(off, 3600);
    simulate(ref, 3600, r2.efficiency);
    expect(relDiff(num(off.state.credits), num(ref.state.credits))).toBeLessThan(0.1);
  });

  it("never starts a failure: hull damage during the pass parks the ship in safe mode", () => {
    const g = makeGame({ seed: 8 });
    let failures = 0;
    g.api.startFailure = () => {
      failures++;
      return true;
    };
    // another area hurting the hull from its own offline step
    g.systems = [...g.systems, { id: "test-world", offline: (game) => game.api.damageHull(500) }];
    const report: OfflineReport = applyOffline(g, 3600);
    expect(g.state.hull.hp).toBe(5);
    expect(report.safeMode).toBe(true);
    expect(report.hull).toEqual({ from: 100, to: 5 });
    expect(failures).toBe(0);
  });

  it("caps the credited time, clamps bad input and stays within the segment budget", () => {
    const g = midGame(21);
    const report = applyOffline(g, 3 * 24 * 3600);
    expect(report.seconds).toBe(3 * 24 * 3600);
    expect(report.credited).toBe(8 * 3600);
    expect(MAX_SEGMENTS).toBe(64);
    const s = g.state;
    for (const v of [s.credits, s.hopper, s.rp, g.rates.cargoUsed, ...Object.values(s.inv)]) {
      expect(Number.isFinite(v.m) && Number.isFinite(v.e)).toBe(true);
      expect(v.m).toBeGreaterThanOrEqual(0);
    }
    expect(num(g.rates.cargoUsed)).toBeLessThanOrEqual(num(g.rates.cargoCap) * 1.0001);
    expect(report.credits.m).toBeGreaterThan(0);
    expect(g.state.stats.offlineReturns).toBe(1);

    const h = makeGame();
    const before = B.clone(h.state.credits);
    for (const bad of [NaN, -500, -Infinity]) {
      const r = applyOffline(h, bad);
      expect(r.credited).toBe(0);
    }
    expect(num(h.state.credits) - num(before)).toBeLessThan(1); // only the three settle ticks ran
  });

  it("runs in closed form: a full day costs about the same as a minute", () => {
    const g = midGame(22);
    g.content.balance.offlineBaseCap = 24 * 3600;
    const t0 = performance.now();
    applyOffline(g, 24 * 3600);
    const ms = performance.now() - t0;
    g.content.balance.offlineBaseCap = 8 * 3600;
    expect(ms).toBeLessThan(250); // 864 000 ticks would take seconds
  });

  it("offline return never beats the same span played live at full efficiency", () => {
    const [off, live] = pair(() => {
      const g = makeGame({ seed: 5 });
      levels(g, { mining: 12, lift: 14, cargo: 6, reactor: 4 });
      return g;
    });
    applyOffline(off, 3600);
    live.state.active.nextSalvageAt = 1e12;
    for (let i = 0; i < 36000; i++) tick(live, 0.1);
    expect(num(off.state.credits)).toBeLessThan(num(live.state.credits) * 0.4);
  });

  it("reports the credits earned whatever the size of the balance (regression: +0 on a 3e41 balance)", () => {
    const [small, rich] = pair(() => {
      const g = makeGame({ seed: 9 });
      levels(g, { mining: 30, lift: 30, cargo: 12, reactor: 8 });
      return g;
    });
    rich.state.credits = B.big(3e41);
    const a = applyOffline(small, 6 * 3600);
    const b = applyOffline(rich, 6 * 3600);
    expect(num(a.credits)).toBeGreaterThan(0);
    expect(relDiff(num(b.credits), num(a.credits))).toBeLessThan(1e-6);
    expect(B.cmp(rich.state.credits, B.big(3e41))).toBeGreaterThanOrEqual(0);
  });
});

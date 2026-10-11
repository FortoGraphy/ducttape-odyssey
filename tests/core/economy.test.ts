import { describe, expect, it } from "vitest";
import * as B from "../../src/engine/big";
import { formatBig, reserveOf, sellItem, sellPrice, setDrones, setKeep, syncRates } from "../../src/engine/core";
import { addItem, tick } from "../../src/engine/kernel";
import { levels, makeGame, num, run, setSystem, system } from "./fixture";

describe("economy flow", () => {
  it("never softlocks: 0 credits and level-1 decks still earn", () => {
    const g = makeGame();
    expect(num(g.state.credits)).toBe(0);
    expect(g.state.decks.mining.level).toBe(1);
    expect(g.rates.power.eff).toBe(1); // emergency cells cover the start decks before the reactor exists
    expect(g.rates.income.m).toBeGreaterThan(0); // seeded analytically, sane right after load
    run(g, 5);
    expect(num(g.state.credits)).toBeGreaterThan(0);
    run(g, 60);
    expect(num(g.rates.income)).toBeGreaterThan(0.3);
    // steady state: 1 unit/s mined, lift 1.2, value mix (5*1 + 3*1.2 + 2*1.5)/10 = 1.16, fee 0.6
    run(g, 300);
    expect(num(g.rates.income)).toBeCloseTo(1 * 1.16 * 0.6, 1);
  });

  it("keeps a crawl of power when demand outruns supply", () => {
    const g = makeGame();
    levels(g, { mining: 400 });
    expect(g.rates.power.eff).toBeLessThan(0.2);
    expect(g.rates.power.eff).toBeGreaterThan(0);
    const before = num(g.state.credits);
    run(g, 10);
    expect(num(g.state.credits)).toBeGreaterThan(before);
  });

  it("lift is the bottleneck: the hopper fills to its cap and throughput equals the lift", () => {
    const g = makeGame({ sys: system(0, [{ item: "scrap", w: 1 }]) });
    levels(g, { mining: 9, lift: 2, reactor: 5 }); // mine 9/s, lift 2.4/s
    setKeep(g, "scrap", 0);
    syncRates(g);
    expect(num(g.rates.mine)).toBeCloseTo(9, 6);
    expect(num(g.rates.lift)).toBeCloseTo(2.4, 6);
    run(g, 120);
    // cap = mine * hopperSeconds; the tick ends after the lift took its share
    expect(num(g.state.hopper)).toBeGreaterThan(9 * 30 - 0.25);
    const c0 = num(g.state.credits);
    run(g, 100);
    expect((num(g.state.credits) - c0) / 100).toBeCloseTo(2.4 * 1 * 0.6, 2);
    // hopper never exceeds the cap
    expect(num(g.state.hopper)).toBeLessThanOrEqual(270 + 1e-6);
  });

  it("mining is the bottleneck when the lift is faster: the hopper stays empty", () => {
    const g = makeGame({ sys: system(0, [{ item: "scrap", w: 1 }]) });
    setKeep(g, "scrap", 0);
    run(g, 50);
    expect(num(g.state.hopper)).toBeLessThan(0.2);
    const c0 = num(g.state.credits);
    run(g, 100);
    expect((num(g.state.credits) - c0) / 100).toBeCloseTo(1 * 0.6, 2);
  });

  it("hauler drones add 10 % lift each", () => {
    const g = makeGame();
    levels(g, { hangar: 4, reactor: 3 });
    const base = num(g.rates.lift);
    expect(setDrones(g, "hauler", 2).ok).toBe(true);
    syncRates(g);
    expect(num(g.rates.lift)).toBeCloseTo(base * 1.2, 6);
    expect(setDrones(g, "probe", 1)).toEqual({ ok: false, reason: "max" }); // hangar L4 fields 2 drones
  });

  it("auto-sell keeps exactly the reserve and sells the rest", () => {
    const g = makeGame();
    run(g, 600);
    const cap = num(g.rates.cargoCap);
    expect(cap).toBe(400);
    for (const id of ["scrap", "ice", "silicates"]) {
      expect(num(g.state.inv[id])).toBeCloseTo(cap * 0.05, 4);
      expect(num(reserveOf(g, id)!)).toBeCloseTo(20, 6);
    }
    expect(num(g.rates.cargoUsed)).toBeCloseTo(60, 3);

    // raising the reserve stores more, lowering it sells the surplus at the broker price
    setKeep(g, "scrap", 0.25);
    run(g, 600);
    expect(num(g.state.inv.scrap)).toBeCloseTo(100, 3);
    const before = num(g.state.credits);
    setKeep(g, "scrap", 0);
    run(g, 2.1);
    expect(g.state.inv.scrap).toBeUndefined();
    expect(num(g.state.credits) - before).toBeGreaterThan(100 * num(sellPrice(g, "scrap")) * 0.99);
  });

  it("income never stops while reserves fill (half of the flow is sold)", () => {
    const g = makeGame({ sys: system(0, [{ item: "scrap", w: 1 }]) });
    run(g, 10);
    // 10 units lifted: half stored, half sold
    expect(num(g.state.inv.scrap)).toBeCloseTo(5, 0);
    expect(num(g.state.credits)).toBeCloseTo(5 * 0.6, 0);
  });

  it("items without mass never count toward cargo and are never sold", () => {
    const g = makeGame();
    addItem(g, "relic", 3);
    addItem(g, "mega_gate", 1);
    run(g, 5);
    expect(num(g.state.inv.relic)).toBe(3);
    expect(num(g.state.inv.mega_gate)).toBe(1);
    expect(sellItem(g, "relic", "all").ok).toBe(false);
    expect(setKeep(g, "relic", 0).ok).toBe(false);
    expect(num(g.rates.cargoUsed)).toBeLessThan(10);
  });

  it("a full hold never exceeds capacity, keeps earning and raises cargoFull once", () => {
    const g = makeGame();
    // consumables set to "never sell" clog the hold
    setKeep(g, "duct_tape", 1);
    addItem(g, "duct_tape", 395);
    run(g, 120);
    expect(num(g.rates.cargoUsed)).toBeLessThanOrEqual(400 + 1e-6);
    expect(B.ratio(g.rates.cargoUsed, g.rates.cargoCap)).toBeGreaterThan(0.98);
    expect(g.outbox.filter((e) => e.t === "cargoFull").length).toBe(1);
    const c0 = num(g.state.credits);
    run(g, 60);
    expect(num(g.state.credits)).toBeGreaterThan(c0 + 30); // the broker takes what does not fit
    expect(g.outbox.filter((e) => e.t === "cargoFull").length).toBe(1); // hysteresis: no repeat while full
    // freeing space re-arms the alarm
    expect(sellItem(g, "duct_tape", 300).ok).toBe(true);
    run(g, 3);
    addItem(g, "duct_tape", 320);
    run(g, 5);
    expect(g.outbox.filter((e) => e.t === "cargoFull").length).toBe(2);
  });

  it("manual sale pays the broker price and emits sold", () => {
    const g = makeGame();
    addItem(g, "alloy", 10);
    syncRates(g);
    g.outbox.length = 0;
    const before = num(g.state.credits);
    expect(sellItem(g, "alloy", 4).ok).toBe(true);
    expect(num(g.state.credits) - before).toBeCloseTo(4 * 5 * 0.6, 6);
    expect(num(g.state.inv.alloy)).toBe(6);
    expect(g.outbox.some((e) => e.t === "sold")).toBe(true);
    expect(sellItem(g, "alloy", 1e9).ok).toBe(true); // clamps to what is there
    expect(g.state.inv.alloy).toBeUndefined();
    expect(sellItem(g, "alloy", 1)).toEqual({ ok: false, reason: "items" });
  });

  it("richness scales sell value with depth and the system", () => {
    const g = makeGame({ sys: system(10, undefined, 1.2) });
    expect(num(g.rates.richness)).toBeCloseTo(Math.pow(1.32, 10) * 1.2, 6);
    expect(num(sellPrice(g, "scrap"))).toBeCloseTo(0.6 * Math.pow(1.32, 10) * 1.2, 6);
    // moving on recomputes the mix without anyone marking the game dirty
    setSystem(g, system(11, [{ item: "organics", w: 1 }]));
    tick(g, 0.1);
    expect(g.rates.mix).toEqual([{ item: "organics", share: 1 }]);
    expect(num(g.rates.richness)).toBeCloseTo(Math.pow(1.32, 11), 6);
  });

  it("stays finite and exact far beyond 1e300", () => {
    const g = makeGame({ sys: system(2600, [{ item: "scrap", w: 1 }]) }); // richness ~1e313
    levels(g, { mining: 1200, lift: 1200, cargo: 1200, reactor: 400 });
    setKeep(g, "scrap", 0);
    expect(g.rates.richness.e).toBeGreaterThan(300);
    run(g, 30);
    const s = g.state;
    expect(s.credits.e).toBeGreaterThan(300);
    for (const v of [s.credits, s.lifetime, s.allTime, s.hopper, g.rates.income, g.rates.mine, g.rates.cargoUsed]) {
      expect(Number.isFinite(v.m)).toBe(true);
      expect(Number.isFinite(v.e)).toBe(true);
      expect(Math.abs(v.m)).toBeLessThan(10);
    }
    // income equals throughput * price in log space
    const expected = B.log10(g.rates.mine) + B.log10(sellPrice(g, "scrap"));
    expect(B.log10(g.rates.income)).toBeCloseTo(expected, 1);
    expect(formatBig(s.credits)).not.toMatch(/NaN|Infinity|undefined/);
    expect(formatBig(s.credits, "sci")).toMatch(/^\d\.\d\de\d{3,}$/);
    expect(g.state.stats.creditsLog10).toBeGreaterThan(300);
  });

  it("greenhouse grows organics and coffee", () => {
    const g = makeGame();
    levels(g, { greenhouse: 10, reactor: 5 });
    setKeep(g, "organics", 1);
    setKeep(g, "coffee", 1);
    run(g, 100);
    // exp curve: 0.05 * 10 * 2 (milestone 10) = 1 unit/s, half of it delivered as coffee beans
    expect(num(g.state.inv.organics)).toBeCloseTo(50, 0);
    expect(num(g.state.inv.coffee)).toBeCloseTo(50, 0);
  });

  it("lab produces research points", () => {
    const g = makeGame();
    levels(g, { lab: 5, reactor: 5 });
    run(g, 50);
    expect(num(g.state.rp)).toBeCloseTo(0.2 * 5 * 50, 3);
  });

  it("a failure that blocks mining stops the flow until it clears", () => {
    const g = makeGame({ sys: system(0, [{ item: "scrap", w: 1 }]) });
    setKeep(g, "scrap", 0);
    run(g, 5);
    g.state.failure = { kind: "tumble", since: g.state.t, waitUntil: 0, tow: null };
    g.dirty = true;
    run(g, 5);
    const c0 = num(g.state.credits);
    run(g, 20);
    expect(num(g.state.credits)).toBeCloseTo(c0, 6);
    g.state.failure = null;
    g.dirty = true;
    run(g, 20);
    expect(num(g.state.credits)).toBeGreaterThan(c0 + 5);
  });
});

describe("starting hull", () => {
  it("a new game starts at balance.startHull and a resumed one keeps its hull", async () => {
    const { content } = await import("../../src/content");
    const { newGame, resumeGame } = await import("../../src/engine");
    const { deserialize, serialize } = await import("../../src/engine/core");
    const g = newGame(content, 3, 1_700_000_000_000);
    expect(g.state.hull.hp).toBe(content.balance.startHull);
    tick(g);
    g.state.hull.hp = 100;
    const back = deserialize(serialize(g.state));
    expect(back.ok && back.state ? resumeGame(content, back.state).state.hull.hp : -1).toBe(100);
  });
});

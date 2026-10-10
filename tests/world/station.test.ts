import { describe, expect, it } from "vitest";
import * as B from "../../src/engine/big";
import { addItem, getItem, getStat, tick } from "../../src/engine/kernel";
import type { FactionId, Game, SystemInfo } from "../../src/engine/types";
import {
  abandonContract,
  acceptContract,
  buy,
  buyShop,
  contractReady,
  crewCap,
  deliverContract,
  dock,
  fuelCap,
  gameHour,
  hireCrew,
  hireOffers,
  marketFactor,
  marketRows,
  openGridCells,
  refuel,
  repairAtDock,
  repairCost,
  sellAt,
  shopBlock,
  shopCost,
  shopLevel,
  shopOffers,
  stationBuyPrice,
  stationSellPrice,
  stationStock,
  undock,
} from "../../src/engine/world";
import { findSystem, makeContent, makeGame, run, teleport, type Fixture } from "./fixture";

function atStation(opts: { seed?: number; faction?: FactionId } = {}): Fixture & { sys: SystemInfo } {
  const f = makeGame({ seed: opts.seed ?? 12 });
  const sys = findSystem(f.g, (s) => s.station !== null && (opts.faction === undefined || s.station.faction === opts.faction));
  teleport(f.g, sys.depth, sys.lane);
  f.g.state.credits = B.big(1e9);
  expect(dock(f.g)).toEqual({ ok: true });
  return { ...f, sys };
}

const num = B.toNumber;

describe("docking", () => {
  it("needs a station, the feature and a ship that is not mid-jump", () => {
    const { g, calls } = makeGame({ seed: 12, features: false });
    expect(dock(g)).toEqual({ ok: false, reason: "locked" });
    g.state.features.station = 1;
    expect(dock(g)).toEqual({ ok: false, reason: "noTarget" }); // the start system has none
    expect(undock(g)).toEqual({ ok: false, reason: "noTarget" });
    const sys = findSystem(g, (s) => s.station !== null);
    teleport(g, sys.depth, sys.lane);
    g.state.nav.jump = { depth: sys.depth + 1, lane: 0, until: 1e9 };
    expect(dock(g)).toEqual({ ok: false, reason: "busy" });
    g.state.nav.jump = null;
    expect(dock(g)).toEqual({ ok: true });
    expect(g.state.station.docked).toBe(true);
    expect(calls.say.some((c) => c.trigger === "station")).toBe(true);
    expect(g.state.station.offers.length).toBe(3);
    expect(undock(g)).toEqual({ ok: true });
    expect(buy(g, "fuel", 1)).toEqual({ ok: false, reason: "locked" });
    expect(sellAt(g, "scrap", 1)).toEqual({ ok: false, reason: "locked" });
  });
});

describe("market", () => {
  it("prices are a pure function of system, item and hour, within 0.6-1.6", () => {
    const a = atStation();
    const b = atStation();
    expect(JSON.stringify(marketRows(a.g))).toBe(JSON.stringify(marketRows(b.g)));
    expect(stationStock(a.g, a.sys)).toEqual(stationStock(b.g, b.sys));
    let min = Infinity;
    let max = -Infinity;
    let moved = 0;
    for (let hour = 0; hour < 300; hour++) {
      const f = marketFactor(a.g, a.sys, "alloy", hour);
      expect(f).toBe(marketFactor(b.g, b.sys, "alloy", hour));
      expect(f).toBeGreaterThanOrEqual(0.6);
      expect(f).toBeLessThanOrEqual(1.6);
      if (f !== marketFactor(a.g, a.sys, "alloy", hour + 1)) moved++;
      min = Math.min(min, f);
      max = Math.max(max, f);
    }
    expect(min).toBeLessThan(0.7);
    expect(max).toBeGreaterThan(1.5);
    expect(moved).toBeGreaterThan(290);
    // another station, another price list
    const other = findSystem(a.g, (s) => s.station !== null && s.id !== a.sys.id);
    let same = 0;
    for (let hour = 0; hour < 50; hour++) if (marketFactor(a.g, other, "alloy", hour) === marketFactor(a.g, a.sys, "alloy", hour)) same++;
    expect(same).toBeLessThan(3);
    // the price on the board changes when the game hour does
    const before = num(stationSellPrice(a.g, "alloy"));
    expect(gameHour(a.g)).toBe(0);
    a.g.state.t = 3600 * 5 + 1;
    expect(gameHour(a.g)).toBe(5);
    expect(num(stationSellPrice(a.g, "alloy"))).not.toBe(before);
    // a single unit barely moves the price
    expect(num(stationSellPrice(a.g, "alloy"))).toBeCloseTo(10 * marketFactor(a.g, a.sys, "alloy", 5) * 0.8, 3);
  });

  it("factions pay 15 % more for what they like", () => {
    const { g, sys } = atStation({ faction: "rustborn" }); // likes raw
    const plain = makeContent();
    plain.factions.rustborn.likes = [];
    const other = makeGame({ seed: 12, content: plain }).g;
    for (let hour = 0; hour < 40; hour++) {
      const liked = marketFactor(g, sys, "scrap", hour);
      const base = marketFactor(other, sys, "scrap", hour);
      expect(liked).toBeCloseTo(Math.min(1.6, base * 1.15), 9);
      expect(marketFactor(g, sys, "alloy", hour)).toBe(marketFactor(other, sys, "alloy", hour));
    }
  });

  it("always stocks fuel and coffee, and never sells cheaper than any way of selling", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { g, sys } = atStation({ seed });
      const stock = stationStock(g, sys);
      expect(stock).toEqual(expect.arrayContaining(["fuel", "fuel_cell", "coffee"]));
      expect(stock).not.toContain("mod_laser_mk1");
      expect(new Set(stock).size).toBe(stock.length);
      const st = sys.station;
      if (!st) throw new Error("no station");
      for (const rep of [-100, 0, 100]) {
        g.state.station.rep[st.faction] = rep;
        for (let hour = 0; hour < 60; hour++) {
          g.state.t = hour * 3600 + 5;
          for (const row of marketRows(g)) {
            if (!row.stocked) continue;
            const value = g.content.items[row.item].value;
            expect(num(row.buy)).toBeGreaterThan(num(row.sell));
            // the broker pays 0.6 x value at richness 1
            expect(num(row.buy)).toBeGreaterThan(value * 0.6);
          }
        }
      }
    }
  });

  it("buys: needs stock, credits and room; counts the trade", () => {
    const { g, sys } = atStation();
    expect(buy(g, "mod_laser_mk1", 1)).toEqual({ ok: false, reason: "invalid" });
    expect(buy(g, "nope", 1)).toEqual({ ok: false, reason: "invalid" });
    for (const n of [0, -3, NaN, Infinity]) expect(buy(g, "fuel", n)).toEqual({ ok: false, reason: "invalid" });
    const missing = Object.keys(g.content.items).find((id) => g.content.items[id].category === "refined" && !stationStock(g, sys).includes(id));
    if (missing) expect(buy(g, missing, 1)).toEqual({ ok: false, reason: "noTarget" });

    const price = num(stationBuyPrice(g, "fuel", 10));
    expect(buy(g, "fuel", 10)).toEqual({ ok: true });
    expect(num(getItem(g, "fuel"))).toBe(10);
    expect(num(g.state.credits)).toBeCloseTo(1e9 - price * 10, 2);
    expect(getStat(g, "trades")).toBe(1);

    g.state.credits = B.big(1);
    expect(buy(g, "fuel", 10)).toEqual({ ok: false, reason: "credits" });
    g.state.credits = B.big(1e12);
    g.rates.cargoUsed = B.big(99995);
    expect(buy(g, "fuel", 10)).toEqual({ ok: false, reason: "cargo" });
    expect(buy(g, "fuel", 5)).toEqual({ ok: true });
    expect(buy(g, "fuel", B.big(2))).toEqual({ ok: false, reason: "cargo" });
  });

  it("sells: needs the goods; big trades move the price against the player", () => {
    const { g } = atStation();
    expect(sellAt(g, "alloy", 5)).toEqual({ ok: false, reason: "items" });
    expect(sellAt(g, "mod_laser_mk1", 1)).toEqual({ ok: false, reason: "invalid" });
    addItem(g, "alloy", 100000);
    const unit = num(stationSellPrice(g, "alloy", 1));
    const bulk = num(stationSellPrice(g, "alloy", 25000));
    expect(bulk).toBeLessThan(unit);
    const credits = num(g.state.credits);
    expect(sellAt(g, "alloy", 25000)).toEqual({ ok: true });
    expect(num(g.state.credits) - credits).toBeCloseTo(bulk * 25000, 0);
    expect(num(stationSellPrice(g, "alloy", 1))).toBeLessThan(unit * 0.75);
    expect(g.outbox.some((e) => e.t === "sold")).toBe(true);
    // the market recovers while docked, and forgets entirely after leaving
    run(g, 600);
    expect(num(stationSellPrice(g, "alloy", 1))).toBeGreaterThan(unit * 0.85);

    const b = atStation().g;
    const one = num(stationBuyPrice(b, "fuel", 1));
    expect(num(stationBuyPrice(b, "fuel", 20000))).toBeGreaterThan(one * 1.1);
    buy(b, "fuel", 20000);
    expect(num(stationBuyPrice(b, "fuel", 1))).toBeGreaterThan(one * 1.2);
    // selling does not make buying cheaper
    const c = atStation().g;
    addItem(c, "fuel", 50000);
    sellAt(c, "fuel", 50000);
    expect(num(stationBuyPrice(c, "fuel", 1))).toBeCloseTo(one, 9);
  });

  it("a round trip always loses money, and reputation tilts both prices", () => {
    const { g, sys } = atStation();
    const start = num(g.state.credits);
    for (let i = 0; i < 20; i++) {
      expect(buy(g, "coffee", 500)).toEqual({ ok: true });
      expect(sellAt(g, "coffee", 500)).toEqual({ ok: true });
    }
    expect(num(g.state.credits)).toBeLessThan(start);

    const st = sys.station;
    if (!st) throw new Error("no station");
    g.state.station.trades = {};
    g.state.station.rep[st.faction] = -100;
    const hostileBuy = num(stationBuyPrice(g, "fuel"));
    const hostileSell = num(stationSellPrice(g, "fuel"));
    g.state.station.rep[st.faction] = 100;
    expect(num(stationBuyPrice(g, "fuel"))).toBeLessThan(hostileBuy);
    expect(num(stationSellPrice(g, "fuel"))).toBeGreaterThan(hostileSell);
  });
});

describe("contracts", () => {
  it("offers a seeded daily board, the first from the station's own faction", () => {
    const a = atStation();
    const b = atStation();
    const strip = (g: Game) => g.state.station.offers.map((c) => ({ ...c, uid: 0 }));
    expect(strip(a.g)).toEqual(strip(b.g));
    expect(a.g.state.station.offers.length).toBe(3);
    expect(a.g.state.station.offers[0].faction).toBe(a.sys.station?.faction);
    for (const c of a.g.state.station.offers) {
      expect(a.g.content.items[c.item]).toBeDefined();
      expect(num(c.need)).toBeGreaterThanOrEqual(20);
      expect(num(c.have)).toBe(0);
      expect(num(c.reward)).toBeGreaterThan(num(c.need) * a.g.content.items[c.item].value * 1.5);
      expect(c.rep).toBeGreaterThanOrEqual(2);
      expect(c.expires).toBeGreaterThan(a.g.state.t + 86000);
      expect(c.sys).toBe(a.sys.id);
    }
    // same day, same board; next day, a new one
    const first = JSON.stringify(a.g.state.station.offers);
    undock(a.g);
    dock(a.g);
    expect(JSON.stringify(a.g.state.station.offers)).toBe(first);
    undock(a.g);
    a.g.state.t += 86400;
    dock(a.g);
    expect(JSON.stringify(a.g.state.station.offers)).not.toBe(first);
  });

  it("accept, deliver in parts, get paid in credits and reputation", () => {
    const { g } = atStation();
    const offer = g.state.station.offers[1];
    expect(acceptContract(g, 9)).toEqual({ ok: false, reason: "invalid" });
    expect(acceptContract(g, 1)).toEqual({ ok: true });
    expect(g.state.station.offers.length).toBe(2);
    expect(g.state.station.contracts).toEqual([offer]);
    expect(contractReady(g, offer)).toBe(false);
    expect(deliverContract(g, offer.uid)).toEqual({ ok: false, reason: "items" });
    expect(deliverContract(g, 12345)).toEqual({ ok: false, reason: "noTarget" });

    const need = num(offer.need);
    addItem(g, offer.item, need * 0.4);
    expect(deliverContract(g, offer.uid)).toEqual({ ok: true });
    expect(num(offer.have)).toBeCloseTo(need * 0.4, 6);
    expect(getItem(g, offer.item).m).toBe(0);
    expect(g.state.station.contracts.length).toBe(1);

    addItem(g, offer.item, need);
    expect(contractReady(g, offer)).toBe(true);
    const credits = num(g.state.credits);
    const rep = g.state.station.rep[offer.faction];
    expect(deliverContract(g, offer.uid)).toEqual({ ok: true });
    expect(g.state.station.contracts.length).toBe(0);
    expect(num(getItem(g, offer.item))).toBeCloseTo(need * 0.4, 6); // only what was owed is taken
    expect(num(g.state.credits) - credits).toBeCloseTo(num(offer.reward), 0);
    expect(g.state.station.rep[offer.faction]).toBe(rep + offer.rep);
    expect(getStat(g, "contracts")).toBe(1);
    expect(g.outbox.some((e) => e.t === "contractDone" && e.uid === offer.uid)).toBe(true);
  });

  it("caps active contracts, lets them lapse and be abandoned", () => {
    const { g } = atStation();
    for (let day = 0; day < 3; day++) {
      while (g.state.station.offers.length > 0 && g.state.station.contracts.length < 5) expect(acceptContract(g, 0)).toEqual({ ok: true });
      undock(g);
      g.state.t += 3600 * 20;
      // a new board needs a new day
      g.state.station.offersDay = -1;
      dock(g);
    }
    expect(g.state.station.contracts.length).toBe(5);
    expect(acceptContract(g, 0)).toEqual({ ok: false, reason: "max" });
    const uid = g.state.station.contracts[0].uid;
    expect(abandonContract(g, uid)).toEqual({ ok: true });
    expect(abandonContract(g, uid)).toEqual({ ok: false, reason: "noTarget" });
    expect(g.state.station.contracts.length).toBe(4);
    run(g, 5);
    g.state.t += 86400 * 3;
    run(g, 2);
    expect(g.state.station.contracts.length).toBe(0);
    // delivery only at a station
    undock(g);
    expect(deliverContract(g, 1)).toEqual({ ok: false, reason: "locked" });
  });
});

describe("upgrade shop", () => {
  it("costs income-seconds with a floor and growth, and stacks effects per level", () => {
    const { g } = atStation();
    const drill = g.content.shop.sh_drill;
    expect(num(shopCost(g, drill))).toBe(6000); // 60 s of 100/s beats the floor of 100
    g.rates.income = B.big(1);
    expect(num(shopCost(g, drill))).toBe(100);
    g.rates.income = B.big(100);
    expect(buyShop(g, "sh_drill")).toEqual({ ok: true });
    expect(num(g.state.credits)).toBeCloseTo(1e9 - 6000, 2);
    expect(shopLevel(g, "sh_drill")).toBe(1);
    expect(num(shopCost(g, drill))).toBe(12000);
    tick(g, 0.1);
    expect(g.mods.mineRate).toBeCloseTo(1.1, 9);
    buyShop(g, "sh_drill");
    buyShop(g, "sh_drill");
    tick(g, 0.1);
    expect(g.mods.mineRate).toBeCloseTo(1.3, 9);
    expect(buyShop(g, "sh_drill")).toEqual({ ok: false, reason: "max" });
    expect(shopBlock(g, drill)).toBe("max");
    expect(getStat(g, "purchases")).toBe(3);
    expect(buyShop(g, "nope")).toEqual({ ok: false, reason: "invalid" });
    g.state.credits = B.big(0);
    expect(buyShop(g, "sh_cells")).toEqual({ ok: false, reason: "credits" });
    undock(g);
    expect(buyShop(g, "sh_cells")).toEqual({ ok: false, reason: "locked" });
    expect(shopOffers(g)).toEqual([]);
  });

  it("supply crates are repeatable and the fuel tank grows the tank", () => {
    const { g } = atStation();
    for (let i = 0; i < 5; i++) expect(buyShop(g, "sh_cells")).toEqual({ ok: true });
    expect(num(getItem(g, "fuel_cell"))).toBe(10);
    expect(shopLevel(g, "sh_cells")).toBe(5);

    expect(fuelCap(g)).toBe(30);
    expect(buyShop(g, "fuel_tank")).toEqual({ ok: true });
    expect(buyShop(g, "fuel_tank")).toEqual({ ok: true });
    expect(fuelCap(g)).toBe(50);
    g.state.nav.fuel = 30;
    expect(refuel(g)).toEqual({ ok: true });
    expect(g.state.nav.fuel).toBe(50);
  });

  it("faction stock needs the right station and enough reputation", () => {
    const { g, sys } = atStation({ faction: "ledger" });
    expect(sys.station?.faction).toBe("ledger");
    expect(shopOffers(g).map((d) => d.id)).toContain("sh_vip");
    expect(buyShop(g, "sh_vip")).toEqual({ ok: false, reason: "requirement" });
    g.state.station.rep.ledger = 20;
    expect(buyShop(g, "sh_vip")).toEqual({ ok: true });
    tick(g, 0.1);
    expect(g.mods.repGain).toBeCloseTo(1.5, 9);

    const other = atStation({ faction: "rustborn" });
    other.g.state.station.rep.ledger = 100;
    expect(shopOffers(other.g).map((d) => d.id)).not.toContain("sh_vip");
    expect(buyShop(other.g, "sh_vip")).toEqual({ ok: false, reason: "requirement" });
  });

  it("grid slots open cells and grow the grid to 6x6 without moving installed modules", () => {
    const { g } = atStation();
    const grid = g.state.grid;
    expect([grid.w, grid.h, grid.open, grid.cells.length]).toEqual([3, 3, 4, 9]);
    // a module sits in cell 2
    const uid = g.api.addModule("mod_laser_mk1");
    g.state.modules[0].slot = 2;
    grid.cells[2] = uid;

    for (let i = 0; i < 5; i++) expect(buyShop(g, "sh_grid")).toEqual({ ok: true });
    expect([grid.w, grid.h, grid.open, grid.cells.length]).toEqual([3, 3, 9, 9]);
    expect(buyShop(g, "sh_grid")).toEqual({ ok: true });
    // the hull frame was full: a row is appended, indices stay put
    expect([grid.w, grid.h, grid.open, grid.cells.length]).toEqual([3, 4, 10, 12]);
    expect(grid.cells[2]).toBe(uid);
    expect(g.state.modules[0].slot).toBe(2);

    expect(openGridCells(g, 8)).toBe(8);
    expect([grid.w, grid.h, grid.open, grid.cells.length]).toEqual([3, 6, 18, 18]);
    expect(openGridCells(g, 1)).toBe(1);
    expect([grid.w, grid.h, grid.open, grid.cells.length]).toEqual([6, 4, 19, 24]);
    expect(grid.cells[2]).toBe(uid);
    expect(openGridCells(g, 100)).toBe(17);
    expect([grid.w, grid.h, grid.open, grid.cells.length]).toEqual([6, 6, 36, 36]);
    expect(grid.cells.filter((c) => c !== 0)).toEqual([uid]);
    expect(openGridCells(g, 1)).toBe(0);
    expect(buyShop(g, "sh_grid")).toEqual({ ok: false, reason: "max" });
    for (const n of [NaN, -5, 0]) expect(openGridCells(g, n)).toBe(0);
  });
});

describe("repair dock and hiring", () => {
  it("repairs everything for a price that follows the damage", () => {
    const { g, calls } = atStation();
    expect(repairCost(g).m).toBe(0);
    expect(repairAtDock(g)).toEqual({ ok: false, reason: "max" });
    g.state.hull.hp = 50;
    const half = num(repairCost(g));
    expect(half).toBeCloseTo((30 + 270 * 0.5) * 100, 6);
    g.state.hull.hp = 10;
    expect(num(repairCost(g))).toBeGreaterThan(half);
    g.state.credits = B.big(10);
    expect(repairAtDock(g)).toEqual({ ok: false, reason: "credits" });
    g.state.credits = B.big(1e9);
    expect(repairAtDock(g)).toEqual({ ok: true });
    expect(calls.repairAll).toEqual([100]);
    expect(g.state.hull.hp).toBe(100);
    undock(g);
    expect(repairAtDock(g)).toEqual({ ok: false, reason: "locked" });
  });

  it("offers seeded crew for hire once each, up to the bunk count", () => {
    const { g } = atStation();
    const offers = hireOffers(g);
    expect(offers.length).toBeGreaterThanOrEqual(2);
    expect(offers.length).toBeLessThanOrEqual(3);
    expect(JSON.stringify(hireOffers(atStation().g))).toBe(JSON.stringify(offers));
    expect(num(offers[0].cost)).toBe(60000); // 600 s of income for the first hire
    expect(hireCrew(g, 7)).toEqual({ ok: false, reason: "invalid" });
    g.state.credits = B.big(5);
    expect(hireCrew(g, 0)).toEqual({ ok: false, reason: "credits" });
    g.state.credits = B.big(1e9);
    expect(hireCrew(g, 0)).toEqual({ ok: true });
    expect(g.state.crew.length).toBe(1);
    expect(g.state.crew[0].name).toBe(offers[0].person.name);
    expect(g.state.crew[0].traits).toEqual(offers[0].person.traits);
    expect(num(g.state.credits)).toBeCloseTo(1e9 - 60000, 2);
    expect(hireOffers(g)[0].hired).toBe(true);
    expect(hireCrew(g, 0)).toEqual({ ok: false, reason: "noTarget" });
    expect(num(hireOffers(g)[1].cost)).toBe(90000); // dearer with every head aboard
    expect(hireCrew(g, 1)).toEqual({ ok: true });
    expect(crewCap(g)).toBe(3);
    g.state.crew.push({ ...g.state.crew[0], uid: 999 });
    if (offers.length > 2) expect(hireCrew(g, 2)).toEqual({ ok: false, reason: "max" });
    undock(g);
    expect(hireOffers(g)).toEqual([]);
    expect(hireCrew(g, 0)).toEqual({ ok: false, reason: "locked" });
  });
});

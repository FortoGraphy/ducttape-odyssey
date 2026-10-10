// The generator, the station and the roster against the shipped economy content (the other tests
// use the small fixture).
import { describe, expect, it } from "vitest";
import * as eco from "@/content/economy";
import * as B from "../../src/engine/big";
import { getItem, tick } from "../../src/engine/kernel";
import type { FailureKind } from "../../src/engine/types";
import * as W from "../../src/engine/world";
import { FAILURE_KINDS, findNonFinite, findSystem, STARTER_RAWS, teleport } from "./fixture";
import { realContent as content, realGame as game } from "./real";

describe("real economy content", () => {
  it("every generated id exists: resources, biomes, specials, factions (galaxies 0-2)", () => {
    const bad: string[] = [];
    const seen = { raws: new Set<string>(), biomes: new Set<string>(), specials: new Set<string>() };
    let systems = 0;
    for (let seed = 1; seed <= 8; seed++) {
      for (let g = 0; g <= 2; g++) {
        const core = W.galaxyDepth(content, g);
        expect(core).toBe(40 + 6 * g);
        for (let d = 0; d <= core; d++) {
          for (let lane = 0; lane < W.lanesAt(seed, g, d, core); lane++) {
            const sys = W.getSystem(content, seed, g, d, lane);
            systems++;
            const where = `${seed}/${sys.id}`;
            if (sys.planets.length < 3 || sys.resources.length < 3) bad.push(where + " too small");
            for (const r of sys.resources) {
              seen.raws.add(r.item);
              if (eco.items[r.item]?.category !== "raw") bad.push(where + " mix " + r.item);
              if (d <= 2 && !STARTER_RAWS.includes(r.item)) bad.push(where + " early " + r.item);
            }
            if (sys.station && !eco.factions[sys.station.faction]) bad.push(where + " faction " + sys.station.faction);
            for (const p of sys.planets) {
              seen.biomes.add(p.biome);
              if (!eco.biomes[p.biome]) bad.push(where + " biome " + p.biome);
              if (p.resources.length < 2) bad.push(where + " planet resources");
              for (const r of p.resources) {
                if (eco.items[r]?.category !== "raw") bad.push(where + " planet " + r);
                if (!eco.biomes[p.biome]?.resources.includes(r) && !STARTER_RAWS.includes(r) && W.rawUnlockDepth(content, r) > d) bad.push(where + " locked " + r);
                if (d <= 2 && !STARTER_RAWS.includes(r)) bad.push(where + " early planet " + r);
              }
              if (p.special !== null) {
                seen.specials.add(p.special);
                if (!eco.items[p.special]) bad.push(where + " special " + p.special);
                if (!eco.biomes[p.biome]?.special?.includes(p.special)) bad.push(where + " special not in pool " + p.special);
                if (d <= 2 && !STARTER_RAWS.includes(p.special)) bad.push(where + " early special " + p.special);
              }
              const v = W.planetDescription(content, p);
              if (!(v >= 0 && v < eco.biomes[p.biome].desc.length)) bad.push(where + " desc " + v);
            }
          }
        }
      }
    }
    expect(bad).toEqual([]);
    expect(systems).toBeGreaterThan(4000);
    // the whole catalogue gets used: all 16 raws, every biome, several specials
    expect(seen.raws.size).toBe(16);
    expect(seen.biomes.size).toBe(Object.keys(eco.biomes).length);
    expect(seen.specials.size).toBeGreaterThanOrEqual(6);
  });

  it("the start system offers all six starter raws and rarity gates the rest", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const start = W.getSystem(content, seed, 0, 0, 0);
      expect(start.resources.map((r) => r.item).sort()).toEqual([...STARTER_RAWS].sort());
    }
    const depth = (id: string): number => W.rawUnlockDepth(content, id);
    for (const id of STARTER_RAWS) expect(depth(id)).toBe(0);
    expect([depth("brine"), depth("ferrite")]).toEqual([3, 4]);
    expect([depth("sulfur"), depth("organics"), depth("helium3")]).toEqual([4, 6, 8]);
    expect([depth("lumite"), depth("xenon"), depth("voidglass")]).toEqual([10, 13, 16]);
    expect([depth("strange_dust"), depth("antimatter")]).toEqual([20, 25]);
  });

  it("pours the real fuel items and honours the fuel tank upgrade", () => {
    const { g } = game();
    expect(W.fuelItems(g)).toEqual([
      { id: "fuel", fuel: 1 },
      { id: "fuel_cell", fuel: 8 },
      { id: "fuel_drum", fuel: 30 },
    ]);
    expect(W.fuelCap(g)).toBe(30);
    g.state.station.shop.fuel_tank = 3;
    expect(W.fuelCap(g)).toBe(60);
  });

  it("every real failure can be started and towed out of with empty pockets", () => {
    for (const kind of FAILURE_KINDS) {
      const { g } = game();
      g.state.credits = B.big(0);
      expect(W.startFailure(g, kind as FailureKind)).toBe(true);
      const def = W.failureDef(g);
      expect(def?.exits.some((e) => e.kind === "tow")).toBe(true);
      tick(g, 0.1);
      const q = W.towQuote(g);
      expect(q?.seconds).toBeGreaterThanOrEqual(180);
      expect(q?.seconds).toBeLessThanOrEqual(10800);
      expect(W.callTow(g)).toEqual({ ok: true });
      const eta = (g.state.failure?.tow?.eta ?? 0) - g.state.t;
      g.state.t += eta;
      tick(g, 0.1);
      expect(g.state.failure).toBeNull();
      expect(findNonFinite(g.state)).toEqual([]);
    }
  });

  it("the beacon and the tow contract shorten the tow", () => {
    const { g } = game();
    W.startFailure(g, "engine");
    const base = W.towQuote(g)?.seconds ?? 0;
    g.state.inv.beacon = B.big(1);
    expect(W.towQuote(g)?.seconds).toBeCloseTo(Math.max(180, base * 0.5), 6);
    g.state.inv = {};
    g.state.station.shop.tow_contract = 2;
    g.dirty = true;
    tick(g, 0.1);
    expect(W.towQuote(g)?.seconds).toBeCloseTo(Math.max(180, base * 0.81), 6);
  });

  it("the real shop: crates repeat, grid slots grow the grid to 36, faction stock stays with its faction", () => {
    const { g } = game();
    const lamp = findSystem(g, (s) => s.station?.faction === "lamplighters");
    teleport(g, lamp.depth, lamp.lane);
    expect(W.dock(g)).toEqual({ ok: true });
    const ids = W.shopOffers(g).map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining(["grid_slot_a", "fuel_tank", "coffee_crate", "fuel_delivery", "broker_license"]));
    expect(ids).not.toContain("tape_bundle");
    expect(W.buyShop(g, "tape_bundle")).toEqual({ ok: false, reason: "requirement" });

    for (let i = 0; i < 3; i++) expect(W.buyShop(g, "coffee_crate")).toEqual({ ok: true });
    expect(B.toNumber(getItem(g, "coffee"))).toBe(180);
    expect(W.buyShop(g, "fuel_delivery")).toEqual({ ok: true });
    expect(B.toNumber(getItem(g, "fuel_cell"))).toBe(3);
    expect(W.buyShop(g, "fuel_tank")).toEqual({ ok: true });
    expect(W.fuelCap(g)).toBe(40);

    let bought = 0;
    for (const id of ["grid_slot_a", "grid_slot_b", "grid_slot_c"]) {
      while (W.buyShop(g, id).ok) bought++;
      expect(W.shopLevel(g, id)).toBe(eco.shop[id].maxLevel);
    }
    expect(bought).toBe(22);
    const grid = g.state.grid;
    expect([grid.w, grid.h, grid.open, grid.cells.length]).toEqual([6, 6, 36, 36]);

    expect(W.buyShop(g, "broker_license")).toEqual({ ok: true });
    tick(g, 0.1);
    expect(g.mods.sellValue).toBeCloseTo(1.05, 9);
  });

  it("the real market never undercuts the broker and stocks fuel", () => {
    const { g } = game(9);
    const sys = findSystem(g, (s) => s.station !== null && s.depth >= 6);
    teleport(g, sys.depth, sys.lane);
    W.dock(g);
    const stock = W.stationStock(g, sys);
    expect(stock).toEqual(expect.arrayContaining(["fuel", "fuel_cell", "fuel_drum", "coffee"]));
    for (const id of stock) {
      expect(eco.items[id]).toBeDefined();
      expect(["module", "mega", "special"]).not.toContain(eco.items[id].category);
    }
    const st = sys.station;
    if (!st) throw new Error("no station");
    for (const rep of [-100, 100]) {
      g.state.station.rep[st.faction] = rep;
      for (let hour = 0; hour < 48; hour++) {
        g.state.t = hour * 3600 + 1;
        for (const row of W.marketRows(g)) {
          if (!row.stocked) continue;
          expect(B.toNumber(row.buy)).toBeGreaterThan(B.toNumber(row.sell));
          expect(B.toNumber(row.buy)).toBeGreaterThan(eco.items[row.item].value * eco.balance.brokerFee);
        }
      }
    }
    expect(W.buy(g, "fuel_cell", 2)).toEqual({ ok: true });
    expect(W.refuel(g)).toEqual({ ok: false, reason: "max" });
  });

  it("real crew, traits and cards plug in", () => {
    const { g } = game();
    g.state.decks.quarters.level = 10;
    g.dirty = true;
    tick(g, 0.1);
    const uid = W.addCrew(g);
    const member = W.findCrew(g, uid);
    expect(member?.traits.length).toBe(2);
    for (const t of member?.traits ?? []) expect(eco.traits[t]).toBeDefined();
    expect(eco.traits[member?.traits[0] ?? ""].good).toBe(true);
    expect(member?.name).toMatch(/^\S+ \S+$/);
    g.state.decks.mining.level = Math.max(1, g.state.decks.mining.level);
    expect(W.assignCrew(g, uid, "mining")).toEqual({ ok: true });
    tick(g, 0.1);
    expect(g.deckMult.mining).toBeGreaterThan(1.2);

    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const id = W.grantCard(g);
      if (id) seen.add(id);
    }
    expect(seen.size).toBeGreaterThan(30);
    for (const id of seen) expect(eco.cards[id]).toBeDefined();
    const mine = [...seen].find((id) => eco.cards[id].deck === "mining");
    if (!mine) throw new Error("no mining card");
    expect(W.equipCard(g, "mining", mine, 0)).toEqual({ ok: true });
    tick(g, 0.1);
    expect(findNonFinite(g.mods, "mods")).toEqual([]);
    expect(findNonFinite(g.deckMult, "deckMult")).toEqual([]);
  });
});

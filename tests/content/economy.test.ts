import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as economy from "@/content/economy";
import { DECK_IDS, STAT_KEYS } from "@/engine/types";
import type { Balance, ItemDef, RecipeDef } from "@/engine/types";

const { items, decks, recipes, research, cards, traits, failures, upgrades, mutators, hulls, cosmetics, factions, shop, biomes, quests, balance } = economy;

const ROOT = path.resolve(__dirname, "../..");
const palette: Record<string, string> = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/palette.json"), "utf8")).colors;
const iconDoc = fs.readFileSync(path.join(ROOT, "docs/ICONS.md"), "utf8");
/** Every backticked token on the "Required names" bullet lines of docs/ICONS.md. */
const iconNames = new Set(
  iconDoc
    .slice(iconDoc.indexOf("## Required names"))
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .flatMap((line) => [...line.matchAll(/`([^`]+)`/g)].flatMap((m) => m[1].split(/\s+/))),
);

const itemList = Object.values(items);
const recipeList = Object.values(recipes);
const researchList = Object.values(research);
const upgradeList = Object.values(upgrades);
const byCategory = (c: ItemDef["category"]): ItemDef[] => itemList.filter((i) => i.category === c);

const CANON = {
  raw: "scrap ice silicates carbon hydrogen conductite lumite voidglass antimatter organics sulfur ferrite helium3 brine xenon strange_dust".split(" "),
  refined: "alloy coolant fuel glass polymer slag water oxygen wire ceramic".split(" "),
  component: "circuit actuator plating lens power_cell tubing".split(" "),
  consumable: "duct_tape spare_parts nano_gel fuel_cell coffee beacon".split(" "),
  families: "laser engine shield scanner reactor cargo repair life".split(" "),
  failures: "tumble breach blackout noFuel engine radiation boarding anomaly".split(" "),
  minigames: "weld wire rhythm valves calibrate tape defense dock hack".split(" "),
  factions: "lamplighters rustborn ledger".split(" "),
};

/** Counters listed in GDD 11 (plus the generated minigame_/event_/failure_ families). */
const GDD_STATS = new Set(
  "purchases deckLevels milestones creditsLog10 salvage pulses overdrives overheats crafts craftsT1 craftsT2 craftsT3 craftsT4 modulesBuilt modulesPristine modulesInstalled repairsManual repairsBot repairsPerfect tapeUsed minigames minigamesPerfect jumps depthMax systemsVisited planetsScanned expeditions expeditionsLost outposts codex renames events eventsGood eventsBad failures tows crew cards contracts trades researchLevels warps rebuilds reboots logs chapters questsDaily questsWeekly streakMax offlineReturns offlineLongest playedHours kippLines debugOpened coffee blueprints".split(
    " ",
  ),
);

function inputValue(r: RecipeDef): number {
  return Object.entries(r.inputs).reduce((sum, [id, n]) => sum + items[id].value * n, 0);
}
function outputValue(r: RecipeDef): number {
  return Object.entries(r.outputs).reduce((sum, [id, n]) => sum + items[id].value * n, 0);
}
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
/** True when `requires` edges form no cycle. */
function acyclic(nodes: { id: string; requires: string[] }[]): boolean {
  const map = new Map(nodes.map((n) => [n.id, n]));
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 2) return true;
    if (state.get(id) === 1) return false;
    state.set(id, 1);
    for (const dep of map.get(id)?.requires ?? []) if (!visit(dep)) return false;
    state.set(id, 2);
    return true;
  };
  return nodes.every((n) => visit(n.id));
}
/** Items obtainable from the given raws with the given recipes (fixpoint). */
function reachable(raws: string[], usable: RecipeDef[]): Set<string> {
  const have = new Set(raws);
  for (let changed = true; changed; ) {
    changed = false;
    for (const r of usable) {
      if (!Object.keys(r.inputs).every((id) => have.has(id))) continue;
      for (const id of [...Object.keys(r.outputs), ...(r.byproducts ?? []).map((b) => b.item)]) {
        if (!have.has(id)) {
          have.add(id);
          changed = true;
        }
      }
    }
  }
  return have;
}

describe("economy: counts", () => {
  it("meets the content targets", () => {
    expect(itemList.length).toBeGreaterThanOrEqual(150);
    expect(recipeList.length).toBeGreaterThanOrEqual(120);
    expect(Object.keys(decks)).toHaveLength(13);
    expect(researchList.length).toBeGreaterThanOrEqual(45);
    expect(byCategory("raw")).toHaveLength(16);
    expect(byCategory("refined").length).toBeGreaterThanOrEqual(24);
    expect(byCategory("component").length).toBeGreaterThanOrEqual(36);
    expect(byCategory("module").length).toBeGreaterThanOrEqual(40);
    expect(byCategory("mega").length).toBeGreaterThanOrEqual(10);
    expect(byCategory("consumable").length).toBeGreaterThanOrEqual(12);
    expect(byCategory("artifact").length).toBeGreaterThanOrEqual(16);
    expect(Object.keys(cards)).toHaveLength(39);
    expect(Object.keys(traits).length).toBeGreaterThanOrEqual(24);
    expect(Object.keys(failures)).toHaveLength(8);
    expect(Object.keys(mutators).length).toBeGreaterThanOrEqual(12);
    expect(Object.keys(hulls).length).toBeGreaterThanOrEqual(6);
    expect(Object.keys(cosmetics).length).toBeGreaterThanOrEqual(24);
    expect(Object.keys(factions)).toHaveLength(3);
    expect(Object.keys(shop).length).toBeGreaterThanOrEqual(14);
    expect(Object.keys(biomes).length).toBeGreaterThanOrEqual(12);
    expect(quests.filter((q) => !q.weekly).length).toBeGreaterThanOrEqual(16);
    expect(quests.filter((q) => q.weekly).length).toBeGreaterThanOrEqual(6);
    expect(upgradeList.filter((u) => u.layer === 1).length).toBeGreaterThanOrEqual(18);
    expect(upgradeList.filter((u) => u.layer === 2).length).toBeGreaterThanOrEqual(12);
    expect(upgradeList.filter((u) => u.layer === 3).length).toBeGreaterThanOrEqual(10);
  });

  it("keys every record by its own id", () => {
    for (const rec of [items, decks, recipes, research, cards, traits, failures, upgrades, mutators, hulls, cosmetics, factions, shop, biomes]) {
      for (const [key, def] of Object.entries(rec as Record<string, { id: string }>)) expect(def.id).toBe(key);
    }
    expect(new Set(quests.map((q) => q.id)).size).toBe(quests.length);
  });
});

describe("economy: canonical ids", () => {
  it("defines every canonical item", () => {
    for (const id of CANON.raw) expect(items[id]?.category, id).toBe("raw");
    for (const id of CANON.refined) expect(items[id]?.category, id).toBe("refined");
    for (const id of CANON.component) expect(items[id]?.category, id).toBe("component");
    for (const id of CANON.consumable) expect(items[id]?.category, id).toBe("consumable");
    for (const family of CANON.families) {
      for (let mk = 1; mk <= 5; mk++) {
        const def = items[`mod_${family}_mk${mk}`];
        expect(def?.module?.family, `mod_${family}_mk${mk}`).toBe(family);
        expect(def.module?.mk).toBe(mk);
      }
    }
    for (const id of ["shipyard", "collector_array", "wormhole_gate"]) expect(items[id]?.category, id).toBe("mega");
  });

  it("defines the canonical decks, failures, factions and the tug", () => {
    expect(Object.keys(decks).sort()).toEqual([...DECK_IDS].sort());
    expect(Object.keys(failures).sort()).toEqual([...CANON.failures].sort());
    expect(Object.keys(factions).sort()).toEqual([...CANON.factions].sort());
    expect(Object.keys(hulls)[0]).toBe("tug");
  });
});

describe("economy: items", () => {
  it("has well-formed definitions", () => {
    for (const it of itemList) {
      expect(it.icon, it.id).toBe(it.id);
      expect(it.value, it.id).toBeGreaterThan(0);
      if (["module", "mega", "artifact", "special"].includes(it.category)) expect(it.mass, it.id).toBe(0);
      else expect(it.mass ?? 1, it.id).toBeGreaterThan(0);
      expect(!!it.module, it.id).toBe(it.category === "module");
      expect(!!it.consumable, it.id).toBe(it.category === "consumable");
    }
    for (const it of byCategory("raw")) expect(it.tier).toBe(0);
    for (const it of byCategory("refined")) expect(it.tier).toBe(1);
    for (const it of byCategory("component")) expect(it.tier).toBe(2);
    for (const it of byCategory("module")) expect(it.tier).toBe(3);
    for (const it of byCategory("mega")) expect(it.tier).toBe(4);
  });

  it("gives modules sensible specs", () => {
    for (const it of byCategory("module")) {
      const m = it.module!;
      expect(m.wear, it.id).toBeGreaterThanOrEqual(3);
      expect(m.wear, it.id).toBeLessThanOrEqual(7);
      expect(m.effects.length, it.id).toBeGreaterThan(0);
      expect(m.mk).toBeGreaterThanOrEqual(1);
      expect(m.mk).toBeLessThanOrEqual(5);
    }
    for (const family of CANON.families) {
      const marks = [1, 2, 3, 4, 5].map((mk) => items[`mod_${family}_mk${mk}`]);
      for (let i = 1; i < 5; i++) {
        const prev = marks[i - 1].module!;
        const next = marks[i].module!;
        expect(marks[i].value, marks[i].id).toBeGreaterThan(marks[i - 1].value);
        expect(Math.abs(next.power), marks[i].id).toBeGreaterThan(Math.abs(prev.power));
        // the family's first additive stat grows about x1.8 per mark
        const a = prev.effects.find((e) => e.add)!;
        const b = next.effects.find((e) => e.stat === a.stat)!;
        expect(b.add! / a.add!, marks[i].id).toBeGreaterThan(1.6);
        expect(b.add! / a.add!, marks[i].id).toBeLessThan(2);
      }
      expect(Math.sign(marks[0].module!.power)).toBe(family === "reactor" ? -1 : 1);
    }
  });

  it("gives the canonical consumables their GDD numbers", () => {
    expect(items.duct_tape.consumable).toMatchObject({ kind: "repair", repairPct: 15, repairCap: 60 });
    expect(items.spare_parts.consumable).toMatchObject({ kind: "repair", repairPct: 40, repairCap: 90 });
    expect(items.nano_gel.consumable).toMatchObject({ kind: "repair", repairPct: 100 });
    expect(items.fuel_cell.consumable?.kind).toBe("fuel");
    expect(items.fuel_cell.consumable?.fuel).toBeGreaterThan(0);
    expect(items.coffee.consumable?.kind).toBe("coffee");
    expect(items.beacon.consumable?.kind).toBe("beacon");
    for (const it of byCategory("consumable")) {
      if (it.consumable!.kind === "boost") expect(it.consumable!.buff, it.id).toBeDefined();
    }
  });
});

describe("economy: recipes", () => {
  it("references only existing items and has valid shapes", () => {
    for (const r of recipeList) {
      const inputs = Object.entries(r.inputs);
      const outputs = Object.entries(r.outputs);
      expect(outputs.length, r.id).toBeGreaterThanOrEqual(1);
      expect(inputs.length, r.id).toBeGreaterThanOrEqual(r.tier === 1 ? 1 : 2);
      expect(inputs.length, r.id).toBeLessThanOrEqual(5);
      for (const [id, n] of [...inputs, ...outputs]) {
        expect(items[id], `${r.id}: ${id}`).toBeDefined();
        expect(n, `${r.id}: ${id}`).toBeGreaterThan(0);
      }
      for (const [id] of inputs) expect(["module", "mega", "artifact"], `${r.id}: ${id}`).not.toContain(items[id].category);
      for (const b of r.byproducts ?? []) {
        expect(items[b.item], `${r.id}: ${b.item}`).toBeDefined();
        expect(b.chance).toBeGreaterThan(0);
        expect(b.chance).toBeLessThanOrEqual(1);
      }
      expect(Object.keys(r.unlock).length, r.id).toBe(1);
    }
  });

  it("uses the right station, tier and time for the product", () => {
    const timeRange: Record<number, [number, number]> = { 1: [3, 8], 2: [10, 25], 3: [45, 120], 4: [300, 900] };
    for (const r of recipeList) {
      const product = items[Object.keys(r.outputs)[0]];
      const [lo, hi] = timeRange[r.tier];
      expect(r.time, r.id).toBeGreaterThanOrEqual(lo);
      expect(r.time, r.id).toBeLessThanOrEqual(hi);
      if (product.category === "refined") expect([r.station, r.tier], r.id).toEqual(["refinery", 1]);
      if (product.category === "component") expect([r.station, r.tier], r.id).toEqual(["fabricator", 2]);
      if (product.category === "module") expect([r.station, r.tier, r.outputs[product.id]], r.id).toEqual(["fabricator", 3, 1]);
      if (product.category === "mega") expect([r.station, r.tier], r.id).toEqual(["workshop", 4]);
      if (product.category === "consumable" || product.category === "special") expect(r.station, r.id).toBe("workshop");
    }
  });

  it("produces every non-raw, non-artifact item as a primary output", () => {
    const produced = new Set(recipeList.map((r) => Object.keys(r.outputs)[0]));
    for (const it of itemList) {
      if (it.category === "raw" || it.category === "artifact") continue;
      expect(produced.has(it.id), it.id).toBe(true);
    }
    for (const it of byCategory("artifact")) expect(produced.has(it.id), it.id).toBe(false);
  });

  it("reaches every craftable item from raws (fixpoint over all unlockable recipes)", () => {
    const have = reachable(CANON.raw, recipeList);
    for (const it of itemList) {
      if (it.category === "artifact") continue;
      expect(have.has(it.id), it.id).toBe(true);
    }
    // every single recipe can eventually run
    for (const r of recipeList) for (const id of Object.keys(r.inputs)) expect(have.has(id), `${r.id}: ${id}`).toBe(true);
  });

  it("lets the starter set carry the first hour without research", () => {
    const starterRaws = ["scrap", "ice", "silicates", "carbon", "hydrogen", "conductite"];
    const starter = recipeList.filter((r) => r.unlock.start);
    const have = reachable(starterRaws, starter);
    for (const id of [...CANON.refined.filter((i) => i !== "oxygen"), ...CANON.component, "mod_laser_mk1", "duct_tape", "spare_parts", "fuel_cell", "beacon"]) {
      expect(have.has(id), id).toBe(true);
    }
    // deck-level unlocks add the remaining Mk I modules that need no research and no new raws
    const early = recipeList.filter((r) => r.unlock.start || r.unlock.deck);
    const haveEarly = reachable([...starterRaws, "ferrite", "brine", "organics"], early);
    for (const family of CANON.families) expect(haveEarly.has(`mod_${family}_mk1`), family).toBe(true);
    expect(haveEarly.has("coffee")).toBe(true);
  });

  it("adds value: outputs are worth more than inputs", () => {
    for (const r of recipeList) {
      const ratio = outputValue(r) / inputValue(r);
      expect(ratio, r.id).toBeGreaterThan(1.2);
      expect(ratio, r.id).toBeLessThan(3);
    }
    // the primary recipe of each item sits on the documented margin (2.2 across tiers, 1.6 within)
    for (const it of itemList) {
      const r = recipes[it.id];
      if (!r) continue;
      const ratio = outputValue(r) / inputValue(r);
      expect(ratio, it.id).toBeGreaterThan(1.5);
      expect(ratio, it.id).toBeLessThan(2.35);
    }
  });

  it("grows item value by tier", () => {
    const med = [0, 1, 2, 3, 4].map((tier) => median(itemList.filter((i) => i.tier === tier && !["artifact", "consumable", "special"].includes(i.category)).map((i) => i.value)));
    for (let tier = 1; tier <= 4; tier++) expect(med[tier] / med[tier - 1], `tier ${tier}`).toBeGreaterThan(2.2);
  });

  it("has by-products on roughly a quarter of the recipes and about 20 blueprints", () => {
    const share = recipeList.filter((r) => r.byproducts?.length).length / recipeList.length;
    expect(share).toBeGreaterThan(0.18);
    expect(share).toBeLessThan(0.35);
    const blueprints = recipeList.filter((r) => r.unlock.blueprint).length;
    expect(blueprints).toBeGreaterThanOrEqual(18);
    expect(blueprints).toBeLessThanOrEqual(32);
    expect(recipeList.filter((r) => r.unlock.chapter).length).toBeGreaterThanOrEqual(3);
    expect(recipeList.filter((r) => r.unlock.deck).length).toBeGreaterThanOrEqual(15);
  });

  it("unlocks by deck levels and chapters that exist", () => {
    for (const r of recipeList) {
      if (r.unlock.deck) {
        expect(DECK_IDS, r.id).toContain(r.unlock.deck.id);
        expect(r.unlock.deck.level, r.id).toBeGreaterThan(0);
      }
      if (r.unlock.chapter !== undefined) {
        expect(r.unlock.chapter, r.id).toBeGreaterThanOrEqual(1);
        expect(r.unlock.chapter, r.id).toBeLessThanOrEqual(12);
      }
    }
  });
});

describe("economy: decks", () => {
  it("follows GDD 2.1", () => {
    // unlock costs and cost growth are the simulator's numbers (docs/BALANCE.md), not the first GDD draft
    const unlock: Record<string, number> = { lift: 0, cargo: 0, mining: 0, refinery: 250, reactor: 1200, bridge: 50000, fabricator: 600000, workshop: 4e6, hangar: 1e7, lab: 3e7, quarters: 3e8, observatory: 2e10, greenhouse: 1e12 };
    for (const id of DECK_IDS) {
      const d = decks[id];
      expect(d.unlock.credits, id).toBe(unlock[id]);
      expect(d.icon, id).toBe(`deck_${id}`);
      expect(d.startLevel, id).toBe(["mining", "lift", "cargo"].includes(id) ? 1 : 0);
      expect(d.costGrowth, id).toBeGreaterThanOrEqual(1.07);
      expect(d.costGrowth, id).toBeLessThanOrEqual(1.14);
      expect(d.baseCost, id).toBeGreaterThan(0);
      for (const item of Object.keys(d.unlock.items ?? {})) expect(items[item], `${id}: ${item}`).toBeDefined();
    }
    expect([decks.mining.base, decks.mining.curve, decks.mining.costGrowth]).toEqual([1, "exp", 1.1]);
    expect([decks.lift.base, decks.lift.curve, decks.lift.costGrowth]).toEqual([3, "exp", 1.095]);
    expect([decks.cargo.base, decks.cargo.curve, decks.cargo.costGrowth]).toEqual([400, "exp", 1.11]);
    // unlock order by cost is unchanged
    const order = ["refinery", "reactor", "bridge", "fabricator", "workshop", "hangar", "lab", "quarters", "observatory", "greenhouse"] as const;
    for (let i = 1; i < order.length; i++) expect(decks[order[i]].unlock.credits, order[i]).toBeGreaterThan(decks[order[i - 1]].unlock.credits);
    expect([decks.reactor.base, decks.reactor.curve, decks.reactor.power]).toEqual([14, "lin", 0]);
    expect([decks.lab.base, decks.lab.curve]).toEqual([0.2, "exp"]);
    expect([decks.greenhouse.base, decks.greenhouse.curve]).toEqual([0.05, "exp"]);
    expect(decks.observatory.curve).toBe("soft");
    expect([decks.bridge.base, decks.bridge.curve]).toEqual([0.02, "lin"]);
    expect(balance.startCredits).toBeGreaterThanOrEqual(decks.mining.baseCost);
  });
});

describe("economy: research", () => {
  it("is an acyclic graph over existing ids with unique positions", () => {
    expect(acyclic(researchList)).toBe(true);
    const seen = new Set<string>();
    for (const n of researchList) {
      for (const dep of n.requires) expect(research[dep], `${n.id} -> ${dep}`).toBeDefined();
      const key = `${n.pos.x}:${n.pos.y}`;
      expect(seen.has(key), `${n.id} at ${key}`).toBe(false);
      seen.add(key);
      expect(n.maxLevel, n.id).toBeGreaterThanOrEqual(1);
      expect(n.cost, n.id).toBeGreaterThan(0);
      expect(n.costGrowth, n.id).toBeGreaterThanOrEqual(1);
      if (n.maxLevel > 1) expect(n.costGrowth, n.id).toBeGreaterThan(1);
      expect(!!(n.effects?.length || n.recipes?.length || n.feature), n.id).toBe(true);
      for (const item of Object.keys(n.items ?? {})) expect(items[item], `${n.id}: ${item}`).toBeDefined();
      // a child never costs less than the cheapest of its parents
      for (const dep of n.requires) expect(n.cost, `${n.id} vs ${dep}`).toBeGreaterThanOrEqual(Math.min(...n.requires.map((d) => research[d].cost)));
    }
    const branches = new Set(researchList.map((n) => n.branch));
    expect(branches.size).toBe(7);
    for (const b of branches) expect(researchList.some((n) => n.branch === b && n.requires.length === 0), b).toBe(true);
  });

  it("links recipes both ways", () => {
    for (const n of researchList) {
      for (const id of n.recipes ?? []) {
        expect(recipes[id], `${n.id}: ${id}`).toBeDefined();
        expect(recipes[id].unlock.research, `${n.id}: ${id}`).toBe(n.id);
      }
    }
    for (const r of recipeList) {
      if (!r.unlock.research) continue;
      expect(research[r.unlock.research], r.id).toBeDefined();
      expect(research[r.unlock.research].recipes ?? [], r.id).toContain(r.id);
    }
  });

  it("can afford its own item costs and recipe inputs by the time a node is reachable", () => {
    // items a node costs must be craftable without that node's own recipes
    for (const n of researchList) {
      if (!n.items) continue;
      const usable = recipeList.filter((r) => r.unlock.research !== n.id);
      const have = reachable(CANON.raw, usable);
      for (const item of Object.keys(n.items)) expect(have.has(item), `${n.id}: ${item}`).toBe(true);
    }
  });

  it("unlocks the required features and offline nodes", () => {
    const features = researchList.map((n) => n.feature).filter(Boolean);
    for (const f of ["autoQueue", "repairBots", "autoMaintenance", "probes", "expeditions", "outposts"]) expect(features, f).toContain(f);
    const total = (stat: string): number =>
      researchList.reduce((sum, n) => sum + (n.effects ?? []).filter((e) => e.stat === stat).reduce((s, e) => s + (e.add ?? 0) * n.maxLevel, 0), 0);
    // cap: 8 h base -> 24 h
    expect(balance.offlineBaseCap * (1 + total("offlineCap"))).toBeCloseTo(24 * 3600, 0);
    // efficiency: 0.35 base, research plus the bridge cap -> about 0.5
    const eff = balance.offlineBaseEff * (1 + total("offlineEff") + (balance.bridgeOfflineCap as number));
    expect(eff).toBeGreaterThan(0.47);
    expect(eff).toBeLessThanOrEqual(0.52);
  });
});

describe("economy: prestige", () => {
  it("has acyclic trees that stay within their layer", () => {
    expect(acyclic(upgradeList)).toBe(true);
    for (const layer of [1, 2, 3] as const) {
      const nodes = upgradeList.filter((u) => u.layer === layer);
      const seen = new Set<string>();
      expect(nodes.filter((u) => u.requires.length === 0).length, `layer ${layer} roots`).toBeGreaterThanOrEqual(1);
      for (const u of nodes) {
        for (const dep of u.requires) expect(upgrades[dep]?.layer, `${u.id} -> ${dep}`).toBe(layer);
        const key = `${u.pos.x}:${u.pos.y}`;
        expect(seen.has(key), `${u.id} at ${key}`).toBe(false);
        seen.add(key);
        expect(u.cost, u.id).toBeGreaterThan(0);
        expect(u.maxLevel, u.id).toBeGreaterThanOrEqual(1);
        expect(!!(u.effects?.length || u.feature), u.id).toBe(true);
      }
    }
  });

  it("has fair mutators and growing hulls", () => {
    for (const m of Object.values(mutators)) {
      expect(m.reward, m.id).toBeGreaterThanOrEqual(1.15);
      expect(m.reward, m.id).toBeLessThanOrEqual(2);
      expect(m.effects.length, m.id).toBeGreaterThan(0);
    }
    const list = Object.values(hulls);
    expect(list[0]).toMatchObject({ id: "tug", grid: { w: 3, h: 3 }, cost: 0, inheritBlueprints: 0 });
    expect(list[list.length - 1].grid).toEqual({ w: 6, h: 6 });
    for (let i = 0; i < list.length; i++) {
      const h = list[i];
      expect(h.sprite, h.id).toBe(`ship_${h.id}`);
      expect(h.inheritBlueprints, h.id).toBeGreaterThanOrEqual(0);
      expect(h.inheritBlueprints, h.id).toBeLessThanOrEqual(12);
      expect(Math.max(h.grid.w, h.grid.h), h.id).toBeLessThanOrEqual(6);
      if (i > 0) {
        expect(h.grid.w * h.grid.h, h.id).toBeGreaterThan(list[i - 1].grid.w * list[i - 1].grid.h);
        expect(h.cost, h.id).toBeGreaterThan(list[i - 1].cost);
        expect(h.effects.length, h.id).toBeGreaterThan(0);
        expect(items[`hull_frame_${h.id}`]?.category, h.id).toBe("mega");
      }
    }
  });
});

describe("economy: world data", () => {
  it("has failures with a tow and sensible exits", () => {
    for (const f of Object.values(failures)) {
      expect(f.exits.length, f.id).toBeGreaterThanOrEqual(2);
      expect(f.exits.length, f.id).toBeLessThanOrEqual(4);
      expect(f.exits.filter((e) => e.kind === "tow"), f.id).toHaveLength(1);
      expect(f.towBase, f.id).toBeGreaterThanOrEqual(180);
      expect(f.towBase, f.id).toBeLessThanOrEqual(900);
      for (const d of f.blocksDecks) expect(DECK_IDS, f.id).toContain(d);
      for (const e of f.exits) {
        if (e.kind === "minigame") expect(CANON.minigames, f.id).toContain(e.game);
        if (e.kind === "items") for (const id of Object.keys(e.items)) expect(items[id], `${f.id}: ${id}`).toBeDefined();
        if (e.kind === "wait") expect(e.seconds, f.id).toBeGreaterThan(0);
      }
    }
    const games = (id: keyof typeof failures): string[] => failures[id].exits.flatMap((e) => (e.kind === "minigame" ? [e.game] : []));
    expect(games("tumble")).toContain("calibrate");
    expect(games("breach").some((g) => g === "weld" || g === "tape")).toBe(true);
    expect(games("blackout")).toContain("wire");
    expect(games("engine").some((g) => g === "valves" || g === "rhythm")).toBe(true);
    expect(games("boarding")).toContain("defense");
    expect(games("anomaly").some((g) => g === "hack" || g === "calibrate")).toBe(true);
    expect(failures.noFuel.exits.some((e) => e.kind === "items" && e.items.fuel_cell)).toBe(true);
    expect(failures.noFuel.exits.some((e) => e.kind === "wait")).toBe(true);
    expect(failures.radiation.exits.some((e) => e.kind === "wait")).toBe(true);
  });

  it("has three cards per deck", () => {
    for (const id of DECK_IDS) {
      const own = Object.values(cards).filter((c) => c.deck === id);
      expect(own, id).toHaveLength(3);
      for (const c of own) {
        expect([0, 1, 2, 3], c.id).toContain(c.rarity);
        expect(c.effects.length, c.id).toBeGreaterThan(0);
      }
    }
    expect(new Set(Object.values(cards).map((c) => c.rarity)).size).toBe(4);
  });

  it("has a mix of good and bad traits", () => {
    const list = Object.values(traits);
    expect(list.filter((x) => x.good).length).toBeGreaterThanOrEqual(10);
    expect(list.filter((x) => !x.good).length).toBeGreaterThanOrEqual(8);
    for (const x of list) expect(x.effects.length, x.id).toBeGreaterThan(0);
  });

  it("has a shop that opens the whole grid", () => {
    let slots = 0;
    for (const s of Object.values(shop)) {
      slots += (s.gridSlots ?? 0) * s.maxLevel;
      expect(s.cost, s.id).toBeGreaterThan(0);
      expect(s.costFloor, s.id).toBeGreaterThan(0);
      expect(s.costGrowth, s.id).toBeGreaterThanOrEqual(1);
      expect(s.maxLevel, s.id).toBeGreaterThanOrEqual(1);
      if (s.item) expect(items[s.item.id], s.id).toBeDefined();
      if (s.faction) expect(factions[s.faction], s.id).toBeDefined();
    }
    expect((balance.gridStartOpen as number) + slots).toBe(36);
    expect(shop.fuel_tank).toBeDefined();
    expect(Object.values(shop).some((s) => s.effects?.some((e) => e.stat === "towSpeed"))).toBe(true);
    expect(Object.values(shop).some((s) => s.effects?.some((e) => e.stat === "sellValue"))).toBe(true);
  });

  it("has biomes built from raw items and palette colors", () => {
    const used = new Set<string>();
    for (const b of Object.values(biomes)) {
      expect(b.desc.length, b.id).toBeGreaterThanOrEqual(2);
      expect(b.desc.length, b.id).toBeLessThanOrEqual(3);
      expect(b.palette, b.id).toHaveLength(5);
      for (const key of b.palette) expect(palette[key], `${b.id}: ${key}`).toBeDefined();
      expect(b.resources.length, b.id).toBeGreaterThanOrEqual(2);
      for (const id of [...b.resources, ...(b.special ?? [])]) {
        expect(items[id]?.category, `${b.id}: ${id}`).toBe("raw");
        used.add(id);
      }
    }
    for (const id of CANON.raw) expect(used.has(id), id).toBe(true);
  });

  it("uses palette keys for paints, trails and faction colors", () => {
    for (const c of Object.values(cosmetics)) {
      if (c.kind === "paint" || c.kind === "trail") expect(palette[c.value], `${c.id}: ${c.value}`).toBeDefined();
      else expect(c.value, c.id).toBe(c.id);
      expect(Object.keys(c.unlock).length, c.id).toBe(1);
    }
    for (const kind of ["paint", "trail", "sticker", "toy"]) {
      const own = Object.values(cosmetics).filter((c) => c.kind === kind);
      expect(own.length, kind).toBeGreaterThanOrEqual(4);
      expect(own.some((c) => c.unlock.start), kind).toBe(true);
    }
    for (const f of Object.values(factions)) {
      expect(palette[f.color], f.id).toBeDefined();
      expect(f.likes.length, f.id).toBeGreaterThan(0);
    }
  });

  it("builds quests on GDD stat counters", () => {
    for (const q of quests) {
      expect(GDD_STATS.has(q.stat), `${q.id}: ${q.stat}`).toBe(true);
      expect(q.text.cs, q.id).toContain("{n}");
      expect(q.text.en, q.id).toContain("{n}");
      expect(q.base, q.id).toBeGreaterThan(0);
    }
  });
});

describe("economy: balance", () => {
  it("defines every key of the Balance interface with the tuned values (docs/BALANCE.md)", () => {
    const expected: Partial<Balance> = {
      brokerFee: 0.6,
      hopperSeconds: 30,
      richnessPerDepth: 1.32,
      galaxyDepth: 40,
      galaxyDepthGrowth: 6,
      qualityMult: [0.75, 1, 1.25, 1.6, 2.1],
      qualityWear: [0.8, 1, 1.2, 1.5, 2],
      adjacencyBonus: 0.15,
      degradeAt: 50,
      offlineAt: 20,
      offlineBaseEff: 0.35,
      offlineBaseCap: 28800,
      offlineWearFactor: 0.35,
      offlineIntegrityFloor: 25,
      activeMult: 4,
      heatPerSec: 22,
      coolPerSec: 14,
      overheatLock: 5,
      overdriveMult: 3,
      overdriveSecs: 20,
      salvageEvery: [25, 50],
      salvageMax: 5,
      eventEvery: [240, 540],
      eventMaxPerHour: 8,
      fuelPerJump: 6,
      fuelCap: 30,
      jumpChargeSecs: 240,
      jumpCooldownSecs: 120,
      warpStampBase: 14.3,
      warpStampExp: 0.45,
      moduleUpgradeGrowth: 1.6,
    };
    for (const [key, value] of Object.entries(expected)) expect(balance[key], key).toEqual(value);
    expect(balance.startCredits).toBeGreaterThan(0);
    expect(balance.milestones.slice(0, 12)).toEqual([10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 600]);
    expect(balance.milestones[balance.milestones.length - 1]).toBe(2000);
    for (let i = 11; i < balance.milestones.length; i++) expect(balance.milestones[i] - balance.milestones[i - 1]).toBe(100);
    expect((balance.qualityChance as number[]).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    for (const v of Object.values(balance)) {
      if (Array.isArray(v)) for (const x of v) expect(Number.isFinite(x)).toBe(true);
      else expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe("economy: cross-cutting", () => {
  /** Walks every exported collection and yields objects that look like Effects and L10n strings. */
  function walk(node: unknown, pathKey: string, visit: (obj: Record<string, unknown>, at: string) => void): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, `${pathKey}[${i}]`, visit));
      return;
    }
    visit(node as Record<string, unknown>, pathKey);
    for (const [k, v] of Object.entries(node)) walk(v, `${pathKey}.${k}`, visit);
  }
  const collections: Record<string, unknown> = { items, decks, recipes, research, cards, traits, failures, upgrades, mutators, hulls, cosmetics, factions, shop, biomes, quests };

  it("uses only known stat keys and deck ids in effects", () => {
    let count = 0;
    const check = (list: unknown, at: string): void => {
      if (!Array.isArray(list)) return;
      for (const e of list as { stat?: string; deck?: string; add?: number; mul?: number }[]) {
        count++;
        if (e.stat !== undefined) expect(STAT_KEYS, `${at}: ${e.stat}`).toContain(e.stat);
        if (e.deck !== undefined) expect(DECK_IDS, `${at}: ${e.deck}`).toContain(e.deck);
        expect(e.add !== undefined || e.mul !== undefined, at).toBe(true);
        if (e.mul !== undefined) expect(e.mul, at).toBeGreaterThanOrEqual(0);
        if (e.add !== undefined) expect(e.add, at).toBeGreaterThan(-1);
      }
    };
    walk(collections, "economy", (obj, at) => {
      check(obj.effects, at);
      const buff = (obj.buff as { effect?: unknown } | undefined)?.effect;
      if (buff) check([buff], at);
    });
    for (const [id, list] of Object.entries(economy.megaEffects)) {
      expect(items[id]?.category, id).toBe("mega");
      check(list, id);
    }
    expect(count).toBeGreaterThan(300);
    // trait effects without stat/deck scope the managed deck; everything else must be scoped
    walk({ ...collections, traits: {} }, "economy", (obj, at) => {
      for (const e of (Array.isArray(obj.effects) ? obj.effects : []) as { stat?: string; deck?: string }[]) expect(!!(e.stat || e.deck), at).toBe(true);
    });
  });

  it("has complete, genuinely bilingual text", () => {
    // Words that are legitimately spelled the same in Czech and English.
    const sameInBoth = new Set(["Helium-3", "Xenon", "Polymer", "Biogel", "Motor", "Servo", "Espresso", "MW"]);
    const diacritics = /[áčďéěíňóřšťúůýž]/i;
    let strings = 0;
    let withDiacritics = 0;
    let longTexts = 0;
    walk(collections, "economy", (obj, at) => {
      const keys = Object.keys(obj);
      if (keys.length !== 2 || typeof obj.cs !== "string" || typeof obj.en !== "string") return;
      const cs = obj.cs as string;
      const en = obj.en as string;
      strings++;
      expect(cs.trim().length, at).toBeGreaterThan(0);
      expect(en.trim().length, at).toBeGreaterThan(0);
      expect(cs, at).toBe(cs.trim());
      expect(en, at).toBe(en.trim());
      if (cs.length > 4 && !sameInBoth.has(cs)) expect(cs, `${at} is an untranslated copy`).not.toBe(en);
      expect(diacritics.test(en), `${at}: Czech characters in the English text "${en}"`).toBe(false);
      if (cs.length >= 30) {
        longTexts++;
        if (diacritics.test(cs)) withDiacritics++;
        // a sentence-length Czech text without a single diacritic is almost certainly ASCII-only
        if (cs.length >= 45) expect(diacritics.test(cs), `${at}: "${cs}"`).toBe(true);
      }
    });
    expect(strings).toBeGreaterThan(900);
    expect(withDiacritics / longTexts).toBeGreaterThan(0.97);
  });

  it("uses only icons that exist", () => {
    expect(iconNames.has("deck_mining")).toBe(true);
    expect(iconNames.has("br_science")).toBe(true);
    let count = 0;
    walk(collections, "economy", (obj, at) => {
      if (typeof obj.icon !== "string") return;
      count++;
      expect(!!items[obj.icon] || iconNames.has(obj.icon), `${at}: ${obj.icon}`).toBe(true);
    });
    expect(count).toBeGreaterThan(itemList.length + 100);
  });
});

describe("economy: summary", () => {
  it("prints the counts per category", () => {
    const rows: [string, number][] = [
      ["items (total)", itemList.length],
      ...(["raw", "refined", "component", "module", "mega", "consumable", "artifact", "special"] as const).map((c): [string, number] => [`  ${c}`, byCategory(c).length]),
      ["recipes (total)", recipeList.length],
      ...([1, 2, 3, 4] as const).map((tier): [string, number] => [`  tier ${tier}`, recipeList.filter((r) => r.tier === tier).length]),
      ["  start / deck / research / blueprint / chapter", 0],
      ["decks", Object.keys(decks).length],
      ["research nodes", researchList.length],
      ["cards", Object.keys(cards).length],
      ["traits", Object.keys(traits).length],
      ["failures", Object.keys(failures).length],
      ["upgrades L1 / L2 / L3", 0],
      ["mutators", Object.keys(mutators).length],
      ["hulls", Object.keys(hulls).length],
      ["cosmetics", Object.keys(cosmetics).length],
      ["factions", Object.keys(factions).length],
      ["shop items", Object.keys(shop).length],
      ["biomes", Object.keys(biomes).length],
      ["quests daily / weekly", 0],
      ["balance keys", Object.keys(balance).length],
    ];
    const unlocks = (["start", "deck", "research", "blueprint", "chapter"] as const).map((k) => recipeList.filter((r) => r.unlock[k]).length).join(" / ");
    const layers = [1, 2, 3].map((l) => upgradeList.filter((u) => u.layer === l).length).join(" / ");
    const questCounts = `${quests.filter((q) => !q.weekly).length} / ${quests.filter((q) => q.weekly).length}`;
    const lines = rows.map(([label, n]) => {
      const value = label.includes("start / deck") ? unlocks : label.startsWith("upgrades") ? layers : label.startsWith("quests") ? questCounts : String(n);
      return `${label.padEnd(48)} ${value}`;
    });
    console.log(["", "economy content summary", "-----------------------", ...lines].join("\n"));
    expect(lines.length).toBeGreaterThan(0);
  });
});

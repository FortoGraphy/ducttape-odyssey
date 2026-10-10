// Integration smoke test against the real economy content (src/content/economy). The story and
// event parts are left empty: core does not read them.
import { describe, expect, it } from "vitest";
import * as eco from "@/content/economy";
import * as B from "../../src/engine/big";
import {
  buyDeck,
  canCraft,
  coreSystems,
  craftableRecipes,
  deserialize,
  exportCode,
  findModule,
  importCode,
  installModule,
  nearGoals,
  previewInstall,
  queueCraft,
  repairWithItem,
  serialize,
  syncRates,
  unlockDeck,
} from "../../src/engine/core";
import { addItem, applyOffline, createGame, tick } from "../../src/engine/kernel";
import { DECK_IDS, STAT_KEYS, type ContentDB, type Game, type SystemInfo } from "../../src/engine/types";

const content = {
  ...eco,
  events: {},
  chapters: [],
  logs: [],
  kipp: [],
  achievements: [],
  names: { systemA: [], systemB: [], systemC: [], planetSuffix: [], crewFirst: [], crewLast: [], stationWords: [], faunaA: [], faunaB: [], floraA: [], floraB: [] },
} as unknown as ContentDB;

const sys: SystemInfo = {
  id: "0:0:0",
  g: 0,
  depth: 0,
  lane: 0,
  name: "Start",
  star: "yellow",
  seed: 1,
  hazards: [],
  richness: 1,
  resources: [
    { item: "scrap", w: 5 },
    { item: "ice", w: 3 },
    { item: "silicates", w: 2 },
    { item: "carbon", w: 2 },
    { item: "hydrogen", w: 1 },
    { item: "conductite", w: 1 },
  ],
  planets: [],
  belts: 0,
  station: null,
  anomaly: false,
  links: [0],
  pos: { x: 0.5, y: 0 },
  isCore: false,
};

function boot(state?: Game["state"]): Game {
  const g = createGame(content, coreSystems, state, { seed: 3, wallMs: 1_700_000_000_000 });
  g.api.currentSystem = () => sys;
  syncRates(g);
  return g;
}

function assertSane(g: Game): void {
  const s = g.state;
  for (const v of [s.credits, s.lifetime, s.allTime, s.hopper, s.rp, g.rates.mine, g.rates.lift, g.rates.cargoCap, g.rates.cargoUsed, g.rates.income, ...Object.values(s.inv)]) {
    expect(Number.isFinite(v.m) && Number.isFinite(v.e)).toBe(true);
    expect(v.m).toBeGreaterThanOrEqual(0);
  }
  for (const k of STAT_KEYS) expect(Number.isFinite(g.mods[k])).toBe(true);
  expect(g.rates.power.eff).toBeGreaterThan(0);
  expect(g.rates.power.eff).toBeLessThanOrEqual(1);
}

describe("core on the real economy content", () => {
  it("has what core needs", () => {
    for (const id of DECK_IDS) expect(content.decks[id]).toBeDefined();
    expect(Object.keys(content.items).length).toBeGreaterThan(100);
    expect(Object.keys(content.recipes).length).toBeGreaterThan(100);
    for (const id in content.recipes) {
      const r = content.recipes[id];
      for (const item in r.inputs) expect(content.items[item], `${id} input ${item}`).toBeDefined();
      for (const item in r.outputs) expect(content.items[item], `${id} output ${item}`).toBeDefined();
      for (const b of r.byproducts ?? []) expect(content.items[b.item], `${id} by-product ${b.item}`).toBeDefined();
    }
  });

  it("starts earning at once and reaches the first purchase within 10 s", () => {
    const g = boot();
    expect(g.rates.power.eff).toBe(1);
    expect(g.rates.income.m).toBeGreaterThan(0);
    let bought = -1;
    for (let i = 0; i < 100 && bought < 0; i++) {
      tick(g, 0.1);
      if (buyDeck(g, "mining", 1).ok) bought = i;
    }
    expect(bought).toBeGreaterThanOrEqual(0);
    expect(nearGoals(g).length).toBe(3);
  });

  it("plays 5 000 ticks with buys, unlocks and crafts without throwing", () => {
    const g = boot();
    const order = ["refinery", "reactor", "bridge", "fabricator", "workshop"] as const;
    let crafts = 0;
    for (let i = 0; i < 5000; i++) {
      tick(g, 0.1);
      if (i % 10 === 0) g.outbox.length = 0;
      if (i % 20 !== 0) continue;
      for (const id of order) unlockDeck(g, id);
      // a simple bot: cheapest useful level, keep the reactor ahead of demand
      if (g.rates.power.eff < 1 && g.state.decks.reactor.level > 0) buyDeck(g, "reactor", 1);
      for (const id of ["mining", "lift", "cargo", "refinery"] as const) buyDeck(g, id, 1);
      for (const station of ["refinery", "fabricator", "workshop"] as const) {
        if (g.state.decks[station].level <= 0 || g.state.craft[station].queue.length > 0) continue;
        for (const id of craftableRecipes(g, station)) {
          if (canCraft(g, id).ok && queueCraft(g, id, 2).ok) {
            crafts++;
            break;
          }
        }
      }
      if (i % 500 === 0) expect(nearGoals(g).length).toBe(3);
    }
    assertSane(g);
    expect(g.state.decks.mining.level).toBeGreaterThan(5);
    expect(g.state.decks.refinery.level).toBeGreaterThan(0);
    expect(crafts).toBeGreaterThan(0);
    expect(g.state.stats.crafts).toBeGreaterThan(0);
    expect(g.state.credits.m).toBeGreaterThanOrEqual(0);
    expect(B.log10(g.state.allTime)).toBeGreaterThan(2);
    expect(g.outbox.length).toBeLessThanOrEqual(96);
  });

  it("crafts, installs, wears and repairs a real module; megastructures apply their effects", () => {
    const g = boot();
    for (const id of DECK_IDS) g.state.decks[id].level = Math.max(g.state.decks[id].level, 30);
    g.state.decks.reactor.level = 200;
    g.state.grid.open = 9;
    g.dirty = true;
    syncRates(g);
    expect(g.rates.power.eff).toBe(1);

    const recipe = content.recipes.mod_laser_mk1;
    expect(recipe).toBeDefined();
    for (const item in recipe.inputs) {
      g.state.keep[item] = 1;
      addItem(g, item, recipe.inputs[item] * 2);
    }
    g.api.unlockRecipe("mod_laser_mk1");
    expect(queueCraft(g, "mod_laser_mk1", 2).ok).toBe(true);
    for (let i = 0; i < recipe.time * 2 * 10 + 50; i++) tick(g, 0.1);
    expect(g.state.modules.length).toBe(2);
    const [a, b] = g.state.modules;
    const before = { ...g.mods };
    const preview = previewInstall(g, a.uid, 0);
    expect(preview.ok).toBe(true);
    expect(preview.stats.length).toBeGreaterThan(0);
    expect(installModule(g, a.uid, 0).ok).toBe(true);
    expect(installModule(g, b.uid, 1).ok).toBe(true);
    syncRates(g);
    for (const d of preview.stats) expect(d.from).toBeCloseTo(before[d.stat], 9);
    expect(findModule(g, a.uid)!.slot).toBe(0);

    g.api.damageModules(70, 2);
    for (let i = 0; i < 20; i++) tick(g, 0.1);
    addItem(g, "duct_tape", 2);
    expect(repairWithItem(g, a.uid, "duct_tape").ok).toBe(true);
    expect(a.hp).toBeCloseTo(45, 0);

    const power = g.mods.powerOut;
    addItem(g, "collector_array", 1);
    addItem(g, "shipyard", 1);
    for (let i = 0; i < 15; i++) tick(g, 0.1);
    expect(g.mods.powerOut).toBeCloseTo(power * 1.5, 9);
    expect(g.state.flags.shipyard_built).toBe(1);
    assertSane(g);
  });

  it("offline pass, save round trip and export code work on a played real-content state", () => {
    const g = boot();
    for (const id of DECK_IDS) g.state.decks[id].level = Math.max(g.state.decks[id].level, 12);
    g.state.decks.reactor.level = 60;
    g.dirty = true;
    syncRates(g);
    for (const id of craftableRecipes(g, "refinery").slice(0, 3)) queueCraft(g, id, -1);
    for (let i = 0; i < 3000; i++) tick(g, 0.1);
    const report = applyOffline(g, 6 * 3600);
    expect(report.credits.m).toBeGreaterThan(0);
    expect(report.credited).toBe(6 * 3600);
    assertSane(g);

    const loaded = deserialize(serialize(g.state), content);
    expect(loaded.ok).toBe(true);
    const imported = importCode(exportCode(g.state), content);
    expect(imported.ok).toBe(true);
    if (!loaded.ok || !imported.ok) return;
    expect(imported.state).toEqual(loaded.state);
    const h = boot(loaded.state);
    const credits = B.clone(h.state.credits);
    for (let i = 0; i < 300; i++) tick(h, 0.1);
    expect(B.cmp(h.state.credits, credits)).toBeGreaterThan(0);
    assertSane(h);
  });
});

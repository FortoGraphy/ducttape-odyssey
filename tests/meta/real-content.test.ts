// Integration check against the shipped economy content (research, upgrades, hulls, mutators,
// cosmetics, quests, balance). Story parts are tiny stand-ins; core and world are the fixture's stub.
import { describe, expect, it } from "vitest";
import * as eco from "@/content/economy";
import * as B from "@/engine/big";
import { addItem, rebuildMods, runPrestige, setFlag, unlockFeature } from "@/engine/kernel";
import {
  DAY_MS,
  buyResearch,
  buyUpgrade,
  dailyQuests,
  hullFrameItem,
  pickDaily,
  pickWeekly,
  rebuild,
  researchCost,
  researchLevel,
  stampsOnWarp,
  upgradeCost,
  upgradeLevel,
  validMutators,
  warp,
} from "@/engine/meta";
import { STAT_KEYS } from "@/engine/types";
import type { ContentDB, Game } from "@/engine/types";
import { findBadNumber, makeGame, run } from "./fixture";

const l = (s: string) => ({ cs: s, en: s });

const real = {
  items: eco.items,
  decks: eco.decks,
  recipes: eco.recipes,
  research: eco.research,
  cards: eco.cards,
  traits: eco.traits,
  events: {},
  failures: eco.failures,
  chapters: [
    { id: 1, title: l("One"), intro: [{ speaker: "kipp", text: l("hello") }], trigger: { chapterMax: 0 }, objectives: [] },
    { id: 2, title: l("Two"), intro: [], trigger: { stat: { key: "purchases", min: 10 } }, objectives: [], unlocks: ["crafting"] },
  ],
  logs: [{ id: "log_1", author: l("A"), title: l("T"), text: l("x"), order: 1 }],
  kipp: [
    { id: "idle_1", trigger: "idle", text: l("...") },
    { id: "research_1", trigger: "research", text: l("...") },
    { id: "prestige_1", trigger: "prestige", text: l("...") },
  ],
  achievements: [],
  upgrades: eco.upgrades,
  mutators: eco.mutators,
  hulls: eco.hulls,
  cosmetics: eco.cosmetics,
  factions: eco.factions,
  shop: eco.shop,
  biomes: eco.biomes,
  quests: eco.quests,
  megaEffects: eco.megaEffects,
  names: {},
  balance: eco.balance,
} as unknown as ContentDB;

const PLENTY = B.make(1, 300);

function modsAreSane(g: Game): void {
  rebuildMods(g);
  for (const key of STAT_KEYS) {
    expect(Number.isFinite(g.mods[key]), key).toBe(true);
    expect(g.mods[key], key).toBeGreaterThan(0);
  }
}

describe("shipped economy content", () => {
  it("has a research tree that can be bought completely with unlimited points", () => {
    const { g } = makeGame({ content: real });
    const ids = Object.keys(real.research);
    expect(ids.length).toBeGreaterThanOrEqual(45);
    for (const id of ids) for (const req of real.research[id].requires) expect(real.research[req], `${id} requires ${req}`).toBeDefined();

    let total = 0;
    for (const id of ids) total += real.research[id].maxLevel;
    let bought = 0;
    for (let pass = 0, progress = true; progress && pass < 1000; pass++) {
      progress = false;
      for (const id of ids) {
        for (;;) {
          g.state.rp = B.clone(PLENTY);
          const cost = researchCost(g, id);
          expect(Number.isFinite(cost.rp.m) && Number.isFinite(cost.rp.e), id).toBe(true);
          if (cost.items) for (const item of Object.keys(cost.items)) addItem(g, item, cost.items[item]);
          const r = buyResearch(g, id);
          if (!r.ok) {
            // the only acceptable reasons to stop: finished, or waiting for a prerequisite
            expect(["max", "requirement"], `${id}: ${r.reason}`).toContain(r.reason);
            break;
          }
          bought++;
          progress = true;
        }
      }
    }
    // a cycle or an unreachable prerequisite would leave nodes below their cap
    for (const id of ids) expect(researchLevel(g, id), id).toBe(real.research[id].maxLevel);
    expect(bought).toBe(total);
    expect(g.state.stats.researchLevels).toBe(total);

    // everything the tree promises was handed out
    for (const id of ids) {
      const def = real.research[id];
      if (def.feature) expect(g.state.features[def.feature], `${id} -> ${def.feature}`).toBe(1);
      for (const r of def.recipes ?? []) expect(g.state.recipes[r], `${id} -> ${r}`).toBe(1);
    }
    expect(real.research.mt_bots).toBeDefined();
    expect(g.state.repair.botLevel).toBe(real.research.mt_bots.maxLevel);
    modsAreSane(g);
    expect(findBadNumber(g.state)).toBeNull();

    // a warp keeps a quarter, and the bots follow their node
    runPrestige(g, 1);
    for (const id of ids) expect(researchLevel(g, id), id).toBe(Math.floor(real.research[id].maxLevel * 0.25));
    expect(g.state.repair.botLevel).toBe(Math.floor(real.research.mt_bots.maxLevel * 0.25));
    modsAreSane(g);
  });

  it("has three upgrade trees that can be bought completely, each with its own currency", () => {
    const { g } = makeGame({ content: real });
    const p = g.state.prestige;
    const ids = Object.keys(real.upgrades);
    const byLayer = { 1: 0, 2: 0, 3: 0 };
    for (const id of ids) {
      byLayer[real.upgrades[id].layer]++;
      for (const req of real.upgrades[id].requires) {
        expect(real.upgrades[req], `${id} requires ${req}`).toBeDefined();
        // a tree never depends on another layer's tree: a rebuild would otherwise orphan its nodes
        expect(real.upgrades[req].layer, `${id} requires ${req}`).toBe(real.upgrades[id].layer);
      }
    }
    expect(byLayer[1]).toBeGreaterThan(0);
    expect(byLayer[2]).toBeGreaterThan(0);
    expect(byLayer[3]).toBeGreaterThan(0);

    for (let pass = 0, progress = true; progress && pass < 1000; pass++) {
      progress = false;
      for (const id of ids) {
        for (;;) {
          p.stamps = B.clone(PLENTY);
          p.rivets = B.clone(PLENTY);
          p.sparks = B.clone(PLENTY);
          const cost = upgradeCost(g, id);
          expect(cost.m, id).toBeGreaterThan(0);
          const before = [p.stamps, p.rivets, p.sparks].map((v) => B.cmp(v, PLENTY));
          const r = buyUpgrade(g, id);
          if (!r.ok) {
            expect(["max", "requirement"], `${id}: ${r.reason}`).toContain(r.reason);
            break;
          }
          expect(before).toEqual([0, 0, 0]);
          progress = true;
        }
      }
    }
    for (const id of ids) expect(upgradeLevel(g, id), id).toBe(real.upgrades[id].maxLevel);
    for (const id of ids) {
      const f = real.upgrades[id].feature;
      if (f) expect(g.state.features[f], `${id} -> ${f}`).toBe(1);
    }
    expect(g.state.features.buyMax).toBe(1);
    expect(g.state.features.hull).toBe(1);
    expect(g.state.features.cosmos).toBe(1);
    modsAreSane(g);

    // each layer's reset drops the trees below it and nothing else
    runPrestige(g, 2);
    for (const id of ids) expect(upgradeLevel(g, id), id).toBe(real.upgrades[id].layer === 1 ? 0 : real.upgrades[id].maxLevel);
    runPrestige(g, 3);
    for (const id of ids) expect(upgradeLevel(g, id), id).toBe(real.upgrades[id].layer === 3 ? real.upgrades[id].maxLevel : 0);
    modsAreSane(g);
    expect(findBadNumber(g.state)).toBeNull();
  });

  it("spends only the layer's own currency for a single upgrade", () => {
    const { g } = makeGame({ content: real });
    const p = g.state.prestige;
    for (const id of Object.keys(real.upgrades)) {
      const def = real.upgrades[id];
      if (def.requires.length > 0) continue;
      p.stamps = B.big(1e9);
      p.rivets = B.big(1e9);
      p.sparks = B.big(1e9);
      expect(buyUpgrade(g, id), id).toEqual({ ok: true });
      const left = [p.stamps, p.rivets, p.sparks].map((v) => Math.round(B.toNumber(v)));
      for (let layer = 1; layer <= 3; layer++) {
        if (layer === def.layer) expect(left[layer - 1], id).toBe(1e9 - Math.round(def.cost));
        else expect(left[layer - 1], id).toBe(1e9);
      }
    }
  });

  it("can rebuild into every hull class and warp with every mutator", () => {
    const hullIds = Object.keys(real.hulls);
    expect(hullIds).toEqual(["tug", "hauler", "prospector", "clipper", "bulwark", "ark", "colossus"]);
    for (const hull of hullIds) {
      const { g } = makeGame({ content: real });
      setFlag(g, "shipyard_built");
      g.state.prestige.stampsTotal = B.big(1e9);
      const frame = hullFrameItem(g, hull);
      if (hull === "tug") expect(frame).toBeNull();
      else {
        expect(frame).toBe("hull_frame_" + hull);
        expect(rebuild(g, hull), hull).toEqual({ ok: false, reason: "items" });
        addItem(g, frame!, 1);
      }
      expect(rebuild(g, hull), hull).toEqual({ ok: true });
      const def = real.hulls[hull];
      expect(g.state.hull.cls).toBe(hull);
      expect([g.state.grid.w, g.state.grid.h, g.state.grid.cells.length]).toEqual([def.grid.w, def.grid.h, def.grid.w * def.grid.h]);
      expect(g.state.grid.open).toBe(4);
      modsAreSane(g);
    }

    const mutatorIds = Object.keys(real.mutators);
    expect(mutatorIds.length).toBeGreaterThanOrEqual(2);
    const { g, world } = makeGame({ content: real });
    expect(validMutators(g, mutatorIds.slice(0, 2))).toBe(true);
    expect(validMutators(g, mutatorIds.slice(0, 3))).toBe(false);
    for (let i = 0; i < mutatorIds.length; i++) {
      world.isCore = true;
      g.state.lifetime = B.big(1e12);
      const pair = [mutatorIds[i], mutatorIds[(i + 1) % mutatorIds.length]];
      const plain = 22 * g.mods.stampGain;
      // the mutators picked for the last galaxy pay out on this warp
      const active = g.state.prestige.mutators;
      let reward = 1;
      for (const id of active) reward *= real.mutators[id].reward;
      expect(Math.round(B.toNumber(stampsOnWarp(g)))).toBe(Math.floor(Math.floor(plain) * reward));
      expect(warp(g, pair), pair.join("+")).toEqual({ ok: true });
      expect(g.state.prestige.mutators).toEqual(pair);
      modsAreSane(g);
    }
    expect(findBadNumber(g.state)).toBeNull();
  });

  it("owns the start cosmetics and issues doable quests from the shipped templates", () => {
    const { g } = makeGame({ content: real, wallMs: 20_000 * DAY_MS });
    const starts = Object.values(real.cosmetics).filter((c) => c.unlock.start);
    expect(starts.length).toBeGreaterThan(0);
    for (const c of starts) expect(g.state.cosmetics.owned).toContain(c.id);
    expect(real.cosmetics[g.state.cosmetics.paint]?.kind).toBe("paint");

    unlockFeature(g, "quests");
    unlockFeature(g, "weekly");
    run(g, 1.1);
    const daily = dailyQuests(g);
    expect(daily).toHaveLength(3);
    // nothing but the two features above is unlocked: no quest may need crafting, jumps, a station...
    const needsFeature = ["crafts", "craftsT2", "modulesBuilt", "jumps", "planetsScanned", "trades", "contracts", "researchLevels", "overdrives", "coffee", "tapeUsed"];
    for (const q of daily) expect(needsFeature, q.id).not.toContain(q.template?.stat);
    expect(g.state.quests.weekly).not.toBeNull();
    expect(needsFeature).not.toContain(real.quests.find((t) => t.id === g.state.quests.weekly?.id)?.stat);

    for (let day = 20_000; day < 20_060; day++) {
      const picked = pickDaily(real, 5, day);
      expect(new Set(picked.map((t) => t.id)).size).toBe(3);
      expect(picked.some((t) => t.weekly)).toBe(false);
    }
    for (let week = 2850; week < 2900; week++) {
      const pick = pickWeekly(real, week);
      expect(pick.template?.weekly).toBe(true);
      expect(real.mutators[pick.mutator ?? ""]).toBeDefined();
    }
  });
});

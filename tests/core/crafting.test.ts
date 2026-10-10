import { describe, expect, it } from "vitest";
import * as B from "../../src/engine/big";
import {
  canCraft,
  cancelCraft,
  corePrestige,
  craftableRecipes,
  moveCraft,
  queueCraft,
  rollQuality,
  setKeep,
  syncRates,
  toggleAutoRecipe,
} from "../../src/engine/core";
import { addItem } from "../../src/engine/kernel";
import type { ContentDB, Game } from "../../src/engine/types";
import { content, levels, makeGame, num, run, system } from "./fixture";

/** Ship with stations built, no mining income to disturb the counts. */
function workshopGame(custom?: ContentDB): Game {
  const g = makeGame({ sys: system(0, [{ item: "organics", w: 1 }]), content: custom });
  levels(g, { cargo: 30, refinery: 1, fabricator: 1, workshop: 1, reactor: 3 });
  for (const id of ["scrap", "ice", "alloy", "water", "slag", "circuit", "silicates", "duct_tape", "plating"]) setKeep(g, id, 1);
  syncRates(g);
  return g;
}

describe("crafting", () => {
  it("knows start recipes and unlocks the rest by deck level and blueprint", () => {
    const g = workshopGame();
    expect(craftableRecipes(g, "refinery")).toEqual(["r_alloy", "r_water"]);
    expect(craftableRecipes(g, "fabricator")).toEqual(["r_circuit", "r_laser"]);
    expect(queueCraft(g, "r_plating")).toEqual({ ok: false, reason: "locked" });
    levels(g, { fabricator: 5 });
    run(g, 1.1);
    expect(craftableRecipes(g, "fabricator")).toContain("r_plating");

    expect(g.api.unlockRecipe("nope")).toBe(false);
    expect(g.api.unlockRecipe("r_alloy")).toBe(false); // already known
    const first = g.api.grantBlueprint();
    const second = g.api.grantBlueprint();
    expect([first, second].sort()).toEqual(["r_gate", "r_shield"]);
    expect(g.api.grantBlueprint()).toBeNull();
    expect(g.state.stats.blueprints).toBe(2);
    expect(g.outbox.filter((e) => e.t === "blueprint").length).toBe(2);
  });

  it("runs a batch, takes inputs on completion and rolls by-products", () => {
    const g = workshopGame();
    addItem(g, "scrap", 2000);
    syncRates(g);
    expect(canCraft(g, "r_alloy").ok).toBe(true);
    expect(queueCraft(g, "r_alloy", 400).ok).toBe(true);
    run(g, 3.5);
    expect(g.state.inv.alloy).toBeUndefined(); // 4 s per batch
    expect(num(g.state.inv.scrap)).toBe(2000);
    run(g, 1);
    expect(num(g.state.inv.alloy)).toBe(1);
    expect(num(g.state.inv.scrap)).toBe(1998);
    expect(g.outbox.some((e) => e.t === "craftDone" && e.recipe === "r_alloy" && e.station === "refinery")).toBe(true);
    run(g, 4 * 399 + 1);
    expect(num(g.state.inv.alloy)).toBe(400);
    expect(num(g.state.inv.scrap)).toBe(1200);
    expect(g.state.craft.refinery.queue.length).toBe(0); // finished jobs leave the queue
    // slag: 25 % per batch
    const slag = num(g.state.inv.slag);
    expect(slag).toBeGreaterThan(70);
    expect(slag).toBeLessThan(130);
    expect(g.state.stats.crafts).toBe(400);
    expect(g.state.stats.craftsT1).toBe(400);
  });

  it("batch size follows the station output and craftBatch, limited by inputs", () => {
    const g = workshopGame();
    levels(g, { refinery: 10 }); // exp: 10 * 2 = 20 per batch
    expect(num(g.rates.craftBatch.refinery)).toBe(20);
    addItem(g, "ice", 50);
    queueCraft(g, "r_water", -1);
    run(g, 2.05);
    expect(num(g.state.inv.water)).toBe(20);
    run(g, 2);
    expect(num(g.state.inv.water)).toBe(40);
    run(g, 2);
    expect(num(g.state.inv.water)).toBe(50); // only 10 ice were left
    expect(g.state.inv.ice).toBeUndefined();
    run(g, 5);
    expect(g.state.craft.refinery.queue[0].stalled).toBe("inputs");
    expect(g.state.craft.refinery.queue[0].left).toBe(-1); // repeat job stays
    g.state.buffs.push({ effect: { stat: "craftBatch", mul: 2.5 }, until: 1e9, src: "t" });
    g.state.buffs.push({ effect: { stat: "craftSpeed", mul: 2 }, until: 1e9, src: "t2" });
    g.dirty = true;
    addItem(g, "ice", 1000);
    run(g, 1.1);
    expect(num(g.rates.craftBatch.refinery)).toBe(50);
    expect(num(g.state.inv.water)).toBe(100); // 1 s per batch now
    expect(g.state.craft.refinery.queue[0].stalled).toBeUndefined();
  });

  it("stalls on missing inputs without blocking the next job, and on a full hold", () => {
    const g = workshopGame();
    levels(g, { refinery: 1 });
    addItem(g, "ice", 3);
    queueCraft(g, "r_alloy", 2); // no scrap
    queueCraft(g, "r_water", 2);
    run(g, 4.2);
    const [alloy, water] = g.state.craft.refinery.queue;
    expect(alloy.stalled).toBe("inputs");
    expect(alloy.progress).toBe(0);
    expect(g.state.craft.refinery.queue.length).toBe(1); // water job done and removed
    expect(water).toBeUndefined();
    expect(num(g.state.inv.water)).toBe(2);

  });

  it("reports a cargo stall when the product cannot be stored, and resumes when room appears", () => {
    const extra = { id: "r_test", station: "refinery", tier: 1, inputs: { relic: 1 }, outputs: { alloy: 5 }, time: 1, unlock: { start: true } } as const;
    const g = workshopGame({ ...content, recipes: { ...content.recipes, r_test: extra } });
    const cap = num(g.rates.cargoCap);
    addItem(g, "relic", 3); // no mass: consuming it frees no room
    addItem(g, "duct_tape", cap - 2);
    run(g, 6); // the cargo sweep notices the tape, mining fills the last two units
    queueCraft(g, "r_test", 1);
    run(g, 3);
    expect(g.state.craft.refinery.queue[0].stalled).toBe("cargo");
    expect(num(g.state.inv.relic)).toBe(3); // nothing was taken
    expect(g.state.inv.alloy).toBeUndefined();
    g.state.inv.duct_tape = B.big(100);
    run(g, 3);
    expect(num(g.state.inv.alloy)).toBe(5);
    expect(num(g.state.inv.relic)).toBe(2);
    expect(g.state.craft.refinery.queue.length).toBe(0);
  });

  it("a blocked station shows a power stall", () => {
    const g = workshopGame();
    addItem(g, "scrap", 10);
    queueCraft(g, "r_alloy", 1);
    g.state.failure = { kind: "blackout", since: 0, waitUntil: 0, tow: null };
    g.dirty = true;
    run(g, 6);
    expect(g.state.craft.refinery.queue[0].stalled).toBe("power");
    expect(g.state.inv.alloy).toBeUndefined();
    g.state.failure = null;
    g.dirty = true;
    run(g, 4.3);
    expect(num(g.state.inv.alloy)).toBe(1);
  });

  it("parallel slots come from the station level", () => {
    const g = workshopGame();
    levels(g, { refinery: 25, reactor: 10 });
    expect(g.rates.craftSlots.refinery).toBe(2);
    levels(g, { refinery: 200, reactor: 40 });
    expect(g.rates.craftSlots.refinery).toBe(4); // capped
    levels(g, { refinery: 25 });
    addItem(g, "scrap", 10000);
    addItem(g, "ice", 10000);
    queueCraft(g, "r_alloy", -1);
    queueCraft(g, "r_water", -1);
    queueCraft(g, "r_water", -1);
    run(g, 4.05);
    const q = g.state.craft.refinery.queue;
    expect(g.state.inv.alloy.m).toBeGreaterThan(0);
    expect(g.state.inv.water.m).toBeGreaterThan(0);
    expect(q[2].progress).toBe(0); // third job waits for a slot
  });

  it("module recipes are batch 1 and produce module instances with a quality", () => {
    const g = workshopGame();
    levels(g, { fabricator: 30, reactor: 20 });
    expect(num(g.rates.craftBatch.fabricator)).toBeGreaterThan(1);
    addItem(g, "circuit", 20);
    addItem(g, "alloy", 30);
    queueCraft(g, "r_laser", 3);
    run(g, 31);
    expect(g.state.modules.length).toBe(3);
    expect(num(g.state.inv.circuit)).toBe(14);
    expect(num(g.state.inv.alloy)).toBe(21);
    for (const m of g.state.modules) {
      expect(m.item).toBe("mod_laser_mk1");
      expect(m.hp).toBe(100);
      expect(m.slot).toBe(-1);
      expect([0, 1, 2, 3, 4]).toContain(m.q);
    }
    expect(g.state.stats.modulesBuilt).toBe(3);
    expect(g.state.stats.craftsT3).toBe(3);
    const done = g.outbox.filter((e) => e.t === "craftDone" && e.recipe === "r_laser");
    expect(done.length).toBe(3);
    expect(done.every((e) => e.t === "craftDone" && e.quality !== undefined)).toBe(true);
  });

  it("megastructures (mass 0) go to the inventory, grant their effects once and set the prestige flags", () => {
    const g = workshopGame();
    g.api.unlockRecipe("r_gate");
    addItem(g, "plating", 14);
    expect(g.mods.powerOut).toBe(1);
    queueCraft(g, "r_gate", 2);
    run(g, 61);
    expect(num(g.state.inv.mega_gate)).toBe(1);
    expect(g.state.stats.craftsT4).toBe(1);
    run(g, 0.2);
    expect(g.mods.powerOut).toBe(1.5);
    expect(g.mods.eventLuck).toBeCloseTo(1.1, 9);
    run(g, 61);
    expect(num(g.state.inv.mega_gate)).toBe(2);
    expect(g.mods.powerOut).toBe(1.5); // owning two does not stack

    expect(g.state.flags.shipyard_built).toBeUndefined();
    g.state.story.chapter = 8;
    run(g, 1.1); // chapter recipes unlock on the housekeeping pass
    expect(queueCraft(g, "r_shipyard", 1).ok).toBe(true);
    expect(queueCraft(g, "r_wormhole", 1).ok).toBe(true);
    run(g, 11);
    expect(g.state.flags.shipyard_built).toBe(1);
    expect(g.state.flags.gate_built).toBe(1);

    // warp: megastructures go, the shipyard and its flag stay; a rebuild takes those too
    corePrestige(g, 1);
    expect(g.state.inv.mega_gate).toBeUndefined();
    expect(g.state.inv.wormhole_gate).toBeUndefined();
    expect(num(g.state.inv.shipyard)).toBe(1);
    expect(g.state.flags.gate_built).toBeUndefined();
    expect(g.state.flags.shipyard_built).toBe(1);
    syncRates(g);
    expect(g.mods.powerOut).toBe(1);
    corePrestige(g, 2);
    expect(g.state.inv.shipyard).toBeUndefined();
    expect(g.state.flags.shipyard_built).toBeUndefined();
  });

  it("quality distribution matches the GDD and shifts with qualityLuck", () => {
    const g = makeGame({ seed: 99 });
    const n = 20000;
    const count = [0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) count[rollQuality(g)]++;
    const expected = [0.15, 0.5, 0.25, 0.08, 0.02];
    for (let q = 0; q < 5; q++) expect(Math.abs(count[q] / n - expected[q])).toBeLessThan(0.012);

    g.state.buffs.push({ effect: { stat: "qualityLuck", mul: 2 }, until: 1e9, src: "luck" });
    g.dirty = true;
    syncRates(g);
    const lucky = [0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) lucky[rollQuality(g)]++;
    // weights 7.5 / 50 / 50 / 32 / 16
    const total = 155.5;
    const shifted = [7.5 / total, 50 / total, 50 / total, 32 / total, 16 / total];
    for (let q = 0; q < 5; q++) expect(Math.abs(lucky[q] / n - shifted[q])).toBeLessThan(0.012);
    expect(lucky[4]).toBeGreaterThan(count[4] * 3);
    expect(lucky[0]).toBeLessThan(count[0]);
  });

  it("queue management: cancel, move, bounds", () => {
    const g = workshopGame();
    for (let i = 0; i < 12; i++) expect(queueCraft(g, i % 2 ? "r_alloy" : "r_water", 1).ok).toBe(true);
    expect(queueCraft(g, "r_alloy", 1)).toEqual({ ok: false, reason: "max" });
    const q = g.state.craft.refinery.queue;
    const ids = q.map((j) => j.uid);
    expect(moveCraft(g, "refinery", ids[5], -5).ok).toBe(true);
    expect(q[0].uid).toBe(ids[5]);
    expect(moveCraft(g, "refinery", ids[5], 100).ok).toBe(true);
    expect(q[11].uid).toBe(ids[5]);
    expect(cancelCraft(g, "refinery", ids[5]).ok).toBe(true);
    expect(q.length).toBe(11);
    expect(cancelCraft(g, "refinery", 424242)).toEqual({ ok: false, reason: "noTarget" });
    expect(queueCraft(g, "r_alloy", 0).ok).toBe(false);
    expect(queueCraft(g, "r_alloy", NaN).ok).toBe(false);
    expect(queueCraft(g, "missing").ok).toBe(false);
  });

  it("auto-queue re-adds listed recipes when inputs exist (feature gated)", () => {
    const g = workshopGame();
    expect(toggleAutoRecipe(g, "r_water")).toEqual({ ok: false, reason: "locked" });
    g.state.features.autoQueue = 1;
    expect(toggleAutoRecipe(g, "r_water").ok).toBe(true);
    run(g, 5);
    expect(g.state.craft.refinery.queue.length).toBe(0); // no ice, nothing queued
    addItem(g, "ice", 3);
    run(g, 16);
    expect(num(g.state.inv.water)).toBe(3);
    expect(g.state.craft.refinery.queue.length).toBe(0);
    expect(toggleAutoRecipe(g, "r_water").ok).toBe(true); // toggles off
    expect(g.state.autoRecipes).toEqual([]);
  });

  it("crafted goods above the reserve are sold and count as income", () => {
    const g = workshopGame();
    setKeep(g, "alloy", 0);
    addItem(g, "scrap", 100);
    queueCraft(g, "r_alloy", 10);
    const before = num(g.state.credits);
    run(g, 41);
    expect(g.state.inv.alloy).toBeUndefined();
    // 10 alloy at 5 credits * 0.6 broker fee (+ organics trickle from mining)
    expect(num(g.state.credits) - before).toBeGreaterThan(30);
    expect(num(g.rates.income)).toBeGreaterThan(0.5);
  });
});

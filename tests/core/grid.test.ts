import { describe, expect, it } from "vitest";
import * as B from "../../src/engine/big";
import {
  addModule,
  adjacentSame,
  botRate,
  clearGlitch,
  findModule,
  installModule,
  integrityFactor,
  moduleBonus,
  previewInstall,
  removeModule,
  repairWithItem,
  resolveMinigame,
  scrapModule,
  setAutoMaintenance,
  setRepairPriority,
  startManualRepair,
  syncRates,
  upgradeCost,
  upgradeModule,
  wearPerSecond,
} from "../../src/engine/core";
import { addItem } from "../../src/engine/kernel";
import type { Game, ModuleInst } from "../../src/engine/types";
import { content, levels, makeGame, num, run } from "./fixture";

function gridGame(): Game {
  const g = makeGame();
  g.state.grid.open = 9;
  levels(g, { reactor: 10 });
  return g;
}

function mod(g: Game, family: string, q: 0 | 1 | 2 | 3 | 4 = 1): ModuleInst {
  return findModule(g, addModule(g, `mod_${family}_mk1`, q))!;
}

describe("tech grid", () => {
  it("installs, swaps, removes and respects the open cells", () => {
    const g = makeGame();
    const a = mod(g, "laser");
    const b = mod(g, "cargo");
    expect(installModule(g, a.uid, 4)).toEqual({ ok: false, reason: "locked" }); // 4 cells open: 0..3
    expect(installModule(g, 999, 0)).toEqual({ ok: false, reason: "noTarget" });
    expect(installModule(g, a.uid, 0).ok).toBe(true);
    expect(g.state.grid.cells[0]).toBe(a.uid);
    expect(g.state.stats.modulesInstalled).toBe(1);
    // storage -> occupied cell: the old module goes to storage
    expect(installModule(g, b.uid, 0).ok).toBe(true);
    expect(a.slot).toBe(-1);
    expect(b.slot).toBe(0);
    // grid -> occupied cell: swap
    installModule(g, a.uid, 1);
    installModule(g, a.uid, 0);
    expect(a.slot).toBe(0);
    expect(b.slot).toBe(1);
    expect(g.state.grid.cells.slice(0, 2)).toEqual([a.uid, b.uid]);
    expect(g.state.stats.modulesInstalled).toBe(3);
    expect(removeModule(g, a.uid).ok).toBe(true);
    expect(g.state.grid.cells[0]).toBe(0);
    expect(a.slot).toBe(-1);
  });

  it("applies quality, level, integrity and adjacency to the module's effects", () => {
    const g = gridGame();
    const a = mod(g, "laser", 1);
    installModule(g, a.uid, 0);
    syncRates(g);
    expect(g.mods.mineRate).toBeCloseTo(1.2, 9); // +20 % at Standard
    expect(moduleBonus(g, a)).toBe(1);

    const b = mod(g, "laser", 4); // Pristine x2.1
    installModule(g, b.uid, 1); // right of cell 0: adjacent
    syncRates(g);
    expect(adjacentSame(g, a)).toBe(1);
    expect(moduleBonus(g, a)).toBeCloseTo(1.15, 9);
    expect(moduleBonus(g, b)).toBeCloseTo(2.1 * 1.15, 9);
    expect(g.mods.mineRate).toBeCloseTo(1 + 0.2 * 1.15 + 0.2 * 2.1 * 1.15, 9);

    // diagonal is not adjacent (3x3: cell 4 is the centre, cell 0 the corner)
    installModule(g, b.uid, 4);
    syncRates(g);
    expect(adjacentSame(g, a)).toBe(0);
    expect(g.mods.mineRate).toBeCloseTo(1 + 0.2 + 0.2 * 2.1, 9);
    // a different family next door gives nothing
    const c = mod(g, "cargo");
    installModule(g, c.uid, 1);
    syncRates(g);
    expect(adjacentSame(g, a)).toBe(0);
    expect(g.mods.cargoCap).toBeCloseTo(1.2, 9);
    // the row does not wrap: cells 2 and 3 are not neighbours
    installModule(g, a.uid, 2);
    installModule(g, b.uid, 3);
    expect(adjacentSame(g, a)).toBe(0);

    // level: +10 % each, cost value * 40 * 1.6^lvl
    expect(num(upgradeCost(g, a))).toBeCloseTo(500 * 40, 6);
    expect(upgradeModule(g, a.uid)).toEqual({ ok: false, reason: "credits" });
    g.state.credits = B.big(1e9);
    expect(upgradeModule(g, a.uid).ok).toBe(true);
    expect(upgradeModule(g, a.uid).ok).toBe(true);
    expect(num(upgradeCost(g, a))).toBeCloseTo(500 * 40 * 1.6 * 1.6, 6);
    expect(moduleBonus(g, a)).toBeCloseTo(1.2, 9);
  });

  it("scales multiplicative effects as mul^k, so reductions stay reductions", () => {
    const custom = {
      ...content,
      items: {
        ...content.items,
        mod_engine_mk1: { ...content.items.mod_engine_mk1, module: { ...content.items.mod_engine_mk1.module!, effects: [{ stat: "fuelUse" as const, mul: 0.8 }, { stat: "jumpCharge" as const, mul: 1.5 }] } },
      },
    };
    const g = makeGame({ content: custom });
    const m = findModule(g, addModule(g, "mod_engine_mk1", 4))!; // k = 2.1
    installModule(g, m.uid, 0);
    syncRates(g);
    expect(g.mods.fuelUse).toBeCloseTo(Math.pow(0.8, 2.1), 9);
    expect(g.mods.jumpCharge).toBeCloseTo(Math.pow(1.5, 2.1), 9);
    m.hp = 35; // degraded: factor 0.7
    g.dirty = true;
    syncRates(g);
    expect(g.mods.fuelUse).toBeCloseTo(Math.pow(0.8, 2.1 * 0.7), 9);
  });

  it("integrity factor follows the 50 % / 20 % thresholds", () => {
    const g = makeGame();
    expect(integrityFactor(g, 100)).toBe(1);
    expect(integrityFactor(g, 50)).toBe(1);
    expect(integrityFactor(g, 35)).toBeCloseTo(0.7, 9);
    expect(integrityFactor(g, 20)).toBeCloseTo(0.4, 9);
    expect(integrityFactor(g, 19.99)).toBe(0);
    expect(integrityFactor(g, 0)).toBe(0);
  });

  it("module power feeds supply and demand", () => {
    const g = gridGame();
    const before = { ...g.rates.power };
    const r = mod(g, "reactor", 2); // supplies 20 * 1.25
    const l = mod(g, "laser"); // draws 4
    installModule(g, r.uid, 0);
    installModule(g, l.uid, 2);
    syncRates(g);
    // the reactor module also raises powerOut by 20 % * 1.25
    expect(g.rates.power.supply).toBeCloseTo(before.supply * 1.25 + 25, 6);
    expect(g.rates.power.demand).toBeCloseTo(before.demand + 4, 6);
  });

  it("previewInstall reports the exact stat deltas without touching the game", () => {
    const g = gridGame();
    const a = mod(g, "laser", 2);
    const b = mod(g, "laser", 3);
    const c = mod(g, "cargo", 1);
    installModule(g, a.uid, 0);
    installModule(g, c.uid, 1);
    syncRates(g);
    const snapshot = JSON.stringify(g.state);
    const rev = g.rev;
    const modsBefore = { ...g.mods };

    // b next to a, displacing the cargo module
    const p = previewInstall(g, b.uid, 1);
    expect(p.ok).toBe(true);
    expect(p.displaced).toBe(c.uid);
    expect(p.adjacent).toBe(1);
    expect(p.bonus).toBeCloseTo(1.6 * 1.15, 9);
    expect(JSON.stringify(g.state)).toBe(snapshot);
    expect(g.rev).toBe(rev);
    expect(g.mods).toEqual(modsBefore);
    expect(g.dirty).toBe(false);

    const mine = p.stats.find((s) => s.stat === "mineRate")!;
    const cargo = p.stats.find((s) => s.stat === "cargoCap")!;
    expect(mine.from).toBeCloseTo(g.mods.mineRate, 9);
    expect(cargo.to).toBe(1);
    expect(p.stats.length).toBe(2);
    expect(p.power.to - p.power.from).toBeCloseTo(0, 9); // one 4-unit module replaces another

    // now do it for real: the preview was exact
    installModule(g, b.uid, 1);
    syncRates(g);
    expect(g.mods.mineRate).toBeCloseTo(mine.to, 9);
    expect(g.mods.cargoCap).toBeCloseTo(cargo.to, 9);
    expect(mine.to).toBeCloseTo(1 + 0.2 * 1.25 * 1.15 + 0.2 * 1.6 * 1.15, 9);

    // removal preview and error cases
    const rm = previewInstall(g, b.uid, -1);
    expect(rm.stats.find((s) => s.stat === "mineRate")!.to).toBeCloseTo(1 + 0.2 * 1.25, 9);
    expect(previewInstall(g, 12345, 0)).toMatchObject({ ok: false, reason: "noTarget" });
    g.state.grid.open = 4;
    expect(previewInstall(g, c.uid, 7)).toMatchObject({ ok: false, reason: "locked" });
  });

  it("scrap refunds part of the input value and cleans up references", () => {
    const g = gridGame();
    const a = mod(g, "laser");
    installModule(g, a.uid, 0);
    setRepairPriority(g, [a.uid, 0]);
    syncRates(g);
    const before = num(g.state.credits);
    expect(scrapModule(g, a.uid).ok).toBe(true);
    // r_laser inputs: 2 circuit (30) + 3 alloy (5) = 75 value, half of it at the broker price
    expect(num(g.state.credits) - before).toBeCloseTo(75 * 0.5 * 0.6, 6);
    expect(g.state.modules.length).toBe(0);
    expect(g.state.grid.cells[0]).toBe(0);
    expect(g.state.repair.priority).toEqual([0]);
    expect(num(g.state.lifetime)).toBe(0); // refunds are not earnings
    expect(scrapModule(g, a.uid)).toEqual({ ok: false, reason: "noTarget" });
  });

  it("module storage is bounded", () => {
    const g = makeGame();
    for (let i = 0; i < 200; i++) addModule(g, "mod_laser_mk1", 1);
    expect(g.state.modules.length).toBeLessThanOrEqual(80);
    expect(addModule(g, "scrap")).toBe(0);
  });
});

describe("wear", () => {
  it("wears installed modules at spec.wear per hour, scaled by quality and wearRate", () => {
    const g = gridGame();
    const std = mod(g, "laser", 1);
    const pristine = mod(g, "cargo", 4);
    const stored = mod(g, "shield", 1);
    installModule(g, std.uid, 0);
    installModule(g, pristine.uid, 2);
    syncRates(g);
    expect(wearPerSecond(g, std) * 3600).toBeCloseTo(5, 9);
    expect(wearPerSecond(g, pristine) * 3600).toBeCloseTo(2.5, 9);
    run(g, 3600);
    expect(std.hp).toBeCloseTo(95, 2);
    expect(pristine.hp).toBeCloseTo(97.5, 2);
    expect(stored.hp).toBe(100);

    g.api.hazardFactor = () => 2;
    g.state.buffs.push({ effect: { stat: "wearRate", mul: 1.5 }, until: 1e9, src: "w" });
    g.dirty = true;
    run(g, 3600);
    expect(std.hp).toBeCloseTo(95 - 15, 2);
  });

  it("holding and overdrive raise wear", () => {
    const a = gridGame();
    const b = gridGame();
    const ma = mod(a, "laser");
    const mb = mod(b, "laser");
    installModule(a, ma.uid, 0);
    installModule(b, mb.uid, 0);
    b.state.active.overdriveUntil = 1e9;
    run(a, 600);
    run(b, 600);
    expect((100 - mb.hp) / (100 - ma.hp)).toBeCloseTo(2, 2);
  });

  it("only rebuilds modifiers on threshold crossings and whole-percent steps", () => {
    const g = gridGame();
    const m = mod(g, "laser");
    installModule(g, m.uid, 0);
    // 720 %/h = 0.2 %/s
    g.state.buffs.push({ effect: { stat: "wearRate", mul: 144 }, until: 1e9, src: "w" });
    g.dirty = true;
    run(g, 1);
    const rev0 = g.rev;
    run(g, 200); // 100 -> ~60: healthy the whole time
    expect(m.hp).toBeGreaterThan(55);
    expect(g.rev).toBe(rev0);
    expect(g.mods.mineRate).toBeCloseTo(1.2, 9);

    run(g, 100); // crosses 50 -> ~40
    expect(m.hp).toBeLessThan(45);
    const steps = g.rev - rev0;
    // one rebuild at the threshold, then one per whole percent (not one per second)
    expect(steps).toBeGreaterThanOrEqual(5);
    expect(steps).toBeLessThanOrEqual(13);
    run(g, 0.2);
    expect(g.mods.mineRate).toBeCloseTo(1 + 0.2 * integrityFactor(g, m.hp), 2);
    expect(g.mods.mineRate).toBeLessThan(1.19);

    g.outbox.length = 0;
    run(g, 130); // crosses 20: offline
    expect(m.hp).toBeLessThan(20);
    expect(g.outbox.filter((e) => e.t === "moduleBroken").length).toBe(1);
    expect(g.mods.mineRate).toBe(1);
    // an offline module is not running, so it stops wearing
    const hp = m.hp;
    run(g, 100);
    expect(m.hp).toBe(hp);
  });

  it("api.damageModules, damageHull (shield, hullMax, breach) and repairAll", () => {
    const g = gridGame();
    const a = mod(g, "laser");
    const b = mod(g, "cargo");
    const s = mod(g, "shield");
    installModule(g, a.uid, 0);
    installModule(g, b.uid, 1);
    syncRates(g);
    expect(g.api.damageModules(30, 5, "laser")).toEqual([a.uid]);
    expect(a.hp).toBe(70);
    expect(g.api.damageModules(10, 2).sort()).toEqual([a.uid, b.uid].sort());
    expect(s.hp).toBe(100); // stored modules are safe
    g.state.buffs.push({ effect: { stat: "shield", mul: 0.5 }, until: 1e9, src: "sh" });
    g.dirty = true;
    syncRates(g);
    g.api.damageModules(20, 1, "cargo");
    expect(b.hp).toBe(80);

    g.api.damageHull(40);
    expect(g.state.hull.hp).toBe(80); // shield halves it
    installModule(g, s.uid, 2); // shield module: hullMax +20 %
    syncRates(g);
    g.api.damageHull(24);
    expect(g.state.hull.hp).toBeCloseTo(70, 9);
    expect(g.outbox.filter((e) => e.t === "hullDamage").length).toBe(2);

    g.api.repairAll(15);
    expect(a.hp).toBe(75);
    expect(b.hp).toBe(95);
    expect(g.state.hull.hp).toBeCloseTo(85, 9);

    let breach = 0;
    g.api.startFailure = (kind) => {
      if (kind === "breach") breach++;
      return true;
    };
    g.api.damageHull(1000);
    expect(g.state.hull.hp).toBe(0);
    expect(breach).toBe(1);
  });
});

describe("repair", () => {
  it("consumables restore their amount up to their cap", () => {
    const g = gridGame();
    const m = mod(g, "laser");
    installModule(g, m.uid, 0);
    addItem(g, "duct_tape", 10);
    addItem(g, "spare_parts", 10);
    addItem(g, "nano_gel", 1);
    m.hp = 30;
    expect(repairWithItem(g, m.uid, "duct_tape").ok).toBe(true);
    expect(m.hp).toBe(45);
    expect(repairWithItem(g, m.uid, "duct_tape").ok).toBe(true);
    expect(m.hp).toBe(60); // cap 60
    expect(repairWithItem(g, m.uid, "duct_tape")).toEqual({ ok: false, reason: "max" });
    expect(num(g.state.inv.duct_tape)).toBe(8);
    expect(g.state.stats.tapeUsed).toBe(2);
    expect(repairWithItem(g, m.uid, "spare_parts").ok).toBe(true);
    expect(m.hp).toBe(90); // 60 + 40 capped at 90
    expect(repairWithItem(g, m.uid, "spare_parts")).toEqual({ ok: false, reason: "max" });
    expect(repairWithItem(g, m.uid, "nano_gel").ok).toBe(true);
    expect(m.hp).toBe(100);
    expect(g.state.inv.nano_gel).toBeUndefined();
    expect(repairWithItem(g, m.uid, "nano_gel")).toEqual({ ok: false, reason: "max" });
    // hull is target 0
    g.state.hull.hp = 50;
    expect(repairWithItem(g, 0, "duct_tape").ok).toBe(true);
    expect(g.state.hull.hp).toBe(60);
    expect(repairWithItem(g, 0, "coffee")).toEqual({ ok: false, reason: "invalid" });
    expect(repairWithItem(g, 4242, "duct_tape")).toEqual({ ok: false, reason: "noTarget" });
    // every unit can be used, float noise never strands the last one
    m.hp = 0;
    for (let i = 0; i < 4; i++) expect(repairWithItem(g, m.uid, "duct_tape").ok).toBe(true);
    for (let i = 0; i < 3; i++) {
      g.state.hull.hp = 10;
      expect(repairWithItem(g, 0, "duct_tape").ok).toBe(true);
    }
    expect(g.state.inv.duct_tape).toBeUndefined();
    g.state.hull.hp = 10;
    expect(repairWithItem(g, 0, "duct_tape")).toEqual({ ok: false, reason: "items" });
  });

  it("manual repair picks the mini-game by family and restores 40 + 60 * score", () => {
    const g = gridGame();
    const laser = mod(g, "laser");
    const cargo = mod(g, "cargo");
    installModule(g, laser.uid, 0);
    installModule(g, cargo.uid, 2);
    expect(startManualRepair(g, laser.uid)).toEqual({ ok: false, reason: "max" });
    laser.hp = 10;
    cargo.hp = 10;
    expect(startManualRepair(g, laser.uid).ok).toBe(true);
    expect(g.state.minigame).toMatchObject({ game: "calibrate", tier: 1, purpose: "repair", ref: laser.uid });
    expect(g.outbox.some((e) => e.t === "minigameRequest")).toBe(true);
    expect(startManualRepair(g, cargo.uid)).toEqual({ ok: false, reason: "busy" });
    expect(resolveMinigame(g, { score: 0.5, success: true, perfect: false, durationMs: 30000 }).ok).toBe(true);
    expect(laser.hp).toBe(10 + 40 + 30);
    expect(g.state.minigame).toBeNull();
    expect(g.state.stats.repairsManual).toBe(1);
    expect(g.state.stats.minigames).toBe(1);
    expect(g.state.stats.minigame_calibrate).toBe(1);
    expect(g.state.buffs.length).toBe(0);

    expect(startManualRepair(g, cargo.uid).ok).toBe(true);
    expect(g.state.minigame!.game).toBe("tape");
    resolveMinigame(g, { score: 1, success: true, perfect: true, durationMs: 1 });
    expect(cargo.hp).toBe(100);
    expect(g.state.stats.repairsPerfect).toBe(1);
    expect(g.state.stats.minigamesPerfect).toBe(1);
    expect(g.state.buffs).toEqual([{ effect: { stat: "allProd", mul: 1.1 }, until: g.state.t + 600, src: "repairPerfect" }]);

    g.state.hull.hp = 20;
    expect(startManualRepair(g, 0).ok).toBe(true);
    resolveMinigame(g, { score: 0, success: false, perfect: false, durationMs: 1 });
    expect(g.state.hull.hp).toBe(60); // even a failed run patches 40 %
    expect(resolveMinigame(g, { score: 1, success: true, perfect: true, durationMs: 1 })).toEqual({ ok: false, reason: "noTarget" });
  });

  it("bots work down the priority list at 1.5 %/min per level, fixer drones help", () => {
    const g = gridGame();
    const a = mod(g, "laser");
    const b = mod(g, "cargo");
    installModule(g, a.uid, 0);
    installModule(g, b.uid, 2);
    a.hp = 60;
    b.hp = 40;
    run(g, 10);
    expect(g.state.repair.jobs.length).toBe(0); // no bots researched yet
    g.state.repair.botLevel = 2;
    g.content.balance.botGlitchChance = 0;
    expect(botRate(g) * 60).toBeCloseTo(3, 9);
    expect(setRepairPriority(g, [a.uid, a.uid, 777, b.uid]).ok).toBe(true);
    expect(g.state.repair.priority).toEqual([a.uid, b.uid]);
    const wear = wearPerSecond(g, a) * 600;
    run(g, 600);
    expect(g.state.repair.jobs[0].target).toBe(a.uid);
    expect(a.hp).toBeCloseTo(60 + 30 - wear, 0);
    expect(b.hp).toBeLessThan(40.01); // waits for its turn
    levels(g, { hangar: 4 });
    g.state.drones.fixer = 2;
    expect(botRate(g) * 60).toBeCloseTo(4.5, 9);
    run(g, 200);
    expect(a.hp).toBeGreaterThan(99);
    expect(g.state.stats.repairsBot).toBe(1);
    expect(g.outbox.some((e) => e.t === "moduleRepaired" && e.uid === a.uid)).toBe(true);
    run(g, 5);
    expect(g.state.repair.jobs[0].target).toBe(b.uid);
    g.content.balance.botGlitchChance = 0.04;
  });

  it("glitched bot jobs wait for a tap or 30 minutes", () => {
    const g = gridGame();
    const a = mod(g, "laser");
    installModule(g, a.uid, 0);
    a.hp = 60;
    g.state.repair.botLevel = 1;
    g.content.balance.botGlitchChance = 1;
    run(g, 60);
    const job = g.state.repair.jobs[0];
    expect(job.glitchUntil).toBeGreaterThan(g.state.t + 1700);
    expect(a.hp).toBeLessThan(60.001);
    expect(clearGlitch(g, 999)).toEqual({ ok: false, reason: "noTarget" });
    expect(clearGlitch(g, a.uid).ok).toBe(true);
    run(g, 120);
    expect(a.hp).toBeGreaterThan(62);
    // auto-clear: a fresh glitch resolves itself after 30 minutes
    a.hp = 100;
    run(g, 2);
    a.hp = 50;
    run(g, 2);
    expect(g.state.repair.jobs[0].glitchUntil).toBeGreaterThan(g.state.t);
    const hp = a.hp;
    run(g, 1795);
    expect(a.hp).toBeLessThanOrEqual(hp);
    const worn = a.hp;
    run(g, 120);
    expect(a.hp).toBeGreaterThan(worn + 1.5);
    g.content.balance.botGlitchChance = 0.04;
  });

  it("autonomous maintenance patches degraded modules and restocks tape", () => {
    const g = gridGame();
    levels(g, { workshop: 1 });
    const a = mod(g, "laser");
    installModule(g, a.uid, 0);
    expect(setAutoMaintenance(g, true)).toEqual({ ok: false, reason: "locked" });
    g.state.features.autoMaintenance = 1;
    expect(setAutoMaintenance(g, true).ok).toBe(true);
    addItem(g, "duct_tape", 2);
    addItem(g, "scrap", 30);
    addItem(g, "water", 30);
    g.state.keep.scrap = 1;
    g.state.keep.water = 1;
    a.hp = 30;
    run(g, 6);
    expect(a.hp).toBeGreaterThan(44); // one tape used
    run(g, 60);
    expect(a.hp).toBeGreaterThan(59); // taped up to the cap
    expect(num(g.state.inv.duct_tape)).toBeGreaterThanOrEqual(4); // KIPP crafted more
    expect(g.state.stats.crafts).toBeGreaterThan(0);
  });
});

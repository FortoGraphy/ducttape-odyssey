import { describe, expect, it } from "vitest";
import * as B from "@/engine/big";
import { addItem, rebuildMods, setFlag } from "@/engine/kernel";
import {
  buyUpgrade,
  canReboot,
  canRebuild,
  canWarp,
  discover,
  hullFrameItem,
  hullOpenCells,
  reboot,
  rebuild,
  rivetsOnRebuild,
  rivetsTotal,
  sparksOnReboot,
  stampsOnWarp,
  upgradeCost,
  warp,
} from "@/engine/meta";
import type { Game } from "@/engine/types";
import { drain, findBadNumber, makeContent, makeGame } from "./fixture";

const num = B.toNumber;

/** A mid-game save with something in every slice the resets must keep or clear. */
function populate(g: Game): void {
  const s = g.state;
  s.lifetime = B.big(1e12);
  s.allTime = B.big(5e12);
  s.credits = B.big(4e11);
  s.rp = B.big(777);
  s.research = { drill_bits: 8, overclock: 4, smelting: 1 };
  s.recipes = { alloy_basic: 1, plating_bp: 1, lens_bp: 1 };
  s.prestige.stamps = B.big(5);
  s.prestige.stampsTotal = B.big(2500);
  s.prestige.rivets = B.big(3);
  s.prestige.sparks = B.big(2);
  s.prestige.upgrades = { st_gain: 1, rv_gain: 1, sp_time: 2 };
  s.achievements = { buy_10: 1234 };
  s.story.chapter = 4;
  s.story.logs = ["log_a"];
  s.quests.streak = 3;
  s.cosmetics.owned = ["paint_rust", "sticker_a", "trail_blue"];
  s.cosmetics.trail = "trail_blue";
  s.stats.purchases = 321;
  discover(g, "planet:0:1:2:0");
  g.dirty = true;
  rebuildMods(g);
  drain(g);
}

describe("warp stamps", () => {
  it("follows floor(10^((log10(lifetime) - 9) * 0.45))", () => {
    const { g } = makeGame();
    g.state.lifetime = B.big(9.9e8);
    expect(stampsOnWarp(g)).toEqual({ m: 0, e: 0 });
    g.state.lifetime = B.big(1e9);
    expect(num(stampsOnWarp(g))).toBe(1);
    g.state.lifetime = B.big(1e12);
    expect(num(stampsOnWarp(g))).toBe(Math.floor(Math.pow(10, 3 * 0.45)));
    g.state.lifetime = B.big(1e20);
    expect(num(stampsOnWarp(g))).toBe(Math.floor(Math.pow(10, 11 * 0.45)));
    g.state.lifetime = B.big(0);
    expect(stampsOnWarp(g)).toEqual({ m: 0, e: 0 });
  });

  it("is monotonic in lifetime credits and finite far beyond double range", () => {
    const { g } = makeGame();
    let prev = B.big(0);
    for (let l = 0; l <= 400; l += 0.37) {
      g.state.lifetime = B.fromLog10(l);
      const stamps = stampsOnWarp(g);
      expect(Number.isFinite(stamps.m) && Number.isFinite(stamps.e)).toBe(true);
      expect(B.cmp(stamps, prev)).toBeGreaterThanOrEqual(0);
      prev = stamps;
    }
    g.state.lifetime = B.make(1, 400);
    const huge = stampsOnWarp(g);
    expect(B.log10(huge)).toBeCloseTo((400 - 9) * 0.45, 6);
    expect(huge.m).toBeGreaterThanOrEqual(1);
    expect(huge.m).toBeLessThan(10);
  });

  it("multiplies by stampGain and by the reward of the mutators active in this galaxy", () => {
    const { g } = makeGame();
    g.state.lifetime = B.big(1e12);
    const base = num(stampsOnWarp(g)); // 22
    g.state.prestige.upgrades.st_gain = 2; // stampGain +0.5 per level
    rebuildMods(g);
    expect(num(stampsOnWarp(g))).toBe(Math.floor(base * 2));
    g.state.prestige.mutators = ["thin", "fragile"]; // x2 and x1.5
    rebuildMods(g);
    expect(num(stampsOnWarp(g))).toBe(Math.floor(base * 2 * 3));
  });

  it("falls back to code defaults when balance keys are missing", () => {
    const content = makeContent();
    (content as { balance: unknown }).balance = {};
    const { g } = makeGame({ content });
    g.state.lifetime = B.big(1e12);
    expect(num(stampsOnWarp(g))).toBe(22);
    g.state.prestige.stampsTotal = B.big(100);
    expect(num(rivetsOnRebuild(g))).toBe(2);
  });
});

describe("warp", () => {
  it("is available at the core or with a gate", () => {
    const { g, world } = makeGame();
    expect(canWarp(g)).toBe(false);
    expect(warp(g, [])).toEqual({ ok: false, reason: "requirement" });
    world.isCore = true;
    expect(canWarp(g)).toBe(true);
    world.isCore = false;
    setFlag(g, "gate_built");
    expect(canWarp(g)).toBe(true);
    setFlag(g, "gate_built", 0);
    expect(canWarp(g)).toBe(false);
    // the megastructure itself counts as well
    addItem(g, "wormhole_gate", 1);
    expect(canWarp(g)).toBe(true);
  });

  it("rejects bad mutator sets without changing anything", () => {
    const { g, world } = makeGame();
    populate(g);
    world.isCore = true;
    const before = JSON.stringify(g.state);
    expect(warp(g, ["thin", "fragile", "slow"])).toEqual({ ok: false, reason: "invalid" });
    expect(warp(g, ["thin", "thin"])).toEqual({ ok: false, reason: "invalid" });
    expect(warp(g, ["nope"])).toEqual({ ok: false, reason: "invalid" });
    expect(warp(g, ["constructor"])).toEqual({ ok: false, reason: "invalid" });
    expect(JSON.stringify(g.state)).toBe(before);
    expect(world.prestigeCalls).toEqual([]);
  });

  it("pays stamps, resets the run and keeps everything above it", () => {
    const { g, world } = makeGame();
    populate(g);
    world.isCore = true;
    g.state.prestige.hullsOwned.push("hauler");
    g.state.hull.cls = "hauler";
    const codex = JSON.stringify(g.state.codex);

    expect(warp(g, ["thin"])).toEqual({ ok: true });
    const s = g.state;
    const p = s.prestige;
    // 22 raw stamps, stampGain 1.5 from st_gain level 1
    expect(num(p.stamps)).toBe(5 + 33);
    expect(num(p.stampsTotal)).toBe(2500 + 33);
    expect(p.warps).toBe(1);
    expect(s.stats.warps).toBe(1);
    expect(p.mutators).toEqual(["thin"]);
    expect(world.prestigeCalls).toEqual([1]);

    // reset by this layer
    expect(s.rp).toEqual({ m: 0, e: 0 });
    expect(s.research).toEqual({ drill_bits: 2, overclock: 1 });
    expect(num(s.lifetime)).toBe(0); // the stub core's part

    // kept
    expect(num(p.rivets)).toBe(3);
    expect(num(p.sparks)).toBe(2);
    expect(p.upgrades).toEqual({ st_gain: 1, rv_gain: 1, sp_time: 2 });
    expect(JSON.stringify(s.codex)).toBe(codex);
    expect(s.achievements).toEqual({ buy_10: 1234 });
    expect(s.story.chapter).toBe(4);
    expect(s.story.logs).toEqual(["log_a"]);
    expect(s.quests.streak).toBe(3);
    expect(s.cosmetics.owned).toContain("trail_blue");
    expect(s.cosmetics.trail).toBe("trail_blue");
    expect(s.stats.purchases).toBe(321);
    expect(num(s.allTime)).toBe(5e12);

    // the hull class survives the run reset, and the grid follows the hull
    expect(s.hull.cls).toBe("hauler");
    expect([s.grid.w, s.grid.h, s.grid.cells.length]).toEqual([4, 4, 16]);

    // new galaxy rules are live at once
    expect(g.mods.allProd).toBeCloseTo(0.5 * 1.5 * 1.5, 9);
    expect(g.mods.cargoCap).toBe(2);
    expect(s.features.warp).toBe(1);
    const events = drain(g);
    expect(events.filter((e) => e.t === "prestige")).toEqual([{ t: "prestige", layer: 1 }]);
    expect(findBadNumber(s)).toBeNull();
  });

  it("a warp below the stamp threshold is allowed and pays nothing", () => {
    const { g, world } = makeGame();
    world.isCore = true;
    g.state.lifetime = B.big(1e6);
    expect(warp(g)).toEqual({ ok: true });
    expect(g.state.prestige.stamps).toEqual({ m: 0, e: 0 });
    expect(g.state.prestige.warps).toBe(1);
  });
});

describe("rebuild", () => {
  it("needs the shipyard and enough stamps for one rivet", () => {
    const { g } = makeGame();
    g.state.prestige.stampsTotal = B.big(2500);
    expect(canRebuild(g)).toBe(false);
    expect(rebuild(g, "tug")).toEqual({ ok: false, reason: "requirement" });
    setFlag(g, "shipyard_built");
    expect(canRebuild(g)).toBe(true);
    g.state.prestige.stampsTotal = B.big(24);
    expect(num(rivetsOnRebuild(g))).toBe(0);
    expect(canRebuild(g)).toBe(false);
    g.state.prestige.stampsTotal = B.big(25);
    expect(num(rivetsOnRebuild(g))).toBe(1);
    g.state.prestige.stampsTotal = B.big(2500);
    expect(num(rivetsOnRebuild(g))).toBe(10);
    g.state.prestige.upgrades.rv_gain = 1; // rivetGain +1
    rebuildMods(g);
    expect(num(rivetsOnRebuild(g))).toBe(20);
    g.state.prestige.stampsTotal = B.make(1, 300);
    expect(B.log10(rivetsOnRebuild(g))).toBeGreaterThan(140);
    setFlag(g, "shipyard_built", 0);
    expect(canRebuild(g)).toBe(false);
    addItem(g, "shipyard", 1);
    expect(canRebuild(g)).toBe(true);
  });

  it("needs the hull's frame megastructure to buy a class, when the content has one", () => {
    const { g } = makeGame();
    setFlag(g, "shipyard_built");
    g.state.prestige.stampsTotal = B.big(2500);
    expect(hullFrameItem(g, "tug")).toBeNull();
    expect(hullFrameItem(g, "hauler")).toBeNull(); // no frame item for it in the fixture
    expect(hullFrameItem(g, "ark")).toBe("hull_frame_ark");
    expect(rebuild(g, "ark")).toEqual({ ok: false, reason: "items" });
    addItem(g, "hull_frame_ark", 1);
    expect(rebuild(g, "ark")).toEqual({ ok: true });
    expect(g.state.hull.cls).toBe("ark");
    expect([g.state.grid.w, g.state.grid.h, g.state.grid.cells.length]).toEqual([6, 5, 30]);
    expect(g.mods.crewCap).toBe(1.5);
    // the class is owned now: going back to it later needs no second frame
    g.state.prestige.stampsTotal = B.big(2500);
    expect(rebuild(g, "tug")).toEqual({ ok: true });
    g.state.prestige.stampsTotal = B.big(2500);
    expect(rebuild(g, "ark")).toEqual({ ok: true });
  });

  it("can be tuned to need a fresh frame on every rebuild", () => {
    const { g } = makeGame({ content: makeContent({ hullFrameEveryRun: 1 }) });
    setFlag(g, "shipyard_built");
    g.state.prestige.stampsTotal = B.big(2500);
    g.state.prestige.hullsOwned.push("ark");
    expect(rebuild(g, "ark")).toEqual({ ok: false, reason: "items" });
    addItem(g, "hull_frame_ark", 1);
    expect(rebuild(g, "ark")).toEqual({ ok: true });
  });

  it("validates the hull and the inherited blueprints", () => {
    const { g, world } = makeGame();
    populate(g);
    setFlag(g, "shipyard_built");
    const before = JSON.stringify(g.state);
    expect(rebuild(g, "nope")).toEqual({ ok: false, reason: "invalid" });
    expect(rebuild(g, "yacht")).toEqual({ ok: false, reason: "credits" });
    // the tug inherits one blueprint, the hauler two
    expect(rebuild(g, "tug", ["plating_bp", "lens_bp"])).toEqual({ ok: false, reason: "invalid" });
    expect(rebuild(g, "hauler", ["plating_bp", "plating_bp"])).toEqual({ ok: false, reason: "invalid" });
    // wire_basic exists in content but the player never learned it
    expect(rebuild(g, "hauler", ["wire_basic"])).toEqual({ ok: false, reason: "invalid" });
    expect(rebuild(g, "hauler", ["ghost"])).toEqual({ ok: false, reason: "invalid" });
    expect(JSON.stringify(g.state)).toBe(before);
    expect(world.prestigeCalls).toEqual([]);
  });

  it("pays rivets, buys the hull, keeps blueprints and resets layer 1", () => {
    const { g, world } = makeGame();
    populate(g);
    setFlag(g, "shipyard_built");
    const codex = JSON.stringify(g.state.codex);
    // 2500 stamps -> 10 rivets, doubled by rv_gain
    expect(num(rivetsOnRebuild(g))).toBe(20);

    expect(rebuild(g, "hauler", ["plating_bp", "lens_bp"])).toEqual({ ok: true });
    const s = g.state;
    const p = s.prestige;
    expect(num(p.rivets)).toBe(3 + 20 - 3);
    expect(num(rivetsTotal(g))).toBe(20);
    expect(p.hullsOwned).toEqual(["tug", "hauler"]);
    expect(p.rebuilds).toBe(1);
    expect(s.stats.rebuilds).toBe(1);
    expect(p.kept).toEqual(["plating_bp", "lens_bp"]);
    expect(world.prestigeCalls).toEqual([2]);

    // layer 1 is gone
    expect(p.stamps).toEqual({ m: 0, e: 0 });
    expect(p.stampsTotal).toEqual({ m: 0, e: 0 });
    expect(p.mutators).toEqual([]);
    expect(s.research).toEqual({});
    expect(s.rp).toEqual({ m: 0, e: 0 });
    expect(p.upgrades).toEqual({ rv_gain: 1, sp_time: 2 });

    // higher layers and collections are untouched
    expect(num(p.sparks)).toBe(2);
    expect(JSON.stringify(s.codex)).toBe(codex);
    expect(s.achievements).toEqual({ buy_10: 1234 });
    expect(s.story.chapter).toBe(4);
    expect(s.cosmetics.trail).toBe("trail_blue");

    // the stub core wiped recipes; only the inherited blueprints came back
    expect(s.recipes).toEqual({ plating_bp: 1, lens_bp: 1 });

    // new hull: class, grid size, open cells, effects
    expect(s.hull.cls).toBe("hauler");
    expect([s.grid.w, s.grid.h]).toEqual([4, 4]);
    expect(s.grid.cells).toEqual(new Array(16).fill(0));
    // a bigger class brings a bigger grid; cells are still opened at stations
    expect(s.grid.open).toBe(hullOpenCells(g, "hauler"));
    expect(s.grid.open).toBe(4);
    expect(g.mods.cargoCap).toBe(2);
    expect(g.mods.allProd).toBeCloseTo(1.5 * 1.5, 9); // sp_time kept, st upgrades gone
    expect(s.features.hull).toBe(1);
    expect(drain(g).filter((e) => e.t === "prestige")).toEqual([{ t: "prestige", layer: 2 }]);

    // an owned hull is free the next time, and inherited blueprints survive later warps
    world.isCore = true;
    expect(warp(g)).toEqual({ ok: true });
    expect(s.recipes).toEqual({ plating_bp: 1, lens_bp: 1 });
    expect(s.hull.cls).toBe("hauler");
    p.stampsTotal = B.big(25);
    const rivets = num(p.rivets);
    expect(rebuild(g, "tug", ["lens_bp"])).toEqual({ ok: true });
    expect(num(p.rivets)).toBe(rivets + 2);
    expect(s.hull.cls).toBe("tug");
    expect([s.grid.w, s.grid.h, s.grid.open]).toEqual([3, 3, 4]);
    expect(g.mods.cargoCap).toBe(1);
    expect(s.recipes).toEqual({ lens_bp: 1 });
    expect(findBadNumber(s)).toBeNull();
  });

  it("moves installed modules to storage when the grid changes shape", () => {
    const { g } = makeGame();
    setFlag(g, "shipyard_built");
    g.state.prestige.stampsTotal = B.big(2500);
    // a core that keeps modules across the reset
    g.systems[0].prestige = () => {
      g.state.modules = [{ uid: 9, item: "mod_laser_mk1", q: 1, hp: 100, lvl: 0, slot: 2 }];
      g.state.grid = { w: 3, h: 3, open: 4, cells: [0, 0, 9, 0, 0, 0, 0, 0, 0] };
    };
    expect(rebuild(g, "hauler")).toEqual({ ok: true });
    expect(g.state.modules[0].slot).toBe(-1);
    expect(g.state.grid.cells.every((c) => c === 0)).toBe(true);
  });
});

describe("reboot", () => {
  it("needs two rebuilds and enough rivets earned, then resets layers 1 and 2", () => {
    const { g } = makeGame();
    populate(g);
    setFlag(g, "shipyard_built");
    const p = g.state.prestige;
    expect(canReboot(g)).toBe(false);
    expect(reboot(g)).toEqual({ ok: false, reason: "requirement" });

    p.stampsTotal = B.big(25 * 900); // 30 rivets, 60 with rv_gain
    expect(rebuild(g, "hauler", ["plating_bp"])).toEqual({ ok: true });
    expect(num(sparksOnReboot(g))).toBe(1); // sqrt(60 / 50)
    expect(canReboot(g)).toBe(false); // one rebuild is not enough
    p.stampsTotal = B.big(25 * 900);
    expect(rebuild(g, "hauler", [])).toEqual({ ok: true });
    expect(num(rivetsTotal(g))).toBe(120);
    expect(canReboot(g)).toBe(true);
    p.upgrades.st_gain = 2;
    p.stamps = B.big(40);
    p.stampsTotal = B.big(40);
    p.kept = ["plating_bp"];
    const codex = JSON.stringify(g.state.codex);
    drain(g);

    expect(reboot(g)).toEqual({ ok: true });
    const s = g.state;
    expect(num(p.sparks)).toBe(2 + 1); // floor(sqrt(120 / 50))
    expect(p.reboots).toBe(1);
    expect(s.stats.reboots).toBe(1);

    // layers 1 and 2 are gone
    expect(p.stamps).toEqual({ m: 0, e: 0 });
    expect(p.stampsTotal).toEqual({ m: 0, e: 0 });
    expect(p.rivets).toEqual({ m: 0, e: 0 });
    expect(rivetsTotal(g)).toEqual({ m: 0, e: 0 });
    expect(p.upgrades).toEqual({ sp_time: 2 });
    expect(p.hullsOwned).toEqual(["tug"]);
    expect(p.kept).toEqual([]);
    expect(p.mutators).toEqual([]);
    expect(s.research).toEqual({});
    expect(s.hull.cls).toBe("tug");
    expect([s.grid.w, s.grid.h, s.grid.open]).toEqual([3, 3, 4]);
    expect(s.recipes).toEqual({});

    // the top layer and the collections stay
    expect(JSON.stringify(s.codex)).toBe(codex);
    expect(s.achievements).toEqual({ buy_10: 1234 });
    expect(s.story.chapter).toBe(4);
    expect(s.cosmetics.owned).toContain("trail_blue");
    expect(g.mods.allProd).toBeCloseTo(1.5 * 1.5, 9);
    expect(g.mods.cargoCap).toBe(1);
    expect(s.features.cosmos).toBe(1);
    expect(drain(g).filter((e) => e.t === "prestige")).toEqual([{ t: "prestige", layer: 3 }]);
    expect(canReboot(g)).toBe(false);
    expect(findBadNumber(s)).toBeNull();
  });
});

describe("prestige upgrades", () => {
  it("spends the currency of the upgrade's layer and nothing else", () => {
    const { g } = makeGame();
    const p = g.state.prestige;
    p.stamps = B.big(10);
    p.rivets = B.big(10);
    p.sparks = B.big(10);
    expect(buyUpgrade(g, "st_gain")).toEqual({ ok: true });
    expect([num(p.stamps), num(p.rivets), num(p.sparks)]).toEqual([9, 10, 10]);
    expect(buyUpgrade(g, "rv_bots")).toEqual({ ok: true });
    expect([num(p.stamps), num(p.rivets), num(p.sparks)]).toEqual([9, 8, 10]);
    expect(g.state.features.repairBots).toBe(1);
    expect(buyUpgrade(g, "sp_gain")).toEqual({ ok: true });
    expect([num(p.stamps), num(p.rivets), num(p.sparks)]).toEqual([9, 8, 9]);
    rebuildMods(g);
    expect(g.mods.stampGain).toBeCloseTo(1.5, 9);
    expect(g.mods.sparkGain).toBeCloseTo(2, 9);
  });

  it("grows in price, needs prerequisites and stops at the cap", () => {
    const { g } = makeGame();
    const p = g.state.prestige;
    p.stamps = B.big(7);
    expect(buyUpgrade(g, "st_prod")).toEqual({ ok: false, reason: "requirement" });
    expect(num(upgradeCost(g, "st_gain"))).toBe(1);
    buyUpgrade(g, "st_gain");
    expect(num(upgradeCost(g, "st_gain"))).toBe(2);
    buyUpgrade(g, "st_gain");
    expect(num(upgradeCost(g, "st_gain"))).toBe(4);
    buyUpgrade(g, "st_gain");
    expect(num(p.stamps)).toBe(0);
    expect(buyUpgrade(g, "st_gain")).toEqual({ ok: false, reason: "credits" });
    p.stamps = B.big(1e9);
    buyUpgrade(g, "st_gain");
    buyUpgrade(g, "st_gain");
    expect(buyUpgrade(g, "st_gain")).toEqual({ ok: false, reason: "max" });
    expect(buyUpgrade(g, "st_prod")).toEqual({ ok: true });
    expect(buyUpgrade(g, "st_prod")).toEqual({ ok: true });
    rebuildMods(g);
    expect(g.mods.allProd).toBe(4);
    expect(g.mods.stampGain).toBeCloseTo(3.5, 9);
    for (const id of ["nope", "constructor", "__proto__", ""]) expect(buyUpgrade(g, id)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("mutator and hull modifiers", () => {
  it("applies active mutators and the current hull class", () => {
    const { g } = makeGame();
    expect(g.mods.wearRate).toBe(1);
    g.state.prestige.mutators = ["fragile", "slow"];
    g.state.hull.cls = "yacht";
    rebuildMods(g);
    expect(g.mods.wearRate).toBe(2);
    expect(g.mods.jumpCharge).toBe(0.5);
    expect(g.mods.sellValue).toBe(3);
    g.state.prestige.mutators = [];
    g.state.hull.cls = "tug";
    rebuildMods(g);
    expect(g.mods.wearRate).toBe(1);
    expect(g.mods.sellValue).toBe(1);
  });
});

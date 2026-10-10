import { describe, expect, it } from "vitest";
import * as B from "../../src/engine/big";
import {
  addModule,
  autoResolveCost,
  autoResolveMinigame,
  collectSalvage,
  corePrestige,
  installModule,
  miningScale,
  nearGoals,
  pulseScan,
  queueCraft,
  resolveMinigame,
  setDrones,
  setKeep,
  setMining,
  spawnSalvage,
  startManualRepair,
  triggerOverdrive,
} from "../../src/engine/core";
import { addItem, runPrestige } from "../../src/engine/kernel";
import { levels, makeGame, midGame, num, run, system } from "./fixture";

describe("hold-to-mine", () => {
  it("multiplies mining, heats up, overheats and locks", () => {
    const g = makeGame({ sys: system(0, [{ item: "scrap", w: 1 }]) });
    levels(g, { lift: 10, reactor: 3 }); // lift 24/s: mining is the bottleneck
    setKeep(g, "scrap", 0);
    run(g, 2);
    const idle0 = num(g.state.credits);
    run(g, 2);
    const idle = num(g.state.credits) - idle0;
    expect(setMining(g, true).ok).toBe(true);
    const c0 = num(g.state.credits);
    run(g, 2);
    expect((num(g.state.credits) - c0) / idle).toBeCloseTo(4, 1);
    expect(g.state.active.heat).toBeCloseTo(44, 0); // 22 %/s

    run(g, 3); // 100 % at ~4.5 s
    expect(g.state.active.mining).toBe(false);
    expect(g.state.active.lockUntil).toBeGreaterThan(g.state.t);
    expect(g.state.stats.overheats).toBe(1);
    expect(g.outbox.some((e) => e.t === "overheat")).toBe(true);
    expect(setMining(g, true)).toEqual({ ok: false, reason: "cooldown" });
    run(g, 5);
    expect(g.state.active.heat).toBeLessThan(40); // cools 14 %/s
    expect(setMining(g, true).ok).toBe(true);
    expect(setMining(g, false).ok).toBe(true);
    run(g, 10);
    expect(g.state.active.heat).toBe(0);
  });
});

describe("salvage and overdrive", () => {
  it("spawns blobs on a timer, never more than the maximum, and expires them", () => {
    const g = makeGame();
    run(g, 600);
    const blobs = g.state.active.salvage;
    expect(blobs.length).toBeGreaterThan(0);
    expect(blobs.length).toBeLessThanOrEqual(5);
    for (const b of blobs) expect(g.state.t - b.born).toBeLessThan(46);
    for (let i = 0; i < 20; i++) spawnSalvage(g);
    expect(blobs.length).toBe(5);
    g.state.active.nextSalvageAt = 1e12;
    run(g, 46);
    expect(blobs.length).toBe(0);
  });

  it("collecting pays seconds of income or items and builds combo", () => {
    const g = makeGame();
    run(g, 120);
    g.state.active.nextSalvageAt = 1e12;
    g.state.active.salvage.length = 0;
    let credits = 0;
    let items = 0;
    for (let i = 0; i < 60; i++) {
      const uid = spawnSalvage(g);
      const before = num(g.state.credits);
      g.outbox.length = 0;
      expect(collectSalvage(g, uid).ok).toBe(true);
      const ev = g.outbox.find((e) => e.t === "salvageCollected");
      expect(ev).toBeDefined();
      if (ev && ev.t === "salvageCollected" && ev.item) items++;
      else if (g.outbox.some((e) => e.t === "blueprint")) continue; // a rare find pays a smaller tip
      else {
        credits++;
        const gain = num(g.state.credits) - before;
        const income = Math.max(0.5, num(g.rates.income));
        expect(gain).toBeGreaterThanOrEqual(15 * income * 0.99);
        expect(gain).toBeLessThanOrEqual(40 * income * 1.01);
      }
    }
    expect(credits).toBeGreaterThan(20);
    expect(items).toBeGreaterThan(5);
    expect(g.state.stats.salvage).toBe(60);
    expect(g.state.active.combo).toBe(100);
    expect(g.state.active.salvage.length).toBe(0);
    expect(collectSalvage(g, 123456)).toEqual({ ok: false, reason: "noTarget" });
  });

  it("rare finds call the card and blueprint apis", () => {
    const g = makeGame();
    let cards = 0;
    g.api.grantCard = () => {
      cards++;
      return "card_x";
    };
    for (let i = 0; i < 400; i++) collectSalvage(g, spawnSalvage(g));
    expect(cards).toBeGreaterThan(3);
    expect(g.state.stats.blueprints).toBe(2); // both fixture blueprints were found along the way
  });

  it("scanner pulse reveals 1-3 blobs and has a 20 s cooldown", () => {
    const g = makeGame();
    g.state.active.nextSalvageAt = 1e12;
    expect(pulseScan(g).ok).toBe(true);
    const n = g.state.active.salvage.length;
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(3);
    expect(pulseScan(g)).toEqual({ ok: false, reason: "cooldown" });
    expect(g.state.stats.pulses).toBe(1);
    expect(g.state.flags.pulseAt).toBe(g.state.t);
    run(g, 20.1);
    expect(pulseScan(g).ok).toBe(true);
  });

  it("salvager drones collect a blob every 30 s at half value", () => {
    const g = makeGame();
    levels(g, { hangar: 4, reactor: 3 });
    setDrones(g, "salvager", 2);
    g.state.active.nextSalvageAt = 1e12;
    for (let i = 0; i < 5; i++) spawnSalvage(g);
    run(g, 16); // two drones: one blob per 15 s
    expect(g.state.active.salvage.length).toBe(4);
    expect(g.state.stats.salvage).toBe(1);
  });

  it("overdrive needs a full combo, triples production for 20 s and doubles wear", () => {
    const g = makeGame({ sys: system(0, [{ item: "scrap", w: 1 }]) });
    levels(g, { lift: 10, reactor: 3 });
    setKeep(g, "scrap", 0);
    expect(triggerOverdrive(g)).toEqual({ ok: false, reason: "requirement" });
    g.state.active.combo = 100;
    run(g, 1);
    const base = num(g.rates.mine);
    expect(triggerOverdrive(g).ok).toBe(true);
    expect(triggerOverdrive(g)).toEqual({ ok: false, reason: "busy" });
    run(g, 1);
    expect(num(g.rates.mine)).toBeCloseTo(base * 3, 6);
    expect(g.state.active.combo).toBe(0);
    expect(g.state.stats.overdrives).toBe(1);
    run(g, 20);
    expect(num(g.rates.mine)).toBeCloseTo(base, 6);
    const events = g.outbox.filter((e) => e.t === "overdrive");
    expect(events).toEqual([{ t: "overdrive", on: true }, { t: "overdrive", on: false }]);
  });
});

describe("mini-game plumbing", () => {
  it("auto-resolve is always possible: bots, then a consumable, then free at 0.35", () => {
    const g = makeGame();
    g.state.grid.open = 9;
    const uid = addModule(g, "mod_laser_mk1", 1);
    installModule(g, uid, 0);
    const m = g.state.modules[0];
    expect(autoResolveMinigame(g)).toEqual({ ok: false, reason: "noTarget" });

    m.hp = 10;
    startManualRepair(g, uid);
    expect(autoResolveCost(g)).toEqual({ kind: "free", score: 0.35 });
    expect(autoResolveMinigame(g).ok).toBe(true);
    expect(m.hp).toBeCloseTo(10 + 40 + 60 * 0.35, 9);
    expect(g.state.stats.minigames).toBeUndefined(); // skipped games are not played games
    expect(g.state.stats.repairsManual).toBeUndefined();

    addItem(g, "duct_tape", 1);
    addItem(g, "nano_gel", 1);
    m.hp = 10;
    startManualRepair(g, uid);
    expect(autoResolveCost(g)).toEqual({ kind: "item", item: "duct_tape", score: 0.5 }); // cheapest
    autoResolveMinigame(g);
    expect(m.hp).toBe(80);
    expect(g.state.inv.duct_tape).toBeUndefined();
    expect(num(g.state.inv.nano_gel)).toBe(1);

    g.state.repair.botLevel = 1;
    m.hp = 10;
    startManualRepair(g, uid);
    expect(autoResolveCost(g)).toMatchObject({ kind: "bots", seconds: 120, score: 0.5 });
    autoResolveMinigame(g);
    expect(m.hp).toBe(80);
    expect(g.state.flags.botsBusyUntil).toBe(g.state.t + 120);
    m.hp = 10;
    startManualRepair(g, uid);
    expect(autoResolveCost(g).kind).toBe("item"); // bots are away
  });

  it("a second request while one is pending is refused; offline requests resolve at 0.5", () => {
    const g = makeGame();
    const seen: number[] = [];
    g.minigameHandlers.event = (_g, _p, result) => {
      seen.push(result.score);
    };
    const token = g.api.requestMinigame("wire", 2, "event", 7);
    expect(token).toBeGreaterThan(0);
    expect(g.api.requestMinigame("weld", 1, "event", 8)).toBe(0);
    expect(g.state.minigame).toMatchObject({ token, game: "wire", tier: 2, purpose: "event", ref: 7 });
    resolveMinigame(g, { score: NaN, success: true, perfect: true, durationMs: 5 });
    expect(seen).toEqual([0]); // garbage scores are clamped, flags recomputed

    g.offline = true;
    const t2 = g.api.requestMinigame("weld", 1, "event", 9);
    g.offline = false;
    expect(t2).toBeGreaterThan(token);
    expect(g.state.minigame).toBeNull();
    expect(seen).toEqual([0, 0.5]);
  });

  it("miningScale is about 10 s of mining and never below 1", () => {
    const g = makeGame();
    expect(num(miningScale(g))).toBe(10);
    g.state.failure = { kind: "tumble", since: 0, waitUntil: 0, tow: null };
    g.dirty = true;
    run(g, 0.2);
    expect(num(g.api.miningScale())).toBe(1);
  });
});

describe("near goals", () => {
  it("always returns exactly three distinct, sane goals", () => {
    const fresh = makeGame();
    const a = nearGoals(fresh);
    expect(a.length).toBe(3);
    expect(a.map((x) => x.kind)).toEqual(["deckLevel", "deckUnlock", "craft"].slice(0, 2).concat(a[2].kind));
    expect(a[0]).toMatchObject({ id: "deckLevel:mining", kind: "deckLevel", target: 2, params: { deck: "mining", level: 2 } });
    expect(a[1]).toMatchObject({ id: "deckUnlock:refinery", kind: "deckUnlock", params: { deck: "refinery" } });
    expect(new Set(a.map((x) => x.id)).size).toBe(3);
    for (const goal of a) {
      expect(goal.progress).toBeGreaterThanOrEqual(0);
      expect(goal.progress).toBeLessThanOrEqual(1);
    }
    expect(nearGoals(fresh)).toBe(a); // stable reference between pulses

    fresh.state.credits = B.big(2);
    run(fresh, 0.6);
    expect(nearGoals(fresh)[0].progress).toBeGreaterThan(0.4);

    const mid = midGame();
    run(mid, 5);
    const goals = nearGoals(mid);
    expect(goals.length).toBe(3);
    expect(new Set(goals.map((x) => x.id)).size).toBe(3);

    // a broken module jumps the queue
    mid.state.repair.auto = false;
    mid.state.repair.botLevel = 0;
    mid.state.modules[0].hp = 12;
    run(mid, 0.6);
    const urgent = nearGoals(mid);
    expect(urgent[0]).toMatchObject({ kind: "repair", target: 100, params: { uid: mid.state.modules[0].uid } });
    expect(urgent[0].progress).toBeCloseTo(0.12, 1);
    expect(urgent.length).toBe(3);
  });

  it("offers a new recipe and the next milestone when the basics are covered", () => {
    const g = makeGame();
    levels(g, { refinery: 1, reactor: 1, bridge: 1, fabricator: 1, workshop: 1, hangar: 1, lab: 1, quarters: 1, observatory: 1, greenhouse: 1 });
    run(g, 0.6);
    const kinds = nearGoals(g).map((x) => x.kind);
    expect(kinds).toEqual(["deckLevel", "craft", "milestone"]);
    g.state.features.nav = 1;
    for (const id of Object.keys(g.state.recipes)) g.state.stats[`made_${id}`] = 1;
    run(g, 0.6);
    expect(nearGoals(g).map((x) => x.kind)).toEqual(["deckLevel", "milestone", "depth"]);
  });
});

describe("prestige (core slice)", () => {
  it("warp resets the run but keeps preferences, stats and the unlocked grid cells", () => {
    const g = midGame();
    run(g, 30);
    g.state.keep.scrap = 0.3;
    g.state.buyMode = 10;
    addItem(g, "relic", 2);
    queueCraft(g, "r_alloy", 5);
    const stats = { ...g.state.stats };
    const allTime = B.clone(g.state.allTime);
    expect(allTime.m).toBeGreaterThan(0);

    runPrestige(g, 1);
    const s = g.state;
    expect(num(s.credits)).toBe(0);
    expect(num(s.lifetime)).toBe(0);
    expect(s.allTime).toEqual(allTime);
    expect(Object.keys(s.inv)).toEqual(["relic"]);
    expect(s.decks.mining.level).toBe(1);
    expect(s.decks.refinery.level).toBe(0);
    expect(num(s.hopper)).toBe(0);
    expect(s.craft.refinery.queue).toEqual([]);
    expect(s.modules).toEqual([]);
    expect(s.grid.cells.every((c) => c === 0)).toBe(true);
    expect(s.grid.open).toBe(9); // layer 1 keeps opened cells
    expect(s.drones).toEqual({ hauler: 0, probe: 0, salvager: 0, fixer: 0 });
    expect(s.keep.scrap).toBe(0.3);
    expect(s.buyMode).toBe(10);
    expect(s.stats).toEqual(stats);
    expect(s.features.crafting).toBe(1);
    expect(s.recipes.r_alloy).toBe(1); // start recipes are known again
    expect(g.outbox.some((e) => e.t === "prestige")).toBe(true);
    run(g, 20);
    expect(num(s.credits)).toBeGreaterThan(0); // the new run earns from the first tick

    corePrestige(g, 2);
    expect(s.grid).toMatchObject({ w: 3, h: 3, open: 4 });
    expect(s.grid.cells.length).toBe(9);
  });
});

import { describe, expect, it } from "vitest";
import * as B from "../../src/engine/big";
import {
  buyDeck,
  buyPreview,
  canUnlockDeck,
  crewCapacity,
  deckCost,
  deckOutput,
  droneCapacity,
  levelMult,
  maxAffordable,
  milestoneCount,
  nextCost,
  nextMilestone,
  reactorSupply,
  setBuyMode,
  syncRates,
  unlockDeck,
} from "../../src/engine/core";
import { addItem } from "../../src/engine/kernel";
import { content, levels, makeGame, num, run } from "./fixture";

const MS = [10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500];

describe("deck curves", () => {
  it("levelMult follows the GDD", () => {
    expect(levelMult("lin", 7, MS)).toBe(7);
    expect(levelMult("soft", 7, MS)).toBe(1 + Math.log2(8));
    expect(levelMult("exp", 0, MS)).toBe(0);
    expect(levelMult("exp", 9, MS)).toBe(9);
    expect(levelMult("exp", 10, MS)).toBe(20);
    expect(levelMult("exp", 25, MS)).toBe(100);
    expect(levelMult("exp", 100, MS)).toBe(100 * 32);
    expect(milestoneCount(500, MS)).toBe(11);
    expect(milestoneCount(599, MS)).toBe(11);
    expect(milestoneCount(600, MS)).toBe(12); // then every 100
    expect(milestoneCount(1000, MS)).toBe(16);
  });

  it("deckOutput matches the table and stays a Big at absurd levels", () => {
    const g = makeGame();
    expect(num(deckOutput(g, "mining"))).toBe(1);
    expect(num(deckOutput(g, "lift"))).toBeCloseTo(1.2, 9);
    expect(num(deckOutput(g, "cargo"))).toBe(400);
    expect(num(deckOutput(g, "reactor"))).toBe(0); // not built
    levels(g, { mining: 50, reactor: 3, hangar: 9, quarters: 11, bridge: 10, observatory: 3 });
    expect(num(deckOutput(g, "mining"))).toBe(50 * 8);
    expect(num(deckOutput(g, "reactor"))).toBe(14 * 3);
    expect(reactorSupply(g)).toBe(30 + 14 * 3); // emergency cells + deck
    expect(g.rates.power.supply).toBe(72);
    expect(num(deckOutput(g, "hangar"))).toBe(1 + 2);
    expect(num(deckOutput(g, "quarters"))).toBe(1 + 2);
    expect(num(deckOutput(g, "bridge"))).toBeCloseTo(1.2, 9);
    expect(num(deckOutput(g, "observatory"))).toBeCloseTo(0.1 * 3, 9);
    levels(g, { mining: 90000 });
    const huge = deckOutput(g, "mining");
    expect(huge.e).toBeGreaterThan(250);
    expect(Number.isFinite(huge.m)).toBe(true);
  });

  it("utility decks grant their modifiers", () => {
    const g = makeGame();
    expect(g.mods.sellValue).toBe(1);
    expect(droneCapacity(g)).toBe(0);
    expect(crewCapacity(g)).toBe(1);
    levels(g, { bridge: 10, workshop: 5, hangar: 8, quarters: 10, observatory: 1, reactor: 20 });
    expect(g.mods.sellValue).toBeCloseTo(1.2, 9);
    expect(g.mods.offlineEff).toBeCloseTo(1.02, 9);
    expect(g.mods.repairSpeed).toBeCloseTo(1.1, 9);
    expect(g.mods.scanSpeed).toBeCloseTo(1.2, 9);
    expect(g.mods.salvageRate).toBeCloseTo(1.05, 9);
    expect(droneCapacity(g)).toBe(3);
    expect(crewCapacity(g)).toBe(3);
    levels(g, { bridge: 500 });
    expect(g.mods.offlineEff).toBeCloseTo(1.2, 9); // capped at +20 %
  });

  it("a deck multiplier (manager, card) also scales the inherent bonus after one more rebuild", () => {
    const g = makeGame();
    levels(g, { bridge: 10, reactor: 5 });
    g.state.buffs.push({ effect: { deck: "bridge", mul: 2 }, until: 1e9, src: "test" });
    g.dirty = true;
    run(g, 0.3);
    expect(g.deckMult.bridge).toBe(2);
    expect(g.mods.sellValue).toBeCloseTo(1.4, 9);
  });
});

describe("buying levels", () => {
  it("cost is geometric and scaled by mods.deckCost", () => {
    const g = makeGame();
    expect(num(nextCost(g, "mining"))).toBeCloseTo(4, 9);
    levels(g, { mining: 11 });
    expect(num(nextCost(g, "mining"))).toBeCloseTo(4 * Math.pow(1.07, 10), 6);
    let sum = 0;
    for (let i = 0; i < 25; i++) sum += 4 * Math.pow(1.07, 10 + i);
    expect(num(deckCost(g, "mining", 25))).toBeCloseTo(sum, 6);
    g.state.buffs.push({ effect: { stat: "deckCost", mul: 0.5 }, until: 1e9, src: "sale" });
    g.dirty = true;
    syncRates(g);
    expect(num(deckCost(g, "mining", 25))).toBeCloseTo(sum / 2, 6);
  });

  it("x1, x10, x100 and max equal the same number of single buys", () => {
    for (const mode of [1, 10, 100, "max"] as const) {
      const a = makeGame();
      const b = makeGame();
      a.state.credits = B.big(123456);
      b.state.credits = B.big(123456);
      expect(buyDeck(a, "lift", mode).ok).toBe(true);
      const bought = a.state.decks.lift.level - 1;
      expect(bought).toBe(mode === "max" ? maxAffordable(b, "lift") : mode);
      for (let i = 0; i < bought; i++) expect(buyDeck(b, "lift", 1).ok).toBe(true);
      expect(b.state.decks.lift.level).toBe(a.state.decks.lift.level);
      expect(num(a.state.credits)).toBeCloseTo(num(b.state.credits), 4);
      if (mode === "max") expect(buyDeck(b, "lift", 1)).toEqual({ ok: false, reason: "credits" });
      expect(a.state.stats.deckLevels).toBe(bought);
      expect(a.state.stats.purchases).toBe(1);
    }
  });

  it("a count larger than the credits allow buys what fits; nothing affordable fails", () => {
    const g = makeGame();
    expect(buyDeck(g, "mining")).toEqual({ ok: false, reason: "credits" });
    g.state.credits = B.big(20); // 4 + 4.28 + 4.58 + 4.90 = 17.76, the fifth does not fit
    expect(buyPreview(g, "mining", 10).levels).toBe(4);
    expect(buyDeck(g, "mining", 10).ok).toBe(true);
    expect(g.state.decks.mining.level).toBe(5);
    expect(num(g.state.credits)).toBeCloseTo(20 - 17.7598, 3);
    expect(buyDeck(g, "reactor", 1)).toEqual({ ok: false, reason: "locked" });
    expect(buyDeck(g, "mining", 0).ok).toBe(false);
    expect(buyDeck(g, "nope" as never).ok).toBe(false);
  });

  it("uses state.buyMode when no count is given", () => {
    const g = makeGame();
    g.state.credits = B.big(1e6);
    expect(setBuyMode(g, 10).ok).toBe(true);
    expect(buyDeck(g, "cargo").ok).toBe(true);
    expect(g.state.decks.cargo.level).toBe(11);
    expect(setBuyMode(g, "max").ok).toBe(true);
    expect(g.state.buyMode).toBe(-1);
    expect(buyDeck(g, "cargo").ok).toBe(true);
    expect(buyDeck(g, "cargo")).toEqual({ ok: false, reason: "credits" });
    expect(setBuyMode(g, 7 as never).ok).toBe(false);
  });

  it("emits purchase with the milestone flag and counts milestones", () => {
    const g = makeGame();
    g.state.credits = B.big(1e9);
    expect(nextMilestone(g, "mining")).toEqual({ level: 10, prev: 0, left: 9 });
    buyDeck(g, "mining", 8);
    expect(g.outbox.at(-1)).toEqual({ t: "purchase", deck: "mining", levels: 8, milestone: false });
    buyDeck(g, "mining", 20); // 9 -> 29 crosses 10 and 25
    expect(g.outbox.at(-1)).toEqual({ t: "purchase", deck: "mining", levels: 20, milestone: true });
    expect(g.state.stats.milestones).toBe(2);
    expect(nextMilestone(g, "mining")).toEqual({ level: 50, prev: 25, left: 21 });
    levels(g, { mining: 650 });
    expect(nextMilestone(g, "mining")).toEqual({ level: 700, prev: 600, left: 50 });
    expect(nextMilestone(g, "bridge")).toBeNull();
    // the purchase takes effect on the next tick
    levels(g, { mining: 30 });
    const before = num(g.rates.mine);
    buyDeck(g, "mining", 1);
    run(g, 0.1);
    expect(num(g.rates.mine)).toBeGreaterThan(before);
  });

  it("buys with credits far beyond 1e300", () => {
    const g = makeGame();
    g.state.credits = B.make(1, 320);
    expect(buyDeck(g, "mining", "max").ok).toBe(true);
    const lvl = g.state.decks.mining.level;
    // 4 * 1.07^(L-1) ~ 1e320 * 0.07  ->  L ~ 10850
    expect(lvl).toBeGreaterThan(10000);
    expect(lvl).toBeLessThan(11000);
    expect(g.state.credits.m).toBeGreaterThanOrEqual(0);
    expect(B.cmp(g.state.credits, nextCost(g, "mining"))).toBeLessThan(0);
    expect(Number.isFinite(deckOutput(g, "mining").e)).toBe(true);
  });
});

describe("unlocking decks", () => {
  it("needs credits, required decks and items", () => {
    const g = makeGame();
    expect(unlockDeck(g, "refinery")).toEqual({ ok: false, reason: "credits" });
    g.state.credits = B.big(100);
    expect(unlockDeck(g, "refinery").ok).toBe(true);
    expect(g.state.decks.refinery.level).toBe(1);
    expect(num(g.state.credits)).toBe(40);
    expect(g.outbox.some((e) => e.t === "deckBuilt" && e.deck === "refinery")).toBe(true);
    expect(unlockDeck(g, "refinery")).toEqual({ ok: false, reason: "max" });

    g.state.credits = B.big(1e6);
    expect(canUnlockDeck(g, "fabricator")).toEqual({ ok: false, reason: "requirement" }); // refinery level 2
    buyDeck(g, "refinery", 1);
    expect(unlockDeck(g, "fabricator").ok).toBe(true);

    const withItems = { ...content, decks: { ...content.decks, workshop: { ...content.decks.workshop, unlock: { credits: 10, items: { alloy: 3 }, chapter: 2 } } } };
    const h = makeGame({ content: withItems });
    h.state.credits = B.big(1e6);
    expect(unlockDeck(h, "workshop")).toEqual({ ok: false, reason: "requirement" });
    h.state.story.chapter = 2;
    expect(unlockDeck(h, "workshop")).toEqual({ ok: false, reason: "items" });
    addItem(h, "alloy", 3);
    expect(unlockDeck(h, "workshop").ok).toBe(true);
    expect(h.state.inv.alloy).toBeUndefined();
  });
});

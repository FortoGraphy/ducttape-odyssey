import { describe, expect, it } from "vitest";
import * as B from "../../src/engine/big";
import { addItem, getItem, getStat, tick } from "../../src/engine/kernel";
import type { Game, StatKey } from "../../src/engine/types";
import {
  addCrew,
  assignCrew,
  cardLevel,
  cardNextAt,
  crewCap,
  crewFromSeed,
  crewXpNeed,
  dismissCrew,
  equipCard,
  findCrew,
  grantCard,
  managerBonus,
  moraleFactor,
  moralePerHour,
  renameCrew,
  unequipCard,
} from "../../src/engine/world";
import { makeGame, run } from "./fixture";

function rebuild(g: Game): void {
  g.dirty = true;
  tick(g, 0.1);
}

function setMod(g: Game, stat: StatKey, mul: number): void {
  g.state.buffs.push({ effect: { stat, mul }, until: Number.MAX_SAFE_INTEGER, src: "test:" + stat });
  rebuild(g);
}

describe("crew roster", () => {
  it("respects the bunk count from quarters", () => {
    const { g, calls } = makeGame();
    expect(crewCap(g)).toBe(3); // 1 + floor(10 / 5)
    const a = g.api.addCrew();
    const b = addCrew(g);
    const c = addCrew(g);
    expect(a).toBeGreaterThan(0);
    expect(new Set([a, b, c]).size).toBe(3);
    expect(addCrew(g)).toBe(0);
    expect(g.state.crew.length).toBe(3);
    expect(getStat(g, "crew")).toBe(3);
    expect(calls.say.filter((x) => x.trigger === "crewJoin").length).toBe(3);

    g.state.decks.quarters.level = 0;
    rebuild(g);
    expect(crewCap(g)).toBe(1);
    g.state.decks.quarters.level = 25;
    rebuild(g);
    expect(crewCap(g)).toBe(6);
    setMod(g, "crewCap", 1.5);
    expect(crewCap(g)).toBe(9);
  });

  it("gives everyone a seeded name and two distinct traits, the first a good one", () => {
    const { g } = makeGame();
    for (let seed = 1; seed <= 60; seed++) {
      const p = crewFromSeed(g, seed);
      expect(p).toEqual(crewFromSeed(g, seed));
      const [first, last] = p.name.split(" ");
      expect(g.content.names.crewFirst).toContain(first);
      expect(g.content.names.crewLast).toContain(last);
      expect(p.traits.length).toBe(2);
      expect(p.traits[0]).not.toBe(p.traits[1]);
      expect(g.content.traits[p.traits[0]].good).toBe(true);
      expect(p.level).toBe(1);
    }
    const uid = addCrew(g);
    expect(g.state.features.crew).toBe(1);
    expect(g.outbox.some((e) => e.t === "crewJoined" && e.uid === uid)).toBe(true);
  });

  it("renames and dismisses", () => {
    const { g } = makeGame();
    const uid = addCrew(g);
    expect(renameCrew(g, uid, "  Bo   Peep  ")).toEqual({ ok: true });
    expect(findCrew(g, uid)?.name).toBe("Bo Peep");
    expect(renameCrew(g, uid, "   ")).toEqual({ ok: false, reason: "invalid" });
    expect(renameCrew(g, uid, 5 as unknown as string)).toEqual({ ok: false, reason: "invalid" });
    expect(renameCrew(g, 999, "X")).toEqual({ ok: false, reason: "noTarget" });
    renameCrew(g, uid, "x".repeat(80));
    expect(findCrew(g, uid)?.name.length).toBe(24);

    assignCrew(g, uid, "mining");
    const member = findCrew(g, uid);
    if (!member) throw new Error("missing");
    member.away = true;
    expect(dismissCrew(g, uid)).toEqual({ ok: false, reason: "busy" });
    member.away = false;
    expect(dismissCrew(g, uid)).toEqual({ ok: true });
    expect(g.state.crew.length).toBe(0);
    expect(g.state.decks.mining.manager).toBe(0);
    expect(dismissCrew(g, uid)).toEqual({ ok: false, reason: "noTarget" });
  });
});

describe("managers", () => {
  it("assigns, swaps and unassigns", () => {
    const { g } = makeGame();
    const a = addCrew(g);
    const b = addCrew(g);
    expect(assignCrew(g, 999, "mining")).toEqual({ ok: false, reason: "noTarget" });
    expect(assignCrew(g, a, "kitchen" as never)).toEqual({ ok: false, reason: "invalid" });
    expect(assignCrew(g, a, "greenhouse")).toEqual({ ok: false, reason: "locked" }); // not built
    expect(assignCrew(g, a, "mining")).toEqual({ ok: true });
    expect(g.state.decks.mining.manager).toBe(a);
    expect(findCrew(g, a)?.deck).toBe("mining");

    // b takes over mining: a is back in the bunk
    expect(assignCrew(g, b, "mining")).toEqual({ ok: true });
    expect(g.state.decks.mining.manager).toBe(b);
    expect(findCrew(g, a)?.deck).toBeNull();

    // moving b frees mining
    expect(assignCrew(g, b, "lift")).toEqual({ ok: true });
    expect(g.state.decks.mining.manager).toBe(0);
    expect(g.state.decks.lift.manager).toBe(b);
    expect(assignCrew(g, b, null)).toEqual({ ok: true });
    expect(g.state.decks.lift.manager).toBe(0);

    const member = findCrew(g, a);
    if (!member) throw new Error("missing");
    member.away = true;
    expect(assignCrew(g, a, "lift")).toEqual({ ok: false, reason: "busy" });
  });

  it("boosts the managed deck by 50 % + 8 % per level, scaled by morale", () => {
    const { g } = makeGame();
    const uid = addCrew(g);
    const member = findCrew(g, uid);
    if (!member) throw new Error("missing");
    member.traits = [];
    assignCrew(g, uid, "mining");

    g.state.morale = 100;
    rebuild(g);
    expect(moraleFactor(g)).toBeCloseTo(1.1, 9);
    expect(g.deckMult.mining).toBeCloseTo(1 + 0.58 * 1.1, 9);
    expect(g.deckMult.lift).toBe(1);

    g.state.morale = 0;
    rebuild(g);
    expect(g.deckMult.mining).toBeCloseTo(1 + 0.58 * 0.5, 9);

    member.level = 10;
    g.state.morale = 50;
    rebuild(g);
    expect(managerBonus(g, member)).toBeCloseTo(1.3 * 0.8, 9);
    expect(g.deckMult.mining).toBeCloseTo(1 + 1.3 * 0.8, 9);

    member.away = true;
    rebuild(g);
    expect(g.deckMult.mining).toBe(1);
  });

  it("applies traits: unscoped ones to the managed deck, stat ones globally", () => {
    const { g } = makeGame();
    const uid = addCrew(g);
    const member = findCrew(g, uid);
    if (!member) throw new Error("missing");
    member.traits = ["t_handy", "t_keen", "t_clumsy"];
    g.state.morale = 100;
    rebuild(g);
    // bunked crew contribute nothing
    expect(g.mods.scanSpeed).toBe(1);
    assignCrew(g, uid, "lift");
    rebuild(g);
    expect(g.deckMult.lift).toBeCloseTo((1 + 0.58 * 1.1 + 0.1) * 0.95, 9);
    expect(g.deckMult.mining).toBe(1);
    expect(g.mods.scanSpeed).toBeCloseTo(1.05, 9);
  });

  it("earns experience only while managing, and levels up to 20", () => {
    const { g } = makeGame();
    const a = addCrew(g);
    const b = addCrew(g);
    assignCrew(g, a, "mining");
    expect(crewXpNeed(g, 1)).toBe(120);
    expect(crewXpNeed(g, 2)).toBeCloseTo(168, 9);
    run(g, 119);
    expect(findCrew(g, a)?.level).toBe(1);
    run(g, 2);
    expect(findCrew(g, a)?.level).toBe(2);
    expect(findCrew(g, b)?.level).toBe(1);
    expect(findCrew(g, b)?.xp).toBe(0);

    const member = findCrew(g, a);
    if (!member) throw new Error("missing");
    member.level = 19;
    member.xp = 1e12;
    run(g, 2);
    expect(member.level).toBe(20);
    expect(member.xp).toBe(0);
    run(g, 5);
    expect(member.level).toBe(20);
  });

  it("follows the deck record when core resets it", () => {
    const { g } = makeGame();
    const a = addCrew(g);
    assignCrew(g, a, "mining");
    g.state.decks.mining.manager = 0;
    run(g, 1.5);
    expect(findCrew(g, a)?.deck).toBeNull();
    expect(g.deckMult.mining).toBe(1);
  });
});

describe("coffee and morale", () => {
  it("each crew member drinks a bean a minute and morale climbs", () => {
    const { g } = makeGame();
    addCrew(g);
    addCrew(g);
    addItem(g, "coffee", 100);
    g.state.morale = 50;
    run(g, 600);
    expect(B.toNumber(getItem(g, "coffee"))).toBeCloseTo(80, 6);
    expect(getStat(g, "coffee")).toBe(20);
    // +3/h, +2 % per quarters level (10)
    expect(moralePerHour(g)).toBeCloseTo(3.6, 9);
    expect(g.state.morale).toBeCloseTo(50 + 3.6 / 6, 2);
  });

  it("without coffee morale drops 6 per hour and KIPP says so once", () => {
    const { g, calls } = makeGame();
    addCrew(g);
    g.state.morale = 50;
    run(g, 1830);
    expect(calls.say.filter((c) => c.trigger === "coffeeOut").length).toBe(1);
    expect(moralePerHour(g)).toBe(-6);
    // the first minute still runs on the last cup
    expect(g.state.morale).toBeCloseTo(50 + 3.6 / 60 - (6 * 1770) / 3600, 1);
    addItem(g, "coffee", 10);
    run(g, 61);
    expect(moralePerHour(g)).toBeGreaterThan(0);
    run(g, 3600);
    expect(calls.say.filter((c) => c.trigger === "coffeeOut").length).toBe(2);
  });

  it("the coffeeUse modifier scales consumption and an empty ship drifts to 70", () => {
    const { g } = makeGame();
    addCrew(g);
    addItem(g, "coffee", 100);
    setMod(g, "coffeeUse", 0.5);
    run(g, 600);
    expect(B.toNumber(getItem(g, "coffee"))).toBeCloseTo(95, 6);

    const empty = makeGame().g;
    empty.state.morale = 69.9;
    run(empty, 600);
    expect(empty.state.morale).toBe(70);
    expect(moralePerHour(empty)).toBe(0);
  });
});

describe("cards", () => {
  it("grants by deck, weights by rarity and levels duplicates up", () => {
    const { g } = makeGame();
    expect(grantCard(g, "lift")).toBe("c_lift_a");
    expect(grantCard(g, "bridge")).toBeNull();
    expect(g.state.cards.c_lift_a).toEqual({ n: 1, lvl: 1 });
    expect(g.state.features.cards).toBe(1);
    expect(g.outbox.some((e) => e.t === "cardFound" && e.card === "c_lift_a")).toBe(true);
    expect(cardNextAt(g, "c_lift_a")).toBe(2);
    g.api.grantCard("lift");
    expect(g.state.cards.c_lift_a).toEqual({ n: 2, lvl: 2 });
    grantCard(g, "lift");
    expect(g.state.cards.c_lift_a.lvl).toBe(2);
    grantCard(g, "lift");
    expect(g.state.cards.c_lift_a).toEqual({ n: 4, lvl: 3 });
    expect(cardNextAt(g, "c_lift_a")).toBe(8);
    expect(cardLevel(g, 0)).toBe(0);
    expect(cardLevel(g, 1e9)).toBe(10);

    const n = 4000;
    for (let i = 0; i < n; i++) grantCard(g, "mining");
    // rarity weights 60 / 25 / 11
    expect(g.state.cards.c_mine_a.n / n).toBeCloseTo(60 / 96, 1);
    expect(g.state.cards.c_mine_b.n / n).toBeCloseTo(25 / 96, 1);
    expect(g.state.cards.c_mine_c.n / n).toBeCloseTo(11 / 96, 1);
    expect(getStat(g, "cards")).toBe(n + 4);
  });

  it("equips two per deck and validates everything", () => {
    const { g } = makeGame();
    g.state.cards = { c_mine_a: { n: 2, lvl: 2 }, c_mine_b: { n: 1, lvl: 1 }, c_mine_c: { n: 1, lvl: 1 } };
    expect(equipCard(g, "mining", "c_lift_a", 0)).toEqual({ ok: false, reason: "invalid" }); // wrong deck
    expect(equipCard(g, "lift", "c_lift_a", 0)).toEqual({ ok: false, reason: "requirement" }); // not owned
    expect(equipCard(g, "mining", "c_mine_a", 2)).toEqual({ ok: false, reason: "invalid" });
    expect(equipCard(g, "mining", "c_mine_a", -1)).toEqual({ ok: false, reason: "invalid" });
    expect(equipCard(g, "attic" as never, "c_mine_a", 0)).toEqual({ ok: false, reason: "invalid" });
    expect(equipCard(g, "mining", "nope", 0)).toEqual({ ok: false, reason: "invalid" });

    expect(equipCard(g, "mining", "c_mine_a", 0)).toEqual({ ok: true });
    expect(equipCard(g, "mining", "c_mine_b", 1)).toEqual({ ok: true });
    expect(g.state.decks.mining.cards).toEqual(["c_mine_a", "c_mine_b"]);
    // replacing a slot, and moving a card never duplicates it
    expect(equipCard(g, "mining", "c_mine_c", 0)).toEqual({ ok: true });
    expect(g.state.decks.mining.cards).toEqual(["c_mine_c", "c_mine_b"]);
    expect(equipCard(g, "mining", "c_mine_b", 0)).toEqual({ ok: true });
    expect(g.state.decks.mining.cards).toEqual(["c_mine_b"]);
    expect(unequipCard(g, "mining", 0)).toEqual({ ok: true });
    expect(g.state.decks.mining.cards).toEqual([]);
    expect(unequipCard(g, "mining", 0)).toEqual({ ok: false, reason: "noTarget" });
  });

  it("card effects scale with level: additive add up, multiplicative compound", () => {
    const { g } = makeGame();
    g.state.cards = { c_mine_a: { n: 2, lvl: 2 }, c_mine_b: { n: 4, lvl: 3 }, c_mine_c: { n: 2, lvl: 2 } };
    equipCard(g, "mining", "c_mine_a", 0);
    equipCard(g, "mining", "c_mine_c", 1);
    rebuild(g);
    expect(g.deckMult.mining).toBeCloseTo(1.2 * 1.21, 9);
    equipCard(g, "mining", "c_mine_b", 1);
    rebuild(g);
    expect(g.deckMult.mining).toBeCloseTo(1.2, 9);
    expect(g.mods.sellValue).toBeCloseTo(1.15, 9);
    // a duplicate that levels an equipped card takes effect
    g.content.cards = { c_mine_a: g.content.cards.c_mine_a };
    const fresh = makeGame({ content: g.content });
    fresh.g.state.cards = { c_mine_a: { n: 3, lvl: 2 } };
    equipCard(fresh.g, "mining", "c_mine_a", 0);
    rebuild(fresh.g);
    expect(fresh.g.deckMult.mining).toBeCloseTo(1.2, 9);
    grantCard(fresh.g);
    expect(fresh.g.dirty).toBe(true);
    rebuild(fresh.g);
    expect(fresh.g.deckMult.mining).toBeCloseTo(1.3, 9);
  });
});

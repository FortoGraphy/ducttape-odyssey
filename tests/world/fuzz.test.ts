import { describe, expect, it } from "vitest";
import * as B from "../../src/engine/big";
import { addItem, applyOffline, runPrestige, tick } from "../../src/engine/kernel";
import { Rng } from "../../src/engine/prng";
import { DECK_IDS, STAT_KEYS, type EventEffect, type Game } from "../../src/engine/types";
import * as W from "../../src/engine/world";
import { FAILURE_KINDS, findNonFinite, makeGame, resolveMinigame } from "./fixture";

const JUNK: unknown[] = [
  NaN, Infinity, -Infinity, -1, 0, 1, 2, 3, 7, 1.5, 1e9, -1e9, 2 ** 31, "", "x", "0:0:0:0", "9:9:9:9", "__proto__", "constructor", "toString",
  null, undefined, {}, [], [1, 2], true, { m: NaN, e: 0 }, { m: 1, e: 400 }, { m: -3, e: 2 }, "scrap", "mining",
];

/** Every value in a random walk either comes from the live state (valid) or from the junk drawer. */
function fuzz(seed: number, steps: number): { g: Game; ok: number; calls: number; worked: Set<string> } {
  const { g } = makeGame({ seed });
  const rng = new Rng(seed * 7919 + 1);
  const s = g.state;
  s.credits = B.big(1e6);
  const junk = (): never => rng.pick(JUNK) as never;
  const maybe = <T>(valid: () => T): never => (rng.chance(0.7) ? valid() : junk()) as never;
  const int = (max: number): number => rng.int(0, max);

  const itemIds = Object.keys(g.content.items);
  const eventIds = Object.keys(g.content.events);
  const cardIds = Object.keys(g.content.cards);
  const shopIds = Object.keys(g.content.shop);
  const allEffects: EventEffect[] = [];
  for (const id of eventIds) for (const c of g.content.events[id].choices) for (const o of c.outcomes) allEffects.push(...o.effects);

  const planet = (): string => rng.pick(W.currentSystem(g).planets).id;
  const crew = (): number => (s.crew.length ? rng.pick(s.crew).uid : 1);
  const deck = (): string => rng.pick(DECK_IDS);
  const item = (): string => rng.pick(itemIds);
  const amount = (): number => rng.pick([1, 2, 5, 10, 100, 1e4, 1e7]);

  let ok = 0;
  const worked = new Set<string>();
  const count = (name: string, r: unknown): void => {
    if (r && typeof r === "object" && (r as { ok?: boolean }).ok === true) {
      ok++;
      worked.add(name);
    }
  };

  const actions: [string, () => unknown][] = [
    // navigation
    ["chargeJump", () => W.chargeJump(g)],
    ["jumpTo", () => {
      const targets = W.reachable(g);
      const t = targets.length ? rng.pick(targets) : { depth: 1, lane: 0 };
      if (rng.chance(0.5)) {
        s.nav.charge = 1;
        s.nav.cooldownUntil = 0;
      }
      return W.jumpTo(g, maybe(() => t.depth), maybe(() => t.lane));
    }],
    ["refuel", () => W.refuel(g)],
    ["routeToCore", () => W.routeToCore(g, junk())],
    ["isLinked", () => W.isLinked(g, junk(), junk())],
    ["jumpCost", () => W.jumpCost(g, junk(), junk())],
    // planets
    ["startScan", () => W.startScan(g, maybe(planet))],
    ["cancelScan", () => W.cancelScan(g)],
    ["setProbes", () => W.setProbes(g, maybe(planet), maybe(() => int(3)))],
    ["buildOutpost", () => W.buildOutpost(g, maybe(planet))],
    ["hazardFactor", () => W.hazardFactor(g)],
    // expeditions
    ["startExpedition", () => W.startExpedition(g, maybe(planet), maybe(() => s.crew.filter(() => rng.chance(0.5)).map((c) => c.uid)), maybe(() => rng.pick(["short", "medium", "long"])))],
    ["claimExpedition", () => W.claimExpedition(g, maybe(() => (s.expeditions.length ? rng.pick(s.expeditions).uid : 0)))],
    ["previewExpedition", () => W.previewExpedition(g, maybe(planet), maybe(() => [crew()]), junk())],
    // events
    ["chooseEvent", () => W.chooseEvent(g, maybe(() => int(3)))],
    ["dismissEvent", () => W.dismissEvent(g)],
    ["triggerEvent", () => W.triggerEvent(g, maybe(() => rng.pick(eventIds)))],
    ["eventChance", () => W.eventChance(g, maybe(() => rng.pick(eventIds)))],
    ["env2", () => g.api.applyEffects(maybe(() => [rng.pick(allEffects), rng.pick(allEffects)]), junk())],
    ["env3", () => g.api.applyEffects([{ t: rng.pick(["credits", "item", "hull", "fuel", "morale", "rp", "buff", "loseCargo", "moduleDamage", "rep", "flag", "chain", "codex", "log", "card", "minigame", "failure"]), secs: junk(), n: junk(), pct: junk(), item: junk(), faction: junk(), key: junk(), event: junk(), effect: junk(), kind: junk(), game: junk(), tier: junk(), win: junk(), lose: junk(), deck: junk(), id: junk() } as never], 3)],
    // failures
    ["startFailure", () => W.startFailure(g, maybe(() => rng.pick(FAILURE_KINDS)))],
    ["env4", () => g.api.startFailure(maybe(() => rng.pick(FAILURE_KINDS)))],
    ["attemptFailureExit", () => W.attemptFailureExit(g, maybe(() => int(3)))],
    ["callTow", () => W.callTow(g)],
    ["towQuote", () => W.towQuote(g)],
    ["env5", () => (rng.chance(0.3) ? g.api.clearFailure(maybe(() => rng.pick(["tow", "wait", "items", "credits", "minigame"]))) : null)],
    // crew and cards
    ["addCrew", () => W.addCrew(g)],
    ["assignCrew", () => W.assignCrew(g, maybe(crew), maybe(() => (rng.chance(0.2) ? null : deck())))],
    ["renameCrew", () => W.renameCrew(g, maybe(crew), maybe(() => "Name " + int(99)))],
    ["dismissCrew", () => (rng.chance(0.2) ? W.dismissCrew(g, maybe(crew)) : null)],
    ["grantCard", () => W.grantCard(g, maybe(() => (rng.chance(0.5) ? undefined : deck())))],
    ["equipCard", () => W.equipCard(g, maybe(deck), maybe(() => rng.pick(cardIds)), maybe(() => int(1)))],
    ["unequipCard", () => W.unequipCard(g, maybe(deck), maybe(() => int(1)))],
    // station
    ["dock", () => W.dock(g)],
    ["undock", () => (rng.chance(0.3) ? W.undock(g) : null)],
    ["buy", () => W.buy(g, maybe(item), maybe(amount))],
    ["sellAt", () => W.sellAt(g, maybe(item), maybe(amount))],
    ["stationBuyPrice", () => W.stationBuyPrice(g, junk(), junk())],
    ["stationSellPrice", () => W.stationSellPrice(g, maybe(item), junk())],
    ["marketRows", () => W.marketRows(g)],
    ["acceptContract", () => W.acceptContract(g, maybe(() => int(2)))],
    ["deliverContract", () => W.deliverContract(g, maybe(() => (s.station.contracts.length ? rng.pick(s.station.contracts).uid : 0)))],
    ["abandonContract", () => W.abandonContract(g, maybe(() => (s.station.contracts.length && rng.chance(0.3) ? rng.pick(s.station.contracts).uid : 0)))],
    ["buyShop", () => W.buyShop(g, maybe(() => rng.pick(shopIds)))],
    ["repairAtDock", () => W.repairAtDock(g)],
    ["hireOffers", () => W.hireOffers(g)],
    ["hireCrew", () => W.hireCrew(g, maybe(() => int(2)))],
    ["openGridCells", () => W.openGridCells(g, junk())],
    // the world moving on its own
    ["env6", () => {
      const n = rng.int(1, 700);
      for (let i = 0; i < n; i++) tick(g, 0.1);
    }],
    ["env7", () => resolveMinigame(g, rng.chance(0.5), rng.next())],
    ["env8", () => {
      s.t += rng.pick([30, 600, 4000, 90000]);
    }],
    ["env9", () => (rng.chance(0.15) ? applyOffline(g, rng.pick([NaN, -50, 61, 300, 3600, 30000, 9e5, Infinity])) : null)],
    ["env10", () => {
      // stock the hold with whatever the actions might want
      addItem(g, rng.pick(itemIds), rng.pick([1, 10, 1000, 1e6]));
      if (rng.chance(0.3)) s.credits = B.big(rng.pick([0, 50, 1e5, 1e12]));
    }],
    ["env11", () => {
      // modifiers at their extremes: zero, tiny, huge
      s.buffs = s.buffs.filter((b) => !b.src.startsWith("fuzz"));
      if (rng.chance(0.6)) s.buffs.push({ effect: { stat: rng.pick(STAT_KEYS), mul: rng.pick([0, 0.001, 1, 5, 1e6, 1e300]) }, until: s.t + 300, src: "fuzz" + int(3) });
      g.dirty = true;
    }],
    ["env12", () => {
      s.drones.probe = int(4);
      s.hull.hp = rng.pick([0, 5, 40, 100]);
      s.morale = rng.pick([0, 30, 100]);
      if (rng.chance(0.2)) g.rates.cargoUsed = rng.chance(0.5) ? B.clone(g.rates.cargoCap) : B.big(0);
    }],
    ["env13", () => {
      // wander: a random real system of this galaxy, so stations and deep space both get exercised
      if (!rng.chance(0.4) || s.nav.jump) return;
      const core = W.galaxyDepth(g.content, s.nav.g);
      let depth = int(core);
      let lane = int(W.lanesAt(s.seed, s.nav.g, depth, core) - 1);
      // half the time, head for a port
      for (let tries = 0; tries < 40 && rng.chance(0.5) && !W.hasStation(g.content, s.seed, s.nav.g, depth, lane); tries++) {
        depth = int(core);
        lane = int(W.lanesAt(s.seed, s.nav.g, depth, core) - 1);
      }
      s.nav.depth = depth;
      s.nav.lane = lane;
      s.station.docked = false;
    }],
    ["env14", () => {
      if (!rng.chance(0.02)) return;
      s.prestige.warps += rng.chance(0.7) ? 1 : 0;
      runPrestige(g, rng.pick([1, 1, 2, 3]));
    }],
  ];

  for (let i = 0; i < steps; i++) {
    const [name, act] = rng.pick(actions);
    count(name, act());
    // time always moves a little, so scans, charges and timers make progress between calls
    const n = rng.int(1, 6);
    for (let k = 0; k < n; k++) tick(g, 0.1);
    g.outbox.length = 0;
    if (i % 400 === 0) {
      const bad = findNonFinite(s);
      if (bad.length) throw new Error(`step ${i}: non-finite state at ${bad.slice(0, 5).join(", ")}`);
    }
  }
  return { g, ok, calls: steps, worked };
}

describe("fuzz", () => {
  it("20 000 random valid and invalid calls never throw and never leave NaN in the state", () => {
    let ok = 0;
    let total = 0;
    const worked = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5]) {
      const run = fuzz(seed, 4000);
      total += run.calls;
      ok += run.ok;
      for (const name of run.worked) worked.add(name);
      const s = run.g.state;
      expect(findNonFinite(s)).toEqual([]);
      expect(findNonFinite(run.g.mods, "mods")).toEqual([]);
      // slice invariants
      expect(s.nav.fuel).toBeGreaterThanOrEqual(0);
      expect(s.nav.fuel).toBeLessThanOrEqual(W.fuelCap(run.g) + 1e-9);
      expect(s.nav.charge).toBeGreaterThanOrEqual(0);
      expect(s.nav.charge).toBeLessThanOrEqual(1);
      expect(s.morale).toBeGreaterThanOrEqual(0);
      expect(s.morale).toBeLessThanOrEqual(100);
      expect(Number.isInteger(s.nav.depth) && Number.isInteger(s.nav.lane) && s.nav.g === s.prestige.warps).toBe(true);
      expect(W.currentSystem(run.g).id).toBe(`${s.nav.g}:${s.nav.depth}:${s.nav.lane}`);
      for (const f of ["lamplighters", "rustborn", "ledger"] as const) {
        expect(s.station.rep[f]).toBeGreaterThanOrEqual(-100);
        expect(s.station.rep[f]).toBeLessThanOrEqual(100);
      }
      expect(Object.keys(s.station.rep).sort()).toEqual(["lamplighters", "ledger", "rustborn"]);
      expect(s.grid.open).toBeLessThanOrEqual(s.grid.cells.length);
      expect(s.grid.cells.length).toBe(s.grid.w * s.grid.h);
      expect(s.events.chain.length).toBeLessThanOrEqual(8);
      expect(s.expeditions.length).toBeLessThanOrEqual(8);
      expect(s.station.contracts.length).toBeLessThanOrEqual(5);
      expect(new Set(s.crew.map((c) => c.uid)).size).toBe(s.crew.length);
      for (const id of DECK_IDS) {
        const d = s.decks[id];
        expect(d.cards.length).toBeLessThanOrEqual(2);
        // a deck's manager and the crew member's post agree
        if (d.manager !== 0) expect(s.crew.find((c) => c.uid === d.manager)?.deck).toBe(id);
      }
      for (const c of s.crew) {
        expect(c.level).toBeGreaterThanOrEqual(1);
        expect(c.level).toBeLessThanOrEqual(20);
        if (c.deck) expect(s.decks[c.deck].manager).toBe(c.uid);
      }
      for (const id of Object.keys(s.cards)) expect(run.g.content.cards[id]).toBeDefined();
      for (const id of Object.keys(s.inv)) expect(B.isBig(s.inv[id]) && s.inv[id].m > 0).toBe(true);
      expect(Object.getPrototypeOf(s.inv)).toBe(Object.prototype);
      expect(Object.getPrototypeOf(s.flags)).toBe(Object.prototype);
    }
    expect(total).toBe(20000);
    // the walk is not all rejections: every kind of action went through for real at least once
    expect(ok).toBeGreaterThan(1000);
    const expected = [
      "chargeJump", "jumpTo", "refuel", "startScan", "cancelScan", "setProbes", "buildOutpost", "startExpedition", "claimExpedition",
      "chooseEvent", "dismissEvent", "attemptFailureExit", "callTow", "assignCrew", "renameCrew", "dismissCrew", "equipCard", "unequipCard",
      "dock", "undock", "buy", "sellAt", "acceptContract", "deliverContract", "abandonContract", "buyShop", "repairAtDock", "hireCrew",
    ];
    expect(expected.filter((name) => !worked.has(name))).toEqual([]);
  });

  it("survives a hostile save: init repairs every world slice", () => {
    const { g, content } = makeGame();
    const s = g.state as unknown as Record<string, unknown>;
    s.nav = { g: NaN, depth: 1e9, lane: -4, fuel: NaN, charge: 7, cooldownUntil: NaN, jump: { depth: "x" }, visited: null, maxDepth: NaN };
    s.planets = { "0:0:0:0": { scan: NaN, probes: -2, outpost: 5 } };
    s.expeditions = [null, { uid: 1, crew: "no", end: NaN, seed: NaN }];
    s.outposts = null;
    s.events = { active: { id: "gone", seed: 1, result: null }, nextAt: NaN, last: null, seen: null, hourStart: NaN, hourCount: NaN, chain: null };
    s.failure = { kind: "nonsense", since: NaN, waitUntil: NaN, tow: { eta: NaN, cost: null } };
    s.crew = [null, { uid: 5, seed: 3, name: "", traits: null, level: 99, xp: NaN, deck: "attic", away: "yes" }];
    s.morale = NaN;
    s.cards = { c_mine_a: { n: NaN, lvl: NaN } };
    s.station = { docked: "yes", rep: { lamplighters: NaN }, contracts: [null, { item: "gone" }], offers: null, offersDay: NaN, shop: null, trades: null };
    const revived = makeGame({ content }).g;
    revived.state = g.state;
    for (const sys of revived.systems) sys.init?.(revived);
    expect(findNonFinite(revived.state.nav)).toEqual([]);
    expect(findNonFinite(revived.state.station)).toEqual([]);
    expect(findNonFinite(revived.state.events)).toEqual([]);
    expect(findNonFinite(revived.state.crew)).toEqual([]);
    expect(findNonFinite(revived.state.planets)).toEqual([]);
    expect(findNonFinite(revived.state.cards)).toEqual([]);
    expect(revived.state.morale).toBe(70);
    expect(revived.state.failure).toBeNull();
    expect(revived.state.events.active).toBeNull();
    expect(revived.state.crew.length).toBe(1);
    expect(revived.state.crew[0].level).toBe(20);
    expect(revived.state.crew[0].name.length).toBeGreaterThan(2);
    expect(revived.state.nav.depth).toBe(40);
    for (let i = 0; i < 200; i++) tick(revived, 0.1);
    expect(findNonFinite(revived.state)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import * as B from "../../src/engine/big";
import { addItem, applyOffline, getItem, getStat, runPrestige, tick } from "../../src/engine/kernel";
import type { ContentDB, Game, OfflinePolicy } from "../../src/engine/types";
import {
  acceptContract,
  addCrew,
  assignCrew,
  buyShop,
  currentSystem,
  dock,
  equipCard,
  findCrew,
  grantCard,
  jumpTo,
  planetYieldItem,
  policyChoice,
  startExpedition,
  startFailure,
  startScan,
  triggerEvent,
} from "../../src/engine/world";
import { findSystem, makeContent, makeGame, readyToJump, run, teleport } from "./fixture";

/** Content where only the listed events can be picked by the scheduler. */
function only(...ids: string[]): ContentDB {
  const content = makeContent();
  for (const id of Object.keys(content.events)) content.events[id].weight = ids.includes(id) ? 5 : 0;
  return content;
}

function withPolicy(policy: OfflinePolicy, content: ContentDB, seed = 7): ReturnType<typeof makeGame> {
  const f = makeGame({ content, seed });
  f.g.state.offline.policy = policy;
  return f;
}

describe("offline events", () => {
  it("resolves by policy: cautious takes the lowest risk, risky the highest, balanced the middle", () => {
    const expected: Record<OfflinePolicy, number> = { cautious: 0, balanced: 1, risky: 2 };
    for (const policy of ["cautious", "balanced", "risky"] as OfflinePolicy[]) {
      for (let seed = 1; seed <= 8; seed++) {
        const { g } = withPolicy(policy, only("ev_common"), seed);
        expect(policyChoice(g, g.content.events.ev_common)).toBe(expected[policy]);
        const report = applyOffline(g, 3600);
        expect(report.events.length).toBe(1);
        expect(report.events[0].id).toBe("ev_common");
        expect(report.events[0].choice).toBe(expected[policy]);
        const outcomes = g.content.events.ev_common.choices[expected[policy]].outcomes.length;
        expect(report.events[0].outcome).toBeGreaterThanOrEqual(0);
        expect(report.events[0].outcome).toBeLessThan(outcomes);
        expect(getStat(g, "events")).toBe(1);
        expect(getStat(g, "event_meteor")).toBe(1);
        expect(g.state.events.seen.ev_common).toBe(1);
        // nothing is left on screen and nothing was requested from the player
        expect(g.state.events.active).toBeNull();
        expect(g.state.minigame).toBeNull();
        expect(g.state.failure).toBeNull();
        expect(g.state.offline.lastReport).toBe(report);
      }
    }
  });

  it("policy picks among the choices that can actually be taken", () => {
    const { g } = withPolicy("risky", only("ev_cost"));
    const def = g.content.events.ev_cost;
    // VIP needs a flag, barter needs scrap: only paying is possible
    expect(policyChoice(g, def)).toBe(0);
    g.state.flags.vip = 1;
    expect(policyChoice(g, def)).toBe(2);
    g.state.offline.policy = "balanced";
    addItem(g, "scrap", 10);
    expect(policyChoice(g, def)).toBe(1);
    g.state.offline.policy = "cautious";
    expect(policyChoice(g, def)).toBe(0);
    g.state.credits = B.big(0);
    expect(policyChoice(g, def)).toBe(1);
    g.state.inv = {};
    g.state.flags.vip = 0;
    expect(policyChoice(g, def)).toBe(-1);
    const report = applyOffline(g, 3600);
    expect(report.events).toEqual([]);
  });

  it("pays the choice's cost and applies its effects", () => {
    const { g } = withPolicy("cautious", only("ev_cost"));
    g.state.credits = B.big(5000);
    g.state.morale = 40;
    const report = applyOffline(g, 3600);
    expect(report.events).toEqual([{ id: "ev_cost", choice: 0, outcome: 0 }]);
    expect(B.toNumber(g.state.credits)).toBe(4000);
    // +5 from the event, +3 from an hour of an empty ship settling toward 70
    expect(g.state.morale).toBeCloseTo(48, 6);
  });

  it("scales the count with the time away: none for a short break, up to three overnight", () => {
    const content = only("ev_common", "ev_rare", "ev_chain_a", "ev_luck");
    expect(applyOffline(makeGame({ content }).g, 120).events.length).toBe(0);
    expect(applyOffline(makeGame({ content }).g, 239).events.length).toBe(0);
    expect(applyOffline(makeGame({ content }).g, 1800).events.length).toBe(1);
    expect(applyOffline(makeGame({ content }).g, 3 * 3600).events.length).toBe(2);
    const long = applyOffline(makeGame({ content }).g, 8 * 3600);
    expect(long.events.length).toBe(3);
    // cooldowns hold within one absence: three different events
    expect(new Set(long.events.map((e) => e.id)).size).toBe(3);
    // only one eligible event: the cooldown allows it once
    expect(applyOffline(makeGame({ content: only("ev_common") }).g, 8 * 3600).events.length).toBe(1);
  });

  it("turns failures and mini-games into mild damage and never starts either", () => {
    const fail = withPolicy("risky", only("ev_fail"));
    const r1 = applyOffline(fail.g, 3600);
    expect(r1.events).toEqual([{ id: "ev_fail", choice: 1, outcome: 0 }]);
    expect(fail.calls.damageHull).toEqual([6]);
    expect(fail.g.state.failure).toBeNull();
    expect(getStat(fail.g, "failures")).toBe(0);

    const mg = withPolicy("balanced", only("ev_minigame"));
    const r2 = applyOffline(mg.g, 3600);
    expect(r2.events.length).toBe(1);
    expect(mg.calls.damageModules).toEqual([{ pct: 5, count: 1, family: undefined }]);
    expect(mg.calls.minigames).toEqual([]);
    expect(mg.g.state.minigame).toBeNull();
    expect(mg.g.state.flags.mg_win).toBeUndefined();
    expect(mg.g.state.flags.mg_lose).toBeUndefined();
  });

  it("never holes the hull offline", () => {
    const content = only("ev_fail");
    content.events.ev_fail.choices[1].outcomes[0].effects = [{ t: "hull", pct: -80 }];
    const { g } = withPolicy("risky", content);
    g.state.hull.hp = 40;
    const report = applyOffline(g, 3600);
    expect(report.events.length).toBe(1);
    expect(g.state.hull.hp).toBe(10);
    expect(g.state.failure).toBeNull();
    expect(report.hull).toEqual({ from: 40, to: 10 });
    // a hull that was already lower is left where it was
    const low = withPolicy("risky", content).g;
    low.state.hull.hp = 4;
    applyOffline(low, 3600);
    expect(low.state.hull.hp).toBe(4);
  });

  it("keeps one-off and story events for when the player is there, and drops chains", () => {
    const { g } = withPolicy("balanced", only("ev_once", "ev_story"));
    expect(applyOffline(g, 6 * 3600).events).toEqual([]);
    expect(g.state.events.seen).toEqual({});

    const chain = withPolicy("balanced", only("ev_chain_a")).g;
    expect(applyOffline(chain, 3600).events.length).toBe(1);
    expect(chain.state.events.chain).toEqual([]);
  });

  it("gives a breather before the next live event and a fresh hourly window", () => {
    const { g } = withPolicy("balanced", only("ev_common"));
    g.state.events.hourCount = 8;
    const t0 = g.state.t;
    applyOffline(g, 7200);
    const ev = g.state.events;
    expect(ev.nextAt - (t0 + 7200)).toBeGreaterThanOrEqual(60);
    expect(ev.nextAt - (t0 + 7200)).toBeLessThanOrEqual(180);
    expect(ev.hourCount).toBe(0);
    expect(ev.active).toBeNull();
    run(g, 59);
    expect(ev.active).toBeNull();
    run(g, 122);
    expect(ev.active?.id).toBe("ev_common");
  });

  it("leaves an event the player had open exactly as it was", () => {
    const { g } = withPolicy("balanced", only("ev_common"));
    triggerEvent(g, "ev_luck");
    const open = g.state.events.active;
    applyOffline(g, 3600);
    expect(g.state.events.active).toBe(open);
    expect(open?.result).toBeNull();
  });
});

describe("offline progress", () => {
  it("outposts and probes keep yielding at offline efficiency, crew keep learning", () => {
    const { g } = makeGame({ content: only() });
    const planet = currentSystem(g).planets[0];
    const item = planetYieldItem(planet) as string;
    g.state.planets[planet.id] = { scan: 1, probes: 2, outpost: 1 };
    g.state.drones.probe = 2;
    g.state.outposts.push({ planet: planet.id, name: planet.name, item, rate: 0.02 });
    const uid = addCrew(g);
    assignCrew(g, uid, "mining");
    addItem(g, "coffee", 1000);
    g.state.morale = 50;
    const report = applyOffline(g, 3600);
    // 10 units/s x (2 % + 2 x 4 %) x 3600 s x 35 %
    expect(B.toNumber(report.items[item])).toBeCloseTo(10 * 0.1 * 3600 * 0.35, 3);
    expect(B.toNumber(getItem(g, item))).toBeCloseTo(1260, 3);
    expect(findCrew(g, uid)?.level).toBeGreaterThan(5);
    expect(B.toNumber(getItem(g, "coffee"))).toBeCloseTo(940, 3);
    expect(g.state.morale).toBeGreaterThan(50);
    expect(getStat(g, "offlineReturns")).toBe(1);
  });

  it("a long absence without coffee dents morale but not below the floor", () => {
    const { g } = makeGame({ content: only() });
    addCrew(g);
    g.state.morale = 60;
    applyOffline(g, 8 * 3600);
    expect(g.state.morale).toBe(20);
    const low = makeGame({ content: only() }).g;
    addCrew(low);
    low.state.morale = 12;
    applyOffline(low, 8 * 3600);
    expect(low.state.morale).toBe(12);
  });

  it("a failing ship is parked in safe mode; its timers still run", () => {
    const { g } = makeGame({ content: only() });
    startFailure(g, "tumble"); // wait exit: 120 s
    const planet = currentSystem(g).planets[0];
    g.state.planets[planet.id] = { scan: 1, probes: 0, outpost: 1 };
    g.state.outposts.push({ planet: planet.id, name: planet.name, item: "scrap", rate: 0.02 });
    const report = applyOffline(g, 600);
    expect(report.safeMode).toBe(true);
    expect(report.items.scrap).toBeUndefined();
    expect(g.state.failure).toBeNull(); // waited out while away
  });

  it("no stranding while away", () => {
    const { g } = makeGame({ content: only(), seed: 5 });
    const sys = findSystem(g, (s) => s.station === null && s.depth >= 3 && !s.resources.some((r) => r.item === "hydrogen"));
    teleport(g, sys.depth, sys.lane);
    g.state.nav.fuel = 0;
    applyOffline(g, 3600);
    expect(g.state.failure).toBeNull();
    run(g, 25);
    expect(g.state.failure?.kind).toBe("noFuel");
  });
});

describe("reasons to come back", () => {
  const kinds = (g: Game, seconds: number): string[] => applyOffline(g, seconds).hooks.map((h) => h.kind);

  it("a finished expedition", () => {
    const { g } = makeGame({ content: only() });
    const planet = currentSystem(g).planets[0];
    g.state.planets[planet.id] = { scan: 1, probes: 0, outpost: 0 };
    const uid = addCrew(g);
    startExpedition(g, planet.id, [uid], "short");
    const early = makeGame({ content: only() }).g;
    expect(kinds(early, 200)).not.toContain("expedition");
    const report = applyOffline(g, 900);
    const hook = report.hooks.find((h) => h.kind === "expedition");
    expect(hook?.text.en).toContain(planet.name);
    expect(hook?.text.cs).toContain(planet.name);
    expect(hook?.text.cs).not.toBe(hook?.text.en);
    run(g, 1.1);
    expect(g.state.expeditions[0].done).toBe(true);
  });

  it("a completed scan", () => {
    const { g } = makeGame({ content: only() });
    const planet = currentSystem(g).planets[1];
    startScan(g, planet.id);
    run(g, 10);
    const report = applyOffline(g, 120);
    expect(g.state.planets[planet.id].scan).toBe(1);
    expect(getStat(g, "planetsScanned")).toBe(1);
    const hook = report.hooks.find((h) => h.kind === "discovery");
    expect(hook?.text.en).toContain(planet.name);
    expect(hook?.text.cs).toContain("sken");
  });

  it("a contract whose cargo is ready, and a market that moved", () => {
    const { g } = makeGame({ content: only(), seed: 12 });
    const sys = findSystem(g, (s) => s.station !== null);
    teleport(g, sys.depth, sys.lane);
    dock(g);
    acceptContract(g, 0);
    const c = g.state.station.contracts[0];
    expect(kinds(g, 600)).not.toContain("contract");
    addItem(g, c.item, c.need);
    const report = applyOffline(g, 3 * 3600);
    const got = report.hooks.map((h) => h.kind);
    expect(got).toContain("contract");
    expect(got).toContain("trader");
    expect(report.hooks.find((h) => h.kind === "trader")?.text.en).toContain(sys.station?.name);
    expect(report.hooks.find((h) => h.kind === "contract")?.text.cs).toContain("zakázku");
    // inside the same market hour nothing moved, so nothing is claimed
    const quick = makeGame({ content: only(), seed: 12 }).g;
    teleport(quick, sys.depth, sys.lane);
    quick.state.t = 3600 * 4 + 10;
    expect(kinds(quick, 300)).not.toContain("trader");
  });

  it("falls back to unscanned planets, with Czech plural forms, and never more than three", () => {
    const { g } = makeGame({ content: only() });
    const sys = currentSystem(g);
    const report = applyOffline(g, 600);
    expect(report.hooks.length).toBe(1);
    expect(report.hooks[0].kind).toBe("discovery");
    expect(report.hooks[0].text.en).toContain(String(sys.planets.length));
    expect(report.hooks[0].text.cs).toMatch(sys.planets.length < 5 ? /zbývají \d neprozkoumané planety/ : /zbývá \d neprozkoumaných planet/);

    for (let i = 1; i < sys.planets.length; i++) g.state.planets[sys.planets[i].id] = { scan: 1, probes: 0, outpost: 0 };
    const one = applyOffline(g, 600);
    expect(one.hooks[0].text.cs).toBe("V soustavě zbývá 1 neprozkoumaná planeta.");
    expect(one.hooks[0].text.en).toBe("One planet in this system is still unscanned.");

    g.state.planets[sys.planets[0].id] = { scan: 1, probes: 0, outpost: 0 };
    expect(applyOffline(g, 600).hooks).toEqual([]); // nothing true to say: say nothing

    const locked = makeGame({ content: only(), features: false }).g;
    expect(applyOffline(locked, 600).hooks).toEqual([]);
  });
});

describe("prestige", () => {
  function busy(): ReturnType<typeof makeGame> {
    const f = makeGame({ content: only(), seed: 12 });
    const g = f.g;
    g.state.credits = B.big(1e9);
    const a = addCrew(g);
    const b = addCrew(g);
    assignCrew(g, a, "mining");
    grantCard(g, "lift");
    equipCard(g, "lift", "c_lift_a", 0);
    const start = currentSystem(g);
    g.state.planets[start.planets[0].id] = { scan: 1, probes: 0, outpost: 1 };
    g.state.outposts.push({ planet: start.planets[0].id, name: "x", item: "scrap", rate: 0.02 });
    startExpedition(g, start.planets[0].id, [b], "long");
    readyToJump(g);
    jumpTo(g, 1, start.links[0]);
    run(g, 7);
    const sys = findSystem(g, (s) => s.station !== null);
    teleport(g, sys.depth, sys.lane);
    dock(g);
    acceptContract(g, 0);
    buyShop(g, "sh_drill");
    buyShop(g, "sh_grid");
    buyShop(g, "fuel_tank");
    g.state.station.rep = { lamplighters: 40, rustborn: -30, ledger: 9 };
    triggerEvent(g, "ev_common");
    g.state.events.chain.push({ id: "ev_chain_b", at: g.state.t + 50 });
    startFailure(g, "engine");
    g.state.nav.fuel = 44;
    return f;
  }

  it("a warp moves to the next galaxy and resets the run, keeping crew, cards and reputation", () => {
    const { g } = busy();
    const s = g.state;
    expect(s.grid.open).toBe(5);
    s.prestige.warps = 1;
    runPrestige(g, 1);
    expect(s.nav).toEqual({ g: 1, depth: 0, lane: 0, fuel: 30, charge: 0, cooldownUntil: 0, jump: null, visited: { "1:0:0": 1 }, maxDepth: 0 });
    expect(currentSystem(g).id).toBe("1:0:0");
    expect(g.api.currentSystem().g).toBe(1);
    expect(s.planets).toEqual({});
    expect(s.outposts).toEqual([]);
    expect(s.expeditions).toEqual([]);
    expect(s.failure).toBeNull();
    expect(s.events.active).toBeNull();
    expect(s.events.chain).toEqual([]);
    expect(s.events.hourCount).toBe(0);
    expect(s.events.nextAt).toBeGreaterThan(s.t + 200);
    expect(s.station.docked).toBe(false);
    expect(s.station.contracts).toEqual([]);
    expect(s.station.offers).toEqual([]);
    expect(s.station.trades).toEqual({});
    // grid cells stay open across a warp, so the purchases that opened them stay counted
    expect(s.station.shop).toEqual({ sh_grid: 1 });
    expect(s.crew.length).toBe(2);
    expect(s.crew.every((c) => c.deck === null && !c.away)).toBe(true);
    expect(s.cards.c_lift_a).toEqual({ n: 1, lvl: 1 });
    expect(s.station.rep).toEqual({ lamplighters: 40, rustborn: -30, ledger: 9 });
    tick(g, 0.1);
    expect(g.mods.mineRate).toBe(1); // the drill upgrade is gone
    expect(g.outbox.some((e) => e.t === "prestige" && e.layer === 1)).toBe(true);
  });

  it("deeper layers also clear the shop and halve reputation", () => {
    for (const layer of [2, 3] as const) {
      const { g } = busy();
      g.state.prestige.warps = 0;
      runPrestige(g, layer);
      expect(g.state.station.shop).toEqual({});
      expect(g.state.station.rep).toEqual({ lamplighters: 20, rustborn: -15, ledger: 4.5 });
      expect(g.state.crew.length).toBe(2);
      expect(g.state.cards.c_lift_a).toBeDefined();
      expect(g.state.nav.g).toBe(0);
      expect(g.state.nav.depth).toBe(0);
    }
  });

  it("follows the warp count even when it changes after the reset", () => {
    const { g } = makeGame();
    teleport(g, 4, 1);
    g.state.prestige.warps = 3;
    tick(g, 0.1);
    expect(g.state.nav.g).toBe(3);
    expect(g.state.nav.depth).toBe(0);
    expect(currentSystem(g).id).toBe("3:0:0");
    expect(currentSystem(g).isCore).toBe(false);
  });
});

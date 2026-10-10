import { describe, expect, it } from "vitest";
import * as B from "../../src/engine/big";
import { addItem, getItem, getStat, tick } from "../../src/engine/kernel";
import type { Game, PlanetInfo, StatKey } from "../../src/engine/types";
import {
  addCrew,
  assignCrew,
  buildOutpost,
  cancelScan,
  claimExpedition,
  currentSystem,
  expeditionKind,
  expeditionOutcome,
  expeditionRisk,
  faunaKey,
  findCrew,
  floraKey,
  hazardFactor,
  isInjured,
  jumpTo,
  lastExpeditionOutcome,
  outpostCost,
  planetYieldItem,
  previewExpedition,
  probesUsed,
  scanSeconds,
  scanTarget,
  setProbes,
  startExpedition,
  startScan,
} from "../../src/engine/world";
import { findSystem, makeGame, readyToJump, run, teleport } from "./fixture";

function setMod(g: Game, stat: StatKey, mul: number): void {
  g.state.buffs.push({ effect: { stat, mul }, until: Number.MAX_SAFE_INTEGER, src: "test:" + stat });
  g.dirty = true;
  tick(g, 0.1);
}

function scanned(g: Game, p: PlanetInfo): void {
  g.state.planets[p.id] = { scan: 1, probes: 0, outpost: 0 };
}

describe("orbital scan", () => {
  it("takes 60 s, then files the planet and its species in the codex", () => {
    const { g, calls } = makeGame({ seed: 14 });
    const sys = findSystem(g, (s) => s.planets.some((p) => p.fauna > 0 && p.flora > 0));
    teleport(g, sys.depth, sys.lane);
    const planet = sys.planets.find((p) => p.fauna > 0 && p.flora > 0) as PlanetInfo;
    expect(scanSeconds(g)).toBe(60);
    expect(startScan(g, planet.id)).toEqual({ ok: true });
    expect(scanTarget(g)).toBe(planet);
    run(g, 30);
    expect(g.state.planets[planet.id].scan).toBeCloseTo(0.5, 2);
    expect(calls.discover).toEqual([]);
    run(g, 31);
    expect(g.state.planets[planet.id].scan).toBe(1);
    expect(scanTarget(g)).toBeNull();
    expect(getStat(g, "planetsScanned")).toBe(1);
    expect(calls.discover).toContain("planet:" + planet.id);
    for (let i = 0; i < planet.fauna; i++) expect(calls.discover).toContain(faunaKey(planet.id, i));
    for (let i = 0; i < planet.flora; i++) expect(calls.discover).toContain(floraKey(planet.id, i));
    expect(calls.discover.length).toBe(1 + planet.fauna + planet.flora);
    expect(startScan(g, planet.id)).toEqual({ ok: false, reason: "max" });
  });

  it("validates the target and is gated by the feature", () => {
    const { g } = makeGame({ features: false });
    const here = currentSystem(g).planets[0];
    expect(startScan(g, here.id)).toEqual({ ok: false, reason: "locked" });
    g.state.features.scan = 1;
    expect(startScan(g, "0:5:0:0")).toEqual({ ok: false, reason: "noTarget" });
    expect(startScan(g, "garbage")).toEqual({ ok: false, reason: "noTarget" });
    expect(startScan(g, 42 as unknown as string)).toEqual({ ok: false, reason: "noTarget" });
    expect(cancelScan(g)).toEqual({ ok: false, reason: "noTarget" });
    expect(startScan(g, here.id)).toEqual({ ok: true });
    expect(cancelScan(g)).toEqual({ ok: true });
  });

  it("keeps progress per planet, speeds up with scanSpeed and with scanner pulses", () => {
    const { g } = makeGame();
    const [a, b] = currentSystem(g).planets;
    startScan(g, a.id);
    run(g, 15);
    startScan(g, b.id);
    run(g, 15);
    expect(g.state.planets[a.id].scan).toBeCloseTo(0.25, 2);
    expect(g.state.planets[b.id].scan).toBeCloseTo(0.25, 2);

    // a pulse from core shows up as stats.pulses going up
    g.state.stats.pulses = (g.state.stats.pulses ?? 0) + 1;
    run(g, 1.1);
    expect(g.state.planets[b.id].scan).toBeGreaterThan(0.25 + 0.15);

    setMod(g, "scanSpeed", 3);
    expect(scanSeconds(g)).toBe(20);
    const before = g.state.planets[b.id].scan;
    run(g, 5);
    expect(g.state.planets[b.id].scan - before).toBeCloseTo(0.25, 2);
  });

  it("is dropped by a jump but the progress stays", () => {
    const { g } = makeGame();
    const sys = currentSystem(g);
    startScan(g, sys.planets[0].id);
    run(g, 20);
    readyToJump(g);
    jumpTo(g, 1, sys.links[0]);
    expect(scanTarget(g)).toBeNull();
    run(g, 60);
    expect(g.state.planets[sys.planets[0].id].scan).toBeCloseTo(1 / 3, 2);
  });
});

describe("probes", () => {
  it("need a scan and are limited by the probe drones", () => {
    const { g } = makeGame();
    const [a, b] = currentSystem(g).planets;
    g.state.drones.probe = 3;
    expect(setProbes(g, a.id, 1)).toEqual({ ok: false, reason: "requirement" });
    scanned(g, a);
    scanned(g, b);
    expect(setProbes(g, a.id, 2)).toEqual({ ok: true });
    expect(setProbes(g, b.id, 2)).toEqual({ ok: false, reason: "max" });
    expect(setProbes(g, b.id, 1)).toEqual({ ok: true });
    expect(probesUsed(g)).toBe(3);
    expect(setProbes(g, a.id, 3)).toEqual({ ok: false, reason: "max" });
    expect(setProbes(g, a.id, 0)).toEqual({ ok: true });
    expect(setProbes(g, b.id, 3)).toEqual({ ok: true });
    for (const n of [-1, 1.5, NaN, Infinity]) expect(setProbes(g, a.id, n)).toEqual({ ok: false, reason: "invalid" });
    expect(setProbes(g, "0:9:9:9", 1)).toEqual({ ok: false, reason: "noTarget" });

    // the hangar lost drones: extra probes come home
    g.state.drones.probe = 1;
    run(g, 1.1);
    expect(probesUsed(g)).toBe(1);
  });

  it("each probe brings 4 % of the mining rate of the planet's special or main resource", () => {
    const { g } = makeGame({ seed: 14 });
    const sys = findSystem(g, (s) => s.planets.some((p) => p.special !== null));
    teleport(g, sys.depth, sys.lane);
    const planet = sys.planets.find((p) => p.special !== null) as PlanetInfo;
    const plain = sys.planets.find((p) => p.special === null) as PlanetInfo;
    expect(planetYieldItem(planet)).toBe(planet.special);
    expect(planetYieldItem(plain)).toBe(plain.resources[0]);
    scanned(g, planet);
    g.state.drones.probe = 2;
    setProbes(g, planet.id, 2);
    run(g, 60);
    // 10 units/s x 4 % x 2 probes x 60 s
    expect(B.toNumber(getItem(g, planet.special as string))).toBeCloseTo(48, 6);

    setMod(g, "probeYield", 2);
    run(g, 10);
    expect(B.toNumber(getItem(g, planet.special as string))).toBeCloseTo(48 + 16, 6);
  });

  it("stops yielding mass when the hold is full", () => {
    const { g } = makeGame();
    const planet = currentSystem(g).planets[0];
    scanned(g, planet);
    g.state.drones.probe = 1;
    setProbes(g, planet.id, 1);
    g.rates.cargoUsed = B.clone(g.rates.cargoCap);
    run(g, 30);
    const item = planetYieldItem(planet) as string;
    expect(getItem(g, item).m).toBe(g.content.items[item].mass === 0 ? getItem(g, item).m : 0);
  });
});

describe("outposts", () => {
  it("cost components, yield everywhere for the rest of the run, one per planet", () => {
    const { g } = makeGame();
    const sys = currentSystem(g);
    const planet = sys.planets[0];
    expect(buildOutpost(g, planet.id)).toEqual({ ok: false, reason: "requirement" });
    scanned(g, planet);
    expect(buildOutpost(g, planet.id)).toEqual({ ok: false, reason: "items" });
    expect(outpostCost(g)).toEqual({ plating: 12, circuit: 6, power_cell: 3 });
    addItem(g, "plating", 100);
    addItem(g, "circuit", 100);
    addItem(g, "power_cell", 100);
    expect(buildOutpost(g, planet.id)).toEqual({ ok: true });
    expect(B.toNumber(getItem(g, "plating"))).toBeCloseTo(88, 6);
    expect(g.state.outposts).toEqual([{ planet: planet.id, name: planet.name, item: planetYieldItem(planet), rate: 0.02 }]);
    expect(g.state.planets[planet.id].outpost).toBe(1);
    expect(getStat(g, "outposts")).toBe(1);
    expect(buildOutpost(g, planet.id)).toEqual({ ok: false, reason: "max" });
    expect(outpostCost(g)).toEqual({ plating: 18, circuit: 9, power_cell: 5 });
    expect(buildOutpost(g, "0:7:0:0")).toEqual({ ok: false, reason: "noTarget" });

    const item = planetYieldItem(planet) as string;
    const before = B.toNumber(getItem(g, item));
    run(g, 50);
    expect(B.toNumber(getItem(g, item)) - before).toBeCloseTo(10, 6); // 10 units/s x 2 % x 50 s

    // still producing after the ship has moved on
    readyToJump(g);
    jumpTo(g, 1, sys.links[0]);
    run(g, 10);
    const mid = B.toNumber(getItem(g, item));
    setMod(g, "outpostYield", 3);
    run(g, 10);
    expect(B.toNumber(getItem(g, item)) - mid).toBeCloseTo(6, 6);
  });
});

describe("hazards", () => {
  it("add 15 % wear each", () => {
    const { g } = makeGame({ seed: 14 });
    expect(hazardFactor(g)).toBe(1);
    const sys = findSystem(g, (s) => s.hazards.length === 2);
    teleport(g, sys.depth, sys.lane);
    expect(hazardFactor(g)).toBeCloseTo(1.3, 9);
    expect(g.api.hazardFactor()).toBeCloseTo(1.3, 9);
  });
});

describe("expeditions", () => {
  function setup(seed = 14): { g: Game; planet: PlanetInfo; crew: number[] } {
    const { g } = makeGame({ seed });
    const planet = currentSystem(g).planets[0];
    scanned(g, planet);
    const crew = [addCrew(g), addCrew(g), addCrew(g)];
    return { g, planet, crew };
  }

  it("validates the plan", () => {
    const { g, planet, crew } = setup();
    const other = currentSystem(g).planets[1];
    expect(startExpedition(g, other.id, [crew[0]], "short")).toEqual({ ok: false, reason: "requirement" });
    expect(startExpedition(g, "0:3:0:0", [crew[0]], "short")).toEqual({ ok: false, reason: "noTarget" });
    expect(startExpedition(g, planet.id, [], "short")).toEqual({ ok: false, reason: "invalid" });
    expect(startExpedition(g, planet.id, [crew[0], crew[0]], "short")).toEqual({ ok: false, reason: "invalid" });
    expect(startExpedition(g, planet.id, [999], "short")).toEqual({ ok: false, reason: "invalid" });
    expect(startExpedition(g, planet.id, [1, 2, 3, 4], "short")).toEqual({ ok: false, reason: "invalid" });
    expect(startExpedition(g, planet.id, [crew[0]], "eternal" as never)).toEqual({ ok: false, reason: "invalid" });
    expect(startExpedition(g, planet.id, "x" as never, "short")).toEqual({ ok: false, reason: "invalid" });
    expect(previewExpedition(g, planet.id, [crew[0]], "short")).toEqual({ seconds: 300, risk: expeditionRisk(g, planet, [findCrew(g, crew[0]) as never], "short") });
    expect(previewExpedition(g, planet.id, [999], "short")).toBeNull();
    g.state.features.expeditions = undefined;
    expect(startExpedition(g, planet.id, [crew[0]], "short")).toEqual({ ok: false, reason: "locked" });
  });

  it("lasts 5 / 20 / 60 minutes, scaled by expeditionSpeed, and the crew is away meanwhile", () => {
    const { g, planet, crew } = setup();
    assignCrew(g, crew[0], "mining");
    tick(g, 0.1);
    expect(g.deckMult.mining).toBeGreaterThan(1);

    expect(startExpedition(g, planet.id, [crew[0]], "short")).toEqual({ ok: true });
    expect(startExpedition(g, planet.id, [crew[1]], "medium")).toEqual({ ok: true });
    setMod(g, "expeditionSpeed", 2);
    expect(startExpedition(g, planet.id, [crew[2]], "long")).toEqual({ ok: true });
    const [a, b, c] = g.state.expeditions;
    expect(a.end - a.start).toBe(300);
    expect(b.end - b.start).toBe(1200);
    expect(c.end - c.start).toBe(1800);
    expect([a, b, c].map(expeditionKind)).toEqual(["short", "medium", "long"]);
    expect(getStat(g, "expeditions")).toBe(3);

    // away crew cannot be sent again, reassigned or dismissed, and do not manage
    expect(startExpedition(g, planet.id, [crew[0]], "short")).toEqual({ ok: false, reason: "busy" });
    expect(assignCrew(g, crew[0], "lift")).toEqual({ ok: false, reason: "busy" });
    expect(findCrew(g, crew[0])?.away).toBe(true);
    expect(g.deckMult.mining).toBe(1);
    expect(claimExpedition(g, a.uid)).toEqual({ ok: false, reason: "busy" });

    a.risk = 0;
    run(g, 301);
    expect(a.done).toBe(true);
    expect(b.done).toBe(false);
    expect(g.outbox.some((e) => e.t === "expeditionDone" && e.uid === a.uid)).toBe(true);
    expect(findCrew(g, crew[0])?.away).toBe(false);
    expect(g.deckMult.mining).toBeGreaterThan(1); // back at the post
  });

  it("pays out seeded loot on claim: scaled items, credits and finds", () => {
    const { g, planet, crew } = setup();
    startExpedition(g, planet.id, crew, "long");
    const exp = g.state.expeditions[0];
    exp.risk = 0;
    const preview = expeditionOutcome(g, exp);
    expect(expeditionOutcome(g, exp)).toEqual(preview);
    expect(preview.lost).toBe(false);
    expect(preview.injured).toBe(0);
    expect(preview.items.map((i) => i.item)).toEqual(planet.special ? [...planet.resources, planet.special] : planet.resources);
    let units = 0;
    for (const it of preview.items) if (it.item !== planet.special) units += it.n;
    expect(units).toBeGreaterThanOrEqual(25 * 0.7);
    expect(units).toBeLessThanOrEqual(25 * 1.3);

    run(g, 3601);
    const credits = B.toNumber(g.state.credits);
    const level = findCrew(g, crew[0])?.level ?? 0;
    expect(claimExpedition(g, exp.uid)).toEqual({ ok: true });
    expect(g.state.expeditions.length).toBe(0);
    expect(lastExpeditionOutcome(g)).toEqual(preview);
    for (const it of preview.items) expect(B.toNumber(getItem(g, it.item))).toBeGreaterThanOrEqual(it.n * 100 - 1e-6);
    expect(B.toNumber(g.state.credits) - credits).toBeCloseTo(preview.creditSecs * 100, 3);
    expect(preview.creditSecs).toBeGreaterThanOrEqual(240);
    expect(findCrew(g, crew[0])?.level).toBeGreaterThan(level);
    expect(claimExpedition(g, exp.uid)).toEqual({ ok: false, reason: "noTarget" });
    expect(g.state.crew.length).toBe(3);
  });

  it("hands out blueprints, cards, logs and artifacts at the listed odds", () => {
    const { g, planet, crew } = setup(3);
    const tally = { blueprint: 0, card: 0, log: 0, artifact: 0 };
    const n = 600;
    for (let i = 0; i < n; i++) {
      for (const uid of crew) (findCrew(g, uid) as { away: boolean }).away = false;
      startExpedition(g, planet.id, crew, "long");
      const exp = g.state.expeditions[g.state.expeditions.length - 1];
      exp.risk = 0;
      exp.done = true;
      const out = expeditionOutcome(g, exp);
      if (out.blueprint) tally.blueprint++;
      if (out.card) tally.card++;
      if (out.log) tally.log++;
      if (out.artifact) tally.artifact++;
      expect(claimExpedition(g, exp.uid)).toEqual({ ok: true });
    }
    expect(tally.blueprint / n).toBeCloseTo(0.4, 1);
    expect(tally.card / n).toBeCloseTo(0.4, 1);
    expect(tally.log / n).toBeCloseTo(0.3, 1);
    expect(tally.artifact / n).toBeCloseTo(0.2, 1);
    expect(getStat(g, "cards")).toBe(tally.card);
    expect(g.state.recipes.r_bp1).toBe(1);
    expect(g.state.recipes.r_bp2).toBe(1);
    expect(g.state.story.logs).toEqual(["log_1", "log_2"]);
    expect(B.toNumber(getItem(g, "art_idol")) + B.toNumber(getItem(g, "art_coin"))).toBeCloseTo(tally.artifact, 6);
    // both artifacts turn up before either repeats
    expect(g.state.codex["artifact:art_idol"]).toBeDefined();
    expect(g.state.codex["artifact:art_coin"]).toBeDefined();
  });

  it("a lost expedition costs morale and maybe a stay in sickbay, never a crew member", () => {
    let injuries = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { g, planet, crew } = setup(seed);
      g.state.morale = 60;
      startExpedition(g, planet.id, crew, "short");
      const exp = g.state.expeditions[0];
      exp.risk = 1;
      run(g, 301);
      const out = expeditionOutcome(g, exp);
      expect(out.lost).toBe(true);
      expect(out.items).toEqual([]);
      expect(getStat(g, "expeditionsLost")).toBe(1);
      expect(g.state.morale).toBeLessThan(60);
      expect(g.state.crew.length).toBe(3);
      const away = g.state.crew.filter((c) => c.away);
      expect(away.length).toBe(out.injured ? 1 : 0);
      if (out.injured) {
        injuries++;
        expect(isInjured(g, out.injured)).toBe(true);
        expect(assignCrew(g, out.injured, "mining")).toEqual({ ok: false, reason: "busy" });
        run(g, 901);
        expect(isInjured(g, out.injured)).toBe(false);
        expect(findCrew(g, out.injured)?.away).toBe(false);
        expect(assignCrew(g, out.injured, "mining")).toEqual({ ok: true });
      }
      expect(claimExpedition(g, exp.uid)).toEqual({ ok: true });
      expect(g.state.crew.length).toBe(3);
    }
    expect(injuries).toBeGreaterThan(12);
    expect(injuries).toBeLessThan(36);
  });

  it("risk grows with hazards and weather, shrinks with experience and company", () => {
    const { g, planet, crew } = setup();
    const one = [findCrew(g, crew[0])].filter((c) => c !== null);
    const all = crew.map((u) => findCrew(g, u)).filter((c) => c !== null);
    const calm: PlanetInfo = { ...planet, hazards: [], weather: "calm" };
    const rough: PlanetInfo = { ...planet, hazards: ["heat", "toxic"], weather: "extreme" };
    expect(expeditionRisk(g, calm, one, "short")).toBeCloseTo(0.08, 9);
    expect(expeditionRisk(g, calm, one, "long")).toBeCloseTo(0.28, 9);
    expect(expeditionRisk(g, rough, one, "short")).toBeCloseTo(0.34, 9);
    expect(expeditionRisk(g, rough, all, "short")).toBeCloseTo(0.28, 9);
    one[0].level = 11;
    expect(expeditionRisk(g, rough, one, "short")).toBeCloseTo(0.14, 9);
    one[0].level = 20;
    expect(expeditionRisk(g, calm, one, "short")).toBe(0.02);
  });
});

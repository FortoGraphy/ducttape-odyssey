import { describe, expect, it } from "vitest";
import * as B from "../../src/engine/big";
import { addItem, getItem, getStat } from "../../src/engine/kernel";
import {
  baseJumpCost,
  chargeJump,
  chargeSeconds,
  currentSystem,
  fuelInCargo,
  isCharging,
  isLinked,
  jumpCost,
  jumpTo,
  reachable,
  refuel,
  routeToCore,
  startFailure,
  systemAt,
} from "../../src/engine/world";
import { findSystem, makeGame, readyToJump, run, teleport } from "./fixture";

describe("current system", () => {
  it("is registered on the api and follows the ship", () => {
    const { g } = makeGame();
    const a = g.api.currentSystem();
    expect(a.id).toBe("0:0:0");
    expect(g.api.currentSystem()).toBe(a);
    teleport(g, 3, 1);
    expect(g.api.currentSystem().id).toBe("0:3:1");
    expect(g.api.hazardFactor()).toBeGreaterThanOrEqual(1);
  });

  it("starts a new game with a full tank", () => {
    const { g } = makeGame();
    expect(g.state.nav.fuel).toBe(30);
  });
});

describe("charge and jump", () => {
  it("needs the feature, a charge, a link, fuel and no cooldown", () => {
    const { g } = makeGame({ features: false });
    const target = currentSystem(g).links[0];
    expect(chargeJump(g)).toEqual({ ok: false, reason: "locked" });
    expect(jumpTo(g, 1, target)).toEqual({ ok: false, reason: "locked" });
    g.state.features.nav = 1;

    expect(jumpTo(g, 1, target)).toEqual({ ok: false, reason: "requirement" });
    expect(chargeJump(g)).toEqual({ ok: true });
    expect(isCharging(g)).toBe(true);
    expect(chargeSeconds(g)).toBe(45);
    run(g, 44);
    expect(g.state.nav.charge).toBeLessThan(1);
    expect(jumpTo(g, 1, target)).toEqual({ ok: false, reason: "requirement" });
    run(g, 1.5);
    expect(g.state.nav.charge).toBe(1);
    expect(isCharging(g)).toBe(false);
    expect(chargeJump(g)).toEqual({ ok: false, reason: "max" });

    expect(jumpTo(g, 2, 0)).toEqual({ ok: false, reason: "noTarget" });
    expect(jumpTo(g, 1, 99)).toEqual({ ok: false, reason: "invalid" });
    expect(jumpTo(g, 1.5, 0)).toEqual({ ok: false, reason: "invalid" });
    expect(jumpTo(g, NaN, NaN)).toEqual({ ok: false, reason: "invalid" });
    expect(jumpTo(g, 0, 0)).toEqual({ ok: false, reason: "noTarget" });

    g.state.nav.fuel = 5;
    expect(jumpTo(g, 1, target)).toEqual({ ok: false, reason: "fuel" });
    g.state.nav.fuel = 30;
    expect(jumpTo(g, 1, target)).toEqual({ ok: true });
    expect(g.state.nav.fuel).toBe(24);
    expect(g.state.nav.charge).toBe(0);
    expect(g.state.nav.jump).not.toBeNull();
    expect(jumpTo(g, 1, target)).toEqual({ ok: false, reason: "busy" });
    expect(chargeJump(g)).toEqual({ ok: false, reason: "busy" });
  });

  it("arrives, records the visit and starts the cooldown", () => {
    const { g, calls } = makeGame();
    const target = currentSystem(g).links[0];
    readyToJump(g);
    expect(jumpTo(g, 1, target).ok).toBe(true);
    expect(g.outbox.some((e) => e.t === "jumpStart")).toBe(true);
    run(g, 7);
    const nav = g.state.nav;
    expect(nav.jump).toBeNull();
    expect(nav.depth).toBe(1);
    expect(nav.lane).toBe(target);
    expect(nav.maxDepth).toBe(1);
    expect(nav.visited[`0:1:${target}`]).toBe(1);
    expect(getStat(g, "jumps")).toBe(1);
    expect(getStat(g, "depthMax")).toBe(1);
    expect(getStat(g, "systemsVisited")).toBe(1);
    expect(calls.discover).toContain(`system:0:1:${target}`);
    expect(calls.say.map((c) => c.trigger)).toEqual(expect.arrayContaining(["jump", "arrival"]));
    expect(g.outbox.some((e) => e.t === "jumpEnd" && e.system === `0:1:${target}`)).toBe(true);

    // cooldown blocks both charging and jumping
    expect(chargeJump(g)).toEqual({ ok: false, reason: "cooldown" });
    nav.charge = 1;
    expect(jumpTo(g, 0, 0)).toEqual({ ok: false, reason: "cooldown" });
    run(g, 61);
    expect(jumpTo(g, 0, 0)).toEqual({ ok: true });
  });

  it("charges half the fuel for a visited system and scales with fuelUse", () => {
    const { g } = makeGame();
    const target = currentSystem(g).links[0];
    expect(jumpCost(g, 1, target)).toBe(6);
    readyToJump(g);
    jumpTo(g, 1, target);
    run(g, 7);
    expect(g.state.nav.fuel).toBe(24);
    // going back to the start, then forward again to the same system: both are visited
    expect(isLinked(g, 0, 0)).toBe(true);
    expect(jumpCost(g, 0, 0)).toBe(3);
    readyToJump(g);
    expect(jumpTo(g, 0, 0).ok).toBe(true);
    run(g, 7);
    expect(g.state.nav.fuel).toBe(21);
    expect(getStat(g, "systemsVisited")).toBe(1);
    readyToJump(g);
    expect(jumpTo(g, 1, target).ok).toBe(true);
    expect(g.state.nav.fuel).toBe(18);
    run(g, 7);

    g.state.buffs.push({ effect: { stat: "fuelUse", mul: 0.5 }, until: 1e9, src: "t" });
    g.dirty = true;
    run(g, 0.1);
    expect(baseJumpCost(g)).toBe(3);
    const next = currentSystem(g).links[0];
    expect(jumpCost(g, 2, next)).toBe(3);
  });

  it("only allows linked lanes, forward and back", () => {
    const { g } = makeGame({ seed: 21 });
    const sys = findSystem(g, (s) => s.depth >= 3 && s.links.length < 3 && s.depth < 30);
    teleport(g, sys.depth, sys.lane);
    for (let lane = 0; lane < 5; lane++) {
      expect(isLinked(g, sys.depth + 1, lane)).toBe(sys.links.includes(lane));
      const back = systemAt(g, sys.depth - 1, lane);
      const real = back.lane === lane && back.links.includes(sys.lane);
      expect(isLinked(g, sys.depth - 1, lane)).toBe(real);
    }
    expect(isLinked(g, sys.depth, sys.lane)).toBe(false);
    expect(isLinked(g, sys.depth + 2, 0)).toBe(false);
    const list = reachable(g);
    expect(list.filter((t) => !t.back).map((t) => t.lane)).toEqual(sys.links);
    expect(list.filter((t) => t.back).length).toBeGreaterThanOrEqual(1);
    for (const t of list) {
      readyToJump(g);
      g.state.nav.fuel = 30;
      teleport(g, sys.depth, sys.lane);
      expect(jumpTo(g, t.depth, t.lane)).toEqual({ ok: true });
      g.state.nav.jump = null;
    }
  });

  it("a failure that blocks jumps stops charging and jumping", () => {
    const { g } = makeGame();
    chargeJump(g);
    expect(startFailure(g, "engine")).toBe(true);
    expect(isCharging(g)).toBe(false);
    expect(chargeJump(g)).toEqual({ ok: false, reason: "failure" });
    g.state.nav.charge = 1;
    expect(jumpTo(g, 1, currentSystem(g).links[0])).toEqual({ ok: false, reason: "failure" });
  });

  it("recalls probes and undocks when leaving", () => {
    const { g } = makeGame();
    const sys = currentSystem(g);
    g.state.planets[sys.planets[0].id] = { scan: 1, probes: 2, outpost: 0 };
    g.state.station.docked = true;
    g.state.station.trades.scrap = 0.5;
    readyToJump(g);
    jumpTo(g, 1, sys.links[0]);
    expect(g.state.planets[sys.planets[0].id].probes).toBe(0);
    expect(g.state.station.docked).toBe(false);
    expect(g.state.station.trades).toEqual({});
  });
});

describe("fuel", () => {
  it("refuels from fuel and fuel cells without wasting units", () => {
    const { g } = makeGame();
    g.state.nav.fuel = 0;
    expect(refuel(g)).toEqual({ ok: false, reason: "items" });
    addItem(g, "fuel", 7);
    addItem(g, "fuel_cell", 5);
    expect(fuelInCargo(g)).toBe(57);
    expect(refuel(g)).toEqual({ ok: true });
    // 7 loose units first, then two cells (a third would not fit)
    expect(g.state.nav.fuel).toBe(27);
    expect(getItem(g, "fuel").m).toBe(0);
    expect(B.toNumber(getItem(g, "fuel_cell"))).toBe(3);
    // only cells left and a gap of 3: top off with one
    expect(refuel(g)).toEqual({ ok: true });
    expect(g.state.nav.fuel).toBe(30);
    expect(B.toNumber(getItem(g, "fuel_cell"))).toBe(2);
    expect(refuel(g)).toEqual({ ok: false, reason: "max" });
  });

  it("strands the ship only when there is no fuel, no fuel item, no station and no way to make more", () => {
    const { g, calls } = makeGame({ seed: 5 });
    const sys = findSystem(g, (s) => s.station === null && s.depth >= 2 && !s.resources.some((r) => r.item === "hydrogen"));
    teleport(g, sys.depth, sys.lane);
    g.state.nav.fuel = 2;
    addItem(g, "fuel_cell", 1);
    run(g, 40);
    expect(g.state.failure).toBeNull();
    g.state.inv = {};
    run(g, 5);
    expect(g.state.failure).toBeNull(); // grace period
    expect(calls.say.some((c) => c.trigger === "lowFuel")).toBe(true);
    run(g, 25);
    expect(g.state.failure?.kind).toBe("noFuel");
    expect(getStat(g, "failure_noFuel")).toBe(1);
  });

  it("does not strand a ship that can refine fuel here or sits at a station", () => {
    const a = makeGame({ seed: 5 });
    const hydro = findSystem(a.g, (s) => s.station === null && s.resources.some((r) => r.item === "hydrogen"));
    teleport(a.g, hydro.depth, hydro.lane);
    a.g.state.nav.fuel = 0;
    run(a.g, 60);
    expect(a.g.state.failure).toBeNull();
    // the same spot without the recipe is a dead end
    delete a.g.state.recipes.r_fuel;
    run(a.g, 30);
    expect(a.g.state.failure?.kind).toBe("noFuel");

    const b = makeGame({ seed: 5 });
    const port = findSystem(b.g, (s) => s.station !== null);
    teleport(b.g, port.depth, port.lane);
    b.g.state.nav.fuel = 0;
    delete b.g.state.recipes.r_fuel;
    run(b.g, 60);
    expect(b.g.state.failure).toBeNull();
  });

  it("waiting out noFuel leaves enough fuel for one jump", () => {
    const { g } = makeGame({ seed: 5 });
    const sys = findSystem(g, (s) => s.station === null && s.depth >= 2 && !s.resources.some((r) => r.item === "hydrogen"));
    teleport(g, sys.depth, sys.lane);
    g.state.nav.fuel = 0;
    run(g, 30);
    expect(g.state.failure?.kind).toBe("noFuel");
    run(g, 301);
    expect(g.state.failure).toBeNull();
    expect(g.state.nav.fuel).toBe(6);
    readyToJump(g);
    expect(jumpTo(g, sys.depth + 1, sys.links[0])).toEqual({ ok: true });
  });
});

describe("route suggestion", () => {
  it("follows links to the core and prefers stations", () => {
    const { g } = makeGame({ seed: 9 });
    const route = routeToCore(g, 64);
    expect(route.length).toBe(40);
    let depth = 0;
    let lane = 0;
    for (const step of route) {
      expect(step.depth).toBe(depth + 1);
      expect(systemAt(g, depth, lane).links).toContain(step.lane);
      expect(systemAt(g, step.depth, step.lane).station !== null).toBe(step.station);
      depth = step.depth;
      lane = step.lane;
    }
    expect(systemAt(g, depth, lane).isCore).toBe(true);
    // never worse than blindly taking the first link every time
    let naive = 0;
    let nl = 0;
    for (let d = 0; d < 40; d++) {
      nl = systemAt(g, d, nl).links[0];
      if (systemAt(g, d + 1, nl).station) naive++;
    }
    expect(route.filter((s) => s.station).length).toBeGreaterThanOrEqual(Math.max(3, naive));
    expect(routeToCore(g, 3).length).toBe(3);
    teleport(g, 40, 0);
    expect(routeToCore(g)).toEqual([]);
  });
});

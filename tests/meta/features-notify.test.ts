import { describe, expect, it } from "vitest";
import * as B from "@/engine/big";
import { setFlag, unlockFeature } from "@/engine/kernel";
import { Rng } from "@/engine/prng";
import {
  DAY_MS,
  FEATURE_RULES,
  NOTIFY_MAX,
  NOTIFY_MIN_GAP,
  NOTIFY_MIN_LEAD,
  cargoFullEta,
  checkFeatures,
  contentGrants,
  planNotifications,
  repairEta,
} from "@/engine/meta";
import type { PlannedNotification } from "@/engine/meta";
import type { FeatureId, Game } from "@/engine/types";
import { content, drain, makeContent, makeGame, run } from "./fixture";

const has = (g: Game, id: FeatureId): boolean => g.state.features[id] === 1;

describe("feature rules", () => {
  it("a new game starts with nothing unlocked by the table", () => {
    const { g } = makeGame();
    run(g, 5);
    expect(g.state.features).toEqual({});
  });

  it("unlocks structural features from plain progression", () => {
    const { g, world } = makeGame();
    const s = g.state;
    const step = (id: FeatureId, change: () => void): void => {
      run(g, 1.1);
      expect(has(g, id)).toBe(false);
      change();
      run(g, 1.1);
      expect(has(g, id)).toBe(true);
    };
    step("crafting", () => (s.decks.refinery.level = 1));
    step("grid", () => (s.decks.fabricator.level = 1));
    step("drones", () => (s.decks.hangar.level = 1));
    step("research", () => (s.decks.lab.level = 1));
    step("crew", () => (s.decks.quarters.level = 1));
    step("buyMax", () => (s.stats.purchases = 50));
    step("overdrive", () => (s.stats.salvage = 10));
    step("cards", () => (s.cards.card_x = { n: 1, lvl: 1 }));
    step("warp", () => (world.isCore = true));
    step("hull", () => setFlag(g, "shipyard_built"));

    expect(has(g, "scan")).toBe(false);
    expect(has(g, "codex")).toBe(false);
    // a full tank at the start is not progress; fuel the player refined is
    s.nav.fuel = 30;
    step("nav", () => (s.inv.fuel = B.big(1)));
    // scan and codex come with navigation, in the same pass
    expect(has(g, "scan")).toBe(true);
    expect(has(g, "codex")).toBe(true);
    // the current system is only asked for again after the ship has moved
    step("station", () => {
      s.nav.depth = 3;
      world.station = true;
    });

    expect(has(g, "quests")).toBe(false);
    s.played = 20 * 60 - 2;
    run(g, 3);
    expect(has(g, "quests")).toBe(true);
    expect(s.quests.daily).toHaveLength(3); // issued in the same second the feature appeared
    expect(has(g, "weekly")).toBe(false);
    s.stats.questsDaily = 3;
    run(g, 1.1);
    expect(has(g, "weekly")).toBe(true);
    expect(drain(g).filter((e) => e.t === "feature").length).toBeGreaterThanOrEqual(15);
  });

  it("has alternative routes so no state is a dead end", () => {
    const { g } = makeGame();
    const s = g.state;
    s.modules.push({ uid: 1, item: "mod_laser_mk1", q: 1, hp: 100, lvl: 0, slot: -1 });
    s.stats.planetsScanned = 1;
    s.stats.codex = 1;
    s.crew.push({ uid: 2, seed: 1, name: "Ada", traits: [], level: 1, xp: 0, deck: null, away: false });
    s.inv.fuel_cell = B.big(1);
    s.rp = B.big(5);
    s.prestige.warps = 1;
    s.prestige.rebuilds = 1;
    s.prestige.reboots = 1;
    s.station.docked = true;
    run(g, 1.1);
    for (const id of ["grid", "crew", "nav", "scan", "codex", "research", "warp", "hull", "cosmos", "station"] as FeatureId[]) expect(has(g, id)).toBe(true);
  });

  it("leaves the pacing to the story for features a chapter hands out", () => {
    const paced = makeContent();
    // like the shipped story: navigation, the codex and the weekly arrive with chapters
    paced.chapters = paced.chapters.map((c) => (c.id === 4 ? { ...c, unlocks: ["nav", "scan", "codex", "weekly"] } : { ...c, unlocks: undefined }));
    const { g } = makeGame({ content: paced });
    const s = g.state;
    s.stats.storyStep = 2;
    s.played = 3 * 3600;
    s.stats.questsDaily = 9;
    run(g, 3.1);
    expect(s.story.chapter).toBe(3);
    expect(has(g, "quests")).toBe(true);
    for (const id of ["nav", "scan", "codex", "weekly"] as FeatureId[]) expect(has(g, id)).toBe(false);
    // hard evidence still wins: the ship has jumped and catalogued something
    s.nav.depth = 2;
    g.api.discover("system:0:2:0");
    run(g, 1.1);
    expect(has(g, "nav")).toBe(true);
    expect(has(g, "codex")).toBe(true);
    expect(has(g, "scan")).toBe(false);
    expect(has(g, "weekly")).toBe(false);
    s.stats.storyStep = 3;
    run(g, 1.1);
    expect(has(g, "scan")).toBe(true);
    expect(has(g, "weekly")).toBe(true);
  });

  it("only uses fallback rules for features the content never hands out", () => {
    const { g } = makeGame();
    const granted = contentGrants(content);
    expect(granted).toEqual({ autoQueue: 1, repairBots: 1, nav: 1, expeditions: 1 });
    const s = g.state;
    s.stats.crafts = 5000;
    s.stats.repairsManual = 5000;
    s.stats.repairsBot = 5000;
    s.stats.planetsScanned = 10;
    s.stats.expeditions = 10;
    s.decks.hangar.level = 1;
    run(g, 2.1);
    // research and an upgrade own these two in the fixture: the table must not hand them out early
    expect(has(g, "autoQueue")).toBe(false);
    expect(has(g, "repairBots")).toBe(false);
    expect(has(g, "expeditions")).toBe(false);
    // nothing in the fixture grants these, so progression does
    expect(has(g, "autoMaintenance")).toBe(true);
    expect(has(g, "probes")).toBe(true);
    expect(has(g, "outposts")).toBe(true);
  });

  it("re-grants the unlocks of chapters already reached", () => {
    const { g } = makeGame();
    g.state.stats.storyStep = 1;
    run(g, 1.1);
    expect(has(g, "nav")).toBe(true);
    g.state.features = {};
    expect(checkFeatures(g)).toBeGreaterThanOrEqual(1);
    expect(has(g, "nav")).toBe(true);
    expect(has(g, "expeditions")).toBe(false);
  });

  it("covers every structural feature exactly once", () => {
    const ids = FEATURE_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["crafting", "grid", "nav", "drones", "research", "crew", "scan", "codex", "station", "buyMax", "overdrive", "quests", "weekly", "cards", "warp", "hull", "cosmos"]) {
      expect(ids).toContain(id);
    }
  });
});

function checkPlan(plan: PlannedNotification[]): void {
  expect(plan.length).toBeLessThanOrEqual(NOTIFY_MAX);
  for (let i = 0; i < plan.length; i++) {
    const n = plan[i];
    expect(Number.isFinite(n.inSeconds)).toBe(true);
    expect(n.inSeconds).toBeGreaterThanOrEqual(NOTIFY_MIN_LEAD);
    expect(n.title.cs.length).toBeGreaterThan(3);
    expect(n.title.en.length).toBeGreaterThan(3);
    expect(n.body.cs.length).toBeGreaterThan(10);
    expect(n.body.en.length).toBeGreaterThan(10);
    expect(n.body.cs).not.toBe(n.body.en);
    if (i > 0) expect(n.inSeconds - plan[i - 1].inSeconds).toBeGreaterThanOrEqual(NOTIFY_MIN_GAP);
  }
  expect(new Set(plan.map((n) => n.id)).size).toBe(plan.length);
}

function fillingCargo(g: Game): void {
  g.rates.cargoCap = B.big(1000);
  g.rates.cargoUsed = B.big(400);
  g.rates.mine = B.big(1);
  g.rates.lift = B.big(2);
  g.rates.mix = [{ item: "scrap", share: 1 }];
  g.state.keep.scrap = 1;
}

describe("notification plan", () => {
  it("is empty for a healthy idle ship", () => {
    const { g } = makeGame();
    expect(planNotifications(g)).toEqual([]);
  });

  it("estimates when mining fills the hold", () => {
    const { g } = makeGame();
    expect(cargoFullEta(g)).toBe(-1);
    fillingCargo(g);
    expect(cargoFullEta(g)).toBeCloseTo(600, 6); // 600 free units at 1 unit/s
    g.rates.mine = B.big(4); // the lift is the bottleneck now
    expect(cargoFullEta(g)).toBeCloseTo(300, 6);
    // raw scrap is sold above its default 5 % reserve, so the hold will not fill from mining
    delete g.state.keep.scrap;
    expect(cargoFullEta(g)).toBe(-1);
    g.state.keep.scrap = 1;
    g.rates.cargoUsed = B.big(1000);
    expect(cargoFullEta(g)).toBe(0);
    g.rates.cargoCap = B.make(1, 400);
    g.rates.cargoUsed = B.make(1, 399);
    g.rates.mine = B.make(1, 300);
    g.rates.lift = B.make(1, 300);
    expect(Number.isFinite(cargoFullEta(g))).toBe(true);
  });

  it("estimates when the repair bots finish", () => {
    const { g } = makeGame();
    expect(repairEta(g)).toBe(-1);
    g.state.repair.botLevel = 2;
    g.state.modules.push({ uid: 5, item: "mod_laser_mk1", q: 1, hp: 40, lvl: 0, slot: 0 });
    g.state.hull.hp = 70;
    g.state.repair.jobs = [
      { target: 5, glitchUntil: 0 },
      { target: 0, glitchUntil: 0 },
    ];
    // 90 points missing at 1.5 %/min per bot level
    expect(repairEta(g)).toBeCloseTo((90 / 3) * 60, 6);
  });

  it("schedules each kind at its own time when they do not collide", () => {
    const { g } = makeGame({ wallMs: 20_000 * DAY_MS + 20 * 3_600_000 });
    fillingCargo(g); // 600 s
    g.state.expeditions.push({ uid: 1, planet: "p", planetName: "P", crew: [], start: 0, end: g.state.t + 3000, risk: 0, seed: 1, done: false });
    unlockFeature(g, "quests"); // next day in 4 h
    const plan = planNotifications(g);
    checkPlan(plan);
    expect(plan.map((n) => [n.id, n.inSeconds])).toEqual([
      ["cargo", 600],
      ["expedition", 3000],
      ["quests", 4 * 3600],
    ]);
  });

  it("keeps at most four, most urgent first, pushed apart by ten minutes", () => {
    const { g } = makeGame({ wallMs: 20_000 * DAY_MS + 23.9 * 3_600_000 });
    const s = g.state;
    fillingCargo(g); // 600 s
    s.failure = { kind: "engine", since: 0, waitUntil: 0, tow: { eta: s.t + 100, cost: B.big(1) } };
    s.hull.hp = 10;
    s.expeditions.push({ uid: 1, planet: "p", planetName: "P", crew: [], start: 0, end: s.t + 650, risk: 0, seed: 1, done: false });
    s.expeditions.push({ uid: 2, planet: "p", planetName: "P", crew: [], start: 0, end: s.t + 50, risk: 0, seed: 1, done: true });
    s.repair.botLevel = 1;
    s.repair.jobs = [{ target: 0, glitchUntil: 0 }];
    unlockFeature(g, "quests");
    const plan = planNotifications(g);
    checkPlan(plan);
    expect(plan).toHaveLength(NOTIFY_MAX);
    // the tow lands in 100 s but nothing fires sooner than five minutes; the rest queue up behind it
    expect(plan.map((n) => n.id)).toEqual(["rescue", "cargo", "expedition", "repair"]);
    expect(plan[0].inSeconds).toBe(NOTIFY_MIN_LEAD);
    expect(plan[1].inSeconds).toBe(NOTIFY_MIN_LEAD + NOTIFY_MIN_GAP);
    expect(plan[2].inSeconds).toBe(NOTIFY_MIN_LEAD + 2 * NOTIFY_MIN_GAP);
  });

  it("asks for attention when the hull is low or a failure has no rescue on the way", () => {
    const { g } = makeGame();
    g.state.hull.hp = 29;
    let plan = planNotifications(g);
    checkPlan(plan);
    expect(plan.map((n) => n.id)).toEqual(["attention"]);
    g.state.hull.hp = 30;
    expect(planNotifications(g)).toEqual([]);
    g.state.hull.hp = 100;
    g.state.failure = { kind: "blackout", since: 0, waitUntil: 0, tow: null };
    plan = planNotifications(g);
    expect(plan.map((n) => n.id)).toEqual(["attention"]);
    g.state.failure.waitUntil = g.state.t + 5000;
    plan = planNotifications(g);
    expect(plan.map((n) => [n.id, n.inSeconds])).toEqual([["rescue", 5000]]);
  });

  it("is pure: planning changes nothing and repeats exactly", () => {
    const { g } = makeGame({ wallMs: 20_000 * DAY_MS });
    fillingCargo(g);
    g.state.hull.hp = 5;
    unlockFeature(g, "quests");
    const before = JSON.stringify(g.state);
    const a = planNotifications(g);
    const b = planNotifications(g);
    expect(a).toEqual(b);
    expect(JSON.stringify(g.state)).toBe(before);
  });

  it("holds its limits for arbitrary states", () => {
    const rng = new Rng(4242);
    for (let i = 0; i < 400; i++) {
      const { g } = makeGame({ seed: i, wallMs: rng.int(0, 30_000) * DAY_MS + rng.int(0, DAY_MS - 1) });
      const s = g.state;
      s.t = rng.range(0, 1e6);
      if (rng.chance(0.7)) {
        fillingCargo(g);
        g.rates.cargoUsed = B.big(rng.range(0, 1000));
        g.rates.mine = B.big(rng.range(0, 50));
      }
      if (rng.chance(0.5)) s.hull.hp = rng.range(0, 100);
      if (rng.chance(0.5)) {
        s.failure = {
          kind: "tumble",
          since: 0,
          waitUntil: rng.chance(0.3) ? s.t + rng.range(-100, 20_000) : 0,
          tow: rng.chance(0.5) ? { eta: s.t + rng.range(-100, 12_000), cost: B.big(1) } : null,
        };
      }
      const count = rng.int(0, 4);
      for (let k = 0; k < count; k++) {
        s.expeditions.push({ uid: k + 1, planet: "p", planetName: "P", crew: [], start: 0, end: s.t + rng.range(-500, 5000), risk: 0, seed: 1, done: rng.chance(0.2) });
      }
      if (rng.chance(0.5)) {
        s.repair.botLevel = rng.int(0, 5);
        s.repair.jobs = [{ target: 0, glitchUntil: 0 }];
      }
      if (rng.chance(0.6)) unlockFeature(g, "quests");
      checkPlan(planNotifications(g));
    }
  });
});

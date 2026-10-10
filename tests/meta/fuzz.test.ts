import { describe, expect, it } from "vitest";
import * as B from "@/engine/big";
import { applyOffline, setFlag, tick } from "@/engine/kernel";
import { Rng } from "@/engine/prng";
import * as meta from "@/engine/meta";
import type { Game } from "@/engine/types";
import { KIPP_TRIGGERS, content, drain, findBadNumber, makeGame } from "./fixture";
import type { World } from "./fixture";

const CALLS = 20_000;

/** Ids the UI could send: real ones, stale ones, prototype names, and values of the wrong type. */
const JUNK: unknown[] = ["", "nope", "constructor", "__proto__", "toString", "hasOwnProperty", " ", "💥", undefined, null, NaN, 1e309, -1, 0.5, {}, [], true];

const STATS = ["purchases", "deckLevels", "salvage", "pulses", "minigames", "events", "crafts", "jumps", "planetsScanned", "expeditions", "contracts", "storyStep", "repairsManual", "warps"];

function pools(): Record<string, unknown[]> {
  return {
    research: [...Object.keys(content.research), ...JUNK],
    upgrade: [...Object.keys(content.upgrades), ...JUNK],
    mutator: [...Object.keys(content.mutators), "nope", "constructor"],
    hull: [...Object.keys(content.hulls), ...JUNK],
    recipe: [...Object.keys(content.recipes), "nope", "__proto__"],
    cosmetic: [...Object.keys(content.cosmetics), ...JUNK],
    ending: ["answer", "hang_up", "stay_on_hold", ...JUNK],
    log: [...content.logs.map((x) => x.id), undefined, undefined, ...JUNK],
    trigger: [...KIPP_TRIGGERS, ...JUNK],
    name: ["Rock", "  spaced   out ", "Žluťoučký kůň", "x".repeat(500), "<script>", "\u0000‮", ...JUNK],
    index: [0, 1, 2, 3, -1, 1.5, NaN, Infinity, "0", undefined, null],
  };
}

function fuzz(seed: number, calls: number): { g: Game; world: World; ok: number; failed: number } {
  const rng = new Rng(seed);
  const { g, world } = makeGame({ seed, wallMs: 20_000 * meta.DAY_MS });
  const s = g.state;
  const p = pools();
  const any = (key: string): never => rng.pick(p[key]) as never;
  const some = (key: string, max: number): never => {
    if (rng.chance(0.05)) return rng.pick(JUNK) as never;
    const out: unknown[] = [];
    const n = rng.int(0, max);
    for (let i = 0; i < n; i++) out.push(rng.pick(p[key]));
    return out as never;
  };
  const codexKeys: string[] = [];
  let ok = 0;
  let failed = 0;
  const count = (r: { ok: boolean } | unknown): void => {
    if (r && typeof r === "object" && "ok" in r) {
      if ((r as { ok: boolean }).ok) ok++;
      else failed++;
    }
  };

  const actions: (() => unknown)[] = [
    // ----- player actions
    () => meta.buyResearch(g, any("research")),
    () => meta.buyResearch(g, any("research")),
    () => meta.buyUpgrade(g, any("upgrade")),
    () => meta.buyUpgrade(g, any("upgrade")),
    () => meta.warp(g, some("mutator", 3)),
    () => meta.rebuild(g, any("hull"), some("recipe", 4)),
    () => meta.reboot(g),
    () => meta.ackBeat(g),
    () => meta.chooseEnding(g, any("ending")),
    () => meta.claimQuest(g, any("index")),
    () => meta.claimQuest(g, rng.int(0, 2)),
    () => meta.claimWeekly(g),
    () => meta.setWeeklyMutator(g, rng.chance(0.5)),
    () => meta.buyCosmetic(g, any("cosmetic")),
    () => meta.equipCosmetic(g, any("cosmetic")),
    () => meta.renameCodex(g, rng.chance(0.8) && codexKeys.length ? rng.pick(codexKeys) : (rng.pick(JUNK) as never), any("name")),
    // ----- what other areas ask of meta
    () => {
      const key = `${rng.pick(["planet", "fauna", "flora", "system", "artifact", "odd"])}:${rng.int(0, 400)}`;
      if (g.api.discover(key)) codexKeys.push(key);
    },
    () => g.api.discover(rng.pick(JUNK) as never),
    () => g.api.say(any("trigger"), rng.chance(0.5) ? { n: rng.int(0, 9), kind: "breach" } : (rng.pick(JUNK) as never)),
    () => g.api.addLog(any("log")),
    // ----- read-only helpers the UI calls every pulse
    () => {
      meta.objectives(g);
      meta.currentBeat(g);
      meta.backlogTicket(g);
      meta.dailyQuests(g);
      meta.weeklyQuest(g);
      meta.codexSummary(g);
      meta.planNotifications(g);
      meta.stampsOnWarp(g);
      meta.rivetsOnRebuild(g);
      meta.sparksOnReboot(g);
      for (const id of p.research) {
        meta.researchCost(g, id as never);
        meta.canResearch(g, id as never);
      }
      for (const id of p.upgrade) meta.upgradeCost(g, id as never);
    },
    // ----- time
    () => {
      const n = rng.int(1, 40);
      for (let i = 0; i < n; i++) tick(g, 0.1);
    },
    () => {
      s.wall += rng.int(0, 5000);
      for (let i = 0; i < 11; i++) tick(g, 0.1);
    },
    () => {
      s.wall += rng.chance(0.2) ? -rng.int(0, 3 * meta.DAY_MS) : rng.int(0, 2 * meta.DAY_MS);
    },
    () => applyOffline(g, rng.chance(0.1) ? rng.pick([NaN, -5, Infinity, 1e12]) : rng.range(60, 40_000)),
    // ----- the rest of the game moving underneath
    () => {
      const key = rng.pick(STATS);
      s.stats[key] = (s.stats[key] ?? 0) + rng.int(0, 60);
    },
    () => (s.lifetime = B.fromLog10(rng.range(0, rng.chance(0.1) ? 450 : 30))),
    () => (s.rp = B.add(s.rp, B.fromLog10(rng.range(0, 8)))),
    () => meta.grantStamps(g, B.fromLog10(rng.range(0, rng.chance(0.05) ? 200 : 5))),
    () => (g.rates.income = B.fromLog10(rng.range(-2, 40))),
    () => (g.rates.research = B.fromLog10(rng.range(-2, 20))),
    () => (world.isCore = rng.chance(0.5)),
    () => (world.station = rng.chance(0.5)),
    () => setFlag(g, rng.pick(["shipyard_built", "gate_built", "never_set"]), rng.int(0, 1)),
    () => (s.recipes[rng.pick(Object.keys(content.recipes))] = 1),
    () => (s.hull.hp = rng.range(0, 100)),
    () => (s.failure = rng.chance(0.5) ? null : { kind: rng.pick(["breach", "tumble", "engine"] as const), since: s.t, waitUntil: rng.chance(0.5) ? s.t + 500 : 0, tow: null }),
    () => (s.played += rng.int(0, 900)),
    () => (s.decks[rng.pick(["refinery", "fabricator", "hangar", "lab", "quarters"] as const)].level += 1),
    () => (s.nav.depth = rng.int(0, 40)),
    () => (s.nav.fuel = rng.int(0, 30)),
  ];

  for (let i = 0; i < calls; i++) {
    count(rng.pick(actions)());
    if (g.outbox.length > 64) drain(g);
    if (i % 250 === 0) {
      const bad = findBadNumber(s);
      if (bad) throw new Error(`non-finite number at ${bad} after call ${i} (seed ${seed})`);
    }
  }
  return { g, world, ok, failed };
}

describe("meta fuzz", () => {
  it(`survives ${CALLS} random calls without throwing or corrupting the state`, () => {
    const { g, ok, failed } = fuzz(20251010, CALLS);
    const s = g.state;
    expect(findBadNumber(s)).toBeNull();
    // still a plain JSON save
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);

    // the run must have exercised real behaviour, not just rejections
    expect(ok).toBeGreaterThan(500);
    expect(failed).toBeGreaterThan(500);
    expect(s.prestige.warps).toBeGreaterThan(0);
    expect(s.prestige.rebuilds).toBeGreaterThan(0);
    expect(s.story.chapter).toBe(12);
    expect(s.stats.kippLines).toBeGreaterThan(10);

    // invariants
    const p = s.prestige;
    for (const v of [p.stamps, p.stampsTotal, p.rivets, p.sparks, s.rp, s.credits]) expect(v.m).toBeGreaterThanOrEqual(0);
    expect(B.cmp(p.stampsTotal, p.stamps)).toBeGreaterThanOrEqual(0);
    expect(s.story.kippRecent.length).toBeLessThanOrEqual(meta.KIPP_RECENT);
    expect(new Set(s.story.kippRecent).size).toBe(s.story.kippRecent.length);
    expect(s.story.pending.length).toBeLessThanOrEqual(96);
    expect(s.quests.daily.length).toBeLessThanOrEqual(3);
    expect(s.quests.streak).toBeGreaterThanOrEqual(0);
    expect(s.morale).toBeLessThanOrEqual(100);
    expect(p.mutators.length).toBeLessThanOrEqual(2);
    expect(p.hullsOwned).toContain(s.hull.cls);
    expect(s.grid.cells.length).toBe(s.grid.w * s.grid.h);
    expect(s.grid.open).toBeLessThanOrEqual(s.grid.cells.length);
    expect(new Set(s.cosmetics.owned).size).toBe(s.cosmetics.owned.length);
    expect(new Set(p.hullsOwned).size).toBe(p.hullsOwned.length);
    for (const id of Object.keys(s.research)) expect(s.research[id]).toBeLessThanOrEqual(content.research[id].maxLevel);
    for (const id of Object.keys(p.upgrades)) expect(p.upgrades[id]).toBeLessThanOrEqual(content.upgrades[id].maxLevel);
    for (const key of Object.keys(s.codex)) expect([...(s.codex[key].name ?? "")].length).toBeLessThanOrEqual(meta.CODEX_NAME_MAX);
    for (const k of Object.keys(g.mods) as (keyof typeof g.mods)[]) expect(Number.isFinite(g.mods[k])).toBe(true);
  });

  it("holds across several other seeds", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { g } = fuzz(seed, 4000);
      expect(findBadNumber(g.state)).toBeNull();
      expect(JSON.parse(JSON.stringify(g.state))).toEqual(g.state);
    }
  });
});

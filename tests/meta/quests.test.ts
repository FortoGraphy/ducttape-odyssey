import { describe, expect, it } from "vitest";
import * as B from "@/engine/big";
import { rebuildMods, unlockFeature } from "@/engine/kernel";
import {
  DAY_MS,
  claimQuest,
  claimWeekly,
  dailyQuests,
  dayIndex,
  msToNextDaily,
  pickDaily,
  pickWeekly,
  questTarget,
  setWeeklyMutator,
  streakBonus,
  weekIndex,
  weeklyQuest,
} from "@/engine/meta";
import type { Game } from "@/engine/types";
import { content, drain, findBadNumber, makeGame, run } from "./fixture";

const DAY0 = 20_000; // some day in 2024

function atDay(g: Game, day: number, hour = 9): void {
  g.state.wall = day * DAY_MS + hour * 3_600_000;
  run(g, 1.1);
}

function withQuests(seed = 7, weekly = false): Game {
  const { g } = makeGame({ seed, wallMs: DAY0 * DAY_MS });
  unlockFeature(g, "quests");
  if (weekly) unlockFeature(g, "weekly");
  atDay(g, DAY0);
  drain(g);
  return g;
}

/** Bumps the stats so every daily is complete, then claims them all. */
function clearDay(g: Game): void {
  for (const q of dailyQuests(g)) if (q.template) g.state.stats[q.template.stat] = (g.state.stats[q.template.stat] ?? 0) + q.target;
  for (let i = 0; i < g.state.quests.daily.length; i++) expect(claimQuest(g, i)).toEqual({ ok: true });
}

describe("daily quests", () => {
  it("issues nothing until the feature is unlocked, then three distinct doable dailies", () => {
    const { g } = makeGame({ wallMs: DAY0 * DAY_MS });
    run(g, 5);
    expect(g.state.quests.daily).toEqual([]);
    unlockFeature(g, "quests");
    run(g, 1.1);
    const q = g.state.quests;
    expect(q.day).toBe(DAY0);
    expect(q.daily).toHaveLength(3);
    expect(new Set(q.daily.map((x) => x.id)).size).toBe(3);
    for (const x of q.daily) {
      expect(x.id.startsWith("q_")).toBe(true);
      expect(x.id).not.toBe("q_craft"); // crafting is not unlocked in this game
      expect(x.claimed).toBe(false);
      expect(x.target).toBeGreaterThanOrEqual(1);
    }
    expect(q.weekly).toBeNull();
  });

  it("is deterministic for a day and a universe seed", () => {
    const ids = (g: Game): string => g.state.quests.daily.map((q) => `${q.id}:${q.target}`).join(",");
    expect(ids(withQuests(7))).toBe(ids(withQuests(7)));
    expect(pickDaily(content, 7, DAY0).map((t) => t.id)).toEqual(pickDaily(content, 7, DAY0).map((t) => t.id));

    const byDay = new Set<string>();
    const bySeed = new Set<string>();
    for (let i = 0; i < 12; i++) {
      byDay.add(
        pickDaily(content, 7, DAY0 + i)
          .map((t) => t.id)
          .join(","),
      );
      bySeed.add(
        pickDaily(content, 100 + i, DAY0)
          .map((t) => t.id)
          .join(","),
      );
    }
    expect(byDay.size).toBeGreaterThan(3);
    expect(bySeed.size).toBeGreaterThan(3);
    for (let i = 0; i < 50; i++) {
      const picked = pickDaily(content, i, DAY0 + i);
      expect(picked).toHaveLength(3);
      expect(picked.some((t) => t.weekly)).toBe(false);
    }
  });

  it("scales income quests with the economy and leaves flat ones alone", () => {
    const { g } = makeGame();
    const levels = content.quests.find((t) => t.id === "q_levels")!;
    const buy = content.quests.find((t) => t.id === "q_buy")!;
    expect(questTarget(g, levels)).toBe(50);
    g.state.allTime = B.big(1e10);
    expect(questTarget(g, levels)).toBe(Math.round(50 * (1 + 10 * 0.15)));
    expect(questTarget(g, buy)).toBe(20);
  });

  it("measures progress as the stat delta since the quest was issued", () => {
    const { g } = makeGame({ wallMs: DAY0 * DAY_MS });
    g.state.stats.purchases = 500;
    g.state.stats.salvage = 40;
    g.state.stats.events = 9;
    g.state.stats.minigames = 9;
    g.state.stats.deckLevels = 900;
    g.state.stats.pulses = 77;
    unlockFeature(g, "quests");
    atDay(g, DAY0);
    const views = dailyQuests(g);
    for (const v of views) {
      expect(v.progress).toBe(0);
      expect(v.done).toBe(false);
    }
    const first = views[0];
    const stat = first.template!.stat;
    g.state.stats[stat] += first.target - 1;
    expect(dailyQuests(g)[0]).toMatchObject({ progress: first.target - 1, done: false });
    g.state.stats[stat] += 500;
    expect(dailyQuests(g)[0]).toMatchObject({ progress: first.target, done: true });
  });

  it("pays credits and research points on claim, once", () => {
    const g = withQuests();
    g.rates.income = B.big(10);
    g.rates.research = B.big(2);
    expect(claimQuest(g, 0)).toEqual({ ok: false, reason: "requirement" });
    for (const bad of [-1, 3, 1.5, NaN, Infinity]) expect(claimQuest(g, bad)).toEqual({ ok: false, reason: "noTarget" });

    const q = dailyQuests(g)[0];
    g.state.stats[q.template!.stat] = (g.state.stats[q.template!.stat] ?? 0) + q.target;
    const credits = B.toNumber(g.state.credits);
    const lifetime = B.toNumber(g.state.lifetime);
    expect(claimQuest(g, 0)).toEqual({ ok: true });
    expect(B.toNumber(g.state.credits)).toBeCloseTo(credits + 300 * 10, 6);
    expect(B.toNumber(g.state.lifetime)).toBeCloseTo(lifetime + 300 * 10, 6);
    expect(B.toNumber(g.state.rp)).toBeCloseTo(120 * 2, 6);
    expect(g.state.stats.questsDaily).toBe(1);
    expect(drain(g).filter((e) => e.t === "questDone")).toEqual([{ t: "questDone", id: q.id }]);
    expect(claimQuest(g, 0)).toEqual({ ok: false, reason: "max" });
    expect(g.state.quests.streak).toBe(0); // two are still open
  });
});

describe("streak", () => {
  it("grows on consecutive cleared days and only resets the counter after a missed day", () => {
    const g = withQuests();
    const q = g.state.quests;
    clearDay(g);
    expect([q.streak, q.lastClaimDay]).toEqual([1, DAY0]);

    atDay(g, DAY0 + 1);
    expect(q.daily.every((x) => !x.claimed)).toBe(true);
    expect(q.streak).toBe(1); // yesterday was cleared: the streak is still alive
    clearDay(g);
    expect(q.streak).toBe(2);
    expect(streakBonus(g)).toBeCloseTo(1.2, 9);

    atDay(g, DAY0 + 2);
    clearDay(g);
    expect(q.streak).toBe(3);
    expect(g.state.stats.streakMax).toBe(3);

    // day +3 is skipped entirely
    const credits = B.toNumber(g.state.credits);
    const stats = g.state.stats.questsDaily;
    atDay(g, DAY0 + 4);
    expect(q.streak).toBe(0);
    expect(q.daily).toHaveLength(3);
    // nothing else was taken away
    expect(B.toNumber(g.state.credits)).toBe(credits);
    expect(g.state.stats.questsDaily).toBe(stats);
    expect(g.state.stats.streakMax).toBe(3);
    clearDay(g);
    expect(q.streak).toBe(1);
    expect(findBadNumber(g.state)).toBeNull();
  });

  it("a day with only some quests claimed does not count", () => {
    const g = withQuests();
    const q = g.state.quests;
    clearDay(g);
    atDay(g, DAY0 + 1);
    const view = dailyQuests(g)[0];
    g.state.stats[view.template!.stat] = (g.state.stats[view.template!.stat] ?? 0) + view.target;
    expect(claimQuest(g, 0)).toEqual({ ok: true });
    expect(q.streak).toBe(1);
    atDay(g, DAY0 + 2);
    expect(q.streak).toBe(0);
  });

  it("pays finished but unclaimed quests at rollover and counts the day", () => {
    const g = withQuests();
    const q = g.state.quests;
    g.rates.income = B.big(10);
    for (const v of dailyQuests(g)) g.state.stats[v.template!.stat] = (g.state.stats[v.template!.stat] ?? 0) + v.target;
    const credits = B.toNumber(g.state.credits);
    atDay(g, DAY0 + 1);
    expect(B.toNumber(g.state.credits)).toBeCloseTo(credits + 3 * 300 * 10, 6);
    expect(g.state.stats.questsDaily).toBe(3);
    expect([q.streak, q.lastClaimDay]).toEqual([1, DAY0]);
    expect(q.daily.every((x) => !x.claimed)).toBe(true);
  });

  it("ignores a clock that was set backwards", () => {
    const g = withQuests();
    const before = JSON.stringify(g.state.quests);
    atDay(g, DAY0 - 5);
    expect(JSON.stringify(g.state.quests)).toBe(before);
    expect(msToNextDaily(g)).toBe(15 * 3_600_000);
    expect(dayIndex(g.state.wall)).toBe(DAY0 - 5);
  });
});

describe("weekly challenge", () => {
  it("is the same for every universe in a given week and changes between weeks", () => {
    const a = withQuests(7, true);
    const b = withQuests(123456, true);
    expect(a.state.quests.week).toBe(weekIndex(DAY0));
    expect(a.state.quests.weekly?.id).toBe(b.state.quests.weekly?.id);
    expect(weeklyQuest(a)?.offered).toBe(weeklyQuest(b)?.offered);
    expect(a.state.quests.weekly?.id.startsWith("w_")).toBe(true);
    expect(content.mutators[weeklyQuest(a)?.offered ?? ""]).toBeDefined();
    expect(pickWeekly(content, 2857)).toEqual(pickWeekly(content, 2857));

    const seen = new Set<string>();
    for (let w = 2800; w < 2840; w++) {
      const pick = pickWeekly(content, w);
      seen.add(`${pick.template?.id}|${pick.mutator}`);
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
    // Monday starts a week: 1970-01-05 was a Monday
    expect([weekIndex(3), weekIndex(4), weekIndex(10), weekIndex(11)]).toEqual([0, 1, 1, 2]);
  });

  it("offers the week's mutator without forcing it: accepting changes the rules, dropping restores them", () => {
    const g = withQuests(7, true);
    const q = g.state.quests;
    const id = weeklyQuest(g)!.offered!;
    const effect = content.mutators[id].effects[0];
    const stat = effect.stat!;
    // nothing is harder until the player says so
    expect(q.weeklyMutator).toBeNull();
    rebuildMods(g);
    expect(g.mods[stat]).toBe(1);
    expect(weeklyQuest(g)).toMatchObject({ mutator: null, offered: id, done: false });

    expect(setWeeklyMutator(g, true)).toEqual({ ok: true });
    expect(q.weeklyMutator).toBe(id);
    expect(g.dirty).toBe(true);
    rebuildMods(g);
    expect(g.mods[stat]).toBeCloseTo(effect.mul!, 9);
    expect(weeklyQuest(g)).toMatchObject({ mutator: id, offered: id });

    expect(setWeeklyMutator(g, false)).toEqual({ ok: true });
    expect(q.weeklyMutator).toBeNull();
    expect(g.dirty).toBe(true);
    rebuildMods(g);
    expect(g.mods[stat]).toBe(1);

    // progress made without the handicap does not carry into the bonus run
    const weeklyStat = content.quests.find((t) => t.id === q.weekly!.id)!.stat;
    g.state.stats[weeklyStat] = (g.state.stats[weeklyStat] ?? 0) + 60;
    expect(weeklyQuest(g)?.progress).toBe(60);
    expect(setWeeklyMutator(g, true)).toEqual({ ok: true });
    expect(q.weeklyMutator).toBe(id);
    expect(weeklyQuest(g)?.progress).toBe(0);
    rebuildMods(g);
    expect(g.mods[stat]).toBeCloseTo(effect.mul!, 9);
  });

  it("pays more with the mutator on and lifts the handicap on claim", () => {
    const payout = (keepMutator: boolean): { credits: number; reward: number } => {
      const g = withQuests(7, true);
      const q = g.state.quests;
      const reward = content.mutators[weeklyQuest(g)!.offered!].reward;
      if (keepMutator) expect(setWeeklyMutator(g, true)).toEqual({ ok: true });
      g.rates.income = B.big(10);
      const weeklyStat = content.quests.find((t) => t.id === q.weekly!.id)!.stat;
      expect(claimWeekly(g)).toEqual({ ok: false, reason: "requirement" });
      g.state.stats[weeklyStat] = (g.state.stats[weeklyStat] ?? 0) + q.weekly!.target;
      const before = B.toNumber(g.state.credits);
      expect(claimWeekly(g)).toEqual({ ok: true });
      expect(claimWeekly(g)).toEqual({ ok: false, reason: "max" });
      expect(q.weeklyMutator).toBeNull();
      expect(setWeeklyMutator(g, true)).toEqual({ ok: false, reason: "max" });
      expect(g.state.stats.questsWeekly).toBe(1);
      rebuildMods(g);
      expect(g.mods.allProd).toBe(1);
      expect(g.mods.wearRate).toBe(1);
      expect(g.mods.jumpCharge).toBe(1);
      return { credits: B.toNumber(g.state.credits) - before, reward };
    };
    const plain = payout(false);
    const hard = payout(true);
    expect(plain.credits).toBeCloseTo(3600 * 10, 4);
    expect(hard.reward).toBeGreaterThan(1);
    expect(hard.credits).toBeCloseTo(3600 * 10 * hard.reward, 4);
  });

  it("rolls over on Monday and not before, and an accepted mutator ends with its week", () => {
    const g = withQuests(7, true);
    const q = g.state.quests;
    const week = q.week;
    setWeeklyMutator(g, true);
    const monday = week * 7 - 3 + 7; // first day of the next week
    q.weekly!.claimed = true;
    atDay(g, monday - 1);
    expect(q.week).toBe(week);
    atDay(g, monday);
    expect(q.week).toBe(week + 1);
    expect(q.weekly?.claimed).toBe(false);
    expect(q.weeklyMutator).toBeNull();
    expect(weeklyQuest(g)?.offered).toBe(pickWeekly(content, week + 1).mutator);
  });
});

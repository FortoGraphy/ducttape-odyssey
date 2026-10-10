// Achievements: stat thresholds, checked once per second with a cursor per stat so the cost does
// not grow with the number of achievements already earned.
import { emit } from "../kernel";
import type { AchievementDef, AchievementId, Game, SystemDef } from "../types";
import { grantCosmetic, syncCosmetics } from "./cosmetics";
import { grantStamps } from "./prestige";
import { lookup, secondEdge } from "./util";

interface StatGroup {
  stat: string;
  list: AchievementDef[]; // ascending threshold
  next: number; // first entry not known to be earned
}

// runtime only: rebuilt from state in init, so nothing here needs saving
const cursors = new WeakMap<Game, StatGroup[]>();

function buildCursors(g: Game): StatGroup[] {
  const byStat: Record<string, StatGroup> = Object.create(null) as Record<string, StatGroup>;
  const groups: StatGroup[] = [];
  for (const def of g.content.achievements ?? []) {
    let group = byStat[def.stat];
    if (!group) {
      group = byStat[def.stat] = { stat: def.stat, list: [], next: 0 };
      groups.push(group);
    }
    group.list.push(def);
  }
  for (const group of groups) group.list.sort((a, b) => a.threshold - b.threshold);
  cursors.set(g, groups);
  return groups;
}

export function hasAchievement(g: Game, id: AchievementId): boolean {
  return lookup(g.state.achievements, id) !== undefined;
}

/** 0..1 toward the threshold, for progress bars. */
export function achievementProgress(g: Game, def: AchievementDef): number {
  if (hasAchievement(g, def.id)) return 1;
  if (!(def.threshold > 0)) return 0;
  const v = g.state.stats[def.stat] ?? 0;
  return v >= def.threshold ? 1 : Math.max(0, v / def.threshold);
}

function award(g: Game, def: AchievementDef): void {
  const s = g.state;
  // wall can be 0 in headless runs; the record must still read as "earned"
  s.achievements[def.id] = s.wall > 0 ? s.wall : 1;
  s.stats.achievements = (s.stats.achievements ?? 0) + 1;
  if (def.reward?.stamps) grantStamps(g, def.reward.stamps);
  if (def.reward?.cosmetic) grantCosmetic(g, def.reward.cosmetic);
  syncCosmetics(g);
  emit(g, { t: "achievement", id: def.id });
  g.api.say("achievement");
}

/** Awards everything whose threshold is reached. Returns how many fired. */
export function checkAchievements(g: Game): number {
  const groups = cursors.get(g) ?? buildCursors(g);
  const s = g.state;
  // time in the chair is the one counter nobody else can keep
  s.stats.playedHours = Math.floor(s.played / 36) / 100;
  let fired = 0;
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    if (group.next >= group.list.length) continue;
    const value = s.stats[group.stat] ?? 0;
    while (group.next < group.list.length && value >= group.list[group.next].threshold) {
      const def = group.list[group.next++];
      if (!hasAchievement(g, def.id)) {
        award(g, def);
        fired++;
      }
    }
  }
  return fired;
}

export const achievementsSystem: SystemDef = {
  id: "meta.achievements",
  init(g) {
    const s = g.state;
    if (!s.achievements || typeof s.achievements !== "object") s.achievements = {};
    buildCursors(g);
  },
  tick(g, dt) {
    if (secondEdge(g, dt)) checkAchievements(g);
  },
};

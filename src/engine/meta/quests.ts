// Daily and weekly quests. Fully offline: both are a pure function of the calendar index (and, for
// dailies, the universe seed). Progress is a stat delta since the quest was issued.
import * as B from "../big";
import { OK, addCredits, emit, fail, getStat, hasFeature, incomeSeconds, markDirty, stat, statMax } from "../kernel";
import { Rng, hashSeed } from "../prng";
import type { ActionResult, Big, ContentDB, FeatureId, Game, MutatorId, QuestState, QuestTemplateDef, SystemDef } from "../types";
import { addResearchPoints } from "./research";
import { bal, lookup, pushScaled, secondEdge } from "./util";

export const DAY_MS = 86_400_000;
export const DAILY_COUNT = 3;

function dailyCount(content: ContentDB): number {
  const n = (content.balance as Record<string, unknown> | undefined)?.questsPerDay;
  return typeof n === "number" && n >= 1 ? Math.min(6, Math.floor(n)) : DAILY_COUNT;
}

/** Stats that cannot move until a feature exists: such quests are held back so a daily is always doable. */
const STAT_FEATURE: Record<string, FeatureId> = {
  crafts: "crafting",
  craftsT1: "crafting",
  craftsT2: "crafting",
  craftsT3: "crafting",
  craftsT4: "crafting",
  modulesBuilt: "grid",
  modulesInstalled: "grid",
  jumps: "nav",
  systemsVisited: "nav",
  planetsScanned: "scan",
  expeditions: "expeditions",
  outposts: "outposts",
  contracts: "station",
  trades: "station",
  researchLevels: "research",
  coffee: "crew",
  tapeUsed: "crafting",
  overdrives: "overdrive",
  repairsBot: "repairBots",
  codex: "codex",
};

export function dayIndex(wallMs: number): number {
  return Number.isFinite(wallMs) ? Math.floor(wallMs / DAY_MS) : 0;
}

/** Weeks start on Monday (day 0 of the epoch was a Thursday). */
export function weekIndex(day: number): number {
  return Math.floor((day + 3) / 7);
}

// ---------- seeded picks (pure) -------------------------------------------------------

function doable(g: Game | null, t: QuestTemplateDef): boolean {
  if (!g) return true;
  const need = lookup(STAT_FEATURE, t.stat);
  return need === undefined || hasFeature(g, need);
}

/**
 * The day's templates for a universe: a seeded shuffle of the non-weekly templates. With a game,
 * templates whose stat cannot move yet are skipped as long as enough others remain.
 */
export function pickDaily(content: ContentDB, seed: number, day: number, g: Game | null = null): QuestTemplateDef[] {
  const all = (content.quests ?? []).filter((t) => !t.weekly);
  const order = new Rng(hashSeed(seed, day, 0xda117)).shuffle(all.slice());
  const count = dailyCount(content);
  const out: QuestTemplateDef[] = [];
  for (const t of order) if (out.length < count && doable(g, t)) out.push(t);
  for (const t of order) if (out.length < count && out.indexOf(t) < 0) out.push(t);
  return out;
}

/** The week's challenge and the mutator offered with it: the same for every player, a shared notice board that needs no network. */
export function pickWeekly(content: ContentDB, week: number, g: Game | null = null): { template: QuestTemplateDef | null; mutator: MutatorId | null } {
  const rng = new Rng(hashSeed(week, 0x3eeb17));
  const all = content.quests ?? [];
  let pool = all.filter((t) => t.weekly);
  if (pool.length === 0) pool = all.slice();
  pool.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const ids = Object.keys(content.mutators ?? {}).sort();
  // drawn first, so the mutator does not depend on how the template was chosen
  const mutator = ids.length ? ids[Math.min(ids.length - 1, Math.floor(rng.next() * ids.length))] : null;
  // A ship that cannot do the week's goal yet gets the next one in the week's order; everyone who
  // can do it shares the same challenge.
  const order = rng.shuffle(pool);
  let template: QuestTemplateDef | null = order.length ? order[0] : null;
  for (const t of order) {
    if (doable(g, t)) {
      template = t;
      break;
    }
  }
  return { template, mutator };
}

/** Target for a template now: `flat` is the base, `income` grows with how far the economy has come. */
export function questTarget(g: Game, t: QuestTemplateDef, weekly = false): number {
  let target = t.base > 0 ? t.base : 1;
  if (t.scale === "income") {
    const magnitude = Math.max(0, B.log10(g.state.allTime));
    target *= 1 + magnitude * bal(g, "questIncomeScale", 0.15);
  }
  // a daily template pressed into weekly service has to last the week
  if (weekly && !t.weekly) target *= bal(g, "weeklyFallbackMult", 6);
  return Math.max(1, Math.round(target));
}

function issue(g: Game, t: QuestTemplateDef, weekly: boolean): QuestState {
  return { id: t.id, target: questTarget(g, t, weekly), start: getStat(g, t.stat), claimed: false };
}

// ---------- views ---------------------------------------------------------------------

function template(g: Game, id: string): QuestTemplateDef | undefined {
  const all = g.content.quests ?? [];
  for (let i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
  return undefined;
}

export function questProgress(g: Game, q: QuestState): number {
  const t = template(g, q.id);
  if (!t) return q.target; // the template is gone from content: let the player clear it
  return Math.max(0, Math.min(q.target, getStat(g, t.stat) - q.start));
}

export function questDone(g: Game, q: QuestState): boolean {
  return questProgress(g, q) >= q.target;
}

export interface QuestView {
  id: string;
  template: QuestTemplateDef | undefined;
  progress: number;
  target: number;
  done: boolean;
  claimed: boolean;
}

function view(g: Game, q: QuestState): QuestView {
  const progress = questProgress(g, q);
  return { id: q.id, template: template(g, q.id), progress, target: q.target, done: progress >= q.target, claimed: q.claimed };
}

export function dailyQuests(g: Game): QuestView[] {
  return g.state.quests.daily.map((q) => view(g, q));
}

export function weeklyQuest(g: Game): (QuestView & { mutator: MutatorId | null; offered: MutatorId | null }) | null {
  const q = g.state.quests;
  if (!q.weekly) return null;
  return { ...view(g, q.weekly), mutator: q.weeklyMutator, offered: pickWeekly(g.content, q.week).mutator };
}

/** Milliseconds until the next set of dailies. */
export function msToNextDaily(g: Game): number {
  const wall = g.state.wall;
  return (dayIndex(wall) + 1) * DAY_MS - wall;
}

// ---------- rewards -------------------------------------------------------------------

/** Reward multiplier from the streak: +10 % per day, capped at a week. Missing a day only loses this. */
export function streakBonus(g: Game): number {
  return 1 + Math.min(7, Math.max(0, g.state.quests.streak)) * bal(g, "questStreakBonus", 0.1);
}

function rpSeconds(g: Game, secs: number): Big {
  return B.max(B.mulN(g.rates.research, secs), B.big(secs * 0.02));
}

function payDaily(g: Game, q: QuestState): void {
  const mult = streakBonus(g);
  q.claimed = true;
  addCredits(g, incomeSeconds(g, bal(g, "questRewardSecs", 300) * mult));
  addResearchPoints(g, rpSeconds(g, bal(g, "questRewardRpSecs", 120) * mult));
  stat(g, "questsDaily");
  emit(g, { t: "questDone", id: q.id });
}

function payWeekly(g: Game, q: QuestState): void {
  const quests = g.state.quests;
  const bonus = quests.weeklyMutator ? Math.max(1, lookup(g.content.mutators, quests.weeklyMutator)?.reward ?? 1) : 1;
  q.claimed = true;
  addCredits(g, incomeSeconds(g, bal(g, "weeklyRewardSecs", 3600) * bonus));
  addResearchPoints(g, rpSeconds(g, bal(g, "weeklyRewardRpSecs", 1200) * bonus));
  stat(g, "questsWeekly");
  // the handicap ends with the challenge
  if (quests.weeklyMutator) {
    quests.weeklyMutator = null;
    markDirty(g);
  }
  emit(g, { t: "questDone", id: q.id });
}

/** All three claimed on `day`: the streak grows if yesterday was cleared too, otherwise it restarts at 1. */
function clearedDay(g: Game, day: number): void {
  const q = g.state.quests;
  if (q.lastClaimDay === day) return;
  q.streak = q.lastClaimDay === day - 1 ? q.streak + 1 : 1;
  q.lastClaimDay = day;
  statMax(g, "streakMax", q.streak);
}

function allClaimed(list: QuestState[]): boolean {
  if (list.length === 0) return false;
  for (let i = 0; i < list.length; i++) if (!list[i].claimed) return false;
  return true;
}

// ---------- actions -------------------------------------------------------------------

export function claimQuest(g: Game, index: number): ActionResult {
  const quests = g.state.quests;
  const q = Number.isInteger(index) ? quests.daily[index] : undefined;
  if (!q) return fail("noTarget");
  if (q.claimed) return fail("max");
  if (!questDone(g, q)) return fail("requirement");
  payDaily(g, q);
  if (allClaimed(quests.daily)) clearedDay(g, quests.day);
  g.api.say("milestone");
  return OK;
}

export function claimWeekly(g: Game): ActionResult {
  const q = g.state.quests.weekly;
  if (!q) return fail("noTarget");
  if (q.claimed) return fail("max");
  if (!questDone(g, q)) return fail("requirement");
  payWeekly(g, q);
  g.api.say("milestone");
  return OK;
}

/**
 * Accepts or drops the week's mutator. It is always the player's choice: the weekly starts without
 * it and pays the plain reward. Accepting restarts the weekly's progress, so the bonus is only paid
 * for work done under the harder rules.
 */
export function setWeeklyMutator(g: Game, on: boolean): ActionResult {
  const quests = g.state.quests;
  const q = quests.weekly;
  if (!q) return fail("noTarget");
  if (q.claimed) return fail("max");
  if (!on) {
    if (quests.weeklyMutator !== null) {
      quests.weeklyMutator = null;
      markDirty(g);
    }
    return OK;
  }
  if (quests.weeklyMutator !== null) return OK;
  const offered = pickWeekly(g.content, quests.week).mutator;
  if (!offered) return fail("noTarget");
  quests.weeklyMutator = offered;
  const t = template(g, q.id);
  if (t) q.start = getStat(g, t.stat);
  markDirty(g);
  return OK;
}

// ---------- rollover ------------------------------------------------------------------

function rollDaily(g: Game, day: number): void {
  const quests = g.state.quests;
  // finished but unclaimed work is paid, not thrown away
  let settled = false;
  for (const q of quests.daily) {
    if (!q.claimed && questDone(g, q)) {
      payDaily(g, q);
      settled = true;
    }
  }
  if (settled && allClaimed(quests.daily)) clearedDay(g, quests.day);
  if (quests.lastClaimDay < day - 1) quests.streak = 0;
  quests.day = day;
  quests.daily = pickDaily(g.content, g.state.seed, day, g).map((t) => issue(g, t, false));
}

function rollWeekly(g: Game, week: number): void {
  const quests = g.state.quests;
  if (quests.weekly && !quests.weekly.claimed && questDone(g, quests.weekly)) payWeekly(g, quests.weekly);
  const pickOf = pickWeekly(g.content, week, g);
  quests.week = week;
  quests.weekly = pickOf.template ? issue(g, pickOf.template, true) : null;
  // harder rules are offered (see weeklyQuest().offered), never switched on behind the player's back
  if (quests.weeklyMutator !== null) {
    quests.weeklyMutator = null;
    markDirty(g);
  }
}

/** Issues new quests when the calendar moved forward. A clock set backwards changes nothing. */
export function refreshQuests(g: Game): void {
  const quests = g.state.quests;
  const day = dayIndex(g.state.wall);
  if (day > quests.day && hasFeature(g, "quests")) rollDaily(g, day);
  if (hasFeature(g, "weekly")) {
    const week = weekIndex(day);
    if (week > quests.week) rollWeekly(g, week);
  }
}

export const questsSystem: SystemDef = {
  id: "meta.quests",
  init(g) {
    const q = g.state.quests;
    if (!Array.isArray(q.daily)) q.daily = [];
    if (!Number.isFinite(q.day)) q.day = -1;
    if (!Number.isFinite(q.week)) q.week = -1;
    if (!Number.isFinite(q.streak) || q.streak < 0) q.streak = 0;
    if (!Number.isFinite(q.lastClaimDay)) q.lastClaimDay = -1;
    if (q.weekly === undefined) q.weekly = null;
    if (q.weeklyMutator !== null && !lookup(g.content.mutators, q.weeklyMutator)) q.weeklyMutator = null;
  },
  modifiers(g, out) {
    const id = g.state.quests.weeklyMutator;
    if (id) pushScaled(out, lookup(g.content.mutators, id)?.effects, 1);
  },
  tick(g, dt) {
    if (secondEdge(g, dt)) refreshQuests(g);
  },
};

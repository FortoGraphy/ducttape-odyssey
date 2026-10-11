// Events: the scheduler (one every few minutes, hourly cap, never on top of a mini-game, another
// event or a fresh failure), weighted picks with cooldowns and chains, choices with costs and
// luck-shifted outcomes, every EventEffect, and the offline auto-resolution by policy.
import * as B from "../big";
import {
  addBuff,
  addCredits,
  addItem,
  canAfford,
  emit,
  fail,
  getItem,
  hasItems,
  incomeSeconds,
  OK,
  rollInt,
  rollRange,
  setFlag,
  spend,
  stat,
  takeItem,
  takeItems,
  weightedIndex,
} from "../kernel";
import {
  DECK_IDS,
  STAT_KEYS,
  type ActionResult,
  type Big,
  type ContentDB,
  type Effect,
  type EventChoice,
  type EventDef,
  type EventEffect,
  type EventId,
  type EventOutcome,
  type FailReason,
  type Game,
  type MinigameResult,
  type OfflineReport,
  type PendingMinigame,
  type SystemDef,
} from "../types";
import { addMorale } from "./crew";
import { ventCargo } from "./failure";
import { fuelCap } from "./nav";
import { addRep } from "./station";
import { atLeast, bal, balPair, clamp, F, isInt, own, rt } from "./util";

const DEFAULT_COOLDOWN = 1800;
const HOUR = 3600;
const CHAIN_MAX = 8;
const FAILURE_QUIET = 20;

const idCache = new WeakMap<ContentDB, EventId[]>();
const scratchIds: EventId[] = [];
const scratchWeights: number[] = [];
const scratchIndex: number[] = [];

function eventIds(content: ContentDB): EventId[] {
  let ids = idCache.get(content);
  if (!ids) {
    ids = Object.keys(content.events ?? {});
    idCache.set(content, ids);
  }
  return ids;
}

// ---------- scheduling ----------------------------------------------------------------

/** Seconds until the next scheduled event, drawn from balance.eventEvery and the eventRate modifier. */
function nextInterval(g: Game): number {
  const every = balPair(g, "eventEvery", 240, 540);
  return rollRange(g, Math.max(1, every[0]), Math.max(1, every[1])) / atLeast(g.mods.eventRate, 0.05);
}

function maxPerHour(g: Game): number {
  return Math.max(0, Math.floor(bal(g, "eventMaxPerHour", 8)));
}

/** Rolls the hour window forward and tells whether it still has room. */
function windowOpen(g: Game): boolean {
  const ev = g.state.events;
  const t = g.state.t;
  if (!(t - ev.hourStart < HOUR) || ev.hourStart > t) {
    ev.hourStart = t;
    ev.hourCount = 0;
  }
  return ev.hourCount < maxPerHour(g);
}

const RING = "w:evt:";

/** Slot of the ring of recent event start times that is written next: it holds the oldest of the last `cap` starts. */
function ringSlot(g: Game, cap: number): number {
  const at = g.state.flags[RING + "at"];
  return at >= 0 && at < cap ? Math.floor(at) : 0;
}

/**
 * True when as many events as the cap allows started within the last hour. The hour window above is
 * a fixed bucket; this is the rolling hour, so two buckets can never empty back to back.
 */
function hourFull(g: Game): boolean {
  const cap = maxPerHour(g);
  if (cap <= 0) return true;
  const t = g.state.t;
  const oldest = g.state.flags[RING + ringSlot(g, cap)];
  return oldest !== undefined && t >= oldest && t - oldest < HOUR;
}

function noteStart(g: Game): void {
  const cap = Math.max(1, maxPerHour(g));
  const flags = g.state.flags;
  const i = ringSlot(g, cap);
  flags[RING + i] = g.state.t;
  flags[RING + "at"] = (i + 1) % cap;
}

function quiet(g: Game): boolean {
  const s = g.state;
  const failAt = s.flags[F.failAt];
  return s.minigame !== null || s.events.active !== null || s.nav.jump !== null || (failAt !== undefined && s.t - failAt < FAILURE_QUIET && s.t >= failAt);
}

function eligible(g: Game, def: EventDef, offline: boolean): boolean {
  const ev = g.state.events;
  if (!def || def.chainOnly || !(def.weight > 0) || !Array.isArray(def.choices) || def.choices.length === 0) return false;
  const seen = ev.seen[def.id] ?? 0;
  if (def.once && seen > 0) return false;
  // one-off and story beats wait for the player instead of being spent while they are away
  if (offline && (def.once || def.type === "story")) return false;
  const last = ev.last[def.id];
  if (last !== undefined && g.state.t - last < (def.cooldown ?? DEFAULT_COOLDOWN) && g.state.t >= last) return false;
  return g.api.check(def.when);
}

function pickEvent(g: Game, offline: boolean): EventDef | null {
  const ids = eventIds(g.content);
  scratchIds.length = 0;
  scratchWeights.length = 0;
  for (let i = 0; i < ids.length; i++) {
    const def = g.content.events[ids[i]];
    if (!eligible(g, def, offline)) continue;
    scratchIds.push(ids[i]);
    scratchWeights.push(def.weight);
  }
  if (scratchIds.length === 0) return null;
  return g.content.events[scratchIds[weightedIndex(g, scratchWeights)]];
}

/** Chance that the next scheduled pick is this event, given what is eligible right now (debug, tests, previews). */
export function eventChance(g: Game, id: EventId): number {
  const ids = eventIds(g.content);
  let total = 0;
  let mine = 0;
  for (let i = 0; i < ids.length; i++) {
    const def = g.content.events[ids[i]];
    if (!eligible(g, def, false)) continue;
    total += def.weight;
    if (ids[i] === id) mine = def.weight;
  }
  return total > 0 ? mine / total : 0;
}

function fire(g: Game, def: EventDef): void {
  const s = g.state;
  const ev = s.events;
  ev.active = { id: def.id, seed: rollInt(g, 1, 0x7ffffffe), result: null };
  ev.last[def.id] = s.t;
  ev.seen[def.id] = (ev.seen[def.id] ?? 0) + 1;
  ev.hourCount++;
  noteStart(g);
  stat(g, "events");
  stat(g, "event_" + def.type);
  emit(g, { t: "eventStarted", id: def.id });
}

/**
 * Starts an event by id (story beats, chains, debug). If something else has the screen it is
 * queued and starts as soon as possible. Ignores weights, cooldowns and the hourly cap.
 */
export function triggerEvent(g: Game, id: EventId): boolean {
  const s = g.state;
  const def = own(g.content.events, id);
  if (!def || g.offline || !Array.isArray(def.choices) || def.choices.length === 0) return false;
  if (s.events.active !== null || s.minigame !== null) {
    if (s.events.chain.length >= CHAIN_MAX) return false;
    s.events.chain.push({ id, at: s.t });
    return true;
  }
  windowOpen(g);
  fire(g, def);
  return true;
}

function tickEvents(g: Game): void {
  const s = g.state;
  const ev = s.events;
  if (ev.active !== null) return;
  const t = s.t;
  const chain = ev.chain;
  if (chain.length === 0 && t < ev.nextAt) return;
  if (quiet(g)) return;
  if (chain.length > 0) {
    for (let i = 0; i < chain.length; i++) {
      if (chain[i].at > t) continue;
      const def = g.content.events[chain[i].id];
      if (!def || !Array.isArray(def.choices) || def.choices.length === 0) {
        chain.splice(i, 1);
        return;
      }
      if (!windowOpen(g) || hourFull(g)) break;
      chain.splice(i, 1);
      fire(g, def);
      return;
    }
    if (t < ev.nextAt) return;
  }
  if (!windowOpen(g)) {
    ev.nextAt = ev.hourStart + HOUR;
    return;
  }
  // the hour window is a fixed bucket; this keeps two buckets from emptying back to back
  if (hourFull(g)) {
    ev.nextAt = t + 60;
    return;
  }
  const def = pickEvent(g, false);
  if (!def) {
    ev.nextAt = t + 60;
    return;
  }
  fire(g, def);
  ev.nextAt = t + nextInterval(g);
}

// ---------- choices -------------------------------------------------------------------

/** Credits a choice costs right now. */
export function eventChoiceCost(g: Game, choice: EventChoice): Big {
  const secs = choice.cost?.credits;
  return typeof secs === "number" && secs > 0 && Number.isFinite(secs) ? incomeSeconds(g, secs) : B.big(0);
}

/** Why a choice cannot be taken, or null when it can. */
export function eventChoiceBlock(g: Game, choice: EventChoice): FailReason | null {
  if (choice.requires && !g.api.check(choice.requires)) return "requirement";
  const cost = eventChoiceCost(g, choice);
  if (cost.m > 0 && !canAfford(g, cost)) return "credits";
  if (choice.cost?.items && !hasItems(g, choice.cost.items)) return "items";
  return null;
}

/** Whether the choice at this index of the event on screen can be taken right now (requirements met, cost payable). */
export function choiceAvailable(g: Game, choiceIndex: number): boolean {
  const a = g.state.events.active;
  if (!a || a.result !== null) return false;
  const choice = isInt(choiceIndex) ? g.content.events[a.id]?.choices[choiceIndex] : undefined;
  return choice !== undefined && eventChoiceBlock(g, choice) === null;
}

export function activeEventDef(g: Game): EventDef | null {
  const a = g.state.events.active;
  return a ? g.content.events[a.id] ?? null : null;
}

/** Outcome weights with eventLuck applied: good outcomes scale with luck, the rest do not. */
function rollOutcome(g: Game, choice: EventChoice): number {
  const outcomes = choice.outcomes;
  if (!Array.isArray(outcomes) || outcomes.length === 0) return 0;
  const luck = Math.max(0, g.mods.eventLuck);
  scratchWeights.length = 0;
  for (let i = 0; i < outcomes.length; i++) scratchWeights.push(Math.max(0, outcomes[i].weight) * (outcomes[i].good ? luck : 1));
  return weightedIndex(g, scratchWeights);
}

/** 1 = good, -1 = bad, 0 = neither. Outcomes not marked `good` count as bad when they hurt. */
export function outcomeTone(outcome: EventOutcome | undefined): -1 | 0 | 1 {
  if (!outcome) return 0;
  if (outcome.good === true) return 1;
  const fx = outcome.effects ?? [];
  for (let i = 0; i < fx.length; i++) {
    const e = fx[i];
    if (e.t === "failure" || e.t === "moduleDamage" || e.t === "loseCargo") return -1;
    if ((e.t === "hull" && e.pct < 0) || (e.t === "credits" && e.secs < 0) || (e.t === "morale" && e.n < 0) || (e.t === "fuel" && e.n < 0)) return -1;
  }
  return 0;
}

function payChoice(g: Game, choice: EventChoice): void {
  spend(g, eventChoiceCost(g, choice));
  if (choice.cost?.items) takeItems(g, choice.cost.items);
}

function countOutcome(g: Game, def: EventDef, outcome: EventOutcome | undefined): void {
  const tone = outcomeTone(outcome);
  if (tone > 0) stat(g, "eventsGood");
  else if (tone < 0) stat(g, "eventsBad");
  emit(g, { t: "eventResolved", id: def.id, good: tone >= 0 });
  if (tone > 0) g.api.say("eventGood");
  else if (tone < 0) g.api.say("eventBad");
}

/** Takes a choice of the active event: pays its cost, rolls the outcome and applies it. */
export function chooseEvent(g: Game, choiceIndex: number): ActionResult {
  const s = g.state;
  const active = s.events.active;
  if (!active) return fail("noTarget");
  if (active.result !== null || s.minigame !== null) return fail("busy");
  const def = g.content.events[active.id];
  if (!def) {
    s.events.active = null;
    return fail("invalid");
  }
  if (!isInt(choiceIndex) || choiceIndex < 0 || choiceIndex >= def.choices.length) return fail("invalid");
  const choice = def.choices[choiceIndex];
  const block = eventChoiceBlock(g, choice);
  if (block) return fail(block);
  payChoice(g, choice);
  const outcome = rollOutcome(g, choice);
  active.result = { choice: choiceIndex, outcome };
  const picked = choice.outcomes?.[outcome];
  if (picked) applyList(g, picked.effects, active.seed, true);
  countOutcome(g, def, picked);
  return OK;
}

/** Closes the event dialog. Before a choice it only works when no choice can be taken (never a soft lock). */
export function dismissEvent(g: Game): ActionResult {
  const s = g.state;
  const ev = s.events;
  const active = ev.active;
  if (!active) return fail("noTarget");
  if (s.minigame !== null && s.minigame.purpose === "event") return fail("busy");
  if (active.result === null) {
    const def = g.content.events[active.id];
    if (def) for (let i = 0; i < def.choices.length; i++) if (eventChoiceBlock(g, def.choices[i]) === null) return fail("requirement");
  }
  ev.active = null;
  const gap = s.t + Math.max(0, bal(g, "eventMinGap", 60)) / atLeast(g.mods.eventRate, 0.05);
  if (ev.nextAt < gap) ev.nextAt = gap;
  return OK;
}

// ---------- effects -------------------------------------------------------------------

/** Minigame effects of an outcome in a stable order; the index is the pending minigame's `ref`. */
function collectMinigames(effects: EventEffect[] | undefined, out: EventEffect[]): EventEffect[] {
  if (!Array.isArray(effects)) return out;
  for (let i = 0; i < effects.length; i++) {
    const e = effects[i];
    if (e.t !== "minigame") continue;
    out.push(e);
    collectMinigames(e.win, out);
    collectMinigames(e.lose, out);
  }
  return out;
}

function activeOutcome(g: Game): EventOutcome | null {
  const a = g.state.events.active;
  if (!a || !a.result) return null;
  return g.content.events[a.id]?.choices[a.result.choice]?.outcomes?.[a.result.outcome] ?? null;
}

/** A well-formed copy of a buff effect, or null: a bad one would poison every modifier it touches. */
function cleanEffect(e: Effect | undefined): Effect | null {
  if (!e || typeof e !== "object") return null;
  const out: Effect = {};
  if (typeof e.stat === "string" && (STAT_KEYS as readonly string[]).includes(e.stat)) out.stat = e.stat;
  else if (typeof e.deck === "string" && (DECK_IDS as readonly string[]).includes(e.deck)) out.deck = e.deck;
  else return null;
  if (typeof e.add === "number" && Number.isFinite(e.add)) out.add = e.add;
  if (typeof e.mul === "number" && Number.isFinite(e.mul) && e.mul >= 0) out.mul = e.mul;
  return out.add === undefined && out.mul === undefined ? null : out;
}

function applyOne(g: Game, e: EventEffect, seed: number, index: number, fromEvent: boolean): void {
  const s = g.state;
  switch (e.t) {
    case "credits": {
      if (!Number.isFinite(e.secs) || e.secs === 0) return;
      const amount = incomeSeconds(g, e.secs);
      if (e.secs > 0) addCredits(g, amount);
      else s.credits = B.subClamp(s.credits, amount);
      return;
    }
    case "item": {
      if (!Number.isFinite(e.n) || e.n === 0 || !own(g.content.items, e.item)) return;
      const amount = e.scaled ? B.mulN(g.api.miningScale(), Math.abs(e.n)) : B.big(Math.abs(e.n));
      if (e.n > 0) addItem(g, e.item, amount);
      else if (!takeItem(g, e.item, amount)) takeItem(g, e.item, getItem(g, e.item));
      return;
    }
    case "loseCargo":
      // authored either as a fraction (0.2) or as percent points (20)
      if (e.pct > 0) ventCargo(g, e.pct <= 1 ? e.pct : e.pct / 100);
      return;
    case "hull":
      if (!Number.isFinite(e.pct) || e.pct === 0) return;
      if (e.pct < 0) g.api.damageHull(-e.pct);
      else s.hull.hp = clamp(s.hull.hp + e.pct, 0, 100);
      return;
    case "moduleDamage":
      if (e.pct > 0) g.api.damageModules(e.pct, e.count, e.family);
      return;
    case "fuel":
      if (Number.isFinite(e.n)) s.nav.fuel = clamp(s.nav.fuel + e.n, 0, fuelCap(g));
      return;
    case "morale":
      addMorale(g, e.n);
      return;
    case "rep":
      addRep(g, e.faction, e.n);
      return;
    case "flag":
      if (typeof e.key === "string") setFlag(g, e.key, Number.isFinite(e.value) ? (e.value as number) : 1);
      return;
    case "failure":
      // offline can start no failure: the ship takes a knock instead
      if (g.offline) g.api.damageHull(bal(g, "offlineFailureHull", 6));
      else g.api.startFailure(e.kind);
      return;
    case "minigame": {
      if (g.offline) {
        g.api.damageModules(bal(g, "offlineMinigameDamage", 5), 1);
        return;
      }
      let ref = -1;
      if (fromEvent) {
        const outcome = activeOutcome(g);
        ref = outcome ? collectMinigames(outcome.effects, []).indexOf(e) : -1;
      }
      const token = s.minigame === null ? g.api.requestMinigame(e.game, e.tier, "event", ref) : 0;
      if (!token) {
        // nothing can host it right now: same result as an auto-resolved run
        applyList(g, e.win, seed, fromEvent);
        return;
      }
      if (ref < 0) {
        const pending = rt(g).pendingFx;
        if (pending.size >= 4) pending.clear();
        pending.set(token, { win: e.win, lose: e.lose, seed });
      }
      return;
    }
    case "blueprint":
      if (typeof e.recipe === "string" && e.recipe.length > 0) g.api.unlockRecipe(e.recipe);
      else g.api.grantBlueprint();
      return;
    case "crew":
      g.api.addCrew();
      return;
    case "card":
      g.api.grantCard(typeof e.deck === "string" ? e.deck : undefined);
      return;
    case "log":
      g.api.addLog(typeof e.id === "string" && e.id.length > 0 ? e.id : undefined);
      return;
    case "codex":
      if (typeof e.key === "string") g.api.discover(e.key);
      return;
    case "rp":
      if (e.secs > 0 && Number.isFinite(e.secs)) s.rp = B.add(s.rp, B.max(B.mulN(g.rates.research, e.secs), B.big(e.secs * 0.05)));
      return;
    case "buff":
      if (e.secs > 0 && Number.isFinite(e.secs)) {
        const effect = cleanEffect(e.effect);
        if (effect) addBuff(g, effect, e.secs, "event:" + seed + ":" + index);
      }
      return;
    case "chain":
      if (g.offline || !own(g.content.events, e.event)) return;
      if (s.events.chain.length < CHAIN_MAX) s.events.chain.push({ id: e.event, at: s.t + Math.max(0, Number.isFinite(e.delay) ? (e.delay as number) : 0) });
      return;
  }
}

function applyList(g: Game, effects: EventEffect[] | undefined, seed: number, fromEvent: boolean): void {
  if (!Array.isArray(effects)) return;
  for (let i = 0; i < effects.length; i++) {
    const e = effects[i];
    if (e && typeof e === "object") applyOne(g, e, seed, i, fromEvent);
  }
}

/** Applies event effects outside an event dialog (story rewards, salvage, debug). */
export function applyEffects(g: Game, effects: EventEffect[], seed: number): void {
  applyList(g, effects, Number.isFinite(seed) ? seed | 0 : 0, false);
}

function onEventMinigame(g: Game, pending: PendingMinigame, result: MinigameResult): void {
  const won = result !== undefined && result !== null && result.success === true;
  const active = g.state.events.active;
  if (pending.ref >= 0 && active && active.result) {
    const outcome = activeOutcome(g);
    const fx = outcome ? collectMinigames(outcome.effects, [])[pending.ref] : undefined;
    if (fx && fx.t === "minigame") applyList(g, won ? fx.win : fx.lose, active.seed, true);
    return;
  }
  const store = rt(g).pendingFx;
  const fx = store.get(pending.token);
  if (!fx) return;
  store.delete(pending.token);
  applyList(g, won ? fx.win : fx.lose, fx.seed, false);
}

// ---------- offline -------------------------------------------------------------------

/** The choice an offline policy takes among those that can be taken, or -1. */
export function policyChoice(g: Game, def: EventDef): number {
  scratchIndex.length = 0;
  for (let i = 0; i < def.choices.length; i++) if (eventChoiceBlock(g, def.choices[i]) === null) scratchIndex.push(i);
  if (scratchIndex.length === 0) return -1;
  scratchIndex.sort((a, b) => def.choices[a].risk - def.choices[b].risk || a - b);
  const policy = g.state.offline?.policy;
  if (policy === "cautious") return scratchIndex[0];
  if (policy === "risky") return scratchIndex[scratchIndex.length - 1];
  return scratchIndex[Math.floor((scratchIndex.length - 1) / 2)];
}

function offlineEvents(g: Game, seconds: number, report: OfflineReport): void {
  const s = g.state;
  const ev = s.events;
  const every = balPair(g, "eventEvery", 240, 540);
  const back = s.t + report.seconds;
  if (seconds >= every[0]) {
    // one for a short absence, up to three for a long night
    const range = balPair(g, "offlineEventCount", 1, 3);
    const count = Math.floor(clamp(range[0] + (seconds >= 2 * HOUR ? 1 : 0) + (seconds >= 5 * HOUR ? 1 : 0), 0, Math.max(0, range[1])));
    const hullBefore = s.hull.hp;
    for (let n = 0; n < count; n++) {
      const def = pickEvent(g, true);
      if (!def) break;
      const choiceIndex = policyChoice(g, def);
      ev.last[def.id] = s.t;
      if (choiceIndex < 0) continue;
      const choice = def.choices[choiceIndex];
      payChoice(g, choice);
      const outcome = rollOutcome(g, choice);
      const picked = choice.outcomes?.[outcome];
      if (picked) applyList(g, picked.effects, rollInt(g, 1, 0x7ffffffe), false);
      ev.seen[def.id] = (ev.seen[def.id] ?? 0) + 1;
      stat(g, "events");
      stat(g, "event_" + def.type);
      countOutcome(g, def, picked);
      report.events.push({ id: def.id, choice: choiceIndex, outcome });
    }
    // an unattended ship is never holed: offline knocks stop short of a breach
    const floor = Math.min(hullBefore, bal(g, "offlineHullFloor", 10));
    if (!(s.hull.hp >= floor)) s.hull.hp = floor;
  }
  // back at the console: a short breather before the next event, and a fresh hourly window
  ev.nextAt = back + rollRange(g, 60, 180);
  ev.hourStart = back;
  ev.hourCount = 0;
  for (let i = 0; i < ev.chain.length; i++) if (ev.chain[i].at < back) ev.chain[i].at = back + 20;
}

// ---------- system --------------------------------------------------------------------

export const eventSystem: SystemDef = {
  id: "world.events",
  init(g) {
    const s = g.state;
    if (!s.events || typeof s.events !== "object") s.events = { active: null, nextAt: 240, last: {}, seen: {}, hourStart: 0, hourCount: 0, chain: [] };
    const ev = s.events;
    if (!ev.last || typeof ev.last !== "object") ev.last = {};
    if (!ev.seen || typeof ev.seen !== "object") ev.seen = {};
    if (!Array.isArray(ev.chain)) ev.chain = [];
    ev.nextAt = Number.isFinite(ev.nextAt) ? ev.nextAt : s.t + 240;
    ev.hourStart = Number.isFinite(ev.hourStart) ? ev.hourStart : s.t;
    ev.hourCount = Number.isFinite(ev.hourCount) ? Math.max(0, ev.hourCount) : 0;
    if (ev.active && !g.content.events?.[ev.active.id]) ev.active = null;
    if (ev.active === undefined) ev.active = null;
    g.api.triggerEvent = (id) => triggerEvent(g, id);
    g.api.applyEffects = (effects, seed) => applyEffects(g, effects, seed);
    g.minigameHandlers.event = onEventMinigame;
  },
  tick: tickEvents,
  offline(g, seconds, _eff, report) {
    offlineEvents(g, seconds, report);
  },
  prestige(g) {
    const s = g.state;
    const ev = s.events;
    ev.active = null;
    ev.chain = [];
    ev.nextAt = s.t + nextInterval(g);
    ev.hourStart = s.t;
    ev.hourCount = 0;
    rt(g).pendingFx.clear();
  },
};

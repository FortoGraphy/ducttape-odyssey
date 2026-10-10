// Decks: output curves, level costs, purchase/unlock actions and the modifiers a deck grants by
// simply existing (GDD 2.1).
import * as B from "../big";
import { OK, canAfford, emit, fail, markDirty, spend, stat } from "../kernel";
import { DECK_IDS, type ActionResult, type Big, type DeckCurve, type DeckId, type Effect, type Game } from "../types";
import { consumeItem, hasUnits } from "./economy";
import { addCombo, bal, balArr, cc, type CoreCache } from "./shared";

export const DEFAULT_MILESTONES: readonly number[] = [10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500];
const MILESTONE_STEP = 100;

/** Number of output doublings reached at `level`. After the listed milestones one follows every `step` levels. */
export function milestoneCount(level: number, milestones: readonly number[], step = MILESTONE_STEP): number {
  let n = 0;
  const len = milestones.length;
  while (n < len && milestones[n] <= level) n++;
  if (n === len && len > 0 && step > 0) n += Math.floor((level - milestones[len - 1]) / step);
  return n;
}

/** exp: L * 2^(milestones <= L), lin: L, soft: 1 + log2(1 + L). Level 0 gives 0. */
export function levelMult(curve: DeckCurve, level: number, milestones: readonly number[], step = MILESTONE_STEP): number {
  if (!(level > 0)) return 0;
  if (curve === "lin") return level;
  if (curve === "soft") return 1 + Math.log2(1 + level);
  const v = level * Math.pow(2, milestoneCount(level, milestones, step));
  return Number.isFinite(v) ? v : Number.MAX_VALUE;
}

function milestones(g: Game): readonly number[] {
  return balArr(g, "milestones", DEFAULT_MILESTONES);
}

/** Next doubling level above the deck's current level (exp decks only). */
export function nextMilestone(g: Game, id: DeckId): { level: number; prev: number; left: number } | null {
  const def = g.content.decks[id];
  const d = g.state.decks[id];
  if (!def || !d || def.curve !== "exp" || d.level <= 0) return null;
  const ms = milestones(g);
  const step = bal(g, "milestoneStep", MILESTONE_STEP);
  const L = d.level;
  let prev = 0;
  for (let i = 0; i < ms.length; i++) {
    if (ms[i] > L) return { level: ms[i], prev, left: ms[i] - L };
    prev = ms[i];
  }
  if (!(step > 0)) return null;
  const k = Math.floor((L - prev) / step);
  return { level: prev + (k + 1) * step, prev: prev + k * step, left: prev + (k + 1) * step - L };
}

/** Sell bonus of the bridge as a fraction (0.02 per level). */
function bridgeSell(g: Game, level: number): number {
  return bal(g, "bridgeSellPerLevel", 0.02) * level;
}

/**
 * Deck output before global stat modifiers and power: `base * levelMult * deckMult`.
 * Special cases (balance keys): hangar `1 + floor(L / hangarDronesEvery)`, quarters
 * `1 + floor(L / quartersCrewEvery)` (both times base), bridge = its sell multiplier `1 + 0.02 L`.
 */
export function deckOutput(g: Game, id: DeckId): Big {
  const def = g.content.decks[id];
  const d = g.state.decks[id];
  if (!def || !d || !(d.level > 0)) return { m: 0, e: 0 };
  const L = d.level;
  const dm = g.deckMult[id];
  if (id === "bridge") return B.big(1 + bridgeSell(g, L) * dm);
  if (def.curve === "lin") {
    if (id === "hangar") return B.big(def.base * (1 + Math.floor(L / Math.max(1, bal(g, "hangarDronesEvery", 4)))) * dm);
    if (id === "quarters") return B.big(def.base * (1 + Math.floor(L / Math.max(1, bal(g, "quartersCrewEvery", 5)))) * dm);
    return B.big(def.base * L * dm);
  }
  if (def.curve === "soft") return B.big(def.base * (1 + Math.log2(1 + L)) * dm);
  const count = milestoneCount(L, milestones(g), bal(g, "milestoneStep", MILESTONE_STEP));
  // exact powers of two while a double can hold them, log space beyond
  if (count < 900) return B.mulN(B.big(Math.pow(2, count)), def.base * L * dm);
  return B.mulN(B.powN(2, count), def.base * L * dm);
}

/** Power before modifiers: the emergency cells (`reactorBasePower`) plus the reactor deck's output. */
export function reactorSupply(g: Game): number {
  return bal(g, "reactorBasePower", 30) + B.toNumber(deckOutput(g, "reactor"));
}

/** Cost of the next single level. */
export function nextCost(g: Game, id: DeckId): Big {
  const def = g.content.decks[id];
  const L = Math.max(1, g.state.decks[id].level);
  return B.mulN(B.powN(def.costGrowth, L - 1), def.baseCost * g.mods.deckCost);
}

/** Credits for the next `levels` levels of a built deck. */
export function deckCost(g: Game, id: DeckId, levels: number): Big {
  const def = g.content.decks[id];
  if (!def || !(levels > 0)) return { m: 0, e: 0 };
  return B.geomSum(nextCost(g, id), def.costGrowth, Math.floor(levels));
}

function maxLevel(g: Game): number {
  return bal(g, "deckMaxLevel", 100000);
}

/** How many levels the current credits pay for. */
export function maxAffordable(g: Game, id: DeckId): number {
  const def = g.content.decks[id];
  const d = g.state.decks[id];
  if (!def || !d || d.level <= 0) return 0;
  const room = maxLevel(g) - d.level;
  if (room <= 0) return 0;
  return Math.min(room, B.geomMax(nextCost(g, id), def.costGrowth, g.state.credits, room));
}

export interface BuyPreview {
  /** Levels the action would buy right now (0 = cannot afford any). */
  levels: number;
  cost: Big;
  /** Levels asked for by the buy mode (Infinity for max). */
  wanted: number;
}

function wantedLevels(g: Game, count?: number | "max"): number {
  const c = count === undefined ? g.state.buyMode : count;
  if (c === "max" || c === -1) return Infinity;
  return Math.floor(c);
}

/** What `buyDeck` would do, for button labels. With nothing affordable it reports the cost of one level. */
export function buyPreview(g: Game, id: DeckId, count?: number | "max"): BuyPreview {
  const wanted = wantedLevels(g, count);
  const levels = wanted >= 1 ? Math.min(wanted, maxAffordable(g, id)) : 0;
  return { levels, cost: deckCost(g, id, Math.max(1, levels)), wanted };
}

/**
 * Buys deck levels. `count` omitted uses `state.buyMode`; "max" (or -1) buys everything affordable.
 * A count larger than the credits allow buys as many levels as fit (at least one, else it fails).
 */
export function buyDeck(g: Game, id: DeckId, count?: number | "max"): ActionResult {
  const def = g.content.decks[id];
  const d = g.state.decks[id];
  if (!def || !d) return fail("invalid");
  if (d.level <= 0) return fail("locked");
  const wanted = wantedLevels(g, count);
  if (!(wanted >= 1)) return fail("invalid");
  if (d.level >= maxLevel(g)) return fail("max");
  let n = Math.min(wanted, maxAffordable(g, id));
  if (n <= 0) return fail("credits");
  let cost = deckCost(g, id, n);
  // geomMax and geomSum can disagree by one level at the edge of float precision
  while (n > 1 && !canAfford(g, cost)) cost = deckCost(g, id, --n);
  if (!spend(g, cost)) return fail("credits");

  const before = d.level;
  d.level = before + n;
  let crossed = 0;
  if (def.curve === "exp") {
    const ms = milestones(g);
    const step = bal(g, "milestoneStep", MILESTONE_STEP);
    crossed = milestoneCount(d.level, ms, step) - milestoneCount(before, ms, step);
  }
  stat(g, "purchases");
  stat(g, "deckLevels", n);
  if (crossed > 0) stat(g, "milestones", crossed);
  addCombo(g, bal(g, "comboPurchase", 2));
  markDirty(g);
  emit(g, { t: "purchase", deck: id, levels: n, milestone: crossed > 0 });
  g.api.say(crossed > 0 ? "milestone" : "purchase", { n: d.level });
  return OK;
}

/** Why a locked deck cannot be built yet, or OK. */
export function canUnlockDeck(g: Game, id: DeckId): ActionResult {
  const def = g.content.decks[id];
  const d = g.state.decks[id];
  if (!def || !d) return fail("invalid");
  if (d.level > 0) return fail("max");
  const u = def.unlock;
  if (u.chapter !== undefined && g.state.story.chapter < u.chapter) return fail("requirement");
  if (u.deck && g.state.decks[u.deck.id].level < u.deck.level) return fail("requirement");
  if (u.items) for (const item in u.items) if (!hasUnits(g, item, B.big(u.items[item]))) return fail("items");
  if (!canAfford(g, B.big(u.credits * g.mods.deckCost))) return fail("credits");
  return OK;
}

/** Credits needed to build a locked deck. */
export function unlockCost(g: Game, id: DeckId): Big {
  const def = g.content.decks[id];
  return def ? B.big(def.unlock.credits * g.mods.deckCost) : { m: 0, e: 0 };
}

/** Builds a deck (level 0 -> 1). */
export function unlockDeck(g: Game, id: DeckId): ActionResult {
  const check = canUnlockDeck(g, id);
  if (!check.ok) return check;
  const def = g.content.decks[id];
  if (!spend(g, unlockCost(g, id))) return fail("credits");
  const items = def.unlock.items;
  if (items) for (const item in items) consumeItem(g, item, B.big(items[item]));
  g.state.decks[id].level = 1;
  stat(g, "deckLevels");
  const c = cc(g);
  c.sweepDue = true;
  markDirty(g);
  emit(g, { t: "deckBuilt", deck: id });
  return OK;
}

export function setBuyMode(g: Game, mode: 1 | 10 | 100 | -1 | "max"): ActionResult {
  const m = mode === "max" ? -1 : mode;
  if (m !== 1 && m !== 10 && m !== 100 && m !== -1) return fail("invalid");
  g.state.buyMode = m;
  return OK;
}

/** Drones the hangar can field (0 until it is built). */
export function droneCapacity(g: Game): number {
  return g.state.decks.hangar.level > 0 ? Math.floor(g.mods.droneCap + 1e-9) : 0;
}

/** Crew the ship can house (1 bunk exists before the quarters deck). */
export function crewCapacity(g: Game): number {
  return Math.max(1, Math.floor(g.mods.crewCap + 1e-9));
}

// ---------- deck-inherent modifiers ---------------------------------------------------------

function push(c: CoreCache, out: Effect[], stat: Effect["stat"], add: number): void {
  if (!add) return;
  let e = c.effectPool[c.effectUsed];
  if (!e) {
    e = {};
    c.effectPool[c.effectUsed] = e;
  }
  c.effectUsed++;
  e.stat = stat;
  e.deck = undefined;
  e.add = add;
  e.mul = undefined;
  out.push(e);
}

const INHERENT: readonly DeckId[] = ["bridge", "workshop", "observatory", "quarters", "hangar"];

/**
 * Effects of the utility decks. They scale with the deck's own multiplier (manager, cards), which the
 * kernel only knows after the fold, so the values used are remembered and `deckMultStale` asks for one
 * more rebuild when they moved.
 */
export function deckModifiers(g: Game, c: CoreCache, out: Effect[]): void {
  const decks = g.state.decks;
  for (let i = 0; i < INHERENT.length; i++) c.usedDeckMult[INHERENT[i]] = g.deckMult[INHERENT[i]];

  const bridge = decks.bridge.level;
  if (bridge > 0) {
    push(c, out, "sellValue", bridgeSell(g, bridge) * g.deckMult.bridge);
    push(c, out, "offlineEff", Math.min(bal(g, "bridgeOfflineCap", 0.2), bal(g, "bridgeOfflinePerLevel", 0.002) * bridge));
  }
  if (decks.workshop.level > 0) push(c, out, "repairSpeed", bal(g, "workshopRepairPerLevel", 0.02) * decks.workshop.level);
  if (decks.observatory.level > 0) {
    const soft = B.toNumber(deckOutput(g, "observatory"));
    push(c, out, "scanSpeed", soft);
    push(c, out, "salvageRate", soft * bal(g, "observatorySalvage", 0.25));
  }
  if (decks.quarters.level > 0) push(c, out, "crewCap", Math.floor(B.toNumber(deckOutput(g, "quarters")) + 1e-9) - 1);
  // droneCap ends up as the drone count: 0 without a hangar, hangar output otherwise
  push(c, out, "droneCap", decks.hangar.level > 0 ? Math.floor(B.toNumber(deckOutput(g, "hangar")) + 1e-9) - 1 : -1);
}

export function deckMultStale(g: Game, c: CoreCache): boolean {
  for (let i = 0; i < INHERENT.length; i++) {
    const id = INHERENT[i];
    if (g.state.decks[id].level > 0 && c.usedDeckMult[id] !== g.deckMult[id]) return true;
  }
  return false;
}

/** Total levels across all decks (used by goals and tests). */
export function totalDeckLevels(g: Game): number {
  let n = 0;
  for (const id of DECK_IDS) n += g.state.decks[id].level;
  return n;
}

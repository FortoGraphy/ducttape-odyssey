// Crew: seeded people with two traits who manage decks, gain experience doing it, and run on coffee.
import * as B from "../big";
import { emit, fail, getItem, markDirty, nextUid, OK, rollInt, stat, takeItem, unlockFeature } from "../kernel";
import { hashSeed, Rng } from "../prng";
import { DECK_IDS, type ActionResult, type ContentDB, type CrewMember, type DeckId, type Effect, type Game, type SystemDef, type TraitId } from "../types";
import { bal, balPair, clamp, clearFlag, clearFlagsWithPrefix, F, rt } from "./util";

const CREW_FIRST = ["Mira", "Tobin", "Asha", "Luko", "Ines", "Radek", "Suri", "Oskar", "Nela", "Jonas", "Vesna", "Emil", "Ilka", "Bruno", "Zora", "Matyas"];
const CREW_LAST = ["Vance", "Okoro", "Halik", "Brandt", "Novak", "Sorel", "Ito", "Marsh", "Quill", "Dvorak", "Reyes", "Kask", "Lund", "Petrov", "Adair", "Faro"];
const DEFAULT_MAX_LEVEL = 20;
const NAME_MAX = 24;

// ---------- lookups -------------------------------------------------------------------

export function findCrew(g: Game, uid: number): CrewMember | null {
  const crew = g.state.crew;
  for (let i = 0; i < crew.length; i++) if (crew[i].uid === uid) return crew[i];
  return null;
}

export function crewMaxLevel(g: Game): number {
  return Math.max(1, Math.floor(bal(g, "crewMaxLevel", DEFAULT_MAX_LEVEL)));
}

/**
 * Bunks. Core folds the quarters deck into the crewCap modifier (1 + floor(level / 5), then shop
 * and research bonuses), so the modifier is the head count; there is always room for one.
 */
export function crewCap(g: Game): number {
  return Math.floor(clamp(g.mods.crewCap + 1e-9, 1, bal(g, "crewMax", 24)));
}

/** Manager output scale from morale: 50 % at 0, 110 % at 100. */
export function moraleFactor(g: Game): number {
  const ends = balPair(g, "managerMoraleFactor", 0.5, 1.1);
  return ends[0] + (ends[1] - ends[0]) * (clamp(g.state.morale, 0, 100) / 100);
}

/** Deck output bonus a crew member gives as manager (0.58 = +58 %) at the current morale. */
export function managerBonus(g: Game, member: CrewMember): number {
  return (bal(g, "managerBase", 0.5) + bal(g, "managerPerLevel", 0.08) * clamp(member.level, 1, crewMaxLevel(g))) * moraleFactor(g);
}

/** Experience needed to go from `level` to the next one. */
export function crewXpNeed(g: Game, level: number): number {
  return Math.max(1, bal(g, "crewXpBase", 120)) * Math.pow(Math.max(1, bal(g, "crewXpGrowth", 1.4)), clamp(level, 1, crewMaxLevel(g)) - 1);
}

export function isInjured(g: Game, uid: number): boolean {
  return g.state.flags[F.injuredPrefix + uid] > g.state.t;
}

// ---------- creation ------------------------------------------------------------------

function sortedTraits(content: ContentDB): TraitId[] {
  return Object.keys(content.traits ?? {}).sort();
}

/** A crew member derived from a seed alone (hire offers show them before they join). */
export function crewFromSeed(g: Game, seed: number): Omit<CrewMember, "uid"> {
  const rng = new Rng(hashSeed(seed | 0, 0xc4e3));
  const n = g.content.names;
  const first = n?.crewFirst?.length ? n.crewFirst : CREW_FIRST;
  const last = n?.crewLast?.length ? n.crewLast : CREW_LAST;
  const name = rng.pick(first) + " " + rng.pick(last);
  const all = sortedTraits(g.content);
  const traits: TraitId[] = [];
  if (all.length > 0) {
    // everyone is good at something: the first trait is a positive one when the content has any
    const good = all.filter((id) => g.content.traits[id].good);
    const a = rng.pick(good.length > 0 ? good : all);
    traits.push(a);
    const rest = all.filter((id) => id !== a);
    if (rest.length > 0) traits.push(rng.pick(rest));
  }
  return { seed: seed | 0, name, traits, level: 1, xp: 0, deck: null, away: false };
}

function join(g: Game, seed: number): number {
  const s = g.state;
  if (s.crew.length >= crewCap(g)) return 0;
  const member: CrewMember = { uid: nextUid(g), ...crewFromSeed(g, seed) };
  s.crew.push(member);
  stat(g, "crew");
  unlockFeature(g, "crew");
  emit(g, { t: "crewJoined", uid: member.uid });
  g.api.say("crewJoin", { name: member.name });
  return member.uid;
}

/** Adds a random crew member. Returns the uid, or 0 when every bunk is taken. */
export function addCrew(g: Game): number {
  if (g.state.crew.length >= crewCap(g)) return 0;
  return join(g, rollInt(g, 1, 0x7ffffffe));
}

/** Adds the crew member a hire offer showed. */
export function addCrewFromSeed(g: Game, seed: number): number {
  return join(g, seed);
}

// ---------- actions -------------------------------------------------------------------

function isDeckId(x: unknown): x is DeckId {
  return typeof x === "string" && (DECK_IDS as readonly string[]).includes(x);
}

/** Puts a crew member in charge of a deck (replacing its manager), or back in the bunk with `null`. */
export function assignCrew(g: Game, uid: number, deck: DeckId | null): ActionResult {
  const s = g.state;
  const member = findCrew(g, uid);
  if (!member) return fail("noTarget");
  if (deck === null) {
    if (member.deck && s.decks[member.deck]?.manager === member.uid) s.decks[member.deck].manager = 0;
    member.deck = null;
    markDirty(g);
    return OK;
  }
  if (!isDeckId(deck)) return fail("invalid");
  if (member.away) return fail("busy");
  const target = s.decks[deck];
  if (!target || !(target.level > 0)) return fail("locked");
  if (target.manager !== 0 && target.manager !== member.uid) {
    const prev = findCrew(g, target.manager);
    if (prev) prev.deck = null;
  }
  if (member.deck && member.deck !== deck && s.decks[member.deck]?.manager === member.uid) s.decks[member.deck].manager = 0;
  target.manager = member.uid;
  member.deck = deck;
  markDirty(g);
  return OK;
}

export function renameCrew(g: Game, uid: number, name: string): ActionResult {
  const member = findCrew(g, uid);
  if (!member) return fail("noTarget");
  if (typeof name !== "string") return fail("invalid");
  const clean = name.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  if (clean.length === 0) return fail("invalid");
  member.name = clean;
  return OK;
}

/** Lets a crew member go at the next port. Not possible while they are away. */
export function dismissCrew(g: Game, uid: number): ActionResult {
  const s = g.state;
  const member = findCrew(g, uid);
  if (!member) return fail("noTarget");
  if (member.away) return fail("busy");
  if (member.deck && s.decks[member.deck]?.manager === member.uid) s.decks[member.deck].manager = 0;
  s.crew.splice(s.crew.indexOf(member), 1);
  clearFlag(g, F.injuredPrefix + uid);
  markDirty(g);
  return OK;
}

/** Adds experience and applies level-ups. */
export function addCrewXp(g: Game, member: CrewMember, xp: number): void {
  if (!(xp > 0) || !Number.isFinite(xp)) return;
  if (member.level >= crewMaxLevel(g)) {
    member.xp = 0;
    return;
  }
  member.xp += xp * g.mods.xpGain;
  let need = crewXpNeed(g, member.level);
  while (member.xp >= need && member.level < crewMaxLevel(g)) {
    member.xp -= need;
    member.level++;
    need = crewXpNeed(g, member.level);
    if (member.deck) markDirty(g);
  }
  if (member.level >= crewMaxLevel(g)) member.xp = 0;
}

export function addMorale(g: Game, n: number): void {
  if (!Number.isFinite(n) || n === 0) return;
  const s = g.state;
  s.morale = clamp(s.morale + (n > 0 ? n * g.mods.moraleGain : n), 0, 100);
}

// ---------- coffee and morale ---------------------------------------------------------

const coffeeCache = new WeakMap<ContentDB, string>();

function coffeeItem(g: Game): string {
  let id = coffeeCache.get(g.content);
  if (id === undefined) {
    id = "coffee";
    const items = g.content.items ?? {};
    if (!items.coffee) for (const k in items) if (items[k].consumable?.kind === "coffee") id = k;
    coffeeCache.set(g.content, id);
  }
  return id;
}

/** Beans the crew drinks per minute. */
export function coffeePerMinute(g: Game): number {
  return g.state.crew.length * Math.max(0, bal(g, "coffeePerCrewMin", 1) * g.mods.coffeeUse);
}

/** Morale change per hour right now (positive with coffee, -6 without). */
export function moralePerHour(g: Game): number {
  const s = g.state;
  if (s.crew.length === 0) return 0;
  if (s.flags[F.coffeeOut] === 1) return -Math.abs(bal(g, "moraleNoCoffeePerHour", 6));
  return bal(g, "moraleRegen", 3) * g.mods.moraleGain * (1 + 0.02 * Math.max(0, s.decks.quarters?.level ?? 0));
}

/** Advances coffee use and morale by `seconds`. `floor` keeps long absences from wrecking the mood. */
function runMorale(g: Game, seconds: number, floor: number): void {
  const s = g.state;
  const crew = s.crew.length;
  if (crew === 0) {
    // an empty ship settles at a shrug
    const rest = bal(g, "moraleRest", 70);
    const step = (bal(g, "moraleRegen", 3) / 3600) * seconds;
    if (s.morale < rest) s.morale = Math.min(rest, s.morale + step);
    else if (s.morale > rest) s.morale = Math.max(rest, s.morale - step);
    return;
  }
  let covered = 1;
  const debt = (s.flags[F.coffeeDebt] ?? 0) + (coffeePerMinute(g) / 60) * seconds;
  if (debt >= 1 - 1e-9) {
    const want = Math.floor(debt + 1e-9);
    const id = coffeeItem(g);
    const have = Math.floor(Math.min(1e12, B.toNumber(getItem(g, id))));
    const drunk = Math.min(want, have);
    if (drunk > 0 && takeItem(g, id, drunk)) stat(g, "coffee", drunk);
    covered = drunk / want;
    s.flags[F.coffeeDebt] = Math.max(0, debt - want);
    const out = drunk < want;
    if (out && s.flags[F.coffeeOut] !== 1) {
      s.flags[F.coffeeOut] = 1;
      g.api.say("coffeeOut");
    } else if (!out && s.flags[F.coffeeOut] === 1) {
      clearFlag(g, F.coffeeOut);
    }
  } else {
    s.flags[F.coffeeDebt] = debt;
    covered = s.flags[F.coffeeOut] === 1 ? 0 : 1;
  }
  const up = bal(g, "moraleRegen", 3) * g.mods.moraleGain * (1 + 0.02 * Math.max(0, s.decks.quarters?.level ?? 0));
  const down = Math.abs(bal(g, "moraleNoCoffeePerHour", 6));
  const perHour = covered * up - (1 - covered) * down;
  const next = clamp(s.morale + (perHour / 3600) * seconds, 0, 100);
  s.morale = next < s.morale ? Math.max(next, Math.min(s.morale, floor)) : next;
}

// ---------- system --------------------------------------------------------------------

function pushScoped(out: Effect[], e: Effect, deck: DeckId): void {
  // an effect with neither stat nor deck means "the deck I manage"
  out.push(e.stat || e.deck ? e : { deck, add: e.add, mul: e.mul });
}

function initCrew(g: Game): void {
  const s = g.state;
  if (!Array.isArray(s.crew)) s.crew = [];
  s.morale = Number.isFinite(s.morale) ? clamp(s.morale, 0, 100) : 70;
  for (let i = s.crew.length - 1; i >= 0; i--) {
    const c = s.crew[i];
    if (!c || !Number.isFinite(c.uid)) {
      s.crew.splice(i, 1);
      continue;
    }
    c.level = Math.floor(clamp(c.level, 1, crewMaxLevel(g)));
    c.xp = Number.isFinite(c.xp) && c.xp > 0 ? c.xp : 0;
    if (!Array.isArray(c.traits)) c.traits = [];
    if (c.deck !== null && !isDeckId(c.deck)) c.deck = null;
    c.away = c.away === true;
    if (typeof c.name !== "string" || c.name.length === 0) c.name = crewFromSeed(g, c.seed).name;
  }
  g.api.addCrew = () => addCrew(g);
}

function tickCrew(g: Game): void {
  const r = rt(g);
  if (!r.slow) return;
  const s = g.state;
  const crew = s.crew;
  for (let i = 0; i < crew.length; i++) {
    const c = crew[i];
    if (c.deck === null) continue;
    // core owns deck state and may reset it (warp); the deck's record wins
    if (s.decks[c.deck]?.manager !== c.uid) {
      c.deck = null;
      markDirty(g);
    } else if (!c.away && c.level < crewMaxLevel(g)) {
      addCrewXp(g, c, 1);
    }
  }
  // and the other way round: a deck never points at someone who is not posted there
  for (let i = 0; i < DECK_IDS.length; i++) {
    const d = s.decks[DECK_IDS[i]];
    if (d.manager !== 0 && findCrew(g, d.manager)?.deck !== DECK_IDS[i]) {
      d.manager = 0;
      markDirty(g);
    }
  }
  runMorale(g, 1, 0);
  const step = Math.floor(s.morale);
  if (step !== r.moraleStep) {
    if (r.moraleStep >= 0 && crew.length > 0) markDirty(g);
    r.moraleStep = step;
  }
}

export const crewSystem: SystemDef = {
  id: "world.crew",
  init: initCrew,
  modifiers(g, out) {
    const s = g.state;
    const crew = s.crew;
    for (let i = 0; i < crew.length; i++) {
      const c = crew[i];
      if (c.deck === null || c.away || s.decks[c.deck]?.manager !== c.uid || !(s.decks[c.deck].level > 0)) continue;
      out.push({ deck: c.deck, add: managerBonus(g, c) });
      for (let t = 0; t < c.traits.length; t++) {
        const def = g.content.traits[c.traits[t]];
        if (!def) continue;
        for (let e = 0; e < def.effects.length; e++) pushScoped(out, def.effects[e], c.deck);
      }
    }
  },
  tick: tickCrew,
  offline(g, seconds) {
    const s = g.state;
    for (let i = 0; i < s.crew.length; i++) {
      const c = s.crew[i];
      if (c.deck !== null && !c.away && s.decks[c.deck]?.manager === c.uid) addCrewXp(g, c, seconds);
    }
    runMorale(g, seconds, bal(g, "offlineMoraleFloor", 20));
  },
  prestige(g) {
    const s = g.state;
    // decks are rebuilt by core: everyone is back in the bunks, nobody is lost
    for (let i = 0; i < s.crew.length; i++) {
      s.crew[i].deck = null;
      s.crew[i].away = false;
    }
    for (let i = 0; i < DECK_IDS.length; i++) if (s.decks[DECK_IDS[i]]) s.decks[DECK_IDS[i]].manager = 0;
    clearFlagsWithPrefix(g, F.injuredPrefix);
    clearFlag(g, F.coffeeDebt);
    clearFlag(g, F.coffeeOut);
  },
};

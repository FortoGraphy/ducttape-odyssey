// Expeditions: crew go down to a scanned planet for a while and come back with seeded loot.
// The worst that can happen is a wasted trip, a dip in morale and a few minutes in sickbay.
import * as B from "../big";
import { addCredits, addItem, emit, fail, hasFeature, incomeSeconds, markDirty, nextUid, OK, rollInt, stat } from "../kernel";
import { Rng } from "../prng";
import type { ActionResult, CrewMember, Expedition, Game, ItemId, PlanetInfo, SystemDef } from "../types";
import { addCrewXp, addMorale, crewMaxLevel, findCrew } from "./crew";
import { planetById } from "./galaxy";
import { findPlanet, isScanned } from "./planets";
import { atLeast, bal, balPair, clamp, clearFlag, F, isInt, rt } from "./util";

export type ExpeditionKind = "short" | "medium" | "long";

interface KindSpec {
  secs: number;
  risk: number;
  /** Item loot per resource, in multiples of the mining scale (about 10 s of mining). */
  items: number;
  /** Credits found, in seconds of income. */
  credits: number;
  blueprint: number;
  card: number;
  log: number;
  artifact: number;
  xp: number;
}

const KIND_ORDER: ExpeditionKind[] = ["short", "medium", "long"];
const KINDS: Record<ExpeditionKind, KindSpec> = {
  short: { secs: 300, risk: 0.08, items: 3, credits: 20, blueprint: 0.06, card: 0.08, log: 0.05, artifact: 0.02, xp: 40 },
  medium: { secs: 1200, risk: 0.16, items: 10, credits: 90, blueprint: 0.18, card: 0.2, log: 0.15, artifact: 0.08, xp: 150 },
  long: { secs: 3600, risk: 0.28, items: 25, credits: 300, blueprint: 0.4, card: 0.4, log: 0.3, artifact: 0.2, xp: 420 },
};
const MAX_PARTY = 3;

function isKind(x: unknown): x is ExpeditionKind {
  return x === "short" || x === "medium" || x === "long";
}

/** The kind is packed into the two low bits of the seed (Expedition has no field for it). */
export function expeditionKind(exp: Expedition): ExpeditionKind {
  return KIND_ORDER[(exp.seed >>> 0) & 3] ?? "short";
}

/** 5, 20 or 60 minutes (balance.expeditionSecs gives the short and long ends), divided by expeditionSpeed. */
export function expeditionSeconds(g: Game, kind: ExpeditionKind): number {
  const ends = balPair(g, "expeditionSecs", KINDS.short.secs, KINDS.long.secs);
  const t = (KINDS[kind].secs - KINDS.short.secs) / (KINDS.long.secs - KINDS.short.secs);
  return Math.max(1, ends[0] + (ends[1] - ends[0]) * t) / atLeast(g.mods.expeditionSpeed, 0.05);
}

/** Chance of a wasted trip: the planet's hazards and weather against the party's experience. */
export function expeditionRisk(g: Game, planet: PlanetInfo, crew: CrewMember[], kind: ExpeditionKind): number {
  let level = 0;
  for (let i = 0; i < crew.length; i++) level += crew[i].level;
  level = crew.length > 0 ? level / crew.length : 1;
  let risk = KINDS[kind].risk + planet.hazards.length * 0.08;
  if (planet.weather === "extreme") risk += 0.1;
  else if (planet.weather === "storms") risk += 0.05;
  risk -= (level - 1) * 0.02 + (crew.length - 1) * 0.03;
  return clamp(risk, 0.02, 0.9);
}

function party(g: Game, uids: unknown): CrewMember[] | null {
  if (!Array.isArray(uids) || uids.length < 1 || uids.length > MAX_PARTY) return null;
  const out: CrewMember[] = [];
  for (let i = 0; i < uids.length; i++) {
    const c = isInt(uids[i]) ? findCrew(g, uids[i]) : null;
    if (!c || out.includes(c)) return null;
    out.push(c);
  }
  return out;
}

/** Duration and risk for the planning screen, or null when the plan is not valid. */
export function previewExpedition(g: Game, planetId: string, crewUids: number[], kind: ExpeditionKind): { seconds: number; risk: number } | null {
  const planet = findPlanet(g, planetId);
  const crew = party(g, crewUids);
  if (!planet || !crew || !isKind(kind)) return null;
  return { seconds: expeditionSeconds(g, kind), risk: expeditionRisk(g, planet, crew, kind) };
}

/** Sends 1-3 crew to a scanned planet of the current system for 5, 20 or 60 minutes. */
export function startExpedition(g: Game, planetId: string, crewUids: number[], kind: ExpeditionKind): ActionResult {
  const s = g.state;
  if (!hasFeature(g, "expeditions")) return fail("locked");
  if (!isKind(kind)) return fail("invalid");
  if (s.nav.jump !== null) return fail("busy");
  const planet = findPlanet(g, planetId);
  if (!planet) return fail("noTarget");
  if (!isScanned(g, planet.id)) return fail("requirement");
  const crew = party(g, crewUids);
  if (!crew) return fail("invalid");
  for (let i = 0; i < crew.length; i++) if (crew[i].away) return fail("busy");
  if (s.expeditions.length >= bal(g, "expeditionMax", 8)) return fail("max");
  const exp: Expedition = {
    uid: nextUid(g),
    planet: planet.id,
    planetName: planet.name,
    crew: crew.map((c) => c.uid),
    start: s.t,
    end: s.t + expeditionSeconds(g, kind),
    risk: expeditionRisk(g, planet, crew, kind),
    seed: rollInt(g, 1, 0x1ffffffe) * 4 + KIND_ORDER.indexOf(kind),
    done: false,
  };
  for (let i = 0; i < crew.length; i++) crew[i].away = true;
  s.expeditions.push(exp);
  stat(g, "expeditions");
  markDirty(g); // managers who left stop boosting their decks
  return OK;
}

// ---------- outcome -------------------------------------------------------------------

export interface ExpeditionOutcome {
  uid: number;
  planet: string;
  kind: ExpeditionKind;
  /** The trip was a bust: nothing found. */
  lost: boolean;
  /** Item loot in multiples of the mining scale. */
  items: { item: ItemId; n: number }[];
  /** Credits in seconds of income. */
  creditSecs: number;
  blueprint: boolean;
  card: boolean;
  log: boolean;
  artifact: ItemId | null;
  /** Crew uid who comes back hurt, 0 = nobody. */
  injured: number;
  morale: number;
  xp: number;
}

function artifactIds(g: Game): ItemId[] {
  const out: ItemId[] = [];
  const items = g.content.items ?? {};
  for (const id in items) if (items[id].category === "artifact") out.push(id);
  return out.sort();
}

/** The seeded result of an expedition. Pure: the same expedition always resolves the same way. */
export function expeditionOutcome(g: Game, exp: Expedition): ExpeditionOutcome {
  const kind = expeditionKind(exp);
  const spec = KINDS[kind];
  const rng = new Rng(exp.seed);
  const lost = rng.next() < exp.risk;
  const hurtRoll = rng.next();
  const who = exp.crew.length > 0 ? exp.crew[rng.int(0, exp.crew.length - 1)] : 0;
  const out: ExpeditionOutcome = {
    uid: exp.uid,
    planet: exp.planet,
    kind,
    lost,
    items: [],
    creditSecs: 0,
    blueprint: false,
    card: false,
    log: false,
    artifact: null,
    injured: hurtRoll < (lost ? 0.6 : exp.risk * 0.3) ? who : 0,
    morale: lost ? -4 : 2,
    xp: lost ? spec.xp * 0.4 : spec.xp,
  };
  if (lost) return out;
  const loot = Math.max(0, g.mods.expeditionLoot);
  const planet = planetById(g.content, g.state.seed, exp.planet);
  const res = planet ? planet.resources : [];
  for (let i = 0; i < res.length; i++) out.items.push({ item: res[i], n: (spec.items * rng.range(0.7, 1.3) * loot) / res.length });
  if (planet && planet.special) out.items.push({ item: planet.special, n: spec.items * 0.5 * rng.range(0.7, 1.3) * loot });
  out.creditSecs = spec.credits * rng.range(0.8, 1.2) * loot;
  out.blueprint = rng.chance(spec.blueprint);
  out.card = rng.chance(spec.card);
  out.log = rng.chance(spec.log);
  if (rng.chance(spec.artifact)) {
    const all = artifactIds(g);
    if (all.length > 0) {
      const fresh = all.filter((id) => g.state.codex["artifact:" + id] === undefined);
      out.artifact = rng.pick(fresh.length > 0 ? fresh : all);
    }
  }
  return out;
}

const lastOutcome = new WeakMap<Game, ExpeditionOutcome>();

/** What the most recently claimed expedition brought back (for the result card). Not saved. */
export function lastExpeditionOutcome(g: Game): ExpeditionOutcome | null {
  return lastOutcome.get(g) ?? null;
}

function comeBack(g: Game, exp: Expedition): void {
  const s = g.state;
  exp.done = true;
  const out = expeditionOutcome(g, exp);
  for (let i = 0; i < exp.crew.length; i++) {
    const c = findCrew(g, exp.crew[i]);
    if (!c) continue;
    if (out.injured === c.uid) s.flags[F.injuredPrefix + c.uid] = s.t + Math.max(0, bal(g, "injurySecs", 900));
    else c.away = false;
  }
  addMorale(g, out.morale);
  if (out.lost) stat(g, "expeditionsLost");
  markDirty(g);
  emit(g, { t: "expeditionDone", uid: exp.uid });
}

/** Unloads a returned expedition: items, credits, and whatever else the party found. */
export function claimExpedition(g: Game, uid: number): ActionResult {
  const s = g.state;
  let at = -1;
  for (let i = 0; i < s.expeditions.length; i++) if (s.expeditions[i].uid === uid) at = i;
  if (at < 0) return fail("noTarget");
  const exp = s.expeditions[at];
  if (!exp.done) return fail("busy");
  const out = expeditionOutcome(g, exp);
  s.expeditions.splice(at, 1);
  const scale = g.api.miningScale();
  for (let i = 0; i < out.items.length; i++) addItem(g, out.items[i].item, B.max(B.mulN(scale, out.items[i].n), B.big(1)));
  if (out.creditSecs > 0) addCredits(g, incomeSeconds(g, out.creditSecs));
  if (out.blueprint) g.api.grantBlueprint();
  if (out.card) g.api.grantCard();
  if (out.log) g.api.addLog();
  if (out.artifact) {
    addItem(g, out.artifact, 1);
    g.api.discover("artifact:" + out.artifact);
  }
  for (let i = 0; i < exp.crew.length; i++) {
    const c = findCrew(g, exp.crew[i]);
    if (c && c.level < crewMaxLevel(g)) addCrewXp(g, c, out.xp);
  }
  lastOutcome.set(g, out);
  return OK;
}

// ---------- system --------------------------------------------------------------------

export const expeditionSystem: SystemDef = {
  id: "world.expeditions",
  init(g) {
    const s = g.state;
    if (!Array.isArray(s.expeditions)) s.expeditions = [];
    for (let i = s.expeditions.length - 1; i >= 0; i--) {
      const e = s.expeditions[i];
      if (!e || !Array.isArray(e.crew) || !Number.isFinite(e.end) || !Number.isFinite(e.seed)) s.expeditions.splice(i, 1);
      else e.risk = clamp(e.risk, 0, 1);
    }
  },
  tick(g) {
    if (!rt(g).slow) return;
    const s = g.state;
    const list = s.expeditions;
    for (let i = 0; i < list.length; i++) if (!list[i].done && s.t >= list[i].end) comeBack(g, list[i]);
    // sickbay discharges
    const crew = s.crew;
    for (let i = 0; i < crew.length; i++) {
      const c = crew[i];
      if (!c.away) continue;
      const key = F.injuredPrefix + c.uid;
      const until = s.flags[key];
      if (until === undefined) {
        // away with no expedition and no injury on record (edited save): send them home
        let out = false;
        for (let j = 0; j < list.length; j++) if (!list[j].done && list[j].crew.includes(c.uid)) out = true;
        if (!out) {
          c.away = false;
          markDirty(g);
        }
      } else if (s.t >= until) {
        clearFlag(g, key);
        c.away = false;
        markDirty(g);
      }
    }
  },
  prestige(g) {
    g.state.expeditions = [];
  },
};

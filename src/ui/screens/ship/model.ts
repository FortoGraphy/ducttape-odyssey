// Read-only helpers for the Ship tab: what each deck shows on its LCD, why it is stalled, where the
// production chain is limited. Everything here is cheap enough to run inside a 10 Hz selector.
import * as B from "@/engine/big";
import { buyPreview, crewCapacity, deckOutput, droneCapacity, nextMilestone, unlockCost } from "@/engine/core";
import { DECK_IDS, type Big, type DeckId, type Game, type ItemId, type StatKey } from "@/engine/types";

export type DeckStatus = "ok" | "blocked" | "noPower" | "cargoFull" | "bottleneck" | "waiting";

export const KEEP_STEPS = [0, 0.05, 0.1, 0.25, 0.5, 1] as const;
export const DRONE_ROLES = ["hauler", "probe", "salvager", "fixer"] as const;

function bal(g: Game, key: string, def: number): number {
  const v = g.content.balance[key];
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

/** True when the active failure state shuts this deck down. */
export function isBlocked(g: Game, id: DeckId): boolean {
  const f = g.state.failure;
  return !!f && (g.content.failures[f.kind]?.blocksDecks ?? []).indexOf(id) >= 0;
}

export function cargoFill(g: Game): number {
  return B.ratio(g.rates.cargoUsed, g.rates.cargoCap);
}

export function hopperCap(g: Game): Big {
  return B.mulN(g.rates.mine, bal(g, "hopperSeconds", 30));
}

export function hopperFill(g: Game): number {
  const cap = hopperCap(g);
  return cap.m > 0 ? B.ratio(g.state.hopper, cap) : 0;
}

export const liftLimits = (g: Game): boolean => g.rates.mine.m > 0 && B.cmp(g.rates.lift, g.rates.mine) < 0;

/** The number a deck shows on its LCD: its real output after modifiers, power and failures. */
export function shownOutput(g: Game, id: DeckId): Big {
  const r = g.rates;
  switch (id) {
    case "mining":
      return r.mine;
    case "lift":
      return r.lift;
    case "cargo":
      return r.cargoCap;
    case "reactor":
      return B.big(r.power.supply);
    case "refinery":
    case "fabricator":
    case "workshop":
      return r.craftBatch[id];
    case "lab":
      return r.research;
    case "hangar":
      return B.big(droneCapacity(g));
    case "quarters":
      return B.big(crewCapacity(g));
    case "greenhouse":
      return isBlocked(g, id) ? B.ZERO : B.mulN(deckOutput(g, id), g.mods.allProd * r.power.eff);
    case "observatory":
      return B.big(g.mods.scanSpeed);
    default:
      return B.big(g.mods.sellValue);
  }
}

/**
 * Raw deck output at another level. `deckOutput` reads the level from state, so the level is swapped
 * for the duration of the (synchronous, side-effect free) call and restored before returning.
 */
export function outputAt(g: Game, id: DeckId, level: number): Big {
  const d = g.state.decks[id];
  const keep = d.level;
  d.level = level;
  try {
    return deckOutput(g, id);
  } finally {
    d.level = keep;
  }
}

/** Shown output after one more level (proportional for producing decks, additive for utility decks). */
export function nextShownOutput(g: Game, id: DeckId): Big {
  const L = g.state.decks[id].level;
  const now = outputAt(g, id, L);
  const next = outputAt(g, id, L + 1);
  const shown = shownOutput(g, id);
  if (id === "reactor") return B.add(shown, B.mulN(B.sub(next, now), g.mods.powerOut));
  if (id === "hangar" || id === "quarters" || id === "bridge" || id === "observatory") return B.add(shown, B.sub(next, now));
  if (!(now.m > 0) || !(shown.m > 0)) return next;
  const scaled = B.mul(shown, B.div(next, now));
  return id === "refinery" || id === "fabricator" || id === "workshop" ? B.max(B.floor(scaled), B.ONE) : scaled;
}

export function deckStatus(g: Game, id: DeckId): DeckStatus {
  if (isBlocked(g, id)) return "blocked";
  const def = g.content.decks[id];
  if (g.rates.power.eff < 0.995 && def.power > 0 && id !== "cargo" && id !== "hangar" && id !== "quarters" && id !== "bridge" && id !== "observatory") return "noPower";
  if (id === "cargo" && cargoFill(g) >= 0.98) return "cargoFull";
  if (id === "lift" && liftLimits(g)) return "bottleneck";
  if (id === "mining" && liftLimits(g) && hopperFill(g) >= 0.98) return "waiting";
  return "ok";
}

export interface CardSel {
  level: number;
  out: string;
  /** Monotonic stand-in for the output, only its direction matters to the LCD roll. */
  outN: number;
  costText: string;
  levels: number;
  afford: boolean;
  msLevel: number;
  msProg: number;
  /** Portrait seed of the manager, 0 = nobody. */
  manager: number;
  /** Rarities of the equipped cards joined by "|". */
  cards: string;
  status: DeckStatus;
  crewOn: boolean;
  cardsOn: boolean;
}

export function selectCard(g: Game, id: DeckId, fmt: (v: Big) => string): CardSel {
  const d = g.state.decks[id];
  const out = shownOutput(g, id);
  const p = buyPreview(g, id);
  const ms = nextMilestone(g, id);
  let seed = 0;
  if (d.manager) for (const c of g.state.crew) if (c.uid === d.manager) seed = c.seed;
  let cards = "";
  for (let i = 0; i < d.cards.length; i++) cards += (i ? "|" : "") + (g.content.cards[d.cards[i]]?.rarity ?? 0);
  return {
    level: d.level,
    out: fmt(out),
    outN: out.m > 0 ? B.log10(out) : -99,
    costText: fmt(p.cost),
    levels: p.levels,
    afford: p.levels > 0,
    msLevel: ms ? ms.level : 0,
    msProg: ms ? (d.level - ms.prev) / Math.max(1, ms.level - ms.prev) : 0,
    manager: seed,
    cards,
    status: deckStatus(g, id),
    crewOn: g.state.features.crew === 1,
    cardsOn: g.state.features.cards === 1,
  };
}

// ---------- locked decks ----------------------------------------------------------------------

export interface Requirement {
  kind: "item" | "deck" | "chapter";
  item?: ItemId;
  deck?: DeckId;
  have: number;
  need: number;
  ok: boolean;
}

export function requirements(g: Game, id: DeckId): Requirement[] {
  const u = g.content.decks[id].unlock;
  const out: Requirement[] = [];
  if (u.chapter !== undefined) out.push({ kind: "chapter", have: g.state.story.chapter, need: u.chapter, ok: g.state.story.chapter >= u.chapter });
  if (u.deck) {
    const have = g.state.decks[u.deck.id].level;
    out.push({ kind: "deck", deck: u.deck.id, have, need: u.deck.level, ok: have >= u.deck.level });
  }
  if (u.items) {
    for (const item in u.items) {
      const have = Math.floor(Math.min(1e15, B.toNumber(g.state.inv[item] ?? B.ZERO)) + 1e-6);
      out.push({ kind: "item", item, have, need: u.items[item], ok: have >= u.items[item] });
    }
  }
  return out;
}

/** The locked deck the player should go for next: the cheapest one whose gates are open. */
export function nextUnlock(g: Game): DeckId | null {
  let best: DeckId | null = null;
  let fallback: DeckId | null = null;
  for (const id of DECK_IDS) {
    if (g.state.decks[id].level > 0) continue;
    const u = g.content.decks[id].unlock;
    const credits = u.credits;
    if (fallback === null || credits < g.content.decks[fallback].unlock.credits) fallback = id;
    if (u.chapter !== undefined && g.state.story.chapter < u.chapter) continue;
    if (u.deck && g.state.decks[u.deck.id].level < u.deck.level) continue;
    if (best === null || credits < g.content.decks[best].unlock.credits) best = id;
  }
  return best ?? fallback;
}

export const canPay = (g: Game, id: DeckId): boolean => B.cmp(g.state.credits, unlockCost(g, id)) >= 0;

// ---------- flow --------------------------------------------------------------------------------

export type FlowIssue = "blocked" | "noPower" | "lift" | "cargoFull" | "mining";

/** What limits the production chain right now and which deck fixes it. */
export function flowIssue(g: Game): { issue: FlowIssue; deck: DeckId } {
  if (isBlocked(g, "mining")) return { issue: "blocked", deck: "mining" };
  if (isBlocked(g, "lift")) return { issue: "blocked", deck: "lift" };
  if (g.rates.power.eff < 0.995) return { issue: "noPower", deck: "reactor" };
  if (liftLimits(g)) return { issue: "lift", deck: "lift" };
  if (cargoFill(g) >= 0.98) return { issue: "cargoFull", deck: "cargo" };
  return { issue: "mining", deck: "mining" };
}

// ---------- multipliers ----------------------------------------------------------------------

/** Global stats that scale a deck's shown output on top of its own multiplier. */
export const DECK_STATS: Record<DeckId, StatKey[]> = {
  mining: ["allProd", "mineRate"],
  lift: ["allProd", "liftRate"],
  cargo: ["cargoCap"],
  reactor: ["powerOut"],
  refinery: ["craftBatch", "craftSpeed"],
  fabricator: ["craftBatch", "craftSpeed", "qualityLuck"],
  workshop: ["craftBatch", "craftSpeed", "repairSpeed"],
  lab: ["allProd", "researchRate"],
  greenhouse: ["allProd"],
  hangar: ["droneCap"],
  quarters: ["crewCap", "moraleGain"],
  observatory: ["scanSpeed", "salvageRate"],
  bridge: ["sellValue", "offlineEff"],
};

/** Additive deck bonus from the equipped cards (0.2 = +20 %). */
export function cardBonus(g: Game, id: DeckId): number {
  let add = 0;
  for (const cid of g.state.decks[id].cards) {
    const def = g.content.cards[cid];
    const lvl = g.state.cards[cid]?.lvl ?? 0;
    if (!def || lvl <= 0) continue;
    for (const e of def.effects) if (!e.stat && (e.deck ?? def.deck) === id && e.add) add += e.add * lvl;
  }
  return add;
}

export function offlineEff(g: Game): number {
  return Math.min(1, bal(g, "offlineBaseEff", 0.35) * g.mods.offlineEff);
}

export function offlineCap(g: Game): number {
  return Math.min(24 * 3600, bal(g, "offlineBaseCap", 8 * 3600) * g.mods.offlineCap);
}

export function nearestKeepStep(k: number): number {
  let best = 0;
  for (let i = 1; i < KEEP_STEPS.length; i++) if (Math.abs(KEEP_STEPS[i] - k) < Math.abs(KEEP_STEPS[best] - k)) best = i;
  return best;
}

export { bal };

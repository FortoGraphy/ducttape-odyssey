// Feature unlock rules. Chapters, research and upgrades unlock features as rewards; this table is the
// safety net that unlocks structural ones from plain progression, so no save can end up holding the
// means to do something (a built refinery, refined fuel) without the screen for it. Where the story
// hands a feature out, the table only reacts to hard evidence and leaves the pacing to the chapters.
import { getItem, getStat, hasFeature, unlockFeature } from "../kernel";
import type { ContentDB, DeckId, FeatureId, Game, SystemDef } from "../types";
import { canReboot, canWarp, hasShipyard } from "./prestige";
import { safeSystem, secondEdge } from "./util";

export interface FeatureRule {
  id: FeatureId;
  /** Evidence that the player already has the thing the feature is the screen for. Always applies. */
  when: (g: Game) => boolean;
  /** Default pacing, used only when no chapter in the content hands this feature out. */
  pace?: (g: Game) => boolean;
  /** The whole rule only applies when no research node, upgrade or chapter grants this feature. */
  orphanOnly?: boolean;
}

const deck = (g: Game, id: DeckId): number => g.state.decks[id]?.level ?? 0;

function hasAny(rec: Record<string, unknown>): boolean {
  for (const key in rec) if (key !== undefined) return true;
  return false;
}

// "first arrival at a station system" asks the world for the current system; do that only when the ship moved
const lastPos = new WeakMap<Game, { key: number; station: boolean }>();

function atStation(g: Game): boolean {
  const nav = g.state.nav;
  if (g.state.station.docked) return true;
  const key = nav.g * 1e8 + nav.depth * 1e3 + nav.lane;
  let seen = lastPos.get(g);
  if (!seen) lastPos.set(g, (seen = { key: NaN, station: false }));
  if (seen.key !== key) {
    const sys = safeSystem(g);
    if (!sys) return false; // world not ready: ask again next second
    seen.key = key;
    seen.station = sys.station !== null;
  }
  return seen.station;
}

export const FEATURE_RULES: readonly FeatureRule[] = [
  { id: "crafting", when: (g) => deck(g, "refinery") >= 1 },
  { id: "grid", when: (g) => deck(g, "fabricator") >= 1 || g.state.modules.length > 0 },
  {
    id: "nav",
    // fuel in the hold was made on purpose; the tank's starting fill says nothing about progress
    when: (g) => getItem(g, "fuel").m > 0 || getItem(g, "fuel_cell").m > 0 || getStat(g, "jumps") > 0 || g.state.nav.depth > 0,
    pace: (g) => g.state.story.chapter >= 2,
  },
  { id: "drones", when: (g) => deck(g, "hangar") >= 1 },
  { id: "research", when: (g) => deck(g, "lab") >= 1 || g.state.rp.m > 0 },
  { id: "crew", when: (g) => deck(g, "quarters") >= 1 || g.state.crew.length > 0 },
  { id: "scan", when: (g) => getStat(g, "planetsScanned") > 0, pace: (g) => hasFeature(g, "nav") },
  { id: "codex", when: (g) => getStat(g, "codex") > 0, pace: (g) => hasFeature(g, "nav") },
  { id: "station", when: atStation },
  { id: "buyMax", when: (g) => getStat(g, "purchases") >= 50 },
  { id: "overdrive", when: (g) => getStat(g, "salvage") >= 10 },
  { id: "quests", when: (g) => g.state.played >= 20 * 60 },
  {
    id: "weekly",
    when: (g) => g.state.quests.weekly !== null,
    pace: (g) => hasFeature(g, "quests") && (getStat(g, "questsDaily") >= 3 || g.state.played >= 2 * 3600),
  },
  { id: "cards", when: (g) => hasAny(g.state.cards) },
  { id: "warp", when: (g) => g.state.prestige.warps > 0 || canWarp(g) },
  { id: "hull", when: (g) => g.state.prestige.rebuilds > 0 || hasShipyard(g) },
  { id: "cosmos", when: (g) => g.state.prestige.reboots > 0 || canReboot(g) },
  // The rest are rewards. If the content forgot to hand one out, plain progression does.
  { id: "autoQueue", orphanOnly: true, when: (g) => getStat(g, "crafts") >= 100 },
  { id: "repairBots", orphanOnly: true, when: (g) => getStat(g, "repairsManual") >= 10 },
  { id: "autoMaintenance", orphanOnly: true, when: (g) => getStat(g, "repairsBot") >= 100 },
  { id: "probes", orphanOnly: true, when: (g) => hasFeature(g, "drones") && getStat(g, "planetsScanned") >= 1 },
  { id: "expeditions", orphanOnly: true, when: (g) => g.state.crew.length > 0 && getStat(g, "planetsScanned") >= 3 },
  { id: "outposts", orphanOnly: true, when: (g) => getStat(g, "expeditions") >= 3 },
];

interface Grants {
  /** Granted by a research node, a prestige upgrade or a chapter. */
  any: Partial<Record<FeatureId, 1>>;
  /** Granted by a chapter: the story paces these. */
  chapter: Partial<Record<FeatureId, 1>>;
}

const grantedCache = new WeakMap<ContentDB, Grants>();

function grants(content: ContentDB): Grants {
  let out = grantedCache.get(content);
  if (!out) {
    out = { any: {}, chapter: {} };
    for (const id in content.research ?? {}) {
      const f = content.research[id].feature;
      if (f) out.any[f] = 1;
    }
    for (const id in content.upgrades ?? {}) {
      const f = content.upgrades[id].feature;
      if (f) out.any[f] = 1;
    }
    for (const c of content.chapters ?? []) {
      for (const f of c.unlocks ?? []) {
        out.any[f] = 1;
        out.chapter[f] = 1;
      }
    }
    grantedCache.set(content, out);
  }
  return out;
}

/** Features that some research node, prestige upgrade or chapter hands out. */
export function contentGrants(content: ContentDB): Partial<Record<FeatureId, 1>> {
  return grants(content).any;
}

/** Applies the rule table and re-grants chapter unlocks. Returns how many features were unlocked. */
export function checkFeatures(g: Game): number {
  const features = g.state.features;
  const granted = grants(g.content);
  let n = 0;
  for (let i = 0; i < FEATURE_RULES.length; i++) {
    const rule = FEATURE_RULES[i];
    if (features[rule.id] === 1) continue;
    if (rule.orphanOnly && granted.any[rule.id] === 1) continue;
    const hit = rule.when(g) || (rule.pace !== undefined && granted.chapter[rule.id] !== 1 && rule.pace(g));
    if (hit && unlockFeature(g, rule.id)) n++;
  }
  // a chapter that was reached keeps its unlocks, whatever happened to the save in between
  const chapter = g.state.story.chapter;
  const list = g.content.chapters ?? [];
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c.id > chapter || !c.unlocks) continue;
    for (let k = 0; k < c.unlocks.length; k++) if (features[c.unlocks[k]] !== 1 && unlockFeature(g, c.unlocks[k])) n++;
  }
  return n;
}

export const featuresSystem: SystemDef = {
  id: "meta.features",
  init(g) {
    if (!g.state.features || typeof g.state.features !== "object") g.state.features = {};
    // a loaded save is consistent before the first frame, not a second later
    checkFeatures(g);
  },
  tick(g, dt) {
    if (secondEdge(g, dt)) checkFeatures(g);
  },
};

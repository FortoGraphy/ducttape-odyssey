// Research tree: in-run upgrades bought with research points (and sometimes items).
import * as B from "../big";
import { OK, emit, fail, hasItems, markDirty, stat, takeItems, unlockFeature } from "../kernel";
import type { ActionResult, Big, FailReason, Game, ItemId, ResearchId, SystemDef } from "../types";
import { bal, lookup, pushScaled, zero } from "./util";

/** The repair bots' level is this node's level; core reads it from state.repair.botLevel. */
const BOT_NODE = "mt_bots";

export interface ResearchCost {
  rp: Big;
  items?: Record<ItemId, number>;
}

export function researchLevel(g: Game, id: ResearchId): number {
  const n = lookup(g.state.research, id);
  return n !== undefined && n > 0 ? n : 0;
}

/** Cost of the next level: rp = cost * growth^level, plus the node's flat item cost. */
export function researchCost(g: Game, id: ResearchId): ResearchCost {
  const def = lookup(g.content.research, id);
  if (!def) return { rp: zero() };
  const growth = def.costGrowth > 0 ? def.costGrowth : 1;
  const rp = B.mulN(B.powN(growth, researchLevel(g, id)), Math.max(0, def.cost));
  return def.items ? { rp, items: def.items } : { rp };
}

/** Why the next level cannot be bought right now, or null when it can. */
export function researchBlock(g: Game, id: ResearchId): FailReason | null {
  const def = lookup(g.content.research, id);
  if (!def) return "invalid";
  if (researchLevel(g, id) >= def.maxLevel) return "max";
  for (const req of def.requires) if (researchLevel(g, req) < 1) return "requirement";
  const cost = researchCost(g, id);
  if (B.cmp(g.state.rp, cost.rp) < 0) return "credits";
  if (!hasItems(g, cost.items)) return "items";
  return null;
}

/** Requirements only (prerequisites researched, not maxed): what the tree shows as "available". */
export function canResearch(g: Game, id: ResearchId): boolean {
  const reason = researchBlock(g, id);
  return reason === null || reason === "credits" || reason === "items";
}

export function buyResearch(g: Game, id: ResearchId): ActionResult {
  const reason = researchBlock(g, id);
  if (reason) return fail(reason);
  const s = g.state;
  const cost = researchCost(g, id);
  if (!takeItems(g, cost.items)) return fail("items");
  s.rp = B.subClamp(s.rp, cost.rp);
  const level = researchLevel(g, id) + 1;
  s.research[id] = level;
  stat(g, "researchLevels");
  if (level === 1) grantUnlocks(g, id);
  if (id === BOT_NODE) syncBotLevel(g);
  markDirty(g);
  emit(g, { t: "researchDone", id });
  g.api.say("research", { n: level });
  return OK;
}

function grantUnlocks(g: Game, id: ResearchId): void {
  const def = lookup(g.content.research, id);
  if (!def) return;
  if (def.recipes) for (const r of def.recipes) g.api.unlockRecipe(r);
  if (def.feature) unlockFeature(g, def.feature);
}

function syncBotLevel(g: Game): void {
  const repair = g.state.repair;
  if (!repair || !lookup(g.content.research, BOT_NODE)) return;
  const level = researchLevel(g, BOT_NODE);
  if (repair.botLevel !== level) {
    repair.botLevel = level;
    markDirty(g);
  }
}

/** Adds research points (lab output, event rewards). */
export function addResearchPoints(g: Game, amount: Big): void {
  if (amount.m <= 0) return;
  g.state.rp = B.add(g.state.rp, amount);
}

export const researchSystem: SystemDef = {
  id: "meta.research",
  init(g) {
    const s = g.state;
    s.rp = B.sanitize(s.rp);
    if (!s.research || typeof s.research !== "object") s.research = {};
    for (const id in s.research) {
      const def = lookup(g.content.research, id);
      const lvl = Math.floor(Number(s.research[id]));
      if (!(lvl > 0)) delete s.research[id];
      else s.research[id] = def ? Math.min(lvl, def.maxLevel) : lvl;
      // content may have gained recipes or a feature for a node the save already owns
      if (def && lvl > 0) grantUnlocks(g, id);
    }
    syncBotLevel(g);
  },
  modifiers(g, out) {
    const levels = g.state.research;
    for (const id in levels) {
      const def = lookup(g.content.research, id);
      if (def) pushScaled(out, def.effects, levels[id]);
    }
  },
  tick(g, dt) {
    // The lab's output is integrated by the core economy. This switch exists for builds where it is not.
    if (g.rates.research.m > 0 && bal(g, "metaAccruesRp", 0) > 0) addResearchPoints(g, B.mulN(g.rates.research, dt));
  },
  offline(g, seconds, eff, report) {
    if (g.rates.research.m > 0 && bal(g, "metaAccruesRp", 0) > 0) {
      const gain = B.mulN(g.rates.research, seconds * eff);
      addResearchPoints(g, gain);
      report.rp = B.add(report.rp, gain);
    }
  },
  prestige(g, layer) {
    const s = g.state;
    s.rp = zero();
    if (layer >= 2) {
      s.research = {};
      syncBotLevel(g);
      return;
    }
    // a warp keeps a quarter of every node, rounded down: single-level nodes are relearned each galaxy
    const keep = bal(g, "researchKeep", 0.25);
    for (const id in s.research) {
      const kept = Math.floor(s.research[id] * keep + 1e-9);
      if (kept > 0) {
        s.research[id] = kept;
        const def = lookup(g.content.research, id);
        // core has just wiped the recipe book: nodes that survived bring their recipes back
        if (def?.recipes) for (const r of def.recipes) g.api.unlockRecipe(r);
      } else delete s.research[id];
    }
    syncBotLevel(g);
  },
};

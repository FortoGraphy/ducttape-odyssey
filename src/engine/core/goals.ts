// Near-term goals: the three "what do I press next" hints (GDD pillar 1). Data only; the UI
// localises by `kind` and `params`.
import * as B from "../big";
import { getStat, hasFeature } from "../kernel";
import { DECK_IDS, type Big, type DeckId, type Game, type ItemId, type RecipeId } from "../types";
import { nextCost, nextMilestone, unlockCost } from "./decks";
import { secondsUntil } from "./economy";
import { bal, cc, STATIONS } from "./shared";

interface GoalBase {
  /** Stable key, e.g. "deckLevel:mining". */
  id: string;
  /** 0..1 toward `target`. */
  progress: number;
  /** The number the goal counts to (level, depth, 100 % integrity, 1 for one-off goals). */
  target: number;
}

export type NearGoal =
  | (GoalBase & { kind: "deckLevel"; params: { deck: DeckId; level: number; cost: Big; seconds: number } })
  | (GoalBase & { kind: "deckUnlock"; params: { deck: DeckId; cost: Big; seconds: number; needsItems: boolean } })
  | (GoalBase & { kind: "milestone"; params: { deck: DeckId; level: number; left: number } })
  | (GoalBase & { kind: "craft"; params: { recipe: RecipeId; item: ItemId } })
  | (GoalBase & { kind: "repair"; params: { uid: number; item: ItemId | null; hp: number } })
  | (GoalBase & { kind: "depth"; params: { depth: number; fuel: number; fuelNeeded: number } });

export type NearGoalKind = NearGoal["kind"];

function deckLevelGoal(g: Game, id: DeckId): NearGoal {
  const cost = nextCost(g, id);
  const level = g.state.decks[id].level + 1;
  return {
    id: `deckLevel:${id}`,
    kind: "deckLevel",
    progress: B.ratio(g.state.credits, cost),
    target: level,
    params: { deck: id, level, cost, seconds: secondsUntil(g, cost) },
  };
}

function compute(g: Game): NearGoal[] {
  const s = g.state;
  const out: NearGoal[] = [];
  const used: Partial<Record<DeckId, 1>> = {};

  // 1. something is broken: fix it first
  const urgent = bal(g, "degradeAt", 50);
  let worstUid = -1;
  let worstHp = urgent;
  let worstItem: ItemId | null = null;
  for (const inst of s.modules) {
    if (inst.slot >= 0 && inst.hp < worstHp) {
      worstHp = inst.hp;
      worstUid = inst.uid;
      worstItem = inst.item;
    }
  }
  if (worstUid < 0 && s.hull.hp < urgent) {
    worstUid = 0;
    worstHp = s.hull.hp;
  }
  if (worstUid >= 0) {
    out.push({ id: `repair:${worstUid}`, kind: "repair", progress: worstHp / 100, target: 100, params: { uid: worstUid, item: worstItem, hp: worstHp } });
  }

  // 2. the cheapest next deck level
  const built: DeckId[] = [];
  for (const id of DECK_IDS) if (s.decks[id].level > 0 && g.content.decks[id]) built.push(id);
  built.sort((a, b) => B.cmp(nextCost(g, a), nextCost(g, b)));
  if (built.length > 0) {
    out.push(deckLevelGoal(g, built[0]));
    used[built[0]] = 1;
  }

  // 3. the cheapest deck that can be built next
  let unlock: DeckId | null = null;
  for (const id of DECK_IDS) {
    const def = g.content.decks[id];
    if (!def || s.decks[id].level > 0) continue;
    const u = def.unlock;
    if (u.chapter !== undefined && s.story.chapter < u.chapter) continue;
    if (u.deck && s.decks[u.deck.id].level < u.deck.level) continue;
    if (unlock === null || def.unlock.credits < g.content.decks[unlock].unlock.credits) unlock = id;
  }
  if (unlock) {
    const cost = unlockCost(g, unlock);
    const items = g.content.decks[unlock].unlock.items;
    out.push({
      id: `deckUnlock:${unlock}`,
      kind: "deckUnlock",
      progress: B.ratio(s.credits, cost),
      target: 1,
      params: { deck: unlock, cost, seconds: secondsUntil(g, cost), needsItems: !!items && Object.keys(items).length > 0 },
    });
  }

  // 4. a recipe the player knows but never made
  if (out.length < 3) {
    const c = cc(g);
    let pick: RecipeId | null = null;
    let pickTier = 99;
    for (const st of STATIONS) {
      if (s.decks[st].level <= 0) continue;
      for (const id in s.recipes) {
        const info = c.recipes.get(id);
        if (!info || info.def.station !== st || info.def.tier >= pickTier) continue;
        if (getStat(g, `made_${id}`) > 0) continue;
        pick = id;
        pickTier = info.def.tier;
      }
    }
    if (pick) {
      const info = c.recipes.get(pick)!;
      let progress = 1;
      for (const input of info.inputs) progress = Math.min(progress, B.ratio(s.inv[input.item] ?? B.ZERO, input.big));
      out.push({ id: `craft:${pick}`, kind: "craft", progress, target: 1, params: { recipe: pick, item: info.primary } });
    }
  }

  // 5. the closest output doubling
  if (out.length < 3) {
    let best: DeckId | null = null;
    let bestLeft = Infinity;
    for (const id of built) {
      const ms = nextMilestone(g, id);
      if (ms && ms.left < bestLeft) {
        best = id;
        bestLeft = ms.left;
      }
    }
    if (best) {
      const ms = nextMilestone(g, best)!;
      const span = Math.max(1, ms.level - ms.prev);
      out.push({
        id: `milestone:${best}`,
        kind: "milestone",
        progress: Math.min(1, Math.max(0, (s.decks[best].level - ms.prev) / span)),
        target: ms.level,
        params: { deck: best, level: ms.level, left: ms.left },
      });
    }
  }

  // 6. fly deeper
  if (out.length < 3 && hasFeature(g, "nav")) {
    const need = bal(g, "fuelPerJump", 6) * g.mods.fuelUse;
    out.push({
      id: "depth",
      kind: "depth",
      progress: need > 0 ? Math.min(1, Math.max(0, s.nav.fuel / need)) : 1,
      target: s.nav.maxDepth + 1,
      params: { depth: s.nav.maxDepth + 1, fuel: s.nav.fuel, fuelNeeded: need },
    });
  }

  // always three: more deck levels, cheapest first
  for (let i = 0; i < built.length && out.length < 3; i++) {
    if (used[built[i]]) continue;
    used[built[i]] = 1;
    out.push(deckLevelGoal(g, built[i]));
  }
  // a state with fewer than two built decks cannot happen in a real game; pad so callers can rely on three
  while (out.length < 3) out.push(deckLevelGoal(g, "mining"));
  out.length = 3;
  return out;
}

/**
 * Exactly three near-term goals, most pressing first. The result is cached for half a second of game
 * time, so a UI selector polling it every pulse gets a stable reference.
 */
export function nearGoals(g: Game): NearGoal[] {
  const c = cc(g);
  const key = Math.floor(g.state.t * 2) + g.rev * 1e7;
  if (c.goals && c.goalsKey === key && !g.dirty) return c.goals as NearGoal[];
  const goals = compute(g);
  c.goals = goals;
  c.goalsKey = key;
  return goals;
}

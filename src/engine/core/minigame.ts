// Mini-game plumbing: request, resolve, auto-resolve. The games themselves live in src/minigames.
import * as B from "../big";
import { OK, emit, fail, nextUid, setFlag, stat } from "../kernel";
import type { ActionResult, Big, Game, ItemId, MinigameId, MinigameResult, MinigameTier, PendingMinigame } from "../types";
import { hasUnits, takeUnits } from "./economy";
import { botLevel, botsBusyUntil } from "./repair";
import { bal, clamp } from "./shared";

function dispatch(g: Game, pending: PendingMinigame, result: MinigameResult): void {
  const handler = g.minigameHandlers[pending.purpose];
  if (handler) handler(g, pending, result);
}

/**
 * Asks the UI to play a mini-game. Returns the request token, or 0 when another game is pending.
 * During the offline pass nobody can play: the request resolves at once with score 0.5.
 */
export function requestMinigame(g: Game, game: MinigameId, tier: MinigameTier, purpose: PendingMinigame["purpose"], ref: number): number {
  const s = g.state;
  const t: MinigameTier = tier === 2 || tier === 3 ? tier : 1;
  if (g.offline) {
    const pending: PendingMinigame = { token: nextUid(g), game, tier: t, purpose, ref };
    dispatch(g, pending, { score: 0.5, success: true, perfect: false, durationMs: 0, auto: true });
    return pending.token;
  }
  if (s.minigame) return 0;
  s.minigame = { token: nextUid(g), game, tier: t, purpose, ref };
  emit(g, { t: "minigameRequest", token: s.minigame.token });
  return s.minigame.token;
}

/** Reports the result of the pending mini-game and runs the handler registered for its purpose. */
export function resolveMinigame(g: Game, result: MinigameResult): ActionResult {
  const s = g.state;
  const pending = s.minigame;
  if (!pending) return fail("noTarget");
  s.minigame = null;
  const score = clamp(typeof result?.score === "number" && Number.isFinite(result.score) ? result.score : 0, 0, 1);
  const clean: MinigameResult = {
    score,
    success: score >= 0.5,
    perfect: score >= 0.95,
    durationMs: Number.isFinite(result?.durationMs) ? Math.max(0, result.durationMs) : 0,
    auto: !!result?.auto,
  };
  if (!clean.auto) {
    stat(g, "minigames");
    stat(g, `minigame_${pending.game}`);
    if (clean.perfect) stat(g, "minigamesPerfect");
  }
  dispatch(g, pending, clean);
  if (!clean.auto) g.api.say(clean.success ? "minigameWin" : "minigameLose");
  return OK;
}

export interface AutoResolveCost {
  kind: "bots" | "item" | "free";
  /** Consumable that would be spent (kind "item"). */
  item?: ItemId;
  /** Seconds the repair bots would be away (kind "bots"). */
  seconds?: number;
  score: number;
}

/** What skipping the pending mini-game would cost right now. It is always possible. */
export function autoResolveCost(g: Game): AutoResolveCost {
  const s = g.state;
  const paid = bal(g, "autoResolveScore", 0.5);
  const tier = s.minigame ? s.minigame.tier : 1;
  if (botLevel(g) > 0 && s.t >= botsBusyUntil(g)) return { kind: "bots", seconds: bal(g, "autoResolveBotSecs", 120) * tier, score: paid };
  const items = g.content.items;
  let best: ItemId | undefined;
  let bestValue = Infinity;
  for (const id in s.inv) {
    const def = items[id];
    if (!def || def.consumable?.kind !== "repair" || !hasUnits(g, id, B.ONE)) continue;
    if (def.value < bestValue) {
      best = id;
      bestValue = def.value;
    }
  }
  if (best) return { kind: "item", item: best, score: paid };
  return { kind: "free", score: bal(g, "autoResolveFreeScore", 0.35) };
}

/**
 * Skips the pending mini-game: bot time if bots are free, else the cheapest repair consumable, else
 * nothing at a lower score. Nobody is ever stuck behind a mini-game they cannot or do not want to play.
 */
export function autoResolveMinigame(g: Game): ActionResult {
  const s = g.state;
  if (!s.minigame) return fail("noTarget");
  const cost = autoResolveCost(g);
  if (cost.kind === "bots") setFlag(g, "botsBusyUntil", s.t + (cost.seconds ?? 0));
  else if (cost.kind === "item" && cost.item) takeUnits(g, cost.item, 1);
  return resolveMinigame(g, { score: cost.score, success: cost.score >= 0.5, perfect: false, durationMs: 0, auto: true });
}

/** Units a "scaled" item reward is multiplied by: about 10 s of mining, never below 1. */
export function miningScale(g: Game): Big {
  const v = B.mulN(g.rates.mine, bal(g, "miningScaleSecs", 10));
  return B.cmp(v, B.ONE) < 0 ? { m: 1, e: 0 } : v;
}

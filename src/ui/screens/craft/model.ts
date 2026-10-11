// Read-only helpers shared by the craft and grid screens: recipe lookups, unlock hints, effect
// formatting and the numbers the rows print. Nothing here mutates the game.
import * as B from "@/engine/big";
import { content } from "@/content";
import { craftSeconds } from "@/engine/core";
import type { Big, CraftStationId, DeckId, Effect, FeatureId, Game, ItemId, L10n, RecipeDef, RecipeId, ResearchDef, StatKey } from "@/engine/types";

export const STATIONS: readonly CraftStationId[] = ["refinery", "fabricator", "workshop"];

export function primaryOf(def: RecipeDef): ItemId {
  for (const item in def.outputs) return item;
  return def.id;
}

interface Index {
  byOutput: Record<ItemId, RecipeId[]>;
  usedIn: Record<ItemId, RecipeId[]>;
  researchByRecipe: Record<RecipeId, ResearchDef>;
  researchByFeature: Partial<Record<FeatureId, ResearchDef>>;
}

let index: Index | null = null;

function idx(): Index {
  if (index) return index;
  const out: Index = { byOutput: {}, usedIn: {}, researchByRecipe: {}, researchByFeature: {} };
  for (const id in content.recipes) {
    const def = content.recipes[id];
    const primary = primaryOf(def);
    (out.byOutput[primary] ??= []).push(id);
    for (const item in def.inputs) (out.usedIn[item] ??= []).push(id);
  }
  // the recipe named after the item is the primary one
  for (const item in out.byOutput) out.byOutput[item].sort((a, b) => (a === item ? -1 : b === item ? 1 : 0));
  for (const id in content.research) {
    const node = content.research[id];
    for (const r of node.recipes ?? []) out.researchByRecipe[r] = node;
    if (node.feature && !out.researchByFeature[node.feature]) out.researchByFeature[node.feature] = node;
  }
  index = out;
  return out;
}

export const recipesFor = (item: ItemId): readonly RecipeId[] => idx().byOutput[item] ?? [];
export const recipesUsing = (item: ItemId): readonly RecipeId[] => idx().usedIn[item] ?? [];
export const researchForFeature = (feature: FeatureId): ResearchDef | undefined => idx().researchByFeature[feature];

/** The recipe to show for an item: a known one if there is any, the primary one otherwise. */
export function bestRecipeFor(g: Game, item: ItemId): RecipeId | undefined {
  const list = recipesFor(item);
  for (const id of list) if (g.state.recipes[id] === 1) return id;
  return list[0];
}

export type UnlockHint =
  | { kind: "research"; name: L10n }
  | { kind: "blueprint" }
  | { kind: "chapter"; n: number }
  | { kind: "deck"; deck: DeckId; level: number }
  | { kind: "start" };

export function unlockHint(def: RecipeDef): UnlockHint {
  const u = def.unlock;
  if (u.research) {
    const node = content.research[u.research] ?? idx().researchByRecipe[def.id];
    if (node) return { kind: "research", name: node.name };
  }
  const node = idx().researchByRecipe[def.id];
  if (node) return { kind: "research", name: node.name };
  if (u.deck) return { kind: "deck", deck: u.deck.id, level: u.deck.level };
  if (u.chapter !== undefined) return { kind: "chapter", n: u.chapter };
  if (u.blueprint) return { kind: "blueprint" };
  return { kind: "start" };
}

/** Sort key for locked recipes: the closest unlock first. */
export function unlockOrder(def: RecipeDef): number {
  const u = def.unlock;
  if (u.deck) return u.deck.level;
  if (u.research) return 1000 + (content.research[u.research]?.cost ?? 0) / 1e3;
  if (u.chapter !== undefined) return 1e9 + u.chapter;
  return 2e9;
}

export const haveOf = (g: Game, item: ItemId): Big => g.state.inv[item] ?? B.ZERO;

/** Units one full batch makes at the station (modules are always one). */
export function stationBatch(g: Game, def: RecipeDef): Big {
  return content.items[primaryOf(def)]?.module ? B.ONE : g.rates.craftBatch[def.station];
}

/** 0 = not even one unit, 1 = a partial batch, 2 = a full batch (times `batches`). */
export function inputLevel(g: Game, def: RecipeDef, item: ItemId, batches = 1): 0 | 1 | 2 {
  const have = haveOf(g, item);
  const n = def.inputs[item];
  if (B.cmp(B.mulN(have, 1 + 1e-9), B.big(n)) < 0) return 0;
  return B.cmp(B.mulN(have, 1 + 1e-9), B.mulN(stationBatch(g, def), n * batches)) >= 0 ? 2 : 1;
}

/** Full batches the hold can pay for right now (at least 1 so the control always has a value). */
export function maxBatches(g: Game, def: RecipeDef): number {
  const batch = stationBatch(g, def);
  let best = Infinity;
  for (const item in def.inputs) {
    const can = B.toNumber(B.floor(B.div(haveOf(g, item), B.mulN(batch, def.inputs[item]))));
    if (can < best) best = can;
  }
  return Math.max(1, Math.min(9999, Number.isFinite(best) ? best : 1));
}

/** Units of the primary product per minute at a full batch and the current speed. */
export function perMinute(g: Game, def: RecipeDef): Big {
  const secs = craftSeconds(g, def.id);
  if (!(secs > 0) || !Number.isFinite(secs)) return { m: 0, e: 0 };
  return B.mulN(stationBatch(g, def), ((def.outputs[primaryOf(def)] ?? 1) * 60) / secs);
}

/** Base value of the outputs over the base value of the inputs, minus one. */
export function valueAdded(def: RecipeDef): number {
  let inV = 0;
  let outV = 0;
  for (const item in def.inputs) inV += (content.items[item]?.value ?? 0) * def.inputs[item];
  for (const item in def.outputs) outV += (content.items[item]?.value ?? 0) * def.outputs[item];
  for (const b of def.byproducts ?? []) outV += (content.items[b.item]?.value ?? 0) * b.amount * b.chance;
  return inV > 0 ? outV / inV - 1 : 0;
}

/** First input the hold cannot cover for a single unit. */
export function missingInput(g: Game, def: RecipeDef): ItemId | null {
  for (const item in def.inputs) if (inputLevel(g, def, item) === 0) return item;
  return null;
}

const QUALITY_WEIGHTS = [15, 50, 25, 8, 2];

/** Same weights core's rollQuality uses (base chance tilted by qualityLuck), normalized to 1. */
export function qualityOdds(g: Game): number[] {
  const raw = content.balance.qualityChance;
  const base = Array.isArray(raw) && raw.length >= 5 ? (raw as number[]) : QUALITY_WEIGHTS;
  const luck = Math.max(0.05, g.mods.qualityLuck);
  const w = base.slice(0, 5).map((b, q) => b * Math.pow(luck, q - 1));
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  return w.map((x) => x / sum);
}

/** Share of the mining mix an item has in the current system (0 = not mined here). */
export function mixShare(g: Game, item: ItemId): number {
  for (const m of g.rates.mix) if (m.item === item) return m.share;
  return 0;
}

export function speedOf(g: Game): number {
  for (const id in content.recipes) {
    const secs = craftSeconds(g, id);
    return secs > 0 && Number.isFinite(secs) ? content.recipes[id].time / secs : 0;
  }
  return 1;
}

// ---------- effects ---------------------------------------------------------------------------

/** Stats where a smaller multiplier is the good direction. */
export const LOWER_BETTER: Partial<Record<StatKey, true>> = {
  powerUse: true,
  wearRate: true,
  shield: true,
  fuelUse: true,
  jumpCooldown: true,
  heatRate: true,
  coffeeUse: true,
  towSpeed: true,
  deckCost: true,
};

/** Change an effect makes as a fraction (0.25 = +25 %), scaled by a module factor. */
export function effectDelta(e: Effect, factor = 1): number {
  if (e.mul !== undefined) return Math.pow(Math.max(0, e.mul), factor) - 1;
  return (e.add ?? 0) * factor;
}

export const effectInvert = (e: Effect): boolean => !!e.stat && LOWER_BETTER[e.stat] === true;

/** Spreadsheet-style cell name: column letter, row number ("B2"). */
export function cellName(cell: number, w: number): string {
  return `${String.fromCharCode(65 + (cell % w))}${Math.floor(cell / w) + 1}`;
}

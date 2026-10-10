// Core-private runtime cache and small helpers shared by the core files. Nothing here is saved:
// Game.state stays the only persisted data, this is rebuilt from it on load.
import * as B from "../big";
import type {
  Big,
  CraftStationId,
  DeckId,
  Effect,
  Game,
  ItemDef,
  ItemId,
  OfflineReport,
  RecipeDef,
  RecipeId,
} from "../types";

export const STATIONS: readonly CraftStationId[] = ["refinery", "fabricator", "workshop"];

/** Balance constant with a code default, so content that lacks a key never crashes the engine. */
export function bal(g: Game, key: string, def: number): number {
  const v = g.content.balance ? g.content.balance[key] : undefined;
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

export function balArr(g: Game, key: string, def: readonly number[]): readonly number[] {
  const v = g.content.balance ? g.content.balance[key] : undefined;
  return Array.isArray(v) && v.length > 0 ? (v as number[]) : def;
}

/** One stream of units into the hold: a share of the lift (mining mix) or a constant rate (greenhouse). */
export interface Flow {
  item: ItemId;
  /** Fraction of lifted units (mix flows). */
  share: number;
  /** Units per second (constant flows). */
  rate: Big;
  /** Credits per auto-sold unit. */
  price: Big;
  /** Units kept before auto-sell. */
  reserve: Big;
  /** Keep fraction >= 1: never auto-sold while there is room. */
  never: boolean;
  mass: number;
}

export interface RecipeInfo {
  def: RecipeDef;
  inputs: { item: ItemId; n: number; big: Big; mass: number }[];
  outputs: { item: ItemId; n: number; mass: number; module: boolean }[];
  primary: ItemId;
  isModule: boolean;
}

export interface CoreCache {
  /** Game.rev the rates were computed for. */
  rev: number;
  /** Rates need a recompute although mods did not change (keep fractions, drones, location). */
  dirty: boolean;
  sysId: string;
  /** Galaxy position the rates were computed for. */
  navKey: number;
  flows: Flow[];
  constFlows: Flow[];
  hopperCap: Big;
  /** brokerFee * sellValue * creditGain * richness. */
  priceMul: Big;
  /** Fraction of incoming units stored while an item is below its reserve. */
  fill: number;
  /** Analytic credits per second with full reserves. */
  expected: Big;
  seeded: boolean;
  incomeAcc: Big;
  /** Seconds since the last once-per-second housekeeping pass. */
  secTimer: number;
  secCount: number;
  tickCount: number;
  sweepDue: boolean;
  cargoFull: boolean;
  craftSpeed: number;
  /** Hold-to-mine multiplier for this tick. */
  mineMult: number;
  /** Wear activity factor: 1 idle, 1.5 holding, 2 overdrive. */
  activity: number;
  wearAcc: number;
  overdriveOn: boolean;
  salvagerAcc: number;
  /** Module integrity used by the last modifier rebuild, by uid. */
  modHp: Map<number, number>;
  /** Deck multipliers used by the last modifier rebuild for deck-inherent effects. */
  usedDeckMult: Partial<Record<DeckId, number>>;
  effectPool: Effect[];
  effectUsed: number;
  moduleSupply: number;
  moduleDraw: number;
  /** Megastructures owned at the last check, as a joined id list. */
  megaKey: string;
  recipes: Map<RecipeId, RecipeInfo>;
  /** Recipes that unlock by deck level or chapter and are checked once per second. */
  gatedRecipes: RecipeDef[];
  blueprintRecipes: RecipeDef[];
  fallbackRaw: ItemId | null;
  /** Report of the offline pass in progress, so api calls made by other areas can flag safe mode. */
  report: OfflineReport | null;
  goals: unknown;
  goalsKey: number;
}

const caches = new WeakMap<Game, CoreCache>();

function blank(): CoreCache {
  return {
    rev: -1,
    dirty: true,
    sysId: "",
    navKey: -1,
    flows: [],
    constFlows: [],
    hopperCap: { m: 0, e: 0 },
    priceMul: { m: 1, e: 0 },
    fill: 0.5,
    expected: { m: 0, e: 0 },
    seeded: false,
    incomeAcc: { m: 0, e: 0 },
    secTimer: 0,
    secCount: 0,
    tickCount: 0,
    sweepDue: true,
    cargoFull: false,
    craftSpeed: 1,
    mineMult: 1,
    activity: 1,
    wearAcc: 0,
    overdriveOn: false,
    salvagerAcc: 0,
    modHp: new Map(),
    usedDeckMult: {},
    effectPool: [],
    effectUsed: 0,
    moduleSupply: 0,
    moduleDraw: 0,
    megaKey: "",
    recipes: new Map(),
    gatedRecipes: [],
    blueprintRecipes: [],
    fallbackRaw: null,
    report: null,
    goals: null,
    goalsKey: -1,
  };
}

/** The core cache of a game, created on first use. */
export function cc(g: Game): CoreCache {
  let c = caches.get(g);
  if (!c) {
    c = blank();
    caches.set(g, c);
  }
  return c;
}

export function resetCache(g: Game): CoreCache {
  const c = blank();
  caches.set(g, c);
  return c;
}

/** Cargo units per item. Modules, megastructures, artifacts and specials take no room. */
export function massOf(def: ItemDef | undefined): number {
  if (!def) return 0;
  if (typeof def.mass === "number" && Number.isFinite(def.mass)) return Math.max(0, def.mass);
  const c = def.category;
  return c === "module" || c === "mega" || c === "artifact" || c === "special" ? 0 : 1;
}

/** Default keep fraction by category; 1 means "never auto-sell". */
export function keepDefault(g: Game, def: ItemDef): number {
  switch (def.category) {
    case "raw":
      return bal(g, "keepRaw", 0.05);
    case "refined":
      return bal(g, "keepRefined", 0.1);
    case "component":
      return bal(g, "keepComponent", 0.2);
    case "consumable":
      return bal(g, "keepConsumable", 0.05);
    default:
      return 1;
  }
}

/** Fraction of cargo capacity reserved for an item before the broker sells the rest. */
export function keepOf(g: Game, id: ItemId): number {
  const def = g.content.items[id];
  if (!def) return 1;
  const k = g.state.keep[id];
  if (typeof k === "number" && Number.isFinite(k)) return k < 0 ? 0 : k > 1 ? 1 : k;
  return keepDefault(g, def);
}

/** Adds overdrive combo (0..100). */
export function addCombo(g: Game, n: number): void {
  const a = g.state.active;
  if (a.overdriveUntil > g.state.t) return;
  const max = bal(g, "comboMax", 100);
  const v = a.combo + n * g.mods.overdriveGain;
  a.combo = v > max ? max : v < 0 ? 0 : v;
}

/** True when the active failure state shuts this deck down. */
export function deckBlocked(g: Game, id: DeckId): boolean {
  const f = g.state.failure;
  if (!f) return false;
  const def = g.content.failures ? g.content.failures[f.kind] : undefined;
  return !!def && Array.isArray(def.blocksDecks) && def.blocksDecks.indexOf(id) >= 0;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function num(v: unknown, def: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

export const big0 = (): Big => ({ m: 0, e: 0 });
export { B };

// Core engine area: the economy of the ship. One system keeps the tick order explicit:
// rates -> active play -> mining/lift/broker -> crafting -> wear, then once-per-second housekeeping.
import * as B from "../big";
import { rebuildMods } from "../kernel";
import type { Effect, Game, SystemDef } from "../types";
import { activeSecond, tickActive } from "./active";
import { autoQueueSecond, grantBlueprint, initCrafting, tickCrafting, unlockGated, unlockRecipe } from "./crafting";
import { deckModifiers, deckMultStale } from "./decks";
import { clampDrones, economySecond, recomputeRates, tickEconomy } from "./economy";
import { addModule, ensureGrid, gridModifiers } from "./grid";
import { megaCheck, megaModifiers } from "./mega";
import { miningScale, requestMinigame } from "./minigame";
import { coreOffline } from "./offline";
import { corePrestige } from "./prestige";
import { onRepairMinigame, repairSecond } from "./repair";
import { cc, resetCache, type CoreCache } from "./shared";
import { damageHull, damageModules, repairAll, tickWear, wearSecond } from "./wear";

function navKey(g: Game): number {
  const n = g.state.nav;
  return (n.g * 1000 + n.depth) * 100 + n.lane;
}

function refresh(g: Game, c: CoreCache): void {
  const key = navKey(g);
  if (c.rev !== g.rev) {
    // deck-inherent effects were folded with last rebuild's deck multipliers: one more pass if they moved
    if (deckMultStale(g, c)) g.dirty = true;
    clampDrones(g);
  } else if (!c.dirty && c.navKey === key) return;
  c.navKey = key;
  recomputeRates(g, c);
}

/**
 * Brings modifiers and Game.rates up to date right now. The tick does this by itself; call it when
 * something must read fresh rates between ticks (tools, tests, a screen opened while paused).
 */
export function syncRates(g: Game): void {
  if (g.dirty) rebuildMods(g);
  const c = cc(g);
  refresh(g, c);
  if (g.dirty) {
    rebuildMods(g);
    refresh(g, c);
  }
}

const core: SystemDef = {
  id: "core",

  init(g: Game): void {
    const c = resetCache(g);
    const s = g.state;
    // the hopper is updated in place every tick, so it must be an object nobody else holds
    s.hopper = B.sanitize(s.hopper);
    const items = g.content.items ?? {};
    c.fallbackRaw = items.scrap ? "scrap" : null;
    if (!c.fallbackRaw) {
      for (const id in items) {
        if (items[id].category === "raw") {
          c.fallbackRaw = id;
          break;
        }
      }
    }
    initCrafting(g, c);
    ensureGrid(g);
    c.overdriveOn = s.active.overdriveUntil > s.t;
    megaCheck(g, c);

    g.api.damageModules = (pct, count, family) => damageModules(g, pct, count, family);
    g.api.damageHull = (pct) => damageHull(g, pct);
    g.api.repairAll = (pct) => repairAll(g, pct);
    g.api.addModule = (item, q) => addModule(g, item, q);
    g.api.unlockRecipe = (id) => unlockRecipe(g, id);
    g.api.grantBlueprint = () => grantBlueprint(g);
    g.api.requestMinigame = (game, tier, purpose, ref) => requestMinigame(g, game, tier, purpose, ref);
    g.api.miningScale = () => miningScale(g);
    g.minigameHandlers.repair = onRepairMinigame;
    if (!g.minigameHandlers.practice) g.minigameHandlers.practice = () => {};
  },

  modifiers(g: Game, out: Effect[]): void {
    const c = cc(g);
    c.effectUsed = 0;
    deckModifiers(g, c, out);
    gridModifiers(g, c, out);
    megaModifiers(g, out);
  },

  tick(g: Game, dt: number): void {
    const c = cc(g);
    c.report = null;
    c.tickCount++;
    refresh(g, c);
    tickActive(g, c, dt);
    tickEconomy(g, c, dt);
    tickCrafting(g, c, dt);
    tickWear(g, c, dt);
    c.secTimer += dt;
    if (c.secTimer >= 1) {
      const elapsed = c.secTimer;
      c.secTimer = 0;
      c.secCount++;
      wearSecond(g, c);
      repairSecond(g, c, elapsed);
      activeSecond(g);
      unlockGated(g, c);
      megaCheck(g, c);
      if ((c.secCount & 1) === 1) autoQueueSecond(g, c);
      economySecond(g, c, elapsed);
    }
  },

  offline: coreOffline,
  prestige: corePrestige,
};

export const coreSystems: SystemDef[] = [core];

export * from "./format";
export {
  DEFAULT_MILESTONES,
  buyDeck,
  buyPreview,
  canUnlockDeck,
  crewCapacity,
  deckCost,
  deckOutput,
  droneCapacity,
  levelMult,
  maxAffordable,
  milestoneCount,
  nextCost,
  nextMilestone,
  reactorSupply,
  setBuyMode,
  totalDeckLevels,
  unlockCost,
  unlockDeck,
  type BuyPreview,
} from "./decks";
export { cargoFree, recomputeRates, reserveOf, secondsUntil, sellItem, sellPrice, setDrones, setKeep, type DroneRole } from "./economy";
export {
  batchUnits,
  canCraft,
  cancelCraft,
  craftSeconds,
  craftableRecipes,
  grantBlueprint,
  moveCraft,
  queueCraft,
  recipeInputs,
  rollQuality,
  toggleAutoRecipe,
  unlockRecipe,
} from "./crafting";
export {
  GRID_MAX,
  addModule,
  adjacentSame,
  findModule,
  foldMods,
  installModule,
  integrityFactor,
  moduleBonus,
  moduleSpec,
  previewInstall,
  removeModule,
  scrapModule,
  scrapValue,
  upgradeCost,
  upgradeModule,
  type FoldedMods,
  type InstallPreview,
} from "./grid";
export { damageHull, damageModules, repairAll, wearPerSecond } from "./wear";
export {
  bestRepairItem,
  botLevel,
  botRate,
  botsBusyUntil,
  clearGlitch,
  repairGame,
  repairWithItem,
  setAutoMaintenance,
  setRepairPriority,
  startManualRepair,
} from "./repair";
export { collectSalvage, pulseScan, setMining, spawnSalvage, triggerOverdrive } from "./active";
export { autoResolveCost, autoResolveMinigame, miningScale, requestMinigame, resolveMinigame, type AutoResolveCost } from "./minigame";
export { nearGoals, type NearGoal, type NearGoalKind } from "./goals";
export { MAX_SEGMENTS, coreOffline } from "./offline";
export { corePrestige, corePrestige as prestige } from "./prestige";
export {
  EXPORT_PREFIX,
  deserialize,
  exportCode,
  importCode,
  migrate,
  migrations,
  sanitizeState,
  serialize,
  type LoadResult,
  type SaveError,
} from "./save";
export { keepDefault, keepOf, massOf } from "./shared";

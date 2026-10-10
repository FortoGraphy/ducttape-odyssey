// Three prestige layers: Warp (stamps), Rebuild (rivets, hull classes), Reboot (sparks, constants).
// Each layer resets everything below it and never touches the currencies of the layers above.
import * as B from "../big";
import { OK, fail, getFlag, getItem, markDirty, mod, rebuildMods, runPrestige, stat, unlockFeature } from "../kernel";
import type { ActionResult, Big, FailReason, Game, HullClassId, MutatorId, RecipeId, SystemDef, UpgradeId } from "../types";
import { bal, clamp, fmtBig, getFlagBig, lookup, pushScaled, safeSystem, setFlagBig, whole, zero } from "./util";

const RIVETS_TOTAL = "rivetsTotal";
const GRID_MAX = 6;
// Megastructures act through their item ids; a flag with the same meaning is accepted as well, so an
// event or a debug tool can open a layer without the item.
const GATE_ITEM = "wormhole_gate";
const SHIPYARD_ITEM = "shipyard";
const FRAME_PREFIX = "hull_frame_";

// ---------- currencies ----------------------------------------------------------------

/** Stamps from any source (warp, achievements, backlog tickets). They also count toward rivets. */
export function grantStamps(g: Game, amount: Big | number): void {
  const n = typeof amount === "number" ? B.big(amount) : amount;
  if (n.m <= 0) return;
  const p = g.state.prestige;
  p.stamps = whole(B.add(p.stamps, n));
  p.stampsTotal = whole(B.add(p.stampsTotal, n));
}

export function rivetsTotal(g: Game): Big {
  return getFlagBig(g, RIVETS_TOTAL);
}

function wallet(g: Game, layer: 1 | 2 | 3): Big {
  const p = g.state.prestige;
  return layer === 1 ? p.stamps : layer === 2 ? p.rivets : p.sparks;
}

function setWallet(g: Game, layer: 1 | 2 | 3, v: Big): void {
  const p = g.state.prestige;
  if (layer === 1) p.stamps = whole(v);
  else if (layer === 2) p.rivets = whole(v);
  else p.sparks = whole(v);
}

// ---------- mutators ------------------------------------------------------------------

/** Combined stamp multiplier of a mutator set. */
export function mutatorReward(g: Game, ids: readonly MutatorId[]): number {
  let mult = 1;
  for (const id of ids) {
    const def = lookup(g.content.mutators, id);
    if (def && Number.isFinite(def.reward) && def.reward > 0) mult *= def.reward;
  }
  return mult;
}

export function validMutators(g: Game, ids: readonly MutatorId[] | undefined): boolean {
  if (ids === undefined) return true;
  if (!Array.isArray(ids) || ids.length > bal(g, "mutatorSlots", 2)) return false;
  for (let i = 0; i < ids.length; i++) {
    if (!lookup(g.content.mutators, ids[i]) || ids.indexOf(ids[i]) !== i) return false;
  }
  return true;
}

// ---------- layer 1: warp -------------------------------------------------------------

/**
 * Stamps a warp would pay now: floor(10^((log10(lifetime) - base) * exp)), then the stampGain
 * modifier and the reward of the mutators that were active in this galaxy.
 */
export function stampsOnWarp(g: Game): Big {
  const l = B.log10(g.state.lifetime);
  const base = bal(g, "warpStampBase", 9);
  if (!(l >= base)) return zero();
  const raw = B.floor(B.fromLog10((l - base) * bal(g, "warpStampExp", 0.45)));
  return B.floor(B.mulN(raw, mod(g, "stampGain") * mutatorReward(g, g.state.prestige.mutators)));
}

/** At the galactic core, or anywhere once a wormhole gate stands in this galaxy. */
export function canWarp(g: Game): boolean {
  if (getFlag(g, "gate_built") > 0 || getItem(g, GATE_ITEM).m > 0) return true;
  return safeSystem(g)?.isCore === true;
}

/** Jumps to the next galaxy with the chosen mutators (0 to 2) and pays out stamps. */
export function warp(g: Game, mutators: MutatorId[] = []): ActionResult {
  if (!canWarp(g)) return fail("requirement");
  if (!validMutators(g, mutators)) return fail("invalid");
  const s = g.state;
  const p = s.prestige;
  const gained = stampsOnWarp(g);
  grantStamps(g, gained);
  p.warps++;
  stat(g, "warps");
  p.mutators = mutators.slice();
  const cls = s.hull.cls;
  runPrestige(g, 1);
  settleHull(g, cls, false);
  unlockFeature(g, "warp");
  g.api.say("prestige", { n: fmtBig(gained) });
  return OK;
}

// ---------- layer 2: rebuild ----------------------------------------------------------

/** Rivets a rebuild would pay now, from the stamps earned since the last rebuild. */
export function rivetsOnRebuild(g: Game): Big {
  const total = g.state.prestige.stampsTotal;
  const base = Math.max(1e-9, bal(g, "rebuildStampBase", 25));
  if (total.m <= 0 || B.cmp(total, B.big(base)) < 0) return zero();
  const raw = B.floor(B.pow(B.divN(total, base), bal(g, "rebuildRivetExp", 0.5)));
  return B.floor(B.mulN(raw, mod(g, "rivetGain")));
}

export function hasShipyard(g: Game): boolean {
  return getFlag(g, "shipyard_built") > 0 || getItem(g, SHIPYARD_ITEM).m > 0;
}

export function canRebuild(g: Game): boolean {
  return hasShipyard(g) && rivetsOnRebuild(g).m > 0;
}

/** The frame megastructure that unlocks a hull class for purchase, or null (the base hull, or content without frames). */
export function hullFrameItem(g: Game, hull: HullClassId): string | null {
  if (hull === baseHull(g)) return null;
  const id = FRAME_PREFIX + hull;
  return lookup(g.content.items, id) ? id : null;
}

export function rebuildBlock(g: Game, hull: HullClassId, keptRecipes: readonly RecipeId[] = []): FailReason | null {
  if (!canRebuild(g)) return "requirement";
  const def = lookup(g.content.hulls, hull);
  if (!def || !Array.isArray(keptRecipes)) return "invalid";
  const s = g.state;
  if (keptRecipes.length > Math.max(0, def.inheritBlueprints)) return "invalid";
  for (let i = 0; i < keptRecipes.length; i++) {
    const id = keptRecipes[i];
    if (lookup(s.recipes, id) !== 1 || !lookup(g.content.recipes, id) || keptRecipes.indexOf(id) !== i) return "invalid";
  }
  const owned = s.prestige.hullsOwned.indexOf(hull) >= 0;
  if (!owned) {
    const budget = B.add(s.prestige.rivets, rivetsOnRebuild(g));
    if (B.cmp(budget, B.big(Math.max(0, def.cost))) < 0) return "credits";
  }
  // A class is bought once: its frame has to be in the hold for that purchase. `hullFrameEveryRun`
  // makes every later rebuild into it need a fresh frame too.
  const frame = hullFrameItem(g, hull);
  if (frame && (!owned || bal(g, "hullFrameEveryRun", 0) > 0) && !(getItem(g, frame).m > 0)) return "items";
  return null;
}

/**
 * Scraps the ship for rivets and rebuilds it as `hull`. A hull class that is not owned yet is bought
 * with the rivets in hand plus the ones this rebuild pays, and needs its frame megastructure in the
 * hold for that first purchase. `keptRecipes` survive as inherited blueprints.
 */
export function rebuild(g: Game, hull: HullClassId, keptRecipes: RecipeId[] = []): ActionResult {
  const reason = rebuildBlock(g, hull, keptRecipes);
  if (reason) return fail(reason);
  const p = g.state.prestige;
  const def = g.content.hulls[hull];
  const gained = rivetsOnRebuild(g);
  p.rivets = whole(B.add(p.rivets, gained));
  setFlagBig(g, RIVETS_TOTAL, whole(B.add(rivetsTotal(g), gained)));
  if (p.hullsOwned.indexOf(hull) < 0) {
    p.rivets = whole(B.subClamp(p.rivets, B.big(Math.max(0, def.cost))));
    p.hullsOwned.push(hull);
  }
  p.rebuilds++;
  stat(g, "rebuilds");
  p.kept = keptRecipes.slice();
  // set before the reset: core sizes the bare grid from the hull class it finds
  g.state.hull.cls = hull;
  runPrestige(g, 2);
  settleHull(g, hull, true);
  // the hook already re-applied them if meta ran last; this keeps it true for any system order
  for (const id of p.kept) g.api.unlockRecipe(id);
  unlockFeature(g, "hull");
  g.api.say("prestige", { n: fmtBig(gained) });
  return OK;
}

// ---------- layer 3: reboot -----------------------------------------------------------

/** Sparks a reboot would pay now, from the rivets earned since the last reboot. */
export function sparksOnReboot(g: Game): Big {
  const total = rivetsTotal(g);
  const base = Math.max(1e-9, bal(g, "rebootRivetBase", 50));
  if (total.m <= 0 || B.cmp(total, B.big(base)) < 0) return zero();
  const raw = B.floor(B.pow(B.divN(total, base), bal(g, "rebootSparkExp", 0.5)));
  return B.floor(B.mulN(raw, mod(g, "sparkGain")));
}

export function canReboot(g: Game): boolean {
  return g.state.prestige.rebuilds >= bal(g, "rebootMinRebuilds", 2) && sparksOnReboot(g).m > 0;
}

export function reboot(g: Game): ActionResult {
  if (!canReboot(g)) return fail("requirement");
  const p = g.state.prestige;
  const gained = sparksOnReboot(g);
  p.sparks = whole(B.add(p.sparks, gained));
  p.reboots++;
  stat(g, "reboots");
  // cleared before the reset, so core does not hand the inherited blueprints back one last time
  p.kept = [];
  p.hullsOwned = [baseHull(g)];
  g.state.hull.cls = baseHull(g);
  runPrestige(g, 3);
  settleHull(g, baseHull(g), true);
  unlockFeature(g, "cosmos");
  g.api.say("prestige", { n: fmtBig(gained) });
  return OK;
}

// ---------- hull ----------------------------------------------------------------------

export function baseHull(g: Game): HullClassId {
  if (lookup(g.content.hulls, "tug")) return "tug";
  for (const id in g.content.hulls) return id;
  return "tug";
}

/** Open cells of a freshly built hull. A bigger class brings a bigger grid; the cells are opened at stations. */
export function hullOpenCells(g: Game, hull: HullClassId): number {
  const def = lookup(g.content.hulls, hull);
  const w = def ? clamp(Math.floor(def.grid.w), 1, GRID_MAX) : 3;
  const h = def ? clamp(Math.floor(def.grid.h), 1, GRID_MAX) : 3;
  return clamp(Math.floor(bal(g, "gridStartOpen", 4)), 1, w * h);
}

/**
 * Makes the hull class and the module grid agree after a reset: other areas reset their slices in
 * their own hooks and do not know which hull the player flies.
 */
function settleHull(g: Game, hull: HullClassId, resetOpen: boolean): void {
  const s = g.state;
  const def = lookup(g.content.hulls, hull);
  s.hull.cls = hull;
  if (def) {
    const w = clamp(Math.floor(def.grid.w), 1, GRID_MAX);
    const h = clamp(Math.floor(def.grid.h), 1, GRID_MAX);
    const grid = s.grid;
    if (grid.w !== w || grid.h !== h || grid.cells.length !== w * h) {
      for (const m of s.modules) if (m.slot >= 0) m.slot = -1;
      grid.w = w;
      grid.h = h;
      grid.cells = new Array<number>(w * h).fill(0);
    }
    const base = hullOpenCells(g, hull);
    grid.open = resetOpen ? base : clamp(Math.max(grid.open, base), 1, w * h);
  }
  markDirty(g);
  rebuildMods(g);
}

// ---------- upgrade trees -------------------------------------------------------------

export function upgradeLevel(g: Game, id: UpgradeId): number {
  const n = lookup(g.state.prestige.upgrades, id);
  return n !== undefined && n > 0 ? n : 0;
}

/** Price of the next level in the layer's currency (whole units). */
export function upgradeCost(g: Game, id: UpgradeId): Big {
  const def = lookup(g.content.upgrades, id);
  if (!def || !(def.cost > 0)) return zero();
  const growth = def.costGrowth > 0 ? def.costGrowth : 1;
  const raw = B.mulN(B.powN(growth, upgradeLevel(g, id)), def.cost);
  return B.max(B.floor(B.add(raw, B.big(0.5))), B.ONE);
}

export function upgradeBlock(g: Game, id: UpgradeId): FailReason | null {
  const def = lookup(g.content.upgrades, id);
  if (!def || (def.layer !== 1 && def.layer !== 2 && def.layer !== 3)) return "invalid";
  if (upgradeLevel(g, id) >= def.maxLevel) return "max";
  for (const req of def.requires) if (upgradeLevel(g, req) < 1) return "requirement";
  if (B.cmp(wallet(g, def.layer), upgradeCost(g, id)) < 0) return "credits";
  return null;
}

export function buyUpgrade(g: Game, id: UpgradeId): ActionResult {
  const reason = upgradeBlock(g, id);
  if (reason) return fail(reason);
  const def = g.content.upgrades[id];
  setWallet(g, def.layer, B.subClamp(wallet(g, def.layer), upgradeCost(g, id)));
  g.state.prestige.upgrades[id] = upgradeLevel(g, id) + 1;
  if (def.feature) unlockFeature(g, def.feature);
  stat(g, "upgrades");
  markDirty(g);
  return OK;
}

function dropUpgrades(g: Game, maxLayer: number): void {
  const owned = g.state.prestige.upgrades;
  for (const id in owned) {
    const def = lookup(g.content.upgrades, id);
    if (def && def.layer <= maxLayer) delete owned[id];
  }
}

// ---------- system --------------------------------------------------------------------

export const prestigeSystem: SystemDef = {
  id: "meta.prestige",
  init(g) {
    const p = g.state.prestige;
    p.stamps = whole(B.sanitize(p.stamps));
    p.stampsTotal = whole(B.sanitize(p.stampsTotal));
    p.rivets = whole(B.sanitize(p.rivets));
    p.sparks = whole(B.sanitize(p.sparks));
    if (!p.upgrades || typeof p.upgrades !== "object") p.upgrades = {};
    if (!Array.isArray(p.mutators)) p.mutators = [];
    if (!Array.isArray(p.kept)) p.kept = [];
    if (!Array.isArray(p.hullsOwned) || p.hullsOwned.length === 0) p.hullsOwned = [baseHull(g)];
    for (const id in p.upgrades) {
      const def = lookup(g.content.upgrades, id);
      if (def?.feature && p.upgrades[id] > 0) unlockFeature(g, def.feature);
    }
  },
  modifiers(g, out) {
    const s = g.state;
    const p = s.prestige;
    for (const id in p.upgrades) {
      const def = lookup(g.content.upgrades, id);
      if (def) pushScaled(out, def.effects, p.upgrades[id]);
    }
    for (const id of p.mutators) pushScaled(out, lookup(g.content.mutators, id)?.effects, 1);
    pushScaled(out, lookup(g.content.hulls, s.hull.cls)?.effects, 1);
  },
  prestige(g, layer) {
    const p = g.state.prestige;
    if (layer >= 2) {
      p.stamps = zero();
      p.stampsTotal = zero();
      p.mutators = [];
      dropUpgrades(g, 1);
    }
    if (layer >= 3) {
      p.rivets = zero();
      p.kept = [];
      p.hullsOwned = [baseHull(g)];
      dropUpgrades(g, 2);
      setFlagBig(g, RIVETS_TOTAL, zero());
    }
    // inherited blueprints outlive the recipe wipe of every layer that keeps them
    for (const id of p.kept) g.api.unlockRecipe(id);
  },
};

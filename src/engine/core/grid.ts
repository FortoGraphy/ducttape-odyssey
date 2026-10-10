// Tech grid: module instances, placement, adjacency, upgrades and the modifiers they grant (GDD 4).
import * as B from "../big";
import { OK, addCredits, fail, markDirty, nextUid, spend, stat } from "../kernel";
import {
  DECK_IDS,
  STAT_KEYS,
  type ActionResult,
  type Big,
  type DeckId,
  type Effect,
  type Game,
  type ItemId,
  type ModuleInst,
  type ModuleSpec,
  type Quality,
  type StatKey,
} from "../types";
import { bal, balArr, cc, clamp, type CoreCache } from "./shared";

const QUALITY_MULT: readonly number[] = [0.75, 1, 1.25, 1.6, 2.1];
export const GRID_MAX = 6;

export function findModule(g: Game, uid: number): ModuleInst | undefined {
  const mods = g.state.modules;
  for (let i = 0; i < mods.length; i++) if (mods[i].uid === uid) return mods[i];
  return undefined;
}

export function moduleSpec(g: Game, inst: ModuleInst): ModuleSpec | undefined {
  return g.content.items[inst.item]?.module;
}

/** Makes the cell array match w x h and drops references to modules that no longer exist. Idempotent. */
export function ensureGrid(g: Game): void {
  const s = g.state;
  const grid = s.grid;
  grid.w = clamp(Math.floor(grid.w) || 3, 1, GRID_MAX);
  grid.h = clamp(Math.floor(grid.h) || 3, 1, GRID_MAX);
  const size = grid.w * grid.h;
  grid.open = clamp(Math.floor(grid.open) || 0, 0, size);
  if (!Array.isArray(grid.cells)) grid.cells = [];
  const cells = grid.cells;
  let ok = cells.length === size;
  if (ok) {
    for (let i = 0; i < size && ok; i++) {
      const uid = cells[i];
      if (uid === 0) continue;
      const m = findModule(g, uid);
      if (!m || m.slot !== i || i >= grid.open) ok = false;
    }
    for (let i = 0; i < s.modules.length && ok; i++) {
      const m = s.modules[i];
      if (m.slot >= 0 && cells[m.slot] !== m.uid) ok = false;
    }
  }
  if (ok) return;
  // rebuild from the module list, which is the source of truth
  cells.length = size;
  for (let i = 0; i < size; i++) cells[i] = 0;
  for (const m of s.modules) {
    if (m.slot >= 0 && m.slot < grid.open && cells[m.slot] === 0) cells[m.slot] = m.uid;
    else m.slot = -1;
  }
  markDirty(g);
}

/** 1 above `degradeAt`, linear down to `degradedFloor` (0.4) at `offlineAt`, 0 below (module offline). */
export function integrityFactor(g: Game, hp: number): number {
  const degrade = bal(g, "degradeAt", 50);
  const off = bal(g, "offlineAt", 20);
  if (hp >= degrade) return 1;
  if (hp < off) return 0;
  const low = bal(g, "degradedFloor", 0.4);
  return degrade > off ? low + ((1 - low) * (hp - off)) / (degrade - off) : 1;
}

/** Installed, working 4-neighbours of the same family. */
export function adjacentSame(g: Game, inst: ModuleInst): number {
  if (inst.slot < 0) return 0;
  const grid = g.state.grid;
  const spec = moduleSpec(g, inst);
  if (!spec) return 0;
  const off = bal(g, "offlineAt", 20);
  const x = inst.slot % grid.w;
  const y = Math.floor(inst.slot / grid.w);
  let n = 0;
  for (let k = 0; k < 4; k++) {
    const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
    const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
    if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
    const uid = grid.cells[ny * grid.w + nx];
    if (!uid) continue;
    const other = findModule(g, uid);
    if (other && other.hp >= off && moduleSpec(g, other)?.family === spec.family) n++;
  }
  return n;
}

/** Multiplier applied to the module's effects: quality, level, integrity and adjacency. 0 = offline. */
export function moduleBonus(g: Game, inst: ModuleInst): number {
  const q = balArr(g, "qualityMult", QUALITY_MULT);
  const quality = q[inst.q] ?? QUALITY_MULT[inst.q] ?? 1;
  return (
    quality *
    (1 + bal(g, "moduleLevelBonus", 0.1) * inst.lvl) *
    integrityFactor(g, inst.hp) *
    (1 + bal(g, "adjacencyBonus", 0.15) * adjacentSame(g, inst))
  );
}

function pooled(c: CoreCache): Effect {
  let e = c.effectPool[c.effectUsed];
  if (!e) {
    e = {};
    c.effectPool[c.effectUsed] = e;
  }
  c.effectUsed++;
  return e;
}

/** Pushes the effects of every installed module and records the power they supply or draw. */
export function gridModifiers(g: Game, c: CoreCache, out: Effect[]): void {
  const mods = g.state.modules;
  let supply = 0;
  let draw = 0;
  c.modHp.clear();
  for (let i = 0; i < mods.length; i++) {
    const inst = mods[i];
    if (inst.slot < 0) continue;
    c.modHp.set(inst.uid, inst.hp);
    const spec = moduleSpec(g, inst);
    if (!spec) continue;
    const f = moduleBonus(g, inst);
    if (f <= 0) continue;
    if (spec.power < 0) supply += -spec.power * f;
    else draw += spec.power;
    const effects = spec.effects;
    for (let k = 0; k < effects.length; k++) {
      const src = effects[k];
      const e = pooled(c);
      e.stat = src.stat;
      e.deck = src.deck;
      e.add = src.add ? src.add * f : undefined;
      // bonuses and reductions (mul < 1: fuel use, wear, shield) both scale as mul^k
      e.mul = src.mul !== undefined ? Math.pow(Math.max(0, src.mul), f) : undefined;
      out.push(e);
    }
  }
  c.moduleSupply = supply;
  c.moduleDraw = draw;
}

// ---------- api -----------------------------------------------------------------------------

/** Creates a module in storage and returns its uid. Storage is bounded: the weakest spare is recycled. */
export function addModule(g: Game, item: ItemId, q?: Quality): number {
  const def = g.content.items[item];
  if (!def || !def.module) return 0;
  const s = g.state;
  const max = bal(g, "moduleStorageMax", 80);
  if (s.modules.length >= max) {
    let worst = -1;
    for (let i = 0; i < s.modules.length; i++) {
      const m = s.modules[i];
      if (m.slot >= 0) continue;
      if (worst < 0 || B.cmp(scrapValue(g, m), scrapValue(g, s.modules[worst])) < 0) worst = i;
    }
    if (worst >= 0) {
      addCredits(g, scrapValue(g, s.modules[worst]), false);
      s.modules.splice(worst, 1);
    }
  }
  const quality = (q === undefined ? 1 : clamp(Math.floor(q), 0, 4)) as Quality;
  const inst: ModuleInst = { uid: nextUid(g), item, q: quality, hp: 100, lvl: 0, slot: -1 };
  s.modules.push(inst);
  return inst.uid;
}

// ---------- actions -------------------------------------------------------------------------

function validCell(g: Game, cell: number): boolean {
  const grid = g.state.grid;
  return Number.isInteger(cell) && cell >= 0 && cell < grid.open && cell < grid.w * grid.h;
}

/** Moves modules without any bookkeeping; shared by the real action and the preview. */
function place(g: Game, inst: ModuleInst, cell: number): number {
  const cells = g.state.grid.cells;
  const from = inst.slot;
  const otherUid = cells[cell];
  if (otherUid === inst.uid) return 0;
  const other = otherUid ? findModule(g, otherUid) : undefined;
  if (from >= 0) cells[from] = 0;
  if (other) {
    // swap when the incoming module came from the grid, otherwise the old one goes to storage
    other.slot = from;
    if (from >= 0) cells[from] = other.uid;
  }
  cells[cell] = inst.uid;
  inst.slot = cell;
  return other ? other.uid : 0;
}

/** Installs a module into a grid cell. An occupied cell swaps: its module moves to where this one was. */
export function installModule(g: Game, uid: number, cell: number): ActionResult {
  ensureGrid(g);
  const inst = findModule(g, uid);
  if (!inst) return fail("noTarget");
  if (!validCell(g, cell)) return fail("locked");
  if (inst.slot === cell) return OK;
  const wasStored = inst.slot < 0;
  place(g, inst, cell);
  if (wasStored) stat(g, "modulesInstalled");
  markDirty(g);
  return OK;
}

/** Takes a module off the grid into storage. */
export function removeModule(g: Game, uid: number): ActionResult {
  const inst = findModule(g, uid);
  if (!inst) return fail("noTarget");
  if (inst.slot < 0) return OK;
  const cells = g.state.grid.cells;
  if (cells[inst.slot] === uid) cells[inst.slot] = 0;
  inst.slot = -1;
  markDirty(g);
  return OK;
}

/** Credits for the module's next level: `value * 40 * growth^lvl`. */
export function upgradeCost(g: Game, inst: ModuleInst): Big {
  const def = g.content.items[inst.item];
  const value = def ? def.value : 0;
  return B.mulN(B.powN(bal(g, "moduleUpgradeGrowth", 1.6), inst.lvl), value * bal(g, "moduleUpgradeBase", 40));
}

export function upgradeModule(g: Game, uid: number): ActionResult {
  const inst = findModule(g, uid);
  if (!inst) return fail("noTarget");
  if (inst.lvl >= bal(g, "moduleMaxLevel", 1000)) return fail("max");
  if (!spend(g, upgradeCost(g, inst))) return fail("credits");
  inst.lvl++;
  if (inst.slot >= 0) markDirty(g);
  return OK;
}

/** Credits returned for scrapping: a share of what the inputs were worth. */
export function scrapValue(g: Game, inst: ModuleInst): Big {
  const items = g.content.items;
  const def = items[inst.item];
  if (!def) return { m: 0, e: 0 };
  let inputs = 0;
  const recipes = g.content.recipes;
  for (const id in recipes) {
    const r = recipes[id];
    if (r.outputs[inst.item] === undefined) continue;
    for (const item in r.inputs) inputs += (items[item]?.value ?? 0) * r.inputs[item];
    break;
  }
  if (!(inputs > 0)) inputs = def.value;
  return B.mulN(cc(g).priceMul, inputs * bal(g, "scrapRefund", 0.5));
}

/** Destroys a module for a partial refund. */
export function scrapModule(g: Game, uid: number): ActionResult {
  const s = g.state;
  const idx = s.modules.findIndex((m) => m.uid === uid);
  if (idx < 0) return fail("noTarget");
  const inst = s.modules[idx];
  const refund = scrapValue(g, inst);
  const installed = inst.slot >= 0;
  if (installed && s.grid.cells[inst.slot] === uid) s.grid.cells[inst.slot] = 0;
  s.modules.splice(idx, 1);
  const pr = s.repair.priority.indexOf(uid);
  if (pr >= 0) s.repair.priority.splice(pr, 1);
  for (let i = s.repair.jobs.length - 1; i >= 0; i--) if (s.repair.jobs[i].target === uid) s.repair.jobs.splice(i, 1);
  addCredits(g, refund, false);
  if (installed) markDirty(g);
  return OK;
}

// ---------- preview -------------------------------------------------------------------------

export interface FoldedMods {
  stats: Record<StatKey, number>;
  decks: Record<DeckId, number>;
  /** Net power from modules: supply minus draw. */
  power: number;
}

const scratch: Effect[] = [];

/** Same fold as kernel.rebuildMods, but into a fresh object: Game.mods and Game.rev stay untouched. */
export function foldMods(g: Game): FoldedMods {
  const c = cc(g);
  const savedUsed = c.effectUsed;
  const savedSupply = c.moduleSupply;
  const savedDraw = c.moduleDraw;
  const savedHp = new Map(c.modHp);
  const savedDeckMult = { ...c.usedDeckMult };
  scratch.length = 0;
  for (const sys of g.systems) sys.modifiers?.(g, scratch);
  for (const b of g.state.buffs) scratch.push(b.effect);
  const stats = {} as Record<StatKey, number>;
  const muls = {} as Record<StatKey, number>;
  for (const k of STAT_KEYS) {
    stats[k] = 1;
    muls[k] = 1;
  }
  const decks = {} as Record<DeckId, number>;
  const deckMul = {} as Record<DeckId, number>;
  for (const id of DECK_IDS) {
    decks[id] = 1;
    deckMul[id] = 1;
  }
  for (let i = 0; i < scratch.length; i++) {
    const e = scratch[i];
    if (e.stat) {
      if (e.add) stats[e.stat] += e.add;
      if (e.mul !== undefined) muls[e.stat] *= e.mul;
    } else if (e.deck) {
      if (e.add) decks[e.deck] += e.add;
      if (e.mul !== undefined) deckMul[e.deck] *= e.mul;
    }
  }
  for (const k of STAT_KEYS) stats[k] = Math.max(0, stats[k]) * muls[k];
  for (const id of DECK_IDS) decks[id] = Math.max(0, decks[id]) * deckMul[id];
  const power = c.moduleSupply - c.moduleDraw;
  scratch.length = 0;
  // the fold reused the modifier cache: put back what the last real rebuild recorded
  c.effectUsed = savedUsed;
  c.moduleSupply = savedSupply;
  c.moduleDraw = savedDraw;
  c.modHp = savedHp;
  c.usedDeckMult = savedDeckMult;
  return { stats, decks, power };
}

export interface InstallPreview {
  ok: boolean;
  reason?: "noTarget" | "locked";
  /** Stats that would change, with their current and resulting multiplier. */
  stats: { stat: StatKey; from: number; to: number }[];
  /** Deck output multipliers that would change. */
  decks: { deck: DeckId; from: number; to: number }[];
  /** Net module power (supply minus draw) before and after. */
  power: { from: number; to: number };
  /** The module's own factor in the new cell (quality, level, integrity, adjacency). */
  bonus: number;
  adjacent: number;
  /** Module that would be moved out of the cell (0 = none). */
  displaced: number;
}

const EPS = 1e-9;

function diff(a: FoldedMods, b: FoldedMods, bonus: number, adjacent: number, displaced: number): InstallPreview {
  const stats: InstallPreview["stats"] = [];
  for (const k of STAT_KEYS) if (Math.abs(a.stats[k] - b.stats[k]) > EPS) stats.push({ stat: k, from: a.stats[k], to: b.stats[k] });
  const decks: InstallPreview["decks"] = [];
  for (const id of DECK_IDS) if (Math.abs(a.decks[id] - b.decks[id]) > EPS) decks.push({ deck: id, from: a.decks[id], to: b.decks[id] });
  return { ok: true, stats, decks, power: { from: a.power, to: b.power }, bonus, adjacent, displaced };
}

function snapshot(g: Game): { cells: number[]; slots: number[] } {
  return { cells: g.state.grid.cells.slice(), slots: g.state.modules.map((m) => m.slot) };
}

function restore(g: Game, snap: { cells: number[]; slots: number[] }): void {
  const cells = g.state.grid.cells;
  for (let i = 0; i < snap.cells.length; i++) cells[i] = snap.cells[i];
  const mods = g.state.modules;
  for (let i = 0; i < mods.length; i++) mods[i].slot = snap.slots[i];
}

/**
 * What installing `uid` into `cell` would change, without changing anything. The UI shows the stat
 * deltas before the player confirms. Pass `cell = -1` to preview removing the module.
 */
export function previewInstall(g: Game, uid: number, cell: number): InstallPreview {
  const none: InstallPreview = { ok: false, stats: [], decks: [], power: { from: 0, to: 0 }, bonus: 0, adjacent: 0, displaced: 0 };
  ensureGrid(g);
  const inst = findModule(g, uid);
  if (!inst) return { ...none, reason: "noTarget" };
  if (cell !== -1 && !validCell(g, cell)) return { ...none, reason: "locked" };
  const before = foldMods(g);
  const snap = snapshot(g);
  let displaced = 0;
  let after: FoldedMods;
  let bonus = 0;
  let adjacent = 0;
  try {
    if (cell === -1) {
      if (inst.slot >= 0) g.state.grid.cells[inst.slot] = 0;
      inst.slot = -1;
    } else displaced = place(g, inst, cell);
    after = foldMods(g);
    bonus = moduleBonus(g, inst);
    adjacent = adjacentSame(g, inst);
  } finally {
    restore(g, snap);
  }
  return diff(before, after, bonus, adjacent, displaced);
}

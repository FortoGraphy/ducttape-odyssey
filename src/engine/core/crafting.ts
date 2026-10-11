// Crafting: per-station queues with parallel slots. Inputs are taken when a batch completes, so a
// job never holds resources hostage and cancelling needs no refund (GDD 3).
import * as B from "../big";
import { OK, emit, fail, hasFeature, nextUid, roll, stat, weightedIndex } from "../kernel";
import type { ActionResult, Big, CraftJob, CraftStationId, Game, ItemId, Quality, RecipeDef, RecipeId } from "../types";
import { cargoFree, consumeItem, hasUnits, storeItem } from "./economy";
import { megaCheck } from "./mega";
import { STATIONS, addCombo, bal, balArr, cc, deckBlocked, keepOf, massOf, type CoreCache, type RecipeInfo } from "./shared";

const QUALITY_WEIGHTS: readonly number[] = [15, 50, 25, 8, 2];
const weights: number[] = [0, 0, 0, 0, 0];

function buildInfo(g: Game, def: RecipeDef): RecipeInfo {
  const items = g.content.items;
  const inputs: RecipeInfo["inputs"] = [];
  for (const item in def.inputs) inputs.push({ item, n: def.inputs[item], big: B.big(def.inputs[item]), mass: massOf(items[item]) });
  const outputs: RecipeInfo["outputs"] = [];
  let isModule = false;
  let primary = "";
  for (const item in def.outputs) {
    const module = !!items[item]?.module;
    if (!primary) primary = item;
    if (module) isModule = true;
    outputs.push({ item, n: def.outputs[item], mass: massOf(items[item]), module });
  }
  // megastructures are built one at a time like modules: a workshop batch of hundreds would ask for
  // hundreds of times the inputs of something only ever needed once
  const first = items[primary];
  if (first && first.category === "mega" && massOf(first) <= 0) isModule = true;
  return { def, inputs, outputs, primary, isModule };
}

/** Builds the recipe tables and makes start recipes known. Idempotent. */
export function initCrafting(g: Game, c: CoreCache): void {
  const s = g.state;
  c.recipes.clear();
  c.gatedRecipes.length = 0;
  c.blueprintRecipes.length = 0;
  const recipes = g.content.recipes ?? {};
  for (const id in recipes) {
    const def = recipes[id];
    c.recipes.set(id, buildInfo(g, def));
    if (def.unlock.start) s.recipes[id] = 1;
    if (def.unlock.deck || def.unlock.chapter !== undefined) c.gatedRecipes.push(def);
    if (def.unlock.blueprint) c.blueprintRecipes.push(def);
  }
  for (const id of s.prestige.kept) if (recipes[id]) s.recipes[id] = 1;
  for (const st of STATIONS) {
    if (!s.craft[st] || !Array.isArray(s.craft[st].queue)) s.craft[st] = { queue: [] };
  }
  unlockGated(g, c);
}

/** Recipes that unlock by deck level or story chapter. */
export function unlockGated(g: Game, c: CoreCache): void {
  const s = g.state;
  const list = c.gatedRecipes;
  for (let i = 0; i < list.length; i++) {
    const def = list[i];
    if (s.recipes[def.id] === 1) continue;
    const u = def.unlock;
    if (u.deck) {
      if (s.decks[u.deck.id].level < u.deck.level) continue;
      if (u.chapter !== undefined && s.story.chapter < u.chapter) continue;
    } else if (u.chapter === undefined || s.story.chapter < u.chapter) continue;
    unlockRecipe(g, def.id);
  }
}

export function unlockRecipe(g: Game, id: RecipeId): boolean {
  const def = g.content.recipes[id];
  if (!def || g.state.recipes[id] === 1) return false;
  g.state.recipes[id] = 1;
  if (def.unlock.blueprint) {
    stat(g, "blueprints");
    emit(g, { t: "blueprint", recipe: id });
  }
  return true;
}

/** Teaches a random undiscovered blueprint recipe; null when the player knows them all. */
export function grantBlueprint(g: Game): RecipeId | null {
  const list = cc(g).blueprintRecipes;
  let unknown = 0;
  for (let i = 0; i < list.length; i++) if (g.state.recipes[list[i].id] !== 1) unknown++;
  if (unknown === 0) return null;
  let pick = Math.floor(roll(g) * unknown);
  for (let i = 0; i < list.length; i++) {
    if (g.state.recipes[list[i].id] === 1) continue;
    if (pick-- === 0) {
      unlockRecipe(g, list[i].id);
      return list[i].id;
    }
  }
  return null;
}

function hasInputs(g: Game, info: RecipeInfo): boolean {
  const inputs = info.inputs;
  for (let i = 0; i < inputs.length; i++) if (!hasUnits(g, inputs[i].item, inputs[i].big)) return false;
  return true;
}

/** Units one batch would make right now: the station batch, limited by the inputs in the hold. */
export function batchUnits(g: Game, info: RecipeInfo): Big {
  const inv = g.state.inv;
  let n: Big = info.isModule ? { m: 1, e: 0 } : B.clone(g.rates.craftBatch[info.def.station]);
  for (const input of info.inputs) {
    const have = inv[input.item];
    if (!have) return { m: 0, e: 0 };
    const can = B.floor(B.divN(have, input.n));
    if (B.cmp(can, n) < 0) n = can;
  }
  return n;
}

/** Quality roll: Scrappy 15 / Standard 50 / Fine 25 / Superb 8 / Pristine 2, tilted upward by qualityLuck. */
export function rollQuality(g: Game): Quality {
  const base = balArr(g, "qualityChance", QUALITY_WEIGHTS);
  const luck = Math.max(0.05, g.mods.qualityLuck);
  for (let q = 0; q < 5; q++) weights[q] = (base[q] ?? QUALITY_WEIGHTS[q]) * Math.pow(luck, q - 1);
  return weightedIndex(g, weights) as Quality;
}

type Outcome = "done" | "inputs" | "cargo";

function complete(g: Game, c: CoreCache, station: CraftStationId, job: CraftJob, info: RecipeInfo): Outcome {
  const n = batchUnits(g, info);
  if (B.cmp(n, B.ONE) < 0) return "inputs";

  // room check: only what would stay in the hold counts, the rest is sold on arrival
  let need: Big = { m: 0, e: 0 };
  for (const out of info.outputs) {
    if (out.mass <= 0) continue;
    let stay = B.mulN(n, out.n);
    const k = keepOf(g, out.item);
    if (k < 1) stay = B.min(stay, B.subClamp(B.mulN(g.rates.cargoCap, k), g.state.inv[out.item] ?? B.ZERO));
    need = B.add(need, B.mulN(stay, out.mass));
  }
  if (need.m > 0) {
    let room = cargoFree(g);
    for (const input of info.inputs) if (input.mass > 0) room = B.add(room, B.mulN(n, input.n * input.mass));
    if (B.cmp(need, room) > 0) return "cargo";
  }

  for (const input of info.inputs) consumeItem(g, input.item, B.mulN(n, input.n));
  let quality: Quality | undefined;
  for (const out of info.outputs) {
    if (out.module) {
      for (let k = 0; k < out.n; k++) {
        quality = rollQuality(g);
        g.api.addModule(out.item, quality);
        stat(g, "modulesBuilt");
        if (quality === 4) stat(g, "modulesPristine");
      }
    } else storeItem(g, c, out.item, B.mulN(n, out.n), true);
  }
  if (info.def.tier === 4) megaCheck(g, c);
  const by = info.def.byproducts;
  if (by) {
    for (const b of by) {
      // one roll per batch: the whole part of n * chance is certain, the fraction is the roll
      const exp = B.mulN(n, b.chance);
      let count = B.floor(exp);
      if (exp.e < 15) {
        const frac = B.toNumber(exp) - B.toNumber(count);
        if (roll(g) < frac) count = B.add(count, B.ONE);
      }
      if (count.m > 0) storeItem(g, c, b.item, B.mulN(count, b.amount), true);
    }
  }
  stat(g, "crafts");
  stat(g, `craftsT${info.def.tier}`);
  stat(g, `made_${info.def.id}`);
  addCombo(g, bal(g, "comboCraft", 4));
  emit(g, quality === undefined ? { t: "craftDone", recipe: info.def.id, station } : { t: "craftDone", recipe: info.def.id, station, quality });
  if (info.isModule) g.api.say("craft");
  return "done";
}

function setStall(job: CraftJob, reason: CraftJob["stalled"]): void {
  if (job.stalled !== reason) job.stalled = reason;
}

export function tickCrafting(g: Game, c: CoreCache, dt: number): void {
  const s = g.state;
  const step = dt * c.craftSpeed;
  for (let si = 0; si < STATIONS.length; si++) {
    const station = STATIONS[si];
    const queue = s.craft[station].queue;
    if (queue.length === 0) continue;
    const slots = g.rates.craftSlots[station];
    if (slots <= 0) continue;
    if (deckBlocked(g, station)) {
      for (let i = 0; i < queue.length && i < slots; i++) setStall(queue[i], "power");
      continue;
    }
    let running = 0;
    for (let i = 0; i < queue.length && running < slots; i++) {
      const job = queue[i];
      const info = c.recipes.get(job.recipe);
      if (!info) {
        queue.splice(i--, 1);
        continue;
      }
      const time = info.def.time > 0 ? info.def.time : 1;
      if (job.progress < time) {
        // a stalled job gives its slot to the next one instead of blocking the station
        if (!hasInputs(g, info)) {
          setStall(job, "inputs");
          continue;
        }
        job.progress += step;
        if (job.progress < time) {
          setStall(job, undefined);
          running++;
          continue;
        }
      }
      // a finished batch waiting for inputs or room: cheap input check every tick, the full
      // attempt (it allocates) only twice a second
      if (job.stalled !== undefined && job.progress >= time) {
        if (job.stalled === "inputs" ? !hasInputs(g, info) : (c.tickCount & 3) !== 0) continue;
      }
      const res = complete(g, c, station, job, info);
      if (res !== "done") {
        job.progress = time;
        setStall(job, res);
        continue;
      }
      running++;
      setStall(job, undefined);
      // at most one batch per tick: a remainder larger than a whole batch is dropped
      job.progress = Math.min(job.progress - time, time * 0.999);
      if (job.left > 0 && --job.left === 0) queue.splice(i--, 1);
    }
  }
}

/** Auto-queue (research): re-adds a listed recipe for one batch whenever its inputs are in the hold. */
export function autoQueueSecond(g: Game, c: CoreCache): void {
  const s = g.state;
  if (s.autoRecipes.length === 0 || !hasFeature(g, "autoQueue")) return;
  const max = bal(g, "craftQueueMax", 12);
  for (let i = 0; i < s.autoRecipes.length; i++) {
    const info = c.recipes.get(s.autoRecipes[i]);
    if (!info || s.recipes[info.def.id] !== 1) continue;
    const station = info.def.station;
    if (s.decks[station].level <= 0) continue;
    const queue = s.craft[station].queue;
    if (queue.length >= max) continue;
    let queued = false;
    for (let k = 0; k < queue.length; k++) if (queue[k].recipe === info.def.id) queued = true;
    if (queued || !hasInputs(g, info)) continue;
    queue.push({ uid: nextUid(g), recipe: info.def.id, left: 1, progress: 0 });
  }
}

// ---------- actions -------------------------------------------------------------------------

/** OK when the recipe is known, its station is built and the hold has inputs for at least one unit. */
export function canCraft(g: Game, recipe: RecipeId): ActionResult {
  const info = cc(g).recipes.get(recipe);
  if (!info) return fail("invalid");
  if (g.state.recipes[recipe] !== 1) return fail("locked");
  if (g.state.decks[info.def.station].level <= 0) return fail("locked");
  if (!hasInputs(g, info)) return fail("items");
  return OK;
}

/** Known recipes of a station, lowest tier first. */
export function craftableRecipes(g: Game, station: CraftStationId): RecipeId[] {
  const out: RecipeId[] = [];
  const known = g.state.recipes;
  const recipes = g.content.recipes;
  for (const id in known) if (known[id] === 1 && recipes[id]?.station === station) out.push(id);
  out.sort((a, b) => recipes[a].tier - recipes[b].tier || (a < b ? -1 : a > b ? 1 : 0));
  return out;
}

/**
 * Adds a job. `batches` > 0 runs that many batches, -1 repeats until cancelled ("make it again").
 * Missing inputs do not prevent queueing: the job waits and shows its stall reason.
 */
export function queueCraft(g: Game, recipe: RecipeId, batches = 1): ActionResult {
  const s = g.state;
  const def = g.content.recipes[recipe];
  if (!def) return fail("invalid");
  if (s.recipes[recipe] !== 1) return fail("locked");
  if (s.decks[def.station].level <= 0) return fail("locked");
  const left = batches === -1 ? -1 : Math.floor(batches);
  if (!(left === -1 || left >= 1) || !Number.isFinite(left)) return fail("invalid");
  const queue = s.craft[def.station].queue;
  if (queue.length >= bal(g, "craftQueueMax", 12)) return fail("max");
  queue.push({ uid: nextUid(g), recipe, left, progress: 0 });
  return OK;
}

export function cancelCraft(g: Game, station: CraftStationId, uid: number): ActionResult {
  const queue = g.state.craft[station]?.queue;
  if (!queue) return fail("invalid");
  const i = queue.findIndex((j) => j.uid === uid);
  if (i < 0) return fail("noTarget");
  queue.splice(i, 1);
  return OK;
}

/** Moves a job by `delta` places in its queue (negative = earlier). */
export function moveCraft(g: Game, station: CraftStationId, uid: number, delta: number): ActionResult {
  const queue = g.state.craft[station]?.queue;
  if (!queue || !Number.isFinite(delta)) return fail("invalid");
  const i = queue.findIndex((j) => j.uid === uid);
  if (i < 0) return fail("noTarget");
  const to = Math.max(0, Math.min(queue.length - 1, i + Math.trunc(delta)));
  if (to === i) return OK;
  const job = queue.splice(i, 1)[0];
  queue.splice(to, 0, job);
  return OK;
}

/** Adds or removes a recipe from the auto-queue list. */
export function toggleAutoRecipe(g: Game, recipe: RecipeId): ActionResult {
  const s = g.state;
  if (!g.content.recipes[recipe]) return fail("invalid");
  const i = s.autoRecipes.indexOf(recipe);
  if (i >= 0) {
    s.autoRecipes.splice(i, 1);
    return OK;
  }
  if (!hasFeature(g, "autoQueue")) return fail("locked");
  if (s.recipes[recipe] !== 1) return fail("locked");
  if (s.autoRecipes.length >= bal(g, "autoRecipesMax", 24)) return fail("max");
  s.autoRecipes.push(recipe);
  return OK;
}

/** Seconds one batch takes at the current speed. */
export function craftSeconds(g: Game, recipe: RecipeId): number {
  const def: RecipeDef | undefined = g.content.recipes[recipe];
  if (!def) return 0;
  const speed = cc(g).craftSpeed;
  return speed > 0 ? def.time / speed : Infinity;
}

/** How many units of `item` the queued jobs' recipes need per batch unit; used by the UI to warn about reserves. */
export function recipeInputs(g: Game, recipe: RecipeId): { item: ItemId; n: number }[] {
  return cc(g).recipes.get(recipe)?.inputs ?? [];
}

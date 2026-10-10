// Repair paths (GDD 4): consumables, the manual mini-game, repair bots and autonomous maintenance.
import * as B from "../big";
import { OK, addBuff, emit, fail, getFlag, hasFeature, nextUid, roll, stat } from "../kernel";
import type { ActionResult, Game, ItemId, MinigameId, MinigameResult, MinigameTier, ModuleFamily, ModuleInst, PendingMinigame } from "../types";
import { hasUnits, takeUnits } from "./economy";
import { findModule, moduleSpec } from "./grid";
import { bal, cc, clamp, type CoreCache } from "./shared";
import { setHp } from "./wear";

const GAME_BY_FAMILY: Record<ModuleFamily, MinigameId> = {
  laser: "calibrate",
  engine: "valves",
  shield: "weld",
  scanner: "wire",
  reactor: "rhythm",
  cargo: "tape",
  repair: "wire",
  life: "valves",
};

const PRIORITY_MAX = 16;
const GLITCH_SECS = 1800;

/** Repair bot level; the meta area sets it from research. 0 = no bots. */
export function botLevel(g: Game): number {
  const lvl = g.state.repair.botLevel;
  return Number.isFinite(lvl) && lvl > 0 ? lvl : 0;
}

/** Integrity percent per second the bots restore on their current job. */
export function botRate(g: Game): number {
  const lvl = botLevel(g);
  if (lvl <= 0) return 0;
  return ((bal(g, "botRepairPerMin", 1.5) * lvl * g.mods.repairSpeed) / 60) * (1 + bal(g, "fixerBonus", 0.25) * g.state.drones.fixer);
}

function targetHp(g: Game, target: number): number | null {
  if (target === 0) return g.state.hull.hp;
  const inst = findModule(g, target);
  return inst ? inst.hp : null;
}

function applyRepair(g: Game, c: CoreCache, target: number, hp: number): void {
  if (target === 0) {
    g.state.hull.hp = clamp(hp, 0, 100);
    return;
  }
  const inst = findModule(g, target);
  if (inst) setHp(g, c, inst, hp);
}

/** Uses one repair consumable on a module (uid) or the hull (0). Each consumable has a cap it cannot exceed. */
export function repairWithItem(g: Game, target: number, item: ItemId): ActionResult {
  const spec = g.content.items[item]?.consumable;
  if (!spec || spec.kind !== "repair" || !(spec.repairPct && spec.repairPct > 0)) return fail("invalid");
  const hp = targetHp(g, target);
  if (hp === null) return fail("noTarget");
  const cap = clamp(spec.repairCap ?? 100, 0, 100);
  if (hp >= cap) return fail("max");
  if (!takeUnits(g, item, 1)) return fail("items");
  const c = cc(g);
  applyRepair(g, c, target, Math.min(cap, hp + spec.repairPct));
  if (item === "duct_tape") stat(g, "tapeUsed");
  emit(g, { t: "moduleRepaired", uid: target });
  return OK;
}

/** Mini-game used to repair a target, and its tier (by module mark; the hull scales with depth). */
export function repairGame(g: Game, target: number): { game: MinigameId; tier: MinigameTier } | null {
  if (target === 0) {
    const tier = (1 + Math.min(2, Math.floor(g.state.nav.depth / 15))) as MinigameTier;
    return { game: g.state.hull.hp < 40 ? "tape" : "weld", tier };
  }
  const inst = findModule(g, target);
  const spec = inst ? moduleSpec(g, inst) : undefined;
  if (!spec) return null;
  const tier: MinigameTier = spec.mk >= 5 ? 3 : spec.mk >= 3 ? 2 : 1;
  return { game: GAME_BY_FAMILY[spec.family] ?? "weld", tier };
}

/** Starts the repair mini-game for a damaged module (uid) or the hull (0). */
export function startManualRepair(g: Game, target: number): ActionResult {
  const hp = targetHp(g, target);
  if (hp === null) return fail("noTarget");
  if (hp >= 100) return fail("max");
  if (g.state.minigame) return fail("busy");
  const pick = repairGame(g, target);
  if (!pick) return fail("noTarget");
  const token = g.api.requestMinigame(pick.game, pick.tier, "repair", target);
  return token ? OK : fail("busy");
}

/** Mini-game result: restores 40 + 60 * score percent; a perfect run adds a 10 minute production buff. */
export function onRepairMinigame(g: Game, pending: PendingMinigame, result: MinigameResult): void {
  const hp = targetHp(g, pending.ref);
  if (hp === null) return;
  const c = cc(g);
  const gain = bal(g, "repairMinigameBase", 40) + bal(g, "repairMinigameScore", 60) * clamp(result.score, 0, 1);
  applyRepair(g, c, pending.ref, Math.min(100, hp + gain));
  if (!result.auto) {
    stat(g, "repairsManual");
    if (result.perfect) {
      stat(g, "repairsPerfect");
      addBuff(g, { stat: "allProd", mul: 1 + bal(g, "perfectBuff", 0.1) }, bal(g, "perfectBuffSecs", 600), "repairPerfect");
    }
  }
  emit(g, { t: "moduleRepaired", uid: pending.ref });
  g.api.say("repair");
}

/** Sets the ordered list of bot targets (module uids, 0 = hull). Unknown targets are dropped. */
export function setRepairPriority(g: Game, list: number[]): ActionResult {
  if (!Array.isArray(list)) return fail("invalid");
  const out: number[] = [];
  for (const t of list) {
    if (out.length >= PRIORITY_MAX) break;
    if (typeof t !== "number" || out.indexOf(t) >= 0) continue;
    if (t !== 0 && !findModule(g, t)) continue;
    out.push(t);
  }
  g.state.repair.priority = out;
  return OK;
}

/** Enables or disables autonomous maintenance (needs the research feature). */
export function setAutoMaintenance(g: Game, on: boolean): ActionResult {
  if (on && !hasFeature(g, "autoMaintenance")) return fail("locked");
  g.state.repair.auto = !!on;
  return OK;
}

/** Taps a glitched bot job back to work. */
export function clearGlitch(g: Game, target: number): ActionResult {
  for (const job of g.state.repair.jobs) {
    if (job.target === target && job.glitchUntil > g.state.t) {
      job.glitchUntil = 0;
      return OK;
    }
  }
  return fail("noTarget");
}

/** Bots are away while they pay for an auto-resolved mini-game. */
export function botsBusyUntil(g: Game): number {
  return getFlag(g, "botsBusyUntil");
}

function nextBotTarget(g: Game): number {
  const s = g.state;
  // a job only starts below this, so normal wear does not restart a finished job every few minutes
  const below = bal(g, "botStartBelow", 95);
  const pr = s.repair.priority;
  for (let i = 0; i < pr.length; i++) {
    const hp = targetHp(g, pr[i]);
    if (hp !== null && hp < below) return pr[i];
  }
  // nothing listed needs work: take the most damaged installed module, then the hull
  let worst: ModuleInst | null = null;
  for (const inst of s.modules) if (inst.slot >= 0 && inst.hp < below && (!worst || inst.hp < worst.hp)) worst = inst;
  if (worst) return worst.uid;
  return s.hull.hp < below ? 0 : -1;
}

/** Once per second: advance the bot job, start the next one, and run autonomous maintenance. */
export function repairSecond(g: Game, c: CoreCache, elapsed: number): void {
  const s = g.state;
  const rep = s.repair;
  const rate = botRate(g);
  if (rate > 0 && s.t >= botsBusyUntil(g)) {
    if (rep.jobs.length === 0) {
      const target = nextBotTarget(g);
      if (target >= 0) {
        const glitch = roll(g) < bal(g, "botGlitchChance", 0.04);
        rep.jobs.push({ target, glitchUntil: glitch ? s.t + bal(g, "botGlitchSecs", GLITCH_SECS) : 0 });
      }
    }
    for (let i = rep.jobs.length - 1; i >= 0; i--) {
      const job = rep.jobs[i];
      const hp = targetHp(g, job.target);
      if (hp === null) {
        rep.jobs.splice(i, 1);
        continue;
      }
      if (job.glitchUntil > s.t) continue;
      const next = Math.min(100, hp + rate * elapsed);
      applyRepair(g, c, job.target, next);
      if (next >= 100) {
        rep.jobs.splice(i, 1);
        stat(g, "repairsBot");
        emit(g, { t: "moduleRepaired", uid: job.target });
      }
    }
  } else if (rep.jobs.length > 0 && rate <= 0) rep.jobs.length = 0;

  if (rep.auto && (c.secCount % 5) === 0 && hasFeature(g, "autoMaintenance")) autoMaintain(g, c);
}

/** Best repair consumable in the hold that still helps at `hp`: the smallest one that is not wasted. */
export function bestRepairItem(g: Game, hp: number): ItemId | null {
  const items = g.content.items;
  let best: ItemId | null = null;
  let bestPct = Infinity;
  for (const id in g.state.inv) {
    const spec = items[id]?.consumable;
    if (!spec || spec.kind !== "repair" || !spec.repairPct) continue;
    if (!hasUnits(g, id, B.ONE)) continue;
    if (hp >= (spec.repairCap ?? 100)) continue;
    if (spec.repairPct < bestPct) {
      best = id;
      bestPct = spec.repairPct;
    }
  }
  return best;
}

/** KIPP's own maintenance round: patch what is degraded and keep a few repair consumables in stock. */
function autoMaintain(g: Game, c: CoreCache): void {
  const s = g.state;
  const threshold = bal(g, "autoRepairBelow", 50);
  for (const inst of s.modules) {
    if (inst.slot < 0 || inst.hp >= threshold) continue;
    const item = bestRepairItem(g, inst.hp);
    if (item) repairWithItem(g, inst.uid, item);
    break; // one job per round keeps the consumable drain gentle
  }
  if (s.decks.workshop.level <= 0) return;
  const queue = s.craft.workshop.queue;
  if (queue.length >= bal(g, "craftQueueMax", 12)) return;
  const stock = bal(g, "autoRepairStock", 5);
  for (const [id, info] of c.recipes) {
    if (info.def.station !== "workshop" || s.recipes[id] !== 1) continue;
    const spec = g.content.items[info.primary]?.consumable;
    if (!spec || spec.kind !== "repair") continue;
    if (B.gteN(s.inv[info.primary] ?? B.ZERO, stock)) continue;
    let queued = false;
    for (const job of queue) if (job.recipe === id) queued = true;
    if (queued) continue;
    let ok = true;
    for (const input of info.inputs) if (!hasUnits(g, input.item, input.big)) ok = false;
    if (!ok) continue;
    queue.push({ uid: nextUid(g), recipe: id, left: 1, progress: 0 });
    return;
  }
}

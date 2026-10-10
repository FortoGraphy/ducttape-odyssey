// Wear and damage (GDD 4). Integrity changes are batched to once per second and only invalidate the
// modifier cache when a module crosses a threshold or moved a full percent inside the degraded band.
import { emit, markDirty, roll } from "../kernel";
import type { Game, ModuleFamily, ModuleInst } from "../types";
import { moduleSpec } from "./grid";
import { bal, balArr, cc, clamp, type CoreCache } from "./shared";

const QUALITY_WEAR: readonly number[] = [0.8, 1, 1.2, 1.5, 2];

/** 0 offline, 1 degraded, 2 healthy. */
function zone(g: Game, hp: number): number {
  return hp < bal(g, "offlineAt", 20) ? 0 : hp < bal(g, "degradeAt", 50) ? 1 : 2;
}

/**
 * Sets a module's integrity. Marks the game dirty only when the change is visible in the module's
 * bonus; emits `moduleBroken` when it drops offline.
 */
export function setHp(g: Game, c: CoreCache, inst: ModuleInst, hp: number): void {
  const old = inst.hp;
  const next = clamp(Number.isFinite(hp) ? hp : old, 0, 100);
  if (next === old) return;
  inst.hp = next;
  if (inst.slot < 0) return;
  const ref = c.modHp.get(inst.uid);
  const zNew = zone(g, next);
  const zRef = zone(g, ref === undefined ? old : ref);
  if (zNew !== zRef || ref === undefined) markDirty(g);
  else if (zNew === 1 && Math.abs(next - ref) >= 1) markDirty(g);
  if (zNew === 0 && zone(g, old) !== 0) {
    emit(g, { t: "moduleBroken", uid: inst.uid });
    g.api.say("moduleBroken");
  }
}

/** Integrity percent a module loses per second of activity 1 (before the offline factor). */
export function wearPerSecond(g: Game, inst: ModuleInst): number {
  const spec = moduleSpec(g, inst);
  if (!spec || !(spec.wear > 0)) return 0;
  const qw = balArr(g, "qualityWear", QUALITY_WEAR);
  const div = qw[inst.q] ?? QUALITY_WEAR[inst.q] ?? 1;
  return (spec.wear * g.mods.wearRate * Math.max(1, g.api.hazardFactor())) / Math.max(0.1, div) / 3600;
}

/** Accumulates activity-weighted time and applies wear once per second. */
export function tickWear(g: Game, c: CoreCache, dt: number): void {
  c.wearAcc += dt * c.activity;
}

export function wearSecond(g: Game, c: CoreCache): void {
  const acc = c.wearAcc;
  c.wearAcc = 0;
  if (!(acc > 0)) return;
  const mods = g.state.modules;
  const off = bal(g, "offlineAt", 20);
  for (let i = 0; i < mods.length; i++) {
    const inst = mods[i];
    // stored and offline modules are not running, so they do not wear
    if (inst.slot < 0 || inst.hp < off) continue;
    const w = wearPerSecond(g, inst) * acc;
    if (w > 0) setHp(g, c, inst, inst.hp - w);
  }
}

// ---------- api -----------------------------------------------------------------------------

/**
 * Damages `count` random installed modules (optionally of one family) by `pct` integrity points,
 * reduced by the shield stat. Returns the uids that were hit.
 */
export function damageModules(g: Game, pct: number, count = 1, family?: ModuleFamily): number[] {
  const c = cc(g);
  const hit: number[] = [];
  if (!(pct > 0)) return hit;
  const pool: ModuleInst[] = [];
  for (const inst of g.state.modules) {
    if (inst.slot < 0 || inst.hp <= 0) continue;
    if (family && moduleSpec(g, inst)?.family !== family) continue;
    pool.push(inst);
  }
  const dmg = pct * g.mods.shield;
  const floor = g.offline ? bal(g, "offlineIntegrityFloor", 25) : 0;
  for (let n = Math.max(1, Math.floor(count)); n > 0 && pool.length > 0; n--) {
    const idx = Math.floor(roll(g) * pool.length);
    const inst = pool[idx];
    pool.splice(idx, 1);
    setHp(g, c, inst, Math.max(Math.min(inst.hp, floor), inst.hp - dmg));
    hit.push(inst.uid);
  }
  return hit;
}

/**
 * Damages the hull by `pct` points, reduced by shield and hull plating. At 0 a breach starts; while
 * the offline pass runs the ship is parked in safe mode at 5 % instead.
 */
export function damageHull(g: Game, pct: number): void {
  if (!(pct > 0)) return;
  const hull = g.state.hull;
  const dmg = (pct * g.mods.shield) / Math.max(0.01, g.mods.hullMax);
  if (!(dmg > 0)) return;
  let hp = hull.hp - dmg;
  if (g.offline) {
    const park = bal(g, "offlineHullFloor", 5);
    if (hp < park) {
      hp = Math.min(hull.hp, park);
      const report = cc(g).report;
      if (report) report.safeMode = true;
    }
    hull.hp = hp;
    return;
  }
  hull.hp = hp > 0 ? hp : 0;
  emit(g, { t: "hullDamage", pct: dmg });
  g.api.say("damage");
  if (hull.hp <= 0) g.api.startFailure("breach");
}

/** Restores `pct` integrity points on the hull and every module (station repair dock, events). */
export function repairAll(g: Game, pct: number): void {
  if (!(pct > 0)) return;
  const c = cc(g);
  for (const inst of g.state.modules) if (inst.hp < 100) setHp(g, c, inst, inst.hp + pct);
  g.state.hull.hp = clamp(g.state.hull.hp + pct, 0, 100);
}

// Read-only helpers for the tech grid, wear and repair screens.
import { content } from "@/content";
import { moduleBonus, wearPerSecond } from "@/engine/core";
import type { Game, ItemId, ModuleFamily, ModuleInst, StatKey } from "@/engine/types";

import { LOWER_BETTER } from "../craft/model";

export type ModState = "ok" | "degraded" | "offline";

const num = (key: string, def: number): number => {
  const v = content.balance[key];
  return typeof v === "number" ? v : def;
};

export const degradeAt = (): number => num("degradeAt", 50);
export const offlineAt = (): number => num("offlineAt", 20);

export function modState(hp: number): ModState {
  return hp < offlineAt() ? "offline" : hp < degradeAt() ? "degraded" : "ok";
}

export const FAMILIES: readonly ModuleFamily[] = ["laser", "engine", "shield", "scanner", "reactor", "cargo", "repair", "life"];

export const familyOf = (item: ItemId): ModuleFamily | undefined => content.items[item]?.module?.family;

/** Stored modules by family, then the best mark and quality first. */
export function sortModules(list: ModuleInst[]): ModuleInst[] {
  return list.slice().sort((a, b) => {
    const sa = content.items[a.item]?.module;
    const sb = content.items[b.item]?.module;
    if (!sa || !sb) return 0;
    return FAMILIES.indexOf(sa.family) - FAMILIES.indexOf(sb.family) || sb.mk - sa.mk || b.q - a.q || b.hp - a.hp;
  });
}

export interface GridTotal {
  stat: StatKey;
  /** Combined change from every working module, as a fraction. */
  delta: number;
  invert: boolean;
}

/** What the installed modules add up to per stat (quality, level, integrity and adjacency included). */
export function gridTotals(g: Game): GridTotal[] {
  const add: Partial<Record<StatKey, number>> = {};
  const mul: Partial<Record<StatKey, number>> = {};
  for (const inst of g.state.modules) {
    if (inst.slot < 0) continue;
    const spec = content.items[inst.item]?.module;
    if (!spec) continue;
    const f = moduleBonus(g, inst);
    if (f <= 0) continue;
    for (const e of spec.effects) {
      if (!e.stat) continue;
      if (e.add) add[e.stat] = (add[e.stat] ?? 0) + e.add * f;
      if (e.mul !== undefined) mul[e.stat] = (mul[e.stat] ?? 1) * Math.pow(Math.max(0, e.mul), f);
    }
  }
  const out: GridTotal[] = [];
  const seen = new Set<StatKey>([...(Object.keys(add) as StatKey[]), ...(Object.keys(mul) as StatKey[])]);
  for (const stat of seen) {
    const delta = (1 + (add[stat] ?? 0)) * (mul[stat] ?? 1) - 1;
    if (Math.abs(delta) > 1e-6) out.push({ stat, delta, invert: LOWER_BETTER[stat] === true });
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** Seconds until the first healthy installed module drops into the degraded band (Infinity = none will). */
export function nextDegrade(g: Game): number {
  let best = Infinity;
  const limit = degradeAt();
  for (const inst of g.state.modules) {
    if (inst.slot < 0 || inst.hp < limit) continue;
    const w = wearPerSecond(g, inst);
    if (w > 0) best = Math.min(best, (inst.hp - limit) / w);
  }
  return best;
}

export function gridCounts(g: Game): { installed: number; degraded: number; offline: number } {
  let installed = 0;
  let degraded = 0;
  let offline = 0;
  for (const inst of g.state.modules) {
    if (inst.slot < 0) continue;
    installed++;
    const s = modState(inst.hp);
    if (s === "degraded") degraded++;
    else if (s === "offline") offline++;
  }
  return { installed, degraded, offline };
}

/** Repair consumables in a stable order, weakest first. */
export function repairItems(): ItemId[] {
  const out: ItemId[] = [];
  for (const id in content.items) {
    const c = content.items[id].consumable;
    if (c?.kind === "repair" && c.repairPct) out.push(id);
  }
  return out.sort((a, b) => (content.items[a].consumable?.repairPct ?? 0) - (content.items[b].consumable?.repairPct ?? 0));
}

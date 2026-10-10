// Shared helpers for the world area: tunables with code defaults, numeric guards, the per-game
// runtime cache (never saved) and the keys this area keeps in GameState.flags.
import * as B from "../big";
import type { Big, ContentDB, EventEffect, Game, SystemInfo } from "../types";

// ---------- tunables ------------------------------------------------------------------

/** A numeric balance constant, or `def` when the key is missing or not a finite number. */
export function balNum(content: ContentDB, key: string, def: number): number {
  const b = content.balance as Record<string, unknown> | undefined;
  const v = b ? b[key] : undefined;
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

export function bal(g: Game, key: string, def: number): number {
  return balNum(g.content, key, def);
}

/** A [min, max] balance range with code defaults; always ordered and finite. */
export function balPair(g: Game, key: string, lo: number, hi: number): [number, number] {
  return balRange(g.content, key, lo, hi);
}

export function balRange(content: ContentDB, key: string, lo: number, hi: number): [number, number] {
  const b = content.balance as Record<string, unknown> | undefined;
  const v = b ? b[key] : undefined;
  if (Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1])) {
    const a = v[0] as number;
    const c = v[1] as number;
    return a <= c ? [a, c] : [c, a];
  }
  return [lo, hi];
}

// ---------- numeric guards ------------------------------------------------------------

/** Clamp that maps NaN to `lo`. */
export function clamp(x: number, lo: number, hi: number): number {
  return !(x >= lo) ? lo : x > hi ? hi : x;
}

export function fin(x: unknown, def = 0): number {
  return typeof x === "number" && Number.isFinite(x) ? x : def;
}

/** Divisor guard: modifiers can legally be 0. */
export function atLeast(x: number, min: number): number {
  return x > min ? x : min;
}

export function isInt(x: unknown): x is number {
  return typeof x === "number" && Number.isInteger(x);
}

/** Validates a player-supplied amount (number or Big). Returns null unless it is finite and positive. */
export function toAmount(n: unknown): Big | null {
  if (typeof n === "number") return Number.isFinite(n) && n > 0 ? B.big(n) : null;
  if (B.isBig(n) && Number.isFinite(n.m) && Number.isFinite(n.e) && n.m > 0) return B.make(n.m, Math.round(n.e));
  return null;
}

/** Own-property lookup for ids that come from the player or from data ("__proto__" must not resolve). */
export function own<T>(rec: Record<string, T> | undefined | null, key: unknown): T | undefined {
  return rec && typeof key === "string" && Object.prototype.hasOwnProperty.call(rec, key) ? rec[key] : undefined;
}

// ---------- flags owned by the world area ---------------------------------------------
// GameState has no free-form world slot, so small persistent world values live in state.flags
// under the "w:" prefix (numbers only).

export const F = {
  /** Index + 1 of the planet being scanned in the current system. */
  scan: "w:scan",
  charging: "w:charging",
  /** GameState.t of the last failure start (events keep a 20 s distance). */
  failAt: "w:failAt",
  /** Faction index + 1 that paid for the running tow with reputation. */
  towRep: "w:towRep",
  /** Fraction of a coffee bean the crew has drunk toward the next whole one. */
  coffeeDebt: "w:coffee",
  coffeeOut: "w:coffeeOut",
  /** + crew uid: GameState.t until which that crew member is in sickbay. */
  injuredPrefix: "w:inj:",
  hirePrefix: "w:hire:",
} as const;

export function clearFlag(g: Game, key: string): void {
  if (key in g.state.flags) delete g.state.flags[key];
}

export function clearFlagsWithPrefix(g: Game, prefix: string): void {
  const flags = g.state.flags;
  for (const k in flags) if (k.startsWith(prefix)) delete flags[k];
}

// ---------- runtime -------------------------------------------------------------------

export interface PendingFx {
  win: EventEffect[];
  lose: EventEffect[];
  seed: number;
}

export interface WorldRuntime {
  /** Seconds accumulated toward the next 1 Hz world step. */
  slowAcc: number;
  /** True during the tick in which the 1 Hz step runs. */
  slow: boolean;
  sys: SystemInfo | null;
  sysSeed: number;
  sysG: number;
  sysDepth: number;
  sysLane: number;
  hazard: number;
  /** Last seen value of stats.pulses (scanner pulses advance the running scan). */
  pulses: number;
  moraleStep: number;
  /** GameState.t since which the ship has been unable to pay for any jump; 0 = fine. */
  drySince: number;
  /** Win/lose effects of minigames requested outside an active event, by token. */
  pendingFx: Map<number, PendingFx>;
  /** Game minute in which the docked market last relaxed. */
  marketMinute: number;
  /** Name of a planet whose scan completed during the offline pass in progress. */
  offlineScan: string | null;
}

const RUNTIME = new WeakMap<Game, WorldRuntime>();

export function rt(g: Game): WorldRuntime {
  let r = RUNTIME.get(g);
  if (!r) {
    r = {
      slowAcc: 0,
      slow: false,
      sys: null,
      sysSeed: 0,
      sysG: -1,
      sysDepth: -1,
      sysLane: -1,
      hazard: 1,
      pulses: -1,
      moraleStep: -1,
      drySince: 0,
      pendingFx: new Map(),
      marketMinute: -1,
      offlineScan: null,
    };
    RUNTIME.set(g, r);
  }
  return r;
}

/** True when cargo has room for mass-bearing items (yields skip instead of overfilling the hold). */
export function cargoHasRoom(g: Game): boolean {
  return B.cmp(g.rates.cargoUsed, g.rates.cargoCap) < 0;
}

export function itemMass(g: Game, id: string): number {
  const def = g.content.items[id];
  if (!def) return 1;
  return typeof def.mass === "number" && def.mass >= 0 ? def.mass : 1;
}

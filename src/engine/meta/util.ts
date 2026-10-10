// Small shared helpers for the meta area. No state, no allocation in the hot paths.
import * as B from "../big";
import type { Big, Condition, Effect, Game, SystemInfo } from "../types";

/** Tunable from content.balance with a code default, so missing keys never crash. */
export function bal(g: Game, key: string, def: number): number {
  const table = g.content.balance as Record<string, unknown> | undefined;
  const v = table ? table[key] : undefined;
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

/** True on the tick that crosses a whole second of game time: the cadence for cheap periodic checks. */
export function secondEdge(g: Game, dt: number): boolean {
  const t = g.state.t;
  return Math.floor(t) !== Math.floor(t - dt);
}

const hasOwn = Object.prototype.hasOwnProperty;

/** Own-property lookup: ids come from the UI and from saves, so "constructor" must not resolve. */
export function lookup<T>(rec: Record<string, T> | undefined, id: unknown): T | undefined {
  if (!rec || typeof id !== "string" || !hasOwn.call(rec, id)) return undefined;
  return rec[id];
}

/** Pushes `effects` applied `level` times: additive parts scale linearly, multipliers compound. */
export function pushScaled(out: Effect[], effects: Effect[] | undefined, level: number): void {
  if (!effects || !(level > 0)) return;
  for (let i = 0; i < effects.length; i++) {
    const e = effects[i];
    if (level === 1) {
      out.push(e);
      continue;
    }
    const scaled: Effect = {};
    if (e.stat) scaled.stat = e.stat;
    if (e.deck) scaled.deck = e.deck;
    if (e.add) scaled.add = e.add * level;
    if (e.mul !== undefined) scaled.mul = Math.pow(e.mul, level);
    out.push(scaled);
  }
}

/** The current system, or null while the world area has not registered yet (tests, early init). */
export function safeSystem(g: Game): SystemInfo | null {
  try {
    return g.api.currentSystem() ?? null;
  } catch {
    return null;
  }
}

/** Condition check that treats an unavailable world as "does not hold". */
export function safeCheck(g: Game, cond: Condition | undefined): boolean {
  if (!cond) return true;
  try {
    return g.api.check(cond);
  } catch {
    return false;
  }
}

/** Big totals that have no slot in the contract live in two numeric flags. */
export function getFlagBig(g: Game, key: string): Big {
  const f = g.state.flags;
  const m = f[key + "_m"];
  const e = f[key + "_e"];
  if (!Number.isFinite(m) || !Number.isFinite(e)) return { m: 0, e: 0 };
  return B.make(m, e);
}

export function setFlagBig(g: Game, key: string, v: Big): void {
  const f = g.state.flags;
  f[key + "_m"] = v.m;
  f[key + "_e"] = v.e;
}

/** Compact number for toasts and ticket text ("1250", "3.20e9"). The UI has its own formatter for LCDs. */
export function fmtBig(v: Big): string {
  if (v.m <= 0) return "0";
  if (v.e < 6) return String(Math.floor(v.m * Math.pow(10, v.e) + 1e-9));
  return `${v.m.toFixed(2)}e${v.e}`;
}

export function fillN(text: string, n: string | number): string {
  return text.split("{n}").join(String(n));
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export const zero = (): Big => ({ m: 0, e: 0 });

/**
 * Prestige currencies are whole numbers, but mantissa arithmetic leaves 19.999999999999996 after
 * 23 - 3, which would then fail to afford a price of 20. Snap to the nearest integer after each change.
 */
export function whole(v: Big): Big {
  if (v.m <= 0) return { m: 0, e: 0 };
  if (v.e >= 15) return v;
  return B.big(Math.round(v.m * Math.pow(10, v.e)));
}

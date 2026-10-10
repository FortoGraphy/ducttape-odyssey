// Megastructures: passive effects while at least one is owned, and the flags the prestige layers
// look at (the shipyard opens "Rebuild the Ship", the wormhole gate opens an early warp).
import * as B from "../big";
import { markDirty, setFlag } from "../kernel";
import type { Effect, Game } from "../types";
import type { CoreCache } from "./shared";

const ALMOST_ONE = B.big(1 - 1e-9);

function owned(g: Game, id: string): boolean {
  const have = g.state.inv[id];
  return have !== undefined && B.cmp(have, ALMOST_ONE) >= 0;
}

/** Effects of every owned megastructure (once each, however many are held). */
export function megaModifiers(g: Game, out: Effect[]): void {
  const table = g.content.megaEffects;
  if (!table) return;
  for (const id in table) {
    if (!owned(g, id)) continue;
    const effects = table[id];
    for (let i = 0; i < effects.length; i++) out.push(effects[i]);
  }
}

/**
 * Notices megastructures entering or leaving the hold (crafted, granted by an event, reset), sets
 * the prestige flags and invalidates the modifier cache. Runs after a tier-4 craft, once per second
 * and after the offline pass.
 */
export function megaCheck(g: Game, c: CoreCache): void {
  const flags = g.state.flags;
  if (!(flags.shipyard_built > 0) && owned(g, "shipyard")) setFlag(g, "shipyard_built");
  if (!(flags.gate_built > 0) && owned(g, "wormhole_gate")) setFlag(g, "gate_built");
  const table = g.content.megaEffects;
  if (!table) return;
  let key = "";
  for (const id in table) if (owned(g, id)) key += id + ",";
  if (key !== c.megaKey) {
    c.megaKey = key;
    markDirty(g);
  }
}

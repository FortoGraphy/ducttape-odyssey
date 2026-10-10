// Failure states. One at a time, never started offline, and always escapable: every failure can
// be waited out, worked off, paid off or towed, and the tow can always be afforded.
import * as B from "../big";
import { addCredits, canAfford, emit, fail, getItem, incomeSeconds, markDirty, OK, spend, stat, takeItem, takeItems } from "../kernel";
import type { ActionResult, Big, FactionId, FailureDef, FailureExit, FailureKind, Game, MinigameResult, PendingMinigame, SystemDef } from "../types";
import { baseJumpCost, fuelCap } from "./nav";
import { bal, clamp, clearFlag, F, own } from "./util";

const FACTIONS: FactionId[] = ["lamplighters", "rustborn", "ledger"];

export function failureDef(g: Game): FailureDef | null {
  const f = g.state.failure;
  return f ? g.content.failures[f.kind] ?? null : null;
}

/** Vents a share of every mass-bearing cargo item (modules, megastructures and artifacts are bolted down). */
export function ventCargo(g: Game, fraction: number): void {
  const keep = 1 - clamp(fraction, 0, 1);
  if (keep >= 1) return;
  const inv = g.state.inv;
  const items = g.content.items;
  for (const id in inv) {
    const def = items[id];
    if (!def) continue;
    if (def.mass === 0 || def.category === "module" || def.category === "mega" || def.category === "artifact" || def.category === "special") continue;
    if (keep <= 0) delete inv[id];
    else inv[id] = B.mulN(inv[id], keep);
  }
}

// ---------- start / clear -------------------------------------------------------------

export function startFailure(g: Game, kind: FailureKind): boolean {
  const s = g.state;
  if (g.offline || s.failure !== null) return false;
  const def = own(g.content.failures, kind);
  if (!def || !Array.isArray(def.exits)) return false;
  let waitUntil = 0;
  for (let i = 0; i < def.exits.length; i++) {
    const e = def.exits[i];
    if (e.kind === "wait" && Number.isFinite(e.seconds)) {
      const until = s.t + Math.max(1, e.seconds);
      waitUntil = waitUntil === 0 ? until : Math.min(waitUntil, until);
    }
  }
  s.failure = { kind, since: s.t, waitUntil, tow: null };
  s.flags[F.failAt] = s.t;
  clearFlag(g, F.towRep);
  if (def.blocksJump) clearFlag(g, F.charging);
  stat(g, "failures");
  stat(g, "failure_" + kind);
  if (kind === "breach") ventCargo(g, bal(g, "breachCargoLoss", 0.2));
  markDirty(g);
  emit(g, { t: "failureStarted", kind });
  g.api.say("failure", { kind });
  return true;
}

export function clearFailure(g: Game, by: FailureExit["kind"]): void {
  const s = g.state;
  const f = s.failure;
  if (!f) return;
  if (f.tow && by !== "tow") {
    // the tow was paid up front; it turns around and the fee comes back
    if (f.tow.cost.m > 0) addCredits(g, f.tow.cost, false);
    const paid = s.flags[F.towRep];
    if (paid >= 1 && paid <= FACTIONS.length) {
      const faction = FACTIONS[paid - 1];
      s.station.rep[faction] = clamp((s.station.rep[faction] ?? 0) + bal(g, "towRepCost", 8), -100, 100);
    }
  }
  clearFlag(g, F.towRep);
  if (f.kind === "noFuel") s.nav.fuel = clamp(Math.max(s.nav.fuel, baseJumpCost(g)), 0, fuelCap(g));
  if (f.kind === "breach") {
    const patched = bal(g, "breachHullAfter", 25);
    if (!(s.hull.hp >= patched)) s.hull.hp = patched;
  }
  if (by === "tow") stat(g, "tows");
  s.failure = null;
  markDirty(g);
  emit(g, { t: "failureCleared", kind: f.kind, by });
  g.api.say("rescued", { kind: f.kind });
}

// ---------- tow -----------------------------------------------------------------------

export interface TowQuote {
  /** Seconds until the tow arrives. */
  seconds: number;
  cost: Big;
  pay: "credits" | "rep" | "free";
  faction: FactionId | null;
  /** A beacon from cargo will be used to shorten the wait. */
  beacon: boolean;
}

/** A beacon in cargo, unless one is already speeding the tow up through a buff. */
function beaconItem(g: Game): string | null {
  const buffs = g.state.buffs;
  for (let i = 0; i < buffs.length; i++) if (buffs[i].effect.stat === "towSpeed" && (buffs[i].effect.mul ?? 1) < 1) return null;
  const items = g.content.items;
  if (items.beacon && B.gteN(getItem(g, "beacon"), 1)) return "beacon";
  for (const id in g.state.inv) if (items[id]?.consumable?.kind === "beacon" && B.gteN(g.state.inv[id], 1)) return id;
  return null;
}

/** ETA factor of a beacon: its towSpeed buff when it has one, otherwise half the wait. */
function beaconFactor(g: Game, id: string): number {
  const e = g.content.items[id]?.consumable?.buff?.effect;
  const f = e && e.stat === "towSpeed" ? (1 + (e.add ?? 0)) * (e.mul ?? 1) : bal(g, "towBeaconFactor", 0.5);
  return clamp(f, 0.05, 1);
}

/** What calling the tow would cost right now. Always payable: credits, else reputation, else free but slower. */
export function towQuote(g: Game): TowQuote | null {
  const s = g.state;
  const def = failureDef(g);
  if (!s.failure || !def) return null;
  const base = Number.isFinite(def.towBase) && def.towBase > 0 ? def.towBase : 600;
  // GDD 7: towBase * (1 + depth / 20) * towSpeed. towSpeed multiplies the wait: lower is sooner.
  let seconds = base * (1 + s.nav.depth / Math.max(1, bal(g, "towDepthDivisor", 20))) * Math.max(0, g.mods.towSpeed);
  const beaconId = beaconItem(g);
  if (beaconId !== null) seconds *= beaconFactor(g, beaconId);

  // up to ten minutes of income: a short hop near the start, the full fee in deep space
  const cap = Math.max(0, bal(g, "towCostSecs", 600));
  const cost = incomeSeconds(g, clamp(cap * (0.2 + s.nav.depth / 25), 0, cap));
  let pay: TowQuote["pay"] = "credits";
  let faction: FactionId | null = null;
  if (!canAfford(g, cost)) {
    const price = bal(g, "towRepCost", 8);
    let best = -Infinity;
    for (let i = 0; i < FACTIONS.length; i++) {
      const r = s.station.rep[FACTIONS[i]] ?? 0;
      if (r > best) {
        best = r;
        faction = FACTIONS[i];
      }
    }
    if (faction !== null && best - price >= -100) {
      pay = "rep";
    } else {
      pay = "free";
      faction = null;
      seconds *= Math.max(1, bal(g, "towFreeSlowdown", 1.5));
    }
  }
  const min = Math.max(1, bal(g, "towMinSecs", 180));
  const max = Math.max(min, bal(g, "towMaxSecs", 3 * 3600));
  return { seconds: clamp(seconds, min, max), cost: pay === "credits" ? cost : B.big(0), pay, faction, beacon: beaconId !== null };
}

/** Fires the distress beacon. The tow arrives after its ETA and clears the failure, whatever it is. */
export function callTow(g: Game): ActionResult {
  const s = g.state;
  const f = s.failure;
  if (!f) return fail("noTarget");
  if (f.tow) return fail("busy");
  const q = towQuote(g);
  if (!q) return fail("invalid");
  if (q.pay === "credits") {
    spend(g, q.cost);
  } else if (q.pay === "rep" && q.faction) {
    s.station.rep[q.faction] = clamp((s.station.rep[q.faction] ?? 0) - bal(g, "towRepCost", 8), -100, 100);
    s.flags[F.towRep] = FACTIONS.indexOf(q.faction) + 1;
  }
  if (q.beacon) {
    const id = beaconItem(g);
    if (id) takeItem(g, id, 1);
  }
  f.tow = { eta: s.t + q.seconds, cost: q.cost };
  return OK;
}

// ---------- exits ---------------------------------------------------------------------

/** Tries the exit at `exitIndex` of the active failure's definition. */
export function attemptFailureExit(g: Game, exitIndex: number): ActionResult {
  const s = g.state;
  const f = s.failure;
  const def = failureDef(g);
  if (!f || !def) return fail("noTarget");
  const exit = Number.isInteger(exitIndex) ? def.exits[exitIndex] : undefined;
  if (!exit) return fail("invalid");
  switch (exit.kind) {
    case "minigame": {
      if (s.minigame !== null) return fail("busy");
      const token = g.api.requestMinigame(exit.game, exit.tier, "failure", exitIndex);
      return token ? OK : fail("busy");
    }
    case "wait":
      if (f.waitUntil > 0 && s.t >= f.waitUntil) {
        clearFailure(g, "wait");
        return OK;
      }
      return fail("cooldown");
    case "items":
      if (!takeItems(g, exit.items)) return fail("items");
      clearFailure(g, "items");
      return OK;
    case "credits": {
      const cost = incomeSeconds(g, Number.isFinite(exit.secs) ? exit.secs : 60);
      if (!spend(g, cost)) return fail("credits");
      clearFailure(g, "credits");
      return OK;
    }
    case "tow":
      return callTow(g);
  }
  return fail("invalid");
}

/** Credits the `credits` exit at this index costs right now (zero for other exits). */
export function failureExitCost(g: Game, exitIndex: number): Big {
  const exit = failureDef(g)?.exits[exitIndex];
  return exit && exit.kind === "credits" ? incomeSeconds(g, Number.isFinite(exit.secs) ? exit.secs : 60) : B.big(0);
}

function onFailureMinigame(g: Game, pending: PendingMinigame, result: MinigameResult): void {
  const s = g.state;
  const f = s.failure;
  const def = failureDef(g);
  if (!f || !def || def.exits[pending.ref]?.kind !== "minigame") return;
  if (result && result.success) {
    clearFailure(g, "minigame");
    return;
  }
  // a botched attempt still gets some of the work done: the remaining wait and tow shrink
  const cut = clamp(bal(g, "failureRetryCut", 0.25), 0, 0.9);
  if (f.waitUntil > s.t) f.waitUntil = s.t + (f.waitUntil - s.t) * (1 - cut);
  if (f.tow && f.tow.eta > s.t) f.tow.eta = s.t + (f.tow.eta - s.t) * (1 - cut * 0.5);
}

// ---------- system --------------------------------------------------------------------

export const failureSystem: SystemDef = {
  id: "world.failure",
  init(g) {
    const s = g.state;
    if (s.failure) {
      const f = s.failure;
      if (!g.content.failures?.[f.kind] || !Number.isFinite(f.since)) s.failure = null;
      else {
        f.waitUntil = Number.isFinite(f.waitUntil) ? f.waitUntil : 0;
        if (f.tow && !Number.isFinite(f.tow.eta)) f.tow = null;
      }
    } else if (s.failure === undefined) {
      s.failure = null;
    }
    g.api.startFailure = (kind) => startFailure(g, kind);
    g.api.clearFailure = (by) => clearFailure(g, by);
    g.minigameHandlers.failure = onFailureMinigame;
  },
  modifiers(g, out) {
    const def = failureDef(g);
    if (!def) return;
    for (let i = 0; i < def.effects.length; i++) out.push(def.effects[i]);
    for (let i = 0; i < def.blocksDecks.length; i++) out.push({ deck: def.blocksDecks[i], mul: 0 });
  },
  tick(g) {
    const s = g.state;
    const f = s.failure;
    if (f === null) return;
    if (f.tow !== null && s.t >= f.tow.eta) clearFailure(g, "tow");
    else if (f.waitUntil > 0 && s.t >= f.waitUntil) clearFailure(g, "wait");
  },
  prestige(g) {
    g.state.failure = null;
    clearFlag(g, F.towRep);
    clearFlag(g, F.failAt);
  },
};

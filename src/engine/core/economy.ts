// The production chain: mining -> hopper -> lift -> hold -> broker. Rates are cached in Game.rates
// and recomputed only when modifiers were rebuilt (Game.rev) or a core-local input changed.
import * as B from "../big";
import { OK, addCredits, emit, fail, statMax } from "../kernel";
import { DECK_IDS, type ActionResult, type Big, type Game, type ItemId, type SystemInfo } from "../types";
import * as X from "./bigx";
import { deckOutput, droneCapacity, reactorSupply } from "./decks";
import { STATIONS, bal, cc, deckBlocked, keepOf, massOf, type CoreCache, type Flow } from "./shared";

export type DroneRole = "hauler" | "probe" | "salvager" | "fixer";
const DRONE_ROLES: readonly DroneRole[] = ["hauler", "probe", "salvager", "fixer"];

/** Income smoothing: exponential average with a time constant of about 10 s. */
const INCOME_TAU = 10;

function currentSystem(g: Game): SystemInfo | null {
  try {
    return g.api.currentSystem() ?? null;
  } catch {
    return null; // the world area is not registered (tests, tools): mine the fallback raw
  }
}

/** Credits per unit the broker pays for an item right now. */
export function sellPrice(g: Game, id: ItemId): Big {
  const def = g.content.items[id];
  if (!def) return { m: 0, e: 0 };
  return B.mulN(cc(g).priceMul, def.value);
}

/** Units of an item kept before auto-sell; null when the item is never auto-sold. */
export function reserveOf(g: Game, id: ItemId): Big | null {
  const k = keepOf(g, id);
  return k >= 1 ? null : B.mulN(g.rates.cargoCap, k);
}

function makeFlow(g: Game, c: CoreCache, item: ItemId, share: number, rate: Big): Flow {
  const def = g.content.items[item];
  const k = keepOf(g, item);
  return {
    item,
    share,
    rate,
    price: B.mulN(c.priceMul, def.value),
    reserve: B.mulN(g.rates.cargoCap, k),
    never: k >= 1,
    mass: massOf(def),
  };
}

/** Rebuilds Game.rates and the flow tables from state, mods and the current system. */
export function recomputeRates(g: Game, c: CoreCache): void {
  const s = g.state;
  const r = g.rates;
  const m = g.mods;
  const decks = g.content.decks;

  let demand = 0;
  for (const id of DECK_IDS) {
    const def = decks[id];
    if (def) demand += s.decks[id].level * def.power;
  }
  demand = demand * m.powerUse + c.moduleDraw;
  const supply = reactorSupply(g) * m.powerOut + c.moduleSupply;
  // the floor keeps a ship without power crawling instead of softlocking
  const eff = demand <= 0 ? 1 : Math.max(bal(g, "minPowerEff", 0.05), Math.min(1, supply / demand));
  r.power.supply = supply;
  r.power.demand = demand;
  r.power.eff = eff;

  const prod = m.allProd * eff;
  const out = (id: (typeof DECK_IDS)[number], k: number): Big =>
    deckBlocked(g, id) ? { m: 0, e: 0 } : B.mulN(deckOutput(g, id), k);
  r.mine = out("mining", m.mineRate * prod);
  r.lift = out("lift", m.liftRate * prod * (1 + bal(g, "haulerLiftBonus", 0.1) * s.drones.hauler));
  r.cargoCap = B.mulN(deckOutput(g, "cargo"), m.cargoCap);
  r.research = out("lab", m.researchRate * prod);
  c.craftSpeed = m.craftSpeed * prod;
  const slotStep = Math.max(1, bal(g, "refinerySlotEvery", 25));
  const slotMax = bal(g, "craftSlotsMax", 4);
  for (const st of STATIONS) {
    const lvl = s.decks[st].level;
    const batch = B.floor(B.mulN(deckOutput(g, st), m.craftBatch));
    r.craftBatch[st] = B.cmp(batch, B.ONE) < 0 ? { m: 1, e: 0 } : batch;
    r.craftSlots[st] = lvl > 0 ? Math.min(slotMax, 1 + Math.floor(lvl / slotStep)) : 0;
  }

  const sys = currentSystem(g);
  const depth = sys ? sys.depth : s.nav.depth;
  r.richness = B.mulN(B.powN(bal(g, "richnessPerDepth", 1.32), Math.max(0, depth)), sys ? Math.max(0.01, sys.richness) : 1);
  c.sysId = sys ? sys.id : "";
  c.priceMul = B.mulN(r.richness, bal(g, "brokerFee", 0.6) * m.sellValue * m.creditGain);
  c.fill = Math.min(1, Math.max(0.05, bal(g, "reserveFill", 0.5)));
  c.hopperCap = B.mulN(r.mine, bal(g, "hopperSeconds", 30));

  const items = g.content.items;
  let total = 0;
  if (sys) for (const res of sys.resources) if (items[res.item] && res.w > 0) total += res.w;
  r.mix.length = 0;
  c.flows.length = 0;
  if (sys && total > 0) {
    for (const res of sys.resources) {
      if (!items[res.item] || !(res.w > 0)) continue;
      const share = res.w / total;
      r.mix.push({ item: res.item, share });
      c.flows.push(makeFlow(g, c, res.item, share, { m: 0, e: 0 }));
    }
  } else if (c.fallbackRaw) {
    r.mix.push({ item: c.fallbackRaw, share: 1 });
    c.flows.push(makeFlow(g, c, c.fallbackRaw, 1, { m: 0, e: 0 }));
  }

  c.constFlows.length = 0;
  if (s.decks.greenhouse.level > 0 && !deckBlocked(g, "greenhouse")) {
    const grow = B.mulN(deckOutput(g, "greenhouse"), prod);
    const coffee = items.coffee ? Math.min(1, Math.max(0, bal(g, "greenhouseCoffeeShare", 0.5))) : 0;
    if (items.organics && coffee < 1) c.constFlows.push(makeFlow(g, c, "organics", 0, B.mulN(grow, 1 - coffee)));
    if (coffee > 0) c.constFlows.push(makeFlow(g, c, "coffee", 0, B.mulN(grow, coffee)));
  }

  // analytic income with full reserves: seeds the smoothed value right after load
  const through = B.min(r.mine, r.lift);
  let expected: Big = { m: 0, e: 0 };
  for (const f of c.flows) expected = B.add(expected, B.mulN(B.mul(through, f.price), f.share));
  for (const f of c.constFlows) expected = B.add(expected, B.mul(f.rate, f.price));
  c.expected = expected;
  if (!c.seeded) {
    r.income = B.clone(expected);
    c.seeded = true;
  }
  c.rev = g.rev;
  c.dirty = false;
  c.sweepDue = true;
}

// ---------- tick ----------------------------------------------------------------------------

// Bound once: the tick calls these thousands of times a second, and a namespace member access per
// call is measurable on Hermes.
const cmp = B.cmp;
const { addMulIn, addMulNIn, subMulNClampIn, mulNTo, addIn, subClampIn, copy, clear } = X;

const mined: Big = { m: 0, e: 0 };
const moved: Big = { m: 0, e: 0 };
const amount: Big = { m: 0, e: 0 };
const free: Big = { m: 0, e: 0 };
const earned: Big = { m: 0, e: 0 };

/** Puts `amt` units of a flow into the hold or sells them; adds the proceeds to `earned`. */
function deposit(g: Game, f: Flow, amt: Big, fill: number): void {
  const inv = g.state.inv;
  const have = inv[f.item];
  if (f.mass <= 0) {
    inv[f.item] = have ? B.add(have, amt) : B.clone(amt);
    return;
  }
  // steady state: reserve is full (or the hold is), everything goes to the broker
  if (free.m <= 0 || (!f.never && have !== undefined && cmp(have, f.reserve) >= 0)) {
    addMulIn(earned, amt, f.price);
    return;
  }
  let store: Big;
  let filled = false;
  if (f.never) store = B.clone(amt);
  else {
    store = B.mulN(amt, fill);
    const room = have ? B.sub(f.reserve, have) : f.reserve;
    if (cmp(store, room) >= 0) {
      store = B.clone(room);
      filled = true;
    }
  }
  const fits = f.mass === 1 ? free : B.divN(free, f.mass);
  if (cmp(store, fits) > 0) {
    store = B.clone(fits);
    filled = false;
  }
  if (store.m > 0) {
    // land exactly on the reserve: have + (reserve - have) can miss it by one ulp and would keep
    // this item on the slow path forever
    inv[f.item] = filled ? B.clone(f.reserve) : have ? B.add(have, store) : store;
    addMulNIn(g.rates.cargoUsed, store, f.mass);
    subMulNClampIn(free, store, f.mass);
  }
  const sold = B.sub(amt, store);
  if (sold.m > 0) addMulIn(earned, sold, f.price);
}

export function tickEconomy(g: Game, c: CoreCache, dt: number): void {
  const s = g.state;
  const r = g.rates;
  // the hopper is updated in place: never write into one of the shared frozen constants
  if (s.hopper === B.ZERO || s.hopper === B.ONE) s.hopper = { m: s.hopper.m, e: s.hopper.e };

  if (r.mine.m > 0 && cmp(s.hopper, c.hopperCap) < 0) {
    mulNTo(mined, r.mine, dt * c.mineMult);
    addIn(s.hopper, mined);
    if (cmp(s.hopper, c.hopperCap) > 0) copy(s.hopper, c.hopperCap);
  }

  mulNTo(moved, r.lift, dt);
  if (cmp(s.hopper, moved) < 0) copy(moved, s.hopper);
  clear(earned);
  if (moved.m > 0 || c.constFlows.length > 0) {
    copy(free, r.cargoCap);
    subClampIn(free, r.cargoUsed);
    if (moved.m > 0) {
      subClampIn(s.hopper, moved);
      const flows = c.flows;
      for (let i = 0; i < flows.length; i++) {
        mulNTo(amount, moved, flows[i].share);
        deposit(g, flows[i], amount, c.fill);
      }
    }
    const cf = c.constFlows;
    for (let i = 0; i < cf.length; i++) {
      mulNTo(amount, cf[i].rate, dt);
      deposit(g, cf[i], amount, c.fill);
    }
  }
  if (earned.m > 0) {
    addCredits(g, earned);
    addIn(c.incomeAcc, earned);
  }
  if (r.research.m > 0) {
    mulNTo(amount, r.research, dt);
    s.rp = B.add(s.rp, amount);
  }
}

/**
 * Recounts the hold and sells whatever sits above its reserve (items granted by other areas, a
 * lowered keep fraction). Runs once per second and after inventory changes, never per tick.
 */
export function sweepCargo(g: Game, c: CoreCache): void {
  const inv = g.state.inv;
  const items = g.content.items;
  const cap = g.rates.cargoCap;
  let used: Big = { m: 0, e: 0 };
  let sold: Big = { m: 0, e: 0 };
  for (const id in inv) {
    const def = items[id];
    if (!def) continue;
    let v = inv[id];
    if (!(v.m > 0)) {
      delete inv[id];
      continue;
    }
    const mass = massOf(def);
    if (mass <= 0) continue;
    const k = keepOf(g, id);
    if (k < 1) {
      const reserve = B.mulN(cap, k);
      if (B.cmp(v, reserve) > 0) {
        sold = B.add(sold, B.mulN(B.mul(B.sub(v, reserve), c.priceMul), def.value));
        if (reserve.m > 0) inv[id] = v = reserve;
        else {
          delete inv[id];
          continue;
        }
      }
    }
    used = B.add(used, mass === 1 ? v : B.mulN(v, mass));
  }
  g.rates.cargoUsed = used;
  if (sold.m > 0) addCredits(g, sold);
  c.sweepDue = false;
}

/** Hold units still free. */
export function cargoFree(g: Game): Big {
  return B.subClamp(g.rates.cargoCap, g.rates.cargoUsed);
}

/**
 * Stores produced items (crafting, salvage): fills the item's reserve, sells the rest. The caller is
 * responsible for the stall check; whatever still does not fit is sold rather than lost.
 */
export function storeItem(g: Game, c: CoreCache, id: ItemId, amt: Big, countsAsIncome: boolean): void {
  if (!(amt.m > 0)) return;
  const def = g.content.items[id];
  const inv = g.state.inv;
  const have = inv[id];
  const mass = massOf(def);
  if (!def || mass <= 0) {
    inv[id] = have ? B.add(have, amt) : B.clone(amt);
    return;
  }
  const k = keepOf(g, id);
  let store = B.clone(amt);
  let reserve: Big | null = null;
  if (k < 1) {
    reserve = B.mulN(g.rates.cargoCap, k);
    const room = B.subClamp(reserve, have ?? B.ZERO);
    if (B.cmp(store, room) >= 0) store = room;
    else reserve = null;
  }
  const fits = B.divN(cargoFree(g), mass);
  if (B.cmp(store, fits) > 0) {
    store = fits;
    reserve = null;
  }
  if (store.m > 0) {
    inv[id] = reserve ? reserve : have ? snap(B.add(have, store)) : store;
    X.addMulNIn(g.rates.cargoUsed, store, mass);
  }
  const sold = B.sub(amt, store);
  if (sold.m > 0) {
    const credits = B.mulN(B.mul(sold, c.priceMul), def.value);
    addCredits(g, credits);
    if (countsAsIncome) X.addIn(c.incomeAcc, credits);
  }
}

/** Float noise from Big subtraction (10 - 4 = 5.999999999999999) must not turn "1 left" into "none left". */
const UNIT_TOL = 1e-9;

/** True when the hold has at least `n` of an item, tolerant of float noise. */
export function hasUnits(g: Game, id: ItemId, n: Readonly<Big>): boolean {
  const have = g.state.inv[id];
  if (have === undefined) return !(n.m > 0);
  if (B.cmp(have, n) >= 0) return true;
  return have.e >= n.e - 1 && B.cmp(B.mulN(have, 1 + UNIT_TOL), n) >= 0;
}

/** Rounds counts that are a hair away from a whole number back onto it. */
function snap(v: Big): Big {
  if (v.e >= 9 || v.e < -9) return v;
  const x = B.toNumber(v);
  const r = Math.round(x);
  return r > 0 && Math.abs(x - r) <= UNIT_TOL * r ? B.big(r) : v;
}

/** Removes up to `amt` items (everything, when float noise left a hair too little) and keeps the cargo counter in step. */
export function consumeItem(g: Game, id: ItemId, amt: Readonly<Big>): void {
  if (!(amt.m > 0)) return;
  const inv = g.state.inv;
  const have = inv[id];
  if (!have) return;
  const mass = massOf(g.content.items[id]);
  const left = snap(B.sub(have, amt));
  if (!(left.m > 0) || left.e < have.e - 12) {
    if (mass > 0) X.subMulNClampIn(g.rates.cargoUsed, have, mass);
    delete inv[id];
    return;
  }
  inv[id] = left;
  if (mass > 0) X.subMulNClampIn(g.rates.cargoUsed, amt, mass);
}

/** Takes exactly `n` units if they are there. */
export function takeUnits(g: Game, id: ItemId, n: number): boolean {
  const amt = B.big(n);
  if (!hasUnits(g, id, amt)) return false;
  consumeItem(g, id, amt);
  return true;
}

/** Once per second: smoothed income, cargo alarm, credit record. `elapsed` is the real span covered. */
export function economySecond(g: Game, c: CoreCache, elapsed: number): void {
  const r = g.rates;
  if (c.sweepDue || (c.secCount & 1) === 0) sweepCargo(g, c);

  const alpha = 1 - Math.exp(-elapsed / INCOME_TAU);
  r.income = B.add(B.mulN(r.income, 1 - alpha), B.mulN(c.incomeAcc, alpha / elapsed));
  X.clear(c.incomeAcc);

  const fullness = B.ratio(r.cargoUsed, r.cargoCap, 2);
  if (!c.cargoFull && fullness >= bal(g, "cargoFullAt", 0.98)) {
    c.cargoFull = true;
    emit(g, { t: "cargoFull" });
    g.api.say("cargoFull");
  } else if (c.cargoFull && fullness < bal(g, "cargoFullClear", 0.9)) c.cargoFull = false;

  if (g.state.credits.m > 0) statMax(g, "creditsLog10", Math.floor(B.log10(g.state.credits) * 100) / 100);
}

// ---------- actions -------------------------------------------------------------------------

/** Sets the fraction of the hold reserved for an item before auto-sell (1 = never sell). */
export function setKeep(g: Game, item: ItemId, frac: number): ActionResult {
  const def = g.content.items[item];
  if (!def || typeof frac !== "number" || Number.isNaN(frac)) return fail("invalid");
  if (massOf(def) <= 0) return fail("invalid");
  g.state.keep[item] = frac < 0 ? 0 : frac > 1 ? 1 : frac;
  const c = cc(g);
  c.dirty = true;
  return OK;
}

/** Sells items from the hold to the broker at the auto-sell price. */
export function sellItem(g: Game, item: ItemId, qty: number | Big | "all"): ActionResult {
  const def = g.content.items[item];
  if (!def) return fail("invalid");
  if (massOf(def) <= 0) return fail("invalid"); // modules, megastructures and artifacts are never sold
  const have = g.state.inv[item];
  if (!have || !(have.m > 0)) return fail("items");
  let n = qty === "all" ? B.clone(have) : typeof qty === "number" ? B.big(qty) : B.sanitize(qty);
  if (!(n.m > 0)) return fail("invalid");
  if (B.cmp(n, have) > 0) n = B.clone(have);
  const c = cc(g);
  const credits = B.mulN(B.mul(n, c.priceMul), def.value);
  consumeItem(g, item, n);
  addCredits(g, credits);
  emit(g, { t: "sold", credits });
  return OK;
}

/** Assigns `n` drones to a role. The total may not exceed the hangar capacity. */
export function setDrones(g: Game, role: DroneRole, n: number): ActionResult {
  if (DRONE_ROLES.indexOf(role) < 0 || typeof n !== "number" || !Number.isFinite(n) || n < 0) return fail("invalid");
  const want = Math.floor(n);
  const d = g.state.drones;
  let others = 0;
  for (const r of DRONE_ROLES) if (r !== role) others += d[r];
  if (others + want > droneCapacity(g)) return fail("max");
  d[role] = want;
  cc(g).dirty = true;
  return OK;
}

/** Keeps assignments valid when the capacity shrank (prestige, lost bonus): trims from the last role. */
export function clampDrones(g: Game): void {
  const d = g.state.drones;
  let over = d.hauler + d.probe + d.salvager + d.fixer - droneCapacity(g);
  for (let i = DRONE_ROLES.length - 1; i >= 0 && over > 0; i--) {
    const cut = Math.min(over, d[DRONE_ROLES[i]]);
    d[DRONE_ROLES[i]] -= cut;
    over -= cut;
  }
}

/** Seconds until the credits reach `cost` at the current smoothed income (Infinity when idle). */
export function secondsUntil(g: Game, cost: Big): number {
  const missing = B.sub(cost, g.state.credits);
  if (!(missing.m > 0)) return 0;
  if (!(g.rates.income.m > 0)) return Infinity;
  const l = B.log10(missing) - B.log10(g.rates.income);
  return l > 12 ? Infinity : Math.pow(10, l);
}

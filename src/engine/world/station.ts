// Stations: seeded market, contracts, upgrade shop, repair dock and crew for hire.
// Prices are anchored to what the broker uplink pays at this depth, and buying is always dearer
// than any way of selling, so no buy/sell loop prints credits.
import * as B from "../big";
import { addCredits, addItem, canAfford, emit, fail, getItem, hasFeature, incomeSeconds, markDirty, nextUid, OK, spend, stat, takeItem } from "../kernel";
import { hashSeed, Rng } from "../prng";
import type { ActionResult, Big, Contract, CrewMember, FactionId, Game, ItemDef, ItemId, L10n, ShopItemDef, SystemDef, SystemInfo } from "../types";
import { scaleEffect } from "./cards";
import { addCrewFromSeed, crewCap, crewFromSeed } from "./crew";
import { itemHash, rawUnlockDepth } from "./galaxy";
import { currentSystem, fuelCap, fuelItems } from "./nav";
import { bal, balPair, clamp, clearFlagsWithPrefix, F, isInt, itemMass, own, rt, toAmount } from "./util";

const HOUR = 3600;
const DAY = 86400;
export const PRICE_MIN = 0.6;
export const PRICE_MAX = 1.6;

// ---------- basics --------------------------------------------------------------------

export function stationHere(g: Game): SystemInfo["station"] {
  return g.state.nav.jump === null ? currentSystem(g).station : null;
}

/** Index of the current market period (prices are redrawn every balance.marketRefreshSecs, one game hour). */
export function gameHour(g: Game): number {
  return marketPeriod(g, g.state.t);
}

export function marketPeriod(g: Game, t: number): number {
  return Math.floor(t / Math.max(60, bal(g, "marketRefreshSecs", HOUR)));
}

export function gameDay(g: Game): number {
  return Math.floor(g.state.t / DAY);
}

export function getRep(g: Game, faction: FactionId): number {
  return clamp(g.state.station.rep[faction] ?? 0, -100, 100);
}

/** Changes reputation; gains scale with the repGain modifier. Clamped to -100..100. */
export function addRep(g: Game, faction: FactionId, n: number): void {
  const rep = g.state.station.rep;
  if (!Number.isFinite(n) || !Object.prototype.hasOwnProperty.call(rep, faction)) return;
  rep[faction] = clamp((rep[faction] ?? 0) + (n > 0 ? n * g.mods.repGain : n), -100, 100);
}

export function dock(g: Game): ActionResult {
  const s = g.state;
  if (!hasFeature(g, "station")) return fail("locked");
  if (s.nav.jump !== null) return fail("busy");
  const st = stationHere(g);
  if (!st) return fail("noTarget");
  if (s.station.docked) return OK;
  s.station.docked = true;
  refreshOffers(g);
  g.api.say("station", { name: st.name });
  return OK;
}

export function undock(g: Game): ActionResult {
  if (!g.state.station.docked) return fail("noTarget");
  g.state.station.docked = false;
  return OK;
}

function docked(g: Game): SystemInfo["station"] {
  return g.state.station.docked ? stationHere(g) : null;
}

// ---------- market --------------------------------------------------------------------

/**
 * Market multiplier for an item at a station in a given game hour: 0.6 to 1.6, seeded by the
 * system and the hour, nudged up for categories the station's faction likes. Pure.
 */
export function marketFactor(g: Game, sys: SystemInfo, item: ItemId, hour: number): number {
  const u = (hashSeed(sys.seed, Math.floor(hour), itemHash(item)) >>> 0) / 4294967296;
  const range = balPair(g, "marketPrice", PRICE_MIN, PRICE_MAX);
  let f = range[0] + u * (range[1] - range[0]);
  const def = g.content.items[item];
  const faction = sys.station ? g.content.factions?.[sys.station.faction] : undefined;
  if (def && faction && Array.isArray(faction.likes) && faction.likes.includes(def.category)) f *= 1.15;
  return clamp(f, range[0], range[1]);
}

/** What one unit is worth here before the market's mood: base value at the local richness with the player's sell modifiers. */
function unitValue(g: Game, def: ItemDef): Big {
  return B.mulN(g.rates.richness, Math.max(0, def.value) * g.mods.sellValue * g.mods.creditGain);
}

function tradeable(def: ItemDef | undefined): def is ItemDef {
  return def !== undefined && def.category !== "module" && def.category !== "mega" && def.category !== "special" && def.value > 0;
}

function pressure(g: Game, item: ItemId): number {
  return clamp(g.state.station.trades[item] ?? 0, -1, 1);
}

/** Units of an item that move its price all the way: a quarter of the hold. */
function pressureOf(g: Game, item: ItemId, amount: Big): number {
  const ref = B.mulN(g.rates.cargoCap, 0.25 / Math.max(0.01, itemMass(g, item) || 1));
  return B.ratio(amount, B.max(ref, B.big(20)), 2);
}

function repFactor(g: Game, sys: SystemInfo): number {
  return sys.station ? getRep(g, sys.station.faction) / 100 : 0;
}

/** Price per unit when buying `amount` here (average over the purchase; buying pushes the price up). */
export function stationBuyPrice(g: Game, item: ItemId, amount: Big | number = 1): Big {
  const def = own(g.content.items, item);
  const sys = currentSystem(g);
  const a = toAmount(amount);
  if (!tradeable(def) || !a) return B.big(0);
  const p0 = Math.max(0, pressure(g, item));
  const p1 = Math.min(1, p0 + pressureOf(g, item, a));
  // never below the broker's bid, whatever the tuning: buying here and auto-selling must lose money
  const mood = Math.max(bal(g, "brokerFee", 0.6) * 1.05, marketFactor(g, sys, item, gameHour(g)) * bal(g, "marketMarkup", 1.25) * (1 - 0.15 * repFactor(g, sys)));
  return B.mulN(unitValue(g, def), mood * (1 + bal(g, "marketImpact", 0.3) * (p0 + p1) * 0.5));
}

/** Price per unit when selling `amount` here (average over the sale; selling pushes the price down). */
export function stationSellPrice(g: Game, item: ItemId, amount: Big | number = 1): Big {
  const def = own(g.content.items, item);
  const sys = currentSystem(g);
  const a = toAmount(amount);
  if (!tradeable(def) || !a) return B.big(0);
  const p0 = Math.min(0, pressure(g, item));
  const p1 = Math.max(-1, p0 - pressureOf(g, item, a));
  const mood = marketFactor(g, sys, item, gameHour(g)) * clamp(bal(g, "marketFee", 0.8), 0, 1) * (1 + 0.15 * repFactor(g, sys));
  return B.mulN(unitValue(g, def), mood * (1 + bal(g, "marketImpact", 0.3) * (p0 + p1) * 0.5));
}

const stockCache = new WeakMap<SystemInfo, ItemId[]>();

/** Items this station sells: fuel and coffee always, plus a seeded selection that fits the depth. */
export function stationStock(g: Game, sys: SystemInfo): ItemId[] {
  if (!sys.station) return [];
  const hit = stockCache.get(sys);
  if (hit) return hit;
  const items = g.content.items ?? {};
  const out: ItemId[] = [];
  const fuels = fuelItems(g);
  for (let i = 0; i < fuels.length; i++) if (tradeable(items[fuels[i].id])) out.push(fuels[i].id);
  const pool: ItemId[] = [];
  for (const id of Object.keys(items).sort()) {
    const def = items[id];
    if (!tradeable(def) || out.includes(id)) continue;
    if (def.consumable?.kind === "coffee") out.push(id);
    else if (def.category === "raw" ? rawUnlockDepth(g.content, id) <= sys.depth + 4 : def.category === "consumable" || ((def.category === "refined" || def.category === "component") && def.tier <= 2)) pool.push(id);
  }
  const rng = new Rng(hashSeed(sys.seed, 0x570c));
  rng.shuffle(pool);
  const want = rng.int(6, 10);
  for (let i = 0; i < pool.length && i < want; i++) out.push(pool[i]);
  stockCache.set(sys, out);
  return out;
}

export interface MarketRow {
  item: ItemId;
  /** Unit price to buy one here; zero when the station does not stock it. */
  buy: Big;
  /** Unit price the station pays for one. */
  sell: Big;
  factor: number;
  stocked: boolean;
}

/** Market table for the docked station: everything it stocks plus everything sellable in cargo. */
export function marketRows(g: Game): MarketRow[] {
  const sys = currentSystem(g);
  if (!sys.station || g.state.nav.jump !== null) return [];
  const stock = stationStock(g, sys);
  const hour = gameHour(g);
  const out: MarketRow[] = [];
  for (let i = 0; i < stock.length; i++) out.push({ item: stock[i], buy: stationBuyPrice(g, stock[i]), sell: stationSellPrice(g, stock[i]), factor: marketFactor(g, sys, stock[i], hour), stocked: true });
  for (const id in g.state.inv) {
    if (stock.includes(id) || !tradeable(g.content.items[id])) continue;
    out.push({ item: id, buy: B.big(0), sell: stationSellPrice(g, id), factor: marketFactor(g, sys, id, hour), stocked: false });
  }
  return out;
}

function likedBy(g: Game, sys: SystemInfo, def: ItemDef): boolean {
  const faction = sys.station ? g.content.factions?.[sys.station.faction] : undefined;
  return faction !== undefined && Array.isArray(faction.likes) && faction.likes.includes(def.category);
}

function recordTrade(g: Game, sys: SystemInfo, def: ItemDef, delta: number): void {
  const trades = g.state.station.trades;
  trades[def.id] = clamp((trades[def.id] ?? 0) + delta, -1, 1);
  stat(g, "trades");
  if (sys.station && likedBy(g, sys, def)) addRep(g, sys.station.faction, bal(g, "tradeRep", 0.2));
}

/** Buys from the docked station's stock. Needs the credits and the cargo room. */
export function buy(g: Game, item: ItemId, amount: Big | number): ActionResult {
  const s = g.state;
  const st = docked(g);
  if (!st) return fail(s.station.docked ? "noTarget" : "locked");
  const a = toAmount(amount);
  const def = own(g.content.items, item);
  if (!a || !tradeable(def)) return fail("invalid");
  const sys = currentSystem(g);
  if (!stationStock(g, sys).includes(item)) return fail("noTarget");
  const mass = itemMass(g, item);
  if (mass > 0 && B.cmp(B.add(g.rates.cargoUsed, B.mulN(a, mass)), g.rates.cargoCap) > 0) return fail("cargo");
  const cost = B.mul(stationBuyPrice(g, item, a), a);
  if (!canAfford(g, cost)) return fail("credits");
  spend(g, cost);
  addItem(g, item, a);
  // core recounts the hold on its own schedule; until then keep the cached figure honest
  if (mass > 0) g.rates.cargoUsed = B.add(g.rates.cargoUsed, B.mulN(a, mass));
  recordTrade(g, sys, def, pressureOf(g, item, a));
  return OK;
}

/** Sells cargo to the docked station at its current price. */
export function sellAt(g: Game, item: ItemId, amount: Big | number): ActionResult {
  const s = g.state;
  const st = docked(g);
  if (!st) return fail(s.station.docked ? "noTarget" : "locked");
  const a = toAmount(amount);
  const def = own(g.content.items, item);
  if (!a || !tradeable(def)) return fail("invalid");
  if (B.cmp(getItem(g, item), a) < 0) return fail("items");
  const sys = currentSystem(g);
  const income = B.mul(stationSellPrice(g, item, a), a);
  if (!takeItem(g, item, a)) return fail("items");
  addCredits(g, income);
  recordTrade(g, sys, def, -pressureOf(g, item, a));
  emit(g, { t: "sold", credits: income });
  return OK;
}

// ---------- contracts -----------------------------------------------------------------

function offersKey(g: Game, sys: SystemInfo): number {
  return hashSeed(sys.seed, gameDay(g), 0xc0de) & 0x7fffffff;
}

/** Regenerates the offer board when the day or the station changed. */
function refreshOffers(g: Game): void {
  const s = g.state;
  const sys = currentSystem(g);
  if (!sys.station) return;
  const key = offersKey(g, sys);
  if (s.station.offersDay === key) return;
  s.station.offersDay = key;
  const offers: Contract[] = [];
  const rng = new Rng(key);
  const items = g.content.items ?? {};
  const factions = Object.keys(s.station.rep).sort() as FactionId[];
  const ids = Object.keys(items).sort();
  const count = Math.floor(clamp(bal(g, "contractOffers", 3), 0, 6));
  for (let n = 0; n < count; n++) {
    const faction = n === 0 || factions.length === 0 ? sys.station.faction : rng.pick(factions);
    const likes = g.content.factions?.[faction]?.likes ?? [];
    const pool: ItemId[] = [];
    const fallback: ItemId[] = [];
    for (let i = 0; i < ids.length; i++) {
      const def = items[ids[i]];
      if (!tradeable(def) || def.tier > 2) continue;
      if (def.category !== "raw" && def.category !== "refined" && def.category !== "component") continue;
      if (def.category === "raw" && rawUnlockDepth(g.content, def.id) > sys.depth) continue;
      fallback.push(def.id);
      if (likes.includes(def.category)) pool.push(def.id);
    }
    const from = pool.length > 0 ? pool : fallback;
    if (from.length === 0) break;
    const item = rng.pick(from);
    const def = items[item];
    // sized in seconds of mining so the ask stays reachable at any depth
    const secs = rng.range(300, 1800) * (def.category === "raw" ? 1 : def.category === "refined" ? 0.4 : 0.15);
    const need = B.max(B.floor(B.mulN(g.rates.mine, secs)), B.big(20));
    offers.push({
      uid: nextUid(g),
      faction,
      item,
      need,
      have: B.big(0),
      reward: B.mulN(B.mul(need, unitValue(g, def)), rng.range(1.6, 2.2)),
      rep: rng.int(2, 6),
      expires: s.t + DAY * rng.range(1, 2),
      sys: sys.id,
    });
  }
  s.station.offers = offers;
}

export function acceptContract(g: Game, offerIndex: number): ActionResult {
  const st = g.state.station;
  if (!docked(g)) return fail("locked");
  if (!isInt(offerIndex) || offerIndex < 0 || offerIndex >= st.offers.length) return fail("invalid");
  if (st.contracts.length >= bal(g, "contractMax", 5)) return fail("max");
  st.contracts.push(st.offers.splice(offerIndex, 1)[0]);
  return OK;
}

/** True when cargo holds everything a contract still needs. */
export function contractReady(g: Game, c: Contract): boolean {
  return B.cmp(getItem(g, c.item), B.subClamp(c.need, c.have)) >= 0;
}

/** Hands over what cargo holds toward a contract (any station). Completing it pays credits and reputation. */
export function deliverContract(g: Game, uid: number): ActionResult {
  const s = g.state;
  if (!docked(g)) return fail("locked");
  const list = s.station.contracts;
  let at = -1;
  for (let i = 0; i < list.length; i++) if (list[i].uid === uid) at = i;
  if (at < 0) return fail("noTarget");
  const c = list[at];
  const left = B.subClamp(c.need, c.have);
  const give = B.min(left, getItem(g, c.item));
  if (give.m > 0) {
    if (!takeItem(g, c.item, give)) return fail("items");
    c.have = B.add(c.have, give);
  } else if (left.m > 0) {
    return fail("items");
  }
  // float dust from repeated partial deliveries must not keep a contract open
  if (B.cmp(B.mulN(c.have, 1 + 1e-9), c.need) >= 0) {
    list.splice(at, 1);
    addCredits(g, c.reward);
    addRep(g, c.faction, c.rep);
    stat(g, "contracts");
    emit(g, { t: "contractDone", uid: c.uid });
  }
  return OK;
}

/** Drops an accepted contract. Delivered goods are not returned; the faction shrugs it off. */
export function abandonContract(g: Game, uid: number): ActionResult {
  const list = g.state.station.contracts;
  for (let i = 0; i < list.length; i++) {
    if (list[i].uid === uid) {
      addRep(g, list[i].faction, -1);
      list.splice(i, 1);
      return OK;
    }
  }
  return fail("noTarget");
}

// ---------- upgrade shop --------------------------------------------------------------

export function shopLevel(g: Game, id: string): number {
  return Math.max(0, Math.floor(g.state.station.shop[id] ?? 0)) || 0;
}

/** Credits for the next level: N seconds of income with a floor, growing per level owned. */
export function shopCost(g: Game, def: ShopItemDef): Big {
  const base = B.max(incomeSeconds(g, Math.max(0, def.cost)), B.big(Math.max(0, def.costFloor)));
  return B.mul(base, B.powN(Math.max(1, def.costGrowth), shopLevel(g, def.id)));
}

const GRID_MAX = 6;

/**
 * Opens `n` more tech-grid cells, growing the grid up to 6x6 when the hull's own frame is full.
 * Rows are appended first because that keeps every cell index (and so every installed module) in
 * place; only when six rows are not enough does the grid go to full width, which re-wraps the
 * layout once. Returns the number of cells actually opened.
 */
export function openGridCells(g: Game, n: number): number {
  const grid = g.state.grid;
  if (!Array.isArray(grid.cells)) grid.cells = [];
  let w = Math.floor(clamp(grid.w, 1, GRID_MAX));
  let h = Math.floor(clamp(grid.h, 1, GRID_MAX));
  const before = Math.floor(clamp(grid.open, 0, GRID_MAX * GRID_MAX));
  const want = Math.min(GRID_MAX * GRID_MAX, before + Math.max(0, Math.floor(n) || 0));
  if (want <= before) return 0;
  while (w * h < want && h < GRID_MAX) h++;
  if (w * h < want) {
    const old = w * h;
    w = GRID_MAX;
    h = Math.min(GRID_MAX, Math.max(Math.ceil(want / w), Math.ceil(old / w)));
  }
  grid.w = w;
  grid.h = h;
  while (grid.cells.length < w * h) grid.cells.push(0);
  grid.open = Math.min(want, w * h);
  markDirty(g);
  return grid.open - before;
}

/** Why a shop item cannot be bought right now, or null. */
export function shopBlock(g: Game, def: ShopItemDef): "locked" | "requirement" | "max" | "credits" | null {
  const st = docked(g);
  if (!st) return "locked";
  if (def.faction && def.faction !== st.faction) return "requirement";
  if (def.repMin !== undefined && getRep(g, def.faction ?? st.faction) < def.repMin) return "requirement";
  if (shopLevel(g, def.id) >= Math.max(1, def.maxLevel)) return "max";
  if (def.gridSlots && g.state.grid.open >= GRID_MAX * GRID_MAX) return "max";
  if (!canAfford(g, shopCost(g, def))) return "credits";
  return null;
}

/** Shop entries on sale at the docked station (its own faction's stock plus the unaffiliated ones). */
export function shopOffers(g: Game): ShopItemDef[] {
  const st = docked(g);
  const out: ShopItemDef[] = [];
  if (!st) return out;
  const shop = g.content.shop ?? {};
  for (const id in shop) if (!shop[id].faction || shop[id].faction === st.faction) out.push(shop[id]);
  return out;
}

/**
 * Buys one level of a shop entry. Effects apply per level; `gridSlots` opens tech-grid cells;
 * entries with `item` are repeatable supply crates whose level only counts purchases;
 * `fuel_tank` enlarges the tank (see nav.fuelCap).
 */
export function buyShop(g: Game, id: string): ActionResult {
  const s = g.state;
  const def = own(g.content.shop, id);
  if (!def) return fail("invalid");
  const block = shopBlock(g, def);
  if (block) return fail(block);
  spend(g, shopCost(g, def));
  s.station.shop[def.id] = shopLevel(g, def.id) + 1;
  if (def.gridSlots) openGridCells(g, def.gridSlots);
  if (def.item && def.item.n > 0) {
    if (g.content.items[def.item.id]?.category === "module") for (let i = 0; i < Math.min(8, def.item.n); i++) g.api.addModule(def.item.id);
    else addItem(g, def.item.id, def.item.n);
  }
  stat(g, "purchases");
  markDirty(g);
  return OK;
}

// ---------- repair dock ---------------------------------------------------------------

/** 0..1: how much of the hull and the installed modules is missing. */
function damageShare(g: Game): number {
  const s = g.state;
  let missing = 100 - clamp(s.hull.hp, 0, 100);
  let parts = 1;
  for (let i = 0; i < s.modules.length; i++) {
    if (s.modules[i].slot < 0) continue;
    missing += 100 - clamp(s.modules[i].hp, 0, 100);
    parts++;
  }
  return clamp(missing / (parts * 100), 0, 1);
}

/** Credits for a full repair at the dock; zero when nothing is damaged. */
export function repairCost(g: Game): Big {
  const share = damageShare(g);
  if (share <= 0.001) return B.big(0);
  const sys = currentSystem(g);
  return B.mulN(incomeSeconds(g, bal(g, "dockRepairSecs", 30) + bal(g, "dockRepairSecsFull", 270) * share), 1 - 0.15 * repFactor(g, sys));
}

export function repairAtDock(g: Game): ActionResult {
  if (!docked(g)) return fail("locked");
  const cost = repairCost(g);
  if (cost.m <= 0) return fail("max");
  if (!spend(g, cost)) return fail("credits");
  g.api.repairAll(100);
  return OK;
}

// ---------- crew for hire -------------------------------------------------------------

export interface HireOffer {
  index: number;
  seed: number;
  person: Omit<CrewMember, "uid">;
  cost: Big;
  hired: boolean;
}

/** People looking for a berth at the docked station today. */
export function hireOffers(g: Game): HireOffer[] {
  const st = docked(g);
  if (!st) return [];
  const sys = currentSystem(g);
  const day = gameDay(g);
  const count = 2 + ((hashSeed(sys.seed, day, 0x417e) >>> 0) % 2);
  const cost = B.mulN(incomeSeconds(g, bal(g, "hireCostSecs", 600) * (1 + 0.5 * g.state.crew.length)), 1 - 0.15 * repFactor(g, sys));
  const out: HireOffer[] = [];
  for (let i = 0; i < count; i++) {
    const seed = hashSeed(sys.seed, day, i, 0x417e) | 1;
    out.push({ index: i, seed, person: crewFromSeed(g, seed), cost, hired: g.state.flags[F.hirePrefix + i] === day + 1 });
  }
  return out;
}

export function hireCrew(g: Game, index: number): ActionResult {
  const s = g.state;
  if (!docked(g)) return fail("locked");
  const offers = hireOffers(g);
  const offer = isInt(index) ? offers[index] : undefined;
  if (!offer) return fail("invalid");
  if (offer.hired) return fail("noTarget");
  if (s.crew.length >= crewCap(g)) return fail("max");
  if (!canAfford(g, offer.cost)) return fail("credits");
  const uid = addCrewFromSeed(g, offer.seed);
  if (!uid) return fail("max");
  spend(g, offer.cost);
  s.flags[F.hirePrefix + index] = gameDay(g) + 1;
  return OK;
}

// ---------- offline hooks -------------------------------------------------------------

/** "Prices moved while you were away" line for the return screen. */
export function traderHook(g: Game, sys: SystemInfo): L10n | null {
  if (!sys.station) return null;
  return {
    cs: `Stanice ${sys.station.name} mezitím přepsala ceník. Možná i ve váš prospěch.`,
    en: `${sys.station.name} rewrote its price list while you were out. Possibly even in your favour.`,
  };
}

// ---------- system --------------------------------------------------------------------

export const stationSystem: SystemDef = {
  id: "world.station",
  init(g) {
    const s = g.state;
    if (!s.station || typeof s.station !== "object") {
      s.station = { docked: false, rep: { lamplighters: 0, rustborn: 0, ledger: 0 }, contracts: [], offers: [], offersDay: -1, shop: {}, trades: {} };
    }
    const st = s.station;
    if (!st.rep || typeof st.rep !== "object") st.rep = { lamplighters: 0, rustborn: 0, ledger: 0 };
    for (const f of ["lamplighters", "rustborn", "ledger"] as FactionId[]) st.rep[f] = clamp(st.rep[f], -100, 100);
    if (!Array.isArray(st.contracts)) st.contracts = [];
    if (!Array.isArray(st.offers)) st.offers = [];
    if (!st.shop || typeof st.shop !== "object") st.shop = {};
    if (!st.trades || typeof st.trades !== "object") st.trades = {};
    if (!Number.isFinite(st.offersDay)) st.offersDay = -1;
    st.docked = st.docked === true;
    for (const list of [st.contracts, st.offers]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const c = list[i];
        if (!c || !g.content.items[c.item] || !Number.isFinite(c.expires)) {
          list.splice(i, 1);
          continue;
        }
        c.need = B.sanitize(c.need);
        c.have = B.sanitize(c.have);
        c.reward = B.sanitize(c.reward);
      }
    }
  },
  modifiers(g, out) {
    const shop = g.state.station.shop;
    for (const id in shop) {
      const def = g.content.shop?.[id];
      const lvl = shop[id];
      if (!def || !def.effects || !(lvl > 0)) continue;
      for (let i = 0; i < def.effects.length; i++) out.push(scaleEffect(def.effects[i], lvl));
    }
  },
  tick(g) {
    if (!rt(g).slow) return;
    const s = g.state;
    const st = s.station;
    if (st.docked && stationHere(g) === null) st.docked = false;
    if (st.contracts.length > 0) {
      for (let i = st.contracts.length - 1; i >= 0; i--) if (s.t >= st.contracts[i].expires) st.contracts.splice(i, 1);
    }
    if (!st.docked) return;
    // once a minute the market forgets a tenth of what the player did to it; a new day brings a new board
    const minute = Math.floor(s.t / 60);
    const r = rt(g);
    if (minute !== r.marketMinute) {
      r.marketMinute = minute;
      for (const id in st.trades) {
        const v = st.trades[id] * 0.9;
        if (Math.abs(v) < 0.01) delete st.trades[id];
        else st.trades[id] = v;
      }
      refreshOffers(g);
    }
  },
  prestige(g, layer) {
    const st = g.state.station;
    st.docked = false;
    st.contracts = [];
    st.offers = [];
    st.offersDay = -1;
    // a warp keeps the opened grid cells (core does too), so their purchase counts stay with them
    const kept: Record<string, number> = {};
    if (layer === 1) for (const id in st.shop) if (g.content.shop?.[id]?.gridSlots) kept[id] = st.shop[id];
    st.shop = kept;
    st.trades = {};
    g.state.nav.fuel = Math.min(g.state.nav.fuel, fuelCap(g));
    clearFlagsWithPrefix(g, F.hirePrefix);
    if (layer >= 2) for (const f in st.rep) st.rep[f as FactionId] = st.rep[f as FactionId] * 0.5;
  },
};

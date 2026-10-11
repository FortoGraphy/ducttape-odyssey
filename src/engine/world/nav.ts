// Navigation: the current system, hyperdrive charge, jumps along lane links, fuel, and the
// stranded check that starts the noFuel failure.
import * as B from "../big";
import { emit, fail, getItem, hasFeature, markDirty, OK, stat, statMax, takeItem } from "../kernel";
import type { ActionResult, ContentDB, Game, ItemId, StarType, SystemDef, SystemInfo } from "../types";
import { galaxyDepth, getSystem, hasStation, lanesAt, depthLinks } from "./galaxy";
import { atLeast, bal, clamp, clearFlag, clearFlagsWithPrefix, F, isInt, rt } from "./util";

// ---------- lookups -------------------------------------------------------------------

export function systemAt(g: Game, depth: number, lane: number): SystemInfo {
  return getSystem(g.content, g.state.seed, g.state.nav.g, depth, lane);
}

/** The system the ship is in. Cached per game by indices, so it is free to call every tick. */
export function currentSystem(g: Game): SystemInfo {
  const r = rt(g);
  const nav = g.state.nav;
  if (r.sys === null || r.sysG !== nav.g || r.sysDepth !== nav.depth || r.sysLane !== nav.lane || r.sysSeed !== g.state.seed) {
    r.sys = getSystem(g.content, g.state.seed, nav.g, nav.depth, nav.lane);
    r.sysG = nav.g;
    r.sysDepth = nav.depth;
    r.sysLane = nav.lane;
    r.sysSeed = g.state.seed;
    r.hazard = 1 + r.sys.hazards.length * bal(g, "hazardWear", 0.15);
  }
  return r.sys;
}

export function coreDepth(g: Game): number {
  return galaxyDepth(g.content, g.state.nav.g);
}

export function visitedKey(galaxy: number, depth: number, lane: number): string {
  return galaxy + ":" + depth + ":" + lane;
}

export function isVisited(g: Game, depth: number, lane: number): boolean {
  return g.state.nav.visited[visitedKey(g.state.nav.g, depth, lane)] === 1;
}

/** Tank size: the base tank plus the station's `fuel_tank` upgrade levels. */
export function fuelCap(g: Game): number {
  const tanks = Math.max(0, Math.floor(g.state.station?.shop?.fuel_tank ?? 0)) || 0;
  return Math.max(1, bal(g, "fuelCap", 30) + tanks * bal(g, "fuelTankPerLevel", 10));
}

/** Fuel for a full-price jump. */
export function baseJumpCost(g: Game): number {
  return Math.max(0, bal(g, "fuelPerJump", 6) * g.mods.fuelUse);
}

/** Fuel to jump to a system: half price when it has been visited before. */
export function jumpCost(g: Game, depth: number, lane: number): number {
  const base = baseJumpCost(g);
  return isVisited(g, depth, lane) ? base * clamp(bal(g, "backtrackFuelFactor", 0.5), 0, 1) : base;
}

function validTarget(g: Game, depth: unknown, lane: unknown): boolean {
  if (!isInt(depth) || !isInt(lane) || depth < 0 || lane < 0) return false;
  const core = coreDepth(g);
  return depth <= core && lane < lanesAt(g.state.seed, g.state.nav.g, depth, core);
}

/** True when a lane link joins the current system and the target (forward or back). */
export function isLinked(g: Game, depth: number, lane: number): boolean {
  if (!validTarget(g, depth, lane)) return false;
  const cur = currentSystem(g);
  if (depth === cur.depth + 1) return cur.links.includes(lane);
  if (depth === cur.depth - 1) return depthLinks(g.state.seed, g.state.nav.g, depth, coreDepth(g))[lane].includes(cur.lane);
  return false;
}

function jumpBlocked(g: Game): boolean {
  const f = g.state.failure;
  return f !== null && g.content.failures[f.kind]?.blocksJump === true;
}

export interface JumpTarget {
  depth: number;
  lane: number;
  id: string;
  name: string;
  star: StarType;
  station: boolean;
  anomaly: boolean;
  visited: boolean;
  back: boolean;
  cost: number;
  affordable: boolean;
}

/** Systems one jump away (forward links first, then the way back), for the map. */
export function reachable(g: Game): JumpTarget[] {
  const out: JumpTarget[] = [];
  const cur = currentSystem(g);
  const nav = g.state.nav;
  const push = (depth: number, lane: number, back: boolean): void => {
    const sys = systemAt(g, depth, lane);
    const cost = jumpCost(g, depth, lane);
    out.push({
      depth,
      lane,
      id: sys.id,
      name: sys.name,
      star: sys.star,
      station: sys.station !== null,
      anomaly: sys.anomaly,
      visited: isVisited(g, depth, lane),
      back,
      cost,
      affordable: nav.fuel >= cost - 1e-9,
    });
  };
  for (let i = 0; i < cur.links.length; i++) push(cur.depth + 1, cur.links[i], false);
  if (cur.depth > 0) {
    const core = coreDepth(g);
    const prev = depthLinks(g.state.seed, nav.g, cur.depth - 1, core);
    for (let lane = 0; lane < prev.length; lane++) if (prev[lane].includes(cur.lane)) push(cur.depth - 1, lane, true);
  }
  return out;
}

export interface RouteStep {
  depth: number;
  lane: number;
  station: boolean;
}

/**
 * Suggested lanes toward the core: within a look-ahead window it prefers the path that passes
 * the most stations (fuel and repairs), ties broken toward the straightest lane.
 */
export function routeToCore(g: Game, maxSteps = 12): RouteStep[] {
  const out: RouteStep[] = [];
  const nav = g.state.nav;
  const seed = g.state.seed;
  const core = coreDepth(g);
  const steps = Math.floor(clamp(maxSteps, 1, 64));
  const horizon = Math.min(core, nav.depth + Math.max(steps, 24));
  if (nav.depth >= core) return out;
  // score[d - nav.depth][lane] = stations on the best path from (d, lane) to the horizon
  const score: number[][] = [];
  for (let d = horizon; d >= nav.depth; d--) {
    const lanes = lanesAt(seed, nav.g, d, core);
    const links = d < horizon ? depthLinks(seed, nav.g, d, core) : null;
    const row: number[] = [];
    for (let lane = 0; lane < lanes; lane++) {
      let best = 0;
      if (links) {
        const next = score[d + 1 - nav.depth];
        for (let i = 0; i < links[lane].length; i++) best = Math.max(best, next[links[lane][i]] ?? 0);
      }
      row.push(best + (hasStation(g.content, seed, nav.g, d, lane) ? 1 : 0));
    }
    score[d - nav.depth] = row;
  }
  let lane = clamp(nav.lane, 0, lanesAt(seed, nav.g, nav.depth, core) - 1);
  for (let d = nav.depth; d < horizon && out.length < steps; d++) {
    const links = depthLinks(seed, nav.g, d, core)[lane];
    const next = score[d + 1 - nav.depth];
    let pick = links[0];
    for (let i = 1; i < links.length; i++) {
      const a = next[links[i]];
      const b = next[pick];
      if (a > b || (a === b && Math.abs(links[i] - lane) < Math.abs(pick - lane))) pick = links[i];
    }
    lane = pick;
    out.push({ depth: d + 1, lane, station: hasStation(g.content, seed, nav.g, d + 1, lane) });
  }
  return out;
}

// ---------- fuel ----------------------------------------------------------------------

interface FuelItem {
  id: ItemId;
  fuel: number;
}

const fuelItemCache = new WeakMap<ContentDB, FuelItem[]>();

/** Items that can be poured into the tank, smallest unit first. */
export function fuelItems(g: Game): FuelItem[] {
  const hit = fuelItemCache.get(g.content);
  if (hit) return hit;
  const out: FuelItem[] = [];
  const items = g.content.items ?? {};
  const perFuel = Math.max(0.01, bal(g, "fuelPerItem", 1));
  const perCell = Math.max(0.01, bal(g, "fuelPerCell", 8));
  for (const id in items) {
    const c = items[id].consumable;
    let fuel = 0;
    if (c && c.kind === "fuel") fuel = typeof c.fuel === "number" && c.fuel > 0 ? c.fuel : id === "fuel" ? perFuel : perCell;
    else if (id === "fuel") fuel = perFuel;
    else if (id === "fuel_cell") fuel = perCell;
    if (fuel > 0 && Number.isFinite(fuel)) out.push({ id, fuel });
  }
  out.sort((a, b) => a.fuel - b.fuel || (a.id < b.id ? -1 : 1));
  fuelItemCache.set(g.content, out);
  return out;
}

/** Fuel units sitting in cargo as fuel items (capped: only "enough or not" matters). */
export function fuelInCargo(g: Game): number {
  const list = fuelItems(g);
  let total = 0;
  for (let i = 0; i < list.length; i++) {
    const have = getItem(g, list[i].id);
    if (have.m > 0) total += Math.min(1e6, B.toNumber(have)) * list[i].fuel;
  }
  return total;
}

/** Pours fuel items from cargo into the tank until it is full. */
export function refuel(g: Game): ActionResult {
  const nav = g.state.nav;
  const cap = fuelCap(g);
  if (nav.fuel >= cap - 1e-9) return fail("max");
  const list = fuelItems(g);
  let any = false;
  let poured = false;
  for (let i = 0; i < list.length; i++) {
    const have = getItem(g, list[i].id);
    if (have.m <= 0) continue;
    any = true;
    const units = Math.min(Math.floor(Math.min(1e9, B.toNumber(have))), Math.floor((cap - nav.fuel) / list[i].fuel + 1e-9));
    if (units <= 0 || !takeItem(g, list[i].id, units)) continue;
    nav.fuel = Math.min(cap, nav.fuel + units * list[i].fuel);
    poured = true;
  }
  if (!any) return fail("items");
  if (!poured) {
    // every unit on board is bigger than the gap: top off with one and accept the spill
    for (let i = 0; i < list.length; i++) {
      if (B.gteN(getItem(g, list[i].id), 1) && takeItem(g, list[i].id, 1)) {
        nav.fuel = cap;
        poured = true;
        break;
      }
    }
    if (!poured) return fail("items");
  }
  rt(g).drySince = 0;
  return OK;
}

/** Whether the crew can produce fuel here: a known fuel recipe whose inputs are on board or mined locally. */
function canMakeFuel(g: Game): boolean {
  const s = g.state;
  const fuels = fuelItems(g);
  if (fuels.length === 0) return false;
  const mix = currentSystem(g).resources;
  for (const id in s.recipes) {
    const def = g.content.recipes[id];
    if (!def || !(s.decks[def.station]?.level > 0)) continue;
    let makes = false;
    for (let i = 0; i < fuels.length; i++) if ((def.outputs[fuels[i].id] ?? 0) > 0) makes = true;
    if (!makes) continue;
    let ok = true;
    for (const input in def.inputs) {
      if (B.gteN(getItem(g, input), def.inputs[input])) continue;
      let mined = false;
      for (let i = 0; i < mix.length; i++) if (mix[i].item === input) mined = true;
      if (!mined || g.rates.mine.m <= 0) ok = false;
    }
    if (ok) return true;
  }
  return false;
}

/** Cheapest way forward from here, or Infinity when there is none (the core). */
function cheapestJump(g: Game): number {
  const cur = currentSystem(g);
  let min = Infinity;
  for (let i = 0; i < cur.links.length; i++) min = Math.min(min, jumpCost(g, cur.depth + 1, cur.links[i]));
  return min;
}

/** 1 Hz: a ship that cannot pay for any jump and has no way to get fuel starts the noFuel failure. */
function checkStranded(g: Game): void {
  const s = g.state;
  const r = rt(g);
  if (s.failure !== null || s.nav.jump !== null || !hasFeature(g, "nav")) {
    r.drySince = 0;
    return;
  }
  const cur = currentSystem(g);
  const need = cheapestJump(g);
  if (cur.isCore || cur.station !== null || !Number.isFinite(need) || s.nav.fuel + fuelInCargo(g) >= need - 1e-9 || canMakeFuel(g)) {
    r.drySince = 0;
    return;
  }
  if (r.drySince === 0) {
    r.drySince = s.t;
    g.api.say("lowFuel");
    return;
  }
  if (s.t - r.drySince >= bal(g, "noFuelGrace", 20)) {
    r.drySince = 0;
    g.api.startFailure("noFuel");
  }
}

// ---------- actions -------------------------------------------------------------------

/** Starts charging the hyperdrive. The charge is kept until the next jump. */
export function chargeJump(g: Game): ActionResult {
  const s = g.state;
  if (!hasFeature(g, "nav")) return fail("locked");
  if (s.nav.jump !== null) return fail("busy");
  if (jumpBlocked(g)) return fail("failure");
  if (s.nav.charge >= 1) return fail("max");
  if (s.nav.cooldownUntil > s.t) return fail("cooldown");
  s.flags[F.charging] = 1;
  return OK;
}

export function isCharging(g: Game): boolean {
  return g.state.flags[F.charging] === 1;
}

/** Seconds a full charge takes right now. */
export function chargeSeconds(g: Game): number {
  return Math.max(0.1, bal(g, "jumpChargeSecs", 45)) / atLeast(g.mods.jumpCharge, 0.01);
}

/** Jumps along a lane link. Needs a full charge, no cooldown and enough fuel. */
export function jumpTo(g: Game, depth: number, lane: number): ActionResult {
  const s = g.state;
  const nav = s.nav;
  if (!hasFeature(g, "nav")) return fail("locked");
  if (nav.jump !== null) return fail("busy");
  if (jumpBlocked(g)) return fail("failure");
  if (!validTarget(g, depth, lane)) return fail("invalid");
  if (!isLinked(g, depth, lane)) return fail("noTarget");
  if (nav.cooldownUntil > s.t) return fail("cooldown");
  if (nav.charge < 1) return fail("requirement");
  const cost = jumpCost(g, depth, lane);
  if (nav.fuel < cost - 1e-9) return fail("fuel");
  nav.fuel = Math.max(0, nav.fuel - cost);
  nav.charge = 0;
  clearFlag(g, F.charging);
  leaveSystem(g);
  nav.jump = { depth, lane, until: s.t + Math.max(0, bal(g, "jumpTravelSecs", 6)) };
  emit(g, { t: "jumpStart" });
  g.api.say("jump");
  return OK;
}

/** Everything tied to the system being left: docking, the running scan, probes on its planets. */
function leaveSystem(g: Game): void {
  const s = g.state;
  const cur = currentSystem(g);
  s.station.docked = false;
  s.station.trades = {};
  clearFlag(g, F.scan);
  clearFlagsWithPrefix(g, F.hirePrefix);
  for (let i = 0; i < cur.planets.length; i++) {
    const p = s.planets[cur.planets[i].id];
    if (p && p.probes > 0) p.probes = 0;
  }
}

function arrive(g: Game): void {
  const s = g.state;
  const nav = s.nav;
  const jump = nav.jump;
  if (!jump) return;
  nav.jump = null;
  nav.depth = jump.depth;
  nav.lane = jump.lane;
  nav.cooldownUntil = s.t + Math.max(0, bal(g, "jumpCooldownSecs", 60) * g.mods.jumpCooldown);
  const key = visitedKey(nav.g, nav.depth, nav.lane);
  const fresh = nav.visited[key] !== 1;
  nav.visited[key] = 1;
  if (nav.depth > nav.maxDepth) nav.maxDepth = nav.depth;
  stat(g, "jumps");
  statMax(g, "depthMax", nav.depth);
  if (fresh) stat(g, "systemsVisited");
  const sys = currentSystem(g);
  markDirty(g); // mining mix, richness and hazards changed
  emit(g, { t: "jumpEnd", system: sys.id });
  g.api.discover("system:" + sys.id);
  g.api.say("arrival", { name: sys.name });
  if (nav.fuel + fuelInCargo(g) < baseJumpCost(g) * 2 && !sys.isCore) g.api.say("lowFuel");
}

/** Puts the ship at the entry system of the galaxy matching the warp count. */
export function resetNav(g: Game): void {
  const s = g.state;
  const galaxy = Math.max(0, Math.floor(s.prestige?.warps ?? 0)) || 0;
  s.nav = {
    g: galaxy,
    depth: 0,
    lane: 0,
    fuel: fuelCap(g) * clamp(bal(g, "startFuelFrac", 1), 0, 1),
    charge: 0,
    cooldownUntil: 0,
    jump: null,
    visited: { [visitedKey(galaxy, 0, 0)]: 1 },
    maxDepth: 0,
  };
  clearFlag(g, F.charging);
  clearFlag(g, F.scan);
  clearFlagsWithPrefix(g, F.hirePrefix);
  rt(g).drySince = 0;
  markDirty(g);
}

// ---------- system --------------------------------------------------------------------

function initNav(g: Game): void {
  const s = g.state;
  const fresh = s.t === 0 && s.played === 0;
  if (!s.nav || typeof s.nav !== "object") {
    resetNav(g);
  } else {
    const nav = s.nav;
    const core = galaxyDepth(g.content, Number.isFinite(nav.g) ? nav.g : 0);
    nav.g = Number.isFinite(nav.g) ? Math.max(0, Math.floor(nav.g)) : 0;
    nav.depth = Math.floor(clamp(nav.depth, 0, core));
    nav.lane = Math.floor(clamp(nav.lane, 0, lanesAt(s.seed, nav.g, nav.depth, core) - 1));
    nav.fuel = clamp(nav.fuel, 0, fuelCap(g));
    nav.charge = clamp(nav.charge, 0, 1);
    nav.cooldownUntil = Number.isFinite(nav.cooldownUntil) ? nav.cooldownUntil : 0;
    if (!nav.visited || typeof nav.visited !== "object") nav.visited = {};
    nav.visited[visitedKey(nav.g, nav.depth, nav.lane)] = 1;
    nav.maxDepth = Math.max(nav.depth, Number.isFinite(nav.maxDepth) ? nav.maxDepth : 0);
    if (nav.jump && !(isInt(nav.jump.depth) && isInt(nav.jump.lane) && Number.isFinite(nav.jump.until))) nav.jump = null;
    // a new game starts with a full tank; the kernel's blank state has none
    if (fresh && nav.fuel === 0) nav.fuel = fuelCap(g) * clamp(bal(g, "startFuelFrac", 1), 0, 1);
  }
  g.api.currentSystem = () => currentSystem(g);
}

function tickNav(g: Game, dt: number): void {
  const s = g.state;
  const nav = s.nav;
  if (nav.jump !== null) {
    if (s.t >= nav.jump.until) arrive(g);
    return;
  }
  if (s.flags[F.charging] === 1) {
    if (jumpBlocked(g)) {
      clearFlag(g, F.charging);
    } else {
      nav.charge += dt / chargeSeconds(g);
      if (nav.charge >= 1) {
        nav.charge = 1;
        clearFlag(g, F.charging);
      }
    }
  }
  if (rt(g).slow) checkStranded(g);
}

export const navSystem: SystemDef = {
  id: "world.nav",
  init: initNav,
  tick: tickNav,
  offline(g, _credited, _eff, report) {
    // a charge that was started keeps building while the app is closed: timers run for the whole absence
    const nav = g.state.nav;
    if (nav.jump !== null || g.state.flags[F.charging] !== 1 || jumpBlocked(g)) return;
    nav.charge += Math.max(0, report.seconds) / chargeSeconds(g);
    if (!(nav.charge < 1)) {
      nav.charge = 1;
      clearFlag(g, F.charging);
    }
  },
  prestige(g) {
    resetNav(g);
  },
};

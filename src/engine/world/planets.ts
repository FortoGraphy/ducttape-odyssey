// Planet actions in the current system: orbital scans, mining probes, outposts, and the wear
// factor of local hazards.
import * as B from "../big";
import { addItem, fail, getStat, hasFeature, hasItems, OK, stat, takeItems } from "../kernel";
import type { ActionResult, Game, ItemId, OfflineReport, PlanetInfo, PlanetState, SystemDef } from "../types";
import { faunaKey, floraKey } from "./galaxy";
import { currentSystem } from "./nav";
import { atLeast, bal, cargoHasRoom, clamp, clearFlag, F, isInt, itemMass, rt } from "./util";

/** A planet of the current system by id, or null. */
export function findPlanet(g: Game, planetId: string): PlanetInfo | null {
  if (typeof planetId !== "string") return null;
  const planets = currentSystem(g).planets;
  for (let i = 0; i < planets.length; i++) if (planets[i].id === planetId) return planets[i];
  return null;
}

function planetState(g: Game, id: string): PlanetState {
  const planets = g.state.planets;
  let p = planets[id];
  if (!p) {
    p = { scan: 0, probes: 0, outpost: 0 };
    planets[id] = p;
  }
  return p;
}

export function isScanned(g: Game, planetId: string): boolean {
  return (g.state.planets[planetId]?.scan ?? 0) >= 1;
}

/** What probes and outposts on a planet bring in: its special resource, else its main one. */
export function planetYieldItem(planet: PlanetInfo): ItemId | null {
  return planet.special ?? planet.resources[0] ?? null;
}

// ---------- scan ----------------------------------------------------------------------

/** Seconds a full orbital scan takes right now. */
export function scanSeconds(g: Game): number {
  return Math.max(1, bal(g, "scanSecs", 60)) / atLeast(g.mods.scanSpeed, 0.01);
}

/** The planet being scanned, or null. */
export function scanTarget(g: Game): PlanetInfo | null {
  const i = g.state.flags[F.scan];
  if (!(i >= 1)) return null;
  return currentSystem(g).planets[i - 1] ?? null;
}

/** Points the scanner at a planet of the current system (replaces a running scan, progress is kept per planet). */
export function startScan(g: Game, planetId: string): ActionResult {
  if (!hasFeature(g, "scan")) return fail("locked");
  if (g.state.nav.jump !== null) return fail("busy");
  const planet = findPlanet(g, planetId);
  if (!planet) return fail("noTarget");
  const p = planetState(g, planet.id);
  if (p.scan >= 1) return fail("max");
  g.state.flags[F.scan] = planet.index + 1;
  return OK;
}

export function cancelScan(g: Game): ActionResult {
  if (!(g.state.flags[F.scan] >= 1)) return fail("noTarget");
  clearFlag(g, F.scan);
  return OK;
}

function completeScan(g: Game, planet: PlanetInfo, p: PlanetState): void {
  p.scan = 1;
  clearFlag(g, F.scan);
  stat(g, "planetsScanned");
  if (g.offline) rt(g).offlineScan = planet.name;
  g.api.discover("planet:" + planet.id);
  for (let i = 0; i < planet.fauna; i++) g.api.discover(faunaKey(planet.id, i));
  for (let i = 0; i < planet.flora; i++) g.api.discover(floraKey(planet.id, i));
}

function advanceScan(g: Game, fraction: number): void {
  const planet = scanTarget(g);
  if (!planet) {
    if (g.state.flags[F.scan] !== undefined) clearFlag(g, F.scan);
    return;
  }
  const p = planetState(g, planet.id);
  p.scan = clamp(p.scan + fraction, 0, 1);
  if (p.scan >= 1) completeScan(g, planet, p);
}

// ---------- probes --------------------------------------------------------------------

/** Probes deployed on planets of the current system. */
export function probesUsed(g: Game): number {
  const planets = currentSystem(g).planets;
  let n = 0;
  for (let i = 0; i < planets.length; i++) n += g.state.planets[planets[i].id]?.probes ?? 0;
  return n;
}

/** Sets how many probe drones work a scanned planet. Limited by `state.drones.probe` across the system. */
export function setProbes(g: Game, planetId: string, n: number): ActionResult {
  if (!hasFeature(g, "probes")) return fail("locked");
  if (!isInt(n) || n < 0) return fail("invalid");
  const planet = findPlanet(g, planetId);
  if (!planet) return fail("noTarget");
  if (!isScanned(g, planet.id)) return fail("requirement");
  const p = planetState(g, planet.id);
  const available = Math.max(0, Math.floor(g.state.drones.probe || 0));
  if (probesUsed(g) - p.probes + n > available) return fail("max");
  p.probes = n;
  return OK;
}

/** Fraction of the mining rate one probe brings in. */
export function probeRate(g: Game): number {
  return Math.max(0, bal(g, "probeYield", 0.04) * g.mods.probeYield);
}

// ---------- outposts ------------------------------------------------------------------

const OUTPOST_BASE: Record<ItemId, number> = { plating: 12, circuit: 6, power_cell: 3 };

/** Components for the next outpost: the base kit grows 50 % per outpost already standing. */
export function outpostCost(g: Game): Record<ItemId, number> {
  const growth = Math.pow(Math.max(1, bal(g, "outpostCostGrowth", 1.5)), Math.min(40, g.state.outposts.length));
  const scale = Math.max(0, bal(g, "outpostCostScale", 1));
  const out: Record<ItemId, number> = {};
  for (const id in OUTPOST_BASE) out[id] = Math.max(1, Math.ceil(OUTPOST_BASE[id] * growth * scale));
  return out;
}

/** Builds an outpost on a scanned planet. It yields for the rest of this galaxy run, wherever the ship is. */
export function buildOutpost(g: Game, planetId: string): ActionResult {
  if (!hasFeature(g, "outposts")) return fail("locked");
  const planet = findPlanet(g, planetId);
  if (!planet) return fail("noTarget");
  if (!isScanned(g, planet.id)) return fail("requirement");
  const p = planetState(g, planet.id);
  if (p.outpost === 1) return fail("max");
  if (g.state.outposts.length >= bal(g, "outpostMax", 12)) return fail("max");
  const item = planetYieldItem(planet);
  if (!item) return fail("noTarget");
  const cost = outpostCost(g);
  if (!hasItems(g, cost)) return fail("items");
  takeItems(g, cost);
  p.outpost = 1;
  g.state.outposts.push({ planet: planet.id, name: planet.name, item, rate: Math.max(0, bal(g, "outpostRate", 0.02)) });
  stat(g, "outposts");
  return OK;
}

// ---------- hazards -------------------------------------------------------------------

/** Wear multiplier of the current system's hazards (>= 1). */
export function hazardFactor(g: Game): number {
  currentSystem(g);
  const h = rt(g).hazard;
  return h >= 1 ? h : 1;
}

// ---------- yields --------------------------------------------------------------------

function yieldItem(g: Game, item: ItemId, perSecond: number, seconds: number, report: OfflineReport | null): void {
  if (!(perSecond > 0) || g.rates.mine.m <= 0) return;
  const mass = itemMass(g, item);
  let amount = B.mulN(g.rates.mine, perSecond * seconds);
  if (mass > 0) {
    if (!cargoHasRoom(g)) return;
    // never push the hold past its capacity in one step (long offline spans)
    amount = B.min(amount, B.divN(B.subClamp(g.rates.cargoCap, g.rates.cargoUsed), mass));
  }
  if (amount.m <= 0) return;
  addItem(g, item, amount);
  if (report) report.items[item] = report.items[item] ? B.add(report.items[item], amount) : amount;
}

function runYields(g: Game, seconds: number, report: OfflineReport | null): void {
  const s = g.state;
  if (s.nav.jump === null && s.drones.probe > 0) {
    const planets = currentSystem(g).planets;
    const rate = probeRate(g);
    for (let i = 0; i < planets.length; i++) {
      const p = s.planets[planets[i].id];
      if (!p || !(p.probes > 0)) continue;
      const item = planetYieldItem(planets[i]);
      if (item) yieldItem(g, item, rate * p.probes, seconds, report);
    }
  }
  const outposts = s.outposts;
  if (outposts.length > 0) {
    const mul = g.mods.outpostYield;
    for (let i = 0; i < outposts.length; i++) yieldItem(g, outposts[i].item, outposts[i].rate * mul, seconds, report);
  }
}

// ---------- system --------------------------------------------------------------------

function initPlanets(g: Game): void {
  const s = g.state;
  if (!s.planets || typeof s.planets !== "object") s.planets = {};
  if (!Array.isArray(s.outposts)) s.outposts = [];
  for (const id in s.planets) {
    const p = s.planets[id];
    p.scan = clamp(p.scan, 0, 1);
    p.probes = Math.max(0, Math.floor(Number.isFinite(p.probes) ? p.probes : 0));
    p.outpost = p.outpost === 1 ? 1 : 0;
  }
  g.api.hazardFactor = () => hazardFactor(g);
}

function tickPlanets(g: Game, dt: number): void {
  const s = g.state;
  const r = rt(g);
  if (s.flags[F.scan] >= 1 && s.nav.jump === null) advanceScan(g, dt / scanSeconds(g));
  if (!r.slow) return;
  // a scanner pulse (core) gives the running scan a push
  const pulses = getStat(g, "pulses");
  if (r.pulses >= 0 && pulses > r.pulses && s.flags[F.scan] >= 1) advanceScan(g, bal(g, "pulseScanBoost", 0.15) * Math.min(3, pulses - r.pulses));
  r.pulses = pulses;
  // probes recalled by a shrinking hangar
  if (s.drones.probe >= 0 && probesUsed(g) > s.drones.probe) {
    const planets = currentSystem(g).planets;
    let extra = probesUsed(g) - Math.floor(s.drones.probe);
    for (let i = planets.length - 1; i >= 0 && extra > 0; i--) {
      const p = s.planets[planets[i].id];
      if (!p || p.probes <= 0) continue;
      const take = Math.min(p.probes, extra);
      p.probes -= take;
      extra -= take;
    }
  }
  runYields(g, 1, null);
}

export const planetSystem: SystemDef = {
  id: "world.planets",
  init: initPlanets,
  tick: tickPlanets,
  offline(g, seconds, eff, report) {
    const s = g.state;
    if (s.flags[F.scan] >= 1) advanceScan(g, report.seconds / scanSeconds(g));
    if (!s.failure) runYields(g, seconds * eff, report);
  },
  prestige(g) {
    g.state.planets = {};
    g.state.outposts = [];
    clearFlag(g, F.scan);
  },
};

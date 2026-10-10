// Small self-contained ContentDB for the core tests: the real content is written by another agent,
// so nothing here depends on it. Numbers follow docs/GDD.md where the GDD gives them.
import { coreSystems, syncRates } from "../../src/engine/core";
import * as B from "../../src/engine/big";
import { createGame, tick } from "../../src/engine/kernel";
import {
  DECK_IDS,
  type Balance,
  type ContentDB,
  type DeckCurve,
  type DeckDef,
  type DeckId,
  type FailureDef,
  type Game,
  type GameState,
  type ItemCategory,
  type ItemDef,
  type ModuleFamily,
  type RecipeDef,
  type StatKey,
  type SystemInfo,
} from "../../src/engine/types";

const L = (en: string) => ({ cs: en, en });

function item(id: string, tier: ItemDef["tier"], category: ItemCategory, value: number, extra: Partial<ItemDef> = {}): ItemDef {
  return { id, tier, category, name: L(id), desc: L(id), value, icon: id, ...extra };
}

const FAMILY_STAT: Record<ModuleFamily, StatKey> = {
  laser: "mineRate",
  engine: "jumpCharge",
  shield: "hullMax",
  scanner: "scanSpeed",
  reactor: "powerOut",
  cargo: "cargoCap",
  repair: "repairSpeed",
  life: "moraleGain",
};

function moduleItem(family: ModuleFamily): ItemDef {
  return item(`mod_${family}_mk1`, 3, "module", 500, {
    mass: 0,
    module: { family, mk: 1, effects: [{ stat: FAMILY_STAT[family], add: 0.2 }], wear: 5, power: family === "reactor" ? -20 : 4 },
  });
}

const items: Record<string, ItemDef> = {};
for (const it of [
  item("scrap", 0, "raw", 1),
  item("ice", 0, "raw", 1.2),
  item("silicates", 0, "raw", 1.5),
  item("organics", 0, "raw", 2),
  item("alloy", 1, "refined", 5),
  item("water", 1, "refined", 3),
  item("slag", 1, "refined", 0.5),
  item("circuit", 2, "component", 30),
  item("plating", 2, "component", 40),
  item("duct_tape", 1, "consumable", 8, { consumable: { kind: "repair", repairPct: 15, repairCap: 60 } }),
  item("spare_parts", 2, "consumable", 40, { consumable: { kind: "repair", repairPct: 40, repairCap: 90 } }),
  item("nano_gel", 3, "consumable", 400, { consumable: { kind: "repair", repairPct: 100, repairCap: 100 } }),
  item("coffee", 1, "consumable", 4, { consumable: { kind: "coffee", morale: 2 } }),
  item("mega_gate", 4, "mega", 1e6, { mass: 0 }),
  item("shipyard", 4, "mega", 2e6, { mass: 0 }),
  item("wormhole_gate", 4, "mega", 3e6, { mass: 0 }),
  item("relic", 2, "artifact", 100, { mass: 0 }),
  ...(["laser", "engine", "shield", "scanner", "reactor", "cargo", "repair", "life"] as ModuleFamily[]).map(moduleItem),
]) {
  items[it.id] = it;
}

function deck(id: DeckId, base: number, curve: DeckCurve, baseCost: number, costGrowth: number, power: number, unlock: number, startLevel = 0): DeckDef {
  return { id, name: L(id), desc: L(id), icon: id, unit: L("u"), base, curve, baseCost, costGrowth, power, unlock: { credits: unlock }, startLevel };
}

const decks = {
  mining: deck("mining", 1, "exp", 4, 1.07, 1, 0, 1),
  lift: deck("lift", 1.2, "exp", 6, 1.075, 1, 0, 1),
  cargo: deck("cargo", 400, "exp", 10, 1.08, 0.5, 0, 1),
  refinery: deck("refinery", 1, "exp", 40, 1.09, 2, 60),
  reactor: deck("reactor", 14, "lin", 120, 1.1, 0, 250),
  bridge: deck("bridge", 0.02, "lin", 400, 1.1, 1, 900),
  fabricator: deck("fabricator", 1, "exp", 1500, 1.1, 3, 4000),
  workshop: deck("workshop", 1, "exp", 4000, 1.1, 3, 12000),
  hangar: deck("hangar", 1, "lin", 12000, 1.11, 2, 40000),
  lab: deck("lab", 0.2, "exp", 40000, 1.11, 3, 150000),
  quarters: deck("quarters", 1, "lin", 150000, 1.12, 1, 600000),
  observatory: deck("observatory", 0.1, "soft", 600000, 1.12, 2, 2.5e6),
  greenhouse: deck("greenhouse", 0.05, "exp", 2e6, 1.1, 2, 1e7),
} as Record<DeckId, DeckDef>;
decks.fabricator.unlock.deck = { id: "refinery", level: 2 };

function recipe(id: string, station: RecipeDef["station"], tier: RecipeDef["tier"], inputs: Record<string, number>, outputs: Record<string, number>, time: number, unlock: RecipeDef["unlock"] = { start: true }, byproducts?: RecipeDef["byproducts"]): RecipeDef {
  return { id, station, tier, inputs, outputs, time, unlock, byproducts };
}

const recipes: Record<string, RecipeDef> = {};
for (const r of [
  recipe("r_alloy", "refinery", 1, { scrap: 2 }, { alloy: 1 }, 4, { start: true }, [{ item: "slag", amount: 1, chance: 0.25 }]),
  recipe("r_water", "refinery", 1, { ice: 1 }, { water: 1 }, 2),
  recipe("r_circuit", "fabricator", 2, { alloy: 2, silicates: 1 }, { circuit: 1 }, 6),
  recipe("r_laser", "fabricator", 3, { circuit: 2, alloy: 3 }, { mod_laser_mk1: 1 }, 10),
  recipe("r_tape", "workshop", 1, { scrap: 1, water: 1 }, { duct_tape: 1 }, 3),
  recipe("r_plating", "fabricator", 2, { alloy: 3 }, { plating: 1 }, 5, { deck: { id: "fabricator", level: 5 } }),
  recipe("r_shield", "fabricator", 3, { plating: 2 }, { mod_shield_mk1: 1 }, 10, { blueprint: true }),
  recipe("r_gate", "workshop", 4, { plating: 5 }, { mega_gate: 1 }, 60, { blueprint: true }),
  recipe("r_shipyard", "workshop", 4, { plating: 2 }, { shipyard: 1 }, 5, { chapter: 8 }),
  recipe("r_wormhole", "workshop", 4, { plating: 2 }, { wormhole_gate: 1 }, 5, { chapter: 8 }),
]) {
  recipes[r.id] = r;
}

const failure = (id: FailureDef["id"], blocksDecks: DeckId[]): FailureDef => ({
  id,
  name: L(id),
  desc: L(id),
  effects: [],
  blocksJump: true,
  blocksDecks,
  exits: [{ kind: "tow" }],
  towBase: 180,
});

export const balance: Balance = {
  startCredits: 0,
  milestones: [10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500],
  brokerFee: 0.6,
  hopperSeconds: 30,
  richnessPerDepth: 1.32,
  galaxyDepth: 40,
  galaxyDepthGrowth: 6,
  qualityMult: [0.75, 1, 1.25, 1.6, 2.1],
  qualityWear: [0.8, 1, 1.2, 1.5, 2],
  adjacencyBonus: 0.15,
  degradeAt: 50,
  offlineAt: 20,
  offlineBaseEff: 0.35,
  offlineBaseCap: 8 * 3600,
  offlineWearFactor: 0.35,
  offlineIntegrityFloor: 25,
  activeMult: 4,
  heatPerSec: 22,
  coolPerSec: 14,
  overheatLock: 5,
  overdriveMult: 3,
  overdriveSecs: 20,
  salvageEvery: [18, 40],
  salvageMax: 5,
  eventEvery: [240, 540],
  eventMaxPerHour: 8,
  fuelPerJump: 6,
  fuelCap: 30,
  jumpChargeSecs: 45,
  jumpCooldownSecs: 60,
  warpStampBase: 9,
  warpStampExp: 0.45,
  moduleUpgradeGrowth: 1.6,
  reactorBasePower: 30,
  greenhouseCoffeeShare: 0.5,
};

export const content = {
  items,
  decks,
  recipes,
  research: {},
  cards: {},
  traits: {},
  events: {},
  failures: {
    tumble: failure("tumble", ["mining"]),
    breach: failure("breach", ["cargo"]),
    blackout: failure("blackout", ["refinery", "fabricator", "workshop"]),
    noFuel: failure("noFuel", []),
    engine: failure("engine", []),
    radiation: failure("radiation", ["lab"]),
    boarding: failure("boarding", []),
    anomaly: failure("anomaly", []),
  },
  chapters: [],
  logs: [],
  kipp: [],
  achievements: [],
  upgrades: {},
  mutators: {},
  hulls: { tug: { id: "tug", name: L("tug"), desc: L("tug"), sprite: "tug", grid: { w: 3, h: 3 }, effects: [], cost: 0, inheritBlueprints: 0 } },
  cosmetics: {},
  factions: {},
  shop: {},
  biomes: {},
  quests: [],
  megaEffects: { mega_gate: [{ stat: "powerOut", mul: 1.5 }, { stat: "eventLuck", add: 0.1 }] },
  names: { systemA: [], systemB: [], systemC: [], planetSuffix: [], crewFirst: [], crewLast: [], stationWords: [], faunaA: [], faunaB: [], floraA: [], floraB: [] },
  balance,
} as unknown as ContentDB;

export function system(depth = 0, resources: { item: string; w: number }[] = [{ item: "scrap", w: 5 }, { item: "ice", w: 3 }, { item: "silicates", w: 2 }], richness = 1): SystemInfo {
  return {
    id: `0:${depth}:0`,
    g: 0,
    depth,
    lane: 0,
    name: "Test",
    star: "yellow",
    seed: 1,
    hazards: [],
    richness,
    resources,
    planets: [],
    belts: 0,
    station: null,
    anomaly: false,
    links: [0],
    pos: { x: 0.5, y: depth },
    isCore: false,
  };
}

export interface GameOpts {
  seed?: number;
  sys?: SystemInfo;
  state?: GameState;
  content?: ContentDB;
}

/** A game with only the core systems and a stubbed world api. */
export function makeGame(opts: GameOpts = {}): Game {
  const g = createGame(opts.content ?? content, coreSystems, opts.state, { seed: opts.seed ?? 7, wallMs: 1_700_000_000_000 });
  let sys = opts.sys ?? system();
  g.api.currentSystem = () => sys;
  (g as Game & { setSystem: (s: SystemInfo) => void }).setSystem = (s) => {
    sys = s;
    g.state.nav.depth = s.depth;
  };
  g.state.nav.depth = sys.depth;
  syncRates(g);
  return g;
}

export function setSystem(g: Game, sys: SystemInfo): void {
  (g as Game & { setSystem: (s: SystemInfo) => void }).setSystem(sys);
}

export function run(g: Game, seconds: number): void {
  const n = Math.round(seconds * 10);
  for (let i = 0; i < n; i++) tick(g, 0.1);
}

export function levels(g: Game, set: Partial<Record<DeckId, number>>): void {
  for (const id of DECK_IDS) if (set[id] !== undefined) g.state.decks[id].level = set[id]!;
  g.dirty = true;
  syncRates(g);
}

/** Mid-game ship: every deck built, modules on the grid, repeat crafts running, drones out. */
export function midGame(seed = 11): Game {
  const g = makeGame({ seed, sys: system(6, [{ item: "scrap", w: 4 }, { item: "ice", w: 3 }, { item: "silicates", w: 2 }, { item: "organics", w: 1 }]) });
  const s = g.state;
  s.features = { crafting: 1, autoQueue: 1, grid: 1, repairBots: 1, autoMaintenance: 1, drones: 1, buyMax: 1, overdrive: 1 };
  s.repair.botLevel = 2;
  s.grid.open = 9;
  levels(g, { mining: 60, lift: 62, cargo: 45, refinery: 30, reactor: 40, bridge: 12, fabricator: 26, workshop: 12, hangar: 9, lab: 10, quarters: 6, observatory: 5, greenhouse: 4 });
  s.credits = B.big(1e9);
  const fams: ModuleFamily[] = ["laser", "laser", "cargo", "reactor", "shield", "repair"];
  fams.forEach((f, i) => {
    const uid = g.api.addModule(`mod_${f}_mk1`, (i % 5) as 0 | 1 | 2 | 3 | 4);
    const inst = s.modules.find((m) => m.uid === uid)!;
    inst.slot = i;
    s.grid.cells[i] = uid;
  });
  s.drones = { hauler: 1, probe: 0, salvager: 1, fixer: 1 };
  s.repair.auto = true;
  s.craft.refinery.queue.push({ uid: ++s.uid, recipe: "r_alloy", left: -1, progress: 0 }, { uid: ++s.uid, recipe: "r_water", left: -1, progress: 0 });
  s.craft.fabricator.queue.push({ uid: ++s.uid, recipe: "r_circuit", left: -1, progress: 0 }, { uid: ++s.uid, recipe: "r_laser", left: -1, progress: 0 });
  s.craft.workshop.queue.push({ uid: ++s.uid, recipe: "r_tape", left: -1, progress: 0 });
  s.autoRecipes.push("r_tape");
  g.dirty = true;
  syncRates(g);
  return g;
}

export const num = (b: { m: number; e: number }): number => B.toNumber(b);

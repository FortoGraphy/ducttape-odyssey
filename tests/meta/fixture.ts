// Self-contained ContentDB and stubbed core/world for the meta tests. The real content is written
// in parallel by other agents, so nothing here imports src/content.
import * as B from "@/engine/big";
import { createGame, tick } from "@/engine/kernel";
import { metaSystems } from "@/engine/meta";
import type {
  AchievementDef,
  ChapterDef,
  ContentDB,
  CosmeticDef,
  Game,
  HullClassDef,
  KippLineDef,
  KippTrigger,
  L10n,
  LogDef,
  MutatorDef,
  PrestigeUpgradeDef,
  QuestTemplateDef,
  RecipeDef,
  ResearchDef,
  SystemDef,
  SystemInfo,
} from "@/engine/types";

const l = (s: string): L10n => ({ cs: s, en: s });

const research: Record<string, ResearchDef> = {
  drill_bits: {
    id: "drill_bits",
    branch: "extraction",
    name: l("Drill bits"),
    desc: l(""),
    icon: "x",
    pos: { x: 0, y: 0 },
    requires: [],
    maxLevel: 8,
    cost: 10,
    costGrowth: 2,
    effects: [{ stat: "mineRate", add: 0.1 }],
  },
  overclock: {
    id: "overclock",
    branch: "fabrication",
    name: l("Overclock"),
    desc: l(""),
    icon: "x",
    pos: { x: 1, y: 0 },
    requires: [],
    maxLevel: 4,
    cost: 5,
    costGrowth: 1.5,
    effects: [{ stat: "craftSpeed", mul: 1.1 }],
  },
  smelting: {
    id: "smelting",
    branch: "fabrication",
    name: l("Smelting"),
    desc: l(""),
    icon: "x",
    pos: { x: 0, y: 1 },
    requires: ["drill_bits"],
    maxLevel: 1,
    cost: 50,
    costGrowth: 1,
    items: { scrap: 5 },
    recipes: ["alloy_basic"],
  },
  deep_smelting: {
    id: "deep_smelting",
    branch: "fabrication",
    name: l("Deep smelting"),
    desc: l(""),
    icon: "x",
    pos: { x: 0, y: 2 },
    requires: ["smelting"],
    maxLevel: 4,
    cost: 20,
    costGrowth: 2,
    recipes: ["wire_basic"],
    feature: "autoQueue",
  },
};

// same id as the shipped content: its level is mirrored into state.repair.botLevel
research.mt_bots = {
  id: "mt_bots",
  branch: "maintenance",
  name: l("Repair bots"),
  desc: l(""),
  icon: "x",
  pos: { x: 3, y: 0 },
  requires: [],
  maxLevel: 5,
  cost: 3,
  costGrowth: 2,
};

const upgrade = (id: string, layer: 1 | 2 | 3, extra: Partial<PrestigeUpgradeDef>): PrestigeUpgradeDef => ({
  id,
  layer,
  name: l(id),
  desc: l(""),
  icon: "x",
  pos: { x: 0, y: 0 },
  requires: [],
  maxLevel: 3,
  cost: 1,
  costGrowth: 2,
  ...extra,
});

const upgrades: Record<string, PrestigeUpgradeDef> = {
  st_gain: upgrade("st_gain", 1, { effects: [{ stat: "stampGain", add: 0.5 }], maxLevel: 5 }),
  st_prod: upgrade("st_prod", 1, { requires: ["st_gain"], cost: 3, costGrowth: 3, effects: [{ stat: "allProd", mul: 2 }] }),
  rv_gain: upgrade("rv_gain", 2, { effects: [{ stat: "rivetGain", add: 1 }] }),
  rv_bots: upgrade("rv_bots", 2, { cost: 2, maxLevel: 1, feature: "repairBots" }),
  sp_gain: upgrade("sp_gain", 3, { effects: [{ stat: "sparkGain", add: 1 }] }),
  sp_time: upgrade("sp_time", 3, { effects: [{ stat: "allProd", mul: 1.5 }] }),
};

/** Chapter n starts at stat storyStep >= n - 1; its objective is storyStep >= n. */
const chapters: ChapterDef[] = [];
for (let n = 1; n <= 12; n++) {
  chapters.push({
    id: n,
    title: l(`Chapter ${n}`),
    intro: n === 3 ? [] : [{ speaker: "kipp", text: l(`c${n} beat 0`) }, { speaker: "narrator", text: l(`c${n} beat 1`) }],
    trigger: { stat: { key: "storyStep", min: n - 1 } },
    objectives: [{ text: l(`Do step ${n}`), done: { stat: { key: "storyStep", min: n } } }],
    unlocks: n === 2 ? ["nav"] : n === 5 ? ["expeditions"] : undefined,
  });
}

const logs: LogDef[] = [
  { id: "log_c", author: l("A"), title: l("C"), text: l(""), order: 3 },
  { id: "log_a", author: l("A"), title: l("A"), text: l(""), order: 1 },
  { id: "log_d", author: l("A"), title: l("D"), text: l(""), order: 4 },
  { id: "log_b", author: l("A"), title: l("B"), text: l(""), order: 2 },
];

export const KIPP_TRIGGERS: KippTrigger[] = [
  "idle",
  "purchase",
  "milestone",
  "damage",
  "repair",
  "moduleBroken",
  "cargoFull",
  "lowFuel",
  "jump",
  "arrival",
  "discovery",
  "eventGood",
  "eventBad",
  "failure",
  "rescued",
  "minigameWin",
  "minigameLose",
  "overdrive",
  "overheat",
  "offlineReturn",
  "prestige",
  "coffeeOut",
  "crewJoin",
  "station",
  "craft",
  "research",
  "achievement",
  "debug",
];

const kipp: KippLineDef[] = [];
for (const trigger of KIPP_TRIGGERS) {
  const count = trigger === "idle" ? 20 : trigger === "purchase" ? 16 : 3;
  for (let i = 0; i < count; i++) kipp.push({ id: `${trigger}_${i}`, trigger, text: l(`${trigger} ${i} {name} {n}`) });
}
kipp.push({ id: "failure_breach", trigger: "failure", text: l("breach"), failure: "breach" });
kipp.push({ id: "failure_tumble", trigger: "failure", text: l("tumble"), failure: "tumble" });
kipp.push({ id: "debug_gated", trigger: "debug", text: l("gated"), when: { flag: "never_set" } });

const achievement = (id: string, stat: string, threshold: number, reward?: AchievementDef["reward"]): AchievementDef => ({
  id,
  name: l(id),
  desc: l(""),
  icon: "x",
  stat,
  threshold,
  reward,
});

const achievements: AchievementDef[] = [
  achievement("buy_100", "purchases", 100, { cosmetic: "paint_gold" }),
  achievement("buy_10", "purchases", 10, { stamps: 2 }),
  achievement("buy_1000", "purchases", 1000),
  achievement("warp_1", "warps", 1),
  achievement("hours_1", "playedHours", 1),
  achievement("talker", "kippLines", 5),
  // rewards a cosmetic the content does not (yet) define
  achievement("ghost_paint", "salvage", 3, { cosmetic: "ach_paint_99", stamps: 1 }),
];

const quest = (id: string, stat: string, base: number, scale: "flat" | "income", weekly?: boolean): QuestTemplateDef => ({
  id,
  text: l(`${id} {n}`),
  stat,
  base,
  scale,
  weekly,
});

const quests: QuestTemplateDef[] = [
  quest("q_buy", "purchases", 20, "flat"),
  quest("q_salvage", "salvage", 5, "flat"),
  quest("q_events", "events", 2, "flat"),
  quest("q_mini", "minigames", 3, "flat"),
  quest("q_levels", "deckLevels", 50, "income"),
  quest("q_pulses", "pulses", 8, "flat"),
  quest("q_craft", "crafts", 10, "flat"), // needs the crafting feature
  quest("w_buy", "purchases", 500, "flat", true),
  quest("w_salvage", "salvage", 100, "flat", true),
];

const cosmetic = (id: string, kind: CosmeticDef["kind"], unlock: CosmeticDef["unlock"]): CosmeticDef => ({
  id,
  kind,
  name: l(id),
  desc: l(""),
  value: id,
  unlock,
});

const cosmetics: Record<string, CosmeticDef> = {
  paint_rust: cosmetic("paint_rust", "paint", { start: true }),
  paint_gold: cosmetic("paint_gold", "paint", { achievement: "buy_100" }),
  trail_blue: cosmetic("trail_blue", "trail", { stamps: 3 }),
  sticker_a: cosmetic("sticker_a", "sticker", { start: true }),
  sticker_b: cosmetic("sticker_b", "sticker", { chapter: 2 }),
  toy_duck: cosmetic("toy_duck", "toy", { chapter: 3 }),
};

const hull = (id: string, w: number, h: number, cost: number, inherit: number, effects: HullClassDef["effects"]): HullClassDef => ({
  id,
  name: l(id),
  desc: l(""),
  sprite: id,
  grid: { w, h },
  effects,
  cost,
  inheritBlueprints: inherit,
});

const hulls: Record<string, HullClassDef> = {
  tug: hull("tug", 3, 3, 0, 1, []),
  hauler: hull("hauler", 4, 4, 3, 2, [{ stat: "cargoCap", mul: 2 }]),
  yacht: hull("yacht", 5, 4, 1e6, 3, [{ stat: "sellValue", mul: 3 }]),
  // the only class in the fixture with a frame item (hull_frame_ark), like every non-tug class in the real content
  ark: hull("ark", 6, 5, 1, 0, [{ stat: "crewCap", mul: 1.5 }]),
};

const mutator = (id: string, reward: number, effects: MutatorDef["effects"]): MutatorDef => ({ id, name: l(id), desc: l(""), effects, reward });

const mutators: Record<string, MutatorDef> = {
  fragile: mutator("fragile", 1.5, [{ stat: "wearRate", mul: 2 }]),
  thin: mutator("thin", 2, [{ stat: "allProd", mul: 0.5 }]),
  slow: mutator("slow", 1.25, [{ stat: "jumpCharge", mul: 0.5 }]),
};

const recipe = (id: string): RecipeDef => ({ id, station: "refinery", tier: 1, inputs: { scrap: 1 }, outputs: { alloy: 1 }, time: 5, unlock: {} });

export function makeContent(balance: Record<string, number> = {}): ContentDB {
  return {
    items: {
      scrap: { id: "scrap", tier: 0, category: "raw", name: l("Scrap"), desc: l(""), value: 1, icon: "x" },
      alloy: { id: "alloy", tier: 1, category: "refined", name: l("Alloy"), desc: l(""), value: 3, icon: "x" },
      shipyard: { id: "shipyard", tier: 4, category: "mega", name: l("Shipyard"), desc: l(""), value: 1, icon: "x", mass: 0 },
      wormhole_gate: { id: "wormhole_gate", tier: 4, category: "mega", name: l("Gate"), desc: l(""), value: 1, icon: "x", mass: 0 },
      hull_frame_ark: { id: "hull_frame_ark", tier: 4, category: "mega", name: l("Frame"), desc: l(""), value: 1, icon: "x", mass: 0 },
    },
    decks: {},
    recipes: { alloy_basic: recipe("alloy_basic"), wire_basic: recipe("wire_basic"), plating_bp: recipe("plating_bp"), lens_bp: recipe("lens_bp") },
    research,
    cards: {},
    traits: {},
    events: {},
    failures: {},
    chapters,
    logs,
    kipp,
    achievements,
    upgrades,
    mutators,
    hulls,
    cosmetics,
    factions: {},
    shop: {},
    biomes: {},
    quests,
    names: {},
    balance: { startCredits: 10, warpStampBase: 9, warpStampExp: 0.45, offlineBaseCap: 8 * 3600, offlineBaseEff: 0.35, ...balance },
  } as unknown as ContentDB;
}

export const content = makeContent();

/** Knobs the stubbed world reads, plus a record of what meta asked of core. */
export interface World {
  isCore: boolean;
  station: boolean;
  unlockCalls: string[];
  prestigeCalls: number[];
}

/** Stands in for core and world: registers the api functions meta calls and resets a run like core would. */
function stubSystem(world: World): SystemDef {
  return {
    id: "stub.coreworld",
    init(g) {
      g.api.currentSystem = (): SystemInfo => {
        const nav = g.state.nav;
        return {
          id: `${nav.g}:${nav.depth}:${nav.lane}`,
          g: nav.g,
          depth: nav.depth,
          lane: nav.lane,
          name: "Stub",
          star: "yellow",
          seed: 1,
          hazards: [],
          richness: 1,
          resources: [],
          planets: [],
          belts: 0,
          station: world.station ? { faction: "lamplighters", name: "Stub Station" } : null,
          anomaly: false,
          links: [0],
          pos: { x: 0.5, y: nav.depth },
          isCore: world.isCore,
        };
      };
      g.api.unlockRecipe = (id) => {
        world.unlockCalls.push(id);
        if (g.state.recipes[id]) return false;
        g.state.recipes[id] = 1;
        return true;
      };
    },
    prestige(g, layer) {
      world.prestigeCalls.push(layer);
      const s = g.state;
      s.credits = B.big(10);
      s.lifetime = B.big(0);
      s.inv = {};
      s.recipes = {};
      s.modules = [];
      s.hull = { hp: 100, cls: "tug" };
      s.grid = { w: 3, h: 3, open: 4, cells: [0, 0, 0, 0, 0, 0, 0, 0, 0] };
      s.nav.depth = 0;
      s.nav.g += 1;
      world.isCore = false;
    },
  };
}

export function makeGame(opts: { seed?: number; wallMs?: number; content?: ContentDB } = {}): { g: Game; world: World } {
  const world: World = { isCore: false, station: false, unlockCalls: [], prestigeCalls: [] };
  const g = createGame(opts.content ?? content, [stubSystem(world), ...metaSystems], undefined, { seed: opts.seed ?? 7, wallMs: opts.wallMs ?? 0 });
  return { g, world };
}

/** Runs the fixed-step loop for `seconds` of game time. */
export function run(g: Game, seconds: number): void {
  const n = Math.round(seconds * 10);
  for (let i = 0; i < n; i++) tick(g, 0.1);
}

/** Empties the outbox and returns what was in it. */
export function drain(g: Game): Game["outbox"] {
  return g.outbox.splice(0, g.outbox.length);
}

/** Every number in the saved state must be finite, and the state must survive a JSON round trip. */
export function findBadNumber(value: unknown, path = "state"): string | null {
  if (typeof value === "number") return Number.isFinite(value) ? null : path;
  if (value === null || typeof value !== "object") return null;
  for (const key of Object.keys(value as object)) {
    const bad = findBadNumber((value as Record<string, unknown>)[key], `${path}.${key}`);
    if (bad) return bad;
  }
  return null;
}

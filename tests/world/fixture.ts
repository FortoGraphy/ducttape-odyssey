// Small self-contained ContentDB and stubbed core/meta api for the world tests. Real content is
// authored elsewhere; nothing here depends on it.
import * as B from "../../src/engine/big";
import { createGame, nextUid, stat, tick } from "../../src/engine/kernel";
import {
  DECK_IDS,
  type Balance,
  type BiomeDef,
  type CardDef,
  type ContentDB,
  type DeckDef,
  type DeckId,
  type EventDef,
  type FailureDef,
  type FailureKind,
  type FeatureId,
  type Game,
  type ItemCategory,
  type ItemDef,
  type L10n,
  type SystemDef,
  type SystemInfo,
} from "../../src/engine/types";
import { getSystem, galaxyDepth, lanesAt, worldSystems } from "../../src/engine/world";

const l = (en: string): L10n => ({ cs: en, en });

export const FAILURE_KINDS: FailureKind[] = ["tumble", "breach", "blackout", "noFuel", "engine", "radiation", "boarding", "anomaly"];
const ALL_FEATURES: FeatureId[] = ["nav", "scan", "probes", "expeditions", "outposts", "station", "crew", "cards"];

function item(id: string, tier: ItemDef["tier"], category: ItemCategory, value: number, extra: Partial<ItemDef> = {}): ItemDef {
  return { id, tier, category, name: l(id), desc: l(id), value, icon: id, ...extra };
}

function deck(id: DeckId, startLevel: number): DeckDef {
  return { id, name: l(id), desc: l(id), icon: id, unit: l("u"), base: 1, curve: "lin", baseCost: 10, costGrowth: 1.1, power: 1, unlock: { credits: 0 }, startLevel };
}

function biome(id: string, shader: BiomeDef["shader"], resources: string[], special: string[], hazards: BiomeDef["hazards"]): BiomeDef {
  return { id, name: l(id), desc: [l(id + " a"), l(id + " b"), l(id + " c")], hazards, resources, special, palette: ["a", "b", "c", "d", "e"], shader };
}

function failure(id: FailureKind, exits: FailureDef["exits"], extra: Partial<FailureDef> = {}): FailureDef {
  return { id, name: l(id), desc: l(id), effects: [], blocksJump: false, blocksDecks: [], exits, towBase: 600, ...extra };
}

function card(id: string, deckId: DeckId, rarity: CardDef["rarity"], effects: CardDef["effects"]): CardDef {
  return { id, deck: deckId, rarity, name: l(id), desc: l(id), effects };
}

/** Same ids, rarity tags and rough values as the shipped economy, so depth gating behaves alike. */
const RAWS: [string, number, string][] = [
  ["scrap", 1, "common"],
  ["ice", 1, "common"],
  ["silicates", 1.2, "common"],
  ["carbon", 1.5, "common"],
  ["hydrogen", 1.4, "common"],
  ["ferrite", 2, "common"],
  ["brine", 1.6, "common"],
  ["sulfur", 2.2, "uncommon"],
  ["organics", 3, "uncommon"],
  ["conductite", 4, "uncommon"],
  ["helium3", 6, "uncommon"],
  ["lumite", 8, "rare"],
  ["xenon", 10, "rare"],
  ["voidglass", 16, "rare"],
  ["strange_dust", 30, "exotic"],
  ["antimatter", 60, "exotic"],
];
export const STARTER_RAWS = ["scrap", "ice", "silicates", "carbon", "hydrogen", "conductite"];

function events(): Record<string, EventDef> {
  const list: EventDef[] = [
    {
      id: "ev_common",
      type: "meteor",
      weight: 10,
      cooldown: 300,
      title: l("Common"),
      text: l("Rocks."),
      choices: [
        { id: "safe", label: l("Duck"), risk: 0, outcomes: [{ weight: 1, good: true, text: l("Fine."), effects: [{ t: "credits", secs: 30 }] }] },
        {
          id: "mid",
          label: l("Scoop"),
          risk: 1,
          outcomes: [
            { weight: 1, good: true, text: l("Got some."), effects: [{ t: "item", item: "scrap", n: 2, scaled: true }] },
            { weight: 1, text: l("Ouch."), effects: [{ t: "hull", pct: -10 }] },
          ],
        },
        {
          id: "bold",
          label: l("Ram"),
          risk: 2,
          outcomes: [
            { weight: 1, good: true, text: l("Jackpot."), effects: [{ t: "card" }] },
            { weight: 3, text: l("Crunch."), effects: [{ t: "moduleDamage", pct: 20, count: 2 }, { t: "loseCargo", pct: 10 }] },
          ],
        },
      ],
    },
    {
      id: "ev_rare",
      type: "derelict",
      weight: 1,
      cooldown: 300,
      title: l("Rare"),
      text: l("A hulk."),
      choices: [{ id: "a", label: l("Look"), risk: 0, outcomes: [{ weight: 1, good: true, text: l("Nice."), effects: [{ t: "blueprint" }] }] }],
    },
    {
      id: "ev_once",
      type: "contact",
      weight: 6,
      once: true,
      title: l("Once"),
      text: l("Hello."),
      choices: [{ id: "a", label: l("Wave"), risk: 0, outcomes: [{ weight: 1, good: true, text: l("Waved."), effects: [{ t: "rep", faction: "ledger", n: 5 }] }] }],
    },
    {
      id: "ev_cond",
      type: "merchant",
      weight: 400,
      cooldown: 300,
      when: { flag: "open" },
      title: l("Conditional"),
      text: l("Only when flagged."),
      choices: [{ id: "a", label: l("Ok"), risk: 0, outcomes: [{ weight: 1, text: l("Ok."), effects: [] }] }],
    },
    {
      id: "ev_chain_a",
      type: "distress",
      weight: 3,
      cooldown: 900,
      title: l("Chain A"),
      text: l("A call."),
      choices: [{ id: "a", label: l("Answer"), risk: 1, outcomes: [{ weight: 1, text: l("To be continued."), effects: [{ t: "chain", event: "ev_chain_b", delay: 30 }] }] }],
    },
    {
      id: "ev_chain_b",
      type: "distress",
      weight: 100,
      chainOnly: true,
      title: l("Chain B"),
      text: l("The sequel."),
      choices: [{ id: "a", label: l("Finish"), risk: 0, outcomes: [{ weight: 1, good: true, text: l("Done."), effects: [{ t: "flag", key: "chain_done", value: 3 }] }] }],
    },
    {
      id: "ev_cost",
      type: "merchant",
      weight: 0,
      title: l("Costly"),
      text: l("Pay up."),
      choices: [
        { id: "pay", label: l("Pay"), risk: 0, cost: { credits: 10 }, outcomes: [{ weight: 1, good: true, text: l("Paid."), effects: [{ t: "morale", n: 5 }] }] },
        { id: "barter", label: l("Barter"), risk: 1, cost: { items: { scrap: 5 } }, outcomes: [{ weight: 1, good: true, text: l("Traded."), effects: [{ t: "fuel", n: 4 }] }] },
        { id: "vip", label: l("VIP"), risk: 2, requires: { flag: "vip" }, outcomes: [{ weight: 1, good: true, text: l("Posh."), effects: [{ t: "crew" }] }] },
      ],
    },
    {
      id: "ev_locked",
      type: "kipp",
      weight: 0,
      title: l("Locked"),
      text: l("Nothing you can do."),
      choices: [{ id: "a", label: l("Nope"), risk: 0, requires: { flag: "never" }, outcomes: [{ weight: 1, text: l("-"), effects: [] }] }],
    },
    {
      id: "ev_luck",
      type: "anomaly",
      weight: 0,
      title: l("Luck"),
      text: l("Flip."),
      choices: [
        {
          id: "flip",
          label: l("Flip"),
          risk: 1,
          outcomes: [
            { weight: 1, good: true, text: l("Heads."), effects: [{ t: "flag", key: "luck_good" }] },
            { weight: 1, text: l("Tails."), effects: [{ t: "morale", n: -1 }] },
          ],
        },
      ],
    },
    {
      id: "ev_minigame",
      type: "fault",
      weight: 0,
      title: l("Sparks"),
      text: l("Fix it."),
      choices: [
        {
          id: "fix",
          label: l("Fix"),
          risk: 1,
          outcomes: [
            {
              weight: 1,
              text: l("Hands on."),
              effects: [
                { t: "minigame", game: "wire", tier: 1, win: [{ t: "flag", key: "mg_win" }, { t: "rp", secs: 10 }], lose: [{ t: "flag", key: "mg_lose" }, { t: "hull", pct: -5 }] },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "ev_fail",
      type: "pirates",
      weight: 0,
      title: l("Boarders"),
      text: l("Uh oh."),
      choices: [
        { id: "hide", label: l("Hide"), risk: 0, outcomes: [{ weight: 1, good: true, text: l("Quiet."), effects: [{ t: "credits", secs: -20 }] }] },
        { id: "fight", label: l("Fight"), risk: 2, outcomes: [{ weight: 1, text: l("Boarded."), effects: [{ t: "failure", kind: "boarding" }] }] },
      ],
    },
    {
      id: "ev_story",
      type: "story",
      weight: 2,
      cooldown: 600,
      title: l("Story"),
      text: l("The signal."),
      choices: [{ id: "a", label: l("Listen"), risk: 0, outcomes: [{ weight: 1, good: true, text: l("Hold music."), effects: [{ t: "log" }, { t: "codex", key: "system:story" }] }] }],
    },
  ];
  const out: Record<string, EventDef> = {};
  for (const e of list) out[e.id] = e;
  return out;
}

export function makeContent(): ContentDB {
  const items: Record<string, ItemDef> = {};
  for (const [id, value, rarity] of RAWS) items[id] = item(id, 0, "raw", value, { tags: [rarity] });
  items.fuel = item("fuel", 1, "refined", 12);
  items.alloy = item("alloy", 1, "refined", 10);
  items.plating = item("plating", 2, "component", 40);
  items.circuit = item("circuit", 2, "component", 55);
  items.power_cell = item("power_cell", 2, "component", 70);
  items.fuel_cell = item("fuel_cell", 1, "consumable", 150, { consumable: { kind: "fuel", fuel: 10 } });
  items.coffee = item("coffee", 1, "consumable", 5, { consumable: { kind: "coffee", morale: 5 } });
  items.beacon = item("beacon", 1, "consumable", 300, { consumable: { kind: "beacon", buff: { effect: { stat: "towSpeed", mul: 0.5 }, secs: 3600 } } });
  items.duct_tape = item("duct_tape", 1, "consumable", 20, { consumable: { kind: "repair", repairPct: 15, repairCap: 60 } });
  items.mod_laser_mk1 = item("mod_laser_mk1", 3, "module", 500, { mass: 0, module: { family: "laser", mk: 1, effects: [{ stat: "mineRate", add: 0.1 }], wear: 4, power: 2 } });
  items.art_idol = item("art_idol", 0, "artifact", 1000, { mass: 0 });
  items.art_coin = item("art_coin", 0, "artifact", 1000, { mass: 0 });

  const decks = {} as Record<DeckId, DeckDef>;
  for (const id of DECK_IDS) decks[id] = deck(id, id === "quarters" ? 10 : id === "greenhouse" || id === "observatory" ? 0 : 1);

  const balance: Balance = {
    startCredits: 1000,
    milestones: [10, 25, 50],
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
    heatPerSec: 0.22,
    coolPerSec: 0.14,
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
  };

  // `satisfies` checks every part given here; the cast keeps the fixture compiling when the contract grows
  const db = {
    items,
    decks,
    recipes: {
      r_fuel: { id: "r_fuel", station: "refinery", tier: 1, inputs: { hydrogen: 2 }, outputs: { fuel: 1 }, time: 5, unlock: { start: true } },
      r_bp1: { id: "r_bp1", station: "fabricator", tier: 2, inputs: { alloy: 2, scrap: 1 }, outputs: { plating: 1 }, time: 10, unlock: { blueprint: true } },
      r_bp2: { id: "r_bp2", station: "fabricator", tier: 2, inputs: { alloy: 1, silicates: 3 }, outputs: { circuit: 1 }, time: 10, unlock: { blueprint: true } },
    },
    research: {},
    cards: {
      c_mine_a: card("c_mine_a", "mining", 0, [{ add: 0.1 }]),
      c_mine_b: card("c_mine_b", "mining", 1, [{ stat: "sellValue", add: 0.05 }]),
      c_mine_c: card("c_mine_c", "mining", 2, [{ mul: 1.1 }]),
      c_lift_a: card("c_lift_a", "lift", 0, [{ add: 0.2 }]),
    },
    traits: {
      t_handy: { id: "t_handy", name: l("Handy"), desc: l("x"), effects: [{ add: 0.1 }], good: true },
      t_keen: { id: "t_keen", name: l("Keen"), desc: l("x"), effects: [{ stat: "scanSpeed", add: 0.05 }], good: true },
      t_clumsy: { id: "t_clumsy", name: l("Clumsy"), desc: l("x"), effects: [{ mul: 0.95 }], good: false },
    },
    events: events(),
    failures: {
      tumble: failure("tumble", [{ kind: "minigame", game: "calibrate", tier: 1 }, { kind: "wait", seconds: 120 }, { kind: "tow" }], { blocksJump: true, blocksDecks: ["mining"] }),
      breach: failure("breach", [{ kind: "minigame", game: "tape", tier: 2 }, { kind: "items", items: { duct_tape: 2 } }, { kind: "tow" }], { effects: [{ stat: "allProd", mul: 0.5 }] }),
      blackout: failure("blackout", [{ kind: "minigame", game: "wire", tier: 1 }, { kind: "credits", secs: 60 }, { kind: "tow" }], { effects: [{ stat: "powerOut", mul: 0.2 }] }),
      noFuel: failure("noFuel", [{ kind: "wait", seconds: 300 }, { kind: "items", items: { fuel_cell: 1 } }, { kind: "tow" }], { blocksJump: true }),
      engine: failure("engine", [{ kind: "minigame", game: "weld", tier: 2 }, { kind: "items", items: { alloy: 5 } }, { kind: "credits", secs: 120 }, { kind: "tow" }], { blocksJump: true }),
      radiation: failure("radiation", [{ kind: "wait", seconds: 200 }, { kind: "credits", secs: 30 }, { kind: "tow" }], { effects: [{ stat: "moraleGain", mul: 0.5 }] }),
      boarding: failure("boarding", [{ kind: "minigame", game: "defense", tier: 3 }, { kind: "credits", secs: 90 }, { kind: "tow" }], { blocksDecks: ["cargo", "lift"] }),
      anomaly: failure("anomaly", [{ kind: "minigame", game: "hack", tier: 2 }, { kind: "wait", seconds: 240 }, { kind: "tow" }], { blocksJump: true, towBase: 900 }),
    },
    chapters: [],
    logs: [
      { id: "log_1", author: l("A"), title: l("One"), text: l("..."), order: 1 },
      { id: "log_2", author: l("B"), title: l("Two"), text: l("..."), order: 2 },
    ],
    kipp: [],
    achievements: [],
    upgrades: {},
    mutators: {},
    hulls: { tug: { id: "tug", name: l("Tug"), desc: l("x"), sprite: "tug", grid: { w: 3, h: 3 }, effects: [], cost: 0, inheritBlueprints: 0 } },
    cosmetics: {},
    factions: {
      lamplighters: { id: "lamplighters", name: { cs: "Cech lampářů", en: "Lamplighters Guild" }, desc: l("x"), color: "amber", likes: ["refined", "component"] },
      rustborn: { id: "rustborn", name: { cs: "Rezaví", en: "Rustborn Collective" }, desc: l("x"), color: "rust", likes: ["raw"] },
      ledger: { id: "ledger", name: { cs: "Tichá účtárna", en: "The Quiet Ledger" }, desc: l("x"), color: "teal", likes: ["consumable"] },
    },
    shop: {
      sh_drill: { id: "sh_drill", name: l("Drill"), desc: l("x"), icon: "x", cost: 60, costFloor: 100, costGrowth: 2, maxLevel: 3, effects: [{ stat: "mineRate", add: 0.1 }] },
      sh_grid: { id: "sh_grid", name: l("Bay"), desc: l("x"), icon: "x", cost: 30, costFloor: 50, costGrowth: 3, maxLevel: 10, gridSlots: 1 },
      sh_cells: { id: "sh_cells", name: l("Cells"), desc: l("x"), icon: "x", cost: 10, costFloor: 10, costGrowth: 1, maxLevel: 99, item: { id: "fuel_cell", n: 2 } },
      fuel_tank: { id: "fuel_tank", name: l("Tank"), desc: l("x"), icon: "x", cost: 10, costFloor: 10, costGrowth: 1, maxLevel: 10 },
      sh_vip: { id: "sh_vip", name: l("VIP"), desc: l("x"), icon: "x", faction: "ledger", repMin: 20, cost: 10, costFloor: 10, costGrowth: 1.5, maxLevel: 2, effects: [{ stat: "repGain", add: 0.5 }] },
    },
    biomes: {
      rocky: biome("rocky", "rock", ["scrap", "silicates", "ferrite", "conductite"], ["voidglass"], ["debris"]),
      frost: biome("frost", "ice", ["ice", "hydrogen", "brine", "helium3"], ["xenon"], ["cold"]),
      ember: biome("ember", "lava", ["carbon", "sulfur", "ferrite", "lumite"], ["antimatter"], ["heat"]),
      giant: biome("giant", "gas", ["hydrogen", "helium3", "xenon"], [], ["storm"]),
      garden: biome("garden", "ocean", ["organics", "brine", "carbon", "ice"], ["strange_dust"], []),
    },
    quests: [],
    megaEffects: {},
    endings: [],
    backlogTickets: [],
    names: {
      systemA: ["Ka", "Lo", "Mi", "Nu", "Pre", "Sto", "Tra", "Vu"],
      systemB: ["ran", "bel", "dor", "fen", "gim", "hal"],
      systemC: ["a", "os", "ek"],
      planetSuffix: ["Prime", "Minor"],
      crewFirst: ["Ada", "Ben", "Cyd", "Dov", "Eli", "Fay"],
      crewLast: ["Marsh", "Novak", "Okoro", "Quill"],
      stationWords: [{ cs: "Stanice", en: "Station" }],
      // left empty on purpose: the generator must fall back to its own tables
      faunaA: [],
      faunaB: [],
      floraA: [],
      floraB: [],
    },
    balance,
  } satisfies Partial<ContentDB>;
  return db as ContentDB;
}

export interface Calls {
  say: { trigger: string; vars?: Record<string, string | number> }[];
  damageHull: number[];
  damageModules: { pct: number; count?: number; family?: string }[];
  repairAll: number[];
  minigames: { game: string; tier: number; purpose: string; ref: number }[];
  discover: string[];
}

/** Stand-in for the core and meta areas: the api functions the world calls, with a call log. */
export function stubSystems(calls: Calls): SystemDef[] {
  return [
    {
      id: "stub",
      // core folds the quarters deck into the crewCap modifier: 1 + floor(level / 5) bunks
      modifiers(g, out) {
        const bunks = Math.floor(g.state.decks.quarters.level / 5);
        if (bunks > 0) out.push({ stat: "crewCap", add: bunks });
      },
      init(g) {
        const s = g.state;
        g.rates.mine = B.big(10);
        g.rates.lift = B.big(12);
        g.rates.cargoCap = B.big(100000);
        g.rates.cargoUsed = B.big(0);
        g.rates.income = B.big(100);
        g.rates.research = B.big(2);
        g.rates.richness = B.big(1);
        g.api.damageHull = (pct) => {
          calls.damageHull.push(pct);
          s.hull.hp = Math.max(0, s.hull.hp - pct * g.mods.shield);
          if (s.hull.hp <= 0) g.api.startFailure("breach");
        };
        g.api.damageModules = (pct, count, family) => {
          calls.damageModules.push({ pct, count, family });
          const hit: number[] = [];
          for (const m of s.modules) {
            if (m.slot < 0 || (count !== undefined && hit.length >= count)) continue;
            m.hp = Math.max(0, m.hp - pct);
            hit.push(m.uid);
          }
          return hit;
        };
        g.api.repairAll = (pct) => {
          calls.repairAll.push(pct);
          s.hull.hp = Math.min(100, s.hull.hp + pct);
          for (const m of s.modules) m.hp = Math.min(100, m.hp + pct);
        };
        g.api.addModule = (id, q) => {
          const uid = nextUid(g);
          s.modules.push({ uid, item: id, q: q ?? 1, hp: 100, lvl: 0, slot: -1 });
          return uid;
        };
        g.api.unlockRecipe = (id) => {
          if (!g.content.recipes[id] || s.recipes[id]) return false;
          s.recipes[id] = 1;
          return true;
        };
        g.api.grantBlueprint = () => {
          for (const id of Object.keys(g.content.recipes)) {
            if (g.content.recipes[id].unlock.blueprint && !s.recipes[id]) {
              s.recipes[id] = 1;
              stat(g, "blueprints");
              return id;
            }
          }
          return null;
        };
        g.api.requestMinigame = (game, tier, purpose, ref) => {
          if (s.minigame || g.offline) return 0;
          const token = nextUid(g);
          s.minigame = { token, game, tier, purpose, ref };
          calls.minigames.push({ game, tier, purpose, ref });
          return token;
        };
        g.api.miningScale = () => B.mulN(g.rates.mine, 10);
        g.api.say = (trigger, vars) => {
          calls.say.push({ trigger, vars });
        };
        g.api.addLog = (id) => {
          const next = id ?? g.content.logs.find((x) => !s.story.logs.includes(x.id))?.id;
          if (!next || s.story.logs.includes(next)) return null;
          s.story.logs.push(next);
          return next;
        };
        g.api.discover = (key) => {
          calls.discover.push(key);
          if (s.codex[key]) return false;
          s.codex[key] = { t: s.t };
          stat(g, "codex");
          return true;
        };
      },
    },
  ];
}

export interface Fixture {
  g: Game;
  calls: Calls;
  content: ContentDB;
}

export function makeGame(opts: { seed?: number; content?: ContentDB; features?: boolean } = {}): Fixture {
  const content = opts.content ?? makeContent();
  const calls: Calls = { say: [], damageHull: [], damageModules: [], repairAll: [], minigames: [], discover: [] };
  const g = createGame(content, [...stubSystems(calls), ...worldSystems], undefined, { seed: opts.seed ?? 7, wallMs: 0 });
  if (opts.features !== false) for (const f of ALL_FEATURES) g.state.features[f] = 1;
  g.state.recipes.r_fuel = 1;
  // no scheduled events unless a test asks for them
  g.state.events.nextAt = Number.MAX_SAFE_INTEGER;
  return { g, calls, content };
}

/** Advances the game by `seconds` of fixed ticks. */
export function run(g: Game, seconds: number): void {
  const n = Math.round(seconds * 10);
  for (let i = 0; i < n; i++) tick(g, 0.1);
}

/** What core's resolveMinigame does: clears the pending request, then dispatches to the purpose handler. */
export function resolveMinigame(g: Game, success: boolean, score = success ? 0.8 : 0.2): boolean {
  const pending = g.state.minigame;
  if (!pending) return false;
  g.state.minigame = null;
  g.minigameHandlers[pending.purpose]?.(g, pending, { score, success, perfect: score >= 0.95, durationMs: 1000 });
  return true;
}

/** Moves the ship without the jump machinery (test setup only). */
export function teleport(g: Game, depth: number, lane: number): SystemInfo {
  const nav = g.state.nav;
  nav.depth = depth;
  nav.lane = lane;
  nav.jump = null;
  nav.visited[nav.g + ":" + depth + ":" + lane] = 1;
  g.state.station.docked = false;
  return g.api.currentSystem();
}

/** First system from depth 1 on that satisfies `pred`. */
export function findSystem(g: Game, pred: (sys: SystemInfo) => boolean): SystemInfo {
  const s = g.state;
  const core = galaxyDepth(g.content, s.nav.g);
  for (let d = 1; d < core; d++) {
    const lanes = lanesAt(s.seed, s.nav.g, d, core);
    for (let lane = 0; lane < lanes; lane++) {
      const sys = getSystem(g.content, s.seed, s.nav.g, d, lane);
      if (pred(sys)) return sys;
    }
  }
  throw new Error("no system matches");
}

/** Charges the hyperdrive and waits out the cooldown so a jump is allowed right now. */
export function readyToJump(g: Game): void {
  g.state.nav.charge = 1;
  g.state.nav.cooldownUntil = 0;
}

/** Walks every number in the state and returns the paths of those that are not finite. */
export function findNonFinite(value: unknown, path = "state", out: string[] = []): string[] {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) out.push(path);
  } else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) findNonFinite(value[i], path + "[" + i + "]", out);
  } else if (value && typeof value === "object") {
    for (const k of Object.keys(value)) findNonFinite((value as Record<string, unknown>)[k], path + "." + k, out);
  }
  return out;
}

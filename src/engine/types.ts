// =====================================================================================
// Duct Tape Odyssey: engine contract. Pure TypeScript, no React Native imports anywhere
// under src/engine. This file is owned by the orchestrator: agents propose changes, they
// do not edit it. Everything in GameState must be plain JSON (no classes, Maps, Dates).
// =====================================================================================

// ---------- primitives ----------------------------------------------------------------

/** Big number as plain data: value = m * 10^e with 1 <= |m| < 10, or m = 0, e = 0. See big.ts. */
export interface Big {
  m: number;
  e: number;
}

/** Bilingual content string. Czech is written natively, never translated literally. */
export interface L10n {
  cs: string;
  en: string;
}

export type ItemId = string;
export type RecipeId = string;
export type ResearchId = string;
export type EventId = string;
export type CardId = string;
export type TraitId = string;
export type AchievementId = string;
export type CosmeticId = string;
export type UpgradeId = string;
export type MutatorId = string;
export type HullClassId = string;
export type LogId = string;
export type BiomeId = string;

export const DECK_IDS = [
  "bridge",
  "observatory",
  "quarters",
  "lab",
  "greenhouse",
  "hangar",
  "workshop",
  "fabricator",
  "refinery",
  "cargo",
  "lift",
  "reactor",
  "mining",
] as const;
export type DeckId = (typeof DECK_IDS)[number];

export type CraftStationId = "refinery" | "fabricator" | "workshop";
export type FactionId = "lamplighters" | "rustborn" | "ledger";
export type Quality = 0 | 1 | 2 | 3 | 4; // Scrappy, Standard, Fine, Superb, Pristine
export type MinigameId = "weld" | "wire" | "rhythm" | "valves" | "calibrate" | "tape" | "defense" | "dock" | "hack";
export type MinigameTier = 1 | 2 | 3;
export type FailureKind = "tumble" | "breach" | "blackout" | "noFuel" | "engine" | "radiation" | "boarding" | "anomaly";
export type StarType = "redDwarf" | "yellow" | "blueGiant" | "whiteDwarf" | "neutron" | "binary" | "blackHole" | "protostar";
export type HazardKind = "heat" | "cold" | "radiation" | "toxic" | "debris" | "storm";
export type ModuleFamily = "laser" | "engine" | "shield" | "scanner" | "reactor" | "cargo" | "repair" | "life";
export type OfflinePolicy = "cautious" | "balanced" | "risky";
export type FeatureId =
  | "crafting"
  | "autoQueue"
  | "grid"
  | "repairBots"
  | "autoMaintenance"
  | "nav"
  | "scan"
  | "probes"
  | "expeditions"
  | "outposts"
  | "station"
  | "crew"
  | "cards"
  | "research"
  | "drones"
  | "buyMax"
  | "overdrive"
  | "warp"
  | "hull"
  | "cosmos"
  | "quests"
  | "weekly"
  | "codex";

// ---------- stats and modifiers -------------------------------------------------------

/** Every multiplier the game can modify. A modifier value of 1 means "unchanged". */
export const STAT_KEYS = [
  "allProd", // every deck output
  "mineRate",
  "liftRate",
  "cargoCap",
  "sellValue", // broker/station sell price
  "creditGain", // all credit income
  "craftSpeed",
  "craftBatch",
  "researchRate",
  "powerOut",
  "powerUse",
  "wearRate",
  "repairSpeed",
  "hullMax",
  "shield", // fraction of event hull/module damage kept: lower is better
  "fuelUse",
  "jumpCharge", // hyperdrive charge speed
  "jumpCooldown",
  "scanSpeed",
  "salvageRate",
  "salvageValue",
  "eventLuck", // shifts weighted outcomes toward good ones
  "eventRate",
  "offlineEff",
  "offlineCap",
  "activeMult", // hold-to-mine multiplier
  "heatRate",
  "overdriveGain",
  "moraleGain",
  "coffeeUse",
  "expeditionSpeed",
  "expeditionLoot",
  "probeYield",
  "outpostYield",
  "qualityLuck",
  "towSpeed",
  "deckCost", // deck level cost multiplier: lower is better
  "stampGain",
  "rivetGain",
  "sparkGain",
  "xpGain",
  "repGain",
  "droneCap",
  "crewCap",
] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Modifiers = Record<StatKey, number>;

/** One contribution to a stat. Final value = (1 + sum of add) * product of mul. `deck` scopes it to one deck's output. */
export interface Effect {
  stat?: StatKey;
  deck?: DeckId;
  add?: number;
  mul?: number;
}

// ---------- content definitions (src/content) -----------------------------------------

export type ItemCategory = "raw" | "refined" | "component" | "module" | "mega" | "consumable" | "artifact" | "special";

export interface ModuleSpec {
  family: ModuleFamily;
  mk: number; // 1..5
  effects: Effect[]; // at Standard quality, 100 % integrity, module level 0
  wear: number; // integrity % lost per active hour before modifiers
  power: number; // reactor units drawn (negative = supplies power)
}

export interface ConsumableSpec {
  kind: "repair" | "fuel" | "coffee" | "boost" | "beacon";
  repairPct?: number; // integrity restored
  repairCap?: number; // cannot raise integrity above this
  fuel?: number;
  morale?: number;
  buff?: { effect: Effect; secs: number };
}

export interface ItemDef {
  id: ItemId;
  tier: 0 | 1 | 2 | 3 | 4;
  category: ItemCategory;
  name: L10n;
  desc: L10n;
  value: number; // base price in credits per unit
  icon: string; // key in src/ui/icons.generated.ts
  mass?: number; // cargo units per item (default 1; modules, megas, artifacts and specials use 0)
  module?: ModuleSpec;
  consumable?: ConsumableSpec;
  tags?: string[];
}

export type DeckCurve = "exp" | "lin" | "soft";

export interface DeckDef {
  id: DeckId;
  name: L10n;
  desc: L10n;
  icon: string;
  /** What the output number means, shown next to the LCD (e.g. "units/s"). */
  unit: L10n;
  base: number; // output at level 1
  curve: DeckCurve; // exp: L * 2^milestones, lin: L, soft: 1 + log2(1 + L)
  baseCost: number; // credits for level 1 -> 2
  costGrowth: number; // cost(L) = baseCost * costGrowth^(L - 1)
  power: number; // reactor units drawn per level (the reactor's own value is 0)
  unlock: { credits: number; items?: Record<ItemId, number>; deck?: { id: DeckId; level: number }; chapter?: number };
  startLevel: number; // level in a fresh game (0 = not built)
}

export interface RecipeDef {
  id: RecipeId;
  station: CraftStationId;
  tier: 1 | 2 | 3 | 4;
  inputs: Record<ItemId, number>; // 2 to 5 inputs (T1 may have 1)
  outputs: Record<ItemId, number>; // first key is the primary product
  byproducts?: { item: ItemId; amount: number; chance: number }[];
  time: number; // seconds per batch at speed 1
  unlock: { start?: boolean; research?: ResearchId; blueprint?: boolean; chapter?: number; deck?: { id: DeckId; level: number } };
}

export interface ResearchDef {
  id: ResearchId;
  branch: "extraction" | "logistics" | "fabrication" | "maintenance" | "navigation" | "science" | "crew";
  name: L10n;
  desc: L10n;
  icon: string;
  pos: { x: number; y: number }; // tree layout, grid units
  requires: ResearchId[];
  maxLevel: number;
  cost: number; // research points for level 1
  costGrowth: number;
  items?: Record<ItemId, number>; // extra item cost per level
  effects?: Effect[]; // applied once per level
  recipes?: RecipeId[];
  feature?: FeatureId;
}

export interface CardDef {
  id: CardId;
  deck: DeckId;
  rarity: 0 | 1 | 2 | 3;
  name: L10n;
  desc: L10n;
  effects: Effect[]; // per card level
}

export interface TraitDef {
  id: TraitId;
  name: L10n;
  desc: L10n;
  effects: Effect[]; // applied while the crew member manages a deck (deck-scoped effects with no `deck` use the managed deck)
  good: boolean;
}

export interface Condition {
  all?: Condition[];
  any?: Condition[];
  not?: Condition;
  depthMin?: number;
  depthMax?: number;
  chapterMin?: number;
  chapterMax?: number;
  warpMin?: number; // warp jumps completed
  flag?: string;
  flagNot?: string;
  feature?: FeatureId;
  deck?: { id: DeckId; level: number };
  item?: { id: ItemId; n: number };
  hullBelow?: number;
  hullAbove?: number;
  moraleBelow?: number;
  moraleAbove?: number;
  fuelBelow?: number;
  crewMin?: number;
  modulesMin?: number;
  station?: boolean; // current system has a station
  star?: StarType[];
  hazard?: HazardKind;
  failure?: FailureKind | "none" | "any";
  rep?: { faction: FactionId; min?: number; max?: number };
  stat?: { key: string; min: number }; // counters in GameState.stats
}

export type EventType =
  | "meteor"
  | "pirates"
  | "merchant"
  | "derelict"
  | "anomaly"
  | "flare"
  | "fauna"
  | "distress"
  | "fault"
  | "stowaway"
  | "kipp"
  | "contact"
  | "story";

export type EventEffect =
  | { t: "credits"; secs: number } // N seconds of current credit income (negative = loss, never below zero balance)
  | { t: "item"; item: ItemId; n: number; scaled?: boolean } // scaled: multiplied by the current mining batch scale
  | { t: "loseCargo"; pct: number }
  | { t: "hull"; pct: number } // negative = damage (reduced by shield), positive = repair
  | { t: "moduleDamage"; pct: number; count?: number; family?: ModuleFamily }
  | { t: "fuel"; n: number }
  | { t: "morale"; n: number }
  | { t: "rep"; faction: FactionId; n: number }
  | { t: "flag"; key: string; value?: number }
  | { t: "failure"; kind: FailureKind }
  | { t: "minigame"; game: MinigameId; tier: MinigameTier; win: EventEffect[]; lose: EventEffect[] }
  | { t: "blueprint"; recipe?: RecipeId } // random undiscovered blueprint recipe when omitted
  | { t: "crew" }
  | { t: "card"; deck?: DeckId }
  | { t: "log"; id?: LogId } // next unfound crew log when omitted
  | { t: "codex"; key: string }
  | { t: "rp"; secs: number }
  | { t: "buff"; effect: Effect; secs: number }
  | { t: "chain"; event: EventId; delay?: number };

export interface EventOutcome {
  weight: number;
  good?: boolean; // eventLuck shifts weight toward good outcomes
  text: L10n;
  effects: EventEffect[];
}

export interface EventChoice {
  id: string;
  label: L10n;
  requires?: Condition;
  cost?: { credits?: number /* seconds of income */; items?: Record<ItemId, number> };
  outcomes: EventOutcome[];
  /** How risky this choice is; offline policies pick by this. 0 = safe, 1 = balanced, 2 = risky. */
  risk: 0 | 1 | 2;
}

export interface EventDef {
  id: EventId;
  type: EventType;
  weight: number;
  cooldown?: number; // seconds before it may repeat (default 1800)
  once?: boolean;
  chainOnly?: boolean;
  when?: Condition;
  title: L10n;
  text: L10n;
  art?: string; // viewport vignette key
  choices: EventChoice[]; // 2 to 4
}

export type FailureExit =
  | { kind: "minigame"; game: MinigameId; tier: MinigameTier }
  | { kind: "wait"; seconds: number }
  | { kind: "items"; items: Record<ItemId, number> }
  | { kind: "credits"; secs: number }
  | { kind: "tow" };

export interface FailureDef {
  id: FailureKind;
  name: L10n;
  desc: L10n;
  effects: Effect[]; // while active
  blocksJump: boolean;
  blocksDecks: DeckId[];
  exits: FailureExit[]; // always includes {kind: "tow"}
  towBase: number; // seconds at depth 0 before modifiers
}

export interface ChapterDef {
  id: number; // 1..12
  title: L10n;
  intro: StoryBeat[];
  trigger: Condition; // chapter N starts when chapter N-1 is active and this holds
  objectives: { text: L10n; done: Condition }[];
  unlocks?: FeatureId[];
}

export interface StoryBeat {
  speaker: "kipp" | "signal" | "log" | "narrator" | "crew";
  text: L10n;
}

export interface LogDef {
  id: LogId;
  author: L10n;
  title: L10n;
  text: L10n;
  order: number; // discovery order
}

export type KippTrigger =
  | "idle"
  | "purchase"
  | "milestone"
  | "damage"
  | "repair"
  | "moduleBroken"
  | "cargoFull"
  | "lowFuel"
  | "jump"
  | "arrival"
  | "discovery"
  | "eventGood"
  | "eventBad"
  | "failure"
  | "rescued"
  | "minigameWin"
  | "minigameLose"
  | "overdrive"
  | "overheat"
  | "offlineReturn"
  | "prestige"
  | "coffeeOut"
  | "crewJoin"
  | "station"
  | "craft"
  | "research"
  | "achievement"
  | "debug";

export interface KippLineDef {
  id: string;
  trigger: KippTrigger;
  text: L10n; // may contain {name}, {ship}, {n}
  when?: Condition;
  failure?: FailureKind; // only for trigger "failure"
}

export interface AchievementDef {
  id: AchievementId;
  name: L10n;
  desc: L10n;
  icon: string;
  stat: string; // counter in GameState.stats
  threshold: number;
  hidden?: boolean;
  reward?: { stamps?: number; cosmetic?: CosmeticId };
}

export interface PrestigeUpgradeDef {
  id: UpgradeId;
  layer: 1 | 2 | 3;
  name: L10n;
  desc: L10n;
  icon: string;
  pos: { x: number; y: number };
  requires: UpgradeId[];
  maxLevel: number;
  cost: number;
  costGrowth: number;
  effects?: Effect[];
  feature?: FeatureId;
}

export interface MutatorDef {
  id: MutatorId;
  name: L10n;
  desc: L10n;
  effects: Effect[];
  /** Stamp reward multiplier for accepting it. */
  reward: number;
}

export interface HullClassDef {
  id: HullClassId;
  name: L10n;
  desc: L10n;
  sprite: string;
  grid: { w: number; h: number };
  effects: Effect[];
  cost: number; // rivets
  inheritBlueprints: number; // recipes kept across a rebuild
}

export interface CosmeticDef {
  id: CosmeticId;
  kind: "paint" | "trail" | "sticker" | "toy";
  name: L10n;
  desc: L10n;
  value: string; // palette key / sprite key
  unlock: { start?: boolean; achievement?: AchievementId; stamps?: number; chapter?: number };
}

export interface FactionDef {
  id: FactionId;
  name: L10n;
  desc: L10n;
  color: string;
  likes: ItemCategory[];
}

export interface ShopItemDef {
  id: string;
  name: L10n;
  desc: L10n;
  icon: string;
  faction?: FactionId;
  repMin?: number;
  cost: number; // credits = N seconds of income, min floor in `costFloor`
  costFloor: number;
  costGrowth: number;
  maxLevel: number;
  effects?: Effect[];
  gridSlots?: number; // unlocks extra grid cells
  item?: { id: ItemId; n: number };
}

export interface BiomeDef {
  id: BiomeId;
  name: L10n;
  desc: L10n[]; // description variants
  hazards: HazardKind[];
  resources: ItemId[]; // raw items it can hold
  special?: ItemId[];
  palette: string[]; // 5 palette keys from assets/palette.json: deep, dark, mid, light, accent
  shader: "rock" | "gas" | "ice" | "lava" | "ocean" | "desert" | "toxic" | "crystal";
}

export interface QuestTemplateDef {
  id: string;
  text: L10n; // contains {n}
  stat: string; // counter in GameState.stats, measured as a delta since the quest started
  base: number;
  scale: "flat" | "income"; // income: target grows with progress
  weekly?: boolean;
}

/** All authored data. Built in src/content/index.ts and validated by scripts/validate. */
export interface ContentDB {
  items: Record<ItemId, ItemDef>;
  decks: Record<DeckId, DeckDef>;
  recipes: Record<RecipeId, RecipeDef>;
  research: Record<ResearchId, ResearchDef>;
  cards: Record<CardId, CardDef>;
  traits: Record<TraitId, TraitDef>;
  events: Record<EventId, EventDef>;
  failures: Record<FailureKind, FailureDef>;
  chapters: ChapterDef[];
  logs: LogDef[];
  kipp: KippLineDef[];
  achievements: AchievementDef[];
  upgrades: Record<UpgradeId, PrestigeUpgradeDef>;
  mutators: Record<MutatorId, MutatorDef>;
  hulls: Record<HullClassId, HullClassDef>;
  cosmetics: Record<CosmeticId, CosmeticDef>;
  factions: Record<FactionId, FactionDef>;
  shop: Record<string, ShopItemDef>;
  biomes: Record<BiomeId, BiomeDef>;
  quests: QuestTemplateDef[];
  /** Ending choices for the Priority 1 ticket (chapter 12). */
  endings: { id: string; title: L10n; text: L10n; epilogue: L10n }[];
  /** Flavour for the endless Backlog tickets. */
  backlogTickets: { id: string; title: L10n; text: L10n }[];
  /** Effects granted while at least one of a megastructure item is owned. */
  megaEffects: Record<ItemId, Effect[]>;
  /** Syllable tables for procedural names and crew name pools. */
  names: {
    systemA: string[];
    systemB: string[];
    systemC: string[];
    planetSuffix: string[];
    crewFirst: string[];
    crewLast: string[];
    stationWords: L10n[];
    faunaA: string[];
    faunaB: string[];
    floraA: string[];
    floraB: string[];
  };
  /** Tunable constants, see docs/GDD.md. */
  balance: Balance;
}

export interface Balance {
  startCredits: number;
  milestones: number[]; // deck levels that double output
  brokerFee: number; // auto-sell price factor before research
  hopperSeconds: number;
  richnessPerDepth: number; // mining value multiplier per depth step
  galaxyDepth: number; // depth of the core in galaxy 0
  galaxyDepthGrowth: number; // extra depth per warp
  qualityMult: number[]; // 5 entries
  qualityWear: number[]; // wear factor per quality
  adjacencyBonus: number; // per adjacent same-family module
  degradeAt: number; // integrity below this scales output down
  offlineAt: number; // integrity below this = module offline
  offlineBaseEff: number;
  offlineBaseCap: number; // seconds
  offlineWearFactor: number;
  offlineIntegrityFloor: number;
  activeMult: number;
  heatPerSec: number;
  coolPerSec: number;
  overheatLock: number;
  overdriveMult: number;
  overdriveSecs: number;
  salvageEvery: [number, number]; // seconds range
  salvageMax: number;
  eventEvery: [number, number]; // seconds range between events
  eventMaxPerHour: number;
  fuelPerJump: number;
  fuelCap: number;
  jumpChargeSecs: number;
  jumpCooldownSecs: number;
  warpStampBase: number; // lifetime credits (log10) at which the first stamp is earned
  warpStampExp: number;
  moduleUpgradeGrowth: number;
  [key: string]: number | number[] | [number, number];
}

// ---------- game state ----------------------------------------------------------------

export interface DeckState {
  level: number; // 0 = not built
  manager: number; // crew uid, 0 = none
  cards: CardId[]; // equipped, max 2
}

export interface CraftJob {
  uid: number;
  recipe: RecipeId;
  /** Batches left; -1 = repeat forever ("make it again"/auto-queue). */
  left: number;
  progress: number; // seconds into the current batch
  stalled?: "inputs" | "cargo" | "power";
}

export interface CraftStationState {
  queue: CraftJob[];
}

export interface ModuleInst {
  uid: number;
  item: ItemId;
  q: Quality;
  hp: number; // integrity 0..100
  lvl: number; // credit upgrades
  slot: number; // grid cell index, -1 = in storage
}

export interface RepairJob {
  target: number; // module uid, 0 = hull
  /** Glitched jobs make no progress until the player taps them (or 30 min pass). */
  glitchUntil: number;
}

export interface PendingMinigame {
  token: number;
  game: MinigameId;
  tier: MinigameTier;
  purpose: "repair" | "event" | "failure" | "hack" | "expedition" | "practice";
  /** Opaque reference for the purpose handler (module uid, event choice index, ...). */
  ref: number;
}

export interface SalvageBlob {
  uid: number;
  kind: "crate" | "pod" | "wreck" | "crystal";
  x: number; // 0..1 across the viewport
  y: number;
  born: number; // GameState.t
  ttl: number;
  seed: number;
}

export interface Buff {
  effect: Effect;
  until: number; // GameState.t
  src: string;
}

export interface NavState {
  g: number; // galaxy index (= warp count)
  depth: number;
  lane: number;
  fuel: number;
  charge: number; // 0..1 hyperdrive charge
  cooldownUntil: number;
  jump: null | { depth: number; lane: number; until: number };
  visited: Record<string, 1>; // "g:depth:lane"
  maxDepth: number;
}

export interface PlanetState {
  scan: number; // 0..1
  probes: number;
  outpost: 0 | 1;
}

export interface Expedition {
  uid: number;
  planet: string; // planet id
  planetName: string;
  crew: number[]; // crew uids
  start: number;
  end: number;
  risk: number; // 0..1
  seed: number;
  done: boolean; // finished, reward waiting to be claimed
}

export interface Outpost {
  planet: string;
  name: string;
  item: ItemId;
  rate: number; // fraction of mining rate
}

export interface CodexEntry {
  t: number; // GameState.t when discovered
  name?: string; // player rename
}

export interface CrewMember {
  uid: number;
  seed: number; // portrait and base name
  name: string;
  traits: TraitId[];
  level: number;
  xp: number;
  deck: DeckId | null;
  away: boolean; // on an expedition
}

export interface Contract {
  uid: number;
  faction: FactionId;
  item: ItemId;
  need: Big;
  have: Big;
  reward: Big; // credits
  rep: number;
  expires: number; // GameState.t
  sys: string; // system id where it was accepted
}

export interface ActiveEvent {
  id: EventId;
  seed: number;
  /** Set once a choice was taken: outcome text is shown until dismissed. */
  result: null | { choice: number; outcome: number };
}

export interface FailureState {
  kind: FailureKind;
  since: number;
  waitUntil: number; // 0 = waiting is not an exit here
  tow: null | { eta: number; cost: Big };
}

export interface QuestState {
  id: string; // template id
  target: number;
  start: number; // stat value when issued
  claimed: boolean;
}

export interface GameState {
  v: number; // save schema version
  seed: number; // universe seed
  rng: number; // gameplay PRNG state (mulberry32)
  uid: number; // last issued uid
  t: number; // game clock, seconds; advances with ticks and with (uncapped) offline time
  wall: number; // wall clock ms at the last tick/save
  played: number; // seconds with the app in the foreground
  created: number; // wall clock ms

  player: { name: string; ship: string };

  // ----- core economy (src/engine/core)
  credits: Big;
  lifetime: Big; // credits earned since the last warp
  allTime: Big; // credits earned ever
  inv: Record<ItemId, Big>;
  keep: Record<ItemId, number>; // fraction of cargo capacity reserved per item before auto-sell (default from tier)
  decks: Record<DeckId, DeckState>;
  hopper: Big; // mined units waiting for the lift
  drones: { hauler: number; probe: number; salvager: number; fixer: number };
  craft: Record<CraftStationId, CraftStationState>;
  autoRecipes: RecipeId[]; // auto-queue list
  recipes: Record<RecipeId, 1>; // known recipes
  modules: ModuleInst[];
  grid: { w: number; h: number; open: number; cells: number[] }; // cells: module uid or 0; first `open` cells usable
  hull: { hp: number; cls: HullClassId };
  repair: { botLevel: number; auto: boolean; priority: number[]; jobs: RepairJob[] };
  active: { heat: number; lockUntil: number; combo: number; overdriveUntil: number; scanReadyAt: number; mining: boolean; salvage: SalvageBlob[]; nextSalvageAt: number };
  minigame: PendingMinigame | null;
  buffs: Buff[];
  features: Partial<Record<FeatureId, 1>>;
  flags: Record<string, number>;
  stats: Record<string, number>; // counters for achievements/quests (see docs/GDD.md "Stats")
  buyMode: 1 | 10 | 100 | -1; // -1 = max

  // ----- world (src/engine/world)
  nav: NavState;
  planets: Record<string, PlanetState>; // by planet id, current galaxy only
  codex: Record<string, CodexEntry>; // "planet:<id>", "fauna:<id>", "flora:<id>", "system:<id>", "artifact:<item>"
  expeditions: Expedition[];
  outposts: Outpost[];
  events: { active: ActiveEvent | null; nextAt: number; last: Record<EventId, number>; seen: Record<EventId, number>; hourStart: number; hourCount: number; chain: { id: EventId; at: number }[] };
  failure: FailureState | null;
  crew: CrewMember[];
  morale: number; // 0..100
  cards: Record<CardId, { n: number; lvl: number }>;
  station: { docked: boolean; rep: Record<FactionId, number>; contracts: Contract[]; offers: Contract[]; offersDay: number; shop: Record<string, number>; trades: Record<string, number> };

  // ----- meta (src/engine/meta)
  rp: Big; // research points
  research: Record<ResearchId, number>;
  prestige: {
    warps: number;
    stamps: Big;
    stampsTotal: Big;
    mutators: MutatorId[]; // active this galaxy
    rebuilds: number;
    rivets: Big;
    reboots: number;
    sparks: Big;
    upgrades: Record<UpgradeId, number>;
    hullsOwned: HullClassId[];
    kept: RecipeId[]; // inherited blueprints
  };
  story: { chapter: number; beat: number; pending: number[]; logs: LogId[]; ending: string | null; kippRecent: string[]; kippNextAt: number };
  achievements: Record<AchievementId, number>; // wall ms when earned
  quests: { day: number; daily: QuestState[]; streak: number; lastClaimDay: number; week: number; weekly: QuestState | null; weeklyMutator: MutatorId | null };
  cosmetics: { owned: CosmeticId[]; paint: CosmeticId; trail: CosmeticId; stickers: CosmeticId[]; toy: CosmeticId };
  offline: { policy: OfflinePolicy; lastReport: OfflineReport | null };
  backup: { lastExport: number; lastReminder: number };
}

// ---------- runtime (not saved) -------------------------------------------------------

export interface Rates {
  /** Mining output in units per second after power and failure effects. */
  mine: Big;
  lift: Big;
  cargoCap: Big;
  cargoUsed: Big;
  /** Smoothed credit income per second (auto-sell), used for "N seconds of income" rewards. */
  income: Big;
  research: Big;
  power: { supply: number; demand: number; eff: number };
  /** Units per second per raw item from mining at the current location. */
  mix: { item: ItemId; share: number }[];
  craftBatch: Record<CraftStationId, Big>;
  craftSlots: Record<CraftStationId, number>;
  richness: Big;
}

export type EngineEvent =
  | { t: "purchase"; deck: DeckId; levels: number; milestone: boolean }
  | { t: "deckBuilt"; deck: DeckId }
  | { t: "sold"; credits: Big }
  | { t: "craftDone"; recipe: RecipeId; station: CraftStationId; quality?: Quality }
  | { t: "moduleBroken"; uid: number }
  | { t: "moduleRepaired"; uid: number }
  | { t: "hullDamage"; pct: number }
  | { t: "salvageSpawn"; uid: number }
  | { t: "salvageCollected"; uid: number; credits: Big; item?: ItemId }
  | { t: "overheat" }
  | { t: "overdrive"; on: boolean }
  | { t: "eventStarted"; id: EventId }
  | { t: "eventResolved"; id: EventId; good: boolean }
  | { t: "failureStarted"; kind: FailureKind }
  | { t: "failureCleared"; kind: FailureKind; by: FailureExit["kind"] }
  | { t: "jumpStart" }
  | { t: "jumpEnd"; system: string }
  | { t: "discovery"; key: string }
  | { t: "expeditionDone"; uid: number }
  | { t: "crewJoined"; uid: number }
  | { t: "cardFound"; card: CardId }
  | { t: "blueprint"; recipe: RecipeId }
  | { t: "researchDone"; id: ResearchId }
  | { t: "chapter"; id: number }
  | { t: "log"; id: LogId }
  | { t: "kipp"; line: string; vars?: Record<string, string | number> }
  | { t: "achievement"; id: AchievementId }
  | { t: "questDone"; id: string }
  | { t: "contractDone"; uid: number }
  | { t: "prestige"; layer: 1 | 2 | 3 }
  | { t: "minigameRequest"; token: number }
  | { t: "feature"; id: FeatureId }
  | { t: "cargoFull" }
  | { t: "toast"; text: L10n; tone: "info" | "good" | "warn" | "bad" };

export type FailReason =
  | "credits"
  | "items"
  | "locked"
  | "max"
  | "cargo"
  | "busy"
  | "fuel"
  | "cooldown"
  | "failure"
  | "noTarget"
  | "requirement"
  | "invalid";
export type ActionResult = { ok: true } | { ok: false; reason: FailReason };

export interface MinigameResult {
  /** Quality 0..1; >= 0.5 counts as success, >= 0.95 as perfect. */
  score: number;
  success: boolean;
  perfect: boolean;
  durationMs: number;
  auto?: boolean;
}

export interface OfflineReport {
  seconds: number; // real time away
  credited: number; // seconds that counted (cap)
  efficiency: number;
  credits: Big;
  items: Record<ItemId, Big>;
  rp: Big;
  wear: { uid: number; from: number; to: number }[];
  hull: { from: number; to: number };
  events: { id: EventId; choice: number; outcome: number }[];
  hooks: { kind: "discovery" | "repair" | "trader" | "expedition" | "contract" | "cargoFull"; text: L10n }[];
  safeMode: boolean; // ship was parked because of damage/failure
}

/**
 * Cross-system calls. Each engine area registers its implementations in its SystemDef.init,
 * so areas never import each other's files. The kernel installs safe no-op defaults.
 */
export interface EngineApi {
  // core
  damageModules(pct: number, count?: number, family?: ModuleFamily): number[];
  damageHull(pct: number): void;
  repairAll(pct: number): void;
  addModule(item: ItemId, q?: Quality): number;
  unlockRecipe(id: RecipeId): boolean;
  grantBlueprint(): RecipeId | null;
  requestMinigame(game: MinigameId, tier: MinigameTier, purpose: PendingMinigame["purpose"], ref: number): number;
  miningScale(): Big; // units a "scaled" item reward is multiplied by (about 10 s of mining)
  // world
  currentSystem(): SystemInfo;
  hazardFactor(): number; // >= 1, multiplies wear
  startFailure(kind: FailureKind): boolean;
  clearFailure(by: FailureExit["kind"]): void;
  triggerEvent(id: EventId): boolean;
  addCrew(): number;
  grantCard(deck?: DeckId): CardId | null;
  applyEffects(effects: EventEffect[], seed: number): void;
  // meta
  say(trigger: KippTrigger, vars?: Record<string, string | number>): void;
  addLog(id?: LogId): LogId | null;
  discover(key: string): boolean;
  check(cond: Condition | undefined): boolean;
}

export interface Game {
  state: GameState;
  content: ContentDB;
  /** Cached global modifiers; rebuilt when `dirty` is set. Never mutate directly. */
  mods: Modifiers;
  /** Cached per-deck output multipliers (manager, cards, deck-scoped effects). */
  deckMult: Record<DeckId, number>;
  rates: Rates;
  /** Set by anything that changes modifier or rate inputs. Cleared by the tick. */
  dirty: boolean;
  /** Incremented every time mods are rebuilt; areas compare it to refresh their own caches (Rates). */
  rev: number;
  /** Transient events for UI/audio/haptics. Capped; drained by the shell every pulse. */
  outbox: EngineEvent[];
  api: EngineApi;
  systems: SystemDef[];
  /** Handlers for minigame results by purpose, registered in SystemDef.init. */
  minigameHandlers: Partial<Record<PendingMinigame["purpose"], (g: Game, pending: PendingMinigame, result: MinigameResult) => void>>;
  /** Offline simulation in progress: suppress outbox noise and interactive requests. */
  offline: boolean;
}

export interface SystemDef {
  id: string;
  /** Fill missing state for a new or migrated save and register api/minigame handlers. Must be idempotent. */
  init?(g: Game): void;
  /** Contribute to modifiers. Called only while rebuilding caches. */
  modifiers?(g: Game, out: Effect[]): void;
  /** Fixed-step update, dt in seconds (0.1). Must not allocate per call beyond what state changes need. */
  tick?(g: Game, dt: number): void;
  /**
   * Advance by a long span in closed form (offline). `eff` is the offline efficiency for production.
   * Timers based on GameState.t need nothing here: t is advanced by the caller.
   */
  offline?(g: Game, seconds: number, eff: number, report: OfflineReport): void;
  /** Reset this area's run state. layer 1 = warp, 2 = rebuild, 3 = reboot. */
  prestige?(g: Game, layer: 1 | 2 | 3): void;
}

// ---------- galaxy (pure functions of indices, src/engine/world/galaxy.ts) -------------

export interface PlanetInfo {
  id: string; // "g:depth:lane:index"
  index: number;
  name: string;
  biome: BiomeId;
  size: number; // 0..1
  rings: boolean;
  moons: number;
  hazards: HazardKind[];
  atmosphere: "none" | "thin" | "breathable" | "dense" | "corrosive";
  weather: "calm" | "windy" | "storms" | "extreme";
  resources: ItemId[];
  special: ItemId | null;
  fauna: number; // species count
  flora: number;
  seed: number;
}

export interface SystemInfo {
  id: string; // "g:depth:lane"
  g: number;
  depth: number;
  lane: number;
  name: string;
  star: StarType;
  seed: number;
  hazards: HazardKind[];
  richness: number; // local multiplier around 1 (the per-depth growth is in Rates.richness)
  resources: { item: ItemId; w: number }[];
  planets: PlanetInfo[];
  belts: number;
  station: null | { faction: FactionId; name: string };
  anomaly: boolean;
  /** Lanes reachable at depth + 1. */
  links: number[];
  /** Map position, x 0..1 across lanes, y = depth. */
  pos: { x: number; y: number };
  isCore: boolean;
}

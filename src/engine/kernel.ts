// Engine kernel: game container, shared primitive operations, modifier cache, fixed-step loop and
// the offline entry point. Owned by the orchestrator. Areas (core/world/meta) build on these helpers
// and talk to each other only through Game.api.
import * as B from "./big";
import { mulberry } from "./prng";
import {
  DECK_IDS,
  STAT_KEYS,
  type ActionResult,
  type Big,
  type Buff,
  type Condition,
  type ContentDB,
  type DeckId,
  type DeckState,
  type Effect,
  type EngineApi,
  type EngineEvent,
  type FailReason,
  type FeatureId,
  type Game,
  type GameState,
  type ItemId,
  type Modifiers,
  type OfflineReport,
  type Rates,
  type StatKey,
  type SystemDef,
} from "./types";

export const SCHEMA_VERSION = 1;
export const TICK = 0.1; // seconds
const OUTBOX_MAX = 96;
const MOD_CLAMP = 1e300;
/** Longest real-time gap that is still simulated tick by tick; longer gaps use the offline path. */
export const OFFLINE_THRESHOLD = 60;
const MAX_CLOCK_DELTA = 30 * 24 * 3600;

export const OK: ActionResult = Object.freeze({ ok: true }) as ActionResult;
export const fail = (reason: FailReason): ActionResult => ({ ok: false, reason });

// ---------- state ---------------------------------------------------------------------

function blankDecks(content: ContentDB): Record<DeckId, DeckState> {
  const out = {} as Record<DeckId, DeckState>;
  for (const id of DECK_IDS) out[id] = { level: content.decks[id]?.startLevel ?? 0, manager: 0, cards: [] };
  return out;
}

/** A complete fresh state. Areas refine their slices in SystemDef.init. */
export function newState(content: ContentDB, seed: number, wallMs: number): GameState {
  const z = (): Big => ({ m: 0, e: 0 });
  return {
    v: SCHEMA_VERSION,
    seed: seed | 0,
    rng: (seed ^ 0x5eed1e55) | 0,
    uid: 0,
    t: 0,
    wall: wallMs,
    played: 0,
    created: wallMs,
    player: { name: "Chief Wrench", ship: "S.S. Gaffer" },

    credits: B.big(content.balance.startCredits),
    lifetime: z(),
    allTime: z(),
    inv: {},
    keep: {},
    decks: blankDecks(content),
    hopper: z(),
    drones: { hauler: 0, probe: 0, salvager: 0, fixer: 0 },
    craft: { refinery: { queue: [] }, fabricator: { queue: [] }, workshop: { queue: [] } },
    autoRecipes: [],
    recipes: {},
    modules: [],
    grid: { w: 3, h: 3, open: 4, cells: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
    hull: { hp: 100, cls: "tug" },
    repair: { botLevel: 0, auto: false, priority: [], jobs: [] },
    active: { heat: 0, lockUntil: 0, combo: 0, overdriveUntil: 0, scanReadyAt: 0, mining: false, salvage: [], nextSalvageAt: 20 },
    minigame: null,
    buffs: [],
    features: {},
    flags: {},
    stats: {},
    buyMode: 1,

    nav: { g: 0, depth: 0, lane: 0, fuel: 0, charge: 0, cooldownUntil: 0, jump: null, visited: { "0:0:0": 1 }, maxDepth: 0 },
    planets: {},
    codex: {},
    expeditions: [],
    outposts: [],
    events: { active: null, nextAt: 240, last: {}, seen: {}, hourStart: 0, hourCount: 0, chain: [] },
    failure: null,
    crew: [],
    morale: 70,
    cards: {},
    station: { docked: false, rep: { lamplighters: 0, rustborn: 0, ledger: 0 }, contracts: [], offers: [], offersDay: -1, shop: {}, trades: {} },

    rp: z(),
    research: {},
    prestige: {
      warps: 0,
      stamps: z(),
      stampsTotal: z(),
      mutators: [],
      rebuilds: 0,
      rivets: z(),
      reboots: 0,
      sparks: z(),
      upgrades: {},
      hullsOwned: ["tug"],
      kept: [],
    },
    story: { chapter: 0, beat: 0, pending: [], logs: [], ending: null, kippRecent: [], kippNextAt: 30 },
    achievements: {},
    quests: { day: -1, daily: [], streak: 0, lastClaimDay: -1, week: -1, weekly: null, weeklyMutator: null },
    cosmetics: { owned: [], paint: "", trail: "", stickers: [], toy: "" },
    offline: { policy: "balanced", lastReport: null },
    backup: { lastExport: 0, lastReminder: 0 },
  };
}

function blankMods(): Modifiers {
  const m = {} as Modifiers;
  for (const k of STAT_KEYS) m[k] = 1;
  return m;
}

function blankDeckMult(): Record<DeckId, number> {
  const m = {} as Record<DeckId, number>;
  for (const id of DECK_IDS) m[id] = 1;
  return m;
}

function blankRates(): Rates {
  const z = (): Big => ({ m: 0, e: 0 });
  return {
    mine: z(),
    lift: z(),
    cargoCap: z(),
    cargoUsed: z(),
    income: z(),
    research: z(),
    power: { supply: 0, demand: 0, eff: 1 },
    mix: [],
    craftBatch: { refinery: B.big(1), fabricator: B.big(1), workshop: B.big(1) },
    craftSlots: { refinery: 1, fabricator: 1, workshop: 1 },
    richness: B.big(1),
  };
}

function defaultApi(g: Game): EngineApi {
  const missing = (name: string) => () => {
    throw new Error(`EngineApi.${name} called before a system registered it`);
  };
  return {
    damageModules: () => [],
    damageHull: () => {},
    repairAll: () => {},
    addModule: () => 0,
    unlockRecipe: () => false,
    grantBlueprint: () => null,
    requestMinigame: () => 0,
    miningScale: () => B.big(1),
    currentSystem: missing("currentSystem") as EngineApi["currentSystem"],
    hazardFactor: () => 1,
    startFailure: () => false,
    clearFailure: () => {},
    triggerEvent: () => false,
    addCrew: () => 0,
    grantCard: () => null,
    applyEffects: () => {},
    say: () => {},
    addLog: () => null,
    discover: () => false,
    check: (cond) => checkCondition(g, cond),
  };
}

/**
 * Builds a runnable game around a state. Pass a loaded (already migrated) state, or omit it for a new game.
 * `systems` is the ordered list from src/engine/index.ts; tests may pass a subset.
 */
export function createGame(content: ContentDB, systems: SystemDef[], state?: GameState, opts?: { seed?: number; wallMs?: number }): Game {
  const g = {
    state: state ?? newState(content, opts?.seed ?? 1, opts?.wallMs ?? 0),
    content,
    mods: blankMods(),
    deckMult: blankDeckMult(),
    rates: blankRates(),
    dirty: true,
    rev: 0,
    outbox: [],
    systems,
    minigameHandlers: {},
    offline: false,
  } as unknown as Game;
  g.api = defaultApi(g);
  for (const s of systems) s.init?.(g);
  rebuildMods(g);
  return g;
}

// ---------- primitive operations ------------------------------------------------------

export function emit(g: Game, ev: EngineEvent): void {
  if (g.offline) return;
  if (g.outbox.length >= OUTBOX_MAX) g.outbox.shift();
  g.outbox.push(ev);
}

export function markDirty(g: Game): void {
  g.dirty = true;
}

export function nextUid(g: Game): number {
  return ++g.state.uid;
}

/** Gameplay random float in [0, 1), advancing the saved stream. */
export function roll(g: Game): number {
  const r = mulberry(g.state.rng);
  g.state.rng = r.state;
  return r.value;
}

/** Integer in [min, max] inclusive. */
export function rollInt(g: Game, min: number, max: number): number {
  return min + Math.floor(roll(g) * (max - min + 1));
}

export function rollRange(g: Game, min: number, max: number): number {
  return min + roll(g) * (max - min);
}

export function pick<T>(g: Game, arr: readonly T[]): T {
  return arr[Math.floor(roll(g) * arr.length)];
}

export function weightedIndex(g: Game, weights: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += Math.max(0, weights[i]);
  if (total <= 0) return 0;
  let r = roll(g) * total;
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r < 0) return i;
  }
  return weights.length - 1;
}

/** Adds to a counter in state.stats (achievements, quests, conditions). */
export function stat(g: Game, key: string, n = 1): void {
  const s = g.state.stats;
  s[key] = (s[key] ?? 0) + n;
}

/** Keeps the maximum seen value of a counter. */
export function statMax(g: Game, key: string, n: number): void {
  const s = g.state.stats;
  if (!(s[key] >= n)) s[key] = n;
}

export function getStat(g: Game, key: string): number {
  return g.state.stats[key] ?? 0;
}

const ZERO: Readonly<Big> = B.ZERO;

export function getItem(g: Game, id: ItemId): Readonly<Big> {
  return g.state.inv[id] ?? ZERO;
}

/** Adds items without checking cargo capacity (callers that respect cargo check Rates first). */
export function addItem(g: Game, id: ItemId, n: Big | number): void {
  const amount = typeof n === "number" ? B.big(n) : n;
  if (amount.m <= 0) return;
  const inv = g.state.inv;
  inv[id] = inv[id] ? B.add(inv[id], amount) : B.clone(amount);
}

/** Removes up to n items; returns false (and removes nothing) if there are not enough. */
export function takeItem(g: Game, id: ItemId, n: Big | number): boolean {
  const amount = typeof n === "number" ? B.big(n) : n;
  if (amount.m <= 0) return true;
  const have = g.state.inv[id];
  if (!have || B.cmp(have, amount) < 0) return false;
  const left = B.sub(have, amount);
  // adding and removing the same float amounts can leave dust
  if (left.m <= 0 || left.e < have.e - 14) delete g.state.inv[id];
  else g.state.inv[id] = left;
  return true;
}

export function hasItems(g: Game, items: Record<ItemId, number> | undefined, times = 1): boolean {
  if (!items) return true;
  for (const id in items) if (B.cmp(getItem(g, id), B.big(items[id] * times)) < 0) return false;
  return true;
}

export function takeItems(g: Game, items: Record<ItemId, number> | undefined, times = 1): boolean {
  if (!hasItems(g, items, times)) return false;
  if (items) for (const id in items) takeItem(g, id, items[id] * times);
  return true;
}

/** Adds credits. `earned` credits count toward lifetime totals (prestige rewards). */
export function addCredits(g: Game, amount: Big, earned = true): void {
  if (amount.m <= 0) return;
  const s = g.state;
  s.credits = B.add(s.credits, amount);
  if (earned) {
    s.lifetime = B.add(s.lifetime, amount);
    s.allTime = B.add(s.allTime, amount);
  }
}

export function canAfford(g: Game, cost: Big): boolean {
  return B.cmp(g.state.credits, cost) >= 0;
}

export function spend(g: Game, cost: Big): boolean {
  if (cost.m <= 0) return true;
  if (B.cmp(g.state.credits, cost) < 0) return false;
  g.state.credits = B.subClamp(g.state.credits, cost);
  return true;
}

/** Credits worth `secs` seconds of current income, with a small floor so early rewards are never zero. */
export function incomeSeconds(g: Game, secs: number): Big {
  const base = B.mulN(g.rates.income, Math.abs(secs));
  const floor = B.big(Math.abs(secs) * 0.5);
  return B.max(base, floor);
}

export function getFlag(g: Game, key: string): number {
  return g.state.flags[key] ?? 0;
}

export function setFlag(g: Game, key: string, value = 1): void {
  g.state.flags[key] = value;
}

export function hasFeature(g: Game, id: FeatureId): boolean {
  return g.state.features[id] === 1;
}

export function unlockFeature(g: Game, id: FeatureId): boolean {
  if (g.state.features[id] === 1) return false;
  g.state.features[id] = 1;
  g.dirty = true;
  emit(g, { t: "feature", id });
  return true;
}

export function addBuff(g: Game, effect: Effect, secs: number, src: string): void {
  const buffs = g.state.buffs;
  const until = g.state.t + secs;
  for (let i = 0; i < buffs.length; i++) {
    if (buffs[i].src === src) {
      buffs[i].effect = effect;
      buffs[i].until = Math.max(buffs[i].until, until);
      g.dirty = true;
      return;
    }
  }
  const buff: Buff = { effect, until, src };
  buffs.push(buff);
  g.dirty = true;
}

export function mod(g: Game, key: StatKey): number {
  return g.mods[key];
}

// ---------- conditions ----------------------------------------------------------------

export function checkCondition(g: Game, c: Condition | undefined): boolean {
  if (!c) return true;
  const s = g.state;
  if (c.all) for (const x of c.all) if (!checkCondition(g, x)) return false;
  if (c.any && c.any.length) {
    let hit = false;
    for (const x of c.any) if (checkCondition(g, x)) hit = true;
    if (!hit) return false;
  }
  if (c.not && checkCondition(g, c.not)) return false;
  if (c.depthMin !== undefined && s.nav.depth < c.depthMin) return false;
  if (c.depthMax !== undefined && s.nav.depth > c.depthMax) return false;
  if (c.chapterMin !== undefined && s.story.chapter < c.chapterMin) return false;
  if (c.chapterMax !== undefined && s.story.chapter > c.chapterMax) return false;
  if (c.warpMin !== undefined && s.prestige.warps < c.warpMin) return false;
  if (c.flag !== undefined && !(s.flags[c.flag] > 0)) return false;
  if (c.flagNot !== undefined && s.flags[c.flagNot] > 0) return false;
  if (c.feature !== undefined && s.features[c.feature] !== 1) return false;
  if (c.deck && s.decks[c.deck.id].level < c.deck.level) return false;
  if (c.item && B.cmp(getItem(g, c.item.id), B.big(c.item.n)) < 0) return false;
  if (c.hullBelow !== undefined && !(s.hull.hp < c.hullBelow)) return false;
  if (c.hullAbove !== undefined && !(s.hull.hp > c.hullAbove)) return false;
  if (c.moraleBelow !== undefined && !(s.morale < c.moraleBelow)) return false;
  if (c.moraleAbove !== undefined && !(s.morale > c.moraleAbove)) return false;
  if (c.fuelBelow !== undefined && !(s.nav.fuel < c.fuelBelow)) return false;
  if (c.crewMin !== undefined && s.crew.length < c.crewMin) return false;
  if (c.modulesMin !== undefined) {
    let n = 0;
    for (const m of s.modules) if (m.slot >= 0) n++;
    if (n < c.modulesMin) return false;
  }
  if (c.failure !== undefined) {
    const k = s.failure?.kind;
    if (c.failure === "none" ? k !== undefined : c.failure === "any" ? k === undefined : k !== c.failure) return false;
  }
  if (c.rep) {
    const r = s.station.rep[c.rep.faction] ?? 0;
    if (c.rep.min !== undefined && r < c.rep.min) return false;
    if (c.rep.max !== undefined && r > c.rep.max) return false;
  }
  if (c.stat && (s.stats[c.stat.key] ?? 0) < c.stat.min) return false;
  if (c.station !== undefined || c.star || c.hazard) {
    const sys = g.api.currentSystem();
    if (c.station !== undefined && (sys.station !== null) !== c.station) return false;
    if (c.star && !c.star.includes(sys.star)) return false;
    if (c.hazard && !sys.hazards.includes(c.hazard)) return false;
  }
  return true;
}

// ---------- modifiers -----------------------------------------------------------------

const scratch: Effect[] = [];

/**
 * Rebuilds Game.mods and Game.deckMult from every system's contributions and active buffs.
 * An effect with `stat` is global; an effect with only `deck` multiplies that deck's output.
 */
export function rebuildMods(g: Game): void {
  scratch.length = 0;
  for (const s of g.systems) s.modifiers?.(g, scratch);
  for (const b of g.state.buffs) scratch.push(b.effect);

  const adds = blankMods();
  const muls = blankMods();
  const deckAdd = blankDeckMult();
  const deckMul = blankDeckMult();
  for (let i = 0; i < scratch.length; i++) {
    const e = scratch[i];
    if (e.stat) {
      if (e.add) adds[e.stat] += e.add;
      if (e.mul !== undefined) muls[e.stat] *= e.mul;
    } else if (e.deck) {
      if (e.add) deckAdd[e.deck] += e.add;
      if (e.mul !== undefined) deckMul[e.deck] *= e.mul;
    }
  }
  for (const k of STAT_KEYS) {
    const v = Math.max(0, adds[k]) * muls[k];
    g.mods[k] = Number.isFinite(v) ? Math.min(MOD_CLAMP, Math.max(0, v)) : MOD_CLAMP;
  }
  for (const id of DECK_IDS) {
    const v = Math.max(0, deckAdd[id]) * deckMul[id];
    g.deckMult[id] = Number.isFinite(v) ? Math.min(MOD_CLAMP, Math.max(0, v)) : MOD_CLAMP;
  }
  scratch.length = 0;
  g.dirty = false;
  g.rev++;
}

// ---------- loop ----------------------------------------------------------------------

/** One fixed step. */
export function tick(g: Game, dt: number = TICK): void {
  const s = g.state;
  if (s.buffs.length) {
    for (let i = s.buffs.length - 1; i >= 0; i--) {
      if (s.buffs[i].until <= s.t) {
        s.buffs.splice(i, 1);
        g.dirty = true;
      }
    }
  }
  if (g.dirty) rebuildMods(g);
  s.t += dt;
  s.played += dt;
  const systems = g.systems;
  for (let i = 0; i < systems.length; i++) systems[i].tick?.(g, dt);
}

export interface Stepper {
  /** Unsimulated seconds carried between frames. */
  acc: number;
  lastMs: number;
}

export function createStepper(nowMs: number): Stepper {
  return { acc: 0, lastMs: nowMs };
}

/**
 * Advances the game to wall-clock `nowMs`. Call every frame (or timer) while foregrounded.
 * Returns an offline report when the gap was long enough to take the offline path.
 */
export function step(g: Game, stepper: Stepper, nowMs: number, maxTicks = 20): OfflineReport | null {
  let delta = (nowMs - stepper.lastMs) / 1000;
  stepper.lastMs = nowMs;
  g.state.wall = nowMs;
  if (!(delta > 0)) return null; // clock went backwards or did not move
  if (delta >= OFFLINE_THRESHOLD) {
    stepper.acc = 0;
    return applyOffline(g, delta);
  }
  stepper.acc += delta;
  let n = 0;
  // A stall of a few seconds is caught up at once (cheap ticks), anything shorter is paced by maxTicks.
  const limit = stepper.acc > 2 ? Math.ceil(OFFLINE_THRESHOLD / TICK) : maxTicks;
  while (stepper.acc >= TICK && n < limit) {
    tick(g, TICK);
    stepper.acc -= TICK;
    n++;
  }
  if (stepper.acc > 5) stepper.acc = 0;
  return null;
}

/** Seconds away, clamped: negative or absurd clock deltas never hurt or overpay. */
export function clampAway(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.min(seconds, MAX_CLOCK_DELTA);
}

/**
 * Offline progress in closed form. Timers run for the whole (clamped) absence, production only for
 * the capped part at reduced efficiency. Never kills the ship: areas clamp their own damage.
 */
export function applyOffline(g: Game, awaySeconds: number): OfflineReport {
  const s = g.state;
  const seconds = clampAway(awaySeconds);
  if (g.dirty) rebuildMods(g);
  const b = g.content.balance;
  const cap = Math.min(24 * 3600, b.offlineBaseCap * g.mods.offlineCap);
  const eff = Math.min(1, b.offlineBaseEff * g.mods.offlineEff);
  const credited = Math.min(seconds, cap);
  const report: OfflineReport = {
    seconds,
    credited,
    efficiency: eff,
    credits: { m: 0, e: 0 },
    items: {},
    rp: { m: 0, e: 0 },
    wear: [],
    hull: { from: s.hull.hp, to: s.hull.hp },
    events: [],
    hooks: [],
    safeMode: false,
  };
  g.offline = true;
  try {
    for (const sys of g.systems) sys.offline?.(g, credited, eff, report);
  } finally {
    g.offline = false;
  }
  s.t += seconds;
  report.hull.to = s.hull.hp;
  g.dirty = true;
  rebuildMods(g);
  // let timers that passed during the absence resolve
  for (let i = 0; i < 3; i++) tick(g, TICK);
  s.offline.lastReport = report;
  stat(g, "offlineReturns");
  statMax(g, "offlineLongest", seconds);
  return report;
}

/** Runs every area's prestige reset for the given layer, lower layers included. */
export function runPrestige(g: Game, layer: 1 | 2 | 3): void {
  for (const sys of g.systems) sys.prestige?.(g, layer);
  g.dirty = true;
  rebuildMods(g);
  emit(g, { t: "prestige", layer });
}

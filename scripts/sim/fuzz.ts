// `npm run fuzz`: softlock fuzzer. From many reachable states it checks that the player can always
// get moving again: failures have an exit that needs nothing (the tow), mini-games and events can
// always be answered, income comes back and something can be bought within a bounded time.
//   --seeds N (random walks, default 6)   --steps N (actions per walk, default 1500)   --verbose
import { content } from "@/content";
import { newGame } from "@/engine";
import * as B from "@/engine/big";
import * as C from "@/engine/core";
import { applyOffline, runPrestige, tick, TICK } from "@/engine/kernel";
import * as M from "@/engine/meta";
import { DECK_IDS } from "@/engine/types";
import type { DeckId, FailureKind, Game, MinigameId, PendingMinigame } from "@/engine/types";
import * as W from "@/engine/world";
import { applyPreset, PRESETS, type PresetId } from "@/store/presets";
import { Rand, Sim, cloneGame, findNonFinite, fmtTime } from "./bots";

export const FAILURES: FailureKind[] = ["tumble", "breach", "blackout", "noFuel", "engine", "radiation", "boarding", "anomaly"];
const MINIGAMES: MinigameId[] = ["weld", "wire", "rhythm", "valves", "calibrate", "tape", "defense", "dock", "hack"];
const PURPOSES: PendingMinigame["purpose"][] = ["repair", "event", "failure", "hack", "expedition", "practice"];
const WALL = 1_700_000_000_000;

export interface Softlock {
  state: string;
  problem: string;
}

export interface FuzzResult {
  states: number;
  checks: number;
  softlocks: Softlock[];
}

function run(g: Game, seconds: number): void {
  const n = Math.round(seconds / TICK);
  for (let i = 0; i < n; i++) tick(g, TICK);
  g.outbox.length = 0;
}

export function preset(id: PresetId, seed = 4242): Game {
  const g = newGame(content, seed, WALL);
  applyPreset(g, id);
  return g;
}

/** Whatever takes over the screen can be answered with what the UI offers, needing nothing. */
function clearDialogs(g: Game): string | null {
  const s = g.state;
  for (let i = 0; i < 12 && M.currentBeat(g); i++) M.ackBeat(g);
  if (s.minigame && !C.autoResolveMinigame(g).ok) return "pending mini-game cannot be auto-resolved";
  if (s.minigame) return "mini-game still pending after auto-resolve";
  const a = s.events.active;
  if (a) {
    if (a.result === null) {
      const def = W.activeEventDef(g);
      let chosen = false;
      if (def) for (let i = 0; i < def.choices.length && !chosen; i++) if (W.choiceAvailable(g, i)) chosen = W.chooseEvent(g, i).ok;
      if (!chosen && !W.dismissEvent(g).ok) return `event ${a.id}: no choice can be taken and it cannot be dismissed`;
    }
    if (s.minigame && !C.autoResolveMinigame(g).ok) return `event ${a.id}: its mini-game cannot be auto-resolved`;
    if (s.events.active && !W.dismissEvent(g).ok) return `event ${a.id}: cannot be closed after the choice`;
  }
  return null;
}

/** With zero credits, zero items and no friends: the tow alone must end every failure. */
function towOnly(g: Game, label: string, viaOffline: boolean): string | null {
  const s = g.state;
  if (!s.failure) return null;
  s.credits = B.big(0);
  s.inv = {};
  for (const f in s.station.rep) s.station.rep[f as keyof typeof s.station.rep] = -100;
  s.minigame = null;
  s.events.active = null;
  s.events.nextAt = Number.MAX_SAFE_INTEGER;
  if (!s.failure.tow && !W.callTow(g).ok) return `${label}: the tow cannot be called with nothing aboard`;
  const kind = s.failure.kind;
  const eta = (s.failure.tow?.eta ?? s.t) - s.t;
  if (!(eta <= 3 * 3600 * 1.6)) return `${label}: tow ETA ${fmtTime(eta)} is unbounded`;
  if (viaOffline) applyOffline(g, eta + 5);
  else run(g, eta + 5);
  if (g.state.failure && g.state.failure.kind === kind) return `${label}: still in ${kind} after the tow's ETA (${fmtTime(eta)})`;
  return null;
}

/**
 * The core claim: from this state some sequence of player actions (or waiting) makes progress.
 * A cautious player (the idle-bot plus "undo my own settings") gets rid of the failure, earns
 * credits again and buys a deck level, all within `budget` seconds of game time.
 */
export function canProgress(start: Game, label: string, budget = 30 * 3600): string | null {
  let g: Game;
  try {
    g = cloneGame(start);
  } catch (e) {
    return `${label}: save round trip failed (${(e as Error).message})`;
  }
  const s = g.state;
  const sim = new Sim({ bot: "idle", seed: 11, hours: 0 }, g);
  const earnedAt = B.clone(s.allTime);
  const levelsAt = s.stats.deckLevels ?? 0;
  const t0 = s.t;
  let earned = false;
  let bought = false;
  let unstuck = false;
  const done = (): boolean => earned && bought && g.state.failure === null && g.state.minigame === null;
  const look = (): void => {
    // the running income counts too: a balance of 1e41 cannot register what a 1e9/s ship adds to it
    if (!earned && (B.cmp(g.state.allTime, earnedAt) > 0 || g.rates.income.m > 0)) earned = true;
    if (!bought && (g.state.stats.deckLevels ?? 0) > levelsAt) bought = true;
  };
  // ten minutes at the screen, then check-ins with the ship cruising in between
  for (let i = 0; i < 10 && !done(); i++) {
    sim.session(60);
    look();
    if (!earned && !unstuck && i >= 1) {
      // the player undoes self-inflicted stalls: hoarding settings and a hold full of things kept
      for (const id in g.state.keep) if (g.content.items[id]) C.setKeep(g, id, C.keepDefault(g, g.content.items[id]));
      for (const id in g.state.inv) C.sellItem(g, id, "all");
      unstuck = true;
    }
  }
  while (!done() && g.state.t - t0 < budget) {
    sim.away(1800);
    sim.session(60);
    look();
  }
  const bad = findNonFinite(g.state);
  if (bad.length) return `${label}: non-finite ${bad.slice(0, 3).join(", ")}`;
  if (g.state.failure) return `${label}: failure ${g.state.failure.kind} never cleared in ${fmtTime(budget)}`;
  if (g.state.minigame) return `${label}: a mini-game stayed pending`;
  if (!earned) return `${label}: no credits earned in ${fmtTime(budget)} (income ${C.formatBig(g.rates.income)}/s, mine ${C.formatBig(g.rates.mine)}/s, lift ${C.formatBig(g.rates.lift)}/s, power ${g.rates.power.eff.toFixed(2)})`;
  if (!bought) return `${label}: nothing could be bought in ${fmtTime(budget)} (credits ${C.formatBig(g.state.credits)}, income ${C.formatBig(g.rates.income)}/s)`;
  return null;
}

// ---------- edge states --------------------------------------------------------------

type Edge = [string, (g: Game) => void];

export const EDGES: Edge[] = [
  ["zero credits", (g) => void (g.state.credits = B.big(0))],
  [
    "zero credits, empty hold",
    (g) => {
      g.state.credits = B.big(0);
      g.state.inv = {};
    },
  ],
  [
    "full cargo, everything kept",
    (g) => {
      for (const id in g.content.items) {
        const def = g.content.items[id];
        if (C.massOf(def) <= 0 || def.category === "mega") continue;
        C.setKeep(g, id, 1);
        g.state.inv[id] = B.mulN(g.rates.cargoCap, 0.2);
      }
    },
  ],
  [
    "no fuel",
    (g) => {
      g.state.nav.fuel = 0;
      for (const f of W.fuelItems(g)) delete g.state.inv[f.id];
    },
  ],
  ["all modules broken", (g) => void g.state.modules.forEach((m) => (m.hp = 0))],
  ["hull at 1", (g) => void (g.state.hull.hp = 1)],
  ["hull at 0", (g) => void (g.state.hull.hp = 0)],
  [
    "no power",
    (g) => {
      g.state.decks.reactor.level = 0;
      for (const m of g.state.modules) if (g.content.items[m.item]?.module?.family === "reactor") m.hp = 0;
    },
  ],
  [
    "morale 0, no coffee",
    (g) => {
      g.state.morale = 0;
      delete g.state.inv.coffee;
    },
  ],
  [
    "mid-jump",
    (g) => {
      g.state.features.nav = 1;
      g.state.nav.charge = 1;
      g.state.nav.cooldownUntil = 0;
      g.state.nav.fuel = W.fuelCap(g);
      const next = W.routeToCore(g, 1)[0];
      if (next) W.jumpTo(g, next.depth, next.lane);
    },
  ],
  [
    "every drone on probes, every crew member in the bunk",
    (g) => {
      const cap = C.droneCapacity(g);
      C.setDrones(g, "hauler", 0);
      C.setDrones(g, "salvager", 0);
      C.setDrones(g, "fixer", 0);
      C.setDrones(g, "probe", cap);
      for (const m of g.state.crew) W.assignCrew(g, m.uid, null);
    },
  ],
  [
    "queues full of jobs that cannot run",
    (g) => {
      for (let i = 0; i < 12; i++) for (const id of ["mod_laser_mk1", "plating", "duct_tape"]) C.queueCraft(g, id, -1);
      g.state.inv = {};
    },
  ],
  [
    "overheated, combo full, salvage full",
    (g) => {
      g.state.active.heat = 100;
      g.state.active.lockUntil = g.state.t + 5;
      g.state.active.combo = 100;
      for (let i = 0; i < 8; i++) C.spawnSalvage(g);
    },
  ],
  [
    "at the core without a stamp",
    (g) => {
      g.state.nav.depth = W.coreDepth(g);
      g.state.nav.lane = 0;
      g.state.nav.maxDepth = g.state.nav.depth;
      g.state.lifetime = B.big(1);
    },
  ],
  [
    "after a warp",
    (g) => {
      g.state.prestige.warps++;
      runPrestige(g, 1);
    },
  ],
  [
    "after a rebuild",
    (g) => {
      g.state.prestige.rebuilds++;
      runPrestige(g, 2);
    },
  ],
  [
    "after a reboot",
    (g) => {
      g.state.prestige.reboots++;
      runPrestige(g, 3);
    },
  ],
];

// ---------- random walks -------------------------------------------------------------

/** One random thing a player could tap. Refusals are fine: that is what the UI would show too. */
export function randomAction(g: Game, r: Rand): void {
  const s = g.state;
  const pick = <T>(arr: readonly T[]): T | undefined => (arr.length ? arr[Math.floor(r.next() * arr.length)] : undefined);
  const deck = pick(DECK_IDS) as DeckId;
  const item = pick(Object.keys(s.inv)) ?? "scrap";
  const mod = pick(s.modules);
  const crew = pick(s.crew);
  const sys = W.currentSystem(g);
  const planet = pick(sys.planets);
  const station = pick(["refinery", "fabricator", "workshop"] as const) ?? "refinery";
  const n = Math.floor(r.next() * 52);
  if (n <= 2) C.buyDeck(g, deck, pick([1, 10, 100, "max"] as const));
  else if (n === 3) C.unlockDeck(g, deck);
  else if (n === 4) C.queueCraft(g, pick(Object.keys(s.recipes)) ?? "alloy", pick([1, 3, -1]) ?? 1);
  else if (n === 5) {
    const j = pick(s.craft[station].queue);
    if (j) C.cancelCraft(g, station, j.uid);
  } else if (n === 6) C.setKeep(g, item, pick([0, 0.05, 0.5, 1]) ?? 0);
  else if (n === 7) C.sellItem(g, item, pick(["all", 1, 1000] as const) ?? "all");
  else if (n === 8) C.setDrones(g, pick(["hauler", "probe", "salvager", "fixer"] as const) ?? "hauler", Math.floor(r.next() * 6));
  else if (n === 9) C.setMining(g, r.next() < 0.7);
  else if (n === 10) C.pulseScan(g);
  else if (n === 11) {
    if (s.active.salvage[0]) C.collectSalvage(g, s.active.salvage[0].uid);
  } else if (n === 12) C.triggerOverdrive(g);
  else if (n === 13) {
    if (mod) C.installModule(g, mod.uid, Math.floor(r.next() * 8));
  } else if (n === 14) {
    if (mod) C.removeModule(g, mod.uid);
  } else if (n === 15) {
    if (mod && r.next() < 0.3) C.scrapModule(g, mod.uid);
  } else if (n === 16) {
    if (mod) C.upgradeModule(g, mod.uid);
  } else if (n === 17) C.repairWithItem(g, mod && r.next() < 0.7 ? mod.uid : 0, pick(["duct_tape", "spare_parts", "nano_gel"]) ?? "duct_tape");
  else if (n === 18) C.startManualRepair(g, mod && r.next() < 0.7 ? mod.uid : 0);
  else if (n === 19) {
    const score = r.next();
    if (s.minigame) C.resolveMinigame(g, { score, success: score >= 0.5, perfect: score >= 0.95, durationMs: 1000 });
  } else if (n === 20) C.autoResolveMinigame(g);
  else if (n <= 22) W.chooseEvent(g, Math.floor(r.next() * 4));
  else if (n === 23) W.dismissEvent(g);
  else if (n === 24) W.attemptFailureExit(g, Math.floor(r.next() * 4));
  else if (n === 25) W.callTow(g);
  else if (n === 26) W.chargeJump(g);
  else if (n === 27) {
    const t = pick(W.reachable(g));
    if (t) W.jumpTo(g, t.depth, t.lane);
  } else if (n === 28) W.refuel(g);
  else if (n === 29) {
    if (planet) W.startScan(g, planet.id);
  } else if (n === 30) {
    if (planet) W.setProbes(g, planet.id, Math.floor(r.next() * 3));
  } else if (n === 31) {
    if (planet) W.buildOutpost(g, planet.id);
  } else if (n === 32) {
    if (planet && crew) W.startExpedition(g, planet.id, [crew.uid], pick(["short", "medium", "long"] as const) ?? "short");
  } else if (n === 33) {
    const e = pick(s.expeditions);
    if (e) W.claimExpedition(g, e.uid);
  } else if (n === 34) {
    if (r.next() < 0.6) W.dock(g);
    else W.undock(g);
  } else if (n === 35) W.buy(g, pick(W.stationStock(g, sys)) ?? "fuel", 1 + Math.floor(r.next() * 20));
  else if (n === 36) W.sellAt(g, item, 1 + Math.floor(r.next() * 50));
  else if (n === 37) W.acceptContract(g, Math.floor(r.next() * 3));
  else if (n === 38) {
    const c = pick(s.station.contracts);
    if (c && r.next() < 0.7) W.deliverContract(g, c.uid);
    else if (c) W.abandonContract(g, c.uid);
  } else if (n === 39) W.buyShop(g, pick(Object.keys(g.content.shop)) ?? "");
  else if (n === 40) W.hireCrew(g, Math.floor(r.next() * 3));
  else if (n === 41) W.repairAtDock(g);
  else if (n === 42) {
    if (crew) W.assignCrew(g, crew.uid, r.next() < 0.8 ? deck : null);
  } else if (n === 43) {
    if (crew && r.next() < 0.1) W.dismissCrew(g, crew.uid);
  } else if (n === 44) {
    const c = pick(Object.keys(s.cards));
    if (c && g.content.cards[c]) W.equipCard(g, g.content.cards[c].deck, c, Math.floor(r.next() * 2));
  } else if (n === 45) M.buyResearch(g, pick(Object.keys(g.content.research)) ?? "");
  else if (n === 46) M.buyUpgrade(g, pick(Object.keys(g.content.upgrades)) ?? "");
  else if (n === 47) {
    const what = r.next();
    if (what < 0.5) M.warp(g, r.next() < 0.3 ? Object.keys(g.content.mutators).slice(0, 2) : []);
    else if (what < 0.8) M.rebuild(g, pick(Object.keys(g.content.hulls)) ?? "tug");
    else M.reboot(g);
  } else if (n === 48) {
    M.claimQuest(g, Math.floor(r.next() * 3));
    M.claimWeekly(g);
  } else if (n === 49) {
    M.ackBeat(g);
    C.setBuyMode(g, pick([1, 10, 100, -1] as const) ?? 1);
  } else if (n === 50) {
    C.toggleAutoRecipe(g, pick(Object.keys(s.recipes)) ?? "alloy");
    C.setAutoMaintenance(g, r.next() < 0.5);
  } else C.setRepairPriority(g, s.modules.map((m) => m.uid).concat(0));
}

/** A chaotic player: random taps, random absences, a random failure or event now and then. */
export function randomWalk(seed: number, steps: number, from: PresetId, onCheckpoint: (g: Game, label: string) => void, checkpoints = 8): Game {
  const r = new Rand(seed * 7919 + 13);
  let g = preset(from, 1000 + seed);
  const every = Math.max(1, Math.floor(steps / checkpoints));
  const events = Object.keys(g.content.events);
  for (let i = 1; i <= steps; i++) {
    randomAction(g, r);
    const roll = r.next();
    if (roll < 0.004) applyOffline(g, 60 + r.next() * 12 * 3600);
    else if (roll < 0.008) g.api.startFailure(FAILURES[Math.floor(r.next() * FAILURES.length)]);
    else if (roll < 0.012) g.api.triggerEvent(events[Math.floor(r.next() * events.length)]);
    else if (roll < 0.016) g = cloneGame(g);
    else run(g, r.next() < 0.5 ? 0.5 : 5);
    g.outbox.length = 0;
    if (i % every === 0) onCheckpoint(g, `random walk seed ${seed} from "${from}" after ${i} actions (t ${fmtTime(g.state.t)}, depth ${g.state.nav.depth}, warps ${g.state.prestige.warps})`);
  }
  return g;
}

// ---------- the whole sweep ----------------------------------------------------------

export interface FuzzOptions {
  seeds?: number;
  steps?: number;
  presets?: readonly PresetId[];
  /** Edge states on every preset (default) or only on "mid". */
  full?: boolean;
  /** Every event and mini-game on screen (default true). */
  dialogs?: boolean;
  verbose?: boolean;
}

export function fuzz(opts: FuzzOptions = {}): FuzzResult {
  const out: FuzzResult = { states: 0, checks: 0, softlocks: [] };
  const presets = opts.presets ?? PRESETS;
  const full = opts.full ?? true;
  const check = (state: string, problem: string | null): void => {
    out.checks++;
    if (problem) {
      out.softlocks.push({ state, problem });
      if (opts.verbose) console.log(`  SOFTLOCK ${state}: ${problem}`);
    }
  };
  const progress = (g: Game, label: string): void => {
    out.states++;
    check(label, clearDialogs(cloneGame(g)));
    check(label, canProgress(g, label));
  };

  for (const id of presets) {
    progress(preset(id), `preset "${id}"`);
    for (const kind of FAILURES) {
      const g = preset(id);
      const label = `preset "${id}" + failure ${kind}`;
      if (!g.api.startFailure(kind)) {
        check(label, "the failure could not be started");
        continue;
      }
      run(g, 1);
      progress(g, label);
      out.states++;
      check(label + ", nothing aboard, waiting", towOnly(cloneGame(g), label, false));
      check(label + ", nothing aboard, app closed", towOnly(cloneGame(g), label, true));
    }
    if (!full && id !== "mid") continue;
    for (const [name, make] of EDGES) {
      const g = preset(id);
      make(g);
      g.dirty = true;
      run(g, 1);
      progress(g, `preset "${id}" + ${name}`);
    }
  }

  if (opts.dialogs ?? true) {
    // every event on screen, rich and broke
    for (const id of ["fresh", "mid"] as const) {
      for (const ev in content.events) {
        const g = preset(id);
        if (id === "fresh") g.state.credits = B.big(0);
        g.state.events.active = null;
        out.states++;
        const label = `event ${ev} on "${id}"`;
        if (!g.api.triggerEvent(ev)) {
          check(label, "could not be triggered");
          continue;
        }
        check(label, clearDialogs(g));
        run(g, 2);
        const still = (g.state.events.active as { id: string } | null)?.id === ev;
        check(label, still ? "still on screen after it was answered" : clearDialogs(g));
      }
    }
    // every mini-game for every purpose, with nothing to pay for skipping it
    for (const game of MINIGAMES) {
      for (const purpose of PURPOSES) {
        const g = preset("mid");
        g.state.inv = {};
        g.state.credits = B.big(0);
        g.state.minigame = null;
        out.states++;
        const label = `mini-game ${game} for ${purpose}`;
        if (!g.api.requestMinigame(game, 3, purpose, 0)) check(label, "could not be requested");
        else check(label, C.autoResolveMinigame(g).ok && g.state.minigame === null ? null : "auto-resolve failed");
      }
    }
  }

  const walkFrom: PresetId[] = ["fresh", "early", "mid", "late", "damaged"];
  const seeds = opts.seeds ?? 6;
  for (let seed = 1; seed <= seeds; seed++) randomWalk(seed, opts.steps ?? 1500, walkFrom[(seed - 1) % walkFrom.length], progress);
  return out;
}

function main(): void {
  const argv = process.argv.slice(2);
  const arg = (name: string, def: number): number => {
    const i = argv.indexOf(name);
    return i >= 0 ? Number(argv[i + 1]) : def;
  };
  const t0 = Date.now();
  const seeds = arg("--seeds", 6);
  const res = fuzz({ seeds, steps: arg("--steps", 1500), verbose: argv.includes("--verbose") });
  console.log(`fuzz: ${res.states} states explored, ${res.checks} checks, ${res.softlocks.length} softlock(s) (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  console.log(`  ${PRESETS.length} presets x (plain + ${FAILURES.length} failures + ${EDGES.length} edge states), ${Object.keys(content.events).length} events x 2 wallets, ${MINIGAMES.length} mini-games x ${PURPOSES.length} purposes, ${seeds} random walks x 8 checkpoints`);
  const seen = new Set<string>();
  for (const s of res.softlocks) {
    const key = s.problem.replace(/^.*?: /, "").replace(/[\d.]+/g, "#");
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  SOFTLOCK  ${s.state}\n            ${s.problem}`);
  }
  if (res.softlocks.length > 0) process.exit(1);
  console.log("fuzz OK");
}

if (process.argv[1] && /fuzz\.ts$/.test(process.argv[1])) main();

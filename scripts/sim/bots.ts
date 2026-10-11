// Headless players. Both drive the real engine through the same actions the UI calls and nothing
// else: no state edits, no api back doors. The idle-bot checks in for two minutes every few hours and
// lets Idle Cruise do the rest; the active-bot plays whole sessions with its thumbs.
import { content as realContent } from "@/content";
import { newGame, resumeGame } from "@/engine";
import * as B from "@/engine/big";
import * as C from "@/engine/core";
import { applyOffline, tick, TICK } from "@/engine/kernel";
import * as M from "@/engine/meta";
import { DECK_IDS } from "@/engine/types";
import type { Big, ContentDB, CraftStationId, DeckId, EventChoice, EventEffect, FailureKind, Game, ItemId, RecipeDef } from "@/engine/types";
import * as W from "@/engine/world";

export type BotKind = "idle" | "active";

export interface SimOptions {
  bot: BotKind;
  seed: number;
  hours: number;
  /** 0..1: how well the active-bot plays mini-games. */
  skill?: number;
  /** Idle-bot: hours between two-minute check-ins. */
  checkEvery?: number;
  verbose?: boolean;
  content?: ContentDB;
  /** Foreground seconds at which a copy of the game is kept for experiments. */
  snapshots?: number[];
}

export interface Sample {
  hours: number;
  played: number;
  credits: number; // log10
  income: number; // log10
  depth: number;
  warps: number;
}

export interface TimelineEntry {
  at: number; // wall seconds since the start
  played: number; // foreground seconds
  label: string;
}

const START_WALL = 1_700_000_000_000;
const MODULE_FAMILIES = ["laser", "cargo", "engine", "reactor", "scanner", "repair", "shield", "life"];
const MANAGED: DeckId[] = ["mining", "lift", "refinery", "fabricator", "lab", "cargo", "reactor", "workshop", "bridge"];

export const num = (b: Readonly<Big> | undefined): number => (b ? B.toNumber(b) : 0);
export const lg = (b: Readonly<Big> | undefined): number => (b && b.m > 0 ? B.log10(b) : 0);

/** Paths of every non-finite number in a value. */
export function findNonFinite(v: unknown, path = "state", out: string[] = []): string[] {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) out.push(path);
  } else if (v && typeof v === "object") {
    for (const k of Object.keys(v as object)) findNonFinite((v as Record<string, unknown>)[k], `${path}.${k}`, out);
  }
  return out;
}

/** Deep copy through the real save path, so every clone is also a save/load round trip. */
export function cloneGame(g: Game): Game {
  const back = C.deserialize(C.serialize(g.state));
  if (!back.ok || !back.state) throw new Error("save round trip failed");
  return resumeGame(g.content, back.state);
}

export class Rand {
  constructor(private s: number) {}
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

/** One simulated playthrough: the game, a wall clock, and everything the report needs. */
export class Sim {
  readonly g: Game;
  readonly opts: Required<Omit<SimOptions, "content">>;
  snaps: { played: number; g: Game }[] = [];
  wall = 0;
  private wallBase = START_WALL;
  first: Record<string, number> = {};
  firstPlayed: Record<string, number> = {};
  timeline: TimelineEntry[] = [];
  samples: Sample[] = [];
  nonFinite: string[] = [];
  bottleneck = { cargo: 0, lift: 0, power: 0 };
  eventTimes: number[] = []; // wall seconds of every scheduled event start
  failures: Record<string, { started: number; cleared: number; by: Record<string, number>; longest: number }> = {};
  warpTimes: number[] = [];
  /** Longest stretch without a meaningful purchase in the first two foreground hours. */
  deadZone = 0;
  offlineReturns: { seconds: number; credits: number; zero: boolean }[] = [];
  private lastBuy = 0;
  private failAt = 0;
  private rand: Rand;
  private bot: Bot;
  private nextSample = 0;

  /** `game`: drive an existing game (fuzzer, soak) instead of starting a new one. */
  constructor(o: SimOptions, game?: Game) {
    this.opts = { bot: o.bot, seed: o.seed, hours: o.hours, skill: o.skill ?? 0.75, checkEvery: o.checkEvery ?? 4, verbose: o.verbose ?? false, snapshots: (o.snapshots ?? []).slice() };
    this.g = game ?? newGame(o.content ?? realContent, o.seed, START_WALL);
    if (game) {
      this.lastBuy = game.state.played;
      this.wallBase = game.state.wall;
    }
    this.rand = new Rand(o.seed ^ 0x51ab);
    this.bot = new Bot(this, o.bot, this.opts.skill, this.rand);
  }

  get played(): number {
    return this.g.state.played;
  }

  mark(key: string, label?: string): void {
    if (this.first[key] !== undefined) return;
    this.first[key] = this.wall;
    this.firstPlayed[key] = this.played;
    this.note(label ?? key);
  }

  note(label: string): void {
    this.timeline.push({ at: this.wall, played: this.played, label });
    if (this.opts.verbose) console.log(`  [${fmtTime(this.wall)} | played ${fmtTime(this.played)}] ${label}`);
  }

  bought(): void {
    if (this.played <= 7200) this.deadZone = Math.max(this.deadZone, this.played - this.lastBuy);
    this.lastBuy = this.played;
  }

  private drain(): void {
    const g = this.g;
    const out = g.outbox;
    for (let i = 0; i < out.length; i++) {
      const e = out[i];
      switch (e.t) {
        case "purchase":
          this.mark("purchase", "first purchase");
          this.bought();
          break;
        case "deckBuilt":
          this.mark("deck:" + e.deck, `deck unlocked: ${e.deck}`);
          this.mark("secondDeck", "second deck (first unlock)");
          this.bought();
          break;
        case "craftDone":
          this.mark("craft", `first craft (${e.recipe})`);
          if (g.content.recipes[e.recipe]?.tier === 3) this.mark("moduleCrafted", `first module crafted (${e.recipe})`);
          break;
        case "minigameRequest":
          this.mark("minigame", "first mini-game");
          break;
        case "eventStarted":
          this.mark("event", `first event (${e.id})`);
          // chained and story beats are fired on purpose and sit outside the hourly cap
          if (!g.content.events[e.id]?.chainOnly && g.content.events[e.id]?.type !== "story") this.eventTimes.push(this.wall);
          break;
        case "jumpEnd":
          this.mark("jump", "first jump");
          break;
        case "researchDone":
          this.mark("research", `first research (${e.id})`);
          this.bought();
          break;
        case "chapter":
          this.mark("chapter:" + e.id, `chapter ${e.id}`);
          break;
        case "crewJoined":
          this.mark("crew", "first crew member");
          break;
        case "prestige":
          if (e.layer === 1) {
            this.warpTimes.push(this.wall);
            this.note(`warp ${this.warpTimes.length} (stamps total ${C.formatBig(g.state.prestige.stampsTotal)})`);
            if (this.first.warp === undefined) {
              this.first.warp = this.wall;
              this.firstPlayed.warp = this.played;
            }
          } else if (e.layer === 2) this.mark("rebuild", "first rebuild");
          else this.mark("reboot", "first reboot");
          break;
        case "failureStarted": {
          const f = (this.failures[e.kind] ??= { started: 0, cleared: 0, by: {}, longest: 0 });
          f.started++;
          this.failAt = this.wall;
          this.mark("failure", `first failure (${e.kind})`);
          break;
        }
        case "failureCleared": {
          const f = (this.failures[e.kind] ??= { started: 0, cleared: 0, by: {}, longest: 0 });
          f.cleared++;
          f.by[e.by] = (f.by[e.by] ?? 0) + 1;
          f.longest = Math.max(f.longest, this.wall - this.failAt);
          break;
        }
        case "cargoFull":
          this.mark("cargoFull", "cargo full for the first time");
          break;
        case "feature":
          this.mark("feature:" + e.id, `feature: ${e.id}`);
          break;
      }
    }
    out.length = 0;
  }

  private second(): void {
    const g = this.g;
    const s = g.state;
    const r = g.rates;
    if (r.power.eff < 0.999) this.bottleneck.power++;
    if (r.cargoCap.m > 0 && B.cmp(r.cargoUsed, B.mulN(r.cargoCap, 0.97)) >= 0) this.bottleneck.cargo++;
    // the lift is the limit when it cannot carry what the laser digs right now (held or not)
    const holdMult = s.active.mining ? Math.max(1, g.content.balance.activeMult * g.mods.activeMult) : 1;
    if (B.cmp(r.lift, B.mulN(r.mine, holdMult)) < 0 && s.hopper.m > 0) this.bottleneck.lift++;
    const st = s.stats;
    if (st.planetsScanned > 0) this.mark("planet", "first planet scanned");
    if (st.modulesInstalled > 0) this.mark("moduleInstalled", "first module installed");
    if (st.modulesBuilt > 0) this.mark("moduleCrafted", "first module crafted");
    if (st.expeditions > 0) this.mark("expedition", "first expedition");
    if (st.trades > 0) this.mark("trade", "first station trade");
    if (st.contracts > 0) this.mark("contract", "first contract");
    if (st.overdrives > 0) this.mark("overdrive", "first overdrive");
    if (st.salvage > 0) this.mark("salvage", "first salvage");
    // a decision point: more than one thing worth buying is affordable at once
    if (this.first.decision === undefined) {
      let n = 0;
      for (const id of DECK_IDS) if (s.decks[id].level > 0 && B.cmp(s.credits, C.nextCost(g, id)) >= 0) n++;
      if (n >= 2 && st.purchases >= 1) this.mark("decision", "first decision point (two affordable upgrades)");
    }
  }

  private sample(): void {
    const s = this.g.state;
    this.samples.push({ hours: this.wall / 3600, played: this.played, credits: lg(s.credits), income: lg(this.g.rates.income), depth: s.nav.depth, warps: s.prestige.warps });
    const bad = findNonFinite(s);
    findNonFinite(this.g.rates, "rates", bad);
    findNonFinite(this.g.mods, "mods", bad);
    for (const p of bad) if (this.nonFinite.length < 20 && !this.nonFinite.includes(p)) this.nonFinite.push(p);
  }

  /** Foreground play for `seconds`: ticks at 10 Hz, the bot acts once a second. */
  session(seconds: number): void {
    const g = this.g;
    const n = Math.round(seconds);
    const per = Math.round(1 / TICK);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < per; k++) tick(g, TICK);
      this.wall += 1;
      g.state.wall = this.wallBase + this.wall * 1000;
      this.drain();
      this.second();
      this.bot.act();
      this.drain();
      if (this.opts.snapshots.length > 0 && this.played >= this.opts.snapshots[0]) {
        this.snaps.push({ played: this.opts.snapshots.shift() as number, g: cloneGame(g) });
      }
      if (this.wall >= this.nextSample) {
        this.sample();
        this.nextSample = this.wall + this.sampleEvery();
      }
    }
  }

  private sampleEvery(): number {
    const h = this.opts.hours;
    return h <= 2 ? 300 : h <= 30 ? 1800 : h <= 200 ? 6 * 3600 : 24 * 3600;
  }

  /** The app is closed for `seconds`. */
  away(seconds: number): void {
    const g = this.g;
    this.bot.leave();
    this.wall += seconds;
    g.state.wall = this.wallBase + this.wall * 1000;
    const report = applyOffline(g, seconds);
    this.offlineReturns.push({ seconds, credits: lg(report.credits), zero: !(report.credits.m > 0) });
    this.drain();
    if (this.wall >= this.nextSample) {
      this.sample();
      this.nextSample = this.wall + this.sampleEvery();
    }
  }

  /** Plays the whole schedule of this bot. */
  run(): this {
    const total = this.opts.hours * 3600;
    if (this.opts.bot === "idle") {
      const gap = this.opts.checkEvery * 3600;
      while (this.wall < total) {
        this.session(Math.min(120, total - this.wall));
        if (this.wall < total) this.away(Math.min(gap - 120, total - this.wall));
      }
    } else {
      // one long opening sitting (the pacing targets are stated in played time), then three
      // half-hour sessions a day with the ship cruising in between
      const opening = Math.min(total, 4 * 3600);
      this.session(opening);
      while (this.wall < total) {
        this.away(Math.min(7.5 * 3600, total - this.wall));
        if (this.wall < total) this.session(Math.min(1800, total - this.wall));
      }
    }
    this.sample();
    return this;
  }

  /** Largest number of events that started inside any one hour. */
  maxEventsPerHour(): number {
    const t = this.eventTimes;
    let best = 0;
    for (let i = 0, j = 0; i < t.length; i++) {
      while (t[i] - t[j] >= 3600) j++;
      best = Math.max(best, i - j + 1);
    }
    return best;
  }

  /** Mean seconds between two events of the same sitting (NaN with fewer than two). */
  meanEventGap(): number {
    const t = this.eventTimes;
    let sum = 0;
    let n = 0;
    for (let i = 1; i < t.length; i++) {
      if (t[i] - t[i - 1] > 3600) continue; // the app was closed in between
      sum += t[i] - t[i - 1];
      n++;
    }
    return n === 0 ? NaN : sum / n;
  }
}

export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec)) return "never";
  if (sec < 60) return `${sec.toFixed(0)} s`;
  if (sec < 3600) return `${Math.floor(sec / 60)} m ${String(Math.floor(sec % 60)).padStart(2, "0")} s`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h ${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")} m`;
  return `${Math.floor(sec / 86400)} d ${String(Math.floor((sec % 86400) / 3600)).padStart(2, "0")} h`;
}

// ---------- the player ---------------------------------------------------------------

/** Rough worth of an outcome in "seconds of income", for the active-bot's expected-value choice. */
function effectScore(fx: EventEffect[] | undefined, skill: number): number {
  let v = 0;
  if (!fx) return 0;
  for (const e of fx) {
    switch (e.t) {
      case "credits":
        v += e.secs;
        break;
      case "rp":
        v += e.secs * 0.5;
        break;
      case "item":
        v += 30 * Math.sign(e.n);
        break;
      case "loseCargo":
        v -= e.pct * 3;
        break;
      case "hull":
        v += e.pct * 8;
        break;
      case "moduleDamage":
        v -= e.pct * 4 * (e.count ?? 1);
        break;
      case "fuel":
        v += e.n * 20;
        break;
      case "morale":
        v += e.n * 4;
        break;
      case "rep":
        v += e.n * 5;
        break;
      case "failure":
        v -= 500;
        break;
      case "minigame":
        v += skill * effectScore(e.win, skill) + (1 - skill) * effectScore(e.lose, skill) + 20;
        break;
      case "blueprint":
        v += 300;
        break;
      case "crew":
        v += 300;
        break;
      case "card":
        v += 200;
        break;
      case "log":
      case "codex":
        v += 80;
        break;
      case "buff":
        v += 100;
        break;
    }
  }
  return v;
}

function choiceScore(c: EventChoice, skill: number): number {
  let total = 0;
  let w = 0;
  for (const o of c.outcomes) {
    total += o.weight * effectScore(o.effects, skill);
    w += o.weight;
  }
  return (w > 0 ? total / w : 0) - (c.cost?.credits ?? 0) - (c.cost?.items ? 40 : 0);
}

export class Bot {
  private g: Game;
  private mgDue = 0;
  private mgTries = 0;
  private arrivedAt = 0;
  private lastKey = "";
  private step = 0;

  constructor(
    private sim: Sim,
    private kind: BotKind,
    private skill: number,
    private rand: Rand,
  ) {
    this.g = sim.g;
  }

  /** The app goes to the background: thumbs off the screen. */
  leave(): void {
    C.setMining(this.g, false);
    this.mgDue = 0;
  }

  act(): void {
    this.step++;
    const busy = this.dialogs();
    if (this.kind === "active" && !busy) this.hands();
    if (busy) return;
    this.spend();
    if (this.step % 3 === 0) this.manage();
  }

  // ----- things that take over the screen

  private dialogs(): boolean {
    const g = this.g;
    const s = g.state;
    for (let i = 0; i < 4 && M.currentBeat(g); i++) M.ackBeat(g);

    if (s.minigame) {
      if (this.kind === "idle") {
        C.autoResolveMinigame(g);
        return false;
      }
      if (this.mgDue === 0) {
        this.mgDue = s.t + 25 + this.rand.next() * 35;
        C.setMining(g, false);
      }
      if (s.t < this.mgDue) return true;
      this.mgDue = 0;
      const score = Math.max(0, Math.min(1, this.skill + (this.rand.next() - 0.5) * 0.4));
      C.resolveMinigame(g, { score, success: score >= 0.5, perfect: score >= 0.95, durationMs: 40000 });
      return false;
    }
    this.mgDue = 0;

    const a = s.events.active;
    if (a) {
      if (a.result !== null) W.dismissEvent(g);
      else {
        const def = W.activeEventDef(g);
        let best = -1;
        let bestScore = -Infinity;
        if (def) {
          for (let i = 0; i < def.choices.length; i++) {
            if (!W.choiceAvailable(g, i)) continue;
            // the idle-bot takes the safest road, the active one plays the odds
            const score = this.kind === "idle" ? -def.choices[i].risk * 1000 - i : choiceScore(def.choices[i], this.skill);
            if (score > bestScore) {
              bestScore = score;
              best = i;
            }
          }
        }
        if (best < 0 || !W.chooseEvent(g, best).ok) W.dismissEvent(g);
      }
    }

    if (s.failure) this.failure();
    else this.mgTries = 0;
    return false;
  }

  private failure(): void {
    const g = this.g;
    const s = g.state;
    const f = s.failure;
    const def = W.failureDef(g);
    if (!f || !def) return;
    for (let i = 0; i < def.exits.length; i++) {
      const e = def.exits[i];
      if (e.kind === "items" && W.attemptFailureExit(g, i).ok) return;
      if (e.kind === "wait" && f.waitUntil > 0 && s.t >= f.waitUntil && W.attemptFailureExit(g, i).ok) return;
      if (e.kind === "credits" && B.cmp(B.mulN(W.failureExitCost(g, i), 4), s.credits) <= 0 && W.attemptFailureExit(g, i).ok) return;
    }
    if (this.kind === "active" && this.mgTries < 3) {
      for (let i = 0; i < def.exits.length; i++) {
        if (def.exits[i].kind === "minigame" && W.attemptFailureExit(g, i).ok) {
          this.mgTries++;
          return;
        }
      }
    }
    if (!f.tow) W.callTow(g);
  }

  // ----- thumbs on the viewport

  private hands(): void {
    const g = this.g;
    const s = g.state;
    const a = s.active;
    if (a.mining) {
      if (a.heat >= 74) C.setMining(g, false);
    } else if (a.lockUntil <= s.t && a.heat <= 30) C.setMining(g, true);
    for (let i = 0; i < 2 && a.salvage.length > 0; i++) C.collectSalvage(g, a.salvage[0].uid);
    if (a.scanReadyAt <= s.t) C.pulseScan(g);
    if (s.features.overdrive === 1 && a.combo >= (g.content.balance.comboMax as number) && a.overdriveUntil <= s.t) C.triggerOverdrive(g);
  }

  // ----- credits

  private spend(): void {
    const g = this.g;
    const s = g.state;
    for (const id of DECK_IDS) {
      if (s.decks[id].level <= 0 && C.canUnlockDeck(g, id).ok) C.unlockDeck(g, id);
    }
    const income = Math.max(1e-3, num(g.rates.income));
    // save up for the next deck when it is close
    let saving = false;
    for (const id of DECK_IDS) {
      if (s.decks[id].level > 0) continue;
      const def = g.content.decks[id];
      if (def.unlock.items && !this.hasAll(def.unlock.items)) continue;
      if (def.unlock.chapter && s.story.chapter < def.unlock.chapter) continue;
      const cost = num(C.unlockCost(g, id));
      if (cost <= num(s.credits) + income * 120) saving = true;
    }
    // somebody is looking for a berth at this station: keep the fee together
    if (s.station.docked && s.features.crew === 1 && s.crew.length < W.crewCap(g)) {
      for (const offer of W.hireOffers(g)) if (!offer.hired && num(offer.cost) <= num(s.credits) + income * 400) saving = true;
    }
    for (let n = 0; n < 4; n++) {
      const pick = this.pickDeck(income, saving);
      if (!pick) break;
      if (!C.buyDeck(g, pick.id, pick.count).ok) break;
    }
  }

  private pickDeck(income: number, saving: boolean): { id: DeckId; count: number } | null {
    const g = this.g;
    const s = g.state;
    const r = g.rates;
    const credits = num(s.credits);
    const hold = this.kind === "active" ? 2.2 : 1;
    const mine = num(r.mine) * hold;
    const lift = num(r.lift);
    const ms = g.content.balance.milestones;
    let best: DeckId | null = null;
    let bestPay = Infinity;
    // the purchase with the best payback overall, affordable or not: that is what the balance is for
    let goalPay = Infinity;
    let goalCost = 0;
    const cands: { id: DeckId; cost: number; pay: number }[] = [];
    for (const id of DECK_IDS) {
      const d = s.decks[id];
      if (d.level <= 0) continue;
      const cost = num(C.nextCost(g, id));
      const up = ((d.level + 1) / d.level) * (g.content.decks[id].curve === "exp" && ms.includes(d.level + 1) ? 2 : 1) - 1;
      let gain = 0; // relative income gain of one level
      let cap = 1; // largest share of the balance this purchase may take
      switch (id) {
        case "mining":
          gain = mine <= lift * 1.05 ? up : 0;
          cap = gain > 0 ? 1 : 0.01;
          break;
        case "lift":
          gain = lift <= mine * 1.05 ? up : 0;
          cap = gain > 0 ? 1 : 0.01;
          break;
        case "reactor":
          if (r.power.eff < 0.999) gain = Math.max(0.2, 1 / Math.max(0.05, r.power.eff) - 1);
          else if (r.power.demand > r.power.supply * 0.85) gain = 0.05;
          else cap = 0.02;
          break;
        case "cargo":
          if (B.cmp(r.cargoUsed, B.mulN(r.cargoCap, 0.9)) >= 0) {
            gain = 0.03;
            cap = 0.3;
          } else cap = 0.05;
          break;
        case "bridge":
          gain = 0.02 / (1 + 0.02 * d.level);
          break;
        case "refinery":
          cap = 0.12;
          break;
        case "lab":
        case "hangar":
        case "quarters":
          cap = 0.1;
          break;
        default:
          cap = 0.05;
      }
      let pay = gain > 0 ? cost / (income * gain) : 3600 + cost / income;
      if (gain > 0 && (id === "mining" || id === "lift")) {
        // players chase the next doubling: judge the whole stretch to it, not one level at a time
        const next = C.nextMilestone(g, id);
        if (next && next.left > 1 && next.left <= 60) {
          const whole = num(C.deckCost(g, id, next.left));
          pay = Math.min(pay, whole / (income * ((2 * next.level) / d.level - 1)));
        }
      }
      if (gain > 0 && cap >= 1 && pay < goalPay) {
        goalPay = pay;
        goalCost = cost;
      }
      if (!(cost <= credits) || cost > credits * cap) continue;
      // saving for a deck does not stop the lift from keeping up with the laser
      const limiting = id === "lift" && gain > 0 && pay < 600;
      if (saving && !limiting && pay > 45 && cost > credits * 0.02) continue;
      cands.push({ id, cost, pay });
    }
    for (const c of cands) {
      // do not nibble the balance away while saving for the goal
      if (goalCost > credits && c.cost > goalCost * 0.1 && c.pay > goalPay) continue;
      if (c.pay < bestPay) {
        bestPay = c.pay;
        best = c.id;
      }
    }
    if (!best) return null;
    let count = 1;
    if (s.features.buyMax === 1 || s.stats.purchases >= 50) {
      if (num(C.deckCost(g, best, 100)) <= credits * 0.05) count = 100;
      else if (num(C.deckCost(g, best, 10)) <= credits * 0.1) count = 10;
    }
    return { id: best, count };
  }

  private hasAll(items: Record<ItemId, number>): boolean {
    for (const id in items) if (!B.gteN(this.g.state.inv[id] ?? B.ZERO, items[id])) return false;
    return true;
  }

  // ----- everything else a player looks after

  private manage(): void {
    const g = this.g;
    const s = g.state;
    this.crew();
    this.drones();
    this.cards();
    this.research();
    this.modules();
    this.repairs();
    this.crafting();
    this.station();
    this.planets();
    this.navigate();
    this.prestige();
    if (s.features.quests === 1) {
      const daily = M.dailyQuests(g);
      for (let i = 0; i < daily.length; i++) if (daily[i].done && !daily[i].claimed) M.claimQuest(g, i);
      const weekly = M.weeklyQuest(g);
      if (weekly && weekly.done && !weekly.claimed) M.claimWeekly(g);
    }
  }

  private crew(): void {
    const g = this.g;
    const s = g.state;
    for (const m of s.crew) {
      if (m.deck !== null || m.away) continue;
      for (const id of MANAGED) {
        if (s.decks[id].level > 0 && s.decks[id].manager === 0) {
          W.assignCrew(g, m.uid, id);
          break;
        }
      }
    }
  }

  private drones(): void {
    const g = this.g;
    const s = g.state;
    if (s.decks.hangar.level <= 0) return;
    const cap = C.droneCapacity(g);
    const d = s.drones;
    if (d.hauler + d.probe + d.salvager + d.fixer >= cap) return;
    const salvager = cap >= 2 ? 1 : 0;
    const probe = cap >= 4 && s.features.probes === 1 ? 1 : 0;
    C.setDrones(g, "salvager", salvager);
    C.setDrones(g, "probe", probe);
    C.setDrones(g, "hauler", cap - salvager - probe - d.fixer);
  }

  private cards(): void {
    const g = this.g;
    const s = g.state;
    if (s.features.cards !== 1) return;
    const slots = W.cardSlots(g);
    for (const id in s.cards) {
      const def = g.content.cards[id];
      if (!def || s.cards[id].n < 1) continue;
      const d = s.decks[def.deck];
      if (d.cards.includes(id) || d.cards.length >= slots) continue;
      W.equipCard(g, def.deck, id, d.cards.length);
    }
  }

  private research(): void {
    const g = this.g;
    if (g.state.features.research !== 1 || !(g.state.rp.m > 0)) return;
    for (const id in g.content.research) {
      if (M.researchBlock(g, id) === null && M.buyResearch(g, id).ok) return;
    }
  }

  private modules(): void {
    const g = this.g;
    const s = g.state;
    if (s.features.grid !== 1) return;
    for (const inst of s.modules) {
      if (inst.slot >= 0) continue;
      let cell = -1;
      for (let i = 0; i < s.grid.open && i < s.grid.cells.length; i++) {
        if (s.grid.cells[i] === 0) {
          cell = i;
          break;
        }
      }
      if (cell < 0) break;
      C.installModule(g, inst.uid, cell);
    }
    for (const inst of s.modules) {
      if (inst.slot < 0) continue;
      if (B.cmp(B.mulN(C.upgradeCost(g, inst), 25), s.credits) <= 0 && C.upgradeModule(g, inst.uid).ok) {
        this.sim.bought();
        break;
      }
    }
  }

  private repairs(): void {
    const g = this.g;
    const s = g.state;
    const fix = (target: number, hp: number, below: number): boolean => {
      if (hp >= below) return false;
      const item = C.bestRepairItem(g, hp);
      if (item && C.repairWithItem(g, target, item).ok) return true;
      // by hand; the idle-bot starts the job and lets it auto-resolve
      if (!s.minigame && C.startManualRepair(g, target).ok) return true;
      return false;
    };
    // the active player welds the hull once the story has pointed at it, or when it gets worrying
    if (fix(0, s.hull.hp, this.kind === "active" ? (s.story.chapter >= 3 ? 85 : 55) : 60)) return;
    for (const inst of s.modules) if (inst.slot >= 0 && fix(inst.uid, inst.hp, 55)) return;
    if (s.features.repairBots === 1 && s.repair.priority.length === 0 && s.modules.length > 0) {
      C.setRepairPriority(g, s.modules.filter((m) => m.slot >= 0).map((m) => m.uid).concat(0));
    }
    if (s.features.autoMaintenance === 1 && !s.repair.auto) C.setAutoMaintenance(g, true);
    for (const job of s.repair.jobs) if (job.glitchUntil > s.t) C.clearGlitch(g, job.target);
  }

  // ----- crafting toward things

  private recipeFor(item: ItemId): RecipeDef | null {
    const g = this.g;
    const s = g.state;
    let found: RecipeDef | null = null;
    const primary = g.content.recipes[item];
    if (primary && s.recipes[item] === 1 && s.decks[primary.station].level > 0 && (primary.outputs[item] ?? 0) > 0) return primary;
    for (const id in s.recipes) {
      const def = g.content.recipes[id];
      if (!def || !((def.outputs[item] ?? 0) > 0) || s.decks[def.station].level <= 0) continue;
      if (!found || def.time < found.time) found = def;
    }
    return found;
  }

  private queued(def: RecipeDef): boolean {
    for (const j of this.g.state.craft[def.station].queue) if (j.recipe === def.id && j.left !== -1) return true;
    return false;
  }

  /** Makes sure `n` of an item will exist: queues its recipe (and its inputs' recipes) when it is short. */
  private ensure(item: ItemId, n: number, depth = 0): boolean {
    const g = this.g;
    const s = g.state;
    const have = num(s.inv[item]);
    if (have >= n) return true;
    const def = depth < 5 ? this.recipeFor(item) : null;
    const itemDef = g.content.items[item];
    // keep enough of it: the broker sells whatever is above the reserve
    if (itemDef && C.massOf(itemDef) > 0) {
      const cap = num(g.rates.cargoCap);
      const want = Math.min(0.3, (n * 1.25) / Math.max(1, cap));
      if (C.keepOf(g, item) < want) C.setKeep(g, item, want);
    }
    if (!def) return false;
    // batches may be partial: ask for exactly the units that are missing
    const unit = def.tier >= 3 ? 1 : Math.max(1, num(g.rates.craftBatch[def.station]));
    const units = Math.ceil((n - have) / def.outputs[item]);
    const batches = Math.max(1, Math.ceil(units / unit));
    let ready = true;
    for (const input in def.inputs) {
      this.ensure(input, def.inputs[input] * units, depth + 1);
      if (!B.gteN(s.inv[input] ?? B.ZERO, def.inputs[input])) ready = false;
    }
    if (!this.queued(def) && (ready || depth === 0)) {
      this.freeSlot(def.station);
      C.queueCraft(g, def.id, Math.min(batches, 20));
    }
    return false;
  }

  /** Whether an item can be made from what this ship knows and mines (or already holds). */
  private feasible(item: ItemId, depth = 0): boolean {
    const g = this.g;
    if (B.gteN(g.state.inv[item] ?? B.ZERO, 1)) return true;
    const def = depth < 5 ? this.recipeFor(item) : null;
    if (!def) {
      for (const m of g.rates.mix) if (m.item === item) return true;
      return false;
    }
    for (const input in def.inputs) if (!this.feasible(input, depth + 1)) return false;
    return true;
  }

  /** A targeted job goes ahead of the "make it again" filler. */
  private freeSlot(station: CraftStationId): void {
    const g = this.g;
    const queue = g.state.craft[station].queue;
    const slots = g.rates.craftSlots[station];
    let fillers = 0;
    for (const j of queue) if (j.left === -1) fillers++;
    if (fillers > 0 && queue.length - fillers + 1 > slots - fillers) {
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].left === -1) C.cancelCraft(g, station, queue[i].uid);
    }
  }

  private moduleToBuild(): RecipeDef | null {
    const g = this.g;
    const s = g.state;
    if (s.features.grid !== 1 || s.decks.fabricator.level <= 0) return null;
    let free = 0;
    for (let i = 0; i < s.grid.open && i < s.grid.cells.length; i++) if (s.grid.cells[i] === 0) free++;
    let stored = 0;
    for (const m of s.modules) if (m.slot < 0) stored++;
    if (free - stored <= 0) return null;
    const owned: Record<string, number> = {};
    for (const m of s.modules) {
      const fam = g.content.items[m.item]?.module?.family;
      if (fam) owned[fam] = (owned[fam] ?? 0) + 1;
    }
    let best: RecipeDef | null = null;
    let bestScore = -Infinity;
    for (const id in s.recipes) {
      const def = g.content.recipes[id];
      const spec = def && def.tier === 3 ? g.content.items[id]?.module : undefined;
      if (!def || !spec || def.station !== "fabricator") continue;
      let can = true;
      for (const input in def.inputs) if (!this.feasible(input)) can = false;
      if (!can) continue;
      const score = spec.mk * 2 - (owned[spec.family] ?? 0) * 3 - MODULE_FAMILIES.indexOf(spec.family) * 0.1;
      if (score > bestScore) {
        bestScore = score;
        best = def;
      }
    }
    return best;
  }

  private crafting(): void {
    const g = this.g;
    const s = g.state;
    if (s.features.crafting !== 1) return;

    // 1. the next decks
    const credits = num(s.credits);
    for (const id of DECK_IDS) {
      const def = g.content.decks[id];
      if (s.decks[id].level > 0 || !def.unlock.items) continue;
      if (num(C.unlockCost(g, id)) > credits * 30 + 1000) continue;
      for (const item in def.unlock.items) this.ensure(item, def.unlock.items[item]);
    }
    // 2. fuel for the road
    if (s.features.nav === 1) {
      const cap = W.fuelCap(g);
      const want = Math.ceil(cap - s.nav.fuel) + 2 * W.baseJumpCost(g);
      if (W.fuelInCargo(g) < want) this.ensure("fuel", want);
    }
    // 3. a module for every open cell
    const mod = this.moduleToBuild();
    if (mod && !this.queued(mod)) this.ensure(mod.id, num(s.inv[mod.id]) + 1);
    else if (mod) for (const input in mod.inputs) this.ensure(input, mod.inputs[input]);
    // 4. consumables
    if (s.decks.workshop.level > 0) {
      this.ensure("duct_tape", 4);
      if (s.modules.length > 0) this.ensure("spare_parts", 2);
      if (s.crew.length > 0) this.ensure("coffee", 30 * s.crew.length);
    }
    // 5. research and outposts that wait for parts
    if (s.features.research === 1) {
      for (const id in g.content.research) {
        if (M.researchBlock(g, id) !== "items") continue;
        const cost = M.researchCost(g, id);
        for (const item in cost.items ?? {}) this.ensure(item, (cost.items as Record<ItemId, number>)[item]);
        break;
      }
    }
    if (s.features.outposts === 1 && s.outposts.length < 3) {
      const cost = W.outpostCost(g);
      for (const item in cost) this.ensure(item, cost[item]);
    }

    // 6. an idle refinery turns ore into something the broker pays more for
    const queue = s.craft.refinery.queue;
    if (s.decks.refinery.level > 0) {
      if (queue.length > 0 && queue[0].left === -1 && queue[0].stalled === "inputs" && !this.minedHere(g.content.recipes[queue[0].recipe])) {
        C.cancelCraft(g, "refinery", queue[0].uid);
      }
      if (queue.length === 0) {
        let best: RecipeDef | null = null;
        let bestGain = 0;
        for (const id of C.craftableRecipes(g, "refinery")) {
          const def = g.content.recipes[id];
          if (def.tier !== 1 || !this.minedHere(def)) continue;
          let inV = 0;
          let outV = 0;
          for (const i in def.inputs) inV += (g.content.items[i]?.value ?? 0) * def.inputs[i];
          for (const o in def.outputs) outV += (g.content.items[o]?.value ?? 0) * def.outputs[o];
          const gain = (outV - inV) / Math.max(1, def.time);
          if (gain > bestGain) {
            bestGain = gain;
            best = def;
          }
        }
        if (best) C.queueCraft(g, best.id, -1);
      }
    }
  }

  private minedHere(def: RecipeDef | undefined): boolean {
    if (!def) return false;
    const mix = this.g.rates.mix;
    for (const input in def.inputs) {
      let ok = false;
      for (const m of mix) if (m.item === input && m.share > 0.02) ok = true;
      if (!ok) return false;
    }
    return true;
  }

  // ----- the world

  private station(): void {
    const g = this.g;
    const s = g.state;
    if (s.features.station !== 1 || s.nav.jump !== null) return;
    const sys = W.currentSystem(g);
    if (!sys.station) return;
    if (!s.station.docked && !W.dock(g).ok) return;
    const credits = (): number => num(s.credits);

    const short = W.fuelCap(g) - s.nav.fuel - W.fuelInCargo(g);
    if (short >= 1) W.buy(g, "fuel", Math.ceil(short));
    for (const def of W.shopOffers(g)) {
      if (W.shopBlock(g, def) !== null) continue;
      if (num(W.shopCost(g, def)) > credits() * (def.item ? 0.02 : 0.35)) continue;
      if (W.buyShop(g, def.id).ok) this.sim.bought();
    }
    if (s.crew.length < W.crewCap(g)) {
      for (const offer of W.hireOffers(g)) {
        if (!offer.hired && num(offer.cost) <= credits() && W.hireCrew(g, offer.index).ok) break;
      }
    }
    if (s.hull.hp < 60 && num(W.repairCost(g)) <= credits() * 0.25) W.repairAtDock(g);

    for (const c of s.station.contracts.slice()) if (W.contractReady(g, c)) W.deliverContract(g, c.uid);
    if (this.kind === "active") {
      if (s.station.contracts.length < 2 && s.station.offers.length > 0) W.acceptContract(g, 0);
      // sell where the price is good
      let n = 0;
      for (const row of W.marketRows(g)) {
        if (n >= 2 || row.factor < 1.2) continue;
        const have = s.inv[row.item];
        if (have && B.gteN(have, 2) && W.sellAt(g, row.item, B.floor(B.mulN(have, 0.5))).ok) n++;
      }
    }
  }

  private planets(): void {
    const g = this.g;
    const s = g.state;
    if (s.nav.jump !== null) return;
    const sys = W.currentSystem(g);
    if (s.features.scan === 1 && W.scanTarget(g) === null) {
      for (const p of sys.planets) {
        if (!W.isScanned(g, p.id)) {
          W.startScan(g, p.id);
          break;
        }
      }
    }
    if (s.features.probes === 1 && s.drones.probe > 0 && W.probesUsed(g) < s.drones.probe) {
      for (const p of sys.planets) {
        if (W.isScanned(g, p.id) && W.setProbes(g, p.id, s.drones.probe).ok) break;
      }
    }
    for (const e of s.expeditions.slice()) if (e.done) W.claimExpedition(g, e.uid);
    if (this.kind === "active" && s.features.expeditions === 1 && s.expeditions.length === 0) {
      const member = s.crew.find((m) => !m.away && !W.isInjured(g, m.uid));
      const planet = sys.planets.find((p) => W.isScanned(g, p.id));
      if (member && planet) W.startExpedition(g, planet.id, [member.uid], "short");
    }
    if (s.features.outposts === 1) {
      for (const p of sys.planets) {
        if (W.isScanned(g, p.id) && (s.planets[p.id]?.outpost ?? 0) === 0 && this.hasAll(W.outpostCost(g)) && W.buildOutpost(g, p.id).ok) break;
      }
    }
  }

  private navigate(): void {
    const g = this.g;
    const s = g.state;
    const nav = s.nav;
    if (s.features.nav !== 1 || nav.jump !== null) return;
    const key = `${nav.g}:${nav.depth}:${nav.lane}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.arrivedAt = s.t;
    }
    const cap = W.fuelCap(g);
    if (nav.fuel < cap - 0.99 && W.fuelInCargo(g) >= 1) W.refuel(g);
    const sys = W.currentSystem(g);
    if (sys.isCore) return;
    if (s.failure && W.failureDef(g)?.blocksJump) return;
    if (nav.charge < 1) {
      if (!W.isCharging(g)) W.chargeJump(g);
      return;
    }
    if (nav.cooldownUntil > s.t) return;
    const next = W.routeToCore(g, 1)[0];
    if (!next) return;
    const cost = W.jumpCost(g, next.depth, next.lane);
    if (nav.fuel < cost) return;
    // do not strand the ship: keep a second jump in the tank unless more fuel is not coming anyway
    const fuelRecipe = this.recipeFor("fuel");
    const canMake = fuelRecipe !== null && this.minedHere(fuelRecipe);
    if (nav.fuel - cost < cost && canMake && s.t - this.arrivedAt < 900) return;
    // the active player looks around first: one planet scan per system
    if (this.kind === "active" && s.features.scan === 1 && s.t - this.arrivedAt < 150) {
      let scanned = false;
      for (const p of sys.planets) if (W.isScanned(g, p.id)) scanned = true;
      if (!scanned && sys.planets.length > 0) return;
    }
    W.jumpTo(g, next.depth, next.lane);
  }

  private prestige(): void {
    const g = this.g;
    const s = g.state;
    const p = s.prestige;
    for (const id in g.content.upgrades) {
      if (M.upgradeBlock(g, id) === null && M.buyUpgrade(g, id).ok) {
        this.sim.bought();
        break;
      }
    }
    if (M.canRebuild(g)) {
      for (const hull in g.content.hulls) {
        if (!p.hullsOwned.includes(hull) && M.rebuildBlock(g, hull) === null && M.rebuild(g, hull).ok) return;
      }
    }
    if (!M.canWarp(g)) return;
    const gain = M.stampsOnWarp(g);
    // worthwhile: the first stamp, later at least a third of everything earned so far
    const need = B.max(B.big(p.warps === 0 ? 1 : 3), B.mulN(p.stampsTotal, 0.3));
    if (B.cmp(gain, need) >= 0) M.warp(g, []);
  }
}

// ---------- experiments run.ts and the tests share ------------------------------------

/** Credits earned over `seconds` of foreground time from a copy of `g`, with or without thumbs on the screen. */
export function sessionEarnings(g: Game, seconds: number, hands: boolean, seed = 1): number {
  const copy = cloneGame(g);
  const sim = new Sim({ bot: "active", seed, hours: 0 }, copy);
  const bot = new Bot(sim, "active", 0.75, new Rand(seed)) as unknown as { hands(): void; dialogs(): boolean };
  // an experiment, not a playthrough: events are switched off in the copy so that one lucky payout
  // does not decide a ten-minute comparison
  const ev = copy.state.events;
  ev.active = null;
  ev.chain.length = 0;
  ev.nextAt = Number.MAX_SAFE_INTEGER;
  copy.state.minigame = null;
  // let the smoothed rates settle before measuring
  for (let i = 0; i < 300; i++) tick(copy, TICK);
  const start = B.clone(copy.state.allTime);
  for (let i = 0; i < seconds; i++) {
    for (let k = 0; k < 10; k++) tick(copy, TICK);
    copy.outbox.length = 0;
    const busy = bot.dialogs();
    if (hands && !busy) bot.hands();
  }
  return num(B.sub(copy.state.allTime, start));
}

/** Forces a failure on a copy of `g` and lets a bot get out of it. Returns seconds until it cleared (Infinity = never). */
export function surviveFailure(g: Game, kind: FailureKind, bot: BotKind, limit = 4 * 3600): { seconds: number; by: string } {
  const copy = cloneGame(g);
  for (let i = 0; i < 20; i++) tick(copy, TICK);
  copy.state.minigame = null;
  if (copy.state.failure) copy.api.clearFailure("tow");
  if (!copy.api.startFailure(kind)) return { seconds: Infinity, by: "could not start" };
  const sim = new Sim({ bot, seed: 7, hours: 0 }, copy);
  const b = new Bot(sim, bot, 0.75, new Rand(7)) as unknown as { dialogs(): boolean };
  let by = "";
  for (let sec = 1; sec <= limit; sec++) {
    for (let k = 0; k < 10; k++) tick(copy, TICK);
    for (const e of copy.outbox) if (e.t === "failureCleared" && e.kind === kind) by = e.by;
    copy.outbox.length = 0;
    if (by) return { seconds: sec, by };
    b.dialogs();
  }
  return { seconds: Infinity, by: "stuck" };
}

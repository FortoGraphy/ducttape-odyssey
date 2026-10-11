// `npm run sim`: both bots play the real game and the pacing targets of GDD section 9 are asserted.
//   --bot idle|active|both   --hours N (per bot, default: active 8 h and idle 16 d; seed 1 runs 30 d)
//   --seed N (one seed; default 1..5)   --seeds N   --verbose (every milestone as it happens)
import * as B from "@/engine/big";
import { formatBig } from "@/engine/core";
import { applyOffline } from "@/engine/kernel";
import { stampsOnWarp } from "@/engine/meta";
import type { FailureKind } from "@/engine/types";
import { Sim, cloneGame, fmtTime, lg, num, sessionEarnings, surviveFailure, type BotKind } from "./bots";

interface Args {
  bot: BotKind | "both";
  hours: number | null;
  seeds: number[];
  verbose: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { bot: "both", hours: null, seeds: [1, 2, 3, 4, 5], verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => argv[++i] ?? "";
    if (a === "--bot") out.bot = next() as Args["bot"];
    else if (a === "--hours") out.hours = Number(next());
    else if (a === "--seed") out.seeds = [Number(next())];
    else if (a === "--seeds") out.seeds = Array.from({ length: Math.max(1, Number(next())) }, (_, k) => k + 1);
    else if (a === "--verbose") out.verbose = true;
  }
  return out;
}

export interface Check {
  name: string;
  target: string;
  actual: string;
  ok: boolean;
  /** Informational: printed, never fails the run. */
  soft?: boolean;
}

const FAILURES: FailureKind[] = ["tumble", "breach", "blackout", "noFuel", "engine", "radiation", "boarding", "anomaly"];
const H = 3600;
const D = 86400;

function within(name: string, value: number | undefined, min: number, max: number, soft = false): Check {
  const v = value ?? Infinity;
  const target = min > 0 ? `${fmtTime(min)} .. ${fmtTime(max)}` : `< ${fmtTime(max)}`;
  return { name, target, actual: fmtTime(v), ok: v >= min && v <= max, soft };
}

/** Pacing checks of one active-bot run. `hours` decides which targets the run is long enough to judge. */
export function activeChecks(sim: Sim): Check[] {
  const p = sim.firstPlayed;
  const hours = sim.opts.hours;
  const checks: Check[] = [
    within("first purchase", p.purchase, 0, 10),
    within("first decision point", p.decision, 0, 30),
    within("second deck", p.secondDeck, 0, 120),
  ];
  if (hours >= 0.2) {
    checks.push(within("first event", p.event, 0, 600));
    checks.push(within("first mini-game", p.minigame, 0, 600));
  }
  if (hours >= 1) {
    checks.push(within("first jump", p.jump, 0, 45 * 60));
    checks.push(within("first planet scanned", p.planet, 0, 45 * 60));
    checks.push(within("first module crafted", p.moduleCrafted, 0, H));
    checks.push(within("first module installed", p.moduleInstalled, 0, 65 * 60, true));
  }
  if (hours >= 4) checks.push(within("first warp (played time)", p.warp, 2 * H, 4 * H));
  if (hours >= 2) checks.push({ name: "longest gap between purchases, first 2 h", target: "< 10 m 00 s", actual: fmtTime(sim.deadZone), ok: sim.deadZone < 600 });

  if (sim.eventTimes.length >= 2) {
    const cap = sim.g.content.balance.eventMaxPerHour;
    const max = sim.maxEventsPerHour();
    checks.push({ name: "events in any one hour", target: `<= ${cap}`, actual: String(max), ok: max <= cap });
    const gap = sim.meanEventGap();
    checks.push({ name: "mean time between events", target: "4 m .. 12 m", actual: fmtTime(gap), ok: gap >= 240 && gap <= 720 });
  }
  checks.push({ name: "non-finite numbers in state", target: "0", actual: String(sim.nonFinite.length) + (sim.nonFinite.length ? ` (${sim.nonFinite.slice(0, 3).join(", ")})` : ""), ok: sim.nonFinite.length === 0 });

  if (hours >= 2) {
    const b = sim.bottleneck;
    checks.push({ name: "bottlenecks seen (cargo / lift / power)", target: "each > 0 s", actual: `${b.cargo} s / ${b.lift} s / ${b.power} s`, ok: b.cargo > 0 && b.lift > 0 && b.power > 0 });
  }

  // One snapshot says little: whether holding the laser pays depends on where the lift stands against
  // its next doubling at that minute. The design target is the average over the first hour, before
  // active-play research and modules move it; later snapshots are reported.
  const early: number[] = [];
  for (const snap of sim.snaps) {
    const at = fmtTime(snap.played);
    const idle = sessionEarnings(snap.g, 600, false);
    const active = sessionEarnings(snap.g, 600, true);
    const ratio = idle > 0 ? active / idle : Infinity;
    if (snap.played <= H) early.push(ratio);
    else checks.push({ name: `active / idle income, 10 min focus at ${at}`, target: "3.0 .. 8.0", actual: ratio.toFixed(2), ok: ratio >= 3 && ratio <= 8, soft: true });

    const off = cloneGame(snap.g);
    const report = applyOffline(off, 8 * H);
    const perSec = active / 600;
    const vsActive = num(report.credits) / Math.max(1e-9, perSec * report.credited);
    const vsIdle = num(report.credits) / Math.max(1e-9, (idle / 600) * report.credited);
    checks.push({
      name: `8 h offline return at ${at}`,
      target: "> 0 and < 3x active",
      actual: `${formatBig(report.credits)} = ${vsActive.toFixed(2)}x active, ${vsIdle.toFixed(2)}x idle`,
      ok: report.credits.m > 0 && vsActive < 3,
    });
  }
  if (early.length > 0) {
    const mean = Math.exp(early.reduce((a, x) => a + Math.log(Math.max(1e-9, x)), 0) / early.length);
    const low = Math.min(...early);
    checks.push({ name: `active / idle income, focus sessions in the first hour`, target: "mean 3.0 .. 5.0, none < 1.5", actual: `mean ${mean.toFixed(2)} (${early.map((x) => x.toFixed(2)).join(", ")})`, ok: mean >= 3 && mean <= 5 && low >= 1.5 });
  }

  const last = sim.snaps[sim.snaps.length - 1];
  if (last) {
    const bad: string[] = [];
    let worst = 0;
    for (const kind of FAILURES) {
      for (const bot of ["active", "idle"] as const) {
        const r = surviveFailure(last.g, kind, bot);
        if (!Number.isFinite(r.seconds)) bad.push(`${kind}/${bot}: ${r.by}`);
        else worst = Math.max(worst, r.seconds);
      }
    }
    checks.push({ name: "every failure kind survivable (both bots)", target: "8 of 8, < 4 h", actual: bad.length ? bad.join("; ") : `8 of 8, slowest ${fmtTime(worst)}`, ok: bad.length === 0 });
  }
  const zero = sim.offlineReturns.filter((r) => r.zero && r.seconds >= 600).length;
  if (sim.offlineReturns.length) checks.push({ name: "offline returns worth nothing", target: "0", actual: `${zero} of ${sim.offlineReturns.length}`, ok: zero === 0 });

  if (sim.warpTimes.length >= 3) {
    const gaps: number[] = [];
    // the first gap follows the long opening sitting; casual cadence starts after it
    for (let i = 2; i < sim.warpTimes.length; i++) gaps.push(sim.warpTimes[i] - sim.warpTimes[i - 1]);
    gaps.sort((a, b) => a - b);
    const med = gaps[Math.floor(gaps.length / 2)];
    checks.push({ name: "later warps, median gap (3 x 30 min a day)", target: "1 d .. 3 d", actual: `${fmtTime(med)} (${sim.warpTimes.length} warps)`, ok: med >= D * 0.9 && med <= 3 * D, soft: true });
  }
  return checks;
}

export function idleChecks(sim: Sim): Check[] {
  const hours = sim.opts.hours;
  const checks: Check[] = [];
  const s = sim.g.state;
  if (hours >= 14 * 24) checks.push(within("idle-bot first warp (wall time)", sim.first.warp, 0, 15 * D));
  // progress: every quarter of the run ends richer or deeper than the one before
  const n = sim.samples.length;
  let stalls = 0;
  if (n >= 8) {
    const q = Math.floor(n / 4);
    for (let i = 1; i < 4; i++) {
      const a = sim.samples[i * q - 1];
      const b = sim.samples[Math.min(n - 1, (i + 1) * q - 1)];
      if (!(b.warps > a.warps || b.depth > a.depth || b.income > a.income + 0.05)) stalls++;
    }
  }
  checks.push({ name: "idle-bot keeps progressing (quarters without progress)", target: "0", actual: String(stalls), ok: stalls === 0 });
  checks.push({ name: "idle-bot reached", target: "depth > 0", actual: `depth ${s.nav.maxDepth}, ${s.prestige.warps} warps, chapter ${s.story.chapter}`, ok: s.nav.maxDepth > 0 || s.prestige.warps > 0 || hours < 12 });
  const zero = sim.offlineReturns.filter((r) => r.zero && r.seconds >= 600).length;
  checks.push({ name: "idle-bot offline returns worth nothing", target: "0", actual: `${zero} of ${sim.offlineReturns.length}`, ok: zero === 0 });
  checks.push({ name: "idle-bot non-finite numbers", target: "0", actual: String(sim.nonFinite.length), ok: sim.nonFinite.length === 0 });
  const stuck = Object.entries(sim.failures).filter(([, f]) => f.started > f.cleared + 1);
  checks.push({ name: "idle-bot failures left unresolved", target: "0", actual: stuck.length ? stuck.map(([k]) => k).join(",") : "0", ok: stuck.length === 0 });
  return checks;
}

function bar(log: number, max: number, width = 34): string {
  const n = Math.max(0, Math.min(width, Math.round((log / Math.max(1, max)) * width)));
  return "#".repeat(n).padEnd(width, ".");
}

export function printTimeline(sim: Sim, limit = 80): void {
  const skip = /^feature: |^cargo full/;
  let shown = 0;
  console.log("  wall        played      milestone");
  for (const e of sim.timeline) {
    if (skip.test(e.label)) continue;
    if (shown++ >= limit) {
      console.log(`  ... ${sim.timeline.length - limit} more`);
      break;
    }
    console.log(`  ${fmtTime(e.at).padEnd(11)} ${fmtTime(e.played).padEnd(11)} ${e.label}`);
  }
}

export function printCurve(sim: Sim, rows = 26): void {
  const all = sim.samples;
  if (all.length === 0) return;
  const stepBy = Math.max(1, Math.ceil(all.length / rows));
  const max = Math.max(...all.map((x) => x.credits), 6);
  console.log("  time        depth warps  credits (log10)                            income/s");
  for (let i = 0; i < all.length; i += stepBy) {
    const x = all[i];
    console.log(`  ${fmtTime(x.hours * H).padEnd(11)} ${String(x.depth).padStart(4)} ${String(x.warps).padStart(5)}  1e${x.credits.toFixed(1).padStart(5)} ${bar(x.credits, max)}  1e${x.income.toFixed(1)}`);
  }
}

export function printChecks(title: string, checks: Check[]): number {
  const w1 = Math.max(...checks.map((c) => c.name.length), 10);
  const w2 = Math.max(...checks.map((c) => c.target.length), 6);
  console.log(`\n${title}`);
  console.log(`  ${"target".padEnd(w1)}  ${"wanted".padEnd(w2)}  actual`);
  let failed = 0;
  for (const c of checks) {
    const tag = c.ok ? "ok  " : c.soft ? "warn" : "FAIL";
    if (!c.ok && !c.soft) failed++;
    console.log(`  ${c.name.padEnd(w1)}  ${c.target.padEnd(w2)}  ${tag} ${c.actual}`);
  }
  return failed;
}

function summary(sim: Sim): string {
  const s = sim.g.state;
  return `credits ${formatBig(s.credits)}, income ${formatBig(sim.g.rates.income)}/s, depth ${s.nav.depth} (max ${s.nav.maxDepth}), warps ${s.prestige.warps}, rebuilds ${s.prestige.rebuilds}, chapter ${s.story.chapter}, stamps ${formatBig(s.prestige.stampsTotal)} (a warp now pays ${formatBig(stampsOnWarp(sim.g))}), lifetime 1e${lg(s.lifetime).toFixed(1)}, codex ${Object.keys(s.codex).length} entries, crew ${s.crew.length}`;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const started = Date.now();
  let failed = 0;
  for (let k = 0; k < args.seeds.length; k++) {
    const seed = args.seeds[k];
    const full = k === 0; // the first seed plays the long horizons and prints its story
    if (args.bot !== "idle") {
      const hours = args.hours ?? (full ? 30 * 24 : 8);
      const t0 = Date.now();
      const sim = new Sim({ bot: "active", seed, hours, verbose: args.verbose, snapshots: [15 * 60, 30 * 60, 45 * 60, H, 2 * H].filter((x) => x < hours * H) }).run();
      console.log(`\n=== active-bot, seed ${seed}, ${fmtTime(hours * H)} of game time (${((Date.now() - t0) / 1000).toFixed(1)} s) ===`);
      console.log(`  ${summary(sim)}`);
      if (full && !args.verbose) {
        printTimeline(sim);
        printCurve(sim);
      }
      failed += printChecks(`active-bot seed ${seed}: target vs actual`, activeChecks(sim));
    }
    if (args.bot !== "active") {
      const hours = args.hours ?? (full ? 30 * 24 : 16 * 24);
      const t0 = Date.now();
      const sim = new Sim({ bot: "idle", seed, hours, verbose: args.verbose }).run();
      console.log(`\n=== idle-bot, seed ${seed}, ${fmtTime(hours * H)} of game time, 2 min every ${sim.opts.checkEvery} h (${((Date.now() - t0) / 1000).toFixed(1)} s) ===`);
      console.log(`  ${summary(sim)}`);
      if (full && !args.verbose) {
        printTimeline(sim, 60);
        printCurve(sim, 20);
      }
      failed += printChecks(`idle-bot seed ${seed}: target vs actual`, idleChecks(sim));
    }
  }
  console.log(`\n${failed === 0 ? "sim OK" : `sim FAILED: ${failed} target(s) missed`} (${args.seeds.length} seed(s), ${((Date.now() - started) / 1000).toFixed(0)} s)`);
  void B;
  if (failed > 0) process.exit(1);
}

// run only as a script: the tests import the check builders
if (process.argv[1] && /run\.ts$/.test(process.argv[1])) main();

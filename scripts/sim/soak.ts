// `npm run soak` (node --expose-gc): seven days of game time tick by tick under stress. An active-bot
// plays while the harness keeps breaking things: forced events, every failure kind in turn, damage,
// random taps, offline jumps, prestige cycles and a save/load round trip every hour. Asserts that
// memory, state size, save size and tick cost stay bounded and that no number goes non-finite.
//   --hours N (default 168)   --seed N
import { resumeGame } from "@/engine";
import * as C from "@/engine/core";
import { applyOffline, runPrestige, tick, TICK } from "@/engine/kernel";
import * as M from "@/engine/meta";
import type { Game } from "@/engine/types";
import { Rand, Sim, cloneGame, findNonFinite } from "./bots";
import { FAILURES, preset, randomAction } from "./fuzz";

export interface SoakRow {
  hour: number;
  usPerTick: number;
  heapMb: number;
  saveKb: number;
  /** Part of the save that is the codex: the one collection that is meant to grow (GDD 9: kept across warps). */
  codexKb: number;
  counts: Record<string, number>;
}

export interface SoakResult {
  rows: SoakRow[];
  ticks: number;
  violations: string[];
  /** Largest value every counted collection reached. */
  peak: Record<string, number>;
  failures: Record<string, number>;
  warps: number;
}

/** Hard limits on collections that must never grow with play time. */
const LIMITS: Record<string, number> = {
  salvage: 8,
  buffs: 64,
  "queue.refinery": 12,
  "queue.fabricator": 12,
  "queue.workshop": 12,
  outbox: 256,
  "events.chain": 16,
  expeditions: 8,
  contracts: 8,
  offers: 12,
  "repair.jobs": 64,
  "repair.priority": 64,
  autoRecipes: 24,
  kippRecent: 32,
  "story.pending": 64,
  crew: 24,
  outposts: 12,
  quests: 8,
};

function counts(g: Game, outboxPeak: number): Record<string, number> {
  const s = g.state;
  const keys = (o: object): number => Object.keys(o).length;
  return {
    salvage: s.active.salvage.length,
    buffs: s.buffs.length,
    "queue.refinery": s.craft.refinery.queue.length,
    "queue.fabricator": s.craft.fabricator.queue.length,
    "queue.workshop": s.craft.workshop.queue.length,
    outbox: outboxPeak,
    "events.chain": s.events.chain.length,
    expeditions: s.expeditions.length,
    contracts: s.station.contracts.length,
    offers: s.station.offers.length,
    "repair.jobs": s.repair.jobs.length,
    "repair.priority": s.repair.priority.length,
    autoRecipes: s.autoRecipes.length,
    kippRecent: s.story.kippRecent.length,
    "story.pending": s.story.pending.length,
    crew: s.crew.length,
    outposts: s.outposts.length,
    quests: s.quests.daily.length,
    // bounded by content or by the galaxy, reported rather than limited
    modules: s.modules.length,
    "events.last": keys(s.events.last),
    "events.seen": keys(s.events.seen),
    flags: keys(s.flags),
    stats: keys(s.stats),
    inv: keys(s.inv),
    keep: keys(s.keep),
    visited: keys(s.nav.visited),
    planets: keys(s.planets),
    codex: keys(s.codex),
    logs: s.story.logs.length,
    achievements: keys(s.achievements),
  };
}

function heapMb(): number {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (gc) {
    gc();
    gc();
  }
  return process.memoryUsage().heapUsed / 1048576;
}

/** Cost of a plain engine tick in this state, without bot or harness. */
function tickCost(g: Game): number {
  const copy = cloneGame(g);
  for (let i = 0; i < 500; i++) tick(copy, TICK);
  copy.outbox.length = 0;
  const n = 5000;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < n; i++) {
    tick(copy, TICK);
    if ((i & 255) === 0) copy.outbox.length = 0;
  }
  return Number(process.hrtime.bigint() - t0) / 1000 / n;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function soak(opts: { hours?: number; seed?: number; chunk?: number; log?: (row: SoakRow) => void } = {}): SoakResult {
  const hours = opts.hours ?? 168;
  const chunk = opts.chunk ?? 3600; // seconds of ticks between two stress rounds
  const rounds = Math.max(1, Math.round((hours * 3600) / chunk));
  const r = new Rand((opts.seed ?? 1) * 104729);
  const res: SoakResult = { rows: [], ticks: 0, violations: [], peak: {}, failures: {}, warps: 0 };
  const violate = (msg: string): void => {
    if (res.violations.length < 40 && !res.violations.includes(msg)) res.violations.push(msg);
  };
  let g = preset("fresh", 9000 + (opts.seed ?? 1));
  const events = Object.keys(g.content.events);
  const sampleEvery = Math.max(1, Math.round(rounds / 28));

  for (let round = 1; round <= rounds; round++) {
    const sim = new Sim({ bot: "active", seed: round, hours: 0 }, g);
    // the outbox is drained by the sim every second; its peak is what one second can produce
    let outboxPeak = 0;
    const slices = 6;
    for (let k = 0; k < slices; k++) {
      sim.session(chunk / slices);
      res.ticks += Math.round(chunk / slices / TICK);
      // ----- stress: things a bad day would do, through the same doors the game uses
      if (k % 2 === 0) g.api.triggerEvent(events[Math.floor(r.next() * events.length)]);
      if (k === 1) {
        const kind = FAILURES[round % FAILURES.length];
        if (g.api.startFailure(kind)) res.failures[kind] = (res.failures[kind] ?? 0) + 1;
      }
      if (k === 3) {
        g.api.damageModules(10 + r.next() * 50, 1 + Math.floor(r.next() * 3));
        g.api.damageHull(5 + r.next() * 40);
      }
      for (let i = 0; i < 8; i++) randomAction(g, r);
      for (let i = 0; i < 10; i++) tick(g, TICK);
      outboxPeak = Math.max(outboxPeak, g.outbox.length);
    }
    if (round % 6 === 0) applyOffline(g, 600 + r.next() * 10 * 3600);
    if (round % 24 === 0) {
      if (M.canWarp(g)) M.warp(g, []);
      else {
        g.state.prestige.warps++;
        runPrestige(g, 1);
      }
    }
    if (round % 72 === 0) {
      g.state.prestige.rebuilds++;
      runPrestige(g, 2);
    }
    if (round % 120 === 0) {
      g.state.prestige.reboots++;
      runPrestige(g, 3);
    }
    for (let i = 0; i < 10; i++) tick(g, TICK);
    outboxPeak = Math.max(outboxPeak, g.outbox.length);
    g.outbox.length = 0;

    // ----- every round: save, load, carry on with the loaded game
    const text = C.serialize(g.state);
    const back = C.deserialize(text);
    if (!back.ok || !back.state) {
      violate(`round ${round}: save does not load`);
      break;
    }
    g = resumeGame(g.content, back.state);

    const c = counts(g, outboxPeak);
    for (const key in c) {
      res.peak[key] = Math.max(res.peak[key] ?? 0, c[key]);
      if (LIMITS[key] !== undefined && c[key] > LIMITS[key]) violate(`${key} = ${c[key]} exceeds ${LIMITS[key]} (round ${round})`);
    }
    const bad = findNonFinite(g.state);
    findNonFinite(g.rates, "rates", bad);
    findNonFinite(g.mods, "mods", bad);
    if (bad.length) violate(`non-finite: ${bad.slice(0, 4).join(", ")} (round ${round})`);

    if (round % sampleEvery === 0 || round === 1 || round === rounds) {
      const row: SoakRow = { hour: (round * chunk) / 3600, usPerTick: tickCost(g), heapMb: heapMb(), saveKb: text.length / 1024, codexKb: JSON.stringify(g.state.codex).length / 1024, counts: c };
      res.rows.push(row);
      opts.log?.(row);
    }
  }
  res.warps = g.state.prestige.warps;

  // ----- trends
  const rows = res.rows;
  if (rows.length >= 6) {
    const third = Math.floor(rows.length / 3);
    const head = rows.slice(1, 1 + third); // the very first sample is taken before anything is warm
    const tail = rows.slice(rows.length - third);
    const heapA = mean(head.map((x) => x.heapMb));
    const heapB = mean(tail.map((x) => x.heapMb));
    // the live state is part of the heap, and the codex is allowed to grow: its share is set aside at a
    // generous 16 heap bytes per saved byte (measured: about 11), anything beyond that is a leak
    const codexMb = (mean(tail.map((x) => x.codexKb)) - mean(head.map((x) => x.codexKb))) / 1024;
    const allowed = heapA * 1.25 + 8 + Math.max(0, codexMb) * 16;
    if (heapB > allowed) violate(`heap grows: ${heapA.toFixed(1)} MB early vs ${heapB.toFixed(1)} MB late (allowed ${allowed.toFixed(1)} MB with ${codexMb.toFixed(2)} MB of new codex)`);
    const costA = mean(head.map((x) => x.usPerTick));
    const costB = mean(tail.map((x) => x.usPerTick));
    if (costB > costA * 3 + 10) violate(`tick cost grows: ${costA.toFixed(1)} us early vs ${costB.toFixed(1)} us late`);
    // the codex is a collection the player keeps for good; everything else in the save must level off
    const saveA = mean(head.map((x) => x.saveKb - x.codexKb));
    const saveB = mean(tail.map((x) => x.saveKb - x.codexKb));
    if (saveB > saveA * 2 + 40) violate(`save without the codex grows: ${saveA.toFixed(1)} kB early vs ${saveB.toFixed(1)} kB late`);
  }
  const maxSave = Math.max(...rows.map((x) => x.saveKb - x.codexKb));
  if (maxSave > 200) violate(`save size without the codex ${maxSave.toFixed(0)} kB exceeds 200 kB`);
  const maxCost = Math.max(...rows.map((x) => x.usPerTick));
  if (maxCost > 400) violate(`a tick costs ${maxCost.toFixed(0)} us: the 10 Hz budget is 100000 us, but this is two orders above normal`);
  return res;
}

function main(): void {
  const argv = process.argv.slice(2);
  const arg = (name: string, def: number): number => {
    const i = argv.indexOf(name);
    return i >= 0 ? Number(argv[i + 1]) : def;
  };
  const hours = arg("--hours", 168);
  const hasGc = typeof (globalThis as { gc?: unknown }).gc === "function";
  if (!hasGc) console.log("warning: run with --expose-gc (npm run soak) for stable heap samples");
  const t0 = Date.now();
  console.log("  hour   us/tick  heap MB  save kB (codex)  salvage buffs queues outbox modules codex flags stats visited planets");
  const res = soak({
    hours,
    seed: arg("--seed", 1),
    log: (row) => {
      const c = row.counts;
      const q = c["queue.refinery"] + c["queue.fabricator"] + c["queue.workshop"];
      console.log(
        `  ${row.hour.toFixed(0).padStart(4)}  ${row.usPerTick.toFixed(1).padStart(8)} ${row.heapMb.toFixed(1).padStart(8)} ${row.saveKb.toFixed(1).padStart(8)} ${("(" + row.codexKb.toFixed(0) + ")").padStart(7)}  ${String(c.salvage).padStart(7)} ${String(c.buffs).padStart(5)} ${String(q).padStart(6)} ${String(c.outbox).padStart(6)} ${String(c.modules).padStart(7)} ${String(c.codex).padStart(5)} ${String(c.flags).padStart(5)} ${String(c.stats).padStart(5)} ${String(c.visited).padStart(7)} ${String(c.planets).padStart(7)}`,
      );
    },
  });
  const first = res.rows[0];
  const last = res.rows[res.rows.length - 1];
  console.log(`\nsoak: ${hours} h of game time, ${res.ticks} ticks in ${((Date.now() - t0) / 1000).toFixed(0)} s, ${res.warps} warps, failures forced: ${Object.entries(res.failures).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  console.log(`  tick cost   first ${first.usPerTick.toFixed(1)} us, last ${last.usPerTick.toFixed(1)} us`);
  console.log(`  heap        first ${first.heapMb.toFixed(1)} MB, last ${last.heapMb.toFixed(1)} MB`);
  console.log(`  save        first ${first.saveKb.toFixed(1)} kB, last ${last.saveKb.toFixed(1)} kB, of which codex ${last.codexKb.toFixed(1)} kB (${last.counts.codex} entries, about ${(last.counts.codex / Math.max(1, res.warps)).toFixed(0)} per galaxy: allowed to grow, reported)`);
  console.log(`  peak sizes  ${Object.entries(res.peak).map(([k, v]) => `${k} ${v}${LIMITS[k] !== undefined ? "/" + LIMITS[k] : ""}`).join(", ")}`);
  if (res.violations.length) {
    console.log(`\nsoak FAILED: ${res.violations.length} violation(s)`);
    for (const v of res.violations) console.log(`  ${v}`);
    process.exit(1);
  }
  console.log("soak OK");
}

if (process.argv[1] && /soak\.ts$/.test(process.argv[1])) main();

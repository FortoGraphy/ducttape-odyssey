// Offline progress ("Idle Cruise", GDD 10) in closed form. Time is cut into segments wherever the
// rates change: an item reaches its reserve or runs out, the hold fills, the hopper empties, a craft
// job finishes, a module wears across a threshold. Inside a segment everything is linear.
import * as B from "../big";
import { addCredits, rebuildMods, stat } from "../kernel";
import type { Big, CraftJob, Game, ItemId, ModuleInst, OfflineReport } from "../types";
import { resetActive } from "./active";
import * as X from "./bigx";
import { rollQuality } from "./crafting";
import { megaCheck } from "./mega";
import { recomputeRates, sweepCargo } from "./economy";
import { botRate } from "./repair";
import { STATIONS, bal, cc, deckBlocked, keepOf, massOf, type CoreCache, type RecipeInfo } from "./shared";
import { wearPerSecond } from "./wear";

/** Upper bound on linear segments for one absence. */
export const MAX_SEGMENTS = 64;
const WEAR_INTERVALS = 16;
const MODULES_PER_SEGMENT = 25;

interface Tracked {
  id: ItemId;
  mass: number;
  price: Big;
  reserve: Big;
  never: boolean;
  /** Share of the gross inflow that is stored while below the reserve. */
  fill: number;
  have: Big;
  /** Gross units per second coming in / consumed by crafting in this segment. */
  pos: Big;
  neg: Big;
  /** Signed stock change per second. */
  sigma: Big;
  /** Units sold per second. */
  sell: Big;
}

interface FlowJob {
  job: CraftJob;
  info: RecipeInfo;
  /** Units per second. */
  rate: Big;
  batch: Big;
}

interface Ctx {
  budget: number;
  /** Whole batches finished per job, applied to the queue when a job runs out and at the end. */
  done: Map<CraftJob, number>;
  cargoFilled: boolean;
}

const ZERO: Big = { m: 0, e: 0 };
const TOL = 1e-9;

function secondsTo(amount: Big, rate: Big): number {
  if (!(rate.m > 0)) return Infinity;
  if (!(amount.m > 0)) return 0;
  const l = B.log10(amount) - B.log10(rate);
  return l > 12 ? Infinity : Math.pow(10, l);
}

function runSpan(g: Game, c: CoreCache, span: number, eff: number, ctx: Ctx, reserveSegments: number): void {
  const s = g.state;
  const r = g.rates;
  const items = g.content.items;
  const cap = r.cargoCap;
  const mineE = B.mulN(r.mine, eff);
  const liftE = B.mulN(r.lift, eff);
  const hopCap = B.mulN(c.hopperCap, eff);
  const liftFaster = B.cmp(liftE, mineE) > 0;
  const speed = c.craftSpeed * eff;
  let hopper = B.clone(s.hopper);
  let used = B.clone(r.cargoUsed);
  let credits: Big = { m: 0, e: 0 };

  const tracked = new Map<ItemId, Tracked>();
  const mixIds = new Set<ItemId>();
  for (const f of c.flows) mixIds.add(f.item);
  for (const f of c.constFlows) mixIds.add(f.item);
  const track = (id: ItemId): Tracked => {
    let t = tracked.get(id);
    if (t) return t;
    const def = items[id];
    const k = keepOf(g, id);
    const mass = massOf(def);
    const never = k >= 1 || mass <= 0;
    t = {
      id,
      mass,
      price: def ? B.mulN(c.priceMul, def.value) : { m: 0, e: 0 },
      reserve: B.mulN(cap, k),
      never,
      fill: never || !mixIds.has(id) ? 1 : c.fill,
      have: s.inv[id] ? B.clone(s.inv[id]) : { m: 0, e: 0 },
      pos: ZERO,
      neg: ZERO,
      sigma: ZERO,
      sell: ZERO,
    };
    tracked.set(id, t);
    return t;
  };
  const atReserve = (t: Tracked): boolean => !t.never && B.cmp(t.have, B.mulN(t.reserve, 1 - TOL)) >= 0;

  let left = span;
  const flowJobs: FlowJob[] = [];
  const moduleJobs: { job: CraftJob; info: RecipeInfo }[] = [];

  while (left > 1e-6) {
    // out of budget: one last segment, with every stock treated as empty so nothing can overdraw
    const last = ctx.budget <= reserveSegments + 1;
    ctx.budget--;

    // ----- inflows
    for (const t of tracked.values()) {
      t.pos = ZERO;
      t.neg = ZERO;
    }
    let tHop = Infinity;
    let lifted = liftE;
    let draining = false;
    if (liftFaster) {
      if (hopper.m > 0 && !last) {
        draining = true;
        tHop = secondsTo(hopper, B.sub(liftE, mineE));
      } else lifted = mineE;
    }
    for (const f of c.flows) {
      const t = track(f.item);
      t.pos = B.add(t.pos, B.mulN(lifted, f.share));
    }
    for (const f of c.constFlows) {
      const t = track(f.item);
      t.pos = B.add(t.pos, B.mulN(f.rate, eff));
    }

    // ----- crafting as continuous flows, stations in tier order so intermediates feed the next one
    flowJobs.length = 0;
    moduleJobs.length = 0;
    if (speed > 0) {
      for (const station of STATIONS) {
        const slots = r.craftSlots[station];
        if (slots <= 0 || deckBlocked(g, station)) continue;
        const queue = s.craft[station].queue;
        let running = 0;
        for (let i = 0; i < queue.length && running < slots; i++) {
          const job = queue[i];
          const info = c.recipes.get(job.recipe);
          if (!info) continue;
          const time = info.def.time > 0 ? info.def.time : 1;
          if (info.isModule) {
            let ready = true;
            for (const input of info.inputs) if (B.cmp(track(input.item).have, input.big) < 0) ready = false;
            if (ready) {
              moduleJobs.push({ job, info });
              running++;
            }
            continue;
          }
          const batch = r.craftBatch[station];
          const tau = time / speed;
          let rate = B.divN(batch, tau);
          for (const input of info.inputs) {
            const t = track(input.item);
            if (last || B.cmp(t.have, input.big) < 0) {
              const avail = B.sub(B.mulN(t.pos, t.fill), t.neg);
              rate = avail.m > 0 ? B.min(rate, B.divN(avail, input.n)) : { m: 0, e: 0 };
            }
            // a batch can never use more than the reserve holds
            if (!t.never) rate = B.min(rate, B.divN(t.reserve, input.n * tau));
          }
          if (!(rate.m > 0)) continue;
          for (const input of info.inputs) {
            const t = track(input.item);
            t.neg = B.add(t.neg, B.mulN(rate, input.n));
          }
          for (const out of info.outputs) {
            const t = track(out.item);
            t.pos = B.add(t.pos, B.mulN(rate, out.n));
          }
          if (info.def.byproducts) {
            for (const by of info.def.byproducts) {
              const t = track(by.item);
              t.pos = B.add(t.pos, B.mulN(rate, by.amount * by.chance));
            }
          }
          flowJobs.push({ job, info, rate, batch });
          running++;
        }
      }
    }

    // ----- per item: what is stored, what is sold
    const free = B.subClamp(cap, used);
    const full = B.cmp(free, B.mulN(cap, TOL)) <= 0;
    let gainMass: Big = { m: 0, e: 0 };
    let drainMass: Big = { m: 0, e: 0 };
    for (const t of tracked.values()) {
      const storable = B.mulN(t.pos, t.fill);
      const direct = B.sub(t.pos, storable);
      const net = B.sub(storable, t.neg);
      if (t.mass <= 0) {
        t.sigma = B.sub(t.pos, t.neg);
        t.sell = ZERO;
        continue;
      }
      if (net.m >= 0 && atReserve(t)) {
        t.sigma = ZERO;
        t.sell = B.sub(t.pos, t.neg);
      } else if (net.m < 0 && !(t.have.m > 0)) {
        t.sigma = ZERO;
        t.sell = direct;
      } else {
        t.sigma = net;
        t.sell = direct;
      }
      if (t.sigma.m > 0) gainMass = B.add(gainMass, B.mulN(t.sigma, t.mass));
      else if (t.sigma.m < 0) drainMass = B.add(drainMass, B.mulN(t.sigma, -t.mass));
    }
    let cargoRate = B.sub(gainMass, drainMass);
    if (full && cargoRate.m > 0) {
      // a full hold only takes what crafting frees up; the rest goes to the broker
      const phi = B.ratio(drainMass, gainMass);
      for (const t of tracked.values()) {
        if (t.mass <= 0 || !(t.sigma.m > 0)) continue;
        t.sell = B.add(t.sell, B.mulN(t.sigma, 1 - phi));
        t.sigma = B.mulN(t.sigma, phi);
      }
      cargoRate = { m: 0, e: 0 };
      ctx.cargoFilled = true;
    }

    // ----- how long this holds
    let dt = left;
    if (!last) {
      if (tHop < dt) dt = tHop;
      for (const t of tracked.values()) {
        if (t.mass <= 0) continue;
        if (t.sigma.m > 0 && !t.never) dt = Math.min(dt, secondsTo(B.sub(t.reserve, t.have), t.sigma));
        else if (t.sigma.m < 0) dt = Math.min(dt, secondsTo(t.have, B.mulN(t.sigma, -1)));
      }
      if (!full && cargoRate.m > 0) dt = Math.min(dt, secondsTo(free, cargoRate));
      for (const fj of flowJobs) {
        if (fj.job.left <= 0) continue;
        const batchesLeft = fj.job.left - (ctx.done.get(fj.job) ?? 0);
        dt = Math.min(dt, secondsTo(B.mulN(fj.batch, Math.max(0, batchesLeft)), fj.rate));
      }
      if (!(dt > 1e-6)) dt = Math.min(left, 1e-6);
    }

    // ----- advance
    for (const t of tracked.values()) {
      if (t.sell.m > 0) credits = B.add(credits, B.mulN(B.mul(t.sell, t.price), dt));
      if (t.sigma.m === 0) continue;
      let have = B.add(t.have, B.mulN(t.sigma, dt));
      if (t.sigma.m > 0 && !t.never && t.mass > 0 && B.cmp(have, B.mulN(t.reserve, 1 - TOL)) >= 0) {
        if (B.cmp(have, t.reserve) > 0) credits = B.add(credits, B.mul(B.sub(have, t.reserve), t.price));
        have = B.clone(t.reserve);
      } else if (t.sigma.m < 0 && (have.m <= 0 || B.cmp(have, B.mulN(t.have, TOL)) <= 0)) have = { m: 0, e: 0 };
      t.have = have;
    }
    used = B.add(used, B.mulN(cargoRate, dt));
    if (used.m < 0) used = { m: 0, e: 0 };
    if (B.cmp(used, B.mulN(cap, 1 - TOL)) >= 0) {
      if (B.cmp(used, cap) > 0) used = B.clone(cap);
      ctx.cargoFilled = true;
    }
    if (liftFaster) {
      if (draining) hopper = tHop <= dt ? { m: 0, e: 0 } : B.subClamp(hopper, B.mulN(B.sub(liftE, mineE), dt));
    } else {
      hopper = B.add(hopper, B.mulN(B.sub(mineE, liftE), dt));
      if (B.cmp(hopper, hopCap) > 0) hopper = B.max(B.min(hopper, s.hopper), hopCap);
    }

    for (const fj of flowJobs) {
      const batches = B.toNumber(B.div(B.mulN(fj.rate, dt), fj.batch));
      const total = (ctx.done.get(fj.job) ?? 0) + batches;
      ctx.done.set(fj.job, total);
      if (fj.job.left > 0 && total >= fj.job.left - 1e-6) finishJob(g, ctx, fj.job, fj.info);
    }
    for (const mj of moduleJobs) {
      const time = mj.info.def.time > 0 ? mj.info.def.time : 1;
      const progress = mj.job.progress + speed * dt;
      let whole = Math.floor(progress / time + 1e-9);
      if (mj.job.left > 0) whole = Math.min(whole, mj.job.left - (ctx.done.get(mj.job) ?? 0));
      whole = Math.min(whole, MODULES_PER_SEGMENT);
      for (const input of mj.info.inputs) {
        whole = Math.min(whole, Math.floor(B.toNumber(B.divN(track(input.item).have, input.n)) + 1e-9));
      }
      if (whole <= 0) {
        mj.job.progress = Math.min(progress, time);
        continue;
      }
      for (const input of mj.info.inputs) {
        const t = track(input.item);
        t.have = B.subClamp(t.have, B.big(input.n * whole));
        if (t.mass > 0) used = B.subClamp(used, B.big(input.n * whole * t.mass));
      }
      for (const out of mj.info.outputs) {
        if (!out.module) {
          const t = track(out.item);
          t.have = B.add(t.have, B.big(out.n * whole));
          continue;
        }
        for (let k = 0; k < out.n * whole; k++) {
          const q = rollQuality(g);
          g.api.addModule(out.item, q);
          stat(g, "modulesBuilt");
          if (q === 4) stat(g, "modulesPristine");
        }
      }
      mj.job.progress = Math.max(0, Math.min(progress - whole * time, time));
      ctx.done.set(mj.job, (ctx.done.get(mj.job) ?? 0) + whole);
      if (mj.job.left > 0 && (ctx.done.get(mj.job) ?? 0) >= mj.job.left) finishJob(g, ctx, mj.job, mj.info);
    }

    left -= dt;
    if (last) break;
  }

  // ----- write back
  for (const t of tracked.values()) {
    if (t.have.m > 0) s.inv[t.id] = t.have;
    else delete s.inv[t.id];
  }
  s.hopper = hopper;
  r.cargoUsed = used;
  addCredits(g, credits);
}

function countCrafts(g: Game, info: RecipeInfo, whole: number): void {
  if (whole <= 0) return;
  stat(g, "crafts", whole);
  stat(g, `craftsT${info.def.tier}`, whole);
  stat(g, `made_${info.def.id}`, whole);
}

/** A job reached its batch count: count it and free its slot for the next segment. */
function finishJob(g: Game, ctx: Ctx, job: CraftJob, info: RecipeInfo): void {
  countCrafts(g, info, job.left);
  ctx.done.delete(job);
  const queue = g.state.craft[info.def.station].queue;
  const i = queue.indexOf(job);
  if (i >= 0) queue.splice(i, 1);
}

interface Worn {
  inst: ModuleInst;
  from: number;
  rate: number;
}

/** Core `SystemDef.offline`: production, crafting, wear and bots for `seconds` at efficiency `eff`. */
export function coreOffline(g: Game, seconds: number, eff: number, report: OfflineReport): void {
  const s = g.state;
  const c = cc(g);
  c.report = report;
  resetActive(g, false);
  if (!(seconds > 0)) return;
  const e = Math.max(0, Math.min(1, Number.isFinite(eff) ? eff : 0));

  if (c.rev !== g.rev || c.dirty) recomputeRates(g, c);
  sweepCargo(g, c);
  const creditsBefore = B.clone(s.credits);
  const rpBefore = B.clone(s.rp);
  const before: Record<ItemId, Big> = {};
  for (const id in s.inv) before[id] = B.clone(s.inv[id]);
  const hpBefore = new Map<number, number>();
  for (const inst of s.modules) hpBefore.set(inst.uid, inst.hp);

  // ----- wear timeline: every module is a straight line down to the offline floor
  const floor = bal(g, "offlineIntegrityFloor", 25);
  const factor = bal(g, "offlineWearFactor", 0.35);
  const degrade = bal(g, "degradeAt", 50);
  const worn: Worn[] = [];
  for (const inst of s.modules) {
    if (inst.slot < 0 || inst.hp <= floor || inst.hp < bal(g, "offlineAt", 20)) continue;
    const rate = wearPerSecond(g, inst) * factor;
    if (rate > 0) worn.push({ inst, from: inst.hp, rate });
  }
  const hpAt = (w: Worn, t: number): number => Math.max(floor, w.from - w.rate * t);
  // breakpoints: the 50 % threshold, then 5 % steps through the degraded band, bucketed so that a
  // big grid cannot explode the segment count
  const width = seconds / WEAR_INTERVALS;
  const buckets = new Map<number, number>();
  for (const w of worn) {
    for (let level = degrade; level >= floor; level -= 5) {
      if (w.from <= level) continue;
      const t = (w.from - level) / w.rate;
      if (!(t > 0) || t >= seconds) break;
      const b = Math.floor(t / width);
      const prev = buckets.get(b);
      if (prev === undefined || t < prev) buckets.set(b, t);
    }
  }
  const times = [0, ...Array.from(buckets.values()).sort((a, b) => a - b), seconds];

  const ctx: Ctx = { budget: MAX_SEGMENTS, done: new Map(), cargoFilled: false };
  for (let i = 0; i + 1 < times.length; i++) {
    const span = times[i + 1] - times[i];
    if (!(span > 0)) continue;
    if (worn.length > 0) {
      const mid = (times[i] + times[i + 1]) / 2;
      for (const w of worn) w.inst.hp = hpAt(w, mid);
      rebuildMods(g);
    }
    if (c.rev !== g.rev || c.dirty) recomputeRates(g, c);
    sweepCargo(g, c);
    if (g.rates.research.m > 0) s.rp = B.add(s.rp, B.mulN(g.rates.research, e * span));
    if (e > 0) runSpan(g, c, span, e, ctx, times.length - 2 - i);
  }
  for (const w of worn) w.inst.hp = hpAt(w, seconds);

  // repeat jobs and unfinished finite jobs: count the whole batches they made
  for (const [job, total] of ctx.done) {
    const info = c.recipes.get(job.recipe);
    const whole = Math.floor(total + 1e-6);
    if (!info || whole <= 0) continue;
    countCrafts(g, info, whole);
    if (job.left > 0) job.left = Math.max(1, job.left - whole);
  }

  // ----- bots keep working down their list
  let budget = botRate(g) * seconds * e;
  for (let guard = 0; budget > 0 && guard < 64; guard++) {
    let target: ModuleInst | null = null;
    for (const uid of s.repair.priority) {
      const inst = s.modules.find((m) => m.uid === uid);
      if (inst && inst.hp < 100) {
        target = inst;
        break;
      }
    }
    if (!target) for (const inst of s.modules) if (inst.slot >= 0 && inst.hp < 99 && (!target || inst.hp < target.hp)) target = inst;
    if (!target) {
      const fix = Math.min(budget, 100 - s.hull.hp);
      if (fix > 0) s.hull.hp += fix;
      break;
    }
    const fix = Math.min(budget, 100 - target.hp);
    target.hp += fix;
    budget -= fix;
  }
  s.repair.jobs.length = 0;

  megaCheck(g, c);

  // ----- report
  g.dirty = true;
  c.dirty = true;
  c.seeded = false; // the smoothed income restarts from the analytic value on return
  X.clear(c.incomeAcc);
  sweepCargo(g, c);
  report.credits = B.add(report.credits, B.subClamp(s.credits, creditsBefore));
  report.rp = B.add(report.rp, B.subClamp(s.rp, rpBefore));
  for (const id in s.inv) {
    const gain = before[id] ? B.sub(s.inv[id], before[id]) : B.clone(s.inv[id]);
    if (B.gteN(gain, 0.5)) report.items[id] = report.items[id] ? B.add(report.items[id], gain) : gain;
  }
  let degraded = false;
  for (const inst of s.modules) {
    const from = hpBefore.get(inst.uid);
    if (from === undefined) continue;
    if (from - inst.hp >= 0.01) report.wear.push({ uid: inst.uid, from, to: inst.hp });
    if (inst.slot >= 0 && inst.hp < degrade && from >= degrade) degraded = true;
  }
  if (ctx.cargoFilled) {
    report.hooks.push({
      kind: "cargoFull",
      text: {
        cs: "Nákladový prostor je plný až po strop. Něco prodej, nebo ho rozšiř.",
        en: "The hold is full to the brim. Sell something or build a bigger one.",
      },
    });
  }
  if (degraded) {
    report.hooks.push({
      kind: "repair",
      text: {
        cs: "Některé moduly klesly pod polovinu integrity. Francouzák by jim udělal radost.",
        en: "Some modules wore down below half integrity. They would appreciate a wrench.",
      },
    });
  }
}

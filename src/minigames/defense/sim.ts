// Point defense simulation. Pure data and functions (every function is a worklet so the same code
// runs on the UI thread in the app and in Node for the tests). The whole mutable state is one object
// with fixed-size pools: stepping it allocates nothing.
import type { MinigameTier } from "@/engine/types";

export const KIND_ROCK = 0;
export const KIND_BIG = 1;
export const KIND_FAST = 2;
export const KIND_CRATE = 3;

/** Pool slots are grouped by sprite so a view never has to change its artwork. */
export const SLOTS = { rock: 10, big: 3, fast: 5, crate: 3 } as const;
export const SLOT_START = [0, SLOTS.rock, SLOTS.rock + SLOTS.big, SLOTS.rock + SLOTS.big + SLOTS.fast] as const;
export const SLOT_COUNT = [SLOTS.rock, SLOTS.big, SLOTS.fast, SLOTS.crate] as const;
export const BODY_COUNT = SLOTS.rock + SLOTS.big + SLOTS.fast + SLOTS.crate;
export const PARTICLE_COUNT = 28;
export const BEAM_COUNT = 3;
export const RING_COUNT = 4;

/** Sprite radii in points at scale 1. */
export const RADIUS = [19, 30, 11, 15] as const;
const MIN_HIT_RADIUS = 24;
const HIT_SLOP = 6;

export const EV_HIT = 1;
export const EV_MISS = 2;
export const EV_CRATE_SHOT = 3;
export const EV_NO_CHARGE = 4;
export const EV_IMPACT = 5;
export const EV_CRATE_SAVED = 6;
export const EV_SPLIT = 7;
export const EV_WAVE = 8;
export const EV_CLEARED = 9;
export const EV_DEAD = 10;

export interface Spawn {
  t: number;
  kind: number;
  /** Start and aim x in points. */
  x0: number;
  tx: number;
  /** Seconds from the top edge to the hull line. */
  travel: number;
  amp: number;
  freq: number;
  ph: number;
  scale: number;
  spin: number;
}

export interface DefenseConfig {
  tier: MinigameTier;
  w: number;
  h: number;
  /** Bodies that cross this line hit the hull. */
  lineY: number;
  turretX: number;
  turretY: number;
  hullMax: number;
  /** 0 = unlimited laser. */
  chargeMax: number;
  rechargeS: number;
  spawns: Spawn[];
  /** Wave start times (tier 3), empty otherwise. */
  waves: number[];
  /** Destroyable threats, fragments included. */
  total: number;
  reduce: boolean;
  /** Test autoplay: 1 = a competent gunner. */
  bot: number;
}

export interface Body {
  on: number;
  kind: number;
  x: number;
  y: number;
  /** Base x without the curve offset. */
  bx: number;
  vx: number;
  vy: number;
  s: number;
  rot: number;
  vr: number;
  amp: number;
  freq: number;
  ph: number;
  age: number;
  frag: number;
}

export interface Particle {
  life: number;
  max: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Beam {
  life: number;
  x: number;
  y: number;
  hit: number;
}

export interface Ring {
  life: number;
  x: number;
  y: number;
}

export interface DefenseSim {
  t: number;
  next: number;
  wave: number;
  hull: number;
  shots: number;
  hits: number;
  cratesShot: number;
  kills: number;
  charge: number;
  shake: number;
  flash: number;
  /** 0 running, 1 cleared, 2 hull gone, 3 stopped from outside (timeout). */
  over: number;
  dirty: number;
  botCd: number;
  botN: number;
  /** Small deterministic stream for particle spread. */
  rs: number;
  ev: number[];
  evN: number;
  m: Body[];
  p: Particle[];
  b: Beam[];
  rings: Ring[];
  pi: number;
  bi: number;
  ri: number;
}

const EV_CAP = 12;

export function createDefenseSim(cfg: DefenseConfig): DefenseSim {
  const m: Body[] = [];
  for (let k = 0; k < 4; k++) {
    for (let i = 0; i < SLOT_COUNT[k]; i++) m.push({ on: 0, kind: k, x: 0, y: 0, bx: 0, vx: 0, vy: 0, s: 1, rot: 0, vr: 0, amp: 0, freq: 0, ph: 0, age: 0, frag: 0 });
  }
  const p: Particle[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) p.push({ life: 0, max: 1, x: 0, y: 0, vx: 0, vy: 0 });
  const b: Beam[] = [];
  for (let i = 0; i < BEAM_COUNT; i++) b.push({ life: 0, x: 0, y: 0, hit: 0 });
  const rings: Ring[] = [];
  for (let i = 0; i < RING_COUNT; i++) rings.push({ life: 0, x: 0, y: 0 });
  const ev: number[] = [];
  for (let i = 0; i < EV_CAP * 2; i++) ev.push(0);
  return {
    t: 0,
    next: 0,
    wave: 0,
    hull: cfg.hullMax,
    shots: 0,
    hits: 0,
    cratesShot: 0,
    kills: 0,
    charge: cfg.chargeMax,
    shake: 0,
    flash: 0,
    over: 0,
    dirty: 1,
    botCd: 0.6,
    botN: 0,
    rs: 0.37,
    ev,
    evN: 0,
    m,
    p,
    b,
    rings,
    pi: 0,
    bi: 0,
    ri: 0,
  };
}

function emit(s: DefenseSim, code: number, a: number): void {
  "worklet";
  if (s.evN >= EV_CAP) return;
  s.ev[s.evN * 2] = code;
  s.ev[s.evN * 2 + 1] = a;
  s.evN++;
}

function rand(s: DefenseSim): number {
  "worklet";
  s.rs = (s.rs * 9301.17 + 0.2113) % 1;
  return s.rs;
}

function burst(s: DefenseSim, cfg: DefenseConfig, x: number, y: number, count: number, speed: number): void {
  "worklet";
  const n = cfg.reduce ? Math.min(3, count) : count;
  for (let i = 0; i < n; i++) {
    const p = s.p[s.pi];
    s.pi = (s.pi + 1) % PARTICLE_COUNT;
    const a = rand(s) * 6.283;
    const v = speed * (0.45 + rand(s) * 0.75);
    p.x = x;
    p.y = y;
    p.vx = Math.cos(a) * v;
    p.vy = Math.sin(a) * v - speed * 0.2;
    p.max = 0.32 + rand(s) * 0.3;
    p.life = p.max;
  }
}

function ring(s: DefenseSim, x: number, y: number): void {
  "worklet";
  const r = s.rings[s.ri];
  s.ri = (s.ri + 1) % RING_COUNT;
  r.x = x;
  r.y = y;
  r.life = 1;
}

function freeSlot(s: DefenseSim, kind: number): number {
  "worklet";
  const from = SLOT_START[kind];
  const to = from + SLOT_COUNT[kind];
  for (let i = from; i < to; i++) if (s.m[i].on === 0) return i;
  return -1;
}

function spawn(s: DefenseSim, cfg: DefenseConfig, sp: Spawn): boolean {
  "worklet";
  const i = freeSlot(s, sp.kind);
  if (i < 0) return false;
  const m = s.m[i];
  const r = RADIUS[sp.kind] * sp.scale;
  m.on = 1;
  m.kind = sp.kind;
  m.bx = sp.x0;
  m.x = sp.x0;
  m.y = -r;
  m.vy = (cfg.lineY + r) / sp.travel;
  m.vx = (sp.tx - sp.x0) / sp.travel;
  m.s = sp.scale;
  m.rot = sp.kind === KIND_FAST ? Math.atan2(m.vy, m.vx) : sp.ph;
  m.vr = sp.kind === KIND_FAST ? 0 : sp.spin;
  m.amp = sp.amp;
  m.freq = sp.freq;
  m.ph = sp.ph;
  m.age = 0;
  m.frag = 0;
  return true;
}

function fragment(s: DefenseSim, cfg: DefenseConfig, parent: Body, dir: number): void {
  "worklet";
  const i = freeSlot(s, KIND_ROCK);
  if (i < 0) return;
  const m = s.m[i];
  m.on = 1;
  m.kind = KIND_ROCK;
  m.bx = parent.x + dir * 12;
  m.x = m.bx;
  m.y = parent.y - 4;
  m.vx = dir * cfg.w * 0.2;
  m.vy = parent.vy * 1.12;
  m.s = 0.74;
  m.rot = parent.rot + dir;
  m.vr = dir * 2.4;
  m.amp = 0;
  m.freq = 0;
  m.ph = 0;
  m.age = 0;
  m.frag = 1;
}

/** One laser shot at field coordinates (x, y). Shared by the finger and the test bot. */
export function tapDefense(s: DefenseSim, cfg: DefenseConfig, x: number, y: number): void {
  "worklet";
  if (s.over !== 0) return;
  if (cfg.chargeMax > 0) {
    if (s.charge < 1) {
      emit(s, EV_NO_CHARGE, 0);
      return;
    }
    s.charge -= 1;
  }
  s.shots++;
  s.dirty = 1;

  // Nearest threat under the finger wins; a crate is only hit when no threat is in reach.
  let best = -1;
  let bestD = 1e9;
  let crate = -1;
  let crateD = 1e9;
  for (let i = 0; i < BODY_COUNT; i++) {
    const m = s.m[i];
    if (m.on === 0) continue;
    const dx = m.x - x;
    const dy = m.y - y;
    const d2 = dx * dx + dy * dy;
    const reach = Math.max(RADIUS[m.kind] * m.s, MIN_HIT_RADIUS) + HIT_SLOP;
    if (d2 > reach * reach) continue;
    if (m.kind === KIND_CRATE) {
      if (d2 < crateD) {
        crateD = d2;
        crate = i;
      }
    } else if (d2 < bestD) {
      bestD = d2;
      best = i;
    }
  }
  const target = best >= 0 ? best : crate;

  const beam = s.b[s.bi];
  s.bi = (s.bi + 1) % BEAM_COUNT;
  beam.life = 1;
  beam.hit = target >= 0 ? 1 : 0;
  beam.x = target >= 0 ? s.m[target].x : x;
  beam.y = target >= 0 ? s.m[target].y : y;

  if (target < 0) {
    burst(s, cfg, x, y, 2, 40);
    emit(s, EV_MISS, 0);
    return;
  }
  const m = s.m[target];
  m.on = 0;
  ring(s, m.x, m.y);
  if (m.kind === KIND_CRATE) {
    s.cratesShot++;
    burst(s, cfg, m.x, m.y, 5, 70);
    emit(s, EV_CRATE_SHOT, s.cratesShot);
    return;
  }
  s.hits++;
  s.kills++;
  if (m.kind === KIND_BIG) {
    fragment(s, cfg, m, -1);
    fragment(s, cfg, m, 1);
    burst(s, cfg, m.x, m.y, 8, 120);
    emit(s, EV_SPLIT, s.kills);
  } else {
    burst(s, cfg, m.x, m.y, m.kind === KIND_FAST ? 5 : 7, 110);
    emit(s, EV_HIT, s.kills);
  }
}

function runBot(s: DefenseSim, cfg: DefenseConfig, dt: number): void {
  "worklet";
  s.botCd -= dt;
  if (s.botCd > 0) return;
  if (cfg.chargeMax > 0 && s.charge < 1) return;
  let pick = -1;
  let low = -1;
  for (let i = 0; i < BODY_COUNT; i++) {
    const m = s.m[i];
    if (m.on === 0 || m.kind === KIND_CRATE) continue;
    const gate = m.kind === KIND_FAST ? 0.12 : 0.3;
    if (m.y < cfg.lineY * gate) continue;
    if (m.y > low) {
      low = m.y;
      pick = i;
    }
  }
  if (pick < 0) return;
  s.botN++;
  s.botCd = 0.26;
  const m = s.m[pick];
  // Every seventh shot goes wide, like a real thumb (but never into a crate).
  const wideX = m.x > cfg.w / 2 ? m.x - 70 : m.x + 70;
  const wideY = Math.max(8, m.y - 30);
  let wide = s.botN % 7 === 0 ? 1 : 0;
  for (let i = 0; i < BODY_COUNT && wide === 1; i++) {
    const o = s.m[i];
    if (o.on === 1 && Math.abs(o.x - wideX) < 70 && Math.abs(o.y - wideY) < 70) wide = 0;
  }
  if (wide === 1) tapDefense(s, cfg, wideX, wideY);
  else tapDefense(s, cfg, m.x, m.y);
}

export function stepDefense(s: DefenseSim, cfg: DefenseConfig, dt: number): void {
  "worklet";
  const running = s.over === 0;
  if (running) {
    s.t += dt;
    if (cfg.chargeMax > 0 && s.charge < cfg.chargeMax) s.charge = Math.min(cfg.chargeMax, s.charge + dt / cfg.rechargeS);
    while (s.wave < cfg.waves.length && s.t >= cfg.waves[s.wave]) {
      s.wave++;
      emit(s, EV_WAVE, s.wave);
    }
    while (s.next < cfg.spawns.length && cfg.spawns[s.next].t <= s.t) {
      if (!spawn(s, cfg, cfg.spawns[s.next])) break;
      s.next++;
    }
  }

  let alive = 0;
  for (let i = 0; i < BODY_COUNT; i++) {
    const m = s.m[i];
    if (m.on === 0) continue;
    m.age += dt;
    m.bx += m.vx * dt;
    m.y += m.vy * dt;
    if (m.frag === 1) m.vx *= Math.max(0, 1 - 2.6 * dt);
    const r = RADIUS[m.kind] * m.s;
    let x = m.bx + (m.amp !== 0 ? m.amp * Math.sin(m.freq * m.age + m.ph) - m.amp * Math.sin(m.ph) : 0);
    if (x < r) x = r;
    else if (x > cfg.w - r) x = cfg.w - r;
    m.x = x;
    m.rot += m.vr * dt;
    if (m.y >= cfg.lineY) {
      m.on = 0;
      if (!running) continue;
      if (m.kind === KIND_CRATE) {
        emit(s, EV_CRATE_SAVED, 0);
        continue;
      }
      s.hull = Math.max(0, s.hull - (m.kind === KIND_BIG ? 2 : 1));
      s.dirty = 1;
      s.flash = 1;
      if (!cfg.reduce) s.shake = 1;
      burst(s, cfg, m.x, cfg.lineY, 6, 90);
      emit(s, EV_IMPACT, s.hull);
      if (s.hull <= 0) {
        s.over = 2;
        emit(s, EV_DEAD, 0);
      }
      continue;
    }
    alive++;
  }

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p = s.p[i];
    if (p.life <= 0) continue;
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 160 * dt;
  }
  for (let i = 0; i < BEAM_COUNT; i++) if (s.b[i].life > 0) s.b[i].life -= dt * 7;
  for (let i = 0; i < RING_COUNT; i++) if (s.rings[i].life > 0) s.rings[i].life -= dt * 3.2;
  if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 3.5);
  if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 2.6);

  if (s.over === 0) {
    if (cfg.bot === 1) runBot(s, cfg, dt);
    if (s.next >= cfg.spawns.length && alive === 0) {
      s.over = 1;
      emit(s, EV_CLEARED, 0);
    }
  }
}

function pickWeighted(rnd: () => number, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += w;
  let roll = rnd() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll < 0) return i;
  }
  return 0;
}

const TRAVEL: Record<MinigameTier, readonly [number, number][]> = {
  // [min, max] seconds for rock, big, fast, crate.
  1: [
    [5.2, 6.4],
    [7.2, 7.8],
    [3, 3.4],
    [6, 6.4],
  ],
  2: [
    [4.5, 5.6],
    [6.2, 6.8],
    [2.3, 2.8],
    [5.4, 5.9],
  ],
  3: [
    [4.3, 5.3],
    [5.8, 6.3],
    [2.2, 2.6],
    [5.2, 5.6],
  ],
};

export const DEFENSE_SECONDS: [number, number, number] = [45, 60, 75];

/**
 * Deterministic layout: every meteor of the run is decided here from the seed.
 *   tier 1: slow rocks, a few boulders that split;
 *   tier 2: denser, plus fast streaks and salvage crates that must not be shot;
 *   tier 3: five waves on curved paths, and the laser holds only a few charges.
 */
export function buildDefense(tier: MinigameTier, rnd: () => number, w: number, h: number, reduce: boolean, bot: number): DefenseConfig {
  const lineY = h - 52;
  const spawns: Spawn[] = [];
  const waves: number[] = [];
  const margin = 26;

  const add = (t: number, kind: number, curved: boolean) => {
    const range = TRAVEL[tier][kind];
    const x0 = margin + rnd() * (w - margin * 2);
    // Everything is aimed at the ship, give or take.
    const tx = w / 2 + (rnd() - 0.5) * w * 0.56;
    const amp = curved && kind !== KIND_FAST ? w * (0.07 + rnd() * 0.08) * (rnd() < 0.5 ? -1 : 1) : 0;
    spawns.push({
      t,
      kind,
      x0,
      tx,
      travel: range[0] + rnd() * (range[1] - range[0]),
      amp,
      freq: 1.4 + rnd() * 1.1,
      ph: rnd() * 6.283,
      scale: kind === KIND_ROCK ? 0.88 + rnd() * 0.3 : kind === KIND_BIG ? 0.94 + rnd() * 0.12 : 1,
      spin: (rnd() - 0.5) * (kind === KIND_CRATE ? 1.2 : 2.4),
    });
  };

  if (tier === 1) {
    let t = 1;
    let bigs = 0;
    for (let i = 0; i < 20; i++) {
      const big = i > 2 && bigs < 4 && rnd() < 0.24;
      if (big) bigs++;
      add(t, big ? KIND_BIG : KIND_ROCK, false);
      t += 1.45 + rnd() * 0.6 + (big ? 0.5 : 0);
    }
  } else if (tier === 2) {
    let t = 1;
    let lastKind = KIND_ROCK;
    let bigs = 0;
    for (let i = 0; i < 40; i++) {
      let kind = i < 2 ? KIND_ROCK : pickWeighted(rnd, [0.46, bigs < 5 ? 0.13 : 0, 0.24, lastKind === KIND_CRATE ? 0 : 0.17]);
      // The first crate arrives early so the rule is learned before it matters.
      if (i === 3) kind = KIND_CRATE;
      if (kind === KIND_BIG) bigs++;
      add(t, kind, false);
      lastKind = kind;
      t += 0.95 + rnd() * 0.55 + (kind === KIND_BIG ? 0.35 : 0);
    }
  } else {
    for (let k = 0; k < 5; k++) {
      const start = 1.5 + k * 13;
      waves.push(start);
      const count = 8 + Math.floor(k / 2);
      const crateAt = 1 + Math.floor(rnd() * (count - 2));
      const bigAt = (crateAt + 2 + Math.floor(rnd() * (count - 3))) % count;
      for (let i = 0; i < count; i++) {
        const kind = i === crateAt ? KIND_CRATE : i === bigAt ? KIND_BIG : rnd() < 0.3 ? KIND_FAST : KIND_ROCK;
        add(start + (i / count) * 6.2 + rnd() * 0.3, kind, true);
      }
    }
  }
  if (tier < 3) {
    // Stretch the schedule so the last meteor lands a few seconds before the clock runs out.
    const last = spawns[spawns.length - 1].t;
    const target = DEFENSE_SECONDS[tier - 1] - 2.5 - TRAVEL[tier][KIND_BIG][1];
    for (const sp of spawns) sp.t = 1 + ((sp.t - 1) * (target - 1)) / (last - 1);
  }
  spawns.sort((a, b) => a.t - b.t);

  let total = 0;
  for (const sp of spawns) total += sp.kind === KIND_CRATE ? 0 : sp.kind === KIND_BIG ? 3 : 1;

  return {
    tier,
    w,
    h,
    lineY,
    turretX: w / 2,
    turretY: h - 34,
    hullMax: 6,
    chargeMax: tier === 3 ? 5 : 0,
    rechargeS: 0.6,
    spawns,
    waves,
    total,
    reduce,
    bot,
  };
}

export interface DefenseOutcome {
  hull: number;
  hullMax: number;
  shots: number;
  hits: number;
  cratesShot: number;
  /** Share of the run survived, 0..1 (only matters when the hull is gone). */
  progress: number;
}

/**
 * 0..1. A ship that still has hull scores 0.5..1: half from the hull that is left, half from
 * accuracy (hits per shot, where 50 % is worth nothing and 100 % everything; shooting a crate is a
 * miss and costs extra). A perfect needs a clean hull and nine shots out of ten on target. A
 * destroyed ship stays below 0.5.
 */
export function defenseScore(o: DefenseOutcome): number {
  const acc = o.shots > 0 ? o.hits / o.shots : 0;
  if (o.hull <= 0) return Math.min(0.45, 0.06 + 0.3 * o.progress * (0.5 + 0.5 * acc));
  const accQ = Math.max(0, Math.min(1, (acc - 0.5) / 0.5));
  const score = 0.5 + 0.25 * (o.hull / o.hullMax) + 0.25 * accQ - 0.04 * o.cratesShot;
  return Math.max(0.5, Math.min(1, score));
}

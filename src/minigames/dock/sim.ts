// Docking simulation. Pure data and worklet functions: the same code runs on the UI thread in the app
// and in Node for the tests. All mutable state is one object with fixed pools, so a step allocates
// nothing.
//
// Geometry: the station is a disc whose centre lies above the field; only its lower cap is visible.
// The port sits on the rim at angle `phi` (0 = straight down, positive = towards +x) and swings with
// the station in tiers 2 and 3. The tug's rotation `th` is clockwise from "up"; a tug that points
// straight into the port has th = -phi.
import type { MinigameTier } from "@/engine/types";

export const KEY_NONE = 0;
export const KEY_LEFT = 1;
export const KEY_BRAKE = 2;
export const KEY_MAIN = 3;
export const KEY_RIGHT = 4;

export const EV_THRUST = 1;
export const EV_BUMP = 2;
export const EV_DOCK = 3;
export const EV_CRASH = 4;
export const EV_DEAD = 5;
export const EV_FUEL_OUT = 6;
export const EV_ALIGNED = 7;

export const STATE_FLYING = 0;
export const STATE_DOCKED = 1;
export const STATE_LOST = 2;
export const STATE_STOPPED = 3;

export const PUFF_COUNT = 14;
export const DUST_COUNT = 10;
export const MAX_DEBRIS = 3;
/** Distance from the tug's centre to its docking probe, and its collision radius. */
export const NOSE = 20;
export const TUG_R = 14;
/** How far the port collar sticks out of the hull. */
export const COLLAR = 10;
/** Debris leaves the field by this much before it wraps to the other side. */
export const DEBRIS_MARGIN = 26;

const LEAN_K = 1.5;
const LEAN_SPRING = 9;
const LEAN_DAMP = 4.5;
const CRASH_FACTOR = 1.8;
const EV_CAP = 8;

export interface DebrisSpec {
  x: number;
  y: number;
  vx: number;
  r: number;
  spin: number;
}

export interface DockConfig {
  tier: MinigameTier;
  w: number;
  h: number;
  cx: number;
  cy: number;
  r: number;
  phi0: number;
  phiAmp: number;
  phiW: number;
  phiPh: number;
  startX: number;
  startY: number;
  startVx: number;
  aMain: number;
  aBrake: number;
  aSide: number;
  dampX: number;
  dampY: number;
  /** Constant sideways acceleration (tiers 2 and 3). */
  drift: number;
  /** Highest closing speed for a soft contact, points per second. */
  vLimit: number;
  /** Points per second shown as 1 on the LCD. */
  unit: number;
  limitUnits: number;
  tolU: number;
  tolA: number;
  fuelLimited: boolean;
  burnMain: number;
  burnBrake: number;
  burnSide: number;
  hullMax: number;
  debris: DebrisSpec[];
  reduce: boolean;
  /** Test autoplay: 1 = a careful pilot, 2 = full throttle into the station. */
  bot: number;
}

export interface Puff {
  life: number;
  max: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Debris {
  on: number;
  x: number;
  y: number;
  vx: number;
  r: number;
  rot: number;
  spin: number;
}

export interface Dust {
  x: number;
  y: number;
  k: number;
}

export interface DockSim {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  th: number;
  om: number;
  /** Fuel left 0..100 and fuel burned so far (also tracked when fuel is unlimited). */
  fuel: number;
  used: number;
  hull: number;
  bumps: number;
  phi: number;
  /** Effective key this frame (finger or bot, 0 when the tank is dry). */
  key: number;
  /** Radial distance from the probe to the collar, lateral offset along the rim, angle error. */
  gap: number;
  gap0: number;
  minGap: number;
  u: number;
  da: number;
  /** Closing speed and sideways speed relative to the port, points per second. */
  closing: number;
  lat: number;
  aligned: number;
  state: number;
  /** Seconds since the game ended (drives the clamp animation). */
  endT: number;
  inv: number;
  shake: number;
  flash: number;
  /** Values at the moment of a successful contact. */
  cu: number;
  cda: number;
  cspeed: number;
  thrustAcc: number;
  puffAcc: number;
  lcdAcc: number;
  dirty: number;
  fuelOut: number;
  rs: number;
  ev: number[];
  evN: number;
  puffs: Puff[];
  pi: number;
  debris: Debris[];
  dust: Dust[];
}

function emit(s: DockSim, code: number, a: number): void {
  "worklet";
  if (s.evN >= EV_CAP) return;
  s.ev[s.evN * 2] = code;
  s.ev[s.evN * 2 + 1] = a;
  s.evN++;
}

function rand(s: DockSim): number {
  "worklet";
  s.rs = (s.rs * 9301.17 + 0.2113) % 1;
  return s.rs;
}

/** Refreshes gap, lateral offset, angle error and relative speeds from the current pose. */
function measure(s: DockSim, cfg: DockConfig, phiV: number): void {
  "worklet";
  const nx = s.x + Math.sin(s.th) * NOSE;
  const ny = s.y - Math.cos(s.th) * NOSE;
  const dx = nx - cfg.cx;
  const dy = ny - cfg.cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const alpha = Math.atan2(dx, dy);
  const rc = cfg.r + COLLAR;
  s.u = (alpha - s.phi) * rc;
  // Outside the collar the probe meets the bare hull, which sits a little deeper.
  const onCollar = Math.abs(s.u) <= cfg.tolU + 7;
  s.gap = dist - (onCollar ? rc : cfg.r + 2);
  s.da = s.th + s.phi;
  const rx = dx / dist;
  const ry = dy / dist;
  const pvx = phiV * rc * Math.cos(s.phi);
  const pvy = -phiV * rc * Math.sin(s.phi);
  const rvx = s.vx - pvx;
  const rvy = s.vy - pvy;
  s.closing = -(rvx * rx + rvy * ry);
  s.lat = rvx * Math.cos(alpha) - rvy * Math.sin(alpha);
  const aligned = Math.abs(s.u) <= cfg.tolU && Math.abs(s.da) <= cfg.tolA ? 1 : 0;
  if (aligned === 1 && s.aligned === 0 && s.state === STATE_FLYING) emit(s, EV_ALIGNED, 0);
  s.aligned = aligned;
}

export function createDockSim(cfg: DockConfig): DockSim {
  const puffs: Puff[] = [];
  for (let i = 0; i < PUFF_COUNT; i++) puffs.push({ life: 0, max: 1, x: 0, y: 0, vx: 0, vy: 0 });
  const debris: Debris[] = [];
  for (let i = 0; i < MAX_DEBRIS; i++) {
    const d = cfg.debris[i];
    debris.push(d ? { on: 1, x: d.x, y: d.y, vx: d.vx, r: d.r, rot: i * 1.3, spin: d.spin } : { on: 0, x: -100, y: -100, vx: 0, r: 0, rot: 0, spin: 0 });
  }
  const dust: Dust[] = [];
  for (let i = 0; i < DUST_COUNT; i++) dust.push({ x: ((i * 0.618 + 0.13) % 1) * cfg.w, y: ((i * 0.381 + 0.29) % 1) * cfg.h, k: 0.6 + ((i * 0.27) % 1) * 0.8 });
  const ev: number[] = [];
  for (let i = 0; i < EV_CAP * 2; i++) ev.push(0);
  const s: DockSim = {
    t: 0,
    x: cfg.startX,
    y: cfg.startY,
    vx: cfg.startVx,
    vy: 0,
    th: 0,
    om: 0,
    fuel: 100,
    used: 0,
    hull: cfg.hullMax,
    bumps: 0,
    phi: cfg.phi0 + cfg.phiAmp * Math.sin(cfg.phiPh),
    key: 0,
    gap: 0,
    gap0: 1,
    minGap: 0,
    u: 0,
    da: 0,
    closing: 0,
    lat: 0,
    aligned: 0,
    state: STATE_FLYING,
    endT: 0,
    inv: 0,
    shake: 0,
    flash: 0,
    cu: 0,
    cda: 0,
    cspeed: 0,
    thrustAcc: 0,
    puffAcc: 0,
    lcdAcc: 1,
    dirty: 1,
    fuelOut: 0,
    rs: 0.61,
    ev,
    evN: 0,
    puffs,
    pi: 0,
    debris,
    dust,
  };
  measure(s, cfg, 0);
  s.evN = 0;
  s.gap0 = Math.max(1, s.gap);
  s.minGap = s.gap;
  return s;
}

function puff(s: DockSim, x: number, y: number, vx: number, vy: number): void {
  "worklet";
  const p = s.puffs[s.pi];
  s.pi = (s.pi + 1) % PUFF_COUNT;
  p.x = x;
  p.y = y;
  p.vx = vx + (rand(s) - 0.5) * 16;
  p.vy = vy + (rand(s) - 0.5) * 16;
  p.max = 0.34 + rand(s) * 0.2;
  p.life = p.max;
}

function bump(s: DockSim, cfg: DockConfig, nx: number, ny: number, speed: number): void {
  "worklet";
  // Push the tug away along (nx, ny) and take a point of hull.
  const out = Math.max(cfg.vLimit * 0.55, speed * 0.5);
  const vn = s.vx * nx + s.vy * ny;
  s.vx += (out - vn) * nx;
  s.vy += (out - vn) * ny;
  s.om += (rand(s) - 0.5) * 2.4;
  s.inv = 0.7;
  s.flash = 1;
  if (!cfg.reduce) s.shake = 1;
  s.hull -= 1;
  s.bumps += 1;
  s.dirty = 1;
  emit(s, EV_BUMP, s.hull);
  if (s.hull <= 0) {
    s.state = STATE_LOST;
    emit(s, EV_DEAD, 0);
  }
}

/** Wrap distance of the debris stream: a piece that leaves one side re-enters on the other. */
function debrisSpan(cfg: DockConfig): number {
  "worklet";
  return cfg.w + 2 * DEBRIS_MARGIN;
}

/** The autopilot presses one key at a time, like a thumb. */
function botKey(s: DockSim, cfg: DockConfig): number {
  "worklet";
  if (cfg.bot === 2) return KEY_MAIN;
  const lim = cfg.vLimit;

  // Sideways: chase the port (relative speed, so a swinging station is tracked too).
  let wantLat = -s.u * 1.7;
  const latCap = lim * 1.6;
  if (wantLat > latCap) wantLat = latCap;
  else if (wantLat < -latCap) wantLat = -latCap;
  const errLat = s.lat - wantLat;

  // Forward: wait at a standoff until the port will face the tug on arrival, then commit.
  const standoff = Math.max(26, cfg.h * 0.1);
  const eta = Math.min(4, s.gap / (lim * 0.6));
  const phiThen = cfg.phi0 + cfg.phiAmp * Math.sin(cfg.phiW * (s.t + eta) + cfg.phiPh);
  const go = Math.abs(phiThen) < cfg.tolA * 0.5 && Math.abs(s.u) < cfg.tolU * 0.7 && Math.abs(s.th) < cfg.tolA * 0.4;
  let wantClose = go ? s.gap * 0.7 : (s.gap - standoff) * 0.6;
  if (wantClose > lim * 0.85) wantClose = lim * 0.85;
  if (go && wantClose < lim * 0.4) wantClose = lim * 0.4;
  if (wantClose < -lim * 0.3) wantClose = -lim * 0.3;

  // Debris lanes: cross only when the gap in the stream is wide enough, otherwise wait below.
  const span = debrisSpan(cfg);
  for (let i = 0; i < MAX_DEBRIS; i++) {
    const d = s.debris[i];
    if (d.on === 0) continue;
    const reach = d.r + TUG_R + 4;
    const ahead = s.y - d.y;
    if (ahead < -reach || ahead > reach + 60) continue;
    if (ahead <= reach) {
      // Already inside the lane: get through.
      wantClose = lim * 0.85;
      continue;
    }
    const tIn = (ahead - reach) / (lim * 0.7);
    const tOut = (ahead + reach) / (lim * 0.7);
    let blocked = 0;
    for (let k = -1; k <= 1; k++) {
      const a0 = d.x + k * span + d.vx * tIn - s.x;
      const a1 = d.x + k * span + d.vx * tOut - s.x;
      if (Math.abs(a0) < reach + 8 || Math.abs(a1) < reach + 8 || a0 * a1 < 0) blocked = 1;
    }
    if (blocked === 1) {
      const hold = (ahead - reach - 10) * 0.6;
      if (hold < wantClose) wantClose = hold < -lim * 0.3 ? -lim * 0.3 : hold;
    }
  }
  const errClose = s.closing - wantClose;

  if (errClose > lim * 0.16) return KEY_BRAKE;
  if (Math.abs(errLat) > lim * 0.22) return errLat > 0 ? KEY_LEFT : KEY_RIGHT;
  if (errClose < -lim * 0.1) return KEY_MAIN;
  if (Math.abs(errLat) > lim * 0.1 && Math.abs(s.u) > cfg.tolU * 0.3) return errLat > 0 ? KEY_LEFT : KEY_RIGHT;
  return KEY_NONE;
}

export function stepDock(s: DockSim, cfg: DockConfig, dt: number, fingerKey: number): void {
  "worklet";
  // Puffs and effects keep running after the end so the last frame does not freeze mid-air.
  for (let i = 0; i < PUFF_COUNT; i++) {
    const p = s.puffs[i];
    if (p.life <= 0) continue;
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 3.5);
  if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 2.6);
  if (s.inv > 0) s.inv -= dt;

  if (s.state === STATE_DOCKED) {
    // The clamps pull the tug onto the port axis.
    s.endT += dt;
    s.key = 0;
    const k = Math.min(1, dt * 9);
    const rc = cfg.r + COLLAR - 3;
    const tx = cfg.cx + Math.sin(s.phi) * (rc + NOSE);
    const ty = cfg.cy + Math.cos(s.phi) * (rc + NOSE);
    s.x += (tx - s.x) * k;
    s.y += (ty - s.y) * k;
    s.th += (-s.phi - s.th) * k;
    s.vx = 0;
    s.vy = 0;
    s.u *= 1 - k;
    s.da *= 1 - k;
    return;
  }
  if (s.state === STATE_STOPPED) {
    s.key = 0;
    return;
  }

  const flying = s.state === STATE_FLYING;
  if (!flying) s.endT += dt;
  s.t += dt;
  const arg = cfg.phiW * s.t + cfg.phiPh;
  s.phi = cfg.phi0 + cfg.phiAmp * Math.sin(arg);
  const phiV = cfg.phiAmp * cfg.phiW * Math.cos(arg);

  let key = flying ? (cfg.bot !== 0 ? botKey(s, cfg) : fingerKey) : KEY_NONE;
  if (key !== KEY_NONE && cfg.fuelLimited && s.fuel <= 0) {
    key = KEY_NONE;
    if (s.fuelOut === 0) {
      s.fuelOut = 1;
      emit(s, EV_FUEL_OUT, 0);
    }
  }
  s.key = key;

  let ax = flying ? cfg.drift : 0;
  let ay = 0;
  let side = 0;
  let burn = 0;
  if (key === KEY_MAIN) {
    ay = -cfg.aMain;
    burn = cfg.burnMain;
  } else if (key === KEY_BRAKE) {
    ay = cfg.aBrake;
    burn = cfg.burnBrake;
  } else if (key === KEY_LEFT) {
    ax -= cfg.aSide;
    side = -1;
    burn = cfg.burnSide;
  } else if (key === KEY_RIGHT) {
    ax += cfg.aSide;
    side = 1;
    burn = cfg.burnSide;
  }
  if (burn > 0) {
    s.used += burn * dt;
    if (cfg.fuelLimited) s.fuel = Math.max(0, s.fuel - burn * dt);
    s.thrustAcc += dt;
    if (s.thrustAcc >= 0.12) {
      s.thrustAcc = 0;
      emit(s, EV_THRUST, key);
    }
    if (!cfg.reduce) {
      s.puffAcc += dt;
      if (s.puffAcc >= 0.045) {
        s.puffAcc = 0;
        if (key === KEY_MAIN) puff(s, s.x, s.y + 22, s.vx, s.vy + 70);
        else if (key === KEY_BRAKE) puff(s, s.x + (rand(s) < 0.5 ? -9 : 9), s.y - 14, s.vx, s.vy - 60);
        else puff(s, s.x - side * 17, s.y + 2, s.vx - side * 60, s.vy);
      }
    }
  } else {
    s.thrustAcc = 0.12;
  }

  s.vx += ax * dt;
  s.vy += ay * dt;
  s.vx *= Math.max(0, 1 - cfg.dampX * dt);
  s.vy *= Math.max(0, 1 - cfg.dampY * dt);
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  // The patched side thrusters are not balanced: a strafe leans the tug, the gyro straightens it.
  s.om += (LEAN_K * side - LEAN_SPRING * s.th - LEAN_DAMP * s.om) * dt;
  s.th += s.om * dt;

  const edge = TUG_R + 4;
  if (s.x < edge) {
    s.x = edge;
    if (s.vx < 0) s.vx = 0;
  } else if (s.x > cfg.w - edge) {
    s.x = cfg.w - edge;
    if (s.vx > 0) s.vx = 0;
  }
  if (s.y > cfg.h - edge - 6) {
    s.y = cfg.h - edge - 6;
    if (s.vy > 0) s.vy = 0;
  }

  const span = debrisSpan(cfg);
  for (let i = 0; i < MAX_DEBRIS; i++) {
    const d = s.debris[i];
    if (d.on === 0) continue;
    d.x += d.vx * dt;
    d.rot += d.spin * dt;
    // The stream wraps: what leaves one side comes back on the other.
    if (d.x > cfg.w + DEBRIS_MARGIN) d.x -= span;
    else if (d.x < -DEBRIS_MARGIN) d.x += span;
    if (!flying || s.inv > 0) continue;
    const dx = s.x - d.x;
    const dy = s.y - d.y;
    const reach = d.r + TUG_R;
    const d2 = dx * dx + dy * dy;
    if (d2 < reach * reach) {
      const dist = Math.sqrt(d2) || 1;
      const rel = Math.sqrt((s.vx - d.vx) * (s.vx - d.vx) + s.vy * s.vy);
      bump(s, cfg, dx / dist, dy / dist, rel);
    }
  }

  if (cfg.drift !== 0 && !cfg.reduce) {
    const dir = cfg.drift > 0 ? 1 : -1;
    for (let i = 0; i < DUST_COUNT; i++) {
      const p = s.dust[i];
      p.x += dir * 34 * p.k * dt;
      if (p.x > cfg.w + 6) p.x = -6;
      else if (p.x < -6) p.x = cfg.w + 6;
    }
  }

  measure(s, cfg, phiV);
  if (s.state === STATE_FLYING) {
    if (s.gap < s.minGap) s.minGap = s.gap;
    if (s.gap <= 0) {
      const dx = s.x - cfg.cx;
      const dy = s.y - cfg.cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      if (s.closing > cfg.vLimit * CRASH_FACTOR) {
        s.state = STATE_LOST;
        s.hull = 0;
        s.bumps += 1;
        s.dirty = 1;
        s.flash = 1;
        if (!cfg.reduce) s.shake = 1;
        const vn = s.vx * (dx / dist) + s.vy * (dy / dist);
        s.vx += (s.closing * 0.45 - vn) * (dx / dist);
        s.vy += (s.closing * 0.45 - vn) * (dy / dist);
        s.om += s.u >= 0 ? 5 : -5;
        emit(s, EV_CRASH, 0);
      } else if (s.aligned === 1 && s.closing <= cfg.vLimit) {
        s.state = STATE_DOCKED;
        s.cu = s.u;
        s.cda = s.da;
        s.cspeed = Math.max(0, s.closing);
        s.dirty = 1;
        emit(s, EV_DOCK, 0);
      } else if (s.inv <= 0) {
        bump(s, cfg, dx / dist, dy / dist, Math.max(0, s.closing));
      } else if (s.closing > 0) {
        // Still bouncing off the last contact: just keep it outside.
        const vn = s.vx * (dx / dist) + s.vy * (dy / dist);
        s.vx -= vn * (dx / dist);
        s.vy -= vn * (dy / dist);
      }
    }
  }

  s.lcdAcc += dt;
  if (s.lcdAcc >= 0.2) {
    s.lcdAcc = 0;
    s.dirty = 1;
  }
}

/** Closing speed in LCD units (never negative). */
export function displaySpeed(s: DockSim, cfg: DockConfig): number {
  "worklet";
  return Math.max(0, Math.round(s.closing / cfg.unit));
}

export const DOCK_SECONDS: [number, number, number] = [40, 50, 60];

/**
 * Deterministic setup from the seed.
 *   tier 1: a still station, the port is off to one side;
 *   tier 2: the station swings slowly and a steady drift pushes the tug sideways;
 *   tier 3: a wider, faster swing, tighter tolerances, debris crossing the approach and a fuel tank
 *           that can run dry.
 */
export function buildDock(tier: MinigameTier, rnd: () => number, w: number, h: number, reduce: boolean, bot: number): DockConfig {
  const r = Math.max(230, w * 0.74);
  const cap = Math.max(46, Math.min(84, h * 0.2));
  const cx = w * (0.38 + rnd() * 0.24);
  const side = rnd() < 0.5 ? -1 : 1;
  const startX = Math.max(34, Math.min(w - 34, cx + side * w * (0.18 + rnd() * 0.12)));
  const startY = h - 34;
  const limitUnits = tier === 1 ? 10 : tier === 2 ? 9 : 8;
  const unit = h / 120;
  const deg = Math.PI / 180;
  const driftDir = rnd() < 0.5 ? -1 : 1;
  const phiPh = rnd() * 6.283;

  const debris: DebrisSpec[] = [];
  if (tier === 3) {
    // Lanes of debris cross the approach. They stay clear of the start and of the last stretch in
    // front of the port, and far enough apart for the tug to wait between two of them.
    const top = cap + COLLAR + NOSE + Math.max(26, h * 0.1) + 34;
    const bottom = startY - 38;
    const lanes = Math.max(1, Math.min(MAX_DEBRIS, Math.floor((bottom - top) / 72) + 1));
    for (let lane = 0; lane < lanes; lane++) {
      const dir = lane % 2 === 0 ? driftDir : -driftDir;
      debris.push({
        x: rnd() * w,
        y: lanes === 1 ? (top + bottom) / 2 : top + ((bottom - top) * lane) / (lanes - 1),
        // Tied to the speed limit so the gaps in the stream are as crossable on a small field as on
        // a tall one.
        vx: dir * limitUnits * unit * (1.3 + rnd() * 0.6),
        r: 10 + rnd() * 4,
        spin: (rnd() - 0.5) * 2,
      });
    }
  }

  return {
    tier,
    w,
    h,
    cx,
    cy: cap - r,
    r,
    phi0: 0,
    phiAmp: tier === 1 ? 0 : tier === 2 ? 7 * deg : 10 * deg,
    phiW: tier === 2 ? 6.283 / 18 : 6.283 / 14,
    phiPh,
    startX,
    startY,
    startVx: tier === 1 ? 0 : driftDir * w * 0.02,
    aMain: h * 0.13,
    aBrake: h * 0.13,
    aSide: w * 0.13,
    dampX: 0.6,
    dampY: 0.35,
    drift: tier === 1 ? 0 : driftDir * w * (tier === 2 ? 0.02 : 0.026),
    vLimit: limitUnits * unit,
    unit,
    limitUnits,
    tolU: tier === 1 ? 13 : tier === 2 ? 11 : 9.5,
    tolA: (tier === 1 ? 14 : tier === 2 ? 11 : 9) * deg,
    fuelLimited: tier === 3,
    burnMain: 8,
    burnBrake: 7,
    burnSide: 4,
    hullMax: 3,
    debris,
    reduce,
    bot,
  };
}

export interface DockOutcome {
  docked: boolean;
  /** Hit the station far above the speed limit. */
  crashed?: boolean;
  /** Contact values (only meaningful when docked). */
  u: number;
  tolU: number;
  da: number;
  tolA: number;
  speed: number;
  vLimit: number;
  /** Fuel burned, in tank percent (a full tank is 100). */
  used: number;
  /** Share of the time limit still left. */
  timeLeft: number;
  bumps: number;
  /** Closest approach as a share of the starting distance, 0..1. */
  progress: number;
}

/**
 * 0..1. A soft contact scores 0.5..1 from lateral alignment (30 %), angle (15 %), contact speed
 * (25 %), fuel (15 %) and time (15 %), minus 0.08 per bump. Anything else stays below 0.5: partial
 * credit for how close the tug got, halved for a crash.
 */
export function dockScore(o: DockOutcome): number {
  if (!o.docked) return Math.max(0.02, Math.min(0.45, (0.08 + 0.3 * o.progress - 0.04 * o.bumps) * (o.crashed ? 0.5 : 1)));
  const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const latQ = 1 - clamp(Math.abs(o.u) / o.tolU);
  const angQ = 1 - clamp(Math.abs(o.da) / o.tolA);
  const spdQ = 1 - clamp((o.speed / o.vLimit - 0.4) / 0.6);
  const fuelQ = clamp((100 - o.used) / 60);
  const timeQ = clamp(o.timeLeft / 0.55);
  const q = 0.3 * latQ + 0.15 * angQ + 0.25 * spdQ + 0.15 * fuelQ + 0.15 * timeQ;
  return Math.max(0.5, Math.min(1, 0.5 + 0.5 * q - 0.08 * o.bumps));
}

// Scene preparation shared by both renderers: layout of the low-res viewport, salvage hit-testing
// and the conversion of a ViewportScene (strings, palette keys) into plain numbers that the UI
// thread can read without parsing anything. Pure TypeScript, no Skia, no React.
import type { ViewportScene } from "../../types";
import { VIEW_PX_WIDTH } from "../../types";

import { familyRamp, pi, rampRgb } from "./palette";

export interface ViewLayout {
  /** Device pixels per internal pixel (integer). */
  k: number;
  /** Points per internal pixel. */
  scale: number;
  /** Internal resolution. Width is VIEW_PX_WIDTH or a few columns more so the integer upscale covers the view. */
  pxW: number;
  pxH: number;
  /** Offset of the upscaled image inside the view, in points (multiples of one device pixel, never positive). */
  offX: number;
  offY: number;
}

export function computeLayout(width: number, height: number, pixelRatio: number): ViewLayout {
  const pr = pixelRatio > 0 ? pixelRatio : 1;
  const devW = Math.max(1, Math.round(width * pr));
  const devH = Math.max(1, Math.round(height * pr));
  const k = Math.max(1, Math.floor(devW / VIEW_PX_WIDTH));
  const pxW = Math.ceil(devW / k);
  const pxH = Math.ceil(devH / k);
  return { k, scale: k / pr, pxW, pxH, offX: Math.floor((devW - pxW * k) / 2) / pr, offY: Math.floor((devH - pxH * k) / 2) / pr };
}

export const SALVAGE_CAP = 12;
export const DRONE_CAP = 6;
/** Tap radius around a salvage blob in internal pixels (13 px = 26 pt, so the target is 52 pt wide). */
export const SALVAGE_HIT_R = 13;

export function salvageX(x01: number, pxW: number): number {
  "worklet";
  return Math.round(12 + Math.min(1, Math.max(0, x01)) * (pxW - 24));
}
export function salvageY(y01: number, pxH: number): number {
  "worklet";
  return Math.round(14 + Math.min(1, Math.max(0, y01)) * (pxH - 28));
}

/** Nearest salvage blob under a tap given in view points, or null. */
export function hitSalvage(scene: ViewportScene, layout: ViewLayout, ptX: number, ptY: number): number | null {
  const x = (ptX - layout.offX) / layout.scale;
  const y = (ptY - layout.offY) / layout.scale;
  let best: number | null = null;
  let bestD = SALVAGE_HIT_R * SALVAGE_HIT_R;
  const n = Math.min(scene.salvage.length, SALVAGE_CAP);
  for (let i = 0; i < n; i++) {
    const s = scene.salvage[i];
    const dx = salvageX(s.x, layout.pxW) - x;
    const dy = salvageY(s.y, layout.pxH) - y;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      bestD = d;
      best = s.uid;
    }
  }
  return best;
}

export const MODES = ["cruise", "orbit", "warp", "docked"] as const;
export const SHADER_KINDS = ["rock", "gas", "ice", "lava", "ocean", "desert", "toxic", "crystal"] as const;
export const FAILURES = ["tumble", "breach", "blackout", "noFuel", "engine", "radiation", "boarding", "anomaly"] as const;
export const HAZARDS = ["heat", "cold", "radiation", "toxic", "debris", "storm"] as const;
export const SALVAGE = ["crate", "pod", "wreck", "crystal"] as const;

interface StarLook {
  /** 0 plain, 1 black hole, 2 binary, 3 protostar (matches the star shader). */
  kind: number;
  r: number;
  glow: number;
  rays: number;
  /** Far halo to core, 5 palette keys. */
  ramp: string[];
  nebula: [string, string];
}

const NEBULA_RAMPS: Record<string, string[]> = {
  violet: ["void0", "void1", "void2", "violet0", "violet1", "violet1"],
  teal: ["void0", "void1", "void1", "void2", "teal0", "teal1"],
  cobalt: ["void0", "void1", "void1", "void2", "void3", "cobalt0"],
  rust: ["void0", "void1", "void1", "void2", "rust0", "rust1"],
  green: ["void0", "void1", "void2", "teal0", "green0", "green1"],
};

const STARS: Record<string, StarLook> = {
  redDwarf: { kind: 0, r: 3.5, glow: 0.46, rays: 0.3, ramp: ["rust0", "rust1", "red1", "orange", "amber"], nebula: ["rust", "violet"] },
  yellow: { kind: 0, r: 5, glow: 0.5, rays: 0.5, ramp: ["rust0", "rust1", "orange", "yellow", "bone2"], nebula: ["violet", "teal"] },
  blueGiant: { kind: 0, r: 8, glow: 0.52, rays: 0.55, ramp: ["void3", "cobalt0", "cobalt1", "cobalt2", "bone2"], nebula: ["cobalt", "teal"] },
  whiteDwarf: { kind: 0, r: 2.5, glow: 0.5, rays: 0.7, ramp: ["void3", "steel1", "steel3", "bone1", "bone2"], nebula: ["cobalt", "violet"] },
  neutron: { kind: 0, r: 1.5, glow: 0.62, rays: 1.0, ramp: ["teal0", "teal1", "teal2", "mint", "bone2"], nebula: ["teal", "violet"] },
  binary: { kind: 2, r: 4.5, glow: 0.48, rays: 0.4, ramp: ["rust0", "rust1", "orange", "amber", "bone2"], nebula: ["violet", "rust"] },
  blackHole: { kind: 1, r: 5, glow: 0.5, rays: 0, ramp: ["rust0", "rust1", "orange", "amber", "bone2"], nebula: ["violet", "cobalt"] },
  protostar: { kind: 3, r: 5, glow: 0.5, rays: 0, ramp: ["violet0", "rust0", "rust1", "orange", "amber"], nebula: ["rust", "violet"] },
};

/** deep, dark, mid, light, accent, used when a planet arrives without a valid palette. */
const PLANET_DEFAULTS: Record<string, string[]> = {
  rock: ["void3", "steel0", "steel1", "steel2", "bone0"],
  gas: ["rust0", "rust1", "orange", "amber", "bone1"],
  ice: ["cobalt0", "cobalt1", "cobalt2", "bone1", "bone2"],
  lava: ["void2", "rust0", "rust1", "orange", "yellow"],
  ocean: ["cobalt0", "cobalt1", "green1", "bone1", "mint"],
  desert: ["rust0", "rust1", "orange", "amber", "bone1"],
  toxic: ["green0", "teal1", "green1", "lime", "yellow"],
  crystal: ["violet0", "violet1", "violet2", "violet3", "mint"],
};
const PLANET_ATMO = [0.0, 0.9, 0.5, 0.65, 1.0, 0.5, 1.0, 0.25];

/** Everything the frame loop needs from a scene, as numbers. Built on the JS thread when the scene changes. */
export interface SceneU {
  mode: number;
  seed: number;
  starKind: number;
  starR: number;
  starGlow: number;
  starRays: number;
  starRamp: number[];
  starRampIdx: number[];
  nebA: number[];
  nebB: number[];
  /** Changes when any shader input above changes. */
  skyHash: number;
  planet: number;
  pSeed: number;
  pKind: number;
  pSize: number;
  pRings: number;
  pAtmo: number;
  pRamp: number[];
  pRampIdx: number[];
  pHash: number;
  damage: number;
  thrust: number;
  mining: number;
  overdrive: number;
  tumble: number;
  powerOut: number;
  failure: number;
  hazard: number;
  station: number;
  drones: number;
  tow: number;
  charge: number;
  /** Trail colors, light to dark, as palette indexes. */
  trail: number[];
  salN: number;
  salUid: number[];
  salKind: number[];
  salX: number[];
  salY: number[];
}

function clamp01(v: number): number {
  return v > 0 ? (v < 1 ? v : 1) : 0;
}

function hashNums(list: number[]): number {
  let h = 2166136261;
  for (const v of list) h = Math.imul(h ^ Math.round(v * 255), 16777619) >>> 0;
  return h;
}

export function starLook(star: string): StarLook {
  return STARS[star] ?? STARS.yellow;
}

export function nebulaKeys(star: string, seed: number): [string[], string[]] {
  const look = starLook(star);
  const names = Object.keys(NEBULA_RAMPS);
  const a = NEBULA_RAMPS[look.nebula[0]];
  // one system in three swaps its secondary cloud color so neighbours of the same star type differ
  const b = Math.abs(seed) % 3 === 0 ? NEBULA_RAMPS[names[Math.abs(seed >> 3) % names.length]] : NEBULA_RAMPS[look.nebula[1]];
  return [a, b];
}

export function planetKeys(planet: NonNullable<ViewportScene["planet"]>): string[] {
  const kind = (SHADER_KINDS as readonly string[]).includes(planet.shader) ? planet.shader : "rock";
  const valid = Array.isArray(planet.palette) && planet.palette.length >= 5 && planet.palette.every((k) => pi(k, "void0") !== pi("void0") || k === "void0");
  return valid ? planet.palette.slice(0, 5) : PLANET_DEFAULTS[kind];
}

export function compileScene(scene: ViewportScene): SceneU {
  const look = starLook(scene.star);
  const [nebA, nebB] = nebulaKeys(scene.star, scene.systemSeed);
  const p = scene.planet;
  const pKind = p ? Math.max(0, (SHADER_KINDS as readonly string[]).indexOf(p.shader)) : 0;
  const pKeys = p ? ["void1", ...planetKeys(p)] : ["void1", ...PLANET_DEFAULTS.rock];
  const trail = familyRamp(scene.ship.trail, "orange");
  const n = Math.min(scene.salvage.length, SALVAGE_CAP);
  const salUid: number[] = [];
  const salKind: number[] = [];
  const salX: number[] = [];
  const salY: number[] = [];
  for (let i = 0; i < SALVAGE_CAP; i++) {
    const s = i < n ? scene.salvage[i] : null;
    salUid.push(s ? s.uid : 0);
    salKind.push(s ? Math.max(0, (SALVAGE as readonly string[]).indexOf(s.kind)) : 0);
    salX.push(s ? clamp01(s.x) : 0);
    salY.push(s ? clamp01(s.y) : 0);
  }
  const out: SceneU = {
    mode: Math.max(0, (MODES as readonly string[]).indexOf(scene.mode)),
    seed: ((scene.systemSeed % 997) + 997) % 997,
    starKind: look.kind,
    starR: look.r,
    starGlow: look.glow,
    starRays: look.rays,
    starRamp: rampRgb(look.ramp),
    starRampIdx: look.ramp.map((k) => pi(k)),
    nebA: rampRgb(nebA),
    nebB: rampRgb(nebB),
    skyHash: 0,
    planet: p ? 1 : 0,
    pSeed: p ? ((p.seed % 991) + 991) % 991 : 0,
    pKind,
    pSize: p ? clamp01(p.size) : 0,
    pRings: p && p.rings ? 1 : 0,
    pAtmo: PLANET_ATMO[pKind],
    pRamp: rampRgb(pKeys),
    pRampIdx: pKeys.map((k) => pi(k)),
    pHash: 0,
    damage: clamp01(scene.ship.damage),
    thrust: clamp01(scene.ship.thrust),
    mining: scene.ship.mining ? 1 : 0,
    overdrive: scene.ship.overdrive ? 1 : 0,
    tumble: scene.ship.tumble || scene.failure === "tumble" ? 1 : 0,
    powerOut: scene.ship.powerOut || scene.failure === "blackout" ? 1 : 0,
    failure: scene.failure ? (FAILURES as readonly string[]).indexOf(scene.failure) + 1 : 0,
    hazard: scene.hazard ? (HAZARDS as readonly string[]).indexOf(scene.hazard) + 1 : 0,
    station: scene.station ? 1 : 0,
    drones: Math.max(0, Math.min(DRONE_CAP, Math.floor(scene.drones))),
    tow: scene.tow ? 1 : 0,
    charge: clamp01(scene.charge),
    trail: [pi("bone2"), pi(trail[3]), pi(trail[2]), pi(trail[1]), pi(trail[0])],
    salN: n,
    salUid,
    salKind,
    salX,
    salY,
  };
  out.skyHash = hashNums([out.seed, out.starKind, out.starR, ...out.starRamp, ...out.nebA, ...out.nebB]);
  out.pHash = hashNums([out.planet, out.pSeed, out.pKind, out.pSize, out.pRings, ...out.pRamp]);
  return out;
}

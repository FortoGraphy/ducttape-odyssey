// Nav tab: transient UI state (sub-section, picked destination, the sheet stack) and read-only
// helpers that turn the engine's navigation state into what the screens print.
import { useEffect } from "react";
import { Easing, ReduceMotion, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { create } from "zustand";

import { content } from "@/content";
import * as B from "@/engine/big";
import type { Big, FeatureId, Game, HazardKind, ItemId, PlanetInfo, SystemInfo } from "@/engine/types";
import {
  coreDepth,
  fuelCap,
  fuelItems,
  isCharging,
  isLinked,
  isVisited,
  jumpCost,
  routeToCore,
  systemAt,
  type ExpeditionKind,
  type ExpeditionOutcome,
  type RouteStep,
} from "@/engine/world";
import { tr } from "@/i18n";
import { palette, type PaletteKey } from "@/ui/theme";

export type NavSection = "map" | "system" | "exp" | "codex";

export type SheetState =
  | { kind: "drive" }
  | { kind: "system"; depth: number; lane: number }
  | { kind: "planet"; id: string }
  | { kind: "expedition"; planet: string | null }
  | { kind: "rename"; key: string; fallback: string }
  | { kind: "result" };

export interface ExpeditionResult {
  outcome: ExpeditionOutcome;
  planetName: string;
  items: { item: ItemId; amount: Big }[];
  credits: Big;
  injuredName: string;
  injuredSeed: number;
}

interface NavUi {
  section: NavSection;
  setSection(section: NavSection): void;
  /** Destination chosen on the map; only valid while the ship is still where it was picked. */
  picked: { depth: number; lane: number; from: string } | null;
  pick(depth: number, lane: number, from: string): void;
  sheets: SheetState[];
  open(sheet: SheetState): void;
  push(sheet: SheetState): void;
  back(): void;
  close(): void;
  result: ExpeditionResult | null;
  setResult(result: ExpeditionResult): void;
}

export const useNavUi = create<NavUi>((set) => ({
  section: "map",
  setSection: (section) => set({ section }),
  picked: null,
  pick: (depth, lane, from) => set({ picked: { depth, lane, from } }),
  sheets: [],
  open: (sheet) => set({ sheets: [sheet] }),
  push: (sheet) => set((s) => ({ sheets: [...s.sheets, sheet] })),
  back: () => set((s) => ({ sheets: s.sheets.slice(0, -1) })),
  close: () => set({ sheets: [] }),
  result: null,
  setResult: (result) => set({ result }),
}));

// ---------- position, route, target ---------------------------------------------------

export function posKey(g: Game): string {
  const n = g.state.nav;
  return n.g + ":" + n.depth + ":" + n.lane;
}

let routeKey = "";
let routeVal: RouteStep[] = [];

/** Suggested lanes toward the core, recomputed only when the ship moves. */
export function route(g: Game): RouteStep[] {
  const key = g.state.seed + ":" + posKey(g);
  if (key !== routeKey) {
    routeKey = key;
    routeVal = routeToCore(g, 12);
  }
  return routeVal;
}

export function effectiveTarget(g: Game, picked: NavUi["picked"]): { depth: number; lane: number } | null {
  if (picked && picked.from === posKey(g)) return picked;
  const r = route(g);
  return r.length > 0 ? r[0] : null;
}

export function hazardWear(): number {
  const v = (content.balance as Record<string, unknown>).hazardWear;
  return typeof v === "number" && Number.isFinite(v) ? v : 0.15;
}

/** Why a jump into `sys` deserves a second thought: hazards meeting a weak hull or weak shields. */
export function jumpRisk(g: Game, sys: SystemInfo): { hull: boolean; shield: boolean } {
  if (sys.hazards.length === 0) return { hull: false, shield: false };
  const s = g.state;
  const degraded = (content.balance.degradeAt as number) ?? 50;
  let shields = 0;
  let weak = false;
  for (let i = 0; i < s.modules.length; i++) {
    const m = s.modules[i];
    if (m.slot < 0 || content.items[m.item]?.module?.family !== "shield") continue;
    shields++;
    if (m.hp < degraded) weak = true;
  }
  return { hull: s.hull.hp < 50, shield: weak || (shields === 0 && sys.hazards.length >= 2) };
}

export interface DriveView {
  fuel: number;
  cap: number;
  charge: number;
  charging: boolean;
  cooldown: number;
  cooldownFrac: number;
  jumping: boolean;
  failure: string;
  depth: number;
  lane: number;
  core: number;
}

export function selectDrive(g: Game): DriveView {
  const s = g.state;
  const nav = s.nav;
  const f = s.failure;
  const left = Math.max(0, nav.cooldownUntil - s.t);
  const total = Math.max(1, (content.balance.jumpCooldownSecs ?? 60) * g.mods.jumpCooldown);
  return {
    fuel: Math.round(nav.fuel * 10) / 10,
    cap: fuelCap(g),
    charge: Math.round(nav.charge * 200) / 200,
    charging: isCharging(g),
    cooldown: Math.ceil(left),
    cooldownFrac: Math.round(Math.min(1, left / total) * 50) / 50,
    jumping: nav.jump !== null,
    failure: f !== null && g.content.failures[f.kind]?.blocksJump === true ? f.kind : "",
    depth: nav.depth,
    lane: nav.lane,
    core: coreDepth(g),
  };
}

export interface TargetView {
  has: boolean;
  depth: number;
  lane: number;
  name: string;
  linked: boolean;
  cost: number;
  affordable: boolean;
  visited: boolean;
  hazards: number;
  riskHull: boolean;
  riskShield: boolean;
}

const NO_TARGET: TargetView = { has: false, depth: -1, lane: -1, name: "", linked: false, cost: 0, affordable: false, visited: false, hazards: 0, riskHull: false, riskShield: false };

export function selectTarget(g: Game, target: { depth: number; lane: number } | null): TargetView {
  if (!target) return NO_TARGET;
  const sys = systemAt(g, target.depth, target.lane);
  const cost = jumpCost(g, target.depth, target.lane);
  const risk = jumpRisk(g, sys);
  return {
    has: true,
    depth: target.depth,
    lane: target.lane,
    name: systemName(g, sys),
    linked: isLinked(g, target.depth, target.lane),
    cost: Math.round(cost * 10) / 10,
    affordable: g.state.nav.fuel >= cost - 1e-9,
    visited: isVisited(g, target.depth, target.lane),
    hazards: sys.hazards.length,
    riskHull: risk.hull,
    riskShield: risk.shield,
  };
}

export type DriveStatus = "jumping" | "failure" | "atCore" | "notLinked" | "cooldown" | "charging" | "discharged" | "noFuel" | "ready";

export function driveStatus(d: DriveView, tg: TargetView): DriveStatus {
  if (d.jumping) return "jumping";
  if (d.failure) return "failure";
  if (!tg.has) return "atCore";
  if (!tg.linked) return "notLinked";
  if (d.cooldown > 0) return "cooldown";
  if (d.charging) return "charging";
  if (d.charge < 1) return "discharged";
  if (!tg.affordable) return "noFuel";
  return "ready";
}

// ---------- fuel ----------------------------------------------------------------------

export interface RefuelPlan {
  items: { id: ItemId; units: number }[];
  gain: number;
  /** The only fuel unit on board is bigger than the gap: one is used and the rest spills. */
  spill: boolean;
  full: boolean;
}

/** What `refuel` would take from cargo right now (mirrors the engine's pouring order). */
export function refuelPlan(g: Game): RefuelPlan {
  const cap = fuelCap(g);
  let fuel = g.state.nav.fuel;
  const plan: RefuelPlan = { items: [], gain: 0, spill: false, full: fuel >= cap - 1e-9 };
  if (plan.full) return plan;
  const list = fuelItems(g);
  for (let i = 0; i < list.length; i++) {
    const have = g.state.inv[list[i].id];
    if (!have || have.m <= 0) continue;
    const units = Math.min(Math.floor(Math.min(1e9, B.toNumber(have))), Math.floor((cap - fuel) / list[i].fuel + 1e-9));
    if (units <= 0) continue;
    plan.items.push({ id: list[i].id, units });
    fuel = Math.min(cap, fuel + units * list[i].fuel);
  }
  if (plan.items.length === 0) {
    for (let i = 0; i < list.length; i++) {
      const have = g.state.inv[list[i].id];
      if (have && B.gteN(have, 1)) {
        plan.items.push({ id: list[i].id, units: 1 });
        plan.spill = true;
        fuel = cap;
        break;
      }
    }
  }
  plan.gain = fuel - g.state.nav.fuel;
  return plan;
}

// ---------- names ---------------------------------------------------------------------

export function systemName(g: Game, sys: SystemInfo): string {
  return g.state.codex["system:" + sys.id]?.name ?? sys.name;
}

export function planetName(g: Game, planet: PlanetInfo): string {
  return g.state.codex["planet:" + planet.id]?.name ?? planet.name;
}

export function biomeColors(biome: string): string[] {
  const keys = content.biomes[biome]?.palette ?? [];
  const out: string[] = [];
  for (let i = 0; i < 5; i++) out.push(palette[keys[i] as PaletteKey] ?? [palette.void3, palette.steel0, palette.steel1, palette.steel3, palette.bone0][i]);
  return out;
}

export const HAZARD_ICON: Record<HazardKind, string> = { heat: "hz_heat", cold: "hz_cold", radiation: "hz_radiation", toxic: "hz_toxic", debris: "hz_debris", storm: "hz_storm" };

// ---------- feature locks -------------------------------------------------------------

export interface UnlockHint {
  kind: "research" | "chapter" | "progress";
  name: string;
  chapter: number;
}

/** Who hands a feature out, for lock cards ("Research: Mining Probes", "Chapter 3"). */
export function unlockHint(feature: FeatureId): UnlockHint {
  for (const id in content.research) {
    if (content.research[id].feature === feature) return { kind: "research", name: tr(content.research[id].name), chapter: 0 };
  }
  for (const c of content.chapters) {
    if (c.unlocks?.includes(feature)) return { kind: "chapter", name: tr(c.title), chapter: c.id };
  }
  return { kind: "progress", name: "", chapter: 0 };
}

// ---------- expedition preview --------------------------------------------------------

/** Find chances per trip length. Mirrors the private table in engine/world/expeditions.ts. */
export const EXPEDITION_FINDS: Record<ExpeditionKind, { blueprint: number; card: number; log: number; artifact: number }> = {
  short: { blueprint: 0.06, card: 0.08, log: 0.05, artifact: 0.02 },
  medium: { blueprint: 0.18, card: 0.2, log: 0.15, artifact: 0.08 },
  long: { blueprint: 0.4, card: 0.4, log: 0.3, artifact: 0.2 },
};

// ---------- motion --------------------------------------------------------------------

/** Follows a slowly sampled engine value with a linear glide, so bars move without re-rendering per frame. */
export function useSmooth(value: number, ms = 500): SharedValue<number> {
  const sv = useSharedValue(value);
  useEffect(() => {
    sv.set(withTiming(value, { duration: ms, easing: Easing.linear, reduceMotion: ReduceMotion.Never }));
  }, [value, ms, sv]);
  return sv;
}

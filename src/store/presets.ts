// Game-state presets for preview routes, screenshots and the debug panel. They shape the state
// directly (this is a debug tool, not gameplay), then let the engine rebuild its caches.
import * as B from "@/engine/big";
import { tick } from "@/engine/kernel";
import type { DeckId, FailureKind, FeatureId, Game, Quality } from "@/engine/types";

export const PRESETS = ["fresh", "early", "mid", "late", "damaged"] as const;
export type PresetId = (typeof PRESETS)[number];

const ALL_FEATURES: FeatureId[] = [
  "crafting",
  "autoQueue",
  "grid",
  "repairBots",
  "autoMaintenance",
  "nav",
  "scan",
  "probes",
  "expeditions",
  "outposts",
  "station",
  "crew",
  "cards",
  "research",
  "drones",
  "buyMax",
  "overdrive",
  "warp",
  "hull",
  "cosmos",
  "quests",
  "weekly",
  "codex",
];

function setLevels(g: Game, levels: Partial<Record<DeckId, number>>): void {
  for (const id in levels) g.state.decks[id as DeckId].level = levels[id as DeckId] as number;
}

function giveItems(g: Game, maxTier: number, amount: number): void {
  for (const id in g.content.items) {
    const item = g.content.items[id];
    if (item.tier <= maxTier && (item.mass ?? 1) > 0) g.state.inv[id] = B.big(Math.round(amount / (item.tier + 1)));
  }
}

function addModules(g: Game, specs: [string, Quality, number, boolean][]): void {
  let cell = 0;
  for (const [item, q, hp, install] of specs) {
    if (!g.content.items[item]) continue;
    const uid = g.api.addModule(item, q);
    const inst = g.state.modules.find((m) => m.uid === uid);
    if (!inst) continue;
    inst.hp = hp;
    if (install && cell < g.state.grid.open) {
      inst.slot = cell;
      g.state.grid.cells[cell] = uid;
      cell++;
    }
  }
}

export function applyPreset(g: Game, preset: PresetId): void {
  const s = g.state;
  if (preset === "fresh") return;

  if (preset === "early") {
    s.credits = B.big(4200);
    setLevels(g, { mining: 12, lift: 10, cargo: 8, refinery: 3, reactor: 4 });
    s.features.crafting = 1;
    for (const id in g.content.recipes) if (g.content.recipes[id].unlock.start) s.recipes[id] = 1;
    giveItems(g, 0, 60);
    s.story.chapter = Math.max(s.story.chapter, 2);
  } else {
    const late = preset === "late";
    const damaged = preset === "damaged";
    const k = late ? 5 : 1;
    s.credits = late ? B.make(3.4, 41) : B.make(1.25, 9);
    s.lifetime = B.mulN(s.credits, 20);
    s.allTime = B.mulN(s.credits, 40);
    setLevels(g, {
      mining: 60 * k,
      lift: 50 * k,
      cargo: 45 * k,
      reactor: 40 * k,
      refinery: 25 * k,
      fabricator: 20 * k,
      workshop: 12 * k,
      hangar: 10 * k,
      lab: 12 * k,
      quarters: 8 * k,
      observatory: 6 * k,
      greenhouse: 6 * k,
      bridge: 15 * k,
    });
    for (const f of ALL_FEATURES) s.features[f] = 1;
    for (const id in g.content.recipes) s.recipes[id] = 1;
    giveItems(g, late ? 3 : 2, late ? 1e6 : 900);
    s.grid.open = late ? 16 : 9;
    if (late) {
      s.grid.w = 4;
      s.grid.h = 4;
      s.grid.cells = new Array(16).fill(0);
    }
    addModules(g, [
      ["mod_laser_mk2", 2, damaged ? 18 : 92, true],
      ["mod_laser_mk1", 1, damaged ? 44 : 71, true],
      ["mod_cargo_mk1", 3, damaged ? 31 : 100, true],
      ["mod_reactor_mk1", 1, damaged ? 12 : 64, true],
      ["mod_shield_mk1", 0, damaged ? 55 : 88, true],
      ["mod_scanner_mk1", 4, 100, false],
      ["mod_engine_mk1", 1, 37, false],
    ]);
    s.repair.botLevel = 2;
    s.rp = late ? B.make(8, 12) : B.big(480000);
    s.nav.depth = late ? 30 : 6;
    s.nav.lane = 0;
    s.nav.maxDepth = s.nav.depth;
    s.nav.fuel = 21;
    s.nav.g = late ? 3 : 0;
    s.nav.visited = {};
    for (let d = 0; d <= s.nav.depth; d++) s.nav.visited[`${s.nav.g}:${d}:0`] = 1;
    s.drones = { hauler: 2, probe: 1, salvager: 1, fixer: 0 };
    s.story.chapter = late ? 10 : 6;
    s.morale = 74;
    for (let i = 0; i < 4; i++) g.api.addCrew();
    const managed: DeckId[] = ["mining", "refinery", "lab"];
    s.crew.slice(0, 3).forEach((c, i) => {
      c.deck = managed[i];
      c.level = 3 + i * 2;
      s.decks[managed[i]].manager = c.uid;
    });
    for (let i = 0; i < 7; i++) g.api.grantCard();
    const research = Object.keys(g.content.research);
    for (let i = 0; i < Math.min(research.length, late ? 40 : 10); i++) s.research[research[i]] = 1;
    s.stats.purchases = late ? 5200 : 640;
    s.stats.salvage = late ? 900 : 85;
    s.stats.crafts = late ? 4000 : 310;
    s.stats.jumps = s.nav.depth;
    s.stats.depthMax = s.nav.depth;
    if (damaged) s.hull.hp = 34;
    if (late) {
      s.prestige.warps = 3;
      s.prestige.stamps = B.big(540);
      s.prestige.stampsTotal = B.big(2100);
      s.prestige.rebuilds = 1;
      s.prestige.rivets = B.big(42);
      s.prestige.sparks = B.big(3);
    }
  }
  g.dirty = true;
  for (let i = 0; i < 30; i++) tick(g);
}

/** Optional extras from preview query params. */
export function applyExtras(g: Game, extras: { failure?: string; event?: string }): void {
  if (extras.failure) g.api.startFailure(extras.failure as FailureKind);
  if (extras.event) g.api.triggerEvent(extras.event);
  g.dirty = true;
}

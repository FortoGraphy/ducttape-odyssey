// Sandbox mode: everything is unlocked from the first second, nothing is bought, and credits are
// earned the normal way. The flag is read by the engine (deck requirements, story beats) and the shell
// (no intro, no tutorial).
import type { FeatureId, Game } from "@/engine/types";

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

export function applySandbox(g: Game): void {
  const s = g.state;
  s.flags.sandbox = 1;
  s.flags.introSeen = 1;
  for (const f of ALL_FEATURES) s.features[f] = 1;
  for (const id in g.content.recipes) s.recipes[id] = 1;
  // a full tank and a working repair bot, so navigation and maintenance can be tried right away
  s.nav.fuel = Math.max(s.nav.fuel, Number(g.content.balance.fuelCap) || 30);
  s.repair.botLevel = Math.max(s.repair.botLevel, 1);
  s.story.pending = [];
  g.dirty = true;
}

export const isSandbox = (g: Game): boolean => g.state.flags.sandbox > 0;

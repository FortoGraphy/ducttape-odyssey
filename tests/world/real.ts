// The shipped content assembled into a ContentDB for the world tests: economy and events are the
// real data, story parts stay empty, and names fall back to the generator's built-in tables.
import * as eco from "@/content/economy";
import { events } from "@/content/events";
import * as B from "../../src/engine/big";
import { createGame } from "../../src/engine/kernel";
import type { ContentDB, Game } from "../../src/engine/types";
import { worldSystems } from "../../src/engine/world";
import { stubSystems, type Calls } from "./fixture";

const parts = {
  items: eco.items,
  decks: eco.decks,
  recipes: eco.recipes,
  research: eco.research,
  cards: eco.cards,
  traits: eco.traits,
  events,
  failures: eco.failures,
  chapters: [],
  logs: [],
  kipp: [],
  achievements: [],
  upgrades: eco.upgrades,
  mutators: eco.mutators,
  hulls: eco.hulls,
  cosmetics: eco.cosmetics,
  factions: eco.factions,
  shop: eco.shop,
  biomes: eco.biomes,
  quests: eco.quests,
  megaEffects: eco.megaEffects,
  names: { systemA: [], systemB: [], systemC: [], planetSuffix: [], crewFirst: [], crewLast: [], stationWords: [], faunaA: [], faunaB: [], floraA: [], floraB: [] },
  balance: eco.balance,
} satisfies Partial<ContentDB>;
export const realContent = parts as unknown as ContentDB;

export function realGame(seed = 3, db: ContentDB = realContent): { g: Game; calls: Calls } {
  const calls: Calls = { say: [], damageHull: [], damageModules: [], repairAll: [], minigames: [], discover: [] };
  const g = createGame(db, [...stubSystems(calls), ...worldSystems], undefined, { seed, wallMs: 0 });
  for (const f of ["nav", "scan", "probes", "expeditions", "outposts", "station", "crew", "cards"] as const) g.state.features[f] = 1;
  g.state.events.nextAt = Number.MAX_SAFE_INTEGER;
  g.state.credits = B.big(1e12);
  return { g, calls };
}

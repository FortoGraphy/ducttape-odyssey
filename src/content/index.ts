// Assembles the ContentDB from the data files. Owned by the orchestrator; the data files belong to
// the content areas (economy, events, story). scripts/validate checks the result as a whole.
import type { ContentDB } from "@/engine/types";

import * as economy from "./economy";
import { events } from "./events";
import * as story from "./story";

export const content: ContentDB = {
  items: economy.items,
  decks: economy.decks,
  recipes: economy.recipes,
  research: economy.research,
  cards: economy.cards,
  traits: economy.traits,
  events,
  failures: economy.failures,
  chapters: story.chapters,
  logs: story.logs,
  kipp: story.kipp,
  achievements: story.achievements,
  upgrades: economy.upgrades,
  mutators: economy.mutators,
  hulls: economy.hulls,
  cosmetics: economy.cosmetics,
  factions: economy.factions,
  shop: economy.shop,
  biomes: economy.biomes,
  quests: economy.quests,
  endings: story.endings,
  backlogTickets: story.backlogTickets,
  megaEffects: economy.megaEffects,
  names: story.names,
  balance: economy.balance,
};

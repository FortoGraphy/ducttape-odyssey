// Core part of a prestige reset. World and meta reset their own slices in their own systems.
import * as B from "../big";
import { DECK_IDS, type Game } from "../types";
import { resetActive } from "./active";
import { initCrafting } from "./crafting";
import { bal, cc } from "./shared";

/**
 * Resets the run economy: credits, lifetime earnings, hold, deck levels, hopper, craft queues,
 * modules, drones, buffs, megastructures (the shipyard survives a warp). Keeps preferences (keep
 * fractions, buy mode, auto lists), stats, features, other flags, artifacts and special items.
 * Layer 1 (warp) keeps the unlocked grid cells; layers 2 and 3 start from the hull class's bare grid.
 */
export function corePrestige(g: Game, layer: 1 | 2 | 3): void {
  const s = g.state;
  const c = cc(g);
  const items = g.content.items;

  s.credits = B.big(bal(g, "startCredits", 0));
  s.lifetime = { m: 0, e: 0 };
  s.hopper = { m: 0, e: 0 };
  for (const id of Object.keys(s.inv)) {
    const cat = items[id]?.category;
    // the shipyard outlives a warp: it is what the rebuild (layer 2) is launched from
    if (cat === "artifact" || cat === "special" || (id === "shipyard" && layer < 2)) continue;
    delete s.inv[id];
  }
  delete s.flags.gate_built;
  if (layer >= 2) delete s.flags.shipyard_built;
  c.megaKey = "";
  for (const id of DECK_IDS) s.decks[id].level = g.content.decks[id]?.startLevel ?? 0;
  s.drones = { hauler: 0, probe: 0, salvager: 0, fixer: 0 };

  s.craft = { refinery: { queue: [] }, fabricator: { queue: [] }, workshop: { queue: [] } };
  s.recipes = {};
  initCrafting(g, c); // start, inherited and chapter recipes come straight back
  s.autoRecipes = s.autoRecipes.filter((id) => s.recipes[id] === 1);

  s.modules = [];
  const grid = s.grid;
  if (layer >= 2) {
    const hull = g.content.hulls ? g.content.hulls[s.hull.cls] : undefined;
    grid.w = Math.max(1, Math.min(6, hull?.grid?.w ?? 3));
    grid.h = Math.max(1, Math.min(6, hull?.grid?.h ?? 3));
    grid.open = Math.min(grid.w * grid.h, bal(g, "gridStartOpen", 4));
  }
  grid.cells = new Array<number>(grid.w * grid.h).fill(0);
  grid.open = Math.min(grid.open, grid.cells.length);
  s.hull.hp = 100;
  s.repair.jobs = [];
  s.repair.priority = [];
  delete s.flags.botsBusyUntil;

  resetActive(g, true);
  s.minigame = null;
  s.buffs = [];

  c.modHp.clear();
  c.cargoFull = false;
  c.overdriveOn = false;
  c.seeded = false;
  c.dirty = true;
  c.sweepDue = true;
  g.dirty = true;
}

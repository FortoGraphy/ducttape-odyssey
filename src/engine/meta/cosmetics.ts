// Cosmetics: paint, trail, stickers, dashboard toy. Purely visual, unlocked by play, never sold for money.
import * as B from "../big";
import { OK, fail } from "../kernel";
import type { ActionResult, CosmeticDef, CosmeticId, Game, SystemDef } from "../types";
import { bal, lookup, whole } from "./util";

export function ownsCosmetic(g: Game, id: CosmeticId): boolean {
  return g.state.cosmetics.owned.indexOf(id) >= 0;
}

function unlockedByPlay(g: Game, def: CosmeticDef): boolean {
  const u = def.unlock;
  if (!u) return false;
  if (u.start) return true;
  if (u.achievement !== undefined && lookup(g.state.achievements, u.achievement) !== undefined) return true;
  if (u.chapter !== undefined && g.state.story.chapter >= u.chapter) return true;
  return false;
}

function grant(g: Game, def: CosmeticDef): boolean {
  if (ownsCosmetic(g, def.id)) return false;
  const c = g.state.cosmetics;
  c.owned.push(def.id);
  // a fresh ship should not look unpainted: the first start item of a single-slot kind is put on
  if (def.unlock?.start && def.kind !== "sticker" && c[def.kind] === "") c[def.kind] = def.id;
  return true;
}

/** Grants a cosmetic directly (achievement rewards). */
export function grantCosmetic(g: Game, id: CosmeticId): boolean {
  const def = lookup(g.content.cosmetics, id);
  return def ? grant(g, def) : false;
}

/** Grants everything whose start/achievement/chapter rule holds. Called on load and when one of those changes. */
export function syncCosmetics(g: Game): void {
  const all = g.content.cosmetics;
  for (const id in all) {
    const def = all[id];
    if (!ownsCosmetic(g, def.id) && unlockedByPlay(g, def)) grant(g, def);
  }
}

export function buyCosmetic(g: Game, id: CosmeticId): ActionResult {
  const def = lookup(g.content.cosmetics, id);
  if (!def) return fail("invalid");
  if (ownsCosmetic(g, def.id)) return fail("max");
  const price = def.unlock?.stamps;
  if (price === undefined || !(price >= 0)) return fail("locked");
  const p = g.state.prestige;
  const cost = B.big(price);
  if (B.cmp(p.stamps, cost) < 0) return fail("credits");
  p.stamps = whole(B.subClamp(p.stamps, cost));
  grant(g, def);
  return OK;
}

/** Puts a cosmetic on. Single-slot kinds replace (the same id again takes it off); stickers toggle. */
export function equipCosmetic(g: Game, id: CosmeticId): ActionResult {
  const def = lookup(g.content.cosmetics, id);
  if (!def) return fail("invalid");
  if (!ownsCosmetic(g, def.id)) return fail("locked");
  const c = g.state.cosmetics;
  if (def.kind === "sticker") {
    const at = c.stickers.indexOf(def.id);
    if (at >= 0) c.stickers.splice(at, 1);
    else if (c.stickers.length >= bal(g, "maxStickers", 4)) return fail("max");
    else c.stickers.push(def.id);
    return OK;
  }
  // paint is the hull itself and cannot be taken off, only swapped
  c[def.kind] = c[def.kind] === def.id && def.kind !== "paint" ? "" : def.id;
  return OK;
}

export const cosmeticsSystem: SystemDef = {
  id: "meta.cosmetics",
  init(g) {
    const c = g.state.cosmetics;
    if (!Array.isArray(c.owned)) c.owned = [];
    if (!Array.isArray(c.stickers)) c.stickers = [];
    for (const kind of ["paint", "trail", "toy"] as const) {
      if (typeof c[kind] !== "string" || (c[kind] !== "" && !ownsCosmetic(g, c[kind]))) c[kind] = "";
    }
    syncCosmetics(g);
  },
};

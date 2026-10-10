// Deck cards: found in the wild, duplicates level them up, two slots per deck.
import { emit, fail, markDirty, OK, stat, unlockFeature, weightedIndex } from "../kernel";
import { DECK_IDS, type ActionResult, type CardId, type ContentDB, type DeckId, type Effect, type Game, type SystemDef } from "../types";
import { bal, isInt, own } from "./util";

/** Card slots per deck (balance.cardSlots, 2 by default). */
export function cardSlots(g: Game): number {
  return Math.floor(Math.max(1, Math.min(4, bal(g, "cardSlots", 2))));
}
const RARITY_WEIGHT = [60, 25, 11, 4];

/** Card level from copies owned: 1, 2, 4, 8... copies give levels 1, 2, 3, 4... */
export function cardLevel(g: Game, copies: number): number {
  if (!(copies >= 1)) return 0;
  return Math.min(Math.max(1, Math.floor(bal(g, "cardMaxLevel", 10))), 1 + Math.floor(Math.log2(copies) + 1e-9));
}

/** Copies needed in total for the next level, or 0 at the cap. */
export function cardNextAt(g: Game, id: CardId): number {
  const own = g.state.cards[id];
  if (!own) return 1;
  return own.lvl >= Math.floor(bal(g, "cardMaxLevel", 10)) ? 0 : Math.pow(2, own.lvl);
}

const cardIdCache = new WeakMap<ContentDB, CardId[]>();
const scratchIds: CardId[] = [];
const scratchWeights: number[] = [];

function cardIds(content: ContentDB): CardId[] {
  let ids = cardIdCache.get(content);
  if (!ids) {
    ids = Object.keys(content.cards ?? {}).sort();
    cardIdCache.set(content, ids);
  }
  return ids;
}

function isEquipped(g: Game, id: CardId): boolean {
  const def = g.content.cards[id];
  return def !== undefined && g.state.decks[def.deck]?.cards?.includes(id) === true;
}

/** Grants a random card (of one deck when given). A duplicate adds a copy and may level the card up. */
export function grantCard(g: Game, deck?: DeckId): CardId | null {
  const s = g.state;
  const ids = cardIds(g.content);
  scratchIds.length = 0;
  scratchWeights.length = 0;
  for (let i = 0; i < ids.length; i++) {
    const def = g.content.cards[ids[i]];
    if (deck !== undefined && def.deck !== deck) continue;
    scratchIds.push(ids[i]);
    scratchWeights.push(RARITY_WEIGHT[def.rarity] ?? 1);
  }
  if (scratchIds.length === 0) return null;
  const id = scratchIds[weightedIndex(g, scratchWeights)];
  const own = s.cards[id] ?? (s.cards[id] = { n: 0, lvl: 0 });
  own.n = (Number.isFinite(own.n) ? own.n : 0) + 1;
  const lvl = cardLevel(g, own.n);
  if (lvl !== own.lvl) {
    own.lvl = lvl;
    if (isEquipped(g, id)) markDirty(g);
  }
  stat(g, "cards");
  unlockFeature(g, "cards");
  emit(g, { t: "cardFound", card: id });
  return id;
}

/** Slots a card owned by the player into its deck. An empty id clears the slot. */
export function equipCard(g: Game, deck: DeckId, cardId: CardId | null, slot: number): ActionResult {
  const s = g.state;
  if (typeof deck !== "string" || !(DECK_IDS as readonly string[]).includes(deck)) return fail("invalid");
  const slots = cardSlots(g);
  if (!isInt(slot) || slot < 0 || slot >= slots) return fail("invalid");
  const d = s.decks[deck];
  if (!d) return fail("invalid");
  if (!Array.isArray(d.cards)) d.cards = [];
  if (cardId === null || cardId === "") {
    if (slot >= d.cards.length) return fail("noTarget");
    d.cards.splice(slot, 1);
    markDirty(g);
    return OK;
  }
  const def = own(g.content.cards, cardId);
  if (!def || def.deck !== deck) return fail("invalid");
  if (!((own(s.cards, cardId)?.n ?? 0) >= 1)) return fail("requirement");
  const at = d.cards.indexOf(cardId);
  if (at >= 0) d.cards.splice(at, 1);
  if (slot < d.cards.length) d.cards[slot] = cardId;
  else d.cards.push(cardId);
  if (d.cards.length > slots) d.cards.length = slots;
  markDirty(g);
  return OK;
}

export function unequipCard(g: Game, deck: DeckId, slot: number): ActionResult {
  return equipCard(g, deck, null, slot);
}

/** An effect applied `lvl` times: additive parts add up, multiplicative parts compound. */
export function scaleEffect(e: Effect, lvl: number, defaultDeck?: DeckId): Effect {
  const out: Effect = {};
  if (e.stat) out.stat = e.stat;
  else if (e.deck ?? defaultDeck) out.deck = e.deck ?? defaultDeck;
  if (e.add !== undefined) out.add = e.add * lvl;
  if (e.mul !== undefined) out.mul = Math.pow(e.mul, lvl);
  return out;
}

export const cardSystem: SystemDef = {
  id: "world.cards",
  init(g) {
    const s = g.state;
    if (!s.cards || typeof s.cards !== "object") s.cards = {};
    for (const id in s.cards) {
      const own = s.cards[id];
      own.n = Math.max(1, Math.floor(Number.isFinite(own.n) ? own.n : 1));
      own.lvl = cardLevel(g, own.n);
    }
    g.api.grantCard = (deck) => grantCard(g, deck);
  },
  modifiers(g, out) {
    const s = g.state;
    const slots = cardSlots(g);
    for (let i = 0; i < DECK_IDS.length; i++) {
      const cards = s.decks[DECK_IDS[i]]?.cards;
      if (!cards || cards.length === 0) continue;
      for (let c = 0; c < cards.length && c < slots; c++) {
        const def = g.content.cards[cards[c]];
        const lvl = s.cards[cards[c]]?.lvl ?? 0;
        if (!def || lvl <= 0) continue;
        for (let e = 0; e < def.effects.length; e++) out.push(scaleEffect(def.effects[e], lvl, def.deck));
      }
    }
  },
};

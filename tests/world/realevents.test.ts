// Every shipped event through the engine: each choice, each outcome, both branches of each
// mini-game, live and offline. Core and meta are the fixture stubs.
import { describe, expect, it } from "vitest";
import { eventList } from "@/content/events";
import * as B from "../../src/engine/big";
import { addItem, applyOffline, tick } from "../../src/engine/kernel";
import type { ContentDB, EventDef, EventEffect, Game, OfflinePolicy } from "../../src/engine/types";
import * as W from "../../src/engine/world";
import { findNonFinite, resolveMinigame } from "./fixture";
import { realContent, realGame } from "./real";

function walkEffects(effects: EventEffect[], visit: (e: EventEffect) => void): void {
  for (const e of effects) {
    visit(e);
    if (e.t === "minigame") {
      walkEffects(e.win, visit);
      walkEffects(e.lose, visit);
    }
  }
}

/** A ship that meets every requirement an author could have asked for. */
function wellStocked(seed: number): { g: Game; calls: ReturnType<typeof realGame>["calls"] } {
  const f = realGame(seed);
  const g = f.g;
  const s = g.state;
  for (const id of Object.keys(g.content.decks)) s.decks[id as keyof typeof s.decks].level = Math.max(5, s.decks[id as keyof typeof s.decks].level);
  for (const id of Object.keys(g.content.items)) if (g.content.items[id].category !== "module" && g.content.items[id].category !== "mega") addItem(g, id, 1000);
  for (const f2 of ["research", "drones", "crafting", "grid", "repairBots", "codex", "quests", "overdrive"] as const) s.features[f2] = 1;
  const uid = g.api.addModule("mod_laser_mk1");
  s.modules[s.modules.length - 1].slot = 0;
  s.grid.cells[0] = uid;
  g.dirty = true;
  tick(g, 0.1);
  W.addCrew(g);
  return f;
}

function settle(g: Game): void {
  // play out whatever the effects asked for, alternating results
  for (let i = 0; i < 6 && g.state.minigame; i++) resolveMinigame(g, i % 2 === 0);
  if (g.state.failure) g.api.clearFailure("tow");
  g.state.hull.hp = 100;
  g.state.events.chain.length = 0;
}

describe("shipped events", () => {
  it("are all well-formed for the engine", () => {
    expect(eventList.length).toBeGreaterThanOrEqual(80);
    const content = realContent;
    const bad: string[] = [];
    for (const def of eventList) {
      if (content.events[def.id] !== def) bad.push(def.id + ": duplicate id");
      if (def.choices.length < 1 || def.choices.length > 4) bad.push(def.id + ": choices");
      if (!def.chainOnly && !(def.weight > 0)) bad.push(def.id + ": weight");
      def.choices.forEach((c, ci) => {
        if (c.outcomes.length === 0) bad.push(`${def.id}/${ci}: no outcomes`);
        if (!(c.outcomes.reduce((n, o) => n + Math.max(0, o.weight), 0) > 0)) bad.push(`${def.id}/${ci}: outcome weights`);
        for (const id of Object.keys(c.cost?.items ?? {})) if (!content.items[id]) bad.push(`${def.id}/${ci}: cost item ${id}`);
        for (const o of c.outcomes) {
          walkEffects(o.effects, (e) => {
            if (e.t === "item" && !content.items[e.item]) bad.push(`${def.id}/${ci}: item ${e.item}`);
            if (e.t === "chain" && !content.events[e.event]) bad.push(`${def.id}/${ci}: chain ${e.event}`);
            if (e.t === "failure" && !content.failures[e.kind]) bad.push(`${def.id}/${ci}: failure ${e.kind}`);
            if (e.t === "rep" && !content.factions[e.faction]) bad.push(`${def.id}/${ci}: faction ${e.faction}`);
            if (e.t === "card" && e.deck && !content.decks[e.deck]) bad.push(`${def.id}/${ci}: deck ${e.deck}`);
            if (e.t === "blueprint" && e.recipe && !content.recipes[e.recipe]) bad.push(`${def.id}/${ci}: recipe ${e.recipe}`);
          });
        }
      });
      // an event must never be a dead end: the engine allows closing it, but authors should offer a free way out
      if (!def.choices.some((c) => !c.requires && !c.cost)) bad.push(def.id + ": no free choice");
    }
    expect(bad).toEqual([]);
  });

  it("every choice can be taken and every outcome applied without throwing or corrupting state", () => {
    let outcomes = 0;
    let choices = 0;
    let minigames = 0;
    const blocked: string[] = [];
    eventList.forEach((def, n) => {
      const { g, calls } = wellStocked(100 + n);
      const s = g.state;

      // the dialog flow: each choice in turn
      def.choices.forEach((choice, ci) => {
        s.credits = B.big(1e9);
        s.events.active = null;
        expect(W.triggerEvent(g, def.id)).toBe(true);
        expect(W.activeEventDef(g)).toBe(def);
        const block = W.eventChoiceBlock(g, choice);
        expect(W.choiceAvailable(g, ci)).toBe(block === null);
        const result = W.chooseEvent(g, ci);
        if (block) {
          blocked.push(`${def.id}/${choice.id}: ${block}`);
          expect(result).toEqual({ ok: false, reason: block });
          s.events.active = null;
          return;
        }
        expect(result).toEqual({ ok: true });
        choices++;
        expect(g.state.events.active?.result?.choice).toBe(ci);
        if (s.minigame) {
          expect(s.minigame.purpose).toBe("event");
          expect(W.dismissEvent(g)).toEqual({ ok: false, reason: "busy" });
        }
        settle(g);
        expect(W.dismissEvent(g)).toEqual({ ok: true });
        expect(findNonFinite(s)).toEqual([]);
      });

      // every outcome directly, with both results of every mini-game it asks for
      for (const choice of def.choices) {
        for (const outcome of choice.outcomes) {
          for (const win of [true, false]) {
            s.credits = B.big(1e9);
            const before = calls.minigames.length;
            expect(() => g.api.applyEffects(outcome.effects, 1000 + outcomes)).not.toThrow();
            for (let i = 0; i < 6 && s.minigame; i++) expect(resolveMinigame(g, win)).toBe(true);
            minigames += calls.minigames.length - before;
            settle(g);
            outcomes++;
          }
          expect(W.outcomeTone(outcome)).toBeGreaterThanOrEqual(-1);
        }
      }
      expect(findNonFinite(s)).toEqual([]);
      expect(s.morale).toBeGreaterThanOrEqual(0);
      expect(s.morale).toBeLessThanOrEqual(100);
      expect(s.nav.fuel).toBeGreaterThanOrEqual(0);
      expect(s.nav.fuel).toBeLessThanOrEqual(W.fuelCap(g));
      expect(s.credits.m).toBeGreaterThanOrEqual(0);
      for (const f of ["lamplighters", "rustborn", "ledger"] as const) expect(Math.abs(s.station.rep[f])).toBeLessThanOrEqual(100);
    });
    expect(choices).toBeGreaterThan(250);
    expect(outcomes).toBeGreaterThan(800);
    expect(minigames).toBeGreaterThan(40);
    // a fully stocked ship is turned away only by conditions on the world around it
    expect(blocked.filter((b) => !b.endsWith("requirement"))).toEqual([]);
  });

  it("chain-only events start from a chain whatever their `when` says", () => {
    const chained = eventList.filter((e) => e.chainOnly);
    expect(chained.length).toBeGreaterThan(5);
    for (const def of chained) {
      const { g } = realGame(5);
      // a bare ship: most conditions do not hold, and the scheduler must never pick these
      expect(W.eventChance(g, def.id)).toBe(0);
      g.api.applyEffects([{ t: "chain", event: def.id, delay: 3 }], 1);
      for (let i = 0; i < 20; i++) tick(g, 0.1);
      expect(g.state.events.active).toBeNull();
      for (let i = 0; i < 20; i++) tick(g, 0.1);
      expect(g.state.events.active?.id).toBe(def.id);
    }
  });

  it("offline resolution of any event never starts a failure or opens a mini-game, under every policy", () => {
    let resolved = 0;
    for (const def of eventList) {
      // a universe where this is the only event, always eligible
      const solo: EventDef = { ...def, weight: 5, when: undefined, once: false, chainOnly: false, type: def.type === "story" ? "kipp" : def.type };
      const content: ContentDB = { ...realContent, events: { ...realContent.events, [def.id]: solo } };
      for (const id of Object.keys(content.events)) if (id !== def.id) content.events[id] = { ...content.events[id], weight: 0 };
      for (const policy of ["cautious", "balanced", "risky"] as OfflinePolicy[]) {
        const stock = (game: Game): void => {
          game.state.offline.policy = policy;
          game.state.hull.hp = 30;
          for (const id of Object.keys(content.items)) if (content.items[id].category === "consumable" || content.items[id].category === "raw") addItem(game, id, 500);
        };
        const { g, calls } = realGame(11, content);
        const s = g.state;
        stock(g);
        const twin = realGame(11, content).g;
        stock(twin);
        const expected = W.policyChoice(twin, solo);
        const report = applyOffline(g, 4 * 3600);
        expect(report.events.length).toBe(expected >= 0 ? 1 : 0);
        if (report.events.length === 1) {
          resolved++;
          expect(report.events[0].id).toBe(def.id);
          const choice = def.choices[report.events[0].choice];
          expect(choice).toBeDefined();
          expect(choice.outcomes[report.events[0].outcome]).toBeDefined();
          expect(report.events[0].choice).toBe(expected);
        }
        expect(s.failure).toBeNull();
        expect(s.minigame).toBeNull();
        expect(calls.minigames).toEqual([]);
        expect(s.events.active).toBeNull();
        expect(s.events.chain).toEqual([]);
        expect(s.hull.hp).toBeGreaterThanOrEqual(10);
        expect(findNonFinite(s)).toEqual([]);
        // and nothing goes off in the first seconds back either
        for (let i = 0; i < 30; i++) tick(g, 0.1);
        expect(s.failure).toBeNull();
        expect(s.minigame).toBeNull();
      }
    }
    expect(resolved).toBeGreaterThan(300);
  });
});

import { describe, expect, it } from "vitest";
import * as B from "../../src/engine/big";
import { addItem, getFlag, getItem, getStat, tick } from "../../src/engine/kernel";
import type { EventEffect, Game, StatKey } from "../../src/engine/types";
import {
  activeEventDef,
  chooseEvent,
  currentSystem,
  dismissEvent,
  eventChance,
  eventChoiceBlock,
  eventChoiceCost,
  jumpTo,
  outcomeTone,
  startFailure,
  triggerEvent,
} from "../../src/engine/world";
import { makeContent, makeGame, readyToJump, resolveMinigame, run } from "./fixture";

function setMod(g: Game, stat: StatKey, mul: number): void {
  g.state.buffs = g.state.buffs.filter((b) => b.src !== "test:" + stat);
  g.state.buffs.push({ effect: { stat, mul }, until: Number.MAX_SAFE_INTEGER, src: "test:" + stat });
  g.dirty = true;
  tick(g, 0.1);
}

/** Forces a scheduled pick right now and returns the event id (then clears it without side effects). */
function sample(g: Game): string | null {
  const ev = g.state.events;
  ev.active = null;
  ev.nextAt = g.state.t;
  ev.hourCount = 0;
  // the rolling-hour ring of recent starts is part of the cap this helper steps around
  for (const key in g.state.flags) if (key.startsWith("w:evt:")) delete g.state.flags[key];
  tick(g, 0.1);
  const id = ev.active ? (ev.active as { id: string }).id : null;
  ev.active = null;
  return id;
}

describe("scheduler", () => {
  it("fires the first event when its time comes and schedules the next 4-9 minutes later", () => {
    const { g } = makeGame();
    g.state.events.nextAt = 240;
    run(g, 239);
    expect(g.state.events.active).toBeNull();
    run(g, 1.5);
    const active = g.state.events.active;
    expect(active).not.toBeNull();
    expect(active?.result).toBeNull();
    expect(getStat(g, "events")).toBe(1);
    expect(getStat(g, "event_" + activeEventDef(g)?.type)).toBe(1);
    expect(g.outbox.some((e) => e.t === "eventStarted" && e.id === active?.id)).toBe(true);
    const gap = g.state.events.nextAt - g.state.t;
    expect(gap).toBeGreaterThan(238);
    expect(gap).toBeLessThanOrEqual(540);
  });

  it("never fires over a mini-game, another event, a jump or a fresh failure", () => {
    const { g } = makeGame();
    const ev = g.state.events;

    g.state.minigame = { token: 1, game: "wire", tier: 1, purpose: "practice", ref: 0 };
    ev.nextAt = g.state.t;
    run(g, 5);
    expect(ev.active).toBeNull();
    g.state.minigame = null;
    run(g, 0.2);
    expect(ev.active).not.toBeNull();

    const first = ev.active;
    ev.nextAt = g.state.t;
    run(g, 5);
    expect(ev.active).toBe(first);
    ev.active = null;

    readyToJump(g);
    expect(jumpTo(g, 1, currentSystem(g).links[0]).ok).toBe(true);
    ev.nextAt = g.state.t;
    run(g, 5);
    expect(ev.active).toBeNull();
    run(g, 2);
    expect(ev.active).not.toBeNull();
    ev.active = null;

    expect(startFailure(g, "radiation")).toBe(true);
    ev.nextAt = g.state.t;
    run(g, 19);
    expect(ev.active).toBeNull();
    run(g, 1.5);
    expect(ev.active).not.toBeNull();
  });

  it("picks by weight among eligible events", () => {
    const { g } = makeGame();
    const counts: Record<string, number> = {};
    const n = 6000;
    for (let i = 0; i < n; i++) {
      g.state.events.last = {};
      g.state.events.seen = {};
      const id = sample(g);
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    }
    // weights: common 10, once 6, chain_a 3, story 2, rare 1 = 22
    expect(Object.keys(counts).sort()).toEqual(["ev_chain_a", "ev_common", "ev_once", "ev_rare", "ev_story"]);
    expect(counts.ev_common / n).toBeCloseTo(10 / 22, 1);
    expect(counts.ev_once / n).toBeCloseTo(6 / 22, 1);
    expect(counts.ev_chain_a / n).toBeCloseTo(3 / 22, 1);
    expect(counts.ev_rare / n).toBeCloseTo(1 / 22, 1);
    g.state.events.last = {};
    g.state.events.seen = {};
    expect(eventChance(g, "ev_common")).toBeCloseTo(10 / 22, 9);
    expect(eventChance(g, "ev_chain_b")).toBe(0); // chain only
    expect(eventChance(g, "ev_cost")).toBe(0); // weight 0
  });

  it("honours `when` conditions", () => {
    const { g } = makeGame();
    expect(eventChance(g, "ev_cond")).toBe(0);
    g.state.flags.open = 1;
    expect(eventChance(g, "ev_cond")).toBeCloseTo(400 / 422, 9);
    let hits = 0;
    for (let i = 0; i < 300; i++) {
      g.state.events.last = {};
      if (sample(g) === "ev_cond") hits++;
    }
    expect(hits).toBeGreaterThan(260);
  });

  it("respects cooldowns and `once`", () => {
    const { g } = makeGame();
    expect(triggerEvent(g, "ev_common")).toBe(true);
    g.state.events.active = null;
    expect(eventChance(g, "ev_common")).toBe(0);
    for (let i = 0; i < 200; i++) expect(sample(g)).not.toBe("ev_common");
    g.state.events.last = { ev_common: g.state.t - 299 };
    expect(eventChance(g, "ev_common")).toBe(0);
    g.state.events.last = { ev_common: g.state.t - 301 };
    expect(eventChance(g, "ev_common")).toBeGreaterThan(0);
    // default cooldown is 30 minutes
    g.state.t += 4000;
    g.state.events.last = { ev_once: g.state.t - 1700 };
    g.state.events.seen = {};
    expect(eventChance(g, "ev_once")).toBe(0);
    g.state.events.last = {};
    expect(eventChance(g, "ev_once")).toBeGreaterThan(0);
    g.state.events.seen = { ev_once: 1 };
    expect(eventChance(g, "ev_once")).toBe(0);
    for (let i = 0; i < 200; i++) {
      g.state.events.last = {};
      expect(sample(g)).not.toBe("ev_once");
    }
  });

  it("runs chains after their delay", () => {
    const { g } = makeGame();
    expect(triggerEvent(g, "ev_chain_a")).toBe(true);
    expect(chooseEvent(g, 0)).toEqual({ ok: true });
    expect(g.state.events.chain).toEqual([{ id: "ev_chain_b", at: g.state.t + 30 }]);
    expect(dismissEvent(g)).toEqual({ ok: true });
    run(g, 29);
    expect(g.state.events.active).toBeNull();
    run(g, 1.5);
    expect(g.state.events.active?.id).toBe("ev_chain_b");
    expect(g.state.events.chain).toEqual([]);
    expect(chooseEvent(g, 0)).toEqual({ ok: true });
    expect(getFlag(g, "chain_done")).toBe(3);
    expect(dismissEvent(g)).toEqual({ ok: true });
  });

  it("queues a triggered event behind the one on screen", () => {
    const { g } = makeGame();
    expect(triggerEvent(g, "nope")).toBe(false);
    expect(triggerEvent(g, "ev_luck")).toBe(true);
    expect(triggerEvent(g, "ev_cost")).toBe(true);
    expect(g.state.events.active?.id).toBe("ev_luck");
    chooseEvent(g, 0);
    dismissEvent(g);
    run(g, 0.2);
    expect(g.state.events.active?.id).toBe("ev_cost");
  });

  it("keeps to the hourly cap over ten simulated hours", () => {
    const { g } = makeGame();
    setMod(g, "eventRate", 20); // a pick every 12-27 s if nothing held it back
    g.state.events.nextAt = g.state.t;
    const windows = new Map<number, number>();
    const times: number[] = [];
    let seenCount = 0;
    const end = g.state.t + 10 * 3600;
    while (g.state.t < end) {
      tick(g, 0.1);
      const ev = g.state.events;
      if (ev.active) {
        const total = getStat(g, "events");
        if (total > seenCount) {
          seenCount = total;
          times.push(g.state.t);
          windows.set(ev.hourStart, (windows.get(ev.hourStart) ?? 0) + 1);
        }
        if (ev.active.result === null) {
          const def = activeEventDef(g);
          const n = def ? def.choices.length : 1;
          if (!chooseEvent(g, Math.floor(g.state.t * 7) % n).ok) chooseEvent(g, 0);
        }
        resolveMinigame(g, true);
        dismissEvent(g);
      }
      g.outbox.length = 0;
      // keep the ship alive so the run is not one long breach
      if (g.state.failure) g.api.clearFailure("tow");
      g.state.hull.hp = 100;
    }
    expect(times.length).toBeGreaterThan(60); // the cap is what limits it, not the weights
    expect(times.length).toBeLessThanOrEqual(8 * 11);
    for (const [, n] of windows) expect(n).toBeLessThanOrEqual(8);
    expect(windows.size).toBeGreaterThanOrEqual(10);
    // independent check on the raw times: no clock hour holds more than two windows' worth
    for (let h = 0; h < 10; h++) expect(times.filter((t) => t >= h * 3600 && t < (h + 1) * 3600).length).toBeLessThanOrEqual(16);
    expect(g.state.events.hourCount).toBeLessThanOrEqual(8);
  });
});

describe("rolling hour", () => {
  it("no 60-minute stretch holds more than eight scheduled events, even across two hour windows", () => {
    const content = makeContent();
    const proto = content.events.ev_luck;
    content.events = {};
    for (let i = 0; i < 14; i++) content.events["e" + i] = { ...proto, id: "e" + i, weight: 5, cooldown: 3600 };
    const { g } = makeGame({ content });
    setMod(g, "eventRate", 20);
    g.state.events.nextAt = g.state.t;
    const times: number[] = [];
    let seen = 0;
    const end = g.state.t + 6 * 3600;
    while (g.state.t < end) {
      tick(g, 0.1);
      if (getStat(g, "events") > seen) {
        seen = getStat(g, "events");
        times.push(g.state.t);
      }
      if (g.state.events.active) {
        chooseEvent(g, 0);
        dismissEvent(g);
      }
      g.outbox.length = 0;
    }
    expect(times.length).toBeGreaterThan(40);
    for (let i = 0; i < times.length; i++) {
      let n = 0;
      for (let j = i; j < times.length && times[j] - times[i] < 3600; j++) n++;
      expect(n).toBeLessThanOrEqual(8);
    }
  });
});

describe("rolling hour with repeating events", () => {
  it("counts every start, not every different event (regression: 9 in an hour when one event repeated)", () => {
    const content = makeContent();
    const proto = content.events.ev_luck;
    content.events = {};
    for (let i = 0; i < 3; i++) content.events["e" + i] = { ...proto, id: "e" + i, weight: 5, cooldown: 300 };
    const { g } = makeGame({ content });
    setMod(g, "eventRate", 20);
    g.state.events.nextAt = g.state.t;
    const times: number[] = [];
    let seen = 0;
    const end = g.state.t + 6 * 3600;
    while (g.state.t < end) {
      tick(g, 0.1);
      if (getStat(g, "events") > seen) {
        seen = getStat(g, "events");
        times.push(g.state.t);
      }
      if (g.state.events.active) {
        chooseEvent(g, 0);
        dismissEvent(g);
      }
      g.outbox.length = 0;
    }
    expect(times.length).toBeGreaterThan(40);
    for (let i = 0; i < times.length; i++) {
      let n = 0;
      for (let j = i; j < times.length && times[j] - times[i] < 3600; j++) n++;
      expect(n).toBeLessThanOrEqual(8);
    }
  });
});

describe("choices", () => {
  it("checks requirements and costs, then pays them", () => {
    const { g } = makeGame();
    triggerEvent(g, "ev_cost");
    const def = activeEventDef(g);
    if (!def) throw new Error("no event");
    expect(B.toNumber(eventChoiceCost(g, def.choices[0]))).toBe(1000); // 10 s of 100/s income
    expect(eventChoiceBlock(g, def.choices[0])).toBeNull();
    expect(eventChoiceBlock(g, def.choices[1])).toBe("items");
    expect(eventChoiceBlock(g, def.choices[2])).toBe("requirement");
    expect(chooseEvent(g, 1)).toEqual({ ok: false, reason: "items" });
    expect(chooseEvent(g, 2)).toEqual({ ok: false, reason: "requirement" });
    expect(chooseEvent(g, 7)).toEqual({ ok: false, reason: "invalid" });
    expect(chooseEvent(g, -1)).toEqual({ ok: false, reason: "invalid" });
    expect(chooseEvent(g, 0.5)).toEqual({ ok: false, reason: "invalid" });
    expect(dismissEvent(g)).toEqual({ ok: false, reason: "requirement" });

    g.state.credits = B.big(999);
    expect(chooseEvent(g, 0)).toEqual({ ok: false, reason: "credits" });
    g.state.credits = B.big(1500);
    g.state.morale = 50;
    expect(chooseEvent(g, 0)).toEqual({ ok: true });
    expect(B.toNumber(g.state.credits)).toBe(500);
    expect(g.state.morale).toBe(55);
    expect(g.state.events.active?.result).toEqual({ choice: 0, outcome: 0 });
    expect(chooseEvent(g, 0)).toEqual({ ok: false, reason: "busy" });
    expect(getStat(g, "eventsGood")).toBe(1);
    expect(g.outbox.some((e) => e.t === "eventResolved" && e.good)).toBe(true);
    expect(dismissEvent(g)).toEqual({ ok: true });
    expect(dismissEvent(g)).toEqual({ ok: false, reason: "noTarget" });
    expect(chooseEvent(g, 0)).toEqual({ ok: false, reason: "noTarget" });

    triggerEvent(g, "ev_cost");
    addItem(g, "scrap", 8);
    g.state.nav.fuel = 10;
    expect(chooseEvent(g, 1)).toEqual({ ok: true });
    expect(B.toNumber(getItem(g, "scrap"))).toBe(3);
    expect(g.state.nav.fuel).toBe(14);
  });

  it("lets the player close an event that offers nothing they can take", () => {
    const { g } = makeGame();
    triggerEvent(g, "ev_locked");
    expect(chooseEvent(g, 0)).toEqual({ ok: false, reason: "requirement" });
    expect(dismissEvent(g)).toEqual({ ok: true });
  });

  it("eventLuck shifts outcomes toward the good ones", () => {
    const rate = (luck: number): number => {
      const { g } = makeGame({ seed: 31 });
      setMod(g, "eventLuck", luck);
      const n = 3000;
      for (let i = 0; i < n; i++) {
        triggerEvent(g, "ev_luck");
        chooseEvent(g, 0);
        dismissEvent(g);
      }
      expect(getStat(g, "eventsGood") + getStat(g, "eventsBad")).toBe(n);
      return getStat(g, "eventsGood") / n;
    };
    const low = rate(0.25);
    const even = rate(1);
    const high = rate(3);
    expect(low).toBeCloseTo(0.2, 1);
    expect(even).toBeCloseTo(0.5, 1);
    expect(high).toBeCloseTo(0.75, 1);
    expect(low).toBeLessThan(even);
    expect(even).toBeLessThan(high);
  });

  it("classifies outcome tone", () => {
    expect(outcomeTone({ weight: 1, good: true, text: { cs: "", en: "" }, effects: [] })).toBe(1);
    expect(outcomeTone({ weight: 1, text: { cs: "", en: "" }, effects: [{ t: "hull", pct: -5 }] })).toBe(-1);
    expect(outcomeTone({ weight: 1, text: { cs: "", en: "" }, effects: [{ t: "hull", pct: 5 }] })).toBe(0);
    expect(outcomeTone(undefined)).toBe(0);
  });
});

describe("effects", () => {
  const apply = (g: Game, ...fx: EventEffect[]): void => g.api.applyEffects(fx, 77);

  it("credits: income seconds, losses never go below zero", () => {
    const { g } = makeGame();
    g.state.credits = B.big(500);
    apply(g, { t: "credits", secs: 30 });
    expect(B.toNumber(g.state.credits)).toBe(3500);
    expect(B.toNumber(g.state.lifetime)).toBe(3000);
    apply(g, { t: "credits", secs: -10 });
    expect(B.toNumber(g.state.credits)).toBe(2500);
    apply(g, { t: "credits", secs: -1000 });
    expect(g.state.credits.m).toBe(0);
  });

  it("item: plain, scaled by the mining scale, and removal", () => {
    const { g } = makeGame();
    apply(g, { t: "item", item: "scrap", n: 4 });
    expect(B.toNumber(getItem(g, "scrap"))).toBe(4);
    apply(g, { t: "item", item: "ice", n: 3, scaled: true });
    expect(B.toNumber(getItem(g, "ice"))).toBe(300); // 3 x (10 units/s x 10 s)
    apply(g, { t: "item", item: "scrap", n: -1 });
    expect(B.toNumber(getItem(g, "scrap"))).toBe(3);
    apply(g, { t: "item", item: "scrap", n: -50 });
    expect(getItem(g, "scrap").m).toBe(0);
  });

  it("loseCargo: vents mass-bearing cargo only, percent or fraction", () => {
    const { g } = makeGame();
    addItem(g, "scrap", 100);
    addItem(g, "art_idol", 1);
    addItem(g, "mod_laser_mk1", 2);
    apply(g, { t: "loseCargo", pct: 20 });
    expect(B.toNumber(getItem(g, "scrap"))).toBeCloseTo(80, 9);
    apply(g, { t: "loseCargo", pct: 0.5 });
    expect(B.toNumber(getItem(g, "scrap"))).toBeCloseTo(40, 9);
    expect(B.toNumber(getItem(g, "art_idol"))).toBe(1);
    expect(B.toNumber(getItem(g, "mod_laser_mk1"))).toBe(2);
  });

  it("hull: damage goes through core, repair is direct and capped", () => {
    const { g, calls } = makeGame();
    apply(g, { t: "hull", pct: -30 });
    expect(calls.damageHull).toEqual([30]);
    expect(g.state.hull.hp).toBe(70);
    apply(g, { t: "hull", pct: 50 });
    expect(g.state.hull.hp).toBe(100);
  });

  it("moduleDamage, fuel, morale, rep, flag", () => {
    const { g, calls } = makeGame();
    apply(g, { t: "moduleDamage", pct: 15, count: 2, family: "laser" });
    expect(calls.damageModules).toEqual([{ pct: 15, count: 2, family: "laser" }]);

    g.state.nav.fuel = 10;
    apply(g, { t: "fuel", n: 5 });
    expect(g.state.nav.fuel).toBe(15);
    apply(g, { t: "fuel", n: 100 });
    expect(g.state.nav.fuel).toBe(30);
    apply(g, { t: "fuel", n: -100 });
    expect(g.state.nav.fuel).toBe(0);

    g.state.morale = 50;
    apply(g, { t: "morale", n: 10 }, { t: "morale", n: -25 });
    expect(g.state.morale).toBe(35);
    apply(g, { t: "morale", n: -500 });
    expect(g.state.morale).toBe(0);

    apply(g, { t: "rep", faction: "rustborn", n: 12 }, { t: "rep", faction: "ledger", n: -300 });
    expect(g.state.station.rep.rustborn).toBe(12);
    expect(g.state.station.rep.ledger).toBe(-100);
    setMod(g, "repGain", 2);
    apply(g, { t: "rep", faction: "rustborn", n: 4 }, { t: "rep", faction: "rustborn", n: -1 });
    expect(g.state.station.rep.rustborn).toBe(19); // gains doubled, losses not

    apply(g, { t: "flag", key: "met_someone" }, { t: "flag", key: "count", value: 4 });
    expect(getFlag(g, "met_someone")).toBe(1);
    expect(getFlag(g, "count")).toBe(4);
  });

  it("failure: starts it (once)", () => {
    const { g } = makeGame();
    apply(g, { t: "failure", kind: "blackout" });
    expect(g.state.failure?.kind).toBe("blackout");
    apply(g, { t: "failure", kind: "engine" });
    expect(g.state.failure?.kind).toBe("blackout");
    expect(getStat(g, "failures")).toBe(1);
  });

  it("minigame inside an event: win and lose branches come from the outcome", () => {
    for (const win of [true, false]) {
      const { g, calls } = makeGame();
      triggerEvent(g, "ev_minigame");
      expect(chooseEvent(g, 0)).toEqual({ ok: true });
      expect(calls.minigames).toEqual([{ game: "wire", tier: 1, purpose: "event", ref: 0 }]);
      expect(g.state.minigame?.purpose).toBe("event");
      expect(dismissEvent(g)).toEqual({ ok: false, reason: "busy" });
      expect(getFlag(g, "mg_win") + getFlag(g, "mg_lose")).toBe(0);
      expect(resolveMinigame(g, win)).toBe(true);
      expect(getFlag(g, "mg_win")).toBe(win ? 1 : 0);
      expect(getFlag(g, "mg_lose")).toBe(win ? 0 : 1);
      expect(B.toNumber(g.state.rp)).toBe(win ? 20 : 0); // 10 s of 2 RP/s
      expect(g.state.hull.hp).toBe(win ? 100 : 95);
      expect(dismissEvent(g)).toEqual({ ok: true });
    }
  });

  it("minigame outside an event: effects are remembered by token; a busy host auto-wins", () => {
    const { g } = makeGame();
    const fx: EventEffect = { t: "minigame", game: "hack", tier: 2, win: [{ t: "flag", key: "a_win" }], lose: [{ t: "flag", key: "a_lose" }] };
    apply(g, fx);
    expect(g.state.minigame?.ref).toBe(-1);
    // a second request while the first is pending cannot be hosted
    apply(g, { t: "minigame", game: "hack", tier: 1, win: [{ t: "flag", key: "b_win" }], lose: [{ t: "flag", key: "b_lose" }] });
    expect(getFlag(g, "b_win")).toBe(1);
    expect(getFlag(g, "b_lose")).toBe(0);
    resolveMinigame(g, false);
    expect(getFlag(g, "a_lose")).toBe(1);
    expect(getFlag(g, "a_win")).toBe(0);
  });

  it("blueprint, crew, card, log, codex", () => {
    const { g, calls } = makeGame();
    apply(g, { t: "blueprint", recipe: "r_bp2" });
    expect(g.state.recipes.r_bp2).toBe(1);
    apply(g, { t: "blueprint" });
    expect(g.state.recipes.r_bp1).toBe(1);

    apply(g, { t: "crew" });
    expect(g.state.crew.length).toBe(1);
    expect(g.outbox.some((e) => e.t === "crewJoined")).toBe(true);

    apply(g, { t: "card", deck: "lift" });
    expect(g.state.cards.c_lift_a).toEqual({ n: 1, lvl: 1 });
    apply(g, { t: "card" });
    expect(getStat(g, "cards")).toBe(2);

    apply(g, { t: "log" }, { t: "log", id: "log_2" }, { t: "log" });
    expect(g.state.story.logs).toEqual(["log_1", "log_2"]);

    apply(g, { t: "codex", key: "artifact:art_idol" });
    expect(calls.discover).toContain("artifact:art_idol");
    expect(g.state.codex["artifact:art_idol"]).toBeDefined();
  });

  it("rp, buff, chain", () => {
    const { g } = makeGame();
    apply(g, { t: "rp", secs: 60 });
    expect(B.toNumber(g.state.rp)).toBe(120);

    apply(g, { t: "buff", effect: { stat: "mineRate", mul: 2 }, secs: 30 });
    run(g, 0.2);
    expect(g.mods.mineRate).toBe(2);
    run(g, 31);
    expect(g.mods.mineRate).toBe(1);
    expect(g.state.buffs.length).toBe(0);

    apply(g, { t: "chain", event: "ev_chain_b", delay: 5 }, { t: "chain", event: "missing" });
    expect(g.state.events.chain).toEqual([{ id: "ev_chain_b", at: g.state.t + 5 }]);
    run(g, 6);
    expect(g.state.events.active?.id).toBe("ev_chain_b");
  });

  it("an event outcome with a failure effect starts the failure", () => {
    const { g } = makeGame();
    g.state.credits = B.big(500);
    triggerEvent(g, "ev_fail");
    expect(chooseEvent(g, 1)).toEqual({ ok: true });
    expect(g.state.failure?.kind).toBe("boarding");
    expect(getStat(g, "eventsBad")).toBe(1);
    dismissEvent(g);
    g.api.clearFailure("tow");
    triggerEvent(g, "ev_fail");
    expect(chooseEvent(g, 0)).toEqual({ ok: true });
    expect(g.state.credits.m).toBe(0); // lost 2000, had 500
  });

  it("ignores malformed effects", () => {
    const { g } = makeGame();
    const junk = [
      null,
      { t: "nonsense" },
      { t: "credits", secs: NaN },
      { t: "item", item: "scrap", n: Infinity },
      { t: "hull", pct: NaN },
      { t: "fuel", n: NaN },
      { t: "morale", n: NaN },
      { t: "rep", faction: "nobody", n: 5 },
      { t: "rp", secs: -5 },
      { t: "buff", effect: { stat: "mineRate", mul: 2 }, secs: NaN },
      { t: "minigame", game: "wire", tier: 1 },
    ] as unknown as EventEffect[];
    expect(() => g.api.applyEffects(junk, NaN)).not.toThrow();
    expect(Number.isFinite(g.state.nav.fuel)).toBe(true);
    expect(Number.isFinite(g.state.morale)).toBe(true);
    expect(Number.isFinite(g.state.hull.hp)).toBe(true);
  });
});

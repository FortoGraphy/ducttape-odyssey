import { describe, expect, it } from "vitest";
import * as B from "../../src/engine/big";
import { addItem, getItem, getStat, tick } from "../../src/engine/kernel";
import type { FailureKind, Game } from "../../src/engine/types";
import { attemptFailureExit, callTow, failureDef, failureExitCost, startFailure, towQuote } from "../../src/engine/world";
import { FAILURE_KINDS, makeGame, resolveMinigame, run, teleport } from "./fixture";

function broke(g: Game): void {
  g.state.credits = B.big(0);
}

describe("starting a failure", () => {
  it("can start every kind, counts it and announces it", () => {
    for (const kind of FAILURE_KINDS) {
      const { g, calls } = makeGame();
      expect(startFailure(g, kind)).toBe(true);
      expect(g.state.failure?.kind).toBe(kind);
      expect(g.state.failure?.since).toBe(g.state.t);
      expect(g.state.failure?.tow).toBeNull();
      expect(getStat(g, "failures")).toBe(1);
      expect(getStat(g, "failure_" + kind)).toBe(1);
      expect(g.outbox.some((e) => e.t === "failureStarted" && e.kind === kind)).toBe(true);
      expect(calls.say.some((c) => c.trigger === "failure" && c.vars?.kind === kind)).toBe(true);
      // one at a time
      expect(startFailure(g, kind === "tumble" ? "engine" : "tumble")).toBe(false);
      expect(g.api.startFailure("anomaly")).toBe(false);
      expect(getStat(g, "failures")).toBe(1);
    }
  });

  it("is ignored offline and for unknown kinds", () => {
    const { g } = makeGame();
    g.offline = true;
    expect(startFailure(g, "tumble")).toBe(false);
    g.offline = false;
    expect(startFailure(g, "nonsense" as FailureKind)).toBe(false);
    expect(g.state.failure).toBeNull();
  });

  it("applies the definition's effects and deck blocks as modifiers while active", () => {
    const { g } = makeGame();
    startFailure(g, "blackout");
    tick(g, 0.1);
    expect(g.mods.powerOut).toBeCloseTo(0.2, 9);
    g.api.clearFailure("tow");
    tick(g, 0.1);
    expect(g.mods.powerOut).toBe(1);

    startFailure(g, "tumble");
    tick(g, 0.1);
    expect(g.deckMult.mining).toBe(0);
    expect(g.deckMult.lift).toBe(1);
    g.api.clearFailure("tow");
    tick(g, 0.1);
    expect(g.deckMult.mining).toBe(1);
  });

  it("a breach vents 20 % of cargo, once", () => {
    const { g } = makeGame();
    addItem(g, "scrap", 1000);
    addItem(g, "art_coin", 1);
    startFailure(g, "breach");
    expect(B.toNumber(getItem(g, "scrap"))).toBeCloseTo(800, 6);
    expect(B.toNumber(getItem(g, "art_coin"))).toBe(1);
    run(g, 30);
    expect(B.toNumber(getItem(g, "scrap"))).toBeCloseTo(800, 6);
    g.state.hull.hp = 0;
    g.api.clearFailure("minigame");
    expect(g.state.hull.hp).toBe(25); // patched enough not to breach again at once
  });
});

describe("exits", () => {
  it("every exit of every failure works, including the tow with no credits", () => {
    let exitsTried = 0;
    for (const kind of FAILURE_KINDS) {
      const def = makeGame().content.failures[kind];
      expect(def.exits.some((e) => e.kind === "tow")).toBe(true);
      def.exits.forEach((exit, index) => {
        const { g, calls } = makeGame();
        expect(startFailure(g, kind)).toBe(true);
        expect(failureDef(g)).toBe(g.content.failures[kind]);
        exitsTried++;
        switch (exit.kind) {
          case "minigame": {
            expect(attemptFailureExit(g, index)).toEqual({ ok: true });
            expect(calls.minigames).toEqual([{ game: exit.game, tier: exit.tier, purpose: "failure", ref: index }]);
            expect(attemptFailureExit(g, index)).toEqual({ ok: false, reason: "busy" });
            // a failed attempt keeps the failure but can be retried
            resolveMinigame(g, false);
            expect(g.state.failure?.kind).toBe(kind);
            expect(attemptFailureExit(g, index)).toEqual({ ok: true });
            resolveMinigame(g, true);
            break;
          }
          case "wait": {
            expect(g.state.failure?.waitUntil).toBe(g.state.t + exit.seconds);
            expect(attemptFailureExit(g, index)).toEqual({ ok: false, reason: "cooldown" });
            run(g, exit.seconds - 2);
            expect(g.state.failure?.kind).toBe(kind);
            run(g, 3);
            break;
          }
          case "items": {
            expect(attemptFailureExit(g, index)).toEqual({ ok: false, reason: "items" });
            for (const id of Object.keys(exit.items)) addItem(g, id, exit.items[id] + 1);
            expect(attemptFailureExit(g, index)).toEqual({ ok: true });
            for (const id of Object.keys(exit.items)) expect(B.toNumber(getItem(g, id))).toBe(1);
            break;
          }
          case "credits": {
            broke(g);
            expect(attemptFailureExit(g, index)).toEqual({ ok: false, reason: "credits" });
            const cost = failureExitCost(g, index);
            expect(B.toNumber(cost)).toBe(exit.secs * 100);
            g.state.credits = B.add(cost, B.big(5));
            expect(attemptFailureExit(g, index)).toEqual({ ok: true });
            expect(B.toNumber(g.state.credits)).toBeCloseTo(5, 6);
            break;
          }
          case "tow": {
            broke(g);
            expect(attemptFailureExit(g, index)).toEqual({ ok: true });
            const tow = g.state.failure?.tow;
            expect(tow).not.toBeNull();
            expect(attemptFailureExit(g, index)).toEqual({ ok: false, reason: "busy" });
            const eta = (tow?.eta ?? 0) - g.state.t;
            expect(eta).toBeGreaterThanOrEqual(180);
            expect(eta).toBeLessThanOrEqual(3 * 3600);
            // the wait exit may get there first; either way the ship is free by the ETA
            run(g, eta + 1);
            break;
          }
        }
        expect(g.state.failure).toBeNull();
        expect(g.outbox.some((e) => e.t === "failureCleared" && e.kind === kind)).toBe(true);
        expect(calls.say.some((c) => c.trigger === "rescued")).toBe(true);
        expect(attemptFailureExit(g, index)).toEqual({ ok: false, reason: "noTarget" });
      });
    }
    expect(exitsTried).toBeGreaterThanOrEqual(25);
  });

  it("rejects bad exit indices", () => {
    const { g } = makeGame();
    startFailure(g, "engine");
    for (const i of [-1, 99, 1.5, NaN]) expect(attemptFailureExit(g, i)).toEqual({ ok: false, reason: "invalid" });
  });

  it("a botched mini-game shortens the wait and the tow", () => {
    const { g } = makeGame();
    startFailure(g, "anomaly");
    callTow(g);
    const wait = (g.state.failure?.waitUntil ?? 0) - g.state.t;
    const eta = (g.state.failure?.tow?.eta ?? 0) - g.state.t;
    attemptFailureExit(g, 0);
    resolveMinigame(g, false);
    expect((g.state.failure?.waitUntil ?? 0) - g.state.t).toBeCloseTo(wait * 0.75, 6);
    expect((g.state.failure?.tow?.eta ?? 0) - g.state.t).toBeCloseTo(eta * 0.875, 6);
    // a stale result for a different failure does nothing
    g.api.clearFailure("minigame");
    startFailure(g, "noFuel");
    g.minigameHandlers.failure?.(g, { token: 1, game: "hack", tier: 2, purpose: "failure", ref: 0 }, { score: 1, success: true, perfect: true, durationMs: 1 });
    expect(g.state.failure?.kind).toBe("noFuel");
  });
});

describe("tow", () => {
  it("ETA follows towBase * (1 + depth / 20) * towSpeed, clamped to 3 min .. 3 h", () => {
    const { g } = makeGame();
    startFailure(g, "tumble");
    expect(towQuote(g)?.seconds).toBe(600);
    teleport(g, 10, 0);
    expect(towQuote(g)?.seconds).toBe(900);
    // towSpeed multiplies the wait: 0.5 is twice as fast
    g.state.buffs.push({ effect: { stat: "towSpeed", mul: 0.5 }, until: 1e12, src: "t" });
    g.dirty = true;
    tick(g, 0.1);
    expect(towQuote(g)?.seconds).toBe(450);
    g.state.buffs[0].effect = { stat: "towSpeed", mul: 2 };
    g.dirty = true;
    tick(g, 0.1);
    expect(towQuote(g)?.seconds).toBe(1800);
    g.state.buffs[0].effect = { stat: "towSpeed", mul: 0.001 };
    g.dirty = true;
    tick(g, 0.1);
    expect(towQuote(g)?.seconds).toBe(180);
    g.state.buffs[0].effect = { stat: "towSpeed", mul: 1000 };
    g.dirty = true;
    tick(g, 0.1);
    expect(towQuote(g)?.seconds).toBe(3 * 3600);
    expect(towQuote(makeGame().g)).toBeNull();
  });

  it("costs credits (at most 10 min of income) when the player has them, and uses a beacon", () => {
    const { g } = makeGame();
    g.state.credits = B.big(1e9);
    startFailure(g, "tumble");
    const q = towQuote(g);
    expect(q?.pay).toBe("credits");
    expect(B.toNumber(q?.cost ?? B.big(0))).toBe(12000); // 120 s at depth 0
    teleport(g, 39, 0);
    expect(B.toNumber(towQuote(g)?.cost ?? B.big(0))).toBe(60000); // capped at 600 s
    teleport(g, 0, 0);
    addItem(g, "beacon", 2);
    expect(towQuote(g)?.beacon).toBe(true);
    expect(towQuote(g)?.seconds).toBe(300);
    expect(callTow(g)).toEqual({ ok: true });
    expect(B.toNumber(g.state.credits)).toBeCloseTo(1e9 - 12000, 3);
    expect(B.toNumber(getItem(g, "beacon"))).toBe(1);
    expect(g.state.failure?.tow?.eta).toBe(g.state.t + 300);
    run(g, 119);
    // the two-minute wait exit beats the tow: the fee comes back
    run(g, 2);
    expect(g.state.failure).toBeNull();
    expect(B.toNumber(g.state.credits)).toBeCloseTo(1e9, 3);
    expect(getStat(g, "tows")).toBe(0);
  });

  it("falls back to reputation, then to a free but slower tow", () => {
    const { g } = makeGame();
    broke(g);
    g.state.station.rep.rustborn = 12;
    startFailure(g, "boarding");
    let q = towQuote(g);
    expect(q?.pay).toBe("rep");
    expect(q?.faction).toBe("rustborn");
    expect(q?.cost.m).toBe(0);
    expect(callTow(g)).toEqual({ ok: true });
    expect(g.state.station.rep.rustborn).toBe(4);
    expect(callTow(g)).toEqual({ ok: false, reason: "busy" });
    run(g, 601);
    expect(g.state.failure).toBeNull();
    expect(getStat(g, "tows")).toBe(1);
    expect(g.outbox.some((e) => e.t === "failureCleared" && e.by === "tow")).toBe(true);

    // nobody left to owe a favour to
    g.state.station.rep = { lamplighters: -100, rustborn: -95, ledger: -99 };
    startFailure(g, "boarding");
    q = towQuote(g);
    expect(q?.pay).toBe("free");
    expect(q?.seconds).toBe(900);
    expect(callTow(g)).toEqual({ ok: true });
    expect(g.state.station.rep.rustborn).toBe(-95);
    run(g, 901);
    expect(g.state.failure).toBeNull();
    expect(getStat(g, "tows")).toBe(2);
  });

  it("refunds reputation when another exit gets there first", () => {
    const { g } = makeGame();
    broke(g);
    g.state.station.rep.ledger = 30;
    startFailure(g, "radiation");
    callTow(g);
    expect(g.state.station.rep.ledger).toBe(22);
    run(g, 201);
    expect(g.state.failure).toBeNull();
    expect(g.state.station.rep.ledger).toBe(30);
  });

  it("cannot be called without a failure", () => {
    const { g } = makeGame();
    expect(callTow(g)).toEqual({ ok: false, reason: "noTarget" });
  });
});

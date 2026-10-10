import { describe, expect, it } from "vitest";
import * as B from "@/engine/big";
import { createGame } from "@/engine/kernel";
import {
  CODEX_NAME_MAX,
  achievementProgress,
  buyCosmetic,
  codexSummary,
  equipCosmetic,
  hasAchievement,
  metaSystems,
  renameCodex,
  sanitizeName,
} from "@/engine/meta";
import { content, drain, makeGame, run } from "./fixture";

describe("codex", () => {
  it("records each key once, counts by category and emits", () => {
    const { g } = makeGame();
    drain(g);
    g.state.t = 42;
    expect(g.api.discover("planet:0:1:2:0")).toBe(true);
    expect(g.api.discover("planet:0:1:2:0")).toBe(false);
    expect(g.api.discover("fauna:77")).toBe(true);
    expect(g.api.discover("weird-key")).toBe(true);
    expect(g.api.discover("")).toBe(false);
    expect(g.api.discover("__proto__")).toBe(false);
    expect(g.state.codex["planet:0:1:2:0"]).toEqual({ t: 42 });
    expect(g.state.stats.codex).toBe(3);
    expect(drain(g).filter((e) => e.t === "discovery")).toHaveLength(3);
    const summary = codexSummary(g);
    expect(summary.total).toBe(3);
    expect(summary.categories.find((c) => c.category === "planet")).toEqual({ category: "planet", count: 1, sets: 0, toNext: 9 });
    expect(summary.categories.find((c) => c.category === "fauna")?.count).toBe(1);
    expect(summary.categories.find((c) => c.category === "other")?.count).toBe(1);
  });

  it("pays a credit bonus and a morale bump for every tenth entry of a category", () => {
    const { g } = makeGame();
    g.rates.income = B.big(10);
    g.state.morale = 70;
    drain(g);
    const before = B.toNumber(g.state.credits);
    for (let i = 0; i < 9; i++) g.api.discover(`planet:${i}`);
    for (let i = 0; i < 9; i++) g.api.discover(`flora:${i}`);
    expect(B.toNumber(g.state.credits)).toBe(before);
    expect(g.state.morale).toBe(70);
    g.api.discover("planet:9");
    expect(B.toNumber(g.state.credits)).toBeCloseTo(before + 120 * 10, 6);
    expect(g.state.morale).toBe(75);
    expect(g.state.stats.codexSets).toBe(1);
    const toasts = drain(g).filter((e) => e.t === "toast");
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ tone: "good", text: { cs: expect.stringContaining("10 planet"), en: expect.stringContaining("10 planets") } });
    // stamps are never part of a set reward
    expect(g.state.prestige.stamps).toEqual({ m: 0, e: 0 });
    g.state.morale = 99;
    for (let i = 10; i < 20; i++) g.api.discover(`planet:${i}`);
    expect(g.state.morale).toBe(100);
    expect(codexSummary(g).categories.find((c) => c.category === "planet")).toEqual({ category: "planet", count: 20, sets: 2, toNext: 10 });
  });

  it("renames entries with a sanitized name of at most 24 characters", () => {
    const { g } = makeGame();
    g.api.discover("planet:a");
    expect(renameCodex(g, "planet:nope", "x")).toEqual({ ok: false, reason: "noTarget" });
    expect(renameCodex(g, "planet:a", "  My \t  <b>Rock</b>\n ")).toEqual({ ok: true });
    expect(g.state.codex["planet:a"].name).toBe("My bRock/b");
    expect(g.state.stats.renames).toBe(1);
    expect(renameCodex(g, "planet:a", "My bRock/b")).toEqual({ ok: true });
    expect(g.state.stats.renames).toBe(1);

    renameCodex(g, "planet:a", "Žluťoučký kůň úpěl ďábelské ódy navždy");
    const name = g.state.codex["planet:a"].name ?? "";
    expect([...name].length).toBeLessThanOrEqual(CODEX_NAME_MAX);
    expect(name).toBe("Žluťoučký kůň úpěl ďábel");
    // a cut never leaves a trailing space behind
    renameCodex(g, "planet:a", "abcdefghijklmnopqrstuvw   xyz");
    expect(g.state.codex["planet:a"].name).toBe("abcdefghijklmnopqrstuvw");
    expect(g.state.stats.renames).toBe(3);

    expect(sanitizeName("a\u0000b‮c{d}\\")).toBe("abcd");
    expect([...sanitizeName("🚀".repeat(40))].length).toBe(CODEX_NAME_MAX);
    expect(sanitizeName(42)).toBe("");
    expect(renameCodex(g, "planet:a", "<>{}")).toEqual({ ok: false, reason: "invalid" });
    expect(renameCodex(g, "planet:a", "   ")).toEqual({ ok: true });
    expect(g.state.codex["planet:a"].name).toBeUndefined();
  });

  it("recounts the category counters when a save is loaded", () => {
    const first = makeGame();
    for (let i = 0; i < 4; i++) first.g.api.discover(`system:${i}`);
    const state = JSON.parse(JSON.stringify(first.g.state));
    state.stats.codex_system = 999;
    delete state.stats.codex;
    const g = createGame(content, metaSystems, state);
    expect(g.state.stats.codex_system).toBe(4);
    expect(g.state.stats.codex).toBe(4);
  });
});

describe("achievements", () => {
  it("fires once when the stat reaches the threshold, records wall time and pays the reward", () => {
    const { g } = makeGame();
    drain(g);
    g.state.wall = 1_700_000_000_000;
    g.state.stats.purchases = 9;
    run(g, 3);
    expect(hasAchievement(g, "buy_10")).toBe(false);
    expect(achievementProgress(g, content.achievements[1])).toBeCloseTo(0.9, 9);

    g.state.stats.purchases = 10;
    run(g, 1.1);
    expect(g.state.achievements.buy_10).toBe(1_700_000_000_000);
    expect(B.toNumber(g.state.prestige.stamps)).toBe(2);
    expect(B.toNumber(g.state.prestige.stampsTotal)).toBe(2);
    expect(drain(g).filter((e) => e.t === "achievement")).toEqual([{ t: "achievement", id: "buy_10" }]);

    g.state.wall += 5000;
    g.state.stats.purchases = 50;
    run(g, 30);
    expect(drain(g).filter((e) => e.t === "achievement")).toEqual([]);
    expect(g.state.achievements.buy_10).toBe(1_700_000_000_000);
    expect(B.toNumber(g.state.prestige.stamps)).toBe(2);
    expect(achievementProgress(g, content.achievements[1])).toBe(1);
  });

  it("awards every threshold a jump crosses, in order, with cosmetic rewards", () => {
    const { g } = makeGame();
    drain(g);
    g.state.stats.purchases = 5000;
    run(g, 1.1);
    expect(drain(g).filter((e) => e.t === "achievement")).toEqual([
      { t: "achievement", id: "buy_10" },
      { t: "achievement", id: "buy_100" },
      { t: "achievement", id: "buy_1000" },
    ]);
    expect(g.state.cosmetics.owned).toContain("paint_gold");
    expect(g.state.stats.achievements).toBe(3);
    run(g, 20);
    expect(drain(g).filter((e) => e.t === "achievement")).toEqual([]);
  });

  it("pays the rest of a reward when its cosmetic id is unknown", () => {
    const { g } = makeGame();
    drain(g);
    const owned = g.state.cosmetics.owned.length;
    g.state.stats.salvage = 3;
    run(g, 1.1);
    expect(hasAchievement(g, "ghost_paint")).toBe(true);
    expect(g.state.cosmetics.owned).toHaveLength(owned);
    expect(g.state.cosmetics.owned).not.toContain("ach_paint_99");
    expect(B.toNumber(g.state.prestige.stamps)).toBe(1);
    expect(equipCosmetic(g, "ach_paint_99")).toEqual({ ok: false, reason: "invalid" });
  });

  it("keeps playedHours and does not re-fire for a loaded save", () => {
    const { g } = makeGame();
    drain(g);
    run(g, 3599);
    expect(hasAchievement(g, "hours_1")).toBe(false);
    run(g, 3);
    expect(g.state.stats.playedHours).toBeCloseTo(1, 2);
    expect(hasAchievement(g, "hours_1")).toBe(true);

    const state = JSON.parse(JSON.stringify(g.state));
    const loaded = createGame(content, metaSystems, state);
    drain(loaded);
    run(loaded, 5);
    expect(drain(loaded).filter((e) => e.t === "achievement")).toEqual([]);
    expect(loaded.state.achievements.hours_1).toBe(g.state.achievements.hours_1);
  });

  it("still marks an achievement earned when the wall clock is unset", () => {
    const { g } = makeGame({ wallMs: 0 });
    g.state.stats.warps = 1;
    run(g, 1.1);
    expect(g.state.achievements.warp_1).toBeGreaterThan(0);
  });
});

describe("cosmetics", () => {
  it("owns start items, puts the start paint on and unlocks by chapter and achievement", () => {
    const { g } = makeGame();
    const c = g.state.cosmetics;
    expect(c.owned.slice().sort()).toEqual(["paint_rust", "sticker_a"]);
    expect(c.paint).toBe("paint_rust");
    expect(c.stickers).toEqual([]);

    g.state.stats.storyStep = 1;
    run(g, 1.1);
    expect(c.owned).toContain("sticker_b");
    expect(c.owned).not.toContain("toy_duck");
    g.state.stats.storyStep = 2;
    run(g, 1.1);
    expect(c.owned).toContain("toy_duck");
    expect(c.toy).toBe(""); // only start items are put on automatically

    g.state.stats.purchases = 100;
    run(g, 1.1);
    expect(c.owned).toContain("paint_gold");
    expect(c.paint).toBe("paint_rust");
  });

  it("sells stamp cosmetics for stamps", () => {
    const { g } = makeGame();
    const p = g.state.prestige;
    expect(buyCosmetic(g, "trail_blue")).toEqual({ ok: false, reason: "credits" });
    expect(buyCosmetic(g, "toy_duck")).toEqual({ ok: false, reason: "locked" });
    expect(buyCosmetic(g, "paint_rust")).toEqual({ ok: false, reason: "max" });
    expect(buyCosmetic(g, "nope")).toEqual({ ok: false, reason: "invalid" });
    p.stamps = B.big(4);
    p.stampsTotal = B.big(4);
    expect(buyCosmetic(g, "trail_blue")).toEqual({ ok: true });
    expect(B.toNumber(p.stamps)).toBe(1);
    expect(B.toNumber(p.stampsTotal)).toBe(4);
    expect(g.state.cosmetics.owned).toContain("trail_blue");
    expect(buyCosmetic(g, "trail_blue")).toEqual({ ok: false, reason: "max" });
  });

  it("equips by kind: single slots swap, stickers toggle, paint cannot be removed", () => {
    const { g } = makeGame();
    const c = g.state.cosmetics;
    expect(equipCosmetic(g, "trail_blue")).toEqual({ ok: false, reason: "locked" });
    expect(equipCosmetic(g, "nope")).toEqual({ ok: false, reason: "invalid" });
    g.state.prestige.stamps = B.big(3);
    buyCosmetic(g, "trail_blue");
    expect(equipCosmetic(g, "trail_blue")).toEqual({ ok: true });
    expect(c.trail).toBe("trail_blue");
    expect(equipCosmetic(g, "trail_blue")).toEqual({ ok: true });
    expect(c.trail).toBe("");
    expect(equipCosmetic(g, "paint_rust")).toEqual({ ok: true });
    expect(c.paint).toBe("paint_rust");
    expect(equipCosmetic(g, "sticker_a")).toEqual({ ok: true });
    expect(c.stickers).toEqual(["sticker_a"]);
    expect(equipCosmetic(g, "sticker_a")).toEqual({ ok: true });
    expect(c.stickers).toEqual([]);
  });
});

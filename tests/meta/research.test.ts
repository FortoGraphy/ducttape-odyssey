import { describe, expect, it } from "vitest";
import * as B from "@/engine/big";
import { addItem, createGame, getItem, rebuildMods, runPrestige } from "@/engine/kernel";
import { buyResearch, canResearch, metaSystems, researchBlock, researchCost, researchLevel } from "@/engine/meta";
import { drain, makeGame } from "./fixture";

const rich = (g: ReturnType<typeof makeGame>["g"]): void => {
  g.state.rp = B.big(1e12);
};

describe("research", () => {
  it("costs cost * growth^level in research points", () => {
    const { g } = makeGame();
    rich(g);
    expect(B.toNumber(researchCost(g, "drill_bits").rp)).toBeCloseTo(10, 9);
    expect(buyResearch(g, "drill_bits")).toEqual({ ok: true });
    expect(B.toNumber(researchCost(g, "drill_bits").rp)).toBeCloseTo(20, 9);
    buyResearch(g, "drill_bits");
    expect(B.toNumber(researchCost(g, "drill_bits").rp)).toBeCloseTo(40, 9);
    expect(B.toNumber(researchCost(g, "overclock").rp)).toBeCloseTo(5, 9);
    buyResearch(g, "overclock");
    buyResearch(g, "overclock");
    expect(B.toNumber(researchCost(g, "overclock").rp)).toBeCloseTo(5 * 1.5 * 1.5, 9);
    expect(researchCost(g, "smelting").items).toEqual({ scrap: 5 });
  });

  it("spends exactly the cost", () => {
    const { g } = makeGame();
    g.state.rp = B.big(35);
    expect(buyResearch(g, "drill_bits")).toEqual({ ok: true }); // 10
    expect(buyResearch(g, "drill_bits")).toEqual({ ok: true }); // 20
    expect(B.toNumber(g.state.rp)).toBeCloseTo(5, 9);
    expect(buyResearch(g, "drill_bits")).toEqual({ ok: false, reason: "credits" });
    expect(researchLevel(g, "drill_bits")).toBe(2);
  });

  it("enforces prerequisites, item costs and the level cap", () => {
    const { g, world } = makeGame();
    rich(g);
    expect(canResearch(g, "smelting")).toBe(false);
    expect(buyResearch(g, "smelting")).toEqual({ ok: false, reason: "requirement" });
    buyResearch(g, "drill_bits");
    expect(canResearch(g, "smelting")).toBe(true);
    expect(researchBlock(g, "smelting")).toBe("items");
    expect(buyResearch(g, "smelting")).toEqual({ ok: false, reason: "items" });
    addItem(g, "scrap", 7);
    expect(buyResearch(g, "smelting")).toEqual({ ok: true });
    expect(B.toNumber(getItem(g, "scrap"))).toBeCloseTo(2, 9);
    expect(world.unlockCalls).toContain("alloy_basic");
    expect(g.state.recipes.alloy_basic).toBe(1);
    expect(buyResearch(g, "smelting")).toEqual({ ok: false, reason: "max" });
    expect(canResearch(g, "smelting")).toBe(false);
    for (let i = 0; i < 4; i++) expect(buyResearch(g, "overclock")).toEqual({ ok: true });
    expect(buyResearch(g, "overclock")).toEqual({ ok: false, reason: "max" });
  });

  it("rejects unknown and prototype ids", () => {
    const { g } = makeGame();
    rich(g);
    for (const id of ["nope", "", "constructor", "__proto__", "toString"]) {
      expect(buyResearch(g, id)).toEqual({ ok: false, reason: "invalid" });
      expect(canResearch(g, id)).toBe(false);
    }
    expect(g.state.research).toEqual({});
  });

  it("applies effects per level, unlocks features, counts and emits", () => {
    const { g } = makeGame();
    rich(g);
    drain(g);
    for (let i = 0; i < 3; i++) buyResearch(g, "drill_bits");
    buyResearch(g, "overclock");
    buyResearch(g, "overclock");
    expect(g.dirty).toBe(true);
    rebuildMods(g);
    expect(g.mods.mineRate).toBeCloseTo(1.3, 9);
    expect(g.mods.craftSpeed).toBeCloseTo(1.21, 9);
    expect(g.state.stats.researchLevels).toBe(5);
    expect(drain(g).filter((e) => e.t === "researchDone")).toHaveLength(5);

    addItem(g, "scrap", 5);
    buyResearch(g, "smelting");
    expect(g.state.features.autoQueue).toBeUndefined();
    expect(buyResearch(g, "deep_smelting")).toEqual({ ok: true });
    expect(g.state.features.autoQueue).toBe(1);
    expect(g.state.recipes.wire_basic).toBe(1);
  });

  it("keeps a quarter of each node (rounded down) across a warp and nothing across a rebuild", () => {
    const { g } = makeGame();
    rich(g);
    addItem(g, "scrap", 5);
    for (let i = 0; i < 8; i++) buyResearch(g, "drill_bits");
    for (let i = 0; i < 4; i++) buyResearch(g, "overclock");
    buyResearch(g, "smelting");
    for (let i = 0; i < 4; i++) buyResearch(g, "deep_smelting");
    expect(g.state.research).toEqual({ drill_bits: 8, overclock: 4, smelting: 1, deep_smelting: 4 });

    runPrestige(g, 1);
    expect(g.state.research).toEqual({ drill_bits: 2, overclock: 1, deep_smelting: 1 });
    expect(g.state.rp).toEqual({ m: 0, e: 0 });
    expect(g.mods.mineRate).toBeCloseTo(1.2, 9);
    expect(g.mods.craftSpeed).toBeCloseTo(1.1, 9);
    // the stub core wiped the recipe book; the surviving node restored its recipe, the lost one did not
    expect(g.state.recipes).toEqual({ wire_basic: 1 });
    expect(g.state.features.autoQueue).toBe(1);

    g.state.rp = B.big(50);
    runPrestige(g, 2);
    expect(g.state.research).toEqual({});
    expect(g.state.rp).toEqual({ m: 0, e: 0 });
    expect(g.mods.mineRate).toBe(1);
  });

  it("mirrors the repair-bot node into state.repair.botLevel on buy, reset and load", () => {
    const { g } = makeGame();
    rich(g);
    expect(g.state.repair.botLevel).toBe(0);
    for (let i = 1; i <= 5; i++) {
      expect(buyResearch(g, "mt_bots")).toEqual({ ok: true });
      expect(g.state.repair.botLevel).toBe(i);
    }
    const loaded = createGame(g.content, metaSystems, { ...JSON.parse(JSON.stringify(g.state)), repair: { botLevel: 0, auto: false, priority: [], jobs: [] } });
    expect(loaded.state.repair.botLevel).toBe(5);
    runPrestige(g, 1); // 25 % of 5, rounded down
    expect(g.state.research.mt_bots).toBe(1);
    expect(g.state.repair.botLevel).toBe(1);
    runPrestige(g, 2);
    expect(g.state.repair.botLevel).toBe(0);
  });

  it("repairs research levels from a save and re-grants what owned nodes unlock", () => {
    const first = makeGame();
    const state = JSON.parse(JSON.stringify(first.g.state));
    state.research = { drill_bits: 99, deep_smelting: 2, overclock: -3, ghost_node: 2 };
    state.features = {};
    const g = createGame(first.g.content, metaSystems, state);
    expect(g.state.research.drill_bits).toBe(8);
    expect(g.state.research.overclock).toBeUndefined();
    expect(g.state.research.ghost_node).toBe(2);
    expect(g.state.features.autoQueue).toBe(1);
    expect(g.mods.mineRate).toBeCloseTo(1.8, 9);
  });
});

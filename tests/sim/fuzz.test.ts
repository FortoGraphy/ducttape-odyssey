import { describe, expect, it } from "vitest";
import { canProgress, fuzz, preset } from "../../scripts/sim/fuzz";

describe("sim: softlock fuzz slice", () => {
  it("finds no softlock from presets, forced failures, edge states and a random walk", () => {
    const res = fuzz({ seeds: 2, steps: 400, presets: ["fresh", "mid"], full: false, dialogs: false });
    expect(res.softlocks).toEqual([]);
    expect(res.states).toBeGreaterThan(40);
  });

  it("a brand-new ship with an empty wallet earns and buys again", () => {
    const g = preset("fresh");
    g.state.credits = { m: 0, e: 0 };
    expect(canProgress(g, "fresh and broke")).toBeNull();
  });
});

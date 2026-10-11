import { describe, expect, it } from "vitest";
import { Sim } from "../../scripts/sim/bots";
import { activeChecks, idleChecks } from "../../scripts/sim/run";

// Fast slices of `npm run sim`: the early pacing targets of GDD 9 must survive every balance change.
describe("sim: pacing", () => {
  it("an active first hour hits the early targets", () => {
    const sim = new Sim({ bot: "active", seed: 1, hours: 1, snapshots: [15 * 60, 30 * 60] }).run();
    const checks = activeChecks(sim);
    const missed = checks.filter((c) => !c.ok && !c.soft).map((c) => `${c.name}: wanted ${c.target}, got ${c.actual}`);
    expect(missed).toEqual([]);
    for (const name of ["first purchase", "second deck", "first event", "first mini-game", "first jump", "first module crafted"]) {
      expect(checks.some((c) => c.name === name), name).toBe(true);
    }
    // not too fast either: the first run is meant to last hours
    expect(sim.g.state.prestige.warps).toBe(0);
    expect(sim.g.state.nav.depth).toBeLessThan(20);
  });

  it("two days of two-minute check-ins keep progressing", () => {
    const sim = new Sim({ bot: "idle", seed: 2, hours: 48 }).run();
    const missed = idleChecks(sim).filter((c) => !c.ok && !c.soft).map((c) => `${c.name}: wanted ${c.target}, got ${c.actual}`);
    expect(missed).toEqual([]);
    expect(sim.g.state.nav.maxDepth).toBeGreaterThanOrEqual(4);
    expect(sim.first.jump).toBeLessThan(12 * 3600);
  });
});

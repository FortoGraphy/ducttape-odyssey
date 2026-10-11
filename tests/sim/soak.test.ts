import { describe, expect, it } from "vitest";
import { soak } from "../../scripts/sim/soak";

describe("sim: soak slice", () => {
  it("twenty minutes of stressed play keep every collection bounded and every number finite", () => {
    const res = soak({ hours: 1 / 3, chunk: 300 });
    expect(res.violations).toEqual([]);
    expect(res.ticks).toBeGreaterThanOrEqual(12000);
    expect(Object.keys(res.failures).length).toBeGreaterThanOrEqual(3);
    expect(res.rows[res.rows.length - 1].saveKb).toBeLessThan(100);
  });
});

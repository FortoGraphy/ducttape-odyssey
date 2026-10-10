import { describe, expect, it } from "vitest";

import * as B from "@/engine/big";

describe("big", () => {
  it("keeps whole numbers whole", () => {
    expect(B.toNumber(B.sub(B.big(23), B.big(3)))).toBe(20);
    expect(B.gte(B.sub(B.big(23), B.big(3)), B.big(20))).toBe(true);
    expect(B.eq(B.add(B.big(0.1), B.big(0.2)), B.big(0.3))).toBe(true);
    let acc = B.big(0);
    for (let i = 0; i < 1000; i++) acc = B.add(acc, B.big(7));
    expect(B.toNumber(acc)).toBe(7000);
    expect(B.eq(B.subClamp(B.big(12345), B.big(12345)), B.ZERO)).toBe(true);
  });

  it("handles huge and mixed magnitudes", () => {
    const huge = B.make(3.5, 400);
    expect(B.log10(B.mul(huge, huge))).toBeCloseTo(801.088, 2);
    expect(B.eq(B.add(huge, B.big(1)), huge)).toBe(true);
    expect(B.cmp(B.make(1, 400), B.make(9, 399))).toBe(1);
    expect(B.toNumber(B.add(B.make(1, 16), B.make(1, 15)))).toBeCloseTo(1.1e16, -3);
    expect(B.ratio(B.make(1, 500), B.make(4, 500))).toBeCloseTo(0.25, 10);
    expect(B.cmp(B.big(-5), B.big(3))).toBe(-1);
  });

  it("sums geometric cost series", () => {
    const first = B.big(10);
    let manual = B.big(0);
    for (let i = 0; i < 25; i++) manual = B.add(manual, B.mulN(first, Math.pow(1.07, i)));
    expect(B.toNumber(B.geomSum(first, 1.07, 25))).toBeCloseTo(B.toNumber(manual), 6);
    const budget = B.big(1000);
    const n = B.geomMax(first, 1.07, budget);
    expect(B.lte(B.geomSum(first, 1.07, n), budget)).toBe(true);
    expect(B.gt(B.geomSum(first, 1.07, n + 1), budget)).toBe(true);
    expect(B.geomMax(first, 1.07, B.big(9))).toBe(0);
    expect(B.geomMax(first, 1.07, B.make(1, 300))).toBeGreaterThan(9000);
  });

  it("sanitizes damaged values", () => {
    expect(B.sanitize({ m: NaN, e: 3 })).toEqual({ m: 0, e: 0 });
    expect(B.sanitize(42)).toEqual(B.big(42));
    expect(B.sanitize({ m: 123, e: 0 })).toEqual(B.big(123));
    expect(B.sanitize("x")).toEqual({ m: 0, e: 0 });
  });
});

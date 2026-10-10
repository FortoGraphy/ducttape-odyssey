import { describe, expect, it } from "vitest";
import * as B from "../../src/engine/big";
import { durationParts, formatBig, formatDuration, formatMult, formatNumber, formatPct, formatRate } from "../../src/engine/core";

describe("formatBig", () => {
  it("shows small numbers without trailing noise", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(5)).toBe("5");
    expect(formatNumber(5.5)).toBe("5.5");
    expect(formatNumber(1.2)).toBe("1.2");
    expect(formatNumber(1.25)).toBe("1.25");
    expect(formatNumber(12)).toBe("12");
    expect(formatNumber(12.34)).toBe("12.3");
    expect(formatNumber(123.4)).toBe("123");
    expect(formatNumber(999)).toBe("999");
    expect(formatNumber(0.05)).toBe("0.05");
    expect(formatNumber(0.004)).toBe("0.004");
    expect(formatNumber(1e-9)).toBe("0");
    expect(formatBig(B.big(6 - 1e-15))).toBe("6");
  });

  it("uses K, M, B, T and then letter pairs", () => {
    expect(formatNumber(1000)).toBe("1.00K");
    expect(formatNumber(1234)).toBe("1.23K");
    expect(formatNumber(12345)).toBe("12.3K");
    expect(formatNumber(123456)).toBe("123K");
    expect(formatNumber(1.5e6)).toBe("1.50M");
    expect(formatNumber(2.5e9)).toBe("2.50B");
    expect(formatNumber(7.77e12)).toBe("7.77T");
    expect(formatBig(B.make(1, 15))).toBe("1.00aa");
    expect(formatBig(B.make(1, 18))).toBe("1.00ab");
    expect(formatBig(B.make(4.2, 15 + 3 * 25))).toBe("4.20az");
    expect(formatBig(B.make(4.2, 15 + 3 * 26))).toBe("4.20ba");
    expect(formatBig(B.make(1, 15 + 3 * 675))).toBe("1.00zz");
    expect(formatBig(B.make(1, 15 + 3 * 676))).toBe("1.00aaa");
  });

  it("carries rounding into the next group", () => {
    expect(formatNumber(999.6)).toBe("1.00K");
    expect(formatNumber(999999)).toBe("1.00M");
    expect(formatBig(B.make(9.999, 14))).toBe("1.00aa");
    expect(formatBig(B.make(9.999, 5), "sci")).toBe("1.00e6");
  });

  it("handles huge exponents, negatives and garbage without NaN", () => {
    expect(formatBig(B.make(1.2345, 3000))).toBe("1.23amh");
    expect(formatBig(B.make(3.21, 123456789))).toMatch(/^[\d.]+[a-z]+$/);
    expect(formatBig(B.make(3.21, 123456789), "sci")).toBe("3.21e123456789");
    expect(formatBig(B.make(-2.5, 6))).toBe("-2.50M");
    expect(formatBig(B.make(1, 400), "sci", 4)).toBe("1.000e400");
    for (const bad of [null, undefined, { m: NaN, e: 0 }, { m: 1, e: NaN }, { m: Infinity, e: 3 }, { m: 0, e: 99 }] as never[]) {
      expect(formatBig(bad)).toBe("0");
    }
    expect(formatNumber(NaN)).toBe("0");
    expect(formatBig({ m: 123, e: 2 })).toBe("12.3K"); // not normalised input
    for (let e = -5; e < 2100; e += 7) {
      const text = formatBig(B.make(9.87654, e));
      expect(text).not.toMatch(/NaN|Infinity|undefined|e\+/);
      expect(text.length).toBeLessThanOrEqual(8);
    }
  });

  it("honours the digits argument", () => {
    expect(formatNumber(1234567, "suffix", 4)).toBe("1.235M");
    expect(formatNumber(1234567, "suffix", 2)).toBe("1.2M");
    expect(formatNumber(1234567, "sci", 2)).toBe("1.2e6");
  });
});

describe("other formatters", () => {
  it("formatRate", () => {
    expect(formatRate(B.big(1.25))).toBe("1.25/s");
    expect(formatRate(15000)).toBe("15.0K/s");
    expect(formatRate(null)).toBe("0/s");
  });

  it("formatDuration and parts", () => {
    expect(durationParts(90061)).toEqual({ d: 1, h: 1, m: 1, s: 1 });
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(200)).toBe("3m 20s");
    expect(formatDuration(7500)).toBe("2h 05m");
    expect(formatDuration(93600)).toBe("1d 2h");
    expect(formatDuration(93784, 4)).toBe("1d 2h 03m 04s");
    expect(formatDuration(-5)).toBe("0s");
    expect(formatDuration(NaN)).toBe("0s");
    expect(formatDuration(Infinity)).toBe("--");
  });

  it("formatPct and formatMult", () => {
    expect(formatPct(0.253)).toBe("25%");
    expect(formatPct(0.253, 1)).toBe("25.3%");
    expect(formatPct(1)).toBe("100%");
    expect(formatPct(0.5, 1)).toBe("50%");
    expect(formatPct(NaN)).toBe("0%");
    expect(formatPct(-0.001)).toBe("0%");
    expect(formatMult(1.5)).toBe("x1.5");
    expect(formatMult(2)).toBe("x2");
    expect(formatMult(1234)).toBe("x1.23K");
  });
});

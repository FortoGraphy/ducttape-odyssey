// Number formatting for the UI. Pure functions, no locale dependency: digits and Latin letters only.
import * as B from "../big";
import type { Big } from "../types";

export type NumberMode = "suffix" | "sci";

const NAMED = ["", "K", "M", "B", "T"];

/** 0 -> "aa", 1 -> "ab", ... 675 -> "zz", 676 -> "aaa" ... */
export function letterSuffix(index: number): string {
  let n = Math.max(0, Math.floor(index));
  let len = 2;
  let span = 676;
  while (n >= span) {
    n -= span;
    len++;
    span *= 26;
  }
  let s = "";
  for (let i = 0; i < len; i++) {
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

/** Suffix for a power-of-1000 group: 0 "", 1 K, 2 M, 3 B, 4 T, 5 aa, 6 ab ... */
export function groupSuffix(group: number): string {
  return group < NAMED.length ? NAMED[Math.max(0, group)] : letterSuffix(group - NAMED.length);
}

function trimZeros(s: string): string {
  if (s.indexOf(".") < 0) return s;
  let end = s.length;
  while (s.charCodeAt(end - 1) === 48) end--;
  if (s.charCodeAt(end - 1) === 46) end--;
  return s.slice(0, end);
}

/** Numbers below 1000: as short as possible, never "12.00". */
function formatSmall(v: number): string {
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return trimZeros(v.toFixed(1));
  if (v >= 0.01) return trimZeros(v.toFixed(2));
  if (v >= 0.0001) return trimZeros(v.toFixed(4));
  return "0";
}

/**
 * Formats a big number. `digits` = significant digits for values >= 1000 (default 3).
 * suffix: 1.23K, 45.6M, 789B, 1.00T, 1.00aa, ...   sci: 1.23e6
 */
export function formatBig(b: Big | null | undefined, mode: NumberMode = "suffix", digits = 3): string {
  if (!b || !Number.isFinite(b.m) || !Number.isFinite(b.e) || b.m === 0) return "0";
  const n = B.make(b.m, Math.round(b.e));
  if (n.m === 0) return "0";
  if (n.m < 0) {
    const pos = formatBig({ m: -n.m, e: n.e }, mode, digits);
    return pos === "0" ? "0" : `-${pos}`;
  }
  const sig = Math.max(1, Math.min(15, Math.floor(digits) || 3));
  if (n.e < 3) {
    const small = formatSmall(n.m * Math.pow(10, n.e));
    if (small !== "1000") return small;
    n.m = 1;
    n.e = 3;
  }
  if (mode === "sci") {
    let m = n.m.toFixed(Math.max(0, sig - 1));
    let e = n.e;
    if (m.startsWith("10")) {
      m = (1).toFixed(Math.max(0, sig - 1));
      e += 1;
    }
    return `${m}e${e}`;
  }
  let group = Math.floor(n.e / 3);
  const rem = n.e - group * 3; // 0..2
  const x = n.m * (rem === 0 ? 1 : rem === 1 ? 10 : 100);
  let text = x.toFixed(Math.max(0, sig - 1 - rem));
  if (Number(text) >= 1000) {
    group += 1;
    text = (1).toFixed(Math.max(0, sig - 1));
  }
  return text + groupSuffix(group);
}

export function formatNumber(n: number, mode: NumberMode = "suffix", digits = 3): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "0";
  return formatBig(B.big(n), mode, digits);
}

/** Per-second rate, e.g. "1.25/s". */
export function formatRate(b: Big | number | null | undefined, mode: NumberMode = "suffix", digits = 3): string {
  const text = typeof b === "number" ? formatNumber(b, mode, digits) : formatBig(b, mode, digits);
  return `${text}/s`;
}

export interface DurationParts {
  d: number;
  h: number;
  m: number;
  s: number;
}

export function durationParts(seconds: number): DurationParts {
  let left = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const d = Math.floor(left / 86400);
  left -= d * 86400;
  const h = Math.floor(left / 3600);
  left -= h * 3600;
  const m = Math.floor(left / 60);
  return { d, h, m, s: left - m * 60 };
}

/**
 * Compact duration from the two (or `maxParts`) largest units, with the unit letters d/h/m/s that
 * read the same in Czech and English: "45s", "3m 20s", "2h 05m", "1d 2h". Infinite -> "--".
 */
export function formatDuration(seconds: number, maxParts = 2): string {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) return "0s";
  if (seconds === Infinity) return "--";
  const p = durationParts(seconds);
  const vals = [p.d, p.h, p.m, p.s];
  const units = ["d", "h", "m", "s"];
  let first = 0;
  while (first < 3 && vals[first] === 0) first++;
  let out = "";
  const last = Math.min(3, first + Math.max(1, maxParts) - 1);
  for (let i = first; i <= last; i++) {
    const v = vals[i];
    out += (i > first ? " " : "") + (i > first && i >= 2 && v < 10 ? `0${v}` : String(v)) + units[i];
  }
  return out;
}

/** Fraction to percent: 0.253 -> "25%", with digits = 1 -> "25.3%". */
export function formatPct(fraction: number, digits = 0): string {
  if (typeof fraction !== "number" || !Number.isFinite(fraction)) return "0%";
  const v = fraction * 100;
  if (Math.abs(v) >= 1e6) return `${formatNumber(v)}%`;
  const text = digits > 0 ? trimZeros(v.toFixed(digits)) : v.toFixed(0);
  return `${text === "-0" ? "0" : text}%`;
}

/** Multiplier label: 1.5 -> "x1.5", 2 -> "x2", 1234 -> "x1.23K". */
export function formatMult(n: number): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "x1";
  return `x${n < 1000 ? trimZeros(n.toFixed(2)) : formatNumber(n)}`;
}

// Big numbers as plain data ({ m, e }: m * 10^e), so game state stays JSON and Hermes-safe.
// All functions are pure and return new values unless the name ends with "In" (in-place on the first argument).
import type { Big } from "./types";

export const ZERO: Readonly<Big> = Object.freeze({ m: 0, e: 0 });
export const ONE: Readonly<Big> = Object.freeze({ m: 1, e: 0 });

const POW10: number[] = [];
for (let i = 0; i <= 308; i++) POW10.push(Number(`1e${i}`));
const pow10 = (n: number): number => (n >= 0 && n <= 308 ? POW10[n] : n < 0 && n >= -308 ? 1 / POW10[-n] : Math.pow(10, n));

/** Mantissa digits kept apart when adding: beyond this the smaller operand is ignored. */
const PRECISION = 17;

function norm(m: number, e: number): Big {
  if (m === 0 || !Number.isFinite(m) || Number.isNaN(e)) return { m: 0, e: 0 };
  const a = Math.abs(m);
  if (a >= 1 && a < 10) return { m, e };
  const shift = Math.floor(Math.log10(a));
  let nm = m / pow10(shift);
  let ne = e + shift;
  // floating point can leave 9.999999 or 10.0000001
  const na = Math.abs(nm);
  if (na >= 10) {
    nm /= 10;
    ne += 1;
  } else if (na < 1) {
    nm *= 10;
    ne -= 1;
  }
  return { m: nm, e: ne };
}

export function big(n: number): Big {
  return norm(n, 0);
}

export function make(m: number, e: number): Big {
  return norm(m, e);
}

export function clone(a: Big): Big {
  return { m: a.m, e: a.e };
}

export function isZero(a: Big): boolean {
  return a.m === 0;
}

export function toNumber(a: Big): number {
  if (a.m === 0) return 0;
  if (a.e > 308) return a.m > 0 ? Number.MAX_VALUE : -Number.MAX_VALUE;
  if (a.e < -320) return 0;
  return a.m * pow10(a.e);
}

/** log10 of a positive Big; -Infinity for zero or negative. */
export function log10(a: Big): number {
  return a.m > 0 ? a.e + Math.log10(a.m) : -Infinity;
}

export function fromLog10(l: number): Big {
  if (!Number.isFinite(l)) return { m: 0, e: 0 };
  const e = Math.floor(l);
  return norm(Math.pow(10, l - e), e);
}

/** Plain value of a small Big with float dust removed (15 significant digits), so 2.3e1 is exactly 23. */
function small(a: Big): number {
  const v = a.m * pow10(a.e);
  const scale = pow10(14 - a.e);
  return Math.round(v * scale) / scale;
}

export function add(a: Big, b: Big): Big {
  if (a.m === 0) return { m: b.m, e: b.e };
  if (b.m === 0) return { m: a.m, e: a.e };
  // Everyday magnitudes go through native arithmetic so whole numbers stay whole (23 - 3 is exactly 20).
  if (a.e <= 12 && b.e <= 12 && a.e >= -6 && b.e >= -6) {
    const scale = pow10(13 - (a.e > b.e ? a.e : b.e));
    return norm(Math.round((small(a) + small(b)) * scale) / scale, 0);
  }
  const d = a.e - b.e;
  if (d > PRECISION) return { m: a.m, e: a.e };
  if (d < -PRECISION) return { m: b.m, e: b.e };
  return d >= 0 ? norm(a.m + b.m / pow10(d), a.e) : norm(a.m / pow10(-d) + b.m, b.e);
}

export function sub(a: Big, b: Big): Big {
  return add(a, { m: -b.m, e: b.e });
}

/** a - b, clamped at zero. */
export function subClamp(a: Big, b: Big): Big {
  const r = sub(a, b);
  return r.m < 0 ? { m: 0, e: 0 } : r;
}

export function mul(a: Big, b: Big): Big {
  return norm(a.m * b.m, a.e + b.e);
}

export function mulN(a: Big, n: number): Big {
  if (n === 0 || a.m === 0) return { m: 0, e: 0 };
  if (!Number.isFinite(n)) return n > 0 ? { m: a.m, e: a.e + 308 } : { m: 0, e: 0 };
  return norm(a.m * n, a.e);
}

export function div(a: Big, b: Big): Big {
  if (b.m === 0) return { m: 0, e: 0 };
  return norm(a.m / b.m, a.e - b.e);
}

export function divN(a: Big, n: number): Big {
  if (n === 0) return { m: 0, e: 0 };
  return norm(a.m / n, a.e);
}

/** base^exp for a plain positive base and any real exponent (cost curves). */
export function powN(base: number, exp: number): Big {
  if (base <= 0) return { m: 0, e: 0 };
  return fromLog10(Math.log10(base) * exp);
}

export function pow(a: Big, exp: number): Big {
  if (a.m <= 0) return { m: 0, e: 0 };
  return fromLog10(log10(a) * exp);
}

export function cmp(a: Big, b: Big): -1 | 0 | 1 {
  if (a.m === b.m && a.e === b.e) return 0;
  const sa = Math.sign(a.m);
  const sb = Math.sign(b.m);
  if (sa !== sb) return sa > sb ? 1 : -1;
  if (sa === 0) return 0;
  if (a.e !== b.e) return a.e > b.e === sa > 0 ? 1 : -1;
  return a.m > b.m ? 1 : -1;
}

export const gt = (a: Big, b: Big): boolean => cmp(a, b) > 0;
export const gte = (a: Big, b: Big): boolean => cmp(a, b) >= 0;
export const lt = (a: Big, b: Big): boolean => cmp(a, b) < 0;
export const lte = (a: Big, b: Big): boolean => cmp(a, b) <= 0;
export const eq = (a: Big, b: Big): boolean => cmp(a, b) === 0;
export const gteN = (a: Big, n: number): boolean => cmp(a, big(n)) >= 0;
export const ltN = (a: Big, n: number): boolean => cmp(a, big(n)) < 0;

export function max(a: Big, b: Big): Big {
  return cmp(a, b) >= 0 ? clone(a) : clone(b);
}

export function min(a: Big, b: Big): Big {
  return cmp(a, b) <= 0 ? clone(a) : clone(b);
}

export function floor(a: Big): Big {
  if (a.e >= 15) return clone(a);
  if (a.e < 0) return a.m >= 0 ? { m: 0, e: 0 } : norm(-1, 0);
  return norm(Math.floor(a.m * pow10(a.e) + 1e-9), 0);
}

/** a / b as a plain number, clamped to [0, cap]. Safe for huge operands (progress bars, ratios). */
export function ratio(a: Big, b: Big, cap = 1): number {
  if (b.m <= 0) return a.m > 0 ? cap : 0;
  if (a.m <= 0) return 0;
  const l = log10(a) - log10(b);
  if (l > 300) return cap;
  if (l < -300) return 0;
  return Math.min(cap, Math.pow(10, l));
}

/**
 * Sum of a geometric cost series: first * growth^0 + ... + first * growth^(n-1).
 * `first` is the cost of the next level.
 */
export function geomSum(first: Big, growth: number, n: number): Big {
  if (n <= 0) return { m: 0, e: 0 };
  if (growth === 1) return mulN(first, n);
  // (growth^n - 1) / (growth - 1), computed in log space when growth^n overflows a double
  const ln = Math.log10(growth) * n;
  if (ln < 300) return mulN(first, (Math.pow(growth, n) - 1) / (growth - 1));
  return mul(first, divN(fromLog10(ln), growth - 1));
}

/** Largest n such that geomSum(first, growth, n) <= budget (0 if not even one). */
export function geomMax(first: Big, growth: number, budget: Big, limit = 1e6): number {
  if (first.m <= 0) return limit;
  if (cmp(budget, first) < 0) return 0;
  if (growth === 1) return Math.min(limit, Math.floor(toNumber(div(budget, first))));
  // n = floor(log_growth(budget * (growth - 1) / first + 1))
  const x = mulN(div(budget, first), growth - 1);
  const l = x.e > 15 ? log10(x) : Math.log10(toNumber(x) + 1);
  let n = Math.floor(l / Math.log10(growth) + 1e-9);
  n = Math.max(1, Math.min(limit, n));
  while (n > 1 && cmp(geomSum(first, growth, n), budget) > 0) n--;
  return n;
}

export function isBig(v: unknown): v is Big {
  return typeof v === "object" && v !== null && typeof (v as Big).m === "number" && typeof (v as Big).e === "number";
}

/** Repairs values coming from a save file (NaN, missing fields, denormalised). */
export function sanitize(v: unknown): Big {
  if (typeof v === "number") return Number.isFinite(v) ? big(v) : { m: 0, e: 0 };
  if (!isBig(v) || !Number.isFinite(v.m) || !Number.isFinite(v.e)) return { m: 0, e: 0 };
  return norm(v.m, Math.round(v.e));
}

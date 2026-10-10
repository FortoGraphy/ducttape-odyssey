// In-place Big helpers for the 10 Hz hot path. They only ever mutate objects owned by core
// (scratch values, Game.rates, the hopper), never values that other areas may alias.
import type { Big } from "../types";

const P10: number[] = [];
for (let i = 0; i <= 308; i++) P10.push(Number(`1e${i}`));
const p10 = (n: number): number => (n >= 0 ? (n <= 308 ? P10[n] : Infinity) : n >= -308 ? 1 / P10[-n] : 0);

/** Digits beyond which the smaller operand of an addition is ignored (same as big.ts). */
const PRECISION = 17;

export function zero(): Big {
  return { m: 0, e: 0 };
}

export function copy(out: Big, a: Readonly<Big>): void {
  out.m = a.m;
  out.e = a.e;
}

export function clear(out: Big): void {
  out.m = 0;
  out.e = 0;
}

export function normIn(a: Big): void {
  const m = a.m;
  if (m === 0 || !Number.isFinite(m) || Number.isNaN(a.e)) {
    a.m = 0;
    a.e = 0;
    return;
  }
  const abs = m < 0 ? -m : m;
  if (abs >= 1) {
    if (abs < 10) return;
    if (abs < 100) {
      a.m = m / 10;
      a.e += 1;
      return;
    }
  } else if (abs >= 0.1) {
    a.m = m * 10;
    a.e -= 1;
    return;
  }
  const shift = Math.floor(Math.log10(abs));
  let nm = m / p10(shift);
  let ne = a.e + shift;
  const na = nm < 0 ? -nm : nm;
  if (na >= 10) {
    nm /= 10;
    ne += 1;
  } else if (na < 1) {
    nm *= 10;
    ne -= 1;
  }
  a.m = nm;
  a.e = ne;
}

/** a += b */
export function addIn(a: Big, b: Readonly<Big>): void {
  if (b.m === 0) return;
  if (a.m === 0) {
    a.m = b.m;
    a.e = b.e;
    return;
  }
  const d = a.e - b.e;
  if (d > PRECISION) return;
  if (d < -PRECISION) {
    a.m = b.m;
    a.e = b.e;
    return;
  }
  if (d >= 0) a.m += b.m / p10(d);
  else {
    a.m = a.m / p10(-d) + b.m;
    a.e = b.e;
  }
  normIn(a);
}

/** a = max(0, a - b) */
export function subClampIn(a: Big, b: Readonly<Big>): void {
  if (b.m === 0 || a.m === 0) return;
  const d = a.e - b.e;
  if (d > PRECISION) return;
  if (d < 0) {
    // b has the larger exponent: a - b <= 0 unless a is not normalised, which never happens here
    const v = a.m / p10(-d) - b.m;
    if (v <= 0) {
      a.m = 0;
      a.e = 0;
      return;
    }
    a.m = v;
    a.e = b.e;
  } else {
    a.m -= b.m / p10(d);
    if (a.m <= 0) {
      a.m = 0;
      a.e = 0;
      return;
    }
  }
  normIn(a);
}

/** out = a * n */
export function mulNTo(out: Big, a: Readonly<Big>, n: number): void {
  if (n === 0 || a.m === 0 || !Number.isFinite(n)) {
    out.m = 0;
    out.e = 0;
    return;
  }
  out.m = a.m * n;
  out.e = a.e;
  normIn(out);
}

/** out = a * b */
export function mulTo(out: Big, a: Readonly<Big>, b: Readonly<Big>): void {
  out.m = a.m * b.m;
  out.e = a.e + b.e;
  normIn(out);
}

const t: Big = { m: 0, e: 0 };

/** acc += a * b */
export function addMulIn(acc: Big, a: Readonly<Big>, b: Readonly<Big>): void {
  t.m = a.m * b.m;
  t.e = a.e + b.e;
  normIn(t);
  addIn(acc, t);
}

/** acc += a * n */
export function addMulNIn(acc: Big, a: Readonly<Big>, n: number): void {
  mulNTo(t, a, n);
  addIn(acc, t);
}

/** acc = max(0, acc - a * n) */
export function subMulNClampIn(acc: Big, a: Readonly<Big>, n: number): void {
  mulNTo(t, a, n);
  subClampIn(acc, t);
}

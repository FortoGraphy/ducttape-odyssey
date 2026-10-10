// Deterministic PRNG helpers. Galaxy content is a pure function of indices: use hashSeed + Rng.
// Gameplay rolls use the state-backed stream in kernel.ts (roll, rollInt, pick) so saves stay deterministic.

/** One mulberry32 step: returns the next state and a float in [0, 1). */
export function mulberry(state: number): { state: number; value: number } {
  const s = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { state: s, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

/** Mixes any number of integers into one 32-bit seed. */
export function hashSeed(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < parts.length; i++) {
    let k = Math.imul(parts[i] | 0, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    h ^= Math.imul(k, 0x1b873593);
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) | 0;
}

export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h | 0;
}

/** Small local generator for pure generation code. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed | 0;
  }
  next(): number {
    const r = mulberry(this.s);
    this.s = r.state;
    return r.value;
  }
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  weighted<T>(arr: readonly T[], weight: (x: T) => number): T {
    let total = 0;
    for (let i = 0; i < arr.length; i++) total += Math.max(0, weight(arr[i]));
    let r = this.next() * total;
    for (let i = 0; i < arr.length; i++) {
      r -= Math.max(0, weight(arr[i]));
      if (r < 0) return arr[i];
    }
    return arr[arr.length - 1];
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }
}

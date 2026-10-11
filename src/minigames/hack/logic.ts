// Pure logic of the hacking mini-game (pipe rotation). No React / React Native imports: it runs in
// Node for the solvability tests in tests/minigames/hack.test.ts.
//
// Board model: an n x n grid of tiles. Every tile has a shape (a set of open sides in its canonical
// orientation) and a rotation 0..3 (quarter turns clockwise). The source sits outside the board, left
// of `sourceRow`; each sink sits outside, right of one of `sinkRows`. A tile is powered when it is
// connected through matching openings to the source cell and that cell opens to the west.
import type { MinigameTier } from "@/engine/types";

export const DIR_N = 1;
export const DIR_E = 2;
export const DIR_S = 4;
export const DIR_W = 8;
const DIRS = [DIR_N, DIR_E, DIR_S, DIR_W] as const;
const DR = [-1, 0, 1, 0];
const DC = [0, 1, 0, -1];

export type Shape = "blank" | "cap" | "straight" | "elbow" | "tee" | "cross";

/** Open sides of every shape at rotation 0. */
export const SHAPE_MASK: Record<Shape, number> = {
  blank: 0,
  cap: DIR_N,
  straight: DIR_N | DIR_S,
  elbow: DIR_N | DIR_E,
  tee: DIR_N | DIR_E | DIR_S,
  cross: DIR_N | DIR_E | DIR_S | DIR_W,
};

export interface HackBoard {
  tier: MinigameTier;
  size: number;
  shape: Shape[];
  /** Scrambled start rotation of every tile. */
  rot: number[];
  /** A rotation that solves the board (the generator's witness). */
  solution: number[];
  /** Tiles the player cannot rotate. */
  locked: boolean[];
  /** Tiles that carry current from the source to a sink in the witness solution. */
  onPath: boolean[];
  sourceRow: number;
  sinkRows: number[];
  /** Taps needed to reach the witness solution from the scrambled start. */
  par: number;
  /** Taps after which the terminal locks the player out. */
  budget: number;
}

export interface HackSpec {
  size: number;
  sinks: number;
  locks: number;
  /** Seconds between ICE scrambles, 0 = no ICE. */
  iceEvery: number;
  minPath: number;
  maxPath: number;
  minPar: number;
}

export const HACK_SPEC: Record<MinigameTier, HackSpec> = {
  1: { size: 4, sinks: 1, locks: 0, iceEvery: 0, minPath: 6, maxPath: 9, minPar: 6 },
  2: { size: 5, sinks: 1, locks: 0, iceEvery: 0, minPath: 8, maxPath: 13, minPar: 9 },
  3: { size: 6, sinks: 2, locks: 4, iceEvery: 9, minPath: 13, maxPath: 21, minPar: 14 },
};

/** Rotates a side mask by `r` quarter turns clockwise. */
export function rotMask(mask: number, r: number): number {
  const k = ((r % 4) + 4) % 4;
  return ((mask << k) | (mask >> (4 - k))) & 15;
}

const opposite = (d: number): number => rotMask(d, 2);

export function tileMask(board: HackBoard, rot: readonly number[], i: number): number {
  return rotMask(SHAPE_MASK[board.shape[i]], rot[i]);
}

function shapeOfMask(mask: number): { shape: Shape; rot: number } {
  const shapes: Shape[] = ["blank", "cap", "straight", "elbow", "tee", "cross"];
  for (const shape of shapes) {
    for (let r = 0; r < 4; r++) if (rotMask(SHAPE_MASK[shape], r) === mask) return { shape, rot: r };
  }
  return { shape: "blank", rot: 0 };
}

export interface PowerState {
  on: boolean[];
  sinks: boolean[];
  solved: boolean;
  /** Number of powered tiles. */
  count: number;
}

/** Flood fill from the source. Called on every change of the board, never per frame. */
export function computePower(board: HackBoard, rot: readonly number[]): PowerState {
  const n = board.size;
  const on: boolean[] = new Array(n * n).fill(false);
  let count = 0;
  const start = board.sourceRow * n;
  if (tileMask(board, rot, start) & DIR_W) {
    const stack = [start];
    on[start] = true;
    while (stack.length) {
      const i = stack.pop() as number;
      count++;
      const r = (i / n) | 0;
      const c = i % n;
      const m = tileMask(board, rot, i);
      for (let d = 0; d < 4; d++) {
        if (!(m & DIRS[d])) continue;
        const nr = r + DR[d];
        const nc = c + DC[d];
        if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
        const j = nr * n + nc;
        if (on[j]) continue;
        if (tileMask(board, rot, j) & opposite(DIRS[d])) {
          on[j] = true;
          stack.push(j);
        }
      }
    }
  }
  const sinks = board.sinkRows.map((row) => {
    const i = row * n + n - 1;
    return on[i] && (tileMask(board, rot, i) & DIR_E) !== 0;
  });
  return { on, sinks, solved: sinks.every(Boolean), count };
}

/** Clockwise taps needed to turn tile `i` from rotation `from` into the look of rotation `to`. */
export function clicksBetween(shape: Shape, from: number, to: number): number {
  const base = SHAPE_MASK[shape];
  const want = rotMask(base, to);
  for (let k = 0; k < 4; k++) if (rotMask(base, from + k) === want) return k;
  return 0;
}

export function computePar(board: Pick<HackBoard, "shape" | "solution" | "onPath">, rot: readonly number[]): number {
  let par = 0;
  for (let i = 0; i < rot.length; i++) if (board.onPath[i]) par += clicksBetween(board.shape[i], rot[i], board.solution[i]);
  return par;
}

/** Share of the witness path that already sits in its solved orientation (partial credit). */
export function pathProgress(board: HackBoard, rot: readonly number[]): number {
  let total = 0;
  let ok = 0;
  for (let i = 0; i < rot.length; i++) {
    if (!board.onPath[i]) continue;
    total++;
    if (clicksBetween(board.shape[i], rot[i], board.solution[i]) === 0) ok++;
  }
  return total === 0 ? 0 : ok / total;
}

export function moveBudget(par: number): number {
  return Math.ceil(par * 2.2) + 6;
}

function shuffled<T>(arr: T[], rnd: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/** Spanning tree over the grid ("growing tree": mostly depth-first, sometimes branching). */
function growTree(n: number, rnd: () => number): number[] {
  const links: number[] = new Array(n * n).fill(0);
  const seen: boolean[] = new Array(n * n).fill(false);
  const first = Math.floor(rnd() * n * n);
  const active = [first];
  seen[first] = true;
  while (active.length) {
    const pick = rnd() < 0.72 ? active.length - 1 : Math.floor(rnd() * active.length);
    const i = active[pick];
    const r = (i / n) | 0;
    const c = i % n;
    const order = shuffled([0, 1, 2, 3], rnd);
    let grown = false;
    for (const d of order) {
      const nr = r + DR[d];
      const nc = c + DC[d];
      if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
      const j = nr * n + nc;
      if (seen[j]) continue;
      seen[j] = true;
      links[i] |= DIRS[d];
      links[j] |= opposite(DIRS[d]);
      active.push(j);
      grown = true;
      break;
    }
    if (!grown) active.splice(pick, 1);
  }
  return links;
}

/** Unique tree path between two cells (cells as indices), or null when they are not connected. */
function treePath(links: readonly number[], n: number, from: number, to: number): number[] | null {
  const prev: number[] = new Array(n * n).fill(-2);
  const queue = [from];
  prev[from] = -1;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    if (i === to) break;
    const r = (i / n) | 0;
    const c = i % n;
    for (let d = 0; d < 4; d++) {
      if (!(links[i] & DIRS[d])) continue;
      const j = (r + DR[d]) * n + c + DC[d];
      if (prev[j] !== -2) continue;
      prev[j] = i;
      queue.push(j);
    }
  }
  if (prev[to] === -2) return null;
  const path: number[] = [];
  for (let i = to; i !== -1; i = prev[i]) path.push(i);
  return path.reverse();
}

interface Layout {
  links: number[];
  onPath: boolean[];
  sourceRow: number;
  sinkRows: number[];
  pathLen: number;
}

function layoutFor(spec: HackSpec, rnd: () => number): Layout {
  const n = spec.size;
  let best: Layout | null = null;
  let bestMiss = Infinity;
  for (let attempt = 0; attempt < 60; attempt++) {
    const links = growTree(n, rnd);
    const sourceRow = Math.floor(rnd() * n);
    const rows = shuffled(
      Array.from({ length: n }, (_, i) => i),
      rnd,
    );
    const sinkRows = rows.slice(0, spec.sinks).sort((a, b) => a - b);
    // Two sinks on neighbouring rows read as one blob: keep a gap.
    if (spec.sinks === 2 && sinkRows[1] - sinkRows[0] < 2) continue;
    const onPath: boolean[] = new Array(n * n).fill(false);
    let pathLen = 0;
    for (const row of sinkRows) {
      const path = treePath(links, n, sourceRow * n, row * n + n - 1);
      if (!path) continue;
      for (const i of path) {
        if (!onPath[i]) pathLen++;
        onPath[i] = true;
      }
    }
    const miss = pathLen < spec.minPath ? spec.minPath - pathLen : pathLen > spec.maxPath ? pathLen - spec.maxPath : 0;
    if (miss < bestMiss) {
      bestMiss = miss;
      best = { links, onPath, sourceRow, sinkRows, pathLen };
      if (miss === 0) break;
    }
  }
  // A spanning tree always connects every pair of cells, so `best` exists after the first attempt
  // that passes the sink spacing rule; the fallback below only guards against 60 unlucky draws.
  if (!best) {
    const links = growTree(n, rnd);
    const sinkRows = spec.sinks === 2 ? [0, n - 1] : [n - 1];
    const onPath: boolean[] = new Array(n * n).fill(false);
    let pathLen = 0;
    for (const row of sinkRows) {
      for (const i of treePath(links, n, 0, row * n + n - 1) ?? []) {
        if (!onPath[i]) pathLen++;
        onPath[i] = true;
      }
    }
    best = { links, onPath, sourceRow: 0, sinkRows, pathLen };
  }
  return best;
}

/**
 * Builds a board that is solvable by construction: a spanning tree gives every cell its pipe piece,
 * the tree path(s) from the source cell to the sink cell(s) are the witness, then the unlocked tiles
 * are rotated away from it.
 *   tier 1: only the path keeps its pipes (the rest of the board is empty);
 *   tier 2: side branches of the tree stay as dead ends;
 *   tier 3: the full tree, two sinks and a few locked tiles.
 */
export function generateBoard(tier: MinigameTier, rnd: () => number): HackBoard {
  const spec = HACK_SPEC[tier];
  const n = spec.size;
  const layout = layoutFor(spec, rnd);
  const links = layout.links.slice();
  const { onPath, sourceRow, sinkRows } = layout;
  const source = sourceRow * n;

  if (tier === 1) {
    // Keep the path only: drop every link that leaves it.
    for (let i = 0; i < n * n; i++) {
      if (!onPath[i]) {
        links[i] = 0;
        continue;
      }
      const r = (i / n) | 0;
      const c = i % n;
      for (let d = 0; d < 4; d++) {
        if (!(links[i] & DIRS[d])) continue;
        const j = (r + DR[d]) * n + c + DC[d];
        if (!onPath[j]) links[i] &= ~DIRS[d];
      }
    }
  } else if (tier === 2) {
    // Thin the tree a little so the board is not a wall of pipes: some leaves become empty cells.
    for (let i = 0; i < n * n; i++) {
      if (onPath[i]) continue;
      const m = links[i];
      const isLeaf = m === DIR_N || m === DIR_E || m === DIR_S || m === DIR_W;
      if (!isLeaf || rnd() >= 0.4) continue;
      const d = DIRS.indexOf(m as 1 | 2 | 4 | 8);
      const j = (((i / n) | 0) + DR[d]) * n + (i % n) + DC[d];
      links[i] = 0;
      links[j] &= ~opposite(m);
    }
  }

  // External connectors.
  links[source] |= DIR_W;
  for (const row of sinkRows) links[row * n + n - 1] |= DIR_E;

  const shape: Shape[] = [];
  const solution: number[] = [];
  for (let i = 0; i < n * n; i++) {
    const s = shapeOfMask(links[i]);
    shape.push(s.shape);
    solution.push(s.rot);
  }

  const locked: boolean[] = new Array(n * n).fill(false);
  if (spec.locks > 0) {
    const sinkCells = sinkRows.map((row) => row * n + n - 1);
    const pathCells = shuffled(
      Array.from({ length: n * n }, (_, i) => i).filter((i) => onPath[i] && i !== source && !sinkCells.includes(i) && shape[i] !== "cross"),
      rnd,
    );
    const offCells = shuffled(
      Array.from({ length: n * n }, (_, i) => i).filter((i) => !onPath[i] && shape[i] !== "blank" && shape[i] !== "cross"),
      rnd,
    );
    const onCount = Math.min(pathCells.length, Math.ceil(spec.locks / 2));
    for (let k = 0; k < onCount; k++) locked[pathCells[k]] = true;
    for (let k = 0; k < Math.min(offCells.length, spec.locks - onCount); k++) locked[offCells[k]] = true;
  }

  const board: HackBoard = { tier, size: n, shape, rot: solution.slice(), solution, locked, onPath, sourceRow, sinkRows, par: 0, budget: 0 };

  // Scramble. Later attempts push harder so the loop always ends with an unsolved board at or above
  // the minimum par.
  for (let attempt = 0; attempt < 24; attempt++) {
    const force = attempt >= 8;
    const rot = solution.slice();
    for (let i = 0; i < n * n; i++) {
      if (shape[i] === "blank") continue;
      if (locked[i]) {
        // Locked path tiles stay solved (they are the fixed points of the puzzle); locked
        // bystanders sit in an arbitrary orientation.
        if (!onPath[i]) rot[i] = Math.floor(rnd() * 4);
        continue;
      }
      if (onPath[i]) {
        const wrong = force || rnd() < 0.85;
        rot[i] = (solution[i] + (wrong ? 1 + Math.floor(rnd() * 3) : 0)) % 4;
        // A straight piece turned by two looks solved: nudge it by one instead.
        if (wrong && shape[i] === "straight" && clicksBetween(shape[i], rot[i], solution[i]) === 0) rot[i] = (rot[i] + 1) % 4;
      } else {
        rot[i] = Math.floor(rnd() * 4);
      }
    }
    board.rot = rot;
    board.par = computePar(board, rot);
    if (board.par >= spec.minPar && !computePower(board, rot).solved) break;
  }
  if (computePower(board, board.rot).solved) {
    // Last resort (never hit for the tested seeds): cut the source so nothing is powered.
    board.rot[source] = (board.solution[source] + 1) % 4;
    if (computePower(board, board.rot).solved) board.rot[source] = (board.solution[source] + 2) % 4;
    board.par = computePar(board, board.rot);
  }
  board.budget = moveBudget(board.par);
  return board;
}

/**
 * Picks the tile the ICE scrambles next: an unlocked path tile that currently sits in its solved
 * orientation (powered ones first, so the player sees it break). Returns -1 when nothing qualifies.
 * The scramble itself is one quarter turn counter-clockwise, so one tap repairs it.
 */
export function pickIceTarget(board: HackBoard, rot: readonly number[], rnd: () => number): number {
  const power = computePower(board, rot);
  const lit: number[] = [];
  const dark: number[] = [];
  for (let i = 0; i < rot.length; i++) {
    if (!board.onPath[i] || board.locked[i] || board.shape[i] === "cross") continue;
    if (clicksBetween(board.shape[i], rot[i], board.solution[i]) !== 0) continue;
    (power.on[i] ? lit : dark).push(i);
  }
  const pool = lit.length ? lit : dark;
  if (!pool.length) return -1;
  return pool[Math.floor(rnd() * pool.length)];
}

export interface HackOutcome {
  solved: boolean;
  moves: number;
  par: number;
  /** Share of the time limit still left, 0..1. */
  timeLeft: number;
  /** pathProgress() at the end, used when the board was not solved. */
  progress: number;
}

/**
 * 0..1. Solved boards score 0.5..1 from taps against par (60 %) and speed (40 %); a perfect needs par
 * taps (or fewer through a shortcut) with about 70 % of the clock left. Unsolved boards stay below 0.5.
 */
export function hackScore(o: HackOutcome): number {
  if (!o.solved) return Math.min(0.45, 0.05 + 0.4 * o.progress);
  const over = Math.max(0, o.moves - o.par);
  const moveQ = Math.max(0, 1 - over / Math.max(4, o.par * 0.9));
  const timeQ = Math.max(0, Math.min(1, o.timeLeft / 0.7));
  return 0.5 + 0.3 * moveQ + 0.2 * timeQ;
}

/**
 * Independent solver used by the tests: it knows nothing about the generator's witness. It searches
 * for simple paths from each sink back to the source (or to a tile already carrying current) and asks
 * every tile only one question: is there an allowed rotation that opens all the sides the path needs?
 * Returns a full rotation array or null.
 */
export function solveBoard(board: HackBoard, maxNodes = 400000): number[] | null {
  const n = board.size;
  const need: number[] = new Array(n * n).fill(0);
  /** Index of the sink whose path claimed the tile, -1 = free. */
  const owner: number[] = new Array(n * n).fill(-1);
  const source = board.sourceRow * n;
  let nodes = 0;

  const rotationFor = (i: number, mask: number): number => {
    const base = SHAPE_MASK[board.shape[i]];
    if (board.locked[i]) return (rotMask(base, board.rot[i]) & mask) === mask ? board.rot[i] : -1;
    for (let r = 0; r < 4; r++) if ((rotMask(base, r) & mask) === mask) return r;
    return -1;
  };

  const connectSink = (k: number): boolean => {
    if (k >= board.sinkRows.length) return true;
    const walk = (i: number, mask: number): boolean => {
      if (++nodes > maxNodes) return false;
      if (owner[i] >= 0) {
        // A tile that already carries current for an earlier sink: join it there.
        const before = need[i];
        if (rotationFor(i, before | mask) < 0) return false;
        need[i] = before | mask;
        if (connectSink(k + 1)) return true;
        need[i] = before;
        return false;
      }
      owner[i] = k;
      if (i === source && rotationFor(i, mask | DIR_W) >= 0) {
        need[i] = mask | DIR_W;
        if (connectSink(k + 1)) return true;
      }
      const r = (i / n) | 0;
      const c = i % n;
      // West first: the source is on the left edge.
      for (const d of [3, 0, 2, 1]) {
        const nr = r + DR[d];
        const nc = c + DC[d];
        if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
        const j = nr * n + nc;
        if (owner[j] === k) continue; // already on the path being built
        const out = mask | DIRS[d];
        if (rotationFor(i, out) < 0) continue;
        need[i] = out;
        if (walk(j, opposite(DIRS[d]))) return true;
      }
      need[i] = 0;
      owner[i] = -1;
      return false;
    };
    return walk(board.sinkRows[k] * n + n - 1, DIR_E);
  };

  if (!connectSink(0)) return null;
  const rot = board.rot.slice();
  for (let i = 0; i < n * n; i++) {
    if (owner[i] < 0) continue;
    const r = rotationFor(i, need[i]);
    if (r < 0) return null;
    rot[i] = r;
  }
  return rot;
}

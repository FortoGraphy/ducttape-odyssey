// Seeded wiring puzzle. Every connector has a color and a symbol; the symbol alone is enough to
// tell connectors apart (color-blind safe). Tier 3 adds "twins": two identical connectors per side
// whose cables must not cross, so the upper twin on the left belongs to the upper twin on the right.
import type { MinigameTier } from "@/engine/types";
import { palette } from "@/ui/theme";

import { miniRng } from "../shared";

export type WireSymbol = "triUp" | "triDown" | "disc" | "ring" | "square" | "diamond" | "plus" | "bars";

export interface WireKind {
  color: string;
  /** Ink for the symbol printed on the cap. */
  ink: string;
  symbol: WireSymbol;
  /** Dashed overlay on the cable: a second, color-independent cue. */
  striped: boolean;
}

const DARK = "#15171C";
const LIGHT = palette.bone2;

// Look-alike neighbours on purpose: orange/amber, mint/teal, cobalt/violet, each with a similar
// but distinct symbol.
const KINDS: WireKind[] = [
  { color: palette.orange, ink: DARK, symbol: "triUp", striped: false },
  { color: palette.amber, ink: DARK, symbol: "triDown", striped: true },
  { color: palette.mint, ink: DARK, symbol: "disc", striped: false },
  { color: palette.teal2, ink: DARK, symbol: "ring", striped: true },
  { color: palette.cobalt1, ink: LIGHT, symbol: "square", striped: false },
  { color: palette.violet2, ink: LIGHT, symbol: "diamond", striped: true },
  { color: palette.yellow, ink: DARK, symbol: "plus", striped: false },
  { color: palette.red1, ink: LIGHT, symbol: "bars", striped: true },
];

export interface WirePuzzle {
  n: number;
  /** Kind per socket, top to bottom. */
  left: WireKind[];
  right: WireKind[];
  /** Correct right socket for every left socket. */
  solution: number[];
  /** Left sockets whose kind appears twice. */
  twin: boolean[];
  hasTwins: boolean;
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

export function buildPuzzle(seed: number, tier: MinigameTier): WirePuzzle {
  const rnd = miniRng(seed ^ 0x71e5);
  let kinds: number[];
  if (tier === 1) kinds = [0, 2, 4, 6];
  else if (tier === 2) kinds = [0, 1, 2, 3, 4, 5];
  else {
    const twins = shuffle([0, 1, 2, 3, 4, 5], rnd).slice(0, 2);
    kinds = [0, 1, 2, 3, 4, 5, twins[0], twins[1]];
  }
  const n = kinds.length;
  const leftIds = shuffle(kinds, rnd);
  let rightIds = shuffle(kinds, rnd);
  // Avoid boards where most cables run straight across.
  for (let tries = 0; tries < 12; tries++) {
    let same = 0;
    for (let i = 0; i < n; i++) if (leftIds[i] === rightIds[i]) same++;
    if (same <= 1) break;
    rightIds = shuffle(kinds, rnd);
  }

  const solution: number[] = [];
  const twin: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const id = leftIds[i];
    let nth = 0;
    let count = 0;
    for (let k = 0; k < n; k++) {
      if (leftIds[k] !== id) continue;
      if (k < i) nth++;
      count++;
    }
    twin.push(count > 1);
    let seen = 0;
    let target = -1;
    for (let j = 0; j < n; j++) {
      if (rightIds[j] !== id) continue;
      if (seen === nth) {
        target = j;
        break;
      }
      seen++;
    }
    solution.push(target);
  }
  return { n, left: leftIds.map((k) => KINDS[k]), right: rightIds.map((k) => KINDS[k]), solution, twin, hasTwins: tier === 3 };
}

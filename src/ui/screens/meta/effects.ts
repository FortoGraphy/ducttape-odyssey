// Turns engine `Effect`s into words. The numbers shown are the node's own contribution at a given
// level (additive parts stack, multipliers compound: the same rule the engine folds them with).
import type { TFunction } from "i18next";

import { content } from "@/content";
import type { Effect, StatKey } from "@/engine/types";
import { tr } from "@/i18n";
import { fmt, fmtBonus } from "@/ui/format";

/** Stats where a smaller multiplier is the good direction. */
const LOWER_BETTER: Partial<Record<StatKey, 1>> = {
  powerUse: 1,
  wearRate: 1,
  shield: 1,
  fuelUse: 1,
  jumpCooldown: 1,
  heatRate: 1,
  coffeeUse: 1,
  deckCost: 1,
  towSpeed: 1,
};

/** Contribution of one effect after `level` levels, as a multiplier (1 = nothing yet). */
export function effectAt(e: Effect, level: number): number {
  if (level <= 0) return 1;
  let v = 1;
  if (e.add) v += e.add * level;
  if (e.mul !== undefined) v *= Math.pow(e.mul, level);
  return v;
}

export function fmtEffect(value: number): string {
  if (value >= 2) return `×${fmt(value)}`;
  const pct = Math.round(Math.abs(value - 1) * 1000) / 10;
  const digits = pct % 1 !== 0 ? 1 : 0;
  return fmtBonus(value, digits);
}

export function effectIsGood(e: Effect): boolean {
  const up = effectAt(e, 1) >= 1;
  return e.stat && LOWER_BETTER[e.stat] ? !up : up;
}

export function effectLabel(e: Effect, t: TFunction): string {
  const stat = e.stat ? t(`stat.${e.stat}`) : t("stat.deckOutput");
  return e.deck ? `${stat} · ${tr(content.decks[e.deck]?.name)}` : stat;
}

/** "Mining rate +25 %" for one-shot effects (mutators, hull traits). */
export function effectLine(e: Effect, t: TFunction): string {
  return `${effectLabel(e, t)} ${fmtEffect(effectAt(e, 1))}`;
}

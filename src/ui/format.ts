// Number and text formatting for screens. Reads the player's number-format setting, so every
// number in the UI switches between suffix (1.23 M, 4.5 aa) and scientific notation together.
import { formatBig, formatDuration, formatNumber, formatPct } from "@/engine/core";
import type { Big, ItemId } from "@/engine/types";
import { content } from "@/content";
import { tr } from "@/i18n";
import { getSettings, useSettings } from "@/store/settings";

const mode = () => getSettings().numberFormat;

/** Formats a Big or a plain number for display. */
export function fmt(value: Big | number | null | undefined, digits = 3): string {
  if (typeof value === "number") return formatNumber(value, mode(), digits);
  return formatBig(value, mode(), digits);
}

export function fmtRate(value: Big | number | null | undefined, digits = 3): string {
  return `${fmt(value, digits)}/s`;
}

/** 0.253 -> "25 %" (with the non-breaking thin space Czech and English typography both accept). */
export function fmtPct(fraction: number, digits = 0): string {
  return formatPct(fraction, digits).replace("%", " %");
}

/** Signed multiplier as a percentage delta: 1.25 -> "+25 %". */
export function fmtBonus(multiplier: number, digits = 0): string {
  const d = (multiplier - 1) * 100;
  return `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(digits)} %`;
}

export function fmtTime(seconds: number, parts = 2): string {
  return formatDuration(seconds, parts);
}

export function itemName(id: ItemId): string {
  return tr(content.items[id]?.name) || id;
}

/** Hook that re-renders the component when the number format changes; returns fmt. */
export function useFmt(): typeof fmt {
  useSettings((s) => s.numberFormat);
  return fmt;
}

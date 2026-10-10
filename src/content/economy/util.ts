import type { L10n } from "@/engine/types";

/** Bilingual string: Czech first, English second. */
export const t = (cs: string, en: string): L10n => ({ cs, en });

/** Index a definition list by id. Duplicate ids are an authoring error and fail loudly at load. */
export function byId<T extends { id: string }>(list: readonly T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const def of list) {
    if (out[def.id]) throw new Error(`duplicate content id: ${def.id}`);
    out[def.id] = def;
  }
  return out;
}

export const ROMAN = ["I", "II", "III", "IV", "V"] as const;

import type { L10n } from "@/engine/types";

/** Bilingual string: Czech first, English second (same order as the economy data). */
export const t = (cs: string, en: string): L10n => ({ cs, en });

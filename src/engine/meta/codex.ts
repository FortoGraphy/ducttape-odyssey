// Codex: everything the player has discovered. Entries are kept across every prestige layer.
import { OK, addCredits, emit, fail, incomeSeconds, stat } from "../kernel";
import type { ActionResult, Game, L10n, SystemDef } from "../types";
import { bal, clamp, lookup } from "./util";

export const CODEX_CATEGORIES = ["planet", "fauna", "flora", "system", "artifact", "other"] as const;
export type CodexCategory = (typeof CODEX_CATEGORIES)[number];
export const CODEX_NAME_MAX = 24;
const SET_SIZE = 10;

const LABEL: Record<CodexCategory, L10n> = {
  planet: { cs: "planet", en: "planets" },
  fauna: { cs: "druhů fauny", en: "fauna species" },
  flora: { cs: "druhů flóry", en: "flora species" },
  system: { cs: "soustav", en: "systems" },
  artifact: { cs: "artefaktů", en: "artifacts" },
  other: { cs: "záznamů", en: "entries" },
};

export function codexCategory(key: string): CodexCategory {
  const cut = key.indexOf(":");
  const head = cut > 0 ? key.slice(0, cut) : "";
  return head === "planet" || head === "fauna" || head === "flora" || head === "system" || head === "artifact" ? head : "other";
}

const statKey = (cat: CodexCategory): string => "codex_" + cat;

/**
 * Records a discovery. Returns false when the key was already known. Every tenth entry of a
 * category completes a set: a credit bonus (seconds of income) and a morale bump.
 */
export function discover(g: Game, key: string): boolean {
  if (typeof key !== "string" || key.length === 0 || key.length > 96 || key === "__proto__") return false;
  const s = g.state;
  if (lookup(s.codex, key)) return false;
  s.codex[key] = { t: s.t };
  const cat = codexCategory(key);
  stat(g, "codex");
  stat(g, statKey(cat));
  emit(g, { t: "discovery", key });
  const count = s.stats[statKey(cat)];
  if (count > 0 && count % SET_SIZE === 0) {
    // later sets pay a little more, capped so the codex never outruns the economy
    const sets = count / SET_SIZE;
    const secs = bal(g, "codexSetSecs", 120) * Math.min(5, 1 + (sets - 1) * 0.25);
    addCredits(g, incomeSeconds(g, secs));
    s.morale = clamp(s.morale + bal(g, "codexSetMorale", 5), 0, 100);
    stat(g, "codexSets");
    emit(g, {
      t: "toast",
      tone: "good",
      text: {
        cs: `Kodex: zapsáno ${count} ${LABEL[cat].cs}. Odměna vyplacena, morálka stoupla.`,
        en: `Codex: ${count} ${LABEL[cat].en} catalogued. Bonus paid, morale up.`,
      },
    });
  }
  g.api.say("discovery");
  return true;
}

/** Trims, collapses whitespace, drops control and markup characters, cuts to 24 characters. */
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let out = "";
  let n = 0;
  let space = false;
  for (const ch of raw.slice(0, 256).normalize("NFC")) {
    const code = ch.codePointAt(0) ?? 0;
    const blank = code === 0x20 || (code >= 0x09 && code <= 0x0d) || code === 0xa0 || (code >= 0x2000 && code <= 0x200a) || code === 0x2028 || code === 0x2029 || code === 0x3000;
    if (blank) {
      space = n > 0;
      continue;
    }
    // other controls, zero-width characters and bidi overrides vanish without leaving a gap
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f) || (code >= 0x200b && code <= 0x200f) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2060 && code <= 0x2069) || code === 0xfeff) continue;
    if (ch === "<" || ch === ">" || ch === "{" || ch === "}" || ch === "\\") continue;
    if (code >= 0xd800 && code <= 0xdfff) continue; // lone surrogate
    const need = space ? 2 : 1;
    if (n + need > CODEX_NAME_MAX) break;
    if (space) {
      out += " ";
      n++;
      space = false;
    }
    out += ch;
    n++;
  }
  return out;
}

/** Gives a codex entry a player-chosen name. An empty name restores the generated one. */
export function renameCodex(g: Game, key: string, name: string): ActionResult {
  const entry = lookup(g.state.codex, key);
  if (!entry) return fail("noTarget");
  const clean = sanitizeName(name);
  if (clean === "") {
    if (typeof name === "string" && name.trim() !== "") return fail("invalid");
    delete entry.name;
    return OK;
  }
  if (entry.name === clean) return OK;
  entry.name = clean;
  stat(g, "renames");
  return OK;
}

export interface CodexCategorySummary {
  category: CodexCategory;
  count: number;
  /** Completed sets of ten. */
  sets: number;
  /** Entries missing to the next set reward. */
  toNext: number;
}

/** Entry counts per category for the codex screen. Reads counters, never walks the codex. */
export function codexSummary(g: Game): { total: number; categories: CodexCategorySummary[] } {
  const stats = g.state.stats;
  const categories: CodexCategorySummary[] = [];
  let total = 0;
  for (const category of CODEX_CATEGORIES) {
    const count = stats[statKey(category)] ?? 0;
    total += count;
    categories.push({ category, count, sets: Math.floor(count / SET_SIZE), toNext: SET_SIZE - (count % SET_SIZE) });
  }
  return { total, categories };
}

export const codexSystem: SystemDef = {
  id: "meta.codex",
  init(g) {
    const s = g.state;
    if (!s.codex || typeof s.codex !== "object") s.codex = {};
    // counters are derived data: recount once per load so a hand-edited or migrated save stays consistent
    const counts: Record<string, number> = {};
    let total = 0;
    for (const key in s.codex) {
      const k = statKey(codexCategory(key));
      counts[k] = (counts[k] ?? 0) + 1;
      total++;
    }
    for (const category of CODEX_CATEGORIES) {
      const k = statKey(category);
      if (counts[k]) s.stats[k] = counts[k];
      else delete s.stats[k];
    }
    if (total > 0) s.stats.codex = total;
    g.api.discover = (key) => discover(g, key);
  },
};

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { achievements, backlogTickets, chapters, endings, kipp, logs, names } from "@/content/story";
import type { Condition, ContentDB, FailureKind, KippTrigger, L10n } from "@/engine/types";

// Compile-time contract: the story data slots straight into the ContentDB.
const slice: Pick<ContentDB, "chapters" | "logs" | "kipp" | "achievements" | "names"> = { chapters, logs, kipp, achievements, names };
const everything = { ...slice, endings, backlogTickets };

const KIPP_TRIGGERS: KippTrigger[] = [
  "idle", "purchase", "milestone", "damage", "repair", "moduleBroken", "cargoFull", "lowFuel", "jump", "arrival", "discovery", "eventGood",
  "eventBad", "failure", "rescued", "minigameWin", "minigameLose", "overdrive", "overheat", "offlineReturn", "prestige", "coffeeOut",
  "crewJoin", "station", "craft", "research", "achievement", "debug",
];
const FAILURE_KINDS: FailureKind[] = ["tumble", "breach", "blackout", "noFuel", "engine", "radiation", "boarding", "anomaly"];
const MINIGAMES = ["weld", "wire", "rhythm", "valves", "calibrate", "tape", "defense", "dock", "hack"];
const EVENT_TYPES = ["meteor", "pirates", "merchant", "derelict", "anomaly", "flare", "fauna", "distress", "fault", "stowaway", "kipp", "contact", "story"];

// docs/GDD.md section 11, hardcoded on purpose: a new stat must be added to the GDD first.
const GDD_STATS = new Set<string>([
  "purchases", "deckLevels", "milestones", "creditsLog10", "salvage", "pulses", "overdrives", "overheats", "crafts", "craftsT1", "craftsT2",
  "craftsT3", "craftsT4", "modulesBuilt", "modulesPristine", "modulesInstalled", "repairsManual", "repairsBot", "repairsPerfect", "tapeUsed",
  "minigames", "minigamesPerfect", "jumps", "depthMax", "systemsVisited", "planetsScanned", "expeditions", "expeditionsLost", "outposts",
  "codex", "renames", "events", "eventsGood", "eventsBad", "failures", "tows", "crew", "cards", "contracts", "trades", "researchLevels",
  "warps", "rebuilds", "reboots", "logs", "chapters", "questsDaily", "questsWeekly", "streakMax", "offlineReturns", "offlineLongest",
  "playedHours", "kippLines", "debugOpened", "coffee", "blueprints",
  ...MINIGAMES.map((id) => `minigame_${id}`),
  ...EVENT_TYPES.map((id) => `event_${id}`),
  ...FAILURE_KINDS.map((id) => `failure_${id}`),
]);

const BANNED = ["atlas", "sentinel", "traveller", "nanite", "quicksilver", "teenage"];
const DIACRITIC = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/;

const ROOT = path.resolve(__dirname, "../..");
const iconDoc = fs.readFileSync(path.join(ROOT, "docs/ICONS.md"), "utf8");
const iconNames = new Set(
  iconDoc
    .slice(iconDoc.indexOf("## Required names"))
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .flatMap((line) => [...line.matchAll(/`([^`]+)`/g)].flatMap((m) => m[1].split(/\s+/))),
);
// Item icons are named after the item id (docs/ICONS.md, "Items"); these are canonical item ids.
const ITEM_ICONS = new Set(["coffee", "duct_tape", "spare_parts", "nano_gel", "fuel_cell", "beacon"]);

const isL10n = (v: unknown): v is L10n =>
  typeof v === "object" && v !== null && Object.keys(v).length === 2 && typeof (v as L10n).cs === "string" && typeof (v as L10n).en === "string";

function collectL10n(v: unknown, out: L10n[] = []): L10n[] {
  if (isL10n(v)) out.push(v);
  else if (Array.isArray(v)) for (const x of v) collectL10n(x, out);
  else if (typeof v === "object" && v !== null) for (const x of Object.values(v)) collectL10n(x, out);
  return out;
}

const unique = <T>(list: T[]): boolean => new Set(list).size === list.length;
const words = (s: string): number => s.trim().split(/\s+/).length;
const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

/**
 * Smallest depth at which a condition can hold in a first run (0 when it does not depend on depth).
 * Alternatives that need a completed warp are ignored: they only exist for later galaxies.
 */
function minDepth(c: Condition): number {
  let d = c.depthMin ?? 0;
  for (const x of c.all ?? []) d = Math.max(d, minDepth(x));
  const firstRun = (c.any ?? []).filter((x) => x.warpMin === undefined);
  if (firstRun.length) d = Math.max(d, Math.min(...firstRun.map(minDepth)));
  return d;
}

function statKeys(c: Condition, out: string[] = []): string[] {
  if (c.stat) out.push(c.stat.key);
  for (const x of [...(c.all ?? []), ...(c.any ?? []), ...(c.not ? [c.not] : [])]) statKeys(x, out);
  return out;
}

describe("chapters", () => {
  it("has 12 chapters with ids 1..12 in order", () => {
    expect(chapters.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("gives every chapter 3-6 intro beats and 2-4 objectives", () => {
    const speakers = new Set(["kipp", "signal", "log", "narrator", "crew"]);
    for (const c of chapters) {
      expect(c.intro.length, `chapter ${c.id} beats`).toBeGreaterThanOrEqual(3);
      expect(c.intro.length, `chapter ${c.id} beats`).toBeLessThanOrEqual(6);
      expect(c.objectives.length, `chapter ${c.id} objectives`).toBeGreaterThanOrEqual(2);
      expect(c.objectives.length, `chapter ${c.id} objectives`).toBeLessThanOrEqual(4);
      for (const b of c.intro) expect(speakers.has(b.speaker)).toBe(true);
    }
    // every speaker is used somewhere, the signal in at least half of the chapters
    const used = new Set(chapters.flatMap((c) => c.intro.map((b) => b.speaker)));
    expect(used).toEqual(speakers);
    expect(chapters.filter((c) => c.intro.some((b) => b.speaker === "signal")).length).toBeGreaterThanOrEqual(6);
  });

  it("uses a monotonic, progression-only trigger ladder", () => {
    const depths = chapters.map((c) => minDepth(c.trigger));
    for (let i = 1; i < depths.length; i++) expect(depths[i], `chapter ${i + 1}`).toBeGreaterThanOrEqual(depths[i - 1]);
    // chapters 1-4 must be reachable in the first 45 minutes: nothing deeper than the first jump
    expect(Math.max(...depths.slice(0, 4))).toBeLessThanOrEqual(1);
    // the core of the first galaxy is at depth 40
    expect(Math.max(...depths)).toBeLessThanOrEqual(40);
    expect(chapters[0].trigger).toEqual({ chapterMax: 0 });
  });

  it("ends every chapter's objective list with the trigger of the next chapter", () => {
    for (let i = 0; i < chapters.length - 1; i++) {
      const last = chapters[i].objectives[chapters[i].objectives.length - 1];
      expect(last.done, `chapter ${chapters[i].id}`).toEqual(chapters[i + 1].trigger);
    }
  });

  it("only references stats from the GDD and never unlocks a feature twice", () => {
    for (const c of chapters) {
      for (const key of [...statKeys(c.trigger), ...c.objectives.flatMap((o) => statKeys(o.done))]) expect(GDD_STATS.has(key), key).toBe(true);
    }
    const unlocks = chapters.flatMap((c) => c.unlocks ?? []);
    expect(unique(unlocks)).toBe(true);
    // features a later trigger depends on are handed out earlier
    const at = (f: string): number => chapters.find((c) => (c.unlocks as string[] | undefined)?.includes(f))?.id ?? 99;
    expect(at("nav")).toBeLessThan(4);
    expect(at("grid")).toBeLessThan(5);
    expect(at("crew")).toBeLessThan(8);
    expect(at("warp")).toBe(12);
  });
});

describe("crew logs", () => {
  it("has 60 logs with orders 1..60 and unique ids", () => {
    expect(logs.length).toBe(60);
    expect(logs.map((l) => l.order).sort((a, b) => a - b)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
    expect(unique(logs.map((l) => l.id))).toBe(true);
    expect(unique(logs.map((l) => l.title.en))).toBe(true);
    expect(unique(logs.map((l) => l.title.cs))).toBe(true);
  });

  it("keeps every entry between 40 and 110 words in both languages", () => {
    for (const l of logs) {
      expect(words(l.text.en), `${l.id} en`).toBeGreaterThanOrEqual(40);
      expect(words(l.text.en), `${l.id} en`).toBeLessThanOrEqual(110);
      expect(words(l.text.cs), `${l.id} cs`).toBeGreaterThanOrEqual(40);
      expect(words(l.text.cs), `${l.id} cs`).toBeLessThanOrEqual(110);
    }
  });

  it("is told by 6-7 recurring crew members", () => {
    const counts = new Map<string, number>();
    for (const l of logs) counts.set(l.author.en, (counts.get(l.author.en) ?? 0) + 1);
    expect(counts.size).toBeGreaterThanOrEqual(6);
    expect(counts.size).toBeLessThanOrEqual(7);
    for (const [author, n] of counts) expect(n, author).toBeGreaterThanOrEqual(5);
  });

  it("is discovered out of chronological order", () => {
    // titles carry the in-fiction stamp; discovery order must not simply follow it
    const day = (title: string): number => {
      const haul = /^Haul day (\d+)/.exec(title);
      if (haul) return Number(haul[1]);
      const corridor = /^Corridor, minute (\d+)/.exec(title);
      return corridor ? 10000 + Number(corridor[1]) : NaN;
    };
    const stamps = [...logs].sort((a, b) => a.order - b.order).map((l) => day(l.title.en));
    expect(stamps.every((n) => Number.isFinite(n))).toBe(true);
    let inversions = 0;
    for (let i = 1; i < stamps.length; i++) if (stamps[i] < stamps[i - 1]) inversions++;
    expect(inversions).toBeGreaterThanOrEqual(15);
  });
});

describe("KIPP lines", () => {
  it("has at least 280 lines with unique, well-formed ids", () => {
    expect(kipp.length).toBeGreaterThanOrEqual(280);
    expect(unique(kipp.map((l) => l.id))).toBe(true);
    for (const l of kipp) expect(l.id).toMatch(new RegExp(`^kipp_${l.trigger}_\\d{2}$`));
    expect(unique(kipp.map((l) => l.text.en))).toBe(true);
    expect(unique(kipp.map((l) => l.text.cs))).toBe(true);
  });

  it("covers every trigger with at least 8 lines, idle with at least 25", () => {
    const known = new Set<string>(KIPP_TRIGGERS);
    for (const l of kipp) expect(known.has(l.trigger), l.trigger).toBe(true);
    for (const trigger of KIPP_TRIGGERS) {
      const n = kipp.filter((l) => l.trigger === trigger).length;
      expect(n, trigger).toBeGreaterThanOrEqual(trigger === "idle" ? 25 : 8);
    }
  });

  it("always has enough unconditional lines to outlast the no-repeat window", () => {
    // the engine remembers the last 12 lines across all triggers; a trigger should not go silent
    for (const trigger of KIPP_TRIGGERS) {
      if (trigger === "failure") continue;
      expect(kipp.filter((l) => l.trigger === trigger && !l.when).length, trigger).toBeGreaterThanOrEqual(7);
    }
  });

  it("has at least 3 failure lines per failure kind, and only there", () => {
    for (const kind of FAILURE_KINDS) {
      expect(kipp.filter((l) => l.trigger === "failure" && l.failure === kind).length, kind).toBeGreaterThanOrEqual(3);
    }
    for (const l of kipp) {
      if (l.trigger === "failure") expect(l.failure, l.id).toBeDefined();
      else expect(l.failure, l.id).toBeUndefined();
    }
  });

  it("keeps every line to one sentence of at most 110 characters", () => {
    for (const l of kipp) {
      for (const text of [l.text.cs, l.text.en]) {
        expect(text.length, `${l.id}: ${text}`).toBeLessThanOrEqual(110);
        // a full stop, question or exclamation mark only at the very end
        expect(/[.!?]["“”]?\s+\S/.test(text), `${l.id}: ${text}`).toBe(false);
        expect(/[.!?]["“”]?$/.test(text), `${l.id}: ${text}`).toBe(true);
      }
    }
  });

  it("uses only the placeholders the engine fills in", () => {
    const allowed = new Set(["name", "ship", "n"]);
    for (const l of kipp) {
      const en = placeholders(l.text.en);
      expect(placeholders(l.text.cs), l.id).toEqual(en);
      for (const p of en) expect(allowed.has(p), `${l.id} {${p}}`).toBe(true);
      // {n} is only passed reliably for deck purchases and research levels
      if (en.includes("n")) expect(["purchase", "research"], l.id).toContain(l.trigger);
      // discovery is called with and without a name
      if (en.includes("name")) expect(l.trigger, l.id).not.toBe("discovery");
    }
    for (const p of allowed) expect(kipp.some((l) => l.text.en.includes(`{${p}}`)), p).toBe(true);
  });

  it("gates some lines by chapter, morale and hull", () => {
    const gated = kipp.filter((l) => l.when);
    expect(gated.length).toBeGreaterThanOrEqual(8);
    expect(gated.some((l) => l.when?.chapterMin !== undefined || l.when?.chapterMax !== undefined)).toBe(true);
    expect(gated.some((l) => l.when?.moraleBelow !== undefined)).toBe(true);
    expect(gated.some((l) => l.when?.hullBelow !== undefined)).toBe(true);
  });
});

describe("achievements", () => {
  it("has at least 110 achievements with unique ids and names", () => {
    expect(achievements.length).toBeGreaterThanOrEqual(110);
    expect(unique(achievements.map((a) => a.id))).toBe(true);
    expect(unique(achievements.map((a) => a.name.en))).toBe(true);
    expect(unique(achievements.map((a) => a.name.cs))).toBe(true);
  });

  it("uses only stat keys from GDD section 11", () => {
    for (const a of achievements) expect(GDD_STATS.has(a.stat), `${a.id}: ${a.stat}`).toBe(true);
  });

  it("ladders thresholds upward within each stat", () => {
    const last = new Map<string, number>();
    for (const a of achievements) {
      expect(Number.isInteger(a.threshold) && a.threshold > 0, a.id).toBe(true);
      expect(a.threshold, a.id).toBeGreaterThan(last.get(a.stat) ?? 0);
      last.set(a.stat, a.threshold);
    }
    // the classic ladder from the brief
    expect(achievements.filter((a) => a.stat === "purchases").map((a) => a.threshold)).toEqual([1, 100, 1000, 10000]);
  });

  it("uses icon names from docs/ICONS.md", () => {
    for (const a of achievements) expect(iconNames.has(a.icon) || ITEM_ICONS.has(a.icon), `${a.id}: ${a.icon}`).toBe(true);
  });

  it("has about a dozen hidden ones and small rewards", () => {
    const hidden = achievements.filter((a) => a.hidden).length;
    expect(hidden).toBeGreaterThanOrEqual(10);
    expect(hidden).toBeLessThanOrEqual(16);
    for (const a of achievements) {
      if (a.reward?.stamps !== undefined) {
        expect(a.reward.stamps, a.id).toBeGreaterThanOrEqual(1);
        expect(a.reward.stamps, a.id).toBeLessThanOrEqual(5);
      }
      if (a.reward?.cosmetic !== undefined) expect(a.reward.cosmetic, a.id).toMatch(/^ach_(paint|sticker)_\d+$/);
    }
    const cosmetics = achievements.flatMap((a) => (a.reward?.cosmetic ? [a.reward.cosmetic] : []));
    expect(unique(cosmetics)).toBe(true);
    expect(cosmetics.length).toBeGreaterThanOrEqual(6);
    expect(cosmetics.length).toBeLessThanOrEqual(10);
    expect(achievements.filter((a) => a.reward?.stamps).length).toBeGreaterThanOrEqual(25);
  });
});

describe("names", () => {
  it("has large enough tables without duplicates", () => {
    const min: Record<string, number> = {
      systemA: 30, systemB: 30, systemC: 20, planetSuffix: 8, crewFirst: 60, crewLast: 60, faunaA: 24, faunaB: 24, floraA: 24, floraB: 24,
    };
    for (const [key, n] of Object.entries(min)) {
      const list = names[key as keyof typeof names] as string[];
      expect(list.length, key).toBeGreaterThanOrEqual(n);
      expect(unique(list), key).toBe(true);
      for (const s of list) expect(s.trim().length > 0 && s === s.trim(), `${key}: "${s}"`).toBe(true);
    }
    expect(names.stationWords.length).toBeGreaterThanOrEqual(20);
    expect(unique(names.stationWords.map((w) => w.en))).toBe(true);
    expect(unique(names.stationWords.map((w) => w.cs))).toBe(true);
  });

  it("keeps generated syllables pronounceable in both languages", () => {
    // plain letters only, and none of the letters Czech and English read very differently
    for (const key of ["systemA", "systemB", "systemC", "faunaA", "faunaB", "floraA", "floraB"] as const) {
      for (const s of names[key]) expect(s, key).toMatch(/^[A-Za-z]+$/);
    }
    for (const key of ["systemA", "systemB", "systemC"] as const) for (const s of names[key]) expect(/[cjqwxy]/i.test(s), `${key}: ${s}`).toBe(false);
    for (const s of names.systemA) expect(s, "systemA").toMatch(/^(?:[A-Z][a-z]*[aeiou]|[AEIOU])[bdfgklmnprstvz]$/);
    for (const s of names.systemB) expect(s, "systemB").toMatch(/^[aeiou][bdfgklmnprstvz][aeiou]$/);
    for (const s of names.systemC) expect(s, "systemC").toMatch(/^[bdfghklmnprstvz][aeiou][bdfgklmnprstvz]$/);
    for (const s of [...names.faunaA, ...names.floraA]) expect(s).toMatch(/^[A-Z][a-z]*[bdfgklmnprstvz]$/);
    for (const s of [...names.faunaB, ...names.floraB]) expect(s).toMatch(/^[aeiou]/);
  });
});

describe("endings and the Backlog", () => {
  it("offers 3-4 endings with ids the engine accepts", () => {
    expect(endings.length).toBeGreaterThanOrEqual(3);
    expect(endings.length).toBeLessThanOrEqual(4);
    expect(unique(endings.map((e) => e.id))).toBe(true);
    for (const e of endings) {
      expect(e.id).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
      // every epilogue hands over to the endless mode by name
      expect(e.epilogue.en, e.id).toContain("Backlog");
      expect(e.epilogue.cs, e.id).toContain("Nedodělky");
    }
  });

  it("has at least 30 backlog tickets with unique ids and titles", () => {
    expect(backlogTickets.length).toBeGreaterThanOrEqual(30);
    expect(unique(backlogTickets.map((b) => b.id))).toBe(true);
    expect(unique(backlogTickets.map((b) => b.title.en))).toBe(true);
    expect(unique(backlogTickets.map((b) => b.title.cs))).toBe(true);
  });
});

describe("text hygiene", () => {
  const all = collectL10n(everything);

  it("finds the bilingual strings", () => {
    expect(all.length).toBeGreaterThan(900);
  });

  it("has no empty string and no untranslated pair", () => {
    for (const s of all) {
      expect(s.cs.trim().length, JSON.stringify(s)).toBeGreaterThan(0);
      expect(s.en.trim().length, JSON.stringify(s)).toBeGreaterThan(0);
      expect(s.cs, s.en).not.toBe(s.en);
      expect(s.cs, s.cs).toBe(s.cs.trim());
      expect(s.en, s.en).toBe(s.en.trim());
      expect(/\s{2,}/.test(s.cs + s.en), s.en).toBe(false);
    }
  });

  it("writes Czech with diacritics", () => {
    const long = all.filter((s) => s.cs.length > 30);
    const withMarks = long.filter((s) => DIACRITIC.test(s.cs));
    expect(long.length).toBeGreaterThan(500);
    expect(withMarks.length / long.length).toBeGreaterThanOrEqual(0.9);
    // English stays free of Czech-only letters apart from the crew's own names
    for (const s of all) expect(/[ěščřžýůťďň]/i.test(s.en.replace(/Křepelka/g, "")), s.en).toBe(false);
  });

  it("uses typographic Czech quotes and plain English ones", () => {
    for (const s of all) {
      expect(s.cs.includes('"'), s.cs).toBe(false);
      expect(/[„“‚‘]/.test(s.en), s.en).toBe(false);
      expect((s.cs.match(/„/g) ?? []).length, s.cs).toBe((s.cs.match(/“/g) ?? []).length);
    }
  });

  it("contains no banned words anywhere", () => {
    const dump = JSON.stringify(everything).toLowerCase();
    for (const word of BANNED) expect(dump.includes(word), word).toBe(false);
  });
});

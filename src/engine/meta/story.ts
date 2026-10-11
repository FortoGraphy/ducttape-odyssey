// Story: twelve chapters driven by progression, crew logs, the ending choice and the endless
// "Backlog" of seeded tickets that follows it, so the story layer always has a next thing to do.
import type { Big, ChapterDef, ContentDB, FeatureId, Game, L10n, LogId, StoryBeat, SystemDef, ActionResult } from "../types";
import * as B from "../big";
import { OK, emit, fail, getStat, hasFeature, setFlag, stat, statMax, unlockFeature } from "../kernel";
import { Rng, hashSeed } from "../prng";
import { syncCosmetics } from "./cosmetics";
import { grantStamps } from "./prestige";
import { bal, fillN, fmtBig, safeCheck, secondEdge } from "./util";

const BEAT_BASE = 1000;
const PENDING_MAX = 96;
const F_N = "backlog_n";
const F_KIND = "backlog_k";
const F_START = "backlog_start";
const F_TARGET = "backlog_target";

// ---------- chapters ------------------------------------------------------------------

interface ChapterIndex {
  list: ChapterDef[]; // sorted by id
  byId: Record<number, ChapterDef>;
  last: number;
}

const chapterCache = new WeakMap<ContentDB, ChapterIndex>();

function chapters(content: ContentDB): ChapterIndex {
  let idx = chapterCache.get(content);
  if (!idx) {
    const list = (content.chapters ?? []).slice().sort((a, b) => a.id - b.id);
    const byId: Record<number, ChapterDef> = {};
    for (const c of list) byId[c.id] = c;
    idx = { list, byId, last: list.length ? list[list.length - 1].id : 0 };
    chapterCache.set(content, idx);
  }
  return idx;
}

export function chapterDef(g: Game, id: number = g.state.story.chapter): ChapterDef | undefined {
  return chapters(g.content).byId[id];
}

/** Id of the final chapter (12 with the shipped content). */
export function finalChapter(g: Game): number {
  return chapters(g.content).last;
}

function startChapter(g: Game, def: ChapterDef): void {
  const story = g.state.story;
  story.chapter = def.id;
  // Sandbox mode skips the storytelling: chapters still advance so objectives and unlocks keep working.
  const quiet = g.state.flags.sandbox > 0;
  for (let i = 0; !quiet && i < def.intro.length && i < BEAT_BASE; i++) {
    if (story.pending.length < PENDING_MAX) story.pending.push(def.id * BEAT_BASE + i);
  }
  if (def.unlocks) for (const f of def.unlocks) unlockFeature(g, f);
  statMax(g, "chapters", def.id);
  syncCosmetics(g);
  emit(g, { t: "chapter", id: def.id });
  // the intro beats do the talking for chapters that have them
  if (def.intro.length === 0) g.api.say("milestone", { n: def.id });
}

function nextChapter(g: Game): ChapterDef | undefined {
  const idx = chapters(g.content);
  const current = g.state.story.chapter;
  if (current >= idx.last) return undefined;
  for (let i = 0; i < idx.list.length; i++) if (idx.list[i].id > current) return idx.list[i];
  return undefined;
}

// ---------- beats ---------------------------------------------------------------------

export interface BeatView {
  chapter: number;
  index: number;
  beat: StoryBeat;
}

function beatAt(g: Game, code: number): StoryBeat | undefined {
  return chapters(g.content).byId[Math.floor(code / BEAT_BASE)]?.intro[code % BEAT_BASE];
}

/** The story beat waiting to be shown, or null. */
export function currentBeat(g: Game): BeatView | null {
  const pending = g.state.story.pending;
  if (pending.length === 0) return null;
  const code = pending[0];
  const beat = beatAt(g, code);
  return beat ? { chapter: Math.floor(code / BEAT_BASE), index: code % BEAT_BASE, beat } : null;
}

/** The player has read the current beat. */
export function ackBeat(g: Game): ActionResult {
  const story = g.state.story;
  if (story.pending.length === 0) return fail("noTarget");
  story.pending.shift();
  story.beat++;
  return OK;
}

// ---------- objectives ----------------------------------------------------------------

export interface ObjectiveView {
  text: L10n;
  done: boolean;
  /** Present for counted goals (backlog tickets). */
  progress?: number;
  target?: number;
}

/**
 * What the story currently asks for: the chapter's objectives, and after the ending whatever the
 * final chapter still has open, followed by the current backlog ticket.
 */
export function objectives(g: Game): ObjectiveView[] {
  const story = g.state.story;
  const def = chapterDef(g);
  const out: ObjectiveView[] = [];
  if (story.ending === null) {
    if (def) for (const o of def.objectives) out.push({ text: o.text, done: safeCheck(g, o.done) });
    return out;
  }
  if (def) for (const o of def.objectives) if (!safeCheck(g, o.done)) out.push({ text: o.text, done: false });
  const ticket = backlogTicket(g);
  if (ticket) out.push({ text: ticket.text, done: ticket.progress >= ticket.target, progress: ticket.progress, target: ticket.target });
  return out;
}

// ---------- ending --------------------------------------------------------------------

/** Suggested ending ids; the engine accepts any well-formed id so the narrative can add more. */
export const ENDING_IDS = ["answer", "hang_up", "stay_on_hold"] as const;

/** The choice opens with the final chapter: making it is part of that chapter, not a reward for finishing it. */
export function canChooseEnding(g: Game): boolean {
  const story = g.state.story;
  const last = finalChapter(g);
  return story.ending === null && last > 0 && story.chapter >= last;
}

export function chooseEnding(g: Game, id: string): ActionResult {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,32}$/.test(id)) return fail("invalid");
  if (g.state.story.ending !== null) return fail("max");
  if (!canChooseEnding(g)) return fail("requirement");
  g.state.story.ending = id;
  setFlag(g, "ending_" + id);
  stat(g, "endings");
  issueTicket(g, 1);
  g.api.say("milestone");
  return OK;
}

// ---------- the backlog ---------------------------------------------------------------

interface TicketTemplate {
  key: string;
  stat: string;
  base: number;
  feature?: FeatureId;
  text: L10n; // contains {n}
}

// Czech counts: a base of 6 or more keeps the target at 5+, where the genitive plural is always right.
// Smaller goals use a "label: {n}" form that reads correctly for any number.
export const BACKLOG_TEMPLATES: readonly TicketTemplate[] = [
  {
    key: "purchases",
    stat: "purchases",
    base: 60,
    text: {
      cs: "Nainstaluj {n} vylepšení palub. Zadavatel: „Správa budov“. Správa budov neexistuje už čtyřicet let.",
      en: "Install {n} deck upgrades. Requested by: Facilities. Facilities has not existed for forty years.",
    },
  },
  {
    key: "deckLevels",
    stat: "deckLevels",
    base: 150,
    text: {
      cs: "Zvedni paluby celkem o {n} úrovní. Tenhle tiket je otevřený déle, než tu pracuješ.",
      en: "Raise the decks by {n} levels in total. This ticket has been open longer than you have worked here.",
    },
  },
  {
    key: "salvage",
    stat: "salvage",
    base: 15,
    text: {
      cs: "Posbírej {n} kusů volně letícího šrotu. Vedeno jako „ztráty a nálezy“, priorita: až bude čas.",
      en: "Recover {n} pieces of drifting salvage. Filed under lost property, priority: whenever.",
    },
  },
  {
    key: "pulses",
    stat: "pulses",
    base: 20,
    text: {
      cs: "Pípni skenerem {n}×. Je osamělý a pozornost mu dělá dobře.",
      en: "Fire the scanner {n} times. It is lonely and enjoys the attention.",
    },
  },
  {
    key: "minigames",
    stat: "minigames",
    base: 6,
    text: {
      cs: "Oprav {n} věcí vlastníma rukama. Příručka tomu říká „budování charakteru“.",
      en: "Fix {n} things by hand. The manual calls this character building.",
    },
  },
  {
    key: "events",
    stat: "events",
    base: 6,
    text: {
      cs: "Přečkej {n} mimořádných událostí. Účast povinná, nadšení dobrovolné.",
      en: "Sit through {n} incidents. Attendance is mandatory, enthusiasm is optional.",
    },
  },
  {
    key: "crafts",
    stat: "crafts",
    base: 30,
    feature: "crafting",
    text: {
      cs: "Vyrob {n} dávek. Ve formuláři stojí „z inventárních důvodů“. Z jakých, to už ne.",
      en: "Craft {n} batches. The form says: for inventory reasons. It does not say which.",
    },
  },
  {
    key: "jumps",
    stat: "jumps",
    base: 4,
    feature: "nav",
    text: {
      cs: "Vyžadováno skoků: {n}. Cestovní náhrady se neproplácejí.",
      en: "Complete {n} jumps. Travel expenses will not be reimbursed.",
    },
  },
  {
    key: "planetsScanned",
    stat: "planetsScanned",
    base: 3,
    feature: "scan",
    text: {
      cs: "Planet k naskenování: {n}. Někdo ten prospekt aktualizovat musí.",
      en: "Scan {n} planets. Somebody has to keep the brochure up to date.",
    },
  },
  {
    key: "researchLevels",
    stat: "researchLevels",
    base: 6,
    feature: "research",
    text: {
      cs: "Dokonči {n} úrovní výzkumu. Oponenturu dělám já. Jsem přísný, ale spravedlivý.",
      en: "Finish {n} research levels. I am the peer review. I am harsh but fair.",
    },
  },
  {
    key: "expeditions",
    stat: "expeditions",
    base: 2,
    feature: "expeditions",
    text: {
      cs: "Výprav k vyslání: {n}. Formulář o převzetí odpovědnosti jsem podepsal za tebe.",
      en: "Send out {n} expeditions. I have signed the liability waiver on your behalf.",
    },
  },
  {
    key: "contracts",
    stat: "contracts",
    base: 2,
    feature: "station",
    text: {
      cs: "Zakázek pro stanice k dokončení: {n}. Slíbil jsem jim to. Tvým jménem, pochopitelně.",
      en: "Complete {n} station contracts. I promised them. In your name, naturally.",
    },
  },
];

export interface BacklogTicket {
  /** Ticket number, starting at 1. */
  n: number;
  key: string;
  text: L10n; // {n} already filled in
  stat: string;
  target: number;
  progress: number;
  reward: Big; // stamps
}

/** Stamps for closing ticket n: a slowly rising flat part plus a small share of the stamps earned so far. */
export function ticketReward(g: Game, n: number): Big {
  const flat = 1 + Math.min(20, Math.floor(n / 5));
  const share = B.floor(B.mulN(g.state.prestige.stampsTotal, bal(g, "backlogStampPct", 0.01)));
  return B.add(B.big(flat), share);
}

const pool: number[] = [];

function issueTicket(g: Game, n: number): void {
  const f = g.state.flags;
  const rng = new Rng(hashSeed(g.state.seed, 0x7ac4e7, n));
  const prev = f[F_N] > 0 ? f[F_KIND] : -1;
  pool.length = 0;
  for (let i = 0; i < BACKLOG_TEMPLATES.length; i++) {
    const t = BACKLOG_TEMPLATES[i];
    // never the same paperwork twice in a row, and never a job the ship cannot do yet
    if (i !== prev && (!t.feature || hasFeature(g, t.feature))) pool.push(i);
  }
  const kind = pool.length ? pool[Math.min(pool.length - 1, Math.floor(rng.next() * pool.length))] : 0;
  pool.length = 0;
  const tpl = BACKLOG_TEMPLATES[kind];
  const growth = 1 + bal(g, "backlogGrowth", 0.1) * Math.min(n - 1, 90);
  f[F_N] = n;
  f[F_KIND] = kind;
  f[F_START] = getStat(g, tpl.stat);
  f[F_TARGET] = Math.max(1, Math.round(tpl.base * growth * rng.range(0.85, 1.2)));
}

/** The open backlog ticket, or null before the ending. */
export function backlogTicket(g: Game): BacklogTicket | null {
  const f = g.state.flags;
  const n = f[F_N];
  if (!(n > 0) || g.state.story.ending === null) return null;
  const tpl = BACKLOG_TEMPLATES[f[F_KIND]] ?? BACKLOG_TEMPLATES[0];
  const target = f[F_TARGET] > 0 ? f[F_TARGET] : 1;
  const progress = Math.max(0, Math.min(target, getStat(g, tpl.stat) - (f[F_START] || 0)));
  return {
    n,
    key: tpl.key,
    text: { cs: fillN(tpl.text.cs, target), en: fillN(tpl.text.en, target) },
    stat: tpl.stat,
    target,
    progress,
    reward: ticketReward(g, n),
  };
}

function tickBacklog(g: Game): void {
  const f = g.state.flags;
  const n = f[F_N];
  if (!(n > 0)) {
    issueTicket(g, 1);
    return;
  }
  const tpl = BACKLOG_TEMPLATES[f[F_KIND]] ?? BACKLOG_TEMPLATES[0];
  if (getStat(g, tpl.stat) - (f[F_START] || 0) < f[F_TARGET]) return;
  const reward = ticketReward(g, n);
  grantStamps(g, reward);
  stat(g, "tickets");
  emit(g, { t: "questDone", id: "backlog:" + n });
  emit(g, {
    t: "toast",
    tone: "good",
    text: {
      cs: `Tiket č. ${n} uzavřen (razítka: +${fmtBig(reward)}). Fronta se tím nezkrátila.`,
      en: `Ticket #${n} closed (stamps: +${fmtBig(reward)}). The backlog did not get shorter.`,
    },
  });
  issueTicket(g, n + 1);
  g.api.say("milestone", { n });
}

// ---------- crew logs -----------------------------------------------------------------

/** Finds a crew log: the given one, or the next unfound by `order`. Returns its id, or null if nothing was added. */
export function addLog(g: Game, id?: LogId): LogId | null {
  const all = g.content.logs ?? [];
  const found = g.state.story.logs;
  let pickId: LogId | null = null;
  if (id !== undefined) {
    for (let i = 0; i < all.length; i++) if (all[i].id === id) pickId = id;
    if (pickId !== null && found.indexOf(pickId) >= 0) pickId = null;
  } else {
    let best = Infinity;
    for (let i = 0; i < all.length; i++) {
      if (all[i].order < best && found.indexOf(all[i].id) < 0) {
        best = all[i].order;
        pickId = all[i].id;
      }
    }
  }
  if (pickId === null) return null;
  found.push(pickId);
  stat(g, "logs");
  emit(g, { t: "log", id: pickId });
  return pickId;
}

// ---------- system --------------------------------------------------------------------

export const storySystem: SystemDef = {
  id: "meta.story",
  init(g) {
    const story = g.state.story;
    if (!Array.isArray(story.pending)) story.pending = [];
    if (!Array.isArray(story.logs)) story.logs = [];
    if (!Number.isFinite(story.chapter) || story.chapter < 0) story.chapter = 0;
    if (!Number.isFinite(story.beat)) story.beat = 0;
    if (story.ending === undefined) story.ending = null;
    // beats of chapters the content no longer has would leave the overlay with nothing to show
    for (let i = story.pending.length - 1; i >= 0; i--) if (!beatAt(g, story.pending[i])) story.pending.splice(i, 1);
    g.api.addLog = (id) => addLog(g, id);
    const idx = chapters(g.content);
    if (story.chapter === 0 && idx.list.length > 0) startChapter(g, idx.list[0]);
  },
  tick(g, dt) {
    if (!secondEdge(g, dt)) return;
    if (g.state.story.ending !== null) {
      tickBacklog(g);
      return;
    }
    const next = nextChapter(g);
    if (next && safeCheck(g, next.trigger)) startChapter(g, next);
  },
};

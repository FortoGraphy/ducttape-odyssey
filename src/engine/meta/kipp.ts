// KIPP, the ship AI: picks a line for a trigger, never repeats recent lines, never talks too often.
// Other areas call g.api.say(trigger, vars); nothing here listens to events directly.
import { emit, rollRange, roll, stat } from "../kernel";
import type { ContentDB, Game, KippLineDef, KippTrigger, SystemDef } from "../types";
import { bal, safeCheck } from "./util";

export const KIPP_RECENT = 12;
const FLAG_LAST = "kipp_t";

interface KippIndex {
  byTrigger: Record<string, KippLineDef[]>;
  byId: Record<string, KippLineDef>;
}

const indexCache = new WeakMap<ContentDB, KippIndex>();

function indexOf(content: ContentDB): KippIndex {
  let idx = indexCache.get(content);
  if (!idx) {
    // null prototypes: a trigger or id named "constructor" must not find Object's
    idx = { byTrigger: Object.create(null) as Record<string, KippLineDef[]>, byId: Object.create(null) as Record<string, KippLineDef> };
    const lines = content.kipp ?? [];
    for (const line of lines) {
      (idx.byTrigger[line.trigger] ??= []).push(line);
      idx.byId[line.id] = line;
    }
    indexCache.set(content, idx);
  }
  return idx;
}

export function kippLine(g: Game, id: string): KippLineDef | undefined {
  return indexOf(g.content).byId[id];
}

/** Replaces {key} placeholders. Unknown keys stay visible so missing vars are easy to spot. */
export function formatLine(text: string, vars?: Record<string, string | number>): string {
  if (!vars || text.indexOf("{") < 0) return text;
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}

// reused between calls: say() runs at most once per rate-limit window, but is called far more often
const eligible: KippLineDef[] = [];

/**
 * Says one line for `trigger` if the rate limit allows and an unused line fits. Returns whether a
 * line was emitted. Silent during offline simulation.
 */
export function say(g: Game, trigger: KippTrigger, vars?: Record<string, string | number>): boolean {
  if (g.offline) return false;
  const s = g.state;
  const story = s.story;
  const last = s.flags[FLAG_LAST];
  const gap = bal(g, "kippGapSecs", 8);
  if (last !== undefined && s.t >= last && s.t - last < gap) return false;

  const lines = indexOf(g.content).byTrigger[trigger];
  if (!lines || lines.length === 0) return false;

  const recent = story.kippRecent;
  if (vars !== undefined && (vars === null || typeof vars !== "object")) vars = undefined;
  const failure = typeof vars?.kind === "string" ? vars.kind : s.failure?.kind;
  eligible.length = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.failure !== undefined && line.failure !== failure) continue;
    if (recent.indexOf(line.id) >= 0) continue;
    if (line.when && !safeCheck(g, line.when)) continue;
    eligible.push(line);
  }
  if (eligible.length === 0) return false;
  const line = eligible[Math.min(eligible.length - 1, Math.floor(roll(g) * eligible.length))];
  eligible.length = 0;

  recent.push(line.id);
  while (recent.length > KIPP_RECENT) recent.shift();
  s.flags[FLAG_LAST] = s.t;
  story.kippNextAt = s.t + rollRange(g, bal(g, "kippIdleMin", 60), bal(g, "kippIdleMax", 150));
  stat(g, "kippLines");
  // callers may pass their own {name} (a system, a new crew member); {player} is always the engineer
  emit(g, { t: "kipp", line: line.id, vars: { name: s.player.name, ship: s.player.ship, player: s.player.name, ...vars } });
  return true;
}

export const kippSystem: SystemDef = {
  id: "meta.kipp",
  init(g) {
    const story = g.state.story;
    if (!Array.isArray(story.kippRecent)) story.kippRecent = [];
    if (story.kippRecent.length > KIPP_RECENT) story.kippRecent.splice(0, story.kippRecent.length - KIPP_RECENT);
    if (!Number.isFinite(story.kippNextAt)) story.kippNextAt = g.state.t + 30;
    g.api.say = (trigger, vars) => {
      say(g, trigger, vars);
    };
  },
  tick(g) {
    const s = g.state;
    if (s.t < s.story.kippNextAt) return;
    // The timer is long overdue: the game was away. Let whoever greets the player speak first.
    if (s.t - s.story.kippNextAt > 120) {
      s.story.kippNextAt = s.t + 20;
      return;
    }
    // idle chatter only fills silence: never over a story beat the player has not read yet
    if (s.story.pending.length === 0) say(g, "idle");
    if (s.story.kippNextAt <= s.t) s.story.kippNextAt = s.t + rollRange(g, bal(g, "kippIdleMin", 60), bal(g, "kippIdleMax", 150));
  },
};

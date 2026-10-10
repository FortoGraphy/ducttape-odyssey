import { describe, expect, it } from "vitest";
import * as B from "@/engine/big";
import { BACKLOG_TEMPLATES, ackBeat, backlogTicket, canChooseEnding, chooseEnding, currentBeat, finalChapter, objectives } from "@/engine/meta";
import type { Game } from "@/engine/types";
import { drain, findBadNumber, makeGame, run } from "./fixture";

function toChapter(g: Game, chapter: number): void {
  for (let n = g.state.story.chapter; n < chapter; n++) {
    g.state.stats.storyStep = n;
    run(g, 1.1);
  }
}

function finishStory(g: Game, ending = "answer"): void {
  toChapter(g, 12);
  g.state.stats.storyStep = 12;
  expect(chooseEnding(g, ending)).toEqual({ ok: true });
}

describe("chapters", () => {
  it("starts chapter 1 with the game and queues its intro beats", () => {
    const { g } = makeGame();
    expect(g.state.story.chapter).toBe(1);
    expect(g.state.story.pending).toHaveLength(2);
    expect(g.outbox).toContainEqual({ t: "chapter", id: 1 });
    expect(g.state.stats.chapters).toBe(1);

    expect(currentBeat(g)).toMatchObject({ chapter: 1, index: 0, beat: { speaker: "kipp", text: { en: "c1 beat 0" } } });
    expect(ackBeat(g)).toEqual({ ok: true });
    expect(currentBeat(g)).toMatchObject({ chapter: 1, index: 1, beat: { speaker: "narrator" } });
    expect(ackBeat(g)).toEqual({ ok: true });
    expect(currentBeat(g)).toBeNull();
    expect(ackBeat(g)).toEqual({ ok: false, reason: "noTarget" });
    expect(g.state.story.beat).toBe(2);
  });

  it("reports objectives for the active chapter", () => {
    const { g } = makeGame();
    expect(objectives(g)).toEqual([{ text: { cs: "Do step 1", en: "Do step 1" }, done: false }]);
    g.state.stats.storyStep = 1;
    expect(objectives(g)[0].done).toBe(true);
  });

  it("walks 1 -> 12 as each trigger starts to hold, unlocking features on the way", () => {
    const { g } = makeGame();
    drain(g);
    const started: number[] = [];
    for (let n = 1; n <= 11; n++) {
      run(g, 3);
      expect(g.state.story.chapter).toBe(n); // the trigger does not hold yet
      g.state.stats.storyStep = n;
      run(g, 1.1);
      expect(g.state.story.chapter).toBe(n + 1);
      for (const e of drain(g)) if (e.t === "chapter") started.push(e.id);
      if (n + 1 === 2) expect(g.state.features.nav).toBe(1);
      if (n + 1 === 4) expect(g.state.features.expeditions).toBeUndefined();
      if (n + 1 === 5) expect(g.state.features.expeditions).toBe(1);
    }
    expect(started).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(g.state.stats.chapters).toBe(12);
    expect(finalChapter(g)).toBe(12);
    run(g, 5);
    expect(g.state.story.chapter).toBe(12);
    // 11 chapters with two beats each (chapter 3 has none); chapter 1's two were never acknowledged
    expect(g.state.story.pending).toHaveLength(2 + 10 * 2);
  });

  it("never skips a chapter even when several triggers hold at once", () => {
    const { g } = makeGame();
    drain(g);
    g.state.stats.storyStep = 11;
    const started: number[] = [];
    for (let i = 0; i < 15; i++) {
      run(g, 1);
      for (const e of drain(g)) if (e.t === "chapter") started.push(e.id);
    }
    expect(started).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe("ending and the backlog", () => {
  it("offers the ending in chapter 12 and not before", () => {
    const { g } = makeGame();
    expect(chooseEnding(g, "answer")).toEqual({ ok: false, reason: "requirement" });
    toChapter(g, 11);
    expect(canChooseEnding(g)).toBe(false);
    expect(chooseEnding(g, "answer")).toEqual({ ok: false, reason: "requirement" });
    toChapter(g, 12);
    expect(g.state.story.chapter).toBe(12);
    expect(canChooseEnding(g)).toBe(true);
    for (const bad of ["", "has space", "x".repeat(33), "<b>", "a.b"]) expect(chooseEnding(g, bad)).toEqual({ ok: false, reason: "invalid" });
    expect(backlogTicket(g)).toBeNull();

    expect(chooseEnding(g, "answer")).toEqual({ ok: true });
    expect(g.state.story.ending).toBe("answer");
    expect(g.state.flags.ending_answer).toBe(1);
    expect(chooseEnding(g, "hang_up")).toEqual({ ok: false, reason: "max" });
    expect(g.state.story.ending).toBe("answer");
    expect(canChooseEnding(g)).toBe(false);

    // the final chapter's open objective stays on the list next to the first ticket
    const open = objectives(g);
    expect(open).toHaveLength(2);
    expect(open[0]).toEqual({ text: { cs: "Do step 12", en: "Do step 12" }, done: false });
    expect(open[1]).toMatchObject({ done: false, progress: 0 });
    g.state.stats.storyStep = 12;
    expect(objectives(g)).toHaveLength(1);
  });

  it("keeps issuing tickets: each one closes, pays stamps and is replaced", () => {
    const { g } = makeGame();
    finishStory(g);
    // already earned, so achievement stamps do not blur the ticket payouts counted below
    for (const a of g.content.achievements) if (a.reward?.stamps) g.state.achievements[a.id] = 1;
    drain(g);
    let prevKey = "";
    const keys = new Set<string>();
    // Big -> number goes through m * 10^e, so whole stamps are read back with a rounding step
    const held = (): number => Math.round(B.toNumber(g.state.prestige.stamps));
    let stamps = held();
    for (let i = 1; i <= 60; i++) {
      const ticket = backlogTicket(g);
      expect(ticket).not.toBeNull();
      if (!ticket) return;
      expect(ticket.n).toBe(i);
      expect(ticket.key).not.toBe(prevKey);
      expect(ticket.target).toBeGreaterThanOrEqual(1);
      expect(ticket.progress).toBe(0);
      expect(ticket.text.en).toContain(String(ticket.target));
      expect(ticket.text.cs).toContain(String(ticket.target));
      expect(ticket.text.en).not.toContain("{n}");
      expect(B.toNumber(ticket.reward)).toBeGreaterThanOrEqual(1);
      // the fixture never unlocks these features, so the backlog must not ask for them
      expect(["crafts", "researchLevels", "contracts"]).not.toContain(ticket.key);
      keys.add(ticket.key);
      prevKey = ticket.key;

      const view = objectives(g);
      expect(view).toHaveLength(1);
      expect(view[0]).toMatchObject({ done: false, progress: 0, target: ticket.target });

      // one short of the target is not enough
      g.state.stats[ticket.stat] = (g.state.stats[ticket.stat] ?? 0) + ticket.target - 1;
      run(g, 1.1);
      expect(backlogTicket(g)?.n).toBe(i);
      g.state.stats[ticket.stat] += 1;
      run(g, 1.1);
      expect(backlogTicket(g)?.n).toBe(i + 1);

      const now = held();
      expect(now).toBe(stamps + Math.round(B.toNumber(ticket.reward)));
      stamps = now;
      expect(drain(g).filter((e) => e.t === "questDone")).toEqual([{ t: "questDone", id: "backlog:" + i }]);
    }
    expect(g.state.stats.tickets).toBe(60);
    expect(keys.size).toBeGreaterThanOrEqual(4);
    expect(findBadNumber(g.state)).toBeNull();
  });

  it("issues the same tickets for the same universe seed", () => {
    const sequence = (seed: number): string[] => {
      const { g } = makeGame({ seed });
      finishStory(g);
      const out: string[] = [];
      for (let i = 0; i < 25; i++) {
        const ticket = backlogTicket(g);
        if (!ticket) break;
        out.push(`${ticket.key}:${ticket.target}`);
        g.state.stats[ticket.stat] = (g.state.stats[ticket.stat] ?? 0) + ticket.target;
        run(g, 1.1);
      }
      return out;
    };
    const a = sequence(11);
    expect(a).toHaveLength(25);
    expect(sequence(11)).toEqual(a);
    expect(sequence(12)).not.toEqual(a);
  });

  it("recovers a save that has an ending but no ticket", () => {
    const { g } = makeGame();
    finishStory(g);
    delete g.state.flags.backlog_n;
    expect(backlogTicket(g)).toBeNull();
    run(g, 1.1);
    expect(backlogTicket(g)?.n).toBe(1);
  });
});

describe("backlog text", () => {
  it("is bilingual and never puts a small number in front of a Czech genitive plural", () => {
    const keys = new Set<string>();
    for (const t of BACKLOG_TEMPLATES) {
      expect(keys.has(t.key)).toBe(false);
      keys.add(t.key);
      expect(t.text.cs).toContain("{n}");
      expect(t.text.en).toContain("{n}");
      expect(t.text.cs).not.toBe(t.text.en);
      // "{n} kusů" is only right from five up; the smallest target is 85 % of the base
      if (/\{n\} \p{Ll}/u.test(t.text.cs)) expect(Math.round(t.base * 0.85)).toBeGreaterThanOrEqual(5);
      // English needs a plural too
      expect(Math.round(t.base * 0.85)).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("crew logs", () => {
  it("hands out logs in discovery order, each once", () => {
    const { g } = makeGame();
    drain(g);
    expect(g.api.addLog()).toBe("log_a");
    expect(g.api.addLog("log_c")).toBe("log_c");
    expect(g.api.addLog("log_c")).toBeNull();
    expect(g.api.addLog("ghost")).toBeNull();
    expect(g.api.addLog()).toBe("log_b");
    expect(g.api.addLog()).toBe("log_d");
    expect(g.api.addLog()).toBeNull();
    expect(g.state.story.logs).toEqual(["log_a", "log_c", "log_b", "log_d"]);
    expect(g.state.stats.logs).toBe(4);
    expect(drain(g).filter((e) => e.t === "log")).toHaveLength(4);
  });
});

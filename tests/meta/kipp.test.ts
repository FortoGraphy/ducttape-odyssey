import { describe, expect, it } from "vitest";
import { Rng } from "@/engine/prng";
import { KIPP_RECENT, ackBeat, formatLine, kippLine } from "@/engine/meta";
import type { EngineEvent, Game } from "@/engine/types";
import { KIPP_TRIGGERS, drain, makeGame, run } from "./fixture";

type KippEvent = Extract<EngineEvent, { t: "kipp" }>;

const kippEvents = (g: Game): KippEvent[] => drain(g).filter((e): e is KippEvent => e.t === "kipp");

function quiet(g: Game): void {
  while (ackBeat(g).ok);
  drain(g);
}

describe("KIPP", () => {
  it("says a line of the requested trigger and fills in the player's names", () => {
    const { g } = makeGame();
    quiet(g);
    g.api.say("purchase", { n: 3 });
    const said = kippEvents(g);
    expect(said).toHaveLength(1);
    expect(said[0].line.startsWith("purchase_")).toBe(true);
    expect(said[0].vars).toEqual({ name: "Chief Wrench", ship: "S.S. Gaffer", player: "Chief Wrench", n: 3 });
    expect(g.state.stats.kippLines).toBe(1);
    expect(g.state.story.kippRecent).toEqual([said[0].line]);
    const def = kippLine(g, said[0].line);
    expect(def?.trigger).toBe("purchase");
    expect(formatLine(def?.text.en ?? "", said[0].vars)).toBe(`${said[0].line.replace("_", " ")} Chief Wrench 3`);
    expect(formatLine("{unknown} stays", { n: 1 })).toBe("{unknown} stays");

    // other areas pass their own {name} (a system, a new crew member); {player} stays the engineer
    g.state.t += 10;
    g.api.say("arrival", { name: "Kepler's Folly" });
    expect(kippEvents(g)[0].vars).toMatchObject({ name: "Kepler's Folly", player: "Chief Wrench" });
  });

  it("speaks at most once per 8 seconds", () => {
    const { g } = makeGame();
    quiet(g);
    g.api.say("purchase");
    expect(kippEvents(g)).toHaveLength(1);
    for (let i = 0; i < 50; i++) g.api.say("purchase");
    g.state.t += 7.9;
    g.api.say("jump");
    expect(kippEvents(g)).toHaveLength(0);
    g.state.t += 0.2;
    g.api.say("jump");
    expect(kippEvents(g)).toHaveLength(1);
    expect(g.state.stats.kippLines).toBe(2);
  });

  it("never repeats one of the last 12 lines and keeps the rate limit over 10 000 calls", () => {
    const { g } = makeGame();
    quiet(g);
    const rng = new Rng(99);
    const said: { id: string; t: number }[] = [];
    for (let i = 0; i < 10_000; i++) {
      g.state.t += rng.range(0, 6);
      // mostly the two big pools, so the no-repeat window is under real pressure
      const trigger = rng.chance(0.7) ? (rng.chance(0.5) ? "purchase" : "idle") : rng.pick(KIPP_TRIGGERS);
      g.api.say(trigger, { n: i });
      for (const e of kippEvents(g)) said.push({ id: e.line, t: g.state.t });
    }
    expect(said.length).toBeGreaterThan(1500);
    for (let i = 1; i < said.length; i++) {
      expect(said[i].t - said[i - 1].t).toBeGreaterThanOrEqual(8);
      const window = said.slice(Math.max(0, i - KIPP_RECENT), i).map((x) => x.id);
      expect(window).not.toContain(said[i].id);
    }
    expect(g.state.story.kippRecent.length).toBeLessThanOrEqual(KIPP_RECENT);
    expect(g.state.stats.kippLines).toBe(said.length);
  });

  it("stays silent rather than repeat when a small pool is used up", () => {
    const { g } = makeGame();
    quiet(g);
    const said: string[] = [];
    for (let i = 0; i < 10; i++) {
      g.state.t += 10;
      g.api.say("jump");
      for (const e of kippEvents(g)) said.push(e.line);
    }
    // three "jump" lines exist: all are said once, then nothing until they leave the recent window
    expect(said.slice().sort()).toEqual(["jump_0", "jump_1", "jump_2"]);
  });

  it("filters failure lines by the active failure and honours conditions", () => {
    const { g } = makeGame();
    quiet(g);
    g.state.failure = { kind: "breach", since: 0, waitUntil: 0, tow: null };
    const said = new Set<string>();
    for (let i = 0; i < 400; i++) {
      g.state.t += 9;
      g.state.story.kippRecent.length = 0;
      g.api.say(i % 2 ? "failure" : "debug");
      for (const e of kippEvents(g)) said.add(e.line);
    }
    expect(said.has("failure_breach")).toBe(true);
    expect(said.has("failure_tumble")).toBe(false);
    expect(said.has("failure_0")).toBe(true);
    expect(said.has("debug_gated")).toBe(false);
    g.state.flags.never_set = 1;
    for (let i = 0; i < 200; i++) {
      g.state.t += 9;
      g.state.story.kippRecent.length = 0;
      g.api.say("debug");
      for (const e of kippEvents(g)) said.add(e.line);
    }
    expect(said.has("debug_gated")).toBe(true);
  });

  it("is silent during offline simulation and for triggers without lines", () => {
    const { g } = makeGame();
    quiet(g);
    g.offline = true;
    g.api.say("purchase");
    g.offline = false;
    expect(g.state.story.kippRecent).toEqual([]);
    expect(g.state.stats.kippLines).toBeUndefined();
    g.api.say("nonexistent" as never);
    expect(kippEvents(g)).toHaveLength(0);
  });

  it("chatters every 60 to 150 seconds when nothing else was said", () => {
    const { g } = makeGame();
    quiet(g);
    const times: number[] = [];
    for (let i = 0; i < 1500; i++) {
      run(g, 1);
      for (const e of kippEvents(g)) {
        expect(e.line.startsWith("idle_")).toBe(true);
        times.push(g.state.t);
      }
    }
    expect(times.length).toBeGreaterThanOrEqual(Math.floor(1500 / 150) - 1);
    expect(times.length).toBeLessThanOrEqual(Math.ceil(1500 / 60));
    for (let i = 1; i < times.length; i++) {
      // sampled once per second, hence the slack
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(59);
      expect(times[i] - times[i - 1]).toBeLessThanOrEqual(151);
    }
  });

  it("does not chatter over an unread story beat, and other speech postpones the chatter", () => {
    const { g } = makeGame();
    drain(g);
    run(g, 400);
    expect(kippEvents(g)).toHaveLength(0);

    quiet(g);
    for (let i = 0; i < 30; i++) {
      run(g, 20);
      g.api.say("purchase");
    }
    const said = kippEvents(g);
    expect(said.length).toBeGreaterThan(10);
    expect(said.every((e) => e.line.startsWith("purchase_"))).toBe(true);
  });
});

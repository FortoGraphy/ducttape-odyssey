import { describe, expect, it } from "vitest";

import { content } from "@/content";
import { newGame } from "@/engine";
import { compactCodex, codexSummary } from "@/engine/meta";

describe("codex compaction", () => {
  it("drops unnamed procedural entries of past galaxies and keeps counters, names and artifacts", () => {
    const g = newGame(content, 7, 0);
    const s = g.state;
    for (let i = 0; i < 25; i++) g.api.discover(`planet:0:${i}:0:0`);
    g.api.discover("fauna:0:3:0:1:2");
    g.api.discover("artifact:relic_coin");
    g.api.discover("phenomenon_echo");
    s.codex["planet:0:4:0:0"].name = "Domov";
    const before = codexSummary(g).total;
    s.nav.g = 1;
    g.api.discover("planet:1:0:0:0");
    const removed = compactCodex(g);
    expect(removed).toBe(25);
    expect(s.codex["planet:0:4:0:0"].name).toBe("Domov");
    expect(s.codex["artifact:relic_coin"]).toBeTruthy();
    expect(s.codex["phenomenon_echo"]).toBeTruthy();
    expect(s.codex["planet:1:0:0:0"]).toBeTruthy();
    expect(codexSummary(g).total).toBe(before + 1);
  });
});

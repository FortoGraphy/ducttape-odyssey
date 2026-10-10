import { describe, expect, it } from "vitest";

import { eventList, events } from "@/content/events";
import type { Condition, EventDef, EventEffect, EventType, FailureKind, L10n, MinigameId } from "@/engine/types";

// Canonical ids from docs/AGENT_BRIEF.md. Events may reference nothing else.
const RAW = "scrap ice silicates carbon hydrogen conductite lumite voidglass antimatter organics sulfur ferrite helium3 brine xenon strange_dust";
const REFINED = "alloy coolant fuel glass polymer slag water oxygen wire ceramic";
const COMPONENTS = "circuit actuator plating lens power_cell tubing";
const CONSUMABLES = "duct_tape spare_parts nano_gel fuel_cell coffee beacon";
const FAMILIES = "laser engine shield scanner reactor cargo repair life".split(" ");
const CANONICAL_ITEMS = new Set<string>([
  ...RAW.split(" "),
  ...REFINED.split(" "),
  ...COMPONENTS.split(" "),
  ...CONSUMABLES.split(" "),
  ...FAMILIES.flatMap((f) => [1, 2, 3, 4, 5].map((mk) => `mod_${f}_mk${mk}`)),
]);
const DECKS = "bridge observatory quarters lab greenhouse hangar workshop fabricator refinery cargo lift reactor mining".split(" ");
const FAILURES: FailureKind[] = ["tumble", "breach", "blackout", "noFuel", "engine", "radiation", "boarding", "anomaly"];
const MINIGAMES: MinigameId[] = ["weld", "wire", "rhythm", "valves", "calibrate", "tape", "defense", "dock", "hack"];
const EFFECT_KINDS: EventEffect["t"][] = [
  "credits",
  "item",
  "loseCargo",
  "hull",
  "moduleDamage",
  "fuel",
  "morale",
  "rep",
  "flag",
  "failure",
  "minigame",
  "blueprint",
  "crew",
  "card",
  "log",
  "codex",
  "rp",
  "buff",
  "chain",
];
const TYPE_MINIMUMS: Record<EventType, number> = {
  meteor: 7,
  pirates: 8,
  merchant: 7,
  derelict: 9,
  anomaly: 7,
  flare: 5,
  fauna: 7,
  distress: 7,
  fault: 9,
  stowaway: 5,
  kipp: 8,
  contact: 5,
  story: 6,
};

/** Every effect of an event, including the win/lose branches of mini-games. */
function walk(effects: EventEffect[], out: EventEffect[] = []): EventEffect[] {
  for (const e of effects) {
    out.push(e);
    if (e.t === "minigame") {
      walk(e.win, out);
      walk(e.lose, out);
    }
  }
  return out;
}

function effectsOf(ev: EventDef): EventEffect[] {
  const out: EventEffect[] = [];
  for (const c of ev.choices) for (const o of c.outcomes) walk(o.effects, out);
  return out;
}

function conditionsOf(c: Condition | undefined, out: Condition[] = []): Condition[] {
  if (!c) return out;
  out.push(c);
  for (const x of c.all ?? []) conditionsOf(x, out);
  for (const x of c.any ?? []) conditionsOf(x, out);
  conditionsOf(c.not, out);
  return out;
}

function chainTargets(ev: EventDef): string[] {
  return effectsOf(ev).flatMap((e) => (e.t === "chain" ? [e.event] : []));
}

/** Counts sentence terminators that end a sentence, tolerating closing quotes and the ship prefix "S.S.". */
function sentences(s: string): number {
  const t = s.replace(/S\.S\./g, "SS").replace(/\.\.\./g, "…");
  const m = t.match(/[.!?…]+(?=["“”„'’)\]]*(\s|$))/g);
  return Math.max(1, m ? m.length : 0);
}

function strings(ev: EventDef): { where: string; l: L10n }[] {
  const out = [
    { where: `${ev.id}.title`, l: ev.title },
    { where: `${ev.id}.text`, l: ev.text },
  ];
  for (const c of ev.choices) {
    out.push({ where: `${ev.id}.${c.id}.label`, l: c.label });
    c.outcomes.forEach((o, i) => out.push({ where: `${ev.id}.${c.id}.outcome${i}`, l: o.text }));
  }
  return out;
}

const NON_ASCII_LETTER = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/;
const isEarly = (e: EventDef) => !e.chainOnly && (!e.when || (e.when.depthMax !== undefined && e.when.depthMax <= 3));

describe("content/events: coverage", () => {
  it("has at least 90 events (hard minimum 80) and the record matches the list", () => {
    expect(eventList.length).toBeGreaterThanOrEqual(80);
    expect(eventList.length).toBeGreaterThanOrEqual(90);
    expect(Object.keys(events).length).toBe(eventList.length);
    for (const e of eventList) expect(events[e.id]).toBe(e);
  });

  it("has unique ids prefixed with the event type", () => {
    const seen = new Set<string>();
    for (const e of eventList) {
      expect(seen.has(e.id), `duplicate id ${e.id}`).toBe(false);
      seen.add(e.id);
      expect(e.id, e.id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(e.id.startsWith(`${e.type}_`), `${e.id} should start with ${e.type}_`).toBe(true);
    }
  });

  it("meets the per-type minimums", () => {
    const counts: Record<string, number> = {};
    for (const e of eventList) counts[e.type] = (counts[e.type] ?? 0) + 1;
    for (const [type, min] of Object.entries(TYPE_MINIMUMS)) {
      expect(counts[type] ?? 0, `type ${type}`).toBeGreaterThanOrEqual(min);
    }
    expect(Object.keys(counts).sort()).toEqual(Object.keys(TYPE_MINIMUMS).sort());
  });

  it("has at least 15 gentle early-game events", () => {
    const early = eventList.filter(isEarly);
    expect(early.length).toBeGreaterThanOrEqual(15);
    // The very first event must not depend on unlocked features: enough events with no condition at all.
    expect(eventList.filter((e) => !e.chainOnly && !e.when).length).toBeGreaterThanOrEqual(15);
    for (const e of early) {
      for (const fx of effectsOf(e)) {
        expect(fx.t, `${e.id} is early-game and must not start a failure`).not.toBe("failure");
        if (fx.t === "hull") expect(fx.pct, `${e.id} hull`).toBeGreaterThanOrEqual(-8);
        if (fx.t === "moduleDamage") expect(fx.pct, `${e.id} moduleDamage`).toBeLessThanOrEqual(15);
        if (fx.t === "loseCargo") expect(fx.pct, `${e.id} loseCargo`).toBeLessThanOrEqual(5);
      }
    }
  });

  it("uses every effect variant, every failure kind and every mini-game", () => {
    const all = eventList.flatMap(effectsOf);
    const kinds = new Set(all.map((e) => e.t));
    for (const k of EFFECT_KINDS) expect(kinds.has(k), `effect ${k}`).toBe(true);
    const failures = new Set(all.flatMap((e) => (e.t === "failure" ? [e.kind] : [])));
    for (const f of FAILURES) expect(failures.has(f), `failure ${f}`).toBe(true);
    const games = new Set(all.flatMap((e) => (e.t === "minigame" ? [e.game] : [])));
    for (const g of MINIGAMES) expect(games.has(g), `minigame ${g}`).toBe(true);
    expect(all.some((e) => e.t === "item" && e.scaled)).toBe(true);
    expect(all.some((e) => e.t === "item" && !e.scaled)).toBe(true);
  });

  it("gates events with a wide range of conditions", () => {
    const conds = eventList.flatMap((e) => [...conditionsOf(e.when), ...e.choices.flatMap((c) => conditionsOf(c.requires))]);
    const used = new Set(conds.flatMap((c) => Object.keys(c)));
    for (const key of ["depthMin", "depthMax", "chapterMin", "feature", "star", "hazard", "failure", "rep", "flag", "flagNot", "deck", "modulesMin"]) {
      expect(used.has(key), `condition ${key}`).toBe(true);
    }
  });
});

describe("content/events: structure", () => {
  it("has 2 to 4 choices per event with unique choice ids and a valid risk", () => {
    for (const e of eventList) {
      expect(e.choices.length, e.id).toBeGreaterThanOrEqual(2);
      expect(e.choices.length, e.id).toBeLessThanOrEqual(4);
      expect(new Set(e.choices.map((c) => c.id)).size, `${e.id} choice ids`).toBe(e.choices.length);
      for (const c of e.choices) expect([0, 1, 2], `${e.id}.${c.id} risk`).toContain(c.risk);
      expect(e.weight, `${e.id} weight`).toBeGreaterThan(0);
    }
  });

  it("has 1 to 3 outcomes per choice with positive weights", () => {
    for (const e of eventList) {
      for (const c of e.choices) {
        expect(c.outcomes.length, `${e.id}.${c.id}`).toBeGreaterThanOrEqual(1);
        expect(c.outcomes.length, `${e.id}.${c.id}`).toBeLessThanOrEqual(3);
        for (const o of c.outcomes) {
          expect(o.weight, `${e.id}.${c.id} weight`).toBeGreaterThan(0);
          expect(Array.isArray(o.effects), `${e.id}.${c.id} effects`).toBe(true);
        }
      }
    }
  });

  it("always offers one choice with no requirement and no cost", () => {
    for (const e of eventList) {
      const free = e.choices.filter((c) => !c.requires && !c.cost);
      expect(free.length, `${e.id} has no free choice`).toBeGreaterThanOrEqual(1);
    }
  });

  it("offers a choice of every caution level an offline policy may want", () => {
    // A cautious policy must always find a low-risk free choice (risk 0 or 1).
    for (const e of eventList) {
      const safe = e.choices.filter((c) => !c.requires && !c.cost && c.risk <= 1);
      expect(safe.length, `${e.id} has no free choice with risk <= 1`).toBeGreaterThanOrEqual(1);
    }
  });

  it("uses `once` or a cooldown, never both missing, and marks story beats `once`", () => {
    for (const e of eventList) {
      if (e.chainOnly) {
        expect(e.when, `${e.id} is chainOnly and should not carry its own condition`).toBeUndefined();
        continue;
      }
      expect(e.once === true || (e.cooldown ?? 0) > 0, `${e.id} needs once or cooldown`).toBe(true);
      if (e.type === "story") {
        expect(e.once, `${e.id} story beat must be once`).toBe(true);
        expect(effectsOf(e).some((fx) => fx.t === "flag" || fx.t === "chain"), `${e.id} must set a flag`).toBe(true);
      }
      if (e.type === "contact") {
        const c = e.when ?? {};
        expect(c.depthMin !== undefined && c.chapterMin !== undefined, `${e.id} must be gated by depth and chapter`).toBe(true);
      }
    }
  });

  it("gives every mini-game a win and a lose branch", () => {
    for (const e of eventList) {
      for (const fx of effectsOf(e)) {
        if (fx.t !== "minigame") continue;
        expect(fx.win.length, `${e.id} ${fx.game} win`).toBeGreaterThan(0);
        expect(fx.lose.length, `${e.id} ${fx.game} lose`).toBeGreaterThan(0);
        expect([1, 2, 3]).toContain(fx.tier);
        expect([...fx.win, ...fx.lose].some((x) => x.t === "minigame"), `${e.id} nested minigame`).toBe(false);
      }
    }
  });
});

describe("content/events: chains", () => {
  it("only chains to existing events, and every chainOnly event is a target", () => {
    const targeted = new Set<string>();
    for (const e of eventList) {
      for (const t of chainTargets(e)) {
        expect(events[t], `${e.id} chains to missing ${t}`).toBeDefined();
        expect(events[t].chainOnly, `${e.id} chains to ${t}, which is not chainOnly`).toBe(true);
        targeted.add(t);
      }
    }
    for (const e of eventList) if (e.chainOnly) expect(targeted.has(e.id), `${e.id} is never chained to`).toBe(true);
  });

  it("has no chain cycles", () => {
    const state = new Map<string, 1 | 2>();
    const visit = (id: string, path: string[]): void => {
      if (state.get(id) === 2) return;
      expect(state.get(id), `cycle: ${[...path, id].join(" -> ")}`).not.toBe(1);
      state.set(id, 1);
      for (const t of chainTargets(events[id])) visit(t, [...path, id]);
      state.set(id, 2);
    };
    for (const e of eventList) visit(e.id, []);
  });

  it("has at least 8 chains, some of them 3 steps long", () => {
    const roots = eventList.filter((e) => !e.chainOnly && chainTargets(e).length > 0);
    expect(roots.length).toBeGreaterThanOrEqual(8);
    const depth = (id: string): number => 1 + Math.max(0, ...chainTargets(events[id]).map(depth));
    expect(roots.filter((r) => depth(r.id) >= 3).length).toBeGreaterThanOrEqual(2);
  });
});

describe("content/events: references and balance", () => {
  it("references only canonical item, deck, faction and flag ids", () => {
    const flagsSet = new Set(eventList.flatMap(effectsOf).flatMap((fx) => (fx.t === "flag" ? [fx.key] : [])));
    for (const e of eventList) {
      for (const fx of effectsOf(e)) {
        if (fx.t === "item") {
          expect(CANONICAL_ITEMS.has(fx.item), `${e.id} item ${fx.item}`).toBe(true);
          expect(fx.n, `${e.id} item ${fx.item} amount`).toBeGreaterThan(0);
        }
        if (fx.t === "card" && fx.deck) expect(DECKS, `${e.id} card deck`).toContain(fx.deck);
        if (fx.t === "moduleDamage" && fx.family) expect(FAMILIES, `${e.id} family`).toContain(fx.family);
        if (fx.t === "failure") expect(FAILURES).toContain(fx.kind);
        if (fx.t === "codex" || fx.t === "flag") expect(fx.key, `${e.id} key`).toMatch(/^[a-z][a-z0-9_]*$/);
      }
      for (const c of e.choices) {
        for (const item of Object.keys(c.cost?.items ?? {})) {
          expect(CANONICAL_ITEMS.has(item), `${e.id}.${c.id} cost item ${item}`).toBe(true);
          expect(c.cost?.items?.[item], `${e.id}.${c.id} cost amount`).toBeGreaterThan(0);
        }
        if (c.cost?.credits !== undefined) expect(c.cost.credits, `${e.id}.${c.id} cost`).toBeGreaterThan(0);
      }
      const conds = [...conditionsOf(e.when), ...e.choices.flatMap((c) => conditionsOf(c.requires))];
      for (const c of conds) {
        if (c.item) expect(CANONICAL_ITEMS.has(c.item.id), `${e.id} condition item`).toBe(true);
        if (c.deck) expect(DECKS, `${e.id} condition deck`).toContain(c.deck.id);
        if (c.flag) expect(flagsSet.has(c.flag), `${e.id} waits for flag ${c.flag} that nothing sets`).toBe(true);
        if (c.flagNot) expect(flagsSet.has(c.flagNot), `${e.id} checks flag ${c.flagNot} that nothing sets`).toBe(true);
      }
    }
  });

  it("keeps rewards and penalties inside the balance envelope", () => {
    for (const e of eventList) {
      for (const fx of effectsOf(e)) {
        const at = `${e.id} ${fx.t}`;
        if (fx.t === "credits") {
          expect(fx.secs, at).toBeGreaterThanOrEqual(-120);
          expect(fx.secs, at).toBeLessThanOrEqual(240);
          expect(fx.secs, at).not.toBe(0);
        }
        if (fx.t === "rp") {
          expect(fx.secs, at).toBeGreaterThan(0);
          expect(fx.secs, at).toBeLessThanOrEqual(300);
        }
        if (fx.t === "hull") {
          expect(fx.pct, at).toBeGreaterThanOrEqual(-15);
          expect(fx.pct, at).toBeLessThanOrEqual(20);
        }
        if (fx.t === "moduleDamage") {
          expect(fx.pct, at).toBeGreaterThanOrEqual(5);
          expect(fx.pct, at).toBeLessThanOrEqual(25);
          expect(fx.count ?? 1, at).toBeLessThanOrEqual(2);
        }
        if (fx.t === "loseCargo") {
          expect(fx.pct, at).toBeGreaterThan(0);
          expect(fx.pct, at).toBeLessThanOrEqual(15);
        }
        if (fx.t === "morale") expect(Math.abs(fx.n), at).toBeLessThanOrEqual(10);
        if (fx.t === "rep") expect(Math.abs(fx.n), at).toBeLessThanOrEqual(10);
        if (fx.t === "buff") {
          expect(fx.secs, at).toBeGreaterThanOrEqual(60);
          expect(fx.secs, at).toBeLessThanOrEqual(3600);
          expect(fx.effect.stat ?? fx.effect.deck, at).toBeDefined();
          expect(fx.effect.mul ?? 1 + (fx.effect.add ?? 0), at).toBeLessThanOrEqual(1.5);
        }
        if (fx.t === "item" && !fx.scaled) expect(fx.n, `${at} unscaled ${fx.item}`).toBeLessThanOrEqual(20);
        if (fx.t === "item" && fx.item.startsWith("mod_")) expect(fx.n, at).toBe(1);
      }
    }
  });

  it("keeps failures rare: only behind risky choices, lost mini-games or ignored fault chains", () => {
    for (const e of eventList) {
      for (const c of e.choices) {
        const total = c.outcomes.reduce((s, o) => s + o.weight, 0);
        for (const o of c.outcomes) {
          const direct = o.effects.some((fx) => fx.t === "failure");
          if (!direct) continue;
          expect(c.risk, `${e.id}.${c.id} starts a failure, so it must be risk 2`).toBe(2);
          const share = o.weight / total;
          if (!e.chainOnly) expect(share, `${e.id}.${c.id} failure share`).toBeLessThanOrEqual(0.5);
        }
        const viaGame = c.outcomes.some((o) => o.effects.some((fx) => fx.t === "minigame" && fx.lose.some((x) => x.t === "failure")));
        if (viaGame) expect(c.risk, `${e.id}.${c.id} can fail into a failure state`).toBeGreaterThanOrEqual(1);
      }
      if (!e.chainOnly && effectsOf(e).some((fx) => fx.t === "failure")) {
        expect(e.when?.failure, `${e.id} can start a failure and must require failure: "none"`).toBe("none");
      }
    }
  });
});

describe("content/events: text", () => {
  it("has non-empty, distinct Czech and English for every string", () => {
    for (const e of eventList) {
      for (const { where, l } of strings(e)) {
        expect(l.cs.trim().length, `${where} cs`).toBeGreaterThan(0);
        expect(l.en.trim().length, `${where} en`).toBeGreaterThan(0);
        expect(l.cs, `${where} cs equals en`).not.toBe(l.en);
        expect(l.cs, `${where} cs trim`).toBe(l.cs.trim());
        expect(l.en, `${where} en trim`).toBe(l.en.trim());
      }
    }
  });

  it("writes Czech with diacritics", () => {
    const bodies = eventList.map((e) => e.text.cs);
    const withDiacritics = bodies.filter((b) => NON_ASCII_LETTER.test(b)).length;
    expect(withDiacritics / bodies.length).toBeGreaterThanOrEqual(0.9);
    const outcomes = eventList.flatMap((e) => e.choices.flatMap((c) => c.outcomes.map((o) => o.text.cs)));
    expect(outcomes.filter((b) => NON_ASCII_LETTER.test(b)).length / outcomes.length).toBeGreaterThanOrEqual(0.9);
  });

  it("respects length limits", () => {
    const problems: string[] = [];
    for (const e of eventList) {
      for (const lang of ["cs", "en"] as const) {
        if (e.title[lang].length > 32) problems.push(`${e.id}.title.${lang} is ${e.title[lang].length} chars`);
        const body = sentences(e.text[lang]);
        if (body > 4) problems.push(`${e.id}.text.${lang} has ${body} sentences`);
        if (e.text[lang].length > 260) problems.push(`${e.id}.text.${lang} is ${e.text[lang].length} chars`);
        for (const c of e.choices) {
          if (c.label[lang].length > 28) problems.push(`${e.id}.${c.id}.label.${lang} is ${c.label[lang].length} chars`);
          c.outcomes.forEach((o, i) => {
            const n = sentences(o.text[lang]);
            if (n > 2) problems.push(`${e.id}.${c.id}.outcome${i}.${lang} has ${n} sentences`);
            if (o.text[lang].length > 190) problems.push(`${e.id}.${c.id}.outcome${i}.${lang} is ${o.text[lang].length} chars`);
          });
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("keeps both languages in the same length class", () => {
    const problems: string[] = [];
    for (const e of eventList) {
      for (const { where, l } of strings(e)) {
        const [a, b] = [l.cs.length, l.en.length];
        if (Math.max(a, b) > 40 && Math.max(a, b) / Math.min(a, b) > 1.6) problems.push(`${where}: cs ${a} vs en ${b}`);
      }
      const s = [sentences(e.text.cs), sentences(e.text.en)];
      if (Math.abs(s[0] - s[1]) > 1) problems.push(`${e.id}.text sentence count cs ${s[0]} vs en ${s[1]}`);
    }
    expect(problems).toEqual([]);
  });

  it("uses clean typography and no leftover placeholders", () => {
    const problems: string[] = [];
    for (const e of eventList) {
      for (const { where, l } of strings(e)) {
        for (const lang of ["cs", "en"] as const) {
          const s = l[lang];
          if (/["{}<>]|--|—|\s{2,}|TODO/.test(s)) problems.push(`${where}.${lang}: ${s}`);
        }
        if (/[“”]/.test(l.cs.replace(/„[^“]*“/g, ""))) problems.push(`${where}.cs has unbalanced Czech quotes`);
        if ((l.en.match(/“/g) ?? []).length !== (l.en.match(/”/g) ?? []).length) problems.push(`${where}.en has unbalanced quotes`);
        if (/„/.test(l.en)) problems.push(`${where}.en uses Czech quotes`);
      }
    }
    expect(problems).toEqual([]);
  });
});

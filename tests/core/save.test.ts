import { describe, expect, it } from "vitest";
import * as B from "../../src/engine/big";
import { coreSystems, deserialize, exportCode, importCode, migrate, migrations, sanitizeState, serialize } from "../../src/engine/core";
import { base64urlDecode, base64urlEncode, crc32, lzCompress, lzDecompress, utf8Decode, utf8Encode } from "../../src/engine/core/save";
import { SCHEMA_VERSION, createGame, newState } from "../../src/engine/kernel";
import { Rng } from "../../src/engine/prng";
import type { GameState } from "../../src/engine/types";
import { content, midGame, num, run } from "./fixture";

function played(): GameState {
  const g = midGame(31);
  run(g, 120);
  g.state.player.name = "Šéf Klíč ✦ 🚀";
  g.state.minigame = { token: 5, game: "weld", tier: 2, purpose: "repair", ref: 0 };
  return g.state;
}

describe("building blocks", () => {
  it("crc32 matches the standard check value", () => {
    expect(crc32(utf8Encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it("utf8 and base64url round-trip", () => {
    const text = "Příliš žluťoučký kůň ✦ 🚀 \u0000 end";
    expect(utf8Decode(utf8Encode(text))).toBe(text);
    expect(Array.from(utf8Encode("é€🚀"))).toEqual(Array.from(new TextEncoder().encode("é€🚀")));
    const rng = new Rng(1);
    for (let len = 0; len < 70; len++) {
      const bytes = new Uint8Array(len).map(() => rng.int(0, 255));
      const enc = base64urlEncode(bytes);
      expect(enc).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(Array.from(base64urlDecode(enc)!)).toEqual(Array.from(bytes));
    }
    expect(base64urlDecode("ab$d")).toBeNull();
    expect(base64urlDecode("abcde")).toBeNull();
  });

  it("LZ round-trips every kind of input and rejects malformed streams", () => {
    const rng = new Rng(2);
    const samples: Uint8Array[] = [
      new Uint8Array(0),
      utf8Encode("a"),
      utf8Encode("abcabcabcabcabcabcabcabcabcabcabcabc"),
      new Uint8Array(5000), // long zero run: overlapping match with length extension
      new Uint8Array(70000).map(() => rng.int(0, 255)), // incompressible, long literal run
      utf8Encode(JSON.stringify(played())),
      utf8Encode('{"m":1.5,"e":3}'.repeat(4000)), // matches further apart than a short window
    ];
    for (const raw of samples) {
      const packed = lzCompress(raw);
      const back = lzDecompress(packed, raw.length);
      expect(back).not.toBeNull();
      expect(back!.length).toBe(raw.length);
      let same = true;
      for (let i = 0; i < raw.length && same; i++) same = back![i] === raw[i];
      expect(same).toBe(true);
    }
    const json = samples[5];
    const packed = lzCompress(json);
    expect(packed.length).toBeLessThan(json.length * 0.6); // it actually compresses saves
    expect(lzDecompress(packed, json.length - 1)).toBeNull();
    expect(lzDecompress(packed, json.length + 1)).toBeNull();
    expect(lzDecompress(packed.subarray(0, packed.length - 3), json.length)).toBeNull();
    expect(lzDecompress(new Uint8Array([0x0f, 1, 0]), 20)).toBeNull(); // match before any output
    expect(lzDecompress(packed, 1e12)).toBeNull();
  });
});

describe("serialize / deserialize", () => {
  it("round-trips a played state exactly", () => {
    const state = played();
    const text = serialize(state);
    expect(text.startsWith("DTOS1:")).toBe(true);
    const res = deserialize(text, content, state.wall + 1000);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // sanitising only normalises: mining is released, everything else is identical
    expect(res.state).toEqual({ ...state, active: { ...state.active, mining: false } });
    // the loaded state runs
    const g = createGame(content, coreSystems, res.state);
    g.api.currentSystem = () => ({ id: "0:0:0", g: 0, depth: 0, lane: 0, name: "", star: "yellow", seed: 1, hazards: [], richness: 1, resources: [{ item: "scrap", w: 1 }], planets: [], belts: 0, station: null, anomaly: false, links: [], pos: { x: 0, y: 0 }, isCore: false });
    const before = num(g.state.credits);
    run(g, 10);
    expect(num(g.state.credits)).toBeGreaterThan(before);
    expect(num(g.rates.income)).toBeGreaterThan(0);
  });

  it("is deterministic after a round trip (same rolls, same result)", () => {
    const a = midGame(40);
    run(a, 50);
    const res = deserialize(serialize(a.state), content);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const b = createGame(content, coreSystems, res.state);
    b.api.currentSystem = a.api.currentSystem;
    run(a, 200);
    run(b, 200);
    expect(b.state.rng).toBe(a.state.rng);
    expect(b.state.active.salvage).toEqual(a.state.active.salvage);
    // caches (smoothed income, sub-second timers) restart on load, so credits agree closely, not bit for bit
    expect(Math.abs(num(b.state.credits) / num(a.state.credits) - 1)).toBeLessThan(0.01);
  });

  it("rejects corrupted, truncated and foreign input without throwing", () => {
    const text = serialize(played());
    const bad: unknown[] = [
      "",
      "   ",
      null,
      undefined,
      42,
      {},
      "hello",
      "DTOS1:",
      "DTOS1:zzzzzzzz:{}",
      text.slice(0, text.length - 1),
      text.slice(0, Math.floor(text.length / 2)),
      text.slice(0, 20),
      text.replace("DTOS1:", "DTOS2:"),
      "{",
      "{}",
      "[]",
      '{"v":1}',
      '{"v":"1","t":0,"decks":{},"inv":{},"credits":{"m":0,"e":0}}',
      '{"v":99,"t":0,"decks":{},"inv":{},"credits":{"m":0,"e":0}}',
      '{"v":-1,"t":0,"decks":{},"inv":{},"credits":{"m":0,"e":0}}',
      text + "x",
    ];
    for (const input of bad) {
      let res: ReturnType<typeof deserialize> | undefined;
      expect(() => (res = deserialize(input, content))).not.toThrow();
      expect(res!.ok).toBe(false);
    }
    expect(deserialize(text.slice(0, text.length - 1), content)).toEqual({ ok: false, error: "checksum" });
    expect(deserialize("{", content)).toEqual({ ok: false, error: "parse" });
    expect(deserialize("{}", content)).toEqual({ ok: false, error: "structure" });
    expect(deserialize('{"v":99,"t":0,"decks":{},"inv":{},"credits":{"m":0,"e":0}}', content)).toEqual({ ok: false, error: "version" });

    // every single flipped character is caught by the checksum
    const rng = new Rng(77);
    for (let i = 0; i < 300; i++) {
      const pos = rng.int(0, text.length - 1);
      const ch = text.charCodeAt(pos);
      const flipped = text.slice(0, pos) + String.fromCharCode(ch === 48 ? 49 : 48) + text.slice(pos + 1);
      if (flipped === text) continue;
      const res = deserialize(flipped, content);
      expect(res.ok).toBe(false);
    }
  });

  it("migrates old versions through the table", () => {
    const state = played();
    const old = { ...state, v: 0 };
    const res = deserialize(JSON.stringify(old), content);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state.v).toBe(SCHEMA_VERSION);
    expect(Object.keys(migrations)).toContain("0");
    expect(migrate({ v: SCHEMA_VERSION + 1 })).toEqual({ ok: false, error: "version" });
    expect(migrate({ v: SCHEMA_VERSION }).ok).toBe(true);
    expect(migrate({})).toEqual({ ok: false, error: "version" });
  });

  it("accepts plain JSON without a header (debug tools)", () => {
    const state = played();
    const res = deserialize(JSON.stringify(state), content);
    expect(res.ok).toBe(true);
  });
});

describe("sanitizeState", () => {
  it("fills missing slices from a fresh state", () => {
    const s = sanitizeState({ v: 1, t: 50, credits: { m: 5, e: 2 }, decks: { mining: { level: 7 } }, inv: {} }, content, 1000);
    const fresh = newState(content, 1, 0);
    expect(num(s.credits)).toBe(500);
    expect(s.decks.mining).toEqual({ level: 7, manager: 0, cards: [] });
    expect(s.decks.lift.level).toBe(1); // start level from content
    expect(s.decks.reactor.level).toBe(0);
    expect(Object.keys(s).sort()).toEqual(Object.keys(fresh).sort());
    expect(s.nav).toEqual(fresh.nav);
    expect(s.prestige).toEqual(fresh.prestige);
    expect(s.grid).toEqual(fresh.grid);
    expect(s.craft).toEqual(fresh.craft);
    // and it boots
    const g = createGame(content, coreSystems, s);
    expect(g.state.recipes.r_alloy).toBe(1);
  });

  it("repairs NaN, broken Bigs, wrong types and out-of-range values", () => {
    const state = played() as unknown as Record<string, unknown>;
    const broken = JSON.parse(JSON.stringify(state));
    broken.credits = { m: NaN, e: 3 };
    broken.lifetime = "lots";
    broken.allTime = { m: 12345, e: 2.4 }; // not normalised, fractional exponent
    broken.hopper = null;
    broken.rp = 250;
    broken.inv.scrap = { m: -5, e: 1 };
    broken.inv.ice = { m: null, e: 0 };
    broken.inv.alloy = 12;
    broken.inv.__proto__ = { m: 1, e: 0 };
    broken.keep = { scrap: 7, ice: "x", alloy: -1 };
    broken.t = -5;
    broken.played = null;
    broken.wall = 9e15;
    broken.hull.hp = 400;
    broken.decks.mining.level = -3;
    broken.decks.lift = "gone";
    broken.decks.cargo.level = 12.7;
    broken.modules.push({ uid: 0, item: "mod_laser_mk1" }, { uid: "x" }, null, { ...broken.modules[0] }, { uid: 9001, item: "mod_laser_mk1", q: 9, hp: -4, lvl: 1e99, slot: 0 });
    broken.grid = { w: 99, h: 0, open: -1, cells: "nope" };
    broken.craft.refinery.queue.push({ recipe: 5 }, { uid: 1, recipe: "r_alloy", left: 0, progress: 0 }, { uid: 2, recipe: "r_alloy", left: 3, progress: NaN, stalled: "bored" });
    broken.craft.workshop = null;
    broken.buffs = [{ effect: { stat: "allProd", mul: Infinity }, until: 5, src: "x" }, { until: 5 }, "junk"];
    broken.active.heat = 1e9;
    broken.active.salvage = [{ uid: 3, kind: "banana", x: NaN }, 7];
    broken.minigame = { game: 3 };
    broken.stats = { purchases: 5, bad: NaN, worse: "1" };
    broken.flags = [1, 2];
    broken.buyMode = 3;
    broken.drones = { hauler: -2, probe: 1.9 };
    broken.repair.priority = [1, "2", NaN, 3];
    broken.repair.jobs = [{ target: 1 }, { target: "x" }];
    broken.features = { crafting: 1, grid: true, nope: 0 };
    broken.recipes = { r_alloy: 1, r_water: 2 };
    broken.autoRecipes = ["r_tape", "r_tape", 5];
    broken.prestige.stamps = { m: "a", e: 1 };
    broken.station.contracts = [{ uid: 1, need: { m: Infinity, e: 1 }, have: { m: 25, e: 0 }, reward: { m: 1, e: NaN } }];
    broken.nav.fuel = NaN;
    broken.uid = 1;

    const s = sanitizeState(broken, content, 2_000_000_000_000);
    expect(s.credits).toEqual({ m: 0, e: 0 });
    expect(s.lifetime).toEqual({ m: 0, e: 0 });
    expect(s.allTime).toEqual({ m: 1.2345, e: 6 });
    expect(s.hopper).toEqual({ m: 0, e: 0 });
    expect(s.rp).toEqual({ m: 2.5, e: 2 });
    expect(s.inv.scrap).toBeUndefined();
    expect(s.inv.ice).toBeUndefined();
    expect(s.inv.alloy).toEqual({ m: 1.2, e: 1 });
    expect(Object.getPrototypeOf(s.inv)).toBe(Object.prototype);
    expect(s.keep).toEqual({ scrap: 1, alloy: 0 });
    expect(s.t).toBe(0);
    expect(s.played).toBe(0);
    expect(s.wall).toBe(2_000_000_000_000); // clock in the future is pulled back to now
    expect(s.hull.hp).toBe(100);
    expect(s.decks.mining.level).toBe(0);
    expect(s.decks.lift).toEqual({ level: 1, manager: 0, cards: [] });
    expect(s.decks.cargo.level).toBe(12);
    expect(s.grid.w).toBe(6);
    expect(s.grid.h).toBe(1);
    expect(s.grid.cells.length).toBe(6);
    const uids = s.modules.map((m) => m.uid);
    expect(new Set(uids).size).toBe(uids.length);
    expect(uids).toContain(9001);
    const odd = s.modules.find((m) => m.uid === 9001)!;
    expect(odd).toMatchObject({ q: 4, hp: 0, lvl: 1e6 });
    for (const m of s.modules) {
      expect(m.slot >= -1 && m.slot < 6).toBe(true);
      if (m.slot >= 0) expect(s.grid.cells[m.slot]).toBe(m.uid);
    }
    expect(s.craft.refinery.queue.every((j) => typeof j.recipe === "string" && j.left !== 0 && Number.isFinite(j.progress) && j.stalled === undefined)).toBe(true);
    expect(s.craft.workshop).toEqual({ queue: [] });
    expect(s.buffs).toEqual([{ effect: { stat: "allProd" }, until: 5, src: "x" }]);
    expect(s.active.heat).toBe(100);
    expect(s.active.salvage).toEqual([{ uid: 3, kind: "crate", x: 0, y: 0.5, born: 0, ttl: 45, seed: 1 }]);
    expect(s.minigame).toBeNull();
    expect(s.stats).toEqual({ purchases: 5, bad: 0 });
    expect(s.flags).toEqual({});
    expect(s.buyMode).toBe(1);
    expect(s.drones).toEqual({ hauler: 0, probe: 1, salvager: 0, fixer: 0 });
    expect(s.repair.priority).toEqual([1, 0, 3]); // NaN in a live object reads as 0 (the hull)
    expect(s.repair.jobs).toEqual([{ target: 1, glitchUntil: 0 }]);
    expect(s.features).toEqual({ crafting: 1 });
    expect(s.recipes).toEqual({ r_alloy: 1 });
    expect(s.autoRecipes).toEqual(["r_tape"]);
    expect(s.prestige.stamps).toEqual({ m: 0, e: 0 });
    expect(s.station.contracts[0].need).toEqual({ m: 0, e: 0 });
    expect(s.station.contracts[0].have).toEqual({ m: 2.5, e: 1 });
    expect(s.station.contracts[0].reward).toEqual({ m: 0, e: 0 });
    expect(s.nav.fuel).toBe(0);
    expect(s.uid).toBeGreaterThanOrEqual(9001);
    expect(JSON.stringify(s)).not.toMatch(/null,"e"|NaN|Infinity/);

    // whatever came out is a state the engine can run
    const g = createGame(content, coreSystems, s);
    g.api.currentSystem = midGame().api.currentSystem;
    expect(() => run(g, 30)).not.toThrow();
    expect(Number.isFinite(g.state.credits.m)).toBe(true);
  });

  it("survives arbitrary garbage", () => {
    for (const junk of [null, undefined, 5, "x", [], [1, 2], { decks: 5, inv: [], modules: {}, grid: null, active: 3, craft: [], repair: "x", hull: [], drones: null }]) {
      let s: GameState | undefined;
      expect(() => (s = sanitizeState(junk, content, 0))).not.toThrow();
      expect(s!.v).toBe(SCHEMA_VERSION);
      expect(() => createGame(content, coreSystems, s)).not.toThrow();
    }
    expect(() => sanitizeState({ v: 1 })).not.toThrow(); // content is optional
  });
});

describe("export code", () => {
  it("round-trips through a DTO1 code", () => {
    const state = played();
    const code = exportCode(state);
    expect(code).toMatch(/^DTO1\.[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(JSON.stringify(state).length); // smaller than the raw JSON even after base64
    const res = importCode(code, content, state.wall);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state).toEqual({ ...state, active: { ...state.active, mining: false } });
    expect(res.state.player.name).toBe("Šéf Klíč ✦ 🚀");
    // whitespace from a chat app or line wrapping is ignored
    const wrapped = "  " + code.replace(/(.{40})/g, "$1\n") + " \n";
    expect(importCode(wrapped, content).ok).toBe(true);
    // a fresh state works too
    const fresh = newState(content, 9, 123);
    const again = importCode(exportCode(fresh), content);
    expect(again.ok && B.eq(again.state.credits, fresh.credits)).toBe(true);
  });

  it("rejects truncated and corrupted codes without throwing", () => {
    const code = exportCode(played());
    const bad: unknown[] = [
      "",
      null,
      123,
      "DTO1.",
      "DTO1.AAAA",
      "DTO2." + code.slice(5),
      code.slice(5),
      code.slice(0, code.length - 1),
      code.slice(0, code.length - 7),
      code.slice(0, Math.floor(code.length / 2)),
      code.slice(0, 30),
      code + "A",
      code.replace(/.$/, "!"),
      "DTO1." + "A".repeat(500),
    ];
    for (const input of bad) {
      let res: ReturnType<typeof importCode> | undefined;
      expect(() => (res = importCode(input, content))).not.toThrow();
      expect(res!.ok).toBe(false);
    }
    const rng = new Rng(5);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    for (let i = 0; i < 400; i++) {
      const pos = rng.int(5, code.length - 1);
      let ch = alphabet[rng.int(0, 63)];
      if (ch === code[pos]) ch = ch === "A" ? "B" : "A";
      const mutated = code.slice(0, pos) + ch + code.slice(pos + 1);
      let res: ReturnType<typeof importCode> | undefined;
      expect(() => (res = importCode(mutated, content))).not.toThrow();
      expect(res!.ok).toBe(false);
    }
  });
});

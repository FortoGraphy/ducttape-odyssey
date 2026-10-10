import { describe, expect, it } from "vitest";
import type { ContentDB } from "../../src/engine/types";
import {
  depthLinks,
  faunaKey,
  galaxyDepth,
  getSystem,
  hasStation,
  lanesAt,
  planetById,
  planetDescription,
  rawUnlockDepth,
  speciesName,
  stationLabel,
} from "../../src/engine/world";
import { makeContent, STARTER_RAWS } from "./fixture";

const content = makeContent();

describe("galaxy shape", () => {
  it("depth grows by 6 per warp and has code defaults", () => {
    expect(galaxyDepth(content, 0)).toBe(40);
    expect(galaxyDepth(content, 3)).toBe(58);
    const bare = { ...content, balance: {} } as unknown as ContentDB;
    expect(galaxyDepth(bare, 0)).toBe(40);
    expect(galaxyDepth(bare, 2)).toBe(52);
  });

  it("has one lane at depth 0 and at the core, 3-5 in between", () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (let g = 0; g <= 3; g++) {
        const core = galaxyDepth(content, g);
        expect(lanesAt(seed, g, 0, core)).toBe(1);
        expect(lanesAt(seed, g, core, core)).toBe(1);
        expect(lanesAt(seed, g, core)).toBe(1); // stock depth is the default
        for (let d = 1; d < core; d++) {
          const n = lanesAt(seed, g, d, core);
          expect(n).toBeGreaterThanOrEqual(3);
          expect(n).toBeLessThanOrEqual(5);
        }
      }
    }
  });
});

describe("determinism", () => {
  it("same inputs give the same system, also from a cold cache", () => {
    // a second content object has its own cache, so this regenerates everything
    const other = makeContent();
    for (const [seed, g, depth, lane] of [[1, 0, 0, 0], [1, 0, 5, 2], [99, 2, 17, 1], [-5, 1, 30, 0], [123456, 5, 70, 0]]) {
      const a = getSystem(content, seed, g, depth, lane);
      const b = getSystem(other, seed, g, depth, lane);
      expect(getSystem(content, seed, g, depth, lane)).toBe(a);
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    }
  });

  it("survives cache eviction unchanged", () => {
    const before = JSON.stringify(getSystem(content, 4, 0, 3, 1));
    for (let d = 0; d < 40; d++) for (let lane = 0; lane < 5; lane++) getSystem(content, 4, 1, d, lane);
    expect(JSON.stringify(getSystem(content, 4, 0, 3, 1))).toBe(before);
  });

  it("different seeds, galaxies and lanes differ", () => {
    const base = JSON.stringify(getSystem(content, 1, 0, 6, 1));
    expect(JSON.stringify(getSystem(content, 2, 0, 6, 1))).not.toBe(base);
    expect(JSON.stringify(getSystem(content, 1, 1, 6, 1))).not.toBe(base);
    expect(JSON.stringify(getSystem(content, 1, 0, 6, 2))).not.toBe(base);
    const names = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) names.add(getSystem(content, seed, 0, 4, 0).name);
    expect(names.size).toBeGreaterThan(20);
  });

  it("clamps out-of-range indices instead of throwing", () => {
    expect(getSystem(content, 1, 0, 9999, 0).isCore).toBe(true);
    expect(getSystem(content, 1, 0, -3, 7).depth).toBe(0);
    expect(getSystem(content, 1, -2, NaN, NaN).id).toBe("0:0:0");
    expect(getSystem(content, 1, 0, 5, 99).lane).toBeLessThan(5);
  });
});

describe("graph connectivity", () => {
  it("every system is reachable from depth 0 and reaches the core (galaxies 0-5, 50 seeds)", () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (let g = 0; g <= 5; g++) {
        const core = galaxyDepth(content, g);
        let reach = new Set<number>([0]);
        for (let d = 0; d < core; d++) {
          const lanes = lanesAt(seed, g, d, core);
          const next = lanesAt(seed, g, d + 1, core);
          const links = depthLinks(seed, g, d, core);
          expect(links.length).toBe(lanes);
          const incoming = new Set<number>();
          const reachNext = new Set<number>();
          for (let lane = 0; lane < lanes; lane++) {
            const out = links[lane];
            // 1-3 forward links, sorted, unique, in range
            expect(out.length).toBeGreaterThanOrEqual(1);
            expect(out.length).toBeLessThanOrEqual(3);
            expect(new Set(out).size).toBe(out.length);
            for (const t of out) {
              expect(t).toBeGreaterThanOrEqual(0);
              expect(t).toBeLessThan(next);
              incoming.add(t);
              if (reach.has(lane)) reachNext.add(t);
            }
          }
          expect(incoming.size).toBe(next);
          // everything at depth d was reachable, so everything at d + 1 must be too
          expect(reach.size).toBe(lanes);
          reach = reachNext;
        }
        expect(reach.has(0)).toBe(true);
        expect(depthLinks(seed, g, core, core)).toEqual([[]]);
      }
    }
  });

  it("every system has at least 3 planets and a non-empty mix (galaxies 0-5, 50 seeds)", () => {
    let systems = 0;
    const bad: string[] = [];
    for (let seed = 1; seed <= 50; seed++) {
      for (let g = 0; g <= 5; g++) {
        const core = galaxyDepth(content, g);
        for (let d = 0; d <= core; d++) {
          const lanes = lanesAt(seed, g, d, core);
          for (let lane = 0; lane < lanes; lane++) {
            const sys = getSystem(content, seed, g, d, lane);
            systems++;
            if (sys.planets.length < 3 || sys.resources.length < 3 || (d < core && sys.links.length < 1) || sys.lane !== lane || sys.depth !== d) bad.push(seed + "/" + sys.id);
          }
        }
      }
    }
    expect(systems).toBeGreaterThan(50000);
    expect(bad).toEqual([]);
  });

  it("SystemInfo.links matches the lane graph", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const core = galaxyDepth(content, 0);
      for (let d = 0; d <= core; d++) {
        const links = depthLinks(seed, 0, d, core);
        for (let lane = 0; lane < links.length; lane++) expect(getSystem(content, seed, 0, d, lane).links).toEqual(links[lane]);
      }
    }
  });
});

describe("system contents", () => {
  it("every system has 3-8 planets, a 3-5 item mix of unlocked raws and sane numbers", () => {
    let anomalies = 0;
    let total = 0;
    for (let seed = 1; seed <= 12; seed++) {
      for (let g = 0; g <= 2; g++) {
        const core = galaxyDepth(content, g);
        for (let d = 0; d <= core; d++) {
          const lanes = lanesAt(seed, g, d, core);
          for (let lane = 0; lane < lanes; lane++) {
            const sys = getSystem(content, seed, g, d, lane);
            total++;
            if (sys.anomaly) anomalies++;
            expect(sys.id).toBe(`${g}:${d}:${lane}`);
            expect(sys.name.length).toBeGreaterThan(2);
            expect(sys.isCore).toBe(d === core);
            expect(sys.planets.length).toBeGreaterThanOrEqual(3);
            expect(sys.planets.length).toBeLessThanOrEqual(8);
            expect(sys.richness).toBeGreaterThanOrEqual(0.8);
            expect(sys.richness).toBeLessThanOrEqual(1.3);
            expect(sys.belts).toBeGreaterThanOrEqual(0);
            expect(sys.belts).toBeLessThanOrEqual(2);
            // 3-5 raws; the start system is the exception and carries all six starter raws
            if (d === 0) expect(sys.resources.length).toBe(6);
            else expect(sys.resources.length).toBeGreaterThanOrEqual(3);
            if (d > 0) expect(sys.resources.length).toBeLessThanOrEqual(5);
            let w = 0;
            for (const r of sys.resources) {
              expect(content.items[r.item].category).toBe("raw");
              expect(rawUnlockDepth(content, r.item)).toBeLessThanOrEqual(d);
              expect(r.w).toBeGreaterThan(0);
              w += r.w;
            }
            expect(w).toBeCloseTo(1, 9);
            expect(new Set(sys.resources.map((r) => r.item)).size).toBe(sys.resources.length);
            expect(sys.pos.x).toBeGreaterThan(0);
            expect(sys.pos.x).toBeLessThan(1);
            sys.planets.forEach((p, i) => {
              expect(p.id).toBe(`${sys.id}:${i}`);
              expect(content.biomes[p.biome]).toBeDefined();
              expect(p.resources.length).toBeGreaterThanOrEqual(2);
              expect(p.resources.length).toBeLessThanOrEqual(3);
              expect(p.hazards.length).toBeLessThanOrEqual(3);
              expect(p.name.length).toBeGreaterThan(2);
              if (p.atmosphere === "none") expect(p.fauna).toBe(0);
              expect(planetById(content, seed, p.id)).toBe(p);
            });
          }
        }
      }
    }
    // about 8 % of systems hold an anomaly
    expect(anomalies / total).toBeGreaterThan(0.05);
    expect(anomalies / total).toBeLessThan(0.11);
  });

  it("starts gentle and unlocks rarer raws with depth", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const start = getSystem(content, seed, 0, 0, 0);
      expect(start.star).toBe("yellow");
      expect(start.hazards).toEqual([]);
      expect(start.richness).toBe(1);
      expect(start.station).toBeNull();
      expect(start.resources.map((r) => r.item).sort()).toEqual([...STARTER_RAWS].sort());
    }
    // depths 0-2 offer only the starter raws, on planets too
    for (let seed = 1; seed <= 40; seed++) {
      for (let d = 0; d <= 2; d++) {
        for (let lane = 0; lane < lanesAt(seed, 0, d, 40); lane++) {
          const sys = getSystem(content, seed, 0, d, lane);
          for (const r of sys.resources) expect(STARTER_RAWS).toContain(r.item);
          for (const p of sys.planets) {
            for (const r of p.resources) expect(STARTER_RAWS).toContain(r);
            if (p.special) expect(STARTER_RAWS).toContain(p.special);
          }
        }
      }
    }
    for (const id of STARTER_RAWS) expect(rawUnlockDepth(content, id)).toBe(0);
    // rarity tags gate the rest: common 3+, uncommon 4+, rare 10+, exotic 20+
    expect(rawUnlockDepth(content, "brine")).toBe(3);
    expect(rawUnlockDepth(content, "ferrite")).toBe(4);
    expect(rawUnlockDepth(content, "sulfur")).toBe(4);
    expect(rawUnlockDepth(content, "helium3")).toBe(8);
    expect(rawUnlockDepth(content, "lumite")).toBe(10);
    expect(rawUnlockDepth(content, "voidglass")).toBe(16);
    expect(rawUnlockDepth(content, "strange_dust")).toBe(20);
    expect(rawUnlockDepth(content, "antimatter")).toBe(25);
    expect(rawUnlockDepth(content, "not_an_item")).toBe(0);
    const deep = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) for (let lane = 0; lane < 3; lane++) for (const r of getSystem(content, seed, 0, 35, lane).resources) deep.add(r.item);
    expect([...deep].some((id) => rawUnlockDepth(content, id) >= 20)).toBe(true);
    const shallow = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) for (let lane = 0; lane < 3; lane++) for (const r of getSystem(content, seed, 0, 6, lane).resources) shallow.add(r.item);
    expect([...shallow].every((id) => rawUnlockDepth(content, id) <= 6)).toBe(true);
    expect([...shallow].some((id) => !STARTER_RAWS.includes(id))).toBe(true);
  });

  it("puts a station every 3-5 depths", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const core = galaxyDepth(content, 1);
      let last = 0;
      let count = 0;
      for (let d = 0; d < core; d++) {
        let here = false;
        for (let lane = 0; lane < lanesAt(seed, 1, d, core); lane++) {
          const sys = getSystem(content, seed, 1, d, lane);
          expect(sys.station !== null).toBe(hasStation(content, seed, 1, d, lane));
          if (sys.station) {
            here = true;
            expect(content.factions[sys.station.faction]).toBeDefined();
            expect(stationLabel(content, sys)?.en).toContain(sys.station.name);
          }
        }
        if (here) {
          if (count > 0) {
            expect(d - last).toBeGreaterThanOrEqual(3);
            expect(d - last).toBeLessThanOrEqual(5);
          } else {
            expect(d).toBeGreaterThanOrEqual(2);
            expect(d).toBeLessThanOrEqual(4);
          }
          last = d;
          count++;
        }
      }
      expect(core - last).toBeLessThanOrEqual(5);
    }
  });

  it("names species and picks description variants deterministically", () => {
    const sys = getSystem(content, 3, 0, 8, 1);
    const p = sys.planets[0];
    expect(speciesName(content, p.seed, "fauna", 0)).toBe(speciesName(content, p.seed, "fauna", 0));
    expect(speciesName(content, p.seed, "fauna", 0)).not.toBe(speciesName(content, p.seed, "fauna", 1));
    expect(speciesName(content, p.seed, "flora", 0)).not.toBe(speciesName(content, p.seed, "fauna", 0));
    expect(speciesName(content, p.seed, "flora", 2)).toMatch(/^[A-Z][a-z]+$/);
    expect(faunaKey(p.id, 2)).toBe(`fauna:${p.id}:2`);
    const v = planetDescription(content, p);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(3);
    expect(planetDescription(content, p)).toBe(v);
  });

  it("ranks untagged raws by value", () => {
    const plain = makeContent();
    for (const id of Object.keys(plain.items)) delete plain.items[id].tags;
    delete plain.items.conductite;
    // five of the starters exist; everything else waits past depth 2, dearer raws longer
    expect(rawUnlockDepth(plain, "hydrogen")).toBe(0);
    expect(rawUnlockDepth(plain, "brine")).toBeGreaterThan(2);
    expect(rawUnlockDepth(plain, "antimatter")).toBeGreaterThan(rawUnlockDepth(plain, "lumite"));
    expect(rawUnlockDepth(plain, "lumite")).toBeGreaterThan(rawUnlockDepth(plain, "brine"));
    const start = getSystem(plain, 5, 0, 0, 0);
    expect(start.resources.length).toBe(5);
  });

  it("generates valid systems from empty content", () => {
    const bare = { ...makeContent(), items: {}, biomes: {}, factions: {}, names: {}, balance: {} } as unknown as ContentDB;
    for (let d = 0; d <= 40; d += 4) {
      const sys = getSystem(bare, 11, 0, d, 0);
      expect(sys.planets.length).toBeGreaterThanOrEqual(3);
      expect(sys.resources.length).toBeGreaterThanOrEqual(3);
      expect(sys.name.length).toBeGreaterThan(2);
      if (d <= 2) for (const r of sys.resources) expect(STARTER_RAWS).toContain(r.item);
      for (const p of sys.planets) expect(p.biome).toBe("barren");
    }
    expect(planetById(bare, 11, "nope")).toBeNull();
    expect(planetById(bare, 11, "0:1:0:99")).toBeNull();
  });
});

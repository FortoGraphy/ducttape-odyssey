// Galaxy generator. Everything here is a pure function of (content, seed, galaxy, depth, lane):
// the same inputs give the same system on every run and every device. Results are memoized in
// small bounded caches; callers must treat returned objects as read-only.
import { hashSeed, hashString, Rng } from "../prng";
import type {
  BiomeDef,
  ContentDB,
  FactionId,
  HazardKind,
  ItemId,
  L10n,
  PlanetInfo,
  StarType,
  SystemInfo,
} from "../types";
import { balNum, balRange } from "./util";

const DEF_DEPTH = 40;
const DEF_GROWTH = 6;
const MIN_DEPTH = 3;
const SYSTEM_CACHE_MAX = 64;
const LINK_CACHE_MAX = 256;
const STATION_CACHE_MAX = 6;

// Fallback tables, used only when content.names / content.items / content.biomes are empty.
const SYS_A = ["Vek", "Korr", "Tash", "Umb", "Oru", "Zann", "Brel", "Quo", "Nym", "Drav", "Hesk", "Ilu", "Sorv", "Tev", "Wynn", "Axi", "Jor", "Pell", "Ghe", "Mur"];
const SYS_B = ["ar", "en", "ith", "ou", "ira", "ex", "um", "ael", "ok", "ys", "une", "ada", "io", "esh", "ant", "ur"];
const SYS_C = ["is", "on", "ax", "ia", "or", "eth", "us", "ine"];
const PLANET_SUFFIX = ["Prime", "Minor", "Major", "Alpha", "Beta", "Gamma"];
const FAUNA_A = ["Grub", "Skit", "Mur", "Tre", "Lop", "Vex", "Hum", "Dru", "Pil", "Zib", "Nar", "Quil", "Oss", "Bram"];
const FAUNA_B = ["bok", "ling", "ax", "oth", "wig", "erin", "und", "ipa", "ork", "ellow", "it", "ask"];
const FLORA_A = ["Fen", "Lum", "Tass", "Mir", "Bru", "Sel", "Yar", "Ock", "Pim", "Dell", "Vio", "Hax"];
const FLORA_B = ["ia", "ula", "anth", "ose", "ica", "um", "ella", "ora", "ix", "ensis"];
const STATION_WORDS: L10n[] = [
  { cs: "Stanice", en: "Station" },
  { cs: "Překladiště", en: "Depot" },
  { cs: "Dok", en: "Dock" },
  { cs: "Zastávka", en: "Halt" },
];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
/** Canonical raw ids, common first, for content without raw items. */
const FALLBACK_RAWS: ItemId[] = [
  "scrap", "ice", "silicates", "carbon", "hydrogen", "ferrite", "sulfur", "brine",
  "organics", "conductite", "lumite", "helium3", "xenon", "voidglass", "strange_dust", "antimatter",
];
const FALLBACK_FACTIONS: FactionId[] = ["lamplighters", "rustborn", "ledger"];
const FALLBACK_BIOME: BiomeDef = {
  id: "barren",
  name: { cs: "Pustina", en: "Barren" },
  desc: [],
  hazards: [],
  resources: [],
  palette: [],
  shader: "rock",
};
/** Raws every starter recipe is built on: the only ones offered at depths 0-2. */
const STARTER_RAWS: ItemId[] = ["scrap", "ice", "silicates", "carbon", "hydrogen", "conductite"];
const STARTER_DEPTH = 2;
const RARITIES = ["common", "uncommon", "rare", "exotic"];
/** First depth a raw of each rarity can appear at, and the extra depth per raw within the rarity. */
const RARITY_DEPTH = [3, 4, 10, 20];
const RARITY_STEP = [1, 2, 3, 5];
/** How readily a raw of each rarity makes it into a mining mix. */
const RARITY_WEIGHT = [1, 0.75, 0.5, 0.3];

function toIndex(x: number): number {
  return Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0;
}

function clampInt(x: number, lo: number, hi: number): number {
  const v = Number.isFinite(x) ? Math.floor(x) : lo;
  return v < lo ? lo : v > hi ? hi : v;
}

function list<T>(arr: readonly T[] | undefined, fallback: readonly T[]): readonly T[] {
  return arr && arr.length > 0 ? arr : fallback;
}

function capitalize(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ---------- shape ---------------------------------------------------------------------

/** Depth of the core in galaxy g (40 + 6 g by default). */
export function galaxyDepth(content: ContentDB, g: number): number {
  const base = balNum(content, "galaxyDepth", DEF_DEPTH);
  const growth = balNum(content, "galaxyDepthGrowth", DEF_GROWTH);
  return Math.max(MIN_DEPTH, Math.round(base + growth * toIndex(g)));
}

/**
 * Number of lanes at a depth: 1 at depth 0 and at the core, 3 at depth 1 (so the start system
 * reaches all of them with three links), otherwise 3 to 5. `coreDepth` defaults to the stock
 * 40 + 6 g; pass galaxyDepth(content, g) when balance overrides it.
 */
export function lanesAt(seed: number, g: number, depth: number, coreDepth?: number): number {
  const gi = toIndex(g);
  const core = coreDepth !== undefined && Number.isFinite(coreDepth) ? Math.max(MIN_DEPTH, Math.floor(coreDepth)) : DEF_DEPTH + DEF_GROWTH * gi;
  if (!(depth > 0) || depth >= core) return 1;
  if (depth === 1) return 3;
  return 3 + ((hashSeed(seed, gi, Math.floor(depth), 0x1a9e) >>> 0) % 3);
}

const linkCache = new Map<string, number[][]>();

/**
 * Forward links of every lane at `depth` (index = lane). Guarantees: each lane has 1 to 3
 * links, and each lane at depth + 1 is the target of at least one link.
 */
export function depthLinks(seed: number, g: number, depth: number, coreDepth: number): number[][] {
  const key = (seed | 0) + ":" + g + ":" + coreDepth + ":" + depth;
  const hit = linkCache.get(key);
  if (hit) return hit;
  const n = lanesAt(seed, g, depth, coreDepth);
  const sets: number[][] = [];
  for (let i = 0; i < n; i++) sets.push([]);
  if (depth < coreDepth) {
    const m = lanesAt(seed, g, depth + 1, coreDepth);
    const add = (i: number, j: number): void => {
      if (!sets[i].includes(j)) sets[i].push(j);
    };
    // proportional mapping in both directions: no lane is left without a way in or out
    for (let i = 0; i < n; i++) add(i, Math.min(m - 1, Math.floor((i * m) / n)));
    for (let j = 0; j < m; j++) add(Math.min(n - 1, Math.floor((j * n) / m)), j);
    const rng = new Rng(hashSeed(seed, g, depth, 0x71c3));
    for (let i = 0; i < n; i++) {
      if (sets[i].length < 3 && m > 1 && rng.chance(0.35)) {
        const j = sets[i][0] + (rng.chance(0.5) ? 1 : -1);
        if (j >= 0 && j < m) add(i, j);
      }
      sets[i].sort((a, b) => a - b);
    }
  }
  if (linkCache.size >= LINK_CACHE_MAX) linkCache.delete(linkCache.keys().next().value as string);
  linkCache.set(key, sets);
  return sets;
}

const stationCache = new Map<string, Int8Array>();

/** Per depth: -1 = no station, otherwise a bit mask of the lanes that have one. */
function stationMask(seed: number, g: number, coreDepth: number, every: [number, number]): Int8Array {
  const key = (seed | 0) + ":" + g + ":" + coreDepth + ":" + every[0] + ":" + every[1];
  const hit = stationCache.get(key);
  if (hit) return hit;
  const mask = new Int8Array(coreDepth + 1).fill(-1);
  const rng = new Rng(hashSeed(seed, g, 0x57a7));
  const lo = Math.max(1, Math.floor(every[0]));
  const hi = Math.max(lo, Math.floor(every[1]));
  let d = rng.int(Math.max(1, lo - 1), Math.max(1, hi - 1));
  while (d < coreDepth) {
    const lanes = lanesAt(seed, g, d, coreDepth);
    let bits = 1 << rng.int(0, lanes - 1);
    if (rng.chance(0.4)) bits |= 1 << rng.int(0, lanes - 1);
    mask[d] = bits;
    d += rng.int(lo, hi);
  }
  if (stationCache.size >= STATION_CACHE_MAX) stationCache.delete(stationCache.keys().next().value as string);
  stationCache.set(key, mask);
  return mask;
}

/** Cheap station test that does not generate the system (route planning). */
export function hasStation(content: ContentDB, seed: number, g: number, depth: number, lane: number): boolean {
  const gi = toIndex(g);
  const core = galaxyDepth(content, gi);
  if (!Number.isInteger(depth) || depth < 0 || depth > core || !Number.isInteger(lane) || lane < 0 || lane > 7) return false;
  const bits = stationMask(seed, gi, core, balRange(content, "stationEvery", 3, 5))[depth];
  return bits > 0 && (bits & (1 << lane)) !== 0;
}

// ---------- names ---------------------------------------------------------------------

function makeName(rng: Rng, a: readonly string[], b: readonly string[], c: readonly string[], cChance: number): string {
  let s = rng.pick(a) + rng.pick(b);
  if (rng.chance(cChance)) s += rng.pick(c);
  return capitalize(s);
}

/** Seeded species name for the codex entry `fauna:<planetId>:<i>` / `flora:<planetId>:<i>`. */
export function speciesName(content: ContentDB, planetSeed: number, kind: "fauna" | "flora", i: number): string {
  const n = content.names;
  const fauna = kind === "fauna";
  const a = list(fauna ? n?.faunaA : n?.floraA, fauna ? FAUNA_A : FLORA_A);
  const b = list(fauna ? n?.faunaB : n?.floraB, fauna ? FAUNA_B : FLORA_B);
  const rng = new Rng(hashSeed(planetSeed | 0, fauna ? 0xfa : 0xf1, toIndex(i)));
  return capitalize(rng.pick(a) + rng.pick(b));
}

export function faunaKey(planetId: string, i: number): string {
  return "fauna:" + planetId + ":" + i;
}

export function floraKey(planetId: string, i: number): string {
  return "flora:" + planetId + ":" + i;
}

/** Index into the biome's `desc` variants for this planet (0 when the biome has none). */
export function planetDescription(content: ContentDB, planet: PlanetInfo): number {
  const n = content.biomes?.[planet.biome]?.desc?.length ?? 0;
  if (n <= 0) return 0;
  return (hashSeed(planet.seed, 0xd35c) >>> 0) % n;
}

/** Bilingual station title, e.g. "Brelith 7 Depot" / "Překladiště Brelith 7". */
export function stationLabel(content: ContentDB, sys: SystemInfo): L10n | null {
  if (!sys.station) return null;
  const words = list(content.names?.stationWords, STATION_WORDS);
  const w = words[(hashSeed(sys.seed, 0x57a1) >>> 0) % words.length];
  return { cs: w.cs + " " + sys.station.name, en: sys.station.name + " " + w.en };
}

// ---------- resources -----------------------------------------------------------------

interface RawTable {
  ids: ItemId[]; // by unlock depth, then value
  unlock: Record<ItemId, number>;
  weight: Record<ItemId, number>;
  starters: ItemId[];
}

const rawCache = new WeakMap<ContentDB, RawTable>();

/**
 * Raw items with the depth each one unlocks at. Rarity comes from `tags[0]` (common, uncommon,
 * rare, exotic); untagged raws are ranked by value. The starter raws are everywhere and are the
 * only ones at depths 0-2, so the first recipes can always be fed.
 */
function rawTable(content: ContentDB): RawTable {
  const hit = rawCache.get(content);
  if (hit) return hit;
  const items = content.items ?? {};
  let ids: ItemId[] = [];
  for (const id in items) if (items[id].category === "raw") ids.push(id);
  if (ids.length === 0) ids = FALLBACK_RAWS.slice();
  else ids.sort((x, y) => items[x].value - items[y].value || (x < y ? -1 : x > y ? 1 : 0));

  const starters = STARTER_RAWS.filter((id) => ids.includes(id));
  for (let i = 0; i < ids.length && starters.length < Math.min(3, ids.length); i++) if (!starters.includes(ids[i])) starters.push(ids[i]);

  const scale = Math.max(0, balNum(content, "rawDepthScale", 1));
  const unlock: Record<ItemId, number> = {};
  const weight: Record<ItemId, number> = {};
  const seen = [0, 0, 0, 0];
  for (let k = 0; k < ids.length; k++) {
    const id = ids[k];
    let rarity = RARITIES.indexOf(items[id]?.tags?.[0] ?? "");
    // no tag: the cheapest 40 % are common, then 30 % uncommon, 20 % rare, the rest exotic
    if (rarity < 0) {
      const f = ids.length > 1 ? k / (ids.length - 1) : 0;
      rarity = f < 0.4 ? 0 : f < 0.7 ? 1 : f < 0.9 ? 2 : 3;
    }
    weight[id] = RARITY_WEIGHT[rarity];
    if (starters.includes(id)) unlock[id] = 0;
    else unlock[id] = Math.max(STARTER_DEPTH + 1, Math.round((RARITY_DEPTH[rarity] + RARITY_STEP[rarity] * seen[rarity]++) * scale));
  }
  const byValue = ids.slice();
  ids.sort((x, y) => unlock[x] - unlock[y] || byValue.indexOf(x) - byValue.indexOf(y));
  const table = { ids, unlock, weight, starters };
  rawCache.set(content, table);
  return table;
}

/** Depth at which a raw item starts to appear in systems (0 for starter raws and unknown ids). */
export function rawUnlockDepth(content: ContentDB, item: ItemId): number {
  return rawTable(content).unlock[item] ?? 0;
}

// ---------- generation ----------------------------------------------------------------

const STARS: StarType[] = ["yellow", "redDwarf", "binary", "whiteDwarf", "blueGiant", "protostar", "neutron", "blackHole"];

function starWeight(star: StarType, f: number): number {
  switch (star) {
    case "yellow":
      return 30;
    case "redDwarf":
      return 30;
    case "binary":
      return 12;
    case "whiteDwarf":
      return 10;
    case "blueGiant":
      return 8 + 10 * f;
    case "protostar":
      return 6;
    case "neutron":
      return 2 + 10 * f;
    case "blackHole":
      return 4 * f;
  }
}

const STAR_HAZARDS: Record<StarType, [HazardKind, number][]> = {
  yellow: [["storm", 0.1]],
  redDwarf: [["cold", 0.4]],
  binary: [["heat", 0.6], ["debris", 0.3]],
  whiteDwarf: [["cold", 0.4], ["radiation", 0.4]],
  blueGiant: [["heat", 0.8], ["radiation", 0.5]],
  protostar: [["debris", 0.7], ["heat", 0.3]],
  neutron: [["radiation", 0.9], ["storm", 0.3]],
  blackHole: [["radiation", 0.7], ["debris", 0.7], ["storm", 0.4]],
};

type Atmosphere = PlanetInfo["atmosphere"];
type Weather = PlanetInfo["weather"];

const ATMOSPHERE: Record<BiomeDef["shader"], [Atmosphere, number][]> = {
  rock: [["none", 5], ["thin", 4], ["breathable", 1]],
  gas: [["dense", 1]],
  ice: [["none", 3], ["thin", 5], ["breathable", 2]],
  lava: [["none", 3], ["dense", 3], ["corrosive", 4]],
  ocean: [["breathable", 6], ["thin", 2], ["dense", 2]],
  desert: [["thin", 6], ["none", 2], ["breathable", 2]],
  toxic: [["corrosive", 7], ["dense", 3]],
  crystal: [["none", 4], ["thin", 4], ["breathable", 2]],
};

const WEATHER: Record<Atmosphere, [Weather, number][]> = {
  none: [["calm", 1]],
  thin: [["calm", 6], ["windy", 4]],
  breathable: [["calm", 8], ["windy", 7], ["storms", 4], ["extreme", 1]],
  dense: [["windy", 3], ["storms", 5], ["extreme", 2]],
  corrosive: [["windy", 2], ["storms", 5], ["extreme", 3]],
};

function pickPair<T>(rng: Rng, table: readonly [T, number][]): T {
  let total = 0;
  for (let i = 0; i < table.length; i++) total += table[i][1];
  let r = rng.next() * total;
  for (let i = 0; i < table.length; i++) {
    r -= table[i][1];
    if (r < 0) return table[i][0];
  }
  return table[table.length - 1][0];
}

function biomeWeight(b: BiomeDef, star: StarType, orbit: number): number {
  let w = 1;
  const hot = star === "blueGiant" || star === "binary" || star === "protostar";
  const cold = star === "redDwarf" || star === "whiteDwarf" || star === "neutron";
  const sh = b.shader;
  if (hot && (sh === "lava" || sh === "desert")) w *= 2;
  if (hot && sh === "ice") w *= 0.4;
  if (cold && sh === "ice") w *= 2;
  if (cold && sh === "lava") w *= 0.5;
  if (star === "blackHole" && (sh === "crystal" || sh === "toxic")) w *= 2;
  if (orbit < 0.34 && (sh === "lava" || sh === "desert")) w *= 1.8;
  if (orbit > 0.66 && (sh === "ice" || sh === "gas")) w *= 1.8;
  return w;
}

function pushUnique<T>(arr: T[], v: T): void {
  if (!arr.includes(v)) arr.push(v);
}

function buildPlanet(
  content: ContentDB,
  sysId: string,
  sysName: string,
  sysSeed: number,
  sysHazards: HazardKind[],
  star: StarType,
  depth: number,
  index: number,
  count: number,
  biomes: BiomeDef[],
  raws: RawTable,
  open: ItemId[],
): PlanetInfo {
  const seed = hashSeed(sysSeed, index, 0x91a7);
  const rng = new Rng(seed);
  const orbit = count > 1 ? index / (count - 1) : 0.5;
  const biome = rng.weighted(biomes, (b) => biomeWeight(b, star, orbit));
  const shader = ATMOSPHERE[biome.shader] ? biome.shader : "rock";
  const gas = shader === "gas";

  let name = sysName + " " + (ROMAN[index] ?? String(index + 1));
  if (rng.chance(0.25)) {
    const n = content.names;
    name = makeName(rng, list(n?.systemA, SYS_A), list(n?.systemB, SYS_B), list(n?.systemC, SYS_C), 0.3);
    if (rng.chance(0.35)) name += " " + rng.pick(list(n?.planetSuffix, PLANET_SUFFIX));
  }

  const atmosphere = pickPair(rng, ATMOSPHERE[shader]);
  const hazards: HazardKind[] = [];
  const bh = biome.hazards ?? [];
  for (let i = 0; i < bh.length; i++) if (rng.chance(0.7)) pushUnique(hazards, bh[i]);
  for (let i = 0; i < sysHazards.length; i++) if (rng.chance(0.25)) pushUnique(hazards, sysHazards[i]);
  if (atmosphere === "corrosive") pushUnique(hazards, "toxic");
  if (hazards.length > 3) hazards.length = 3;

  let weather = pickPair(rng, WEATHER[atmosphere]);
  if (hazards.includes("storm") && (weather === "calm" || weather === "windy")) weather = "storms";

  // 2-3 resources: what the biome holds at this depth, topped up with common raws
  const pool: ItemId[] = [];
  const br = biome.resources ?? [];
  for (let i = 0; i < br.length; i++) {
    const id = br[i];
    const known = raws.unlock[id] !== undefined;
    if (known ? raws.unlock[id] <= depth : content.items?.[id] !== undefined) pushUnique(pool, id);
  }
  rng.shuffle(pool);
  const want = rng.int(2, 3);
  const resources: ItemId[] = pool.slice(0, want);
  let guard = 0;
  while (resources.length < want && resources.length < open.length && guard++ < 32) pushUnique(resources, rng.pick(open));

  let special: ItemId | null = null;
  const sp = biome.special ?? [];
  if (sp.length > 0 && rng.chance(Math.min(0.6, 0.3 + depth * 0.01))) {
    const ready = sp.filter((id) => (raws.unlock[id] ?? 0) <= depth && (raws.unlock[id] !== undefined || content.items?.[id] !== undefined));
    if (ready.length > 0) special = rng.pick(ready);
  }

  let fauna = 0;
  let flora = 0;
  if (atmosphere === "breathable") {
    fauna = rng.int(1, 4);
    flora = rng.int(1, 4);
  } else if (atmosphere === "thin" || atmosphere === "dense") {
    fauna = rng.int(0, 2);
    flora = rng.int(0, 2);
  } else if (atmosphere === "corrosive") {
    fauna = rng.int(0, 1);
    flora = rng.int(0, 1);
  } else {
    flora = rng.chance(0.15) ? 1 : 0;
  }

  return {
    id: sysId + ":" + index,
    index,
    name,
    biome: biome.id,
    size: Math.round((gas ? rng.range(0.6, 1) : rng.range(0.2, 0.8)) * 100) / 100,
    rings: rng.chance(gas ? 0.5 : 0.08),
    moons: rng.int(0, gas ? 4 : 2),
    hazards,
    atmosphere,
    weather,
    resources,
    special,
    fauna,
    flora,
    seed,
  };
}

function buildSystem(content: ContentDB, seed: number, g: number, depth: number, lane: number, core: number, lanes: number): SystemInfo {
  const sysSeed = hashSeed(seed, g, depth, lane, 0x5157);
  const rng = new Rng(sysSeed);
  const names = content.names;
  const isCore = depth >= core;
  const f = core > 0 ? depth / core : 0;
  const id = g + ":" + depth + ":" + lane;

  const name = makeName(rng, list(names?.systemA, SYS_A), list(names?.systemB, SYS_B), list(names?.systemC, SYS_C), 0.45);
  const star: StarType = isCore ? "blackHole" : depth === 0 ? "yellow" : rng.weighted(STARS, (s) => starWeight(s, f));
  const belts = depth === 0 ? 1 : pickPair(rng, [[0, 4], [1, 4], [2, 2]] as [number, number][]);
  const rich = balRange(content, "richnessRange", 0.8, 1.3);
  const richness = depth === 0 ? 1 : Math.round(rng.range(rich[0], rich[1]) * 100) / 100;

  // the start system is gentle; hazards ramp up over the first dozen depths
  const hazards: HazardKind[] = [];
  if (depth > 0) {
    const ramp = Math.min(1, 0.4 + depth / 15);
    const table = STAR_HAZARDS[star];
    for (let i = 0; i < table.length; i++) if (rng.chance(table[i][1] * ramp)) pushUnique(hazards, table[i][0]);
    if (rng.chance((0.1 + belts * 0.1) * ramp)) pushUnique(hazards, "debris");
    if (rng.chance((0.05 + f * 0.1) * ramp)) pushUnique(hazards, "toxic");
    if (hazards.length > 3) hazards.length = 3;
  }

  const raws = rawTable(content);
  const open: ItemId[] = [];
  for (let i = 0; i < raws.ids.length; i++) if (raws.unlock[raws.ids[i]] <= depth) open.push(raws.ids[i]);

  let biomes: BiomeDef[] = [];
  const all = content.biomes ?? {};
  for (const k in all) biomes.push(all[k]);
  if (biomes.length === 0) biomes = [FALLBACK_BIOME];
  else biomes.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));

  const count = depth === 0 ? rng.int(3, 5) : rng.int(3, 8);
  const planets: PlanetInfo[] = [];
  for (let i = 0; i < count; i++) planets.push(buildPlanet(content, id, name, sysSeed, hazards, star, depth, i, count, biomes, raws, open));

  // mining mix: what the planets hold, plus belt rubble and a star-specific vein
  const tally: Record<ItemId, number> = {};
  for (let i = 0; i < planets.length; i++) {
    const res = planets[i].resources;
    for (let j = 0; j < res.length; j++) {
      const item = res[j];
      if (raws.unlock[item] === undefined || raws.unlock[item] > depth) continue;
      tally[item] = (tally[item] ?? 0) + (j === 0 ? 1.5 : 1);
    }
  }
  if (open.length > 0) {
    if (belts > 0) tally[open[0]] = (tally[open[0]] ?? 0) + belts;
    const vein = open[(STARS.indexOf(star) * 3 + (sysSeed >>> 28)) % open.length];
    tally[vein] = (tally[vein] ?? 0) + 1.5;
  }
  // the start system carries every starter raw, so no first recipe is ever out of reach
  const want = depth === 0 ? Math.max(rng.int(3, 5), raws.starters.length) : rng.int(3, 5);
  const pool: ItemId[] = [];
  for (let i = 0; i < raws.ids.length; i++) if (tally[raws.ids[i]] !== undefined) pool.push(raws.ids[i]);
  for (let i = 0; i < open.length && pool.length < (depth === 0 ? want : 3); i++) {
    if (!pool.includes(open[i])) {
      pool.push(open[i]);
      tally[open[i]] = 0.5;
    }
  }
  for (let i = 0; i < pool.length; i++) tally[pool[i]] *= raws.weight[pool[i]] ?? 1;
  const mix: { item: ItemId; w: number }[] = [];
  let total = 0;
  while (mix.length < want && pool.length > 0) {
    const item = rng.weighted(pool, (x) => tally[x]);
    pool.splice(pool.indexOf(item), 1);
    mix.push({ item, w: tally[item] });
    total += tally[item];
  }
  for (let i = 0; i < mix.length; i++) mix[i].w = total > 0 ? mix[i].w / total : 1 / mix.length;
  mix.sort((x, y) => y.w - x.w || (x.item < y.item ? -1 : 1));

  let station: SystemInfo["station"] = null;
  const bits = stationMask(seed, g, core, balRange(content, "stationEvery", 3, 5))[depth];
  if (bits > 0 && (bits & (1 << lane)) !== 0) {
    const srng = new Rng(hashSeed(sysSeed, 0x57a1));
    let factions = Object.keys(content.factions ?? {}).sort() as FactionId[];
    if (factions.length === 0) factions = FALLBACK_FACTIONS;
    station = {
      faction: srng.pick(factions),
      name: makeName(srng, list(names?.systemA, SYS_A), list(names?.systemB, SYS_B), list(names?.systemC, SYS_C), 0.2) + " " + srng.int(2, 99),
    };
  }

  const jitter = (rng.next() - 0.5) * (0.5 / lanes);
  return {
    id,
    g,
    depth,
    lane,
    name,
    star,
    seed: sysSeed,
    hazards,
    richness,
    resources: mix,
    planets,
    belts,
    station,
    anomaly: depth > 0 && !isCore && rng.chance(balNum(content, "anomalyChance", 0.08)),
    links: depthLinks(seed, g, depth, core)[lane].slice(),
    pos: { x: Math.round(((lane + 0.5) / lanes + jitter) * 1000) / 1000, y: depth },
    isCore,
  };
}

const systemCache = new WeakMap<ContentDB, Map<string, SystemInfo>>();

/**
 * The system at (galaxy, depth, lane). Out-of-range indices are clamped, so this never throws;
 * validate player input with `lanesAt` before treating the result as "that" system.
 */
export function getSystem(content: ContentDB, seed: number, g: number, depth: number, lane: number): SystemInfo {
  const gi = toIndex(g);
  const core = galaxyDepth(content, gi);
  const d = clampInt(depth, 0, core);
  const lanes = lanesAt(seed, gi, d, core);
  const l = clampInt(lane, 0, lanes - 1);
  let cache = systemCache.get(content);
  if (!cache) {
    cache = new Map();
    systemCache.set(content, cache);
  }
  const key = (seed | 0) + ":" + gi + ":" + core + ":" + d + ":" + l;
  const hit = cache.get(key);
  if (hit) return hit;
  const sys = buildSystem(content, seed | 0, gi, d, l, core, lanes);
  if (cache.size >= SYSTEM_CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, sys);
  return sys;
}

/** Looks a planet up by its id ("g:depth:lane:index") in any system of the universe. */
export function planetById(content: ContentDB, seed: number, planetId: string): PlanetInfo | null {
  if (typeof planetId !== "string") return null;
  const p = planetId.split(":");
  if (p.length !== 4) return null;
  const g = Number(p[0]);
  const depth = Number(p[1]);
  const lane = Number(p[2]);
  const index = Number(p[3]);
  if (!Number.isInteger(g) || !Number.isInteger(depth) || !Number.isInteger(lane) || !Number.isInteger(index) || g < 0 || depth < 0 || lane < 0 || index < 0) return null;
  const sys = getSystem(content, seed, g, depth, lane);
  const planet = sys.planets[index];
  return planet && planet.id === planetId ? planet : null;
}

/** Stable numeric hash of an item id, for seeded per-item rolls. */
export function itemHash(id: string): number {
  return hashString(id);
}

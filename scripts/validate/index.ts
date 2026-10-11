// Content validation over the assembled ContentDB, i18n namespaces, fonts and assets.
// Runs in CI on Linux (Node only): `npm run validate`. Errors fail the build, warnings are listed.
import fs from "node:fs";
import path from "node:path";

import { content } from "@/content";
import { DECK_IDS, STAT_KEYS, type Condition, type Effect, type EventEffect, type L10n } from "@/engine/types";
import { resources } from "@/i18n/resources";

const ROOT = path.resolve(__dirname, "../..");
const errors: string[] = [];
const warnings: string[] = [];
const err = (m: string) => errors.push(m);
const warn = (m: string) => warnings.push(m);
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));

const FAILURES = ["tumble", "breach", "blackout", "noFuel", "engine", "radiation", "boarding", "anomaly"];
const MINIGAMES = ["weld", "wire", "rhythm", "valves", "calibrate", "tape", "defense", "dock", "hack"];
const FEATURES = new Set([
  "crafting", "autoQueue", "grid", "repairBots", "autoMaintenance", "nav", "scan", "probes", "expeditions", "outposts", "station",
  "crew", "cards", "research", "drones", "buyMax", "overdrive", "warp", "hull", "cosmos", "quests", "weekly", "codex",
]);
const items = content.items;
const statKeys = new Set<string>(STAT_KEYS);

// ---------- counts --------------------------------------------------------------------------
const count = (o: object) => Object.keys(o).length;
const targets: [string, number, number][] = [
  ["items", count(items), 150],
  ["recipes", count(content.recipes), 120],
  ["decks", count(content.decks), 12],
  ["events", count(content.events), 80],
  ["achievements", content.achievements.length, 100],
  ["chapters", content.chapters.length, 12],
  ["crew logs", content.logs.length, 60],
];
for (const [name, have, need] of targets) if (have < need) err(`count: ${name} ${have} < ${need}`);

// ---------- text ----------------------------------------------------------------------------
const texts: { where: string; text: L10n; title: boolean }[] = [];
function collect(v: unknown, where: string, depth = 0): void {
  if (!v || typeof v !== "object" || depth > 8) return;
  const o = v as Record<string, unknown>;
  if (typeof o.cs === "string" && typeof o.en === "string" && Object.keys(o).length === 2) {
    texts.push({ where, text: o as unknown as L10n, title: /\.(name|title|label)$/.test(where) });
    return;
  }
  if (Array.isArray(v)) v.forEach((x, i) => collect(x, `${where}[${i}]`, depth + 1));
  else for (const k of Object.keys(o)) collect(o[k], `${where}.${k}`, depth + 1);
}
for (const key of Object.keys(content) as (keyof typeof content)[]) if (key !== "balance") collect(content[key], key);
for (const t of texts) {
  if (!t.text.cs.trim()) err(`text: empty cs at ${t.where}`);
  if (!t.text.en.trim()) err(`text: empty en at ${t.where}`);
}

// i18next namespaces: identical key sets, plural families complete.
function flat(o: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (o && typeof o === "object") for (const k of Object.keys(o as object)) flat((o as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k, out);
  else if (typeof o === "string") out[prefix] = o;
  return out;
}
const PLURAL = /_(one|few|many|other)$/;
const uiStrings: { where: string; cs?: string; en?: string }[] = [];
for (const ns of Object.keys(resources.cs) as (keyof typeof resources.cs)[]) {
  const cs = flat(resources.cs[ns]);
  const en = flat(resources.en[ns]);
  const base = (keys: string[]) => new Set(keys.map((k) => k.replace(PLURAL, "")));
  const bcs = base(Object.keys(cs));
  const ben = base(Object.keys(en));
  for (const k of bcs) if (!ben.has(k)) err(`i18n: ${ns}.${k} missing in en`);
  for (const k of ben) if (!bcs.has(k)) err(`i18n: ${ns}.${k} missing in cs`);
  for (const k of bcs) {
    const csPlural = ["one", "few", "many", "other"].filter((s) => `${k}_${s}` in cs);
    if (csPlural.length && csPlural.length < 4) err(`i18n: ${ns}.${k} cs plural needs _one/_few/_many/_other (has ${csPlural.join(",")})`);
    const enPlural = ["one", "other"].filter((s) => `${k}_${s}` in en);
    if (csPlural.length && enPlural.length < 2) err(`i18n: ${ns}.${k} en plural needs _one/_other`);
  }
  for (const k of Object.keys(cs)) uiStrings.push({ where: `${ns}.${k}`, cs: cs[k] });
  for (const k of Object.keys(en)) uiStrings.push({ where: `${ns}.${k}`, en: en[k] });
}

// Glyph coverage: every character must exist in the mono face; titles also in the pixel face.
const coveragePath = path.join(ROOT, "assets/fonts/coverage.json");
if (fs.existsSync(coveragePath)) {
  const cov = JSON.parse(fs.readFileSync(coveragePath, "utf8")) as Record<string, number[]>;
  const mono = new Set(cov["IBMPlexMono-Regular"]);
  const pixel = new Set(cov["PixelifySans-Bold"]);
  const missing = (s: string, set: Set<number>) => [...new Set([...s].filter((c) => c !== "\n" && !set.has(c.codePointAt(0) as number)))].join("");
  const bad = new Map<string, string[]>();
  const note = (chars: string, where: string, font: string) => {
    if (!chars) return;
    const key = `${font} lacks "${chars}"`;
    bad.set(key, [...(bad.get(key) ?? []), where]);
  };
  for (const t of texts) {
    note(missing(t.text.cs + t.text.en, mono), t.where, "mono");
    if (t.title) note(missing(t.text.cs + t.text.en, pixel), t.where, "pixel");
  }
  for (const s of uiStrings) note(missing((s.cs ?? "") + (s.en ?? ""), mono), s.where, "mono");
  for (const [key, where] of bad) (key.startsWith("mono") ? err : warn)(`glyphs: ${key} in ${where.length} strings, e.g. ${where.slice(0, 3).join(", ")}`);
} else warn("glyphs: assets/fonts/coverage.json missing, run scripts/assets/build_fonts.py");

// ---------- references ----------------------------------------------------------------------
const needItem = (id: string, where: string) => {
  if (!items[id]) err(`ref: unknown item "${id}" in ${where}`);
};
function checkEffects(list: Effect[] | undefined, where: string): void {
  for (const e of list ?? []) {
    if (e.stat && !statKeys.has(e.stat)) err(`ref: unknown stat "${e.stat}" in ${where}`);
    if (e.deck && !DECK_IDS.includes(e.deck)) err(`ref: unknown deck "${e.deck}" in ${where}`);
    if (!e.stat && !e.deck) err(`effect without stat or deck in ${where}`);
    if (e.add === undefined && e.mul === undefined) err(`effect without add or mul in ${where}`);
  }
}
function checkCondition(c: Condition | undefined, where: string): void {
  if (!c) return;
  c.all?.forEach((x) => checkCondition(x, where));
  c.any?.forEach((x) => checkCondition(x, where));
  checkCondition(c.not, where);
  if (c.feature && !FEATURES.has(c.feature)) err(`ref: unknown feature "${c.feature}" in ${where}`);
  if (c.deck && !DECK_IDS.includes(c.deck.id)) err(`ref: unknown deck "${c.deck.id}" in ${where}`);
  if (c.item) needItem(c.item.id, where);
  if (c.failure && !["none", "any", ...FAILURES].includes(c.failure)) err(`ref: unknown failure "${c.failure}" in ${where}`);
  if (c.rep && !content.factions[c.rep.faction]) err(`ref: unknown faction in ${where}`);
}

for (const id in items) {
  const it = items[id];
  if (it.id !== id) err(`item key/id mismatch ${id}`);
  if (it.category === "module" && !it.module) err(`item ${id}: module without spec`);
  checkEffects(it.module?.effects, `item ${id}`);
  if (!(it.value > 0) && it.category !== "special") warn(`item ${id}: value ${it.value}`);
}
for (const id of DECK_IDS) if (!content.decks[id]) err(`deck ${id} missing`);

const produced = new Set<string>();
for (const id in content.recipes) {
  const r = content.recipes[id];
  const n = Object.keys(r.inputs).length;
  if (n < 1 || n > 5) err(`recipe ${id}: ${n} inputs`);
  for (const i in r.inputs) needItem(i, `recipe ${id}`);
  for (const o in r.outputs) {
    needItem(o, `recipe ${id}`);
    produced.add(o);
  }
  for (const b of r.byproducts ?? []) {
    needItem(b.item, `recipe ${id}`);
    produced.add(b.item);
  }
  if (r.unlock.research && !content.research[r.unlock.research]) err(`recipe ${id}: unknown research ${r.unlock.research}`);
  if (!(r.time > 0)) err(`recipe ${id}: time ${r.time}`);
}
// Reachability from raw items through every recipe (unlock paths are checked by the economy tests).
const have = new Set(Object.keys(items).filter((id) => items[id].category === "raw"));
for (let changed = true; changed; ) {
  changed = false;
  for (const id in content.recipes) {
    const r = content.recipes[id];
    if (Object.keys(r.inputs).every((i) => have.has(i))) {
      for (const o of [...Object.keys(r.outputs), ...(r.byproducts ?? []).map((b) => b.item)]) {
        if (!have.has(o)) {
          have.add(o);
          changed = true;
        }
      }
    }
  }
}
for (const id in items) {
  const cat = items[id].category;
  if (cat === "raw" || cat === "artifact") continue;
  if (!produced.has(id)) (cat === "special" ? warn : err)(`item ${id} (${cat}) is not produced by any recipe`);
  else if (!have.has(id)) err(`item ${id} is not reachable from raw materials`);
}

for (const id in content.research) {
  const r = content.research[id];
  for (const q of r.requires) if (!content.research[q]) err(`research ${id}: unknown requirement ${q}`);
  for (const rc of r.recipes ?? []) if (!content.recipes[rc]) err(`research ${id}: unknown recipe ${rc}`);
  for (const i in r.items ?? {}) needItem(i, `research ${id}`);
  if (r.feature && !FEATURES.has(r.feature)) err(`research ${id}: unknown feature`);
  checkEffects(r.effects, `research ${id}`);
}
for (const id in content.upgrades) {
  const u = content.upgrades[id];
  for (const q of u.requires) if (!content.upgrades[q]) err(`upgrade ${id}: unknown requirement ${q}`);
  checkEffects(u.effects, `upgrade ${id}`);
}
for (const id in content.cards) {
  if (!DECK_IDS.includes(content.cards[id].deck)) err(`card ${id}: unknown deck`);
  checkEffects(content.cards[id].effects, `card ${id}`);
}
for (const id in content.traits) {
  for (const e of content.traits[id].effects) if (e.stat && !statKeys.has(e.stat)) err(`trait ${id}: unknown stat ${e.stat}`);
}
for (const id in content.mutators) checkEffects(content.mutators[id].effects, `mutator ${id}`);
for (const id in content.hulls) checkEffects(content.hulls[id].effects, `hull ${id}`);
for (const id in content.megaEffects) {
  needItem(id, "megaEffects");
  checkEffects(content.megaEffects[id], `megaEffects ${id}`);
}
for (const id in content.shop) {
  const s = content.shop[id];
  if (s.item) needItem(s.item.id, `shop ${id}`);
  checkEffects(s.effects, `shop ${id}`);
}
for (const id in content.biomes) {
  for (const r of content.biomes[id].resources) needItem(r, `biome ${id}`);
  for (const r of content.biomes[id].special ?? []) needItem(r, `biome ${id}`);
}
for (const k of FAILURES) {
  const f = content.failures[k as keyof typeof content.failures];
  if (!f) err(`failure ${k} missing`);
  else if (!f.exits.some((x) => x.kind === "tow")) err(`failure ${k} has no tow exit`);
}
const achIds = new Set(content.achievements.map((a) => a.id));
for (const id in content.cosmetics) {
  const u = content.cosmetics[id].unlock;
  if (u.achievement && !achIds.has(u.achievement)) err(`cosmetic ${id}: unknown achievement ${u.achievement}`);
}
for (const a of content.achievements) if (a.reward?.cosmetic && !content.cosmetics[a.reward.cosmetic]) err(`achievement ${a.id}: unknown cosmetic ${a.reward.cosmetic}`);

// Stats referenced by achievements/quests must be written somewhere in the engine.
const engineSrc = ["core", "world", "meta"]
  .flatMap((a) => fs.readdirSync(path.join(ROOT, "src/engine", a)).map((f) => fs.readFileSync(path.join(ROOT, "src/engine", a, f), "utf8")))
  .concat(fs.readFileSync(path.join(ROOT, "src/engine/kernel.ts"), "utf8"))
  .join("\n");
// Counters set by the UI layer rather than the engine.
const UI_STATS = new Set(["debugOpened"]);
const statWritten = (key: string) => {
  if (UI_STATS.has(key) || engineSrc.includes(`"${key}"`)) return true;
  // Template-built counters: `craftsT${tier}`, `event_${type}`, `minigame_${id}`, `failure_${kind}`.
  const stem = key.replace(/[0-9]+$/, "").split("_")[0];
  return ["`" + stem + "${", "`" + stem + "_${", '"' + stem + '_" +', "stats." + key + " ="].some((needle) => engineSrc.includes(needle));
};
for (const key of new Set([...content.achievements.map((a) => a.stat), ...content.quests.map((q) => q.stat)])) {
  if (!statWritten(key)) warn(`stat "${key}" is used by achievements/quests but no engine code mentions it`);
}

// Events.
function checkEventEffects(list: EventEffect[], where: string, chains: string[]): void {
  for (const e of list) {
    if (e.t === "item") needItem(e.item, where);
    else if (e.t === "failure" && !FAILURES.includes(e.kind)) err(`${where}: unknown failure ${e.kind}`);
    else if (e.t === "blueprint" && e.recipe && !content.recipes[e.recipe]) err(`${where}: unknown recipe ${e.recipe}`);
    else if (e.t === "rep" && !content.factions[e.faction]) err(`${where}: unknown faction ${e.faction}`);
    else if (e.t === "chain") chains.push(e.event);
    else if (e.t === "buff") checkEffects([e.effect], where);
    else if (e.t === "minigame") {
      if (!MINIGAMES.includes(e.game)) err(`${where}: unknown minigame ${e.game}`);
      checkEventEffects(e.win, where, chains);
      checkEventEffects(e.lose, where, chains);
    }
  }
}
for (const id in content.events) {
  const ev = content.events[id];
  const where = `event ${id}`;
  if (ev.choices.length < 2 || ev.choices.length > 4) err(`${where}: ${ev.choices.length} choices`);
  checkCondition(ev.when, where);
  const chains: string[] = [];
  let free = false;
  for (const c of ev.choices) {
    checkCondition(c.requires, where);
    for (const i in c.cost?.items ?? {}) needItem(i, where);
    if (!c.requires && !c.cost) free = true;
    if (!c.outcomes.length) err(`${where}: choice ${c.id} has no outcomes`);
    for (const o of c.outcomes) {
      if (!(o.weight > 0)) err(`${where}: outcome weight ${o.weight}`);
      checkEventEffects(o.effects, where, chains);
    }
  }
  if (!free) err(`${where}: no free unconditional choice`);
  for (const target of chains) if (!content.events[target]) err(`${where}: chain to unknown event ${target}`);
}

// Story.
content.chapters.forEach((c, i) => {
  if (c.id !== i + 1) err(`chapter order: index ${i} has id ${c.id}`);
  checkCondition(c.trigger, `chapter ${c.id}`);
  for (const o of c.objectives) checkCondition(o.done, `chapter ${c.id}`);
  for (const f of c.unlocks ?? []) if (!FEATURES.has(f)) err(`chapter ${c.id}: unknown feature ${f}`);
});
let lastDepth = -1;
for (const c of content.chapters) {
  const d = c.trigger.depthMin ?? c.trigger.all?.find((x) => x.depthMin !== undefined)?.depthMin;
  if (d !== undefined) {
    if (d < lastDepth) err(`chapter ${c.id}: depth trigger ${d} is below the previous chapter's ${lastDepth}`);
    lastDepth = d;
  }
}
const kippIds = new Set<string>();
for (const k of content.kipp) {
  if (kippIds.has(k.id)) err(`kipp: duplicate id ${k.id}`);
  kippIds.add(k.id);
  checkCondition(k.when, `kipp ${k.id}`);
}

// ---------- assets --------------------------------------------------------------------------
const iconDir = "assets/icons";
if (exists(iconDir)) {
  const iconNames = new Set(fs.readdirSync(path.join(ROOT, iconDir)).map((f) => f.replace(/\.png$/, "")));
  const wantIcon = (name: string, where: string) => {
    if (!iconNames.has(name)) err(`icon: "${name}" (${where}) has no PNG in ${iconDir}`);
  };
  for (const id in items) wantIcon(items[id].icon, `item ${id}`);
  for (const id of DECK_IDS) wantIcon(content.decks[id].icon, `deck ${id}`);
  for (const id in content.research) wantIcon(content.research[id].icon, `research ${id}`);
  for (const id in content.upgrades) wantIcon(content.upgrades[id].icon, `upgrade ${id}`);
  for (const id in content.shop) wantIcon(content.shop[id].icon, `shop ${id}`);
  for (const a of content.achievements) wantIcon(a.icon, `achievement ${a.id}`);
  for (const k of FAILURES) wantIcon(`fail_${k}`, "failure");
  for (const m of MINIGAMES) wantIcon(`mg_${m}`, "minigame");
  const doc = fs.readFileSync(path.join(ROOT, "docs/ICONS.md"), "utf8");
  for (const line of doc.split("\n")) {
    const m = line.match(/^- [^:]+: `([^`]+)`/);
    if (m && !line.startsWith("- Items")) for (const name of m[1].split(/\s+/)) wantIcon(name, "docs/ICONS.md");
  }
} else warn(`icons: ${iconDir} missing (run npm run assets)`);

// feedback.ts imports react-native, so the id list is read from its source text.
const feedbackSrc = fs.readFileSync(path.join(ROOT, "src/platform/feedback.ts"), "utf8");
const sfxBlock = feedbackSrc.slice(feedbackSrc.indexOf("SFX_IDS = ["), feedbackSrc.indexOf("] as const", feedbackSrc.indexOf("SFX_IDS = [")));
const sfxIds = [...sfxBlock.matchAll(/"([A-Za-z0-9]+)"/g)].map((m) => m[1]);
if (sfxIds.length < 40) err(`audio: could not read SFX_IDS (${sfxIds.length})`);
for (const id of sfxIds) if (!exists(`assets/audio/sfx/${id}.wav`)) err(`audio: sfx "${id}" has no file`);

const registry = path.join(ROOT, "src/minigames/index.ts");
if (fs.existsSync(registry)) {
  const src = fs.readFileSync(registry, "utf8");
  for (const m of MINIGAMES) {
    if (!src.includes(`"./${m}"`) && !src.includes(`./${m}/`)) err(`minigame "${m}" is not registered in src/minigames/index.ts`);
    if (!exists(`src/minigames/${m}/index.tsx`)) err(`minigame "${m}" has no index.tsx`);
  }
} else warn("minigames: registry missing");

// ---------- report --------------------------------------------------------------------------
console.log(`validate: ${targets.map(([n, h]) => `${h} ${n}`).join(", ")}, ${texts.length} content strings, ${uiStrings.length} UI strings`);
if (warnings.length) console.log(`\n${warnings.length} warning(s):\n  ` + warnings.join("\n  "));
if (errors.length) {
  console.error(`\n${errors.length} error(s):\n  ` + errors.slice(0, 80).join("\n  ") + (errors.length > 80 ? `\n  ... ${errors.length - 80} more` : ""));
  process.exit(1);
}
console.log("validate: OK");

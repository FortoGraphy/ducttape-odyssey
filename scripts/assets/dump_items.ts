// Writes scripts/assets/item_manifest.json for the icon and sprite pipeline:
//   npx tsx scripts/assets/dump_items.ts
// Reads the real content (items, cosmetics, hull classes) when src/content/economy exists and falls
// back to the canonical id list from docs/AGENT_BRIEF.md otherwise, so the art pipeline works before
// the content does and picks the real list up automatically on the next run.
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

interface ItemEntry {
  id: string;
  tier: number;
  category: string;
  family?: string;
  mk?: number;
  tags: string[];
  consumable?: string;
}
interface CosmeticEntry {
  id: string;
  kind: string;
  value: string;
}
interface Manifest {
  source: "content" | "canonical";
  items: ItemEntry[];
  cosmetics: CosmeticEntry[];
  hulls: string[];
}

const ROOT = resolve(__dirname, "..", "..");
const ECONOMY = join(ROOT, "src", "content", "economy");

const FAMILIES = ["laser", "engine", "shield", "scanner", "reactor", "cargo", "repair", "life"];

function canonical(): Manifest {
  const list = (ids: string, tier: number, category: string): ItemEntry[] => ids.split(" ").map((id) => ({ id, tier, category, tags: [] }));
  const items: ItemEntry[] = [
    ...list("scrap ice silicates carbon hydrogen conductite lumite voidglass antimatter organics sulfur ferrite helium3 brine xenon strange_dust", 0, "raw"),
    ...list("alloy coolant fuel glass polymer slag water oxygen wire ceramic", 1, "refined"),
    ...list("circuit actuator plating lens power_cell tubing", 2, "component"),
    ...list("duct_tape spare_parts nano_gel fuel_cell coffee beacon", 1, "consumable"),
  ];
  for (const family of FAMILIES) {
    for (let mk = 1; mk <= 5; mk++) items.push({ id: `mod_${family}_mk${mk}`, tier: 3, category: "module", family, mk, tags: [] });
  }
  return { source: "canonical", items, cosmetics: [], hulls: ["tug"] };
}

type AnyRecord = Record<string, unknown>;

function values(mod: AnyRecord, listKey: string, mapKey: string): AnyRecord[] {
  const list = mod[listKey];
  if (Array.isArray(list)) return list as AnyRecord[];
  const map = mod[mapKey];
  if (map && typeof map === "object") return Object.values(map as AnyRecord) as AnyRecord[];
  return [];
}

async function load(file: string): Promise<AnyRecord | null> {
  const path = join(ECONOMY, file);
  if (!existsSync(path)) return null;
  return (await import(pathToFileURL(path).href)) as AnyRecord;
}

async function fromContent(): Promise<Manifest | null> {
  const itemsMod = await load("items.ts");
  if (!itemsMod) return null;
  const items: ItemEntry[] = values(itemsMod, "itemList", "items").map((raw) => {
    const mod = raw.module as { family?: string; mk?: number } | undefined;
    const cons = raw.consumable as { kind?: string } | undefined;
    const entry: ItemEntry = {
      id: String(raw.id),
      tier: Number(raw.tier),
      category: String(raw.category),
      tags: Array.isArray(raw.tags) ? (raw.tags as unknown[]).map(String) : [],
    };
    if (mod?.family) entry.family = mod.family;
    if (mod?.mk) entry.mk = mod.mk;
    if (cons?.kind) entry.consumable = cons.kind;
    return entry;
  });
  if (items.length === 0) return null;
  const cosmeticsMod = await load("cosmetics.ts");
  const cosmetics: CosmeticEntry[] = cosmeticsMod
    ? values(cosmeticsMod, "cosmeticList", "cosmetics").map((c) => ({ id: String(c.id), kind: String(c.kind), value: String(c.value) }))
    : [];
  const hullsMod = await load("hulls.ts");
  const hulls = hullsMod ? values(hullsMod, "hullList", "hulls").map((h) => String(h.id)) : [];
  return { source: "content", items, cosmetics, hulls: hulls.length ? hulls : ["tug"] };
}

async function main(): Promise<void> {
  let manifest: Manifest | null = null;
  try {
    manifest = await fromContent();
  } catch (err) {
    console.warn(`[dump_items] could not read src/content/economy (${String(err)}); using the canonical list`);
  }
  manifest ??= canonical();
  const out = join(ROOT, "scripts", "assets", "item_manifest.json");
  writeFileSync(out, JSON.stringify(manifest, null, 1) + "\n", "utf8");
  console.log(`[dump_items] ${manifest.source}: ${manifest.items.length} items, ${manifest.cosmetics.length} cosmetics, hulls ${manifest.hulls.join(" ")}`);
}

void main();

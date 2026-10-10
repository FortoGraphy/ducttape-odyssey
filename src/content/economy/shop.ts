// Station upgrade shop. `cost` is seconds of current income for level 1 (never below `costFloor`
// credits), growing by `costGrowth` per level. `gridSlots` and `effects` apply once per level.
// Supply crates (`item`) are repeatable: their level only counts purchases.
// The grid starts with 4 open cells; the three slot upgrades add 32 more (36 = a full 6x6 hull).
// `fuel_tank` has no stat to modify: each level adds `balance.fuelTankPerLevel` to the fuel cap.
import type { Effect, FactionId, ItemId, ShopItemDef } from "@/engine/types";
import { byId, t } from "./util";

interface Extra {
  faction?: FactionId;
  repMin?: number;
  effects?: Effect[];
  gridSlots?: number;
  item?: { id: ItemId; n: number };
}

const offer = (
  id: string,
  icon: string,
  maxLevel: number,
  cost: number,
  costFloor: number,
  costGrowth: number,
  extra: Extra,
  cs: string,
  en: string,
  dcs: string,
  den: string,
): ShopItemDef => ({ id, name: t(cs, en), desc: t(dcs, den), icon, cost, costFloor, costGrowth, maxLevel, ...extra });

export const shopList: ShopItemDef[] = [
  offer("grid_slot_a", "tab_grid", 5, 300, 500, 2.2, { gridSlots: 1 }, "Montážní pozice", "Mounting Point", "Další volné místo v technické mřížce. Stačilo odšroubovat kryt.", "One more free cell in the tech grid. All it took was removing a cover."),
  offer("grid_slot_b", "tab_grid", 7, 900, 50000, 2.5, { gridSlots: 1 }, "Rozšíření mřížky", "Grid Extension", "Další pozice pro modul. Vyžaduje větší trup než remorkér.", "Another module cell. Needs a hull bigger than the tug."),
  offer("grid_slot_c", "tab_grid", 10, 1800, 5e6, 3, { gridSlots: 2 }, "Dvojitý rám", "Twin Rack", "Dvě pozice naráz. Vyplatí se až s opravdu velkým trupem.", "Two cells at once. Only worth it on a really big hull."),
  offer("fuel_tank", "fuel", 10, 240, 2000, 1.8, {}, "Větší nádrž", "Bigger Tank", "Víc paliva na palubě, víc skoků bez tankování.", "More fuel aboard, more jumps between refills."),
  offer("cargo_nets", "cargo", 10, 360, 1500, 1.9, { effects: [{ stat: "cargoCap", add: 0.15 }] }, "Nákladové sítě", "Cargo Nets", "Náklad drží i u stropu. Kapacita +15 % za úroveň.", "Cargo now holds on the ceiling too. Capacity +15% per level."),
  offer("tool_rack", "wrench", 8, 420, 4000, 1.9, { effects: [{ stat: "repairSpeed", add: 0.1 }] }, "Stojan na nářadí", "Tool Rack", "Každý klíč má svůj háček. Opravy +10 % za úroveň.", "A hook for every wrench. Repairs +10% per level."),
  offer("drone_dock", "drone", 6, 600, 60000, 2.2, { effects: [{ stat: "droneCap", add: 0.15 }] }, "Dokovací kolébka", "Docking Cradle", "Místo pro další drony. Kapacita +15 % za úroveň.", "Room for more drones. Capacity +15% per level."),
  offer("bunk_bed", "crew", 6, 600, 800000, 2.2, { effects: [{ stat: "crewCap", add: 0.15 }] }, "Palanda", "Bunk Bed", "Horní lůžko je za trest. Místo pro posádku +15 % za úroveň.", "The top bunk is a punishment. Crew capacity +15% per level."),
  offer("broker_license", "sell", 8, 480, 3000, 2, { faction: "lamplighters", effects: [{ stat: "sellValue", add: 0.05 }] }, "Makléřská licence", "Broker Licence", "Makléř si z každého prodeje nechá méně. Prodejní ceny +5 % za úroveň.", "The broker keeps less of every sale. Sell prices +5% per level."),
  offer("loyalty_card", "card", 5, 300, 5000, 2, { faction: "lamplighters", effects: [{ stat: "repGain", add: 0.1 }] }, "Věrnostní kartička", "Loyalty Card", "Desáté razítko zdarma. Reputace roste o 10 % rychleji za úroveň.", "The tenth stamp is free. Reputation grows 10% faster per level."),
  offer("coffee_crate", "coffee", 9999, 90, 200, 1.03, { faction: "lamplighters", item: { id: "coffee", n: 60 } }, "Bedna kávy", "Crate of Coffee", "Šedesát dávek. Původ zrn je obchodní tajemství.", "Sixty servings. The origin of the beans is a trade secret."),
  offer("tow_contract", "tow", 5, 420, 8000, 2.1, { faction: "rustborn", effects: [{ stat: "towSpeed", mul: 0.9 }] }, "Předplacený odtah", "Prepaid Towing", "Rezaví tě znají jménem. Odtah dorazí o 10 % dřív za úroveň.", "The Rustborn know you by name. The tow arrives 10% sooner per level."),
  offer("hull_bracing", "hull", 10, 420, 6000, 1.9, { faction: "rustborn", effects: [{ stat: "hullMax", add: 0.1 }] }, "Výztuhy trupu", "Hull Bracing", "Navařené z cizích vraků. Trup +10 % za úroveň.", "Welded on from other people's wrecks. Hull +10% per level."),
  offer("scrap_magnet", "belt", 6, 540, 20000, 2.1, { faction: "rustborn", repMin: 20, effects: [{ stat: "salvageRate", add: 0.1 }] }, "Šrotový magnet", "Scrap Magnet", "Trosky si tě najdou samy. Sběr +10 % za úroveň.", "Wreckage finds you on its own. Salvage +10% per level."),
  offer("tape_bundle", "tape", 9999, 60, 150, 1.03, { faction: "rustborn", item: { id: "duct_tape", n: 10 } }, "Balík pásky", "Tape Bundle", "Deset rolí. Rezaví jí lepí i smlouvy.", "Ten rolls. The Rustborn use it on contracts, too."),
  offer("nav_computer", "jump", 5, 600, 40000, 2.2, { faction: "ledger", effects: [{ stat: "jumpCooldown", mul: 0.93 }] }, "Navigační počítač", "Nav Computer", "Počítá trasu dřív, než ji zadáš. Pohon chladne o 7 % rychleji za úroveň.", "Plots the route before you ask. The drive cools 7% faster per level."),
  offer("audit_insurance", "fam_shield", 5, 720, 100000, 2.3, { faction: "ledger", repMin: 20, effects: [{ stat: "shield", mul: 0.95 }] }, "Pojistka proti nehodám", "Accident Cover", "Škody z událostí −5 % za úroveň. Drobné písmo je opravdu drobné.", "Event damage -5% per level. The small print is very small."),
  offer("escrow", "coin", 5, 900, 1e6, 2.5, { faction: "ledger", repMin: 40, effects: [{ stat: "creditGain", add: 0.04 }] }, "Úschova v účtárně", "Ledger Escrow", "Tvoje kredity pracují, i když ty ne. Příjem +4 % za úroveň.", "Your credits work even when you do not. Income +4% per level."),
  offer("fuel_delivery", "fuel", 9999, 120, 400, 1.03, { item: { id: "fuel_cell", n: 3 } }, "Rozvoz paliva", "Fuel Delivery", "Tři palivové články až ke dveřím přechodové komory.", "Three fuel cells, delivered to your airlock door."),
];

export const shop: Record<string, ShopItemDef> = byId(shopList);

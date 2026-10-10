// Prestige trees. Layer 1 is paid in stamps (warp), layer 2 in rivets (rebuild), layer 3 in
// sparks (reboot). Cost of level n = cost * costGrowth^(n - 1). `requires` stays within a layer.
import type { Effect, FeatureId, PrestigeUpgradeDef, UpgradeId } from "@/engine/types";
import { byId, t } from "./util";

interface Extra {
  effects?: Effect[];
  feature?: FeatureId;
}

const up = (
  layer: PrestigeUpgradeDef["layer"],
  id: UpgradeId,
  x: number,
  y: number,
  requires: UpgradeId[],
  maxLevel: number,
  cost: number,
  costGrowth: number,
  icon: string,
  extra: Extra,
  cs: string,
  en: string,
  dcs: string,
  den: string,
): PrestigeUpgradeDef => ({ id, layer, name: t(cs, en), desc: t(dcs, den), icon, pos: { x, y }, requires, maxLevel, cost, costGrowth, ...extra });

// ---------- layer 1: stamps (the paperwork of interstellar travel) --------------------

const STAMPS: PrestigeUpgradeDef[] = [
  up(1, "st_income", 3, 0, [], 25, 1, 1.35, "coin", { effects: [{ stat: "creditGain", add: 0.25 }] }, "Kolonka Příjmy", "The Income Box", "Někdo ji konečně vyplnil správně. Kredity +25 % za úroveň.", "Somebody finally filled it in correctly. Credits +25% per level."),
  up(1, "st_mining", 1, 1, ["st_income"], 25, 1, 1.35, "deck_mining", { effects: [{ stat: "mineRate", add: 0.25 }] }, "Těžební povolení", "Mining Permit", "S razítkem se těží líp. Těžba +25 % za úroveň.", "Mining goes better with a stamp. Mining +25% per level."),
  up(1, "st_lift", 2, 1, ["st_income"], 25, 1, 1.35, "deck_lift", { effects: [{ stat: "liftRate", add: 0.25 }] }, "Revize výtahu", "Lift Inspection", "Technik podepsal, že výtah může jezdit rychleji. Výtah +25 % za úroveň.", "The inspector signed off on a faster lift. Lift +25% per level."),
  up(1, "st_buymax", 3, 1, ["st_income"], 1, 2, 1, "max", { feature: "buyMax" }, "Hromadná objednávka", "Bulk Order Form", "Formulář, kterým koupíš všechny úrovně naráz. Odemkne nákup MAX.", "A form that buys every level at once. Unlocks buy MAX."),
  up(1, "st_cargo", 4, 1, ["st_income"], 25, 1, 1.35, "deck_cargo", { effects: [{ stat: "cargoCap", add: 0.25 }] }, "Celní výjimka", "Customs Waiver", "Co celník nevidí, to se vejde. Kapacita +25 % za úroveň.", "What customs cannot see, fits. Capacity +25% per level."),
  up(1, "st_craft", 5, 1, ["st_income"], 20, 2, 1.4, "craft", { effects: [{ stat: "craftSpeed", add: 0.15 }] }, "Živnostenský list", "Trade Licence", "Výroba je teď legální, a tudíž rychlejší. Rychlost výroby +15 % za úroveň.", "Crafting is now legal and therefore faster. Craft speed +15% per level."),
  up(1, "st_salvage", 0, 2, ["st_mining"], 10, 4, 1.5, "belt", { effects: [{ stat: "salvageValue", add: 0.2 }] }, "Nálezné", "Finder's Fee", "Trosky vynesou o 20 % víc za úroveň.", "Salvage pays 20% more per level."),
  up(1, "st_active", 1, 2, ["st_mining"], 10, 3, 1.5, "heat", { effects: [{ stat: "activeMult", add: 0.15 }] }, "Příplatek za přesčas", "Overtime Bonus", "Ruční těžba je o 15 % silnější za úroveň.", "Hold-to-mine is 15% stronger per level."),
  up(1, "st_decks", 2, 2, ["st_lift"], 10, 3, 1.6, "buy", { effects: [{ stat: "deckCost", mul: 0.97 }] }, "Sleva pro stálé zákazníky", "Frequent Flyer Discount", "Úrovně palub jsou o 3 % levnější za úroveň.", "Deck levels cost 3% less per level."),
  up(1, "st_research", 3, 2, ["st_buymax"], 15, 3, 1.45, "rp", { effects: [{ stat: "researchRate", add: 0.2 }] }, "Výzkumný grant", "Research Grant", "Peníze na vědu. Výzkum +20 % za úroveň.", "Money for science. Research +20% per level."),
  up(1, "st_sell", 4, 2, ["st_cargo"], 15, 3, 1.45, "sell", { effects: [{ stat: "sellValue", add: 0.1 }] }, "Pečeť kvality", "Seal of Quality", "Makléř platí o 10 % víc za úroveň. Pečeť sis natiskl sám.", "The broker pays 10% more per level. You printed the seal yourself."),
  up(1, "st_batch", 5, 2, ["st_craft"], 15, 4, 1.45, "queue", { effects: [{ stat: "craftBatch", add: 0.15 }] }, "Sériová výroba", "Mass Production", "Várky jsou o 15 % větší za úroveň.", "Batches are 15% bigger per level."),
  up(1, "st_power", 0, 3, ["st_salvage"], 10, 5, 1.5, "power", { effects: [{ stat: "powerOut", add: 0.1 }] }, "Revize elektro", "Electrical Inspection", "Reaktor dodá o 10 % víc za úroveň. Revizní technik raději nechtěl vidět víc.", "The reactor delivers 10% more per level. The inspector preferred not to look closer."),
  up(1, "st_wear", 1, 3, ["st_active"], 6, 5, 1.8, "integrity", { effects: [{ stat: "wearRate", mul: 0.95 }] }, "Prodloužená záruka", "Extended Warranty", "Opotřebení −5 % za úroveň. Původní záruka propadla, tahle je tvoje vlastní.", "Wear -5% per level. The original warranty lapsed; this one is your own."),
  up(1, "st_fuel", 2, 3, ["st_decks"], 5, 5, 1.8, "fuel", { effects: [{ stat: "fuelUse", mul: 0.95 }] }, "Tankovací karta", "Fuel Card", "Skoky spotřebují o 5 % méně paliva za úroveň.", "Jumps burn 5% less fuel per level."),
  up(1, "st_offline", 3, 3, ["st_research"], 5, 6, 2, "clock", { effects: [{ stat: "offlineEff", add: 0.03 }] }, "Spící agent", "Sleeper Agent", "Loď pracuje líp, když se nedíváš. Účinnost klidového letu roste.", "The ship works better when you are not looking. Idle Cruise efficiency rises."),
  up(1, "st_luck", 4, 3, ["st_sell"], 5, 6, 1.9, "star", { effects: [{ stat: "eventLuck", add: 0.05 }] }, "Čtyřlístek v pase", "Clover in the Passport", "Události dopadají častěji dobře.", "Events turn out well more often."),
  up(1, "st_quality", 5, 3, ["st_batch"], 5, 8, 2, "q4", { effects: [{ stat: "qualityLuck", add: 0.08 }] }, "Výstupní kontrola", "Final Inspection", "Moduly častěji vyjdou v lepší kvalitě.", "Modules roll better quality more often."),
  up(1, "st_xp", 2, 4, ["st_fuel"], 10, 6, 1.5, "crew", { effects: [{ stat: "xpGain", add: 0.2 }] }, "Školení BOZP", "Safety Briefing", "Posádka se učí o 20 % rychleji za úroveň. Podpis prezenčky je povinný.", "The crew learns 20% faster per level. Signing the attendance sheet is mandatory."),
  up(1, "st_stamps", 3, 4, ["st_offline"], 10, 10, 1.7, "stamp", { effects: [{ stat: "stampGain", add: 0.1 }] }, "Sběratelská vášeň", "Collector's Itch", "Každý warp vynese o 10 % razítek víc za úroveň.", "Every warp yields 10% more stamps per level."),
  up(1, "st_jump", 4, 4, ["st_luck"], 10, 6, 1.5, "jump", { effects: [{ stat: "jumpCharge", add: 0.15 }] }, "Prioritní koridor", "Priority Lane", "Hyperpohon se nabíjí o 15 % rychleji za úroveň.", "The hyperdrive charges 15% faster per level."),
  up(1, "st_all", 3, 5, ["st_stamps"], 50, 25, 1.3, "trophy", { effects: [{ stat: "allProd", add: 0.1 }] }, "Kulaté razítko", "The Big Round Stamp", "To, na které všichni čekají. Veškerá produkce +10 % za úroveň.", "The one everybody waits for. All production +10% per level."),
];

// ---------- layer 2: rivets (how the ship is put together) ----------------------------

const RIVETS: PrestigeUpgradeDef[] = [
  up(2, "rv_hull", 2, 0, [], 1, 1, 1, "hull", { feature: "hull" }, "Projekční kancelář", "Design Office", "Odemkne třídy trupu. Remorkér nemusí být navždy.", "Unlocks hull classes. The tug need not be forever."),
  up(2, "rv_frame", 1, 1, ["rv_hull"], 10, 1, 1.6, "hull", { effects: [{ stat: "hullMax", add: 0.25 }] }, "Silnější žebra", "Thicker Ribs", "Trup vydrží o 25 % víc za úroveň.", "The hull takes 25% more per level."),
  up(2, "rv_prod", 2, 1, ["rv_hull"], 10, 2, 2, "rivet", { effects: [{ stat: "allProd", mul: 1.5 }] }, "Lepší nýty", "Better Rivets", "Loď, která drží pohromadě, víc vyrobí. Veškerá produkce ×1,5 za úroveň.", "A ship that holds together makes more. All production x1.5 per level."),
  up(2, "rv_stamps", 3, 1, ["rv_hull"], 10, 2, 1.7, "stamp", { effects: [{ stat: "stampGain", add: 0.25 }] }, "Razítkovací lis", "Stamping Press", "Razítka +25 % za úroveň. Ruční razítkování už nikoho nebavilo.", "Stamps +25% per level. Nobody enjoyed stamping by hand anyway."),
  up(2, "rv_wear", 0, 2, ["rv_frame"], 6, 3, 1.8, "integrity", { effects: [{ stat: "wearRate", mul: 0.93 }] }, "Nerez", "Stainless", "Opotřebení −7 % za úroveň. Rez si bude muset najít jinou loď.", "Wear -7% per level. Rust will have to find another ship."),
  up(2, "rv_repair", 1, 2, ["rv_frame"], 10, 2, 1.6, "repair", { effects: [{ stat: "repairSpeed", add: 0.25 }] }, "Servisní šachty", "Service Shafts", "Ke všemu se dá dostat bez bourání. Opravy +25 % za úroveň.", "Everything can be reached without demolition. Repairs +25% per level."),
  up(2, "rv_deckcost", 2, 2, ["rv_prod"], 8, 3, 1.8, "buy", { effects: [{ stat: "deckCost", mul: 0.95 }] }, "Modulární paluby", "Modular Decks", "Úrovně palub jsou o 5 % levnější za úroveň.", "Deck levels cost 5% less per level."),
  up(2, "rv_batch", 3, 2, ["rv_stamps"], 8, 3, 1.9, "craft", { effects: [{ stat: "craftBatch", mul: 1.25 }] }, "Širší linka", "Wider Line", "Várky ×1,25 za úroveň.", "Batches x1.25 per level."),
  up(2, "rv_drones", 4, 2, ["rv_stamps"], 6, 3, 2, "drone", { effects: [{ stat: "droneCap", add: 0.25 }] }, "Hangárová vrata", "Hangar Doors", "Větší vrata, víc dronů. Kapacita dronů +25 % za úroveň.", "Bigger doors, more drones. Drone capacity +25% per level."),
  up(2, "rv_shield", 0, 3, ["rv_wear"], 5, 5, 2, "fam_shield", { effects: [{ stat: "shield", mul: 0.93 }] }, "Dvojitý plášť", "Double Skin", "Události poškodí loď o 7 % méně za úroveň.", "Events deal 7% less damage per level."),
  up(2, "rv_crew", 1, 3, ["rv_repair"], 6, 4, 2, "crew", { effects: [{ stat: "crewCap", add: 0.25 }] }, "Kajuty navíc", "Extra Cabins", "Místo pro posádku +25 % za úroveň.", "Crew capacity +25% per level."),
  up(2, "rv_tow", 2, 3, ["rv_deckcost"], 4, 4, 2, "tow", { effects: [{ stat: "towSpeed", mul: 0.85 }] }, "Vlečné oko", "Tow Eye", "Pořádné oko na přídi. Odtah dorazí o 15 % dřív za úroveň.", "A proper eye on the bow. The tow arrives 15% sooner per level."),
  up(2, "rv_outposts", 3, 3, ["rv_batch"], 8, 4, 1.8, "station", { effects: [{ stat: "outpostYield", add: 0.25 }] }, "Stavební četa", "Construction Crew", "Základny vynášejí o 25 % víc za úroveň.", "Outposts yield 25% more per level."),
  up(2, "rv_power", 4, 3, ["rv_drones"], 5, 4, 2, "power", { effects: [{ stat: "powerOut", mul: 1.2 }] }, "Hlavní rozvaděč", "Main Switchboard", "Energie ×1,2 za úroveň. Tentokrát s popsanými jističi.", "Power x1.2 per level. With labelled breakers this time."),
  up(2, "rv_rivets", 2, 4, ["rv_tow"], 10, 8, 1.8, "rivet", { effects: [{ stat: "rivetGain", add: 0.15 }] }, "Nýtovací pistole", "Rivet Gun", "Každá přestavba vynese o 15 % nýtů víc za úroveň.", "Every rebuild yields 15% more rivets per level."),
];

// ---------- layer 3: sparks (the constants of the universe) ---------------------------

const SPARKS: PrestigeUpgradeDef[] = [
  up(3, "sp_cosmos", 2, 0, [], 1, 1, 1, "spark", { feature: "cosmos" }, "Pojistka vesmíru", "Cosmic Fuse Box", "Odemkne strom konstant. Sahej jen na to, co je popsané.", "Unlocks the constants tree. Touch only what is labelled."),
  up(3, "sp_density", 1, 1, ["sp_cosmos"], 4, 2, 2.5, "ev_story", { effects: [{ stat: "eventRate", add: 0.15 }] }, "Hustota událostí", "Event Density", "Ve vesmíru se toho děje o 15 % víc za úroveň.", "15% more happens in the universe per level."),
  up(3, "sp_time", 2, 1, ["sp_cosmos"], 6, 1, 3, "clock", { effects: [{ stat: "allProd", mul: 2 }] }, "Tikot času", "Tick of Time", "Čas běží o něco rychleji, ale jen pro tebe. Veškerá produkce ×2 za úroveň.", "Time runs a little faster, but only for you. All production x2 per level."),
  up(3, "sp_luck", 3, 1, ["sp_cosmos"], 5, 2, 2.2, "star", { effects: [{ stat: "eventLuck", add: 0.1 }] }, "Cinknutá kostka", "Loaded Die", "Náhoda ti začne nadržovat. Štěstí při událostech roste.", "Chance starts playing favourites. Event luck goes up."),
  up(3, "sp_matter", 0, 2, ["sp_density"], 5, 3, 3, "coin", { effects: [{ stat: "creditGain", mul: 2 }] }, "Štědřejší hmota", "Generous Matter", "Všechno má o chlup větší cenu. Kredity ×2 za úroveň.", "Everything is worth a touch more. Credits x2 per level."),
  up(3, "sp_cheap", 1, 2, ["sp_density"], 5, 3, 2.5, "buy", { effects: [{ stat: "deckCost", mul: 0.9 }] }, "Levnější fyzika", "Cheaper Physics", "Úrovně palub jsou o 10 % levnější za úroveň.", "Deck levels cost 10% less per level."),
  up(3, "sp_mind", 2, 2, ["sp_time"], 5, 3, 2.8, "rp", { effects: [{ stat: "researchRate", mul: 2 }] }, "Rychlejší myšlenky", "Faster Thoughts", "Výzkum ×2 za úroveň.", "Research x2 per level."),
  up(3, "sp_hands", 3, 2, ["sp_luck"], 5, 3, 2.5, "craft", { effects: [{ stat: "craftSpeed", mul: 1.5 }] }, "Ochotnější atomy", "Willing Atoms", "Hmota se skládá sama od sebe. Rychlost výroby ×1,5 za úroveň.", "Matter assembles itself. Craft speed x1.5 per level."),
  up(3, "sp_stamps", 4, 2, ["sp_luck"], 5, 4, 3, "stamp", { effects: [{ stat: "stampGain", mul: 2 }] }, "Inflace razítek", "Stamp Inflation", "Razítka ×2 za úroveň. Úřad zatím nic netuší.", "Stamps x2 per level. The office has not noticed yet."),
  up(3, "sp_quality", 0, 3, ["sp_matter"], 4, 4, 2.5, "q4", { effects: [{ stat: "qualityLuck", add: 0.15 }] }, "Přesnější konstanty", "Sharper Constants", "Když sedí pí, sedí i závity. Moduly vycházejí kvalitnější.", "When pi is right, the threads fit. Modules come out better."),
  up(3, "sp_rest", 2, 3, ["sp_mind"], 3, 5, 3, "auto", { effects: [{ stat: "offlineEff", add: 0.04 }] }, "Vesmír, který počká", "A Patient Universe", "Loď toho bez tebe stihne víc. Účinnost klidového letu roste.", "The ship gets more done without you. Idle Cruise efficiency rises."),
  up(3, "sp_rivets", 4, 3, ["sp_stamps"], 5, 5, 3, "rivet", { effects: [{ stat: "rivetGain", mul: 1.5 }] }, "Nýty ze vzduchu", "Rivets from Thin Air", "Nýty ×1,5 za úroveň.", "Rivets x1.5 per level."),
  up(3, "sp_sparks", 2, 4, ["sp_rest"], 10, 8, 2, "spark", { effects: [{ stat: "sparkGain", add: 0.2 }] }, "Jiskra k jiskře", "Spark to Spark", "Každý restart vesmíru vynese o 20 % jisker víc za úroveň.", "Every reboot of the cosmos yields 20% more sparks per level."),
];

export const upgradeList: PrestigeUpgradeDef[] = [...STAMPS, ...RIVETS, ...SPARKS];
export const upgrades: Record<UpgradeId, PrestigeUpgradeDef> = byId(upgradeList);

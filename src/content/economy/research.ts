// Research tree: 7 branches, each a three-column band of the tree view (x = branch * 3 .. + 2).
// Costs are research points for level 1; later levels cost `cost * costGrowth^(level - 1)`.
// A node with `recipes` teaches them at level 1. `mt_bots` levels are the repair bot level.
import type { Effect, FeatureId, ItemId, ModuleFamily, RecipeId, ResearchDef, ResearchId } from "@/engine/types";
import { MODULE_FAMILIES } from "./items";
import { byId, ROMAN, t } from "./util";

type Branch = ResearchDef["branch"];
interface Extra {
  effects?: Effect[];
  recipes?: RecipeId[];
  feature?: FeatureId;
  items?: Record<ItemId, number>;
  icon?: string;
}

function node(
  id: ResearchId,
  branch: Branch,
  x: number,
  y: number,
  requires: ResearchId[],
  maxLevel: number,
  cost: number,
  costGrowth: number,
  cs: string,
  en: string,
  dcs: string,
  den: string,
  extra: Extra = {},
): ResearchDef {
  const { icon = `br_${branch}`, ...rest } = extra;
  return { id, branch, name: t(cs, en), desc: t(dcs, den), icon, pos: { x, y }, requires, maxLevel, cost, costGrowth, ...rest };
}

/** One-level node that teaches the next mark of a module family. */
function mark(id: ResearchId, branch: Branch, x: number, y: number, requires: ResearchId[], cost: number, family: ModuleFamily, mk: number): ResearchDef {
  const f = MODULE_FAMILIES[family];
  const name = t(`${f.name.cs} Mk ${ROMAN[mk - 1]}`, `${f.name.en} Mk ${ROMAN[mk - 1]}`);
  return {
    id,
    branch,
    name,
    desc: t(`Naučí fabrikátor vyrábět modul ${name.cs}.`, `Teaches the fabricator to build the ${name.en}.`),
    icon: `fam_${family}`,
    pos: { x, y },
    requires,
    maxLevel: 1,
    cost,
    costGrowth: 1,
    recipes: [`mod_${family}_mk${mk}`],
  };
}

const EXTRACTION: ResearchDef[] = [
  node("ex_focus", "extraction", 1, 0, [], 10, 25, 1.7, "Užší paprsek", "Tighter Beam", "Laser míří tam, kam má. Těžba +10 % za úroveň.", "The laser hits what it is aimed at. Mining +10% per level.", { effects: [{ stat: "mineRate", add: 0.1 }] }),
  node("ex_heat", "extraction", 0, 1, ["ex_focus"], 5, 120, 2, "Chladnější hlava", "Cooler Heads", "Laser se při držení zahřívá o 7 % pomaleji za úroveň.", "The laser heats up 7% slower per level while you hold.", { effects: [{ stat: "heatRate", mul: 0.93 }], icon: "heat" }),
  node("ex_chem", "extraction", 2, 1, ["ex_focus"], 1, 200, 1, "Mokrá chemie", "Wet Chemistry", "Kyselina, pryskyřice, guma, hnojivo, biogel a termit. Větrání doporučeno.", "Acid, resin, rubber, fertilizer, biogel and thermite. Ventilation advised.", { recipes: ["acid", "resin", "rubber", "fertilizer", "biogel", "thermite"], icon: "flask" }),
  node("ex_trigger", "extraction", 0, 2, ["ex_heat"], 10, 600, 1.8, "Disciplína na spoušti", "Trigger Discipline", "Ruční těžba je o 10 % silnější za úroveň.", "Hold-to-mine is 10% stronger per level.", { effects: [{ stat: "activeMult", add: 0.1 }] }),
  mark("ex_laser2", "extraction", 1, 2, ["ex_focus"], 1500, "laser", 2),
  node("ex_cryo", "extraction", 2, 2, ["ex_chem"], 1, 4000, 1, "Studená past", "Cold Trap", "Kryokapalina, iontový plyn a luminofor. Rukavice povinné.", "Cryofluid, ion gas and phosphor. Gloves mandatory.", { recipes: ["cryofluid", "ion_gas", "phosphor"], icon: "flask" }),
  node("ex_overdrive", "extraction", 0, 3, ["ex_trigger"], 5, 8000, 2.2, "Rozjetá směna", "On a Roll", "Kombo pro přetížení se plní o 15 % rychleji za úroveň.", "The Overdrive combo fills 15% faster per level.", { effects: [{ stat: "overdriveGain", add: 0.15 }], icon: "power" }),
  mark("ex_laser3", "extraction", 1, 3, ["ex_laser2"], 60000, "laser", 3),
  node("ex_exotics", "extraction", 2, 3, ["ex_cryo"], 1, 150000, 1, "Zacházení s exotikou", "Exotic Handling", "Temné sklo, ampule antihmoty a zklidněný prach. Pojišťovnu neinformovat.", "Darkglass, antimatter vials and quiet dust. Do not tell the insurer.", { recipes: ["darkglass", "am_vial", "quiet_dust"], items: { cryofluid: 20 }, icon: "flask" }),
  node("ex_veins", "extraction", 0, 4, ["ex_overdrive"], 8, 250000, 2.5, "Hlubší žíly", "Deeper Veins", "Vrtá se hlouběji. Těžba ×1,2 za úroveň.", "Dig deeper. Mining x1.2 per level.", { effects: [{ stat: "mineRate", mul: 1.2 }] }),
  mark("ex_laser4", "extraction", 1, 4, ["ex_laser3", "ex_exotics"], 4e6, "laser", 4),
  node("ex_deepcore", "extraction", 2, 4, ["ex_exotics"], 1, 2e7, 1, "Hlubinné vrtání", "Core Drilling", "Plány hlubinného vrtáku. Planety protestují jen seismicky.", "Plans for the Deep Core Drill. Planets object only seismically.", { recipes: ["deep_drill"], icon: "planet" }),
];

const LOGISTICS: ResearchDef[] = [
  node("lg_belts", "logistics", 4, 0, [], 10, 25, 1.7, "Rychlejší pásy", "Faster Belts", "Výtah zvládne o 10 % víc za úroveň.", "The lift moves 10% more per level.", { effects: [{ stat: "liftRate", add: 0.1 }] }),
  node("lg_stacking", "logistics", 3, 1, ["lg_belts"], 10, 100, 1.8, "Umění stohování", "The Art of Stacking", "Do nákladového prostoru se vejde o 10 % víc za úroveň.", "The hold fits 10% more per level.", { effects: [{ stat: "cargoCap", add: 0.1 }], icon: "cargo" }),
  node("lg_autoqueue", "logistics", 5, 1, ["lg_belts"], 1, 400, 1, "Udělej to znovu", "Make It Again", "Stanice si samy zařazují vybrané recepty, dokud je z čeho vyrábět.", "Stations re-queue the recipes you pick for as long as inputs last.", { feature: "autoQueue", icon: "auto" }),
  node("lg_broker", "logistics", 3, 2, ["lg_stacking"], 10, 900, 1.9, "Smlouvání", "Haggling", "Makléř platí o 5 % víc za úroveň. Nerad.", "The broker pays 5% more per level. Grudgingly.", { effects: [{ stat: "sellValue", add: 0.05 }], icon: "sell" }),
  mark("lg_cargo2", "logistics", 4, 2, ["lg_stacking"], 2000, "cargo", 2),
  node("lg_drones", "logistics", 5, 2, ["lg_autoqueue"], 5, 5000, 2.2, "Dronová letka", "Drone Wing", "Hangár pojme o 20 % dronů víc za úroveň. K tomu recept na olej.", "The hangar holds 20% more drones per level. Comes with an oil recipe.", { effects: [{ stat: "droneCap", add: 0.2 }], recipes: ["drone_oil"], icon: "drone" }),
  node("lg_night", "logistics", 3, 3, ["lg_broker"], 4, 20000, 4, "Noční směna", "Night Shift", "Loď vydrží pracovat bez dozoru déle: +4 hodiny za úroveň, nejvýš 24.", "The ship works unattended for longer: +4 hours per level, up to 24.", { effects: [{ stat: "offlineCap", add: 0.5 }], icon: "clock" }),
  mark("lg_cargo3", "logistics", 4, 3, ["lg_cargo2"], 80000, "cargo", 3),
  node("lg_wholesale", "logistics", 5, 3, ["lg_drones"], 5, 300000, 2.5, "Velkoobchod", "Wholesale", "Veškerý příjem kreditů +10 % za úroveň.", "All credit income +10% per level.", { effects: [{ stat: "creditGain", add: 0.1 }], icon: "coin" }),
  mark("lg_cargo4", "logistics", 4, 4, ["lg_cargo3"], 5e6, "cargo", 4),
];

const FABRICATION: ResearchDef[] = [
  node("fb_jigs", "fabrication", 7, 0, [], 10, 30, 1.7, "Přípravky", "Jigs and Fixtures", "Výroba běží o 10 % rychleji za úroveň.", "Crafting runs 10% faster per level.", { effects: [{ stat: "craftSpeed", add: 0.1 }] }),
  node("fb_batch", "fabrication", 6, 1, ["fb_jigs"], 10, 150, 1.9, "Větší várky", "Bigger Batches", "Každá várka je o 10 % větší za úroveň.", "Every batch is 10% bigger per level.", { effects: [{ stat: "craftBatch", add: 0.1 }], icon: "craft" }),
  node("fb_parts", "fabrication", 8, 1, ["fb_jigs"], 1, 500, 1, "Drobné díly", "Small Parts", "Těsnění, filtr, izolace a zářivka. Maličkosti, bez kterých nic nefunguje.", "Gasket, filter, insulation and glow tube. Little things nothing works without.", { recipes: ["gasket", "filter", "insulation", "glow_tube", "tubing_rubber"], icon: "gear" }),
  node("fb_quality", "fabrication", 6, 2, ["fb_batch"], 5, 6000, 2.5, "Kontrola kvality", "Quality Control", "Moduly častěji vyjdou v lepší kvalitě.", "Modules roll better quality more often.", { effects: [{ stat: "qualityLuck", add: 0.1 }], icon: "q3" }),
  mark("fb_reactor2", "fabrication", 7, 2, ["fb_jigs"], 2500, "reactor", 2),
  node("fb_assemblies", "fabrication", 8, 2, ["fb_parts"], 1, 3000, 1, "Sestavy", "Assemblies", "Motor, čerpadlo, senzor, procesor, servo, gyroskop a anténa.", "Motor, pump, sensor, processor, servo, gyroscope and antenna.", { recipes: ["motor", "pump", "sensor", "processor", "servo", "gyroscope", "antenna"], icon: "gear" }),
  node("fb_power", "fabrication", 6, 3, ["fb_quality"], 8, 30000, 2.2, "Lepší vedení", "Better Busbars", "Reaktor dodá o 8 % víc energie za úroveň.", "The reactor delivers 8% more power per level.", { effects: [{ stat: "powerOut", add: 0.08 }], icon: "power" }),
  mark("fb_reactor3", "fabrication", 7, 3, ["fb_reactor2", "fb_assemblies"], 90000, "reactor", 3),
  node("fb_systems", "fabrication", 8, 3, ["fb_assemblies"], 1, 40000, 1, "Podsystémy", "Subsystems", "Radiátor, emitor, kompozit, bateriový blok a další věci s vlastním manuálem.", "Radiator, emitter, composite, battery pack and other things with their own manual.", { recipes: ["lightguide", "radiator", "emitter", "composite", "battery_pack", "ion_chamber", "manipulator", "bioreactor", "processor_light"], icon: "gear" }),
  node("fb_megaprojects", "fabrication", 6, 4, ["fb_power", "fb_systems"], 1, 2.5e6, 1, "Megaprojekty", "Megaprojects", "Sběrné pole a orbitální slévárna. Dílna bude potřebovat větší dveře.", "Collector Array and Orbital Foundry. The workshop will need a bigger door.", { recipes: ["collector_array", "orbital_foundry"], icon: "station" }),
  mark("fb_reactor4", "fabrication", 7, 4, ["fb_reactor3", "fb_advanced"], 6e6, "reactor", 4),
  node("fb_advanced", "fabrication", 8, 4, ["fb_systems"], 1, 1.5e6, 1, "Pokročilá výroba", "Advanced Fabrication", "Kvantový čip, polní cívka, fúzní článek, nanotkanina a logické jádro.", "Quantum chip, field coil, fusion cell, nanoweave and logic core.", { recipes: ["quantum_chip", "field_coil", "fusion_cell", "nanoweave", "logic_core"], icon: "gear" }),
  node("fb_frames", "fabrication", 6, 5, ["fb_megaprojects"], 1, 1e7, 1, "Konstrukce trupů", "Hull Engineering", "Kostry pro všechny třídy lodí. Loděnice se prodává zvlášť.", "Frames for every hull class. Shipyard sold separately.", { recipes: ["hull_frame_hauler", "hull_frame_prospector", "hull_frame_clipper", "hull_frame_bulwark", "hull_frame_ark", "hull_frame_colossus"], icon: "hull" }),
  node("fb_exotic", "fabrication", 8, 5, ["fb_advanced"], 1, 3e7, 1, "Exotická výroba", "Exotic Fabrication", "Antihmotový článek, prázdnočočka, gravitační deska a warpová cívka.", "Antimatter cell, void lens, grav plate and warp coil.", { recipes: ["am_cell", "void_lens", "grav_plate", "warp_coil"], icon: "gear" }),
];

const MAINTENANCE: ResearchDef[] = [
  node("mt_toolkit", "maintenance", 10, 0, [], 10, 30, 1.7, "Pořádek v nářadí", "A Tidy Toolbox", "Opravy jsou o 10 % rychlejší za úroveň.", "Repairs are 10% faster per level.", { effects: [{ stat: "repairSpeed", add: 0.1 }], icon: "wrench" }),
  node("mt_grease", "maintenance", 9, 1, ["mt_toolkit"], 8, 150, 1.9, "Mazací plán", "Grease Schedule", "Moduly se opotřebovávají o 5 % pomaleji za úroveň.", "Modules wear 5% slower per level.", { effects: [{ stat: "wearRate", mul: 0.95 }], icon: "integrity" }),
  node("mt_supplies", "maintenance", 11, 1, ["mt_toolkit"], 1, 400, 1, "Dílenské zásoby", "Shop Supplies", "Svařovací drát a trupová pěna. Páska už na všechno nestačí.", "Welding rod and hull foam. Tape no longer covers everything.", { recipes: ["weld_rod", "hull_foam"], icon: "tape" }),
  node("mt_hull", "maintenance", 9, 2, ["mt_grease"], 10, 1200, 1.9, "Vyztužené přepážky", "Braced Bulkheads", "Trup vydrží o 10 % víc za úroveň.", "The hull takes 10% more per level.", { effects: [{ stat: "hullMax", add: 0.1 }], icon: "hull" }),
  node("mt_bots", "maintenance", 10, 2, ["mt_toolkit"], 5, 2500, 4, "Opravářští boti", "Repair Bots", "Boti opravují moduly podle seznamu priorit. Každá úroveň je zrychlí.", "Bots repair modules from the priority list. Each level makes them faster.", { feature: "repairBots", items: { actuator: 6, circuit: 6 }, icon: "bot" }),
  mark("mt_shield2", "maintenance", 11, 2, ["mt_supplies"], 3000, "shield", 2),
  node("mt_tow", "maintenance", 9, 3, ["mt_hull"], 5, 10000, 2.2, "Známí u odtahovky", "Friends at the Tow Yard", "Odtah dorazí o 10 % dřív za úroveň.", "The tow arrives 10% sooner per level.", { effects: [{ stat: "towSpeed", mul: 0.9 }], icon: "tow" }),
  mark("mt_repair2", "maintenance", 10, 3, ["mt_bots"], 8000, "repair", 2),
  mark("mt_shield3", "maintenance", 11, 3, ["mt_shield2"], 100000, "shield", 3),
  node("mt_armor", "maintenance", 9, 4, ["mt_tow"], 5, 400000, 2.5, "Vrstvený pancíř", "Layered Armour", "Události poškozují loď o 5 % méně za úroveň.", "Events deal 5% less damage per level.", { effects: [{ stat: "shield", mul: 0.95 }], icon: "fam_shield" }),
  mark("mt_repair3", "maintenance", 10, 4, ["mt_repair2"], 120000, "repair", 3),
  node("mt_nanogel", "maintenance", 11, 4, ["mt_supplies", "mt_repair2"], 1, 200000, 1, "Medicína pro stroje", "Medicine for Machines", "Nanogel: plná oprava jedním zmáčknutím tuby.", "Nano-gel: a full repair in one squeeze of the tube.", { recipes: ["nano_gel"], icon: "repair" }),
  node("mt_auto", "maintenance", 10, 5, ["mt_repair3", "mt_nanogel"], 1, 2e6, 1, "Samostatná údržba", "Autonomous Maintenance", "KIPP si sám plánuje opravy a vyrábí na ně materiál. Fakturuje ti to slovně.", "KIPP schedules repairs and crafts supplies on its own. It invoices you verbally.", { feature: "autoMaintenance", items: { processor: 10, manipulator: 4 }, icon: "kipp" }),
];

const NAVIGATION: ResearchDef[] = [
  node("nv_charts", "navigation", 13, 0, [], 8, 40, 1.8, "Hvězdné mapy", "Star Charts", "Hyperpohon se nabíjí o 10 % rychleji za úroveň.", "The hyperdrive charges 10% faster per level.", { effects: [{ stat: "jumpCharge", add: 0.1 }], icon: "jump" }),
  node("nv_fuel", "navigation", 12, 1, ["nv_charts"], 6, 200, 2, "Úsporná jízda", "Hypermiling", "Skok spotřebuje o 5 % méně paliva za úroveň. K tomu recept na skokový startér.", "A jump burns 5% less fuel per level. Comes with the Jump Primer recipe.", { effects: [{ stat: "fuelUse", mul: 0.95 }], recipes: ["jump_primer"], icon: "fuel" }),
  node("nv_probes", "navigation", 14, 1, ["nv_charts"], 1, 600, 1, "Těžební sondy", "Mining Probes", "Drony umí těžit vzácnou surovinu přímo z planety.", "Drones can mine a planet's special resource directly.", { feature: "probes", recipes: ["probe_kit"], icon: "drone" }),
  node("nv_cooldown", "navigation", 12, 2, ["nv_fuel"], 5, 1500, 2.2, "Rychlé chlazení", "Quick Cooldown", "Pohon po skoku vychladne o 8 % dřív za úroveň.", "The drive cools down 8% sooner per level after a jump.", { effects: [{ stat: "jumpCooldown", mul: 0.92 }], icon: "clock" }),
  mark("nv_engine2", "navigation", 13, 2, ["nv_charts"], 2500, "engine", 2),
  node("nv_expeditions", "navigation", 14, 2, ["nv_probes"], 1, 5000, 1, "Výsadky", "Away Teams", "Posádka může na povrch. Vrací se s nákladem, historkami a pískem v botách.", "The crew can go planetside. They return with loot, stories and sand in their boots.", { feature: "expeditions", icon: "planet" }),
  node("nv_probe_yield", "navigation", 12, 3, ["nv_cooldown", "nv_probes"], 8, 12000, 2, "Ostřejší vrtáky", "Sharper Bits", "Sondy vytěží o 15 % víc za úroveň.", "Probes bring back 15% more per level.", { effects: [{ stat: "probeYield", add: 0.15 }], icon: "drone" }),
  mark("nv_engine3", "navigation", 13, 3, ["nv_engine2"], 90000, "engine", 3),
  node("nv_outposts", "navigation", 14, 3, ["nv_expeditions"], 1, 60000, 1, "Základny", "Outposts", "Postav na planetě základnu. Vynáší až do konce galaxie.", "Build an outpost on a planet. It pays out until the end of the galaxy.", { feature: "outposts", recipes: ["outpost_kit"], icon: "station" }),
  mark("nv_engine4", "navigation", 13, 4, ["nv_engine3"], 5e6, "engine", 4),
  node("nv_outpost_yield", "navigation", 14, 4, ["nv_outposts"], 8, 150000, 2, "Samostatné základny", "Self-Run Outposts", "Základny vynášejí o 15 % víc za úroveň.", "Outposts yield 15% more per level.", { effects: [{ stat: "outpostYield", add: 0.15 }], icon: "station" }),
  node("nv_gate", "navigation", 13, 5, ["nv_engine4", "nv_outposts"], 1, 8e7, 1, "Teorie zkratek", "Shortcut Theory", "Plány červí brány. Proč letět k jádru, když může jádro přijít za tebou.", "Plans for the Wormhole Gate. Why fly to the core when the core can come to you.", { recipes: ["wormhole_gate"], icon: "anomaly" }),
];

const SCIENCE: ResearchDef[] = [
  node("sc_method", "science", 16, 0, [], 10, 40, 1.8, "Vědecká metoda", "Scientific Method", "Laboratoř bádá o 10 % rychleji za úroveň.", "The lab researches 10% faster per level.", { effects: [{ stat: "researchRate", add: 0.1 }], icon: "rp" }),
  node("sc_scan", "science", 15, 1, ["sc_method"], 8, 250, 1.9, "Lepší ostření", "Sharper Focus", "Skenování je o 15 % rychlejší za úroveň.", "Scanning is 15% faster per level.", { effects: [{ stat: "scanSpeed", add: 0.15 }], icon: "scan" }),
  node("sc_salvage", "science", 17, 1, ["sc_method"], 8, 300, 1.9, "Čich na trosky", "A Nose for Wreckage", "Trosky se objevují o 10 % častěji za úroveň.", "Salvage shows up 10% more often per level.", { effects: [{ stat: "salvageRate", add: 0.1 }], icon: "belt" }),
  node("sc_fieldkit", "science", 15, 2, ["sc_scan"], 1, 4000, 1, "Polní sada", "Field Kit", "Světlice, svačina pro mozek, magnet na trosky a datové jádro.", "Flare, brain snack, salvage magnet and data core.", { recipes: ["flare", "brain_snack", "salvage_magnet", "data_core"], icon: "flask" }),
  mark("sc_scanner2", "science", 16, 2, ["sc_scan"], 3000, "scanner", 2),
  node("sc_appraisal", "science", 17, 2, ["sc_salvage"], 8, 2000, 2, "Odhad ceny", "Appraisal", "Trosky vynesou o 12 % víc za úroveň.", "Salvage is worth 12% more per level.", { effects: [{ stat: "salvageValue", add: 0.12 }], icon: "coin" }),
  node("sc_autopilot", "science", 15, 3, ["sc_fieldkit"], 5, 25000, 3, "Slušně vychovaný autopilot", "A Well-Mannered Autopilot", "Loď pracuje o něco líp, když se nedíváš. Účinnost klidového letu roste.", "The ship works a little better when you are not looking. Idle Cruise efficiency goes up.", { effects: [{ stat: "offlineEff", add: 0.046 }], icon: "auto" }),
  mark("sc_scanner3", "science", 16, 3, ["sc_scanner2"], 100000, "scanner", 3),
  node("sc_luck", "science", 17, 3, ["sc_appraisal"], 6, 15000, 2.4, "Statistika a štěstí", "Statistics and Luck", "Události dopadají o něco častěji dobře.", "Events turn out well a little more often.", { effects: [{ stat: "eventLuck", add: 0.05 }], icon: "star" }),
  node("sc_bigscience", "science", 16, 4, ["sc_scanner3", "sc_autopilot"], 1, 3e6, 1, "Velká věda", "Big Science", "Plány archivního trezoru. Stojí to hodně datových jader a trpělivosti.", "Plans for the Archive Vault. Costs many data cores and much patience.", { recipes: ["archive_vault"], items: { data_core: 10 }, icon: "book" }),
  node("sc_insight", "science", 17, 4, ["sc_luck"], 5, 500000, 3, "Průlom", "Breakthrough", "Bádání ×1,25 za úroveň. Tabule už nestačí, píše se po stěnách.", "Research x1.25 per level. The whiteboard is full; the walls are next.", { effects: [{ stat: "researchRate", mul: 1.25 }], icon: "rp" }),
];

const CREW: ResearchDef[] = [
  node("cr_bunks", "crew", 19, 0, [], 8, 50, 1.8, "Lepší matrace", "Better Mattresses", "Morálka se obnovuje o 10 % rychleji za úroveň.", "Morale recovers 10% faster per level.", { effects: [{ stat: "moraleGain", add: 0.1 }], icon: "morale" }),
  node("cr_coffee", "crew", 18, 1, ["cr_bunks"], 5, 300, 2, "Kávová věda", "Coffee Science", "Posádka vypije o 8 % méně kávy za úroveň. K tomu recept na espresso.", "The crew drinks 8% less coffee per level. Comes with the espresso recipe.", { effects: [{ stat: "coffeeUse", mul: 0.92 }], recipes: ["espresso"], icon: "coffee" }),
  node("cr_training", "crew", 20, 1, ["cr_bunks"], 8, 400, 1.9, "Zaškolení", "Onboarding", "Posádka sbírá zkušenosti o 15 % rychleji za úroveň.", "The crew gains experience 15% faster per level.", { effects: [{ stat: "xpGain", add: 0.15 }], icon: "book" }),
  node("cr_galley", "crew", 18, 2, ["cr_coffee"], 1, 2500, 1, "Lodní kuchyně", "Ship's Galley", "Jídlo jako od mámy a šťastná ponožka. Spolu to nesouvisí.", "Comfort food and the lucky sock. The two are unrelated.", { recipes: ["comfort_food", "lucky_sock"], icon: "heart" }),
  mark("cr_life2", "crew", 19, 2, ["cr_bunks"], 3000, "life", 2),
  node("cr_pack", "crew", 20, 2, ["cr_training"], 8, 6000, 2, "Sbaleno za pět minut", "Packed in Five", "Výsadky jsou o 10 % rychlejší za úroveň.", "Expeditions are 10% faster per level.", { effects: [{ stat: "expeditionSpeed", add: 0.1 }], icon: "clock" }),
  node("cr_cabins", "crew", 18, 3, ["cr_galley"], 5, 30000, 3, "Palandy nad sebou", "Bunk Stacking", "Kajuty pojmou o 20 % posádky víc za úroveň.", "Quarters hold 20% more crew per level.", { effects: [{ stat: "crewCap", add: 0.2 }], icon: "crew" }),
  mark("cr_life3", "crew", 19, 3, ["cr_life2"], 110000, "life", 3),
  node("cr_loot", "crew", 20, 3, ["cr_pack"], 8, 40000, 2.1, "Větší batohy", "Bigger Backpacks", "Výsadky přinesou o 10 % víc za úroveň.", "Expeditions bring back 10% more per level.", { effects: [{ stat: "expeditionLoot", add: 0.1 }], icon: "cargo" }),
  node("cr_rep", "crew", 18, 4, ["cr_cabins"], 5, 200000, 2.5, "Dobré jméno", "Good Standing", "Reputace u frakcí roste o 10 % rychleji za úroveň.", "Faction reputation grows 10% faster per level.", { effects: [{ stat: "repGain", add: 0.1 }], icon: "trophy" }),
];

export const researchList: ResearchDef[] = [...EXTRACTION, ...LOGISTICS, ...FABRICATION, ...MAINTENANCE, ...NAVIGATION, ...SCIENCE, ...CREW];
export const research: Record<ResearchId, ResearchDef> = byId(researchList);

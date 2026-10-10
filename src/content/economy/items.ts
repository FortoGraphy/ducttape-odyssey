// Items: T0 raw -> T1 refined -> T2 components -> T3 modules -> T4 megastructures, plus consumables,
// artifacts and specials. Values follow the recipes in recipes.ts: a crafted item is worth about
// 2.2x its inputs when every input is from a lower tier and 1.6x when it is built from its own tier
// (consumables and specials 1.6x), rounded to two significant digits.
import type { ConsumableSpec, Effect, ItemCategory, ItemDef, ItemId, L10n, ModuleFamily, ModuleSpec } from "@/engine/types";
import { byId, ROMAN, t } from "./util";

function item(
  id: string,
  tier: ItemDef["tier"],
  category: ItemCategory,
  value: number,
  name: L10n,
  desc: L10n,
  extra: Partial<ItemDef> = {},
): ItemDef {
  return { id, tier, category, name, desc, value, icon: id, ...extra };
}

const raw = (id: string, value: number, rarity: string, cs: string, en: string, dcs: string, den: string): ItemDef =>
  item(id, 0, "raw", value, t(cs, en), t(dcs, den), { tags: [rarity] });
const ref = (id: string, value: number, cs: string, en: string, dcs: string, den: string): ItemDef =>
  item(id, 1, "refined", value, t(cs, en), t(dcs, den));
const comp = (id: string, value: number, cs: string, en: string, dcs: string, den: string): ItemDef =>
  item(id, 2, "component", value, t(cs, en), t(dcs, den));
const mega = (id: string, value: number, cs: string, en: string, dcs: string, den: string, tags?: string[]): ItemDef =>
  item(id, 4, "mega", value, t(cs, en), t(dcs, den), { mass: 0, tags });
const cons = (
  id: string,
  tier: ItemDef["tier"],
  value: number,
  consumable: ConsumableSpec,
  cs: string,
  en: string,
  dcs: string,
  den: string,
  tags?: string[],
): ItemDef => item(id, tier, "consumable", value, t(cs, en), t(dcs, den), { consumable, tags });
const art = (id: string, tier: ItemDef["tier"], value: number, cs: string, en: string, dcs: string, den: string): ItemDef =>
  item(id, tier, "artifact", value, t(cs, en), t(dcs, den), { mass: 0 });
const spec = (id: string, tier: ItemDef["tier"], value: number, cs: string, en: string, dcs: string, den: string): ItemDef =>
  item(id, tier, "special", value, t(cs, en), t(dcs, den), { mass: 0 });

// ---------- T0 raw (16) ---------------------------------------------------------------
// The rarity tag steers the galaxy generator: "common" shows up from depth 0, "exotic" only deep.

const RAW: ItemDef[] = [
  raw("scrap", 1, "common", "Šrot", "Scrap", "Kdysi to byla něčí loď. Teď je to tvoje surovina.", "It used to be someone's ship. Now it is your raw material."),
  raw("ice", 1, "common", "Led", "Ice", "Špinavý kometární led. K pití se nehodí. Zatím.", "Dirty comet ice. Not for drinking. Yet."),
  raw("silicates", 1.2, "common", "Silikáty", "Silicates", "Kamení. Vesmír ho má na skladě opravdu hodně.", "Rocks. The universe keeps a generous stock."),
  raw("carbon", 1.5, "common", "Uhlík", "Carbon", "Základ života a sazí. Tady venku hlavně těch sazí.", "The basis of life and soot. Out here, mostly soot."),
  raw("hydrogen", 1.4, "common", "Vodík", "Hydrogen", "Nejběžnější prvek ve vesmíru, a přesto za něj někdo platí.", "The most common element in the universe, and people still pay for it."),
  raw("ferrite", 2, "common", "Ferit", "Ferrite", "Poctivá železná ruda. Rezaví už při pohledu.", "Honest iron ore. Rusts if you look at it."),
  raw("brine", 1.6, "common", "Solanka", "Brine", "Slaná voda s vlastním názorem. Rozežere všechno, co jí svěříš.", "Salt water with opinions. Eats through whatever you store it in."),
  raw("sulfur", 2.2, "uncommon", "Síra", "Sulfur", "Smrdí i ve vakuu. Technicky nemožné, prakticky ano.", "Smells even in a vacuum. Technically impossible, practically true."),
  raw("organics", 3, "uncommon", "Organika", "Organics", "Něco, co bylo živé, nebo teprve bude. Raději nezkoumat.", "Something that was alive, or will be. Best not to check."),
  raw("conductite", 4, "uncommon", "Konduktit", "Conductite", "Načervenalá ruda, která vede proud i řeči o tom, kolik stojí.", "A reddish ore that conducts electricity and small talk about its price."),
  raw("helium3", 6, "uncommon", "Helium-3", "Helium-3", "Lehké, vzácné a neustále se snaží utéct.", "Light, rare and constantly trying to leave."),
  raw("lumite", 8, "rare", "Lumit", "Lumite", "Krystaly, které svítí samy od sebe. Nikdo neví proč a nikdo se neptá.", "Crystals that glow on their own. Nobody knows why and nobody asks."),
  raw("xenon", 10, "rare", "Xenon", "Xenon", "Vzácný plyn. Chová se vznešeně a s nikým nereaguje.", "A noble gas. Acts noble, reacts with no one."),
  raw("voidglass", 16, "rare", "Prázdnosklo", "Voidglass", "Černé sklo z míst, kde se velmi dlouho nic nedělo.", "Black glass from places where nothing happened for a very long time."),
  raw("strange_dust", 30, "exotic", "Podivný prach", "Strange Dust", "Váha u něj pokaždé ukáže něco jiného. Váha za to nemůže.", "The scale shows a different number every time. It is not the scale's fault."),
  raw("antimatter", 60, "exotic", "Antihmota", "Antimatter", "Stopové množství. Nesahat, nečichat, nepouštět na zem.", "Trace amounts. Do not touch, sniff or drop."),
];

// ---------- T1 refined (28) -----------------------------------------------------------

const REFINED: ItemDef[] = [
  ref("alloy", 6.6, "Slitina", "Alloy", "Šrot, který dostal druhou šanci a tentokrát drží tvar.", "Scrap with a second chance and, this time, a shape."),
  ref("water", 4.4, "Voda", "Water", "Přefiltrovaný led. Chutná po kometě, ale je mokrá.", "Filtered ice. Tastes of comet, but it is wet."),
  ref("glass", 7.9, "Sklo", "Glass", "Roztavené kamení, přes které je vidět. Většinou.", "Melted rock you can see through. Mostly."),
  ref("fuel", 9.5, "Palivo", "Fuel", "Hoří ochotně a na nic se neptá. Skladovat dál od svářečky.", "Burns eagerly, no questions asked. Store away from the welder."),
  ref("polymer", 9.7, "Polymer", "Polymer", "Plast. Přežije tebe, loď i tuhle galaxii.", "Plastic. Will outlive you, the ship and this galaxy."),
  ref("slag", 1.6, "Struska", "Slag", "To, co zbylo. Makléř ji kupodivu vykupuje jako štěrk.", "What was left over. The broker, oddly, buys it as gravel."),
  ref("oxygen", 14, "Kyslík", "Oxygen", "Dýchatelný luxus. KIPP ho vede v kolonce zbytných výdajů.", "A breathable luxury. KIPP files it under optional expenses."),
  ref("wire", 9.9, "Drát", "Wire", "Vede proud z bodu A do bodu B, pokud se cestou nezamotá.", "Carries current from A to B, unless it tangles on the way."),
  ref("ceramic", 9, "Keramika", "Ceramic", "Vydrží žár motoru. Pád na podlahu už ne.", "Survives engine heat. Does not survive the floor."),
  ref("coolant", 7.7, "Chladivo", "Coolant", "Modrá kapalina, která drží teplotu pod úrovní paniky.", "A blue liquid that keeps temperatures below panic."),
  ref("steel", 17, "Ocel", "Steel", "Ferit s trochou uhlíku a velkým sebevědomím.", "Ferrite with a little carbon and a lot of confidence."),
  ref("graphite", 13, "Grafit", "Graphite", "Maže, vede a špiní. Hlavně špiní.", "Lubricates, conducts and stains. Mostly stains."),
  ref("silicon", 14, "Křemík", "Silicon", "Vyčištěný písek, který se naučil počítat.", "Purified sand that learned to count."),
  ref("solder", 13, "Pájka", "Solder", "Kov, který se roztaví přesně ve chvíli, kdy držíš něco jiného.", "Metal that melts the exact moment you are holding something else."),
  ref("fiber", 23, "Uhlíkové vlákno", "Carbon Fiber", "Lehké, pevné a zaručeně se zadře pod nehet.", "Light, strong and guaranteed to end up under a fingernail."),
  ref("salt", 11, "Sůl", "Salt", "Zbytek po solance. Do elektrolytu i do polévky.", "What brine leaves behind. Good for electrolytes and soup."),
  ref("acid", 14, "Kyselina", "Acid", "Rozpustí rudu, rez i důvěru v těsnění.", "Dissolves ore, rust and your trust in gaskets."),
  ref("resin", 18, "Pryskyřice", "Resin", "Lepkavá hmota. Co jednou spojí, to už nikdo nerozdělí.", "Sticky stuff. What it joins stays joined."),
  ref("rubber", 16, "Guma", "Rubber", "Pruží, těsní a trochu voní po síře. Tedy smrdí.", "Bounces, seals and smells faintly of sulfur. Strongly, actually."),
  ref("fertilizer", 17, "Hnojivo", "Fertilizer", "Skleník ho miluje. Zbytek posádky si drží odstup.", "The greenhouse loves it. The rest of the crew keeps a distance."),
  ref("biogel", 21, "Biogel", "Biogel", "Živný sliz. Léčí, lepí a občas se pohne.", "Nutrient slime. Heals, sticks, occasionally moves."),
  ref("thermite", 16, "Termit", "Thermite", "Hoří tak jasně, že si toho všimnou i v sousední soustavě.", "Burns bright enough for the neighbouring system to notice."),
  ref("cryofluid", 29, "Kryokapalina", "Cryofluid", "Tak studená, že i teploměr přestává spolupracovat.", "So cold the thermometer stops cooperating."),
  ref("ion_gas", 47, "Iontový plyn", "Ion Gas", "Nabitý xenon v lahvi. Lahev z toho radost nemá.", "Charged xenon in a bottle. The bottle is not thrilled."),
  ref("phosphor", 38, "Luminofor", "Phosphor", "Namletý lumit. Svítí i po vypnutí, což je lehce znepokojivé.", "Ground lumite. Keeps glowing when switched off, which is mildly unsettling."),
  ref("darkglass", 64, "Temné sklo", "Darkglass", "Sklo, které světlo spíš přemlouvá, než propouští.", "Glass that negotiates with light instead of letting it through."),
  ref("am_vial", 210, "Ampule antihmoty", "Antimatter Vial", "Antihmota v magnetické pasti. Netřepat. Vážně.", "Antimatter in a magnetic trap. Do not shake. Seriously."),
  ref("quiet_dust", 140, "Zklidněný prach", "Quiet Dust", "Podivný prach po důrazné domluvě. Váha už ukazuje skoro pořád totéž.", "Strange dust after a stern talking-to. The scale now mostly agrees with itself."),
];

// ---------- T2 components (42) --------------------------------------------------------
// Three layers: basic parts from refined goods, assemblies from parts, advanced parts from
// assemblies and exotic materials. Module marks climb the same ladder.

const COMPONENTS: ItemDef[] = [
  comp("circuit", 82, "Obvod", "Circuit", "Malá destička, na které závisí všechno ostatní.", "A small board that everything else depends on."),
  comp("actuator", 72, "Aktuátor", "Actuator", "Hýbe věcmi, aby ses nemusel hýbat ty.", "Moves things so you do not have to."),
  comp("plating", 63, "Pancéřový plát", "Plating", "Patří mezi tebe a vakuum. Čím víc, tím líp.", "It goes between you and the vacuum. More is better."),
  comp("lens", 69, "Čočka", "Lens", "Soustředí světlo do jednoho bodu. Nedívat se z druhé strany.", "Focuses light into one point. Do not look from the other side."),
  comp("power_cell", 78, "Energočlánek", "Power Cell", "Přenosná energie. Vybije se vždy těsně před koncem práce.", "Portable power. Runs out just before the job is done."),
  comp("tubing", 57, "Potrubí", "Tubing", "Vede kapaliny tam, kam mají téct, a občas i jinam.", "Takes fluids where they should go and, now and then, elsewhere."),
  comp("bearing", 100, "Ložisko", "Bearing", "Díky němu se věci točí potichu. Bez něj nahlas a krátce.", "Lets things spin quietly. Without it they spin loudly and briefly."),
  comp("girder", 130, "Nosník", "Girder", "Ocelová páteř všeho, co nemá spadnout.", "The steel spine of anything that should stay up."),
  comp("heatsink", 86, "Chladič", "Heatsink", "Žebrovaný kus kovu, který snáší horko za tebe.", "A finned lump of metal that suffers the heat for you."),
  comp("coil", 100, "Cívka", "Coil", "Namotaný drát s magnetickými ambicemi.", "Wound wire with magnetic ambitions."),
  comp("valve", 110, "Ventil", "Valve", "Otevřeno, nebo zavřeno. Třetí poloze se říká porucha.", "Open or closed. The third position is called a fault."),
  comp("canister", 120, "Tlaková nádoba", "Canister", "Udrží tlak, plyn i tajemství. Ventil se prodává zvlášť.", "Holds pressure, gas and secrets. Valve sold separately."),
  comp("nozzle", 110, "Tryska", "Nozzle", "Kam míří ona, tam ty neletíš.", "Whichever way it points, you go the other."),
  comp("capacitor", 66, "Kondenzátor", "Capacitor", "Chvíli energii drží a pak ji vrátí celou najednou.", "Holds a charge for a moment, then gives it all back at once."),
  comp("gasket", 46, "Těsnění", "Gasket", "Gumový kroužek, na kterém stojí civilizace.", "A rubber ring that civilization quietly depends on."),
  comp("filter", 120, "Filtr", "Filter", "Zachytí vše, co v systému nemá co dělat. Mění se zásadně pozdě.", "Catches everything that should not be in the system. Always replaced too late."),
  comp("insulation", 110, "Izolace", "Insulation", "Drží teplo uvnitř a chlad venku. Nebo naopak, podle toho, kdo ji montoval.", "Keeps heat in and cold out. Or the reverse, depending on who installed it."),
  comp("glow_tube", 120, "Zářivka", "Glow Tube", "Svítí a bzučí. To bzučení je zdarma.", "Glows and hums. The hum is free of charge."),
  comp("lightguide", 98, "Světlovod", "Lightguide", "Vlákno, kterým data běží rychlostí světla, dokud ho někdo nezalomí.", "A strand that moves data at light speed until someone bends it."),
  comp("motor", 440, "Motor", "Motor", "Točí se. Víc se od motoru nečeká.", "It spins. Nobody asks more of a motor."),
  comp("pump", 960, "Čerpadlo", "Pump", "Tlačí kapalinu do kopce a nestěžuje si. Jen hučí.", "Pushes fluid uphill without complaint. It just drones."),
  comp("sensor", 300, "Senzor", "Sensor", "Ví o problému dřív než ty. Řekne ti to až potom.", "Knows about the problem before you do. Tells you after."),
  comp("processor", 330, "Procesor", "Processor", "Počítá rychleji než KIPP, což KIPP přiznává nerad.", "Counts faster than KIPP, which KIPP admits reluctantly."),
  comp("servo", 520, "Servo", "Servo", "Aktuátor, který poslouchá na desetinu stupně.", "An actuator that obeys to a tenth of a degree."),
  comp("gyroscope", 610, "Gyroskop", "Gyroscope", "Ví, kde je nahoře, i když žádné nahoře není.", "Knows which way is up, even when there is no up."),
  comp("antenna", 370, "Anténa", "Antenna", "Chytá signály, šum a občas reklamu na pojištění trupu.", "Picks up signals, static and the occasional hull insurance advert."),
  comp("radiator", 410, "Radiátor", "Radiator", "Vyzařuje teplo do vesmíru. Vesmír to zatím zvládá.", "Radiates heat into space. Space is coping so far."),
  comp("emitter", 340, "Emitor", "Emitter", "Vysílá paprsek. Kam dopadne, to už je starost někoho jiného.", "Emits a beam. Where it lands is someone else's concern."),
  comp("composite", 450, "Kompozit", "Composite", "Vrstvy plátů, vláken a naděje slisované dohromady.", "Layers of plating, fiber and hope pressed together."),
  comp("battery_pack", 660, "Bateriový blok", "Battery Pack", "Spousta článků v jedné krabici. Těžká, teplá a spolehlivá.", "Many cells in one box. Heavy, warm and dependable."),
  comp("ion_chamber", 500, "Iontová komora", "Ion Chamber", "Uvnitř se děje fyzika. Víko nechat zavřené.", "Physics is happening inside. Keep the lid on."),
  comp("manipulator", 2800, "Manipulátor", "Manipulator", "Robotická paže s jemnou motorikou a hrubým chybovým výpisem.", "A robot arm with fine motor skills and a coarse error log."),
  comp("bioreactor", 2000, "Bioreaktor", "Bioreactor", "Pěstuje užitečné kultury. Občas i ty ostatní.", "Grows useful cultures. Sometimes the other kind too."),
  comp("quantum_chip", 1400, "Kvantový čip", "Quantum Chip", "Spočítá všechny možnosti naráz a vybere tu nejdražší.", "Computes every option at once and picks the most expensive."),
  comp("field_coil", 890, "Polní cívka", "Field Coil", "Ohýbá magnetické pole i příbory v okruhu tří metrů.", "Bends magnetic fields and any cutlery within three metres."),
  comp("fusion_cell", 1900, "Fúzní článek", "Fusion Cell", "Malé slunce v plechovce. Záruka se na něj nevztahuje.", "A small sun in a can. Not covered by warranty."),
  comp("nanoweave", 540, "Nanotkanina", "Nanoweave", "Látka pevnější než ocel. Žehlit se nedá.", "Fabric stronger than steel. Cannot be ironed."),
  comp("logic_core", 3600, "Logické jádro", "Logic Core", "Rozhoduje se samo. KIPP na něj trochu žárlí.", "Makes its own decisions. KIPP is a little jealous."),
  comp("am_cell", 2300, "Antihmotový článek", "Antimatter Cell", "Tolik energie, že se o ní mluví jen šeptem.", "So much energy that people discuss it in whispers."),
  comp("void_lens", 970, "Prázdnočočka", "Void Lens", "Zaostří i na to, co tam není.", "Brings into focus even what is not there."),
  comp("grav_plate", 3100, "Gravitační deska", "Grav Plate", "Určuje, kde je dole. Nemontovat vzhůru nohama.", "Decides where down is. Do not install upside down."),
  comp("warp_coil", 6700, "Warpová cívka", "Warp Coil", "Zkracuje vzdálenosti. Vysvětlení trvá déle než cesta.", "Shortens distances. Explaining how takes longer than the trip."),
];

// ---------- T3 modules (8 families x 5 marks + specials) ------------------------------
// Effects are the Standard-quality, level-0 values. `add` effects scale linearly with quality,
// level and integrity; `mul` effects are reductions (or penalties) and are meant to be scaled as
// mul^k so they can never reach zero.

/** Main stats grow x1.8 per mark. */
const grow = (base: number, mk: number): number => Math.round(base * 1.8 ** (mk - 1) * 100) / 100;
const per = (values: number[], mk: number): number => values[mk - 1];
const DRAW_STEP = [1, 1.6, 2.5, 4, 6];

interface FamilySpec {
  name: L10n;
  desc: L10n;
  wear: number; // % per active hour at mk1, +0.25 per mark, never above 7
  draw: number; // reactor units at mk1 (negative supplies power)
  effects: (mk: number) => Effect[];
}

export const MODULE_FAMILIES: Record<ModuleFamily, FamilySpec> = {
  laser: {
    name: t("Těžební laser", "Mining Laser"),
    desc: t("Krájí asteroidy na úhledné kousky.", "Slices asteroids into tidy pieces."),
    wear: 6,
    draw: 6,
    effects: (mk) => (mk < 3 ? [{ stat: "mineRate", add: grow(0.25, mk) }] : [{ stat: "mineRate", add: grow(0.25, mk) }, { stat: "activeMult", add: grow(0.05, mk - 2) }]),
  },
  engine: {
    name: t("Pohon", "Drive"),
    desc: t("Nabíjí hyperpohon rychleji a nechává v nádrži víc paliva.", "Charges the hyperdrive faster and leaves more fuel in the tank."),
    wear: 5,
    draw: 5,
    effects: (mk) => [{ stat: "jumpCharge", add: grow(0.2, mk) }, { stat: "fuelUse", mul: per([0.95, 0.91, 0.86, 0.8, 0.72], mk) }],
  },
  shield: {
    name: t("Štít", "Shield"),
    desc: t("Staví se mezi trup a všechno, co do něj chce narazit.", "Stands between the hull and everything that wants to hit it."),
    wear: 4,
    draw: 8,
    effects: (mk) => [{ stat: "shield", mul: per([0.92, 0.86, 0.78, 0.69, 0.58], mk) }, { stat: "hullMax", add: grow(0.15, mk) }],
  },
  scanner: {
    name: t("Skener", "Scanner"),
    desc: t("Najde vrak, planetu i ponožku pod podlahovým plechem.", "Finds wrecks, planets and the sock under the deck plate."),
    wear: 3,
    draw: 4,
    effects: (mk) => [{ stat: "scanSpeed", add: grow(0.3, mk) }, { stat: "salvageRate", add: grow(0.15, mk) }],
  },
  reactor: {
    name: t("Pomocný reaktor", "Auxiliary Reactor"),
    desc: t("Vyrábí proud navíc. Hučení je součástí dodávky.", "Makes extra power. The hum is included."),
    wear: 5,
    draw: -20,
    effects: (mk) => [{ stat: "powerOut", add: grow(0.05, mk) }],
  },
  cargo: {
    name: t("Nákladový modul", "Cargo Module"),
    desc: t("Víc místa a svižnější výtah. Nepořádek zůstává tvůj.", "More room and a faster lift. The mess remains yours."),
    wear: 3,
    draw: 3,
    effects: (mk) => [{ stat: "cargoCap", add: grow(0.3, mk) }, { stat: "liftRate", add: grow(0.15, mk) }],
  },
  repair: {
    name: t("Opravárenský modul", "Repair Module"),
    desc: t("Dotahuje, maže a dohlíží, aby se věci rozpadaly pomaleji.", "Tightens, oils and makes sure things fall apart more slowly."),
    wear: 4,
    draw: 5,
    effects: (mk) => [{ stat: "repairSpeed", add: grow(0.3, mk) }, { stat: "wearRate", mul: per([0.95, 0.91, 0.86, 0.8, 0.73], mk) }],
  },
  life: {
    name: t("Podpora života", "Life Support"),
    desc: t("Vzduch, teplo a dojem, že se o posádku někdo stará.", "Air, warmth and the impression that somebody cares about the crew."),
    wear: 3.5,
    draw: 4,
    effects: (mk) => [
      { stat: "moraleGain", add: grow(0.2, mk) },
      { stat: "crewCap", add: per([0.1, 0.15, 0.25, 0.35, 0.5], mk) },
      { stat: "expeditionSpeed", add: grow(0.1, mk) },
    ],
  },
};

const MK_FLAVOR: L10n[] = [
  t("První verze. Drží hlavně silou vůle.", "First version. Held together mostly by willpower."),
  t("Druhá verze. Tentokrát podle výkresu.", "Second version. Built from a drawing this time."),
  t("Třetí verze. Dokonce prošla zkouškou.", "Third version. It even passed a test."),
  t("Čtvrtá verze. Původní výrobce by ji poznal jen stěží.", "Fourth version. The original maker would barely recognise it."),
  t("Pátá verze. Lepší už to nebude, a kupodivu to stačí.", "Fifth version. It will not get better than this, and somehow that is enough."),
];

const MODULE_VALUES: Record<ModuleFamily, number[]> = {
  laser: [810, 1900, 5700, 28000, 180000],
  engine: [860, 2000, 8700, 40000, 340000],
  shield: [1100, 2200, 9700, 39000, 230000],
  scanner: [1200, 2100, 7900, 36000, 240000],
  reactor: [1300, 2400, 11000, 56000, 290000],
  cargo: [980, 2400, 8300, 70000, 310000],
  repair: [960, 2300, 19000, 81000, 340000],
  life: [640, 2200, 15000, 57000, 340000],
};

function moduleItem(family: ModuleFamily, mk: number): ItemDef {
  const f = MODULE_FAMILIES[family];
  const flavor = MK_FLAVOR[mk - 1];
  const module: ModuleSpec = {
    family,
    mk,
    effects: f.effects(mk),
    wear: Math.min(7, f.wear + 0.25 * (mk - 1)),
    power: f.draw < 0 ? Math.round(f.draw * 1.8 ** (mk - 1)) : Math.round(f.draw * DRAW_STEP[mk - 1]),
  };
  return item(
    `mod_${family}_mk${mk}`,
    3,
    "module",
    MODULE_VALUES[family][mk - 1],
    t(`${f.name.cs} Mk ${ROMAN[mk - 1]}`, `${f.name.en} Mk ${ROMAN[mk - 1]}`),
    t(`${f.desc.cs} ${flavor.cs}`, `${f.desc.en} ${flavor.en}`),
    { mass: 0, module, tags: [family] },
  );
}

const special = (
  id: string,
  value: number,
  family: ModuleFamily,
  mk: number,
  wear: number,
  power: number,
  effects: Effect[],
  cs: string,
  en: string,
  dcs: string,
  den: string,
): ItemDef => item(id, 3, "module", value, t(cs, en), t(dcs, den), { mass: 0, module: { family, mk, effects, wear, power }, tags: [family, "special"] });

export const MODULE_FAMILY_IDS: ModuleFamily[] = ["laser", "engine", "shield", "scanner", "reactor", "cargo", "repair", "life"];

const MODULES: ItemDef[] = [
  ...MODULE_FAMILY_IDS.flatMap((family) => [1, 2, 3, 4, 5].map((mk) => moduleItem(family, mk))),
  // Special modules: blueprint finds with effects no family mark offers.
  special("mod_lucky_dice", 1500, "scanner", 2, 3, 0, [{ stat: "eventLuck", add: 0.2 }, { stat: "salvageValue", add: 0.2 }], "Šťastné kostky", "Lucky Dice", "Visí v kokpitu. Statisticky nedělají nic. Statistika lže.", "They hang in the cockpit. Statistically they do nothing. Statistics lie."),
  special("mod_tow_hook", 4500, "engine", 2, 3, 2, [{ stat: "towSpeed", mul: 0.75 }, { stat: "salvageRate", add: 0.15 }], "Vlečný hák", "Tow Hook", "Když už tě mají táhnout, ať je to aspoň rychle.", "If you must be towed, be towed quickly."),
  special("mod_coffee_machine", 5800, "life", 3, 4, 6, [{ stat: "moraleGain", add: 0.5 }, { stat: "coffeeUse", mul: 0.8 }], "Kávovar", "Coffee Machine", "Nejdůležitější systém na palubě. Reaktor je až druhý.", "The most important system aboard. The reactor comes second."),
  special("mod_bulkhead", 9200, "shield", 3, 3, 0, [{ stat: "hullMax", add: 0.6 }, { stat: "repairSpeed", add: 0.15 }], "Přepážka navíc", "Spare Bulkhead", "Další stěna mezi tebou a prázdnotou. Dveře v ní nikdo neplánoval.", "One more wall between you and the void. Nobody planned a door."),
  special("mod_night_watch", 10000, "repair", 3, 3.5, 5, [{ stat: "offlineEff", add: 0.1 }, { stat: "wearRate", mul: 0.95 }], "Noční hlídka", "Night Watch", "KIPPův podprogram, který hlídá loď, když spíš. Účtuje si přesčasy.", "A KIPP subroutine that minds the ship while you sleep. It bills overtime."),
  special("mod_drone_bay", 12000, "cargo", 3, 4, 8, [{ stat: "droneCap", add: 0.5 }, { stat: "liftRate", add: 0.2 }], "Dronový dok", "Drone Bay", "Garáž pro drony. Parkují zásadně šikmo.", "A garage for drones. They park at an angle, on principle."),
  special("mod_prism_array", 17000, "laser", 4, 6, 14, [{ stat: "activeMult", add: 0.75 }, { stat: "heatRate", mul: 0.85 }], "Hranolové pole", "Prism Array", "Rozloží paprsek na sedm menších. Asteroidu je to jedno, tobě ne.", "Splits the beam into seven smaller ones. The asteroid does not care. You will."),
  special("mod_overclocker", 14000, "reactor", 4, 7, 20, [{ stat: "craftSpeed", add: 0.6 }, { stat: "wearRate", mul: 1.15 }], "Přetaktovač", "Overclocker", "Všechno běží rychleji. Včetně opotřebení.", "Everything runs faster. Wear included."),
];

// ---------- T4 megastructures (14) ----------------------------------------------------

const MEGAS: ItemDef[] = [
  mega("collector_array", 1000000, "Sběrné pole", "Collector Array", "Zrcadla kolem hvězdy. Energie zdarma, pokud nepočítáš stavbu.", "Mirrors around a star. Free energy, if you ignore construction."),
  mega("deep_drill", 630000, "Hlubinný vrták", "Deep Core Drill", "Vrtá až tam, kde si planety schovávají to nejlepší.", "Drills down to where planets hide the good stuff."),
  mega("orbital_foundry", 1600000, "Orbitální slévárna", "Orbital Foundry", "Továrna bez gravitace a bez odborů.", "A factory with no gravity and no union."),
  mega("signal_dish", 540000, "Signální talíř", "Signal Dish", "Obří anténa. Hudba při čekání je díky ní slyšet křišťálově čistě.", "A giant antenna. The hold music now comes through crystal clear."),
  mega("archive_vault", 540000, "Archivní trezor", "Archive Vault", "Všechno, co ses naučil, uložené mimo dosah vlastních chyb.", "Everything you have learned, stored out of reach of your own mistakes."),
  mega("kipp_backup", 880000, "Záloha KIPPa", "KIPP Backup", "Druhý KIPP pro případ nouze. První KIPP o něm odmítá mluvit.", "A second KIPP for emergencies. The first KIPP declines to discuss it."),
  mega("shipyard", 2000000, "Loděnice", "Shipyard", "Suchý dok, kde se dá loď rozebrat a postavit líp. Teoreticky.", "A dry dock where a ship can be taken apart and built better. In theory."),
  mega("wormhole_gate", 3300000, "Červí brána", "Wormhole Gate", "Zkratka k dalšímu warpu. Jádro galaxie už nemusíš vidět osobně.", "A shortcut to the next warp. No need to visit the galactic core in person."),
  mega("hull_frame_hauler", 420000, "Kostra: Soumar", "Frame: Hauler", "Žebra pro loď, která uveze víc, než je rozumné.", "Ribs for a ship that carries more than is sensible.", ["frame"]),
  mega("hull_frame_prospector", 640000, "Kostra: Prospektor", "Frame: Prospector", "Kostra postavená kolem vrtáku. Všechno ostatní je doplněk.", "A frame built around a drill. Everything else is an accessory.", ["frame"]),
  mega("hull_frame_clipper", 830000, "Kostra: Klipr", "Frame: Clipper", "Štíhlá, lehká a postavená pro spěch.", "Slim, light and built for people in a hurry.", ["frame"]),
  mega("hull_frame_bulwark", 1300000, "Kostra: Bašta", "Frame: Bulwark", "Tolik oceli, že se asteroidy uhýbají samy.", "So much steel that asteroids move aside on their own.", ["frame"]),
  mega("hull_frame_ark", 2000000, "Kostra: Archa", "Frame: Ark", "Místo pro posádku, skleník a všechny jejich hádky.", "Room for a crew, a greenhouse and all their arguments.", ["frame"]),
  mega("hull_frame_colossus", 3300000, "Kostra: Kolos", "Frame: Colossus", "Největší kostra, jakou dílna zvládne. Dílna si to nemyslí.", "The biggest frame the workshop can handle. The workshop disagrees.", ["frame"]),
];

/**
 * Passive effects of megastructures while owned (once each). ContentDB has no slot for these yet,
 * so they are exported separately. The shipyard, the gate and the hull frames act through their ids.
 */
export const megaEffects: Record<ItemId, Effect[]> = {
  collector_array: [{ stat: "powerOut", mul: 1.5 }],
  deep_drill: [{ stat: "mineRate", mul: 1.5 }],
  orbital_foundry: [{ stat: "craftBatch", mul: 1.5 }, { stat: "craftSpeed", mul: 1.25 }],
  signal_dish: [{ stat: "scanSpeed", mul: 1.5 }, { stat: "eventLuck", add: 0.1 }],
  archive_vault: [{ stat: "researchRate", mul: 1.5 }],
  kipp_backup: [{ stat: "offlineEff", add: 0.1 }],
};

// ---------- consumables (18) ----------------------------------------------------------

const CONSUMABLES: ItemDef[] = [
  cons("duct_tape", 1, 17, { kind: "repair", repairPct: 15, repairCap: 60 }, "Lepicí páska", "Duct Tape", "Drží svět pohromadě. Tuhle loď doslova.", "Holds the world together. This ship, literally."),
  cons("spare_parts", 2, 170, { kind: "repair", repairPct: 40, repairCap: 90 }, "Náhradní díly", "Spare Parts", "Krabice věcí, které zbyly po poslední opravě.", "A box of things left over from the last repair."),
  cons("nano_gel", 2, 410, { kind: "repair", repairPct: 100, repairCap: 100 }, "Nanogel", "Nano-Gel", "Miliony malých opravářů v tubě. Stávku zatím nevyhlásili.", "Millions of tiny mechanics in a tube. No strike so far."),
  cons("weld_rod", 1, 26, { kind: "repair", repairPct: 25, repairCap: 75 }, "Svařovací drát", "Welding Rod", "Svar, který vydrží déle než původní díl.", "A joint that outlasts the original part."),
  cons("hull_foam", 1, 110, { kind: "repair", repairPct: 30, repairCap: 100 }, "Trupová pěna", "Hull Foam", "Nastříkat do díry, počkat, nedýchat.", "Spray into the hole, wait, do not inhale.", ["hull"]),
  cons("fuel_cell", 2, 150, { kind: "fuel", fuel: 8 }, "Palivový článek", "Fuel Cell", "Jeden skok v plechovce. Otevírat jen v nouzi, tedy pořád.", "One jump in a can. Open only in an emergency, which is always."),
  cons("fuel_drum", 2, 550, { kind: "fuel", fuel: 30 }, "Sud paliva", "Fuel Drum", "Plná nádrž na jedno otevření. Kutálet opatrně.", "A full tank in one go. Roll with care."),
  cons("coffee", 1, 4.2, { kind: "coffee", morale: 1 }, "Káva", "Coffee", "Pohonná hmota posádky. Bez ní nikdo nic neopraví.", "Crew propellant. Nothing gets fixed without it."),
  cons("espresso", 1, 47, { kind: "coffee", morale: 12, buff: { effect: { stat: "craftSpeed", mul: 1.25 }, secs: 600 } }, "Espresso", "Espresso", "Káva, která to myslí vážně. Ruce se třesou, výroba jede.", "Coffee that means business. Hands shake, production soars."),
  cons("comfort_food", 1, 92, { kind: "boost", morale: 20, buff: { effect: { stat: "moraleGain", mul: 1.5 }, secs: 1800 } }, "Jídlo jako od mámy", "Comfort Food", "Skoro jako doma. To skoro tu odvádí hodně práce.", "Almost like home. 'Almost' is doing a lot of work."),
  cons("beacon", 2, 280, { kind: "beacon", buff: { effect: { stat: "towSpeed", mul: 0.5 }, secs: 3600 } }, "Nouzový maják", "Beacon", "Volá o pomoc na všech frekvencích. Odtah dorazí dřív a míň se šklebí.", "Calls for help on every frequency. The tow arrives sooner and smirks less."),
  cons("overclock_chip", 2, 390, { kind: "boost", buff: { effect: { stat: "mineRate", mul: 1.5 }, secs: 300 } }, "Přetaktovací čip", "Overclock Chip", "Pět minut slávy pro těžební laser. Pak zase normál.", "Five minutes of glory for the mining laser. Then back to normal."),
  cons("drone_oil", 1, 35, { kind: "boost", buff: { effect: { stat: "liftRate", mul: 1.5 }, secs: 600 } }, "Olej na drony", "Drone Oil", "Namazaný dron je šťastný dron. A rychlejší.", "An oiled drone is a happy drone. And a faster one."),
  cons("flare", 1, 74, { kind: "boost", buff: { effect: { stat: "scanSpeed", mul: 2 }, secs: 300 } }, "Světlice", "Flare", "Osvítí celou soustavu. Skener děkuje, oči už méně.", "Lights up the whole system. The scanner says thanks; your eyes do not."),
  cons("brain_snack", 1, 110, { kind: "boost", buff: { effect: { stat: "researchRate", mul: 1.5 }, secs: 600 } }, "Svačina pro mozek", "Brain Snack", "Slabě světélkuje. Laboratoř tvrdí, že je to v pořádku.", "Glows faintly. The lab insists that is fine."),
  cons("lucky_sock", 1, 320, { kind: "boost", buff: { effect: { stat: "eventLuck", add: 0.25 }, secs: 900 } }, "Šťastná ponožka", "Lucky Sock", "Levá. Pravou nikdo nikdy nenašel.", "The left one. Nobody ever found the right."),
  cons("salvage_magnet", 2, 280, { kind: "boost", buff: { effect: { stat: "salvageRate", mul: 2 }, secs: 600 } }, "Magnet na trosky", "Salvage Magnet", "Přitáhne všechno kovové v okolí. Včetně tvého nářadí.", "Attracts every metal thing nearby. Your tools included."),
  cons("jump_primer", 2, 300, { kind: "boost", buff: { effect: { stat: "jumpCharge", mul: 3 }, secs: 120 } }, "Skokový startér", "Jump Primer", "Nakopne hyperpohon. Ten se pak chvíli zlobí.", "Kick-starts the hyperdrive. It sulks for a while afterwards."),
];

// ---------- artifacts (18) ------------------------------------------------------------
// Expedition and derelict finds. Flavor first, sell value second; each adds a codex entry.

const ARTIFACTS: ItemDef[] = [
  art("art_rubber_duck", 2, 400, "Gumová kachnička", "Rubber Duck", "Někdo jí kdysi vysvětloval svůj kód. Tváří se, že už toho slyšela dost.", "Someone once explained their code to it. It looks like it has heard enough."),
  art("art_warranty_card", 2, 650, "Záruční list", "Warranty Card", "Platnost vypršela před 312 lety. Razítko je ale krásně čitelné.", "Expired 312 years ago. The stamp is beautifully legible, though."),
  art("art_mixtape", 2, 900, "Mixpáska", "Mixtape", "Na obalu stojí: Na dlouhé směny. Strana B je prázdná.", "The label says: For long shifts. Side B is blank."),
  art("art_snow_globe", 2, 1500, "Sněžítko", "Snow Globe", "Uvnitř je malá hvězda. Když zatřeseš, vzplane.", "There is a small star inside. Shake it and it flares."),
  art("art_right_sock", 2, 2200, "Pravá ponožka", "The Right Sock", "Tak tady celou dobu byla.", "So this is where it went."),
  art("art_music_box", 2, 3500, "Hrací skříňka", "Music Box", "Hraje melodii, kterou znáš z čekání na lince. Vypnout nejde.", "Plays the tune you know from being on hold. It has no off switch."),
  art("art_fossil_bolt", 3, 5000, "Zkamenělý šroub", "Fossil Bolt", "Šroub starší než hvězda, kolem které obíhal. Závit je metrický.", "A bolt older than the star it orbited. The thread is metric."),
  art("art_captains_mug", 3, 8000, "Kapitánův hrnek", "Captain's Mug", "Nápis: Nejlepší kapitán v sektoru. Sektor nebyl velký.", "It reads: Best captain in the sector. It was a small sector."),
  art("art_star_chart", 3, 12000, "Ručně kreslená mapa", "Hand-Drawn Chart", "Někdo zakreslil cestu k jádru a na okraj připsal: Nelítej tam.", "Someone drew the route to the core and wrote in the margin: Do not go."),
  art("art_silent_bell", 3, 18000, "Němý zvon", "Silent Bell", "Nezvoní. Přesto se po úderu všichni ohlédnou.", "It does not ring. Everyone still turns around when it is struck."),
  art("art_left_glove", 3, 26000, "Levá rukavice", "Left Glove", "Šest prstů. Majitel se zatím nepřihlásil.", "Six fingers. Nobody has claimed it so far."),
  art("art_endless_top", 3, 40000, "Věčná káča", "Endless Top", "Točí se od chvíle, kdy jsi ji našel. Nikdo ji neroztočil.", "It has been spinning since you found it. Nobody spun it."),
  art("art_manual_vol7", 4, 60000, "Příručka, díl 7 z 9", "Manual, Vol. 7 of 9", "Odpověď na tvůj problém je v díle 8.", "The answer to your problem is in volume 8."),
  art("art_glass_seed", 4, 90000, "Skleněné semínko", "Glass Seed", "Když ho zaliješ, nic se nestane. Když ne, taky nic. Stejně ho zaléváš.", "Water it and nothing happens. Do not, and nothing happens either. You water it anyway."),
  art("art_tin_robot", 4, 140000, "Plechový robot", "Tin Robot", "Na klíček. Ujde tři kroky a ukloní se. KIPP trvá na tom, že nejsou příbuzní.", "Wind-up. Walks three steps and bows. KIPP insists they are not related."),
  art("art_queue_ticket", 4, 220000, "Pořadový lístek", "Queue Ticket", "Číslo 4 294 967 295. Na displeji svítí dvanáctka.", "Number 4,294,967,295. The display says: now serving 12."),
  art("art_black_box", 4, 350000, "Černá skříňka", "Black Box", "Poslední záznam: Vypadá to dobře, zkusím to bez manuálu.", "Last entry: Looks fine, I will try it without the manual."),
  art("art_tuning_fork", 4, 600000, "Ladička", "Tuning Fork", "Zní stejným tónem jako signál. Rozezní se sama, když se blížíš k jádru.", "Hums the same note as the signal. It starts on its own as you near the core."),
];

// ---------- specials (3) --------------------------------------------------------------

const SPECIALS: ItemDef[] = [
  spec("probe_kit", 2, 1300, "Sondážní sada", "Probe Kit", "Sonda v krabici. Návod má jediný obrázek a ten je vzhůru nohama.", "A probe in a box. The manual has one picture, printed upside down."),
  spec("data_core", 2, 950, "Datové jádro", "Data Core", "Cizí znalosti v pevném skupenství. Laboratoř je bere místo peněz.", "Other people's knowledge in solid form. The lab takes it instead of money."),
  spec("outpost_kit", 3, 3300, "Stavebnice základny", "Outpost Kit", "Malá základna v placatém balení. Imbusový klíč je přiložen.", "A small outpost, flat-packed. Hex key included."),
];

export const itemList: ItemDef[] = [...RAW, ...REFINED, ...COMPONENTS, ...MODULES, ...MEGAS, ...CONSUMABLES, ...ARTIFACTS, ...SPECIALS];
export const items: Record<ItemId, ItemDef> = byId(itemList);

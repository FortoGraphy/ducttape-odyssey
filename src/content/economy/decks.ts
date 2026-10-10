// The 13 decks, numbers from GDD 2.1. `base` is the output at level 1 and scales with the curve.
// Formulas the curve cannot express live in balance.ts: the reactor adds `reactorBasePower` on top
// of base * level, hangar drones are 1 + floor(L / hangarDronesEvery), crew is
// 1 + floor(L / quartersCrewEvery), and the bridge value is the sell bonus per level.
import type { DeckCurve, DeckDef, DeckId, ItemId } from "@/engine/types";
import { t } from "./util";

function deck(
  id: DeckId,
  base: number,
  curve: DeckCurve,
  baseCost: number,
  costGrowth: number,
  power: number,
  unlockCredits: number,
  unlockItems: Record<ItemId, number> | null,
  startLevel: number,
  cs: string,
  en: string,
  unitCs: string,
  unitEn: string,
  dcs: string,
  den: string,
): DeckDef {
  return {
    id,
    name: t(cs, en),
    desc: t(dcs, den),
    icon: `deck_${id}`,
    unit: t(unitCs, unitEn),
    base,
    curve,
    baseCost,
    costGrowth,
    power,
    unlock: unlockItems ? { credits: unlockCredits, items: unlockItems } : { credits: unlockCredits },
    startLevel,
  };
}

export const decks: Record<DeckId, DeckDef> = {
  bridge: deck("bridge", 0.02, "lin", 500, 1.1, 0.8, 900, null, 0, "Můstek", "Bridge", "× prodej", "x sell", "Odtud se velí, smlouvá a zírá do prázdna. Každá úroveň zvedá výkupní ceny a pomáhá lodi pracovat, když jsi pryč.", "Where you command, haggle and stare into the void. Each level raises sell prices and helps the ship work while you are away."),
  observatory: deck("observatory", 1, "soft", 1e6, 1.11, 1.6, 2.5e6, { lens: 40, girder: 10 }, 0, "Observatoř", "Observatory", "× sken", "x scan", "Velké oko lodi. Rychleji skenuje, častěji nachází trosky a vidí potíže dřív, než dorazí.", "The ship's big eye. Scans faster, spots more salvage and sees trouble before it arrives."),
  quarters: deck("quarters", 1, "lin", 250000, 1.12, 0.6, 600000, { plating: 20, tubing: 20 }, 0, "Kajuty", "Quarters", "lůžek", "bunks", "Postele, skříňky a jedna sprcha na všechny. Víc úrovní znamená víc posádky a lepší náladu.", "Beds, lockers and one shower for everyone. More levels mean more crew and better moods."),
  lab: deck("lab", 0.2, "exp", 60000, 1.1, 2.2, 150000, { circuit: 12, lens: 6 }, 0, "Laboratoř", "Lab", "VB/s", "RP/s", "Vyrábí výzkumné body a občas i kouř. Obojí se počítá jako pokrok.", "Produces research points and, now and then, smoke. Both count as progress."),
  greenhouse: deck("greenhouse", 0.05, "exp", 4e6, 1.1, 1.2, 1e7, { tubing: 40, water: 200, glass: 100 }, 0, "Skleník", "Greenhouse", "org./s", "org/s", "Pěstuje organiku a kávová zrna. Jediná paluba, kde něco roste schválně.", "Grows organics and coffee beans. The only deck where things grow on purpose."),
  hangar: deck("hangar", 1, "lin", 20000, 1.12, 1.2, 40000, { actuator: 8 }, 0, "Hangár", "Hangar", "dronů", "drones", "Domov dronů. Přiděl je k výtahu, sondám, troskám nebo opravám.", "Home of the drones. Assign them to hauling, probes, salvage or repairs."),
  workshop: deck("workshop", 1, "exp", 6000, 1.1, 1.6, 12000, null, 0, "Dílna", "Workshop", "ks/várka", "per batch", "Spotřební materiál, megaprojekty a rychlejší opravy. Voní tu páska a spálená izolace.", "Consumables, megaprojects and faster repairs. Smells of tape and burnt insulation."),
  fabricator: deck("fabricator", 1, "exp", 2000, 1.1, 2, 4000, null, 0, "Fabrikátor", "Fabricator", "ks/várka", "per batch", "Skládá součástky a moduly. Co do něj vložíš, to vrátí užitečnější.", "Builds components and modules. Whatever goes in comes out more useful."),
  refinery: deck("refinery", 1, "exp", 40, 1.09, 1.4, 60, null, 0, "Rafinerie", "Refinery", "ks/várka", "per batch", "Mění surovinu ve zboží, za které makléř platí víc. Další souběžná linka každých 25 úrovní.", "Turns raw ore into goods the broker pays more for. One more parallel line every 25 levels."),
  cargo: deck("cargo", 400, "exp", 8, 1.08, 0.2, 0, null, 1, "Nákladový prostor", "Cargo Hold", "jednotek", "units", "Kolik se toho vejde. Když je plno, výtah stojí a těžba čeká.", "How much fits. When it is full, the lift stops and mining waits."),
  lift: deck("lift", 1.2, "exp", 6, 1.075, 0.6, 0, null, 1, "Výtah", "Lift", "j./s", "units/s", "Vozí vytěžené z násypky do nákladu. Pomalý výtah brzdí všechno nad sebou.", "Hauls the haul from the hopper to the hold. A slow lift holds back everything above it."),
  reactor: deck("reactor", 14, "lin", 120, 1.09, 0, 250, null, 0, "Reaktor", "Reactor", "MW", "MW", "Napájí všechny paluby. Když nestačí, celá loď zpomalí a začne nepříjemně blikat.", "Powers every deck. When it falls short, the whole ship slows down and flickers unpleasantly."),
  mining: deck("mining", 1, "exp", 4, 1.07, 1, 0, null, 1, "Těžba", "Mining", "j./s", "units/s", "Laser, asteroid a trpělivost. Tady začíná každý kredit.", "A laser, an asteroid and patience. Every credit starts here."),
};

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
  bridge: deck("bridge", 0.02, "lin", 20000, 1.12, 0.8, 50000, null, 0, "Můstek", "Bridge", "× prodej", "x sell", "Odtud se velí, smlouvá a zírá do prázdna. Každá úroveň zvedá výkupní ceny a pomáhá lodi pracovat, když jsi pryč.", "Where you command, haggle and stare into the void. Each level raises sell prices and helps the ship work while you are away."),
  observatory: deck("observatory", 1, "soft", 8e9, 1.13, 1.6, 2e10, { lens: 40, girder: 10 }, 0, "Observatoř", "Observatory", "× sken", "x scan", "Velké oko lodi. Rychleji skenuje, častěji nachází trosky a vidí potíže dřív, než dorazí.", "The ship's big eye. Scans faster, spots more salvage and sees trouble before it arrives."),
  quarters: deck("quarters", 1, "lin", 1.2e8, 1.14, 0.6, 3e8, { plating: 20, tubing: 20 }, 0, "Kajuty", "Quarters", "lůžek", "bunks", "Postele, skříňky a jedna sprcha na všechny. Víc úrovní znamená víc posádky a lepší náladu.", "Beds, lockers and one shower for everyone. More levels mean more crew and better moods."),
  lab: deck("lab", 0.2, "exp", 1.2e7, 1.12, 2.2, 3e7, { circuit: 12, lens: 6 }, 0, "Laboratoř", "Lab", "VB/s", "RP/s", "Vyrábí výzkumné body a občas i kouř. Obojí se počítá jako pokrok.", "Produces research points and, now and then, smoke. Both count as progress."),
  greenhouse: deck("greenhouse", 0.05, "exp", 4e11, 1.12, 1.2, 1e12, { tubing: 40, water: 200, glass: 100 }, 0, "Skleník", "Greenhouse", "org./s", "org/s", "Pěstuje organiku a kávová zrna. Jediná paluba, kde něco roste schválně.", "Grows organics and coffee beans. The only deck where things grow on purpose."),
  hangar: deck("hangar", 1, "lin", 4e6, 1.14, 1.2, 1e7, { actuator: 8 }, 0, "Hangár", "Hangar", "dronů", "drones", "Domov dronů. Přiděl je k výtahu, sondám, troskám nebo opravám.", "Home of the drones. Assign them to hauling, probes, salvage or repairs."),
  workshop: deck("workshop", 1, "exp", 1.5e6, 1.12, 1.6, 4e6, null, 0, "Dílna", "Workshop", "ks/várka", "per batch", "Spotřební materiál, megaprojekty a rychlejší opravy. Voní tu páska a spálená izolace.", "Consumables, megaprojects and faster repairs. Smells of tape and burnt insulation."),
  fabricator: deck("fabricator", 1, "exp", 250000, 1.12, 2, 600000, null, 0, "Fabrikátor", "Fabricator", "ks/várka", "per batch", "Skládá součástky a moduly. Co do něj vložíš, to vrátí užitečnější.", "Builds components and modules. Whatever goes in comes out more useful."),
  refinery: deck("refinery", 1, "exp", 150, 1.11, 1.4, 250, null, 0, "Rafinerie", "Refinery", "ks/várka", "per batch", "Mění surovinu ve zboží, za které makléř platí víc. Další souběžná linka každých 25 úrovní.", "Turns raw ore into goods the broker pays more for. One more parallel line every 25 levels."),
  cargo: deck("cargo", 400, "exp", 8, 1.11, 0.2, 0, null, 1, "Nákladový prostor", "Cargo Hold", "jednotek", "units", "Kolik se toho vejde. Co se nevejde, jde rovnou makléři, takže na výrobu a zakázky nic nezbude.", "How much fits. Whatever does not fit goes straight to the broker, leaving nothing for crafting or contracts."),
  lift: deck("lift", 3, "exp", 5, 1.095, 0.6, 0, null, 1, "Výtah", "Lift", "j./s", "units/s", "Vozí vytěžené z násypky do nákladu. Pomalý výtah brzdí všechno nad sebou.", "Hauls the haul from the hopper to the hold. A slow lift holds back everything above it."),
  reactor: deck("reactor", 14, "lin", 500, 1.11, 0, 1200, null, 0, "Reaktor", "Reactor", "MW", "MW", "Napájí všechny paluby. Když nestačí, celá loď zpomalí a začne nepříjemně blikat.", "Powers every deck. When it falls short, the whole ship slows down and flickers unpleasantly."),
  mining: deck("mining", 1, "exp", 4, 1.1, 1, 0, null, 1, "Těžba", "Mining", "j./s", "units/s", "Laser, asteroid a trpělivost. Tady začíná každý kredit.", "A laser, an asteroid and patience. Every credit starts here."),
};

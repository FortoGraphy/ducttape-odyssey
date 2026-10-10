// Mutators: optional handicaps for the next galaxy (pick 0-2). `reward` multiplies the stamps of
// the warp that ends that galaxy; with two picked the rewards multiply.
import type { Effect, MutatorDef, MutatorId } from "@/engine/types";
import { byId, t } from "./util";

const mutator = (id: MutatorId, reward: number, effects: Effect[], cs: string, en: string, dcs: string, den: string): MutatorDef => ({
  id,
  name: t(cs, en),
  desc: t(dcs, den),
  effects,
  reward,
});

export const mutatorList: MutatorDef[] = [
  mutator("hot_laser", 1.15, [{ stat: "heatRate", mul: 2 }, { stat: "activeMult", mul: 0.75 }], "Horká hlava", "Hot Head", "Laser se přehřívá dvakrát rychleji a ruční těžba je slabší. Míň držet, víc přemýšlet.", "The laser overheats twice as fast and hold-to-mine is weaker. Hold less, think more."),
  mutator("fog", 1.2, [{ stat: "scanSpeed", mul: 0.4 }, { stat: "salvageRate", mul: 0.5 }], "Mlha", "Fog", "Galaxie plná prachu. Skeny se vlečou a trosek je polovina.", "A galaxy full of dust. Scans crawl and salvage is halved."),
  mutator("decaf", 1.2, [{ stat: "coffeeUse", mul: 2 }, { stat: "moraleGain", mul: 0.6 }], "Bezkofeinová", "Decaf", "Káva tu skoro nepůsobí. Posádka jí vypije dvojnásob a stejně se mračí.", "Coffee barely works here. The crew drinks twice as much and frowns anyway."),
  mutator("lazy_bots", 1.2, [{ stat: "repairSpeed", mul: 0.4 }], "Líní boti", "Lazy Bots", "Opravy jdou na 40 %. Boti tvrdí, že je to kosmickým zářením.", "Repairs run at 40%. The bots blame cosmic rays."),
  mutator("thirsty", 1.25, [{ stat: "fuelUse", mul: 2 }], "Žíznivý pohon", "Thirsty Drive", "Každý skok stojí dvojnásob paliva. Plánuj trasu, ne výlety.", "Every jump costs double fuel. Plan a route, not a road trip."),
  mutator("brownout", 1.3, [{ stat: "powerOut", mul: 0.7 }], "Podpětí", "Brownout", "Reaktor dává jen 70 %. Světla blikají, ale útulně.", "The reactor delivers only 70%. The lights flicker, but cosily."),
  mutator("slow_hands", 1.3, [{ stat: "craftSpeed", mul: 0.5 }], "Líná hmota", "Sluggish Matter", "Výroba trvá dvakrát déle. Atomy tu prostě nespěchají.", "Crafting takes twice as long. Atoms are in no hurry here."),
  mutator("paper_shields", 1.3, [{ stat: "shield", mul: 1.8 }, { stat: "hullMax", mul: 0.6 }], "Papírový trup", "Paper Hull", "Trup je slabší a všechno bolí skoro dvakrát víc. Meteory z toho mají radost.", "The hull is weaker and everything hurts almost twice as much. Meteors are delighted."),
  mutator("busy_space", 1.35, [{ stat: "eventRate", mul: 1.6 }, { stat: "eventLuck", mul: 0.7 }], "Rušná čtvrť", "Busy Neighbourhood", "Událostí je víc a dopadají hůř. Tiché místo to bylo naposledy včera.", "More events, worse outcomes. It was a quiet place until yesterday."),
  mutator("tight_hold", 1.35, [{ stat: "cargoCap", mul: 0.4 }], "Těsný sklad", "Tight Hold", "Nákladový prostor má 40 % kapacity. Všechno se musí hned prodat nebo zpracovat.", "The hold has 40% of its capacity. Everything must be sold or processed at once."),
  mutator("brittle", 1.4, [{ stat: "wearRate", mul: 2 }], "Křehká galaxie", "Brittle Galaxy", "Moduly se opotřebovávají dvakrát rychleji. Páska jde na dračku.", "Modules wear twice as fast. Tape is in high demand."),
  mutator("tax_audit", 1.4, [{ stat: "sellValue", mul: 0.6 }], "Daňová kontrola", "Tax Audit", "Makléř platí 60 %. Zbytek je prý poplatek za zpracování.", "The broker pays 60%. The rest is, allegedly, a processing fee."),
  mutator("thin_veins", 1.5, [{ stat: "mineRate", mul: 0.5 }], "Tenké žíly", "Thin Veins", "Asteroidy jsou tu napůl prázdné. Nebo napůl plné, ale těžba je poloviční.", "The asteroids here are half empty. Or half full, but mining is halved."),
  mutator("no_autopilot", 1.6, [{ stat: "offlineEff", mul: 0.3 }], "Stávka autopilota", "Autopilot Strike", "Když jsi pryč, loď skoro nepracuje. KIPP tomu říká kolektivní vyjednávání.", "The ship barely works while you are away. KIPP calls it collective bargaining."),
  mutator("inflation", 1.75, [{ stat: "deckCost", mul: 1.6 }], "Inflace", "Inflation", "Úrovně palub jsou o 60 % dražší. Ceny rostou, razítka taky.", "Deck levels cost 60% more. Prices climb, and so do the stamps."),
  mutator("murphy", 2, [{ stat: "allProd", mul: 0.5 }, { stat: "wearRate", mul: 1.5 }, { stat: "eventLuck", mul: 0.8 }], "Zákon schválnosti", "Sod's Galaxy", "Co se může pokazit, pokazí se. Poloviční produkce, rychlejší opotřebení, horší štěstí. Dvojnásobek razítek.", "Whatever can go wrong, does. Half production, faster wear, worse luck. Double stamps."),
];

export const mutators: Record<MutatorId, MutatorDef> = byId(mutatorList);

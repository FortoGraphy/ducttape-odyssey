// Crew traits. Effects apply while the crew member manages a deck; an effect with neither `stat`
// nor `deck` scales the managed deck's output.
import type { Effect, TraitDef, TraitId } from "@/engine/types";
import { byId, t } from "./util";

const trait = (id: TraitId, good: boolean, effects: Effect[], cs: string, en: string, dcs: string, den: string): TraitDef => ({
  id,
  name: t(cs, en),
  desc: t(dcs, den),
  effects,
  good,
});

export const traitList: TraitDef[] = [
  // good
  trait("tinkerer", true, [{ add: 0.15 }], "Kutil", "Tinkerer", "Všechno trochu vylepší, i když o to nikdo nestál. Paluba +15 %.", "Improves everything a little, asked or not. Deck +15%."),
  trait("workhorse", true, [{ add: 0.2 }, { stat: "moraleGain", mul: 0.95 }], "Dříč", "Workhorse", "Paluba +20 %. Přestávky považuje za osobní selhání, což kazí náladu ostatním.", "Deck +20%. Treats breaks as a personal failure, which dampens the mood."),
  trait("caffeinated", true, [{ add: 0.25 }, { stat: "coffeeUse", add: 0.2 }], "Kofeinista", "Caffeine Fiend", "Paluba +25 %, ale kávy vypije za dva.", "Deck +25%, but drinks coffee for two."),
  trait("haggler", true, [{ stat: "sellValue", add: 0.05 }], "Smlouvač", "Haggler", "Usmlouvá slevu i u automatu. Prodej +5 %.", "Could talk a vending machine into a discount. Sell value +5%."),
  trait("lucky", true, [{ stat: "eventLuck", add: 0.08 }], "Klikař", "Lucky", "Padá mu chleba namazanou stranou nahoru. Události dopadají líp.", "The toast always lands butter side up. Events turn out better."),
  trait("neat", true, [{ stat: "wearRate", mul: 0.93 }], "Pořádkumilovný", "Neat Freak", "Utírá prach i z reaktoru. Opotřebení −7 %.", "Dusts the reactor. Wear -7%."),
  trait("pilot", true, [{ stat: "jumpCharge", add: 0.15 }, { stat: "fuelUse", mul: 0.95 }], "Rozený pilot", "Born Pilot", "Skok nabije rychleji a spálí méně. Parkuje ovšem příšerně.", "Charges jumps faster and burns less. Parks terribly, though."),
  trait("pathfinder", true, [{ stat: "expeditionSpeed", add: 0.2 }], "Stopařka", "Pathfinder", "Najde cestu i tam, kde žádná není. Výsadky +20 % rychlosti.", "Finds a path where there is none. Expeditions 20% faster."),
  trait("packrat", true, [{ stat: "expeditionLoot", add: 0.15 }, { stat: "cargoCap", add: 0.05 }], "Křeček", "Pack Rat", "Z výsadku nikdy nepřijde s prázdnou. Kapsy má všude.", "Never returns from an expedition empty-handed. Has pockets everywhere."),
  trait("sunshine", true, [{ stat: "moraleGain", add: 0.2 }], "Sluníčko", "Ray of Sunshine", "Dobrá nálada i v pondělí ráno. Morálka roste o 20 % rychleji.", "Cheerful even on a Monday morning. Morale grows 20% faster."),
  trait("quick_study", true, [{ stat: "xpGain", add: 0.25 }], "Rychlík", "Quick Study", "Návod přečte jednou a pak ho opravuje. Zkušenosti +25 %.", "Reads the manual once, then corrects it. Experience +25%."),
  trait("bot_whisperer", true, [{ stat: "repairSpeed", add: 0.2 }], "Zaříkávač botů", "Bot Whisperer", "Boti ho poslouchají. Nikdo neví, co jim říká. Opravy +20 %.", "The bots listen. Nobody knows what gets said. Repairs +20%."),
  trait("eagle_eye", true, [{ stat: "scanSpeed", add: 0.2 }, { stat: "salvageRate", add: 0.1 }], "Ostříž", "Eagle Eye", "Zahlédne šroubek na druhém konci soustavy. Sken i trosky jdou líp.", "Spots a loose screw across the system. Scans and salvage improve."),
  trait("perfectionist", true, [{ stat: "qualityLuck", add: 0.12 }, { stat: "craftSpeed", mul: 0.93 }], "Perfekcionista", "Perfectionist", "Lepší kvalita modulů, jen to déle trvá. Ještě to přeleští.", "Better module quality, it just takes longer. One more polish."),
  trait("diplomat", true, [{ stat: "repGain", add: 0.2 }], "Diplomatka", "Diplomat", "Vyjde s každým, i s auditory. Reputace +20 %.", "Gets along with everyone, auditors included. Reputation +20%."),
  trait("night_owl", true, [{ stat: "offlineEff", add: 0.03 }], "Noční sova", "Night Owl", "Pracuje, když ostatní spí. Loď toho bez tebe stihne víc.", "Works while everyone sleeps. The ship gets more done without you."),
  // bad (nobody is perfect; several come with a silver lining)
  trait("butterfingers", false, [{ stat: "wearRate", mul: 1.1 }], "Nešika", "Butterfingers", "Co vezme do ruky, to upustí. Opotřebení +10 %.", "Drops whatever is picked up. Wear +10%."),
  trait("sleepyhead", false, [{ add: -0.08 }], "Spáč", "Heavy Sleeper", "Na směnu chodí včas, jen ne na tu svoji. Paluba −8 %.", "Always on time for a shift, just not the right one. Deck -8%."),
  trait("chatterbox", false, [{ add: -0.05 }, { stat: "moraleGain", add: 0.1 }], "Mluvka", "Chatterbox", "Zdržuje, ale je s ním veselo. Paluba −5 %, morálka roste rychleji.", "Slows things down, but keeps spirits up. Deck -5%, morale grows faster."),
  trait("coffee_snob", false, [{ stat: "coffeeUse", mul: 1.5 }], "Kávový snob", "Coffee Snob", "První tři šálky vylije, protože nebyly ono. Spotřeba kávy +50 %.", "Pours out the first three cups for not being right. Coffee use +50%."),
  trait("homesick", false, [{ stat: "moraleGain", mul: 0.85 }], "Stýskal", "Homesick", "Ukazuje všem fotky planety, která už neexistuje. Morálka roste pomaleji.", "Shows everyone photos of a planet that no longer exists. Morale grows slower."),
  trait("hoarder", false, [{ stat: "cargoCap", mul: 0.95 }], "Sysel", "Hoarder", "Půlku skladu zabírají jeho osobní věci. Kapacita −5 %.", "Half the hold is personal belongings. Capacity -5%."),
  trait("daredevil", false, [{ stat: "eventLuck", add: -0.05 }, { stat: "expeditionSpeed", add: 0.1 }], "Hazardér", "Daredevil", "Rychlé výsadky, horší konce. Pojistku nemá, plán taky ne.", "Fast expeditions, worse endings. No insurance, no plan either."),
  trait("lead_foot", false, [{ stat: "fuelUse", mul: 1.1 }], "Těžká noha", "Lead Foot", "Brzdí zásadně o asteroidy. Spotřeba paliva +10 %.", "Brakes by asteroid, as a rule. Fuel use +10%."),
  trait("scatterbrain", false, [{ stat: "craftSpeed", mul: 0.93 }], "Zapomnětlivec", "Scatterbrain", "Kde že nechal ten klíč? Výroba je o 7 % pomalejší.", "Now where did that wrench go? Crafting is 7% slower."),
  trait("superstitious", false, [{ stat: "jumpCharge", mul: 0.93 }], "Pověrčivý", "Superstitious", "Před skokem třikrát zaklepe na trup. Nabíjení se tím protáhne.", "Knocks on the hull three times before every jump. Charging takes longer."),
  trait("grump", false, [{ stat: "moraleGain", mul: 0.9 }, { add: 0.05 }], "Bručoun", "Grump", "Stěžuje si na všechno a mezitím to opraví. Paluba +5 %, nálada horší.", "Complains about everything and fixes it meanwhile. Deck +5%, worse mood."),
  trait("space_sick", false, [{ stat: "expeditionSpeed", mul: 0.85 }], "Citlivý žaludek", "Space-Sick", "Před každým výsadkem potřebuje chvilku. A pytlík.", "Needs a moment before every expedition. And a bag."),
];

export const traits: Record<TraitId, TraitDef> = byId(traitList);

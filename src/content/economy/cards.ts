// Cards: 3 per deck (39). Effects are per card level; two slots per deck. An effect with only
// `deck` multiplies that deck's output, an effect with `stat` is global while the card is slotted.
import type { CardDef, CardId, DeckId, Effect } from "@/engine/types";
import { byId, t } from "./util";

const card = (id: CardId, deck: DeckId, rarity: CardDef["rarity"], effects: Effect[], cs: string, en: string, dcs: string, den: string): CardDef => ({
  id,
  deck,
  rarity,
  name: t(cs, en),
  desc: t(dcs, den),
  effects,
});

export const cardList: CardDef[] = [
  card("c_mining_grind", "mining", 0, [{ deck: "mining", add: 0.1 }], "Poctivá dřina", "Honest Grind", "Těžba +10 % za úroveň karty. Žádný trik, jen práce.", "Mining +10% per card level. No trick, just work."),
  card("c_mining_trigger", "mining", 1, [{ stat: "activeMult", add: 0.08 }], "Prst na spoušti", "Trigger Finger", "Ruční těžba je silnější. Palec si časem zvykne.", "Hold-to-mine hits harder. Your thumb gets used to it."),
  card("c_mining_heart", "mining", 3, [{ deck: "mining", add: 0.25 }, { stat: "overdriveGain", add: 0.05 }], "Srdce asteroidu", "Heart of the Rock", "Těžba +25 % a rychlejší kombo. Uprostřed každého kamene je něco, co stojí za to.", "Mining +25% and a faster combo. There is something worth it at the centre of every rock."),

  card("c_lift_grease", "lift", 0, [{ deck: "lift", add: 0.1 }], "Namazané lano", "Greased Cable", "Výtah +10 % za úroveň karty. Přestal vrzat, což je skoro škoda.", "Lift +10% per card level. It stopped squeaking, which is almost a pity."),
  card("c_lift_magnet", "lift", 1, [{ stat: "salvageRate", add: 0.06 }], "Magnetický hák", "Magnet Hook", "Výtah cestou sbírá, co letí kolem. Trosky se objevují častěji.", "The lift grabs whatever drifts by. Salvage shows up more often."),
  card("c_lift_express", "lift", 2, [{ deck: "lift", add: 0.2 }], "Výtah bez zastávek", "Express Lift", "Výtah +20 % za úroveň karty. V mezipatrech nestaví a neomlouvá se.", "Lift +20% per card level. Skips the floors in between and does not apologise."),

  card("c_cargo_puzzle", "cargo", 0, [{ deck: "cargo", add: 0.1 }], "Skládačka v nákladu", "Cargo Puzzle", "Kapacita +10 % za úroveň karty. Všechno se vejde, když se to dobře otočí.", "Capacity +10% per card level. Everything fits if you turn it the right way."),
  card("c_cargo_barcode", "cargo", 1, [{ stat: "sellValue", add: 0.04 }], "Čárový kód", "Barcode", "Zboží s etiketou vypadá dráž. Makléř platí víc.", "Labelled goods look pricier. The broker pays more."),
  card("c_cargo_bottomless", "cargo", 2, [{ deck: "cargo", add: 0.2 }, { stat: "creditGain", add: 0.03 }], "Bezedná bedna", "Bottomless Crate", "Kapacita +20 % a o něco víc kreditů. Nikdo neví, kde má ta bedna dno.", "Capacity +20% and a few more credits. Nobody knows where this crate ends."),

  card("c_reactor_fuses", "reactor", 0, [{ deck: "reactor", add: 0.1 }], "Nové pojistky", "Fresh Fuses", "Výkon reaktoru +10 % za úroveň karty. Tyhle ještě nikdo nepřemostil drátem.", "Reactor output +10% per card level. Nobody has bridged these with wire yet."),
  card("c_reactor_cables", "reactor", 1, [{ stat: "powerOut", add: 0.05 }], "Tlustší kabely", "Thicker Cables", "Cestou se ztratí méně energie. Celá loď má víc proudu.", "Less power lost on the way. The whole ship gets more current."),
  card("c_reactor_star", "reactor", 3, [{ deck: "reactor", add: 0.25 }, { stat: "craftSpeed", add: 0.05 }], "Zkrocená hvězda", "Tamed Star", "Výkon +25 % a rychlejší výroba. Zkrocená je silné slovo, říkejme jí domluvená.", "Output +25% and faster crafting. Tamed is a strong word; call it persuaded."),

  card("c_refinery_furnace", "refinery", 0, [{ deck: "refinery", add: 0.1 }], "Rozpálená pec", "Hot Furnace", "Várka rafinerie +10 % za úroveň karty.", "Refinery batch +10% per card level."),
  card("c_refinery_catalyst", "refinery", 1, [{ stat: "craftSpeed", add: 0.06 }], "Katalyzátor", "Catalyst", "Reakce proběhne dřív, než si stihneš dojít pro kávu.", "The reaction is done before you can fetch a coffee."),
  card("c_refinery_pilot", "refinery", 2, [{ deck: "refinery", add: 0.2 }], "Věčný plamínek", "Pilot Light", "Várka rafinerie +20 % za úroveň karty. Pec nikdy úplně nevychladne.", "Refinery batch +20% per card level. The furnace never quite goes cold."),

  card("c_fabricator_tooling", "fabricator", 0, [{ deck: "fabricator", add: 0.1 }], "Ostré nástroje", "Sharp Tooling", "Várka fabrikátoru +10 % za úroveň karty.", "Fabricator batch +10% per card level."),
  card("c_fabricator_micrometer", "fabricator", 1, [{ stat: "qualityLuck", add: 0.05 }], "Mikrometr", "Micrometer", "Měř dvakrát, vyráběj jednou. Moduly vycházejí kvalitnější.", "Measure twice, build once. Modules come out better."),
  card("c_fabricator_hands", "fabricator", 3, [{ deck: "fabricator", add: 0.25 }, { stat: "craftBatch", add: 0.05 }], "Zlaté ručičky", "Golden Hands", "Várka +25 % a větší dávky všude. Kdo umí, ten umí.", "Batch +25% and bigger batches everywhere. Some people just have the touch."),

  card("c_workshop_bench", "workshop", 0, [{ deck: "workshop", add: 0.1 }], "Uklizený ponk", "Tidy Workbench", "Várka dílny +10 % za úroveň karty. Klíč desítka je konečně na svém místě.", "Workshop batch +10% per card level. The 10 mm wrench is finally where it belongs."),
  card("c_workshop_hand", "workshop", 1, [{ stat: "repairSpeed", add: 0.08 }], "Třetí ruka", "Third Hand", "Někdo ti to konečně podrží. Opravy jsou rychlejší.", "Someone finally holds it for you. Repairs go faster."),
  card("c_workshop_masterpiece", "workshop", 2, [{ deck: "workshop", add: 0.2 }, { stat: "hullMax", add: 0.05 }], "Mistrovský kus", "Masterpiece", "Várka +20 % a pevnější trup. Jeden svar, na který můžeš být hrdý.", "Batch +20% and a tougher hull. One weld you can be proud of."),

  card("c_hangar_scavengers", "hangar", 0, [{ stat: "salvageValue", add: 0.08 }], "Sběrači", "Scavengers", "Drony vybírají z trosek to lepší. Sběr vynese víc.", "The drones pick the good bits out of the wreckage. Salvage pays more."),
  card("c_hangar_swarm", "hangar", 1, [{ stat: "droneCap", add: 0.1 }], "Roj", "Swarm", "Do hangáru se vejde víc dronů, když si lehnou na bok.", "More drones fit in the hangar if they lie on their side."),
  card("c_hangar_schedule", "hangar", 2, [{ stat: "probeYield", add: 0.1 }, { stat: "salvageRate", add: 0.05 }], "Letový řád", "Flight Schedule", "Sondy vozí víc a trosky přibývají. Poprvé v historii lodi někdo letí načas.", "Probes haul more and salvage turns up more often. For once, something aboard runs on time."),

  card("c_lab_whiteboard", "lab", 0, [{ deck: "lab", add: 0.1 }], "Čistá tabule", "Clean Whiteboard", "Výzkum +10 % za úroveň karty. Tolik místa na nové omyly.", "Research +10% per card level. So much room for new mistakes."),
  card("c_lab_review", "lab", 1, [{ stat: "researchRate", add: 0.06 }], "Oponentura", "Peer Review", "KIPP ti čte přes rameno a opravuje chyby. Nahlas.", "KIPP reads over your shoulder and corrects mistakes. Out loud."),
  card("c_lab_eureka", "lab", 3, [{ deck: "lab", add: 0.25 }, { stat: "eventLuck", add: 0.03 }], "Heuréka", "Eureka", "Výzkum +25 % a špetka štěstí. Nejlepší nápady přicházejí ve sprše, a ta je jen jedna.", "Research +25% and a pinch of luck. The best ideas arrive in the shower, and there is only one."),

  card("c_quarters_pillow", "quarters", 0, [{ stat: "moraleGain", add: 0.08 }], "Měkký polštář", "Soft Pillow", "Morálka se obnovuje rychleji. Spánek dělá divy.", "Morale recovers faster. Sleep works wonders."),
  card("c_quarters_school", "quarters", 1, [{ stat: "xpGain", add: 0.1 }], "Stará škola", "Old School", "Zkušení učí nováčky. Většinou i správné věci.", "The veterans teach the rookies. Mostly the right things."),
  card("c_quarters_family", "quarters", 2, [{ stat: "crewCap", add: 0.08 }, { stat: "moraleGain", add: 0.05 }], "Palubní rodina", "Found Family", "Víc lidí a lepší nálada. Hádají se, ale večeří spolu.", "More people and better moods. They argue, but they eat dinner together."),

  card("c_greenhouse_thumb", "greenhouse", 0, [{ deck: "greenhouse", add: 0.1 }], "Zelené prsty", "Green Thumb", "Skleník +10 % za úroveň karty. Rostliny tě poznají po hlase.", "Greenhouse +10% per card level. The plants know you by voice."),
  card("c_greenhouse_beans", "greenhouse", 1, [{ stat: "coffeeUse", add: -0.03 }], "Silná zrna", "Strong Beans", "Silnější káva, menší šálky. Posádka jí vypije méně.", "Stronger coffee, smaller cups. The crew drinks less of it."),
  card("c_greenhouse_harvest", "greenhouse", 2, [{ deck: "greenhouse", add: 0.2 }, { stat: "moraleGain", add: 0.05 }], "Druhá sklizeň", "Second Harvest", "Skleník +20 % a lepší nálada. Čerstvá rajčata dělají s lidmi divy.", "Greenhouse +20% and better moods. Fresh tomatoes do wonders for people."),

  card("c_observatory_mirror", "observatory", 0, [{ stat: "scanSpeed", add: 0.1 }], "Vyleštěné zrcadlo", "Polished Mirror", "Skenování +10 % za úroveň karty. Někdo konečně setřel ten otisk palce.", "Scanning +10% per card level. Someone finally wiped off that thumbprint."),
  card("c_observatory_omen", "observatory", 1, [{ stat: "eventLuck", add: 0.04 }], "Dobré znamení", "Good Omen", "Kdo vidí dál, toho máloco překvapí. Události dopadají líp.", "See further, get surprised less. Events turn out better."),
  card("c_observatory_eye", "observatory", 3, [{ stat: "scanSpeed", add: 0.2 }, { stat: "salvageRate", add: 0.08 }], "Oko do prázdna", "Eye on the Void", "Skenování +20 % a víc trosek. Prázdno se občas podívá zpátky, ale zdvořile.", "Scanning +20% and more salvage. The void sometimes looks back, but politely."),

  card("c_bridge_chair", "bridge", 0, [{ stat: "sellValue", add: 0.04 }], "Kapitánské křeslo", "Captain's Chair", "Z pohodlného křesla se smlouvá líp. Výkupní ceny rostou.", "Haggling goes better from a comfortable chair. Sell prices go up."),
  card("c_bridge_autopilot", "bridge", 1, [{ stat: "offlineEff", add: 0.02 }], "Autopilot s citem", "Gentle Autopilot", "Loď pracuje o něco líp, když jsi pryč. Neptej se jak.", "The ship works a bit better while you are away. Do not ask how."),
  card("c_bridge_shortcut", "bridge", 2, [{ stat: "jumpCharge", add: 0.1 }, { stat: "creditGain", add: 0.04 }], "Zkratka mlhovinou", "Nebula Shortcut", "Rychlejší nabíjení skoku a víc kreditů. Na mapě není, ale funguje.", "Faster jump charge and more credits. It is not on the map, but it works."),
];

export const cards: Record<CardId, CardDef> = byId(cardList);

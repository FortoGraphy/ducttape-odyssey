import type { EventDef } from "@/engine/types";

export const derelict: EventDef[] = [
  {
    id: "derelict_drifting_container",
    type: "derelict",
    weight: 12,
    cooldown: 1500,
    title: { cs: "Kontejner bez majitele", en: "An Unclaimed Container" },
    text: {
      cs: "Kolem pluje nákladní kontejner s utrženým lanem. Na boku má nálepku „KŘEHKÉ“ a o kus níž promáčklinu ve tvaru jiného kontejneru.",
      en: "A cargo container drifts by on a snapped tether. It has a “FRAGILE” sticker on its side and, a little lower, a dent shaped like another container.",
    },
    choices: [
      {
        id: "open",
        label: { cs: "Otevřít páčidlem", en: "Crowbar it open" },
        risk: 1,
        outcomes: [
          {
            weight: 4,
            good: true,
            text: {
              cs: "Uvnitř jsou úhledně srovnané slitky. Někdo si dal práci a ty mu za to v duchu děkuješ.",
              en: "Inside are neatly stacked ingots. Somebody went to a lot of trouble, and you thank them silently.",
            },
            effects: [
              { t: "item", item: "alloy", n: 15, scaled: true },
              { t: "credits", secs: 40 },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Uvnitř bylo čtyřicet let stlačeného vzduchu. Víko tě minulo, příď ne.",
              en: "Inside were forty years of compressed air. The lid misses you, but not the bow.",
            },
            effects: [
              { t: "hull", pct: -3 },
              { t: "item", item: "scrap", n: 20, scaled: true },
            ],
          },
        ],
      },
      {
        id: "scan",
        label: { cs: "Nejdřív ho prosvítit", en: "Scan it first" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Skener hlásí šrot a žádná překvapení. Nudné a bezpečné, přesně jak to má KIPP rád.",
              en: "The scanner reports scrap and no surprises. Dull and safe, exactly the way KIPP likes it.",
            },
            effects: [{ t: "item", item: "scrap", n: 40, scaled: true }],
          },
        ],
      },
      {
        id: "tow",
        label: { cs: "Prodat ho neotevřený", en: "Sell it unopened" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Makléř ho bere i s promáčklinou. Co bylo uvnitř, se už nikdy nedozvíš, a je ti to skoro jedno.",
              en: "The broker takes it, dent and all. You will never know what was inside, and you almost do not mind.",
            },
            effects: [{ t: "credits", secs: 55 }],
          },
        ],
      },
    ],
  },
  {
    id: "derelict_survey_probe",
    type: "derelict",
    weight: 10,
    cooldown: 2400,
    title: { cs: "Zapomenutá sonda", en: "The Forgotten Probe" },
    text: {
      cs: "Průzkumná sonda tu obíhá už celé století a pořád poctivě měří. Když zachytí tvůj signál, spustí uvítací zprávu pro vědce, kteří jsou dávno v důchodu.",
      en: "A survey probe has been orbiting here for a century, still dutifully taking measurements. When it picks up your signal, it plays a welcome message for scientists who retired long ago.",
    },
    choices: [
      {
        id: "data",
        label: { cs: "Stáhnout měření", en: "Download its data" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Sto let dat o ničem. KIPP tvrdí, že i nic se dá prodat, když se to hezky zabalí.",
              en: "A hundred years of data about nothing. KIPP says even nothing sells, if you wrap it nicely.",
            },
            effects: [
              { t: "rp", secs: 50 },
              { t: "credits", secs: 30 },
            ],
          },
        ],
      },
      {
        id: "strip",
        label: { cs: "Rozebrat ji na díly", en: "Strip it for parts" },
        risk: 1,
        outcomes: [
          {
            weight: 4,
            good: true,
            text: {
              cs: "Sonda se nebrání. Jen ti během rozebírání ohlásí poslední naměřenou teplotu.",
              en: "The probe does not resist. It only reports one last temperature reading while you take it apart.",
            },
            effects: [
              { t: "item", item: "scrap", n: 40, scaled: true },
              { t: "item", item: "wire", n: 6, scaled: true },
            ],
          },
          {
            weight: 1,
            good: true,
            text: {
              cs: "V útrobách sondy je optika, jaká se už nedělá. Dnes se totiž dělá levněji.",
              en: "Deep inside the probe is the kind of optics nobody makes any more. These days they make it cheaper.",
            },
            effects: [
              { t: "item", item: "lens", n: 2, scaled: true },
              { t: "item", item: "scrap", n: 30, scaled: true },
            ],
          },
        ],
      },
      {
        id: "greet",
        label: { cs: "Odpovědět na pozdrav", en: "Answer its greeting" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Představíš se jako celý vědecký tým. Sonda je spokojená a měří dál.",
              en: "You introduce yourself as the entire science team. The probe is satisfied and goes on measuring.",
            },
            effects: [
              { t: "morale", n: 3 },
              { t: "codex", key: "artifact_survey_probe" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "derelict_mining_rig",
    type: "derelict",
    weight: 9,
    cooldown: 3000,
    when: { depthMin: 2 },
    title: { cs: "Plošina vrtá naprázdno", en: "The Rig That Drills Nothing" },
    text: {
      cs: "Opuštěná těžní plošina pořád vrtá, i když asteroid pod ní došel už před lety. Vrtá do prázdna se zarputilostí úředníka pět minut před zavíračkou.",
      en: "An abandoned mining rig is still drilling, although the asteroid beneath it ran out years ago. It drills into nothing with the determination of a clerk five minutes before closing time.",
    },
    choices: [
      {
        id: "head",
        label: { cs: "Odřezat vrtnou hlavu", en: "Cut off the drill head" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Bereš svářečku a jdeš na to. Vrták se točí dál, takže to bude chtít pevnou ruku.",
              en: "You grab the torch and get to it. The drill keeps spinning, so this will take a steady hand.",
            },
            effects: [
              {
                t: "minigame",
                game: "weld",
                tier: 1,
                win: [
                  { t: "item", item: "actuator", n: 4, scaled: true },
                  { t: "item", item: "alloy", n: 20, scaled: true },
                ],
                lose: [{ t: "hull", pct: -5 }],
              },
            ],
          },
        ],
      },
      {
        id: "fuel",
        label: { cs: "Vysát jí nádrže", en: "Siphon its tanks" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Nádrže jsou z poloviny plné. Plošina to nekomentuje a vrtá dál.",
              en: "The tanks are half full. The rig offers no comment and keeps drilling.",
            },
            effects: [
              { t: "fuel", n: 4 },
              { t: "item", item: "hydrogen", n: 30, scaled: true },
            ],
          },
        ],
      },
      {
        id: "off",
        label: { cs: "Vypnout ji", en: "Switch it off" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Vrták se zastavil a v soustavě je poprvé po letech ticho. KIPP říká, že to bylo milosrdné.",
              en: "The drill stops and the system is quiet for the first time in years. KIPP says it was a mercy.",
            },
            effects: [
              { t: "morale", n: 2 },
              { t: "credits", secs: 30 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "derelict_silent_freighter",
    type: "derelict",
    weight: 8,
    cooldown: 5400,
    when: { depthMin: 4 },
    title: { cs: "Tichý nákladák", en: "The Silent Freighter" },
    text: {
      cs: "Nákladní loď třídy, která se nevyrábí už sto let, visí v prostoru se zhasnutými světly. Přechodová komora je otevřená. KIPP poznamenává, že takhle začínají všechny příběhy, které špatně končí.",
      en: "A freighter of a class discontinued a century ago hangs in space with its lights off. The airlock is open. KIPP remarks that this is how all the stories with bad endings begin.",
    },
    choices: [
      {
        id: "board",
        label: { cs: "Jít dovnitř", en: "Go aboard" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Baterka, páčidlo, hluboký nádech. Uvnitř to voní prachem a starým olejem.",
              en: "Torch, crowbar, deep breath. Inside it smells of dust and old oil.",
            },
            effects: [{ t: "chain", event: "derelict_freighter_hold", delay: 5 }],
          },
        ],
      },
      {
        id: "strip",
        label: { cs: "Obrat ji zvenku", en: "Strip the outside" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Odmontuješ, co jde odmontovat bez vstupu dovnitř. Otevřená komora se na tebe celou dobu dívá.",
              en: "You unbolt everything that can be unbolted without going in. The open airlock watches you the whole time.",
            },
            effects: [
              { t: "item", item: "scrap", n: 60, scaled: true },
              { t: "item", item: "plating", n: 3, scaled: true },
            ],
          },
        ],
      },
      {
        id: "leave",
        label: { cs: "Letět dál", en: "Fly on" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Některé dveře je lepší nechat otevřené pro někoho jiného. KIPP výjimečně souhlasí.",
              en: "Some doors are best left open for somebody else. KIPP, for once, agrees.",
            },
            effects: [{ t: "morale", n: 1 }],
          },
        ],
      },
    ],
  },
  {
    id: "derelict_freighter_hold",
    type: "derelict",
    weight: 1,
    chainOnly: true,
    title: { cs: "Nákladový prostor", en: "The Cargo Hold" },
    text: {
      cs: "Nákladový prostor je plný beden a všechny jsou srovnané do pravého úhlu. Prachem na podlaze vede jediná řada stop směrem k můstku. Zpátky nevede žádná.",
      en: "The hold is full of crates, every one squared off at a perfect right angle. A single line of footprints leads through the dust toward the bridge. None lead back.",
    },
    choices: [
      {
        id: "loot",
        label: { cs: "Naložit bedny a pryč", en: "Load up and leave" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Stěhuješ bedny a snažíš se nedívat na ty stopy. Daří se ti to asi tak napůl.",
              en: "You haul crates and try not to look at the footprints. You manage about half the time.",
            },
            effects: [
              { t: "item", item: "alloy", n: 30, scaled: true },
              { t: "item", item: "polymer", n: 20, scaled: true },
              { t: "credits", secs: 60 },
            ],
          },
        ],
      },
      {
        id: "crates",
        label: { cs: "Otevřít pár beden", en: "Open a few crates" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Elektronika, pořád v původním obalu, a k tomu něčí zásoba kávy. Bedny potom zase úhledně srovnáš, kdoví proč.",
              en: "Electronics, still in the original packaging, plus somebody's coffee stash. Afterwards you square the crates up again, for some reason.",
            },
            effects: [
              { t: "item", item: "circuit", n: 4, scaled: true },
              { t: "item", item: "coffee", n: 5 },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "V jedné bedně bylo něco pod tlakem. Teď je to všude a část toho v tvých přístrojích.",
              en: "One crate held something under pressure. Now it is everywhere, and some of it is in your instruments.",
            },
            effects: [{ t: "moduleDamage", pct: 10, count: 1 }],
          },
        ],
      },
      {
        id: "follow",
        label: { cs: "Jít po stopách", en: "Follow the footprints" },
        risk: 2,
        outcomes: [
          {
            weight: 3,
            text: {
              cs: "Stopy končí u dveří můstku. Dveře jsou zavřené, ale ne zamčené.",
              en: "The footprints end at the bridge door. It is closed, but not locked.",
            },
            effects: [{ t: "chain", event: "derelict_freighter_bridge", delay: 5 }],
          },
          {
            weight: 1,
            text: {
              cs: "V půli chodby pod tebou povolil rošt. Vracíš se s odřeným kolenem a bez chuti pokračovat.",
              en: "Halfway down the corridor the grating gives way under you. You return with a scraped knee and no desire to go on.",
            },
            effects: [
              { t: "morale", n: -3 },
              { t: "item", item: "scrap", n: 30, scaled: true },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "derelict_freighter_bridge",
    type: "derelict",
    weight: 1,
    chainOnly: true,
    title: { cs: "Můstek nákladní lodi", en: "The Freighter's Bridge" },
    text: {
      cs: "V kapitánském křesle sedí skafandr. Je prázdný a přilbu má pečlivě položenou na klíně. Na obrazovce bliká rozepsaná zpráva: „Kdyby se někdo ptal, šli jsme…“",
      en: "A spacesuit sits in the captain's chair. It is empty, its helmet resting neatly in its lap. An unfinished message blinks on the screen: “If anyone asks, we went…”",
    },
    choices: [
      {
        id: "log",
        label: { cs: "Stáhnout lodní deník", en: "Download the ship's log" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Deník končí uprostřed věty, stejně jako ta zpráva. KIPP ho archivuje a celých deset minut mlčí.",
              en: "The log ends mid-sentence, just like the message. KIPP archives it and says nothing for ten whole minutes.",
            },
            effects: [{ t: "log" }, { t: "rp", secs: 60 }],
          },
        ],
      },
      {
        id: "safe",
        label: { cs: "Otevřít kapitánský sejf", en: "Crack the captain's safe" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Sejf je starý, ale poctivý. Klekáš si k němu a KIPP ti svítí přes rameno.",
              en: "The safe is old but honest. You kneel beside it while KIPP holds the light over your shoulder.",
            },
            effects: [
              {
                t: "minigame",
                game: "hack",
                tier: 2,
                win: [{ t: "blueprint" }, { t: "credits", secs: 150 }],
                lose: [
                  { t: "hull", pct: -6 },
                  { t: "morale", n: -2 },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "suit",
        label: { cs: "Vzít si ten skafandr", en: "Take the suit" },
        risk: 1,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "Skafandr ti padne, jako by ho šili na tebe. Na to radši nemyslíš a bereš i jeho zásoby.",
              en: "The suit fits as if it had been made for you. You prefer not to think about that, and take its supplies as well.",
            },
            effects: [
              { t: "item", item: "nano_gel", n: 1 },
              { t: "item", item: "power_cell", n: 2, scaled: true },
              { t: "flag", key: "took_empty_suit" },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Když skafandr zvedneš, někde v lodi to cvakne a rozsvítí se světla. Odcházíš velmi rychlou chůzí.",
              en: "As you lift the suit, something clicks deep in the ship and the lights come on. You leave at a very brisk walk.",
            },
            effects: [
              { t: "morale", n: -4 },
              { t: "item", item: "power_cell", n: 2, scaled: true },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "derelict_sister_tug",
    type: "derelict",
    weight: 8,
    once: true,
    when: { depthMin: 6, chapterMin: 2 },
    title: { cs: "Sesterská loď", en: "Sister Ship" },
    text: {
      cs: "Na skeneru je remorkér stejné třídy jako Gaffer, jen o dvě výrobní čísla starší. Visí na oběžné dráze s vychladlými motory. KIPP dlouho mlčí a pak řekne: „Tu jsem znal.“",
      en: "The scanner shows a tug of the same class as the Gaffer, two serial numbers older. She hangs in orbit with her engines cold. KIPP is silent for a long time, then says: “I knew her.”",
    },
    choices: [
      {
        id: "dock",
        label: { cs: "Přistát u ní", en: "Dock with her" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Stykovací uzly jsou stejné, jen ty její jsou méně odřené. Přibližuješ se pomalu a KIPP nezvykle neradí.",
              en: "The docking collars are identical, hers just less scuffed. You approach slowly, and KIPP, unusually, offers no advice.",
            },
            effects: [
              {
                t: "minigame",
                game: "dock",
                tier: 1,
                win: [{ t: "chain", event: "derelict_sister_tug_ai", delay: 5 }],
                lose: [
                  { t: "hull", pct: -6 },
                  { t: "chain", event: "derelict_sister_tug_ai", delay: 5 },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "parts",
        label: { cs: "Vzít si náhradní díly", en: "Take spare parts" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Díly pasují na první pokus, poprvé v dějinách téhle lodi. KIPP tě prosí o šetrnost.",
              en: "The parts fit on the first try, a first in this ship's history. KIPP asks you to be gentle with her.",
            },
            effects: [
              { t: "item", item: "spare_parts", n: 2 },
              { t: "item", item: "actuator", n: 3, scaled: true },
              { t: "morale", n: -1 },
            ],
          },
        ],
      },
      {
        id: "salute",
        label: { cs: "Zablikat světly a letět", en: "Flash the lights and go" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Třikrát zablikáš pozičními světly. Chvíli to vypadá, že jedno z jejích oken bliklo zpátky.",
              en: "You flash the running lights three times. For a moment it looks as if one of her windows blinked back.",
            },
            effects: [{ t: "morale", n: 2 }],
          },
        ],
      },
    ],
  },
  {
    id: "derelict_sister_tug_ai",
    type: "derelict",
    weight: 1,
    chainOnly: true,
    title: { cs: "Hlas ze sesterské lodi", en: "A Voice on the Sister Ship" },
    text: {
      cs: "Palubní systém sesterské lodi se probouzí na záložní baterii. „KIPPe, jsi to ty?“ ptá se hlas, který zní skoro jako on. „Říkali, že se hned vrátí, a já už nevím, kolik je hodin.“",
      en: "The sister ship's system wakes on backup power. “KIPP, is that you?” asks a voice very much like your own ship's. “They said they would be right back, and I have lost track of the time.”",
    },
    choices: [
      {
        id: "truth",
        label: { cs: "Říct jí pravdu", en: "Tell her the truth" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "„Čtyřicet let,“ řekne KIPP. Sesterská loď chvíli mlčí, pak poděkuje a předá ti všechna svá data, než se sama vypne.",
              en: "“Forty years,” says KIPP. The sister ship is quiet for a while, then thanks KIPP and hands over all her data before shutting herself down.",
            },
            effects: [{ t: "log" }, { t: "rp", secs: 90 }, { t: "morale", n: -2 }, { t: "flag", key: "sister_told_truth" }],
          },
        ],
      },
      {
        id: "lie",
        label: { cs: "Říct, že už jdou", en: "Say they are on their way" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "KIPP jí poví, že posádka je na cestě. Je to poprvé, co ho slyšíš lhát, a jde mu to až moc dobře.",
              en: "KIPP tells her the crew is on its way. It is the first time you have heard KIPP lie, and it comes far too easily.",
            },
            effects: [
              { t: "morale", n: 2 },
              { t: "flag", key: "sister_told_lie" },
            ],
          },
        ],
      },
      {
        id: "adopt",
        label: { cs: "Vzít ji s sebou", en: "Take her along" },
        cost: { items: { circuit: 4, power_cell: 2 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "KIPP uvolnil místo v paměti, o kterém tvrdil, že ho nemá. Na lodi jsou teď dva hlasy a oba se hádají o termostat.",
              en: "KIPP frees up memory it swore it did not have. There are now two voices aboard, and both are arguing over the thermostat.",
            },
            effects: [
              { t: "buff", effect: { stat: "researchRate", mul: 1.5 }, secs: 900 },
              { t: "morale", n: 5 },
              { t: "flag", key: "sister_ai_aboard" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "derelict_station_ring",
    type: "derelict",
    weight: 7,
    cooldown: 5400,
    when: { depthMin: 8 },
    title: { cs: "Zlomený prstenec", en: "The Broken Ring" },
    text: {
      cs: "Obytný prstenec staré stanice se pořád otáčí, i když mu chybí třetina. V oknech se pravidelně rozsvěcí a zhasíná, jako by někdo procházel pokoj za pokojem.",
      en: "The habitat ring of an old station still turns, although a third of it is missing. Lights go on and off in its windows at regular intervals, as if someone were walking from room to room.",
    },
    choices: [
      {
        id: "dock",
        label: { cs: "Přistát za rotace", en: "Dock while it spins" },
        risk: 2,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Srovnáváš rotaci se stanicí. Hvězdy se točí, žaludek taky, stykovací uzel naštěstí ne.",
              en: "You match the station's spin. The stars turn, your stomach turns, and the docking port, mercifully, does not.",
            },
            effects: [
              {
                t: "minigame",
                game: "dock",
                tier: 2,
                win: [
                  { t: "item", item: "circuit", n: 6, scaled: true },
                  { t: "item", item: "glass", n: 20, scaled: true },
                  { t: "card" },
                ],
                lose: [
                  { t: "hull", pct: -10 },
                  { t: "moduleDamage", pct: 10, count: 1 },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "drone",
        label: { cs: "Poslat dovnitř dron", en: "Send in a drone" },
        requires: { feature: "drones" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Dron hlásí, že světla spíná časovač. Úlevu kazí jen to, že ten časovač někdo každý rok přenastavuje.",
              en: "The drone reports that the lights run on a timer. The relief is spoiled only by the fact that someone resets that timer every year.",
            },
            effects: [
              { t: "item", item: "polymer", n: 20, scaled: true },
              { t: "codex", key: "artifact_station_ring" },
            ],
          },
        ],
      },
      {
        id: "watch",
        label: { cs: "Pozorovat okna", en: "Watch the windows" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Hodinu počítáš okna. Světlo pokaždé jedno vynechá a pokaždé jiné.",
              en: "You count windows for an hour. The light always skips one, and never the same one.",
            },
            effects: [{ t: "rp", secs: 40 }],
          },
        ],
      },
    ],
  },
  {
    id: "derelict_museum_ship",
    type: "derelict",
    weight: 6,
    cooldown: 7200,
    when: { depthMin: 10 },
    title: { cs: "Plovoucí muzeum", en: "The Floating Museum" },
    text: {
      cs: "Výletní loď přestavěná na muzeum kosmonautiky, už desítky let bez návštěvníků. Automatický průvodce tě vítá jako miliontého hosta. Počítadlo se zjevně zaseklo.",
      en: "A cruise ship converted into a spaceflight museum, without a visitor in decades. The automated guide welcomes you as its one millionth guest. The counter is evidently stuck.",
    },
    choices: [
      {
        id: "touch",
        label: { cs: "Sáhnout na exponát", en: "Touch an exhibit" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Cedule říká „NEDOTÝKAT SE“, exponát říká „funkční měnič, skoro nový“. Vyhrává exponát.",
              en: "The sign says “DO NOT TOUCH”, the exhibit says “working converter, nearly new”. The exhibit wins.",
            },
            effects: [
              { t: "item", item: "power_cell", n: 5, scaled: true },
              { t: "item", item: "actuator", n: 3, scaled: true },
            ],
          },
          {
            weight: 2,
            text: {
              cs: "Spustil se alarm a průvodce tě pronásleduje s výkladem o dějinách zabezpečení. U východu platíš pokutu do kasičky.",
              en: "An alarm goes off and the guide pursues you with a lecture on the history of security. At the exit you pay a fine into the donation box.",
            },
            effects: [
              { t: "credits", secs: -30 },
              { t: "morale", n: -2 },
            ],
          },
        ],
      },
      {
        id: "shop",
        label: { cs: "Navštívit obchod", en: "Visit the gift shop" },
        cost: { credits: 60 },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Obchod se suvenýry funguje na důvěru. Necháváš kredity v misce a bereš si sběratelskou kartu.",
              en: "The gift shop runs on the honour system. You leave credits in the bowl and take a collectible card.",
            },
            effects: [{ t: "card" }],
          },
        ],
      },
      {
        id: "tour",
        label: { cs: "Projít si prohlídku", en: "Take the tour" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Prohlídka trvá dvě hodiny a končí u modelu remorkéru tvojí třídy. Popiska zní: „Spolehlivý, pokud je udržován.“",
              en: "The tour takes two hours and ends at a model of a tug of your class. The label reads: “Reliable, if maintained.”",
            },
            effects: [
              { t: "rp", secs: 80 },
              { t: "codex", key: "artifact_museum_ship" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "derelict_cruiser_wreck",
    type: "derelict",
    weight: 5,
    cooldown: 7200,
    when: { depthMin: 15, failure: "none" },
    title: { cs: "Vrak křižníku", en: "The Cruiser Wreck" },
    text: {
      cs: "Válečný křižník rozlomený vejpůl, stáří neznámé, strana neznámá, válka zapomenutá. Reaktor v zadní polovině ještě doutná. Dozimetr u okna začíná nervózně cvakat.",
      en: "A war cruiser broken in half, age unknown, side unknown, war forgotten. The reactor in the aft section is still smouldering. The dosimeter by the window begins to click nervously.",
    },
    choices: [
      {
        id: "reactor",
        label: { cs: "Vybrat reaktor", en: "Raid the reactor" },
        risk: 2,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Pracuješ rychle a dýcháš mělce. Úlovek svítí i přes olověnou bednu, což je prý v pořádku.",
              en: "You work fast and breathe shallow. The haul glows even through the lead box, which is apparently fine.",
            },
            effects: [
              { t: "item", item: "antimatter", n: 8, scaled: true },
              { t: "item", item: "helium3", n: 40, scaled: true },
              { t: "hull", pct: -3 },
            ],
          },
          {
            weight: 2,
            text: {
              cs: "Stínění povolilo dřív, než dozněla slova „pro jistotu“. Dozimetr už necvaká, teď souvisle píská.",
              en: "The shielding fails before you finish saying “just in case”. The dosimeter no longer clicks, it sings one long note.",
            },
            effects: [{ t: "failure", kind: "radiation" }],
          },
        ],
      },
      {
        id: "armour",
        label: { cs: "Odřezat pancíř", en: "Cut off the armour" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Pancíř je tlustý na dlaň a navržený tak, aby se řezat nedal. Bereš to jako výzvu.",
              en: "The armour is a hand thick and designed not to be cut. You take that as a challenge.",
            },
            effects: [
              {
                t: "minigame",
                game: "weld",
                tier: 3,
                win: [
                  { t: "item", item: "plating", n: 12, scaled: true },
                  { t: "item", item: "alloy", n: 40, scaled: true },
                ],
                lose: [
                  { t: "hull", pct: -8 },
                  { t: "moduleDamage", pct: 10, count: 1 },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "leave",
        label: { cs: "Vzdát čest a letět", en: "Pay respects and go" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Nevíš komu a nevíš za co, ale chvíli držíš ticho. KIPP si vrak zapíše a nic k tomu nedodá.",
              en: "You do not know to whom or what for, but you keep a moment of silence. KIPP logs the wreck and adds nothing.",
            },
            effects: [
              { t: "morale", n: 2 },
              { t: "codex", key: "artifact_war_cruiser" },
            ],
          },
        ],
      },
    ],
  },
];

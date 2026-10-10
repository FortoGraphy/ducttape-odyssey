import type { EventDef } from "@/engine/types";

export const pirates: EventDef[] = [
  {
    id: "pirates_amateurs",
    type: "pirates",
    weight: 10,
    cooldown: 3600,
    when: { depthMin: 1, depthMax: 6 },
    title: { cs: "Přepadení, asi", en: "A Robbery, Probably" },
    text: {
      cs: "Cestu vám zkřížil člun slepený ze tří jiných člunů. Z vysílačky se ozve mutující hlas: „Tohle je přepadení! Teda, jestli to nevadí.“",
      en: "A skiff assembled from three other skiffs cuts across your bow. A cracking young voice comes over the radio: “This is a robbery! I mean, if that is all right with you.”",
    },
    choices: [
      {
        id: "bluff",
        label: { cs: "Zablufovat flotilu", en: "Bluff a fleet" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "KIPP pustil do éteru nahrávku dvanácti bitevních lodí. Piráti se omluvili a nechali vám tu výpalné.",
              en: "KIPP plays a recording of twelve warships over the radio. The pirates apologise and leave you a protection fee.",
            },
            effects: [{ t: "credits", secs: 60 }],
          },
          {
            weight: 1,
            text: {
              cs: "Nahrávka se zasekla na reklamě na prací prášek. Piráti se smějí a berou si pár beden.",
              en: "The recording jams on a washing powder advert. The pirates laugh and help themselves to a few crates.",
            },
            effects: [{ t: "loseCargo", pct: 5 }],
          },
        ],
      },
      {
        id: "pay",
        label: { cs: "Dát jim kapesné", en: "Give them pocket money" },
        cost: { credits: 30 },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Dostali kapesné a k tomu přednášku o volbě povolání. Vypadali vděčně za obojí.",
              en: "They get pocket money and a lecture on career choices. They seem grateful for both.",
            },
            effects: [
              { t: "rep", faction: "rustborn", n: 2 },
              { t: "chain", event: "pirates_amateurs_return", delay: 900 },
            ],
          },
        ],
      },
      {
        id: "fight",
        label: { cs: "Vystřelit před příď", en: "Fire across their bow" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Míříte těsně vedle. Oni míří na vás, takže taky těsně vedle.",
              en: "You aim to miss. They aim at you, which also means a miss.",
            },
            effects: [
              {
                t: "minigame",
                game: "defense",
                tier: 1,
                win: [
                  { t: "item", item: "scrap", n: 40, scaled: true },
                  { t: "credits", secs: 40 },
                ],
                lose: [{ t: "hull", pct: -6 }],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "pirates_amateurs_return",
    type: "pirates",
    weight: 1,
    chainOnly: true,
    title: { cs: "Vracejí se s dárkem", en: "Back With a Gift" },
    text: {
      cs: "Ten slepený člun je zpátky. „Dali jsme na vás a děláme teď do legálního šrotu,“ hlásí hrdě známý hlas. „Tohle je pro vás.“",
      en: "The patchwork skiff is back. “We took your advice and went into legal scrap,” the familiar voice reports proudly. “This is for you.”",
    },
    choices: [
      {
        id: "accept",
        label: { cs: "Přijmout s díky", en: "Accept with thanks" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Bedna je převázaná kabelem na mašli. Uvnitř jsou náhradní díly, dokonce jen lehce kradené.",
              en: "The crate is tied with a cable bow. Inside are spare parts, and only slightly stolen ones.",
            },
            effects: [
              { t: "item", item: "spare_parts", n: 2 },
              { t: "item", item: "scrap", n: 50, scaled: true },
              { t: "rep", faction: "rustborn", n: 3 },
            ],
          },
        ],
      },
      {
        id: "mentor",
        label: { cs: "Přidat pár rad", en: "Add some more advice" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Hodinu jim po vysílačce vysvětlujete svařování. Na oplátku dostáváte mapu jejich oblíbených vraků.",
              en: "You spend an hour teaching welding over the radio. In return you get a map of their favourite wrecks.",
            },
            effects: [
              { t: "buff", effect: { stat: "salvageRate", mul: 1.3 }, secs: 600 },
              { t: "morale", n: 4 },
              { t: "rep", faction: "rustborn", n: 2 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "pirates_toll_gate",
    type: "pirates",
    weight: 9,
    cooldown: 3600,
    when: { depthMin: 3 },
    title: { cs: "Mýtná brána", en: "The Toll Gate" },
    text: {
      cs: "Přes plavební koridor někdo natáhl řetěz a pověsil ceduli „MÝTO“. U řetězu parkuje ozbrojená kocábka a tváří se úředně.",
      en: "Someone has strung a chain across the shipping lane and hung a sign that says “TOLL”. An armed tub is parked beside it, trying to look official.",
    },
    choices: [
      {
        id: "pay",
        label: { cs: "Zaplatit mýto", en: "Pay the toll" },
        cost: { credits: 60 },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Dostali jste účtenku psanou fixou. KIPP ji s vážnou tváří zakládá do daňových podkladů.",
              en: "You receive a receipt written in marker pen. KIPP files it under tax records with a straight face.",
            },
            effects: [{ t: "morale", n: 1 }],
          },
        ],
      },
      {
        id: "bluff",
        label: { cs: "Mávnout starou známkou", en: "Flash an expired pass" },
        risk: 1,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "Výběrčí známku dlouho zkoumá a pak zasalutuje. Letopočty zřejmě nejsou jeho silná stránka.",
              en: "The collector studies the pass for a long time, then salutes. Dates are clearly not his strong suit.",
            },
            effects: [{ t: "credits", secs: 40 }],
          },
          {
            weight: 2,
            text: {
              cs: "Známka propadla před čtyřiceti lety, což poznal i on. Platíte mýto a pokutu k tomu.",
              en: "The pass expired forty years ago, and even he can tell. You pay the toll and a fine on top.",
            },
            effects: [{ t: "credits", secs: -90 }],
          },
        ],
      },
      {
        id: "ram",
        label: { cs: "Prorazit řetěz", en: "Ram the chain" },
        risk: 2,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "Řetěz povolil dřív než vaše příď. Kus si ho vezete s sebou jako trofej.",
              en: "The chain gives way before your bow does. You carry a length of it off as a trophy.",
            },
            effects: [
              { t: "hull", pct: -3 },
              { t: "item", item: "scrap", n: 40, scaled: true },
            ],
          },
          {
            weight: 2,
            text: {
              cs: "Řetěz byl kvalitnější než zbytek jejich podniku. Příď má novou vrásku.",
              en: "The chain turns out to be better made than the rest of their business. The bow has a new wrinkle.",
            },
            effects: [{ t: "hull", pct: -9 }],
          },
        ],
      },
    ],
  },
  {
    id: "pirates_rustborn_raiders",
    type: "pirates",
    weight: 8,
    cooldown: 4200,
    when: { depthMin: 5, rep: { faction: "rustborn", max: 20 } },
    title: { cs: "Nájezd Rezavých", en: "Rustborn Raiders" },
    text: {
      cs: "Tři lodě Rezavých vás obkličují s grácií padajícího lešení. „Odevzdejte všechno, co se leskne,“ zní z vysílačky. „A co se neleskne, taky.“",
      en: "Three Rustborn ships box you in with the grace of collapsing scaffolding. “Hand over everything shiny,” says the radio. “And everything that is not shiny, too.”",
    },
    choices: [
      {
        id: "fight",
        label: { cs: "Bránit se", en: "Fight them off" },
        risk: 2,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Jejich lodě drží pohromadě jen silou vůle. Stačí mířit na tu vůli.",
              en: "Their ships are held together by willpower alone. You only have to aim for the willpower.",
            },
            effects: [
              {
                t: "minigame",
                game: "defense",
                tier: 2,
                win: [
                  { t: "item", item: "plating", n: 6, scaled: true },
                  { t: "item", item: "scrap", n: 80, scaled: true },
                  { t: "rep", faction: "rustborn", n: -3 },
                ],
                lose: [
                  { t: "hull", pct: -12 },
                  { t: "loseCargo", pct: 10 },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "bribe",
        label: { cs: "Uplatit je šrotem", en: "Buy them off with scrap" },
        cost: { items: { scrap: 40 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Šrot je pro Rezavé něco jako čokoláda. Odlétají spokojení a skoro zdvořilí.",
              en: "To the Rustborn, scrap is something like chocolate. They leave content and almost polite.",
            },
            effects: [{ t: "rep", faction: "rustborn", n: 3 }],
          },
        ],
      },
      {
        id: "bluff",
        label: { cs: "Předstírat nákazu", en: "Fake a plague" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Kašlete do vysílačky tak přesvědčivě, že KIPP nabízí čaj. Rezaví couvají a z dálky vám ještě hodí léky.",
              en: "You cough into the radio so convincingly that KIPP offers tea. The Rustborn back away and toss you medicine from a distance.",
            },
            effects: [{ t: "item", item: "nano_gel", n: 1 }],
          },
          {
            weight: 2,
            text: {
              cs: "„My jsme očkovaní,“ odpoví velitelka. Bere si svůj díl nákladu a přeje brzké uzdravení.",
              en: "“We are vaccinated,” the captain replies. She takes her share of the cargo and wishes you a speedy recovery.",
            },
            effects: [{ t: "loseCargo", pct: 8 }],
          },
        ],
      },
    ],
  },
  {
    id: "pirates_boarding_party",
    type: "pirates",
    weight: 6,
    cooldown: 7200,
    when: { depthMin: 8, failure: "none" },
    title: { cs: "Háky na trupu", en: "Hooks on the Hull" },
    text: {
      cs: "Na trup dosedly magnetické kotvy a u přechodové komory se rozjela vrtačka. KIPP oznamuje neohlášenou návštěvu a ptá se, jestli má dát vařit vodu.",
      en: "Magnetic anchors thump onto the hull and a drill starts up at the airlock. KIPP announces unscheduled visitors and asks whether to put the kettle on.",
    },
    choices: [
      {
        id: "lock",
        label: { cs: "Zamknout jim dveře", en: "Lock them out" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Rvete se s jejich dekodérem o každý zámek. Je to šachová partie, jen se u ní víc nadává.",
              en: "You fight their decoder for every lock. It is a chess match, only with more swearing.",
            },
            effects: [
              {
                t: "minigame",
                game: "hack",
                tier: 2,
                win: [
                  { t: "credits", secs: 120 },
                  { t: "item", item: "spare_parts", n: 2 },
                ],
                lose: [{ t: "failure", kind: "boarding" }],
              },
            ],
          },
        ],
      },
      {
        id: "pay",
        label: { cs: "Vydat část nákladu", en: "Hand over some cargo" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Odnesli si bedny a slušně poděkovali. Vrtačku tu zapomněli, takže obchod to nebyl úplně špatný.",
              en: "They carry off the crates and thank you nicely. They forget the drill, so the deal is not all bad.",
            },
            effects: [
              { t: "loseCargo", pct: 15 },
              { t: "item", item: "spare_parts", n: 1 },
            ],
          },
        ],
      },
      {
        id: "vent",
        label: { cs: "Odvětrat komoru", en: "Vent the airlock" },
        risk: 2,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Komora si odfrkla a návštěva pokračuje vesmírem bez lodi. Jejich člun zůstal přicvaknutý k vašemu trupu.",
              en: "The airlock sneezes and your visitors continue through space without a ship. Their skiff stays clamped to your hull.",
            },
            effects: [
              { t: "item", item: "scrap", n: 100, scaled: true },
              { t: "item", item: "fuel_cell", n: 1 },
            ],
          },
          {
            weight: 2,
            text: {
              cs: "Dva se stihli chytit zábradlí. Teď jsou uvnitř a mají velmi špatnou náladu.",
              en: "Two of them manage to grab the railing. Now they are inside and in a very bad mood.",
            },
            effects: [{ t: "failure", kind: "boarding" }],
          },
        ],
      },
    ],
  },
  {
    id: "pirates_tax_inspector",
    type: "pirates",
    weight: 8,
    cooldown: 4800,
    when: { depthMin: 6 },
    title: { cs: "Inspektor neformálních daní", en: "Inspector of Informal Taxes" },
    text: {
      cs: "Zastavila vás loď s majákem ukradeným ze sanitky. Muž v uniformě sešité z několika jiných uniforem oznamuje, že dlužíte daň z průletu, z existence a z prodlení.",
      en: "A ship with a beacon stolen from an ambulance pulls you over. A man in a uniform sewn from several other uniforms informs you that you owe transit tax, existence tax and a late fee.",
    },
    choices: [
      {
        id: "pay",
        label: { cs: "Zaplatit „daň“", en: "Pay the “tax”" },
        cost: { credits: 75 },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Vystavil vám potvrzení s razítkem z brambory. KIPP ho považuje za nejvěrohodnější doklad na palubě.",
              en: "He issues a receipt stamped with a carved potato. KIPP considers it the most credible document on board.",
            },
            effects: [{ t: "morale", n: 1 }],
          },
        ],
      },
      {
        id: "forms",
        label: { cs: "Zavalit ho formuláři", en: "Bury him in paperwork" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Žádáte o odklad, odvolání a kopii ve trojím vyhotovení. Inspektor bledne a prchá, Tichá kniha vám posílá pochvalu.",
              en: "You request a deferral, an appeal and copies in triplicate. The inspector goes pale and flees, and the Quiet Ledger sends a commendation.",
            },
            effects: [
              { t: "rep", faction: "ledger", n: 3 },
              { t: "credits", secs: 50 },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Inspektor má vlastní formuláře a jsou delší. Odlétáte lehčí o poplatek za zpracování.",
              en: "The inspector has forms of his own, and they are longer. You leave lighter by one processing fee.",
            },
            effects: [{ t: "credits", secs: -60 }],
          },
        ],
      },
      {
        id: "fight",
        label: { cs: "Zabavit mu maják", en: "Confiscate his beacon" },
        risk: 2,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Oznamujete mu, že provádíte protikontrolu. Odpovídá střelbou, což je zřejmě odvolání.",
              en: "You inform him this is a counter-inspection. He replies with gunfire, which is presumably an appeal.",
            },
            effects: [
              {
                t: "minigame",
                game: "defense",
                tier: 2,
                win: [
                  { t: "item", item: "beacon", n: 1 },
                  { t: "credits", secs: 80 },
                ],
                lose: [{ t: "hull", pct: -10 }],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "pirates_granny_hatchet",
    type: "pirates",
    weight: 6,
    cooldown: 7200,
    when: { depthMin: 10 },
    title: { cs: "Babička Sekyra", en: "Granny Hatchet" },
    text: {
      cs: "Pirátka, o které se vyprávělo už v dobách, kdy tahle loď měla záruku. Místo salvy vám posílá zprávu: „Střílet mě už nebaví. Umíš mariáš?“",
      en: "A pirate who was already a legend back when this ship had a warranty. Instead of a broadside she sends a message: “Shooting bores me now. Do you play cards?”",
    },
    choices: [
      {
        id: "play",
        label: { cs: "Zahrát si s ní", en: "Play a hand" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Rozdává po vysílačce a podvádí tak elegantně, že je to vlastně pocta. KIPP vám radí, bohužel nahlas.",
              en: "She deals over the radio and cheats so gracefully it is almost a compliment. KIPP advises you, unfortunately out loud.",
            },
            effects: [
              {
                t: "minigame",
                game: "hack",
                tier: 2,
                win: [{ t: "card" }, { t: "credits", secs: 100 }],
                lose: [
                  { t: "credits", secs: -60 },
                  { t: "morale", n: 2 },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "coffee",
        label: { cs: "Pozvat ji na kávu", en: "Invite her for coffee" },
        cost: { items: { coffee: 3 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Dvě hodiny vypráví o starých časech a o svých kolenou. Při odchodu vám nechá plány něčeho, co prý už nebude potřebovat.",
              en: "For two hours she talks about the old days and her knees. On her way out she leaves you plans for something she says she will not need again.",
            },
            effects: [{ t: "blueprint" }, { t: "morale", n: 4 }],
          },
        ],
      },
      {
        id: "run",
        label: { cs: "Vzít nohy na ramena", en: "Make a run for it" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Nehoní vás. Jen za vámi pošle zprávu, že dnešní mládež nemá žádnou výdrž.",
              en: "She does not give chase. She only sends a message after you, saying young people today have no stamina.",
            },
            effects: [{ t: "fuel", n: -2 }],
          },
        ],
      },
    ],
  },
  {
    id: "pirates_ghost_drones",
    type: "pirates",
    weight: 6,
    cooldown: 7200,
    when: { depthMin: 12 },
    title: { cs: "Výpalné pro nebožtíka", en: "Ransom for a Dead Man" },
    text: {
      cs: "Obklíčil vás roj pirátských dronů a žádá výkupné na účet, který zanikl i s majitelem před třiceti lety. Drony to nevědí. Nikdo jim to neřekl.",
      en: "A swarm of pirate drones surrounds you, demanding ransom to an account that died with its owner thirty years ago. The drones do not know. Nobody told them.",
    },
    choices: [
      {
        id: "hack",
        label: { cs: "Přepsat jim příkazy", en: "Rewrite their orders" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Jejich kód je plný poznámek typu „opravit později“. Cítíte se tam jako doma.",
              en: "Their code is full of comments like “fix later”. You feel right at home.",
            },
            effects: [
              {
                t: "minigame",
                game: "hack",
                tier: 3,
                win: [
                  { t: "item", item: "circuit", n: 8, scaled: true },
                  { t: "item", item: "power_cell", n: 3, scaled: true },
                  { t: "rp", secs: 60 },
                ],
                lose: [{ t: "moduleDamage", pct: 15, count: 2 }],
              },
            ],
          },
        ],
      },
      {
        id: "shoot",
        label: { cs: "Rozstřílet roj", en: "Shoot the swarm" },
        risk: 2,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Je jich hodně, jsou malé a berou to osobně. Usedáte k laseru.",
              en: "There are many of them, they are small, and they take it personally. You sit down at the laser.",
            },
            effects: [
              {
                t: "minigame",
                game: "defense",
                tier: 3,
                win: [
                  { t: "item", item: "scrap", n: 120, scaled: true },
                  { t: "item", item: "wire", n: 15, scaled: true },
                ],
                lose: [{ t: "hull", pct: -14 }],
              },
            ],
          },
        ],
      },
      {
        id: "pay",
        label: { cs: "Zaplatit do prázdna", en: "Pay into the void" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Platba odešla na účet, který neexistuje. Drony zdvořile poděkovaly a vystavily doklad.",
              en: "The payment goes to an account that does not exist. The drones thank you politely and issue a receipt.",
            },
            effects: [{ t: "credits", secs: -60 }],
          },
        ],
      },
    ],
  },
  {
    id: "pirates_ambush",
    type: "pirates",
    weight: 1,
    chainOnly: true,
    title: { cs: "Byla to past", en: "It Was a Trap" },
    text: {
      cs: "Tísňový signál zhasl a z trosek vyplouvají dvě lodě se zhasnutými světly. „Dík, že jste přiletěli,“ ozve se z vysílačky. „Většina lidí už na to neskáče.“",
      en: "The distress call cuts out and two dark ships slide from the wreckage. “Thanks for coming,” says the radio. “Most people do not fall for this any more.”",
    },
    choices: [
      {
        id: "fight",
        label: { cs: "Probít se ven", en: "Shoot your way out" },
        risk: 2,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Past má jednu slabinu: postavili ji lidé, kteří šetří na všem. Míříte na tu slabinu.",
              en: "The trap has one weakness: it was built by people who cut every corner. You aim for the corners.",
            },
            effects: [
              {
                t: "minigame",
                game: "defense",
                tier: 2,
                win: [
                  { t: "credits", secs: 120 },
                  { t: "item", item: "plating", n: 5, scaled: true },
                ],
                lose: [
                  { t: "hull", pct: -12 },
                  { t: "loseCargo", pct: 10 },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "shame",
        label: { cs: "Zahrát na svědomí", en: "Appeal to their conscience" },
        risk: 1,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "Ptáte se, co by tomu řekly jejich mámy. Po dlouhém tichu vás nechají jít a jeden z nich se omlouvá.",
              en: "You ask what their mothers would say. After a long silence they let you go, and one of them apologises.",
            },
            effects: [
              { t: "morale", n: 3 },
              { t: "rep", faction: "rustborn", n: 1 },
            ],
          },
          {
            weight: 2,
            text: {
              cs: "Jejich máma velí té druhé lodi. Rozhovor skončil rychle a draze.",
              en: "Their mother commands the other ship. The conversation ends quickly and expensively.",
            },
            effects: [
              { t: "loseCargo", pct: 10 },
              { t: "hull", pct: -5 },
            ],
          },
        ],
      },
      {
        id: "dump",
        label: { cs: "Vyklopit náklad", en: "Dump the cargo" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Hodili jste jim pár beden a zmizeli, než je stihli spočítat. KIPP navrhuje příště nezvedat cizí telefony.",
              en: "You toss them a few crates and vanish before they finish counting. KIPP suggests not answering other people's calls next time.",
            },
            effects: [{ t: "loseCargo", pct: 12 }],
          },
        ],
      },
    ],
  },
];

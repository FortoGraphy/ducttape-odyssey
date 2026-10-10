import type { EventDef } from "@/engine/types";

export const merchant: EventDef[] = [
  {
    id: "merchant_peddler",
    type: "merchant",
    weight: 10,
    cooldown: 1800,
    title: { cs: "Podomní obchodník", en: "The Door-to-Door Trader" },
    text: {
      cs: "Na přechodovou komoru někdo klepe. Zvenku. Stojí tam mužík ve skafandru polepeném samolepkami a ptá se, jestli máte chvilku na izolepu.",
      en: "Someone is knocking on the airlock. From outside. A small man in a sticker-covered suit asks whether you have a moment to talk about duct tape.",
    },
    choices: [
      {
        id: "buy",
        label: { cs: "Koupit izolepu", en: "Buy some tape" },
        cost: { credits: 40 },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Tři role, skoro nové. Jedna je dokonce ještě ve fólii.",
              en: "Three rolls, nearly new. One is even still in its wrapper.",
            },
            effects: [{ t: "item", item: "duct_tape", n: 3 }],
          },
        ],
      },
      {
        id: "swap",
        label: { cs: "Vyměnit za šrot", en: "Trade scrap for it" },
        cost: { items: { scrap: 20 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Šrot váží na ruční váze a mhouří u toho oko. Dostáváte dvě role a pocit, že vás vzal na hůl jen trochu.",
              en: "He weighs the scrap on a hand scale, squinting. You get two rolls and the feeling you were only slightly fleeced.",
            },
            effects: [{ t: "item", item: "duct_tape", n: 2 }],
          },
        ],
      },
      {
        id: "chat",
        label: { cs: "Jen pokecat", en: "Just have a chat" },
        risk: 0,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Půl hodiny probíráte ceny šroubů. Je to nejlepší rozhovor za poslední roky s někým, kdo nemá sériové číslo.",
              en: "You discuss screw prices for half an hour. It is the best conversation in years with someone who has no serial number.",
            },
            effects: [{ t: "morale", n: 3 }],
          },
          {
            weight: 1,
            good: true,
            text: {
              cs: "Na rozloučenou vám vtiskne do ruky vzorek zdarma. „Až dojde, víte, kde mě najdete,“ říká, i když to nevíte.",
              en: "On his way out he presses a free sample into your hand. “When it runs out, you know where to find me,” he says, although you do not.",
            },
            effects: [
              { t: "item", item: "duct_tape", n: 1 },
              { t: "morale", n: 2 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "merchant_vending_machine",
    type: "merchant",
    weight: 10,
    cooldown: 2400,
    title: { cs: "Automat ve vakuu", en: "Vending Machine, Adrift" },
    text: {
      cs: "Vesmírem pluje nápojový automat a pořád svítí. Na displeji běží nápis „VHOĎTE MINCI“ a pod ním menším písmem „PROSÍM“.",
      en: "A vending machine drifts through space, still lit. Its display scrolls “INSERT COIN” and, in smaller letters underneath, “PLEASE”.",
    },
    choices: [
      {
        id: "coin",
        label: { cs: "Vhodit kredit", en: "Insert a credit" },
        cost: { credits: 20 },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Automat zavrčel a vydal balíček náhradních dílů. Datum spotřeby raději nečtete.",
              en: "The machine growls and delivers a pack of spare parts. You choose not to read the best-before date.",
            },
            effects: [{ t: "item", item: "spare_parts", n: 1 }],
          },
          {
            weight: 1,
            good: true,
            text: {
              cs: "Uvnitř něco cvaklo a automat vysypal všechno, co měl. Včetně drobných po předchozích zákaznících.",
              en: "Something clicks inside and the machine empties everything it has. Including the previous customers' change.",
            },
            effects: [
              { t: "item", item: "fuel_cell", n: 1 },
              { t: "item", item: "coffee", n: 5 },
              { t: "credits", secs: 60 },
            ],
          },
          {
            weight: 2,
            text: {
              cs: "Automat kredit spolkl a napsal „DĚKUJEME“. Nevypadlo nic.",
              en: "The machine swallows the credit and displays “THANK YOU”. Nothing comes out.",
            },
            effects: [{ t: "morale", n: -1 }],
          },
        ],
      },
      {
        id: "shake",
        label: { cs: "Zatřást s ním", en: "Give it a shake" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Dva dobře mířené šťouchance manipulátorem a automat přehodnotil svůj postoj.",
              en: "Two well-placed nudges with the manipulator arm and the machine reconsiders its position.",
            },
            effects: [
              { t: "item", item: "coffee", n: 4 },
              { t: "item", item: "scrap", n: 20, scaled: true },
            ],
          },
          {
            weight: 2,
            text: {
              cs: "Automat se bránil. Nevíte jak, ale příď je odřená a on svítí o něco spokojeněji.",
              en: "The machine fights back. You are not sure how, but the bow is scuffed and it glows a little more smugly.",
            },
            effects: [{ t: "hull", pct: -2 }],
          },
        ],
      },
      {
        id: "leave",
        label: { cs: "Nechat ho plout", en: "Let it drift" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Automat se pomalu vzdaluje a svítí dál. Někde tam venku pořád čeká na zákazníka.",
              en: "The machine drifts slowly away, still glowing. Somewhere out there it is still waiting for a customer.",
            },
            effects: [{ t: "morale", n: 1 }],
          },
        ],
      },
    ],
  },
  {
    id: "merchant_lamplighter_caravan",
    type: "merchant",
    weight: 9,
    cooldown: 3000,
    when: { depthMin: 3, feature: "nav" },
    title: { cs: "Karavana lampářů", en: "Lamplighter Caravan" },
    text: {
      cs: "Kolem táhne karavana Cechu lampářů, dvanáct lodí ověšených lucernami jako pouť. Vedoucí nabízí obchod a přísahá, že ceny jsou „skoro nákupní“.",
      en: "A Lamplighters Guild caravan trundles past, twelve ships strung with lanterns like a travelling fair. The caravan master offers to trade and swears the prices are “practically wholesale”.",
    },
    choices: [
      {
        id: "fuel",
        label: { cs: "Dotankovat u nich", en: "Top up the tank" },
        cost: { credits: 60 },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Tankují vám z konve, která vypadá jako starožitnost. Palivo je ale čisté a ještě vám umyli okno.",
              en: "They fill you up from a can that looks like an antique. The fuel is clean, though, and they even wash your window.",
            },
            effects: [
              { t: "fuel", n: 8 },
              { t: "rep", faction: "lamplighters", n: 1 },
            ],
          },
        ],
      },
      {
        id: "sell",
        label: { cs: "Prodat jim přebytky", en: "Sell them your surplus" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Berou i to, co jste chtěli vyhodit. Hlavně to, co jste chtěli vyhodit.",
              en: "They take even the things you meant to throw away. Especially the things you meant to throw away.",
            },
            effects: [
              { t: "loseCargo", pct: 5 },
              { t: "credits", secs: 110 },
              { t: "rep", faction: "lamplighters", n: 1 },
            ],
          },
        ],
      },
      {
        id: "haggle",
        label: { cs: "Smlouvat do krve", en: "Haggle to the bone" },
        risk: 1,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "Smlouváte tak dlouho, až vám přidají lucernu, jen abyste už šli. Svítí hezky a účet taky.",
              en: "You haggle for so long that they throw in a lantern just to make you leave. It glows nicely, and so does the invoice.",
            },
            effects: [
              { t: "loseCargo", pct: 5 },
              { t: "credits", secs: 170 },
            ],
          },
          {
            weight: 2,
            text: {
              cs: "Vedoucí karavany smlouvá déle, než vy žijete. Odlétáte s horší cenou a s cennou lekcí.",
              en: "The caravan master has been haggling longer than you have been alive. You leave with a worse price and a valuable lesson.",
            },
            effects: [
              { t: "loseCargo", pct: 5 },
              { t: "credits", secs: 40 },
              { t: "rep", faction: "lamplighters", n: -1 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "merchant_coffee_smuggler",
    type: "merchant",
    weight: 9,
    cooldown: 3600,
    when: { feature: "crew" },
    title: { cs: "Pašerák kávy", en: "The Coffee Smuggler" },
    text: {
      cs: "Nenápadná loď bliká smluveným signálem, který neznáte. Muž s kruhy pod očima šeptá do vysílačky: „Mám zrna. Pravá, žádnou cikorku.“",
      en: "An unremarkable ship flashes a secret signal you do not know. A man with shadows under his eyes whispers over the radio: “I have beans. The real thing, no chicory.”",
    },
    choices: [
      {
        id: "buy",
        label: { cs: "Koupit zásobu", en: "Stock up" },
        cost: { credits: 50 },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Pytel voní tak, že se z ubikací ozývá potlesk. Pašerák mizí dřív, než stihnete říct „účtenka“.",
              en: "The sack smells so good that applause breaks out in the quarters. The smuggler is gone before you can say “receipt”.",
            },
            effects: [
              { t: "item", item: "coffee", n: 20 },
              { t: "morale", n: 3 },
            ],
          },
        ],
      },
      {
        id: "taste",
        label: { cs: "Chtít ochutnávku", en: "Ask for a taste first" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Ochutnávka je tak silná, že chvíli vidíte zvuky. Pašerák se směje a přihodí pytlík na cestu.",
              en: "The sample is so strong that you briefly see sounds. The smuggler laughs and tosses in a bag for the road.",
            },
            effects: [
              { t: "item", item: "coffee", n: 6 },
              { t: "buff", effect: { stat: "craftSpeed", mul: 1.2 }, secs: 300 },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Byla to cikorka.",
              en: "It was chicory.",
            },
            effects: [{ t: "morale", n: -3 }],
          },
        ],
      },
      {
        id: "report",
        label: { cs: "Nahlásit ho Tiché knize", en: "Report him to the Ledger" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Tichá kniha děkuje za spolupráci formulářem o šesti stranách. Posádka se dozvěděla, kdo za to může, a mlčí velmi hlasitě.",
              en: "The Quiet Ledger thanks you with a six-page form. The crew has found out who is responsible and is being silent very loudly.",
            },
            effects: [
              { t: "rep", faction: "ledger", n: 3 },
              { t: "rep", faction: "lamplighters", n: -2 },
              { t: "morale", n: -3 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "merchant_ledger_audit",
    type: "merchant",
    weight: 7,
    cooldown: 5400,
    when: { depthMin: 6, feature: "station" },
    title: { cs: "Dobrovolný audit", en: "A Voluntary Audit" },
    text: {
      cs: "Šedá loď Tiché knihy se zařadila vedle vás bez jediného zvuku. Auditorka nabízí dobrovolnou kontrolu účetnictví. Slovo „dobrovolnou“ vyslovuje velmi pečlivě.",
      en: "A grey ship of the Quiet Ledger slides alongside without a sound. The auditor offers a voluntary inspection of your books. She pronounces “voluntary” very carefully.",
    },
    choices: [
      {
        id: "accept",
        label: { cs: "Otevřít jí knihy", en: "Open the books" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Našla přeplatek z dob původní posádky. Vrací vám ho i s úrokem a tváří se, že ji to fyzicky bolí.",
              en: "She finds an overpayment from the original crew's time. She refunds it with interest and looks physically pained.",
            },
            effects: [
              { t: "credits", secs: 150 },
              { t: "rep", faction: "ledger", n: 4 },
            ],
          },
          {
            weight: 2,
            text: {
              cs: "Našla nedoplatek z dob původní posádky. Platíte za cizí hříchy, ale aspoň máte čistý štít.",
              en: "She finds an underpayment from the original crew's time. You pay for someone else's sins, but at least your record is clean.",
            },
            effects: [
              { t: "credits", secs: -60 },
              { t: "rep", faction: "ledger", n: 4 },
            ],
          },
        ],
      },
      {
        id: "coffee",
        label: { cs: "Nabídnout jí kávu", en: "Offer her coffee" },
        cost: { items: { coffee: 2 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Auditorka upozorní, že jde o úplatek, a pak si přidá cukr. Kontrola dopadla výtečně.",
              en: "The auditor points out that this is a bribe, then adds sugar. The inspection goes splendidly.",
            },
            effects: [
              { t: "rep", faction: "ledger", n: 2 },
              { t: "buff", effect: { stat: "sellValue", mul: 1.15 }, secs: 600 },
            ],
          },
        ],
      },
      {
        id: "decline",
        label: { cs: "Zdvořile odmítnout", en: "Politely decline" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Auditorka si něco poznamená. Neřekne nic, což je horší.",
              en: "The auditor makes a note. She says nothing, which is worse.",
            },
            effects: [{ t: "rep", faction: "ledger", n: -1 }],
          },
        ],
      },
    ],
  },
  {
    id: "merchant_blueprint_dealer",
    type: "merchant",
    weight: 7,
    cooldown: 5400,
    when: { depthMin: 4, feature: "crafting" },
    title: { cs: "Plány pod rukou", en: "Plans Under the Counter" },
    text: {
      cs: "Obchodník s plány rozevírá kabát plný datových karet jako prodavač hodinek v podchodu. „Všechno originál,“ ujišťuje vás. „Skoro.“",
      en: "A blueprint dealer opens a coat lined with data cards, like a man selling watches in an underpass. “All originals,” he assures you. “Almost.”",
    },
    choices: [
      {
        id: "buy",
        label: { cs: "Koupit plán", en: "Buy a blueprint" },
        cost: { credits: 150 },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Plán je psaný třemi rukopisy a jedním kečupem. Fabrikátor ho ale přečte, a to stačí.",
              en: "The blueprint is written in three hands and one ketchup. The fabricator can read it, though, and that is enough.",
            },
            effects: [{ t: "blueprint" }],
          },
        ],
      },
      {
        id: "trade",
        label: { cs: "Zaplatit obvody", en: "Pay in circuits" },
        cost: { items: { circuit: 3 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Obvody kouše jako zlaťáky. Pak spokojeně kývne a jedna karta mění majitele.",
              en: "He bites the circuits like gold coins. Then he nods, satisfied, and one card changes hands.",
            },
            effects: [{ t: "blueprint" }],
          },
        ],
      },
      {
        id: "browse",
        label: { cs: "Jen se dívám", en: "Just browsing" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Prohlížíte si zboží tak dlouho, až si pár schémat zapamatujete. Obchodník to ví a tváří se dotčeně.",
              en: "You browse for so long that you memorise a few schematics. The dealer knows it and looks wounded.",
            },
            effects: [{ t: "rp", secs: 40 }],
          },
        ],
      },
    ],
  },
  {
    id: "merchant_rustborn_swap",
    type: "merchant",
    weight: 8,
    cooldown: 4200,
    when: { depthMin: 5 },
    title: { cs: "Burza Rezavých", en: "Rustborn Swap Meet" },
    text: {
      cs: "Rezaví rozložili na asteroidu bleší trh. Prodávají se tu díly, o kterých ani výrobce neví, k čemu byly, a platí se šrotem nebo historkou.",
      en: "The Rustborn have set up a flea market on an asteroid. They sell parts that even the manufacturer could not identify, and payment is in scrap or in stories.",
    },
    choices: [
      {
        id: "trade",
        label: { cs: "Vyměnit slitinu za díly", en: "Swap alloy for parts" },
        cost: { items: { alloy: 10 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Díly jsou z pěti různých lodí a jedné pračky. Pasují dokonale.",
              en: "The parts come from five different ships and one washing machine. They fit perfectly.",
            },
            effects: [
              { t: "item", item: "spare_parts", n: 2 },
              { t: "rep", faction: "rustborn", n: 2 },
            ],
          },
        ],
      },
      {
        id: "patch",
        label: { cs: "Nechat si zalátat trup", en: "Get the hull patched" },
        cost: { credits: 60 },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Šest svářečů a jedno dítě s kladivem. Za dvacet minut je trup pevnější než z loděnice, jen má teď víc barev.",
              en: "Six welders and one child with a hammer. Twenty minutes later the hull is tougher than factory new, just in more colours.",
            },
            effects: [
              { t: "hull", pct: 20 },
              { t: "rep", faction: "rustborn", n: 1 },
            ],
          },
        ],
      },
      {
        id: "story",
        label: { cs: "Zaplatit historkou", en: "Pay with a story" },
        risk: 0,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Vyprávíte o lístku „Jsme zpátky za 5 minut“. Smějí se tak, že vám jeden díl dají zadarmo.",
              en: "You tell them about the note that says “Back in 5 minutes”. They laugh so hard that they give you a part for free.",
            },
            effects: [
              { t: "item", item: "spare_parts", n: 1 },
              { t: "rep", faction: "rustborn", n: 1 },
            ],
          },
          {
            weight: 1,
            good: true,
            text: {
              cs: "Stará svářečka uprostřed historky zmlkne. Pak vám podá datový krystal, který tu prý kdysi někdo z Gafferu zapomněl.",
              en: "An old welder goes quiet halfway through your story. Then she hands you a data crystal that someone from the Gaffer supposedly left here long ago.",
            },
            effects: [{ t: "log" }, { t: "rep", faction: "rustborn", n: 1 }],
          },
        ],
      },
    ],
  },
  {
    id: "merchant_mystery_crate",
    type: "merchant",
    weight: 9,
    cooldown: 3600,
    when: { depthMin: 2 },
    title: { cs: "Bedna bez záruky", en: "Crate, No Refunds" },
    text: {
      cs: "Obchodnice prodává zapečetěné bedny za jednotnou cenu. Na každé je nápis „OBSAH: ANO“. Reklamace nepřijímá, protože se prý vždycky stihne odstěhovat.",
      en: "A trader is selling sealed crates at a flat price. Each one is labelled “CONTENTS: YES”. She does not accept complaints, since she always manages to move away first.",
    },
    choices: [
      {
        id: "buy",
        label: { cs: "Koupit bednu", en: "Buy a crate" },
        cost: { credits: 80 },
        risk: 1,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "Uvnitř je funkční skener zabalený do cizího prádla. Prádlo si nechává KIPP jako důkazní materiál.",
              en: "Inside is a working scanner wrapped in a stranger's laundry. KIPP keeps the laundry as evidence.",
            },
            effects: [{ t: "item", item: "mod_scanner_mk1", n: 1 }],
          },
          {
            weight: 3,
            good: true,
            text: {
              cs: "Uvnitř je káva, izolepa a tři levé rukavice. Dvě z těch věcí se hodí.",
              en: "Inside are coffee, duct tape and three left-hand gloves. Two of those things are useful.",
            },
            effects: [
              { t: "item", item: "coffee", n: 8 },
              { t: "item", item: "duct_tape", n: 2 },
            ],
          },
          {
            weight: 2,
            text: {
              cs: "Uvnitř je menší bedna a v ní ještě menší. V té poslední leží lístek „Děkujeme za nákup“.",
              en: "Inside is a smaller crate, and inside that an even smaller one. The last one holds a slip that says “Thank you for your purchase”.",
            },
            effects: [
              { t: "item", item: "scrap", n: 20, scaled: true },
              { t: "morale", n: -1 },
            ],
          },
        ],
      },
      {
        id: "shake",
        label: { cs: "Zatřást a poslouchat", en: "Shake one and listen" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Uvnitř něco chrastí, něco šplouchá a něco zatřese zpátky. Bednu opatrně vracíte na místo.",
              en: "Something rattles inside, something sloshes, and something shakes back. You put the crate down carefully.",
            },
            effects: [{ t: "morale", n: 1 }],
          },
        ],
      },
    ],
  },
  {
    id: "merchant_card_collector",
    type: "merchant",
    weight: 7,
    cooldown: 5400,
    when: { feature: "cards" },
    title: { cs: "Sběratel kartiček", en: "The Card Collector" },
    text: {
      cs: "Sběratel s albem tlustým jako přepážka nabízí výměnu kartiček. Tvrdí, že mu do sbírky chybí už jen jedna. Říká to prý každému.",
      en: "A collector with an album as thick as a bulkhead offers to trade cards. He claims he is only one short of a full set. Apparently he says that to everyone.",
    },
    choices: [
      {
        id: "buy",
        label: { cs: "Koupit balíček", en: "Buy a pack" },
        cost: { credits: 100 },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Balíček voní po žvýkačce staré půl století. Karta uvnitř je ale jako nová.",
              en: "The pack smells of chewing gum half a century old. The card inside, however, is mint.",
            },
            effects: [{ t: "card" }],
          },
        ],
      },
      {
        id: "swap",
        label: { cs: "Vyměnit za čočky", en: "Trade lenses for one" },
        cost: { items: { lens: 2 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Čočky si nasazuje jako monokl a dlouze si vás prohlíží. Pak z alba vytáhne těžařskou kartu, kterou má čtyřikrát.",
              en: "He wears a lens like a monocle and inspects you at length. Then he pulls out a mining card he owns four times over.",
            },
            effects: [{ t: "card", deck: "mining" }],
          },
        ],
      },
      {
        id: "look",
        label: { cs: "Prohlédnout si album", en: "Browse the album" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "V albu je i karta vaší lodi. V kolonce „stav“ stojí: pohřešována, nikomu nechybí.",
              en: "The album even has a card for your ship. Under “status” it says: missing, not missed.",
            },
            effects: [
              { t: "morale", n: 2 },
              { t: "rp", secs: 20 },
            ],
          },
        ],
      },
    ],
  },
];

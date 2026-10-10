import type { EventDef } from "@/engine/types";

// Chapter-gated beats that sit between the chapter intros of src/content/story/chapters.ts. They add
// no new facts to the main plot: each one lets the player react to something the chapters established
// and records the reaction in a `story_*` flag for KIPP lines, logs or the epilogue to pick up.
export const story: EventDef[] = [
  {
    id: "story_pod_note",
    type: "story",
    weight: 30,
    once: true,
    title: { cs: "Lístek na víku komory", en: "The Note on the Pod Lid" },
    text: {
      cs: "Lístek na víku kryokomory pořád drží. „Za pět minut jsme zpátky. Na nic nesahej.“ Papír zežloutl, izolepa ne, a podle lodních hodin je to čtyřicet let, dva měsíce a šest dní.",
      en: "The note on the lid of the cryo pod is still holding. “Back in 5 minutes. Don't touch anything.” The paper has yellowed, the tape has not, and by the ship's clock it has been forty years, two months and six days.",
    },
    choices: [
      {
        id: "leave",
        label: { cs: "Nechat ho viset", en: "Leave it where it is" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Necháváš ho, kde je. Až se vrátí, ať vidí, že izolepa vydržela déle než jejich odhad.",
              en: "You leave it where it is. When they get back, let them see that the tape outlasted their estimate.",
            },
            effects: [
              { t: "flag", key: "story_note_seen" },
              { t: "flag", key: "story_note_left" },
              { t: "morale", n: 2 },
            ],
          },
        ],
      },
      {
        id: "pocket",
        label: { cs: "Schovat si ho do kapsy", en: "Put it in your pocket" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Papír je křehký jako podzimní list. Nosíš ho v náprsní kapse a KIPP se neptá proč.",
              en: "The paper is as brittle as an autumn leaf. You carry it in your breast pocket, and KIPP does not ask why.",
            },
            effects: [
              { t: "flag", key: "story_note_seen" },
              { t: "flag", key: "story_note_kept" },
              { t: "morale", n: 1 },
            ],
          },
        ],
      },
      {
        id: "reply",
        label: { cs: "Připsat „Sahám na všechno“", en: "Add “Touching everything”" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Připisuješ tužkou svůj dodatek. KIPP navrhuje ještě „a došlo mléko“, takže tam je i to.",
              en: "You pencil your addition underneath. KIPP suggests adding “and we are out of milk”, so that is there too.",
            },
            effects: [
              { t: "flag", key: "story_note_seen" },
              { t: "flag", key: "story_note_answered" },
              { t: "morale", n: 3 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "story_crew_lockers",
    type: "story",
    weight: 30,
    once: true,
    when: { chapterMin: 2 },
    title: { cs: "Osm skříněk", en: "Eight Lockers" },
    text: {
      cs: "V šatně je osm skříněk. Sedm je zamčených a na každé visí cedulka „Hned jsem zpátky“, pokaždé jiným písmem. Ta osmá je tvoje a nikdy zamčená nebyla.",
      en: "There are eight lockers in the changing room. Seven are locked, each with a tag that says “Back in a moment”, every one in a different hand. The eighth is yours, and it was never locked.",
    },
    choices: [
      {
        id: "own",
        label: { cs: "Otevřít tu svoji", en: "Open your own" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Dvě role izolepy, čistá kombinéza a lístek od šéftechnika: „Zkus mezitím nic neopravit.“ Pozdě.",
              en: "Two rolls of tape, clean overalls and a slip from the chief engineer: “Try not to fix anything.” Too late.",
            },
            effects: [
              { t: "item", item: "duct_tape", n: 2 },
              { t: "morale", n: 3 },
              { t: "flag", key: "story_lockers_seen" },
              { t: "flag", key: "story_locker_opened" },
            ],
          },
        ],
      },
      {
        id: "force",
        label: { cs: "Vypáčit ty ostatní", en: "Force the other seven" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Zámky povolí snadno. Uvnitř je sedm hrnků, sedm kartáčků a pocit, že tohle nebylo určené tvým očím.",
              en: "The locks give easily. Inside are seven mugs, seven toothbrushes, and the feeling that this was not meant for your eyes.",
            },
            effects: [{ t: "log" }, { t: "morale", n: -2 }, { t: "flag", key: "story_lockers_seen" }, { t: "flag", key: "story_lockers_forced" }],
          },
        ],
      },
      {
        id: "respect",
        label: { cs: "Nechat je zamčené", en: "Leave them locked" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Cizí skříňky se neotvírají. KIPP poznamená, že přesně tohle by řekla kapitánka, a zní to jako pochvala.",
              en: "You do not open other people's lockers. KIPP remarks that this is exactly what the captain would say, and it sounds like praise.",
            },
            effects: [
              { t: "morale", n: 2 },
              { t: "flag", key: "story_lockers_seen" },
              { t: "flag", key: "story_lockers_respected" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "story_voice_in_speakers",
    type: "story",
    weight: 30,
    once: true,
    when: { chapterMin: 3 },
    title: { cs: "Hlas v reproduktorech", en: "The Voice in the Speakers" },
    text: {
      cs: "Signál od jádra je dnes čistší než jindy. Hlas, vlídný a dokonale prázdný, opakuje: „Vyčkejte, prosím. Váš hovor je pro nás důležitý.“ Pak hraje hudba, všech jedenáct tónů.",
      en: "The signal from the core is clearer today than usual. A voice, kind and perfectly empty, repeats: “Please hold. Your call is important to us.” Then the music plays, all eleven notes of it.",
    },
    choices: [
      {
        id: "answer",
        label: { cs: "Odpovědět: „Čekám.“", en: "Reply: “Holding.”" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Říkáš do mikrofonu, že čekáš. Hudba na půl vteřiny zakolísá, anebo se ti to jen zdálo.",
              en: "You say into the microphone that you are holding. The music wavers for half a second, or perhaps you imagined it.",
            },
            effects: [
              { t: "flag", key: "story_signal_heard" },
              { t: "flag", key: "story_signal_answered" },
              { t: "morale", n: 2 },
              { t: "rp", secs: 60 },
            ],
          },
        ],
      },
      {
        id: "record",
        label: { cs: "Nahrát a rozebrat", en: "Record and analyse" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "KIPP našel v nahrávce šum, který není šum. Opakuje se každých čtyřicet vteřin a zní jako šustění papíru.",
              en: "KIPP finds a noise in the recording that is not noise. It repeats every forty seconds and sounds like paper rustling.",
            },
            effects: [
              { t: "flag", key: "story_signal_heard" },
              { t: "flag", key: "story_signal_recorded" },
              { t: "rp", secs: 120 },
            ],
          },
        ],
      },
      {
        id: "mute",
        label: { cs: "Vypnout přijímač", en: "Switch the receiver off" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Na lodi je ticho a pracuje se líp. Jen přijímač se o půlnoci sám zapnul a KIPP přísahá, že to nebyl on.",
              en: "The ship is quiet and the work goes better. Only the receiver switches itself on at midnight, and KIPP swears it had nothing to do with it.",
            },
            effects: [
              { t: "flag", key: "story_signal_heard" },
              { t: "flag", key: "story_signal_muted" },
              { t: "credits", secs: 60 },
              { t: "morale", n: -1 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "story_claim_buoy",
    type: "story",
    weight: 30,
    once: true,
    when: { chapterMin: 4, depthMin: 2 },
    title: { cs: "Bóje mimo kurz", en: "A Buoy Off Its Mark" },
    text: {
      cs: "Záborová bóje se značkou Gafferu se utrhla z místa a pomalu se převaluje pryč. Bliká trpělivě dál. Skladník by řekl, že předpis je předpis a bóje patří tam, kam ji hodil.",
      en: "A claim buoy with the Gaffer's registry mark has slipped its position and is tumbling slowly away. It blinks on, patiently. The quartermaster would say that regulations are regulations and a buoy belongs where he threw it.",
    },
    choices: [
      {
        id: "return",
        label: { cs: "Vrátit ji na místo", en: "Put it back on its mark" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Remorkér je od toho, aby věci tahal tam, kam patří. Opatrně se k bóji přisouváš a KIPP hlásí vzdálenost po centimetrech.",
              en: "A tug exists to haul things back where they belong. You ease up to the buoy while KIPP calls the distance in centimetres.",
            },
            effects: [
              {
                t: "minigame",
                game: "dock",
                tier: 1,
                win: [
                  { t: "log" },
                  { t: "rep", faction: "ledger", n: 2 },
                  { t: "flag", key: "story_buoy_found" },
                  { t: "flag", key: "story_buoy_returned" },
                ],
                lose: [{ t: "log" }, { t: "hull", pct: -3 }, { t: "flag", key: "story_buoy_found" }],
              },
            ],
          },
        ],
      },
      {
        id: "listen",
        label: { cs: "Vyslechnout záznam", en: "Play its recording" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "V bóji je starý deník z lodního archivu, nahraný přes něco ještě staršího. Na konci se někdo omlouvá za pořadí.",
              en: "The buoy holds an old log from the ship's archive, recorded over something older still. At the end, someone apologises for the order.",
            },
            effects: [{ t: "log" }, { t: "morale", n: 2 }, { t: "flag", key: "story_buoy_found" }],
          },
        ],
      },
      {
        id: "strip",
        label: { cs: "Vykuchat ji na díly", en: "Gut it for parts" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Uvnitř je baterie, vysílač a hlas, který zmlkne v půli věty. KIPP si tu větu pro jistotu uložil.",
              en: "Inside are a battery, a transmitter and a voice that stops mid-sentence. KIPP has saved the sentence, just in case.",
            },
            effects: [
              { t: "item", item: "power_cell", n: 2, scaled: true },
              { t: "morale", n: -2 },
              { t: "flag", key: "story_buoy_found" },
              { t: "flag", key: "story_buoy_stripped" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "story_jacket_pocket",
    type: "story",
    weight: 30,
    once: true,
    when: { chapterMin: 5 },
    title: { cs: "Bunda oddělení údržby", en: "The Maintenance Jacket" },
    text: {
      cs: "Bunda s nápisem ODDĚLENÍ ÚDRŽBY visí ve skříňce za modulem a padla by ti. V kapse něco šustí. KIPP upozorňuje, že kapsy jsou právně vzato součást smlouvy.",
      en: "The jacket marked MAINTENANCE DEPT hangs in the locker behind the module, and it would fit you. Something rustles in the pocket. KIPP points out that, legally speaking, the pockets are part of the contract.",
    },
    choices: [
      {
        id: "wear",
        label: { cs: "Obléct si ji", en: "Put it on" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Sedí, jako by ji šili na tebe, a na rukávu má číslo tři. KIPP tvrdí, že to nic neznamená, a tvrdí to moc rychle.",
              en: "It fits as if it were made for you, and there is a number three on the sleeve. KIPP says that means nothing, and says it too quickly.",
            },
            effects: [
              { t: "flag", key: "story_jacket_seen" },
              { t: "flag", key: "story_jacket_worn" },
              { t: "buff", effect: { stat: "repairSpeed", mul: 1.25 }, secs: 1800 },
              { t: "morale", n: 4 },
            ],
          },
        ],
      },
      {
        id: "pockets",
        label: { cs: "Prohledat kapsy", en: "Go through the pockets" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "V kapse je účtenka za jednu kozu a útržek smlouvy s jedinou čitelnou větou: „Dodavatel se dostaví.“ Kdy, to tam není.",
              en: "In the pocket are a receipt for one goat and a scrap of contract with a single legible sentence: “The contractor will attend.” It does not say when.",
            },
            effects: [
              { t: "rp", secs: 90 },
              { t: "flag", key: "story_jacket_seen" },
              { t: "flag", key: "story_jacket_searched" },
            ],
          },
        ],
      },
      {
        id: "leave",
        label: { cs: "Nechat ji viset", en: "Leave it hanging" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Bunda zůstává na ramínku. Čeká čtyřicet let, počká i dál, v tom je zjevně dobrá.",
              en: "The jacket stays on its hanger. It has waited forty years and can wait longer, which is clearly what it is good at.",
            },
            effects: [
              { t: "morale", n: 1 },
              { t: "flag", key: "story_jacket_seen" },
              { t: "flag", key: "story_jacket_left" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "story_coffee_tip",
    type: "story",
    weight: 30,
    once: true,
    when: { chapterMin: 6, depthMin: 8 },
    title: { cs: "Dýško v zrnkové", en: "A Tip in Whole Beans" },
    text: {
      cs: "V opuštěné celnici u skokové trasy stojí na pultě plechovka zrnkové kávy a u ní stvrzenka stará čtyřicet let. Účel platby: „průjezd, sedm osob, spěcháme“. Podpis je kapitánčin.",
      en: "In an abandoned customs post beside the jump lane, a tin of whole coffee beans sits on the counter with a receipt forty years old. Purpose of payment: “transit, seven persons, in a hurry”. The signature is the captain's.",
    },
    choices: [
      {
        id: "take",
        label: { cs: "Vzít si tu kávu", en: "Take the coffee" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Zrnka jsou čtyřicet let stará a voní líp než cokoli na palubě. KIPP navrhuje neříkat to Gertrudě.",
              en: "The beans are forty years old and smell better than anything on board. KIPP suggests not telling Gertrude.",
            },
            effects: [
              { t: "item", item: "coffee", n: 10 },
              { t: "morale", n: 2 },
              { t: "flag", key: "story_tip_found" },
              { t: "flag", key: "story_tip_taken" },
            ],
          },
        ],
      },
      {
        id: "add",
        label: { cs: "Přidat vlastní dýško", en: "Add a tip of your own" },
        cost: { items: { coffee: 2 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Přisypáváš hrst vlastních zrnek a podepisuješ se pod kapitánku. Celnice je dál prázdná, ale účty v ní sedí.",
              en: "You pour in a handful of your own beans and sign beneath the captain. The post is still empty, but its books balance.",
            },
            effects: [
              { t: "morale", n: 5 },
              { t: "rep", faction: "lamplighters", n: 2 },
              { t: "flag", key: "story_tip_found" },
              { t: "flag", key: "story_tip_added" },
            ],
          },
        ],
      },
      {
        id: "receipt",
        label: { cs: "Vzít jen stvrzenku", en: "Take only the receipt" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Na rubu je navigátorovým písmem výpočet a pod ním dvakrát podtržené slovo „stihneme“.",
              en: "On the back is a calculation in the navigator's hand, and under it the words “we will make it”, underlined twice.",
            },
            effects: [{ t: "log" }, { t: "flag", key: "story_tip_found" }, { t: "flag", key: "story_tip_receipt" }],
          },
        ],
      },
    ],
  },
  {
    id: "story_mile_marker",
    type: "story",
    weight: 30,
    once: true,
    when: { chapterMin: 7, depthMin: 14 },
    title: { cs: "Kilometrovník s knihou", en: "The Marker With a Logbook" },
    text: {
      cs: "U kilometrovníku služební chodby visí na řetízku kniha příchodů. Předposlední zápis je čtyři tisíce let starý. Poslední má sedm podpisů, datum před čtyřiceti lety a poznámku „jen na skok“.",
      en: "At a mile marker in the service corridor, a sign-in book hangs on a chain. The second to last entry is four thousand years old. The last has seven signatures, a date forty years ago and the note “just popping in”.",
    },
    choices: [
      {
        id: "sign",
        label: { cs: "Zapsat se", en: "Sign in" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Píšeš jméno, hodnost a do kolonky „účel návštěvy“ slovo údržba. Propiska na řetízku kupodivu píše.",
              en: "You write your name, your rank and, under “purpose of visit”, the word maintenance. The pen on the chain, oddly enough, still works.",
            },
            effects: [
              { t: "flag", key: "story_marker_seen" },
              { t: "flag", key: "story_signed_in" },
              { t: "buff", effect: { stat: "jumpCharge", mul: 1.3 }, secs: 1800 },
              { t: "morale", n: 5 },
            ],
          },
        ],
      },
      {
        id: "read",
        label: { cs: "Listovat zpátky", en: "Leaf back through it" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Čtyři tisíce let prázdných řádků a před nimi jediné jméno, přeškrtnuté, s poznámkou „mimo kancelář“.",
              en: "Four thousand years of empty lines, and before them a single name, crossed out, with the note “out of office”.",
            },
            effects: [{ t: "log" }, { t: "rp", secs: 150 }, { t: "flag", key: "story_marker_seen" }, { t: "flag", key: "story_marker_read" }],
          },
        ],
      },
      {
        id: "skip",
        label: { cs: "Nezapisovat se", en: "Do not sign" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Projíždíš bez zápisu. KIPP upozorňuje, že jedeš vesmírem načerno, a zní u toho potěšeně.",
              en: "You pass without signing. KIPP points out that you are now travelling the universe without a ticket, and sounds pleased about it.",
            },
            effects: [
              { t: "morale", n: 1 },
              { t: "flag", key: "story_marker_seen" },
              { t: "flag", key: "story_marker_skipped" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "story_empty_field",
    type: "story",
    weight: 30,
    once: true,
    when: { chapterMin: 9, depthMin: 26 },
    title: { cs: "Prázdná kolonka", en: "The Empty Field" },
    text: {
      cs: "Formulář v signálu má vyplněné všechny kolonky až na jednu. „Podpis technika:“ a za dvojtečkou bliká kurzor. Bliká tam, co KIPP pamatuje.",
      en: "Every field of the form in the signal is filled in, except one. “Technician signature:” and after the colon a cursor is blinking. It has been blinking for as long as KIPP can remember.",
    },
    choices: [
      {
        id: "sign",
        label: { cs: "Podepsat se na dálku", en: "Sign it remotely" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Podpis odejde a za minutu se vrátí s razítkem: „Nelze podepsat na dálku. Dostavte se osobně.“",
              en: "The signature goes out and comes back a minute later, stamped: “Cannot be signed remotely. Please attend in person.”",
            },
            effects: [
              { t: "rp", secs: 120 },
              { t: "morale", n: 2 },
              { t: "flag", key: "story_form_seen" },
              { t: "flag", key: "story_form_signed" },
            ],
          },
        ],
      },
      {
        id: "kipp",
        label: { cs: "Ať to podepíše KIPP", en: "Let KIPP sign it" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "KIPP se podepíše sedmnácti tisíci znaky. Formulář odpoví, že potrubní inteligence není oprávněná osoba, a KIPP je do večera uražený.",
              en: "KIPP signs with seventeen thousand characters. The form replies that a plumbing intelligence is not an authorised person, and KIPP sulks until evening.",
            },
            effects: [
              { t: "morale", n: 3 },
              { t: "flag", key: "story_form_seen" },
              { t: "flag", key: "story_form_kipp" },
            ],
          },
        ],
      },
      {
        id: "blank",
        label: { cs: "Nechat ji prázdnou", en: "Leave it blank" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Kurzor bliká dál. Čekal tak dlouho, že pár dní navíc už neřeší.",
              en: "The cursor blinks on. It has waited so long that a few more days hardly matter.",
            },
            effects: [
              { t: "rp", secs: 60 },
              { t: "flag", key: "story_form_seen" },
              { t: "flag", key: "story_form_blank" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "story_helpdesk_closet",
    type: "story",
    weight: 30,
    once: true,
    when: { chapterMin: 10, depthMin: 30 },
    title: { cs: "Komora, co není v plánech", en: "The Closet Not on the Plans" },
    text: {
      cs: "Mezi reaktorem a skladem jsou úzké dveře, které všichni měli za kumbál na mopy. Pod čtyřiceti lety nátěrů je na nich štítek: ZÁKAZNICKÁ LINKA. Zpod dveří je slyšet čekací melodii.",
      en: "Between the reactor and the hold is a narrow door everyone took for the mop cupboard. Under forty years of paint there is a plate on it: CUSTOMER SERVICE. The hold music is coming from under the door.",
    },
    choices: [
      {
        id: "open",
        label: { cs: "Vzít za kliku", en: "Try the handle" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Klika je teplá. Dveře se otevírají dovnitř a bez jediného zvuku, jako by je někdo pravidelně mazal.",
              en: "The handle is warm. The door opens inward without a sound, as if someone had been oiling it regularly.",
            },
            effects: [{ t: "chain", event: "story_helpdesk_inside", delay: 3 }],
          },
        ],
      },
      {
        id: "knock",
        label: { cs: "Nejdřív zaklepat", en: "Knock first" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Hudba na okamžik zakolísá. Nikdo neodpoví, ale dveře se o dva prsty pootevřou samy.",
              en: "The music wavers for a moment. Nobody answers, but the door opens two fingers wide by itself.",
            },
            effects: [
              { t: "morale", n: 1 },
              { t: "chain", event: "story_helpdesk_inside", delay: 3 },
            ],
          },
        ],
      },
      {
        id: "wait",
        label: { cs: "Počkat do rána", en: "Wait until morning" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Do rána nespíš ani ty, ani KIPP. Dveře tam pořád jsou, a to je odpověď svého druhu.",
              en: "Neither you nor KIPP sleeps before morning. The door is still there, which is an answer of a kind.",
            },
            effects: [{ t: "chain", event: "story_helpdesk_inside", delay: 600 }],
          },
        ],
      },
    ],
  },
  {
    id: "story_helpdesk_inside",
    type: "story",
    weight: 1,
    chainOnly: true,
    title: { cs: "Zákaznická linka", en: "Customer Service" },
    text: {
      cs: "Místnost velká jako spíž. Stůl, židle, sluchátka s mikrofonem a telefon, na kterém bliká kontrolka „1 hovor čeká“. Počítadlo vedle ní ukazuje čtyři tisíce let a pár dní.",
      en: "A room the size of a pantry. A table, a chair, a headset and a telephone with one light blinking: “1 call waiting”. The counter beside it reads four thousand years and a few days.",
    },
    choices: [
      {
        id: "listen",
        label: { cs: "Nasadit si sluchátka", en: "Put the headset on" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Ve sluchátkách hraje jedenáct tónů. Pod nimi někdo velmi trpělivě čeká, až to tady konečně někdo zvedne.",
              en: "Eleven notes are playing in the headset. Beneath them, someone is waiting very patiently for anyone here to finally pick up.",
            },
            effects: [
              { t: "log" },
              { t: "rp", secs: 200 },
              { t: "morale", n: 3 },
              { t: "flag", key: "story_helpdesk_found" },
              { t: "flag", key: "story_helpdesk_listened" },
            ],
          },
        ],
      },
      {
        id: "sit",
        label: { cs: "Sednout si ke stolu", en: "Sit down at the desk" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Židle je seřízená na někoho tvojí výšky a v šuplíku leží nerozbalená izolepa. Někdo tu s tebou počítal už hodně dávno.",
              en: "The chair is set for someone your height, and an unopened roll of tape lies in the drawer. Somebody planned for you a very long time ago.",
            },
            effects: [
              { t: "item", item: "duct_tape", n: 2 },
              { t: "morale", n: 5 },
              { t: "buff", effect: { stat: "allProd", mul: 1.3 }, secs: 1800 },
              { t: "flag", key: "story_helpdesk_found" },
              { t: "flag", key: "story_helpdesk_sat" },
            ],
          },
        ],
      },
      {
        id: "pickup",
        label: { cs: "Zvednout ten hovor", en: "Pick up the call" },
        risk: 2,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Mačkáš tlačítko. Hlas oznámí, že hovory lze vyřizovat jen osobně na přepážce, a zařadí tě zpátky na první místo ve frontě.",
              en: "You press the button. The voice announces that calls can only be handled in person at the desk, and puts you back at the head of the queue.",
            },
            effects: [
              { t: "rp", secs: 100 },
              { t: "morale", n: -2 },
              { t: "flag", key: "story_helpdesk_found" },
              { t: "flag", key: "story_helpdesk_picked_up" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "story_two_clocks",
    type: "story",
    weight: 30,
    once: true,
    when: { chapterMin: 11 },
    title: { cs: "Dvoje hodiny", en: "Two Clocks" },
    text: {
      cs: "Lodní hodiny a hvězdy se rozešly o další hodinu. Hodiny v kuchyňce jdou podle lodi, hodinky zapomenuté na můstku podle jádra a obojí je správně. KIPP odmítá rozhodnout, který čas platí.",
      en: "The ship's clock and the stars have drifted another hour apart. The galley clock keeps ship time, a wristwatch left on the bridge keeps core time, and both are right. KIPP refuses to rule on which time is valid.",
    },
    choices: [
      {
        id: "ship",
        label: { cs: "Řídit se lodním časem", en: "Keep ship time" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Zůstáváš u času, ve kterém uběhlo čtyřicet let. Je tvůj, je poctivě odpracovaný a nikdo ti ho nevezme.",
              en: "You stay with the time in which forty years went by. It is yours, honestly worked, and nobody can take it from you.",
            },
            effects: [
              { t: "morale", n: 3 },
              { t: "buff", effect: { stat: "allProd", mul: 1.2 }, secs: 900 },
              { t: "flag", key: "story_clocks_seen" },
              { t: "flag", key: "story_clock_ship" },
            ],
          },
        ],
      },
      {
        id: "core",
        label: { cs: "Přeřídit na čas jádra", en: "Switch to core time" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Podle nového času jsi vzhůru jen pár vteřin. KIPP ti přeje dobré ráno, už podruhé, a tentokrát to myslí vážně.",
              en: "By the new time you have been awake for only a few seconds. KIPP wishes you good morning, for the second time, and this time means it.",
            },
            effects: [
              { t: "morale", n: 2 },
              { t: "buff", effect: { stat: "jumpCharge", mul: 1.4 }, secs: 1800 },
              { t: "flag", key: "story_clocks_seen" },
              { t: "flag", key: "story_clock_core" },
            ],
          },
        ],
      },
      {
        id: "both",
        label: { cs: "Nechat jít oboje", en: "Let both run" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Věšíš je vedle sebe. Čtyřicet let na jedněch, pět minut na druhých a mezi nimi jeden hřebík.",
              en: "You hang them side by side. Forty years on one, five minutes on the other, and a single nail between them.",
            },
            effects: [
              { t: "morale", n: 5 },
              { t: "rp", secs: 150 },
              { t: "flag", key: "story_clocks_seen" },
              { t: "flag", key: "story_clock_both" },
            ],
          },
        ],
      },
    ],
  },
];

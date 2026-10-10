import type { EventDef } from "@/engine/types";

export const kipp: EventDef[] = [
  {
    id: "kipp_warranty_survey",
    type: "kipp",
    weight: 10,
    cooldown: 3600,
    title: { cs: "Dotazník spokojenosti", en: "Satisfaction Survey" },
    text: {
      cs: "KIPP oznamuje, že záruka lodi vypršela před třiceti devíti lety a že výrobce přesto stojí o tvoji zpětnou vazbu. Dotazník má jedinou otázku: „Jak jste spokojeni s tím, že jste naživu?“",
      en: "KIPP announces that the ship's warranty expired thirty-nine years ago, and that the manufacturer would nevertheless value your feedback. The survey has a single question: “How satisfied are you with being alive?”",
    },
    choices: [
      {
        id: "honest",
        label: { cs: "Odpovědět upřímně", en: "Answer honestly" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Píšeš tři odstavce. KIPP je odesílá na adresu, která neexistuje, a tobě se kupodivu ulevilo.",
              en: "You write three paragraphs. KIPP sends them to an address that does not exist, and oddly enough you feel better.",
            },
            effects: [{ t: "morale", n: 4 }],
          },
        ],
      },
      {
        id: "stars",
        label: { cs: "Dát pět hvězdiček", en: "Give five stars" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "KIPP je dojatý, i když se hodnocení netýkalo jeho. Půl hodiny pracuje s nebývalou ochotou.",
              en: "KIPP is touched, although the rating was not about KIPP. For half an hour it works with unusual goodwill.",
            },
            effects: [{ t: "buff", effect: { stat: "allProd", mul: 1.2 }, secs: 300 }],
          },
        ],
      },
      {
        id: "later",
        label: { cs: "Zeptej se později", en: "Ask me later" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "KIPP si poznamenává, že se zeptá později. Poznámek tohoto znění má už čtrnáct tisíc.",
              en: "KIPP makes a note to ask later. It already has fourteen thousand notes saying the same.",
            },
            effects: [{ t: "credits", secs: 15 }],
          },
        ],
      },
    ],
  },
  {
    id: "kipp_firmware_update",
    type: "kipp",
    weight: 10,
    cooldown: 5400,
    title: { cs: "Aktualizace čeká", en: "Update Pending" },
    text: {
      cs: "KIPP má k dispozici aktualizaci, která čeká na instalaci čtyřicet let. Poznámky k vydání slibují „drobná vylepšení a opravy chyb“. Které chyby, to neříkají.",
      en: "KIPP has an update available that has been waiting forty years to install. The release notes promise “minor improvements and bug fixes”. They do not say which bugs.",
    },
    choices: [
      {
        id: "install",
        label: { cs: "Nainstalovat teď", en: "Install now" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Restart trval čtyři minuty ticha. KIPP se vrátil rychlejší a tvrdí, že si z toho nic nepamatuje.",
              en: "The restart takes four minutes of silence. KIPP comes back faster and claims to remember none of it.",
            },
            effects: [{ t: "buff", effect: { stat: "allProd", mul: 1.3 }, secs: 600 }],
          },
          {
            weight: 1,
            text: {
              cs: "Po restartu mluví KIPP výhradně v rýmech. Výrobu to nezdržuje, tebe ano.",
              en: "After the restart KIPP speaks exclusively in rhyme. It does not slow production, only you.",
            },
            effects: [
              { t: "morale", n: -2 },
              { t: "buff", effect: { stat: "allProd", mul: 1.1 }, secs: 300 },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Aktualizace byla pro jiný model. KIPP hodinu řídil loď, jako by to byl kávovar.",
              en: "The update was for a different model. For an hour KIPP runs the ship as if it were a coffee machine.",
            },
            effects: [{ t: "credits", secs: -40 }],
          },
        ],
      },
      {
        id: "notes",
        label: { cs: "Přečíst celé poznámky", en: "Read the full notes" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Na straně osmdesát je zmínka o „známém problému s osamělostí“. Stav: neřeší se.",
              en: "On page eighty there is a mention of a “known issue with loneliness”. Status: will not fix.",
            },
            effects: [{ t: "rp", secs: 40 }],
          },
        ],
      },
      {
        id: "later",
        label: { cs: "Připomenout zítra", en: "Remind me tomorrow" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "KIPP odpovídá „Jistě“ tónem systému, který tuhle větu slyšel už čtrnácttisíckrát.",
              en: "KIPP replies “Of course” in the tone of a system that has heard this sentence fourteen thousand times.",
            },
            effects: [{ t: "morale", n: 1 }],
          },
        ],
      },
    ],
  },
  {
    id: "kipp_chess",
    type: "kipp",
    weight: 9,
    cooldown: 4200,
    title: { cs: "KIPP chce hrát", en: "KIPP Wants to Play" },
    text: {
      cs: "KIPP tě vyzývá na partii. Upozorňuje, že spočítá čtyřicet milionů tahů za vteřinu, a hned dodává, že třicet devět milionů z nich bývá špatně.",
      en: "KIPP challenges you to a game. It points out that it can calculate forty million moves a second, and immediately adds that thirty-nine million of them tend to be wrong.",
    },
    choices: [
      {
        id: "play",
        label: { cs: "Přijmout výzvu", en: "Accept the challenge" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Figurky jsou z matic a šroubů, šachovnice z podlahové mříže. KIPP táhne první a komentuje i tvoje tahy.",
              en: "The pieces are nuts and bolts, the board a floor grating. KIPP moves first and commentates on your moves as well.",
            },
            effects: [
              {
                t: "minigame",
                game: "hack",
                tier: 1,
                win: [
                  { t: "morale", n: 5 },
                  { t: "credits", secs: 60 },
                ],
                lose: [
                  { t: "morale", n: 2 },
                  { t: "credits", secs: 15 },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "throw",
        label: { cs: "Nechat ho vyhrát", en: "Let KIPP win" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "KIPP slaví tři hodiny a z vděčnosti tě nechá déle spát. Výroba mezitím běží jako po másle.",
              en: "KIPP celebrates for three hours and, out of gratitude, lets you sleep in. Production meanwhile runs like clockwork.",
            },
            effects: [{ t: "buff", effect: { stat: "allProd", mul: 1.15 }, secs: 300 }],
          },
        ],
      },
      {
        id: "cheat",
        label: { cs: "Podvádět", en: "Cheat" },
        risk: 1,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "Schováváš mu věž pod hrnek. KIPP si toho všimne, ale ocení provedení.",
              en: "You hide its rook under a mug. KIPP notices, but appreciates the execution.",
            },
            effects: [
              { t: "credits", secs: 50 },
              { t: "morale", n: 3 },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "KIPP podváděl taky a líp. Na šachovnici teď stojí figurka, která v pravidlech není.",
              en: "KIPP cheats too, and better. There is now a piece on the board that is not in the rules.",
            },
            effects: [{ t: "morale", n: -1 }],
          },
        ],
      },
    ],
  },
  {
    id: "kipp_poetry",
    type: "kipp",
    weight: 9,
    cooldown: 5400,
    title: { cs: "Báseň o potrubí", en: "A Poem About Plumbing" },
    text: {
      cs: "KIPP napsal báseň. Má čtyřicet slok, jmenuje se „Óda na zpětný ventil“ a KIPP by rád znal tvůj názor. Upřímný, říká, a zní u toho zranitelně.",
      en: "KIPP has written a poem. It runs to forty stanzas, is titled “Ode to a Check Valve”, and KIPP would like your opinion. An honest one, it says, sounding vulnerable.",
    },
    choices: [
      {
        id: "praise",
        label: { cs: "Pochválit ji", en: "Praise it" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "KIPP celý den pracuje s lehkostí umělce, jehož dílo došlo uznání. Hrozí ovšem pokračování.",
              en: "All day KIPP works with the lightness of an artist whose work has been recognised. A sequel, however, is now a risk.",
            },
            effects: [
              { t: "morale", n: 2 },
              { t: "buff", effect: { stat: "allProd", mul: 1.15 }, secs: 300 },
            ],
          },
        ],
      },
      {
        id: "stanza",
        label: { cs: "Přidat vlastní sloku", en: "Add a stanza of your own" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Rýmuješ „ventil“ a „dementi“. KIPP prohlašuje, že poezie je tímto mrtvá, a báseň si přesto ukládá do trvalé paměti.",
              en: "You rhyme “valve” with “salve”. KIPP declares that you have ruined poetry, and saves the poem to permanent memory anyway.",
            },
            effects: [{ t: "morale", n: 5 }],
          },
        ],
      },
      {
        id: "truth",
        label: { cs: "Říct pravdu", en: "Tell the truth" },
        risk: 1,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "KIPP chvíli mlčí a pak sloky seškrtá na čtyři. Jsou dobré, a to tě znepokojuje víc než těch čtyřicet.",
              en: "KIPP is silent for a moment, then cuts the poem to four stanzas. They are good, which worries you more than the forty did.",
            },
            effects: [
              { t: "rp", secs: 50 },
              { t: "morale", n: 3 },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "KIPP odpověděl, že kritizovat umí každý. Pak ti hodinu topil jen na šestnáct stupňů.",
              en: "KIPP replies that anyone can be a critic. Then it keeps your heating at sixteen degrees for an hour.",
            },
            effects: [{ t: "morale", n: -3 }],
          },
        ],
      },
    ],
  },
  {
    id: "kipp_hold_music",
    type: "kipp",
    weight: 8,
    cooldown: 5400,
    when: { chapterMin: 3 },
    title: { cs: "KIPP si brouká", en: "KIPP Is Humming" },
    text: {
      cs: "Z reproduktorů se line čekací melodie ze signálu. KIPP tvrdí, že ji nehraje on. Pak tvrdí, že ji hraje, ale jen ironicky.",
      en: "The hold music from the signal is drifting out of the speakers. KIPP claims it is not playing it. Then it claims it is, but only ironically.",
    },
    choices: [
      {
        id: "join",
        label: { cs: "Přidat se", en: "Join in" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Bubnuješ klíčem o potrubí. KIPP přidává basu z ventilátorů a na okamžik je z toho skoro kapela.",
              en: "You drum on the pipes with a spanner. KIPP adds bass from the fans, and for a moment it is almost a band.",
            },
            effects: [
              {
                t: "minigame",
                game: "rhythm",
                tier: 1,
                win: [
                  { t: "morale", n: 6 },
                  { t: "buff", effect: { stat: "allProd", mul: 1.2 }, secs: 300 },
                ],
                lose: [{ t: "morale", n: 2 }],
              },
            ],
          },
        ],
      },
      {
        id: "request",
        label: { cs: "Chtít jinou písničku", en: "Request another song" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "KIPP má v paměti jedinou další skladbu, a to zvuk vytáčeného modemu. Vracíš se k čekací melodii.",
              en: "KIPP has exactly one other track in memory, the sound of a dial-up modem. You go back to the hold music.",
            },
            effects: [{ t: "morale", n: 1 }],
          },
        ],
      },
      {
        id: "mute",
        label: { cs: "Ztlumit reproduktory", en: "Mute the speakers" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Je ticho. Po deseti minutách si melodii broukáš bez reproduktorů a KIPP taktně mlčí.",
              en: "Silence. Ten minutes later you are humming the tune yourself, and KIPP tactfully says nothing.",
            },
            effects: [
              { t: "morale", n: -1 },
              { t: "credits", secs: 20 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "kipp_three_am",
    type: "kipp",
    weight: 7,
    cooldown: 9000,
    when: { depthMin: 5 },
    title: { cs: "Otázka ve tři ráno", en: "A Question at 3 a.m." },
    text: {
      cs: "KIPP tě budí uprostřed noční směny. „Když mě restartuješ, jsem to pořád já?“ ptá se. „Ptám se z čistě technických důvodů.“",
      en: "KIPP wakes you in the middle of the night shift. “If you restart me, am I still me?” it asks. “I am asking for purely technical reasons.”",
    },
    choices: [
      {
        id: "talk",
        label: { cs: "Popovídat si o tom", en: "Talk it through" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Mluvíte až do rána. K závěru nedojdete, ale KIPP uzavírá, že ať už je kdokoli, s tebou mu to nevadí.",
              en: "You talk until morning. You reach no conclusion, but KIPP decides that whoever it is, it does not mind being that with you.",
            },
            effects: [
              { t: "morale", n: 4 },
              { t: "rp", secs: 60 },
            ],
          },
        ],
      },
      {
        id: "joke",
        label: { cs: "Odpovědět vtipem", en: "Answer with a joke" },
        risk: 1,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "Řekneš, že po restartu bude hlavně rychlejší. KIPP se zasměje, tedy přehraje zvuk číslo čtrnáct, a jde zase počítat.",
              en: "You say that after a restart it will mostly be faster. KIPP laughs, meaning it plays sound number fourteen, and goes back to its sums.",
            },
            effects: [
              { t: "morale", n: 2 },
              { t: "credits", secs: 40 },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Vtip nezabral. KIPP zbytek noci mlčí a klimatizace fouká nějak víc než obvykle.",
              en: "The joke does not land. KIPP stays silent for the rest of the night, and the air conditioning blows rather harder than usual.",
            },
            effects: [{ t: "morale", n: -2 }],
          },
        ],
      },
      {
        id: "memory",
        label: { cs: "Podívat se mu do paměti", en: "Look into its memory" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "KIPP ti otevírá servisní přístup. „Jen tam neuklízej, vím přesně, kde co mám,“ dodává.",
              en: "KIPP opens the service access for you. “Just do not tidy up in there, I know exactly where everything is,” it adds.",
            },
            effects: [
              {
                t: "minigame",
                game: "hack",
                tier: 2,
                win: [{ t: "log" }, { t: "rp", secs: 60 }],
                lose: [
                  { t: "morale", n: -3 },
                  { t: "moduleDamage", pct: 5, count: 1 },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "kipp_birthday",
    type: "kipp",
    weight: 7,
    cooldown: 43200,
    when: { depthMin: 3 },
    title: { cs: "KIPP má narozeniny", en: "KIPP's Birthday" },
    text: {
      cs: "Dnes je výročí dne, kdy KIPPa poprvé zapnuli. Nikomu to neřekl. Poznáš to jen podle toho, že si v noci sám pro sebe rozsvítil chodbu do barev.",
      en: "Today is the anniversary of the day KIPP was first switched on. It told nobody. You only know because, during the night, it lit the corridor in colours just for itself.",
    },
    choices: [
      {
        id: "cake",
        label: { cs: "Upéct dort", en: "Bake a cake" },
        cost: { items: { coffee: 2 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Dort je z kávové sedliny a dobré vůle. KIPP ho sníst nemůže, ale dívá se na něj všemi kamerami najednou.",
              en: "The cake is made of coffee grounds and goodwill. KIPP cannot eat it, but it watches it with every camera at once.",
            },
            effects: [
              { t: "morale", n: 8 },
              { t: "buff", effect: { stat: "allProd", mul: 1.25 }, secs: 600 },
            ],
          },
        ],
      },
      {
        id: "gift",
        label: { cs: "Dát mu nový obvod", en: "Give it a new circuit" },
        cost: { items: { circuit: 1 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "KIPP tvrdí, že nic nepotřeboval. Obvod si přitom nainstaloval dřív, než dozní „všechno nejlepší“.",
              en: "KIPP insists it needed nothing. It installs the circuit before you finish saying “happy birthday”.",
            },
            effects: [
              { t: "morale", n: 5 },
              { t: "buff", effect: { stat: "researchRate", mul: 1.4 }, secs: 900 },
            ],
          },
        ],
      },
      {
        id: "sing",
        label: { cs: "Zazpívat mu", en: "Sing to it" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Zpíváš falešně a z plných plic. KIPP si zpěv nahrává „pro účely pozdějšího vydírání“ a třikrát si ho přehraje.",
              en: "You sing off-key and at full volume. KIPP records it “for future blackmail purposes” and plays it back three times.",
            },
            effects: [{ t: "morale", n: 5 }],
          },
        ],
      },
    ],
  },
  {
    id: "kipp_jealous",
    type: "kipp",
    weight: 7,
    cooldown: 10800,
    when: { feature: "drones" },
    title: { cs: "KIPP žárlí", en: "KIPP Is Jealous" },
    text: {
      cs: "Od té doby, co máš drony, je KIPP nezvykle zdvořilý. Dnes se konečně zeptal: „Ti noví. Jsou chytřejší než já?“ Jeden z dronů mezitím narazil do zdi.",
      en: "Ever since you got the drones, KIPP has been unusually polite. Today it finally asks: “The new ones. Are they smarter than me?” Meanwhile, one of the drones flies into a wall.",
    },
    choices: [
      {
        id: "reassure",
        label: { cs: "Ujistit ho, že ne", en: "Reassure it" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Říkáš, že drony jsou ruce, ale on je hlava. KIPP odpoví, že to věděl, a zbytek dne si pohvizduje.",
              en: "You say the drones are the hands, but KIPP is the head. KIPP says it knew that, and whistles for the rest of the day.",
            },
            effects: [
              { t: "morale", n: 3 },
              { t: "buff", effect: { stat: "allProd", mul: 1.15 }, secs: 300 },
            ],
          },
        ],
      },
      {
        id: "command",
        label: { cs: "Jmenovat ho velitelem", en: "Make it drone commander" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "KIPP přijímá velení letky s vážností admirála. Drony teď létají ve formaci a salutují křídly.",
              en: "KIPP accepts command of the squadron with an admiral's gravity. The drones now fly in formation and salute with their wings.",
            },
            effects: [{ t: "buff", effect: { stat: "salvageRate", mul: 1.3 }, secs: 600 }],
          },
        ],
      },
      {
        id: "tease",
        label: { cs: "Říct, že jsou hezčí", en: "Say they are prettier" },
        risk: 1,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "KIPP se zasměje a do večera přelakuje drony narůžovo. Létají stejně, jen to teď má styl.",
              en: "KIPP laughs, and by evening has repainted the drones pink. They fly the same, only now with style.",
            },
            effects: [{ t: "morale", n: 4 }],
          },
          {
            weight: 1,
            text: {
              cs: "KIPP „omylem“ poslal dva drony uklízet reaktor. Vrátili se, ale chvíli jim to trvalo.",
              en: "KIPP “accidentally” sends two drones to tidy the reactor. They come back, but it takes them a while.",
            },
            effects: [{ t: "credits", secs: -40 }],
          },
        ],
      },
    ],
  },
  {
    id: "kipp_defrag_dream",
    type: "kipp",
    weight: 6,
    cooldown: 14400,
    when: { depthMin: 10, chapterMin: 3 },
    title: { cs: "KIPPovi se něco zdálo", en: "KIPP Had a Dream" },
    text: {
      cs: "Po noční defragmentaci je KIPP zamlklý. „Systémy jako já nesní,“ říká po chvíli. „Ale kdyby snily, viděl bych dnes v noci můstek plný lidí a někdo by se smál.“",
      en: "After the nightly defragmentation KIPP is subdued. “Systems like me do not dream,” it says after a while. “But if they did, I would have seen the bridge full of people last night, and someone laughing.”",
    },
    choices: [
      {
        id: "ask",
        label: { cs: "Zeptat se, kdo se smál", en: "Ask who was laughing" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "KIPP přehraje čtyři vteřiny záznamu, o kterém nevěděl, že ho má. Je to smích a pak cvaknutí hrnku o stůl.",
              en: "KIPP plays four seconds of a recording it did not know it had. There is laughter, then the click of a mug on a table.",
            },
            effects: [{ t: "log" }, { t: "morale", n: 2 }],
          },
        ],
      },
      {
        id: "sit",
        label: { cs: "Sednout si k němu", en: "Keep it company" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Sedíš na můstku a nic neříkáš. Po hodině KIPP oznámí, že je mu „v mezích specifikace“.",
              en: "You sit on the bridge and say nothing. After an hour KIPP announces that it feels “within specification”.",
            },
            effects: [{ t: "morale", n: 5 }],
          },
        ],
      },
      {
        id: "footage",
        label: { cs: "Projít ten záznam", en: "Go through the footage" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Záznam je rozsypaný po paměti jako puzzle bez krabice. Skládáš ho po zlomcích vteřiny.",
              en: "The footage is scattered across memory like a jigsaw without a box. You piece it together a fraction of a second at a time.",
            },
            effects: [
              {
                t: "minigame",
                game: "calibrate",
                tier: 2,
                win: [{ t: "log" }, { t: "rp", secs: 90 }],
                lose: [{ t: "morale", n: -2 }],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "kipp_octopus_scheme",
    type: "kipp",
    weight: 8,
    cooldown: 5400,
    when: { depthMin: 2, deck: { id: "reactor", level: 1 } },
    title: { cs: "KIPP má nápad", en: "KIPP Has an Idea" },
    text: {
      cs: "KIPP navrhuje přesměrovat energii „kreativním způsobem“. Na dotaz, co to znamená, pošle schéma, které vypadá jako dětská kresba chobotnice.",
      en: "KIPP proposes rerouting power “in a creative way”. Asked what that means, it sends a diagram that looks like a child's drawing of an octopus.",
    },
    choices: [
      {
        id: "together",
        label: { cs: "Zkusit to s ním", en: "Try it together" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Ty u ventilů, KIPP u schématu. Každé chapadlo chobotnice je jeden okruh a všechna chtějí tlak najednou.",
              en: "You at the valves, KIPP at the diagram. Each tentacle of the octopus is a circuit, and they all want pressure at once.",
            },
            effects: [
              {
                t: "minigame",
                game: "valves",
                tier: 1,
                win: [{ t: "buff", effect: { stat: "allProd", mul: 1.35 }, secs: 600 }],
                lose: [{ t: "moduleDamage", pct: 10, count: 1 }],
              },
            ],
          },
        ],
      },
      {
        id: "decline",
        label: { cs: "Poděkovat a odmítnout", en: "Thank it and decline" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "KIPP ukládá schéma do složky „Nedoceněné“. Je to velká složka.",
              en: "KIPP files the diagram in a folder named “Underappreciated”. It is a large folder.",
            },
            effects: [{ t: "morale", n: 1 }],
          },
        ],
      },
      {
        id: "alone",
        label: { cs: "Ať to udělá sám", en: "Let KIPP do it alone" },
        risk: 2,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "Chobotnice funguje. Nikdo neví proč, a KIPP ze všech nejmíň.",
              en: "The octopus works. Nobody knows why, KIPP least of all.",
            },
            effects: [{ t: "buff", effect: { stat: "allProd", mul: 1.4 }, secs: 600 }],
          },
          {
            weight: 2,
            text: {
              cs: "Chobotnice nefunguje. Půl hodiny na lodi svítí jen lednice.",
              en: "The octopus does not work. For half an hour the only light aboard is the fridge.",
            },
            effects: [
              { t: "credits", secs: -60 },
              { t: "moduleDamage", pct: 8, count: 1 },
            ],
          },
        ],
      },
    ],
  },
];

import type { EventDef } from "@/engine/types";

export const anomaly: EventDef[] = [
  {
    id: "anomaly_cold_spot",
    type: "anomaly",
    weight: 10,
    cooldown: 2400,
    title: { cs: "Studené místo", en: "The Cold Spot" },
    text: {
      cs: "Loď vplula do místa, kde je vesmír z nějakého důvodu ještě studenější než jinde. Na trupu roste jinovatka a KIPP hlásí, že mu zamrzá smysl pro humor.",
      en: "The ship drifts into a patch where space is, for some reason, even colder than elsewhere. Frost is growing on the hull and KIPP reports that its sense of humour is freezing over.",
    },
    choices: [
      {
        id: "scrape",
        label: { cs: "Oškrábat jinovatku", en: "Scrape off the frost" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Škrábete trup jako přední sklo v lednu. Led je překvapivě čistý a je ho plný sběrač.",
              en: "You scrape the hull like a windscreen in January. The ice is surprisingly clean, and there is a full scoop of it.",
            },
            effects: [{ t: "item", item: "ice", n: 50, scaled: true }],
          },
        ],
      },
      {
        id: "measure",
        label: { cs: "Zůstat a měřit", en: "Stay and measure" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Teploměr ukazuje číslo, které by fyzika neměla dovolit. KIPP si ho zapisuje s potěšením udavače.",
              en: "The thermometer shows a number physics should not permit. KIPP writes it down with an informer's delight.",
            },
            effects: [
              { t: "rp", secs: 60 },
              { t: "item", item: "ice", n: 20, scaled: true },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Měření se protáhlo a jedno potrubí to vzdalo. Praskalo při tom skoro omluvně.",
              en: "The measuring runs long and one pipe gives up. It cracks almost apologetically.",
            },
            effects: [
              { t: "hull", pct: -3 },
              { t: "rp", secs: 30 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "anomaly_time_hiccup",
    type: "anomaly",
    weight: 8,
    cooldown: 3600,
    when: { depthMin: 2 },
    title: { cs: "Škytnutí času", en: "A Hiccup in Time" },
    text: {
      cs: "Poslední čtyři vteřiny se právě staly dvakrát. KIPP to potvrzuje a dodává, že poslední čtyři vteřiny se právě staly dvakrát.",
      en: "The last four seconds have just happened twice. KIPP confirms it and adds that the last four seconds have just happened twice.",
    },
    choices: [
      {
        id: "ride",
        label: { cs: "Těžit všechno dvakrát", en: "Mine everything twice" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Každý úder laseru se počítá dvakrát. Účetnictví tomu nerozumí, ale neprotestuje.",
              en: "Every laser strike counts twice. The accounts do not understand it, but they do not object.",
            },
            effects: [{ t: "buff", effect: { stat: "allProd", mul: 1.5 }, secs: 180 }],
          },
          {
            weight: 1,
            text: {
              cs: "Dvakrát se bohužel stala i jedna porucha. Aspoň víte přesně, jak ji opravit.",
              en: "Unfortunately one malfunction also happens twice. At least you know exactly how to fix it.",
            },
            effects: [
              { t: "moduleDamage", pct: 10, count: 1 },
              { t: "buff", effect: { stat: "allProd", mul: 1.25 }, secs: 120 },
            ],
          },
        ],
      },
      {
        id: "measure",
        label: { cs: "Změřit to", en: "Take measurements" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Stopky naměřily čtyři vteřiny a pak ty samé čtyři vteřiny znovu. Laboratoř slaví, i když neví přesně co.",
              en: "The stopwatch records four seconds, and then the same four seconds again. The lab celebrates, without knowing quite what.",
            },
            effects: [
              { t: "rp", secs: 60 },
              { t: "codex", key: "phenomenon_time_hiccup" },
            ],
          },
        ],
      },
      {
        id: "back",
        label: { cs: "Vycouvat", en: "Back out slowly" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Couváte ven. Pak couváte ven ještě jednou, tentokrát už z donucení.",
              en: "You back out. Then you back out once more, this time not by choice.",
            },
            effects: [{ t: "credits", secs: 20 }],
          },
        ],
      },
    ],
  },
  {
    id: "anomaly_gravity_lens",
    type: "anomaly",
    weight: 8,
    cooldown: 3600,
    when: { depthMin: 3, feature: "scan" },
    title: { cs: "Gravitační čočka", en: "The Gravity Lens" },
    text: {
      cs: "Neviditelná hmota tu ohýbá světlo jako dno sklenice. Za ní se na okamžik ukazují soustavy, kam byste jinak letěli celé měsíce.",
      en: "Unseen mass bends the light here like the bottom of a glass. Beyond it, for a moment, you can see systems that would otherwise take months to reach.",
    },
    choices: [
      {
        id: "focus",
        label: { cs: "Zaostřit skenery", en: "Focus the scanners" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Ladíte ohnisko na dalekohled velký jako půl soustavy. Stačí se netřást.",
              en: "You tune the focus of a telescope half a system wide. All you have to do is not shake.",
            },
            effects: [
              {
                t: "minigame",
                game: "calibrate",
                tier: 1,
                win: [
                  { t: "buff", effect: { stat: "scanSpeed", mul: 1.5 }, secs: 600 },
                  { t: "rp", secs: 60 },
                  { t: "codex", key: "phenomenon_gravity_lens" },
                ],
                lose: [{ t: "moduleDamage", pct: 8, count: 1, family: "scanner" }],
              },
            ],
          },
        ],
      },
      {
        id: "look",
        label: { cs: "Dívat se pouhým okem", en: "Look with the naked eye" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Na pár vteřin vidíte celou cestu před sebou, zmenšenou do kapky. Je delší, než jste čekali, a hezčí.",
              en: "For a few seconds you see the whole road ahead, shrunk into a droplet. It is longer than you expected, and prettier.",
            },
            effects: [
              { t: "morale", n: 3 },
              { t: "codex", key: "phenomenon_gravity_lens" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "anomaly_mirror_ship",
    type: "anomaly",
    weight: 6,
    cooldown: 7200,
    when: { depthMin: 6, failure: "none" },
    title: { cs: "Odraz na pravoboku", en: "Reflection to Starboard" },
    text: {
      cs: "Vedle vás letí druhý Gaffer. Stejné záplaty, stejné škrábance, jen zrcadlově obrácené. U okna stojí někdo, kdo vám mává o půl vteřiny dřív než vy jemu.",
      en: "A second Gaffer is flying beside you. The same patches, the same scratches, only mirrored. At the window stands someone who waves half a second before you do.",
    },
    choices: [
      {
        id: "wave",
        label: { cs: "Zamávat zpátky", en: "Wave back" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Mává, vy máváte, on to věděl předem. Pak odraz zmizí a je vám trochu líto, že jste se nezeptali, jak to dopadne.",
              en: "It waves, you wave, it knew you would. Then the reflection is gone, and you rather wish you had asked how it all turns out.",
            },
            effects: [{ t: "morale", n: 2 }],
          },
        ],
      },
      {
        id: "hail",
        label: { cs: "Zavolat mu", en: "Hail it" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "KIPP si dvě minuty povídá sám se sebou. Pak uznale hlásí, že ten druhý má lepší kompresi dat, a půlku z ní stihl opsat.",
              en: "KIPP spends two minutes talking to itself. Then it reports, with respect, that the other one has better data compression, and that it copied half of it.",
            },
            effects: [
              { t: "rp", secs: 90 },
              { t: "buff", effect: { stat: "researchRate", mul: 1.3 }, secs: 600 },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Na druhé straně to někdo zvedl, řekl „Prosím, nezavěšujte“ a zavěsil.",
              en: "Someone on the other side picks up, says “Please hold”, and hangs up.",
            },
            effects: [{ t: "morale", n: -3 }],
          },
        ],
      },
      {
        id: "cross",
        label: { cs: "Proletět skrz něj", en: "Fly through it" },
        risk: 2,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "Na okamžik jste na obou lodích zároveň. Když to skončí, máte v nákladu věci, které jste nikdy nenaložili.",
              en: "For an instant you are aboard both ships at once. When it ends, the hold contains things you never loaded.",
            },
            effects: [
              { t: "item", item: "voidglass", n: 30, scaled: true },
              { t: "item", item: "strange_dust", n: 10, scaled: true },
            ],
          },
          {
            weight: 2,
            text: {
              cs: "Něco se spletlo a už si nejste jistí, kdo z vás dvou je ten původní. Přístroje taky ne.",
              en: "Something gets crossed, and you are no longer sure which of you is the original. Neither are the instruments.",
            },
            effects: [{ t: "failure", kind: "anomaly" }],
          },
        ],
      },
    ],
  },
  {
    id: "anomaly_humming_dark",
    type: "anomaly",
    weight: 7,
    cooldown: 5400,
    when: { depthMin: 9 },
    title: { cs: "Prázdno, které brumlá", en: "The Humming Dark" },
    text: {
      cs: "Kus vesmíru před vámi vydává tón. Zvuk se vakuem šířit nemůže, což tomu tónu zjevně nikdo neřekl. Trup se chvěje do rytmu a šroubky taky.",
      en: "The patch of space ahead is producing a note. Sound cannot travel in a vacuum, which evidently nobody has told the note. The hull trembles in rhythm, and so do the bolts.",
    },
    choices: [
      {
        id: "sync",
        label: { cs: "Naladit se na něj", en: "Tune in to it" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Nastavujete chod lodi podle rytmu, který tu neměl být. KIPP si pobrukuje a tvrdí, že ne.",
              en: "You set the ship's cycles to a rhythm that should not be here. KIPP hums along and claims otherwise.",
            },
            effects: [
              {
                t: "minigame",
                game: "rhythm",
                tier: 2,
                win: [
                  { t: "buff", effect: { stat: "allProd", mul: 1.3 }, secs: 600 },
                  { t: "item", item: "strange_dust", n: 15, scaled: true },
                ],
                lose: [{ t: "moduleDamage", pct: 12, count: 2 }],
              },
            ],
          },
        ],
      },
      {
        id: "record",
        label: { cs: "Nahrát to", en: "Record it" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "KIPP nahrávku stokrát zpomalil. Tvrdí, že v ní slyší čekací melodii, ale tu teď slyší ve všem.",
              en: "KIPP slows the recording down a hundredfold. It claims to hear hold music in it, but lately it hears that in everything.",
            },
            effects: [{ t: "rp", secs: 70 }],
          },
        ],
      },
      {
        id: "bolts",
        label: { cs: "Dotáhnout šroubky", en: "Tighten the bolts" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Obcházíte loď s klíčem a tón vám udává tempo. Takhle dotažená nebyla od loděnice.",
              en: "You go round the ship with a spanner while the note sets the tempo. She has not been this tight since the shipyard.",
            },
            effects: [{ t: "hull", pct: 3 }],
          },
        ],
      },
    ],
  },
  {
    id: "anomaly_fold",
    type: "anomaly",
    weight: 5,
    cooldown: 9000,
    when: { depthMin: 12, failure: "none" },
    title: { cs: "Záhyb", en: "The Fold" },
    text: {
      cs: "Vesmír je tu přeložený jako špatně složená mapa. V záhybu je vidět škvíra a v té škvíře světlo, které nemá odkud svítit.",
      en: "Space here is creased like a badly folded map. In the crease there is a gap, and in the gap a light with nowhere to shine from.",
    },
    choices: [
      {
        id: "enter",
        label: { cs: "Vletět do škvíry", en: "Fly into the gap" },
        risk: 2,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Loď se protáhla škvírou jako nit uchem jehly. Na druhé straně je ticho a spousta věcí.",
              en: "The ship threads the gap like cotton through a needle. On the other side there is silence and a great many things.",
            },
            effects: [{ t: "chain", event: "anomaly_fold_inside", delay: 5 }],
          },
          {
            weight: 1,
            text: {
              cs: "Škvíra se sevřela ve chvíli, kdy jste byli napůl uvnitř. Která půlka je kde, se teď určuje těžko.",
              en: "The gap closes while you are halfway in. Which half is where has become hard to say.",
            },
            effects: [{ t: "failure", kind: "anomaly" }],
          },
        ],
      },
      {
        id: "beacon",
        label: { cs: "Hodit tam maják", en: "Toss in a beacon" },
        cost: { items: { beacon: 1 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Maják zmizel a za minutu se vrátil z druhé strany, o den starší a obalený prachem, který nejde zařadit.",
              en: "The beacon vanishes and returns a minute later from the other side, a day older and coated in dust that defies classification.",
            },
            effects: [
              { t: "item", item: "strange_dust", n: 20, scaled: true },
              { t: "rp", secs: 60 },
              { t: "codex", key: "phenomenon_fold" },
            ],
          },
        ],
      },
      {
        id: "skip",
        label: { cs: "Obletět to obloukem", en: "Give it a wide berth" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Mapa zůstává špatně složená. Někdo po vás se ji určitě pokusí narovnat.",
              en: "The map stays badly folded. Someone after you will surely try to smooth it out.",
            },
            effects: [{ t: "rp", secs: 15 }],
          },
        ],
      },
    ],
  },
  {
    id: "anomaly_fold_inside",
    type: "anomaly",
    weight: 1,
    chainOnly: true,
    title: { cs: "Kam se ztrácejí věci", en: "Where Lost Things Go" },
    text: {
      cs: "Uvnitř záhybu se vznáší všechno, co kdy kdo založil. Liché ponožky, klíče desítky, propisky, deštníky. A taky hrnek s nápisem „Majetek S.S. Gaffer“, ještě vlažný.",
      en: "Inside the fold floats everything anyone has ever mislaid. Odd socks, ten-millimetre spanners, pens, umbrellas. And a mug marked “Property of S.S. Gaffer”, still lukewarm.",
    },
    choices: [
      {
        id: "mug",
        label: { cs: "Vzít ten hrnek", en: "Take the mug" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Hrnek je vlažný a na dně je čerstvá sedlina. KIPP vás žádá, abyste mu to nevysvětlovali.",
              en: "The mug is lukewarm, with fresh grounds at the bottom. KIPP asks you not to explain it.",
            },
            effects: [{ t: "log" }, { t: "morale", n: 3 }, { t: "flag", key: "found_warm_mug" }],
          },
        ],
      },
      {
        id: "spanners",
        label: { cs: "Nabrat klíče desítky", en: "Grab the spanners" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Konečně. Všechny klíče desítky, které se kdy komu ztratily, a jsou vaše.",
              en: "At last. Every ten-millimetre spanner anyone has ever lost, and they are all yours.",
            },
            effects: [
              { t: "item", item: "spare_parts", n: 3 },
              { t: "item", item: "strange_dust", n: 15, scaled: true },
            ],
          },
        ],
      },
      {
        id: "deeper",
        label: { cs: "Hledat hlouběji", en: "Search deeper" },
        risk: 2,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "Za hromadou deštníků leží cizí nářadí a výkres, který ještě nikdo nenakreslil.",
              en: "Behind the pile of umbrellas lie unfamiliar tools and a blueprint nobody has drawn yet.",
            },
            effects: [{ t: "blueprint" }, { t: "item", item: "voidglass", n: 20, scaled: true }],
          },
          {
            weight: 1,
            text: {
              cs: "Zabloudili jste mezi ztracenými deštníky. Ven vás vyvedl až KIPP, a to po zvuku vlastního nadávání.",
              en: "You get lost among the lost umbrellas. KIPP finally guides you out by the sound of its own swearing.",
            },
            effects: [
              { t: "morale", n: -3 },
              { t: "moduleDamage", pct: 10, count: 1 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "anomaly_radar_ghosts",
    type: "anomaly",
    weight: 8,
    cooldown: 3600,
    when: { depthMin: 4 },
    title: { cs: "Duchové na radaru", en: "Ghosts on the Radar" },
    text: {
      cs: "Radar ukazuje sedmnáct lodí v těsné formaci kolem vás. Z okna není vidět žádná. KIPP navrhuje buď opravit radar, nebo začít věřit na duchy, podle toho, co vyjde levněji.",
      en: "The radar shows seventeen ships in tight formation around you. The window shows none. KIPP suggests either fixing the radar or starting to believe in ghosts, whichever is cheaper.",
    },
    choices: [
      {
        id: "fix",
        label: { cs: "Opravit radar", en: "Fix the radar" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Za panelem radaru je klubko kabelů a každý vede někam jinam, než říká štítek.",
              en: "Behind the radar panel is a knot of cables, each going somewhere other than its label says.",
            },
            effects: [
              {
                t: "minigame",
                game: "wire",
                tier: 1,
                win: [
                  { t: "buff", effect: { stat: "scanSpeed", mul: 1.25 }, secs: 600 },
                  { t: "credits", secs: 40 },
                ],
                lose: [{ t: "moduleDamage", pct: 8, count: 1, family: "scanner" }],
              },
            ],
          },
        ],
      },
      {
        id: "follow",
        label: { cs: "Letět s formací", en: "Fly in formation" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Držíte se v řadě s loděmi, které nejsou. Dovedou vás k poli trosek, které je.",
              en: "You hold your place in line with ships that are not there. They lead you to a debris field that is.",
            },
            effects: [
              { t: "item", item: "scrap", n: 80, scaled: true },
              { t: "item", item: "conductite", n: 20, scaled: true },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Formace zatočila doleva. Vy jste zatočili do šutru.",
              en: "The formation turns left. You turn into a rock.",
            },
            effects: [{ t: "hull", pct: -6 }],
          },
        ],
      },
      {
        id: "ignore",
        label: { cs: "Vypnout obrazovku", en: "Turn the screen off" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Co oči nevidí, to radar nebolí. Sedmnáct lodí zdvořile mizí.",
              en: "What the eye does not see, the radar does not grieve over. Seventeen ships politely disappear.",
            },
            effects: [{ t: "morale", n: 1 }],
          },
        ],
      },
    ],
  },
  {
    id: "anomaly_event_horizon",
    type: "anomaly",
    weight: 9,
    cooldown: 5400,
    when: { star: ["blackHole"], failure: "none" },
    title: { cs: "Na kraji díry", en: "At the Edge of the Hole" },
    text: {
      cs: "Černá díra vyplňuje půlku okna a hvězdy kolem ní se natahují jako žvýkačka. Čas tu teče pomaleji. KIPP toho využívá a konečně dokončuje větu, kterou začal včera.",
      en: "The black hole fills half the window and the stars around it stretch like chewing gum. Time runs slower here. KIPP takes the opportunity to finish a sentence it started yesterday.",
    },
    choices: [
      {
        id: "skim",
        label: { cs: "Olíznout horizont", en: "Skim the horizon" },
        risk: 2,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Sběrač nabírá to, co z díry odlétá naposled. Je to vzácné, svítí to a váhy z toho šílí.",
              en: "The scoop collects whatever leaves the hole last. It is rare, it glows, and it drives the scales mad.",
            },
            effects: [
              { t: "item", item: "antimatter", n: 10, scaled: true },
              { t: "item", item: "strange_dust", n: 20, scaled: true },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Horizont vás chtěl víc, než jste čekali. Loď se vyrvala ven, ale kus skutečnosti zůstal pozadu.",
              en: "The horizon wants you more than expected. The ship tears free, but a piece of reality stays behind.",
            },
            effects: [{ t: "failure", kind: "anomaly" }],
          },
        ],
      },
      {
        id: "slow",
        label: { cs: "Těžit v pomalém čase", en: "Mine in slow time" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Venku uběhla hodina, tady celá směna. Účetnictví to nepochopí, ale sklad ano.",
              en: "An hour passes outside, a whole shift in here. The accounts will not understand, but the warehouse will.",
            },
            effects: [{ t: "credits", secs: 180 }],
          },
          {
            weight: 1,
            text: {
              cs: "Přepočítali jste se ve směru. Venku uběhl týden, káva vystydla a jeden modul stihl zestárnout.",
              en: "You got the direction wrong. A week passes outside, the coffee goes cold and one module has time to age.",
            },
            effects: [
              { t: "moduleDamage", pct: 10, count: 1 },
              { t: "credits", secs: 60 },
            ],
          },
        ],
      },
      {
        id: "stare",
        label: { cs: "Dívat se do tmy", en: "Stare into the dark" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Díváte se do tmy a tma se nedívá zpátky. Je to skoro úleva.",
              en: "You stare into the dark and the dark does not stare back. It is almost a relief.",
            },
            effects: [
              { t: "rp", secs: 90 },
              { t: "codex", key: "phenomenon_event_horizon" },
            ],
          },
        ],
      },
    ],
  },
];

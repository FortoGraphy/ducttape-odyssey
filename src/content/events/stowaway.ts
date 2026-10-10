import type { EventDef } from "@/engine/types";

export const stowaway: EventDef[] = [
  {
    id: "stowaway_cargo_mice",
    type: "stowaway",
    weight: 9,
    cooldown: 3600,
    title: { cs: "Myši v nákladu", en: "Mice in the Cargo" },
    text: {
      cs: "V nákladovém prostoru se usadila rodina myší. Nikdo neví, jak se dostaly do vesmíru, ale mají tu hnízdo z izolace a tváří se, že platí nájem.",
      en: "A family of mice has moved into the cargo hold. Nobody knows how they got into space, but they have built a nest of insulation and behave as if they pay rent.",
    },
    choices: [
      {
        id: "catch",
        label: { cs: "Pochytat je", en: "Catch them" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Po hodině honičky je máte všechny v krabici. Vysadíte je na příští stanici, slíbili jste jim to.",
              en: "After an hour's chase you have them all in a box. You will drop them at the next station, as promised.",
            },
            effects: [
              { t: "credits", secs: 30 },
              { t: "morale", n: 1 },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Chytili jste dvě. Zbylých devět si mezitím přestěhovalo hnízdo do kabeláže.",
              en: "You catch two. The other nine have meanwhile moved the nest into the wiring.",
            },
            effects: [{ t: "hull", pct: -2 }],
          },
        ],
      },
      {
        id: "stay",
        label: { cs: "Nechat je bydlet", en: "Let them stay" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Dostaly kousek sýra a jména po strojnících. V noci teď na lodi něco šustí a je to vlastně příjemné.",
              en: "They get a bit of cheese and the names of old engineers. Something rustles aboard at night now, and it is rather nice.",
            },
            effects: [
              { t: "morale", n: 4 },
              { t: "flag", key: "mice_aboard" },
            ],
          },
        ],
      },
      {
        id: "kipp",
        label: { cs: "Pověřit tím KIPPa", en: "Put KIPP in charge" },
        risk: 1,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "KIPP jim ultrazvukem pustil přednášku o majetkovém právu. Odstěhovaly se samy a nechaly po sobě vzorně uklizeno.",
              en: "KIPP plays them an ultrasonic lecture on property law. They move out by themselves and leave the place spotless.",
            },
            effects: [{ t: "credits", secs: 40 }],
          },
          {
            weight: 1,
            good: true,
            text: {
              cs: "KIPP se s nimi skamarádil a teď jim čte na dobrou noc. Popírá to, ale ze skladu je slyšet technický manuál.",
              en: "KIPP befriends them and now reads them bedtime stories. KIPP denies it, but a technical manual can be heard from the hold.",
            },
            effects: [
              { t: "morale", n: 3 },
              { t: "flag", key: "mice_aboard" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "stowaway_not_a_cat",
    type: "stowaway",
    weight: 8,
    cooldown: 10800,
    when: { depthMin: 1, flagNot: "ship_pet" },
    title: { cs: "Tohle není kočka", en: "This Is Not a Cat" },
    text: {
      cs: "Ve větrací šachtě svítí dvě oči. Tvor, který z ní vyleze, má šest nohou, přede a otírá se vám o lýtka. KIPP ho eviduje jako „nelicencovanou biomasu“.",
      en: "Two eyes glow in the ventilation shaft. The creature that climbs out has six legs, purrs, and rubs against your shins. KIPP registers it as “unlicensed biomass”.",
    },
    choices: [
      {
        id: "keep",
        label: { cs: "Nechat si ji", en: "Keep it" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Dostala misku, deku a jméno Podložka. KIPP protestuje, a přitom jí potají přitápí v šachtě.",
              en: "It gets a bowl, a blanket and the name Washer. KIPP objects, while secretly turning up the heat in its shaft.",
            },
            effects: [
              { t: "morale", n: 6 },
              { t: "buff", effect: { stat: "moraleGain", mul: 1.5 }, secs: 900 },
              { t: "codex", key: "fauna_shaft_purrer" },
              { t: "flag", key: "ship_pet" },
            ],
          },
        ],
      },
      {
        id: "feed",
        label: { cs: "Nakrmit ji a pustit", en: "Feed it and let it go" },
        cost: { items: { organics: 5 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Najedla se, olízla vám ruku a zmizela v šachtě. Od té doby občas najdete na polštáři ulovený šroub.",
              en: "It eats, licks your hand and vanishes into the shaft. Ever since, you occasionally find a freshly hunted bolt on your pillow.",
            },
            effects: [
              { t: "morale", n: 3 },
              { t: "item", item: "spare_parts", n: 1 },
              { t: "codex", key: "fauna_shaft_purrer" },
            ],
          },
        ],
      },
      {
        id: "shoo",
        label: { cs: "Vyhnat ji", en: "Shoo it away" },
        risk: 1,
        outcomes: [
          {
            weight: 2,
            text: {
              cs: "Odešla s výrazem, který si budete pamatovat. KIPP výjimečně mlčí, a o to je to horší.",
              en: "It leaves with an expression you will remember. KIPP, for once, says nothing, which makes it worse.",
            },
            effects: [{ t: "morale", n: -2 }],
          },
          {
            weight: 1,
            good: true,
            text: {
              cs: "Nevyhnali jste ji. Jen teď bydlí v šachtě nad vaší postelí a v noci přede naschvál.",
              en: "You do not shoo it away. It simply lives in the shaft above your bunk now and purrs at night out of spite.",
            },
            effects: [
              { t: "morale", n: 2 },
              { t: "codex", key: "fauna_shaft_purrer" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "stowaway_runaway",
    type: "stowaway",
    weight: 7,
    cooldown: 10800,
    when: { depthMin: 3, feature: "crew" },
    title: { cs: "Černý pasažér", en: "The Stowaway" },
    text: {
      cs: "Za bednami s konzervami sedí výrostek s batohem a s výrazem někoho, kdo má připravenou řeč. „Umím svářet, vařit a mlčet,“ vyhrkne. „To poslední zatím trénuju.“",
      en: "Behind the tinned food sits a teenager with a rucksack and the look of someone who has prepared a speech. “I can weld, cook and keep quiet,” the kid blurts out. “Still practising the last one.”",
    },
    choices: [
      {
        id: "hire",
        label: { cs: "Vzít ho do party", en: "Sign the kid on" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Dostal kombinézu o tři čísla větší a první směnu u lopaty. Září, jako by vyhrál v loterii.",
              en: "The kid gets overalls three sizes too big and a first shift on the shovel, and beams like a lottery winner.",
            },
            effects: [{ t: "crew" }, { t: "morale", n: 3 }],
          },
        ],
      },
      {
        id: "home",
        label: { cs: "Vysadit ho na stanici", en: "Drop the kid at a station" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Na nejbližší stanici si ho převzala teta, která vypadala připravená na všechno. Vám poděkovala a jemu slíbila pohovor.",
              en: "At the nearest station an aunt who looks ready for anything takes over. She thanks you, and promises the kid a talk.",
            },
            effects: [
              { t: "rep", faction: "lamplighters", n: 3 },
              { t: "morale", n: -1 },
            ],
          },
        ],
      },
      {
        id: "work",
        label: { cs: "Ať si cestu odpracuje", en: "Work off the fare" },
        risk: 1,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "Za týden vydrhl strojovnu a opravil čerpadlo, o kterém jste ani nevěděli. Vystoupil s doporučením v kapse.",
              en: "Within a week the engine room is scrubbed and a pump you never knew about is fixed. The kid leaves with a reference in one pocket.",
            },
            effects: [
              { t: "credits", secs: 120 },
              { t: "morale", n: 2 },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Při práci „vylepšil“ jeden modul. Myslel to dobře, což je na tom to nejhorší.",
              en: "While working, the kid “improves” one module. It was well meant, which is the worst part.",
            },
            effects: [
              { t: "moduleDamage", pct: 12, count: 1 },
              { t: "credits", secs: 60 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "stowaway_rustborn_tinkerer",
    type: "stowaway",
    weight: 6,
    cooldown: 10800,
    when: { depthMin: 5, modulesMin: 1 },
    title: { cs: "Někdo tu opravuje", en: "Someone Is Fixing Things" },
    text: {
      cs: "Poslední týden se na lodi samy od sebe spravují věci. Dnes jste viníka načapali: stará Rezavá s čelovkou sedí ve strojovně a nadává na vaše svary.",
      en: "For the past week, things on the ship have been repairing themselves. Today you caught the culprit: an old Rustborn woman with a headlamp, sitting in the engine room and cursing your welds.",
    },
    choices: [
      {
        id: "berth",
        label: { cs: "Nabídnout jí místo", en: "Offer her a berth" },
        requires: { feature: "crew" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Řekla, že zůstane, dokud loď nebude v pořádku. KIPP spočítal, že to vychází přibližně na věčnost.",
              en: "She says she will stay until the ship is in order. KIPP calculates that this works out at roughly forever.",
            },
            effects: [{ t: "crew" }, { t: "hull", pct: 10 }, { t: "rep", faction: "rustborn", n: 3 }],
          },
        ],
      },
      {
        id: "coffee",
        label: { cs: "Uvařit jí kávu", en: "Make her coffee" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Vypila tři hrnky, dodělala, co zbývalo, a na příští zastávce vystoupila. Nechala vám seznam věcí, které děláte špatně.",
              en: "She drinks three mugs, finishes what was left, and gets off at the next stop. She leaves you a list of things you do wrong.",
            },
            effects: [
              { t: "hull", pct: 8 },
              { t: "buff", effect: { stat: "repairSpeed", mul: 1.5 }, secs: 900 },
              { t: "rep", faction: "rustborn", n: 2 },
            ],
          },
        ],
      },
      {
        id: "out",
        label: { cs: "Vykázat ji z lodi", en: "Show her the door" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Odešla bez řečí i s nářadím. Do večera se rozbila věc, která celý týden držela.",
              en: "She leaves without a word, taking her tools. By evening something that had held all week is broken.",
            },
            effects: [
              { t: "moduleDamage", pct: 8, count: 1 },
              { t: "rep", faction: "rustborn", n: -4 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "stowaway_pod_occupant",
    type: "stowaway",
    weight: 1,
    chainOnly: true,
    title: { cs: "Kdo byl v modulu", en: "Who Was in the Pod" },
    text: {
      cs: "Z modulu vylézá rozespalá žena v pyžamu s logem dávno zaniklé přepravní společnosti. „Řekli, ať chvíli počkám, že pro mě někdo přijde,“ zívá. „Jaký je rok?“",
      en: "A sleepy woman climbs out of the pod, in pyjamas bearing the logo of a long-defunct shipping line. “They told me to wait a moment, that someone would come for me,” she yawns. “What year is it?”",
    },
    choices: [
      {
        id: "job",
        label: { cs: "Nabídnout jí práci", en: "Offer her a job" },
        requires: { feature: "crew" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Když slyší letopočet, dlouho mlčí. Pak si vyhrne rukávy pyžama a zeptá se, kde je tu kafe a co je potřeba spravit.",
              en: "When she hears the year she is silent for a long time. Then she rolls up her pyjama sleeves and asks where the coffee is and what needs fixing.",
            },
            effects: [{ t: "crew" }, { t: "morale", n: 3 }],
          },
        ],
      },
      {
        id: "station",
        label: { cs: "Odvézt ji na stanici", en: "Take her to a station" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Na stanici dostala kabát a jízdenku. Vám zaplatila poukázkou té zaniklé společnosti, kterou kupodivu ještě někdo proplácí.",
              en: "At the station she is given a coat and a ticket. She pays you with a voucher from the defunct line, which someone, oddly, still honours.",
            },
            effects: [
              { t: "credits", secs: 90 },
              { t: "rep", faction: "lamplighters", n: 3 },
            ],
          },
        ],
      },
      {
        id: "time",
        label: { cs: "Dát jí kávu a čas", en: "Give her coffee and time" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Sedí s hrnkem u okna a dívá se ven. Než vystoupí, nechá vám plánek, který čtyřicet let nosila v kapse pyžama.",
              en: "She sits by the window with a mug, looking out. Before she leaves, she gives you a blueprint she carried in her pyjama pocket for forty years.",
            },
            effects: [{ t: "blueprint" }, { t: "morale", n: 4 }],
          },
        ],
      },
    ],
  },
  {
    id: "stowaway_fridge_mould",
    type: "stowaway",
    weight: 8,
    cooldown: 7200,
    when: { depthMin: 3 },
    title: { cs: "Život v lednici", en: "Life in the Fridge" },
    text: {
      cs: "Plíseň v zadní části lednice minulý týden objevila oheň. Dnes ráno jste na vnitřní straně dveří našli drobné malby, na kterých obří ruka bere jogurt.",
      en: "The mould at the back of the fridge discovered fire last week. This morning you found tiny paintings on the inside of the door, showing a giant hand taking a yoghurt.",
    },
    choices: [
      {
        id: "study",
        label: { cs: "Studovat ji", en: "Study it" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Za tři dny pozorování zvládli kolo a daně. Laboratoř žádá o větší lednici.",
              en: "In three days of observation they master the wheel and taxation. The lab requests a bigger fridge.",
            },
            effects: [
              { t: "rp", secs: 90 },
              { t: "codex", key: "flora_fridge_civilisation" },
            ],
          },
        ],
      },
      {
        id: "yoghurt",
        label: { cs: "Obětovat jim jogurt", en: "Offer them a yoghurt" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Na dveřích přibyla nová malba: obří ruka jogurt dává. Zdá se, že máte vlastní náboženství.",
              en: "A new painting appears on the door: the giant hand giving a yoghurt. It seems you now have a religion of your own.",
            },
            effects: [
              { t: "morale", n: 5 },
              { t: "codex", key: "flora_fridge_civilisation" },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Jogurt přijali a do rána rozšířili území o mrazák. Zmrzlinu od teď berte jako ztracenou.",
              en: "They accept the yoghurt and by morning have annexed the freezer. Consider the ice cream lost.",
            },
            effects: [
              { t: "morale", n: -1 },
              { t: "codex", key: "flora_fridge_civilisation" },
            ],
          },
        ],
      },
      {
        id: "scrub",
        label: { cs: "Vydrhnout lednici", en: "Scrub the fridge" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Civilizace skončila houbičkou a octem. Lednice je čistá a vy máte pocit, že jste do dějin vstoupili jako ten zlý.",
              en: "A civilisation ends with a sponge and vinegar. The fridge is clean, and you feel you have entered history as the villain.",
            },
            effects: [
              { t: "item", item: "organics", n: 20, scaled: true },
              { t: "morale", n: -2 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "stowaway_audit_drone",
    type: "stowaway",
    weight: 6,
    cooldown: 9000,
    when: { depthMin: 8 },
    title: { cs: "Dron, který počítá", en: "The Drone That Counts" },
    text: {
      cs: "V nákladu se schovává dron Tiché knihy velký jako švestka a potichu počítá všechno, co vidí. Když ho najdete, předstírá, že je šroub. Šrouby ovšem neblikají.",
      en: "A Quiet Ledger drone the size of a plum is hiding in the cargo, quietly counting everything it sees. When you find it, it pretends to be a bolt. Bolts, however, do not blink.",
    },
    choices: [
      {
        id: "return",
        label: { cs: "Vrátit ho s pozdravem", en: "Return it with regards" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Poslali jste ho domů v krabičce s mašlí. Tichá kniha odpověděla, že o žádném dronu neví a že děkuje za jeho vrácení.",
              en: "You send it home in a box with a bow. The Quiet Ledger replies that it knows of no drone, and thanks you for returning it.",
            },
            effects: [{ t: "rep", faction: "ledger", n: 4 }],
          },
        ],
      },
      {
        id: "hack",
        label: { cs: "Přeprogramovat ho", en: "Reprogram it" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Dron má šifrování jako banka a tvrdohlavost jako úředník. Sedáte si k němu s pinzetou.",
              en: "The drone has a bank's encryption and a clerk's stubbornness. You sit down beside it with tweezers.",
            },
            effects: [
              {
                t: "minigame",
                game: "hack",
                tier: 2,
                win: [
                  { t: "buff", effect: { stat: "sellValue", mul: 1.2 }, secs: 900 },
                  { t: "rp", secs: 60 },
                ],
                lose: [{ t: "rep", faction: "ledger", n: -4 }],
              },
            ],
          },
        ],
      },
      {
        id: "count",
        label: { cs: "Nechat ho počítat", en: "Let it count" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Když už počítá, ať počítá pro vás. Inventura na téhle lodi ještě nikdy nebyla tak přesná.",
              en: "If it insists on counting, it may as well count for you. The inventory on this ship has never been so accurate.",
            },
            effects: [
              { t: "buff", effect: { stat: "creditGain", mul: 1.1 }, secs: 600 },
              { t: "rep", faction: "ledger", n: 1 },
            ],
          },
        ],
      },
    ],
  },
];

import type { EventDef } from "@/engine/types";

// First-contact arc: someone else is travelling the service corridor. Flags gate the order:
// contact_ping -> contact_seen -> contact_gift -> contact_met. Depth gates sit just past the chapter
// triggers of src/content/story/chapters.ts so a beat never fires before its chapter intro.
export const contact: EventDef[] = [
  {
    id: "contact_first_ping",
    type: "contact",
    weight: 30,
    once: true,
    when: { depthMin: 8, chapterMin: 6 },
    title: { cs: "Někdo odpověděl", en: "Something Answered" },
    text: {
      cs: "KIPP jako každý den poslal do prázdna zkušební signál. Dnes poprvé přišla odpověď: řada prvočísel, pauza a pak tři tóny, které žádná lidská stupnice nezná.",
      en: "As on every other day, KIPP sent a test ping into the void. Today, for the first time, something answered: a string of prime numbers, a pause, and then three tones that belong to no human scale.",
    },
    choices: [
      {
        id: "primes",
        label: { cs: "Poslat další prvočísla", en: "Send the next primes" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Posíláš jedenáct, třináct a sedmnáct. Za hodinu přijde devatenáct a po něm něco, co KIPP odmítá nazvat smíchem.",
              en: "You send eleven, thirteen and seventeen. An hour later comes nineteen, followed by something KIPP refuses to call laughter.",
            },
            effects: [
              { t: "rp", secs: 120 },
              { t: "flag", key: "contact_ping" },
              { t: "codex", key: "contact_first_ping" },
            ],
          },
        ],
      },
      {
        id: "music",
        label: { cs: "Pustit čekací melodii", en: "Play the hold music" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Pouštíš jim melodii ze signálu. Chvíli je ticho a pak ji někdo zahraje zpátky, o oktávu níž a bez jediné chyby.",
              en: "You play them the tune from the signal. A silence follows, and then someone plays it back, an octave lower and without a single mistake.",
            },
            effects: [
              { t: "rp", secs: 90 },
              { t: "morale", n: 4 },
              { t: "flag", key: "contact_ping" },
              { t: "flag", key: "contact_knows_song" },
              { t: "codex", key: "contact_first_ping" },
            ],
          },
        ],
      },
      {
        id: "silent",
        label: { cs: "Mlčet a poslouchat", en: "Stay silent and listen" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Tři tóny se zopakují ještě dvakrát a pak utichnou. KIPP si je uložil a přehrává si je, když si myslí, že spíš.",
              en: "The three tones repeat twice more and then fall silent. KIPP has saved them and replays them when it thinks you are asleep.",
            },
            effects: [
              { t: "rp", secs: 60 },
              { t: "flag", key: "contact_ping" },
              { t: "codex", key: "contact_first_ping" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "contact_party_line",
    type: "contact",
    weight: 8,
    cooldown: 14400,
    when: { depthMin: 12, chapterMin: 6, flag: "contact_ping" },
    title: { cs: "Na lince je ještě někdo", en: "Someone Else Is on the Line" },
    text: {
      cs: "Mezi dvěma opakováními signálu je na lince slyšet ještě někdo. Nemluví. Jen si potichu pobrukuje ty tři tóny, jako když si někdo krátí čekání.",
      en: "Between two repeats of the signal, someone else can be heard on the line. They do not speak. They only hum those three tones, softly, the way people do to pass the time while waiting.",
    },
    choices: [
      {
        id: "hum",
        label: { cs: "Pobrukovat si s ním", en: "Hum along" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Brumláš ty tři tóny do mikrofonu. Na druhé straně se někdo zarazí a pak přidá čtvrtý.",
              en: "You hum the three tones into the microphone. On the other end someone stops short, then adds a fourth.",
            },
            effects: [
              { t: "rp", secs: 60 },
              { t: "morale", n: 2 },
              { t: "codex", key: "contact_party_line" },
            ],
          },
        ],
      },
      {
        id: "ask",
        label: { cs: "Zeptat se, kdo tam je", en: "Ask who is there" },
        risk: 1,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "Odpovědí je obraz: malá tečka, dlouhá rovná čára a na jejím konci světlo. Někdo letí stejnou chodbou jako ty.",
              en: "The answer is a picture: a small dot, a long straight line, and a light at the end of it. Someone is travelling the same corridor as you.",
            },
            effects: [
              { t: "rp", secs: 120 },
              { t: "flag", key: "contact_same_corridor" },
              { t: "codex", key: "contact_party_line" },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Linka zapraská a hlas ze signálu obě strany zdvořile požádá o trpělivost. Broukání zmlkne.",
              en: "The line crackles and the voice from the signal politely asks both parties for their patience. The humming stops.",
            },
            effects: [{ t: "morale", n: -2 }],
          },
        ],
      },
      {
        id: "patch",
        label: { cs: "Přepojit si ho k sobě", en: "Patch them through" },
        risk: 2,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Ústředna je datová struktura a datové struktury mají zadní vrátka. KIPP tvrdí, že o ničem neví, a podává ti šroubovák.",
              en: "A switchboard is a data structure, and data structures have back doors. KIPP claims to know nothing about it and hands you a screwdriver.",
            },
            effects: [
              {
                t: "minigame",
                game: "hack",
                tier: 3,
                win: [
                  { t: "rp", secs: 180 },
                  { t: "credits", secs: 120 },
                  { t: "flag", key: "contact_patched_through" },
                ],
                lose: [
                  { t: "moduleDamage", pct: 12, count: 1, family: "scanner" },
                  { t: "morale", n: -2 },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "contact_shape_in_dark",
    type: "contact",
    weight: 30,
    once: true,
    when: { depthMin: 16, chapterMin: 7, flag: "contact_ping" },
    title: { cs: "Tvar ve tmě", en: "A Shape in the Dark" },
    text: {
      cs: "Hvězdy na levoboku jedna po druhé zhasínají a zase se rozsvěcují. Něco obrovského letí souběžně s tebou a zakrývá je. Nemá světla ani okna a tvojí rychlosti se přizpůsobilo na centimetr.",
      en: "The stars to port are going out one by one, then coming back. Something vast is flying alongside you and blocking them. It has no lights and no windows, and it has matched your speed to the centimetre.",
    },
    choices: [
      {
        id: "lights",
        label: { cs: "Zablikat mu", en: "Signal with the lights" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Ladíš poziční světla na ty tři tóny, převedené do barev. Ruce se ti třesou a KIPP předstírá, že si toho nevšiml.",
              en: "You tune the running lights to the three tones, translated into colour. Your hands are shaking, and KIPP pretends not to notice.",
            },
            effects: [
              {
                t: "minigame",
                game: "calibrate",
                tier: 2,
                win: [
                  { t: "flag", key: "contact_seen" },
                  { t: "rp", secs: 150 },
                  { t: "morale", n: 5 },
                  { t: "codex", key: "contact_shape" },
                ],
                lose: [
                  { t: "flag", key: "contact_seen" },
                  { t: "rp", secs: 60 },
                  { t: "morale", n: -2 },
                  { t: "codex", key: "contact_shape" },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "tape",
        label: { cs: "Poslat mu dárek", en: "Send it a gift" },
        cost: { items: { duct_tape: 1 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Posíláš přes propast roli izolepy, protože nic lepšího lidstvo nevymyslelo. Tvar ji vtáhne do sebe a dlouho ji zkoumá.",
              en: "You send a roll of duct tape across the gap, because humanity never invented anything better. The shape draws it in and studies it for a long time.",
            },
            effects: [
              { t: "flag", key: "contact_seen" },
              { t: "flag", key: "contact_gave_tape" },
              { t: "rp", secs: 90 },
              { t: "morale", n: 4 },
              { t: "codex", key: "contact_shape" },
            ],
          },
        ],
      },
      {
        id: "still",
        label: { cs: "Ani se nehnout", en: "Hold perfectly still" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Hodinu letíte bok po boku a nikdo nic neudělá. Pak tvar zpomalí, nechá tě projít a KIPP konečně vydechne ventilátory.",
              en: "For an hour you fly side by side and nobody does anything. Then the shape slows, lets you pass, and KIPP finally exhales through the fans.",
            },
            effects: [
              { t: "flag", key: "contact_seen" },
              { t: "rp", secs: 60 },
              { t: "codex", key: "contact_shape" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "contact_glass_tape",
    type: "contact",
    weight: 30,
    once: true,
    when: { depthMin: 22, chapterMin: 8, flag: "contact_seen" },
    title: { cs: "Něco ti tu nechali", en: "They Left You Something" },
    text: {
      cs: "V dráze lodi se vznáší předmět, položený přesně tam, kde ho nejde minout. Je to role izolepy. Je z prázdnoskla, je dokonalá a nejde odmotat.",
      en: "An object floats in the ship's path, placed exactly where you cannot miss it. It is a roll of duct tape. It is made of voidglass, it is perfect, and it cannot be unrolled.",
    },
    choices: [
      {
        id: "take",
        label: { cs: "Vzít ji na palubu", en: "Bring it aboard" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Leží teď na polici v dílně. KIPP tvrdí, že v noci tiše zní, a měřák mu dává za pravdu.",
              en: "It now sits on a shelf in the workshop. KIPP claims it rings softly at night, and the meter agrees.",
            },
            effects: [
              { t: "flag", key: "contact_gift" },
              { t: "item", item: "voidglass", n: 60, scaled: true },
              { t: "morale", n: 5 },
              { t: "codex", key: "artifact_glass_tape" },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Jakmile se role dotkne paluby, všechny přístroje na vteřinu ukážou stejné číslo. Pak je klid, ale ne úplný.",
              en: "The moment the roll touches the deck, every instrument shows the same number for one second. Then all is calm, though not entirely.",
            },
            effects: [
              { t: "flag", key: "contact_gift" },
              { t: "moduleDamage", pct: 8, count: 2 },
              { t: "codex", key: "artifact_glass_tape" },
            ],
          },
        ],
      },
      {
        id: "swap",
        label: { cs: "Nechat jim tam svoji", en: "Leave one of yours" },
        cost: { items: { duct_tape: 1 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Pokládáš vedle ní obyčejnou roli. Druhý den je pryč a na jejím místě se vznáší výkres něčeho, co se dá postavit.",
              en: "You set an ordinary roll beside it. The next day it is gone, and in its place floats a blueprint for something that can be built.",
            },
            effects: [
              { t: "flag", key: "contact_gift" },
              { t: "flag", key: "contact_traded" },
              { t: "blueprint" },
              { t: "rp", secs: 120 },
              { t: "morale", n: 6 },
              { t: "codex", key: "artifact_glass_tape" },
            ],
          },
        ],
      },
      {
        id: "study",
        label: { cs: "Prozkoumat ji zvenku", en: "Study it from outside" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Rozměry sedí na setinu milimetru, včetně natrženého okraje. Někdo si tu tvoji prohlédl velmi pozorně.",
              en: "The dimensions match to a hundredth of a millimetre, torn edge included. Someone has studied yours very closely.",
            },
            effects: [
              { t: "flag", key: "contact_gift" },
              { t: "rp", secs: 200 },
              { t: "codex", key: "artifact_glass_tape" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "contact_exchange",
    type: "contact",
    weight: 30,
    once: true,
    when: { depthMin: 28, chapterMin: 9, flag: "contact_gift" },
    title: { cs: "Chtějí obchodovat", en: "They Want to Trade" },
    text: {
      cs: "Tvar je zpátky a tentokrát vysílá obraz: tvůj hrnek, zvětšený a obtažený světlem. KIPP překládá váhavě: „Buď chtějí kávu, nebo uctívají nádobí. Sázím na kávu.“",
      en: "The shape is back, and this time it transmits a picture: your mug, enlarged and outlined in light. KIPP translates hesitantly: “Either they want coffee or they worship crockery. My money is on coffee.”",
    },
    choices: [
      {
        id: "coffee",
        label: { cs: "Poslat jim kávu", en: "Send them coffee" },
        cost: { items: { coffee: 5 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Pět dávek kávy letí přes propast v krabičce od svačiny. Tvar ji přijme a potom se dlouho nic neděje.",
              en: "Five servings of coffee cross the gap in a lunchbox. The shape takes it in, and then for a long time nothing happens.",
            },
            effects: [
              { t: "flag", key: "contact_coffee" },
              { t: "morale", n: 3 },
              { t: "chain", event: "contact_exchange_reply", delay: 300 },
            ],
          },
        ],
      },
      {
        id: "mug",
        label: { cs: "Poslat jim hrnek", en: "Send them the mug" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Loučíš se s hrnkem, který vydržel čtyřicet let. Tvar ho přijme s něčím, co na senzorech vypadá jako úklona.",
              en: "You say goodbye to a mug that lasted forty years. The shape accepts it with what looks, on the sensors, like a bow.",
            },
            effects: [
              { t: "morale", n: -1 },
              { t: "chain", event: "contact_exchange_reply", delay: 300 },
            ],
          },
        ],
      },
      {
        id: "refuse",
        label: { cs: "Nedat nic", en: "Give them nothing" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Tvar chvíli čeká a pak obraz hrnku pomalu zhasne. KIPP poznamená, že první obchod mezi druhy ztroskotal na lakotě.",
              en: "The shape waits a while, and then the picture of the mug slowly fades. KIPP notes that the first trade between species has failed over stinginess.",
            },
            effects: [
              { t: "rp", secs: 60 },
              { t: "flag", key: "contact_refused" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "contact_exchange_reply",
    type: "contact",
    weight: 1,
    chainOnly: true,
    title: { cs: "Přišla odpověď", en: "The Reply" },
    text: {
      cs: "Zásilka se vrátila. Uvnitř není káva, ale něco, co ji velmi přesně napodobuje, včetně teploty, vůně a lehké hořkosti pondělního rána. Přibalili k tomu ještě jednu věc.",
      en: "The parcel has come back. Inside is not coffee but something that imitates it very precisely, including the temperature, the smell and the faint bitterness of a Monday morning. They have packed one more thing with it.",
    },
    choices: [
      {
        id: "taste",
        label: { cs: "Ochutnat", en: "Taste it" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Je to nejlepší káva tvého života, a to tě na tom děsí nejvíc. Celá loď pracuje, jako by jí bylo dvacet.",
              en: "It is the best coffee of your life, which is the frightening part. The whole ship works as if it were twenty years old.",
            },
            effects: [
              { t: "buff", effect: { stat: "allProd", mul: 1.5 }, secs: 900 },
              { t: "morale", n: 8 },
              { t: "flag", key: "contact_drank" },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Chutná přesně jako káva a za hodinu vidíš hudbu. KIPP tě hlídá a dělá si poznámky.",
              en: "It tastes exactly like coffee, and an hour later you can see music. KIPP keeps watch over you and takes notes.",
            },
            effects: [
              { t: "rp", secs: 120 },
              { t: "morale", n: 2 },
              { t: "flag", key: "contact_drank" },
            ],
          },
        ],
      },
      {
        id: "unwrap",
        label: { cs: "Rozbalit tu druhou věc", en: "Unwrap the other thing" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Je to součástka, která přesně pasuje do tvého fabrikátoru, i když ho nikdy neviděli. Nebo viděli.",
              en: "It is a component that fits your fabricator exactly, although they have never seen it. Or they have.",
            },
            effects: [
              { t: "blueprint" },
              { t: "item", item: "strange_dust", n: 40, scaled: true },
              { t: "codex", key: "artifact_contact_parcel" },
            ],
          },
        ],
      },
      {
        id: "lab",
        label: { cs: "Dát obojí do laboratoře", en: "Send both to the lab" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Laboratoř hlásí, že vzorek je „káva, jen víc“. Výzkum poskočil o rok dopředu a ochutnat se nikdo neodvážil.",
              en: "The lab reports that the sample is “coffee, only more so”. Research jumps a year ahead, and nobody dares to taste it.",
            },
            effects: [
              { t: "rp", secs: 300 },
              { t: "codex", key: "artifact_contact_parcel" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "contact_open_door",
    type: "contact",
    weight: 30,
    once: true,
    when: { depthMin: 34, chapterMin: 10, flag: "contact_gift" },
    title: { cs: "Otevřené dveře", en: "An Open Door" },
    text: {
      cs: "Tvar se před tebou rozevřel jako květ a uvnitř svítí něco, co je zjevně stykovací uzel postavený podle toho tvého. KIPP šeptá, ačkoli nemusí: „Postavili kvůli nám dveře.“",
      en: "The shape has opened before you like a flower, and inside glows what is clearly a docking port built to match yours. KIPP whispers, although it has no need to: “They built a door for us.”",
    },
    choices: [
      {
        id: "dock",
        label: { cs: "Přistát u nich", en: "Dock with them" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Srovnáváš loď s dveřmi, které ještě žádný člověk neviděl. Čtyřicet let oprav a všechno to vedlo k tomuhle přiblížení.",
              en: "You line the ship up with a door no human has ever seen. Forty years of repairs, and all of it led to this approach.",
            },
            effects: [
              {
                t: "minigame",
                game: "dock",
                tier: 3,
                win: [
                  { t: "flag", key: "contact_met" },
                  { t: "rp", secs: 300 },
                  { t: "morale", n: 10 },
                  { t: "card" },
                  { t: "codex", key: "contact_meeting" },
                ],
                lose: [
                  { t: "hull", pct: -8 },
                  { t: "flag", key: "contact_met" },
                  { t: "rp", secs: 150 },
                  { t: "codex", key: "contact_meeting" },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "talk",
        label: { cs: "Mluvit přes práh", en: "Talk across the threshold" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Obrazy a tóny ti ukážou bundu. Je o čtyři tisíce let starší než ta tvoje a na zádech má stejnou šablonu.",
              en: "In pictures and tones they show you a jacket. It is four thousand years older than yours, and the stencil on the back is the same.",
            },
            effects: [
              { t: "flag", key: "contact_met" },
              { t: "flag", key: "contact_same_jacket" },
              { t: "rp", secs: 200 },
              { t: "morale", n: 6 },
              { t: "codex", key: "contact_meeting" },
            ],
          },
        ],
      },
      {
        id: "wave",
        label: { cs: "Zamávat a couvnout", en: "Wave and back away" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Dveře zůstanou otevřené ještě hodinu. Pak se květ zavře, pomalu a bez výčitek, a KIPP dlouho nic neříká.",
              en: "The door stays open for another hour. Then the flower closes, slowly and without reproach, and KIPP says nothing for a long time.",
            },
            effects: [
              { t: "flag", key: "contact_declined" },
              { t: "rp", secs: 60 },
              { t: "morale", n: 2 },
            ],
          },
        ],
      },
    ],
  },
];

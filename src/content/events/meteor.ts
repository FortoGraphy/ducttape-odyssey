import type { EventDef } from "@/engine/types";

export const meteor: EventDef[] = [
  {
    id: "meteor_gravel_drizzle",
    type: "meteor",
    weight: 12,
    cooldown: 1200,
    title: { cs: "Kamenná přeháňka", en: "Gravel Drizzle" },
    text: {
      cs: "Na trup začíná ťukat štěrk. KIPP hlásí srážky slabé až mírné, místy šutry.",
      en: "Gravel starts tapping on the hull. KIPP forecasts light to moderate showers, with scattered rocks.",
    },
    choices: [
      {
        id: "scoop",
        label: { cs: "Nastavit sběrač", en: "Hold out the scoop" },
        risk: 1,
        outcomes: [
          {
            weight: 5,
            good: true,
            text: {
              cs: "Sběrač chrastí jako kasička. Zadarmo a až do domu.",
              en: "The scoop rattles like a piggy bank. Free delivery, right to the door.",
            },
            effects: [
              { t: "item", item: "silicates", n: 40, scaled: true },
              { t: "item", item: "scrap", n: 15, scaled: true },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Jeden kamínek to vzal zkratkou přes lak. KIPP škrábanec zapsal na váš účet.",
              en: "One pebble takes a shortcut through the paintwork. KIPP logs the scratch under your name.",
            },
            effects: [
              { t: "hull", pct: -3 },
              { t: "item", item: "silicates", n: 20, scaled: true },
            ],
          },
        ],
      },
      {
        id: "wait",
        label: { cs: "Přečkat to pod střechou", en: "Wait it out" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Přeháňka přešla. Trup zněl jako plechová střecha na chalupě a bylo to skoro útulné.",
              en: "The shower passes. The hull sounded like a tin roof in the rain, and it was almost cosy.",
            },
            effects: [
              { t: "morale", n: 2 },
              { t: "credits", secs: 20 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "meteor_ice_comet",
    type: "meteor",
    weight: 10,
    cooldown: 1800,
    title: { cs: "Kometa na dohled", en: "Comet on the Bow" },
    text: {
      cs: "Kolem se šine kometa a táhne za sebou ohon ledu dlouhý jako pondělí. KIPP podotýká, že led je v podstatě voda, která se ještě nerozhodla.",
      en: "A comet lumbers past, trailing a tail of ice as long as a Monday. KIPP notes that ice is basically water that has not made up its mind.",
    },
    choices: [
      {
        id: "tail",
        label: { cs: "Proletět ohonem", en: "Fly through the tail" },
        risk: 1,
        outcomes: [
          {
            weight: 4,
            good: true,
            text: {
              cs: "Nádrže se plní ledovou tříští a čelní okno je poprvé po letech čisté.",
              en: "The tanks fill with slush and the front window is clean for the first time in years.",
            },
            effects: [{ t: "item", item: "ice", n: 60, scaled: true }],
          },
          {
            weight: 1,
            text: {
              cs: "V ohonu se schovával kus velký jako lednice. Lednice vyhrála.",
              en: "A chunk the size of a fridge was hiding in the tail. The fridge won.",
            },
            effects: [
              { t: "hull", pct: -4 },
              { t: "item", item: "ice", n: 30, scaled: true },
            ],
          },
        ],
      },
      {
        id: "sample",
        label: { cs: "Odebrat vzorek jádra", en: "Take a core sample" },
        requires: { feature: "research" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Vzorek je starší než většina hvězd v okolí. Laboratoř z něj má druhé Vánoce.",
              en: "The sample is older than most stars nearby. The lab treats it like a second birthday.",
            },
            effects: [
              { t: "rp", secs: 45 },
              { t: "codex", key: "phenomenon_comet" },
            ],
          },
        ],
      },
      {
        id: "watch",
        label: { cs: "Jen se dívat", en: "Just watch" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Deset minut jen stojíte u okna. KIPP to do protokolu zapisuje jako údržbu posádky.",
              en: "You stand at the window for ten minutes. KIPP files it as crew maintenance.",
            },
            effects: [
              { t: "morale", n: 3 },
              { t: "codex", key: "phenomenon_comet" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "meteor_shower",
    type: "meteor",
    weight: 10,
    cooldown: 1500,
    when: { depthMin: 1 },
    title: { cs: "Meteorický roj", en: "Meteor Shower" },
    text: {
      cs: "Radar se rozsvítil jako vánoční stromek. Letí na vás roj kamení a žádný z nich nedává přednost zprava.",
      en: "The radar lights up like a holiday tree. A swarm of rocks is inbound, and not one of them intends to give way.",
    },
    choices: [
      {
        id: "shoot",
        label: { cs: "Sestřelit je", en: "Shoot them down" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Usedáte k obrannému laseru. KIPP vám drží palce, které nemá.",
              en: "You take the point-defense seat. KIPP crosses the fingers it does not have.",
            },
            effects: [
              {
                t: "minigame",
                game: "defense",
                tier: 1,
                win: [
                  { t: "item", item: "ferrite", n: 50, scaled: true },
                  { t: "credits", secs: 40 },
                ],
                lose: [{ t: "hull", pct: -8 }],
              },
            ],
          },
        ],
      },
      {
        id: "hide",
        label: { cs: "Schovat se za asteroid", en: "Hide behind the asteroid" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Roj se vyřádil na asteroidu místo na vás. Když je po všem, jen sesbíráte úlomky.",
              en: "The swarm takes it out on the asteroid instead of you. When it is over, you just sweep up the chips.",
            },
            effects: [{ t: "item", item: "silicates", n: 15, scaled: true }],
          },
        ],
      },
      {
        id: "brace",
        label: { cs: "Zatnout zuby", en: "Grit your teeth" },
        risk: 2,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "Kameny vás minuly o délku šroubováku. KIPP tvrdí, že to tak plánoval.",
              en: "The rocks miss by the length of a screwdriver. KIPP claims that was the plan.",
            },
            effects: [{ t: "credits", secs: 30 }],
          },
          {
            weight: 3,
            text: {
              cs: "Tři zásahy na pravoboku. Nic, co by nespravila izolepa a optimismus.",
              en: "Three hits to starboard. Nothing that tape and optimism cannot fix.",
            },
            effects: [{ t: "hull", pct: -10 }],
          },
          {
            weight: 1,
            text: {
              cs: "Jeden šutr si vybral zrovna tu část lodi, která něco dělala.",
              en: "One rock picks exactly the part of the ship that was doing something useful.",
            },
            effects: [{ t: "moduleDamage", pct: 15, count: 1 }],
          },
        ],
      },
    ],
  },
  {
    id: "meteor_big_one",
    type: "meteor",
    weight: 7,
    cooldown: 3000,
    when: { depthMin: 3, failure: "none" },
    title: { cs: "Ten tlustý", en: "The Big One" },
    text: {
      cs: "Kolizním kurzem se k vám valí balvan velký jako obchodní dům. KIPP spočítal šanci na srážku a odmítá vám ji říct, prý kvůli morálce.",
      en: "A boulder the size of a department store is rolling in on a collision course. KIPP has calculated the odds of impact and refuses to share them, citing morale.",
    },
    choices: [
      {
        id: "blast",
        label: { cs: "Rozstřílet ho", en: "Blast it apart" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Jeden velký problém měníte na spoustu malých. Teď je ještě potřeba trefit ty malé.",
              en: "You turn one big problem into many small ones. Now you only have to hit the small ones.",
            },
            effects: [
              {
                t: "minigame",
                game: "defense",
                tier: 2,
                win: [
                  { t: "item", item: "ferrite", n: 80, scaled: true },
                  { t: "item", item: "conductite", n: 20, scaled: true },
                ],
                lose: [
                  { t: "hull", pct: -12 },
                  { t: "moduleDamage", pct: 10, count: 1 },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "dodge",
        label: { cs: "Uhnout na plný plyn", en: "Full burn sideways" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Motory zařvaly a balvan prošuměl kolem. Stálo to trochu paliva a jeden hrnek.",
              en: "The engines roar and the boulder whispers past. It costs you some fuel and one mug.",
            },
            effects: [{ t: "fuel", n: -2 }],
          },
        ],
      },
      {
        id: "brace",
        label: { cs: "Zapřít se a doufat", en: "Brace and hope" },
        risk: 2,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Balvan vás jen líznul bokem. Zůstala po něm rýha a pocit, že vám vesmír něco odpustil.",
              en: "The boulder only grazes your flank. It leaves a groove and the feeling that the universe let you off.",
            },
            effects: [{ t: "hull", pct: -5 }],
          },
          {
            weight: 2,
            text: {
              cs: "Náraz. Všechno, co nebylo přišroubované, teď leží na opačné straně lodi.",
              en: "Impact. Everything that was not bolted down now lives on the other side of the ship.",
            },
            effects: [
              { t: "hull", pct: -14 },
              { t: "loseCargo", pct: 5 },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Náraz roztočil loď jako káču. Hvězdy za oknem dělají čáry a oběd se hlásí o slovo.",
              en: "The impact spins the ship like a top. The stars outside turn into lines and lunch asks for a second hearing.",
            },
            effects: [
              { t: "hull", pct: -8 },
              { t: "failure", kind: "tumble" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "meteor_debris_field",
    type: "meteor",
    weight: 9,
    cooldown: 2400,
    when: { hazard: "debris" },
    title: { cs: "Šrotové pole", en: "The Scrapyard Belt" },
    text: {
      cs: "Soustava je plná trosek starých družic. Každá druhá ještě vysílá předpověď počasí pro planetu, která už žádné počasí nemá.",
      en: "The system is littered with dead satellites. Every other one still broadcasts a forecast for a planet that no longer has weather.",
    },
    choices: [
      {
        id: "grab",
        label: { cs: "Posbírat, co půjde", en: "Grab what you can" },
        risk: 1,
        outcomes: [
          {
            weight: 4,
            good: true,
            text: {
              cs: "Nákladový prostor se plní cizí historií. Většina z ní je naštěstí z kvalitní slitiny.",
              en: "The hold fills with other people's history. Luckily, most of it is good alloy.",
            },
            effects: [
              { t: "item", item: "scrap", n: 70, scaled: true },
              { t: "item", item: "wire", n: 8, scaled: true },
            ],
          },
          {
            weight: 2,
            text: {
              cs: "Jedna družice měla ještě nabité kondenzátory. Teď už je nemá.",
              en: "One satellite still had charged capacitors. It does not have them any more.",
            },
            effects: [
              { t: "moduleDamage", pct: 12, count: 1 },
              { t: "item", item: "scrap", n: 30, scaled: true },
            ],
          },
        ],
      },
      {
        id: "logs",
        label: { cs: "Stáhnout jejich záznamy", en: "Download their logs" },
        requires: { feature: "research" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Čtyřicet let měření, která nikdo nečetl. KIPP je dojatý, i když to popírá.",
              en: "Forty years of measurements nobody ever read. KIPP is moved, although it denies it.",
            },
            effects: [{ t: "rp", secs: 60 }],
          },
        ],
      },
      {
        id: "thread",
        label: { cs: "Proplést se opatrně", en: "Thread through carefully" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Proplétáte se jako slon, který se v porcelánu už jednou spálil. Nic jste nerozbili a nic neodnesli.",
              en: "You tiptoe through like a bull who has been billed for a china shop before. Nothing broken, nothing taken.",
            },
            effects: [{ t: "morale", n: 1 }],
          },
        ],
      },
    ],
  },
  {
    id: "meteor_micro_puncture",
    type: "meteor",
    weight: 9,
    cooldown: 2400,
    when: { depthMin: 2 },
    title: { cs: "Dírka jako hrášek", en: "A Hole the Size of a Pea" },
    text: {
      cs: "Mikrometeorit prošel trupem a cestou vzal i váš oběd. Z chodby se ozývá tiché syčení, které manuál označuje slovem „nežádoucí“.",
      en: "A micrometeorite went through the hull and took your lunch with it. A soft hiss comes from the corridor, which the manual describes as “undesirable”.",
    },
    choices: [
      {
        id: "patch",
        label: { cs: "Zalepit to pořádně", en: "Patch it properly" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Berete záplaty a jdete po zvuku. Syčení vás vede jako velmi nepříjemný průvodce.",
              en: "You grab the patches and follow the sound. The hiss guides you like a very unpleasant tour guide.",
            },
            effects: [
              {
                t: "minigame",
                game: "tape",
                tier: 1,
                win: [
                  { t: "hull", pct: 5 },
                  { t: "credits", secs: 30 },
                ],
                lose: [{ t: "hull", pct: -5 }],
              },
            ],
          },
        ],
      },
      {
        id: "tape",
        label: { cs: "Plácnout tam izolepu", en: "Slap some tape on it" },
        cost: { items: { duct_tape: 1 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Drží to. Jako všechno na téhle lodi, tedy zázrakem a izolepou.",
              en: "It holds. Like everything else on this ship: by tape and by miracle.",
            },
            effects: [{ t: "hull", pct: 3 }],
          },
        ],
      },
      {
        id: "gum",
        label: { cs: "Ucpat to žvýkačkou", en: "Plug it with gum" },
        risk: 2,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "Žvýkačka zmrzla na kámen a těsní líp než originální díl. KIPP žádá, abyste to nikomu neříkali.",
              en: "The gum freezes rock solid and seals better than the factory part. KIPP asks you never to mention this.",
            },
            effects: [{ t: "morale", n: 2 }],
          },
          {
            weight: 2,
            text: {
              cs: "Žvýkačka vydržela čtyři minuty. Pak odletěla za obědem.",
              en: "The gum lasts four minutes. Then it follows your lunch.",
            },
            effects: [{ t: "hull", pct: -6 }],
          },
        ],
      },
    ],
  },
  {
    id: "meteor_glitter_rock",
    type: "meteor",
    weight: 8,
    cooldown: 3000,
    when: { depthMin: 5 },
    title: { cs: "Třpytivý šutr", en: "The Glittering Rock" },
    text: {
      cs: "Kolem letí meteor prošpikovaný lumitem a svítí jako výloha klenotnictví. Letí ovšem rychle a špatným směrem.",
      en: "A meteor studded with lumite drifts by, lit up like a jeweller's window. It is, however, moving fast and in the wrong direction.",
    },
    choices: [
      {
        id: "chase",
        label: { cs: "Dohnat ho", en: "Chase it down" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Doháníte ho a ukusujete, co se dá. Palivoměr se tváří dotčeně, nákladový prostor spokojeně.",
              en: "You catch up and bite off what you can. The fuel gauge looks hurt, the hold looks pleased.",
            },
            effects: [
              { t: "fuel", n: -3 },
              { t: "item", item: "lumite", n: 50, scaled: true },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Meteor vám ujel. Palivo taky.",
              en: "The meteor gets away. So does the fuel.",
            },
            effects: [{ t: "fuel", n: -3 }],
          },
        ],
      },
      {
        id: "slice",
        label: { cs: "Odříznout kus laserem", en: "Slice a piece off" },
        requires: { modulesMin: 1 },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Ladíte paprsek na pohyblivý cíl. KIPP počítá nahlas, což nepomáhá.",
              en: "You tune the beam to a moving target. KIPP counts out loud, which does not help.",
            },
            effects: [
              {
                t: "minigame",
                game: "calibrate",
                tier: 2,
                win: [
                  { t: "item", item: "lumite", n: 70, scaled: true },
                  { t: "credits", secs: 60 },
                ],
                lose: [{ t: "moduleDamage", pct: 10, count: 1, family: "laser" }],
              },
            ],
          },
        ],
      },
      {
        id: "leave",
        label: { cs: "Nechat ho být", en: "Let it go" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Zamáváte mu. Bohatství letí dál a ani se neohlédne, KIPP si aspoň zapsal jeho dráhu.",
              en: "You wave. The fortune sails on without a backward glance, but KIPP at least logs its orbit.",
            },
            effects: [{ t: "rp", secs: 20 }],
          },
        ],
      },
    ],
  },
  {
    id: "meteor_storm_front",
    type: "meteor",
    weight: 6,
    cooldown: 5400,
    when: { depthMin: 8, failure: "none" },
    title: { cs: "Bouřková fronta", en: "Storm Front" },
    text: {
      cs: "Před přídí se valí stěna prachu a kamení od obzoru k obzoru, kdyby vesmír nějaký obzor měl. KIPP navrhuje objížďku dlouhou tři dny.",
      en: "A wall of dust and rock rolls across the bow from horizon to horizon, if space had horizons. KIPP proposes a three-day detour.",
    },
    choices: [
      {
        id: "through",
        label: { cs: "Projet středem", en: "Punch through the middle" },
        risk: 2,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Vjíždíte dovnitř a loď drnčí jako plechovka hřebíků. Uprostřed bouře je najednou podezřelé ticho.",
              en: "You plunge in and the ship rattles like a tin of nails. Deep inside the storm it goes suspiciously quiet.",
            },
            effects: [
              { t: "hull", pct: -6 },
              { t: "chain", event: "meteor_storm_eye", delay: 20 },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Bouře vás po hodině vyplivla zpátky, potlučené a uražené.",
              en: "After an hour the storm spits you back out, battered and offended.",
            },
            effects: [
              { t: "hull", pct: -14 },
              { t: "moduleDamage", pct: 15, count: 2 },
            ],
          },
        ],
      },
      {
        id: "crawl",
        label: { cs: "Štíty a krok za krokem", en: "Shields up, inch by inch" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Sunete se okrajem fronty a odstřelujete všechno větší než pěst. Je toho hodně.",
              en: "You creep along the edge of the front, shooting anything bigger than a fist. There is a lot of it.",
            },
            effects: [
              {
                t: "minigame",
                game: "defense",
                tier: 3,
                win: [
                  { t: "item", item: "ferrite", n: 100, scaled: true },
                  { t: "item", item: "voidglass", n: 10, scaled: true },
                ],
                lose: [{ t: "hull", pct: -12 }],
              },
            ],
          },
        ],
      },
      {
        id: "detour",
        label: { cs: "Objet to", en: "Take the detour" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Tři dny pozorujete bouři z bezpečné dálky. Je to jako dívat se na cizí průšvih.",
              en: "For three days you watch the storm from a safe distance. It is like watching someone else's bad day.",
            },
            effects: [{ t: "fuel", n: -3 }],
          },
        ],
      },
    ],
  },
  {
    id: "meteor_storm_eye",
    type: "meteor",
    weight: 1,
    chainOnly: true,
    title: { cs: "Oko bouře", en: "Eye of the Storm" },
    text: {
      cs: "V oku bouře se pomalu otáčí jádro rozbitého měsíce, celé prorostlé prázdnosklem. Kamení kolem něj krouží jako obecenstvo.",
      en: "In the eye of the storm turns the core of a shattered moon, veined with voidglass. The rocks circle it like an audience.",
    },
    choices: [
      {
        id: "mine",
        label: { cs: "Těžit, dokud to jde", en: "Mine while it lasts" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Laser jede naplno a jádro se loupe jako cibule. Odlétáte ve chvíli, kdy se oko začíná zavírat.",
              en: "The laser runs flat out and the core peels like an onion. You leave just as the eye begins to close.",
            },
            effects: [
              { t: "item", item: "voidglass", n: 40, scaled: true },
              { t: "item", item: "lumite", n: 30, scaled: true },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Oko se zavřelo dřív, než jste čekali. Náklad máte, lak už ne.",
              en: "The eye closes sooner than expected. You keep the cargo, but not the paint.",
            },
            effects: [
              { t: "item", item: "voidglass", n: 20, scaled: true },
              { t: "hull", pct: -8 },
            ],
          },
        ],
      },
      {
        id: "souvenir",
        label: { cs: "Vzít kousek a zmizet", en: "Take a piece and go" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Berete si suvenýr a mizíte, než si to bouře rozmyslí. KIPP mezitím to místo zakreslil do map.",
              en: "You take a souvenir and slip out before the storm reconsiders. KIPP, meanwhile, puts the place on the charts.",
            },
            effects: [
              { t: "item", item: "voidglass", n: 15, scaled: true },
              { t: "codex", key: "phenomenon_storm_eye" },
            ],
          },
        ],
      },
    ],
  },
];

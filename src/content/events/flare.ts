import type { EventDef } from "@/engine/types";

export const flare: EventDef[] = [
  {
    id: "flare_minor",
    type: "flare",
    weight: 10,
    cooldown: 1800,
    title: { cs: "Sluneční kýchnutí", en: "A Solar Sneeze" },
    text: {
      cs: "Místní hvězda si odkašlala a směrem k vám letí vlna nabitých částic. Nic vážného, říká KIPP. Jen prý nemáte sahat na nic kovového, tedy na loď.",
      en: "The local star clears its throat and a wave of charged particles heads your way. Nothing serious, says KIPP. Just avoid touching anything metal, meaning the ship.",
    },
    choices: [
      {
        id: "charge",
        label: { cs: "Nastavit panely", en: "Angle the panels" },
        risk: 1,
        outcomes: [
          {
            weight: 4,
            good: true,
            text: {
              cs: "Panely pijí zadarmo a reaktor má chvíli volno. Na téhle lodi se šetří, kde se dá.",
              en: "The panels drink for free and the reactor gets a short holiday. On this ship you save wherever you can.",
            },
            effects: [
              { t: "buff", effect: { stat: "powerOut", mul: 1.3 }, secs: 300 },
              { t: "credits", secs: 40 },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Jeden panel to přehnal a spálil si pojistku. Zbytek se tváří, že ho nezná.",
              en: "One panel overdoes it and blows its fuse. The others pretend not to know it.",
            },
            effects: [
              { t: "moduleDamage", pct: 8, count: 1 },
              { t: "credits", secs: 20 },
            ],
          },
        ],
      },
      {
        id: "shelter",
        label: { cs: "Otočit se k ní zády", en: "Turn your back on it" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Loď nastavila hvězdě záď. Je to neslušné, ale účinné.",
              en: "The ship presents its stern to the star. It is rude, but effective.",
            },
            effects: [
              { t: "morale", n: 1 },
              { t: "credits", secs: 15 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "flare_major",
    type: "flare",
    weight: 7,
    cooldown: 4200,
    when: { depthMin: 4, failure: "none" },
    title: { cs: "Erupce třídy „jejda“", en: "A Class “Oops” Flare" },
    text: {
      cs: "Hvězda vyvrhla oblouk plazmatu, který by obtočil planetu. KIPP odpočítává příchod rázové vlny a mezi čísly doporučuje stínění, modlitbu a opalovací krém.",
      en: "The star hurls out an arc of plasma that could wrap around a planet. KIPP counts down to the shockwave and, between numbers, recommends shielding, prayer and sunscreen.",
    },
    choices: [
      {
        id: "coolant",
        label: { cs: "Přesměrovat chlazení", en: "Reroute the coolant" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Stojíte u ventilů a čekáte na vlnu. Tlakoměry se chvějí, jako by věděly, co přijde.",
              en: "You stand at the valves and wait for the wave. The pressure gauges tremble as if they knew what was coming.",
            },
            effects: [
              {
                t: "minigame",
                game: "valves",
                tier: 2,
                win: [
                  { t: "buff", effect: { stat: "powerOut", mul: 1.4 }, secs: 600 },
                  { t: "credits", secs: 60 },
                ],
                lose: [
                  { t: "moduleDamage", pct: 15, count: 2 },
                  { t: "hull", pct: -5 },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "shadow",
        label: { cs: "Schovat se do stínu", en: "Hide in a shadow" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Zaparkovali jste za nejbližší skálu a přečkali to. Trochu paliva je pryč, zato vám nesvítí zuby.",
              en: "You park behind the nearest rock and wait it out. Some fuel is gone, but at least your teeth do not glow.",
            },
            effects: [{ t: "fuel", n: -1 }],
          },
        ],
      },
      {
        id: "ride",
        label: { cs: "Přečkat to na místě", en: "Sit it out in the open" },
        risk: 2,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "Vlna přešla a nechala po sobě nabité kondenzátory a připálený toast. Obojí se dá použít.",
              en: "The wave passes, leaving charged capacitors and burnt toast behind. Both can be put to use.",
            },
            effects: [
              { t: "buff", effect: { stat: "powerOut", mul: 1.3 }, secs: 300 },
              { t: "hull", pct: -4 },
            ],
          },
          {
            weight: 2,
            text: {
              cs: "Půlka kontrolek zhasla a druhá půlka svítí barvou, kterou v manuálu nenajdete.",
              en: "Half the indicator lights go out and the other half glow a colour that is not in the manual.",
            },
            effects: [
              { t: "hull", pct: -8 },
              { t: "moduleDamage", pct: 12, count: 2 },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Stínění se vzdalo bez boje. Dozimetr hraje jednu dlouhou notu a KIPP vás prosí, abyste nesvítili na chodbě.",
              en: "The shielding surrenders without a fight. The dosimeter plays one long note and KIPP asks you not to glow in the corridor.",
            },
            effects: [{ t: "failure", kind: "radiation" }],
          },
        ],
      },
    ],
  },
  {
    id: "flare_blue_giant",
    type: "flare",
    weight: 9,
    cooldown: 4200,
    when: { star: ["blueGiant"] },
    title: { cs: "Modrý obr má náladu", en: "The Blue Giant Is Moody" },
    text: {
      cs: "Modrý obr svítí tak, že okna ztmavla sama od sebe a pak pro jistotu ještě jednou. Každá erupce tu nese energii na rok provozu. Nebo na jeden velmi krátký požár.",
      en: "The blue giant shines so hard that the windows darkened by themselves, then once more to be safe. Every flare here carries a year's worth of power. Or enough for one very short fire.",
    },
    choices: [
      {
        id: "harvest",
        label: { cs: "Chytat energii", en: "Catch the energy" },
        risk: 2,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Kondenzátory bzučí štěstím a všechno na lodi běží, jako by bylo nové. Vydrží to pár minut, ale stojí to za to.",
              en: "The capacitors buzz with joy and everything aboard runs as if it were new. It lasts a few minutes, and it is worth it.",
            },
            effects: [
              { t: "buff", effect: { stat: "allProd", mul: 1.5 }, secs: 300 },
              { t: "item", item: "power_cell", n: 6, scaled: true },
            ],
          },
          {
            weight: 2,
            text: {
              cs: "Kondenzátory přetekly. Dá se to poznat podle zvuku a taky podle toho, že hoří.",
              en: "The capacitors overflow. You can tell by the sound, and also by the fact that they are on fire.",
            },
            effects: [
              { t: "moduleDamage", pct: 15, count: 1, family: "reactor" },
              { t: "hull", pct: -5 },
            ],
          },
        ],
      },
      {
        id: "sieve",
        label: { cs: "Lovit ionty z větru", en: "Sieve the stellar wind" },
        risk: 1,
        outcomes: [
          {
            weight: 4,
            good: true,
            text: {
              cs: "Hvězdný vítr je hustý jako polévka. Sběrač z něj cedí vzácné plyny a tváří se jako labužník.",
              en: "The stellar wind is as thick as soup. The scoop strains rare gases from it with the air of a gourmet.",
            },
            effects: [
              { t: "item", item: "xenon", n: 30, scaled: true },
              { t: "item", item: "helium3", n: 30, scaled: true },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Polévka byla moc horká. Sběrač má puchýř a trup taky.",
              en: "The soup was too hot. The scoop has a blister, and so does the hull.",
            },
            effects: [
              { t: "hull", pct: -5 },
              { t: "item", item: "xenon", n: 15, scaled: true },
            ],
          },
        ],
      },
      {
        id: "blinds",
        label: { cs: "Stáhnout rolety", en: "Draw the blinds" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Stahujete všechno, co stáhnout jde. Na lodi je šero, klid a nikdo se neopaluje.",
              en: "You draw everything that can be drawn. The ship is dim and calm, and nobody gets a tan.",
            },
            effects: [{ t: "morale", n: 1 }],
          },
        ],
      },
    ],
  },
  {
    id: "flare_neutron_pulse",
    type: "flare",
    weight: 9,
    cooldown: 4200,
    when: { star: ["neutron"], failure: "none" },
    title: { cs: "Tep mrtvé hvězdy", en: "Pulse of a Dead Star" },
    text: {
      cs: "Neutronová hvězda se otáčí třicetkrát za vteřinu a s každou otáčkou vás přejede paprsek rádiových vln. Elektronika na palubě začíná blikat do taktu.",
      en: "The neutron star spins thirty times a second, and with every turn a beam of radio waves sweeps across you. The electronics on board begin to blink in time.",
    },
    choices: [
      {
        id: "ground",
        label: { cs: "Uzemnit obvody", en: "Ground the circuits" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Otevíráte rozvaděč. Dráty v něm tepou jako žíly a žádný nemá barvu, jakou by měl mít.",
              en: "You open the junction box. The wires pulse like veins, and not one is the colour it ought to be.",
            },
            effects: [
              {
                t: "minigame",
                game: "wire",
                tier: 2,
                win: [
                  { t: "buff", effect: { stat: "powerOut", mul: 1.25 }, secs: 600 },
                  { t: "rp", secs: 60 },
                ],
                lose: [{ t: "failure", kind: "blackout" }],
              },
            ],
          },
        ],
      },
      {
        id: "listen",
        label: { cs: "Poslouchat ten tep", en: "Listen to the pulse" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Třicet úderů za vteřinu, přesnějších než lodní hodiny. KIPP si podle nich potají seřídil ty svoje.",
              en: "Thirty beats a second, more precise than the ship's clock. KIPP quietly resets its own by them.",
            },
            effects: [
              { t: "rp", secs: 80 },
              { t: "codex", key: "phenomenon_pulsar" },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Poslouchali jste moc dlouho a jeden jistič to vzdal dřív než vy.",
              en: "You listen for too long, and one circuit breaker gives up before you do.",
            },
            effects: [{ t: "moduleDamage", pct: 10, count: 1 }],
          },
        ],
      },
      {
        id: "dark",
        label: { cs: "Vypnout, co jde", en: "Shut down what you can" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Loď na hodinu potemněla a přežila to bez úhony. Vy jste hodinu seděli potmě a bilancovali.",
              en: "The ship goes dark for an hour and comes through unharmed. You spend the hour sitting in the dark, taking stock.",
            },
            effects: [{ t: "morale", n: -1 }],
          },
        ],
      },
    ],
  },
  {
    id: "flare_hull_aurora",
    type: "flare",
    weight: 8,
    cooldown: 3600,
    when: { depthMin: 1 },
    title: { cs: "Polární záře na trupu", en: "Aurora on the Hull" },
    text: {
      cs: "Nabité částice tančí po trupu v zelených a fialových závojích. Loď, která vypadá jako sešívaná plechovka, je na pár minut to nejkrásnější v celé soustavě.",
      en: "Charged particles dance across the hull in green and violet veils. For a few minutes a ship that looks like a stitched-up tin can is the most beautiful thing in the system.",
    },
    choices: [
      {
        id: "watch",
        label: { cs: "Zhasnout a dívat se", en: "Kill the lights and watch" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Zhasínáte a díváte se. KIPP mlčí, což je od něj největší poklona, jakou umí.",
              en: "You kill the lights and watch. KIPP stays silent, which is the highest compliment it knows.",
            },
            effects: [
              { t: "morale", n: 5 },
              { t: "codex", key: "phenomenon_hull_aurora" },
            ],
          },
        ],
      },
      {
        id: "collect",
        label: { cs: "Sbírat náboj", en: "Collect the charge" },
        risk: 1,
        outcomes: [
          {
            weight: 4,
            good: true,
            text: {
              cs: "Krása se dá i uložit do baterií. Je to trochu cynické a velmi praktické.",
              en: "Beauty can also be stored in batteries. It is slightly cynical and very practical.",
            },
            effects: [
              { t: "buff", effect: { stat: "powerOut", mul: 1.2 }, secs: 300 },
              { t: "credits", secs: 50 },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Krása má svou cenu a dneska ji platí pojistková skříň.",
              en: "Beauty has its price, and today the fuse box is paying.",
            },
            effects: [{ t: "moduleDamage", pct: 8, count: 1 }],
          },
        ],
      },
    ],
  },
  {
    id: "flare_red_dwarf",
    type: "flare",
    weight: 9,
    cooldown: 3600,
    when: { star: ["redDwarf"] },
    title: { cs: "Červený trpaslík kašle", en: "The Red Dwarf Has a Cough" },
    text: {
      cs: "Červení trpaslíci jsou malí, staří a nevrlí. Tenhle právě předvedl erupci, která ho na minutu zjasnila na dvojnásobek, jako když děda vstane z křesla, aby někomu vynadal.",
      en: "Red dwarfs are small, old and bad-tempered. This one has just thrown a flare that doubled its brightness for a minute, like a grandfather rising from his armchair to tell someone off.",
    },
    choices: [
      {
        id: "bask",
        label: { cs: "Přiživit se na tom", en: "Make the most of it" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Rozpálený asteroid se těží jako máslo. Laser si pochvaluje, vy taky.",
              en: "The heated asteroid mines like butter. The laser is pleased, and so are you.",
            },
            effects: [{ t: "buff", effect: { stat: "mineRate", mul: 1.4 }, secs: 300 }],
          },
          {
            weight: 1,
            text: {
              cs: "Děda vynadal i vám. Lak na osvětlené straně se loupe.",
              en: "Grandfather tells you off as well. The paint on the sunward side is peeling.",
            },
            effects: [{ t: "hull", pct: -4 }],
          },
        ],
      },
      {
        id: "sample",
        label: { cs: "Nabrat vzorek plazmatu", en: "Sample the plasma" },
        requires: { feature: "research" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Vzorek je starý jako vesmír a pořád naštvaný. Laboratoř je nadšená.",
              en: "The sample is as old as the universe and still angry. The lab is thrilled.",
            },
            effects: [
              { t: "rp", secs: 70 },
              { t: "item", item: "hydrogen", n: 30, scaled: true },
            ],
          },
        ],
      },
      {
        id: "duck",
        label: { cs: "Zalézt za planetu", en: "Duck behind a planet" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Planeta to schytala za vás. Poděkovali jste jí, i když je neobydlená.",
              en: "The planet takes it all for you. You thank it, although it is uninhabited.",
            },
            effects: [{ t: "fuel", n: -1 }],
          },
        ],
      },
    ],
  },
  {
    id: "flare_binary_quarrel",
    type: "flare",
    weight: 9,
    cooldown: 4200,
    when: { star: ["binary"] },
    title: { cs: "Dvě slunce, jedna hádka", en: "Two Suns, One Argument" },
    text: {
      cs: "Dvojhvězda si mezi sebou přehazuje proud žhavého plynu jako horký brambor. Vy jste zrovna uprostřed.",
      en: "The binary pair tosses a stream of hot gas back and forth like a hot potato. You happen to be in the middle.",
    },
    choices: [
      {
        id: "weave",
        label: { cs: "Prokličkovat mezi nimi", en: "Weave between them" },
        risk: 2,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Berete řízení do ruky. Dva gravitační tahy, jeden proud plynu a žádné místo na chyby.",
              en: "You take the controls by hand. Two gravity wells, one stream of gas and no room for mistakes.",
            },
            effects: [
              {
                t: "minigame",
                game: "dock",
                tier: 2,
                win: [
                  { t: "item", item: "hydrogen", n: 80, scaled: true },
                  { t: "item", item: "helium3", n: 40, scaled: true },
                ],
                lose: [{ t: "hull", pct: -10 }],
              },
            ],
          },
        ],
      },
      {
        id: "skim",
        label: { cs: "Nabrat plyn z okraje", en: "Skim gas from the edge" },
        risk: 1,
        outcomes: [
          {
            weight: 4,
            good: true,
            text: {
              cs: "Když se dva perou, třetí tankuje. Nádrže jsou plnější a nikdo si ničeho nevšiml.",
              en: "When two quarrel, the third fills the tank. The tanks are fuller and nobody noticed a thing.",
            },
            effects: [
              { t: "item", item: "hydrogen", n: 50, scaled: true },
              { t: "fuel", n: 2 },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Jedno ze sluncí si všimlo. Odlétáte s opálenou zádí.",
              en: "One of the suns noticed. You leave with a sunburnt stern.",
            },
            effects: [{ t: "hull", pct: -4 }],
          },
        ],
      },
      {
        id: "away",
        label: { cs: "Nechat je, ať se hádají", en: "Leave them to it" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Do cizích hádek se nepleťte, zvlášť když jedna strana váží víc než celá soustava. Couváte se vší zdvořilostí.",
              en: "Never get into other people's arguments, especially when one side outweighs a whole system. You back away with every courtesy.",
            },
            effects: [{ t: "morale", n: 1 }],
          },
        ],
      },
    ],
  },
];

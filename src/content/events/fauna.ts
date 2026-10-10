import type { EventDef } from "@/engine/types";

export const fauna: EventDef[] = [
  {
    id: "fauna_hull_limpets",
    type: "fauna",
    weight: 10,
    cooldown: 2400,
    title: { cs: "Přísavky na trupu", en: "Limpets on the Hull" },
    text: {
      cs: "Na trupu se usadila kolonie vesmírných přísavek a spokojeně okusuje rez. KIPP je klasifikuje jako „škůdce, případně bezplatnou údržbu“.",
      en: "A colony of space limpets has settled on the hull and is happily nibbling the rust. KIPP classifies them as “pests, or possibly free maintenance”.",
    },
    choices: [
      {
        id: "scrape",
        label: { cs: "Seškrábat je", en: "Scrape them off" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Jdou dolů ztuha a s výčitkou. Jako surovina jsou ale překvapivě výživné.",
              en: "They come off stiffly and reproachfully. As raw material, though, they are surprisingly nutritious.",
            },
            effects: [
              { t: "item", item: "organics", n: 30, scaled: true },
              { t: "codex", key: "fauna_hull_limpet" },
            ],
          },
        ],
      },
      {
        id: "keep",
        label: { cs: "Nechat je pracovat", en: "Let them work" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Sežraly rez a díry po sobě zalepily něčím, co drží líp než svár. Fakturu neposlaly.",
              en: "They eat the rust and seal the holes with something that holds better than a weld. They send no invoice.",
            },
            effects: [
              { t: "hull", pct: 6 },
              { t: "codex", key: "fauna_hull_limpet" },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Se rzí jim zachutnal i kus kabeláže. Trup je čistší, jeden přístroj smutnější.",
              en: "Along with the rust they develop a taste for some cabling. The hull is cleaner, one instrument is sadder.",
            },
            effects: [
              { t: "hull", pct: 3 },
              { t: "moduleDamage", pct: 8, count: 1 },
            ],
          },
        ],
      },
      {
        id: "name",
        label: { cs: "Dát jim jména", en: "Give them names" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "U čtyřicáté přísavky vám dochází jména a začínáte je číslovat. KIPP poznamenává, že přesně takhle to začalo i u něj.",
              en: "By the fortieth limpet you run out of names and switch to numbers. KIPP remarks that this is exactly how things started for it, too.",
            },
            effects: [
              { t: "morale", n: 3 },
              { t: "codex", key: "fauna_hull_limpet" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "fauna_rock_grazers",
    type: "fauna",
    weight: 10,
    cooldown: 2400,
    title: { cs: "Kosmické krávy", en: "Space Cattle" },
    text: {
      cs: "Na vašem asteroidu se pase stádo velkých pomalých tvorů. Přežvykují kámen s výrazem bytostí, které nikam nespěchají a nikdy nespěchaly.",
      en: "A herd of large, slow creatures is grazing on your asteroid. They chew rock with the expression of beings that are not in a hurry and never have been.",
    },
    choices: [
      {
        id: "share",
        label: { cs: "Těžit vedle nich", en: "Mine alongside them" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Dělíte se o asteroid. Oni jedí zprava, vy zleva a uprostřed po nich zůstává hezky nadrcená ruda.",
              en: "You share the asteroid. They eat from the right, you from the left, and the middle is left as nicely crushed ore.",
            },
            effects: [
              { t: "item", item: "silicates", n: 40, scaled: true },
              { t: "item", item: "ferrite", n: 20, scaled: true },
              { t: "codex", key: "fauna_rock_grazer" },
            ],
          },
        ],
      },
      {
        id: "honk",
        label: { cs: "Zahnat je klaksonem", en: "Honk them away" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Loď klakson nemá, a tak KIPP zařval na všech frekvencích. Stádo důstojně odplulo a asteroid je zase jen váš.",
              en: "The ship has no horn, so KIPP bellows on every frequency. The herd drifts off with dignity and the asteroid is yours again.",
            },
            effects: [{ t: "credits", secs: 40 }],
          },
          {
            weight: 1,
            text: {
              cs: "Jeden z nich se lekl a couvl. Do vás.",
              en: "One of them is startled and backs up. Into you.",
            },
            effects: [{ t: "hull", pct: -4 }],
          },
        ],
      },
      {
        id: "milk",
        label: { cs: "Zkusit jednu podojit", en: "Try milking one" },
        risk: 1,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "Nevíte, co to je, ale je toho kýbl. Analyzátor hlásí „solanka, výborný ročník“.",
              en: "You do not know what it is, but there is a bucket of it. The analyser reports “brine, an excellent vintage”.",
            },
            effects: [
              { t: "item", item: "brine", n: 40, scaled: true },
              { t: "morale", n: 2 },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Kráva se na vás dlouze podívala. Už to nikdy nezkusíte.",
              en: "The cow gives you a long look. You will never try that again.",
            },
            effects: [{ t: "morale", n: -1 }],
          },
        ],
      },
    ],
  },
  {
    id: "fauna_light_moths",
    type: "fauna",
    weight: 9,
    cooldown: 3000,
    when: { depthMin: 2 },
    title: { cs: "Můry u lampy", en: "Moths at the Lamp" },
    text: {
      cs: "Poziční světla přilákala hejno světlomilných tvorů, každý je velký jako dlaň. Narážejí do oken s tichým ťukáním a zjevně vás mají za velmi malé slunce.",
      en: "The running lights have attracted a swarm of light-loving creatures, each the size of a hand. They bump against the windows with soft taps and clearly take you for a very small sun.",
    },
    choices: [
      {
        id: "off",
        label: { cs: "Zhasnout světla", en: "Switch the lights off" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Hejno zmateně krouží a pak odlétá hledat jiné slunce. Na oknech po něm zůstal jemný svítící pyl.",
              en: "The swarm circles in confusion, then leaves to find another sun. A fine glowing pollen remains on the windows.",
            },
            effects: [{ t: "item", item: "lumite", n: 15, scaled: true }],
          },
        ],
      },
      {
        id: "bright",
        label: { cs: "Rozsvítit naplno", en: "Turn the lights right up" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Přiletěly další tisíce a trup je obalený svítícím prachem. Sběrač má žně.",
              en: "Thousands more arrive and the hull is coated in glowing dust. The scoop has a field day.",
            },
            effects: [
              { t: "item", item: "lumite", n: 50, scaled: true },
              { t: "codex", key: "fauna_light_moth" },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Vlezly do chladičů. Chladiče to nesly těžce.",
              en: "They crawl into the radiators. The radiators take it badly.",
            },
            effects: [
              { t: "moduleDamage", pct: 10, count: 1 },
              { t: "codex", key: "fauna_light_moth" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "fauna_void_whale",
    type: "fauna",
    weight: 7,
    cooldown: 5400,
    when: { depthMin: 3 },
    title: { cs: "Velryba z prázdna", en: "The Void Whale" },
    text: {
      cs: "Pod lodí pomalu proplouvá něco velkého jako měsíc. Má ploutve z plynu, oko jako přistávací plochu a zpívá na frekvenci, ze které se chvějí hrnky v kuchyňce.",
      en: "Something the size of a moon glides slowly beneath the ship. It has fins of gas, an eye like a landing pad, and it sings at a frequency that makes the mugs in the galley tremble.",
    },
    choices: [
      {
        id: "follow",
        label: { cs: "Letět kus cesty s ní", en: "Travel with it a while" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Hodinu letíte v jejím stínu. Po dlouhé době nejste nejosamělejší věc v okolí a je to příjemné.",
              en: "You fly in its shadow for an hour. For once you are not the loneliest thing around, and it feels good.",
            },
            effects: [
              { t: "morale", n: 6 },
              { t: "codex", key: "fauna_void_whale" },
            ],
          },
        ],
      },
      {
        id: "record",
        label: { cs: "Nahrát její zpěv", en: "Record its song" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Nahrávka má čtyři hodiny a jedinou sloku. KIPP ji označil za lepší než čekací melodii, což není těžké.",
              en: "The recording runs four hours and has a single verse. KIPP rates it above the hold music, which is not difficult.",
            },
            effects: [
              { t: "rp", secs: 80 },
              { t: "codex", key: "fauna_void_whale" },
            ],
          },
        ],
      },
      {
        id: "scales",
        label: { cs: "Sebrat odpadlé šupiny", en: "Collect shed scales" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Šupiny jsou velké jako dveře a lehké jako papír. Velryba si vás nevšímá, asi jako vy prachu.",
              en: "The scales are as big as doors and as light as paper. The whale notices you about as much as you notice dust.",
            },
            effects: [
              { t: "item", item: "organics", n: 60, scaled: true },
              { t: "item", item: "voidglass", n: 10, scaled: true },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Mávla ploutví, možná na pozdrav. Ve vaší váhové kategorii to vyjde nastejno jako facka.",
              en: "It waves a fin, possibly in greeting. In your weight class that amounts to a slap.",
            },
            effects: [{ t: "hull", pct: -8 }],
          },
        ],
      },
    ],
  },
  {
    id: "fauna_wake_rays",
    type: "fauna",
    weight: 8,
    cooldown: 3600,
    when: { depthMin: 5, feature: "nav" },
    title: { cs: "Rejnoci v brázdě", en: "Rays in the Wake" },
    text: {
      cs: "Za zádí se seřadilo hejno plochých tvorů a veze se na vašem výfuku. Občas některý udělá přemet. KIPP jim začal dávat známky.",
      en: "A school of flat creatures has lined up astern, riding your exhaust. Now and then one does a somersault. KIPP has started giving them scores.",
    },
    choices: [
      {
        id: "surf",
        label: { cs: "Přidat plyn pro zábavu", en: "Add throttle for fun" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Rejnoci jásají, pokud tedy rejnoci jásají. Na oplátku vás zavedou do proudu, o kterém mapy nevědí.",
              en: "The rays cheer, if rays can cheer. In return they lead you into a current the charts do not know about.",
            },
            effects: [
              { t: "fuel", n: 3 },
              { t: "buff", effect: { stat: "jumpCharge", mul: 1.3 }, secs: 600 },
              { t: "codex", key: "fauna_wake_ray" },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Zábava spolkla víc paliva, než jste chtěli. Rejnoci dávají desítku, palivoměr nulu.",
              en: "The fun swallows more fuel than you intended. The rays award a ten, the fuel gauge a zero.",
            },
            effects: [
              { t: "fuel", n: -2 },
              { t: "codex", key: "fauna_wake_ray" },
            ],
          },
        ],
      },
      {
        id: "feed",
        label: { cs: "Nakrmit je", en: "Feed them" },
        cost: { items: { organics: 10 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Jedí z manipulátoru jako kachny z ruky. Jeden vám za to nechal na okně něco lesklého.",
              en: "They eat from the manipulator arm like ducks from a hand. One of them leaves something shiny on the window in return.",
            },
            effects: [
              { t: "morale", n: 5 },
              { t: "item", item: "lumite", n: 20, scaled: true },
              { t: "codex", key: "fauna_wake_ray" },
            ],
          },
        ],
      },
      {
        id: "ignore",
        label: { cs: "Letět si po svém", en: "Mind your own course" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Vydrží za vámi půl dne a pak odbočí. V brázdě je po nich najednou nějak prázdno.",
              en: "They stay with you for half a day and then turn off. The wake suddenly feels rather empty.",
            },
            effects: [{ t: "morale", n: 1 }],
          },
        ],
      },
    ],
  },
  {
    id: "fauna_egg_cluster",
    type: "fauna",
    weight: 6,
    cooldown: 10800,
    when: { depthMin: 6 },
    title: { cs: "Vajíčka pod žebrem", en: "Eggs Under the Fin" },
    text: {
      cs: "Při obhlídce trupu nacházíte pod chladicím žebrem shluk průsvitných vajec velkých jako pěst. Jsou teplá. KIPP poznamenává, že to žebro je asi jediné teplé a klidné místo na celé lodi.",
      en: "During a hull inspection you find a cluster of translucent eggs the size of fists beneath a cooling fin. They are warm. KIPP notes that the fin is probably the only warm, quiet spot on the whole ship.",
    },
    choices: [
      {
        id: "keep",
        label: { cs: "Nechat je tam", en: "Leave them be" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Žebro od teď obcházíte obloukem. V noci se na ně chodíte dívat s baterkou a KIPP dělá, že to nevidí.",
              en: "From now on you give the fin a wide berth. At night you visit them with a torch, and KIPP pretends not to notice.",
            },
            effects: [
              { t: "morale", n: 2 },
              { t: "chain", event: "fauna_hatchlings", delay: 600 },
            ],
          },
        ],
      },
      {
        id: "greenhouse",
        label: { cs: "Přenést je do skleníku", en: "Move them indoors" },
        requires: { deck: { id: "greenhouse", level: 1 } },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Ve skleníku je vlhko a teplo a vejce začala slabě svítit. Rajčata se tváří dotčeně.",
              en: "The greenhouse is warm and humid, and the eggs begin to glow faintly. The tomatoes look put out.",
            },
            effects: [
              { t: "morale", n: 3 },
              { t: "chain", event: "fauna_hatchlings", delay: 300 },
            ],
          },
        ],
      },
      {
        id: "remove",
        label: { cs: "Sundat je", en: "Remove them" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Žebro zase chladí naplno. KIPP pochválil výkon a pak s vámi dvě hodiny nemluvil.",
              en: "The fin cools at full power again. KIPP praises the output and then does not speak to you for two hours.",
            },
            effects: [
              { t: "item", item: "organics", n: 40, scaled: true },
              { t: "morale", n: -2 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "fauna_hatchlings",
    type: "fauna",
    weight: 1,
    chainOnly: true,
    title: { cs: "Vylíhli se", en: "They Hatched" },
    text: {
      cs: "Z vajec se vyklubalo šest tvorečků, kteří vypadají jako kříženec mloka a žárovky. Lezou po trupu a olizují svary. První, co v životě uviděli, byla vaše přilba.",
      en: "Six small creatures have hatched, each looking like a cross between a newt and a light bulb. They crawl over the hull licking the welds. The first thing they ever saw was your helmet.",
    },
    choices: [
      {
        id: "adopt",
        label: { cs: "Nechat si je", en: "Keep them" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Olizují svary do hladka a drží se lodi jako klíšťata. Trup nikdy nevypadal líp a vy máte šest nových starostí.",
              en: "They lick the welds smooth and cling to the ship like ticks. The hull has never looked better, and you have six new worries.",
            },
            effects: [
              { t: "hull", pct: 10 },
              { t: "buff", effect: { stat: "wearRate", mul: 0.8 }, secs: 900 },
              { t: "codex", key: "fauna_weld_newt" },
              { t: "flag", key: "weld_newts_aboard" },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Jeden z nich si spletl kabel se svarem. Zbytek pracuje vzorně a ten jeden teď svítí o něco víc.",
              en: "One of them mistakes a cable for a weld. The others work beautifully, and that one now glows a little brighter.",
            },
            effects: [
              { t: "hull", pct: 6 },
              { t: "moduleDamage", pct: 8, count: 1 },
              { t: "codex", key: "fauna_weld_newt" },
              { t: "flag", key: "weld_newts_aboard" },
            ],
          },
        ],
      },
      {
        id: "release",
        label: { cs: "Pustit je na asteroid", en: "Release them on a rock" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Rozlezli se po asteroidu a svítí vám na cestu, dokud nezmizíte z dohledu. KIPP tvrdí, že mu něco spadlo do senzoru.",
              en: "They spread across the asteroid and light your way until you are out of sight. KIPP claims something got into its sensor.",
            },
            effects: [
              { t: "morale", n: 4 },
              { t: "codex", key: "fauna_weld_newt" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "fauna_tube_garden",
    type: "fauna",
    weight: 7,
    cooldown: 4200,
    when: { depthMin: 7 },
    title: { cs: "Zahrada z trubic", en: "The Tube Garden" },
    text: {
      cs: "Asteroid před vámi je porostlý dvoumetrovými červy, kteří se vlní v proudu sopečných plynů. Vypadá to jako korálový útes, kdyby ho navrhoval instalatér.",
      en: "The asteroid ahead is overgrown with two-metre worms swaying in a stream of volcanic gas. It looks like a coral reef, if a plumber had designed one.",
    },
    choices: [
      {
        id: "harvest",
        label: { cs: "Sklidit pár trubic", en: "Harvest a few tubes" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Trubice jdou řezat jako rebarbora. Dorůstají dřív, než je stihnete naložit.",
              en: "The tubes cut like rhubarb. They grow back before you finish loading them.",
            },
            effects: [
              { t: "item", item: "organics", n: 50, scaled: true },
              { t: "item", item: "sulfur", n: 40, scaled: true },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Trubice při řezu vypustily obsah. Smrdí to tak, že to cítí i KIPP, a ten nemá nos.",
              en: "The tubes release their contents when cut. The smell is so bad that even KIPP notices, and KIPP has no nose.",
            },
            effects: [
              { t: "morale", n: -4 },
              { t: "item", item: "organics", n: 30, scaled: true },
            ],
          },
        ],
      },
      {
        id: "gas",
        label: { cs: "Nabrat plyn u kořenů", en: "Tap the gas vents" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Červi se před hadicí zdvořile rozestoupí. Plyn je bohatý a nikomu nechybí.",
              en: "The worms politely part before the hose. The gas is rich and nobody will miss it.",
            },
            effects: [
              { t: "item", item: "sulfur", n: 50, scaled: true },
              { t: "item", item: "carbon", n: 30, scaled: true },
            ],
          },
        ],
      },
      {
        id: "sketch",
        label: { cs: "Zakreslit je do kodexu", en: "Sketch them for the codex" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Kreslíte, jak nejlíp umíte. KIPP výkres doplňuje popiskou „přibližně“.",
              en: "You draw as best you can. KIPP captions the sketch “approximately”.",
            },
            effects: [
              { t: "codex", key: "fauna_tube_worm" },
              { t: "rp", secs: 40 },
              { t: "morale", n: 2 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "fauna_dark_stalker",
    type: "fauna",
    weight: 5,
    cooldown: 9000,
    when: { depthMin: 10, failure: "none" },
    title: { cs: "Něco letí za vámi", en: "Something Is Following" },
    text: {
      cs: "Už třetí den drží něco velkého stále stejný odstup za zádí. Nesvítí, nevysílá a na radaru vypadá jako díra ve hvězdách. KIPP tomu začal říkat „náš ctitel“.",
      en: "For three days something large has kept the same distance astern. It gives off no light and no signal, and on the radar it looks like a hole in the stars. KIPP has started calling it “our admirer”.",
    },
    choices: [
      {
        id: "dead",
        label: { cs: "Dělat mrtvého brouka", en: "Play dead" },
        risk: 2,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Vypínáte všechno kromě dýchání. Tvor loď očichá, usoudí, že je to konzerva, a odpluje.",
              en: "You switch off everything but breathing. The creature sniffs the ship, concludes it is a tin can, and drifts off.",
            },
            effects: [
              { t: "codex", key: "fauna_dark_stalker" },
              { t: "rp", secs: 40 },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Tvor odplul, ale půlka systémů se odmítla zapnout zpátky. Brouka teď dělá loď doopravdy.",
              en: "The creature leaves, but half the systems refuse to come back on. The ship is now playing dead for real.",
            },
            effects: [
              { t: "codex", key: "fauna_dark_stalker" },
              { t: "failure", kind: "blackout" },
            ],
          },
        ],
      },
      {
        id: "flash",
        label: { cs: "Posvítit mu do očí", en: "Flash every light" },
        risk: 1,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "Tolik světla nevidělo od narození. Uteklo tak rychle, že za sebou nechalo oblak něčeho cenného.",
              en: "It has not seen that much light since birth. It flees so fast that it leaves a cloud of something valuable behind.",
            },
            effects: [
              { t: "item", item: "organics", n: 80, scaled: true },
              { t: "item", item: "strange_dust", n: 15, scaled: true },
              { t: "codex", key: "fauna_dark_stalker" },
            ],
          },
          {
            weight: 2,
            text: {
              cs: "Světlo ho nevyděsilo, jen naštvalo. Odstup za zádí se zkrátil na nulu.",
              en: "The light does not frighten it, only annoys it. The distance astern drops to zero.",
            },
            effects: [
              { t: "hull", pct: -12 },
              { t: "codex", key: "fauna_dark_stalker" },
            ],
          },
        ],
      },
      {
        id: "run",
        label: { cs: "Vzít roha", en: "Outrun it" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Plný plyn a tři dny bez spánku. Díra ve hvězdách se zmenšuje a pak zmizí, aspoň z radaru.",
              en: "Full throttle and three days without sleep. The hole in the stars shrinks and then vanishes, at least from the radar.",
            },
            effects: [{ t: "fuel", n: -3 }],
          },
        ],
      },
    ],
  },
];

import type { EventDef } from "@/engine/types";

export const fault: EventDef[] = [
  {
    id: "fault_coolant_drip",
    type: "fault",
    weight: 12,
    cooldown: 1500,
    title: { cs: "Kape chladivo", en: "The Coolant Is Dripping" },
    text: {
      cs: "Z potrubí nad vaší hlavou kape chladivo přímo do hrnku. KIPP hlásí únik 0,3 litru za hodinu a dodává, že kávu to chuťově spíš vylepší.",
      en: "Coolant is dripping from the pipe above your head, straight into your mug. KIPP reports a leak of 0.3 litres an hour and adds that it will probably improve the coffee.",
    },
    choices: [
      {
        id: "wrap",
        label: { cs: "Omotat to pořádně", en: "Wrap it properly" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Lezete na štafle s rolí pásky v zubech. Kapka vám mezitím přistane přesně za límcem.",
              en: "You climb the stepladder with a roll of tape between your teeth. A drop, meanwhile, lands precisely down your collar.",
            },
            effects: [
              {
                t: "minigame",
                game: "tape",
                tier: 1,
                win: [
                  { t: "hull", pct: 3 },
                  { t: "credits", secs: 40 },
                  { t: "item", item: "coolant", n: 10, scaled: true },
                ],
                lose: [{ t: "hull", pct: -3 }],
              },
            ],
          },
        ],
      },
      {
        id: "quick",
        label: { cs: "Jedna otočka izolepy", en: "One turn of duct tape" },
        cost: { items: { duct_tape: 1 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Jedna otočka, druhá pro jistotu, třetí pro radost. Nekape.",
              en: "One turn, a second to be safe, a third for the joy of it. No more drip.",
            },
            effects: [
              { t: "hull", pct: 2 },
              { t: "credits", secs: 20 },
            ],
          },
        ],
      },
      {
        id: "mug",
        label: { cs: "Podstavit větší hrnek", en: "Use a bigger mug" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Problém se odkládá, dokud se hrnek nenaplní. Do té doby je to řešení, a chladivo se navíc dá prodat.",
              en: "The problem is postponed until the mug fills up. Until then it counts as a solution, and coolant sells.",
            },
            effects: [{ t: "item", item: "coolant", n: 15, scaled: true }],
          },
          {
            weight: 2,
            text: {
              cs: "Hrnek přetekl v noci. Podlaha klouže a jedno relé pod ní už ne.",
              en: "The mug overflows overnight. The floor is slippery and one relay under it is dead.",
            },
            effects: [{ t: "hull", pct: -4 }],
          },
        ],
      },
    ],
  },
  {
    id: "fault_wiring_gremlin",
    type: "fault",
    weight: 11,
    cooldown: 1800,
    title: { cs: "Skřítek v kabelech", en: "A Gremlin in the Wiring" },
    text: {
      cs: "Světla na chodbě blikají v nepravidelném rytmu. KIPP přísahá, že to není morseovka, i když už třikrát po sobě vyblikala slovo „POMOC“.",
      en: "The corridor lights are flickering in an irregular rhythm. KIPP swears it is not Morse code, even though they have spelled out “HELP” three times in a row.",
    },
    choices: [
      {
        id: "fix",
        label: { cs: "Najít vadný spoj", en: "Find the bad joint" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Sundáváte kryt. Za ním je čtyřicet let cizích oprav, každá jinou barvou drátu.",
              en: "You take off the cover. Behind it are forty years of other people's repairs, each in a different colour of wire.",
            },
            effects: [
              {
                t: "minigame",
                game: "wire",
                tier: 1,
                win: [
                  { t: "credits", secs: 50 },
                  { t: "buff", effect: { stat: "powerOut", mul: 1.15 }, secs: 300 },
                ],
                lose: [
                  { t: "hull", pct: -2 },
                  { t: "morale", n: -1 },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "thump",
        label: { cs: "Bouchnout do panelu", en: "Thump the panel" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Rána pěstí a světla svítí. Technická dokumentace tomu říká „rázová diagnostika“.",
              en: "One thump and the lights stay on. The technical documentation calls this “impact diagnostics”.",
            },
            effects: [{ t: "credits", secs: 30 }],
          },
          {
            weight: 1,
            text: {
              cs: "Světla svítí, zato přestal hrát reproduktor. KIPP vám to teď vyčítá hodně potichu.",
              en: "The lights stay on, but the speaker has gone dead. KIPP is now scolding you very quietly.",
            },
            effects: [{ t: "morale", n: -2 }],
          },
        ],
      },
      {
        id: "live",
        label: { cs: "Zvyknout si", en: "Get used to it" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Po týdnu přestanete blikání vnímat. Po dvou vám začne chybět, kdykoli přestane.",
              en: "After a week you stop noticing the flicker. After two you start to miss it whenever it stops.",
            },
            effects: [{ t: "morale", n: -1 }],
          },
        ],
      },
    ],
  },
  {
    id: "fault_cargo_clamp",
    type: "fault",
    weight: 10,
    cooldown: 2100,
    title: { cs: "Povolená úchytka", en: "A Loose Cargo Clamp" },
    text: {
      cs: "V nákladovém prostoru povolila úchytka a bedny se dávají na pochod. Zatím pomalu. KIPP je sleduje kamerou a komentuje to jako dostihy.",
      en: "A clamp has let go in the cargo hold and the crates are on the move. Slowly, for now. KIPP is tracking them on camera and commentating as if it were a horse race.",
    },
    choices: [
      {
        id: "weld",
        label: { cs: "Přivařit ji zpátky", en: "Weld it back on" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Proplétáte se mezi bednami se svářečkou. Bedna číslo sedm vás po celou dobu pronásleduje.",
              en: "You weave between the crates with the torch. Crate number seven follows you the entire time.",
            },
            effects: [
              {
                t: "minigame",
                game: "weld",
                tier: 1,
                win: [
                  { t: "credits", secs: 50 },
                  { t: "hull", pct: 2 },
                ],
                lose: [{ t: "loseCargo", pct: 3 }],
              },
            ],
          },
        ],
      },
      {
        id: "rope",
        label: { cs: "Svázat to lanem", en: "Tie it down with rope" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Uzel, který vás naučil děda, drží i ve stavu beztíže. Děda by měl radost.",
              en: "The knot your grandfather taught you holds even in zero gravity. He would be pleased.",
            },
            effects: [{ t: "credits", secs: 25 }],
          },
          {
            weight: 1,
            text: {
              cs: "Lano drželo, bedna ne. Její obsah je teď rovnoměrně rozprostřen po celém skladu.",
              en: "The rope held, the crate did not. Its contents are now evenly distributed across the whole hold.",
            },
            effects: [{ t: "loseCargo", pct: 4 }],
          },
        ],
      },
      {
        id: "bet",
        label: { cs: "Vsadit si na bednu tři", en: "Bet on crate three" },
        risk: 2,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Bedna tři vyhrála o délku víka. KIPP vyplácí výhru a mumlá něco o štěstí začátečníků.",
              en: "Crate three wins by the length of a lid. KIPP pays out, muttering something about beginner's luck.",
            },
            effects: [
              { t: "credits", secs: 80 },
              { t: "morale", n: 3 },
            ],
          },
          {
            weight: 2,
            text: {
              cs: "Bedna tři v cíli nezabrzdila. Stěna to vydržela, bedna a váš vklad ne.",
              en: "Crate three fails to brake at the finish. The wall survives, the crate and your stake do not.",
            },
            effects: [
              { t: "loseCargo", pct: 5 },
              { t: "hull", pct: -2 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "fault_lift_jam",
    type: "fault",
    weight: 10,
    cooldown: 2100,
    title: { cs: "Zaseknutý výtah", en: "The Lift Is Stuck" },
    text: {
      cs: "Nákladní výtah se zasekl mezi patry a vydává zvuk, jako když se velbloud snaží projít turniketem. Zásobník pod ním se plní.",
      en: "The cargo lift has jammed between decks and is making a noise like a camel going through a turnstile. The hopper beneath it is filling up.",
    },
    choices: [
      {
        id: "kick",
        label: { cs: "Kopnout do něj", en: "Kick it" },
        risk: 1,
        outcomes: [
          {
            weight: 3,
            good: true,
            text: {
              cs: "Výtah uznal vaše argumenty a rozjel se. Dokonce o něco svižněji než předtím.",
              en: "The lift accepts your arguments and starts moving. Slightly faster than before, in fact.",
            },
            effects: [{ t: "buff", effect: { stat: "liftRate", mul: 1.3 }, secs: 300 }],
          },
          {
            weight: 1,
            text: {
              cs: "Výtah stojí dál a vás bolí palec. KIPP se ptá, jestli má incident zapsat jako pracovní úraz, nebo jako vandalismus.",
              en: "The lift stays put and your toe hurts. KIPP asks whether to log the incident as a workplace injury or as vandalism.",
            },
            effects: [
              { t: "morale", n: -2 },
              { t: "credits", secs: -20 },
            ],
          },
        ],
      },
      {
        id: "reboot",
        label: { cs: "Restartovat řízení", en: "Reboot the controller" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Řídicí jednotka výtahu chce heslo. Nápověda k heslu zní „to, co vždycky“.",
              en: "The lift controller wants a password. The password hint says “the usual”.",
            },
            effects: [
              {
                t: "minigame",
                game: "hack",
                tier: 1,
                win: [{ t: "buff", effect: { stat: "liftRate", mul: 1.4 }, secs: 600 }],
                lose: [{ t: "credits", secs: -30 }],
              },
            ],
          },
        ],
      },
      {
        id: "wait",
        label: { cs: "Počkat, až se umoudří", en: "Wait for it to see sense" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Po dvaceti minutách se rozjel sám, uraženě a bez vysvětlení.",
              en: "Twenty minutes later it starts by itself, sulkily and without explanation.",
            },
            effects: [{ t: "credits", secs: -20 }],
          },
        ],
      },
    ],
  },
  {
    id: "fault_warning_light",
    type: "fault",
    weight: 9,
    cooldown: 5400,
    title: { cs: "Svítí kontrolka", en: "A Warning Light Is On" },
    text: {
      cs: "Na panelu se rozsvítila oranžová kontrolka, kterou jste v životě neviděli. Manuál k ní říká jen: „Viz příloha C.“ Příloha C chybí.",
      en: "An orange light has come on that you have never seen before. The manual says only: “See Appendix C.” Appendix C is missing.",
    },
    choices: [
      {
        id: "check",
        label: { cs: "Zjistit, co hlásí", en: "Find out what it means" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Připojujete měřák a hledáte, který obvod si stěžuje. Ručička se chvěje někde mezi „dobré“ a „uvidíme“.",
              en: "You hook up the meter and look for the circuit that is complaining. The needle hovers somewhere between “fine” and “we shall see”.",
            },
            effects: [
              {
                t: "minigame",
                game: "calibrate",
                tier: 1,
                win: [
                  { t: "credits", secs: 50 },
                  { t: "hull", pct: 2 },
                ],
                lose: [{ t: "chain", event: "fault_warning_light_two", delay: 300 }],
              },
            ],
          },
        ],
      },
      {
        id: "ask",
        label: { cs: "Zeptat se KIPPa", en: "Ask KIPP" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "KIPP tvrdí, že je to kontrolka kontrolky kontrolek a že stačí dotáhnout jednu svorku. Kupodivu má pravdu.",
              en: "KIPP claims it is the warning light for the warning light warning light, and that one terminal needs tightening. Oddly enough, KIPP is right.",
            },
            effects: [{ t: "credits", secs: 20 }],
          },
        ],
      },
      {
        id: "tape",
        label: { cs: "Přelepit ji izolepou", en: "Tape over it" },
        risk: 2,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Kontrolka nesvítí. Tedy svítí, ale není to vidět, což je v praxi totéž.",
              en: "The light is off. Well, it is on, but you cannot see it, which in practice is the same thing.",
            },
            effects: [
              { t: "morale", n: 2 },
              { t: "chain", event: "fault_warning_light_two", delay: 600 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "fault_warning_light_two",
    type: "fault",
    weight: 1,
    chainOnly: true,
    title: { cs: "Svítí dvě kontrolky", en: "Two Warning Lights Are On" },
    text: {
      cs: "Vedle té první se rozsvítila druhá kontrolka, tentokrát červená. Z panelu se navíc ozývá tiché bzučení, které tam včera nebylo.",
      en: "A second light has come on beside the first, and this one is red. The panel has also begun to buzz softly, which it was not doing yesterday.",
    },
    choices: [
      {
        id: "open",
        label: { cs: "Rozebrat panel", en: "Open up the panel" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Za panelem to vypadá jako talíř špaget, do kterého uhodil blesk. Někde v tom je ten správný drát.",
              en: "Behind the panel it looks like a plate of spaghetti struck by lightning. The right wire is in there somewhere.",
            },
            effects: [
              {
                t: "minigame",
                game: "wire",
                tier: 2,
                win: [
                  { t: "credits", secs: 80 },
                  { t: "hull", pct: 3 },
                ],
                lose: [
                  { t: "moduleDamage", pct: 5, count: 1 },
                  { t: "chain", event: "fault_warning_light_three", delay: 300 },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "parts",
        label: { cs: "Vyměnit, co bzučí", en: "Replace whatever buzzes" },
        cost: { items: { spare_parts: 1 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Bzučelo relé velké jako krabička sirek. Nové nebzučí a obě kontrolky zhasly, skoro zklamaně.",
              en: "The buzzing came from a relay the size of a matchbox. The new one is silent, and both lights go out, almost disappointed.",
            },
            effects: [
              { t: "credits", secs: 40 },
              { t: "hull", pct: 3 },
            ],
          },
        ],
      },
      {
        id: "tape",
        label: { cs: "Přelepit i tu druhou", en: "Tape over that one too" },
        risk: 2,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Teď nesvítí nic a panel vypadá jako po úrazu. Bzučení přešlo v hluboké, zamyšlené hučení.",
              en: "Now nothing is lit and the panel looks like an accident victim. The buzz has become a deep, thoughtful hum.",
            },
            effects: [{ t: "chain", event: "fault_warning_light_three", delay: 300 }],
          },
        ],
      },
    ],
  },
  {
    id: "fault_warning_light_three",
    type: "fault",
    weight: 1,
    chainOnly: true,
    title: { cs: "Svítí všechno", en: "Everything Is Lit" },
    text: {
      cs: "Rozsvítily se všechny kontrolky naráz, včetně těch, které nejsou zapojené. Hučení ustalo. KIPP říká, že ticho je v tomhle případě ta horší zpráva.",
      en: "Every warning light has come on at once, including the ones that are not wired to anything. The hum has stopped. KIPP says that in this case silence is the worse news.",
    },
    choices: [
      {
        id: "valves",
        label: { cs: "Upustit tlak ručně", en: "Bleed the pressure by hand" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Běžíte k reaktoru. Ventily jsou horké, ručičky v červeném a manuál pořád odkazuje na přílohu C.",
              en: "You run to the reactor. The valves are hot, the needles are in the red, and the manual still refers you to Appendix C.",
            },
            effects: [
              {
                t: "minigame",
                game: "valves",
                tier: 2,
                win: [
                  { t: "credits", secs: 60 },
                  { t: "morale", n: 3 },
                ],
                lose: [{ t: "failure", kind: "blackout" }],
              },
            ],
          },
        ],
      },
      {
        id: "shutdown",
        label: { cs: "Řízeně všechno vypnout", en: "Controlled shutdown" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Loď na deset minut zhasla a pak naskočila, jako by se nic nestalo. Stálo to trochu výroby a jeden rok života.",
              en: "The ship goes dark for ten minutes and then starts up as if nothing had happened. It costs some output and a year of your life.",
            },
            effects: [
              { t: "credits", secs: -60 },
              { t: "moduleDamage", pct: 8, count: 1 },
            ],
          },
        ],
      },
      {
        id: "tape",
        label: { cs: "Dojít pro další izolepu", en: "Fetch more tape" },
        risk: 2,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Proti všem zákonům elektrotechniky to pomohlo. KIPP žádá o den volna na rozmyšlenou.",
              en: "Against every law of electrical engineering, it works. KIPP requests a day off to think things over.",
            },
            effects: [
              { t: "credits", secs: 30 },
              { t: "morale", n: 3 },
            ],
          },
          {
            weight: 3,
            text: {
              cs: "Na tohle izolepa nestačí. Světla zhasla, tentokrát všechna a doopravdy.",
              en: "This is beyond tape. The lights go out, all of them this time, and for real.",
            },
            effects: [{ t: "failure", kind: "blackout" }],
          },
        ],
      },
    ],
  },
  {
    id: "fault_gyro_wobble",
    type: "fault",
    weight: 8,
    cooldown: 3600,
    when: { depthMin: 2, failure: "none" },
    title: { cs: "Gyroskop se motá", en: "The Gyro Has the Wobbles" },
    text: {
      cs: "Loď se začala nenápadně naklánět doleva. Pak doprava. Gyroskop hlásí, že je všechno v pořádku, a to tónem člověka, který právě vylezl z kolotoče.",
      en: "The ship has begun to lean gently to the left. Then to the right. The gyro reports that everything is fine, in the tone of someone who has just stepped off a carousel.",
    },
    choices: [
      {
        id: "calibrate",
        label: { cs: "Srovnat gyroskop", en: "Recalibrate the gyro" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Otáčíte seřizovacím kolečkem po zlomcích stupně. Horizont se houpe a vy s ním.",
              en: "You turn the adjustment wheel by fractions of a degree. The horizon sways, and you sway with it.",
            },
            effects: [
              {
                t: "minigame",
                game: "calibrate",
                tier: 1,
                win: [
                  { t: "credits", secs: 50 },
                  { t: "hull", pct: 2 },
                ],
                lose: [
                  { t: "hull", pct: -4 },
                  { t: "moduleDamage", pct: 8, count: 1 },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "bearing",
        label: { cs: "Vyměnit ložisko", en: "Swap the bearing" },
        cost: { items: { spare_parts: 1 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Staré ložisko se rozpadlo v ruce na prach a vzpomínky. S novým stojí loď rovně jako pravítko.",
              en: "The old bearing crumbles in your hand into dust and memories. With the new one the ship stands as straight as a ruler.",
            },
            effects: [
              { t: "hull", pct: 2 },
              { t: "credits", secs: 30 },
            ],
          },
        ],
      },
      {
        id: "lean",
        label: { cs: "Naklánět se s lodí", en: "Lean with the ship" },
        risk: 2,
        outcomes: [
          {
            weight: 3,
            text: {
              cs: "Po hodině si zvyknete chodit šikmo. Gyroskop se pak srovnal sám a dělá, že o ničem neví.",
              en: "After an hour you get used to walking at an angle. Then the gyro rights itself and pretends to know nothing.",
            },
            effects: [{ t: "morale", n: -1 }],
          },
          {
            weight: 2,
            text: {
              cs: "Naklánění přešlo v otáčení a otáčení v přemety. Hvězdy jsou teď úplně všude.",
              en: "The leaning becomes turning and the turning becomes somersaults. The stars are now absolutely everywhere.",
            },
            effects: [{ t: "failure", kind: "tumble" }],
          },
        ],
      },
    ],
  },
  {
    id: "fault_reactor_hiccup",
    type: "fault",
    weight: 8,
    cooldown: 3600,
    when: { depthMin: 3, deck: { id: "reactor", level: 1 }, failure: "none" },
    title: { cs: "Reaktor má škytavku", en: "The Reactor Has Hiccups" },
    text: {
      cs: "Reaktor každých pár vteřin škytne a s ním poskočí všechny ručičky na palubě. KIPP navrhuje napít se vody, leknout ho, nebo konečně vyčistit ventily.",
      en: "Every few seconds the reactor hiccups, and every needle on board jumps with it. KIPP suggests a glass of water, a sudden fright, or finally cleaning the valves.",
    },
    choices: [
      {
        id: "valves",
        label: { cs: "Vyčistit ventily", en: "Clean the valves" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Ventily jsou zanesené něčím, co kdysi bývalo chladivo a teď je to spíš názor. Jdete na to.",
              en: "The valves are clogged with something that used to be coolant and is now more of an opinion. You get to work.",
            },
            effects: [
              {
                t: "minigame",
                game: "valves",
                tier: 1,
                win: [
                  { t: "buff", effect: { stat: "powerOut", mul: 1.25 }, secs: 600 },
                  { t: "credits", secs: 40 },
                ],
                lose: [{ t: "moduleDamage", pct: 12, count: 1, family: "reactor" }],
              },
            ],
          },
        ],
      },
      {
        id: "throttle",
        label: { cs: "Stáhnout výkon", en: "Throttle it down" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Na polovičním výkonu škytavka přešla. Půl hodiny se na lodi žije skromněji.",
              en: "At half power the hiccups pass. For half an hour, life aboard is more modest.",
            },
            effects: [{ t: "credits", secs: -40 }],
          },
        ],
      },
      {
        id: "scare",
        label: { cs: "Leknout ho", en: "Give it a fright" },
        risk: 2,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "Zařvali jste do šachty a reaktor leknutím naskočil na plný výkon. Fyzika to nepopisuje, ale funguje to.",
              en: "You yell down the shaft and the startled reactor jumps to full power. Physics does not cover this, but it works.",
            },
            effects: [{ t: "buff", effect: { stat: "powerOut", mul: 1.3 }, secs: 300 }],
          },
          {
            weight: 2,
            text: {
              cs: "Lekl se až moc. Zhaslo všechno včetně nouzového osvětlení, které je přesně pro tyhle případy.",
              en: "It is far too startled. Everything goes out, including the emergency lighting, which exists for exactly this.",
            },
            effects: [{ t: "failure", kind: "blackout" }],
          },
        ],
      },
    ],
  },
  {
    id: "fault_fuel_line",
    type: "fault",
    weight: 7,
    cooldown: 4200,
    when: { feature: "nav", failure: "none" },
    title: { cs: "Palivo teče jinudy", en: "Fuel Is Going Elsewhere" },
    text: {
      cs: "Palivoměr klesá, i když motory stojí. Za lodí se táhne tenká třpytivá stužka a je to ta nejdražší stužka, jakou jste kdy viděli.",
      en: "The fuel gauge is dropping although the engines are off. A thin glittering ribbon trails behind the ship, and it is the most expensive ribbon you have ever seen.",
    },
    choices: [
      {
        id: "weld",
        label: { cs: "Zavařit trhlinu", en: "Weld the crack" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Svařovat palivové potrubí je bezpečné, pokud se to dělá správně. Tu podmínku si v duchu několikrát zopakujete.",
              en: "Welding a fuel line is safe as long as it is done correctly. You repeat that condition to yourself several times.",
            },
            effects: [
              {
                t: "minigame",
                game: "weld",
                tier: 1,
                win: [
                  { t: "fuel", n: 1 },
                  { t: "credits", secs: 40 },
                ],
                lose: [{ t: "fuel", n: -4 }],
              },
            ],
          },
        ],
      },
      {
        id: "pipe",
        label: { cs: "Vyměnit kus potrubí", en: "Replace the pipe section" },
        cost: { items: { spare_parts: 1 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Nové potrubí drží a staré poslouží jako věšák. Na téhle lodi se nevyhazuje nic.",
              en: "The new pipe holds and the old one will do as a coat rack. Nothing gets thrown away on this ship.",
            },
            effects: [{ t: "credits", secs: 30 }],
          },
        ],
      },
      {
        id: "ignore",
        label: { cs: "Počkat, až to přestane", en: "Wait for it to stop" },
        risk: 2,
        outcomes: [
          {
            weight: 3,
            text: {
              cs: "Přestalo to. Ve chvíli, kdy v té části nádrže nezbylo nic, co by mohlo téct.",
              en: "It stops. At the moment when that part of the tank has nothing left to leak.",
            },
            effects: [{ t: "fuel", n: -6 }],
          },
          {
            weight: 1,
            text: {
              cs: "Přestalo to, protože palivo došlo. Všechno.",
              en: "It stops because the fuel has run out. All of it.",
            },
            effects: [
              { t: "fuel", n: -30 },
              { t: "failure", kind: "noFuel" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "fault_engine_knock",
    type: "fault",
    weight: 7,
    cooldown: 4200,
    when: { depthMin: 3, feature: "nav", failure: "none" },
    title: { cs: "V motoru to klepe", en: "A Knock in the Engine" },
    text: {
      cs: "Z motorové sekce se ozývá pravidelné klepání. KIPP ho analyzoval a oznamuje, že jde buď o vadné časování, nebo o někoho, kdo chce ven.",
      en: "A regular knocking is coming from the engine section. KIPP has analysed it and announces that it is either faulty timing or somebody who wants to get out.",
    },
    choices: [
      {
        id: "tune",
        label: { cs: "Seřídit časování", en: "Retune the timing" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Posloucháte motor jako doktor hrudník. Šestnáct taktů, a jeden z nich přichází pozdě.",
              en: "You listen to the engine like a doctor to a chest. Sixteen beats, and one of them arrives late.",
            },
            effects: [
              {
                t: "minigame",
                game: "rhythm",
                tier: 1,
                win: [
                  { t: "buff", effect: { stat: "jumpCharge", mul: 1.3 }, secs: 900 },
                  { t: "credits", secs: 40 },
                ],
                lose: [{ t: "moduleDamage", pct: 12, count: 1, family: "engine" }],
              },
            ],
          },
        ],
      },
      {
        id: "knock",
        label: { cs: "Zaklepat zpátky", en: "Knock back" },
        risk: 1,
        outcomes: [
          {
            weight: 2,
            text: {
              cs: "Zaklepali jste dvakrát. Motor zaklepal třikrát a pak ztichl, což KIPP odmítá jakkoli vykládat.",
              en: "You knock twice. The engine knocks three times and falls silent, which KIPP refuses to interpret in any way.",
            },
            effects: [{ t: "rp", secs: 20 }],
          },
          {
            weight: 1,
            good: true,
            text: {
              cs: "Klepání ustalo a z krytu vypadl klíč, který tam někdo před čtyřiceti lety zapomněl.",
              en: "The knocking stops and a spanner drops out of the housing, forgotten there by someone forty years ago.",
            },
            effects: [
              { t: "item", item: "spare_parts", n: 1 },
              { t: "credits", secs: 40 },
            ],
          },
        ],
      },
      {
        id: "radio",
        label: { cs: "Zesílit rádio", en: "Turn the radio up" },
        risk: 2,
        outcomes: [
          {
            weight: 3,
            text: {
              cs: "Přes hudbu to není slyšet. Problém, který není slyšet, je podle KIPPa „odložený“.",
              en: "You cannot hear it over the music. A problem you cannot hear is, according to KIPP, “deferred”.",
            },
            effects: [{ t: "moduleDamage", pct: 8, count: 1, family: "engine" }],
          },
          {
            weight: 2,
            text: {
              cs: "Klepání skončilo ranou. Motor teď drží pohromadě jen ze zvyku a rozhodně nikam nepoletí.",
              en: "The knocking ends with a bang. The engine is now held together by habit alone and is certainly going nowhere.",
            },
            effects: [{ t: "failure", kind: "engine" }],
          },
        ],
      },
    ],
  },
  {
    id: "fault_airlock_seal",
    type: "fault",
    weight: 7,
    cooldown: 4200,
    when: { depthMin: 4, failure: "none" },
    title: { cs: "Těsnění to vzdává", en: "The Seal Is Giving Up" },
    text: {
      cs: "Těsnění přechodové komory syčí a kontrolka tlaku pomalu měkne ze zelené do žluté. Guma je původní, tedy starší než vy.",
      en: "The airlock seal is hissing and the pressure light is slowly softening from green to yellow. The rubber is original, which makes it older than you.",
    },
    choices: [
      {
        id: "reseal",
        label: { cs: "Přetěsnit to", en: "Reseal it" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Syčí to ze čtyř míst najednou a každé chce svůj kus pásky. Ruce máte jen dvě.",
              en: "It hisses from four places at once and each wants its own strip of tape. You only have two hands.",
            },
            effects: [
              {
                t: "minigame",
                game: "tape",
                tier: 2,
                win: [
                  { t: "hull", pct: 6 },
                  { t: "credits", secs: 50 },
                ],
                lose: [{ t: "hull", pct: -8 }],
              },
            ],
          },
        ],
      },
      {
        id: "gel",
        label: { cs: "Použít nanogel", en: "Use nano-gel" },
        cost: { items: { nano_gel: 1 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Nanogel zatekl do každé škvíry. Komora teď těsní tak, že se dveře otevírají s mlasknutím.",
              en: "The nano-gel seeps into every gap. The airlock now seals so well that the door opens with a smack.",
            },
            effects: [{ t: "hull", pct: 15 }],
          },
        ],
      },
      {
        id: "door",
        label: { cs: "Zavřít dveře na chodbu", en: "Shut the corridor door" },
        risk: 2,
        outcomes: [
          {
            weight: 3,
            text: {
              cs: "Problém je teď za dveřmi. Dveře jsou naštěstí o něco novější než těsnění.",
              en: "The problem is now behind a door. Luckily the door is a little newer than the seal.",
            },
            effects: [{ t: "hull", pct: -5 }],
          },
          {
            weight: 1,
            text: {
              cs: "Dveře na chodbu měly stejné těsnění. Vzduch odchází i s částí nákladu a ani se nerozloučil.",
              en: "The corridor door had the same seal. The air is leaving, along with some of the cargo, without saying goodbye.",
            },
            effects: [{ t: "failure", kind: "breach" }],
          },
        ],
      },
    ],
  },
  {
    id: "fault_stale_air",
    type: "fault",
    weight: 7,
    cooldown: 4200,
    when: { feature: "crew" },
    title: { cs: "Něco tu smrdí", en: "Something Smells" },
    text: {
      cs: "Vzduch na palubě začal být cítit po mokrém psovi a spálené topince. Posádka podezírá kuchyni, kuchyně filtry a filtry mlčí.",
      en: "The air on board has begun to smell of wet dog and burnt toast. The crew suspects the galley, the galley suspects the filters, and the filters are saying nothing.",
    },
    choices: [
      {
        id: "flush",
        label: { cs: "Propláchnout okruh", en: "Flush the loop" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Stojíte u ventilů vzduchového okruhu se šátkem přes nos. Čím dřív to bude, tím líp pro všechny.",
              en: "You stand at the air loop valves with a scarf over your nose. The sooner this is done, the better for everyone.",
            },
            effects: [
              {
                t: "minigame",
                game: "valves",
                tier: 1,
                win: [
                  { t: "morale", n: 6 },
                  { t: "item", item: "water", n: 15, scaled: true },
                ],
                lose: [{ t: "morale", n: -4 }],
              },
            ],
          },
        ],
      },
      {
        id: "filters",
        label: { cs: "Vyměnit filtry", en: "Swap the filters" },
        cost: { items: { polymer: 5 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Staré filtry vyndáváte kleštěmi a s omluvou. Vzduch je zase vzduch a posádka vám tleská.",
              en: "You remove the old filters with tongs and an apology. Air is air again, and the crew applauds.",
            },
            effects: [
              { t: "morale", n: 5 },
              { t: "buff", effect: { stat: "moraleGain", mul: 1.3 }, secs: 900 },
            ],
          },
        ],
      },
      {
        id: "candle",
        label: { cs: "Zapálit vonnou svíčku", en: "Light a scented candle" },
        risk: 1,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "Teď je to cítit po mokrém psovi, topince a levanduli. Posádka aspoň uznává snahu.",
              en: "Now it smells of wet dog, burnt toast and lavender. The crew at least appreciates the effort.",
            },
            effects: [{ t: "morale", n: 1 }],
          },
          {
            weight: 1,
            text: {
              cs: "Hlásič požáru svíčku neocenil a zkropil celou ubikaci. Voní to teď mokrou posádkou.",
              en: "The fire alarm does not appreciate the candle and drenches the entire quarters. It now smells of wet crew.",
            },
            effects: [{ t: "morale", n: -4 }],
          },
        ],
      },
    ],
  },
  {
    id: "fault_shield_crack",
    type: "fault",
    weight: 6,
    cooldown: 5400,
    when: { depthMin: 8, failure: "none" },
    title: { cs: "Prasklina ve stínění", en: "A Crack in the Shielding" },
    text: {
      cs: "Ve stínění reaktoru je vlasová prasklina. Dozimetr cvaká jako nervózní písařka a KIPP doporučuje do té místnosti nechodit, případně chodit rychle.",
      en: "There is a hairline crack in the reactor shielding. The dosimeter clicks like a nervous typist, and KIPP recommends not entering that room, or at least entering it quickly.",
    },
    choices: [
      {
        id: "weld",
        label: { cs: "Zavařit to v obleku", en: "Weld it in a suit" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Oblek je těžký, průzor se mlží a prasklina je tenčí než svářecí drát. Dýcháte pomalu a počítáte vteřiny.",
              en: "The suit is heavy, the visor fogs up and the crack is thinner than the welding wire. You breathe slowly and count the seconds.",
            },
            effects: [
              {
                t: "minigame",
                game: "weld",
                tier: 2,
                win: [
                  { t: "hull", pct: 4 },
                  { t: "credits", secs: 80 },
                  { t: "rp", secs: 30 },
                ],
                lose: [{ t: "failure", kind: "radiation" }],
              },
            ],
          },
        ],
      },
      {
        id: "plate",
        label: { cs: "Přišroubovat plát", en: "Bolt a plate over it" },
        cost: { items: { plating: 2 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Plát přes prasklinu, osm šroubů, hotovo. Dozimetr se uklidnil a písařka šla domů.",
              en: "A plate over the crack, eight bolts, done. The dosimeter calms down and the typist goes home.",
            },
            effects: [
              { t: "hull", pct: 4 },
              { t: "credits", secs: 40 },
            ],
          },
        ],
      },
      {
        id: "crates",
        label: { cs: "Zastavět to bednami", en: "Stack crates against it" },
        risk: 2,
        outcomes: [
          {
            weight: 3,
            text: {
              cs: "Bedny se šrotem stíní překvapivě dobře. Pár jich teď lehce svítí a prodat už nepůjdou.",
              en: "Crates of scrap make surprisingly good shielding. A few of them now glow faintly and can no longer be sold.",
            },
            effects: [{ t: "loseCargo", pct: 3 }],
          },
          {
            weight: 1,
            text: {
              cs: "Bedny nestačily. Dozimetr přestal cvakat a začal hrát souvisle.",
              en: "The crates are not enough. The dosimeter stops clicking and begins to play one continuous note.",
            },
            effects: [{ t: "failure", kind: "radiation" }],
          },
        ],
      },
    ],
  },
];

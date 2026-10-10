import type { EventDef } from "@/engine/types";

export const distress: EventDef[] = [
  {
    id: "distress_dead_beacon",
    type: "distress",
    weight: 9,
    cooldown: 3000,
    title: { cs: "Volání bez volajícího", en: "A Call With No Caller" },
    text: {
      cs: "Přijímač zachytil tísňové volání. Podle časové značky ho někdo odeslal před třiceti lety a baterie majáku od té doby poctivě opakuje poslední slovo: „…prosím.“",
      en: "You pick up a distress call. According to its timestamp it was sent thirty years ago, and the beacon's battery has faithfully repeated the last word ever since: “…please.”",
    },
    choices: [
      {
        id: "answer",
        label: { cs: "Přesto odpovědět", en: "Answer anyway" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Odpovídáš, že jsi tady. Nikdo to neslyší, ale někdo to říct měl.",
              en: "You reply that you are here. Nobody hears it, but somebody ought to have said it.",
            },
            effects: [{ t: "morale", n: 3 }],
          },
        ],
      },
      {
        id: "salvage",
        label: { cs: "Sebrat maják", en: "Salvage the beacon" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Maják je v dobrém stavu a bude se hodit. Ticho, které po něm zůstalo, je o něco větší než předtím.",
              en: "The beacon is in good condition and will come in handy. The silence it leaves behind is slightly larger than before.",
            },
            effects: [
              { t: "item", item: "beacon", n: 1 },
              { t: "morale", n: -1 },
            ],
          },
        ],
      },
      {
        id: "log",
        label: { cs: "Nahlásit souřadnice", en: "Report the coordinates" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Tichá účtárna eviduje i ztracené. Za hodinu přijde potvrzení o přijetí, číslo jednací a zdvořilé poděkování.",
              en: "The Quiet Ledger keeps records of the lost as well. An hour later you receive an acknowledgement, a case number and polite thanks.",
            },
            effects: [
              { t: "rep", faction: "ledger", n: 1 },
              { t: "rp", secs: 20 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "distress_stranded_hauler",
    type: "distress",
    weight: 9,
    cooldown: 5400,
    when: { depthMin: 1, feature: "nav" },
    title: { cs: "Došla jim šťáva", en: "Out of Juice" },
    text: {
      cs: "Nákladní loď lampářů visí u cesty s prázdnou nádrží. Pilotka se omlouvá, že ruší, a ptá se, jestli by se u tebe nenašlo trochu paliva. Platit prý nemá čím, jen dobrým slovem.",
      en: "A Lamplighter hauler sits by the lane with an empty tank. The pilot apologises for the bother and asks whether you could spare some fuel. She cannot pay, she says, except in kind words.",
    },
    choices: [
      {
        id: "give",
        label: { cs: "Dát jí palivo", en: "Give her fuel" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Přečerpáváš jí pár kanystrů. Dobré slovo opravdu dostaneš a je překvapivě dlouhé.",
              en: "You pump a few cans across. You do get the kind words, and there are surprisingly many of them.",
            },
            effects: [
              { t: "fuel", n: -4 },
              { t: "rep", faction: "lamplighters", n: 5 },
              { t: "morale", n: 3 },
              { t: "chain", event: "distress_hauler_thanks", delay: 1200 },
            ],
          },
        ],
      },
      {
        id: "sell",
        label: { cs: "Prodat jí ho s přirážkou", en: "Sell it at a markup" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Zaplatila rodinným prstenem, který má cenu, a pohledem, který má větší. V cechu se to rozkřikne.",
              en: "She pays with a family ring that has a price, and a look that costs more. Word will get around the guild.",
            },
            effects: [
              { t: "fuel", n: -4 },
              { t: "credits", secs: 120 },
              { t: "rep", faction: "lamplighters", n: -4 },
            ],
          },
        ],
      },
      {
        id: "pass",
        label: { cs: "Omluvit se a letět", en: "Apologise and fly on" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Říkáš, že je paliva málo i u tebe. Je to pravda, a stejně to tak nezní.",
              en: "You say you are running low yourself. It is true, and it still does not sound that way.",
            },
            effects: [
              { t: "morale", n: -2 },
              { t: "rep", faction: "lamplighters", n: -1 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "distress_hauler_thanks",
    type: "distress",
    weight: 1,
    chainOnly: true,
    title: { cs: "Dobré slovo se vrací", en: "A Kind Word Returns" },
    text: {
      cs: "Dohání tě loď s lucernou na přídi. Pilotka, která od tebe dostala palivo, o tobě vyprávěla v cechu a cech usoudil, že dobré slovo je málo.",
      en: "A ship with a lantern on its bow catches up with you. The pilot you gave fuel to has been talking about you at the guild, and the guild has decided that kind words are not enough.",
    },
    choices: [
      {
        id: "accept",
        label: { cs: "Přijmout dar", en: "Accept the gift" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Bedna je plná palivových článků a kávy. Navrch leží lucerna s cedulkou „Ať svítí na cestu“.",
              en: "The crate is full of fuel cells and coffee. On top sits a lantern with a tag: “May it light your way.”",
            },
            effects: [
              { t: "item", item: "fuel_cell", n: 2 },
              { t: "item", item: "coffee", n: 10 },
              { t: "credits", secs: 90 },
              { t: "rep", faction: "lamplighters", n: 3 },
            ],
          },
        ],
      },
      {
        id: "discount",
        label: { cs: "Radši slevu u cechu", en: "Ask for a guild discount" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Pilotka se zasměje a napíše ti doporučení. Lampáři teď tvoje zboží vykupují jako od vlastních.",
              en: "The pilot laughs and writes you a recommendation. The Lamplighters now buy your goods as if you were one of their own.",
            },
            effects: [
              { t: "buff", effect: { stat: "sellValue", mul: 1.2 }, secs: 1200 },
              { t: "rep", faction: "lamplighters", n: 2 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "distress_suspicious_call",
    type: "distress",
    weight: 7,
    cooldown: 5400,
    when: { depthMin: 4, failure: "none" },
    title: { cs: "Pomoc, asi", en: "Help, Allegedly" },
    text: {
      cs: "Tísňové volání z pole trosek. Hlas zní zoufale, jen možná až moc spisovně, jako by to četl z papíru. KIPP odhaduje šanci na past na „padesát procent, plus minus padesát“.",
      en: "A distress call from a debris field. The voice sounds desperate, though perhaps a little too polished, as if reading from a script. KIPP puts the odds of a trap at “fifty percent, give or take fifty”.",
    },
    choices: [
      {
        id: "go",
        label: { cs: "Letět na pomoc", en: "Go and help" },
        risk: 2,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "Byla to opravdu rodina s rozbitým motorem. Otec četl volání z papíru, protože má před cizími trému.",
              en: "It really was a family with a broken engine. The father read the call from a script because strangers make him nervous.",
            },
            effects: [
              { t: "rep", faction: "lamplighters", n: 3 },
              { t: "morale", n: 5 },
              { t: "credits", secs: 120 },
            ],
          },
          {
            weight: 2,
            text: {
              cs: "Mezi troskami není žádná loď v nesnázích. Zato jsou tam dvě, které nesnáze působí.",
              en: "There is no ship in trouble among the wreckage. There are, however, two ships that cause it.",
            },
            effects: [{ t: "chain", event: "pirates_ambush", delay: 3 }],
          },
        ],
      },
      {
        id: "scan",
        label: { cs: "Nejdřív to oskenovat", en: "Scan before you leap" },
        requires: { feature: "scan" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Skener ukazuje dvě lodě se zahřátými zbraněmi. Posíláš jim srdečný pozdrav a letíš opačným směrem.",
              en: "The scanner shows two ships with their weapons warmed up. You send warm regards and fly the other way.",
            },
            effects: [
              { t: "rp", secs: 30 },
              { t: "credits", secs: 30 },
            ],
          },
        ],
      },
      {
        id: "ignore",
        label: { cs: "Dělat, že neslyšíš", en: "Pretend not to hear" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Volání slábne za zádí. Buď to byla past, nebo někdo, kdo tě potřeboval, a to se už nedozvíš.",
              en: "The call fades astern. Either you dodged a trap or someone who needed you, and you will never find out which.",
            },
            effects: [{ t: "morale", n: -2 }],
          },
        ],
      },
    ],
  },
  {
    id: "distress_escape_pod",
    type: "distress",
    weight: 7,
    cooldown: 10800,
    when: { depthMin: 2 },
    title: { cs: "Záchranný modul", en: "The Escape Pod" },
    text: {
      cs: "Prostorem se pomalu převaluje záchranný modul s blikajícím světlem. Uvnitř někdo je, nebo aspoň něco, co má tep. Na okénku je zevnitř přilepená cedulka „NERUŠIT“.",
      en: "An escape pod tumbles slowly through space, its light blinking. There is someone inside, or at least something with a pulse. A sign is taped to the porthole from within: “DO NOT DISTURB”.",
    },
    choices: [
      {
        id: "open",
        label: { cs: "Přitáhnout a otevřít", en: "Haul it in and open it" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Modul dosedl do nákladového prostoru. Zámek se otáčí zevnitř dřív, než na něj sáhneš.",
              en: "The pod settles into the cargo bay. The lock turns from the inside before you can touch it.",
            },
            effects: [{ t: "chain", event: "stowaway_pod_occupant", delay: 5 }],
          },
        ],
      },
      {
        id: "knock",
        label: { cs: "Zaťukat a počkat", en: "Knock and wait" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Zevnitř někdo zaťuká zpátky. Pak se cedulka otočí a na druhé straně stojí: „Tak dobře, ale zujte se.“",
              en: "Someone knocks back from inside. Then the sign flips over, and the other side reads: “Fine, but take your shoes off.”",
            },
            effects: [
              { t: "morale", n: 1 },
              { t: "chain", event: "stowaway_pod_occupant", delay: 5 },
            ],
          },
        ],
      },
      {
        id: "leave",
        label: { cs: "Respektovat cedulku", en: "Respect the sign" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Cedulka je cedulka. Modul se převaluje dál a světlo bliká, člověk by řekl, spokojeně.",
              en: "A sign is a sign. The pod tumbles on, and its light blinks in what you would call a contented way.",
            },
            effects: [{ t: "morale", n: 1 }],
          },
        ],
      },
    ],
  },
  {
    id: "distress_rustborn_wreck",
    type: "distress",
    weight: 7,
    cooldown: 5400,
    when: { depthMin: 5 },
    title: { cs: "Rozpadá se jim loď", en: "Their Ship Is Coming Apart" },
    text: {
      cs: "Loď Rezavých ztrácí pláty jako strom listí. Velitelka prosí o pancéřování, o cokoli, klidně i o staré plechy. Na jejím trupu přitom visí díly, které by se hodily i tobě.",
      en: "A Rustborn ship is shedding plates like a tree sheds leaves. The captain begs for plating, anything at all, even old sheet metal. Meanwhile her hull is hung with parts you could use yourself.",
    },
    choices: [
      {
        id: "give",
        label: { cs: "Dát jim plátování", en: "Give them plating" },
        cost: { items: { plating: 4 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Tvoje pláty mají na jejich lodi nejhezčí barvu ze všech. Rezaví na takové věci nezapomínají a na oplátku ti vnutí bednu dílů.",
              en: "Your plates are the best-looking ones on their ship. The Rustborn do not forget such things, and press a crate of parts on you in return.",
            },
            effects: [
              { t: "rep", faction: "rustborn", n: 8 },
              { t: "item", item: "spare_parts", n: 2 },
              { t: "morale", n: 3 },
            ],
          },
        ],
      },
      {
        id: "weld",
        label: { cs: "Pomoct jim svařovat", en: "Help them weld" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Bereš svářečku a jdeš na jejich trup. Šest Rezavých ti kouká pod ruce a hlasitě hodnotí techniku.",
              en: "You take your torch over to their hull. Six Rustborn watch your hands and review your technique out loud.",
            },
            effects: [
              {
                t: "minigame",
                game: "weld",
                tier: 2,
                win: [
                  { t: "rep", faction: "rustborn", n: 6 },
                  { t: "item", item: "scrap", n: 60, scaled: true },
                  { t: "morale", n: 3 },
                ],
                lose: [
                  { t: "rep", faction: "rustborn", n: 2 },
                  { t: "hull", pct: -4 },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "strip",
        label: { cs: "Počkat a obrat vrak", en: "Wait and strip the wreck" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Čekáš, až posádka odletí v člunech, a pak sbíráš, co zbylo. Díly jsou dobré, jen se dnes radši vyhneš zrcadlu.",
              en: "You wait until the crew leaves in their skiffs, then collect what remains. The parts are good, though you may want to avoid mirrors today.",
            },
            effects: [
              { t: "item", item: "plating", n: 8, scaled: true },
              { t: "item", item: "actuator", n: 4, scaled: true },
              { t: "rep", faction: "rustborn", n: -10 },
              { t: "morale", n: -4 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "distress_ledger_auditor",
    type: "distress",
    weight: 6,
    cooldown: 7200,
    when: { depthMin: 7 },
    title: { cs: "Auditor v nesnázích", en: "Auditor in Distress" },
    text: {
      cs: "Kapsli Tiché účtárny unáší proud a její pasažér klidně vysílá: „Žádám o záchranu dle paragrafu dvanáct. Než začnete, vyplňte prosím formulář Z-7 ve dvou kopiích.“",
      en: "A Quiet Ledger capsule is being carried off by a current while its passenger calmly transmits: “I request rescue under section twelve. Before you begin, please complete form Z-7 in duplicate.”",
    },
    choices: [
      {
        id: "form",
        label: { cs: "Vyplnit formulář", en: "Fill in the form" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Formulář Z-7 má čtyřicet kolonek a tři z nich si odporují. Auditor mezitím trpělivě odplouvá.",
              en: "Form Z-7 has forty fields, and three of them contradict each other. The auditor, meanwhile, drifts patiently away.",
            },
            effects: [
              {
                t: "minigame",
                game: "hack",
                tier: 1,
                win: [
                  { t: "rep", faction: "ledger", n: 6 },
                  { t: "credits", secs: 120 },
                ],
                lose: [
                  { t: "rep", faction: "ledger", n: 2 },
                  { t: "credits", secs: 30 },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "rescue",
        label: { cs: "Zachránit ho bez papírů", en: "Rescue him, skip the form" },
        risk: 1,
        outcomes: [
          {
            weight: 2,
            good: true,
            text: {
              cs: "Vytahuješ ho bez jediného razítka. Poděkuje a pak ti udělí napomenutí, naštěstí jen ústní.",
              en: "You pull him out without a single stamp. He thanks you and then issues a reprimand, fortunately only a verbal one.",
            },
            effects: [
              { t: "rep", faction: "ledger", n: 3 },
              { t: "credits", secs: 60 },
            ],
          },
          {
            weight: 1,
            text: {
              cs: "Záchranu označil za procesně neplatnou a žádá o vrácení do proudu. Žádosti se nevyhovuje.",
              en: "He declares the rescue procedurally invalid and asks to be returned to the current. The request is denied.",
            },
            effects: [
              { t: "rep", faction: "ledger", n: -2 },
              { t: "morale", n: 2 },
            ],
          },
        ],
      },
      {
        id: "hold",
        label: { cs: "Nechat ho čekat", en: "Put him on hold" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Pouštíš mu čekací melodii a hlášku, že jeho hovor je pro tebe důležitý. Vydrží dvacet minut, než ho vyzvedne někdo jiný.",
              en: "You play him hold music and a message saying his call is important to you. He lasts twenty minutes before somebody else picks him up.",
            },
            effects: [
              { t: "rep", faction: "ledger", n: -5 },
              { t: "morale", n: 3 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "distress_colony_air",
    type: "distress",
    weight: 6,
    cooldown: 9000,
    when: { depthMin: 6, feature: "crafting" },
    title: { cs: "Dochází jim vzduch", en: "Running Out of Air" },
    text: {
      cs: "Kolonistická loď s osmdesáti lidmi má rozbitý regenerátor a vzduch na dva dny. Kapitán nabízí zaplatit, čím bude moct, což podle stavu lodi nebude mnoho.",
      en: "A colony ship with eighty people aboard has a broken regenerator and two days of air. The captain offers to pay whatever he can, which, judging by the state of the ship, will not be much.",
    },
    choices: [
      {
        id: "give",
        label: { cs: "Dát jim kyslík", en: "Give them oxygen" },
        cost: { items: { oxygen: 10 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            good: true,
            text: {
              cs: "Osmdesát lidí ti mává z oken. Děti nakreslily tvoji loď a mají ji hezčí, než je ve skutečnosti.",
              en: "Eighty people wave at you from the windows. The children have drawn your ship, and theirs is prettier than the real one.",
            },
            effects: [
              { t: "rep", faction: "lamplighters", n: 4 },
              { t: "rep", faction: "rustborn", n: 2 },
              { t: "morale", n: 6 },
              { t: "flag", key: "saved_colony_ship" },
            ],
          },
        ],
      },
      {
        id: "sell",
        label: { cs: "Prodat jim ho draze", en: "Sell it at a premium" },
        cost: { items: { oxygen: 10 } },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Zaplatili vším, co měli. KIPP přepočítal zisk na jeden nádech a výsledek ti odmítl sdělit.",
              en: "They pay with everything they have. KIPP works out the profit per breath and declines to tell you the result.",
            },
            effects: [
              { t: "credits", secs: 240 },
              { t: "rep", faction: "lamplighters", n: -6 },
              { t: "morale", n: -5 },
            ],
          },
        ],
      },
      {
        id: "fix",
        label: { cs: "Opravit regenerátor", en: "Fix the regenerator" },
        risk: 1,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Regenerátor je stejný typ jako ten tvůj, jen o dvacet let mladší. Ventily na něm ale mají vlastní hlavu.",
              en: "The regenerator is the same model as yours, only twenty years younger. Its valves, however, have a mind of their own.",
            },
            effects: [
              {
                t: "minigame",
                game: "valves",
                tier: 2,
                win: [
                  { t: "morale", n: 6 },
                  { t: "rep", faction: "lamplighters", n: 4 },
                  { t: "credits", secs: 90 },
                  { t: "flag", key: "saved_colony_ship" },
                ],
                lose: [
                  { t: "morale", n: -2 },
                  { t: "rep", faction: "lamplighters", n: 1 },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "distress_two_ships",
    type: "distress",
    weight: 5,
    cooldown: 10800,
    when: { depthMin: 9 },
    title: { cs: "Dvě lodě, jedno lano", en: "Two Ships, One Tow Line" },
    text: {
      cs: "Po srážce se ke hvězdě pomalu snášejí dvě lodě: obchodník lampářů s nákladem léků a rodinná bárka Rezavých. Vlečné lano máš jedno. KIPP odmítá radit a výjimečně si odpustí i vtip.",
      en: "After a collision two ships are slowly falling toward the star: a Lamplighter trader carrying medicine, and a Rustborn family barge. You have one tow line. KIPP declines to advise and, for once, skips the joke.",
    },
    choices: [
      {
        id: "trader",
        label: { cs: "Odtáhnout obchodníka", en: "Tow the trader" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Léky dorazí tam, kam měly. Bárku Rezavých nakonec vytáhl někdo jiný, pozdě a jen zčásti.",
              en: "The medicine gets where it was going. The Rustborn barge is eventually pulled out by someone else, late and only in part.",
            },
            effects: [
              { t: "rep", faction: "lamplighters", n: 8 },
              { t: "rep", faction: "rustborn", n: -6 },
              { t: "credits", secs: 150 },
              { t: "morale", n: -3 },
            ],
          },
        ],
      },
      {
        id: "family",
        label: { cs: "Odtáhnout rodinu", en: "Tow the family" },
        risk: 0,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Rodina je v bezpečí a babička ti vnutila bednu dílů. Náklad léků shořel a cech si to zapsal.",
              en: "The family is safe and their grandmother forces a crate of parts on you. The medicine burned up, and the guild made a note of it.",
            },
            effects: [
              { t: "rep", faction: "rustborn", n: 8 },
              { t: "rep", faction: "lamplighters", n: -6 },
              { t: "item", item: "spare_parts", n: 2 },
              { t: "morale", n: 2 },
            ],
          },
        ],
      },
      {
        id: "both",
        label: { cs: "Zkusit obě najednou", en: "Try for both" },
        risk: 2,
        outcomes: [
          {
            weight: 1,
            text: {
              cs: "Jedno lano, dvě lodě a remorkér, který na to nebyl stavěný. KIPP tiše říká: „Tak ukaž, co umíš.“",
              en: "One line, two ships and a tug that was never built for this. KIPP says quietly: “Go on, then, show me what you can do.”",
            },
            effects: [
              {
                t: "minigame",
                game: "dock",
                tier: 3,
                win: [
                  { t: "rep", faction: "lamplighters", n: 6 },
                  { t: "rep", faction: "rustborn", n: 6 },
                  { t: "morale", n: 8 },
                  { t: "credits", secs: 120 },
                  { t: "flag", key: "saved_both_ships" },
                ],
                lose: [
                  { t: "hull", pct: -12 },
                  { t: "rep", faction: "lamplighters", n: -2 },
                  { t: "rep", faction: "rustborn", n: -2 },
                  { t: "morale", n: -5 },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

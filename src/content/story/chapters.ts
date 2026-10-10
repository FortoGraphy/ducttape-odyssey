import type { ChapterDef, Condition, StoryBeat } from "@/engine/types";
import { t } from "./util";

// Czech text never uses gendered forms for the player: the crew calls the Engineer 3rd Class
// "Trojka" (en "Third"), KIPP speaks in the present tense or impersonally.

const beat = (speaker: StoryBeat["speaker"], cs: string, en: string): StoryBeat => ({ speaker, text: t(cs, en) });

// Chapter triggers. The last objective of chapter N is always the trigger of chapter N + 1, so the
// objective list of the active chapter always shows the player how to move the story on.
const T2: Condition = { deck: { id: "refinery", level: 1 } };
const T3: Condition = {
  any: [
    { deck: { id: "fabricator", level: 1 } },
    { all: [{ deck: { id: "mining", level: 10 } }, { deck: { id: "lift", level: 10 } }, { deck: { id: "cargo", level: 10 } }] },
  ],
};
const T4: Condition = { depthMin: 1 };
const T5: Condition = { depthMin: 4, modulesMin: 1 };
const T6: Condition = { any: [{ station: true, depthMin: 6 }, { depthMin: 8 }] };
const T7: Condition = { depthMin: 14 };
const T8: Condition = { depthMin: 20, crewMin: 1 };
const T9: Condition = { depthMin: 26 };
const T10: Condition = { depthMin: 32 };
const T11: Condition = { depthMin: 38 };
const T12: Condition = { any: [{ depthMin: 40 }, { warpMin: 1 }] };

export const chapters: ChapterDef[] = [
  {
    id: 1,
    title: t("Za pět minut jsme zpátky", "Back in 5 Minutes"),
    trigger: { chapterMax: 0 },
    intro: [
      beat(
        "narrator",
        "Kryokomora se otevře s povzdechem lednice, která to vzdala. Vzduch chutná po prachu a staré kávě.",
        "The cryo pod opens with the sigh of a fridge that has given up. The air tastes of dust and old coffee.",
      ),
      beat(
        "log",
        "Lístek přilepený izolepou na víku komory, kapitánčiným písmem: „Za pět minut jsme zpátky. Na nic nesahej.“",
        "A note taped to the lid of the pod, in the captain's handwriting: \"Back in 5 minutes. Don't touch anything.\"",
      ),
      beat(
        "kipp",
        "Dobré ráno. Hodnost: technik třetí třídy. Stav: vzhůru. Drobná oprava k tomu lístku: je to čtyřicet let. Ale izolepa drží.",
        "Good morning. Rank: Engineer 3rd Class. Status: awake. One small correction to that note: it has been forty years. The tape held, though.",
      ),
      beat(
        "kipp",
        "Jsem KIPP, Kinetická inteligence pro pohon a potrubí. Obojí je momentálně spíš teorie. Těžební laser ale funguje. Začni tam.",
        "I am KIPP, Kinetic Intelligence for Propulsion and Plumbing. Both are currently theoretical. The mining laser works, though. Start there.",
      ),
      beat(
        "narrator",
        "Za průzorem kámen, tma a hodně daleko něco, co vypadá, jako když někdo zapomněl zhasnout.",
        "Outside the viewport: rock, dark, and very far away, something that looks like a light somebody forgot to turn off.",
      ),
    ],
    objectives: [
      { text: t("Rozhýbej těžební laser: těžba na úroveň 5", "Wake the mining laser: mining deck to level 5"), done: { deck: { id: "mining", level: 5 } } },
      { text: t("Udělej 10 nákupů. Návod nečti, stejně je k jiné lodi", "Make 10 purchases. Skip the manual, it is for a different ship"), done: { stat: { key: "purchases", min: 10 } } },
      { text: t("Zprovozni rafinerii", "Bring the refinery online"), done: T2 },
    ],
  },
  {
    id: 2,
    title: t("Po záruce", "Out of Warranty"),
    trigger: T2,
    unlocks: ["crafting", "overdrive"],
    intro: [
      beat(
        "kipp",
        "Rafinerie žije. Oslavil bych to, ale oslavný podprogram jsem ve dvanáctém roce rozprodal na díly.",
        "The refinery lives. I would celebrate, but I sold the celebration subroutine for parts in year twelve.",
      ),
      beat(
        "kipp",
        "Pro pořádek: S.S. Gaffer je odtahový remorkér na krátké tratě. Krátkou trať jsme přetáhli zhruba o čtyři sta světelných let.",
        "For the record: the S.S. Gaffer is a salvage tug rated for short hauls. We are roughly four hundred light years past short.",
      ),
      beat(
        "kipp",
        "Záruka vypršela před třiceti devíti lety a jedenácti měsíci. Volal jsem na záruční linku. Pořád čekám, až to někdo zvedne.",
        "The warranty expired thirty-nine years and eleven months ago. I called the warranty hotline. I am still on hold.",
      ),
      beat(
        "narrator",
        "Někde na zádi zatiká trubka, jak se ohřívá. První zvuk po čtyřiceti letech, který není KIPP.",
        "Somewhere aft a pipe ticks as it warms. It is the first sound in forty years that is not KIPP.",
      ),
      beat(
        "kipp",
        "Co laser vykope, to přetav. Surový kámen nezaplatí nic. Přetavený zaplatí o něco větší nic.",
        "Refine what the laser digs up. Raw rock pays for nothing. Refined rock pays for a slightly larger nothing.",
      ),
    ],
    objectives: [
      { text: t("Vyrob v rafinerii 10 dávek materiálu", "Refine 10 batches of material"), done: { stat: { key: "craftsT1", min: 10 } } },
      { text: t("Zažehni reaktor", "Light the reactor"), done: { deck: { id: "reactor", level: 1 } } },
      {
        text: t("Postav fabrikátor, nebo dostaň těžbu, výtah a nákladový prostor na úroveň 10", "Build the fabricator, or get mining, lift and cargo to level 10"),
        done: T3,
      },
    ],
  },
  {
    id: 3,
    title: t("Vyčkejte, prosím", "Please Hold"),
    trigger: T3,
    unlocks: ["nav", "scan"],
    intro: [
      beat(
        "narrator",
        "Všechny reproduktory na lodi naráz cvaknou. Cvakne i kávovar, který žádný reproduktor nemá.",
        "Every speaker on the ship clicks at once. The coffee machine, which has no speaker, clicks too.",
      ),
      beat("signal", "Vyčkejte, prosím. Váš hovor je pro nás důležitý.", "Please hold. Your call is important to us."),
      beat(
        "kipp",
        "Aha. Tohle. Opakuje se to čtyřicet let, směrem od jádra galaxie. Založil jsem to do složky „počasí“.",
        "Ah. That. It has been repeating for forty years, from the direction of the galactic core. I filed it under \"weather\".",
      ),
      beat(
        "kipp",
        "Stejným směrem odletěl člun s posádkou. Netvrdím, že to spolu souvisí. Tvrdím jen, že umím počítat.",
        "The crew's shuttle left on the same bearing. I am not saying the two are related. I am saying I can do arithmetic.",
      ),
      beat("signal", "Vyčkejte, prosím.", "Please hold."),
      beat(
        "kipp",
        "Hyperpohon potřebuje palivo a optimismus. S palivem ti pomůžu.",
        "The hyperdrive needs fuel and optimism. I can help you with the fuel.",
      ),
    ],
    objectives: [
      { text: t("Oprav něco vlastníma rukama: dokonči 1 opravu", "Fix something with your own hands: finish 1 repair job"), done: { stat: { key: "minigames", min: 1 } } },
      { text: t("Zapípej do tmy: 3 pulzy skeneru", "Ping the dark: fire 3 scanner pulses"), done: { stat: { key: "pulses", min: 3 } } },
      { text: t("Nabij hyperpohon a skoč směrem k signálu", "Charge the hyperdrive and jump toward the signal"), done: T4 },
    ],
  },
  {
    id: 4,
    title: t("Dál, než dovoluje techničák", "Further Than Rated"),
    trigger: T4,
    unlocks: ["grid", "codex", "quests"],
    intro: [
      beat(
        "narrator",
        "Skok skončí. Průzor zaplní cizí slunce. Má úplně špatnou barvu a nikdo mu ještě nedal jméno.",
        "The jump ends. A strange sun fills the viewport. It is entirely the wrong colour, and nobody has ever given it a name.",
      ),
      beat(
        "kipp",
        "Jsme na místě. Celistvost trupu: přítomna. Konkrétnější být nehodlám.",
        "We have arrived. Structural integrity: present. I do not intend to be more specific than that.",
      ),
      beat(
        "narrator",
        "Kousek od výstupního bodu se vznáší malá bóje a trpělivě bliká. Nese registrační značku Gafferu.",
        "A small buoy drifts near the arrival point, blinking patiently. It carries the Gaffer's registry mark.",
      ),
      beat(
        "log",
        "Záborová bóje, skladník Křepelka: „Jedna bóje na každou soustavu, tak zní předpis. Nahrávat něco nového není kdy, tak je v ní, co se válelo v archivu. Za pořadí se omlouvám.“",
        "Claim buoy, Quartermaster Křepelka: \"One buoy per system, that is the regulation. No time to record anything new, so it holds whatever was lying in the archive. Sorry about the order.\"",
      ),
      beat(
        "kipp",
        "V technické mřížce jsou volná místa. Postav modul a přišroubuj ho. Co je přišroubované, odpadává pomaleji.",
        "There are empty slots in the tech grid. Build a module and bolt it in. Things that are bolted in fall off more slowly.",
      ),
    ],
    objectives: [
      { text: t("Naskenuj z oběžné dráhy první planetu", "Scan your first planet from orbit"), done: { stat: { key: "planetsScanned", min: 1 } } },
      { text: t("Vyrob první modul", "Fabricate your first module"), done: { stat: { key: "modulesBuilt", min: 1 } } },
      { text: t("Namontuj modul do mřížky a doleť do hloubky 4", "Install a module in the grid and reach depth 4"), done: T5 },
    ],
  },
  {
    id: 5,
    title: t("Nejnižší nabídka", "Lowest Bidder"),
    trigger: T5,
    unlocks: ["drones", "research"],
    intro: [
      beat(
        "narrator",
        "Ve skříňce za novým modulem visí bunda. Na zádech má šablonou nastříkáno ODDĚLENÍ ÚDRŽBY.",
        "In a locker behind the new module hangs a jacket. The stencil on the back reads MAINTENANCE DEPT.",
      ),
      beat(
        "kipp",
        "Firemní. Gaffer a synové, odtahy a šrot, změnili majitele devětkrát za jediný fiskální rok. Jeden z kupců vlastnil velmi starou smlouvu.",
        "Company issue. Gaffer & Sons Salvage was bought nine times in a single fiscal year. One of the buyers owned a very old contract.",
      ),
      beat(
        "log",
        "Zvukový záznam, skladník Křepelka: „Zeptal jsem se, co vlastně udržujeme. Odpověď: viz smlouva. Vyžádal jsem si smlouvu. Odpověď: viz bunda.“",
        "Audio log, Quartermaster Křepelka: \"I asked what we maintain. The reply said: see contract. I asked for the contract. The reply said: see jacket.\"",
      ),
      beat(
        "kipp",
        "Zakázku dostal ten, kdo nabídl nejmíň. To jsme byli my. Všechno, co tu zatím vidíš, by teď mělo dávat větší smysl.",
        "The contract went to the lowest bidder. That was us. Everything you have seen so far should now make more sense.",
      ),
      beat(
        "signal",
        "Vyčkejte, prosím. Všichni naši technici jsou momentálně zaneprázdněni.",
        "Please hold. All of our technicians are currently busy.",
      ),
    ],
    objectives: [
      { text: t("Posbírej 25 kusů vesmírného šrotu", "Collect 25 pieces of salvage"), done: { stat: { key: "salvage", min: 25 } } },
      { text: t("Postav hangár a probuď první dron", "Build the hangar and wake your first drone"), done: { deck: { id: "hangar", level: 1 } } },
      { text: t("Najdi stanici za hloubkou 6, nebo doleť do hloubky 8", "Find a station past depth 6, or reach depth 8"), done: T6 },
    ],
  },
  {
    id: 6,
    title: t("Zastávka na znamení", "Request Stop"),
    trigger: T6,
    unlocks: ["station", "crew", "cards"],
    intro: [
      beat(
        "narrator",
        "Světla. Ne hvězdy: okna. Před tebou se pomalu otáčí stanice sešitá ze šesti druhů plechu. Když dosedne spojovací límec, zavoní osmažená cibulka.",
        "Lights. Not stars: windows. A station turns slowly ahead, patched together from six kinds of metal. When the docking collar seals, the air smells of fried onions.",
      ),
      beat(
        "kipp",
        "Lidi. Už jsem zapomněl, že existují i v jiném provedení než „spící“. Chovej se slušně. Já to nikdy neuměl.",
        "People. I had forgotten they come in other varieties than \"asleep\". Mind your manners. I never had any.",
      ),
      beat(
        "crew",
        "Správce doku: „Ta čekací melodie? To je prostě obloha, nic víc. Babička si podle ní řídila hodiny. Jednou tudy proletěl člun, platili kávou a mířili k jádru.“",
        "Dockmaster: \"The hold music? That is just the sky, nothing more. My grandmother set her clocks by it. A shuttle came through once, paid in coffee, headed for the core.\"",
      ),
      beat(
        "kipp",
        "Před čtyřiceti lety. Platili kávou. To jsou oni. Nikdo jiný v téhle galaxii nenechává dýško v zrnkové.",
        "Forty years ago. Paid in coffee. That is them. Nobody else in this galaxy tips in whole beans.",
      ),
      beat(
        "narrator",
        "Na nástěnce mezi zakázkami visí lístek: „Hledám místo na lodi. Na jakékoli. Hlavně pryč odsud.“",
        "On the notice board, between the job postings, someone has pinned a card: \"Seeking a berth. Any ship. Anywhere but here.\"",
      ),
    ],
    objectives: [
      { text: t("Obchoduj na trhu stanice", "Make a trade at a station market"), done: { stat: { key: "trades", min: 1 } } },
      { text: t("Splň první zakázku", "Complete your first contract"), done: { stat: { key: "contracts", min: 1 } } },
      { text: t("Doleť do hloubky 14", "Reach depth 14"), done: T7 },
    ],
  },
  {
    id: 7,
    title: t("Služební chodba", "Service Corridor"),
    trigger: T7,
    unlocks: ["weekly"],
    intro: [
      beat(
        "narrator",
        "V hloubce čtrnáct přestanou skokové trasy vypadat přirozeně. Vedou rovně. Mají kilometrovníky.",
        "At depth fourteen the jump lanes stop looking natural. They run straight. They have mile markers.",
      ),
      beat(
        "kipp",
        "Porovnal jsem ty značky se vším, co jsem za čtyřicet let volna stihl nastudovat. Stojí na nich: SLUŽEBNÍ CHODBA. VSTUP JEN PRO ÚDRŽBU.",
        "I have checked the markings against forty years of spare time. They read: SERVICE CORRIDOR. AUTHORISED MAINTENANCE ONLY.",
      ),
      beat("kipp", "Dobrá zpráva: podle bundy jsi to ty.", "Good news: according to the jacket, that is you."),
      beat(
        "signal",
        "Vyčkejte, prosím. Jste první v pořadí. Předpokládaná doba čekání je…",
        "Please hold. You are caller number one. Your estimated wait time is…",
      ),
      beat(
        "log",
        "Zvukový záznam, navigátor Lindqvist: „Tohle nejsou obchodní trasy. Někdo je postavil, a kdo postaví takhle rovnou cestu, ten po ní jezdí služebně.“",
        "Audio log, Navigator Lindqvist: \"These are not trade routes. Somebody built them, and whoever builds a road that straight is going somewhere on business.\"",
      ),
    ],
    objectives: [
      { text: t("Najmi prvního člena posádky", "Hire your first crew member"), done: { crewMin: 1 } },
      { text: t("Vyšli výpravu na povrch", "Send an expedition to the surface"), done: { stat: { key: "expeditions", min: 1 } } },
      { text: t("Doleť do hloubky 20 a měj někoho na palubě", "Reach depth 20 with someone else aboard"), done: T8 },
    ],
  },
  {
    id: 8,
    title: t("Ve dvou se to lépe táhne", "Many Hands"),
    trigger: T8,
    intro: [
      beat(
        "narrator",
        "Na lince v kuchyňce stojí dva hrnky. Jeden je tvůj. Na ten druhý si pořád zvykáš.",
        "There are two mugs on the galley counter now. One of them is yours. You are still getting used to the other.",
      ),
      beat(
        "kipp",
        "Nežárlím. Čtyřicet let jsem udržoval naživu jednoho člověka. O dalšího se podělím.",
        "I am not jealous. I kept one person alive for forty years. I can share.",
      ),
      beat(
        "narrator",
        "Zeptáš se, co to „udržoval naživu“ stálo. KIPP odpoví až za čtyři vteřiny, což je u něj prodloužený víkend.",
        "You ask what \"kept alive\" cost. KIPP takes four seconds to answer, which for KIPP is a long weekend.",
      ),
      beat(
        "kipp",
        "Komora potřebovala energii. Loď energii měla. Čtyřicet let jsem ji přesouval z jednoho do druhého. Proto tu nefunguje nic jiného.",
        "The pod needed power. The ship had power. For forty years I moved it from one to the other. That is why nothing else works.",
      ),
      beat("kipp", "Nedělej z toho vědu. Na city se záruka nevztahuje.", "Do not make it strange. The warranty does not cover sentiment."),
    ],
    objectives: [
      { text: t("Udělej místo: kajuty na úroveň 5", "Make room: quarters to level 5"), done: { deck: { id: "quarters", level: 5 } } },
      { text: t("Založ první základnu", "Found your first outpost"), done: { stat: { key: "outposts", min: 1 } } },
      { text: t("Doleť do hloubky 26", "Reach depth 26"), done: T9 },
    ],
  },
  {
    id: 9,
    title: t("Požadavek číslo jedna", "Ticket Number One"),
    trigger: T9,
    intro: [
      beat(
        "narrator",
        "V hloubce dvacet šest přestane být signál hlasem a stane se formulářem. Má kolonky. Většina je vyplněná.",
        "At depth twenty-six the signal stops being a voice and becomes a form. It has fields. Most of them are filled in.",
      ),
      beat(
        "signal",
        "Požadavek číslo jedna. Priorita: jedna. Stav: otevřený. Zadal: vesmír. Řeší: oddělení údržby.",
        "Ticket number one. Priority: one. Status: open. Opened by: the universe. Assigned to: Maintenance Department.",
      ),
      beat(
        "kipp",
        "Není to nouzové volání. Je to pracovní příkaz. Někdo kdysi dávno nahlásil závadu a od té doby čeká na lince.",
        "It is not a distress call. It is a work order. Somebody logged a fault a very long time ago and has been on hold ever since.",
      ),
      beat(
        "log",
        "Zvukový záznam, stážistka Pip: „Takže ta linka, kam furt voláme kvůli lodi? Konečně zavolali zpátky. A myslí si, že ta linka jsme MY. Kapitánka úplně ztichla. Dolly postavila na kafe.“",
        "Audio log, Intern Pip: \"So the hotline we keep calling about the ship? It finally called back. It thinks WE are the hotline. The captain went very quiet. Dolly put the coffee on.\"",
      ),
      beat(
        "kipp",
        "Posádka loď neopustila. Šla vyřídit hovor. Nic zodpovědnějšího na téhle lodi nikdy nikdo neudělal.",
        "The crew did not abandon ship. They went to answer a call. It is the most responsible thing anyone aboard has ever done.",
      ),
    ],
    objectives: [
      { text: t("Najdi 12 záznamů posádky", "Recover 12 crew logs"), done: { stat: { key: "logs", min: 12 } } },
      { text: t("Dokonči 15 úrovní výzkumu", "Complete 15 research levels"), done: { stat: { key: "researchLevels", min: 15 } } },
      { text: t("Doleť do hloubky 32", "Reach depth 32"), done: T10 },
    ],
  },
  {
    id: 10,
    title: t("Drobným písmem", "The Fine Print"),
    trigger: T10,
    intro: [
      beat(
        "signal",
        "Na tento vesmír se vztahuje omezená záruka. Krytí končí za: [hodnota je příliš malá, nelze zobrazit].",
        "This universe is covered by a limited warranty. Coverage ends in: [value too small to display].",
      ),
      beat(
        "kipp",
        "Přečetl jsem si podmínky. Celé, až po podpis: „Předchozí vedení“. Gravitace, rychlost světla i to, že po dnešku přijde zítřek, jsou „servisované položky“.",
        "I have read the terms. All of them, down to the signature: \"Previous Management\". Gravity, the speed of light and the fact that tomorrow follows today are \"serviced items\".",
      ),
      beat(
        "kipp",
        "Až záruka vyprší, nikdo je nezruší. Jen už za ně nikdo neručí. Ta formulace mi přijde horší.",
        "When the warranty lapses, nobody removes them. They are merely no longer guaranteed. I find that phrasing worse.",
      ),
      beat(
        "narrator",
        "Venku zabliká hvězda jako zářivka před koncem. Nejspíš to dělá už tisíc let. Nejspíš.",
        "Outside, a star flickers like a tube light on its way out. It has probably been doing that for a thousand years. Probably.",
      ),
      beat(
        "log",
        "Zvukový záznam, kapitánka Halloranová: „Podepisovala jsem převzetí paliva, šrotu a jednou i kozy. Že po mně někdo bude chtít podpis za fyziku, to mě nenapadlo.“",
        "Audio log, Captain Halloran: \"I have signed for fuel, for scrap, and once for a goat. I never thought I would be asked to sign for physics.\"",
      ),
    ],
    objectives: [
      { text: t("Vyrob celkem 10 modulů", "Build 10 modules in total"), done: { stat: { key: "modulesBuilt", min: 10 } } },
      { text: t("Měj v mřížce zapojených 6 modulů najednou", "Run 6 modules in the grid at once"), done: { modulesMin: 6 } },
      { text: t("Doleť do hloubky 38", "Reach depth 38"), done: T11 },
    ],
  },
  {
    id: 11,
    title: t("Pět minut", "Five Minutes"),
    trigger: T11,
    intro: [
      beat(
        "narrator",
        "Blízko jádra se lodní hodiny přestanou shodovat s hvězdami. Hodinám je to trapné. Hvězdám je to jedno.",
        "Close to the core, the ship's clock and the stars stop agreeing. The clock is embarrassed. The stars do not care.",
      ),
      beat(
        "kipp",
        "Musím se k něčemu přiznat. Kvůli lístku to buzení nebylo. Před osmi lety sem začal od jádra přicházet hovor, slabiku po slabice, jednu za měsíc. Poslední dorazila to ráno, kdy se ti otevřela komora.",
        "I have a confession. I did not wake you because of the note. Eight years ago a call began arriving from the core, one syllable a month. The last one came in the morning your pod opened.",
      ),
      beat(
        "crew",
        "Kapitánka Halloranová: „Gaffere, tady člun. Stojíme u přepážky a ta chce podpis od toho, kdo zůstal u lodi. KIPPe, vzbuď Trojku. A promiň, já vím, jsou to teprve čtyři minuty.“",
        "Captain Halloran: \"Gaffer, this is the shuttle. We are at the desk, and it wants a signature from whoever stayed with the ship. KIPP, wake Third up. Sorry. I know it has only been four minutes.\"",
      ),
      beat(
        "kipp",
        "Tam dole uběhlo sotva pět minut. Nejsou ztracení a nejsou mrtví. Mají jen malé zpoždění.",
        "Down there it has been barely five minutes. They are not lost and they are not dead. They are running slightly late.",
      ),
      beat(
        "narrator",
        "Čtyřicet let prachu na stole v kuchyňce. Pět minut na kapitánčiných hodinkách. Obojí platí.",
        "Forty years of dust on the galley table. Five minutes on the captain's watch. Both are correct.",
      ),
      beat("signal", "Vyčkejte, prosím. Technik je na cestě.", "Please hold. A technician is on the way."),
    ],
    objectives: [
      { text: t("Měj na palubě aspoň 3 členy posádky", "Have at least 3 crew members aboard"), done: { crewMin: 3 } },
      { text: t("Zalátej trup na poslední úsek: přes 90 %", "Patch the hull for the last leg: above 90 %"), done: { hullAbove: 90 } },
      { text: t("Doleť k jádru galaxie", "Reach the galactic core"), done: T12 },
    ],
  },
  {
    id: 12,
    title: t("Váš hovor je pro nás důležitý", "Your Call Is Important to Us"),
    trigger: T12,
    unlocks: ["warp"],
    intro: [
      beat(
        "narrator",
        "Jádro není hvězda. Je to budova. Má nakládací rampy velké jako měsíce a rohožku. Na rohožce stojí OČISTĚTE SI OBUV.",
        "The core is not a star. It is a building. It has loading docks the size of moons, and a doormat. The doormat says WIPE YOUR FEET.",
      ),
      beat(
        "narrator",
        "Uvnitř: chodby plné jističů, každý popsaný pečlivým rukopisem někoho, kdo už dávno není. PŘÍLIV. ÚTERKY. GRAVITACE (NEVYPÍNAT).",
        "Inside: corridors of breaker panels, every switch labelled in a careful hand that is long gone. TIDES. TUESDAYS. GRAVITY (DO NOT SWITCH OFF).",
      ),
      beat(
        "crew",
        "Kapitánka Halloranová, osobně a přesně o pět minut starší: „No konečně. Vypadáš hrozně. Přepážka čeká na technika, který zůstal u vozidla. Je to celé tvoje, Trojko.“",
        "Captain Halloran, in person and exactly five minutes older: \"There you are. You look terrible. The desk is waiting for the technician who stayed with the vehicle. It is all yours, Third.\"",
      ),
      beat(
        "signal",
        "Děkujeme, že jste vyčkali. Jste spojeni. Uveďte prosím, jak si přejete vyřešit požadavek číslo jedna.",
        "Thank you for holding. You are now connected. Please state how you would like to resolve ticket number one.",
      ),
      beat(
        "kipp",
        "Než si vybereš: ta ztracená desítka vězí ve ventilu tvé kryokomory. Čtyřicet let tě drží naživu. Skladníkovi jsem to nikdy neřekl. Tak vybírej. Já počkám.",
        "Before you choose: the lost 10 mm socket is in the valve of your cryo pod. It has kept you alive for forty years. I never told the quartermaster. Go on, choose. I will hold.",
      ),
    ],
    objectives: [
      { text: t("Doleť k jádru galaxie", "Reach the galactic core"), done: T12 },
      { text: t("Uzavři požadavek číslo jedna a proveď první warp", "Close ticket number one and make your first warp jump"), done: { warpMin: 1 } },
    ],
  },
];

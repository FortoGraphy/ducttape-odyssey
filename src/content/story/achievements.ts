import type { AchievementDef } from "@/engine/types";
import { t } from "./util";

// Achievements are stat thresholds (stat keys: docs/GDD.md section 11). Within one stat the
// thresholds ascend. Ids are saved, never rename them. Czech descriptions use the imperative so
// they never need a gendered form for the player.
// Cosmetic rewards (content-economy defines the matching CosmeticDefs):
//   ach_paint_1..4, ach_sticker_1..4

type Extra = Pick<AchievementDef, "hidden" | "reward">;

const ach = (
  stat: string,
  threshold: number,
  icon: string,
  nameCs: string,
  nameEn: string,
  descCs: string,
  descEn: string,
  extra?: Extra,
): AchievementDef => ({
  id: `ach_${stat}_${threshold}`,
  name: t(nameCs, nameEn),
  desc: t(descCs, descEn),
  icon,
  stat,
  threshold,
  ...extra,
});

export const achievements: AchievementDef[] = [
  // ---------- economy --------------------------------------------------------------------
  ach("purchases", 1, "buy", "První šroubek", "First Bolt", "Kup první vylepšení.", "Make your first purchase."),
  ach("purchases", 100, "buy", "Stálý zákazník", "Loyal Customer", "Udělej 100 nákupů.", "Make 100 purchases."),
  ach("purchases", 1000, "buy", "Účtenky jako nosný prvek", "Receipts Are Structural", "Udělej 1 000 nákupů.", "Make 1,000 purchases.", { reward: { stamps: 1 } }),
  ach("purchases", 10000, "buy", "Akcionář prázdnoty", "Shareholder of the Void", "Udělej 10 000 nákupů.", "Make 10,000 purchases.", { reward: { stamps: 3 } }),

  ach("deckLevels", 100, "upgrade", "Jedeme nahoru", "Going Up", "Nakup dohromady 100 úrovní palub.", "Buy 100 deck levels in total."),
  ach("deckLevels", 1000, "upgrade", "Na remorkér slušná výška", "Tall for a Tug", "Nakup dohromady 1 000 úrovní palub.", "Buy 1,000 deck levels in total.", { reward: { stamps: 2 } }),

  ach("milestones", 1, "star", "Dvakrát tolik starostí", "Twice the Trouble", "Dosáhni prvního milníku paluby.", "Reach your first deck milestone."),
  ach("milestones", 10, "star", "Sběratelská edice milníků", "Milestone Collector", "Dosáhni 10 milníků palub.", "Reach 10 deck milestones."),
  ach("milestones", 40, "star", "Mimo tabulky", "Off the Chart", "Dosáhni 40 milníků palub.", "Reach 40 deck milestones.", { reward: { stamps: 3 } }),

  ach("creditsLog10", 3, "coin", "Drobné na útratu", "Pocket Change", "Dotáhni to na 1 000 kreditů.", "Reach 1,000 credits."),
  ach("creditsLog10", 6, "coin", "Technicky vzato milion", "Millionaire, Technically", "Dotáhni to na milion kreditů.", "Reach one million credits."),
  ach("creditsLog10", 9, "coin", "Devět nul", "Nine Zeros", "Dotáhni to na miliardu kreditů.", "Reach one billion credits."),
  ach("creditsLog10", 15, "coin", "Firma by si ráda promluvila", "The Company Would Like a Word", "Dotáhni to na biliardu kreditů.", "Reach one quadrillion credits.", { reward: { stamps: 1 } }),
  ach("creditsLog10", 30, "coin", "Čísla přestala dávat smysl", "The Numbers Got Silly", "Dotáhni to na 10^30 kreditů.", "Reach 10^30 credits.", { reward: { stamps: 3 } }),

  // ---------- active play ----------------------------------------------------------------
  ach("salvage", 1, "recycle", "Kdo dřív přijde", "Finders Keepers", "Seber první kus vesmírného šrotu.", "Collect your first piece of salvage."),
  ach("salvage", 100, "recycle", "Vesmírná straka", "Space Magpie", "Seber 100 kusů vesmírného šrotu.", "Collect 100 pieces of salvage."),
  ach("salvage", 2500, "recycle", "Prostě se to tam vznášelo", "It Was Just Floating There", "Seber 2 500 kusů vesmírného šrotu.", "Collect 2,500 pieces of salvage.", { reward: { cosmetic: "ach_sticker_1" } }),

  ach("pulses", 10, "scan", "Píp", "Ping", "Vyšli 10 pulzů skeneru.", "Fire the scanner pulse 10 times."),
  ach("pulses", 500, "scan", "Je tam někdo?", "Is Anybody Out There", "Vyšli 500 pulzů skeneru.", "Fire the scanner pulse 500 times."),

  ach("overdrives", 1, "power", "Za červenou ryskou", "Past the Red Line", "Spusť poprvé přetížení.", "Trigger Overdrive for the first time."),
  ach("overdrives", 100, "power", "Šroubům ani slovo", "Do Not Tell the Bolts", "Spusť přetížení stokrát.", "Trigger Overdrive 100 times.", { reward: { stamps: 1 } }),

  ach("overheats", 1, "heat", "Horká novinka", "Too Hot to Handle", "Přehřej těžební laser.", "Overheat the mining laser."),
  ach("overheats", 50, "heat", "Do třešňova", "Cherry Red", "Přehřej těžební laser padesátkrát. Chladič to nese statečně.", "Overheat the mining laser 50 times. The heat sink is being very brave.", { hidden: true }),

  // ---------- crafting -------------------------------------------------------------------
  ach("crafts", 10, "craft", "Ruční práce", "Handmade", "Dokonči 10 výrobních dávek.", "Finish 10 crafting batches."),
  ach("crafts", 500, "craft", "Pásová výroba", "Production Line", "Dokonči 500 výrobních dávek.", "Finish 500 crafting batches."),
  ach("crafts", 10000, "craft", "Průmyslová revoluce o jednom člověku", "Industrial Revolution, Party of One", "Dokonči 10 000 výrobních dávek.", "Finish 10,000 crafting batches.", { reward: { stamps: 3 } }),
  ach("craftsT1", 100, "deck_refinery", "Vytříbený vkus", "Refined Tastes", "Vyrob 100 dávek rafinovaných materiálů.", "Craft 100 batches of refined materials."),
  ach("craftsT2", 100, "deck_fabricator", "Samá součástka", "Bits and Pieces", "Vyrob 100 dávek součástek.", "Craft 100 batches of components."),
  ach("craftsT4", 1, "gear", "Velké plány", "Thinking Big", "Dokonči první megaprojekt.", "Finish your first megaproject.", { reward: { stamps: 2 } }),
  ach("craftsT4", 5, "gear", "Megalomanie s razítkem", "Megalomania, Licensed", "Dokonči 5 megaprojektů.", "Finish 5 megaprojects.", { reward: { stamps: 5, cosmetic: "ach_paint_1" } }),

  ach("modulesBuilt", 1, "install", "Nutná montáž", "Some Assembly Required", "Vyrob první modul.", "Build your first module."),
  ach("modulesBuilt", 20, "install", "Skládačka pro pokročilé", "Advanced Jigsaw", "Vyrob 20 modulů.", "Build 20 modules."),
  ach("modulesBuilt", 100, "install", "Vyrobeno, ne koupeno", "Built, Not Bought", "Vyrob 100 modulů.", "Build 100 modules.", { reward: { stamps: 2 } }),
  ach("modulesPristine", 1, "q4", "Ani škrábnutí", "Not a Scratch", "Vyrob modul v nejvyšší kvalitě.", "Build a Pristine module."),
  ach("modulesPristine", 10, "q4", "Lepší než z fabriky", "Better Than Factory", "Vyrob 10 modulů v nejvyšší kvalitě.", "Build 10 Pristine modules.", { reward: { stamps: 3, cosmetic: "ach_paint_2" } }),
  ach("modulesInstalled", 1, "tab_grid", "Zapoj a doufej", "Plug and Pray", "Namontuj modul do technické mřížky.", "Install a module in the tech grid."),
  ach("modulesInstalled", 30, "tab_grid", "Každé políčko má svého pána", "A Home for Every Slot", "Namontuj do mřížky 30 modulů.", "Install 30 modules in the grid."),
  ach("blueprints", 1, "book", "Cizí domácí úkol", "Somebody Else's Homework", "Najdi první výkres.", "Find your first blueprint."),
  ach("blueprints", 20, "book", "Opsáno a vylepšeno", "Copied and Improved", "Najdi 20 výkresů.", "Find 20 blueprints.", { reward: { stamps: 2 } }),

  // ---------- repair ---------------------------------------------------------------------
  ach("repairsManual", 1, "repair", "Vlastníma rukama", "Hands On", "Dokonči první ruční opravu.", "Finish your first manual repair."),
  ach("repairsManual", 50, "repair", "Třetí třída, první jakost", "Third Class, First Rate", "Dokonči 50 ručních oprav.", "Finish 50 manual repairs."),
  ach("repairsManual", 500, "repair", "Celé naše řemeslo", "The Whole Job", "Dokonči 500 ručních oprav. A pokaždé se k tomu vrať.", "Finish 500 manual repairs. And come back every time.", { reward: { stamps: 2 } }),
  ach("repairsBot", 250, "bot", "Umění delegovat", "The Art of Delegation", "Nech opravářské boty dokončit 250 oprav.", "Let the repair bots finish 250 jobs."),
  ach("repairsPerfect", 1, "check", "Jako z učebnice", "Textbook", "Dokonči opravu s perfektním výsledkem.", "Finish a repair with a perfect score."),
  ach("repairsPerfect", 25, "check", "Šéftechnik by kývl", "The Chief Would Nod", "Dokonči 25 perfektních oprav.", "Finish 25 perfect repairs.", { reward: { stamps: 2 } }),
  ach("tapeUsed", 1, "tape", "To vydrží", "It'll Hold", "Použij lepicí pásku.", "Use a roll of duct tape."),
  ach("tapeUsed", 100, "tape", "Nosná izolepa", "Load-Bearing Tape", "Použij 100 rolí lepicí pásky.", "Use 100 rolls of duct tape."),
  ach("tapeUsed", 1000, "tape", "Loď z izolepy", "A Ship Made of Tape", "Použij 1 000 rolí lepicí pásky. Skladník ji už vede jako konstrukci.", "Use 1,000 rolls of duct tape. The quartermaster now lists it as structure.", { reward: { stamps: 2, cosmetic: "ach_sticker_2" } }),

  // ---------- mini-games -----------------------------------------------------------------
  ach("minigames", 10, "wrench", "Fušky", "Odd Jobs", "Dokonči 10 miniher.", "Finish 10 mini-games."),
  ach("minigames", 100, "wrench", "Tovaryšská zkouška", "Journeyman's Exam", "Dokonči 100 miniher.", "Finish 100 mini-games."),
  ach("minigames", 1000, "wrench", "Mistrovský list", "Master's Papers", "Dokonči 1 000 miniher.", "Finish 1,000 mini-games.", { reward: { stamps: 3 } }),
  ach("minigamesPerfect", 10, "star", "Na jedničku", "Top Marks", "Dokonči 10 miniher bez chyby.", "Finish 10 mini-games with a perfect score."),
  ach("minigamesPerfect", 100, "star", "Bezchybnost jako zlozvyk", "Flawless Is a Habit", "Dokonči 100 miniher bez chyby.", "Finish 100 mini-games with a perfect score.", { reward: { stamps: 3, cosmetic: "ach_paint_3" } }),
  ach("minigame_weld", 25, "mg_weld", "Horký šev", "Hot Seam", "Dokonči 25 svařování.", "Finish 25 welding jobs."),
  ach("minigame_wire", 25, "mg_wire", "Červená na červenou", "Red to Red", "Dokonči 25 zapojování kabelů.", "Finish 25 wiring jobs."),
  ach("minigame_rhythm", 25, "mg_rhythm", "Šestnáct dob", "Sixteen Steps", "Dokonči 25 rytmických synchronizací.", "Finish 25 rhythm syncs."),
  ach("minigame_valves", 25, "mg_valves", "Papiňák", "Pressure Cooker", "Dokonči 25 vyrovnávání tlaku.", "Finish 25 pressure balancing jobs."),
  ach("minigame_calibrate", 25, "mg_calibrate", "Jemné doladění", "Fine Tuning", "Dokonči 25 kalibrací.", "Finish 25 calibrations."),
  ach("minigame_tape", 25, "mg_tape", "Omotat kolem prstu", "Wrap Artist", "Dokonči 25 lepení úniků.", "Finish 25 leak-taping jobs."),
  ach("minigame_defense", 25, "mg_defense", "Lapač šutrů", "Rock Stopper", "Dokonči 25 obran proti meteorům.", "Finish 25 meteor defences."),
  ach("minigame_dock", 25, "mg_dock", "Podélné parkování", "Parallel Parking", "Dokonči 25 dokovacích manévrů.", "Finish 25 docking manoeuvres."),
  ach("minigame_hack", 25, "mg_hack", "Heslo bylo heslo", "The Password Was Password", "Dokonči 25 hackování.", "Finish 25 hacking jobs."),

  // ---------- navigation and exploration -------------------------------------------------
  ach("jumps", 1, "jump", "Krátká trať, dlouhý příběh", "Short Haul, Long Story", "Proveď první skok.", "Make your first jump."),
  ach("jumps", 25, "jump", "Věrnostní program", "Frequent Flyer", "Proveď 25 skoků.", "Make 25 jumps."),
  ach("jumps", 100, "jump", "Štamgast skokových tras", "A Regular on the Lanes", "Proveď 100 skoků.", "Make 100 jumps."),
  ach("jumps", 500, "jump", "Služební rychlost", "Staff Speed", "Proveď 500 skoků.", "Make 500 jumps.", { reward: { stamps: 2 } }),
  ach("depthMax", 10, "signal", "Hluboká voda", "The Deep End", "Doleť do hloubky 10.", "Reach depth 10."),
  ach("depthMax", 20, "signal", "V půli cesty za někým", "Halfway to Somebody", "Doleť do hloubky 20.", "Reach depth 20."),
  ach("depthMax", 40, "signal", "Očistěte si obuv", "Wipe Your Feet", "Doleť do hloubky 40, až k jádru.", "Reach depth 40, all the way to the core.", { reward: { stamps: 3, cosmetic: "ach_paint_4" } }),
  ach("systemsVisited", 10, "tab_nav", "Poznávací zájezd", "Sightseeing Tour", "Navštiv 10 soustav.", "Visit 10 systems."),
  ach("systemsVisited", 100, "tab_nav", "Pár sluncí už za sebou", "Seen a Few Suns", "Navštiv 100 soustav.", "Visit 100 systems.", { reward: { stamps: 1 } }),
  ach("planetsScanned", 1, "planet", "Odsud vypadá kulatě", "Looks Round From Here", "Naskenuj první planetu.", "Scan your first planet."),
  ach("planetsScanned", 50, "planet", "Zeměměřičský úřad", "Survey Office", "Naskenuj 50 planet.", "Scan 50 planets."),
  ach("planetsScanned", 500, "planet", "Katastr vesmíru", "Land Registry of the Cosmos", "Naskenuj 500 planet.", "Scan 500 planets.", { reward: { stamps: 2 } }),
  ach("expeditions", 1, "crew", "Výsadek", "Away Team", "Vyšli první výpravu.", "Send your first expedition."),
  ach("expeditions", 50, "crew", "Do večeře doma", "Back by Supper", "Vyšli 50 výprav.", "Send 50 expeditions.", { reward: { stamps: 1 } }),
  ach("expeditionsLost", 1, "question", "Však oni se najdou", "They'll Turn Up", "Nech jednu výpravu zabloudit. Natrvalo se tu neztrácí nic.", "Have an expedition go astray. Nothing here is ever lost for good.", { hidden: true }),
  ach("outposts", 1, "beacon", "Vlajka v prachu", "Flag in the Dust", "Založ první základnu.", "Found your first outpost."),
  ach("outposts", 10, "beacon", "Realitní kancelář", "Estate Agent", "Založ 10 základen.", "Found 10 outposts.", { reward: { stamps: 2 } }),
  ach("codex", 10, "book", "Polní poznámky", "Field Notes", "Zapiš 10 záznamů do kodexu.", "Add 10 entries to the codex."),
  ach("codex", 100, "book", "Přírodopis pro pokročilé", "Advanced Natural History", "Zapiš 100 záznamů do kodexu.", "Add 100 entries to the codex."),
  ach("codex", 500, "book", "Encyklopedie odnikud", "Encyclopaedia of Nowhere", "Zapiš 500 záznamů do kodexu.", "Add 500 entries to the codex.", { reward: { stamps: 3, cosmetic: "ach_sticker_3" } }),
  ach("renames", 1, "rename", "Křtím tě", "I Name Thee", "Přejmenuj něco v kodexu.", "Rename something in the codex."),
  ach("renames", 25, "rename", "Všechno se jmenuje Bob", "Everything Is Called Bob", "Přejmenuj 25 věcí. Skladník je polichocen.", "Rename 25 things. The quartermaster is flattered.", { hidden: true }),

  // ---------- events and failures --------------------------------------------------------
  ach("events", 10, "bell", "Něco se děje", "Things Happen", "Vyřeš 10 událostí.", "Resolve 10 events."),
  ach("events", 100, "bell", "O zábavu postaráno", "Never a Dull Parsec", "Vyřeš 100 událostí.", "Resolve 100 events."),
  ach("events", 1000, "bell", "Všechno už tu bylo dvakrát", "Seen It All Twice", "Vyřeš 1 000 událostí.", "Resolve 1,000 events.", { reward: { stamps: 2 } }),
  ach("eventsGood", 50, "heart", "Podezřelé štěstí", "Suspiciously Lucky", "Nech 50 událostí dopadnout dobře.", "Have 50 events end well."),
  ach("eventsBad", 50, "skull", "Škola života", "Character Building", "Přežij 50 událostí, které dopadly špatně.", "Live through 50 events that ended badly."),
  ach("event_pirates", 10, "ev_pirates", "Nestojíme za přepadení", "Not Worth Robbing", "Potkej desetkrát piráty.", "Meet pirates 10 times."),
  ach("event_merchant", 25, "ev_merchant", "Zákaznická karta", "Preferred Customer", "Potkej 25 potulných obchodníků.", "Meet 25 wandering merchants."),
  ach("event_derelict", 10, "ev_derelict", "Cizí vraky", "Other People's Wrecks", "Prozkoumej 10 opuštěných vraků.", "Explore 10 derelicts."),
  ach("event_stowaway", 1, "ev_stowaway", "A doprovod", "Plus One", "Objev na palubě černého pasažéra.", "Discover a stowaway aboard.", { hidden: true }),
  ach("event_kipp", 5, "ev_kipp", "Chce si promluvit", "It Wants to Talk", "Vyslechni 5 KIPPových vlastních událostí.", "Sit through 5 of KIPP's own events.", { hidden: true }),
  ach("failures", 1, "warning", "Věci se rozbíjejí", "Things Break", "Dostaň loď z prvního havarijního stavu.", "Get the ship out of its first failure state."),
  ach("failures", 25, "warning", "Nic se neztrácí", "Nothing Is Lost", "Dostaň loď z 25 havarijních stavů.", "Get the ship out of 25 failure states.", { reward: { stamps: 2 } }),
  ach("failure_tumble", 1, "fail_tumble", "Program ždímání", "Spin Cycle", "Nech loď, ať se rozkutálí vesmírem.", "Let the ship go into a tumble."),
  ach("failure_breach", 1, "fail_breach", "Neplánované okno", "Unplanned Window", "Zažij první díru v trupu.", "Suffer your first hull breach."),
  ach("failure_blackout", 1, "fail_blackout", "Intimní osvětlení", "Mood Lighting", "Zažij první výpadek proudu.", "Suffer your first blackout."),
  ach("failure_noFuel", 1, "fail_noFuel", "Socha", "Sculpture", "Zůstaň viset bez paliva a bez možnosti ho vyrobit.", "Run dry with no way to make more fuel.", { hidden: true }),
  ach("failure_engine", 1, "fail_engine", "Nosné cinknutí", "A Load-Bearing Ping", "Zažij první poruchu motoru.", "Suffer your first engine failure."),
  ach("failure_radiation", 1, "fail_radiation", "Zdravá barva", "A Healthy Glow", "Zažij první radiační poplach.", "Suffer your first radiation alarm."),
  ach("failure_boarding", 1, "fail_boarding", "Bez pozvánky", "Uninvited", "Nech si na palubu vlézt nezvané hosty.", "Get boarded by uninvited guests.", { hidden: true }),
  ach("failure_anomaly", 1, "fail_anomaly", "Fyzika si odskočila", "Physics Stepped Out", "Uvízni tam, kde přestaly platit přírodní zákony.", "Get stuck where the laws of nature stopped applying.", { hidden: true }),
  ach("tows", 1, "tow", "Remorkér na laně", "The Tug Got Towed", "Nech se poprvé odtáhnout.", "Get towed for the first time."),
  ach("tows", 20, "tow", "Zlatý zákazník odtahovky", "Gold Member, Towing Club", "Nech se odtáhnout dvacetkrát. Znají tě tam jménem.", "Get towed 20 times. They know you by name.", { hidden: true, reward: { stamps: 1 } }),

  // ---------- crew, cards, stations ------------------------------------------------------
  ach("crew", 1, "crew", "Dva hrnky", "Two Mugs", "Najmi prvního člena posádky.", "Hire your first crew member."),
  ach("crew", 7, "crew", "Sedm hrnků", "Seven Cups", "Najmi celkem 7 členů posádky. Víc Gertruda neuvaří.", "Hire 7 crew members in total. Gertrude will not brew for more.", { reward: { stamps: 1 } }),
  ach("coffee", 100, "coffee", "Gertruda schvaluje", "Gertrude Approves", "Vypijte na palubě 100 dávek kávy.", "Get through 100 servings of coffee aboard."),
  ach("coffee", 5000, "coffee", "Spálený dopis", "Burnt Letter", "Vypijte na palubě 5 000 dávek kávy. Chutná jako od někoho, kdo vás měl rád.", "Get through 5,000 servings of coffee. It tastes like someone used to love you.", { hidden: true, reward: { stamps: 2 } }),
  ach("cards", 10, "card", "Začátečnický balíček", "Starter Deck", "Získej 10 karet.", "Collect 10 cards."),
  ach("cards", 100, "card", "Plná ruka", "A Full Hand", "Získej 100 karet.", "Collect 100 cards.", { reward: { stamps: 2 } }),
  ach("contracts", 1, "quest", "Tady to podepište", "Sign Here", "Splň první zakázku.", "Complete your first contract."),
  ach("contracts", 50, "quest", "Nejnižší nabídka", "Lowest Bidder", "Splň 50 zakázek.", "Complete 50 contracts.", { reward: { stamps: 2 } }),
  ach("trades", 50, "sell", "Platíme kávou", "Paid in Coffee", "Uzavři na stanicích 50 obchodů.", "Make 50 trades at stations."),

  // ---------- research and prestige ------------------------------------------------------
  ach("researchLevels", 1, "rp", "Skoro heuréka", "Eureka, Nearly", "Dokonči první úroveň výzkumu.", "Complete your first research level."),
  ach("researchLevels", 20, "rp", "Recenzoval KIPP", "Peer Reviewed by KIPP", "Dokonči 20 úrovní výzkumu.", "Complete 20 research levels."),
  ach("researchLevels", 45, "rp", "Příručka se mýlí", "The Manual Is Wrong", "Dokonči 45 úrovní výzkumu.", "Complete 45 research levels.", { reward: { stamps: 2 } }),
  ach("warps", 1, "stamp", "Požadavek uzavřen", "Ticket Closed", "Proveď první warp.", "Make your first warp jump.", { reward: { cosmetic: "ach_sticker_4" } }),
  ach("warps", 5, "stamp", "Opakovaný hovor", "Repeat Caller", "Proveď 5 warpů.", "Make 5 warp jumps.", { reward: { stamps: 2 } }),
  ach("warps", 25, "stamp", "Vedoucí údržby", "Head of Maintenance", "Proveď 25 warpů.", "Make 25 warp jumps.", { reward: { stamps: 5 } }),
  ach("rebuilds", 1, "rivet", "Stejná loď, jenom jiná", "Same Ship, Only Different", "Přestav poprvé celou loď.", "Rebuild the ship for the first time.", { reward: { stamps: 3 } }),
  ach("reboots", 1, "spark", "A zkoušeli jste to vypnout a zapnout?", "Have You Tried Turning It Off and On", "Restartuj vesmír.", "Reboot the cosmos.", { reward: { stamps: 5 } }),

  // ---------- story and habits -----------------------------------------------------------
  ach("logs", 1, "tab_log", "Omlouvám se za pořadí", "Sorry About the Order", "Najdi první záznam posádky.", "Recover your first crew log."),
  ach("logs", 30, "tab_log", "Ucho na dveřích", "Ear to the Door", "Najdi 30 záznamů posádky.", "Recover 30 crew logs."),
  ach("logs", 60, "tab_log", "S návratem se počítá u každého", "Everyone Is Expected Back", "Najdi všech 60 záznamů posádky.", "Recover all 60 crew logs.", { reward: { stamps: 3 } }),
  ach("chapters", 1, "book", "Vzhůru", "Awake", "Začni první kapitolu.", "Begin the first chapter."),
  ach("chapters", 6, "book", "V půlce drobného písma", "Halfway Through the Fine Print", "Dostaň se do šesté kapitoly.", "Reach chapter six."),
  ach("chapters", 12, "book", "Jste spojeni", "You Are Now Connected", "Dostaň se do dvanácté kapitoly.", "Reach chapter twelve.", { reward: { stamps: 3 } }),
  ach("questsDaily", 1, "calendar", "Rozpis služeb", "Chore Chart", "Splň první denní úkol.", "Complete your first daily quest."),
  ach("questsDaily", 50, "calendar", "Spolehnutí jako na izolepu", "Reliable as Tape", "Splň 50 denních úkolů.", "Complete 50 daily quests.", { reward: { stamps: 1 } }),
  ach("questsWeekly", 1, "quest", "Přesčas", "Overtime", "Dokonči první týdenní výzvu.", "Finish your first weekly challenge."),
  ach("questsWeekly", 10, "quest", "Týden co týden", "Week In, Week Out", "Dokonči 10 týdenních výzev.", "Finish 10 weekly challenges.", { reward: { stamps: 2 } }),
  ach("streakMax", 7, "calendar", "Týden samých pondělků", "A Week of Mondays", "Udrž sérii 7 dní.", "Keep a 7-day streak."),
  ach("streakMax", 30, "calendar", "Píchačky", "Clocking In", "Udrž sérii 30 dní.", "Keep a 30-day streak.", { reward: { stamps: 2 } }),
  ach("offlineReturns", 1, "clock", "Hned jsem zpátky", "Back in 5 Minutes", "Vrať se z prvního klidového letu.", "Come back from your first Idle Cruise."),
  ach("offlineReturns", 100, "clock", "Důvěra v autopilota", "Trust the Autopilot", "Vrať se ze 100 klidových letů.", "Come back from 100 Idle Cruises.", { reward: { stamps: 1 } }),
  ach("playedHours", 1, "clock", "První směna", "First Shift", "Odehraj 1 hodinu.", "Play for 1 hour."),
  ach("playedHours", 10, "clock", "Dvojitá směna", "Double Shift", "Odehraj 10 hodin.", "Play for 10 hours."),
  ach("playedHours", 100, "clock", "Skoro čtyřicet let", "Forty Years, Give or Take", "Odehraj 100 hodin. Izolepa pořád drží.", "Play for 100 hours. The tape is still holding.", { hidden: true, reward: { stamps: 3 } }),
  ach("kippLines", 100, "kipp", "Vděčné publikum", "Good Listener", "Vyslechni 100 KIPPových poznámek.", "Hear 100 of KIPP's remarks."),
  ach("kippLines", 2000, "kipp", "On nikdy nezmlkne", "It Never Stops", "Vyslechni 2 000 KIPPových poznámek. Nestěžuje si, jen konstatuje.", "Hear 2,000 of KIPP's remarks. It is not complaining, merely observing.", { hidden: true, reward: { stamps: 1 } }),
  ach("debugOpened", 1, "bug", "Nepovolaným vstup zakázán", "Authorised Personnel Only", "Otevři servisní průlez, který tu vůbec neměl být.", "Open the service hatch that was never meant to be there.", { hidden: true }),
];

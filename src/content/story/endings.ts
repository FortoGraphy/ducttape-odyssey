import type { L10n } from "@/engine/types";
import { t } from "./util";

// The ending is the answer the player gives at the service desk in chapter 12. Every answer closes
// ticket number one and opens the endless mode, "The Backlog" (cs "Nedodělky").
// `id` is what the engine stores in state.story.ending (and in the flag "ending_<id>"), so it must
// match /^[A-Za-z0-9_-]{1,32}$/ and must never be renamed.

export interface EndingDef {
  id: string;
  /** The label of the choice. */
  title: L10n;
  /** What the choice means, shown before the player commits. */
  text: L10n;
  /** Shown once after the choice; always ends by opening the Backlog. */
  epilogue: L10n;
}

/** Flavour tickets of the Backlog: absurd, bureaucratic, endless. */
export interface BacklogTicketDef {
  id: string;
  title: L10n;
  text: L10n;
}

export const endings: EndingDef[] = [
  {
    id: "renew",
    title: t("Prodloužit záruku", "Renew the Warranty"),
    text: t(
      "Podepsat prodloužení. Vesmír zůstane v záruce, servis poběží dál a oddělení údržby se zaváže, že tentokrát opravdu přijde.",
      "Sign the renewal. The universe stays covered, the servicing carries on, and the Maintenance Department commits to actually turning up this time.",
    ),
    epilogue: t(
      "Přepážka vytiskne formulář dlouhý jako spirální rameno. Podepíšeš tam, kam kapitánka ukáže prstem. Někde vysoko nad vámi se blikající hvězda uklidní, jako když někdo konečně dotáhne žárovku. Prodloužení má podmínky, rovné čtyři miliony, a každá podmínka je jeden požadavek. KIPP přečte nahlas ten první: „Úterý vrže.“ Dolly ti podá hrnek navíc. Je pořád teplý. Nedodělky jsou otevřené.",
      "The desk prints a form as long as a spiral arm. You sign where the captain points. Somewhere far above, a flickering star steadies, as if someone had finally tightened the bulb. The renewal has conditions, four million of them, and every condition is a ticket. KIPP reads the first one aloud: \"Tuesday squeaks.\" Dolly hands you the spare cup. It is still warm. The Backlog is open.",
    ),
  },
  {
    id: "answer",
    title: t("Zvednout to a opravit po svém", "Answer the Call and Fix It Yourself"),
    text: t(
      "Strhnout plombu, sundat kryt a spravit vesmír vlastníma rukama, tím, co je zrovna po ruce. Bez záruky, bez linky, bez někoho, komu zavolat. Odteď je to tvoje.",
      "Break the seal, take the cover off and fix the universe with your own hands and whatever is in reach. No warranty, no hotline, nobody left to call. From now on it is yours.",
    ),
    epilogue: t(
      "Sloupneš nálepku s nápisem UVNITŘ NEJSOU ČÁSTI OPRAVITELNÉ UŽIVATELEM. Nestane se nic, a nic děsivějšího žádná nálepka nikdy neudělala. Pak ti Demirci podá roli izolepy a první proužek přijde přes jistič GRAVITACE, hned vedle toho zešedlého, co tam už byl. Čekací melodie zmlkne. Do ticha se ozve KIPP: „No. Tak teď je to náš problém.“ Zní skoro spokojeně. Nedodělky jsou tvoje.",
      "You peel off the sticker that says NO USER-SERVICEABLE PARTS INSIDE. Nothing happens, which is the most frightening thing a sticker has ever done. Then Demirci hands you a roll of tape, and the first strip goes across the GRAVITY breaker, next to the grey one that was already there. The hold music stops. Into the silence KIPP says: \"Well. Now it is our problem.\" It sounds almost pleased. The Backlog is yours.",
    ),
  },
  {
    id: "stay_on_hold",
    title: t("Eskalovat na Předchozí vedení", "Escalate to Previous Management"),
    text: t(
      "Poslat požadavek číslo jedna o patro výš, těm, kdo tohle všechno postavili. Někdo tu smlouvu podepsal. Někdo by to měl zvednout.",
      "Send ticket number one upstairs, to whoever built all this. Somebody signed that contract. Somebody ought to pick up.",
    ),
    epilogue: t(
      "Přepážka dlouho hučí. Pak přijde odpověď, starší než papír, na který se tiskne: „Děkujeme za vaši zprávu. Jsme mimo kancelář a datum návratu není stanoveno. V naléhavých případech se obraťte na vedoucího údržby.“ Pod tím se čerstvým inkoustem právě vyplňuje jméno. Je tvoje. Kapitánka Halloranová ti nakoukne přes rameno a zasalutuje, jen trochu z legrace. K takovému povýšení patří předávací protokol. Tím protokolem jsou Nedodělky.",
      "The desk hums for a long time. Then a reply arrives, older than the paper it is printed on: \"Thank you for your message. We are out of the office with no planned date of return. For urgent matters, please contact the Head of Maintenance.\" Underneath, in fresh ink, a name is being filled in. It is yours. Captain Halloran reads it over your shoulder and salutes, only slightly joking. A promotion like that comes with a handover file. The file is the Backlog.",
    ),
  },
  {
    id: "hang_up",
    title: t("Uzavřít: „To není závada, to je vlastnost“", "Close as \"Works as Designed\""),
    text: t(
      "Nic tu není rozbité. Je to jen staré, a staré to mělo být od začátku. Označit požadavek za vyřešený, nechat záruku důstojně doběhnout a starat se dál, protože se ti chce.",
      "Nothing here is broken. It is old, and it was always meant to get old. Mark the ticket resolved, let the warranty run out with dignity, and keep looking after things anyway, because you want to.",
    ),
    epilogue: t(
      "Do kolonky „řešení“ napíšeš jedinou větu. Přepážka ji zvažuje déle, než hoří kterákoli hvězda. Pak se požadavek uzavře s tichým spokojeným cvaknutím a čekací melodie po čtyřiceti letech, a po mnohem delší době před nimi, dohraje svých jedenáct tónů a skončí. Odteď už není zaručeno nic. Hvězdy svítí dál. „Bez záruky,“ poznamená KIPP, „jako všechno, co stojí za to si nechat.“ Vzápětí se naráz znovu otevřou čtyři miliony menších požadavků. To jsou Nedodělky. Nikdo tě nenutí. Sáhneš po tom prvním.",
      "You type one sentence into the resolution field. The desk considers it for longer than any star has burned. Then the ticket closes with a small, satisfied click, and the hold music, after forty years and a great deal longer before that, plays its eleven notes one last time and stops. Nothing is guaranteed any more. The stars shine regardless. \"Unwarranted,\" says KIPP, \"like everything worth keeping.\" Then four million smaller tickets reopen at once. That is the Backlog. Nobody is making you. You pick up the first one.",
    ),
  },
];

const ticket = (n: number, titleCs: string, titleEn: string, cs: string, en: string): BacklogTicketDef => ({
  id: `bl_${String(n).padStart(2, "0")}`,
  title: t(titleCs, titleEn),
  text: t(cs, en),
});

export const backlogTickets: BacklogTicketDef[] = [
  ticket(1, "Úterý vrže", "Tuesday squeaks", "Nahlásilo několik civilizací. Občasné vrzání v úterý, odpoledne se zhoršuje. Předchozí technik omylem namazal pondělí.", "Reported by several civilisations. Intermittent squeak on Tuesdays, worse in the afternoon. The previous technician oiled Monday by mistake."),
  ticket(2, "Hvězda v řadě devět bliká", "Star in row nine flickers", "Nejspíš startér. Nejdřív zkontrolujte žárovku. Do žárovky se nedívejte.", "Probably the starter. Check the bulb first. Do not look directly at the bulb."),
  ticket(3, "Příliv chodí na lichých světech dřív", "Tide arrives early on alternate worlds", "Místní se přizpůsobili tím, že chodí pozdě. Opravte příliv, nebo jízdní řád, podle toho, co vyjde levněji.", "The locals have adapted by being late. Fix the tide or the timetable, whichever is cheaper."),
  ticket(4, "Gravitace u schodů trochu lepí", "Gravity slightly sticky near the stairs", "Zákazník uvádí, že mu to cestou dolů nevadí. Cestou nahoru ano. Odmastit a přezkoušet jablkem.", "Customer reports it is fine on the way down. Not on the way up. Degrease and test with an apple."),
  ticket(5, "Ozvěna přichází dřív než výkřik", "Echo arrives before the shout", "Kosmetická vada. Nízká priorita. Zákazníkovi to připadá nezdvořilé.", "Cosmetic. Low priority. The customer finds it rude."),
  ticket(6, "Někdo nechal běžet černou díru", "Black hole left running", "Měřidlo ukazuje nepřetržitý odběr od instalace. Zjistěte, kdo to platí.", "The meter shows continuous consumption since installation. Find out who is paying for this."),
  ticket(7, "Pohřešuje se: ořech 10 mm", "Missing: one 10 mm socket", "Zadal: skladník Křepelka. Stav: nalezeno, zadavateli nesdělovat. Uzavřít potichu.", "Opened by: Quartermaster Křepelka. Status: found, do not inform the requester. Close quietly."),
  ticket(8, "Mlhovinu je potřeba oprášit", "Nebula needs dusting", "Naposledy oprášeno: nikdy. Použijte jemný štětec. Ten druhý jemný štětec.", "Last dusted: never. Use the soft brush. The other soft brush."),
  ticket(9, "Konstanta nedrží hodnotu", "Constant is not constant", "Číslo pí vychází ve čtvrtek v sektoru 12 na 3,15. Překalibrujte, nebo přeznačte na „přibližně“.", "Pi reads 3.15 on Thursdays in sector 12. Recalibrate, or relabel it \"approximately\"."),
  ticket(10, "Světlo se v chodbě B loudá", "Light too slow in corridor B", "Personál si stěžuje, že dorazí na místo dřív, než vidí, kam jde. Promazat, případně vyměnit.", "Staff complain of arriving before they can see where they are going. Lubricate, or replace."),
  ticket(11, "Planeta se točí na špatnou stranu", "Planet rotates the wrong way", "Obyvatelé trvají na tom, že to tak bylo vždycky. Obyvatelé nemají kvalifikaci. Ověřte podle výkresu.", "The inhabitants insist it has always been like that. The inhabitants are not qualified. Check it against the drawing."),
  ticket(12, "Déjà vu nahlášeno dvakrát", "Déjà vu reported twice", "Duplicitní požadavek. Viz duplicitní požadavek.", "Duplicate ticket. See duplicate ticket."),
  ticket(13, "Dovnitř uniká vakuum", "Vacuum leaking in", "Těsnění dosloužilo. Izolepa od předchozí směny drží. Datum na izolepě: nečitelné.", "The seal has perished. Tape applied by the previous shift is holding. Date on the tape: illegible."),
  ticket(14, "Kometa má zpoždění", "Comet overdue", "Měla se vrátit před šesti sty lety. Pošlete upomínku. Pošlete druhou upomínku. Naúčtujte poplatek z prodlení.", "It was due back six hundred years ago. Send a reminder. Send a second reminder. Charge the late fee."),
  ticket(15, "Zaseknutý východ slunce", "Sunrise jammed", "Na jednom malém měsíci už deset let visí na „skoro“. Nájemníky nebaví pořád jen doufat. Pořádně do toho klepněte.", "Stuck at \"nearly\" on one small moon for ten years. The tenants are tired of being hopeful. Give it a firm tap."),
  ticket(16, "Časové pásmo namontované obráceně", "Time zone fitted upside down", "Nahoře je včera a dole zítra. Otočte o 180 stupňů. Šroubky si schovejte.", "It is yesterday at the top and tomorrow at the bottom. Rotate by 180 degrees. Keep the screws."),
  ticket(17, "Žádost o více pátků", "Request for more Fridays", "Podáno čtyřicetmilionkrát. Rozpočet to neumožňuje. Odpovězte standardní omluvou, formulář 5-P.", "Submitted forty million times. The budget does not allow it. Reply with the standard apology, form 5-F."),
  ticket(18, "Divný zápach ve skříni s ročními obdobími", "Odd smell in the season cupboard", "Podzim někdo uskladnil vedle něčeho vlhkého. Před dalším použitím vyvětrejte.", "Somebody stored autumn next to something damp. Air it out before the next use."),
  ticket(19, "Pás asteroidů je povolený", "Asteroid belt too loose", "Utáhněte o dvě dírky. Nepřetahujte, viz požadavek „Prstenec, prasklý“.", "Tighten by two notches. Do not overtighten, see the ticket \"Ring system, cracked\"."),
  ticket(20, "Prstenec, prasklý", "Ring system, cracked", "Příčina: přetažení. Viz výše. Lepidlo je ve třetím šuplíku.", "Cause: overtightening. See above. The glue is in the third drawer."),
  ticket(21, "Roste entropie", "Entropy increasing", "Známý problém. Nejedná se o závadu. Znovu neotvírat. (Znovu otevřeno devětmiliardkrát.)", "Known issue. Works as designed. Do not reopen. (Reopened nine billion times.)"),
  ticket(22, "Čekací melodie všem uvízla v hlavě", "Hold music stuck in everybody's head", "Týká se všech sektorů. Oprava se neplánuje. Doporučené řešení: naučit se druhou sloku.", "Affects all sectors. No fix is planned. Suggested workaround: learn the second verse."),
  ticket(23, "Skvrna od kávy na mapě je skutečné místo", "Coffee stain on the chart is a real place", "Navigátor Lindqvist hlásí, že skvrna už má obyvatele a ti by se rádi zaregistrovali. Vydejte formuláře.", "Navigator Lindqvist reports that the stain now has a population, and they would like to register. Issue the forms."),
  ticket(24, "Měsíc doručen na špatnou adresu", "Moon delivered to the wrong address", "Příjemce k němu přilnul a odmítá ho vrátit. Původní zákazník má dál objednaný příliv.", "The recipient has grown attached and refuses to return it. The original customer still has tides on order."),
  ticket(25, "Na slunci chybí výstražný štítek", "Warning label missing from the sun", "Text štítku: HORKÉ. Vyměňujte každých pět miliard let, nebo jakmile vybledne.", "The label reads: HOT. Replace every five billion years, or when faded."),
  ticket(26, "V evidenci nesedí temná hmota", "Dark matter does not add up", "Podle inventury jí má být pětkrát víc, než kolik jsme našli. Skladník to odmítá podepsat. Přepočítejte.", "The inventory shows five times more than we can find. The quartermaster refuses to sign. Count again."),
  ticket(27, "Z červí díry táhne", "Wormhole is draughty", "Nalepte těsnění. Vzdálený konec při nepoužívání zavírejte.", "Fit a draught excluder. Keep the far end closed when not in use."),
  ticket(28, "Rozměr na liché ponožky je plný", "Odd-sock dimension is full", "Sklad je na hranici kapacity. Zahajte vracení. Začněte tou nejstarší ponožkou.", "Storage is at capacity. Begin returning items. Start with the oldest sock."),
  ticket(29, "V nákladním listu je zase koza", "Goat on the manifest again", "Kapitánka Halloranová všechno popírá. Koza už dostala bundu. Upravte počet členů oddělení.", "Captain Halloran denies everything. The goat has been issued a jacket. Update the department headcount."),
  ticket(30, "Gertruda žádá o odvápnění", "Gertrude requests descaling", "Prioritu určila kuchařka: jedna. Tedy vyšší než gravitace. Nediskutujte.", "Priority set by the cook: one. That is higher than gravity. Do not argue."),
  ticket(31, "Vrzající oběžná dráha", "Squeaky orbit", "Třetí planeta od slunce. Namažte v přísluní. Vezměte si rukavice.", "Third planet out. Apply grease at perihelion. Wear gloves."),
  ticket(32, "Vesmír při chladnutí tiká", "Universe ticks as it cools", "U tohoto modelu běžné. Zákazník uklidněn. Zákazník neuklidněn. Uklidněte ho znovu.", "Normal for this model. Customer reassured. Customer not reassured. Reassure again."),
  ticket(33, "Drobné písmo je příliš drobné", "Fine print too fine", "Článek dvanáct se dá přečíst jen dalekohledem. Právní oddělení tvrdí, že je to záměr. Právní oddělení je mimo kancelář.", "Clause twelve can only be read through a telescope. Legal says this is intentional. Legal is out of the office."),
  ticket(34, "Někdo nechal zapnutou noc", "Night left on", "Polární oblast hlásí šest měsíců tmy. Najděte vypínač. Nejspíš je za nějakou skříní.", "The polar region reports six months of dark. Find the switch. It is probably behind a cupboard."),
  ticket(35, "Vyčkejte, prosím", "Please hold", "Volající čeká déle, než existuje evidence požadavků. Zvedněte to. Omluvte se. A myslete to vážně.", "The caller has been waiting since before the ticket system existed. Pick up. Say sorry. Mean it."),
];

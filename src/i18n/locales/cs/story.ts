// "story" namespace (cs). Owned by one agent, see docs/ARCHITECTURE.md. Keys must match the other language.
// Story overlay chrome: beats, chapter cards, the ending choice and the first-run intro.
const story = {
  continue: "Pokračovat",
  skip: "Přeskočit",
  tapToContinue: "Klepni a pokračuj",
  chapter: "Kapitola {{n}}",
  chapterBeat: "Kapitola {{chapter}} · {{n}}/{{total}}",
  speaker: {
    kipp: "KIPP",
    signal: "Signál",
    log: "Lodní záznam",
    narrator: "Mezitím",
    crew: "Posádka",
  },
  ending: {
    title: "Tiket číslo jedna",
    epilogue: "Vyřízeno",
    intro: "Přepážka čeká na odpověď. Signál vyhrává svoji melodii a někdo ti konečně zvedl telefon. Co jim řekneš?",
    choose: "Tohle",
    confirm: "Opravdu. Potvrdit",
    final: "Odpověď je konečná. Hra pokračuje dál.",
    later: "Ještě si to rozmyslím",
    backlog: "Otevřít Nedodělky",
  },
  intro: {
    cryoKicker: "Kryokomora 3 · údržba",
    cryoLcd: "DOBRÉ RÁNO",
    cryoWarn: "BUDÍČEK SE OPOZDIL O 14 600 DNÍ · OMLOUVÁME SE ZA ZPŮSOBENÉ NEPOHODLÍ · KÁVA NENÍ K DISPOZICI",
    cryoText: "Víko kryokomory se s nechutí odsune. Je ti zima, bolí tě všechno a na lodi je ticho, jaké na lodi nikdy být nemá. Remorkér S.S. Gaffer driftuje. Někam.",
    note: "„Hned jsme zpátky. 5 minut.“",
    noteSign: "Posádka. Podle prachu na lepicí pásce tak před čtyřiceti lety.",
    noteText: "Vzkaz visí na dveřích můstku. Skafandry jsou pryč, raketoplán je pryč a v dřezu stojí hrnek, který si mezitím vyvinul vlastní ekosystém.",
    kippRole: "Lodní počítač přes pohon a potrubí",
    kippLine: "„Á, inženýr třetí třídy. Vítej zpátky. Shrnu to: posádka nikde, záruka propadlá, trup drží hlavně ze zvyku a někdo nám pořád volá. Navrhuju začít těžbou. Tu aspoň umíme.“",
    badgeTitle: "Služební průkaz",
    nameLabel: "Jméno inženýra",
    shipLabel: "Jméno lodi",
    renameHint: "Můžeš to nechat být. KIPP ti stejně bude říkat po svém.",
    skip: "Přeskočit",
    start: "Nastoupit na směnu",
  },
} as const;

export default story;

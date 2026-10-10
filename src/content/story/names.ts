import type { ContentDB } from "@/engine/types";
import { t } from "./util";

// Syllable tables for procedural names. Everything here is language-neutral (no diacritics, no
// letters that read very differently in Czech and English) except `stationWords`.
// Shape rules so that any combination stays pronounceable:
//   systemA  ends in a single consonant     systemB  vowel-consonant-vowel
//   systemC  consonant-vowel-consonant      => A+B, A+C, A+B+C all work
//   faunaA / floraA end in a consonant, faunaB / floraB start with a vowel
// Crew surnames are forms that do not change with gender in their own language, because first and
// last names are paired at random.

export const names: ContentDB["names"] = {
  systemA: [
    "Brak", "Dol", "Fen", "Gor", "Hal", "Ked", "Lum", "Mar", "Nev", "Osen", "Pel", "Rud", "Sab", "Tal", "Ul", "Vas", "Zel", "Bel", "Dun",
    "Fal", "Gim", "Hov", "Kal", "Lod", "Nar", "Ob", "Prav", "Ren", "Sul", "Tor", "Um", "Vik", "Zor", "Aren", "Edun", "Ilom", "Oker",
  ],
  systemB: [
    "ava", "edo", "ivu", "omi", "ula", "ane", "eri", "iko", "ora", "uze", "abe", "eko", "ilo", "onu", "ura", "ado", "emi", "ina", "obe",
    "ute", "ali", "eso", "ibu", "olu", "une", "aro", "eva", "izo", "odi", "umi", "ake", "ezu",
  ],
  systemC: [
    "dor", "nor", "tam", "vek", "len", "mut", "zar", "bes", "dim", "rov", "tis", "gar", "pol", "hem", "lok", "nat", "rik", "sen", "bur",
    "dan", "fos", "kel", "mir", "ras", "tul", "zen",
  ],
  planetSuffix: ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "Prima", "Secunda", "Tertia", "Minor", "Major", "b", "c", "d", "e"],
  crewFirst: [
    "Anežka", "Bohdan", "Jitka", "Vojtěch", "Zdeňka", "Radim", "Květa", "Matěj", "Ludmila", "Šimon", "Aiko", "Kenji", "Mei", "Haruto",
    "Amara", "Kwame", "Zainab", "Tunde", "Ngozi", "Sipho", "Priya", "Arjun", "Anika", "Ravi", "Farah", "Omar", "Leila", "Yusra", "Tariq",
    "Ines", "Mateo", "Lucía", "Rafael", "Paloma", "Thiago", "Solveig", "Sven", "Astrid", "Mikko", "Freya", "Niamh", "Declan", "Maeve",
    "Owen", "Greta", "Lukas", "Hanna", "Emil", "Dmitri", "Oksana", "Milan", "Jelena", "Nikos", "Eleni", "Tamar", "Noam", "Min-jun",
    "Soo-ah", "Linh", "Minh", "Kaito", "Talia", "Mose", "Aroha", "Kai", "Nayeli", "Tala", "Ximena", "Ebele", "Otto",
  ],
  crewLast: [
    "Krejčí", "Kočí", "Martinů", "Janků", "Petrů", "Hořejší", "Dolejší", "Jirků", "Pavlů", "Kubů", "Okafor", "Mensah", "Adeleke",
    "Nkosi", "Diallo", "Tanaka", "Sato", "Watanabe", "Kimura", "Nguyen", "Tran", "Pham", "Park", "Choi", "Kang", "Sharma", "Patel",
    "Iyer", "Reddy", "Khan", "Haddad", "Nasser", "Aziz", "Rahimi", "García", "Morales", "Ortega", "Silva", "Costa", "Ferreira", "Rossi",
    "Conti", "Moretti", "Dubois", "Laurent", "Mercier", "Schmidt", "Keller", "Vogel", "Larsen", "Berg", "Nyström", "Virtanen", "Nowak",
    "Horvat", "Kovač", "Popescu", "Yilmaz", "Kaya", "Cohen", "Levi", "O'Brien", "Murphy", "Byrne", "Hughes", "Sinclair", "Abara", "Tui",
    "Parata", "Castellanos", "Quispe", "Mamani", "Begay", "Eze", "Bello", "Mwangi", "Otieno", "Tesfaye",
  ],
  stationWords: [
    t("Depo", "Depot"),
    t("Zastávka", "Waystation"),
    t("Retranslace", "Relay"),
    t("Výspa", "Outpost"),
    t("Dok", "Dock"),
    t("Burza", "Exchange"),
    t("Loděnice", "Yard"),
    t("Terminál", "Terminal"),
    t("Křižovatka", "Junction"),
    t("Kotviště", "Anchorage"),
    t("Lucerna", "Lantern"),
    t("Hnízdo", "Roost"),
    t("Molo", "Pier"),
    t("Uzel", "Hub"),
    t("Tržnice", "Bazaar"),
    t("Útočiště", "Haven"),
    t("Maják", "Lighthouse"),
    t("Azyl", "Refuge"),
    t("Slévárna", "Foundry"),
    t("Sýpka", "Granary"),
    t("Cisterna", "Cistern"),
    t("Plošina", "Platform"),
    t("Celnice", "Customs House"),
    t("Vlečka", "Siding"),
    t("Mýto", "Tollgate"),
    t("Garáž", "Garage"),
    t("Překladiště", "Transfer Yard"),
    t("Závora", "Turnpike"),
  ],
  faunaA: [
    "Grub", "Mop", "Zib", "Trum", "Plun", "Snof", "Blat", "Kres", "Drom", "Flik", "Glob", "Hrun", "Kvad", "Lem", "Mur", "Nuk", "Pib",
    "Ruk", "Skal", "Tep", "Vrum", "Zum", "Brod", "Dub", "Fuf", "Hop",
  ],
  faunaB: [
    "odon", "opod", "ik", "oun", "ura", "ops", "ella", "ius", "ak", "ek", "ix", "ara", "olin", "umba", "eton", "ipes", "ula", "onk",
    "ungo", "adil", "opus", "erin", "imus", "otl", "ivar", "alut",
  ],
  floraA: [
    "Fen", "Lum", "Mos", "Vir", "Sil", "Brin", "Kap", "Tul", "Ros", "Mel", "Lil", "Pin", "Dren", "Kur", "Lup", "Bod", "Kop", "Tern",
    "Luk", "Ver", "Zel", "Lin", "Bez", "Rak", "Sas", "Olm",
  ],
  floraB: [
    "ia", "ium", "ea", "osa", "ula", "anth", "ora", "ina", "avia", "ica", "ella", "ida", "unka", "enka", "ilis", "aca", "idium", "ola",
    "anea", "ifera", "oba", "uta", "etum", "isia", "eria", "orum",
  ],
};

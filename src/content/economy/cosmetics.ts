// Cosmetics. For paint and trail `value` is a key of assets/palette.json; for stickers and toys
// it is the sprite key (same as the id). Nothing here affects the simulation.
import type { CosmeticDef, CosmeticId } from "@/engine/types";
import { byId, t } from "./util";

type Unlock = CosmeticDef["unlock"];
const START: Unlock = { start: true };
const stamps = (n: number): Unlock => ({ stamps: n });
const chapter = (n: number): Unlock => ({ chapter: n });

const cosmetic = (kind: CosmeticDef["kind"], id: CosmeticId, value: string, unlock: Unlock, cs: string, en: string, dcs: string, den: string): CosmeticDef => ({
  id,
  kind,
  name: t(cs, en),
  desc: t(dcs, den),
  value,
  unlock,
});
const sprite = (kind: "sticker" | "toy", id: CosmeticId, unlock: Unlock, cs: string, en: string, dcs: string, den: string): CosmeticDef =>
  cosmetic(kind, id, id, unlock, cs, en, dcs, den);

export const cosmeticList: CosmeticDef[] = [
  cosmetic("paint", "paint_factory", "steel2", START, "Tovární šeď", "Factory Grey", "Barva, ve které loď sjela z linky. Od té doby ji nikdo neumyl.", "The colour it left the line in. Nobody has washed it since."),
  cosmetic("paint", "paint_rust", "rust1", START, "Poctivá rez", "Honest Rust", "Není to nátěr, je to stav. Aspoň ladí se zbytkem lodi.", "Not a paint job, a condition. At least it matches the rest of the ship."),
  cosmetic("paint", "paint_bone", "bone1", stamps(1), "Stará kost", "Old Bone", "Krémová jako přístrojová deska ze zlatých časů.", "Cream, like a dashboard from the good old days."),
  cosmetic("paint", "paint_teal", "teal2", stamps(5), "Hluboká tyrkys", "Deep Teal", "Barva moře, které tvoje loď nikdy neuvidí.", "The colour of a sea your ship will never see."),
  cosmetic("paint", "paint_cobalt", "cobalt1", stamps(15), "Služební modř", "Service Blue", "Vypadá úředně. Celníci salutují, než si všimnou tvého průkazu.", "Looks official. Customs salute before they notice your papers."),
  cosmetic("paint", "paint_hazard", "orange", stamps(40), "Výstražná oranžová", "Hazard Orange", "Aby všichni z dálky věděli, že se blíží potíže.", "So everyone can tell from afar that trouble is on its way."),
  cosmetic("paint", "paint_red", "red1", stamps(100), "Závodní červená", "Racing Red", "Rychlejší loď neudělá. Ale ten pocit.", "It does not make the ship faster. But the feeling."),
  cosmetic("paint", "paint_violet", "violet2", chapter(6), "Fialová mlhovina", "Nebula Violet", "Odstín, který zbyl na trupu po průletu něčím krásným a radioaktivním.", "The shade left on the hull after flying through something beautiful and radioactive."),
  cosmetic("paint", "paint_mint", "mint", chapter(9), "Mentolová", "Fresh Mint", "Svěží barva pro loď, která už dlouho svěže nevoní.", "A fresh colour for a ship that has not smelled fresh in a long time."),

  cosmetic("trail", "trail_plain", "bone0", START, "Obyčejný výfuk", "Plain Exhaust", "Stopa jako každá jiná. Trochu čoudí.", "A trail like any other. Slightly smoky."),
  cosmetic("trail", "trail_amber", "amber", stamps(3), "Jantarová stopa", "Amber Wake", "Teplá záře, jako když někdo zapomněl zhasnout.", "A warm glow, as if somebody left the lights on."),
  cosmetic("trail", "trail_cobalt", "cobalt2", stamps(10), "Ledová stopa", "Ice Wake", "Vypadá studeně a úsporně. Jedno z toho je pravda.", "Looks cold and efficient. One of those is true."),
  cosmetic("trail", "trail_violet", "violet3", stamps(60), "Ozvěna warpu", "Warp Echo", "Fialový dozvuk po každém skoku. Fyzici se hádají, jestli je skutečný.", "A violet afterglow behind every jump. Physicists argue about whether it is real."),
  cosmetic("trail", "trail_yellow", "yellow", stamps(200), "Banánová slupka", "Banana Peel", "Kdo letí za tebou, ten uklouzne. Obrazně. Snad.", "Whoever follows you will slip. Figuratively. Probably."),
  cosmetic("trail", "trail_lime", "lime", chapter(4), "Jedovatá zeleň", "Toxic Lime", "Tohle z trysek lézt nemá. Vypadá to ovšem skvěle.", "This is not supposed to come out of the nozzles. It looks great, though."),
  cosmetic("trail", "trail_red", "red1", chapter(8), "Rudý kouř", "Red Smoke", "Signalizuje nouzi. Nebo styl. Podle situace.", "Signals distress. Or style. Depending on the situation."),

  sprite("sticker", "sticker_patch", START, "Záplata", "Patch Job", "Nálepka ve tvaru záplaty. Pod ní je skutečná záplata.", "A sticker shaped like a patch. There is a real patch under it."),
  sprite("sticker", "sticker_warranty", chapter(1), "Záruka propadla", "Warranty Void", "Nalepeno přes původní plombu. Pro jistotu dvakrát.", "Stuck over the original seal. Twice, to be sure."),
  sprite("sticker", "sticker_kipp", chapter(2), "KIPP tě vidí", "KIPP Is Watching", "Malé oko s úsměvem. KIPP tvrdí, že to není výhrůžka.", "A small eye with a smile. KIPP says it is not a threat."),
  sprite("sticker", "sticker_flying", stamps(2), "Jak lítám?", "How's My Flying?", "Stížnosti volejte na linku. Prosím čekejte.", "Call the hotline to complain. Please hold."),
  sprite("sticker", "sticker_fragile", stamps(8), "Křehké", "Fragile", "Platí pro celou loď. Šipka nahoru je jen doporučení.", "Applies to the entire ship. The arrow pointing up is a suggestion."),
  sprite("sticker", "sticker_hands_off", stamps(25), "Nesahat", "Hands Off", "Lebka se zkříženými klíči. Odradí zloděje i revizní techniky.", "A skull over crossed wrenches. Deters thieves and inspectors alike."),
  sprite("sticker", "sticker_engineer", stamps(50), "Inženýr na palubě", "Engineer on Board", "Varování pro ostatní lodě. Tady se věci opravují za letu.", "A warning to other ships. Things get fixed mid-flight here."),
  sprite("sticker", "sticker_gold_star", chapter(12), "Zlatá hvězdička", "Gold Star", "Za snahu. Dostal jsi ji od KIPPa a už o tom nikdy nepadne ani slovo.", "For effort. KIPP gave it to you and neither of you will ever mention it."),

  sprite("toy", "toy_dice", START, "Plyšové kostky", "Fuzzy Dice", "Houpou se při každém skoku. Padá na nich pořád totéž.", "They swing with every jump. They always roll the same."),
  sprite("toy", "toy_bobble", chapter(3), "Kývací KIPP", "Bobblehead KIPP", "Přikyvuje všemu, co řekneš. Skutečný KIPP to nedělá nikdy.", "Nods at everything you say. The real KIPP never does."),
  sprite("toy", "toy_cactus", stamps(5), "Kaktus Karel", "Carl the Cactus", "Jediný člen posádky, který nepotřebuje kávu ani pochvalu.", "The only crew member who needs neither coffee nor praise."),
  sprite("toy", "toy_duck", stamps(20), "Kachnička na palubce", "Dashboard Duck", "Dívá se dopředu a mlčí. Nejlepší navigátor, jakého jsi kdy měl.", "Looks ahead and says nothing. The best navigator you ever had."),
  sprite("toy", "toy_globe", chapter(7), "Sněžítko s remorkérem", "Tug Snow Globe", "Uvnitř je malá loď v bouři třpytek. Nápadně podobná té tvojí.", "A tiny ship inside a glitter storm. Looks suspiciously like yours."),
  sprite("toy", "toy_cat", stamps(75), "Mávající kočka", "Waving Cat", "Mává pro štěstí. Baterie jí nikdy nedojde a nikdo neví proč.", "Waves for luck. Its battery never runs out and nobody knows why."),

  // Rewards of achievements (src/content/story/achievements.ts); granted by the engine, never bought.
  cosmetic("sticker", "ach_sticker_1", "ach_sticker_1", { achievement: "ach_salvage_2500" }, "Nálezné", "Finders Keepers", "Samolepka pro ty, kdo seberou všechno, co se vznáší.", "A sticker for people who pick up anything that floats."),
  cosmetic("sticker", "ach_sticker_2", "ach_sticker_2", { achievement: "ach_tapeUsed_1000" }, "Drží to páska", "Held by Tape", "Oficiální uznání nosné funkce lepicí pásky.", "Official recognition of tape as a structural material."),
  cosmetic("sticker", "ach_sticker_3", "ach_sticker_3", { achievement: "ach_codex_500" }, "Vše zapsáno", "All Catalogued", "Pět set záznamů a pořád žádný rejstřík.", "Five hundred entries and still no index."),
  cosmetic("sticker", "ach_sticker_4", "ach_sticker_4", { achievement: "ach_warps_1" }, "Vyřízeno", "Closed: Resolved", "Razítko, na které vesmír čekal čtyřicet let.", "The stamp the universe waited forty years for."),
  cosmetic("paint", "ach_paint_1", "yellow", { achievement: "ach_craftsT4_5" }, "Stavbyvedoucí žlutá", "Foreman Yellow", "Barva lidí, kteří ukazují na věci a říkají, kam mají přijít.", "The colour of people who point at things and say where they go."),
  cosmetic("paint", "ach_paint_2", "bone2", { achievement: "ach_modulesPristine_10" }, "Výstavní bílá", "Showroom White", "Čistá tak, že se bojíš na ni sáhnout. Vydrží týden.", "So clean you are afraid to touch it. It will last a week."),
  cosmetic("paint", "ach_paint_3", "lime", { achievement: "ach_minigamesPerfect_100" }, "Bezchybná limetka", "Flawless Lime", "Pro ruce, které se netřesou. Nebo se třesou ve správném rytmu.", "For hands that do not shake. Or shake in the right rhythm."),
  cosmetic("paint", "ach_paint_4", "violet3", { achievement: "ach_depthMax_40" }, "Světlo jádra", "Core Light", "Odstín, který má obloha tam, kde končí mapa.", "The shade the sky has where the map runs out."),
];

export const cosmetics: Record<CosmeticId, CosmeticDef> = byId(cosmeticList);

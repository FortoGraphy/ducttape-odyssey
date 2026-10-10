// Planet biomes. `resources` are the raw items a planet of this biome can hold (the generator
// picks 2-3), `special` is the pool for its optional special resource (probes and outposts).
// `palette` is five keys of assets/palette.json: deep, dark, mid, light, accent.
import type { BiomeDef, BiomeId, HazardKind, ItemId, L10n } from "@/engine/types";
import { byId, t } from "./util";

const biome = (
  id: BiomeId,
  shader: BiomeDef["shader"],
  hazards: HazardKind[],
  resources: ItemId[],
  special: ItemId[],
  palette: [string, string, string, string, string],
  cs: string,
  en: string,
  desc: L10n[],
): BiomeDef => ({ id, name: t(cs, en), desc, hazards, resources, special, palette, shader });

export const biomeList: BiomeDef[] = [
  biome("barren", "rock", ["debris"], ["silicates", "ferrite", "carbon"], ["conductite"], ["steel0", "steel1", "steel2", "steel3", "bone0"], "Pustina", "Barren Rock", [
    t("Kámen, prach a ticho. Nic tu nežije a nic tu nikomu nechybí.", "Rock, dust and silence. Nothing lives here and nothing is missed."),
    t("Povrch posetý krátery. Každý z nich je něčí špatný den.", "A surface covered in craters. Each one was somebody's bad day."),
    t("Šedá koule bez atmosféry. Ideální místo na těžbu a na přemýšlení o životě.", "A grey ball with no atmosphere. Ideal for mining and for thinking about your life."),
  ]),
  biome("cinder", "lava", ["heat"], ["sulfur", "ferrite", "silicates"], ["lumite"], ["rust0", "rust1", "red1", "orange", "yellow"], "Výheň", "Cinder World", [
    t("Řeky lávy a nebe barvy rozžhaveného plechu. Přistávat jen nakrátko.", "Rivers of lava under a sky the colour of hot sheet metal. Land briefly, if at all."),
    t("Planeta, která ještě nevychladla a nevypadá, že by to měla v plánu.", "A planet that has not cooled down yet and shows no intention to."),
    t("Sopky tu chrlí síru a železo. Sondy se vracejí opálené.", "Volcanoes spew sulfur and iron. Probes come back with a tan."),
  ]),
  biome("glacier", "ice", ["cold"], ["ice", "hydrogen", "brine"], ["helium3"], ["cobalt0", "teal1", "cobalt2", "bone1", "mint"], "Ledovec", "Glacier World", [
    t("Led až k obzoru a pod ním další led. Voda tu nikdy nebyla problém.", "Ice to the horizon, and more ice underneath. Water was never the problem here."),
    t("Tak chladno, že i KIPP navrhuje vzít si svetr.", "So cold that even KIPP suggests a sweater."),
    t("Zmrzlý oceán s prasklinami, ze kterých stoupá pára. Něco tam dole je teplé.", "A frozen ocean with cracks that breathe steam. Something down there is warm."),
  ]),
  biome("dunes", "desert", ["heat", "storm"], ["silicates", "conductite", "ferrite"], ["xenon"], ["rust0", "rust1", "amber", "bone0", "yellow"], "Duny", "Dune Sea", [
    t("Písek, vítr a další písek. Dostane se do všeho, hlavně do ložisek.", "Sand, wind and more sand. It gets into everything, bearings above all."),
    t("Duny se tu stěhují rychleji, než je mapa stíhá zakreslit.", "The dunes move faster than the map can keep up."),
    t("Pod pískem leží žíly konduktitu. Nad pískem leží hlavně písek.", "Veins of conductite lie beneath the sand. Above the sand, there is mostly sand."),
  ]),
  biome("ocean", "ocean", ["storm"], ["brine", "organics", "hydrogen"], ["conductite"], ["void3", "cobalt0", "cobalt1", "cobalt2", "mint"], "Oceán", "Water World", [
    t("Samá voda, žádný břeh. Slaná, hluboká a překvapivě obydlená.", "All water, no shore. Salty, deep and surprisingly inhabited."),
    t("Vlny vysoké jako stanice. Sondy plavou, občas i správným směrem.", "Waves as tall as a station. Probes float, sometimes in the right direction."),
  ]),
  biome("overgrowth", "rock", ["toxic"], ["organics", "carbon", "brine"], ["lumite"], ["green0", "teal0", "green1", "lime", "yellow"], "Džungle", "Overgrowth", [
    t("Zelená od pólu k pólu. Všechno tu roste, kvete a zkouší tě ochutnat.", "Green from pole to pole. Everything grows, blooms and tries to taste you."),
    t("Rostliny tu rostou tak rychle, že je slyšet praskání. Výsadky nosí mačety.", "Plants grow fast enough to hear them creak. Away teams carry machetes."),
    t("Vzduch je hustý, vlhký a voní po něčem, co tě asi chce sníst.", "The air is thick, humid and smells of something that probably wants to eat you."),
  ]),
  biome("gas_giant", "gas", ["storm"], ["hydrogen", "helium3"], ["xenon"], ["violet0", "rust1", "amber", "bone0", "bone2"], "Plynný obr", "Gas Giant", [
    t("Pruhovaná koule plynu bez povrchu. Přistát se nedá, čerpat ano.", "A striped ball of gas with no surface. You cannot land, but you can siphon."),
    t("Bouře větší než celé planety, které se točí už tisíce let.", "Storms bigger than whole planets, turning for thousands of years."),
    t("Vodík, kam se podíváš. Nádrž by se tu plnila sama, kdyby to fyzika dovolila.", "Hydrogen wherever you look. The tank would fill itself, if physics allowed."),
  ]),
  biome("storm_giant", "gas", ["storm", "radiation"], ["hydrogen", "helium3", "xenon"], ["antimatter"], ["void2", "cobalt0", "cobalt1", "violet3", "yellow"], "Bouřný obr", "Storm Giant", [
    t("Blesky tu svítí i na noční straně. V horních vrstvách se rodí stopy antihmoty.", "Lightning lights up even the night side. Traces of antimatter form in the upper layers."),
    t("Modrý obr s magnetickým polem, které maže paměťové karty na dálku.", "A blue giant with a magnetic field that wipes memory cards at a distance."),
  ]),
  biome("acid_marsh", "toxic", ["toxic"], ["sulfur", "organics", "brine"], ["strange_dust"], ["green0", "teal1", "green1", "lime", "yellow"], "Kyselé močály", "Acid Marsh", [
    t("Bublající bažiny, které rozpustí botu za jedno odpoledne.", "Bubbling swamps that dissolve a boot in an afternoon."),
    t("Prší tu kyselina. Místní život si z toho nic nedělá, tvůj trup ano.", "It rains acid. The local life does not mind; your hull does."),
    t("Žlutozelená mlha, ve které se ztratí sonda, kompas i dobrá nálada.", "A yellow-green haze that swallows probes, compasses and good moods."),
  ]),
  biome("crystal", "crystal", ["radiation"], ["lumite", "silicates", "conductite"], ["voidglass"], ["violet0", "violet1", "violet2", "violet3", "mint"], "Krystalová pláň", "Crystal Flats", [
    t("Krystaly vysoké jako věže, které v noci tiše zpívají.", "Crystals tall as towers that sing quietly at night."),
    t("Celá planeta se třpytí. Skener je z toho nadšený, oči o něco méně.", "The whole planet glitters. The scanner loves it; your eyes, less so."),
    t("Lumit tu roste ze země jako plevel. Radiace taky.", "Lumite grows out of the ground like weeds. So does the radiation."),
  ]),
  biome("wreck_field", "rock", ["debris"], ["scrap", "ferrite", "conductite"], ["antimatter"], ["void2", "steel0", "steel1", "rust1", "amber"], "Vrakoviště", "Wreck Field", [
    t("Svět pohřbený pod vrstvou cizích lodí. Někdo tu kdysi hodně prohrál.", "A world buried under a layer of other people's ships. Somebody lost badly here, once."),
    t("Šrot, kam oko dohlédne. Některé reaktory ještě slabě svítí.", "Scrap as far as the eye can see. Some of the reactors still glow faintly."),
    t("Hřbitov lodí. Rezaví sem jezdí na výlety.", "A graveyard of ships. The Rustborn come here on day trips."),
  ]),
  biome("fungal", "toxic", ["toxic", "cold"], ["organics", "carbon", "sulfur"], ["lumite"], ["violet0", "violet1", "red0", "violet3", "lime"], "Houbový svět", "Fungal World", [
    t("Houby velké jako sila a výtrusy místo sněhu. Nedýchat, nelízat.", "Mushrooms the size of silos and spores instead of snow. Do not breathe, do not lick."),
    t("Podhoubí tu propojuje celý kontinent. Občas to vypadá, že přemýšlí.", "The mycelium links an entire continent. Sometimes it seems to be thinking."),
  ]),
  biome("salt_flats", "desert", ["heat"], ["brine", "silicates", "sulfur"], ["xenon"], ["steel1", "steel3", "bone0", "bone2", "cobalt2"], "Solná pláň", "Salt Flats", [
    t("Bílá rovina, kde kdysi bývalo moře. Zůstala po něm jen sůl a ticho.", "A white plain where a sea used to be. Only salt and silence are left."),
    t("Tak rovná a tak bílá, že obzor vypadá jako chyba v grafice.", "So flat and so white that the horizon looks like a rendering glitch."),
    t("Sůl křupe pod podvozkem. Rez to slyší a těší se.", "Salt crunches under the landing gear. Rust hears it and looks forward."),
  ]),
  biome("soot", "rock", ["heat", "toxic"], ["carbon", "hydrogen", "sulfur"], ["voidglass"], ["void1", "void3", "steel0", "steel2", "orange"], "Sazový svět", "Soot World", [
    t("Černá planeta pod černým nebem. Uhlíku je tu na tisíc let a na všech filtrech.", "A black planet under a black sky. Enough carbon for a thousand years, and on every filter."),
    t("Všechno je tu pokryté sazemi. Včetně tebe, pět minut po přistání.", "Everything here is coated in soot. You included, five minutes after landing."),
  ]),
  biome("void_scar", "crystal", ["radiation", "cold"], ["voidglass", "carbon", "ice"], ["strange_dust"], ["void0", "void2", "violet1", "violet2", "red1"], "Jizva prázdnoty", "Void Scar", [
    t("Místo, kde se vesmír kdysi natrhl a špatně srostl. Přístroje tu lžou.", "A place where the universe once tore and healed badly. Instruments lie here."),
    t("Černé sklo až k obzoru. Odráží hvězdy, které na nebi nejsou.", "Black glass to the horizon. It reflects stars that are not in the sky."),
    t("Je tu ticho, jaké jinde nenajdeš. Prach se vznáší a občas zamíří proti větru.", "A silence you will not find elsewhere. Dust hangs in the air and sometimes drifts upwind."),
  ]),
];

export const biomes: Record<BiomeId, BiomeDef> = byId(biomeList);

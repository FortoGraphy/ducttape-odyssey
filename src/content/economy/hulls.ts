// Hull classes (prestige layer 2). The first is the starting tug. A class costs rivets once and,
// in every run, its frame megastructure (`hull_frame_<id>`) has to be built at the shipyard.
// `grid` is the tech grid shape; open cells still come from the station shop.
import type { Effect, HullClassDef, HullClassId } from "@/engine/types";
import { byId, t } from "./util";

const hull = (
  id: HullClassId,
  w: number,
  h: number,
  cost: number,
  inheritBlueprints: number,
  effects: Effect[],
  cs: string,
  en: string,
  dcs: string,
  den: string,
): HullClassDef => ({ id, name: t(cs, en), desc: t(dcs, den), sprite: `ship_${id}`, grid: { w, h }, effects, cost, inheritBlueprints });

export const hullList: HullClassDef[] = [
  hull("tug", 3, 3, 0, 0, [], "Remorkér", "Tug", "Malý, otlučený a tvůj. Někdo by řekl vrak, ty říkáš domov.", "Small, dented and yours. Some would say wreck; you say home."),
  hull("hauler", 4, 3, 3, 2, [{ stat: "cargoCap", mul: 1.5 }, { stat: "liftRate", mul: 1.25 }], "Soumar", "Hauler", "Břicho plné nákladu a výtah, který se nezadýchá. Náklad ×1,5, výtah ×1,25.", "A belly full of cargo and a lift that never gets winded. Cargo x1.5, lift x1.25."),
  hull("prospector", 4, 4, 8, 4, [{ stat: "mineRate", mul: 1.4 }, { stat: "activeMult", add: 0.5 }, { stat: "heatRate", mul: 0.85 }], "Prospektor", "Prospector", "Loď postavená kolem laseru. Těžba ×1,4, silnější ruční těžba a chladnější hlaveň.", "A ship built around a laser. Mining x1.4, stronger hold-to-mine and a cooler barrel."),
  hull("clipper", 5, 4, 20, 6, [{ stat: "jumpCharge", mul: 1.6 }, { stat: "fuelUse", mul: 0.7 }, { stat: "scanSpeed", mul: 1.3 }], "Klipr", "Clipper", "Štíhlý trup pro ty, kdo chtějí být u jádra první. Rychlejší skoky, menší spotřeba, bystřejší skener.", "A slim hull for those who want to reach the core first. Faster jumps, less fuel, a keener scanner."),
  hull("bulwark", 5, 5, 50, 8, [{ stat: "hullMax", mul: 2 }, { stat: "shield", mul: 0.75 }, { stat: "wearRate", mul: 0.85 }], "Bašta", "Bulwark", "Tolik pancíře, že události zdvořile klepou. Dvojnásobný trup, menší škody, pomalejší opotřebení.", "So much armour that events knock politely. Double hull, less damage, slower wear."),
  hull("ark", 6, 5, 120, 10, [{ stat: "crewCap", mul: 1.5 }, { stat: "moraleGain", mul: 1.5 }, { stat: "expeditionLoot", mul: 1.3 }, { stat: "researchRate", mul: 1.25 }], "Archa", "Ark", "Malé město, které letí. Víc posádky, lepší nálada, bohatší výsadky a pilnější laboratoř.", "A small town that happens to fly. More crew, better moods, richer expeditions and a busier lab."),
  hull("colossus", 6, 6, 300, 12, [{ stat: "allProd", mul: 1.5 }, { stat: "powerOut", mul: 1.25 }, { stat: "craftBatch", mul: 1.25 }], "Kolos", "Colossus", "Všeho hodně. Plná mřížka 6×6, veškerá produkce ×1,5 a reaktor, který to utáhne.", "A lot of everything. The full 6x6 grid, all production x1.5 and a reactor that can carry it."),
];

export const hulls: Record<HullClassId, HullClassDef> = byId(hullList);

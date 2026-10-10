// Recipes. The id of an item's primary recipe is the item id; alternates are `<item>_<variant>`.
// Amounts are per batch unit: the station's batch size multiplies inputs and outputs alike.
// Module instances never return to the inventory, so no recipe takes a module as an input: higher
// marks are built from higher component layers instead.
import type { CraftStationId, DeckId, ItemId, RecipeDef, RecipeId } from "@/engine/types";
import { byId } from "./util";

type Unlock = RecipeDef["unlock"];
type Byproduct = NonNullable<RecipeDef["byproducts"]>[number];
type Bag = Record<ItemId, number>;

const START: Unlock = { start: true };
const BLUEPRINT: Unlock = { blueprint: true };
const research = (id: string): Unlock => ({ research: id });
const deck = (id: DeckId, level: number): Unlock => ({ deck: { id, level } });
const chapter = (n: number): Unlock => ({ chapter: n });
const by = (item: ItemId, chance: number, amount = 1): Byproduct => ({ item, amount, chance });

function recipe(
  station: CraftStationId,
  tier: RecipeDef["tier"],
  id: RecipeId,
  time: number,
  inputs: Bag,
  outputs: Bag,
  unlock: Unlock,
  byproducts?: Byproduct[],
): RecipeDef {
  return byproducts ? { id, station, tier, inputs, outputs, byproducts, time, unlock } : { id, station, tier, inputs, outputs, time, unlock };
}

/** T1 at the refinery. */
const refine = (id: RecipeId, time: number, inputs: Bag, outputs: Bag, unlock: Unlock, byproducts?: Byproduct[]): RecipeDef =>
  recipe("refinery", 1, id, time, inputs, outputs, unlock, byproducts);
/** T2 at the fabricator. */
const fab = (id: RecipeId, time: number, inputs: Bag, outputs: Bag, unlock: Unlock, byproducts?: Byproduct[]): RecipeDef =>
  recipe("fabricator", 2, id, time, inputs, outputs, unlock, byproducts);
/** T3 module at the fabricator, always one module per batch. */
const mod = (item: ItemId, time: number, inputs: Bag, unlock: Unlock, byproducts?: Byproduct[]): RecipeDef =>
  recipe("fabricator", 3, item, time, inputs, { [item]: 1 }, unlock, byproducts);
/** T4 megastructure at the workshop. */
const mega = (item: ItemId, time: number, inputs: Bag, unlock: Unlock, byproducts?: Byproduct[]): RecipeDef =>
  recipe("workshop", 4, item, time, inputs, { [item]: 1 }, unlock, byproducts);
/** Consumables and kits at the workshop. */
const shop = (tier: RecipeDef["tier"], id: RecipeId, time: number, inputs: Bag, outputs: Bag, unlock: Unlock, byproducts?: Byproduct[]): RecipeDef =>
  recipe("workshop", tier, id, time, inputs, outputs, unlock, byproducts);

// ---------- T1: refinery --------------------------------------------------------------
// The starter set needs only scrap, ice, silicates, carbon, hydrogen and conductite.

const T1: RecipeDef[] = [
  refine("alloy", 3, { scrap: 3 }, { alloy: 1 }, START, [by("slag", 0.25)]),
  refine("water", 3, { ice: 2 }, { water: 1 }, START),
  refine("glass", 4, { silicates: 3 }, { glass: 1 }, START, [by("slag", 0.2)]),
  refine("fuel", 4, { hydrogen: 2, carbon: 1 }, { fuel: 1 }, START),
  refine("polymer", 4, { carbon: 2, hydrogen: 1 }, { polymer: 1 }, START),
  refine("wire", 4, { conductite: 2, scrap: 1 }, { wire: 2 }, START),
  refine("coolant", 5, { ice: 2, carbon: 1 }, { coolant: 1 }, START),
  refine("slag", 3, { scrap: 1, silicates: 1 }, { slag: 3 }, START),
  refine("ceramic", 5, { silicates: 2, slag: 2 }, { ceramic: 1 }, START),
  refine("oxygen", 5, { water: 2 }, { oxygen: 1 }, deck("refinery", 5), [by("hydrogen", 0.5)]),
  refine("steel", 5, { ferrite: 3, carbon: 1 }, { steel: 1 }, deck("refinery", 8), [by("slag", 0.3)]),
  refine("alloy_ferrite", 4, { scrap: 2, ferrite: 2 }, { alloy: 2 }, deck("refinery", 10), [by("slag", 0.3)]),
  refine("graphite", 5, { carbon: 4 }, { graphite: 1 }, deck("refinery", 12)),
  refine("silicon", 6, { silicates: 4, carbon: 1 }, { silicon: 1 }, deck("refinery", 16), [by("slag", 0.4, 2)]),
  refine("water_brine", 4, { brine: 2 }, { water: 1 }, deck("refinery", 18), [by("salt", 0.35)]),
  refine("solder", 4, { conductite: 1, scrap: 2 }, { solder: 1 }, deck("refinery", 20)),
  refine("glass_slag", 5, { slag: 3, silicates: 1 }, { glass: 1 }, deck("refinery", 22)),
  refine("fiber", 6, { carbon: 3, polymer: 1 }, { fiber: 1 }, deck("refinery", 25)),
  refine("salt", 4, { brine: 3 }, { salt: 1 }, deck("refinery", 30), [by("water", 0.5)]),
  refine("acid", 5, { sulfur: 2, water: 1 }, { acid: 1 }, research("ex_chem")),
  refine("resin", 6, { organics: 2, sulfur: 1 }, { resin: 1 }, research("ex_chem")),
  refine("rubber", 6, { organics: 1, sulfur: 2 }, { rubber: 1 }, research("ex_chem")),
  refine("fertilizer", 5, { organics: 2, brine: 1 }, { fertilizer: 1 }, research("ex_chem")),
  refine("biogel", 7, { organics: 3, water: 1 }, { biogel: 1 }, research("ex_chem"), [by("fertilizer", 0.2)]),
  refine("thermite", 6, { ferrite: 2, sulfur: 1, scrap: 1 }, { thermite: 1 }, research("ex_chem"), [by("slag", 0.3)]),
  refine("cryofluid", 7, { helium3: 2, ice: 1 }, { cryofluid: 1 }, research("ex_cryo"), [by("water", 0.3)]),
  refine("ion_gas", 7, { xenon: 2, hydrogen: 1 }, { ion_gas: 1 }, research("ex_cryo")),
  refine("phosphor", 6, { lumite: 2, silicates: 1 }, { phosphor: 1 }, research("ex_cryo"), [by("slag", 0.25)]),
  refine("darkglass", 8, { voidglass: 2, glass: 1 }, { darkglass: 1 }, research("ex_exotics")),
  refine("am_vial", 8, { antimatter: 2, ceramic: 1 }, { am_vial: 1 }, research("ex_exotics")),
  refine("quiet_dust", 8, { strange_dust: 2, cryofluid: 1 }, { quiet_dust: 1 }, research("ex_exotics")),
  // blueprint alternates
  refine("fuel_he3", 5, { helium3: 1, hydrogen: 3 }, { fuel: 3 }, BLUEPRINT),
  refine("steel_scrap", 6, { scrap: 4, graphite: 1 }, { steel: 2 }, BLUEPRINT, [by("slag", 0.5)]),
  refine("polymer_bio", 5, { organics: 2, hydrogen: 1 }, { polymer: 2 }, BLUEPRINT),
];

// ---------- T2: fabricator ------------------------------------------------------------

const T2: RecipeDef[] = [
  // basic parts: starter set
  fab("circuit", 10, { wire: 2, glass: 1, polymer: 1 }, { circuit: 1 }, START),
  fab("actuator", 12, { alloy: 2, wire: 1, polymer: 1 }, { actuator: 1 }, START),
  fab("plating", 12, { alloy: 3, ceramic: 1 }, { plating: 1 }, START, [by("scrap", 0.3, 2)]),
  fab("lens", 12, { glass: 3, coolant: 1 }, { lens: 1 }, START, [by("slag", 0.15)]),
  fab("power_cell", 12, { alloy: 1, fuel: 2, wire: 1 }, { power_cell: 1 }, START),
  fab("tubing", 10, { polymer: 2, alloy: 1 }, { tubing: 1 }, START),
  // basic parts: fabricator levels
  fab("bearing", 12, { steel: 2, graphite: 1 }, { bearing: 1 }, deck("fabricator", 5), [by("scrap", 0.25)]),
  fab("girder", 14, { steel: 3, alloy: 1 }, { girder: 1 }, deck("fabricator", 8), [by("scrap", 0.25, 2)]),
  fab("heatsink", 14, { alloy: 2, graphite: 2 }, { heatsink: 1 }, deck("fabricator", 10), [by("scrap", 0.2)]),
  fab("coil", 14, { wire: 3, steel: 1 }, { coil: 1 }, deck("fabricator", 12)),
  fab("valve", 14, { steel: 2, alloy: 1, polymer: 1 }, { valve: 1 }, deck("fabricator", 15), [by("scrap", 0.2)]),
  fab("canister", 15, { steel: 2, ceramic: 1, polymer: 1 }, { canister: 1 }, deck("fabricator", 18)),
  fab("nozzle", 15, { ceramic: 2, steel: 1, graphite: 1 }, { nozzle: 1 }, deck("fabricator", 20), [by("slag", 0.3)]),
  fab("tubing_rubber", 10, { rubber: 1, alloy: 1 }, { tubing: 1 }, research("fb_parts")),
  fab("capacitor", 12, { ceramic: 1, wire: 1, salt: 1 }, { capacitor: 1 }, deck("fabricator", 25)),
  // basic parts: research
  fab("gasket", 10, { rubber: 2, polymer: 1 }, { gasket: 2 }, research("fb_parts")),
  fab("filter", 12, { fiber: 2, ceramic: 1 }, { filter: 1 }, research("fb_parts")),
  fab("insulation", 14, { fiber: 1, resin: 1, ceramic: 1 }, { insulation: 1 }, research("fb_parts")),
  fab("glow_tube", 12, { glass: 1, phosphor: 1, wire: 1 }, { glow_tube: 1 }, research("fb_parts")),
  // assemblies
  fab("motor", 16, { coil: 1, bearing: 1, actuator: 1 }, { motor: 1 }, research("fb_assemblies")),
  fab("pump", 18, { motor: 1, tubing: 2, gasket: 1 }, { pump: 1 }, research("fb_assemblies")),
  fab("sensor", 16, { circuit: 1, lens: 1, phosphor: 1 }, { sensor: 1 }, research("fb_assemblies")),
  fab("processor", 18, { circuit: 2, silicon: 2, solder: 1 }, { processor: 1 }, research("fb_assemblies"), [by("silicon", 0.2)]),
  fab("servo", 16, { actuator: 2, circuit: 1, bearing: 1 }, { servo: 1 }, research("fb_assemblies")),
  fab("gyroscope", 18, { bearing: 2, coil: 1, circuit: 1 }, { gyroscope: 1 }, research("fb_assemblies")),
  fab("antenna", 16, { wire: 2, girder: 1, circuit: 1 }, { antenna: 1 }, research("fb_assemblies")),
  // subsystems
  fab("lightguide", 16, { glass: 2, darkglass: 1, polymer: 1 }, { lightguide: 2 }, research("fb_systems")),
  fab("radiator", 18, { heatsink: 2, tubing: 1, cryofluid: 1 }, { radiator: 1 }, research("fb_systems")),
  fab("emitter", 18, { lens: 1, phosphor: 2, capacitor: 1 }, { emitter: 1 }, research("fb_systems")),
  fab("composite", 20, { plating: 2, girder: 1, fiber: 1 }, { composite: 1 }, research("fb_systems"), [by("scrap", 0.3, 3)]),
  fab("battery_pack", 20, { power_cell: 3, capacitor: 1, insulation: 1 }, { battery_pack: 1 }, research("fb_systems")),
  fab("ion_chamber", 20, { canister: 1, ion_gas: 2, coil: 1 }, { ion_chamber: 1 }, research("fb_systems")),
  fab("manipulator", 22, { servo: 2, motor: 1, sensor: 1 }, { manipulator: 1 }, research("fb_systems")),
  fab("bioreactor", 22, { canister: 1, biogel: 2, pump: 1, filter: 1 }, { bioreactor: 1 }, research("fb_systems"), [by("fertilizer", 0.3)]),
  fab("processor_light", 16, { circuit: 1, lightguide: 1, silicon: 1 }, { processor: 1 }, research("fb_systems")),
  // advanced parts
  fab("quantum_chip", 24, { processor: 2, darkglass: 1, quiet_dust: 1 }, { quantum_chip: 1 }, research("fb_advanced")),
  fab("field_coil", 22, { coil: 2, cryofluid: 1, processor: 1 }, { field_coil: 1 }, research("fb_advanced")),
  fab("fusion_cell", 24, { battery_pack: 1, cryofluid: 2, ion_chamber: 1 }, { fusion_cell: 1 }, research("fb_advanced")),
  fab("nanoweave", 22, { fiber: 3, resin: 2, quiet_dust: 1 }, { nanoweave: 1 }, research("fb_advanced")),
  fab("logic_core", 25, { quantum_chip: 1, processor: 2, lightguide: 2 }, { logic_core: 1 }, research("fb_advanced")),
  fab("am_cell", 25, { am_vial: 2, field_coil: 1, canister: 1 }, { am_cell: 1 }, research("fb_exotic")),
  fab("void_lens", 24, { lens: 2, darkglass: 2, emitter: 1 }, { void_lens: 1 }, research("fb_exotic"), [by("glass", 0.3)]),
  fab("grav_plate", 25, { composite: 2, field_coil: 1, quiet_dust: 1 }, { grav_plate: 1 }, research("fb_exotic")),
  fab("warp_coil", 25, { field_coil: 2, am_cell: 1, lightguide: 1 }, { warp_coil: 1 }, research("fb_exotic")),
  // blueprint alternates
  fab("circuit_fine", 10, { silicon: 2, wire: 2, solder: 1 }, { circuit: 2 }, BLUEPRINT),
  fab("power_cell_salt", 12, { salt: 3, alloy: 2, graphite: 1 }, { power_cell: 2 }, BLUEPRINT),
];

// ---------- T3: modules ---------------------------------------------------------------
// Mk I from the starter parts, Mk II from deck-level parts, Mk III from assemblies and subsystems,
// Mk IV adds advanced parts, Mk V is advanced and exotic parts only.

const T3: RecipeDef[] = [
  mod("mod_laser_mk1", 45, { lens: 2, power_cell: 2, actuator: 1 }, START),
  mod("mod_laser_mk2", 60, { lens: 4, heatsink: 2, coil: 2, power_cell: 3 }, research("ex_laser2")),
  mod("mod_laser_mk3", 75, { emitter: 3, radiator: 2, motor: 1, processor: 1 }, research("ex_laser3")),
  mod("mod_laser_mk4", 95, { void_lens: 4, emitter: 8, field_coil: 4, radiator: 6 }, research("ex_laser4")),
  mod("mod_laser_mk5", 120, { void_lens: 20, am_cell: 8, logic_core: 8, field_coil: 16 }, BLUEPRINT),

  mod("mod_engine_mk1", 50, { tubing: 3, power_cell: 2, plating: 1 }, deck("fabricator", 6)),
  mod("mod_engine_mk2", 60, { nozzle: 2, tubing: 4, valve: 2, power_cell: 3 }, research("nv_engine2")),
  mod("mod_engine_mk3", 75, { ion_chamber: 2, nozzle: 4, pump: 2, gyroscope: 1 }, research("nv_engine3")),
  mod("mod_engine_mk4", 95, { fusion_cell: 4, field_coil: 6, ion_chamber: 6, gyroscope: 4 }, research("nv_engine4")),
  mod("mod_engine_mk5", 120, { warp_coil: 12, am_cell: 12, fusion_cell: 12, grav_plate: 8 }, BLUEPRINT),

  mod("mod_shield_mk1", 50, { plating: 4, circuit: 2, power_cell: 1 }, deck("fabricator", 10), [by("scrap", 0.5, 4)]),
  mod("mod_shield_mk2", 60, { plating: 6, coil: 2, capacitor: 3, circuit: 3 }, research("mt_shield2"), [by("scrap", 0.5, 6)]),
  mod("mod_shield_mk3", 75, { composite: 4, battery_pack: 2, emitter: 2, sensor: 2 }, research("mt_shield3")),
  mod("mod_shield_mk4", 95, { field_coil: 8, nanoweave: 6, composite: 10, quantum_chip: 2 }, BLUEPRINT),
  mod("mod_shield_mk5", 120, { grav_plate: 16, field_coil: 24, nanoweave: 24, am_cell: 8 }, BLUEPRINT),

  mod("mod_scanner_mk1", 45, { lens: 3, circuit: 3, actuator: 1 }, deck("bridge", 5)),
  mod("mod_scanner_mk2", 60, { lens: 4, circuit: 4, capacitor: 2, bearing: 2 }, research("sc_scanner2")),
  mod("mod_scanner_mk3", 75, { sensor: 4, antenna: 3, processor: 2, gyroscope: 1 }, research("sc_scanner3")),
  mod("mod_scanner_mk4", 95, { void_lens: 4, quantum_chip: 4, antenna: 10, sensor: 10 }, BLUEPRINT),
  mod("mod_scanner_mk5", 120, { void_lens: 16, logic_core: 12, quantum_chip: 16, warp_coil: 4 }, BLUEPRINT),

  mod("mod_reactor_mk1", 50, { power_cell: 4, plating: 2, circuit: 2 }, deck("reactor", 10)),
  mod("mod_reactor_mk2", 60, { coil: 3, heatsink: 3, canister: 2, power_cell: 4 }, research("fb_reactor2")),
  mod("mod_reactor_mk3", 75, { battery_pack: 3, radiator: 2, pump: 2, processor: 1 }, research("fb_reactor3")),
  mod("mod_reactor_mk4", 95, { fusion_cell: 6, field_coil: 4, radiator: 8, logic_core: 2 }, research("fb_reactor4")),
  mod("mod_reactor_mk5", 120, { am_cell: 20, fusion_cell: 16, warp_coil: 4, logic_core: 8 }, BLUEPRINT),

  mod("mod_cargo_mk1", 45, { plating: 3, tubing: 2, actuator: 2 }, deck("fabricator", 3), [by("scrap", 0.5, 3)]),
  mod("mod_cargo_mk2", 60, { girder: 3, plating: 4, valve: 2, actuator: 3 }, research("lg_cargo2"), [by("scrap", 0.5, 5)]),
  mod("mod_cargo_mk3", 75, { composite: 3, motor: 2, servo: 2, girder: 4 }, research("lg_cargo3")),
  mod("mod_cargo_mk4", 95, { grav_plate: 4, composite: 10, manipulator: 4, motor: 8 }, research("lg_cargo4")),
  mod("mod_cargo_mk5", 120, { grav_plate: 24, warp_coil: 4, logic_core: 8, nanoweave: 20 }, BLUEPRINT),

  mod("mod_repair_mk1", 45, { actuator: 3, circuit: 2, tubing: 1 }, deck("workshop", 3)),
  mod("mod_repair_mk2", 60, { actuator: 4, bearing: 3, valve: 2, circuit: 3 }, research("mt_repair2")),
  mod("mod_repair_mk3", 75, { manipulator: 2, servo: 3, sensor: 2, pump: 1 }, research("mt_repair3")),
  mod("mod_repair_mk4", 95, { manipulator: 8, nanoweave: 4, logic_core: 2, servo: 10 }, BLUEPRINT),
  mod("mod_repair_mk5", 120, { manipulator: 32, logic_core: 12, nanoweave: 20, am_cell: 4 }, BLUEPRINT),

  mod("mod_life_mk1", 45, { tubing: 3, plating: 1, oxygen: 4 }, deck("quarters", 2)),
  mod("mod_life_mk2", 60, { canister: 2, filter: 3, tubing: 4, circuit: 2 }, research("cr_life2")),
  mod("mod_life_mk3", 75, { bioreactor: 2, pump: 2, filter: 4, sensor: 2 }, research("cr_life3")),
  mod("mod_life_mk4", 95, { bioreactor: 8, nanoweave: 6, fusion_cell: 2, quantum_chip: 2 }, BLUEPRINT),
  mod("mod_life_mk5", 120, { bioreactor: 32, grav_plate: 12, fusion_cell: 12, logic_core: 8 }, BLUEPRINT),

  // special modules, blueprint only
  mod("mod_lucky_dice", 60, { polymer: 20, phosphor: 6, quiet_dust: 2 }, BLUEPRINT),
  mod("mod_tow_hook", 60, { girder: 6, motor: 2, coil: 4 }, BLUEPRINT, [by("scrap", 0.5, 6)]),
  mod("mod_coffee_machine", 80, { pump: 2, heatsink: 3, canister: 2, coffee: 50 }, BLUEPRINT),
  mod("mod_bulkhead", 80, { composite: 6, girder: 8, gasket: 10 }, BLUEPRINT, [by("scrap", 0.5, 10)]),
  mod("mod_night_watch", 90, { processor: 4, sensor: 4, battery_pack: 2, antenna: 2 }, BLUEPRINT),
  mod("mod_drone_bay", 90, { girder: 8, servo: 4, antenna: 3, battery_pack: 2 }, BLUEPRINT),
  mod("mod_prism_array", 100, { void_lens: 3, emitter: 6, lightguide: 8, servo: 4 }, BLUEPRINT),
  mod("mod_overclocker", 100, { quantum_chip: 2, radiator: 4, capacitor: 10, processor: 4 }, BLUEPRINT),
];

// ---------- T4: megastructures --------------------------------------------------------

const T4: RecipeDef[] = [
  mega("collector_array", 600, { lens: 1200, girder: 600, battery_pack: 240, radiator: 160, logic_core: 20 }, research("fb_megaprojects")),
  mega("orbital_foundry", 720, { girder: 800, heatsink: 800, manipulator: 160, processor: 160, fusion_cell: 32 }, research("fb_megaprojects"), [by("slag", 1, 800)]),
  mega("deep_drill", 480, { girder: 600, motor: 240, emitter: 160, radiator: 120 }, research("ex_deepcore"), [by("slag", 1, 600)]),
  mega("archive_vault", 600, { processor: 240, lightguide: 400, composite: 160, quantum_chip: 40 }, research("sc_bigscience")),
  mega("wormhole_gate", 900, { girder: 1600, warp_coil: 80, grav_plate: 80, am_cell: 120, logic_core: 60 }, research("nv_gate")),
  mega("signal_dish", 420, { antenna: 320, girder: 400, processor: 160, lightguide: 240 }, chapter(5)),
  mega("shipyard", 900, { girder: 1200, composite: 400, manipulator: 160, logic_core: 40 }, chapter(8), [by("scrap", 0.5, 800)]),
  mega("kipp_backup", 600, { logic_core: 48, quantum_chip: 80, battery_pack: 120, insulation: 320 }, chapter(10)),
  mega("hull_frame_hauler", 300, { girder: 480, plating: 800, valve: 240, motor: 120 }, research("fb_frames"), [by("scrap", 0.5, 320)]),
  mega("hull_frame_prospector", 360, { girder: 600, composite: 240, emitter: 160, radiator: 120 }, research("fb_frames"), [by("scrap", 0.5, 400)]),
  mega("hull_frame_clipper", 420, { girder: 600, composite: 320, ion_chamber: 160, gyroscope: 120 }, research("fb_frames"), [by("scrap", 0.5, 400)]),
  mega("hull_frame_bulwark", 540, { girder: 1000, composite: 600, field_coil: 120, nanoweave: 120 }, research("fb_frames"), [by("scrap", 0.5, 640)]),
  mega("hull_frame_ark", 660, { girder: 1200, composite: 480, bioreactor: 160, nanoweave: 160, grav_plate: 40 }, research("fb_frames"), [by("scrap", 0.5, 800)]),
  mega("hull_frame_colossus", 900, { girder: 2000, grav_plate: 160, warp_coil: 40, logic_core: 80, nanoweave: 320 }, research("fb_frames"), [by("scrap", 0.5, 1200)]),
];

// ---------- consumables and kits: workshop --------------------------------------------

const SUPPLIES: RecipeDef[] = [
  shop(1, "duct_tape", 6, { polymer: 2, slag: 1 }, { duct_tape: 2 }, START),
  shop(1, "coffee", 8, { organics: 2, water: 1 }, { coffee: 4 }, START),
  shop(2, "spare_parts", 15, { actuator: 1, plating: 1, circuit: 1 }, { spare_parts: 2 }, START),
  shop(2, "fuel_cell", 12, { fuel: 4, tubing: 1 }, { fuel_cell: 1 }, START),
  shop(2, "beacon", 15, { circuit: 1, power_cell: 1, glass: 2 }, { beacon: 1 }, START),
  shop(2, "overclock_chip", 18, { circuit: 2, capacitor: 1, coolant: 2 }, { overclock_chip: 1 }, deck("workshop", 10)),
  shop(2, "spare_parts_scrap", 20, { scrap: 30, solder: 2, alloy: 4 }, { spare_parts: 1 }, deck("workshop", 15), [by("slag", 0.5, 4)]),
  shop(2, "fuel_drum", 25, { fuel: 12, canister: 1, valve: 1 }, { fuel_drum: 1 }, chapter(4)),
  shop(1, "weld_rod", 8, { steel: 1, thermite: 1 }, { weld_rod: 2 }, research("mt_supplies")),
  shop(1, "hull_foam", 8, { resin: 2, polymer: 2, oxygen: 1 }, { hull_foam: 1 }, research("mt_supplies")),
  shop(2, "nano_gel", 25, { biogel: 2, processor: 1, quiet_dust: 1 }, { nano_gel: 2 }, research("mt_nanogel")),
  shop(1, "espresso", 8, { coffee: 6, water: 1 }, { espresso: 1 }, research("cr_coffee")),
  shop(1, "comfort_food", 8, { biogel: 2, salt: 1, water: 1 }, { comfort_food: 1 }, research("cr_galley")),
  shop(1, "lucky_sock", 8, { fiber: 2, rubber: 1, quiet_dust: 1 }, { lucky_sock: 1 }, research("cr_galley")),
  shop(1, "drone_oil", 6, { graphite: 2, resin: 1 }, { drone_oil: 2 }, research("lg_drones")),
  shop(1, "flare", 8, { phosphor: 2, thermite: 1 }, { flare: 2 }, research("sc_fieldkit")),
  shop(1, "brain_snack", 8, { biogel: 1, phosphor: 1, coffee: 3 }, { brain_snack: 1 }, research("sc_fieldkit")),
  shop(2, "salvage_magnet", 14, { coil: 1, power_cell: 1 }, { salvage_magnet: 1 }, research("sc_fieldkit")),
  shop(2, "data_core", 25, { processor: 1, lightguide: 2, capacitor: 1 }, { data_core: 1 }, research("sc_fieldkit")),
  shop(2, "jump_primer", 16, { ion_gas: 2, fuel: 3, capacitor: 1 }, { jump_primer: 1 }, research("nv_fuel")),
  shop(2, "probe_kit", 25, { sensor: 1, antenna: 1, canister: 1 }, { probe_kit: 1 }, research("nv_probes")),
  shop(3, "outpost_kit", 60, { girder: 6, battery_pack: 1, antenna: 1, filter: 2 }, { outpost_kit: 1 }, research("nv_outposts")),
  // blueprint alternates
  shop(1, "duct_tape_resin", 6, { resin: 1, fiber: 1 }, { duct_tape: 6 }, BLUEPRINT),
  shop(1, "coffee_hydro", 8, { fertilizer: 1, water: 2 }, { coffee: 12 }, BLUEPRINT),
];

export const recipeList: RecipeDef[] = [...T1, ...T2, ...T3, ...T4, ...SUPPLIES];
export const recipes: Record<RecipeId, RecipeDef> = byId(recipeList);

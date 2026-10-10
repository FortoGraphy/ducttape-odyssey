// Quest templates. `stat` is a counter from GDD 11, measured as a delta since the quest was
// issued. `scale: "income"` targets grow with the player's progress, "flat" ones do not.
// Czech texts use "{n}×" so no plural form is ever needed.
import type { QuestTemplateDef } from "@/engine/types";
import { t } from "./util";

const daily = (id: string, stat: string, base: number, scale: QuestTemplateDef["scale"], cs: string, en: string): QuestTemplateDef => ({
  id,
  text: t(cs, en),
  stat,
  base,
  scale,
});
const weekly = (id: string, stat: string, base: number, scale: QuestTemplateDef["scale"], cs: string, en: string): QuestTemplateDef => ({
  id,
  text: t(cs, en),
  stat,
  base,
  scale,
  weekly: true,
});

export const quests: QuestTemplateDef[] = [
  daily("q_salvage", "salvage", 12, "flat", "Seber {n}× plovoucí trosky", "Collect salvage {n} times"),
  daily("q_pulses", "pulses", 8, "flat", "Vyšli {n}× puls skeneru", "Fire the scanner pulse {n} times"),
  daily("q_overdrive", "overdrives", 2, "flat", "Spusť {n}× přetížení", "Trigger Overdrive {n} times"),
  daily("q_purchases", "purchases", 25, "flat", "Nakup {n}× úroveň paluby", "Buy deck levels {n} times"),
  daily("q_levels", "deckLevels", 40, "income", "Zvyš paluby celkem o {n} úrovní", "Gain {n} deck levels in total"),
  daily("q_milestone", "milestones", 1, "flat", "Dosáhni {n}× milníku paluby", "Reach a deck milestone {n} times"),
  daily("q_crafts", "crafts", 30, "income", "Dokonči {n}× výrobní várku", "Finish {n} crafting batches"),
  daily("q_crafts_t2", "craftsT2", 10, "income", "Vyrob {n}× várku součástek", "Craft {n} batches of components"),
  daily("q_module", "modulesBuilt", 1, "flat", "Postav {n}× modul", "Build a module {n} times"),
  daily("q_minigames", "minigames", 3, "flat", "Dohraj {n}× minihru", "Finish {n} mini-games"),
  daily("q_perfect", "minigamesPerfect", 1, "flat", "Zahraj {n}× minihru bez chyby", "Play a mini-game perfectly {n} times"),
  daily("q_repairs", "repairsManual", 2, "flat", "Oprav {n}× něco vlastníma rukama", "Repair something by hand {n} times"),
  daily("q_tape", "tapeUsed", 3, "flat", "Použij {n}× lepicí pásku", "Use duct tape {n} times"),
  daily("q_jumps", "jumps", 2, "flat", "Skoč {n}× do jiné soustavy", "Jump to another system {n} times"),
  daily("q_scans", "planetsScanned", 2, "flat", "Naskenuj {n}× planetu", "Scan a planet {n} times"),
  daily("q_events", "events", 4, "flat", "Vyřeš {n}× událost", "Resolve {n} events"),
  daily("q_trades", "trades", 3, "flat", "Uzavři {n}× obchod na stanici", "Make {n} trades at a station"),
  daily("q_contract", "contracts", 1, "flat", "Splň {n}× zakázku", "Complete a contract {n} times"),
  daily("q_research", "researchLevels", 3, "flat", "Dokonči {n}× úroveň výzkumu", "Finish {n} research levels"),
  daily("q_coffee", "coffee", 30, "flat", "Nech posádku vypít {n}× kávu", "Let the crew drink {n} coffees"),

  weekly("w_jumps", "jumps", 15, "flat", "Týdenní výzva: skoč {n}× do jiné soustavy", "Weekly: jump to another system {n} times"),
  weekly("w_systems", "systemsVisited", 10, "flat", "Týdenní výzva: navštiv {n}× novou soustavu", "Weekly: visit {n} new systems"),
  weekly("w_crafts", "crafts", 500, "income", "Týdenní výzva: dokonči {n}× výrobní várku", "Weekly: finish {n} crafting batches"),
  weekly("w_modules", "modulesBuilt", 6, "flat", "Týdenní výzva: postav {n}× modul", "Weekly: build {n} modules"),
  weekly("w_minigames", "minigames", 20, "flat", "Týdenní výzva: dohraj {n}× minihru", "Weekly: finish {n} mini-games"),
  weekly("w_salvage", "salvage", 120, "flat", "Týdenní výzva: seber {n}× plovoucí trosky", "Weekly: collect salvage {n} times"),
  weekly("w_expeditions", "expeditions", 5, "flat", "Týdenní výzva: vyšli {n}× výsadek", "Weekly: send {n} expeditions"),
  weekly("w_codex", "codex", 12, "flat", "Týdenní výzva: přidej {n}× záznam do kodexu", "Weekly: add {n} codex entries"),
  weekly("w_good_events", "eventsGood", 12, "flat", "Týdenní výzva: {n}× dobrý konec události", "Weekly: get {n} good event outcomes"),
];

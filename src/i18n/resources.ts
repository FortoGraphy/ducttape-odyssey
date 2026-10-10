// Registry of i18next namespaces. Owned by the orchestrator: add a namespace here and in docs/ARCHITECTURE.md.
import cs_common from "./locales/cs/common";
import cs_ship from "./locales/cs/ship";
import cs_craft from "./locales/cs/craft";
import cs_grid from "./locales/cs/grid";
import cs_nav from "./locales/cs/nav";
import cs_world from "./locales/cs/world";
import cs_meta from "./locales/cs/meta";
import cs_settings from "./locales/cs/settings";
import cs_minigames from "./locales/cs/minigames";
import cs_story from "./locales/cs/story";
import en_common from "./locales/en/common";
import en_ship from "./locales/en/ship";
import en_craft from "./locales/en/craft";
import en_grid from "./locales/en/grid";
import en_nav from "./locales/en/nav";
import en_world from "./locales/en/world";
import en_meta from "./locales/en/meta";
import en_settings from "./locales/en/settings";
import en_minigames from "./locales/en/minigames";
import en_story from "./locales/en/story";

export const NAMESPACES = ["common", "ship", "craft", "grid", "nav", "world", "meta", "settings", "minigames", "story"] as const;
export type Namespace = (typeof NAMESPACES)[number];

export const resources = {
  cs: { common: cs_common, ship: cs_ship, craft: cs_craft, grid: cs_grid, nav: cs_nav, world: cs_world, meta: cs_meta, settings: cs_settings, minigames: cs_minigames, story: cs_story },
  en: { common: en_common, ship: en_ship, craft: en_craft, grid: en_grid, nav: en_nav, world: en_world, meta: en_meta, settings: en_settings, minigames: en_minigames, story: en_story },
} as const;

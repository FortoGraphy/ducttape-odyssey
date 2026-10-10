// Factions. `color` is a key of assets/palette.json. `likes` are the item categories a faction
// asks for in contracts and pays a little extra for at its stations.
import type { FactionDef, FactionId } from "@/engine/types";
import { t } from "./util";

export const factions: Record<FactionId, FactionDef> = {
  lamplighters: {
    id: "lamplighters",
    name: t("Cech lampářů", "Lamplighters Guild"),
    desc: t(
      "Obchodníci, kteří rozsvěcují stanice na okraji mapy. Prodají ti cokoliv, nejraději to, co nepotřebuješ.",
      "Traders who keep the lights on at the edge of the map. They will sell you anything, preferably what you do not need.",
    ),
    color: "amber",
    likes: ["refined", "consumable", "component"],
  },
  rustborn: {
    id: "rustborn",
    name: t("Kolektiv Rezavých", "Rustborn Collective"),
    desc: t(
      "Sběrači, kteří v každém vraku vidí budoucnost. Tvoji loď si prohlížejí až moc pozorně.",
      "Scavengers who see a future in every wreck. They study your ship a little too closely.",
    ),
    color: "orange",
    likes: ["raw", "module", "artifact"],
  },
  ledger: {
    id: "ledger",
    name: t("Tichá účtárna", "The Quiet Ledger"),
    desc: t(
      "Auditoři. Nikdo neví, pro koho vedou knihy, ale čísla jim vždycky sedí. Ta tvoje taky znají.",
      "Auditors. Nobody knows whose books they keep, but their numbers always add up. They know yours as well.",
    ),
    color: "cobalt2",
    likes: ["component", "mega", "special"],
  },
};

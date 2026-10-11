// Registry of all nine mini-games. `meta` is imported statically (the intro card and the engine
// need names, hints and time limits); the component is only pulled out of its module when the
// game is first played.
import type { ComponentType } from "react";

import { meta as calibrate } from "./calibrate";
import { meta as defense } from "./defense";
import { meta as dock } from "./dock";
import { meta as hack } from "./hack";
import { meta as rhythm } from "./rhythm";
import { meta as tape } from "./tape";
import type { MinigameProps, MinigameRegistry } from "./types";
import { meta as valves } from "./valves";
import { meta as weld } from "./weld";
import { meta as wire } from "./wire";

type GameModule = { default: ComponentType<MinigameProps> };

/* eslint-disable @typescript-eslint/no-require-imports */
export const minigames: MinigameRegistry = {
  weld: { meta: weld, load: () => (require("./weld") as GameModule).default },
  wire: { meta: wire, load: () => (require("./wire") as GameModule).default },
  rhythm: { meta: rhythm, load: () => (require("./rhythm") as GameModule).default },
  valves: { meta: valves, load: () => (require("./valves") as GameModule).default },
  calibrate: { meta: calibrate, load: () => (require("./calibrate") as GameModule).default },
  tape: { meta: tape, load: () => (require("./tape") as GameModule).default },
  defense: { meta: defense, load: () => (require("./defense") as GameModule).default },
  dock: { meta: dock, load: () => (require("./dock") as GameModule).default },
  hack: { meta: hack, load: () => (require("./hack") as GameModule).default },
};
/* eslint-enable @typescript-eslint/no-require-imports */

export const MINIGAME_IDS = ["weld", "wire", "rhythm", "valves", "calibrate", "tape", "defense", "dock", "hack"] as const;

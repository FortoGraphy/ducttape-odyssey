// World area: galaxy, navigation, planets, expeditions, events, failure states, crew, cards and
// stations. Talks to core and meta only through Game.api and the kernel helpers.
import type { Game, L10n, OfflineReport, SystemDef } from "../types";
import { cardSystem } from "./cards";
import { crewSystem } from "./crew";
import { eventSystem } from "./events";
import { expeditionSystem } from "./expeditions";
import { failureSystem } from "./failure";
import { currentSystem, navSystem, resetNav } from "./nav";
import { planetSystem, scanTarget } from "./planets";
import { contractReady, gameHour, marketPeriod, stationSystem, traderHook } from "./station";
import { rt } from "./util";

export * from "./galaxy";
export * from "./nav";
export * from "./planets";
export * from "./expeditions";
export * from "./events";
export * from "./failure";
export * from "./crew";
export * from "./cards";
export * from "./station";

const MAX_HOOKS = 3;

/** Runs first: paces the 1 Hz world step and keeps the ship in the galaxy that matches the warp count. */
const clockSystem: SystemDef = {
  id: "world.clock",
  init(g) {
    rt(g);
  },
  tick(g, dt) {
    const r = rt(g);
    r.slowAcc += dt;
    // ten 0.1 s ticks sum to 0.9999999999999999: the epsilon keeps the step at exactly 1 Hz
    if (r.slowAcc >= 1 - 1e-9) {
      r.slowAcc = r.slowAcc >= 2 ? 0 : Math.max(0, r.slowAcc - 1);
      r.slow = true;
    } else {
      r.slow = false;
    }
    const s = g.state;
    // meta may bump the warp count after the world's prestige hook has run
    if (s.nav.g !== s.prestige.warps && Number.isFinite(s.prestige.warps) && s.prestige.warps >= 0) resetNav(g);
  },
};

function planetsLeft(n: number): L10n {
  const cs = n === 1 ? "V soustavě zbývá 1 neprozkoumaná planeta." : n < 5 ? `V soustavě zbývají ${n} neprozkoumané planety.` : `V soustavě zbývá ${n} neprozkoumaných planet.`;
  const en = n === 1 ? "One planet in this system is still unscanned." : `${n} planets in this system are still unscanned.`;
  return { cs, en };
}

/** Honest reasons to come back, at most three, most pressing first. Runs after the other world hooks. */
function offlineHooks(g: Game, report: OfflineReport): void {
  const s = g.state;
  const back = s.t + report.seconds;
  const hooks = report.hooks;
  let added = 0;
  const push = (kind: OfflineReport["hooks"][number]["kind"], text: L10n): void => {
    if (added >= MAX_HOOKS) return;
    hooks.push({ kind, text });
    added++;
  };

  for (let i = 0; i < s.expeditions.length; i++) {
    const e = s.expeditions[i];
    if (e.done || e.end <= back) {
      push("expedition", {
        cs: `Výsadek z planety ${e.planetName} je zpátky a má co ukazovat.`,
        en: `The away team is back from ${e.planetName} with things to show you.`,
      });
      break;
    }
  }

  for (let i = 0; i < s.station.contracts.length; i++) {
    const c = s.station.contracts[i];
    if (c.expires > back && contractReady(g, c)) {
      const name = g.content.factions?.[c.faction]?.name;
      push("contract", {
        cs: `Náklad pro zakázku (${name?.cs ?? c.faction}) je připravený k předání.`,
        en: `The cargo for the ${name?.en ?? c.faction} contract is ready to hand over.`,
      });
      break;
    }
  }

  const sys = currentSystem(g);
  const r = rt(g);
  if (r.offlineScan !== null) {
    push("discovery", {
      cs: `Orbitální sken planety ${r.offlineScan} je hotový. V kodexu přibyly záznamy.`,
      en: `The orbital scan of ${r.offlineScan} is complete. The codex has new entries.`,
    });
    r.offlineScan = null;
  }

  if (sys.station && s.nav.jump === null && marketPeriod(g, back) !== gameHour(g)) {
    const text = traderHook(g, sys);
    if (text) push("trader", text);
  }

  if (added === 0 && s.features.scan === 1 && s.nav.jump === null && scanTarget(g) === null) {
    let left = 0;
    for (let i = 0; i < sys.planets.length; i++) if (!((s.planets[sys.planets[i].id]?.scan ?? 0) >= 1)) left++;
    if (left > 0) push("discovery", planetsLeft(left));
  }
}

const hookSystem: SystemDef = {
  id: "world.hooks",
  offline(g, _seconds, _eff, report) {
    offlineHooks(g, report);
    if (g.state.failure) report.safeMode = true;
  },
};

/** Ordered: the clock first (others read its 1 Hz flag), hooks last (they report what the others did offline). */
export const worldSystems: SystemDef[] = [
  clockSystem,
  navSystem,
  failureSystem,
  planetSystem,
  expeditionSystem,
  crewSystem,
  cardSystem,
  stationSystem,
  eventSystem,
  hookSystem,
];

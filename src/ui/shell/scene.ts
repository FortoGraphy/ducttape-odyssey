// Translates game state into the renderer's ViewportScene. Built at most once per engine pulse
// (10 Hz) and only handed to React when something the renderer can see has changed.
import type { Game, SalvageBlob } from "@/engine/types";
import { scanTarget } from "@/engine/world";
import type { ViewportQuality, ViewportScene } from "@/render/types";

let lastBlobs: SalvageBlob[] | null = null;
let lastSalvageSig = "";
let lastSalvage: ViewportScene["salvage"] = [];

function salvageOf(g: Game): ViewportScene["salvage"] {
  const list = g.state.active.salvage;
  let sig = "";
  for (let i = 0; i < list.length; i++) sig += list[i].uid + ",";
  if (lastBlobs === list && sig === lastSalvageSig) return lastSalvage;
  lastBlobs = list;
  lastSalvageSig = sig;
  lastSalvage = list.map((b) => ({ uid: b.uid, kind: b.kind, x: b.x, y: b.y }));
  return lastSalvage;
}

export function buildScene(g: Game): ViewportScene {
  const s = g.state;
  const sys = g.api.currentSystem();
  const a = s.active;
  const failure = s.failure;
  const jumping = s.nav.jump !== null;

  let target = null;
  try {
    target = scanTarget(g);
  } catch {
    target = null;
  }
  const planet = target ?? sys.planets[0] ?? null;
  const biome = planet ? g.content.biomes[planet.biome] : undefined;

  let worst = 100;
  for (let i = 0; i < s.modules.length; i++) if (s.modules[i].slot >= 0 && s.modules[i].hp < worst) worst = s.modules[i].hp;
  const damage = Math.min(1, Math.max(1 - s.hull.hp / 100, (1 - worst / 100) * 0.6));

  const mining = a.mining && a.lockUntil <= s.t;
  const overdrive = a.overdriveUntil > s.t;
  const dead = failure !== null && (failure.kind === "engine" || failure.kind === "noFuel" || failure.kind === "blackout");
  const thrust = dead ? 0 : jumping ? 1 : s.nav.charge > 0 && s.nav.charge < 1 ? 0.5 + 0.5 * s.nav.charge : overdrive ? 0.9 : mining ? 0.55 : s.station.docked ? 0.1 : 0.3;
  const d = s.drones;

  return {
    mode: jumping ? "warp" : s.station.docked ? "docked" : planet ? "orbit" : "cruise",
    systemSeed: sys.seed,
    star: sys.star,
    planet: planet
      ? { seed: planet.seed, biome: planet.biome, size: planet.size, rings: planet.rings, palette: biome?.palette ?? [], shader: biome?.shader ?? "rock" }
      : null,
    ship: {
      hull: s.hull.cls,
      paint: g.content.cosmetics[s.cosmetics.paint]?.value ?? "",
      trail: g.content.cosmetics[s.cosmetics.trail]?.value ?? "",
      damage: Math.round(damage * 20) / 20,
      thrust: Math.round(thrust * 10) / 10,
      mining,
      overdrive,
      tumble: failure?.kind === "tumble",
      powerOut: failure?.kind === "blackout",
    },
    failure: failure ? failure.kind : null,
    hazard: sys.hazards[0] ?? null,
    station: sys.station !== null,
    drones: (d.hauler || 0) + (d.probe || 0) + (d.salvager || 0) + (d.fixer || 0),
    tow: !!failure?.tow,
    salvage: salvageOf(g),
    charge: Math.round(s.nav.charge * 20) / 20,
  };
}

export function sceneEqual(a: ViewportScene, b: ViewportScene): boolean {
  if (a === b) return true;
  const p = a.planet;
  const q = b.planet;
  const sa = a.ship;
  const sb = b.ship;
  return (
    a.mode === b.mode &&
    a.systemSeed === b.systemSeed &&
    a.star === b.star &&
    (p === q || (p !== null && q !== null && p.seed === q.seed && p.biome === q.biome && p.palette === q.palette)) &&
    sa.hull === sb.hull &&
    sa.paint === sb.paint &&
    sa.trail === sb.trail &&
    sa.damage === sb.damage &&
    sa.thrust === sb.thrust &&
    sa.mining === sb.mining &&
    sa.overdrive === sb.overdrive &&
    sa.tumble === sb.tumble &&
    sa.powerOut === sb.powerOut &&
    a.failure === b.failure &&
    a.hazard === b.hazard &&
    a.station === b.station &&
    a.drones === b.drones &&
    a.tow === b.tow &&
    a.salvage === b.salvage &&
    a.charge === b.charge
  );
}

export function buildQuality(opts: { safeMode: boolean; batterySaver: boolean; reduceMotion: boolean; paused: boolean }): ViewportQuality {
  return {
    level: opts.safeMode ? 0 : opts.batterySaver ? 1 : 2,
    fps: opts.safeMode || opts.batterySaver ? 30 : 60,
    reduceMotion: opts.reduceMotion,
    paused: opts.paused,
  };
}

// Preview route for the Nav tab inside the dev harness (never touches the real save).
//   /dev-nav?preset=fresh|early|mid|late&theme=night&lang=en
//   &nav=1 (unlock nav + scan)  &lock=probes,outposts (remove features)  &section=map|system|exp|codex
//   &g=3&depth=57&lane=0  &fuel=2  &charge=1  &charging=1  &cooldown=40  &hull=30  &target=12:1
//   &scan=0,1 (scan planets by index through the engine)  &probes=3  &exp=running|done  &ff=120 (seconds)
//   &open=drive|system:7:1|planet:0|expedition|rename
// On web, window.__nav = { ff(seconds), snap() } lets test scripts advance time and read state.
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Platform, View } from "react-native";

import { tick } from "@/engine/kernel";
import type { FeatureId, Game } from "@/engine/types";
import { chargeJump, chargeSeconds, coreDepth, currentSystem, lanesAt, startExpedition, startScan } from "@/engine/world";
import { getGame } from "@/store/game";
import { DevHarness } from "@/ui/dev/Harness";
import { MicroLabel, useTheme } from "@/ui/kit";
import NavScreen from "@/ui/screens/nav";
import { posKey, useNavUi, type NavSection, type SheetState } from "@/ui/screens/nav/state";

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const num = (v: string | string[] | undefined): number | null => {
  const s = one(v);
  return s !== undefined && s !== "" && Number.isFinite(Number(s)) ? Number(s) : null;
};

function ff(g: Game, seconds: number): void {
  const n = Math.min(60_000, Math.round(seconds * 10));
  for (let i = 0; i < n; i++) tick(g);
}

function snap(g: Game): Record<string, unknown> {
  const s = g.state;
  const sys = currentSystem(g);
  return {
    t: Math.round(s.t),
    depth: s.nav.depth,
    lane: s.nav.lane,
    fuel: Math.round(s.nav.fuel * 100) / 100,
    charge: Math.round(s.nav.charge * 100) / 100,
    chargeSecs: Math.round(chargeSeconds(g)),
    charging: s.flags["w:charging"] === 1,
    crew: s.crew.map((c) => c.uid + (c.away ? "a" : "") + (c.deck ? ":" + c.deck : "")).join(","),
    jumping: s.nav.jump !== null,
    cooldown: Math.max(0, Math.round(s.nav.cooldownUntil - s.t)),
    system: sys.name,
    jumps: s.stats.jumps ?? 0,
    scans: sys.planets.map((p) => Math.round((s.planets[p.id]?.scan ?? 0) * 100)),
    probes: sys.planets.map((p) => s.planets[p.id]?.probes ?? 0),
    codex: s.stats.codex ?? 0,
    renamed: Object.keys(s.codex).filter((k) => s.codex[k].name).map((k) => k + "=" + s.codex[k].name),
    expeditions: s.expeditions.map((e) => ({ uid: e.uid, done: e.done, left: Math.round(e.end - s.t) })),
    outposts: s.outposts.length,
    fuelItems: Math.round((s.inv.fuel?.m ?? 0) * Math.pow(10, s.inv.fuel?.e ?? 0)),
    credits: s.credits.m.toFixed(3) + "e" + s.credits.e,
    failure: s.failure?.kind ?? null,
  };
}

function setup(p: ReturnType<typeof useLocalSearchParams>): void {
  const g = getGame();
  const s = g.state;
  const ui = useNavUi.getState();
  if (one(p.nav) === "1") {
    s.features.nav = 1;
    s.features.scan = 1;
  }
  for (const f of (one(p.lock) ?? "").split(",")) if (f) delete s.features[f as FeatureId];
  const galaxy = num(p.g);
  const depth = num(p.depth);
  if (galaxy !== null || depth !== null) {
    if (galaxy !== null) {
      s.nav.g = galaxy;
      s.prestige.warps = galaxy;
    }
    const core = coreDepth(g);
    s.nav.depth = Math.min(core, depth ?? s.nav.depth);
    s.nav.lane = Math.min(num(p.lane) ?? 0, lanesAt(s.seed, s.nav.g, s.nav.depth, core) - 1);
    s.nav.visited = {};
    for (let d = 0; d <= s.nav.depth; d++) s.nav.visited[`${s.nav.g}:${d}:${d === s.nav.depth ? s.nav.lane : 0}`] = 1;
    s.nav.maxDepth = s.nav.depth;
    g.dirty = true;
  }
  const fuel = num(p.fuel);
  if (fuel !== null) s.nav.fuel = fuel;
  const hull = num(p.hull);
  if (hull !== null) s.hull.hp = hull;
  const probes = num(p.probes);
  if (probes !== null) s.drones.probe = probes;
  const cooldown = num(p.cooldown);
  if (cooldown !== null) s.nav.cooldownUntil = s.t + cooldown;
  const charge = num(p.charge);
  if (charge !== null) s.nav.charge = charge;
  if (one(p.charging) === "1") chargeJump(g);
  const planets = currentSystem(g).planets;
  for (const i of (one(p.scan) ?? "").split(",")) {
    const planet = i === "" ? undefined : planets[Number(i)];
    if (!planet) continue;
    s.features.scan = 1;
    startScan(g, planet.id);
    for (let k = 0; k < 3000 && (s.planets[planet.id]?.scan ?? 0) < 1; k++) tick(g);
  }
  const exp = one(p.exp);
  if (exp && planets[0] && s.crew.length > 0) {
    s.features.expeditions = 1;
    if ((s.planets[planets[0].id]?.scan ?? 0) < 1) {
      startScan(g, planets[0].id);
      for (let k = 0; k < 3000 && (s.planets[planets[0].id]?.scan ?? 0) < 1; k++) tick(g);
    }
    const free = s.crew.filter((c) => !c.away && !c.deck);
    startExpedition(g, planets[0].id, [(free[0] ?? s.crew[0]).uid], "short");
    if (exp === "done") ff(g, 320);
  }
  const forward = num(p.ff);
  if (forward !== null) ff(g, forward);

  const section = one(p.section);
  if (section) ui.setSection(section as NavSection);
  const target = one(p.target)?.split(":").map(Number);
  if (target && target.length === 2) ui.pick(target[0], target[1], posKey(g));
  const open = one(p.open)?.split(":");
  if (open) {
    let sheet: SheetState | null = null;
    if (open[0] === "drive") sheet = { kind: "drive" };
    else if (open[0] === "system") sheet = { kind: "system", depth: Number(open[1]), lane: Number(open[2]) };
    else if (open[0] === "planet" && planets[Number(open[1])]) sheet = { kind: "planet", id: planets[Number(open[1])].id };
    else if (open[0] === "expedition") sheet = { kind: "expedition", planet: null };
    else if (open[0] === "rename") sheet = { kind: "rename", key: "system:" + currentSystem(g).id, fallback: currentSystem(g).name };
    if (sheet) ui.open(sheet);
  } else {
    ui.close();
  }
  if (Platform.OS === "web") {
    (globalThis as unknown as { __nav: unknown }).__nav = {
      ff: (seconds: number) => ff(getGame(), seconds),
      snap: () => snap(getGame()),
    };
  }
}

/** Stands in for the shell: status strip above, tab keys below, the tab content box in between. */
function ShellBox() {
  const theme = useTheme();
  const params = useLocalSearchParams();
  useState(() => setup(params));
  return (
    <View style={{ flex: 1, backgroundColor: theme.body }}>
      <View style={{ height: 36, backgroundColor: theme.lcdBg, alignItems: "center", justifyContent: "center" }}>
        <MicroLabel color="lcdOn">STATUS</MicroLabel>
      </View>
      <View style={{ flex: 1 }}>
        <NavScreen />
      </View>
      <View style={{ height: 56, backgroundColor: theme.bodyLo, alignItems: "center", justifyContent: "center" }}>
        <MicroLabel>TABS</MicroLabel>
      </View>
    </View>
  );
}

export default function DevNav() {
  return (
    <DevHarness>
      <ShellBox />
    </DevHarness>
  );
}

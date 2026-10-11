// Preview route for the craft and grid tabs inside the dev harness. The frame reserves the space
// the real shell takes (status strip above, tab keys below), so the screens are judged in a
// realistic box. Not part of the shipped flow.
//   /dev-craft?preset=mid&tab=craft|grid&station=fabricator&view=queue|recipes|inventory
//   /dev-craft?tab=grid&section=grid|repair|bots&scene=stalled|locked|glitch|big
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import * as B from "@/engine/big";
import { queueCraft } from "@/engine/core";
import type { CraftStationId, Game } from "@/engine/types";
import { act, getGame } from "@/store/game";
import { Key, KeyRow, MicroLabel, Well, useTheme } from "@/ui/kit";
import { DevHarness } from "@/ui/dev/Harness";
import CraftScreen, { type CraftView } from "@/ui/screens/craft";
import GridScreen, { type GridSectionId } from "@/ui/screens/grid";
import { space } from "@/ui/theme";

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

function applyScene(g: Game, scene: string | undefined): void {
  const s = g.state;
  if (scene === "stalled") {
    delete s.inv.scrap;
    s.craft.refinery.queue.length = 0;
    queueCraft(g, "glass", -1);
    queueCraft(g, "alloy", 5);
    queueCraft(g, "wire", 2);
    queueCraft(g, "fuel", 3);
  } else if (scene === "locked") {
    delete s.features.repairBots;
    delete s.features.autoMaintenance;
    delete s.features.autoQueue;
    s.repair.botLevel = 0;
    s.repair.jobs.length = 0;
  } else if (scene === "glitch") {
    const installed = s.modules.filter((m) => m.slot >= 0);
    s.repair.priority = [installed[3]?.uid ?? 0, 0, installed[0]?.uid ?? 0].filter((v, i, a) => a.indexOf(v) === i);
    s.repair.jobs = [{ target: installed[3]?.uid ?? 0, glitchUntil: s.t + 1800 }];
  } else if (scene === "big") {
    s.grid.w = 6;
    s.grid.h = 6;
    s.grid.open = 22;
    s.grid.cells = new Array(36).fill(0);
    for (const m of s.modules) if (m.slot >= 0) s.grid.cells[m.slot] = m.uid;
    for (const item of ["mod_laser_mk3", "mod_cargo_mk2", "mod_engine_mk2", "mod_life_mk1", "mod_repair_mk1"]) g.api.addModule(item, 2);
    s.inv.nano_gel = B.big(3);
  }
  g.dirty = true;
}

function Frame() {
  const theme = useTheme();
  const params = useLocalSearchParams();
  const [tab, setTab] = useState(one(params.tab) === "grid" ? "grid" : "craft");
  // runs once, before the screens read the game for the first time
  useState(() => {
    applyScene(getGame(), one(params.scene));
    (globalThis as { __dto?: unknown }).__dto = { getGame, act };
    return true;
  });
  const station = one(params.station) as CraftStationId | undefined;
  const view = one(params.view) as CraftView | undefined;
  const section = one(params.section) as GridSectionId | undefined;
  return (
    <View style={{ flex: 1, backgroundColor: theme.body }}>
      <Well tone="dark" radius={0} style={{ height: 40, justifyContent: "center", alignItems: "center" }}>
        <MicroLabel color="lcdOn">STATUS STRIP</MicroLabel>
      </Well>
      <View style={{ flex: 1 }}>{tab === "grid" ? <GridScreen initialSection={section} /> : <CraftScreen initialStation={station} initialView={view} />}</View>
      <KeyRow style={{ height: 52, paddingHorizontal: space.md, alignItems: "center" }}>
        <Key testID="tab-craft" size="sm" icon="tab_craft" label="Craft" latched={tab === "craft"} tone={tab === "craft" ? "cobalt" : "black"} onPress={() => setTab("craft")} />
        <Key testID="tab-grid" size="sm" icon="tab_grid" label="Grid" latched={tab === "grid"} tone={tab === "grid" ? "cobalt" : "black"} onPress={() => setTab("grid")} />
      </KeyRow>
    </View>
  );
}

export default function DevCraft() {
  return (
    <DevHarness>
      <Frame />
    </DevHarness>
  );
}

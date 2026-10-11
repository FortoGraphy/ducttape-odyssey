// Preview route for the Meta tab. On top of the harness params (?preset=&theme=&lang=):
//   &section=research|prestige|achievements|quests   &layer=1|2|3   &view=tree|stats
//   &debug=core,gate,shipyard,reboot,quests,stamps   (comma separated state shaping, see `shape`)
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import * as B from "@/engine/big";
import { tick } from "@/engine/kernel";
import { checkAchievements } from "@/engine/meta";
import type { Game } from "@/engine/types";
import { coreDepth } from "@/engine/world";
import { getGame } from "@/store/game";
import { DevHarness } from "@/ui/dev/Harness";
import { MicroLabel, useTheme } from "@/ui/kit";
import MetaScreen, { type MetaSection } from "@/ui/screens/meta";

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

function shape(g: Game, flags: string[]): void {
  const s = g.state;
  for (const flag of flags) {
    if (flag === "core") {
      s.nav.depth = coreDepth(g);
      s.nav.lane = 0;
      s.nav.maxDepth = s.nav.depth;
      s.nav.jump = null;
      s.nav.visited[`${s.nav.g}:${s.nav.depth}:0`] = 1;
    } else if (flag === "gate") {
      s.flags.gate_built = 1;
    } else if (flag === "shipyard") {
      s.flags.shipyard_built = 1;
      for (const id in g.content.hulls) if (g.content.items[`hull_frame_${id}`] && id !== "colossus") s.inv[`hull_frame_${id}`] = B.big(1);
    } else if (flag === "reboot") {
      s.prestige.rebuilds = 3;
      s.flags.rivetsTotal_m = 4.2;
      s.flags.rivetsTotal_e = 2;
    } else if (flag === "stamps") {
      s.prestige.stamps = B.big(12);
      s.prestige.stampsTotal = B.big(12);
    } else if (flag === "quests") {
      s.features.quests = 1;
      s.features.weekly = 1;
      s.played = Math.max(s.played, 3 * 3600);
      for (let i = 0; i < 12; i++) tick(g);
      // Finish the first daily and leave the second half way.
      const daily = s.quests.daily;
      const bump = (index: number, share: number) => {
        const q = daily[index];
        const def = q ? g.content.quests.find((t) => t.id === q.id) : undefined;
        if (q && def) s.stats[def.stat] = (s.stats[def.stat] ?? 0) + Math.ceil(q.target * share);
      };
      bump(0, 1);
      bump(1, 0.5);
      s.quests.streak = 3;
      s.quests.lastClaimDay = s.quests.day - 1;
    }
  }
  g.dirty = true;
  for (let i = 0; i < 12; i++) tick(g);
  checkAchievements(g);
}

function Body() {
  const params = useLocalSearchParams();
  const theme = useTheme();
  // The harness has booted the game before it renders children: shape it once, before the first paint.
  useState(() => {
    const g = getGame();
    shape(g, (one(params.debug) ?? "").split(",").filter(Boolean));
    (globalThis as { __game?: () => Game }).__game = getGame;
    return true;
  });
  const section = one(params.section) as MetaSection | undefined;
  const layer = Number(one(params.layer)) as 1 | 2 | 3;
  const view = one(params.view);
  return (
    <View style={{ flex: 1, backgroundColor: theme.body }}>
      {/* Same box the shell gives a tab: about 330 pt between the status strip and the tab keys. */}
      <View style={{ height: 24, justifyContent: "center", paddingHorizontal: 12, backgroundColor: theme.bodyLo }}>
        <MicroLabel>STATUS STRIP</MicroLabel>
      </View>
      <View style={{ height: 330 }}>
        <MetaScreen initialSection={section} initialLayer={layer >= 1 && layer <= 3 ? layer : undefined} initialTree={view === "tree"} initialStats={view === "stats"} />
      </View>
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 12, backgroundColor: theme.bodyLo }}>
        <MicroLabel>TAB KEYS</MicroLabel>
      </View>
    </View>
  );
}

export default function DevMeta() {
  return (
    <DevHarness>
      <Body />
    </DevHarness>
  );
}

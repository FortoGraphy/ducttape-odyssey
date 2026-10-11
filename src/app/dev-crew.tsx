// Preview route for the Crew tab. On top of the harness params (?preset= &theme= &lang=):
//   &section=crew|cards|station|station.<market|contracts|shop|repair|hire>|factions
//   &at=station     move the ship to the next system with a station and dock (&dock=0 stays outside)
//   &at=nostation   move the ship to the next system without one
//   &coffee=low|out &crew=<n> (roster size: 0 = empty, more than the preset tops it up while bunks last) &rep=1 (mixed standings) &h=<points> (content height, default 330)
// A debug hook for Playwright lives at globalThis.__crew (snap, give).
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import * as B from "@/engine/big";
import { tick } from "@/engine/kernel";
import type { Game } from "@/engine/types";
import { assignCrew, coreDepth, dismissCrew, dock, lanesAt, systemAt } from "@/engine/world";
import { getGame, startLoop, stopLoop } from "@/store/game";
import { goTo } from "@/store/ui";
import { DevHarness } from "@/ui/dev/Harness";
import { useTheme } from "@/ui/kit";
import CrewScreen from "@/ui/screens/crew";
import { doAct } from "@/ui/screens/crew/shared";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

function moveTo(g: Game, wantStation: boolean): void {
  const nav = g.state.nav;
  const core = coreDepth(g);
  for (let d = nav.depth; d <= core; d++) {
    const lanes = lanesAt(g.state.seed, nav.g, d, core);
    for (let l = 0; l < lanes; l++) {
      if ((systemAt(g, d, l).station !== null) !== wantStation) continue;
      nav.depth = d;
      nav.lane = l;
      nav.maxDepth = Math.max(nav.maxDepth, d);
      nav.visited[`${nav.g}:${d}:${l}`] = 1;
      nav.jump = null;
      return;
    }
  }
}

function setup(p: Params): void {
  const g = getGame();
  const s = g.state;
  const at = one(p.at);
  if (at === "station" || at === "nostation") moveTo(g, at === "station");
  const crew = one(p.crew);
  if (crew !== undefined) {
    const want = Math.max(0, Number(crew) || 0);
    for (const c of s.crew.slice(want)) dismissCrew(g, c.uid);
    const decks = ["refinery", "lab", "cargo", "reactor"] as const;
    for (let i = s.crew.length; i < want; i++) {
      const uid = g.api.addCrew();
      const c = s.crew.find((x) => x.uid === uid);
      if (!c) break;
      c.level = 2 + i * 3;
      c.xp = 40 * i;
      if (i < 4) assignCrew(g, uid, decks[i - 1] ?? "lab");
    }
    if (s.crew.length > 4) s.crew[4].away = true;
  }
  if (one(p.rep) === "1") s.station.rep = { lamplighters: 46, rustborn: -22, ledger: 12 };
  const coffee = one(p.coffee);
  if (coffee === "low") s.inv.coffee = B.big(s.crew.length * 12);
  if (coffee === "out") {
    // the greenhouse would grow fresh beans before the screenshot
    s.decks.greenhouse.level = 0;
    s.inv.coffee = B.big(0);
  }
  g.dirty = true;
  for (let i = 0; i < (coffee === "out" ? 400 : 20); i++) tick(g);
  if (at === "station" && one(p.dock) !== "0") dock(g);
  goTo("crew", one(p.section) ?? null);

  (globalThis as Record<string, unknown>).__crew = {
    snap: () => ({
      credits: B.toNumber(s.credits),
      deckMult: { ...g.deckMult },
      gridOpen: s.grid.open,
      crew: s.crew.map((c) => ({ uid: c.uid, name: c.name, deck: c.deck })),
      hull: s.hull.hp,
      modulesMin: s.modules.reduce((m, x) => Math.min(m, x.hp), 100),
      shop: { ...s.station.shop },
      rep: { ...s.station.rep },
      docked: s.station.docked,
      contracts: s.station.contracts.map((c) => ({ uid: c.uid, item: c.item, need: B.toNumber(c.need), have: B.toNumber(c.have), reward: B.toNumber(c.reward) })),
      offers: s.station.offers.map((c) => ({ uid: c.uid, item: c.item, need: B.toNumber(c.need) })),
      cards: Object.fromEntries(Object.entries(s.decks).map(([id, d]) => [id, d.cards.slice()])),
      cargoUsed: B.toNumber(g.rates.cargoUsed),
      cargoCap: B.toNumber(g.rates.cargoCap),
    }),
    inv: (item: string) => B.toNumber(s.inv[item] ?? B.ZERO),
    give: (item: string, n: number) => doAct(() => void (s.inv[item] = B.add(s.inv[item] ?? B.ZERO, B.big(n)))),
    // freezes the economy so before/after readings are not blurred by income; actions still refresh the UI
    pause: () => stopLoop(false),
    resume: () => startLoop(),
    ownedCard: () => Object.keys(s.cards).sort()[0] ?? null,
    damage: () =>
      doAct(() => {
        s.hull.hp = 41;
        for (const m of s.modules) m.hp = Math.min(m.hp, 55);
        g.dirty = true;
      }),
  };
}

function Frame() {
  const params = useLocalSearchParams() as Params;
  const theme = useTheme();
  // Runs once, before the first render of the screen (the harness has booted the game by now).
  useState(() => {
    setup(params);
    return 0;
  });
  const h = Number(one(params.h)) || 330;
  return (
    <View style={{ height: h, backgroundColor: theme.body, borderTopWidth: 1, borderTopColor: theme.bodyHi }}>
      <CrewScreen />
    </View>
  );
}

export default function DevCrew() {
  return (
    <DevHarness>
      <Frame />
    </DevHarness>
  );
}

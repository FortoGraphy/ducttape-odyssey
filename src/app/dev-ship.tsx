// Preview route for the Ship tab inside the dev harness.
//   /dev-ship?preset=fresh|early|mid|late&theme=night&lang=en
//   &open=<deck>      open that deck's detail sheet
//   &bn=lift|power    shape a bottleneck (slow lift / starved reactor)
//   &cr=<number>      set the credits
//   &cards=1          one card for every deck (card slots can be exercised)
//   &h=<points>       cap the content height (the real shell gives a tab about 330 pt)
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import * as B from "@/engine/big";
import { DECK_IDS, type DeckId } from "@/engine/types";
import { getGame } from "@/store/game";
import { DevHarness } from "@/ui/dev/Harness";
import ShipScreen from "@/ui/screens/ship";

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

function Preview() {
  const params = useLocalSearchParams();
  const open = one(params.open);
  const bn = one(params.bn);
  const cr = one(params.cr);
  const cards = one(params.cards);
  const h = Number(one(params.h));
  // runs once, before the first render of the screen, on the game the harness just booted
  useState(() => {
    const g = getGame();
    const s = g.state;
    if (cr && Number.isFinite(Number(cr))) s.credits = B.big(Number(cr));
    if (bn === "lift") {
      s.decks.mining.level = Math.max(s.decks.mining.level, 30);
      s.decks.lift.level = Math.min(s.decks.lift.level, 4);
    } else if (bn === "power") {
      s.decks.reactor.level = Math.min(s.decks.reactor.level, 1);
      s.decks.mining.level = Math.max(s.decks.mining.level, 80);
    }
    if (cards === "1") for (const id of DECK_IDS) g.api.grantCard(id);
    g.dirty = true;
    (globalThis as { __game?: () => unknown }).__game = getGame;
    return 0;
  });
  return (
    <View style={h > 0 ? { height: h } : { flex: 1 }}>
      <ShipScreen initialSheet={open && (DECK_IDS as readonly string[]).includes(open) ? (open as DeckId) : null} />
    </View>
  );
}

export default function DevShip() {
  return (
    <DevHarness>
      <Preview />
    </DevHarness>
  );
}

// Ship tab: one scrolling list. The flow strip and the power + buy-mode row are its header, then the
// decks from the bottom of the ship up (mining first). On an iPhone 13 mini the tab has about 170 pt
// of height, so nothing here may be pinned: pinned chrome left room for half a deck card.
import { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, StyleSheet, View, type ListRenderItemInfo } from "react-native";

import { canUnlockDeck } from "@/engine/core";
import { DECK_IDS, type DeckId } from "@/engine/types";
import { useGame } from "@/store/game";
import { useTheme } from "@/ui/kit";
import { space } from "@/ui/theme";

import { CARD_H, DeckCard, LockedCard, ROW_GAP, TeaserCard, TEASER_H } from "./DeckCard";
import { DeckSheet } from "./DeckSheet";
import { ControlRow, FlowStrip } from "./FlowStrip";
import { nextUnlock } from "./model";

type RowKind = "b" | "n" | "t";
interface Row {
  id: DeckId;
  kind: RowKind;
}

const keyOf = (row: Row): string => row.id;
/** Flow strip + control row before the first layout pass. */
const HEADER_GUESS = 126;

export interface ShipScreenProps {
  /** Preview routes open a deck's detail sheet right away. */
  initialSheet?: DeckId | null;
}

export default function ShipScreen({ initialSheet = null }: ShipScreenProps) {
  const theme = useTheme();
  // one letter per deck: built, next (full lock card), teaser
  const sig = useGame((g) => {
      const next = nextUnlock(g);
      let out = "";
      for (const id of DECK_IDS) out += g.state.decks[id].level > 0 ? "b" : id === next || canUnlockDeck(g, id).ok ? "n" : "t";
      return out;
  });
  // Lowest decks first (a new game starts at mining), built decks before the next unlock and the
  // teasers, so the decks the player actually uses sit right under the flow strip.
  const [headerH, setHeaderH] = useState(HEADER_GUESS);
  const { rows, offsets } = useMemo(() => {
    const order = { b: 0, n: 1, t: 2 } as const;
    const list: Row[] = [];
    for (let i = DECK_IDS.length - 1; i >= 0; i--) list.push({ id: DECK_IDS[i], kind: sig[i] as RowKind });
    list.sort((x, y) => order[x.kind] - order[y.kind]);
    const offs: number[] = [];
    let y = headerH;
    for (const row of list) {
      offs.push(y);
      y += (row.kind === "t" ? TEASER_H : CARD_H) + ROW_GAP;
    }
    return { rows: list, offsets: offs };
  }, [sig, headerH]);

  const listRef = useRef<FlatList<Row>>(null);
  const [sheet, setSheet] = useState<DeckId | null>(initialSheet);
  const [mark, setMark] = useState<{ id: DeckId | null; n: number; fresh: boolean }>({ id: null, n: 0, fresh: false });

  const open = useCallback((id: DeckId) => setSheet(id), []);
  const close = useCallback(() => setSheet(null), []);
  const openReactor = useCallback(() => setSheet("reactor"), []);
  const focus = useCallback(
    (id: DeckId) => {
      const index = rows.findIndex((r) => r.id === id);
      if (index >= 0) listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
      setMark((m) => ({ id, n: m.n + 1, fresh: false }));
    },
    [rows],
  );
  const built = useCallback((id: DeckId) => {
    setMark((m) => ({ id, n: m.n + 1, fresh: true }));
    // a card that is recycled by the list later must not replay the build flourish
    setTimeout(() => setMark((m) => (m.id === id && m.fresh ? { ...m, fresh: false } : m)), 2200);
  }, []);
  const header = useMemo(
    () => (
      <View style={styles.header} onLayout={(e) => setHeaderH(Math.round(e.nativeEvent.layout.height))}>
        <FlowStrip onFix={focus} />
        <ControlRow onPower={openReactor} />
      </View>
    ),
    [focus, openReactor],
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({ index, offset: offsets[index], length: (rows[index].kind === "t" ? TEASER_H : CARD_H) + ROW_GAP }),
    [offsets, rows],
  );
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Row>) => {
      const hit = mark.id === item.id;
      return (
        <View style={styles.row}>
          {item.kind === "b" ? (
            <DeckCard id={item.id} ping={hit ? mark.n : 0} fresh={hit && mark.fresh} onOpen={open} />
          ) : item.kind === "n" ? (
            <LockedCard id={item.id} onOpen={open} onBuilt={built} />
          ) : (
            <TeaserCard id={item.id} onOpen={open} />
          )}
        </View>
      );
    },
    [mark, open, built],
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.body }]}>
      <FlatList
        ref={listRef}
        testID="deck-list"
        data={rows}
        keyExtractor={keyOf}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        extraData={mark}
        ListHeaderComponent={header}
        initialNumToRender={DECK_IDS.length}
        windowSize={7}
        showsVerticalScrollIndicator={false}
        indicatorStyle={theme.id === "day" ? "black" : "white"}
        style={styles.list}
      />
      <DeckSheet id={sheet} onClose={close} onBuilt={built} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: space.md },
  header: { paddingTop: space.sm, paddingBottom: ROW_GAP, gap: ROW_GAP },
  list: { flex: 1 },
  row: { paddingBottom: ROW_GAP },
});

// Ship tab: flow strip, power + buy mode, and the 13 decks in stack order (bridge on top, mining at
// the bottom). The list opens scrolled to the lowest decks, where a new game starts.
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
  const { rows, offsets } = useMemo(() => {
    const list: Row[] = [];
    const offs: number[] = [];
    let y = 0;
    for (let i = 0; i < DECK_IDS.length; i++) {
      const kind = sig[i] as RowKind;
      list.push({ id: DECK_IDS[i], kind });
      offs.push(y);
      y += (kind === "t" ? TEASER_H : CARD_H) + ROW_GAP;
    }
    return { rows: list, offsets: offs };
  }, [sig]);

  const listRef = useRef<FlatList<Row>>(null);
  const settled = useRef(false);
  const [sheet, setSheet] = useState<DeckId | null>(initialSheet);
  const [mark, setMark] = useState<{ id: DeckId | null; n: number; fresh: boolean }>({ id: null, n: 0, fresh: false });

  const open = useCallback((id: DeckId) => setSheet(id), []);
  const close = useCallback(() => setSheet(null), []);
  const openReactor = useCallback(() => setSheet("reactor"), []);
  const focus = useCallback((id: DeckId) => {
    listRef.current?.scrollToIndex({ index: DECK_IDS.indexOf(id), viewPosition: 0.5, animated: true });
    setMark((m) => ({ id, n: m.n + 1, fresh: false }));
  }, []);
  const built = useCallback((id: DeckId) => {
    setMark((m) => ({ id, n: m.n + 1, fresh: true }));
    // a card that is recycled by the list later must not replay the build flourish
    setTimeout(() => setMark((m) => (m.id === id && m.fresh ? { ...m, fresh: false } : m)), 2200);
  }, []);
  // mining sits at the bottom of the stack: a new game starts there
  const settle = useCallback(() => {
    if (settled.current) return;
    settled.current = true;
    listRef.current?.scrollToEnd({ animated: false });
  }, []);

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
      <FlowStrip onFix={focus} />
      <ControlRow onPower={openReactor} />
      <FlatList
        ref={listRef}
        testID="deck-list"
        data={rows}
        keyExtractor={keyOf}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        extraData={mark}
        initialNumToRender={DECK_IDS.length}
        windowSize={7}
        onContentSizeChange={settle}
        showsVerticalScrollIndicator={false}
        indicatorStyle={theme.id === "day" ? "black" : "white"}
        style={styles.list}
      />
      <DeckSheet id={sheet} onClose={close} onBuilt={built} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: space.md, paddingTop: space.sm, gap: ROW_GAP },
  list: { flex: 1 },
  row: { paddingBottom: ROW_GAP },
});

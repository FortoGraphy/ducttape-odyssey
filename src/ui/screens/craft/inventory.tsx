// Inventory: what is in the hold, grouped by tier, with amounts and what the broker pays.
import { memo, useCallback, useMemo } from "react";
import { View } from "react-native";

import * as B from "@/engine/big";
import { content } from "@/content";
import { sellPrice } from "@/engine/core";
import type { Game, ItemCategory, ItemId } from "@/engine/types";
import { useT, useTr } from "@/i18n";
import { getGame, useGame } from "@/store/game";
import { fmt, useFmt } from "@/ui/format";
import { CostTag, EmptyState, ListRow, MicroLabel, ScrollWell, Txt } from "@/ui/kit";
import { space } from "@/ui/theme";

const GROUPS: readonly ItemCategory[] = ["raw", "refined", "component", "consumable", "mega", "special", "artifact"];
const ALMOST_ONE = B.big(1 - 1e-9);

type InvRow = { kind: "head"; group: ItemCategory; count: number } | { kind: "item"; id: ItemId };

function owned(g: Game, id: ItemId): boolean {
  const have = g.state.inv[id];
  return !!have && B.cmp(have, ALMOST_ONE) >= 0;
}

function invSig(g: Game): string {
  let s = "";
  for (const id in g.state.inv) if (owned(g, id)) s += `${id}:${fmt(g.state.inv[id])}|`;
  return s;
}

function buildRows(g: Game): InvRow[] {
  const rows: InvRow[] = [];
  for (const group of GROUPS) {
    const ids: ItemId[] = [];
    for (const id in g.state.inv) if (content.items[id]?.category === group && owned(g, id)) ids.push(id);
    if (ids.length === 0) continue;
    ids.sort((a, b) => content.items[a].tier - content.items[b].tier || content.items[a].value - content.items[b].value);
    rows.push({ kind: "head", group, count: ids.length });
    for (const id of ids) rows.push({ kind: "item", id });
  }
  return rows;
}

const ItemRow = memo(function ItemRow({ id, amount, onOpen }: { id: ItemId; amount: string; onOpen: (id: ItemId) => void }) {
  const tr = useTr();
  const t = useT("craft");
  const def = content.items[id];
  const g = getGame();
  const total = B.mul(g.state.inv[id] ?? B.ZERO, sellPrice(g, id));
  return (
    <ListRow
      testID={`inv-${id}`}
      icon={def.icon}
      title={tr(def.name)}
      subtitle={t("inv.each", { tier: def.tier, price: fmt(sellPrice(g, id)) })}
      onPress={() => onOpen(id)}
      right={
        <View style={{ alignItems: "flex-end" }}>
          <Txt variant="bodyBold" tabular>
            {amount}
          </Txt>
          <CostTag icon="coin" amount={fmt(total)} size="sm" style={{ alignSelf: "flex-end" }} />
        </View>
      }
    />
  );
});

export const Inventory = memo(function Inventory({ onOpen }: { onOpen: (id: ItemId) => void }) {
  const t = useT("craft");
  useFmt();
  const sig = useGame(invSig, Object.is, 5);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => buildRows(getGame()), [sig]);
  const renderItem = useCallback(
    ({ item }: { item: InvRow }) =>
      item.kind === "head" ? (
        <View style={{ height: 24, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: space.sm, paddingBottom: 2 }}>
          <MicroLabel size="label" color="ink">
            {t(`category.${item.group}`)}
          </MicroLabel>
          <MicroLabel>{t("inv.kinds", { count: item.count })}</MicroLabel>
        </View>
      ) : (
        <ItemRow id={item.id} amount={fmt(getGame().state.inv[item.id])} onOpen={onOpen} />
      ),
    // rows carry no amounts: the signature refreshes them
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onOpen, t, sig],
  );
  return (
    <ScrollWell<InvRow>
      style={{ flex: 1 }}
      data={rows}
      renderItem={renderItem}
      keyExtractor={(r) => (r.kind === "head" ? `h-${r.group}` : r.id)}
      initialNumToRender={8}
      ListEmptyComponent={<EmptyState compact icon="cargo" title={t("inv.emptyTitle")} hint={t("inv.emptyHint")} />}
    />
  );
});

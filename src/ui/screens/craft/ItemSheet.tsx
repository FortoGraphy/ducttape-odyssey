// Item sheet: what the thing is, where it comes from and what it is used for. Recipes listed here
// open the recipe sheet, so the inventory doubles as an entry point into the recipe tree.
import { useState } from "react";
import { View } from "react-native";

import * as B from "@/engine/big";
import { content } from "@/content";
import { sellPrice } from "@/engine/core";
import type { ItemId, RecipeId } from "@/engine/types";
import { useT, useTr } from "@/i18n";
import { getGame, useGame } from "@/store/game";
import { fmt, fmtPct, fmtRate, useFmt } from "@/ui/format";
import { Badge, Col, Icon, ListRow, Row, Sheet, Txt, Well } from "@/ui/kit";

import { haveOf, mixShare, primaryOf, recipesFor, recipesUsing } from "./model";
import { Fact, SectionLabel } from "./parts";
import { useUnlockText } from "./RecipeSheet";

const MAX_USES = 8;

export function ItemSheet({ item, onClose, onRecipe }: { item: ItemId | null; onClose: () => void; onRecipe: (id: RecipeId) => void }) {
  const t = useT("craft");
  const tr = useTr();
  const unlockText = useUnlockText();
  useFmt();
  const [shown, setShown] = useState<ItemId | null>(null);
  if (item && item !== shown) setShown(item);
  const id = item ?? shown;
  useGame((g) => (id ? `${fmt(haveOf(g, id))}|${fmt(sellPrice(g, id))}` : ""), Object.is, 5);
  if (!id) return <Sheet visible={false} onClose={onClose} />;

  const g = getGame();
  const def = content.items[id];
  const makes = recipesFor(id);
  const uses = recipesUsing(id);
  const share = mixShare(g, id);
  const spec = def.consumable;
  return (
    <Sheet visible={!!item} onClose={onClose} title={tr(def.name)} testID="item-sheet">
      <Row gap="md" align="flex-start">
        <Icon name={def.icon} size={32} chip />
        <Col gap="xs" flex>
          <Row gap="xs">
            <Badge label={`T${def.tier}`} />
            <Badge label={t(`category.${def.category}`)} tone="cobalt" />
          </Row>
          <Txt variant="body" color="inkDim">
            {tr(def.desc)}
          </Txt>
        </Col>
      </Row>
      <Well>
        <Fact label={t("item.have")} value={fmt(haveOf(g, id))} />
        <Fact label={t("item.price")} value={fmt(sellPrice(g, id))} />
        <Fact label={t("item.total")} value={fmt(B.mul(haveOf(g, id), sellPrice(g, id)))} />
        {spec?.repairPct ? <Fact label={t("item.repairs")} value={t("item.repairValue", { pct: spec.repairPct, cap: spec.repairCap ?? 100 })} /> : null}
        {spec?.fuel ? <Fact label={t("item.fuel")} value={`+${spec.fuel}`} /> : null}
        {spec?.morale ? <Fact label={t("item.morale")} value={`+${spec.morale}`} /> : null}
      </Well>

      <SectionLabel>{t("item.from")}</SectionLabel>
      <View>
        {share > 0 ? <ListRow icon="deck_mining" title={t("raw.here")} subtitle={`${fmtPct(share)} · ${fmtRate(B.mulN(B.min(g.rates.mine, g.rates.lift), share))}`} /> : null}
        {def.category === "raw" && share <= 0 ? <ListRow icon="warning" title={t("item.notHere")} subtitle={t("item.notHereHint")} /> : null}
        {(id === "organics" || id === "coffee") && g.state.decks.greenhouse.level > 0 ? <ListRow icon="deck_greenhouse" title={tr(content.decks.greenhouse.name)} subtitle={t("item.greenhouse")} /> : null}
        {makes.map((r) => {
          const rd = content.recipes[r];
          const known = g.state.recipes[r] === 1;
          return <ListRow key={r} icon={content.decks[rd.station].icon} locked={!known} title={tr(content.decks[rd.station].name)} subtitle={known ? Object.keys(rd.inputs).map((i) => tr(content.items[i]?.name)).join(" + ") : unlockText(rd)} chevron onPress={() => onRecipe(r)} />;
        })}
        {makes.length === 0 && def.category !== "raw" ? <ListRow icon="question" title={t("item.found")} subtitle={t("item.foundHint")} /> : null}
      </View>

      <SectionLabel>{t("item.usedIn")}</SectionLabel>
      <View>
        {uses.slice(0, MAX_USES).map((r) => {
          const out = content.items[primaryOf(content.recipes[r])];
          const known = g.state.recipes[r] === 1;
          return <ListRow key={r} icon={out.icon} locked={!known} title={tr(out.name)} subtitle={`${tr(content.decks[content.recipes[r].station].name)} · ×${fmt(content.recipes[r].inputs[id])}`} chevron onPress={() => onRecipe(r)} />;
        })}
        {uses.length > MAX_USES ? <Txt variant="label" color="inkDim">{t("item.more", { count: uses.length - MAX_USES })}</Txt> : null}
        {uses.length === 0 ? <Txt variant="body" color="inkDim">{t(spec ? "item.useConsumable" : "item.useNone")}</Txt> : null}
      </View>
    </Sheet>
  );
}

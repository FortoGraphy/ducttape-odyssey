// Log tab, "cosmetics": hull paint, engine trail, panel stickers and desk toys. Purely visual,
// unlocked by play (start, chapter, achievement) or bought for stamps.
import { memo, useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { content } from "@/content";
import * as B from "@/engine/big";
import type { CosmeticDef, FailReason } from "@/engine/types";
import { buyCosmetic, equipCosmetic } from "@/engine/meta";
import { useT, useTr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { act, getGame, useGame } from "@/store/game";
import { fmt } from "@/ui/format";
import { Badge, Col, CostTag, Icon, Key, MicroLabel, Row, ScrollWell, Segmented, toast, Txt, useTheme } from "@/ui/kit";
import { palette, space, type PaletteKey } from "@/ui/theme";

type Kind = CosmeticDef["kind"];
const KINDS: Kind[] = ["paint", "trail", "sticker", "toy"];
const ROW = 72;
const all: CosmeticDef[] = Object.values(content.cosmetics);

function Preview({ def, dim }: { def: CosmeticDef; dim: boolean }) {
  const theme = useTheme();
  const color = palette[def.value as PaletteKey] ?? palette.steel2;
  if (def.kind === "paint") {
    return (
      <View style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: palette.void1, alignItems: "center", justifyContent: "center", opacity: dim ? 0.5 : 1 }}>
        <View style={{ width: 28, height: 16, borderRadius: 3, backgroundColor: color, borderBottomWidth: 4, borderBottomColor: "rgba(0,0,0,0.35)" }} />
      </View>
    );
  }
  if (def.kind === "trail") {
    return (
      <View style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: palette.void1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2, opacity: dim ? 0.5 : 1 }}>
        {[0.25, 0.5, 0.75, 1].map((o, i) => (
          <View key={i} style={{ width: 4 + i, height: 4 + i * 3, borderRadius: 2, backgroundColor: color, opacity: o }} />
        ))}
      </View>
    );
  }
  return (
    <View style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: palette.void1, alignItems: "center", justifyContent: "center", opacity: dim ? 0.5 : 1, borderWidth: 1, borderColor: theme.rule }}>
      <Icon name={def.value} size={32} />
    </View>
  );
}

interface RowState {
  owned: boolean;
  equipped: boolean;
  affordable: boolean;
}

const CosmeticRow = memo(function CosmeticRow({ def, owned, equipped, affordable, onBuy, onEquip }: RowState & { def: CosmeticDef; onBuy: (d: CosmeticDef) => void; onEquip: (d: CosmeticDef) => void }) {
  const t = useT("log");
  const tr = useTr();
  const theme = useTheme();
  const u = def.unlock;
  let lock = "";
  if (!owned && u.stamps === undefined) {
    if (u.chapter !== undefined) lock = t("cosmetics.lockChapter", { n: u.chapter });
    else if (u.achievement !== undefined) {
      const a = content.achievements.find((x) => x.id === u.achievement);
      lock = t("cosmetics.lockAchievement", { name: a ? tr(a.name) : u.achievement });
    } else lock = t("cosmetics.lockUnknown");
  }
  return (
    <Row gap="sm" style={{ height: ROW, paddingHorizontal: space.sm, borderBottomWidth: 1, borderBottomColor: theme.rule, backgroundColor: equipped ? theme.plate : "transparent" }} testID={`cosmetic-${def.id}`}>
      <Preview def={def} dim={!owned} />
      <Col gap={0} flex>
        <Row gap="xs">
          <Txt variant="bodyBold" color={owned ? "ink" : "inkDim"} numberOfLines={1} style={{ flexShrink: 1 }}>
            {tr(def.name)}
          </Txt>
          {equipped ? <Badge label={t("cosmetics.on")} tone="good" /> : null}
        </Row>
        <Txt variant="label" color="inkDim" numberOfLines={2} style={{ lineHeight: 13 }}>
          {lock || tr(def.desc)}
        </Txt>
      </Col>
      {owned ? (
        <Key size="md" width={84} label={equipped ? (def.kind === "paint" ? t("cosmetics.worn") : t("cosmetics.takeOff")) : t("cosmetics.equip")} tone={equipped ? "black" : "cobalt"} disabled={equipped && def.kind === "paint"} onPress={() => onEquip(def)} testID={`equip-${def.id}`} />
      ) : u.stamps !== undefined ? (
        <Key size="md" width={84} tone="orange" onPress={() => onBuy(def)} accessibilityLabel={t("cosmetics.buy")} testID={`buy-${def.id}`}>
          <Col gap={0} align="center">
            <Txt variant="key" color="onAccent" upper>
              {t("cosmetics.buy")}
            </Txt>
            <CostTag icon="stamp" amount={fmt(u.stamps)} affordable={affordable} size="sm" />
          </Col>
        </Key>
      ) : (
        <View style={{ width: 84, alignItems: "center" }}>
          <Icon name="lock" size={24} />
        </View>
      )}
    </Row>
  );
});

export function CosmeticsSection() {
  const t = useT("log");
  const [kind, setKind] = useState<Kind>("paint");
  const sig = useGame((g) => {
    const c = g.state.cosmetics;
    return `${c.owned.length}|${c.paint}|${c.trail}|${c.toy}|${c.stickers.join(",")}|${g.state.prestige.stamps.m}e${g.state.prestige.stamps.e}`;
  }, undefined, 3);
  const stamps = useGame((g) => fmt(g.state.prestige.stamps), undefined, 3);

  const rows = useMemo(() => {
    const g = getGame();
    const c = g.state.cosmetics;
    return all
      .filter((d) => d.kind === kind)
      .map((def) => {
        const owned = c.owned.indexOf(def.id) >= 0;
        const equipped = def.kind === "sticker" ? c.stickers.indexOf(def.id) >= 0 : c[def.kind] === def.id;
        const affordable = def.unlock.stamps !== undefined && B.cmp(g.state.prestige.stamps, B.big(def.unlock.stamps)) >= 0;
        return { def, owned, equipped, affordable };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, sig]);
  const ownedCount = rows.filter((r) => r.owned).length;

  const fail = useCallback(
    (reason: FailReason) => {
      sfx("deny");
      haptic("error");
      toast(t(`cosmetics.fail_${reason === "credits" || reason === "max" || reason === "locked" ? reason : "other"}`), "bad");
    },
    [t],
  );
  const onBuy = useCallback(
    (def: CosmeticDef) => {
      const r = act((g) => buyCosmetic(g, def.id));
      if (!r.ok) return fail(r.reason);
      sfx("buy");
      haptic("success");
      toast(t("cosmetics.bought"), { tone: "good", icon: "stamp" });
    },
    [fail, t],
  );
  const onEquip = useCallback(
    (def: CosmeticDef) => {
      const r = act((g) => equipCosmetic(g, def.id));
      if (!r.ok) return fail(r.reason);
      sfx("moduleInstall");
    },
    [fail],
  );

  return (
    <>
      <Col gap="xs" style={{ paddingHorizontal: space.md, paddingBottom: space.sm }}>
        <Segmented<Kind> size="sm" options={KINDS.map((k) => ({ value: k, label: t(`cosmetics.kind.${k}`) }))} value={kind} onChange={setKind} />
        <Row justify="space-between">
          <MicroLabel size="label" color="ink">
            {t("cosmetics.owned", { n: ownedCount, total: rows.length })}
          </MicroLabel>
          <Row gap="xs">
            <MicroLabel size="label">{kind === "sticker" ? t("cosmetics.stickerLimit") : t("cosmetics.stamps")}</MicroLabel>
            <CostTag icon="stamp" amount={stamps} size="sm" />
          </Row>
        </Row>
      </Col>
      <ScrollWell
        data={rows}
        padding={0}
        radius={0}
        style={{ flex: 1 }}
        keyExtractor={(r) => r.def.id}
        renderItem={({ item }) => <CosmeticRow def={item.def} owned={item.owned} equipped={item.equipped} affordable={item.affordable} onBuy={onBuy} onEquip={onEquip} />}
        getItemLayout={(_, index) => ({ length: ROW, offset: ROW * index, index })}
      />
    </>
  );
}

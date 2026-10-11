// The three factions: who they are, what they want, where the player stands and what that buys.
import { ScrollView, View } from "react-native";

import { content } from "@/content";
import type { FactionId } from "@/engine/types";
import { getRep } from "@/engine/world";
import { useT, useTr } from "@/i18n";
import { useGame } from "@/store/game";
import { Badge, Card, Chip, Col, Icon, MicroLabel, Row, Txt } from "@/ui/kit";
import { space } from "@/ui/theme";

import { FACTION_IDS, factionColor, fmtRep, Note, RepBar, standingOf, standingTone, type TFn } from "./shared";

const SHOP_BY_FACTION: Record<FactionId, { id: string; repMin: number }[]> = (() => {
  const out: Record<FactionId, { id: string; repMin: number }[]> = { lamplighters: [], rustborn: [], ledger: [] };
  for (const id in content.shop) {
    const def = content.shop[id];
    if (def.faction) out[def.faction].push({ id, repMin: def.repMin ?? 0 });
  }
  for (const f of FACTION_IDS) out[f].sort((a, b) => a.repMin - b.repMin);
  return out;
})();

function Perk({ icon, text, tone }: { icon: string; text: string; tone: "good" | "bad" | "inkDim" | "ink" }) {
  return (
    <Row gap="sm" align="flex-start">
      <Icon name={icon} size={16} chip />
      <Txt variant="label" color={tone} style={{ flex: 1, lineHeight: 15 }}>
        {text}
      </Txt>
    </Row>
  );
}

function FactionCard({ id, rep, best }: { id: FactionId; rep: number; best: boolean }) {
  const t = useT("crew") as TFn;
  const tr = useTr();
  const def = content.factions[id];
  const standing = standingOf(rep);
  return (
    <Card padding={space.sm} gap={space.sm} style={{ borderLeftWidth: 4, borderLeftColor: factionColor(id) }}>
      <View testID={`faction-${id}`} style={{ gap: space.sm }}>
        <Row gap="sm">
          <Icon name={`fac_${id}`} size={24} chip />
          <Txt variant="heading" numberOfLines={1} style={{ flex: 1 }}>
            {tr(def.name)}
          </Txt>
          <Badge label={t(`standing.${standing}`)} tone={standingTone(standing)} style={{ alignSelf: "center" }} />
        </Row>
        <Txt variant="body" color="inkDim">
          {tr(def.desc)}
        </Txt>
        <Row gap="sm">
          <MicroLabel size="label">{t("faction.rep")}</MicroLabel>
          <RepBar rep={rep} faction={id} style={{ flex: 1 }} />
          <Txt variant="bodyBold" tabular>
            {fmtRep(rep)}
          </Txt>
        </Row>
        <Col gap="xs">
          <MicroLabel size="label">{t("faction.likes")}</MicroLabel>
          <Row gap="xs" wrap>
            {def.likes.map((c) => (
              <Chip key={c} label={t(`category.${c}`)} />
            ))}
          </Row>
        </Col>
        <Col gap="xs">
          <MicroLabel size="label">{t("faction.standingTitle")}</MicroLabel>
          <Perk icon="coin" text={t(rep > 0 ? "faction.pricesGood" : rep < 0 ? "faction.pricesBad" : "faction.pricesNeutral")} tone={rep > 0 ? "good" : rep < 0 ? "bad" : "inkDim"} />
          {SHOP_BY_FACTION[id].map((s) => {
            const open = rep >= s.repMin;
            return (
              <Perk
                key={s.id}
                icon={open ? "check" : "lock"}
                text={s.repMin > 0 ? t("faction.shopTier", { name: tr(content.shop[s.id].name), n: s.repMin }) : t("faction.shopOpen", { name: tr(content.shop[s.id].name) })}
                tone={open ? "ink" : "inkDim"}
              />
            );
          })}
          <Perk icon="tow" text={best ? t("faction.towBest") : t("faction.towOther")} tone={best ? "bad" : "inkDim"} />
        </Col>
      </View>
    </Card>
  );
}

export default function FactionsSection() {
  const t = useT("crew") as TFn;
  const reps = useGame((g) => FACTION_IDS.map((f) => Math.round(getRep(g, f))), undefined, 10);
  // The tow takes reputation from whoever likes the player most (first one wins a tie, as in the engine).
  let best = 0;
  for (let i = 1; i < reps.length; i++) if (reps[i] > reps[best]) best = i;
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingBottom: space.md }}>
      <Note text={t("faction.intro")} />
      {FACTION_IDS.map((f, i) => (
        <FactionCard key={f} id={f} rep={reps[i]} best={i === best} />
      ))}
    </ScrollView>
  );
}

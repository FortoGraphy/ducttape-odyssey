// Station: docking, the station's identity and standing, and the five services behind the airlock.
import { useCallback, useMemo, useState, type ReactElement } from "react";
import { ScrollView, View } from "react-native";

import { content } from "@/content";
import type { FactionId, Game, L10n } from "@/engine/types";
import { coreDepth, currentSystem, dock, getRep, hasStation, stationHere, stationLabel, systemAt, undock } from "@/engine/world";
import { useT, useTr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { getGame, useGame } from "@/store/game";
import { goTo } from "@/store/ui";
import { Badge, Card, Chip, Col, Icon, Key, Row, toast, Txt } from "@/ui/kit";
import { space } from "@/ui/theme";

import Market from "./Market";
import { Contracts, Hiring, RepairDock, Shop } from "./Services";
import { doAct, fmtRep, LockTeaser, Note, RepBar, standingOf, standingTone, type TFn } from "./shared";

export const STATION_SUBS = ["market", "contracts", "shop", "repair", "hire"] as const;
export type StationSub = (typeof STATION_SUBS)[number];

const SUB_ICON: Record<StationSub, string> = { market: "sell", contracts: "quest", shop: "upgrade", repair: "repair", hire: "hire" };

// ---------- where is the next station -------------------------------------------------

interface StationHint {
  name: L10n;
  depth: number;
  jumps: number;
}

const LOOK_AHEAD = 8;

/** The closest station among visited systems, and the first one on any route ahead (as the nav chart shows them). */
function nearestStations(g: Game): { back: StationHint | null; ahead: StationHint | null } {
  const nav = g.state.nav;
  const seed = g.state.seed;
  let back: StationHint | null = null;
  for (const key in nav.visited) {
    const p = key.split(":");
    const depth = Number(p[1]);
    const lane = Number(p[2]);
    if (Number(p[0]) !== nav.g || !Number.isInteger(depth) || !Number.isInteger(lane) || (depth === nav.depth && lane === nav.lane)) continue;
    const jumps = Math.abs(depth - nav.depth);
    if (jumps === 0 || (back && back.jumps <= jumps) || !hasStation(g.content, seed, nav.g, depth, lane)) continue;
    const name = stationLabel(g.content, systemAt(g, depth, lane));
    if (name) back = { name, depth, jumps };
  }
  let ahead: StationHint | null = null;
  let frontier = [nav.lane];
  const core = coreDepth(g);
  for (let d = nav.depth + 1; d <= Math.min(core, nav.depth + LOOK_AHEAD) && !ahead; d++) {
    const next: number[] = [];
    for (const lane of frontier) for (const l of systemAt(g, d - 1, lane).links) if (!next.includes(l)) next.push(l);
    next.sort((a, b) => a - b);
    for (const lane of next) {
      if (!hasStation(g.content, seed, nav.g, d, lane)) continue;
      const name = stationLabel(g.content, systemAt(g, d, lane));
      if (name) {
        ahead = { name, depth: d, jumps: d - nav.depth };
        break;
      }
    }
    frontier = next;
  }
  return { back, ahead };
}

function NoStation({ jumping }: { jumping: boolean }) {
  const t = useT("crew") as TFn;
  const tr = useTr();
  const where = useGame((g) => `${g.state.nav.g}:${g.state.nav.depth}:${g.state.nav.lane}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed when the ship moves
  const near = useMemo(() => nearestStations(getGame()), [where]);
  const line = (h: StationHint, key: string) => (
    <Row gap="sm" align="flex-start">
      <Icon name="station" size={24} chip />
      <Col gap={1} flex>
        <Txt variant="bodyBold" numberOfLines={1}>
          {tr(h.name)}
        </Txt>
        <Txt variant="label" color="inkDim">
          {t(key, { depth: h.depth, count: h.jumps })}
        </Txt>
      </Col>
    </Row>
  );
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingBottom: space.md }}>
      <Card padding={space.md} gap={space.sm}>
        <View testID="no-station" style={{ gap: space.sm }}>
          <Row gap="sm">
            <Icon name="signal" size={24} chip />
            <Txt variant="heading" style={{ flex: 1 }}>
              {jumping ? t("station.jumpingTitle") : t("station.noneTitle")}
            </Txt>
          </Row>
          <Txt variant="body" color="inkDim">
            {jumping ? t("station.jumpingBody") : t("station.noneBody")}
          </Txt>
          {near.ahead ? line(near.ahead, "station.ahead") : null}
          {near.back ? line(near.back, "station.behind") : null}
          {!near.ahead && !near.back ? <Note text={t("station.noneKnown")} /> : null}
          <Key label={t("station.openNav")} icon="tab_nav" tone="cobalt" size="sm" onPress={() => goTo("nav")} testID="open-nav" />
        </View>
      </Card>
      <Note text={t("station.deliverAnywhere")} />
    </ScrollView>
  );
}

// ---------- station header ------------------------------------------------------------

function StationHeader({ faction, rep, docked, name }: { faction: FactionId; rep: number; docked: boolean; name: string }) {
  const t = useT("crew") as TFn;
  const tr = useTr();
  const standing = standingOf(rep);
  const toggle = useCallback(() => {
    const res = doAct((g) => (g.state.station.docked ? undock(g) : dock(g)));
    if (res.ok) {
      sfx("dock");
      haptic("success");
    } else {
      sfx("deny");
      toast(t(`fail.${res.reason}`), "bad");
    }
  }, [t]);
  return (
    <Card padding={space.sm} gap={space.xs} style={{ marginBottom: space.sm }}>
      <Row gap="sm">
        <Icon name={`fac_${faction}`} size={24} chip />
        <Col gap={0} flex>
          <Txt variant="heading" numberOfLines={1}>
            {name}
          </Txt>
          <Txt variant="label" color="inkDim" numberOfLines={1}>
            {tr(content.factions[faction].name)}
          </Txt>
        </Col>
        <Key label={docked ? t("station.undock") : t("station.dock")} icon={docked ? "undock" : "dock_station"} tone={docked ? "black" : "orange"} size="sm" onPress={toggle} sound={null} testID="dock-toggle" />
      </Row>
      <Row gap="sm">
        <RepBar rep={rep} faction={faction} style={{ flex: 1 }} />
        <Txt variant="label" tabular>
          {fmtRep(rep)}
        </Txt>
        <Badge label={t(`standing.${standing}`)} tone={standingTone(standing)} style={{ alignSelf: "center" }} />
      </Row>
    </Card>
  );
}

// ---------- section -------------------------------------------------------------------

export default function StationSection({ initialSub }: { initialSub?: StationSub }) {
  const t = useT("crew") as TFn;
  const tr = useTr();
  const [sub, setSub] = useState<StationSub>(initialSub ?? "market");
  const st = useGame((g) => {
    const here = stationHere(g);
    return {
      feature: g.state.features.station === 1,
      sys: currentSystem(g).id,
      faction: here ? here.faction : null,
      docked: g.state.station.docked && here !== null,
      jumping: g.state.nav.jump !== null,
      rep: here ? Math.round(getRep(g, here.faction)) : 0,
    };
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the label is a pure function of the system
  const name = useMemo(() => tr(stationLabel(content, currentSystem(getGame())) ?? undefined), [st.sys, tr]);

  if (!st.feature) return <LockTeaser icon="station" title={t("locked.stationTitle")} body={t("locked.stationBody")} how={t("locked.how")} testID="station-locked" />;
  if (!st.faction) return <NoStation jumping={st.jumping} />;

  const header: ReactElement = <StationHeader faction={st.faction} rep={st.rep} docked={st.docked} name={name} />;

  if (!st.docked) {
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.md }}>
        {header}
        <Card padding={space.md} gap={space.sm}>
          <Txt variant="body" color="inkDim">
            {t("station.undockedBody")}
          </Txt>
          {STATION_SUBS.map((id) => (
            <Row key={id} gap="sm">
              <Icon name={SUB_ICON[id]} size={16} chip />
              <Col gap={0} flex>
                <Txt variant="bodyBold">{t(`sub.${id}`)}</Txt>
                <Txt variant="label" color="inkDim" numberOfLines={2} style={{ lineHeight: 15 }}>
                  {t(`subHint.${id}`)}
                </Txt>
              </Col>
            </Row>
          ))}
        </Card>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Row gap={6} style={{ paddingBottom: space.sm, paddingTop: 2 }}>
        {STATION_SUBS.map((id) => (
          <Chip key={id} label={t(`sub.${id}`)} selected={sub === id} onPress={() => setSub(id)} />
        ))}
      </Row>
      {sub === "market" ? <Market header={header} faction={st.faction} /> : null}
      {sub === "contracts" ? <Contracts header={header} /> : null}
      {sub === "shop" ? <Shop header={header} faction={st.faction} /> : null}
      {sub === "repair" ? <RepairDock header={header} /> : null}
      {sub === "hire" ? <Hiring header={header} /> : null}
    </View>
  );
}

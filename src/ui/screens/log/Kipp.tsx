// Log tab, "KIPP archive": the remarks heard so far, latest first. The save keeps only the ids of
// the last dozen lines; lines heard in this session are remembered with their variables as well.
import { memo, useMemo } from "react";
import { View } from "react-native";

import { KIPP_RECENT, formatLine, kippLine } from "@/engine/meta";
import { useT, useTr } from "@/i18n";
import { getGame, onEngineEvent, useGame } from "@/store/game";
import { Col, EmptyState, Icon, MicroLabel, Row, ScrollWell, Txt, useTheme } from "@/ui/kit";
import { space } from "@/ui/theme";

interface Heard {
  uid: number;
  id: string;
  vars?: Record<string, string | number>;
  /** False for lines restored from the save (their variables are gone). */
  live: boolean;
}

const SESSION_MAX = 60;
const session: Heard[] = [];
let nextUid = 1;

onEngineEvent((ev) => {
  if (ev.t !== "kipp") return;
  session.unshift({ uid: nextUid++, id: ev.line, vars: ev.vars, live: true });
  if (session.length > SESSION_MAX) session.length = SESSION_MAX;
});

const Line = memo(function Line({ heard, first }: { heard: Heard; first: boolean }) {
  const tr = useTr();
  const theme = useTheme();
  const g = getGame();
  const def = kippLine(g, heard.id);
  if (!def) return null;
  const base = { name: g.state.player.name, ship: g.state.player.ship, player: g.state.player.name };
  // A line restored from the save lost its numbers: print a neutral mark instead of a raw placeholder.
  const text = formatLine(tr(def.text), { ...base, ...heard.vars }).replace(/\{\w+\}/g, "…");
  return (
    <Row gap="sm" align="flex-start" style={{ backgroundColor: first ? theme.plate : "transparent", borderRadius: 6, padding: space.sm }}>
      <Icon name="kipp" size={24} chip />
      <Col gap={2} flex>
        <Txt color={first ? "ink" : "inkDim"} style={{ lineHeight: 20 }}>
          {text}
        </Txt>
      </Col>
    </Row>
  );
});

export function KippSection() {
  const t = useT("log");
  const sig = useGame((g) => `${g.state.stats.kippLines ?? 0}:${g.state.story.kippRecent.length}`, undefined, 5);
  const spoken = useGame((g) => g.state.stats.kippLines ?? 0, undefined, 5);
  const lines = useMemo(() => {
    const out: Heard[] = session.slice();
    const seen: Record<string, true> = {};
    for (const h of out) seen[h.id] = true;
    const recent = getGame().state.story.kippRecent;
    for (let i = recent.length - 1; i >= 0; i--) {
      if (!seen[recent[i]]) out.push({ uid: -1 - i, id: recent[i], live: false });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return (
    <>
      <Row justify="space-between" style={{ paddingHorizontal: space.md, paddingBottom: space.sm }}>
        <Txt variant="bodyBold" testID="kipp-count">
          {t("kipp.count", { count: spoken })}
        </Txt>
        <MicroLabel>{t("kipp.kept", { n: KIPP_RECENT })}</MicroLabel>
      </Row>
      {lines.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center" }}>
          <EmptyState compact icon="kipp" title={t("kipp.emptyTitle")} hint={t("kipp.emptyHint")} />
        </View>
      ) : (
        <ScrollWell data={lines} padding={space.sm} radius={0} style={{ flex: 1 }} keyExtractor={(h) => String(h.uid)} renderItem={({ item, index }) => <Line heard={item} first={index === 0} />} initialNumToRender={10} />
      )}
    </>
  );
}

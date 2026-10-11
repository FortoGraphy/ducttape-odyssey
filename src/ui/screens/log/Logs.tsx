// Log tab, "crew logs": the sixty found-audio diaries as cassette rows, a comfortable reader, and
// numbered blanks for the ones still out there.
import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { content } from "@/content";
import type { LogDef } from "@/engine/types";
import { useT, useTr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { useGame, getGame } from "@/store/game";
import { Col, Key, KeyRow, MicroLabel, ProgressBar, Row, ScrollWell, Sheet, Txt, useTheme } from "@/ui/kit";
import { palette, space } from "@/ui/theme";

const ROW = 60;
const sorted: LogDef[] = [...content.logs].sort((a, b) => a.order - b.order);

function Cassette({ n, found }: { n: number; found: boolean }) {
  const theme = useTheme();
  const shell = found ? palette.steel0 : "transparent";
  const reel = found ? palette.bone1 : theme.rule;
  return (
    <View style={{ width: 52, height: 34, borderRadius: 4, backgroundColor: shell, borderWidth: 1, borderColor: found ? palette.void0 : theme.rule, borderStyle: found ? "solid" : "dashed", padding: 3, justifyContent: "space-between" }}>
      <View style={{ height: 11, borderRadius: 2, backgroundColor: found ? palette.orange : "transparent", alignItems: "center", justifyContent: "center" }}>
        <Txt variant="micro" color={found ? palette.void0 : "inkDim"} style={{ lineHeight: 10 }}>
          {String(n).padStart(2, "0")}
        </Txt>
      </View>
      <Row gap={0} justify="space-around">
        <View style={{ width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: reel }} />
        <View style={{ width: 12, height: 5, borderRadius: 1, backgroundColor: found ? palette.void0 : "transparent" }} />
        <View style={{ width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: reel }} />
      </Row>
    </View>
  );
}

const LogRow = memo(function LogRow({ log, found, onOpen }: { log: LogDef; found: boolean; onOpen: (log: LogDef) => void }) {
  const t = useT("log");
  const tr = useTr();
  const theme = useTheme();
  return (
    <Pressable
      disabled={!found}
      onPress={() => {
        haptic("tap");
        sfx("uiOpen");
        onOpen(log);
      }}
      accessibilityRole="button"
      accessibilityLabel={found ? tr(log.title) : t("logs.blank", { n: log.order })}
      testID={`log-${log.order}`}
      style={({ pressed }) => ({ height: ROW, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm, backgroundColor: pressed ? theme.platePressed : found ? theme.plate : "transparent", borderBottomWidth: 1, borderBottomColor: theme.rule })}
    >
      <Cassette n={log.order} found={found} />
      <Col gap={0} flex>
        <Txt variant="bodyBold" color={found ? "ink" : "inkDim"} numberOfLines={1}>
          {found ? tr(log.title) : t("logs.blank", { n: log.order })}
        </Txt>
        <Txt variant="label" color="inkDim" numberOfLines={1}>
          {found ? tr(log.author) : t("logs.blankHint")}
        </Txt>
      </Col>
    </Pressable>
  );
});

export function LogsSection() {
  const t = useT("log");
  const tr = useTr();
  const count = useGame((g) => g.state.story.logs.length, undefined, 5);
  const [open, setOpen] = useState<LogDef | null>(null);
  const found = useMemo(() => {
    const set: Record<string, true> = {};
    for (const id of getGame().state.story.logs) set[id] = true;
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);
  const onOpen = useCallback((log: LogDef) => setOpen(log), []);
  const step = useCallback(
    (dir: 1 | -1) => {
      if (!open) return;
      let i = sorted.indexOf(open) + dir;
      while (i >= 0 && i < sorted.length && !found[sorted[i].id]) i += dir;
      if (i >= 0 && i < sorted.length) setOpen(sorted[i]);
    },
    [found, open],
  );
  const hasPrev = open ? sorted.slice(0, sorted.indexOf(open)).some((l) => found[l.id]) : false;
  const hasNext = open ? sorted.slice(sorted.indexOf(open) + 1).some((l) => found[l.id]) : false;

  return (
    <>
      <Col gap="xs" style={{ paddingHorizontal: space.md, paddingBottom: space.sm }}>
        <Row justify="space-between">
          <Txt variant="bodyBold" testID="logs-count">
            {t("logs.count", { n: count, total: sorted.length })}
          </Txt>
          <MicroLabel>{t("logs.tapes")}</MicroLabel>
        </Row>
        <ProgressBar value={sorted.length ? count / sorted.length : 0} tone="orange" height={5} />
        <Txt variant="label" color="inkDim" style={{ lineHeight: 14 }}>
          {t("logs.where")}
        </Txt>
      </Col>
      <ScrollWell
        data={sorted}
        padding={0}
        radius={0}
        style={{ flex: 1 }}
        keyExtractor={(l) => l.id}
        renderItem={({ item }) => <LogRow log={item} found={found[item.id] === true} onOpen={onOpen} />}
        getItemLayout={(_, index) => ({ length: ROW, offset: ROW * index, index })}
        extraData={found}
        initialNumToRender={8}
        windowSize={7}
      />
      <Sheet
        visible={open !== null}
        onClose={() => setOpen(null)}
        title={open ? t("logs.nOf", { n: open.order, total: sorted.length }) : ""}
        testID="log-reader"
        footer={
          <KeyRow>
            <Key size="sm" icon="left" label={t("logs.prev")} disabled={!hasPrev} onPress={() => step(-1)} testID="log-prev" />
            <Key size="sm" icon="right" label={t("logs.next")} disabled={!hasNext} onPress={() => step(1)} testID="log-next" />
          </KeyRow>
        }
      >
        {open ? (
          <Col gap="sm" style={{ paddingBottom: space.lg, maxWidth: 520, alignSelf: "center" }}>
            <Row gap="sm">
              <Cassette n={open.order} found />
              <Col gap={0} flex>
                <MicroLabel size="label" color="orange">
                  {tr(open.author)}
                </MicroLabel>
                <Txt variant="heading">{tr(open.title)}</Txt>
              </Col>
            </Row>
            <Txt style={{ lineHeight: 22, fontSize: 14 }} selectable>
              {tr(open.text)}
            </Txt>
            <MicroLabel align="center">{t("logs.endOfTape")}</MicroLabel>
          </Col>
        ) : null}
      </Sheet>
    </>
  );
}

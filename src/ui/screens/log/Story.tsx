// Log tab, "story": the current chapter with its objectives, the chosen ending, the endless
// Backlog ticket and a timeline of all chapters (reached ones can be read again).
import { memo, useMemo, useState } from "react";
import { View } from "react-native";

import { content } from "@/content";
import type { ChapterDef, StoryBeat } from "@/engine/types";
import { backlogTicket, finalChapter, objectives } from "@/engine/meta";
import { useT, useTr } from "@/i18n";
import { getGame, useGame } from "@/store/game";
import { fmt } from "@/ui/format";
import { Badge, Card, Col, CostTag, Icon, Led, ListRow, MicroLabel, ProgressBar, Row, Rule, ScrollWell, Sheet, Txt, useTheme } from "@/ui/kit";
import { space } from "@/ui/theme";

const SPEAKER_ICON: Record<StoryBeat["speaker"], string> = { kipp: "kipp", signal: "signal", log: "book", narrator: "info", crew: "crew" };

const Beat = memo(function Beat({ beat }: { beat: StoryBeat }) {
  const t = useT("log");
  const tr = useTr();
  const vars = { name: getGame().state.player.name, ship: getGame().state.player.ship, player: getGame().state.player.name };
  const narrator = beat.speaker === "narrator";
  return (
    <Row gap="sm" align="flex-start">
      <Icon name={SPEAKER_ICON[beat.speaker]} size={24} chip />
      <Col gap={2} flex>
        <MicroLabel size="label" color={beat.speaker === "kipp" ? "orange" : "inkDim"}>
          {t(`speaker.${beat.speaker}`)}
        </MicroLabel>
        <Txt color={narrator ? "inkDim" : "ink"} style={{ lineHeight: 21 }}>
          {tr(beat.text, vars)}
        </Txt>
      </Col>
    </Row>
  );
});

export function StorySection() {
  const t = useT("log");
  const tr = useTr();
  const theme = useTheme();
  const [reader, setReader] = useState<ChapterDef | null>(null);
  const [epilogue, setEpilogue] = useState(false);
  // Compact signature: everything this section renders changes with one of these.
  const sig = useGame(
    (g) => {
      const o = objectives(g);
      let s = `${g.state.story.chapter}|${g.state.story.ending ?? ""}|`;
      for (let i = 0; i < o.length; i++) s += `${o[i].done ? 1 : 0}${o[i].progress ?? ""},`;
      return s;
    },
    undefined,
    5,
  );
  const view = useMemo(() => {
    const g = getGame();
    const ticket = backlogTicket(g);
    return {
      chapter: g.state.story.chapter,
      last: finalChapter(g),
      // the counted goal is the Backlog ticket: it has its own card below
      objectives: objectives(g)
        .filter((o) => o.target === undefined)
        .map((o) => ({ ...o })),
      ending: g.state.story.ending ? (content.endings.find((e) => e.id === g.state.story.ending) ?? null) : null,
      ticket: ticket ? { ...ticket, flavor: content.backlogTickets.length ? content.backlogTickets[(ticket.n - 1) % content.backlogTickets.length] : null } : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const current = content.chapters.find((c) => c.id === view.chapter);
  const chapters = useMemo(() => [...content.chapters].sort((a, b) => a.id - b.id), []);

  return (
    <>
      <ScrollWell padding={space.md} radius={0} style={{ flex: 1 }} contentContainerStyle={{ gap: space.sm, paddingBottom: space.xl }}>
        <Card
          title={current ? t("story.chapterN", { n: view.chapter, total: view.last }) : t("story.prologue")}
          titleRight={current && view.objectives.length > 0 ? <Badge label={`${view.objectives.filter((o) => o.done).length}/${view.objectives.length}`} tone="info" /> : undefined}
          gap={6}
        >
          <Txt variant="heading" testID="story-title">
            {current ? tr(current.title) : t("story.prologueTitle")}
          </Txt>
          {view.objectives.length === 0 ? (
            <Txt variant="label" color="inkDim">
              {!current ? t("story.prologueHint") : view.ending ? t("story.closed") : t("story.noObjectives")}
            </Txt>
          ) : (
            view.objectives.map((o, i) => (
              <Row key={i} gap="sm" align="flex-start">
                <View style={{ paddingTop: 5 }}>
                  <Led color="mint" on={o.done} size={8} />
                </View>
                <Col gap={2} flex>
                  <Txt color={o.done ? "inkDim" : "ink"} style={o.done ? { textDecorationLine: "line-through" } : undefined}>
                    {tr(o.text)}
                  </Txt>
                </Col>
                {o.done ? <Icon name="check" size={16} /> : null}
              </Row>
            ))
          )}
        </Card>

        {view.ending ? (
          <Card title={t("story.ending")} onPress={() => setEpilogue(true)} accessibilityLabel={t("story.ending")} gap={4}>
            <Row gap="sm">
              <Icon name="signal" size={24} chip />
              <Col gap={0} flex>
                <Txt variant="bodyBold">{tr(view.ending.title)}</Txt>
                <Txt variant="label" color="inkDim" numberOfLines={2} style={{ lineHeight: 14 }}>
                  {tr(view.ending.epilogue)}
                </Txt>
              </Col>
              <Icon name="right" size={16} />
            </Row>
          </Card>
        ) : null}

        {view.ticket ? (
          <Card title={t("story.backlog")} titleRight={<Badge label={t("story.ticketN", { n: view.ticket.n })} tone="warn" />} gap={6}>
            {view.ticket.flavor ? (
              <>
                <Txt variant="bodyBold">{tr(view.ticket.flavor.title)}</Txt>
                <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
                  {tr(view.ticket.flavor.text)}
                </Txt>
              </>
            ) : null}
            <Txt>{tr(view.ticket.text)}</Txt>
            <ProgressBar value={view.ticket.progress / Math.max(1, view.ticket.target)} tone="cobalt" segments={16} height={8} />
            <Row justify="space-between">
              <Txt variant="label" color="inkDim">{`${fmt(view.ticket.progress)} / ${fmt(view.ticket.target)}`}</Txt>
              <Row gap="xs">
                <MicroLabel>{t("story.reward")}</MicroLabel>
                <CostTag icon="stamp" amount={fmt(view.ticket.reward)} size="sm" />
              </Row>
            </Row>
          </Card>
        ) : null}

        <Rule label={t("story.timeline")} />
        <View style={{ backgroundColor: theme.plate, borderRadius: 6, overflow: "hidden" }}>
          {chapters.map((c, i) => {
            const reached = c.id <= view.chapter;
            return (
              <ListRow
                key={c.id}
                title={tr(c.title)}
                subtitle={reached ? (c.id === view.chapter ? t("story.now") : t("story.read")) : t("story.locked")}
                left={
                  <View style={{ width: 32, alignItems: "center" }}>
                    <Txt variant="lcdM" color={reached ? "ink" : "inkDim"}>
                      {String(c.id).padStart(2, "0")}
                    </Txt>
                  </View>
                }
                right={reached ? undefined : <Icon name="lock" size={16} />}
                chevron={reached}
                locked={!reached}
                selected={c.id === view.chapter}
                onPress={reached ? () => setReader(c) : undefined}
                divider={i < chapters.length - 1}
                testID={`chapter-${c.id}`}
              />
            );
          })}
        </View>
      </ScrollWell>

      <Sheet visible={reader !== null} onClose={() => setReader(null)} title={reader ? t("story.chapterN", { n: reader.id, total: view.last }) : ""} testID="chapter-reader">
        {reader ? (
          <Col gap="md" style={{ paddingBottom: space.lg }}>
            <Txt variant="title">{tr(reader.title)}</Txt>
            {reader.intro.length === 0 ? <Txt color="inkDim">{t("story.noBeats")}</Txt> : reader.intro.map((b, i) => <Beat key={i} beat={b} />)}
          </Col>
        ) : null}
      </Sheet>

      <Sheet visible={epilogue && view.ending !== null} onClose={() => setEpilogue(false)} title={t("story.ending")} testID="ending-reader">
        {view.ending ? (
          <Col gap="md" style={{ paddingBottom: space.lg }}>
            <Txt variant="title">{tr(view.ending.title)}</Txt>
            <Txt color="inkDim" style={{ lineHeight: 21 }}>
              {tr(view.ending.text)}
            </Txt>
            <Rule label={t("story.epilogue")} />
            <Txt style={{ lineHeight: 21 }}>{tr(view.ending.epilogue)}</Txt>
          </Col>
        ) : null}
      </Sheet>
    </>
  );
}

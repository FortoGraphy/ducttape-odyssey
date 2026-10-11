// Ship's log tasks: three daily quests, the gentle streak and the weekly challenge with its
// optional mutator.
import { memo, useCallback } from "react";
import { ScrollView, View, type GestureResponderEvent } from "react-native";

import { content } from "@/content";
import { hasFeature } from "@/engine/kernel";
import { claimQuest, claimWeekly, dailyQuests, DAY_MS, dayIndex, msToNextDaily, setWeeklyMutator, streakBonus, weeklyQuest } from "@/engine/meta";
import type { Game } from "@/engine/types";
import { useT, useTr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { act, useGame } from "@/store/game";
import { fmt, fmtBonus, fmtTime, useFmt } from "@/ui/format";
import { Badge, Card, Icon, Key, MicroLabel, popNumberAt, ProgressBar, Row, toast, Toggle, Txt } from "@/ui/kit";

import { effectLine } from "./effects";
import { Teaser } from "./parts";

/** Weeks roll over on Monday, the same calendar the engine uses for `weekIndex`. */
function msToNextWeek(g: Game): number {
  const day = dayIndex(g.state.wall);
  return (day + 7 - ((day + 3) % 7)) * DAY_MS - g.state.wall;
}

const QuestRow = memo(function QuestRow({ index, entry }: { index: number; entry: string }) {
  const t = useT("meta");
  const tr = useTr();
  const [id, progress, target, flag] = entry.split(":");
  const def = content.quests.find((q) => q.id === id);
  const done = flag === "d";
  const claimed = flag === "c";
  const p = Number(progress);
  const n = Number(target);
  const onClaim = useCallback(
    (e: GestureResponderEvent) => {
      const res = act((g) => claimQuest(g, index));
      if (res.ok) {
        sfx("success");
        haptic("success");
        popNumberAt(e, t("quests.claimedPop"), "good");
      } else {
        sfx("deny");
      }
    },
    [index, t],
  );
  return (
    <Card padding={10} gap={6}>
      <Row gap="sm">
        <Icon name={claimed ? "check" : "quest"} size={24} chip />
        <View style={{ flex: 1, gap: 4 }}>
          <Txt variant="bodyBold" color={claimed ? "inkDim" : "ink"}>
            {def ? tr(def.text, { n: fmt(n) }) : id}
          </Txt>
          <ProgressBar value={n > 0 ? p / n : 0} tone={done || claimed ? "good" : "orange"} />
          <MicroLabel testID={`quest-progress-${index}`}>{`${fmt(p)} / ${fmt(n)}`}</MicroLabel>
        </View>
        {claimed ? (
          <Badge label={t("quests.claimed")} tone="good" style={{ alignSelf: "center" }} />
        ) : (
          <Key testID={`quest-claim-${index}`} label={t("quests.claim")} tone="orange" size="sm" width={104} disabled={!done} onPress={onClaim} sound={null} hapticKind={null} />
        )}
      </Row>
    </Card>
  );
});

export default function Quests() {
  const t = useT("meta");
  const tr = useTr();
  useFmt();
  const s = useGame(
    (g) => {
      const q = g.state.quests;
      const w = hasFeature(g, "weekly") ? weeklyQuest(g) : null;
      return {
        open: hasFeature(g, "quests"),
        weeklyOpen: hasFeature(g, "weekly"),
        daily: dailyQuests(g)
          .map((v) => `${v.id}:${v.progress}:${v.target}:${v.claimed ? "c" : v.done ? "d" : "p"}`)
          .join("|"),
        streak: q.streak,
        bonus: streakBonus(g),
        nextDaily: Math.ceil(msToNextDaily(g) / 60000),
        nextWeek: Math.ceil(msToNextWeek(g) / 60000),
        weekly: w ? `${w.id}:${w.progress}:${w.target}:${w.claimed ? "c" : w.done ? "d" : "p"}` : "",
        mutator: w?.mutator ?? "",
        offered: w?.offered ?? "",
      };
    },
    undefined,
    5,
  );

  const onWeekly = useCallback(
    (e: GestureResponderEvent) => {
      const res = act((g) => claimWeekly(g));
      if (res.ok) {
        sfx("success");
        haptic("success");
        popNumberAt(e, t("quests.claimedPop"), "good");
      } else sfx("deny");
    },
    [t],
  );
  const onMutator = useCallback(
    (on: boolean) => {
      const res = act((g) => setWeeklyMutator(g, on));
      if (res.ok && on) toast(t("quests.mutatorOn"), "warn");
    },
    [t],
  );

  if (!s.open) {
    return (
      <ScrollView contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
        <Teaser icon="quest" title={t("quests.title")} text={t("quests.pitch")} how={t("quests.how")} />
        <Teaser icon="calendar" title={t("quests.weeklyTitle")} text={t("quests.weeklyPitch")} how={t("quests.weeklyHow")} />
      </ScrollView>
    );
  }

  const [wid, wp, wt, wflag] = s.weekly.split(":");
  const wdef = content.quests.find((q) => q.id === wid);
  const offered = content.mutators[s.offered];
  const accepted = s.mutator !== "";

  return (
    <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
      <Row gap="sm" justify="space-between">
        <Txt variant="heading">{t("quests.title")}</Txt>
        <Row gap="xs">
          <Icon name="clock" size={16} color="inkDim" />
          <MicroLabel size="label" testID="quests-next">
            {t("quests.nextSet", { time: fmtTime(s.nextDaily * 60) })}
          </MicroLabel>
        </Row>
      </Row>
      {s.daily ? s.daily.split("|").map((entry, i) => <QuestRow key={entry.split(":")[0]} index={i} entry={entry} />) : <Txt variant="body" color="inkDim">{t("quests.none")}</Txt>}
      <Card padding={10} gap={4}>
        <Row gap="sm">
          <Icon name="calendar" size={24} chip />
          <View style={{ flex: 1 }}>
            <Txt variant="bodyBold" testID="quests-streak">
              {t("quests.streak", { count: s.streak })}
              {s.streak > 0 ? ` · ${t("quests.streakBonus", { bonus: fmtBonus(s.bonus) })}` : ""}
            </Txt>
            <Txt variant="label" color="inkDim" style={{ letterSpacing: 0.2 }}>
              {t("quests.streakHint")}
            </Txt>
          </View>
        </Row>
      </Card>

      <Row gap="sm" justify="space-between" style={{ marginTop: 4 }}>
        <Txt variant="heading">{t("quests.weeklyTitle")}</Txt>
        {s.weeklyOpen ? (
          <Row gap="xs">
            <Icon name="clock" size={16} color="inkDim" />
            <MicroLabel size="label">{t("quests.timeLeft", { time: fmtTime(s.nextWeek * 60) })}</MicroLabel>
          </Row>
        ) : null}
      </Row>
      {!s.weeklyOpen || !s.weekly ? (
        <Teaser icon="calendar" title={t("quests.weeklyTitle")} text={t("quests.weeklyPitch")} how={t("quests.weeklyHow")} />
      ) : (
        <Card padding={10} gap={8}>
          <Row gap="sm">
            <Icon name={wflag === "c" ? "check" : "trophy"} size={24} chip />
            <View style={{ flex: 1, gap: 4 }}>
              <Txt variant="bodyBold">{wdef ? tr(wdef.text, { n: fmt(Number(wt)) }) : wid}</Txt>
              <ProgressBar value={Number(wt) > 0 ? Number(wp) / Number(wt) : 0} tone={wflag === "p" ? "cobalt" : "good"} />
              <MicroLabel>{`${fmt(Number(wp))} / ${fmt(Number(wt))}`}</MicroLabel>
            </View>
            {wflag === "c" ? (
              <Badge label={t("quests.claimed")} tone="good" style={{ alignSelf: "center" }} />
            ) : (
              <Key testID="weekly-claim" label={t("quests.claim")} tone="orange" size="sm" width={104} disabled={wflag !== "d"} onPress={onWeekly} sound={null} hapticKind={null} />
            )}
          </Row>
          {offered && wflag !== "c" ? (
            <View style={{ gap: 4 }}>
              <Row gap="sm" justify="space-between">
                <View style={{ flex: 1 }}>
                  <MicroLabel size="label">{t("quests.offer")}</MicroLabel>
                  <Txt variant="bodyBold">{`${tr(offered.name)} · ${t("quests.rewardMult", { mult: `×${fmt(offered.reward)}` })}`}</Txt>
                </View>
                <Toggle value={accepted} onChange={onMutator} accessibilityLabel={t("quests.offer")} />
              </Row>
              <Txt variant="label" color="bad">
                {offered.effects.map((e) => effectLine(e, t)).join(" · ")}
              </Txt>
              <Txt variant="label" color="inkDim" style={{ letterSpacing: 0.2 }}>
                {accepted ? t("quests.offerOn") : t("quests.offerHint")}
              </Txt>
            </View>
          ) : null}
        </Card>
      )}
    </ScrollView>
  );
}

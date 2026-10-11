// Achievements as stat ladders (the next unearned step is the headline, earned steps fold away),
// plus the statistics card.
import { memo, useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, View } from "react-native";

import { content } from "@/content";
import { achievementProgress, hasAchievement } from "@/engine/meta";
import type { AchievementDef, Game } from "@/engine/types";
import { useLang, useT, useTr } from "@/i18n";
import { haptic } from "@/platform/feedback";
import { getGame, useGame } from "@/store/game";
import { fmt, fmtPct, fmtTime, useFmt } from "@/ui/format";
import { Badge, Chip, CostTag, Icon, MicroLabel, ProgressBar, Row, ScrollWell, Txt, useTheme } from "@/ui/kit";

interface Ladder {
  stat: string;
  steps: AchievementDef[]; // ascending threshold
}

const LADDERS: Ladder[] = (() => {
  const by: Record<string, Ladder> = {};
  const out: Ladder[] = [];
  for (const def of content.achievements) {
    let l = by[def.stat];
    if (!l) {
      l = by[def.stat] = { stat: def.stat, steps: [] };
      out.push(l);
    }
    l.steps.push(def);
  }
  for (const l of out) l.steps.sort((a, b) => a.threshold - b.threshold);
  return out;
})();
const TOTAL = content.achievements.length;

/** Per ladder "earned steps:progress of the next step in per mille", plus the newest three ids. */
function snapshot(g: Game): string {
  let out = "";
  for (let i = 0; i < LADDERS.length; i++) {
    const steps = LADDERS[i].steps;
    let earned = 0;
    while (earned < steps.length && hasAchievement(g, steps[earned].id)) earned++;
    const next = steps[earned];
    out += `${i ? "," : ""}${earned}:${next ? Math.floor(achievementProgress(g, next) * 1000) : 1000}`;
  }
  return out;
}

function recent(g: Game): string {
  const got = g.state.achievements;
  return Object.keys(got)
    .sort((a, b) => got[b] - got[a] || (a < b ? 1 : -1))
    .slice(0, 3)
    .join(",");
}

function Reward({ def }: { def: AchievementDef }) {
  const t = useT("meta");
  if (def.reward?.stamps) return <CostTag icon="stamp" amount={`+${fmt(def.reward.stamps)}`} size="sm" boxed />;
  if (def.reward?.cosmetic) return <CostTag icon="star" amount={t("ach.cosmetic")} size="sm" boxed />;
  return null;
}

const LadderRow = memo(function LadderRow({ index, earned, permille, open, onToggle }: { index: number; earned: number; permille: number; open: boolean; onToggle: (i: number) => void }) {
  const theme = useTheme();
  const t = useT("meta");
  const tr = useTr();
  const ladder = LADDERS[index];
  const done = earned >= ladder.steps.length;
  const head = done ? ladder.steps[ladder.steps.length - 1] : ladder.steps[earned];
  const secret = !done && head.hidden === true;
  const value = getGame().state.stats[ladder.stat] ?? 0;
  return (
    <Pressable
      testID={`ladder-${ladder.stat}`}
      onPress={() => onToggle(index)}
      onPressIn={() => haptic("tap")}
      disabled={earned === 0 || (done && ladder.steps.length === 1)}
      accessibilityRole="button"
      accessibilityLabel={secret ? t("ach.secret") : tr(head.name)}
      style={{ backgroundColor: theme.plate, borderRadius: 6, padding: 8, gap: 6, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: done ? theme.mint : earned > 0 ? theme.cobalt : theme.rule }}
    >
      <Row gap="sm" align="flex-start">
        <Icon name={secret ? "question" : done ? "trophy" : head.icon} size={24} chip />
        <View style={{ flex: 1, gap: 2 }}>
          <Row gap="sm">
            <Txt variant="bodyBold" style={{ flex: 1 }} numberOfLines={1} color={secret ? "inkDim" : "ink"}>
              {secret ? "???" : tr(head.name)}
            </Txt>
            {done ? <Badge label={t("ach.done")} tone="good" /> : <Reward def={head} />}
          </Row>
          <Txt variant="label" color="inkDim" style={{ letterSpacing: 0.2 }}>
            {secret ? t("ach.secretHint") : tr(head.desc)}
          </Txt>
          {!done && !secret ? (
            <Row gap="sm">
              <ProgressBar value={permille / 1000} tone="orange" style={{ flex: 1 }} />
              <MicroLabel>{`${fmt(Math.min(value, head.threshold))} / ${fmt(head.threshold)}`}</MicroLabel>
            </Row>
          ) : null}
        </View>
      </Row>
      {ladder.steps.length > 1 ? (
        <Row gap="xs">
          {ladder.steps.map((s, i) => (
            <View key={s.id} style={{ width: 14, height: 5, borderRadius: 1, backgroundColor: i < earned ? theme.mint : theme.ledOff, opacity: i < earned ? 1 : 0.6 }} />
          ))}
          <MicroLabel style={{ marginLeft: 4 }}>{t("ach.steps", { earned, total: ladder.steps.length })}</MicroLabel>
          {earned > 0 && !(done && ladder.steps.length === 1) ? <Icon name={open ? "up" : "down"} size={16} color="inkDim" style={{ marginLeft: "auto" }} /> : null}
        </Row>
      ) : null}
      {open
        ? ladder.steps.slice(0, earned).map((s) => (
            <Row key={s.id} gap="sm">
              <Icon name="check" size={16} color="good" />
              <Txt variant="label" style={{ flex: 1 }} numberOfLines={1}>
                {tr(s.name)}
              </Txt>
              <MicroLabel>{fmt(s.threshold)}</MicroLabel>
            </Row>
          ))
        : null}
    </Pressable>
  );
});

// ---------------------------------------------------------------------------------------------

const STAT_ROWS = [
  "played",
  "allTime",
  "depthMax",
  "jumps",
  "systemsVisited",
  "planetsScanned",
  "purchases",
  "deckLevels",
  "crafts",
  "modulesBuilt",
  "salvage",
  "repairsManual",
  "repairsBot",
  "tapeUsed",
  "minigames",
  "events",
  "failures",
  "tows",
  "researchLevels",
  "warps",
  "rebuilds",
  "reboots",
  "questsDaily",
  "streakMax",
  "offlineReturns",
  "kippLines",
] as const;

function statsSnapshot(g: Game): string {
  const st = g.state.stats;
  return STAT_ROWS.map((k) => (k === "played" ? fmtTime(g.state.played) : k === "allTime" ? fmt(g.state.allTime) : fmt(st[k] ?? 0))).join("|");
}

function Stats() {
  const t = useT("meta");
  const theme = useTheme();
  const values = useGame(statsSnapshot, undefined, 10).split("|");
  return (
    <ScrollWell style={{ flex: 1 }} padding={8} testID="stats-card">
      <MicroLabel size="label" color="ink">
        {t("stats.title")}
      </MicroLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4 }}>
        {STAT_ROWS.map((k, i) => (
          <View key={k} style={{ width: "50%", paddingVertical: 4, paddingRight: 8, borderBottomWidth: 1, borderBottomColor: theme.rule }}>
            <MicroLabel>{t(`stats.${k}`)}</MicroLabel>
            <Txt variant="bodyBold" tabular numberOfLines={1}>
              {values[i]}
            </Txt>
          </View>
        ))}
      </View>
    </ScrollWell>
  );
}

// ---------------------------------------------------------------------------------------------

type View3 = "open" | "done" | "stats";

export default function Achievements({ initial = "open" }: { initial?: View3 }) {
  const t = useT("meta");
  const tr = useTr();
  const lang = useLang();
  const theme = useTheme();
  useFmt();
  const [view, setView] = useState<View3>(initial);
  const [open, setOpen] = useState(-1);
  const snap = useGame(snapshot, undefined, 10);
  const newest = useGame(recent, undefined, 10);
  const earnedTotal = useGame((g) => Object.keys(g.state.achievements).length, undefined, 10);
  const onToggle = useCallback((i: number) => setOpen((cur) => (cur === i ? -1 : i)), []);

  const rows = useMemo(() => {
    const parsed = snap.split(",").map((s, index) => {
      const [earned, permille] = s.split(":").map(Number);
      return { index, earned, permille, done: earned >= LADDERS[index].steps.length };
    });
    const list = parsed.filter((r) => (view === "done" ? r.earned > 0 : !r.done));
    // Closest to the next step first; finished ladders by how much there was to finish.
    list.sort((a, b) => (view === "done" ? b.earned - a.earned : b.permille - a.permille) || a.index - b.index);
    return list;
  }, [snap, view]);

  const header = newest ? (
    <View style={{ gap: 4, marginBottom: 8 }}>
      <MicroLabel size="label" color="ink">
        {t("ach.recent")}
      </MicroLabel>
      <Row gap="xs">
        {newest.split(",").map((id) => {
          const def = content.achievements.find((a) => a.id === id);
          if (!def) return null;
          return (
            <Row key={id} gap="xs" style={{ flex: 1, minWidth: 0, height: 28, paddingHorizontal: 4, borderRadius: 4, backgroundColor: theme.plate, borderLeftWidth: 3, borderLeftColor: theme.mint }}>
              <Icon name={def.icon} size={16} chip />
              <MicroLabel color="ink" style={{ flex: 1, letterSpacing: 0.2 }}>
                {tr(def.name)}
              </MicroLabel>
            </Row>
          );
        })}
      </Row>
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Row gap="sm">
        <Icon name="trophy" size={24} chip />
        <View style={{ flex: 1, gap: 3 }}>
          <Row gap="sm" justify="space-between">
            <Txt variant="bodyBold" testID="ach-total">
              {t("ach.total", { earned: earnedTotal, total: TOTAL })}
            </Txt>
            <Txt variant="bodyBold" color="good">
              {fmtPct(earnedTotal / TOTAL)}
            </Txt>
          </Row>
          <ProgressBar value={earnedTotal / TOTAL} tone="good" />
        </View>
      </Row>
      <Row gap="sm">
        <Chip label={t("ach.viewOpen")} selected={view === "open"} onPress={() => setView("open")} />
        <Chip label={t("ach.viewDone")} selected={view === "done"} onPress={() => setView("done")} />
        <Chip label={t("ach.viewStats")} icon="info" selected={view === "stats"} onPress={() => setView("stats")} />
      </Row>
      {view === "stats" ? (
        <Stats />
      ) : (
        <FlatList
          data={rows}
          extraData={`${open}|${lang}`}
          keyExtractor={(r) => LADDERS[r.index].stat}
          renderItem={({ item }) => <LadderRow index={item.index} earned={item.earned} permille={item.permille} open={open === item.index} onToggle={onToggle} />}
          ListHeaderComponent={view === "open" ? header : null}
          ListEmptyComponent={<Txt variant="body" color="inkDim" align="center">{view === "done" ? t("ach.noneDone") : t("ach.allDone")}</Txt>}
          initialNumToRender={6}
          windowSize={7}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 8 }}
        />
      )}
    </View>
  );
}

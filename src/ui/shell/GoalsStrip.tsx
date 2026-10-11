// "What do I press next": the three near-term goals, always visible, each a tap away from the
// screen where it is solved.
import { memo, useCallback } from "react";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";

import { nearGoals, type NearGoal } from "@/engine/core";
import { tr, useT } from "@/i18n";
import { content } from "@/content";
import { getGame, useGame } from "@/store/game";
import { goTo, type TabId } from "@/store/ui";
import { fmt, fmtTime, itemName, useFmt } from "@/ui/format";
import { Icon, ProgressBar, Txt, useTheme, usePressScale } from "@/ui/kit";
import { haptic, sfx } from "@/platform/feedback";
import { radius, space } from "@/ui/theme";

type TFn = (key: string, vars?: Record<string, unknown>) => string;

interface GoalView {
  icon: string;
  title: string;
  sub: string;
  tab: TabId;
  section: string | null;
  tone: "orange" | "mint" | "red" | "cobalt";
}

function eta(t: TFn, seconds: number, cost: string): string {
  if (seconds <= 0) return t("goals.ready", { cost });
  if (!Number.isFinite(seconds) || seconds > 359_999) return cost;
  return t("goals.costEta", { cost, time: fmtTime(seconds, 1) });
}

function describe(goal: NearGoal, t: TFn): GoalView {
  switch (goal.kind) {
    case "deckLevel": {
      const p = goal.params;
      return { icon: content.decks[p.deck]?.icon ?? "buy", title: t("goals.deckLevel", { deck: tr(content.decks[p.deck]?.name), level: p.level }), sub: eta(t, p.seconds, fmt(p.cost)), tab: "ship", section: p.deck, tone: goal.progress >= 1 ? "mint" : "orange" };
    }
    case "deckUnlock": {
      const p = goal.params;
      return { icon: content.decks[p.deck]?.icon ?? "unlock", title: t("goals.deckUnlock", { deck: tr(content.decks[p.deck]?.name) }), sub: p.needsItems ? t("goals.needsItems", { cost: fmt(p.cost) }) : eta(t, p.seconds, fmt(p.cost)), tab: "ship", section: p.deck, tone: goal.progress >= 1 ? "mint" : "cobalt" };
    }
    case "milestone": {
      const p = goal.params;
      return { icon: content.decks[p.deck]?.icon ?? "star", title: t("goals.milestone", { deck: tr(content.decks[p.deck]?.name), level: p.level }), sub: t("goals.milestoneLeft", { count: p.left }), tab: "ship", section: p.deck, tone: "orange" };
    }
    case "craft":
      return { icon: goal.params.item, title: t("goals.craft", { item: itemName(goal.params.item) }), sub: goal.progress >= 1 ? t("goals.craftReady") : t("goals.craftMissing"), tab: "craft", section: goal.params.recipe, tone: goal.progress >= 1 ? "mint" : "cobalt" };
    case "repair": {
      const p = goal.params;
      return { icon: p.item ?? "hull", title: t("goals.repair", { item: p.item ? itemName(p.item) : t("goals.hull") }), sub: t("goals.repairHp", { hp: Math.round(p.hp) }), tab: "grid", section: "repair", tone: "red" };
    }
    case "depth": {
      const p = goal.params;
      return { icon: "jump", title: t("goals.depth", { depth: p.depth }), sub: t("goals.fuel", { have: Math.floor(p.fuel), need: Math.ceil(p.fuelNeeded) }), tab: "nav", section: null, tone: goal.progress >= 1 ? "mint" : "cobalt" };
    }
  }
}

const GoalCell = memo(function GoalCell({ index }: { index: number }) {
  const t = useT("world") as TFn;
  const theme = useTheme();
  const press = usePressScale(0.96);
  // The engine caches the goal list for half a second; the signature decides when to re-render.
  const sig = useGame(
    (g) => {
      const goal = nearGoals(g)[index];
      return goal ? `${goal.id}|${Math.round(goal.progress * 40)}|${goal.target}|${"seconds" in goal.params ? Math.round(goal.params.seconds) : ""}` : "";
    },
    undefined,
    3,
  );
  const goal = sig ? nearGoals(getGame())[index] : undefined;
  const view = goal ? describe(goal, t) : null;
  const go = useCallback(() => {
    if (!view) return;
    haptic("tap");
    sfx("tab");
    goTo(view.tab, view.section);
  }, [view]);
  if (!goal || !view) return <View style={{ flex: 1 }} />;
  return (
    <Pressable onPress={go} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityLabel={`${view.title}. ${view.sub}`} hitSlop={{ top: 4, bottom: 4 }} style={{ flex: 1, minWidth: 0 }}>
      <Animated.View
        style={[
          { height: 40, borderRadius: radius.well, backgroundColor: theme.plate, borderTopWidth: 1, borderTopColor: theme.bodyHi, borderBottomWidth: 1, borderBottomColor: theme.rule, paddingHorizontal: 5, paddingTop: 3, overflow: "hidden" },
          press.style,
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, flex: 1 }}>
          <Icon name={view.icon} size={16} chip />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="label" numberOfLines={1} style={{ fontSize: 9.5, letterSpacing: 0.2 }}>
              {view.title}
            </Txt>
            <Txt variant="micro" color={view.tone === "red" ? "bad" : view.tone === "mint" ? "good" : "inkDim"} numberOfLines={1} style={{ letterSpacing: 0.2 }}>
              {view.sub}
            </Txt>
          </View>
        </View>
        <ProgressBar value={Math.max(0, Math.min(1, goal.progress))} tone={view.tone === "mint" ? "good" : view.tone} height={3} style={{ marginHorizontal: -5 }} />
      </Animated.View>
    </Pressable>
  );
});

export const GoalsStrip = memo(function GoalsStrip() {
  useFmt();
  return (
    <View style={{ flexDirection: "row", gap: space.xs }}>
      <GoalCell index={0} />
      <GoalCell index={1} />
      <GoalCell index={2} />
    </View>
  );
});

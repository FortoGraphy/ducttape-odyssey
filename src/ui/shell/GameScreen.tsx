// The frame that makes it a game: viewport on top, the Control Deck below (status LCD, goals,
// the active tab, tab keys) and every overlay above both. Works with any already booted game
// (the real boot in the root layout, or the dev harness).
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { setMining } from "@/engine/core";
import { dailyQuests, weeklyQuest } from "@/engine/meta";
import type { Game } from "@/engine/types";
import { contractReady } from "@/engine/world";
import { useT } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { act, getGame, onOfflineReport, useGame } from "@/store/game";
import { useSettings } from "@/store/settings";
import { TAB_IDS, useUi, type TabId } from "@/store/ui";
import { Screw, TabKeys, toast, useTheme, type TabKeyItem } from "@/ui/kit";
import { space, VIEWPORT_SHARE } from "@/ui/theme";

import { installFeedback } from "./feedback";
import { GoalsStrip } from "./GoalsStrip";
import { EventDialog } from "./overlays/EventDialog";
import { FailureBanner, RescueSheet } from "./overlays/Failure";
import { MinigameOverlay } from "./overlays/Minigame";
import { BackupReminder, Intro, KippSheet, PerfHud, SafeModeBanner, introPending, useBackupDue } from "./overlays/Misc";
import { ShipsLog } from "./overlays/ShipsLog";
import { StoryOverlay, useStoryPending } from "./overlays/Story";
import { Tutorial, useTutorialStart, type TutorialRects } from "./overlays/Tutorial";
import { StatusStrip } from "./StatusStrip";
import { useShell } from "./store";
import { TabHost } from "./TabHost";
import { ViewportPane } from "./ViewportPane";

type TFn = (key: string, vars?: Record<string, unknown>) => string;

const TOAST_ZONE = 60;

function locksOf(g: Game) {
  const f = g.state.features;
  return {
    craft: f.crafting !== 1,
    grid: f.grid !== 1,
    nav: f.nav !== 1,
    crew: f.crew !== 1,
    meta: f.research !== 1 && f.quests !== 1 && f.warp !== 1,
  };
}

function badgesOf(g: Game) {
  const s = g.state;
  let grid = s.features.grid === 1 && s.hull.hp < 50;
  if (s.features.grid === 1) for (let i = 0; i < s.modules.length && !grid; i++) grid = s.modules[i].slot >= 0 && s.modules[i].hp < 50;
  let nav = false;
  for (let i = 0; i < s.expeditions.length && !nav; i++) nav = s.expeditions[i].done;
  let meta = false;
  try {
    for (let i = 0; i < s.station.contracts.length && !nav; i++) nav = contractReady(g, s.station.contracts[i]);
    if (s.features.quests === 1) {
      const daily = dailyQuests(g);
      for (let i = 0; i < daily.length && !meta; i++) meta = daily[i].done && !daily[i].claimed;
      const weekly = weeklyQuest(g);
      if (weekly && weekly.done && !weekly.claimed) meta = true;
    }
  } catch {
    // a badge is a hint, never a reason to fail
  }
  return { grid, nav, meta, story: s.story.pending.length > 0 };
}

const TabBar = memo(function TabBar({ compact }: { compact: boolean }) {
  const t = useT("world") as TFn;
  const tab = useUi((s) => s.tab);
  const setTab = useUi((s) => s.setTab);
  const locks = useGame(locksOf, undefined, 5);
  const badges = useGame(badgesOf, undefined, 10);
  const newLog = useShell((s) => s.newLog);

  const items = useMemo<TabKeyItem[]>(
    () =>
      TAB_IDS.map((id) => ({
        id,
        icon: `tab_${id}`,
        label: compact ? undefined : t(`tabs.short.${id}`),
        accessibilityLabel: t(`tabs.${id}`),
        locked: (locks as Record<string, boolean>)[id] === true,
        badge: id === "grid" ? badges.grid : id === "nav" ? badges.nav : id === "meta" ? badges.meta : id === "log" ? newLog || badges.story : false,
      })),
    [t, compact, locks, badges, newLog],
  );

  // a tab can lock again (prestige resets features): never leave the player on a locked screen
  useEffect(() => {
    if ((locks as Record<string, boolean>)[tab]) setTab("ship");
    if (tab === "log" && useShell.getState().newLog) useShell.getState().setNewLog(false);
  }, [tab, locks, setTab]);

  const onChange = useCallback((id: string) => setTab(id as TabId), [setTab]);
  const hint = useCallback(
    (id: TabId) => {
      sfx("deny");
      haptic("warning");
      toast(t(`tabs.lockHint.${id}`), { tone: "info", icon: "lock", title: t(`tabs.${id}`) });
    },
    [t],
  );

  return (
    <View>
      <TabKeys items={items} value={tab} onChange={onChange} />
      {/* the kit disables locked keys; this layer catches the tap and explains how to unlock */}
      <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, flexDirection: "row", gap: space.xs }}>
        {TAB_IDS.map((id) =>
          (locks as Record<string, boolean>)[id] ? (
            <Pressable key={id} testID={`tab-locked-${id}`} style={{ flex: 1 }} onPress={() => hint(id)} accessibilityRole="button" accessibilityLabel={`${t(`tabs.${id}`)}. ${t(`tabs.lockHint.${id}`)}`} />
          ) : (
            <View key={id} pointerEvents="none" style={{ flex: 1 }} />
          ),
        )}
      </View>
    </View>
  );
});

export interface GameScreenProps {
  /** Crash guard booted Safe Mode: lite renderer, lowest quality. */
  safeMode?: boolean;
}

export function GameScreen({ safeMode = false }: GameScreenProps) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tab = useUi((s) => s.tab);
  const setCovered = useUi((s) => s.setViewportCovered);
  const perfHud = useSettings((s) => s.perfHud);

  const minigame = useGame((g) => g.state.minigame !== null);
  const eventActive = useGame((g) => g.state.events.active !== null);
  const failing = useGame((g) => g.state.failure !== null);
  const story = useStoryPending();
  const intro = useShell((s) => s.intro);
  const offline = useShell((s) => s.offline !== null);
  const rescueOpen = useShell((s) => s.rescueOpen);
  const kippOpen = useShell((s) => s.kippOpen);
  const safeBanner = useShell((s) => s.safeBanner);

  useEffect(() => installFeedback(), []);
  useEffect(() => onOfflineReport((r) => useShell.getState().setOffline(r)), []);
  useEffect(() => {
    if (introPending()) useShell.getState().setIntro(true);
  }, []);

  // One thing at a time, most urgent first. Mini-games and the intro take the whole screen.
  const blocking = minigame || intro;
  const showOffline = offline && !blocking;
  const showEvent = eventActive && !blocking && !showOffline;
  const showRescue = rescueOpen && failing && !blocking && !showOffline && !showEvent;
  const showKipp = kippOpen && !blocking && !showOffline && !showEvent && !showRescue;
  const modal = showOffline || showEvent || showRescue || showKipp;
  const showStory = story !== null && !blocking && !modal;
  const backupDue = useBackupDue(!blocking && !modal && !showStory && !failing);

  const covered = minigame || intro || showStory || showOffline;
  useEffect(() => {
    setCovered(covered);
    if (covered && getGame().state.active.mining) act((g) => setMining(g, false));
    return () => setCovered(false);
  }, [covered, setCovered]);
  useEffect(() => {
    if (!failing && rescueOpen) useShell.getState().setRescueOpen(false);
  }, [failing, rescueOpen]);

  const viewportHeight = Math.round(height * VIEWPORT_SHARE);
  const compact = height < 700;

  // Where the deck's parts ended up, for the tutorial's highlights (y is relative to the deck).
  const [lay, setLay] = useState({ goalsY: 0, goalsH: 0, contentY: 0, contentH: 0, tabsY: 0, tabsH: 0 });
  const measure = useCallback(
    (key: "goals" | "content" | "tabs") => (e: LayoutChangeEvent) => {
      const { y, height: h } = e.nativeEvent.layout;
      setLay((prev) => ((prev as Record<string, number>)[`${key}Y`] === y && (prev as Record<string, number>)[`${key}H`] === h ? prev : { ...prev, [`${key}Y`]: y, [`${key}H`]: h }));
    },
    [],
  );
  const onGoals = useMemo(() => measure("goals"), [measure]);
  const onContent = useMemo(() => measure("content"), [measure]);
  const onTabs = useMemo(() => measure("tabs"), [measure]);
  const rects = useMemo<TutorialRects>(() => {
    const cell = (width - space.sm * 2 - space.xs * 7) / 8;
    return {
      viewport: { x: 4, y: insets.top + 4, w: width - 8, h: viewportHeight - insets.top - 8 },
      goals: { x: 4, y: viewportHeight + lay.goalsY - 3, w: width - 8, h: lay.goalsH + 6 },
      content: { x: 2, y: viewportHeight + lay.contentY, w: width - 4, h: lay.contentH },
      craftTab: { x: space.sm + cell + space.xs - 3, y: viewportHeight + lay.tabsY - 2, w: cell + 6, h: lay.tabsH + 4 },
      cardBottom: viewportHeight - 72,
    };
  }, [width, viewportHeight, insets.top, lay]);
  const calm = !blocking && !modal && !showStory;
  useTutorialStart(calm && !failing);

  return (
    <View style={{ flex: 1, backgroundColor: theme.backdrop }}>
      <ViewportPane width={width} height={viewportHeight} safeMode={safeMode} />
      {/* below the strip where toasts land, so a toast never swallows the tap on the rescue banner */}
      <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + TOAST_ZONE, left: space.sm, right: space.sm, gap: space.xs }}>
        {safeBanner ? <SafeModeBanner /> : null}
        <FailureBanner />
        {perfHud ? <PerfHud /> : null}
      </View>

      <View style={{ flex: 1, backgroundColor: theme.body, borderTopWidth: 2, borderTopColor: theme.bodyHi, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 6), gap: space.xs }}>
        <Screw size={7} angle={20} style={{ position: "absolute", top: 1, left: 2 }} />
        <Screw size={7} angle={-40} style={{ position: "absolute", top: 1, right: 2 }} />
        <View style={{ paddingHorizontal: space.sm }}>
          <StatusStrip />
        </View>
        <View onLayout={onGoals} style={{ paddingHorizontal: space.sm }}>
          <GoalsStrip />
        </View>
        <View onLayout={onContent} style={{ flex: 1, minHeight: 0 }}>
          <TabHost tab={tab} />
        </View>
        <View onLayout={onTabs} style={{ paddingHorizontal: space.sm }}>
          <TabBar compact={compact} />
        </View>
      </View>

      <Tutorial rects={rects} visible={calm} />

      {showStory && story ? <StoryOverlay kind={story} /> : null}
      {intro && !minigame ? <Intro /> : null}
      {minigame ? <MinigameOverlay /> : null}

      <ShipsLog visible={showOffline} />
      <EventDialog visible={showEvent} />
      <RescueSheet visible={showRescue} />
      <KippSheet visible={showKipp} />
      <BackupReminder visible={backupDue} />
    </View>
  );
}

export default GameScreen;

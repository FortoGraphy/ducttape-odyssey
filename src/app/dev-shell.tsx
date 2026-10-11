// Preview of the game shell inside the dev harness (deterministic preset game, never the real save).
// Harness params: ?preset=fresh|early|mid|late|damaged &theme=night &lang=en &failure=<kind> &event=<id>
// Shell debug params: &offline=<seconds> (Ship's Log) &beat=1 &ending=1 &intro=1 &mg=<game> &repair=1
// &tutorial=<1-6> &rescue=1 &safe=1 &crash=1 (recovery screen) &unreadable=1 &notabs=1 &perf=1 &kipp=1 &tab=<id>
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";

import { startManualRepair } from "@/engine/core";
import { applyOffline } from "@/engine/kernel";
import { finalChapter } from "@/engine/meta";
import type { MinigameId } from "@/engine/types";
import { act, getGame } from "@/store/game";
import { useSettings } from "@/store/settings";
import { TAB_IDS, goTo, type TabId } from "@/store/ui";
import { DevHarness } from "@/ui/dev/Harness";
import { BootNotices, RootBoundary } from "@/ui/shell/boot";
import { GameScreen } from "@/ui/shell/GameScreen";
import { INTRO_FLAG } from "@/ui/shell/overlays/Misc";
import { useShell } from "@/ui/shell/store";
import { setTabsOffline } from "@/ui/shell/TabHost";

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

function Crash(): never {
  throw new Error("Forced by the dev-shell route (crash=1): the reactor coupling fell off again.");
}

function DevShell() {
  const params = useLocalSearchParams();
  const p = (key: string) => one(params[key]);
  const preset = p("preset") ?? "mid";

  // Runs once, after the harness has booted its preset game and before the shell first renders.
  useState(() => {
    const g = getGame();
    const s = g.state;
    useShell.setState({ offline: null, intro: false, safeBanner: p("safe") === "1", rescueOpen: false, kippOpen: false, endingLater: false, epilogue: false, kipp: [], tutorial: -1 });
    setTabsOffline(p("notabs") === "1");
    if (p("perf") === "1") useSettings.setState({ perfHud: true });
    // presets jump over the opening: only a fresh game (or an explicit request) plays it
    if (preset !== "fresh" || p("skipintro") === "1") {
      s.flags[INTRO_FLAG] = 1;
      s.story.pending.length = 0;
      useSettings.setState({ tutorialDone: preset !== "fresh" });
    } else {
      useSettings.setState({ tutorialDone: false });
    }
    if (p("intro") === "1") delete s.flags[INTRO_FLAG];
    const tutorial = Number(p("tutorial"));
    if (tutorial >= 1 && tutorial <= 6) {
      useSettings.setState({ tutorialDone: false });
      useShell.setState({ tutorial: tutorial - 1 });
    }
    if (p("beat") === "1") {
      const chapter = g.content.chapters.find((c) => c.id === Math.max(2, s.story.chapter) && c.intro.length > 0) ?? g.content.chapters.find((c) => c.intro.length > 0);
      if (chapter) for (let i = 0; i < chapter.intro.length; i++) s.story.pending.push(chapter.id * 1000 + i);
    }
    if (p("ending") === "1") {
      s.story.chapter = finalChapter(g);
      s.story.pending.length = 0;
    }
    const secs = Number(p("offline"));
    if (secs > 0) useShell.setState({ offline: applyOffline(g, secs) });
    const mg = p("mg");
    if (mg) g.api.requestMinigame(mg as MinigameId, 1, "practice", 0);
    if (p("repair") === "1") {
      const target = s.modules.find((m) => m.slot >= 0 && m.hp < 100);
      if (target) startManualRepair(g, target.uid);
    }
    if (p("rescue") === "1") useShell.setState({ rescueOpen: true });
    const tab = p("tab");
    if (tab && (TAB_IDS as readonly string[]).includes(tab)) goTo(tab as TabId);
    return true;
  });

  useEffect(() => {
    if (p("kipp") === "1") act((g) => g.api.say("idle"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RootBoundary>
      {p("crash") === "1" ? <Crash /> : <GameScreen safeMode={p("safe") === "1"} />}
      {p("unreadable") === "1" ? <BootNotices result={{ fresh: false, recoveredFromBackup: false, saveUnreadable: true, offline: null }} /> : null}
    </RootBoundary>
  );
}

export default function DevShellRoute() {
  const params = useLocalSearchParams();
  const full = one(params.full) === "1";
  useEffect(() => {
    if (!full) router.setParams({ full: "1" });
  }, [full]);
  return (
    <DevHarness>
      <DevShell />
    </DevHarness>
  );
}

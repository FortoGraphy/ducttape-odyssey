// Preview route for the Log and Settings tabs.
//   /dev-log?tab=log|settings &section=<log section or settings group> &preset=... &theme=night &lang=en
//   &debug=1 (debug panel unlocked and open) &ending=1 (story finished: Backlog) &bare=1 (no demo data)
// The presets carry no logs, codex entries or KIPP lines, so this route adds a believable amount.
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";

import { content } from "@/content";
import type { Game } from "@/engine/types";
import { chooseEnding, finalChapter } from "@/engine/meta";
import { getGame } from "@/store/game";
import { useSettings } from "@/store/settings";
import { DevHarness } from "@/ui/dev/Harness";
import { ThemeProvider } from "@/ui/kit";
import LogScreen from "@/ui/screens/log";
import SettingsScreen from "@/ui/screens/settings";
import { startEconomySampler } from "@/ui/screens/settings/economy";

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const seeded = new WeakSet<Game>();

function addDemoData(g: Game, ending: boolean): void {
  if (seeded.has(g)) return;
  seeded.add(g);
  const s = g.state;
  if (s.story.chapter < 2) return;
  const late = s.story.chapter >= 9;
  g.offline = true;
  try {
    for (let i = 0; i < (late ? 34 : 9); i++) g.api.addLog();
    const sys = g.api.currentSystem();
    for (let d = Math.max(0, s.nav.depth - (late ? 14 : 5)); d <= s.nav.depth; d++) {
      s.t += 137;
      g.api.discover(`system:${s.nav.g}:${d}:0`);
    }
    for (const p of sys.planets.slice(0, late ? 6 : 3)) {
      s.t += 61;
      g.api.discover(`planet:${p.id}`);
      for (let i = 0; i < p.fauna; i++) g.api.discover(`fauna:${p.id}:${i}`);
      for (let i = 0; i < p.flora; i++) g.api.discover(`flora:${p.id}:${i}`);
    }
    const artifacts = Object.keys(content.items).filter((id) => content.items[id].category === "artifact");
    for (const id of artifacts.slice(0, late ? 7 : 2)) g.api.discover(`artifact:${id}`);
    for (const key of ["phenomenon_comet", "phenomenon_gravity_lens", "fauna_void_whale", "contact_first_ping"].slice(0, late ? 4 : 2)) g.api.discover(key);
    const firstPlanet = sys.planets[0];
    if (firstPlanet && s.codex[`planet:${firstPlanet.id}`]) s.codex[`planet:${firstPlanet.id}`].name = late ? "Home, Sort Of" : "Nový Žižkov";
    const lines = content.kipp.filter((l) => !l.when && l.trigger !== "failure" && l.trigger !== "debug");
    for (let i = 0; i < 9; i++) s.story.kippRecent.push(lines[(i * 17 + 3) % lines.length].id);
    s.stats.kippLines = late ? 412 : 57;
    if (ending) {
      s.story.chapter = finalChapter(g);
      chooseEnding(g, content.endings[0].id);
    }
  } finally {
    g.offline = false;
    g.dirty = true;
  }
}

function Inner() {
  const params = useLocalSearchParams();
  const tab = one(params.tab) === "settings" ? "settings" : "log";
  const section = one(params.section);
  const debug = one(params.debug) === "1";
  const urlTheme = one(params.theme) === "night" ? "night" : "day";
  const theme = useSettings((s) => s.theme);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const st = useSettings.getState();
    if (st.theme !== urlTheme) st.set("theme", urlTheme);
    if (debug && !st.debug) st.set("debug", true);
    if (one(params.bare) !== "1") addDemoData(getGame(), one(params.ending) === "1");
    if (debug) startEconomySampler();
    // Playwright reads state through this handle; it exists only on this preview route.
    (globalThis as { __dto?: unknown }).__dto = { getGame, useSettings };
    const id = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) return null;
  return <ThemeProvider theme={theme}>{tab === "settings" ? <SettingsScreen initialGroup={section} initialDebug={debug} /> : <LogScreen initialSection={section} />}</ThemeProvider>;
}

export default function DevLog() {
  return (
    <DevHarness>
      <Inner />
    </DevHarness>
  );
}

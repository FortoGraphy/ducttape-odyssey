// Hidden debug panel (seven taps on the logo). A service tool: it shapes the state directly, then
// lets the engine rebuild its caches. Everything goes through act() so the UI wakes immediately.
import { memo, useCallback, useMemo, useState } from "react";
import { useWindowDimensions } from "react-native";

import { content } from "@/content";
import { applyOffline, B, tick, type DeckId, type FailureKind, type FeatureId, type Game, type MinigameId, type MinigameTier, type ModuleFamily } from "@/engine";
import { DECK_IDS } from "@/engine/types";
import { addCredits, addItem, statMax, unlockFeature } from "@/engine/kernel";
import { chapterDef, finalChapter, grantStamps, syncCosmetics } from "@/engine/meta";
import { galaxyDepth } from "@/engine/world";
import { useT, useTr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { writeText } from "@/platform/storage";
import { act, getGame, perf, useGame } from "@/store/game";
import { applyPreset, PRESETS, type PresetId } from "@/store/presets";
import { useSettings } from "@/store/settings";
import { fmt, fmtTime } from "@/ui/format";
import { Col, Key, KeyRow, ListRow, MicroLabel, Row, Rule, Segmented, Sheet, toast, Toggle, Txt } from "@/ui/kit";

import { EconomyGraph } from "./economy";
import { CodeBox, Field, KeyValue, SettingRow } from "./parts";

type Section = "time" | "grant" | "world" | "trigger" | "perf";

const FEATURES: FeatureId[] = [
  "crafting", "autoQueue", "grid", "repairBots", "autoMaintenance", "nav", "scan", "probes", "expeditions", "outposts", "station", "crew",
  "cards", "research", "drones", "buyMax", "overdrive", "warp", "hull", "cosmos", "quests", "weekly", "codex",
];
const FAILURES: FailureKind[] = ["tumble", "breach", "blackout", "noFuel", "engine", "radiation", "boarding", "anomaly"];
const MINIGAMES: MinigameId[] = ["weld", "wire", "rhythm", "valves", "calibrate", "tape", "defense", "dock", "hack"];
const FAMILIES: ModuleFamily[] = ["laser", "engine", "shield", "scanner", "reactor", "cargo", "repair", "life"];
const MAX_TICKS = 36_000;

const int = (text: string, min: number, max: number, fallback: number): number => {
  const n = Math.floor(Number(text));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

function run(label: string, fn: (g: Game) => string | void): void {
  try {
    const msg = act(fn);
    haptic("success");
    toast(msg ? `${label}: ${msg}` : label, { tone: "info", icon: "bug" });
  } catch (e) {
    console.warn("debug action", e);
    sfx("deny");
    toast(`${label}: ${String((e as Error)?.message ?? e)}`, "bad");
  }
}

function TimeSection() {
  const t = useT("settings");
  const [ticks, setTicks] = useState("600");
  const clock = useGame((g) => Math.floor(g.state.t), undefined, 5);
  const report = useGame((g) => {
    const r = g.state.offline.lastReport;
    return r ? `${fmtTime(r.seconds)} · ${fmtTime(r.credited)} · ${Math.round(r.efficiency * 100)} % · +${fmt(r.credits)}` : "";
  }, undefined, 5);
  const skip = (secs: number, label: string) =>
    run(label, (g) => {
      const before = g.state.credits;
      const r = applyOffline(g, secs);
      return `+${fmt(B.subClamp(g.state.credits, before))} (${r.events.length} ev.)`;
    });
  return (
    <Col gap="xs">
      <KeyValue label={t("debug.clock")} value={fmtTime(clock)} testID="debug-clock" />
      <MicroLabel size="label">{t("debug.skipOffline")}</MicroLabel>
      <KeyRow>
        <Key size="sm" label="+1 min" onPress={() => skip(60, "+1 min")} testID="skip-1m" />
        <Key size="sm" label="+1 h" onPress={() => skip(3600, "+1 h")} testID="skip-1h" />
        <Key size="sm" label="+8 h" tone="orange" onPress={() => skip(8 * 3600, "+8 h")} testID="skip-8h" />
      </KeyRow>
      {report ? (
        <CodeBox lines={2} testID="debug-report">
          {`${t("debug.lastReport")}: ${report}`}
        </CodeBox>
      ) : null}
      <MicroLabel size="label">{t("debug.ticks")}</MicroLabel>
      <Row gap="sm">
        <Field value={ticks} onChangeText={setTicks} numeric maxLength={6} accessibilityLabel={t("debug.ticks")} testID="ticks-n" style={{ flex: 1 }} />
        <Key
          size="sm"
          icon="play"
          label={t("debug.ticksRun")}
          onPress={() =>
            run(t("debug.ticksRun"), (g) => {
              const n = int(ticks, 1, MAX_TICKS, 600);
              const t0 = Date.now();
              for (let i = 0; i < n; i++) tick(g);
              return `${n} · ${Date.now() - t0} ms`;
            })
          }
          testID="ticks-run"
        />
      </Row>
    </Col>
  );
}

function GrantSection() {
  const t = useT("settings");
  const [level, setLevel] = useState("50");
  const [mk, setMk] = useState<"1" | "2" | "3" | "4" | "5">("1");
  const wallet = useGame((g) => `${fmt(g.state.credits)} cr · ${fmt(g.state.rp)} RP · ${fmt(g.state.prestige.stamps)}/${fmt(g.state.prestige.rivets)}/${fmt(g.state.prestige.sparks)}`, undefined, 3);
  return (
    <Col gap="xs">
      <CodeBox lines={1} testID="debug-wallet">
        {wallet}
      </CodeBox>
      <KeyRow>
        <Key
          size="sm"
          icon="coin"
          label={t("debug.credits")}
          onPress={() =>
            run(t("debug.credits"), (g) => {
              const amount = B.max(B.big(1e6), B.mulN(g.state.credits, 999));
              addCredits(g, amount);
              return `+${fmt(amount)}`;
            })
          }
          testID="grant-credits"
        />
        <Key
          size="sm"
          icon="rp"
          label={t("debug.rp")}
          onPress={() =>
            run(t("debug.rp"), (g) => {
              const amount = B.max(B.big(1e5), B.mulN(g.state.rp, 999));
              g.state.rp = B.add(g.state.rp, amount);
              return `+${fmt(amount)}`;
            })
          }
          testID="grant-rp"
        />
      </KeyRow>
      <KeyRow>
        <Key
          size="sm"
          icon="cargo"
          label={t("debug.items")}
          onPress={() =>
            run(t("debug.items"), (g) => {
              let n = 0;
              for (const id in g.content.items) {
                const def = g.content.items[id];
                if (def.category === "module") continue;
                addItem(g, id, def.category === "mega" || def.category === "artifact" || def.category === "special" ? 1 : 1000);
                n++;
              }
              g.dirty = true;
              return String(n);
            })
          }
          testID="grant-items"
        />
        <Key
          size="sm"
          icon="stamp"
          label={t("debug.prestige")}
          onPress={() =>
            run(t("debug.prestige"), (g) => {
              grantStamps(g, 1000);
              g.state.prestige.rivets = B.add(g.state.prestige.rivets, B.big(1000));
              g.state.prestige.sparks = B.add(g.state.prestige.sparks, B.big(1000));
              return "+1000";
            })
          }
          testID="grant-prestige"
        />
      </KeyRow>
      <Rule label={t("debug.decks")} />
      <Row gap="sm">
        <Field value={level} onChangeText={setLevel} numeric maxLength={4} accessibilityLabel={t("debug.decks")} testID="deck-level" style={{ flex: 1 }} />
        <Key
          size="sm"
          icon="upgrade"
          label={t("debug.decksSet")}
          onPress={() =>
            run(t("debug.decksSet"), (g) => {
              const n = int(level, 1, 2000, 50);
              for (const id of DECK_IDS) g.state.decks[id as DeckId].level = n;
              g.dirty = true;
              return String(n);
            })
          }
          testID="deck-set"
        />
      </Row>
      <Rule label={t("debug.addThings")} />
      <KeyRow>
        <Key size="sm" icon="crew" label={t("debug.crew")} onPress={() => run(t("debug.crew"), (g) => `uid ${g.api.addCrew()}`)} testID="add-crew" />
        <Key size="sm" icon="card" label={t("debug.card")} onPress={() => run(t("debug.card"), (g) => g.api.grantCard() ?? "-")} testID="add-card" />
      </KeyRow>
      <Row gap="sm">
        <MicroLabel size="label">{t("debug.module")}</MicroLabel>
        <Segmented
          size="sm"
          options={[
            { value: "1", label: "MK1" },
            { value: "2", label: "MK2" },
            { value: "3", label: "MK3" },
            { value: "4", label: "MK4" },
            { value: "5", label: "MK5" },
          ]}
          value={mk}
          onChange={setMk}
          style={{ flex: 1 }}
        />
      </Row>
      <Row gap="xs" wrap>
        {FAMILIES.map((f) => (
          <Key
            key={f}
            size="sm"
            icon={`fam_${f}`}
            label={f}
            onPress={() =>
              run(t("debug.module"), (g) => {
                const id = `mod_${f}_mk${mk}`;
                if (!g.content.items[id]) throw new Error(id);
                g.api.addModule(id, 1);
                g.dirty = true;
                return id;
              })
            }
            testID={`add-mod-${f}`}
          />
        ))}
      </Row>
    </Col>
  );
}

function WorldSection() {
  const t = useT("settings");
  const [depth, setDepth] = useState("10");
  const where = useGame((g) => `${g.state.nav.g}:${g.state.nav.depth}:${g.state.nav.lane} · ${t("debug.chapter")} ${g.state.story.chapter}`, undefined, 3);
  return (
    <Col gap="xs">
      <CodeBox lines={1} testID="debug-where">
        {where}
      </CodeBox>
      <MicroLabel size="label">{t("debug.presets")}</MicroLabel>
      <Row gap="xs" wrap>
        {PRESETS.map((p) => (
          <Key key={p} size="sm" label={p} onPress={() => run(`preset ${p}`, (g) => applyPreset(g, p as PresetId))} testID={`preset-${p}`} />
        ))}
      </Row>
      <KeyRow>
        <Key
          size="sm"
          icon="unlock"
          label={t("debug.features")}
          onPress={() =>
            run(t("debug.features"), (g) => {
              let n = 0;
              for (const f of FEATURES) if (unlockFeature(g, f)) n++;
              g.dirty = true;
              return `+${n}`;
            })
          }
          testID="unlock-features"
        />
        <Key
          size="sm"
          icon="book"
          label={t("debug.chapterDone")}
          onPress={() =>
            run(t("debug.chapterDone"), (g) => {
              const s = g.state.story;
              if (s.chapter >= finalChapter(g)) return "max";
              const def = chapterDef(g, s.chapter + 1);
              if (!def) return "-";
              s.chapter = def.id;
              if (def.unlocks) for (const f of def.unlocks) unlockFeature(g, f);
              statMax(g, "chapters", def.id);
              syncCosmetics(g);
              g.dirty = true;
              return String(def.id);
            })
          }
          testID="chapter-done"
        />
      </KeyRow>
      <Rule label={t("debug.jump")} />
      <Row gap="sm">
        <Field value={depth} onChangeText={setDepth} numeric maxLength={3} accessibilityLabel={t("debug.jump")} testID="jump-depth" style={{ flex: 1 }} />
        <Key
          size="sm"
          icon="jump"
          label={t("debug.jumpGo")}
          onPress={() =>
            run(t("debug.jumpGo"), (g) => {
              const nav = g.state.nav;
              const d = int(depth, 0, galaxyDepth(g.content, nav.g), nav.depth);
              nav.depth = d;
              nav.lane = 0;
              nav.jump = null;
              nav.charge = 0;
              nav.maxDepth = Math.max(nav.maxDepth, d);
              nav.visited[`${nav.g}:${d}:0`] = 1;
              statMax(g, "depthMax", d);
              g.api.discover(`system:${nav.g}:${d}:0`);
              g.dirty = true;
              return String(d);
            })
          }
          testID="jump-go"
        />
      </Row>
    </Col>
  );
}

const EventRow = memo(function EventRow({ id, title, onFire }: { id: string; title: string; onFire: (id: string) => void }) {
  return <ListRow title={title} subtitle={id} icon={`ev_${content.events[id].type}`} onPress={() => onFire(id)} chevron divider testID={`event-${id}`} />;
});

function TriggerSection() {
  const t = useT("settings");
  const tr = useTr();
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<"1" | "2" | "3">("1");
  const state = useGame((g) => `${g.state.events.active?.id ?? "-"} · ${g.state.failure?.kind ?? "-"} · ${g.state.minigame ? `${g.state.minigame.game}/${g.state.minigame.tier}` : "-"}`, undefined, 2);
  const all = useMemo(() => Object.keys(content.events).map((id) => ({ id, title: tr(content.events[id].title), hay: `${id} ${content.events[id].title.cs} ${content.events[id].title.en}`.toLowerCase() })), [tr]);
  const q = query.trim().toLowerCase();
  const hits = useMemo(() => (q ? all.filter((e) => e.hay.includes(q)) : all), [all, q]);
  const fire = useCallback(
    (id: string) =>
      run(t("debug.event"), (g) => {
        g.state.events.active = null;
        if (!g.api.triggerEvent(id)) throw new Error(id);
        return id;
      }),
    [t],
  );
  return (
    <Col gap="xs">
      <MicroLabel size="label">{t("debug.triggerState")}</MicroLabel>
      <CodeBox lines={2} testID="debug-trigger-state">
        {state}
      </CodeBox>
      <MicroLabel size="label">{t("debug.failures")}</MicroLabel>
      <Row gap="xs" wrap>
        {FAILURES.map((k) => (
          <Key
            key={k}
            size="sm"
            icon={`fail_${k}`}
            label={k}
            onPress={() =>
              run(t("debug.failures"), (g) => {
                if (g.state.failure) g.api.clearFailure("tow");
                if (!g.api.startFailure(k)) throw new Error(k);
                g.dirty = true;
                return k;
              })
            }
            testID={`failure-${k}`}
          />
        ))}
        <Key size="sm" icon="check" label={t("debug.failureClear")} tone="mint" onPress={() => run(t("debug.failureClear"), (g) => g.api.clearFailure("tow"))} testID="failure-clear" />
      </Row>
      <Row gap="sm">
        <MicroLabel size="label">{t("debug.minigames")}</MicroLabel>
        <Segmented
          size="sm"
          options={[
            { value: "1", label: "T1" },
            { value: "2", label: "T2" },
            { value: "3", label: "T3" },
          ]}
          value={tier}
          onChange={setTier}
          style={{ flex: 1 }}
        />
      </Row>
      <Row gap="xs" wrap>
        {MINIGAMES.map((m) => (
          <Key key={m} size="sm" icon={`mg_${m}`} label={m} onPress={() => run(t("debug.minigames"), (g) => `${m} #${g.api.requestMinigame(m, Number(tier) as MinigameTier, "practice", 0)}`)} testID={`minigame-${m}`} />
        ))}
      </Row>
      <Rule label={`${t("debug.events")} (${hits.length}/${all.length})`} />
      <Field value={query} onChangeText={setQuery} placeholder={t("debug.eventSearch")} accessibilityLabel={t("debug.eventSearch")} testID="event-search" />
      {hits.slice(0, 24).map((e) => (
        <EventRow key={e.id} id={e.id} title={e.title} onFire={fire} />
      ))}
      {hits.length > 24 ? <MicroLabel>{t("debug.eventMore", { n: hits.length - 24 })}</MicroLabel> : null}
    </Col>
  );
}

function PerfSection() {
  const t = useT("settings");
  const { width } = useWindowDimensions();
  const perfHud = useSettings((s) => s.perfHud);
  const timings = useGame(() => `${perf.tickMs} ms · ${perf.pulseMs} ms · ${perf.ticksPerPulse}`, undefined, 5);
  const [inspect, setInspect] = useState("");
  const measure = useCallback(() => {
    const s = getGame().state;
    const json = JSON.stringify(s);
    const queues = s.craft.refinery.queue.length + s.craft.fabricator.queue.length + s.craft.workshop.queue.length;
    setInspect(
      [
        `JSON ${(json.length / 1024).toFixed(1)} kB`,
        `modules ${s.modules.length} · buffs ${s.buffs.length} · queues ${queues}`,
        `inv ${Object.keys(s.inv).length} · codex ${Object.keys(s.codex).length} · stats ${Object.keys(s.stats).length} · flags ${Object.keys(s.flags).length}`,
        `crew ${s.crew.length} · expeditions ${s.expeditions.length} · outposts ${s.outposts.length} · salvage ${s.active.salvage.length}`,
        `repair jobs ${s.repair.jobs.length} · contracts ${s.station.contracts.length} · visited ${Object.keys(s.nav.visited).length}`,
      ].join("\n"),
    );
  }, []);
  return (
    <Col gap="xs">
      <SettingRow icon="bug" title={t("debug.perfHud")} hint={t("debug.perfHudHint")} right={<Toggle value={perfHud} onChange={(v) => useSettings.getState().set("perfHud", v)} accessibilityLabel={t("debug.perfHud")} />} testID="perf-hud" />
      <KeyValue label={t("debug.timings")} value={timings} testID="debug-timings" />
      <Rule label={t("debug.graph")} />
      <EconomyGraph width={Math.min(width, 430) - 40} />
      <MicroLabel>{t("debug.graphHint")}</MicroLabel>
      <Rule label={t("debug.inspector")} />
      <Key size="sm" icon="scan" label={t("debug.inspect")} onPress={measure} testID="inspect" />
      {inspect ? (
        <CodeBox lines={6} testID="inspect-out">
          {inspect}
        </CodeBox>
      ) : null}
      <Rule label={t("debug.crash")} />
      <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
        {t("debug.crashHint")}
      </Txt>
      <Key
        size="sm"
        icon="skull"
        label={t("debug.crashDo")}
        tone="red"
        onPress={() => {
          // Same shape the crash guard writes: one failed launch on record and one still pending,
          // which the next launch counts as the second unclean start.
          const ok = writeText("launch.json", JSON.stringify({ fails: 1, pending: true, forced: null, lastError: "debug: simulated crash loop" }));
          toast(ok ? t("debug.crashSet") : t("debug.crashFailed"), ok ? "warn" : "bad");
        }}
        testID="crash-sim"
      />
    </Col>
  );
}

export function DebugSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT("settings");
  const [section, setSection] = useState<Section>("time");
  return (
    <Sheet visible={visible} onClose={onClose} title={t("debug.title")} maxHeight={0.94} testID="debug-sheet">
      <Col gap="sm">
        <Segmented<Section>
          size="sm"
          tone="yellow"
          options={[
            { value: "time", label: t("debug.secTime") },
            { value: "grant", label: t("debug.secGrant") },
            { value: "world", label: t("debug.secWorld") },
            { value: "trigger", label: t("debug.secTrigger") },
            { value: "perf", label: t("debug.secPerf") },
          ]}
          value={section}
          onChange={setSection}
        />
        {section === "time" ? <TimeSection /> : null}
        {section === "grant" ? <GrantSection /> : null}
        {section === "world" ? <WorldSection /> : null}
        {section === "trigger" ? <TriggerSection /> : null}
        {section === "perf" ? <PerfSection /> : null}
      </Col>
    </Sheet>
  );
}

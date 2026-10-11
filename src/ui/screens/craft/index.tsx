// Craft tab: station switcher, per-station queue, recipe browser and the inventory. One row of
// keys picks the station and the view; everything below is a single thumb-scrolled list.
import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import * as B from "@/engine/big";
import { content } from "@/content";
import { canCraft, cancelCraft, craftSeconds, moveCraft, unlockCost } from "@/engine/core";
import type { CraftStationId, Game, ItemId, RecipeId } from "@/engine/types";
import { useT, useTr } from "@/i18n";
import { haptic } from "@/platform/feedback";
import { act, getGame, useGame } from "@/store/game";
import { goTo, useUi } from "@/store/ui";
import { fmt, fmtPct, useFmt } from "@/ui/format";
import { Badge, Chip, EmptyState, Icon, IconKey, Key, KeyRow, MicroLabel, ProgressBar, Row, ScrollWell, Txt, toast, useTheme } from "@/ui/kit";
import { palette, space } from "@/ui/theme";

import { AgainStrip, enqueue } from "./again";
import { Inventory } from "./inventory";
import { ItemSheet } from "./ItemSheet";
import { STATIONS, inputLevel, missingInput, perMinute, primaryOf, speedOf, stationBatch, unlockOrder, valueAdded } from "./model";
import { LockCard, Silhouette, usePulseValue } from "./parts";
import { RecipeSheet, secsText, useUnlockText } from "./RecipeSheet";

export type CraftView = "queue" | "recipes" | "inventory";

export interface CraftScreenProps {
  initialStation?: CraftStationId;
  initialView?: CraftView;
}

const VIEWS: readonly CraftView[] = ["queue", "recipes", "inventory"];
const JOB_H = 60;
const RECIPE_H = 78;
const FILTER_H = 32;

// ---------- queue -----------------------------------------------------------------------------

type JobStatus = "running" | "waiting" | "inputs" | "cargo" | "power";
interface JobRowData {
  kind: "job";
  uid: number;
  recipe: RecipeId;
  left: number;
  status: JobStatus;
  missing: ItemId | null;
  first: boolean;
  last: boolean;
}
type QueueRow = JobRowData | { kind: "socket"; key: string };

function queueSig(g: Game, station: CraftStationId): string {
  const queue = g.state.craft[station].queue;
  let s = `${g.rates.craftSlots[station]}`;
  for (let i = 0; i < queue.length; i++) {
    const j = queue[i];
    s += `|${j.uid}:${j.left}:${j.stalled ?? ""}`;
    if (j.stalled === "inputs") s += missingInput(g, content.recipes[j.recipe]) ?? "";
  }
  return s;
}

function buildQueue(g: Game, station: CraftStationId): QueueRow[] {
  const queue = g.state.craft[station].queue;
  const slots = g.rates.craftSlots[station];
  const rows: QueueRow[] = [];
  let running = 0;
  for (let i = 0; i < queue.length; i++) {
    const j = queue[i];
    let status: JobStatus = j.stalled ?? "waiting";
    if (!j.stalled && running < slots) {
      status = "running";
      running++;
    }
    rows.push({ kind: "job", uid: j.uid, recipe: j.recipe, left: j.left, status, missing: j.stalled === "inputs" ? missingInput(g, content.recipes[j.recipe]) : null, first: i === 0, last: i === queue.length - 1 });
  }
  for (let i = running; i < slots; i++) rows.push({ kind: "socket", key: `socket${i}` });
  return rows;
}

const JobRow = memo(function JobRow({ station, row }: { station: CraftStationId; row: JobRowData }) {
  const t = useT("craft");
  const tr = useTr();
  const theme = useTheme();
  const def = content.recipes[row.recipe];
  const item = primaryOf(def);
  const name = tr(content.items[item]?.name);
  const progress = usePulseValue((g) => {
    const queue = g.state.craft[station].queue;
    for (let i = 0; i < queue.length; i++) if (queue[i].uid === row.uid) return Math.min(1, queue[i].progress / Math.max(0.01, def.time));
    return 0;
  });
  const stalled = row.status === "inputs" || row.status === "cargo" || row.status === "power";
  const status =
    row.status === "inputs" ? t("job.inputs", { item: tr(content.items[row.missing ?? ""]?.name) || "?" }) : t(`job.${row.status}`);
  const move = (delta: number) => {
    act((g) => moveCraft(g, station, row.uid, delta));
  };
  return (
    <View testID={`job-${row.uid}`} style={{ height: JOB_H, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.xs, borderBottomWidth: 1, borderBottomColor: theme.rule }}>
      <Icon name={content.items[item]?.icon ?? item} size={24} chip />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Row gap="xs">
          <Txt variant="bodyBold" numberOfLines={1} style={{ flex: 1 }}>
            {name}
          </Txt>
          {row.left === -1 ? <Icon name="auto" size={16} /> : <Txt variant="label" tabular>{`×${row.left}`}</Txt>}
        </Row>
        <ProgressBar value={progress} height={4} tone={stalled ? "red" : row.status === "running" ? "orange" : "ink"} />
        <Txt variant="label" color={stalled ? "bad" : "inkDim"} numberOfLines={1}>
          {status}
        </Txt>
      </View>
      <Row gap={4}>
        <IconKey icon="up" size="sm" width={38} disabled={row.first} onPress={() => move(-1)} accessibilityLabel={t("job.earlier", { name })} />
        <IconKey icon="down" size="sm" width={38} disabled={row.last} onPress={() => move(1)} accessibilityLabel={t("job.later", { name })} />
        <IconKey
          icon="close"
          size="sm"
          width={38}
          tone="red"
          testID={`cancel-${row.uid}`}
          accessibilityLabel={t("job.cancel", { name })}
          onPress={() => {
            act((g) => cancelCraft(g, station, row.uid));
            toast(t("toast.cancelled", { name }), "info");
          }}
        />
      </Row>
    </View>
  );
});

const QueueView = memo(function QueueView({ station, onBrowse }: { station: CraftStationId; onBrowse: () => void }) {
  const t = useT("craft");
  const theme = useTheme();
  const sig = useGame((g) => queueSig(g, station), Object.is, 2);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => buildQueue(getGame(), station), [sig, station]);
  const renderItem = useCallback(
    ({ item }: { item: QueueRow }) =>
      item.kind === "job" ? (
        <JobRow station={station} row={item} />
      ) : (
        <Pressable onPress={onBrowse} accessibilityRole="button" accessibilityLabel={t("queue.socketA11y")} style={{ height: JOB_H, padding: 4 }}>
          <View style={{ flex: 1, borderWidth: 1, borderStyle: "dashed", borderColor: theme.inkDim, borderRadius: 5, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm }}>
            <Icon name="plus" size={16} color="inkDim" />
            <View style={{ flex: 1 }}>
              <Txt variant="bodyBold" color="inkDim">
                {t("queue.socket")}
              </Txt>
              <Txt variant="label" color="inkDim">
                {t("queue.socketHint")}
              </Txt>
            </View>
          </View>
        </Pressable>
      ),
    [station, onBrowse, t, theme],
  );
  return (
    <ScrollWell<QueueRow>
      style={{ flex: 1 }}
      data={rows}
      renderItem={renderItem}
      keyExtractor={(r) => (r.kind === "job" ? `j${r.uid}` : r.key)}
      getItemLayout={(_, index) => ({ length: JOB_H, offset: JOB_H * index, index })}
      ListFooterComponent={<AgainStrip />}
      ListFooterComponentStyle={{ paddingHorizontal: space.xs, paddingBottom: space.xs }}
    />
  );
});

// ---------- recipe browser --------------------------------------------------------------------

interface RecipeRowData {
  id: RecipeId;
  known: boolean;
  levels: string;
}

function recipesSig(g: Game, station: CraftStationId): string {
  const b = g.rates.craftBatch[station];
  let s = `${b.m}e${b.e}|${speedOf(g).toFixed(2)}`;
  for (const id in content.recipes) {
    const def = content.recipes[id];
    if (def.station !== station) continue;
    if (g.state.recipes[id] !== 1) {
      s += "|-";
      continue;
    }
    s += "|";
    for (const item in def.inputs) s += inputLevel(g, def, item);
  }
  return s;
}

function buildRecipes(g: Game, station: CraftStationId, tier: number, ready: boolean): RecipeRowData[] {
  const known: RecipeRowData[] = [];
  const unknown: RecipeRowData[] = [];
  for (const id in content.recipes) {
    const def = content.recipes[id];
    if (def.station !== station || (tier > 0 && def.tier !== tier)) continue;
    if (g.state.recipes[id] === 1) {
      if (ready && !canCraft(g, id).ok) continue;
      let levels = "";
      for (const item in def.inputs) levels += inputLevel(g, def, item);
      known.push({ id, known: true, levels });
    } else if (!ready) unknown.push({ id, known: false, levels: "" });
  }
  known.sort((a, b) => content.recipes[a.id].tier - content.recipes[b.id].tier);
  unknown.sort((a, b) => unlockOrder(content.recipes[a.id]) - unlockOrder(content.recipes[b.id]));
  return known.concat(unknown);
}

const LEVEL_COLOR = ["bad", "warn", "good"] as const;

const RecipeRow = memo(function RecipeRow({ row, tick, onOpen }: { row: RecipeRowData; tick: string; onOpen: (id: RecipeId) => void }) {
  const t = useT("craft");
  const tr = useTr();
  const theme = useTheme();
  const unlockText = useUnlockText();
  const def = content.recipes[row.id];
  const primary = primaryOf(def);
  const item = content.items[primary];
  const name = tr(item?.name);
  const frame = { height: RECIPE_H, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.xs, borderBottomWidth: 1, borderBottomColor: theme.rule } as const;

  if (!row.known) {
    return (
      <Pressable testID={`locked-${row.id}`} onPress={() => onOpen(row.id)} accessibilityRole="button" accessibilityLabel={`${name}, ${unlockText(def)}`} style={({ pressed }) => [frame, { backgroundColor: pressed ? theme.platePressed : "transparent" }]}>
        <Silhouette name={item?.icon ?? primary} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt variant="bodyBold" color="inkDim" numberOfLines={1}>
            {name}
          </Txt>
          <Row gap="xs" align="flex-start">
            <Icon name="lock" size={16} color="inkDim" />
            <Txt variant="label" color="inkDim" numberOfLines={2} style={{ flex: 1 }}>
              {unlockText(def)}
            </Txt>
          </Row>
        </View>
        <Badge label={`T${def.tier}`} />
      </Pressable>
    );
  }

  const g = getGame();
  const batch = stationBatch(g, def);
  const va = valueAdded(def);
  const by = def.byproducts?.[0];
  const ready = row.levels.indexOf("0") < 0;
  // `tick` only exists to re-render the numbers when batch size or speed changed
  void tick;
  return (
    <View style={frame}>
      <Pressable
        testID={`recipe-${row.id}`}
        onPress={() => onOpen(row.id)}
        onPressIn={() => haptic("tap")}
        accessibilityRole="button"
        accessibilityLabel={name}
        style={({ pressed }) => ({ flex: 1, minWidth: 0, alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: 4, backgroundColor: pressed ? theme.platePressed : "transparent" })}
      >
        <Icon name={item?.icon ?? primary} size={24} chip />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Row gap="xs">
            <Txt variant="bodyBold" numberOfLines={1} style={{ flex: 1 }}>
              {name}
            </Txt>
            <Txt variant="label" tabular>
              {item?.module ? t("row.module") : `×${fmt(B.mulN(batch, def.outputs[primary] ?? 1))}`}
            </Txt>
          </Row>
          <View style={{ flexDirection: "row", gap: 6, overflow: "hidden", height: 24, alignItems: "center" }}>
            {Object.keys(def.inputs).map((input, i) => (
              <Row key={input} gap={3}>
                <Icon name={content.items[input]?.icon ?? input} size={16} chip />
                <Txt variant="label" color={LEVEL_COLOR[Number(row.levels[i]) || 0]} tabular>
                  {fmt(def.inputs[input])}
                </Txt>
              </Row>
            ))}
            {by ? (
              <Row gap={3} style={{ marginLeft: "auto" }}>
                <Txt variant="label" color="inkDim">
                  +
                </Txt>
                <Icon name={content.items[by.item]?.icon ?? by.item} size={16} chip />
                <Txt variant="label" color="inkDim" tabular>
                  {fmtPct(Math.min(1, by.chance))}
                </Txt>
              </Row>
            ) : null}
          </View>
          <Txt variant="micro" color="inkDim" numberOfLines={1}>
            {`${secsText(craftSeconds(g, def.id))} · ${t("row.perMin", { n: fmt(perMinute(g, def)) })} · ${t("row.value", { pct: `${va >= 0 ? "+" : "−"}${fmtPct(Math.abs(va))}` })}`}
          </Txt>
        </View>
      </Pressable>
      <IconKey
        icon="plus"
        size="sm"
        width={40}
        tone={ready ? "orange" : "black"}
        testID={`quick-${row.id}`}
        sound={null}
        accessibilityLabel={t("row.quickA11y", { name })}
        onPress={() => enqueue(row.id, 1, t, name)}
      />
    </View>
  );
});

const RecipesView = memo(function RecipesView({ station, onOpen }: { station: CraftStationId; onOpen: (id: RecipeId) => void }) {
  const t = useT("craft");
  const [tier, setTier] = useState(0);
  const [ready, setReady] = useState(false);
  const sig = useGame((g) => recipesSig(g, station), Object.is, 5);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => buildRecipes(getGame(), station, tier, ready), [sig, station, tier, ready]);
  const tiers = useMemo(() => {
    const set = new Set<number>();
    for (const id in content.recipes) if (content.recipes[id].station === station) set.add(content.recipes[id].tier);
    return [...set].sort();
  }, [station]);
  const tick = sig.slice(0, sig.indexOf("|", sig.indexOf("|") + 1));
  const renderItem = useCallback(({ item }: { item: RecipeRowData }) => <RecipeRow row={item} tick={tick} onOpen={onOpen} />, [tick, onOpen]);
  return (
    <ScrollWell<RecipeRowData>
      style={{ flex: 1 }}
      data={rows}
      renderItem={renderItem}
      keyExtractor={(r) => r.id}
      getItemLayout={(_, index) => ({ length: RECIPE_H, offset: FILTER_H + RECIPE_H * index, index })}
      initialNumToRender={5}
      windowSize={7}
      ListHeaderComponent={
        <Row gap="xs" style={{ height: FILTER_H, paddingHorizontal: space.xs }}>
          {tiers.length > 1 ? <Chip label={t("filter.all")} selected={tier === 0} onPress={() => setTier(0)} /> : null}
          {tiers.length > 1 ? tiers.map((n) => <Chip key={n} label={`T${n}`} selected={tier === n} onPress={() => setTier(n)} />) : null}
          <View style={{ flex: 1 }} />
          <Chip label={t("filter.ready")} icon="check" selected={ready} onPress={() => setReady((v) => !v)} />
        </Row>
      }
      ListEmptyComponent={<EmptyState compact icon="craft" title={t("filter.emptyTitle")} hint={t("filter.emptyHint")} />}
    />
  );
});

// ---------- screen ----------------------------------------------------------------------------

function busiestStation(g: Game): CraftStationId {
  let best: CraftStationId = "refinery";
  for (const st of STATIONS) if (g.state.craft[st].queue.length > g.state.craft[best].queue.length) best = st;
  return best;
}

export default function CraftScreen({ initialStation, initialView }: CraftScreenProps) {
  const theme = useTheme();
  const t = useT("craft");
  const tr = useTr();
  useFmt();
  const section = useUi((s) => s.section);
  const nonce = useUi((s) => s.nonce);
  const [station, setStation] = useState<CraftStationId>(() => initialStation ?? busiestStation(getGame()));
  const [view, setView] = useState<CraftView>(() => initialView ?? (getGame().state.craft[initialStation ?? busiestStation(getGame())].queue.length > 0 ? "queue" : "recipes"));
  const [recipe, setRecipe] = useState<RecipeId | null>(null);
  const [item, setItem] = useState<ItemId | null>(null);

  // deep links from the goals strip and toasts: goTo("craft", "fabricator" | "inventory" | ...)
  const [seenNonce, setSeenNonce] = useState(-1);
  if (nonce !== seenNonce) {
    setSeenNonce(nonce);
    if (section && (STATIONS as readonly string[]).includes(section)) setStation(section as CraftStationId);
    else if (section === "queue" || section === "recipes" || section === "inventory") setView(section);
  }

  const head = useGame(
    (g) => ({
      level: g.state.decks[station].level,
      batch: fmt(g.rates.craftBatch[station]),
      speed: fmt(speedOf(g), 3),
      slots: g.rates.craftSlots[station],
      queued: g.state.craft[station].queue.length,
      built: STATIONS.map((st) => (g.state.decks[st].level > 0 ? "1" : "0")).join(""),
      cargo: `${fmt(g.rates.cargoUsed)} / ${fmt(g.rates.cargoCap)}`,
    }),
    undefined,
    3,
  );

  const openRecipe = useCallback((id: RecipeId) => setRecipe(id), []);
  const browse = useCallback(() => setView("recipes"), []);
  const closeRecipe = useCallback(() => setRecipe(null), []);
  const closeItem = useCallback(() => setItem(null), []);
  const recipeFromItem = useCallback((id: RecipeId) => {
    setItem(null);
    setRecipe(id);
  }, []);

  const deck = content.decks[station];
  const locked = head.level <= 0;
  const cost = locked ? unlockCost(getGame(), station) : null;
  const needs = deck.unlock.items
    ? Object.keys(deck.unlock.items)
        .map((id) => `${tr(content.items[id]?.name)} ×${fmt(deck.unlock.items?.[id] ?? 0)}`)
        .join(", ")
    : "";

  return (
    <View style={{ flex: 1, backgroundColor: theme.body, paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.sm, gap: 6 }}>
      <Row gap={4}>
        {STATIONS.map((st, i) => (
          <Key
            key={st}
            testID={`station-${st}`}
            icon={head.built[i] === "1" ? `deck_${st}` : "lock"}
            width={44}
            size="sm"
            tone={st === station && view !== "inventory" ? "orange" : "black"}
            latched={st === station && view !== "inventory"}
            sound="tab"
            hapticKind="tap"
            accessibilityLabel={tr(content.decks[st].name)}
            onPress={() => {
              setStation(st);
              if (view === "inventory") setView("recipes");
            }}
          />
        ))}
        <KeyRow gap={4} style={{ flex: 1, marginLeft: 4 }}>
          {VIEWS.map((v) => (
            <Key key={v} testID={`view-${v}`} size="sm" tone={view === v ? "cobalt" : "black"} latched={view === v} sound="toggle" hapticKind="tap" accessibilityLabel={t(`view.${v}`)} onPress={() => setView(v)} style={{ minWidth: 0 }}>
              <Txt variant="key" color={view === v ? palette.bone2 : "keyText"} upper numberOfLines={1} style={{ fontSize: 10, letterSpacing: 0.2 }}>
                {t(`view.${v}`)}
              </Txt>
              {v === "queue" && head.queued > 0 ? <Badge label={head.queued} tone="orange" style={{ position: "absolute", top: -4, right: -6 }} /> : null}
            </Key>
          ))}
        </KeyRow>
      </Row>

      {view === "inventory" ? (
        <MicroLabel>{`${t("view.inventory")} · ${t("station.cargo")} ${head.cargo}`}</MicroLabel>
      ) : (
        <MicroLabel color={locked ? "inkDim" : "ink"}>
          {locked
            ? `${tr(deck.name)} · ${t("station.locked")}`
            : `${tr(deck.name)} · ${t("station.batch")} ×${head.batch} · ${t("station.speed")} ×${head.speed} · ${t("station.slots", { count: head.slots })}`}
        </MicroLabel>
      )}

      {view === "inventory" ? (
        <Inventory onOpen={setItem} />
      ) : locked ? (
        <LockCard
          icon={deck.icon}
          title={tr(deck.name)}
          hint={`${tr(deck.desc)} ${t(needs ? "station.lockedHintItems" : "station.lockedHint", { cost: fmt(cost), items: needs })}`}
          actionLabel={t("station.toShip")}
          onAction={() => goTo("ship")}
        />
      ) : view === "queue" ? (
        <QueueView key={station} station={station} onBrowse={browse} />
      ) : (
        <RecipesView key={station} station={station} onOpen={openRecipe} />
      )}

      <RecipeSheet recipe={recipe} onClose={closeRecipe} />
      <ItemSheet item={item} onClose={closeItem} onRecipe={recipeFromItem} />
    </View>
  );
}

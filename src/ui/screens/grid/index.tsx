// Grid tab: the tech grid with tap-to-place (stored module -> highlighted cell -> stat preview ->
// confirm), the module tray, and the repair and bot sections.
import { memo, useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, View, type LayoutChangeEvent } from "react-native";

import { content } from "@/content";
import { adjacentSame, findModule } from "@/engine/core";
import type { Game, ModuleInst } from "@/engine/types";
import { useT, useTr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { getGame, useGame } from "@/store/game";
import { goTo, useUi } from "@/store/ui";
import { fmtTime } from "@/ui/format";
import { Icon, Key, Led, MicroLabel, Row, Segmented, StatDelta, Txt, toast, useTheme } from "@/ui/kit";
import { space } from "@/ui/theme";

import { cellName } from "../craft/model";
import { LockCard } from "../craft/parts";
import { ModuleTile } from "./ModuleTile";
import { familyOf, gridCounts, gridTotals, modState, nextDegrade, offlineAt, sortModules } from "./model";
import { BotsSection, RepairSection } from "./repair";
import { ModuleSheet, PreviewSheet, RepairSheet, type PreviewTarget } from "./sheets";

export type GridSectionId = "grid" | "repair" | "bots";

export interface GridScreenProps {
  initialSection?: GridSectionId;
}

const GAP = 6;
const TRAY_TILE = 48;

// ---------- summary header --------------------------------------------------------------------

const Summary = memo(function Summary() {
  const t = useT("grid");
  const sig = useGame(
    (g) => {
      const c = gridCounts(g);
      const next = nextDegrade(g);
      return `${c.installed}|${c.degraded}|${c.offline}|${Number.isFinite(next) ? Math.round(next / 60) : -1}|${g.rev}`;
    },
    Object.is,
    5,
  );
  const [installed, degraded, offline, mins] = sig.split("|").map(Number);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const totals = useMemo(() => gridTotals(getGame()), [sig]);
  const trouble = offline > 0 || degraded > 0;
  return (
    <View style={{ gap: 4 }}>
      <Row gap="xs">
        <Led on color={offline > 0 ? "red" : degraded > 0 ? "yellow" : "mint"} state={offline > 0 ? "blink" : "on"} />
        <MicroLabel color={trouble ? "warn" : "inkDim"} style={{ flex: 1 }}>
          {`${t("summary.modules", { count: installed })}${offline > 0 ? ` · ${t("summary.offline", { count: offline })}` : ""}${degraded > 0 ? ` · ${t("summary.degraded", { count: degraded })}` : ""}${mins >= 0 ? ` · ${t("summary.next", { time: fmtTime(mins * 60) })}` : ""}`}
        </MicroLabel>
      </Row>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md, alignItems: "center", minHeight: 20 }}>
        {totals.length === 0 ? (
          <Txt variant="label" color="inkDim">
            {t("summary.none")}
          </Txt>
        ) : (
          totals.map((x) => (
            <Row key={x.stat} gap={4}>
              <Txt variant="label">{t(`stat.${x.stat}`)}</Txt>
              <StatDelta value={x.delta} invert={x.invert} size="sm" />
            </Row>
          ))
        )}
      </ScrollView>
    </View>
  );
});

// ---------- grid ------------------------------------------------------------------------------

function modulesSig(g: Game): string {
  const grid = g.state.grid;
  let s = `${grid.w}x${grid.h}:${grid.open}`;
  for (const m of g.state.modules) s += `|${m.uid}:${m.item}:${m.q}:${Math.round(m.hp)}:${m.slot}`;
  return s;
}

interface GridSectionProps {
  placing: number | null;
  seat: { uid: number; n: number };
  onPlacing: (uid: number | null) => void;
  onModule: (uid: number) => void;
  onPreview: (target: PreviewTarget) => void;
}

const GridSection = memo(function GridSection({ placing, seat, onPlacing, onModule, onPreview }: GridSectionProps) {
  const t = useT("grid");
  const tr = useTr();
  const theme = useTheme();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const sig = useGame(modulesSig, Object.is, 2);
  const g = getGame();
  const grid = g.state.grid;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stored = useMemo(() => sortModules(g.state.modules.filter((m) => m.slot < 0)), [sig]);
  const adjBonus = (content.balance.adjacencyBonus as number) ?? 0.15;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (Math.abs(b.w - width) < 1 && Math.abs(b.h - height) < 1 ? b : { w: width, h: height }));
  }, []);

  const fit = Math.floor(Math.min((box.w - GAP * (grid.w - 1)) / grid.w, (box.h - GAP * (grid.h - 1)) / grid.h));
  const size = Math.max(44, Math.min(64, fit || 44));
  const pitch = size + GAP;
  const placingInst = placing !== null ? findModule(g, placing) : undefined;

  const pressCell = (cell: number) => {
    const uid = grid.cells[cell];
    if (cell >= grid.open) {
      sfx("deny");
      haptic("warning");
      toast(t(grid.open >= grid.w * grid.h ? "cell.lockedHull" : "cell.locked"), { tone: "info", icon: "lock" });
      return;
    }
    if (placingInst) {
      if (uid === placingInst.uid) onPlacing(null);
      else onPreview({ uid: placingInst.uid, cell });
      return;
    }
    if (uid) onModule(uid);
    else toast(t(stored.length > 0 ? "cell.pickFirst" : "cell.empty"), "info");
  };

  const cells = [];
  const links = [];
  const off = offlineAt();
  for (let i = 0; i < grid.w * grid.h; i++) {
    const x = i % grid.w;
    const y = Math.floor(i / grid.w);
    const uid = grid.cells[i];
    const inst = uid ? findModule(g, uid) : undefined;
    const locked = i >= grid.open;
    const target = !!placingInst && !locked && uid !== placingInst.uid;
    cells.push(
      <Pressable
        key={i}
        testID={`cell-${i}`}
        onPress={() => pressCell(i)}
        onPressIn={() => haptic("tap")}
        accessibilityRole="button"
        accessibilityLabel={`${cellName(i, grid.w)}: ${locked ? t("cell.a11yLocked") : inst ? tr(content.items[inst.item]?.name) : t("cell.a11yEmpty")}`}
        style={{ position: "absolute", left: x * pitch, top: y * pitch, width: size, height: size }}
      >
        {inst ? (
          <ModuleTile item={inst.item} q={inst.q} hp={inst.hp} size={size} adjBonus={adjacentSame(g, inst) * adjBonus} selected={placing === inst.uid} seat={seat.uid === inst.uid ? seat.n : 0} ghost={!!placingInst && placing !== inst.uid} />
        ) : (
          <View
            style={{
              flex: 1,
              borderRadius: 6,
              borderWidth: target ? 2 : 1,
              borderStyle: locked || target ? "dashed" : "solid",
              borderColor: target ? theme.orange : locked ? theme.inkDim : theme.rule,
              backgroundColor: locked ? "transparent" : theme.well,
              alignItems: "center",
              justifyContent: "center",
              opacity: locked ? 0.55 : 1,
            }}
          >
            {locked ? <Icon name="lock" size={16} color="inkDim" /> : target ? <Icon name="plus" size={16} color="orange" /> : <MicroLabel>{cellName(i, grid.w)}</MicroLabel>}
          </View>
        )}
        {inst && target ? <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, borderRadius: 6, borderWidth: 2, borderStyle: "dashed", borderColor: theme.orange }} /> : null}
      </Pressable>,
    );
    // adjacency links: a mint bridge across the gap to the right and bottom neighbour of the same family
    if (inst && inst.hp >= off) {
      const fam = familyOf(inst.item);
      const right = x + 1 < grid.w ? findModule(g, grid.cells[i + 1]) : undefined;
      const below = y + 1 < grid.h ? findModule(g, grid.cells[i + grid.w]) : undefined;
      if (right && right.hp >= off && familyOf(right.item) === fam) links.push(<View key={`h${i}`} pointerEvents="none" style={{ position: "absolute", left: x * pitch + size - 3, top: y * pitch + size / 2 - 5, width: GAP + 6, height: 10, borderRadius: 2, backgroundColor: theme.mint, borderWidth: 1, borderColor: theme.bezel }} />);
      if (below && below.hp >= off && familyOf(below.item) === fam) links.push(<View key={`v${i}`} pointerEvents="none" style={{ position: "absolute", left: x * pitch + size / 2 - 5, top: y * pitch + size - 3, width: 10, height: GAP + 6, borderRadius: 2, backgroundColor: theme.mint, borderWidth: 1, borderColor: theme.bezel }} />);
    }
  }
  const gridW = grid.w * pitch - GAP;
  const gridH = grid.h * pitch - GAP;

  const renderTray = useCallback(
    ({ item }: { item: ModuleInst }) => (
      <Pressable
        testID={`tray-${item.uid}`}
        onPress={() => onPlacing(placing === item.uid ? null : item.uid)}
        onLongPress={() => onModule(item.uid)}
        onPressIn={() => haptic("tap")}
        accessibilityRole="button"
        accessibilityLabel={tr(content.items[item.item]?.name)}
        accessibilityState={{ selected: placing === item.uid }}
      >
        <ModuleTile item={item.item} q={item.q} hp={item.hp} size={TRAY_TILE} selected={placing === item.uid} />
      </Pressable>
    ),
    [placing, onPlacing, onModule, tr],
  );

  return (
    <View style={{ flex: 1, gap: 6 }}>
      {placingInst ? (
        <Row gap="xs" style={{ minHeight: 40 }}>
          <Icon name="install" size={16} chip />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="bodyBold" numberOfLines={1}>
              {tr(content.items[placingInst.item]?.name)}
            </Txt>
            <Txt variant="label" color="warn" numberOfLines={1}>
              {t("place.pick")}
            </Txt>
          </View>
          <Key testID="place-detail" size="sm" label={t("place.detail")} onPress={() => onModule(placingInst.uid)} />
          <Key testID="place-cancel" size="sm" icon="close" width={44} accessibilityLabel={t("place.cancel")} onPress={() => onPlacing(null)} />
        </Row>
      ) : (
        <Summary />
      )}

      <View style={{ flex: 1, minHeight: 100 }} onLayout={onLayout}>
        {box.w > 0 ? (
          <ScrollView contentContainerStyle={{ minHeight: box.h, alignItems: "center", justifyContent: "center" }} showsVerticalScrollIndicator={gridH > box.h}>
            <ScrollView horizontal scrollEnabled={gridW > box.w} showsHorizontalScrollIndicator={false}>
              <View style={{ width: gridW, height: gridH }}>
                {cells}
                {links}
              </View>
            </ScrollView>
          </ScrollView>
        ) : null}
      </View>

      <View style={{ gap: 3 }}>
        <Row justify="space-between">
          <MicroLabel>{t("tray.title", { count: stored.length })}</MicroLabel>
          <MicroLabel>{t("cell.count", { open: grid.open, total: grid.w * grid.h })}</MicroLabel>
        </Row>
        {stored.length > 0 ? (
          <FlatList
            horizontal
            data={stored}
            renderItem={renderTray}
            keyExtractor={(m) => String(m.uid)}
            extraData={placing}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: GAP }}
            getItemLayout={(_, index) => ({ length: TRAY_TILE + GAP, offset: (TRAY_TILE + GAP) * index, index })}
            style={{ height: TRAY_TILE, flexGrow: 0 }}
          />
        ) : (
          <Pressable onPress={() => goTo("craft", "fabricator")} accessibilityRole="button" style={{ height: TRAY_TILE, borderWidth: 1, borderStyle: "dashed", borderColor: theme.inkDim, borderRadius: 6, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm }}>
            <Icon name="deck_fabricator" size={16} chip />
            <Txt variant="label" color="inkDim" style={{ flex: 1 }} numberOfLines={2}>
              {t("tray.empty")}
            </Txt>
            <Icon name="right" size={16} color="inkDim" />
          </Pressable>
        )}
      </View>
    </View>
  );
});

// ---------- screen ----------------------------------------------------------------------------

export default function GridScreen({ initialSection }: GridScreenProps) {
  const theme = useTheme();
  const t = useT("grid");
  const tr = useTr();
  const deepLink = useUi((s) => s.section);
  const nonce = useUi((s) => s.nonce);
  const [section, setSection] = useState<GridSectionId>(initialSection ?? "grid");
  const [placing, setPlacing] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [moduleUid, setModuleUid] = useState<number | null>(null);
  const [repairTarget, setRepairTarget] = useState<number | null>(null);
  const [seat, setSeat] = useState({ uid: 0, n: 0 });

  const [seenNonce, setSeenNonce] = useState(-1);
  if (nonce !== seenNonce) {
    setSeenNonce(nonce);
    if (deepLink === "grid" || deepLink === "repair" || deepLink === "bots") setSection(deepLink);
  }

  const state = useGame(
    (g) => {
      let damaged = g.state.hull.hp < 99.5 ? 1 : 0;
      for (const m of g.state.modules) if (m.slot >= 0 && modState(m.hp) !== "ok") damaged++;
      return { unlocked: g.state.features.grid === 1 || g.state.modules.length > 0, damaged, glitch: g.state.repair.jobs.some((j) => j.glitchUntil > g.state.t) };
    },
    undefined,
    5,
  );

  const openModule = useCallback((uid: number) => setModuleUid(uid), []);
  const closeModule = useCallback(() => setModuleUid(null), []);
  const closePreview = useCallback(() => setPreview(null), []);
  const closeRepair = useCallback(() => setRepairTarget(null), []);
  const startPlacing = useCallback((uid: number) => {
    setModuleUid(null);
    setSection("grid");
    setPlacing(uid);
  }, []);
  const startRemove = useCallback((uid: number) => {
    setModuleUid(null);
    setPreview({ uid, cell: -1 });
  }, []);
  const done = useCallback((uid: number, cell: number) => {
    setPreview(null);
    setPlacing(null);
    if (cell >= 0) setSeat((s) => ({ uid, n: s.n + 1 }));
  }, []);

  if (!state.unlocked) {
    const fab = content.decks.fabricator;
    return (
      <View style={{ flex: 1, backgroundColor: theme.body, padding: space.md }}>
        <LockCard icon="tab_grid" title={t("locked.title")} hint={t("locked.hint", { deck: tr(fab.name) })} actionLabel={t("locked.toShip")} onAction={() => goTo("ship")} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.body, paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.sm, gap: 6 }}>
      <Segmented<GridSectionId>
        value={section}
        onChange={(next) => {
          setSection(next);
          if (next !== "grid") setPlacing(null);
        }}
        options={[
          { value: "grid", label: t("section.grid"), icon: "tab_grid" },
          { value: "repair", label: state.damaged > 0 ? `${t("section.repair")} ${state.damaged}` : t("section.repair"), icon: "repair" },
          { value: "bots", label: t("section.bots"), icon: state.glitch ? "warning" : "bot" },
        ]}
      />
      {section === "grid" ? (
        <GridSection placing={placing} seat={seat} onPlacing={setPlacing} onModule={openModule} onPreview={setPreview} />
      ) : section === "repair" ? (
        <RepairSection onOpen={setRepairTarget} />
      ) : (
        <BotsSection />
      )}
      <PreviewSheet target={preview} onClose={closePreview} onDone={done} />
      <ModuleSheet uid={moduleUid} onClose={closeModule} onPlace={startPlacing} onRemove={startRemove} />
      <RepairSheet target={repairTarget} onClose={closeRepair} />
    </View>
  );
}

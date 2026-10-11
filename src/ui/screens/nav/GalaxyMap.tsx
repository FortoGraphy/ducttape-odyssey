// Galaxy map: the seeded lane graph, depth running upward toward the core. Rows (one per depth)
// are mounted only near the viewport, so the 40-76 depth galaxy scrolls with a constant node count.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle, Line } from "react-native-svg";

import { content } from "@/content";
import type { HazardKind, StarType } from "@/engine/types";
import { galaxyDepth, getSystem, isLinked, isVisited, lanesAt, reachable, stationLabel } from "@/engine/world";
import { useT, useTr } from "@/i18n";
import { getGame, useGame } from "@/store/game";
import { fmt, fmtPct, itemName } from "@/ui/format";
import { Icon, IconKey, Key, MicroLabel, Row, Rule, Txt, useReduceMotion, Well } from "@/ui/kit";
import { palette, radius, space } from "@/ui/theme";

import { JumpControls } from "./JumpBar";
import { HAZARD_ICON, hazardWear, posKey, route, systemName, useNavUi } from "./state";

const ROW_H = 56;
const RULER = 30;
const TOP = 84;
const BOTTOM = 20;
const SMALL = 32 / 3; // 16 px art at x2 on a @3x screen

interface MapNode {
  lane: number;
  x: number; // 0..1
  star: StarType;
  hazards: HazardKind[];
  station: boolean;
  anomaly: boolean;
  links: number[];
  isCore: boolean;
}

const rowCache = new Map<string, MapNode[]>();

function rowNodes(seed: number, g: number, depth: number, core: number): MapNode[] {
  const key = seed + ":" + g + ":" + core + ":" + depth;
  const hit = rowCache.get(key);
  if (hit) return hit;
  const lanes = lanesAt(seed, g, depth, core);
  const out: MapNode[] = [];
  for (let lane = 0; lane < lanes; lane++) {
    const s = getSystem(content, seed, g, depth, lane);
    out.push({ lane, x: s.pos.x, star: s.star, hazards: s.hazards, station: s.station !== null, anomaly: s.anomaly, links: s.links, isCore: s.isCore });
  }
  if (rowCache.size >= 240) rowCache.delete(rowCache.keys().next().value as string);
  rowCache.set(key, out);
  return out;
}

const Pulse = memo(function Pulse() {
  const reduce = useReduceMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduce) {
      p.set(0.5);
      return;
    }
    p.set(withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never }), -1, false));
  }, [reduce, p]);
  const style = useAnimatedStyle(() => ({ opacity: 0.9 - p.value * 0.8, transform: [{ scale: 0.7 + p.value * 0.9 }] }));
  return <Animated.View pointerEvents="none" style={[styles.pulse, style]} />;
});

interface RowProps {
  depth: number;
  top: number;
  width: number;
  nodes: MapNode[];
  next: MapNode[] | null;
  visited: number;
  reach: number;
  cur: number;
  routeFrom: number;
  routeTo: number;
  routeLane: number;
  sel: number;
  coreLabel: string;
  onPick: (depth: number, lane: number) => void;
}

const MapRow = memo(function MapRow({ depth, top, width, nodes, next, visited, reach, cur, routeFrom, routeTo, routeLane, sel, coreLabel, onPick }: RowProps) {
  const span = width - RULER - 10;
  const px = (x: number): number => RULER + x * span;
  const lines = [];
  if (next) {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      for (let k = 0; k < n.links.length; k++) {
        const m = next[n.links[k]];
        if (!m) continue;
        const x0 = px(n.x);
        const x1 = px(m.x);
        const len = Math.hypot(x1 - x0, ROW_H);
        const ux = (x1 - x0) / len;
        const uy = -ROW_H / len;
        const onRoute = n.lane === routeFrom && m.lane === routeTo;
        const fromShip = n.lane === cur;
        const known = (visited & (1 << n.lane)) !== 0;
        lines.push(
          <Line
            key={n.lane + "-" + m.lane}
            x1={x0 + ux * 13}
            y1={ROW_H + uy * 13}
            x2={x1 - ux * 13}
            y2={-uy * 13}
            stroke={onRoute ? palette.mint : fromShip ? palette.cobalt2 : known ? palette.steel2 : palette.steel0}
            strokeWidth={onRoute || fromShip ? 1.5 : 1}
            strokeDasharray={onRoute ? "4 3" : undefined}
          />,
        );
      }
    }
  }
  return (
    <View style={[styles.row, { top }]}>
      <View style={styles.tick} />
      <MicroLabel color={cur >= 0 ? palette.orange : palette.steel2} style={styles.depth}>
        {String(depth)}
      </MicroLabel>
      {lines.length > 0 ? (
        <Svg width={width} height={ROW_H} style={styles.links} pointerEvents="none">
          {lines}
        </Svg>
      ) : null}
      {nodes.map((n) => {
        const bit = 1 << n.lane;
        const isCur = n.lane === cur;
        const seen = (visited & bit) !== 0;
        const canReach = (reach & bit) !== 0;
        const onRoute = n.lane === routeLane;
        const ring = n.lane === sel ? palette.yellow : isCur ? palette.orange : canReach ? palette.cobalt2 : seen ? palette.steel3 : onRoute ? palette.mint : "transparent";
        const dim = !seen && !canReach && !isCur && !n.isCore;
        return (
          <Pressable key={n.lane} testID={`sys-${depth}-${n.lane}`} accessibilityRole="button" accessibilityLabel={`${depth}:${n.lane}`} onPress={() => onPick(depth, n.lane)} style={[styles.node, { left: px(n.x) - 24 }]}>
            {n.isCore ? (
              <>
                <Svg width={96} height={96} style={styles.glow} pointerEvents="none">
                  <Circle cx={48} cy={48} r={46} fill={palette.violet1} opacity={0.25} />
                  <Circle cx={48} cy={48} r={34} fill={palette.violet2} opacity={0.3} />
                  <Circle cx={48} cy={48} r={22} fill={palette.orange} opacity={0.35} />
                  <Circle cx={48} cy={48} r={14} fill={palette.void0} stroke={palette.amber} strokeWidth={1.5} />
                </Svg>
                <MicroLabel color={palette.amber} style={styles.coreLabel}>
                  {coreLabel}
                </MicroLabel>
              </>
            ) : null}
            {isCur ? <Pulse /> : null}
            <View style={[styles.disc, { borderColor: ring, backgroundColor: seen || isCur ? palette.void3 : "transparent", opacity: dim ? 0.45 : 1 }]}>
              <Icon name={`star_${n.star}`} size={16} />
            </View>
            {n.station ? <Icon name="station" size={SMALL} style={[styles.badgeR, dim ? styles.dim : null]} /> : null}
            {n.anomaly ? <Icon name="anomaly" size={SMALL} style={[styles.badgeL, dim ? styles.dim : null]} /> : null}
            {n.hazards.length > 0 && !n.isCore ? (
              <View style={[styles.hazards, dim ? styles.dim : null]}>
                {n.hazards.map((h) => (
                  <Icon key={h} name={HAZARD_ICON[h]} size={SMALL} />
                ))}
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
});

export function GalaxyMap() {
  const t = useT("nav");
  const sig = useGame((g) => g.state.seed + ":" + posKey(g) + ":" + (g.state.nav.jump ? 1 : 0), Object.is, 2);
  const picked = useNavUi((s) => s.picked);
  const sheet = useNavUi((s) => s.sheets[0]);
  const open = useNavUi((s) => s.open);
  const pick = useNavUi((s) => s.pick);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [scrolled, setScrolled] = useState({ lo: 0, hi: 0, key: "" });
  const ref = useRef<ScrollView>(null);

  const g = getGame();
  const nav = g.state.nav;
  const seed = g.state.seed;
  const core = galaxyDepth(content, nav.g);
  const contentH = TOP + (core + 1) * ROW_H + BOTTOM;
  const rowTop = (depth: number): number => TOP + (core - depth) * ROW_H;

  const windowFor = useCallback(
    (y: number, h: number) => {
      const hiRaw = core - Math.floor((y - TOP) / ROW_H) + 2;
      const loRaw = core - Math.ceil((y + h - TOP) / ROW_H) - 2;
      return { lo: Math.max(0, loRaw - (((loRaw % 2) + 2) % 2)), hi: Math.min(core, hiRaw + (((hiRaw % 2) + 2) % 2)) };
    },
    [core],
  );

  const centerY = useCallback((h: number) => Math.max(0, Math.min(contentH - h, TOP + (core - nav.depth) * ROW_H + ROW_H / 2 - h * 0.58)), [contentH, core, nav.depth]);

  // until the first scroll event after a layout or a jump, the window is the one around the ship
  const winKey = sig + ":" + size.h;
  const win = scrolled.key === winKey ? scrolled : windowFor(centerY(size.h), size.h);

  const center = useCallback(
    (animated: boolean) => {
      if (size.h <= 0) return;
      const y = centerY(size.h);
      ref.current?.scrollTo({ y, animated });
    },
    [size.h, centerY],
  );

  // start on the ship, and follow it after every jump
  useEffect(() => {
    center(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.h, sig]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s.w === width && s.h === height ? s : { w: width, h: height }));
  }, []);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const w = windowFor(e.nativeEvent.contentOffset.y, size.h);
      setScrolled((cur) => (cur.lo === w.lo && cur.hi === w.hi && cur.key === winKey ? cur : { lo: w.lo, hi: w.hi, key: winKey }));
    },
    [windowFor, size.h, winKey],
  );

  const onPick = useCallback(
    (depth: number, lane: number) => {
      const gm = getGame();
      if (isLinked(gm, depth, lane)) pick(depth, lane, posKey(gm));
      open({ kind: "system", depth, lane });
    },
    [open, pick],
  );

  const rows = useMemo(() => {
    if (size.w <= 0) return null;
    const gm = getGame();
    const steps = route(gm);
    const routeLane = (d: number): number => {
      if (d === nav.depth) return nav.lane;
      for (let i = 0; i < steps.length; i++) if (steps[i].depth === d) return steps[i].lane;
      return -1;
    };
    const reach = reachable(gm);
    const target = picked && picked.from === posKey(gm) ? picked : null;
    const selected = sheet && sheet.kind === "system" ? sheet : target;
    const out = [];
    for (let d = win.lo; d <= win.hi; d++) {
      const nodes = rowNodes(seed, nav.g, d, core);
      let visited = 0;
      let reachMask = 0;
      for (let l = 0; l < nodes.length; l++) if (isVisited(gm, d, l)) visited |= 1 << l;
      for (let i = 0; i < reach.length; i++) if (reach[i].depth === d) reachMask |= 1 << reach[i].lane;
      out.push(
        <MapRow
          key={d}
          depth={d}
          top={rowTop(d)}
          width={size.w}
          nodes={nodes}
          next={d < core ? rowNodes(seed, nav.g, d + 1, core) : null}
          visited={visited}
          reach={reachMask}
          cur={d === nav.depth ? nav.lane : -1}
          routeFrom={routeLane(d)}
          routeTo={routeLane(d + 1)}
          routeLane={d > nav.depth ? routeLane(d) : -1}
          sel={selected && selected.depth === d ? selected.lane : -1}
          coreLabel={t("map.core")}
          onPick={onPick}
        />,
      );
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.lo, win.hi, size.w, sig, picked, sheet, core, seed, t]);

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      {size.h > 0 ? (
        <ScrollView ref={ref} testID="nav-map" style={styles.scroll} contentOffset={{ x: 0, y: centerY(size.h) }} onScroll={onScroll} scrollEventThrottle={32} showsVerticalScrollIndicator={false} bounces={false}>
          <View style={{ height: contentH }}>
            <View style={styles.rulerLine} />
            {rows}
          </View>
        </ScrollView>
      ) : null}
      <View style={styles.hud} pointerEvents="none">
        <MicroLabel color={palette.amber}>{nav.depth >= core ? t("map.atCore") : `↑ ${t("map.toCore", { count: core - nav.depth })}`}</MicroLabel>
        <MicroLabel color={palette.steel3}>{t("map.galaxy", { n: nav.g + 1, depth: nav.depth, core })}</MicroLabel>
      </View>
      <IconKey testID="nav-center" icon="tab_ship" size="sm" tone="cobalt" accessibilityLabel={t("map.center")} onPress={() => center(true)} style={styles.centerKey} />
    </View>
  );
}

// ---------- system sheet --------------------------------------------------------------

export function SystemSheet({ depth, lane }: { depth: number; lane: number }) {
  const t = useT("nav");
  const tr = useTr();
  const here = useGame((g) => g.state.nav.depth === depth && g.state.nav.lane === lane);
  const visited = useGame((g) => isVisited(g, depth, lane), Object.is, 5);
  const richness = useGame((g) => Math.pow(g.content.balance.richnessPerDepth, depth), Object.is, 10);
  const close = useNavUi((s) => s.close);
  const setSection = useNavUi((s) => s.setSection);
  const g = getGame();
  const sys = getSystem(content, g.state.seed, g.state.nav.g, depth, lane);
  const station = stationLabel(content, sys);
  const wear = 1 + sys.hazards.length * hazardWear();

  return (
    <View style={styles.sheet}>
      <Row align="center">
        <Icon name={`star_${sys.star}`} size={32} chip />
        <View style={styles.fill}>
          <Txt variant="bodyBold">{t(`star.${sys.star}`)}</Txt>
          <Txt variant="label" color="inkDim">
            {t("map.depthLong", { n: depth })} · {t(here ? "sys.here" : visited ? "sys.visited" : "sys.unvisited")}
          </Txt>
        </View>
      </Row>
      <Well gap={space.sm}>
        <Row align="center" justify="space-between">
          <Row gap="xs" align="center">
            <Icon name="planet" size={16} />
            <Txt variant="label">{t("count.planet", { count: sys.planets.length })}</Txt>
          </Row>
          {sys.belts > 0 ? (
            <Row gap="xs" align="center">
              <Icon name="belt" size={16} />
              <Txt variant="label">{t("count.belt", { count: sys.belts })}</Txt>
            </Row>
          ) : null}
          <Txt variant="label">
            {t("sys.richness")} ×{sys.richness.toFixed(2)}
          </Txt>
        </Row>
        <Txt variant="label" color="inkDim">
          {t("sys.richnessTotal", { n: fmt(richness * sys.richness) })}
        </Txt>
        <Rule />
        <Row wrap align="center">
          {sys.resources.map((r) => (
            <Row key={r.item} gap="xs" align="center">
              <Icon name={r.item} size={16} chip />
              <Txt variant="label">
                {itemName(r.item)} {fmtPct(r.w)}
              </Txt>
            </Row>
          ))}
        </Row>
      </Well>
      <Well gap={space.xs}>
        {sys.hazards.length === 0 ? (
          <Txt variant="label">{t("sys.noHazards")}</Txt>
        ) : (
          <>
            {sys.hazards.map((h) => (
              <Row key={h} align="center">
                <Icon name={HAZARD_ICON[h]} size={16} chip />
                <View style={styles.fill}>
                  <Txt variant="label">
                    {t(`hazard.${h}.name`)}: {t(`hazard.${h}.desc`)}
                  </Txt>
                </View>
              </Row>
            ))}
            <Txt variant="label" color="warn">
              {t("sys.wear", { n: wear.toFixed(2), pct: Math.round(hazardWear() * 100) })}
            </Txt>
          </>
        )}
      </Well>
      <Row align="center">
        <Icon name={sys.station ? `fac_${sys.station.faction}` : "station"} size={16} chip />
        <Txt variant="label" style={styles.fill}>
          {sys.station && station ? `${tr(station)} · ${tr(content.factions[sys.station.faction]?.name)}` : t("sys.noStation")}
        </Txt>
      </Row>
      {sys.anomaly ? (
        <Row align="center">
          <Icon name="anomaly" size={16} chip />
          <Txt variant="label" style={styles.fill}>
            {t("sys.anomaly")}
          </Txt>
        </Row>
      ) : null}
      {here ? (
        <Key
          label={t("sys.view")}
          icon="planet"
          tone="cobalt"
          onPress={() => {
            setSection("system");
            close();
          }}
        />
      ) : (
        <JumpControls key={depth * 16 + lane} depth={depth} lane={lane} />
      )}
    </View>
  );
}

export function systemSheetTitle(depth: number, lane: number): string {
  const g = getGame();
  return systemName(g, getSystem(content, g.state.seed, g.state.nav.g, depth, lane));
}

const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0 },
  wrap: { flex: 1, borderRadius: radius.lcd, backgroundColor: palette.void1, borderWidth: 1, borderColor: palette.void0, overflow: "hidden" },
  scroll: { flex: 1 },
  row: { position: "absolute", left: 0, right: 0, height: ROW_H },
  tick: { position: "absolute", left: RULER - 8, top: ROW_H / 2, width: 6, height: 1, backgroundColor: palette.steel1 },
  rulerLine: { position: "absolute", left: RULER - 2, top: 0, bottom: 0, width: 1, backgroundColor: palette.void3 },
  depth: { position: "absolute", left: 2, width: RULER - 12, top: ROW_H / 2 - 6, textAlign: "right" },
  links: { position: "absolute", left: 0, top: -ROW_H / 2 },
  node: { position: "absolute", top: ROW_H / 2 - 24, width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  disc: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  pulse: { position: "absolute", width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: palette.orange },
  badgeR: { position: "absolute", right: 1, top: 4 },
  badgeL: { position: "absolute", left: 1, top: 4 },
  hazards: { position: "absolute", bottom: -3, flexDirection: "row", gap: 1 },
  dim: { opacity: 0.45 },
  glow: { position: "absolute", left: -24, top: -24 },
  coreLabel: { position: "absolute", top: -34, width: 120, textAlign: "center" },
  hud: { position: "absolute", left: RULER + 2, top: 4, gap: 1, paddingHorizontal: 5, paddingVertical: 3, borderRadius: 4, backgroundColor: "rgba(10,13,20,0.86)" },
  centerKey: { position: "absolute", right: 6, bottom: 6 },
  sheet: { gap: space.md },
});

// One tree view for research and the three prestige trees: hardware "patch points" on a grid, joined
// by patch cables (react-native-svg). `scroll` gives a canvas that pans in both directions; without
// it the tree is laid out to fit the width and scrolls with its parent.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View, type LayoutChangeEvent } from "react-native";
import Svg, { Path } from "react-native-svg";

import { haptic, sfx } from "@/platform/feedback";
import { Icon, Led, MicroLabel, useTheme } from "@/ui/kit";

export interface TreeNodeDef {
  id: string;
  icon: string;
  name: string;
  /** Grid units. */
  x: number;
  y: number;
  requires: readonly string[];
  maxLevel: number;
}

/** Why the next level cannot be bought: m = maxed, r = parents missing, c = currency, i = items, o = can buy. */
export type NodeCode = "m" | "r" | "c" | "i" | "o";

export interface NodeView {
  level: number;
  code: NodeCode;
}

/** Packs per-node state into one string, so a useGame selector can return it and compare cheaply. */
export function packViews(views: readonly NodeView[]): string {
  let out = "";
  for (let i = 0; i < views.length; i++) out += (i ? "," : "") + views[i].level + views[i].code;
  return out;
}

function unpack(sig: string): NodeView[] {
  if (!sig) return [];
  return sig.split(",").map((s) => ({ level: Number(s.slice(0, -1)), code: s.slice(-1) as NodeCode }));
}

const SOCKET = 44;
const PAD = 8;
const PIP_MAX = 6;

interface SocketProps {
  id: string;
  icon: string;
  name: string;
  level: number;
  maxLevel: number;
  code: NodeCode;
  left: number;
  top: number;
  width: number;
  height: number;
  onPick: (id: string) => void;
}

const Socket = memo(function Socket({ id, icon, name, level, maxLevel, code, left, top, width, height, onPick }: SocketProps) {
  const theme = useTheme();
  const locked = code === "r";
  const maxed = code === "m";
  const canBuy = code === "o";
  const ring = maxed ? theme.mint : canBuy ? theme.orange : level > 0 ? theme.cobalt : locked ? theme.rule : theme.inkDim;
  const onPress = useCallback(() => onPick(id), [id, onPick]);
  const onIn = useCallback(() => {
    haptic("tap");
    sfx("keyDown", { volume: 0.6 });
  }, []);
  const pips = [];
  if (maxLevel <= PIP_MAX) {
    for (let i = 0; i < maxLevel; i++) {
      pips.push(<View key={i} style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: i < level ? (maxed ? theme.mint : theme.cobalt) : theme.ledOff, opacity: i < level ? 1 : 0.6 }} />);
    }
  }
  return (
    <Pressable
      testID={`node-${id}`}
      onPress={onPress}
      onPressIn={onIn}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${level}/${maxLevel}`}
      style={{ position: "absolute", left, top, width, height, alignItems: "center", paddingTop: 2 }}
    >
      <View
        style={{
          width: SOCKET,
          height: SOCKET,
          borderRadius: SOCKET / 2,
          backgroundColor: theme.key,
          borderWidth: 3,
          borderColor: ring,
          alignItems: "center",
          justifyContent: "center",
          opacity: locked ? 0.45 : 1,
          shadowColor: canBuy ? theme.orange : "transparent",
          shadowOpacity: canBuy ? 0.9 : 0,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 0 },
        }}
      >
        <Icon name={locked ? "lock" : icon} size={24} color="keyText" />
      </View>
      {canBuy ? <Led state="blink" color="orange" size={6} style={{ position: "absolute", top: 2, left: width / 2 + 14 }} /> : null}
      {/* Cables run under the legend: it gets the well color so the print stays readable. */}
      <View style={{ height: 11, marginTop: 2, paddingHorizontal: 3, flexDirection: "row", gap: 2, alignItems: "center", backgroundColor: theme.well, borderRadius: 2 }}>
        {maxLevel <= PIP_MAX ? (
          pips
        ) : (
          <MicroLabel color={maxed ? "good" : level > 0 ? "info" : "inkDim"} style={{ lineHeight: 10 }}>
            {maxed ? "MAX" : `${level}/${maxLevel}`}
          </MicroLabel>
        )}
      </View>
      <View style={{ maxWidth: width - 2, paddingHorizontal: 2, backgroundColor: theme.well, borderRadius: 2 }}>
        <MicroLabel align="center" numberOfLines={2} color={locked ? "inkDim" : "ink"} style={{ letterSpacing: 0.2, lineHeight: 11 }}>
          {name}
        </MicroLabel>
      </View>
    </Pressable>
  );
});

export interface TreeProps {
  nodes: readonly TreeNodeDef[];
  /** `packViews` output, same order as `nodes`. */
  sig: string;
  onPick: (id: string) => void;
  /** Two-axis panning canvas with `cellW` wide cells; otherwise the cells share the measured width. */
  scroll?: boolean;
  cellW?: number;
  cellH?: number;
  /** Change it to re-focus the canvas on the first buyable node. */
  focusKey?: string;
}

export const Tree = memo(function Tree({ nodes, sig, onPick, scroll, cellW = 68, cellH = 82, focusKey }: TreeProps) {
  const theme = useTheme();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (Math.abs(b.w - width) < 1 && Math.abs(b.h - height) < 1 ? b : { w: width, h: height }));
  }, []);

  const bounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    if (nodes.length === 0) return { minX: 0, minY: 0, cols: 1, rows: 1 };
    return { minX, minY, cols: maxX - minX + 1, rows: maxY - minY + 1 };
  }, [nodes]);

  const views = useMemo(() => unpack(sig), [sig]);
  const fitW = box.w > 0 ? Math.floor((box.w - PAD * 2) / bounds.cols) : 0;
  // A narrow band of a wide tree (one research branch) spreads over the whole width.
  const cw = scroll ? Math.max(cellW, fitW) : fitW;
  const canvasW = bounds.cols * cw + PAD * 2;
  const canvasH = bounds.rows * cellH + PAD * 2;

  const index = useMemo(() => {
    const map: Record<string, number> = {};
    nodes.forEach((n, i) => (map[n.id] = i));
    return map;
  }, [nodes]);

  const links = useMemo(() => {
    if (cw <= 0) return null;
    const cx = (n: TreeNodeDef) => PAD + (n.x - bounds.minX) * cw + cw / 2;
    const cy = (n: TreeNodeDef) => PAD + (n.y - bounds.minY) * cellH + 2 + SOCKET / 2;
    const live: string[] = [];
    const dead: string[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const child = nodes[i];
      for (const req of child.requires) {
        const pi = index[req];
        if (pi === undefined) continue;
        const parent = nodes[pi];
        const x1 = cx(parent);
        const y1 = cy(parent);
        const x2 = cx(child);
        const y2 = cy(child);
        const sag = Math.abs(y2 - y1) * 0.5;
        const d = y1 === y2 ? `M${x1} ${y1}Q${(x1 + x2) / 2} ${y1 + 14} ${x2} ${y2}` : `M${x1} ${y1}C${x1} ${y1 + sag} ${x2} ${y2 - sag} ${x2} ${y2}`;
        ((views[pi]?.level ?? 0) > 0 ? live : dead).push(d);
      }
    }
    return { live: live.join(""), dead: dead.join("") };
  }, [nodes, index, views, bounds, cw, cellH]);

  const vRef = useRef<ScrollView>(null);
  const hRef = useRef<ScrollView>(null);
  const viewsRef = useRef(views);
  viewsRef.current = views;
  const ready = scroll && cw > 0 && box.h > 0;
  useEffect(() => {
    if (!ready) return;
    const v = viewsRef.current;
    let target = nodes.findIndex((_, i) => v[i]?.code === "o");
    if (target < 0) target = nodes.findIndex((_, i) => v[i]?.code === "c" || v[i]?.code === "i");
    if (target < 0) target = 0;
    const n = nodes[target];
    if (!n) return;
    const x = Math.max(0, Math.min(canvasW - box.w, PAD + (n.x - bounds.minX) * cw + cw / 2 - box.w / 2));
    const y = Math.max(0, Math.min(canvasH - box.h, PAD + (n.y - bounds.minY) * cellH + cellH / 2 - box.h / 2));
    const id = requestAnimationFrame(() => {
      hRef.current?.scrollTo({ x, animated: false });
      vRef.current?.scrollTo({ y, animated: false });
    });
    return () => cancelAnimationFrame(id);
    // Focus follows the tree that is shown, not every state change inside it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focusKey, nodes]);

  const canvas =
    cw > 0 ? (
      <View style={{ width: canvasW, height: canvasH }}>
        {links ? (
          <Svg width={canvasW} height={canvasH} style={{ position: "absolute", left: 0, top: 0 }} pointerEvents="none">
            {links.dead ? <Path d={links.dead} stroke={theme.inkDim} strokeOpacity={0.45} strokeWidth={1.5} strokeDasharray="3 4" fill="none" /> : null}
            {links.live ? <Path d={links.live} stroke={theme.ink} strokeWidth={2.5} strokeLinecap="round" fill="none" /> : null}
          </Svg>
        ) : null}
        {nodes.map((n, i) => (
          <Socket
            key={n.id}
            id={n.id}
            icon={n.icon}
            name={n.name}
            level={views[i]?.level ?? 0}
            maxLevel={n.maxLevel}
            code={views[i]?.code ?? "r"}
            left={PAD + (n.x - bounds.minX) * cw}
            top={PAD + (n.y - bounds.minY) * cellH}
            width={cw}
            height={cellH}
            onPick={onPick}
          />
        ))}
      </View>
    ) : null;

  const frame = {
    backgroundColor: theme.well,
    borderRadius: 6,
    borderTopWidth: 1,
    borderTopColor: theme.rule,
    borderBottomWidth: 1,
    borderBottomColor: theme.bodyHi,
    overflow: "hidden" as const,
  };

  if (!scroll) {
    return (
      <View onLayout={onLayout} style={[frame, { minHeight: canvasH }]}>
        {canvas}
      </View>
    );
  }
  return (
    <View onLayout={onLayout} style={[frame, { flex: 1 }]}>
      <ScrollView ref={vRef} nestedScrollEnabled showsVerticalScrollIndicator indicatorStyle={theme.id === "day" ? "black" : "white"} bounces={false}>
        <ScrollView ref={hRef} horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} bounces={false}>
          {canvas}
        </ScrollView>
      </ScrollView>
    </View>
  );
});

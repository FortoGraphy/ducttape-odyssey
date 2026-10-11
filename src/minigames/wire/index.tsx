// Wiring: drag a cable from a connector to its match on the other side. The live cable is an SVG
// bezier whose path is rebuilt on the UI thread; React state changes only when a cable is grabbed,
// connected or shorted.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle, Path, Polygon, Rect } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import type { L10n } from "@/engine/types";
import { tr } from "@/i18n";
import { MAX_FONT_SCALE, palette, radius, space, type } from "@/ui/theme";

import { mgPublish } from "../host/debug";
import { MINI_HUD_HEIGHT, MiniHud, MiniStage, clamp01, haptic, sfx, useCountdown, useMiniTheme } from "../shared";
import { makeResult, type MinigameMeta, type MinigameProps } from "../types";
import { buildPuzzle, type WireKind, type WireSymbol } from "./puzzle";

const TIERS = [
  { seconds: 30, penalty: 3, par: 5, fuses: 0 },
  { seconds: 34, penalty: 4, par: 9, fuses: 0 },
  { seconds: 40, penalty: 4, par: 14, fuses: 3 },
] as const;

export const meta: MinigameMeta = {
  id: "wire",
  name: { cs: "Kabeláž", en: "Wiring" },
  hint: {
    cs: "Přetáhni kabel ke stejnému konektoru naproti. Špatný spoj znamená zkrat a ztracený čas. Kabely dvou stejných konektorů se nikdy nekříží.",
    en: "Drag each cable to the matching connector across the board. A wrong one shorts out and costs time. Cables of two identical connectors never cross.",
  },
  icon: "mg_wire",
  seconds: [TIERS[0].seconds, TIERS[1].seconds, TIERS[2].seconds],
};

const STRIP_H = 30;
const GRAB_R = 34;
const SNAP_R = 38;
const MISTAKE_COST = 0.08;
const never = ReduceMotion.Never;
const AnimatedPath = Animated.createAnimatedComponent(Path);

const L_SHORTS: L10n = { cs: "ZKRATY", en: "SHORTS" };
const L_FUSES: L10n = { cs: "POJISTKY", en: "FUSES" };
const L_IDLE: L10n = { cs: "SPOJ STEJNÉ", en: "MATCH PAIRS" };
const L_TWINS: L10n = { cs: "DVOJČATA SE NEKŘÍŽÍ", en: "TWINS NEVER CROSS" };
const L_SHORT: L10n = { cs: "ZKRAT –{s} s", en: "SHORT –{s} s" };
const L_CROSSED: L10n = { cs: "KŘÍŽÍ SE –{s} s", en: "CROSSED –{s} s" };
const L_FUSE_OUT: L10n = { cs: "POJISTKY V TAHU", en: "FUSES BLOWN" };
const L_OK: L10n = { cs: "SPOJENO", en: "CONNECTED" };

interface Layout {
  size: number;
  /** Socket centers. */
  lx: number[];
  ly: number[];
  rx: number[];
  ry: number[];
  /** Where cables attach (inner edge of the socket). */
  lax: number[];
  rax: number[];
}

function buildLayout(n: number, w: number, h: number): Layout {
  const pitch = h / n;
  // When rows get tighter than a thumb, alternate two columns so every socket keeps a 44 pt cell.
  const stagger = pitch < 46;
  const size = stagger ? 38 : Math.min(44, Math.floor(pitch - 8));
  const col0 = 8 + size / 2;
  const col1 = col0 + size + 8;
  const out: Layout = { size, lx: [], ly: [], rx: [], ry: [], lax: [], rax: [] };
  for (let i = 0; i < n; i++) {
    const x = stagger && i % 2 === 1 ? col1 : col0;
    // Staggered rows are spread edge to edge so the outer sockets are not clipped by the board.
    const edge = size / 2 + 4;
    const y = stagger ? edge + (i * (h - 2 * edge)) / (n - 1) : pitch * (i + 0.5);
    out.lx.push(x);
    out.ly.push(y);
    out.rx.push(w - x);
    out.ry.push(y);
    out.lax.push(x + size / 2 + 5);
    out.rax.push(w - x - size / 2 - 5);
  }
  return out;
}

function cablePath(x0: number, y0: number, x1: number, y1: number): string {
  "worklet";
  const dx = Math.abs(x1 - x0);
  const dir = x1 >= x0 ? 1 : -1;
  const c = Math.max(28, dx * 0.5) * dir;
  const sag = 6 + dx * 0.06;
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}C${(x0 + c).toFixed(1)} ${(y0 + sag).toFixed(1)} ${(x1 - c).toFixed(1)} ${(y1 + sag).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

function SymbolGlyph({ symbol, ink, size }: { symbol: WireSymbol; ink: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      {symbol === "triUp" && <Polygon points="8,2.2 14.2,13 1.8,13" fill={ink} />}
      {symbol === "triDown" && <Polygon points="1.8,3 14.2,3 8,13.8" fill={ink} />}
      {symbol === "disc" && <Circle cx={8} cy={8} r={5.6} fill={ink} />}
      {symbol === "ring" && <Circle cx={8} cy={8} r={4.6} stroke={ink} strokeWidth={2.6} fill="none" />}
      {symbol === "square" && <Rect x={3} y={3} width={10} height={10} fill={ink} />}
      {symbol === "diamond" && <Polygon points="8,1.6 14.4,8 8,14.4 1.6,8" fill={ink} />}
      {symbol === "plus" && <Path d="M6 2h4v4h4v4h-4v4h-4v-4h-4v-4h4z" fill={ink} />}
      {symbol === "bars" && <Path d="M2 3.5h12v3.5h-12zM2 9h12v3.5h-12z" fill={ink} />}
    </Svg>
  );
}

interface SocketProps {
  kind: WireKind;
  x: number;
  y: number;
  size: number;
  /** side * 100 + index, matched against the hover / zap shared values. */
  code: number;
  right: boolean;
  connected: boolean;
  twin: boolean;
  hover: SharedValue<number>;
  zapA: SharedValue<number>;
  zapB: SharedValue<number>;
  zap: SharedValue<number>;
}

const Socket = memo(function Socket({ kind, x, y, size, code, right, connected, twin, hover, zapA, zapB, zap }: SocketProps) {
  const t = useMiniTheme();
  const ring = useAnimatedStyle(() => {
    const zapped = zap.value > 0.02 && (zapA.value === code || zapB.value === code);
    return {
      borderColor: zapped ? palette.red1 : hover.value === code ? palette.bone2 : "transparent",
      transform: [{ scale: hover.value === code ? 1.08 : 1 }],
    };
  });
  const cap = size - 12;
  return (
    <View style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, pointerEvents: "none" }}>
      {/* Port the cable plugs into. */}
      <View style={{ position: "absolute", top: size / 2 - 5, left: right ? -6 : size - 2, width: 8, height: 10, borderRadius: 2, backgroundColor: palette.steel2 }} />
      <Animated.View style={[{ width: size, height: size, borderRadius: radius.key, backgroundColor: t.key, borderWidth: 2, alignItems: "center", justifyContent: "center" }, ring]}>
        <View style={{ width: cap, height: cap, borderRadius: cap / 2, backgroundColor: kind.color, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(0,0,0,0.35)" }}>
          <SymbolGlyph symbol={kind.symbol} ink={kind.ink} size={Math.round(cap * 0.62)} />
        </View>
        <View style={{ position: "absolute", top: 3, left: right ? undefined : 3, right: right ? 3 : undefined, width: 5, height: 5, borderRadius: 3, backgroundColor: connected ? t.mint : t.keyHi }} />
        {twin && <View style={{ position: "absolute", bottom: 3, left: right ? undefined : 3, right: right ? 3 : undefined, width: 5, height: 5, borderRadius: 1, backgroundColor: palette.bone1 }} />}
      </Animated.View>
    </View>
  );
});

const StaticCable = memo(function StaticCable({ d, kind }: { d: string; kind: WireKind }) {
  return (
    <>
      <Path d={d} stroke="rgba(0,0,0,0.55)" strokeWidth={9} strokeLinecap="round" fill="none" />
      <Path d={d} stroke={kind.color} strokeWidth={6} strokeLinecap="round" fill="none" />
      {kind.striped && <Path d={d} stroke="rgba(0,0,0,0.6)" strokeWidth={6} strokeDasharray="3 9" fill="none" />}
    </>
  );
});

export default function Wire({ tier, seed, width, height, reduceMotion, onFinish }: MinigameProps) {
  const t = useMiniTheme();
  const cfg = TIERS[tier - 1];
  const stageH = height - MINI_HUD_HEIGHT;
  const iw = width - 18;
  const bh = stageH - 18 - STRIP_H;
  const puzzle = useMemo(() => buildPuzzle(seed, tier), [seed, tier]);
  const lay = useMemo(() => buildLayout(puzzle.n, iw, bh), [puzzle.n, iw, bh]);
  const n = puzzle.n;

  /** links[left] = right index or -1. */
  const [links, setLinks] = useState<number[]>(() => new Array<number>(n).fill(-1));
  const [mistakes, setMistakes] = useState(0);
  const [note, setNote] = useState<{ text: L10n; warn: boolean; secs?: number } | null>(null);
  const [drag, setDrag] = useState<{ side: number; idx: number; id: number } | null>(null);
  const linksRef = useRef(links);
  const mistakesRef = useRef(0);
  const done = useRef(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mirrors of the free sockets for the gesture worklets (1 = free).
  const freeL = useSharedValue<number[]>(new Array<number>(n).fill(1));
  const freeR = useSharedValue<number[]>(new Array<number>(n).fill(1));
  const active = useSharedValue(-1); // side * 100 + index of the grabbed socket
  const busy = useSharedValue(0);
  const ended = useSharedValue(0);
  const dragId = useSharedValue(0);
  const shown = useSharedValue(-1);
  const ax = useSharedValue(0);
  const ay = useSharedValue(0);
  const fx = useSharedValue(0);
  const fy = useSharedValue(0);
  const hover = useSharedValue(-1);
  const zap = useSharedValue(0);
  const zapA = useSharedValue(-1);
  const zapB = useSharedValue(-1);
  const shake = useSharedValue(0);

  // Wrong connections shorten the clock, so the timeout is re-armed here instead of in useCountdown.
  const penaltyMs = useRef(0);
  const penaltyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishRef = useRef<(reason: "win" | "timeout" | "fuse") => void>(() => {});
  const clock = useCountdown(cfg.seconds, () => finishRef.current("timeout"));

  // Kept in refs so timers and worklets always reach the latest closure.
  useEffect(() => {
    finishRef.current = (reason) => {
      if (done.current) return;
      done.current = true;
      ended.set(1);
      clock.stop();
      if (penaltyTimer.current) clearTimeout(penaltyTimer.current);
      const connected = linksRef.current.filter((r) => r >= 0).length;
      let score: number;
      if (reason === "win") {
        const elapsed = (Date.now() - clock.startedAt + penaltyMs.current) / 1000;
        const pace = clamp01(1 - (elapsed - cfg.par) / (cfg.seconds * 0.9 - cfg.par));
        score = Math.max(0.5, 0.55 + 0.45 * pace - MISTAKE_COST * mistakesRef.current);
      } else {
        score = (reason === "fuse" ? 0.4 : 0.45) * (connected / n);
      }
      onFinish(makeResult(score, clock.startedAt));
    };
  });

  useEffect(
    () => () => {
      if (penaltyTimer.current) clearTimeout(penaltyTimer.current);
      if (noteTimer.current) clearTimeout(noteTimer.current);
    },
    [],
  );

  const showNote = useCallback((text: L10n, warn: boolean, secs?: number) => {
    setNote({ text, warn, secs });
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 1400);
  }, []);

  const addPenalty = (secs: number) => {
    penaltyMs.current += secs * 1000;
    const total = cfg.seconds * 1000;
    const remaining = total - (Date.now() - clock.startedAt) - penaltyMs.current;
    if (penaltyTimer.current) clearTimeout(penaltyTimer.current);
    cancelAnimation(clock.left);
    if (remaining <= 0) {
      clock.left.set(0);
      finishRef.current("timeout");
      return;
    }
    clock.left.set(remaining / total);
    clock.left.set(withTiming(0, { duration: remaining, easing: Easing.linear, reduceMotion: never }));
    penaltyTimer.current = setTimeout(() => finishRef.current("timeout"), remaining);
  };

  const onGrab = useCallback((side: number, idx: number, id: number) => {
    setDrag({ side, idx, id });
    haptic("key");
    sfx("toggle");
  }, []);
  const onHover = useCallback(() => haptic("detent"), []);

  const dropRef = useRef<(side: number, idx: number, target: number) => void>(() => {});
  // Runs on the JS thread once a cable is dropped on a socket of the other side.
  useEffect(() => {
    dropRef.current = (side, idx, target) => {
      if (done.current) return;
      const l = side === 0 ? idx : target;
      const r = side === 0 ? target : idx;
      const sameKind = puzzle.left[l].symbol === puzzle.right[r].symbol;
      if (puzzle.solution[l] === r) {
        const next = linksRef.current.slice();
        next[l] = r;
        linksRef.current = next;
        setLinks(next);
        const fl = freeL.value.slice();
        fl[l] = 0;
        freeL.set(fl);
        const fr = freeR.value.slice();
        fr[r] = 0;
        freeR.set(fr);
        active.set(-1);
        busy.set(0);
        haptic("success");
        sfx("beepGood");
        showNote(L_OK, false);
        if (next.every((v) => v >= 0)) finishRef.current("win");
        return;
      }
      mistakesRef.current += 1;
      setMistakes(mistakesRef.current);
      haptic("error");
      sfx("zap");
      zapA.set(l);
      zapB.set(100 + r);
      zap.set(1);
      zap.set(withTiming(0, { duration: 600, reduceMotion: never }));
      if (!reduceMotion) shake.set(withSequence(withTiming(6, { duration: 40 }), withTiming(-5, { duration: 60 }), withTiming(3, { duration: 60 }), withTiming(0, { duration: 60 })));
      // Pull the plug back out.
      const back = { duration: reduceMotion ? 0 : 220, easing: Easing.out(Easing.quad), reduceMotion: never };
      fx.set(withTiming(ax.value, back));
      fy.set(
        withTiming(ay.value, back, () => {
          "worklet";
          active.set(-1);
          busy.set(0);
        }),
      );
      if (cfg.fuses > 0 && mistakesRef.current >= cfg.fuses) {
        showNote(L_FUSE_OUT, true);
        finishRef.current("fuse");
        return;
      }
      showNote(sameKind ? L_CROSSED : L_SHORT, true, cfg.penalty);
      addPenalty(cfg.penalty);
    };
  });
  const onDrop = useCallback((side: number, idx: number, target: number) => dropRef.current(side, idx, target), []);

  useEffect(() => {
    // The live cable only becomes visible once its color has been committed.
    if (drag) shown.set(drag.id);
  }, [drag, shown]);

  useEffect(() => {
    mgPublish("wire", { n, lx: lay.lx, ly: lay.ly, rx: lay.rx, ry: lay.ry, solution: puzzle.solution, stripH: STRIP_H, penalty: cfg.penalty, fuses: cfg.fuses, seconds: cfg.seconds });
  }, [n, lay, puzzle, cfg]);

  const { lx, ly, rx, ry, lax, rax } = lay;
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        .onBegin((e) => {
          if (ended.value || busy.value || active.value >= 0) return;
          let best = -1;
          let bd = GRAB_R * GRAB_R;
          const fl = freeL.value;
          const fr = freeR.value;
          for (let i = 0; i < n; i++) {
            if (fl[i]) {
              const d = (lx[i] - e.x) * (lx[i] - e.x) + (ly[i] - e.y) * (ly[i] - e.y);
              if (d < bd) {
                bd = d;
                best = i;
              }
            }
            if (fr[i]) {
              const d = (rx[i] - e.x) * (rx[i] - e.x) + (ry[i] - e.y) * (ry[i] - e.y);
              if (d < bd) {
                bd = d;
                best = 100 + i;
              }
            }
          }
          if (best < 0) return;
          const side = best >= 100 ? 1 : 0;
          const idx = best % 100;
          ax.set(side === 0 ? lax[idx] : rax[idx]);
          ay.set(side === 0 ? ly[idx] : ry[idx]);
          fx.set(e.x);
          fy.set(e.y);
          hover.set(-1);
          dragId.set(dragId.value + 1);
          active.set(best);
          scheduleOnRN(onGrab, side, idx, dragId.value);
        })
        .onUpdate((e) => {
          if (active.value < 0 || busy.value) return;
          fx.set(e.x);
          fy.set(e.y);
          // Nearest free socket on the other side.
          const toRight = active.value < 100;
          const free = toRight ? freeR.value : freeL.value;
          let best = -1;
          let bd = SNAP_R * SNAP_R;
          for (let i = 0; i < n; i++) {
            if (!free[i]) continue;
            const sx = toRight ? rx[i] : lx[i];
            const sy = toRight ? ry[i] : ly[i];
            const d = (sx - e.x) * (sx - e.x) + (sy - e.y) * (sy - e.y);
            if (d < bd) {
              bd = d;
              best = (toRight ? 100 : 0) + i;
            }
          }
          if (best !== hover.value) {
            hover.set(best);
            if (best >= 0) scheduleOnRN(onHover);
          }
        })
        // The worklet only schedules onDrop for later; nothing here runs during render.
        // eslint-disable-next-line react-hooks/refs
        .onFinalize(() => {
          if (active.value < 0 || busy.value) return;
          const target = hover.value;
          hover.set(-1);
          if (target < 0 || ended.value) {
            const back = { duration: 180, easing: Easing.out(Easing.quad), reduceMotion: never };
            fx.set(withTiming(ax.value, back));
            fy.set(
              withTiming(ay.value, back, () => {
                active.set(-1);
              }),
            );
            return;
          }
          // Seat the plug in the socket and let the JS side judge the connection.
          const ti = target % 100;
          fx.set(target >= 100 ? rax[ti] : lax[ti]);
          fy.set(target >= 100 ? ry[ti] : ly[ti]);
          busy.set(1);
          scheduleOnRN(onDrop, active.value >= 100 ? 1 : 0, active.value % 100, ti);
        }),
    [active, ax, ay, busy, dragId, ended, freeL, freeR, fx, fy, hover, lax, lx, ly, n, onDrop, onGrab, onHover, rax, rx, ry],
  );

  const liveD = useDerivedValue(() => (active.value < 0 || shown.value !== dragId.value ? "M-20 -20" : cablePath(ax.value, ay.value, fx.value, fy.value)));
  const liveOuter = useAnimatedProps(() => ({ d: liveD.value }));
  const liveInner = useAnimatedProps(() => ({ d: liveD.value }));
  const plugStyle = useAnimatedStyle(() => ({
    opacity: active.value < 0 || shown.value !== dragId.value ? 0 : 1,
    transform: [{ translateX: fx.value }, { translateY: fy.value }],
  }));
  const zapStyle = useAnimatedStyle(() => ({ opacity: zap.value * 0.35 }));
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const dragKind = drag ? (drag.side === 0 ? puzzle.left[drag.idx] : puzzle.right[drag.idx]) : null;
  const connected = links.filter((r) => r >= 0).length;
  const pips = cfg.fuses > 0 ? cfg.fuses : 4;
  const idle = puzzle.hasTwins ? L_TWINS : L_IDLE;

  return (
    <View style={{ width, height }}>
      <MiniHud title={meta.name} left={clock.left} score={`${connected}/${n}`} />
      <MiniStage width={width} height={stageH}>
        <View style={{ height: STRIP_H, flexDirection: "row", alignItems: "center", paddingHorizontal: space.sm, gap: space.sm, backgroundColor: t.body, borderBottomWidth: 1, borderBottomColor: t.rule }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[type.label, { color: t.inkDim }]}>
            {tr(cfg.fuses > 0 ? L_FUSES : L_SHORTS)}
          </Text>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {Array.from({ length: pips }, (_, i) => {
              const hit = i < Math.min(mistakes, pips);
              // Fuses start lit and go out; the shorts counter starts dark and fills up.
              const color = cfg.fuses > 0 ? (hit ? t.red : t.mint) : hit ? t.red : t.ledOff;
              return <View key={i} style={{ width: cfg.fuses > 0 ? 12 : 7, height: 7, borderRadius: cfg.fuses > 0 ? 2 : 4, backgroundColor: color, borderWidth: 1, borderColor: "rgba(0,0,0,0.25)" }} />;
            })}
          </View>
          <View style={{ flex: 1, height: 20, borderRadius: radius.lcd, backgroundColor: t.lcdBg, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xs }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={[type.lcdS, { color: note?.warn ? t.lcdWarn : t.lcdOn }]}>
              {note ? tr(note.text, { s: note.secs ?? 0 }) : tr(idle)}
            </Text>
          </View>
        </View>
        <GestureDetector gesture={pan}>
          <Animated.View testID="wire-board" style={[{ width: iw, height: bh, backgroundColor: palette.teal0, overflow: "hidden" }, shakeStyle]}>
            <Svg width={iw} height={bh} style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
              {/* Printed traces so the board reads as hardware even before any cable is in. */}
              {Array.from({ length: 5 }, (_, i) => {
                const x = iw / 2 + (i - 2) * 14;
                return <Path key={i} d={`M${x} 6V${bh - 6}`} stroke={palette.teal1} strokeWidth={1} strokeDasharray="1 5" />;
              })}
              {links.map((r, l) => (r >= 0 ? <StaticCable key={l} d={cablePath(lax[l], ly[l], rax[r], ry[r])} kind={puzzle.left[l]} /> : null))}
              <AnimatedPath animatedProps={liveOuter} stroke="rgba(0,0,0,0.55)" strokeWidth={9} strokeLinecap="round" fill="none" />
              <AnimatedPath animatedProps={liveInner} stroke={dragKind?.color ?? palette.bone1} strokeWidth={6} strokeLinecap="round" fill="none" />
            </Svg>
            {puzzle.left.map((kind, i) => (
              <Socket key={`l${i}`} kind={kind} x={lx[i]} y={ly[i]} size={lay.size} code={i} right={false} connected={links[i] >= 0} twin={puzzle.twin[i]} hover={hover} zapA={zapA} zapB={zapB} zap={zap} />
            ))}
            {puzzle.right.map((kind, i) => (
              <Socket
                key={`r${i}`}
                kind={kind}
                x={rx[i]}
                y={ry[i]}
                size={lay.size}
                code={100 + i}
                right
                connected={links.includes(i)}
                twin={puzzle.hasTwins && puzzle.right.filter((k) => k.symbol === kind.symbol).length > 1}
                hover={hover}
                zapA={zapA}
                zapB={zapB}
                zap={zap}
              />
            ))}
            <Animated.View style={[styles.plug, { backgroundColor: dragKind?.color ?? palette.bone1 }, plugStyle]} />
            <Animated.View style={[StyleSheet.absoluteFill, { pointerEvents: "none", backgroundColor: palette.yellow }, zapStyle]} />
          </Animated.View>
        </GestureDetector>
      </MiniStage>
    </View>
  );
}

const styles = StyleSheet.create({
  plug: { pointerEvents: "none", position: "absolute", left: -9, top: -9, width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: "#15171C" },
});

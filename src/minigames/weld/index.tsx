// Welding: drag the torch along a seeded seam. Staying on the seam at a steady pace lays a bead,
// lingering overheats and burns through, rushing leaves gaps. All per-frame logic runs in one
// frame callback on the UI thread; React state only changes on discrete events.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  interpolateColor,
  makeMutable,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import type { L10n } from "@/engine/types";
import { tr } from "@/i18n";
import { MAX_FONT_SCALE, palette, radius, space, type } from "@/ui/theme";

import { mgPublish } from "../host/debug";
import { MINI_HUD_HEIGHT, MiniHud, MiniStage, clamp01, haptic, sfx, useCountdown, useMiniTheme } from "../shared";
import { makeResult, type MinigameMeta, type MinigameProps } from "../types";
import { buildSeam, type Seam } from "./seam";

const TIERS = [
  { seconds: 35, tol: 21, vMax: 200, base: 0.11, linger: 0.5, cool: 0.6, maxBurns: 5, lockMs: 1400 },
  { seconds: 45, tol: 17, vMax: 170, base: 0.17, linger: 0.6, cool: 0.5, maxBurns: 4, lockMs: 1700 },
  { seconds: 55, tol: 13.5, vMax: 145, base: 0.22, linger: 0.72, cool: 0.45, maxBurns: 3, lockMs: 2000 },
] as const;

export const meta: MinigameMeta = {
  id: "weld",
  name: { cs: "Svařování", en: "Welding" },
  hint: {
    cs: "Veď hořák po švu plynule. Když se přehřívá, zvedni prst a nech ho vychladnout.",
    en: "Drag the torch along the seam at a steady pace. When it runs hot, lift your thumb to cool it.",
  },
  icon: "mg_weld",
  seconds: [TIERS[0].seconds, TIERS[1].seconds, TIERS[2].seconds],
};

/** The torch tip sits above the thumb so the seam stays visible. */
const TIP_OFFSET = 30;
const GAUGE_H = 36;
/** Below this speed (pt/s) the torch counts as lingering and heats faster. */
const V_LINGER = 55;
/** Share of the seam that has to carry a bead to finish. */
const DONE_SHARE = 0.97;
const BURN_COST = 0.07;
/** Above this the gauge warns and the work no longer counts as clean. */
const HOT = 0.75;
const SPARKS = 10;
const never = ReduceMotion.Never;

// Plain numbers (not an enum) so worklets capture nothing but constants.
const Status = { Ready: 0, Welding: 1, TooFast: 2, OffSeam: 3, Hot: 4, Cooling: 5 } as const;
const STATUS_TEXT: Record<number, L10n> = {
  [Status.Ready]: { cs: "PŘIPRAVEN", en: "READY" },
  [Status.Welding]: { cs: "SVAŘUJE", en: "WELDING" },
  [Status.TooFast]: { cs: "RYCHLE!", en: "TOO FAST" },
  [Status.OffSeam]: { cs: "MIMO ŠEV", en: "OFF SEAM" },
  [Status.Hot]: { cs: "HORKÉ!", en: "HOT!" },
  [Status.Cooling]: { cs: "PROPÁLENO", en: "BURNT" },
};
const L_HEAT: L10n = { cs: "TEPLO", en: "HEAT" };
const L_PLATE: L10n = { cs: "PLÁT 7-B · NEŠLAPAT", en: "PLATE 7-B · NO STEP" };

const BEAD_COOL = "#D9D2BE";
const BEAD_HOT = "#FFF3C4";

interface Spark {
  x: SharedValue<number>;
  y: SharedValue<number>;
  p: SharedValue<number>;
  dx: number;
  dy: number;
}

interface CoreProps {
  seam: Seam;
  tier: 1 | 2 | 3;
  w: number;
  h: number;
  reduceMotion: boolean;
  heat: SharedValue<number>;
  welded: SharedValue<number>;
  burns: SharedValue<number>;
  goodMs: SharedValue<number>;
  torchMs: SharedValue<number>;
  ended: SharedValue<number>;
  onPct(pct: number): void;
  onStatus(s: number): void;
  onBurn(count: number): void;
  onEnd(reason: number): void;
}

const Bead = memo(function Bead({ v, x, y, ang, len }: { v: SharedValue<number>; x: number; y: number; ang: number; len: number }) {
  const style = useAnimatedStyle(() => {
    const s = v.value;
    return {
      opacity: s === 0 ? 0 : 1,
      backgroundColor: s < 0 ? palette.void0 : interpolateColor(s, [1, 1.5, 2], [BEAD_COOL, palette.amber, BEAD_HOT]),
      borderColor: s < 0 ? palette.rust1 : "rgba(0,0,0,0.25)",
      transform: [{ rotate: `${ang}rad` }, { scaleY: s < 0 ? 1.5 : 1 + Math.max(0, s - 1) * 0.35 }],
    };
  });
  return <Animated.View style={[{ pointerEvents: "none", position: "absolute", left: x - len / 2, top: y - 4.5, width: len, height: 9, borderRadius: 4.5, borderWidth: 1 }, style]} />;
});

const SparkDot = memo(function SparkDot({ s }: { s: Spark }) {
  const style = useAnimatedStyle(() => {
    const p = s.p.value;
    return {
      opacity: p <= 0 || p >= 1 ? 0 : 1 - p * p,
      transform: [{ translateX: s.x.value + s.dx * p }, { translateY: s.y.value + s.dy * p + 46 * p * p }],
    };
  });
  return <Animated.View style={[styles.spark, style]} />;
});

const WeldCore = memo(function WeldCore({ seam, tier, w, h, reduceMotion, heat, welded, burns, goodMs, torchMs, ended, onPct, onStatus, onBurn, onEnd }: CoreProps) {
  const cfg = TIERS[tier - 1];
  const { n, xs, ys } = seam;
  const beads = useMemo(() => Array.from({ length: n }, () => makeMutable(0)), [n]);
  const sparks = useMemo<Spark[]>(
    () =>
      Array.from({ length: SPARKS }, (_, i) => {
        const a = i * 2.399963;
        const dist = 16 + ((i * 7) % 5) * 5;
        return { x: makeMutable(0), y: makeMutable(0), p: makeMutable(0), dx: Math.cos(a) * dist, dy: Math.sin(a) * dist - 10 };
      }),
    [],
  );
  useEffect(
    () => () => {
      for (const b of beads) cancelAnimation(b);
      for (const s of sparks) cancelAnimation(s.p);
    },
    [beads, sparks],
  );

  // Torch tip, parked on the first sample until the first touch.
  const tx = useSharedValue(xs[0]);
  const ty = useSharedValue(ys[0]);
  const px = useSharedValue(xs[0]);
  const py = useSharedValue(ys[0]);
  const touching = useSharedValue(0);
  const started = useSharedValue(0);
  const speed = useSharedValue(0);
  const lock = useSharedValue(0);
  const onSeam = useSharedValue(0);
  const flash = useSharedValue(0);
  const shake = useSharedValue(0);
  const hint = useSharedValue(0);
  // 0 bare, 1 bead, 2 burnt. Created and mutated on the UI thread only.
  const st = useSharedValue<number[]>([]);
  const burnt = useSharedValue(0);
  const lastStatus = useSharedValue<number>(Status.Ready);
  const lastPct = useSharedValue(0);
  const tickAcc = useSharedValue(0);
  const sparkAcc = useSharedValue(0);
  const sparkIdx = useSharedValue(0);

  useEffect(() => {
    if (!reduceMotion) hint.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad), reduceMotion: never }), -1, true));
    return () => cancelAnimation(hint);
  }, [hint, reduceMotion]);

  const weldTick = useCallback((n3: number) => {
    haptic("tap");
    if (n3 === 0) sfx("weld", { volume: 0.7, rate: 0.92 + Math.random() * 0.16 });
  }, []);
  const tickCount = useSharedValue(0);

  const tol2 = cfg.tol * cfg.tol;
  const puddle = Math.max(seam.spacing * 0.75, cfg.tol * 0.8);
  const puddle2 = puddle * puddle;
  const { vMax, base, linger, cool, lockMs, maxBurns } = cfg;

  useFrameCallback((info) => {
    if (ended.value) return;
    let dt = info.timeSincePreviousFrame ?? 16;
    if (dt > 50) dt = 50;
    if (st.value.length !== n) st.set(new Array<number>(n).fill(0));
    const a = st.value;

    const x = tx.value;
    const y = ty.value;
    const mx = x - px.value;
    const my = y - py.value;
    px.set(x);
    py.set(y);
    const sp = speed.value * 0.72 + (Math.sqrt(mx * mx + my * my) / dt) * 1000 * 0.28;
    speed.set(sp);

    let status: number = Status.Ready;
    let h = heat.value;
    let near = false;
    if (lock.value > 0) {
      lock.set(lock.value - dt);
      h = Math.max(0, h - (cool * 1.7 * dt) / 1000);
      status = Status.Cooling;
    } else if (touching.value === 1) {
      torchMs.set(torchMs.value + dt);
      let best = 0;
      let bd = 1e12;
      for (let i = 0; i < n; i++) {
        const ex = xs[i] - x;
        const ey = ys[i] - y;
        const d = ex * ex + ey * ey;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      near = bd <= tol2;
      const fast = sp > vMax;
      if (near) {
        // Clean work: on the seam, at a steady pace and not cooking the plate.
        if (!fast && h <= HOT) goodMs.set(goodMs.value + dt);
        let laid = 0;
        for (let j = best - 3; j <= best + 3; j++) {
          if (j < 0 || j >= n || a[j] !== 0) continue;
          // Rushing only tacks every third spot, which leaves visible gaps to go back for.
          if (fast && j % 3 !== 0) continue;
          const ex = xs[j] - x;
          const ey = ys[j] - y;
          if (ex * ex + ey * ey > puddle2) continue;
          a[j] = 1;
          laid++;
          beads[j].set(2);
          beads[j].set(withTiming(1, { duration: reduceMotion ? 200 : 700, easing: Easing.out(Easing.quad), reduceMotion: never }));
        }
        if (laid > 0) welded.set(welded.value + laid);
        status = fast ? Status.TooFast : Status.Welding;
      } else {
        status = Status.OffSeam;
      }
      h += ((base + linger * Math.max(0, 1 - sp / V_LINGER)) * (near ? 1 : 1.15) * dt) / 1000;
      if (status === Status.Welding && h > HOT) status = Status.Hot;

      if (h >= 1) {
        h = 1;
        burns.set(burns.value + 1);
        lock.set(lockMs);
        status = Status.Cooling;
        if (near) {
          for (let j = best - 1; j <= best + 1; j++) {
            if (j < 0 || j >= n || a[j] === 2) continue;
            if (a[j] === 1) welded.set(welded.value - 1);
            a[j] = 2;
            burnt.set(burnt.value + 1);
            beads[j].set(-1);
          }
        }
        flash.set(1);
        flash.set(withTiming(0, { duration: 520, reduceMotion: never }));
        if (!reduceMotion) shake.set(withSequence(withTiming(5, { duration: 40 }), withTiming(-4, { duration: 60 }), withTiming(2, { duration: 60 }), withTiming(0, { duration: 60 })));
        scheduleOnRN(onBurn, burns.value);
        if (burns.value >= maxBurns) {
          ended.set(1);
          scheduleOnRN(onEnd, 2);
        }
      }
    } else {
      h = Math.max(0, h - (cool * dt) / 1000);
    }
    heat.set(h);
    if (onSeam.value !== (near ? 1 : 0)) onSeam.set(near ? 1 : 0);

    if (near && lock.value <= 0) {
      tickAcc.set(tickAcc.value + dt);
      if (tickAcc.value >= 80) {
        tickAcc.set(0);
        tickCount.set((tickCount.value + 1) % 3);
        scheduleOnRN(weldTick, tickCount.value);
      }
      if (!reduceMotion) {
        sparkAcc.set(sparkAcc.value + dt);
        if (sparkAcc.value >= 42) {
          sparkAcc.set(0);
          const s = sparks[sparkIdx.value];
          sparkIdx.set((sparkIdx.value + 1) % SPARKS);
          s.x.set(x);
          s.y.set(y);
          s.p.set(0);
          s.p.set(withTiming(1, { duration: 300 + sparkIdx.value * 14, easing: Easing.out(Easing.quad), reduceMotion: never }));
        }
      }
    }

    if (status !== lastStatus.value) {
      lastStatus.set(status);
      scheduleOnRN(onStatus, status);
    }
    const pct = Math.min(100, Math.floor((welded.value / (n * DONE_SHARE)) * 100));
    if (pct !== lastPct.value) {
      lastPct.set(pct);
      scheduleOnRN(onPct, pct);
    }
    if (!ended.value && welded.value >= Math.ceil((n - burnt.value) * DONE_SHARE)) {
      ended.set(1);
      scheduleOnRN(onEnd, 0);
    }
  });

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        .onBegin((e) => {
          tx.set(e.x);
          ty.set(e.y - TIP_OFFSET);
          // Reset the speed sample so the jump from the parked position is not read as rushing.
          px.set(e.x);
          py.set(e.y - TIP_OFFSET);
          speed.set(0);
          touching.set(1);
          started.set(1);
        })
        .onUpdate((e) => {
          tx.set(e.x);
          ty.set(e.y - TIP_OFFSET);
        })
        .onFinalize(() => {
          touching.set(0);
        }),
    [px, py, speed, started, touching, tx, ty],
  );

  const torchStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }] }));
  const glowStyle = useAnimatedStyle(() => {
    const on = touching.value === 1 && lock.value <= 0;
    return { opacity: on ? (onSeam.value ? 1 : 0.4) : 0, transform: [{ scale: on && onSeam.value ? 1 : 0.7 }] };
  });
  const coreStyle = useAnimatedStyle(() => {
    const on = touching.value === 1 && lock.value <= 0;
    return { backgroundColor: lock.value > 0 ? palette.steel2 : on ? (onSeam.value ? BEAD_HOT : palette.orange) : palette.amber };
  });
  const gripStyle = useAnimatedStyle(() => ({
    opacity: started.value ? 0.55 : 0.55 + 0.45 * hint.value,
    transform: [{ scale: started.value ? 1 : 1 + 0.12 * hint.value }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.45 }));
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View testID="weld-plate" style={[{ width: w, height: h, backgroundColor: palette.steel1, overflow: "hidden" }, shakeStyle]}>
        <View style={[StyleSheet.absoluteFill, { pointerEvents: "none", borderTopWidth: 1, borderLeftWidth: 1, borderColor: palette.steel2, borderBottomWidth: 1, borderRightWidth: 1, borderBottomColor: palette.steel0, borderRightColor: palette.steel0 }]} />
        <Svg pointerEvents="none" width={w} height={h} style={StyleSheet.absoluteFill}>
          {[
            [10, 10],
            [w - 10, 10],
            [10, h - 10],
            [w - 10, h - 10],
          ].map(([cx, cy], i) => (
            <Circle key={i} cx={cx} cy={cy} r={3} fill={palette.steel0} stroke={palette.steel2} strokeWidth={1} />
          ))}
          <Path d={`M14 ${h - 5}H${w - 14}`} stroke={palette.void1} strokeWidth={4} />
          <Path d={`M14 ${h - 5}H${w - 14}`} stroke={palette.yellow} strokeWidth={4} strokeDasharray="7 7" opacity={0.85} />
          <Path d={seam.d} stroke={palette.steel0} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Path d={seam.d} stroke={palette.void0} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Path d={seam.d} stroke={palette.steel2} strokeWidth={1} strokeDasharray="2 7" strokeLinecap="round" fill="none" opacity={0.7} />
        </Svg>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[type.micro, { pointerEvents: "none", position: "absolute", right: 20, bottom: 12, color: palette.steel2 }]}>
          {tr(L_PLATE)}
        </Text>
        {seam.xs.map((x, i) => (
          <Bead key={i} v={beads[i]} x={x} y={seam.ys[i]} ang={seam.ang[i]} len={seam.spacing + 3} />
        ))}
        {sparks.map((s, i) => (
          <SparkDot key={i} s={s} />
        ))}
        <Animated.View style={[styles.torch, torchStyle]}>
          <Animated.View style={[styles.glow, glowStyle]}>
            <View style={styles.glowCore} />
          </Animated.View>
          <Animated.View style={[styles.grip, gripStyle]} />
          <View style={styles.stem} />
          <View style={styles.nozzle}>
            <Animated.View style={[styles.core, coreStyle]} />
          </View>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { pointerEvents: "none", backgroundColor: palette.red1 }, flashStyle]} />
      </Animated.View>
    </GestureDetector>
  );
});

const HeatStrip = memo(function HeatStrip({ heat, status, burnCount, maxBurns }: { heat: SharedValue<number>; status: number; burnCount: number; maxBurns: number }) {
  const t = useMiniTheme();
  const fill = useAnimatedStyle(() => ({
    width: `${clamp01(heat.value) * 100}%`,
    backgroundColor: interpolateColor(heat.value, [0, 0.5, 0.78, 1], [palette.mint, palette.yellow, palette.orange, palette.red1]),
  }));
  const warn = status === Status.Hot || status === Status.Cooling || status === Status.TooFast || status === Status.OffSeam;
  return (
    <View style={{ height: GAUGE_H, flexDirection: "row", alignItems: "center", paddingHorizontal: space.sm, gap: space.sm, backgroundColor: t.body, borderBottomWidth: 1, borderBottomColor: t.rule }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[type.label, { color: t.inkDim }]}>
        {tr(L_HEAT)}
      </Text>
      <View style={{ flex: 1, height: 14, borderRadius: 3, backgroundColor: t.lcdBg, padding: 2, overflow: "hidden" }}>
        <Animated.View style={[{ height: 10, borderRadius: 1 }, fill]} />
        <View style={[StyleSheet.absoluteFill, { pointerEvents: "none", flexDirection: "row", justifyContent: "space-evenly" }]}>
          {Array.from({ length: 11 }, (_, i) => (
            <View key={i} style={{ width: 2, backgroundColor: t.lcdBg }} />
          ))}
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {Array.from({ length: maxBurns }, (_, i) => (
          <View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: i < burnCount ? t.red : t.ledOff, borderWidth: 1, borderColor: "rgba(0,0,0,0.25)" }} />
        ))}
      </View>
      <View style={{ width: 92, height: 22, borderRadius: radius.lcd, backgroundColor: t.lcdBg, alignItems: "center", justifyContent: "center" }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={[type.lcdS, { color: warn ? t.lcdWarn : t.lcdOn }]}>
          {tr(STATUS_TEXT[status])}
        </Text>
      </View>
    </View>
  );
});

export default function Weld({ tier, seed, width, height, reduceMotion, onFinish }: MinigameProps) {
  const cfg = TIERS[tier - 1];
  const stageH = height - MINI_HUD_HEIGHT;
  // MiniStage: 8 pt margin and a 1 pt border on every side.
  const iw = width - 18;
  const ph = stageH - 18 - GAUGE_H;
  const seam = useMemo(() => buildSeam(seed, tier, { x: 26, y: 26, w: iw - 52, h: ph - 26 - 22 - TIP_OFFSET }), [seed, tier, iw, ph]);

  const [pct, setPct] = useState(0);
  const [status, setStatus] = useState<number>(Status.Ready);
  const [burnCount, setBurnCount] = useState(0);
  const heat = useSharedValue(0);
  const welded = useSharedValue(0);
  const burns = useSharedValue(0);
  const goodMs = useSharedValue(0);
  const torchMs = useSharedValue(0);
  const ended = useSharedValue(0);
  const done = useRef(false);
  const finishRef = useRef<(reason: number) => void>(() => {});
  const clock = useCountdown(cfg.seconds, () => finishRef.current(1));

  // Kept in a ref so the timeout and the worklets always reach the latest closure. reason: 0 seam finished, 1 out of time, 2 plate ruined.
  useEffect(() => {
    finishRef.current = (reason: number) => {
      if (done.current) return;
      done.current = true;
      ended.set(1);
      const timeLeft = clock.left.value;
      clock.stop();
      const coverage = Math.min(1, welded.value / (seam.n * DONE_SHARE));
      const precision = torchMs.value > 0 ? clamp01(goodMs.value / torchMs.value) : 0;
      const pace = reason === 0 ? clamp01(timeLeft / 0.6) : 0;
      let score = coverage * (0.62 + 0.26 * precision + 0.12 * pace) - BURN_COST * burns.value;
      if (reason === 2) score = Math.min(score, 0.45);
      onFinish(makeResult(score, clock.startedAt));
    };
  });
  const onEnd = useCallback((reason: number) => finishRef.current(reason), []);
  const onBurn = useCallback((count: number) => {
    setBurnCount(count);
    haptic("heavy");
    sfx("overheat");
  }, []);

  useEffect(() => {
    mgPublish("weld", { xs: seam.xs, ys: seam.ys, n: seam.n, tipOffset: TIP_OFFSET, vMax: cfg.vMax, tol: cfg.tol, maxBurns: cfg.maxBurns, seconds: cfg.seconds });
  }, [seam, cfg]);

  return (
    <View style={{ width, height }}>
      <MiniHud title={meta.name} left={clock.left} score={`${pct}%`} />
      <MiniStage width={width} height={stageH}>
        <HeatStrip heat={heat} status={status} burnCount={burnCount} maxBurns={cfg.maxBurns} />
        <WeldCore
          seam={seam}
          tier={tier}
          w={iw}
          h={ph}
          reduceMotion={reduceMotion}
          heat={heat}
          welded={welded}
          burns={burns}
          goodMs={goodMs}
          torchMs={torchMs}
          ended={ended}
          onPct={setPct}
          onStatus={setStatus}
          onBurn={onBurn}
          onEnd={onEnd}
        />
      </MiniStage>
    </View>
  );
}

const styles = StyleSheet.create({
  spark: { pointerEvents: "none", position: "absolute", left: -2.5, top: -2.5, width: 5, height: 5, borderRadius: 2.5, backgroundColor: palette.yellow },
  // Zero-size anchor at the torch tip; children are placed around it.
  torch: { pointerEvents: "none", position: "absolute", left: 0, top: 0, width: 0, height: 0 },
  glow: { position: "absolute", left: -32, top: -32, width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,166,61,0.45)", alignItems: "center", justifyContent: "center" },
  glowCore: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,216,74,0.7)" },
  grip: { position: "absolute", left: -22, top: TIP_OFFSET - 22, width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: palette.bone1, backgroundColor: "rgba(231,227,216,0.12)" },
  stem: { position: "absolute", left: -2, top: 6, width: 4, height: TIP_OFFSET - 6, borderRadius: 2, backgroundColor: palette.void1 },
  nozzle: { position: "absolute", left: -9, top: -9, width: 18, height: 18, borderRadius: 9, backgroundColor: palette.void1, borderWidth: 2, borderColor: palette.steel3, alignItems: "center", justifyContent: "center" },
  core: { width: 8, height: 8, borderRadius: 4 },
});

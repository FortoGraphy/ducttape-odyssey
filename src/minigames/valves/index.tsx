// Pressure valves: every pipe has a gauge and a fader. Pushing a fader up raises its own pipe and
// leaks pressure into the neighbours, so the player has to balance the whole manifold. The
// simulation lives in one frame callback on shared values; React state only changes on discrete
// events (a burst, a 5 % step of the stable meter, the end of the game).
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { makeMutable, useAnimatedReaction, useAnimatedStyle, useFrameCallback, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Circle, Line } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import type { L10n } from "@/engine/types";
import { tr } from "@/i18n";
import { MAX_FONT_SCALE, palette, radius, space, type, type PanelTheme } from "@/ui/theme";

import { MINI_HUD_HEIGHT, MiniHud, MiniStage, haptic, sfx, useCountdown, useMiniTheme } from "../shared";
import { makeResult, type MinigameMeta, type MinigameProps } from "../types";
import { BURST_GRACE, DANGER, DRAIN, LEAK_DROP, SECONDS, SURGE_AMP, SURGE_LEN, SURGE_WARN, makeValvesConfig, scoreValves, targetAt, type ValvesConfig, type ValvesEnd } from "./config";

export const meta: MinigameMeta = {
  id: "valves",
  name: { cs: "Tlakové ventily", en: "Pressure valves" },
  hint: {
    cs: "Táhly udrž každý tlak v zeleném pásmu. Pozor, sousední trubky se přetlačují.",
    en: "Drag the faders to hold every gauge in its green band. Neighbouring pipes push each other.",
  },
  icon: "mg_valves",
  seconds: SECONDS,
};

const TEXT = {
  stable: { cs: "STABILITA", en: "STABLE" },
  bursts: { cs: "PRASKLO", en: "BURST" },
  leak: { cs: "ÚNIK", en: "LEAK" },
  win: { cs: "TLAK DRŽÍ", en: "PRESSURE HOLDS" },
  burst: { cs: "POTRUBÍ TO VZDALO", en: "THE PIPES GAVE UP" },
  timeout: { cs: "ČAS VYPRŠEL", en: "OUT OF TIME" },
} satisfies Record<string, L10n>;

/** Test-route hook: lets a bot play so every ending can be exercised without a finger. */
export type ValvesDebugAuto = "win" | "lose" | "idle";
type Props = MinigameProps & { debugAuto?: ValvesDebugAuto };

const STRIP_H = 28;
const HEADER_H = 18;
const MANIFOLD_H = 34;
const CAP_H = 26;
/** Inset of a column's content inside its channel plate. */
const PAD = 4;
const LEDS = 16;
const FADER_STEPS = 20;
const END_HOLD_MS = 750;

interface Geo {
  colW: number;
  bodyH: number;
  tubeW: number;
  tubeInner: number;
  capW: number;
  throwLen: number;
  left: number;
  top: number;
}

interface Sim {
  P: SharedValue<number>[];
  V: SharedValue<number>[];
  /** 0 calm, 1 surge incoming, 2 surging. */
  W: SharedValue<number>[];
  vent: SharedValue<number>[];
  burstFx: SharedValue<number>[];
}

function zoneOf(p: number, lo: number, hi: number): number {
  "worklet";
  return p >= DANGER ? 3 : p > hi ? 2 : p < lo ? 0 : 1;
}

export default function ValvesGame({ tier, seed, width, height, reduceMotion, onFinish, debugAuto }: Props) {
  const t = useMiniTheme();
  const cfg = useMemo(() => makeValvesConfig(tier, seed), [tier, seed]);

  const [sim] = useState<Sim>(() => ({
    P: cfg.p0.map((p) => makeMutable(p)),
    V: cfg.v0.map((v) => makeMutable(v)),
    W: cfg.p0.map(() => makeMutable(0)),
    vent: cfg.p0.map(() => makeMutable(0)),
    burstFx: cfg.p0.map(() => makeMutable(1)),
  }));

  const time = useSharedValue(0);
  const stable = useSharedValue(0);
  const inBandT = useSharedValue(0);
  const burstCount = useSharedValue(0);
  const allIn = useSharedValue(0);
  const ended = useSharedValue(0);
  const rumble = useSharedValue(0);
  const leakOn = useSharedValue(0);
  const grace = useSharedValue(0);
  const botT = useSharedValue(0);
  const botPipe = useSharedValue(0);

  const [pct, setPct] = useState(0);
  const [bursts, setBursts] = useState(0);
  const [leaking, setLeaking] = useState(false);
  const [end, setEnd] = useState<ValvesEnd | null>(null);

  const finished = useRef(false);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishRef = useRef(onFinish);
  useEffect(() => {
    finishRef.current = onFinish;
  }, [onFinish]);

  // The countdown needs `conclude` and `conclude` needs the countdown: the ref breaks the cycle.
  const concludeRef = useRef<(kind: ValvesEnd) => void>(() => {});
  const countdown = useCountdown(cfg.seconds, () => concludeRef.current("timeout"));
  const conclude = useCallback(
    (kind: ValvesEnd) => {
      if (finished.current) return;
      finished.current = true;
      ended.set(1);
      countdown.stop();
      const elapsed = time.value;
      const score = scoreValves(cfg, kind, Math.max(0, Math.min(1, stable.value)), elapsed > 0 ? inBandT.value / elapsed : 0, burstCount.value, elapsed);
      const result = makeResult(score, countdown.startedAt);
      setEnd(kind);
      if (kind === "win") {
        haptic("success");
        sfx("repairDone");
      } else {
        haptic("error");
        sfx("fail");
      }
      if (kind === "timeout") finishRef.current(result);
      else endTimer.current = setTimeout(() => finishRef.current(result), END_HOLD_MS);
    },
    // `countdown.stop` and `startedAt` only touch refs inside the hook, so the first render's copy stays valid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfg],
  );
  useEffect(() => {
    concludeRef.current = conclude;
  }, [conclude]);
  useEffect(
    () => () => {
      if (endTimer.current) clearTimeout(endTimer.current);
    },
    [],
  );

  const onBurst = useCallback((count: number) => {
    setBursts(count);
    haptic("heavy");
    sfx("impact");
  }, []);
  const onRumble = useCallback(() => {
    haptic("impact");
  }, []);
  const onAllIn = useCallback(() => {
    haptic("tap");
    sfx("beepGood", { volume: 0.5 });
  }, []);
  const onLeak = useCallback(() => {
    setLeaking(true);
    haptic("warning");
    sfx("alert");
  }, []);

  useFrameCallback((info) => {
    if (ended.value !== 0) return;
    const dt = Math.min(0.05, (info.timeSincePreviousFrame ?? 16) / 1000);
    const now = time.value + dt;
    time.set(now);
    const n = cfg.n;
    const { P, V, W, vent, burstFx } = sim;

    if (debugAuto === "win") {
      // One thumb: the bot works the worst pipe for a moment, then looks again.
      botT.set(botT.value - dt);
      if (botT.value <= 0) {
        botT.set(0.45);
        let worst = 0;
        let worstErr = -1;
        for (let i = 0; i < n; i++) {
          const e = Math.abs(P[i].value - (cfg.bandLo[i] + cfg.bandHi[i]) / 2) / (cfg.bandHi[i] - cfg.bandLo[i]);
          if (e > worstErr) {
            worstErr = e;
            worst = i;
          }
        }
        botPipe.set(worst);
      }
      const k = botPipe.value;
      const mid = (cfg.bandLo[k] + cfg.bandHi[k]) / 2;
      V[k].set(Math.max(0, Math.min(1, V[k].value + (mid - P[k].value) * 2.2 * dt)));
    } else if (debugAuto === "lose") {
      for (let i = 0; i < n; i++) V[i].set(Math.min(1, V[i].value + dt));
    } else if (debugAuto === "idle") {
      for (let i = 0; i < n; i++) V[i].set(Math.max(0.2, V[i].value - dt));
    }

    if (cfg.leakPipe >= 0 && leakOn.value === 0 && now > cfg.leakAt) {
      leakOn.set(1);
      scheduleOnRN(onLeak);
    }

    const blend = 1 - Math.exp(-dt / cfg.tau);
    if (grace.value > 0) grace.set(Math.max(0, grace.value - dt));
    let every = true;
    let maxP = 0;
    let burstNow = false;
    for (let i = 0; i < n; i++) {
      let tgt = targetAt(cfg, i, V[i].value, i > 0 ? V[i - 1].value : 0, i < n - 1 ? V[i + 1].value : 0, now);
      let warn = 0;
      for (let s = 0; s < cfg.surgeAt.length; s++) {
        if (cfg.surgePipe[s] !== i) continue;
        const d = now - cfg.surgeAt[s];
        if (d > -SURGE_WARN && d < 0) warn = 1;
        else if (d >= 0 && d < SURGE_LEN) {
          warn = 2;
          tgt += SURGE_AMP * Math.min(1, d / 0.35, (SURGE_LEN - d) / 0.6);
        }
      }
      if (W[i].value !== warn) W[i].set(warn);
      if (i === cfg.leakPipe && now > cfg.leakAt) tgt -= LEAK_DROP * Math.min(1, (now - cfg.leakAt) / 1.5);
      if (vent[i].value > 0) {
        vent[i].set(Math.max(0, vent[i].value - dt));
        tgt = 0.12;
      }
      let p = P[i].value + (tgt - P[i].value) * blend;
      if (p < 0.02) p = 0.02;
      if (p >= 1 && grace.value > 0) p = 0.995;
      if (p >= 1) {
        p = 0.55;
        vent[i].set(1.4);
        burstNow = true;
        burstFx[i].set(0);
        burstFx[i].set(reduceMotion ? 1 : withTiming(1, { duration: 700 }));
      }
      P[i].set(p);
      if (p > maxP) maxP = p;
      if (p < cfg.bandLo[i] || p > cfg.bandHi[i]) every = false;
    }

    if (burstNow) {
      grace.set(BURST_GRACE);
      burstCount.set(burstCount.value + 1);
      stable.set(Math.max(0, stable.value - 0.3));
      scheduleOnRN(onBurst, burstCount.value);
      if (burstCount.value >= cfg.maxBursts) {
        ended.set(1);
        scheduleOnRN(conclude, "burst");
        return;
      }
    }

    if (every) {
      inBandT.set(inBandT.value + dt);
      stable.set(Math.min(1, stable.value + dt / cfg.need));
      if (allIn.value === 0) {
        allIn.set(1);
        scheduleOnRN(onAllIn);
      }
      if (stable.value >= 1) {
        ended.set(1);
        scheduleOnRN(conclude, "win");
        return;
      }
    } else {
      stable.set(Math.max(0, stable.value - (dt / cfg.need) * DRAIN));
      if (allIn.value === 1) allIn.set(0);
    }

    if (maxP > DANGER) {
      rumble.set(rumble.value + dt);
      if (rumble.value > 0.24) {
        rumble.set(0);
        scheduleOnRN(onRumble);
      }
    } else if (rumble.value !== 0.2) {
      rumble.set(0.2); // primed, so the first rumble comes right as the needle enters the red
    }
  });

  useAnimatedReaction(
    () => Math.round(stable.value * 20) * 5,
    (now, prev) => {
      if (now !== prev) scheduleOnRN(setPct, now);
    },
  );

  const stageH = height - MINI_HUD_HEIGHT;
  const innerW = width - space.sm * 2 - 2;
  const innerH = stageH - space.sm * 2 - 2;
  const geo = useMemo<Geo>(() => {
    const colW = Math.min(96, Math.floor((innerW - space.sm) / cfg.n));
    const avail = innerH - STRIP_H - space.sm * 3 - 8;
    const bodyH = Math.min(420, avail - HEADER_H - MANIFOLD_H);
    const tubeW = colW >= 78 ? 28 : 20;
    const used = HEADER_H + bodyH + MANIFOLD_H;
    return {
      colW,
      bodyH,
      tubeW,
      tubeInner: bodyH - 6,
      capW: Math.min(44, colW - tubeW - PAD * 2 - 6),
      throwLen: bodyH - CAP_H,
      left: Math.round((innerW - colW * cfg.n) / 2),
      top: STRIP_H + space.sm * 2 + 4 + Math.round((avail - used) / 2),
    };
  }, [innerW, innerH, cfg.n]);

  const locked = end !== null || debugAuto !== undefined;

  return (
    <View style={{ width, height, backgroundColor: t.body }}>
      <MiniHud title={meta.name} left={countdown.left} score={`${pct}%`} />
      <MiniStage width={width} height={stageH}>
        <StatusStrip stable={stable} allIn={allIn} bursts={bursts} maxBursts={cfg.maxBursts} width={innerW} />
        <Plates n={cfg.n} geo={geo} />
        <Manifold cfg={cfg} geo={geo} />
        {cfg.p0.map((_, i) => (
          <Column key={i} i={i} cfg={cfg} geo={geo} sim={sim} time={time} leaking={leaking && i === cfg.leakPipe} locked={locked} reduceMotion={reduceMotion} />
        ))}
        {end && <EndPlate text={TEXT[end]} good={end === "win"} />}
      </MiniStage>
    </View>
  );
}

function Label({ children, color, style }: { children: string; color: string; style?: object }) {
  return (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={[type.micro, { color }, style]}>
      {children}
    </Text>
  );
}

const StatusStrip = memo(function StatusStrip({ stable, allIn, bursts, maxBursts, width }: { stable: SharedValue<number>; allIn: SharedValue<number>; bursts: number; maxBursts: number; width: number }) {
  const t = useMiniTheme();
  const ledW = Math.floor((width - 190) / LEDS);
  const rowW = ledW * LEDS;
  const clip = useAnimatedStyle(() => ({ width: Math.floor(Math.min(1, stable.value) * LEDS + 0.02) * ledW }));
  const lit = useAnimatedStyle(() => ({ opacity: allIn.value === 1 ? 1 : 0.55 }));
  const leds = useMemo(() => Array.from({ length: LEDS }, (_, k) => k), []);
  return (
    <View style={{ height: STRIP_H, marginTop: space.sm, marginHorizontal: space.sm, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Label color={t.inkDim}>{tr(TEXT.stable)}</Label>
        <View style={{ width: rowW + 8, height: 16, borderRadius: radius.lcd, backgroundColor: t.lcdBg, justifyContent: "center", paddingLeft: 4 }}>
          <View style={{ width: rowW, height: 8, flexDirection: "row" }}>
            {leds.map((k) => (
              <View key={k} style={{ width: ledW - 2, marginRight: 2, height: 8, borderRadius: 1.5, backgroundColor: t.lcdDim }} />
            ))}
          </View>
          <Animated.View style={[{ position: "absolute", left: 4, height: 8, overflow: "hidden" }, clip]}>
            <Animated.View style={[{ width: rowW, height: 8, flexDirection: "row" }, lit]}>
              {leds.map((k) => (
                <View key={k} style={{ width: ledW - 2, marginRight: 2, height: 8, borderRadius: 1.5, backgroundColor: k >= LEDS - 2 ? t.lcdOn : t.mint }} />
              ))}
            </Animated.View>
          </Animated.View>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        <Label color={t.inkDim}>{tr(TEXT.bursts)}</Label>
        {Array.from({ length: maxBursts }, (_, k) => (
          <View key={k} style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: k < bursts ? t.red : t.ledOff, borderWidth: 1, borderColor: t.rule }} />
        ))}
      </View>
    </View>
  );
});

/** One raised channel strip per pipe, so it is obvious which fader belongs to which gauge. */
const Plates = memo(function Plates({ n, geo }: { n: number; geo: Geo }) {
  const t = useMiniTheme();
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{ position: "absolute", left: geo.left + i * geo.colW + 1, top: geo.top - 4, width: geo.colW - 2, height: HEADER_H + geo.bodyH + MANIFOLD_H + 8, borderRadius: radius.well, backgroundColor: t.body, borderWidth: 1, borderColor: t.rule, borderTopColor: t.bodyHi }}
        />
      ))}
    </>
  );
});

/** The shared pipe under the gauges: it is the picture of "these pipes are connected". */
const Manifold = memo(function Manifold({ cfg, geo }: { cfg: ValvesConfig; geo: Geo }) {
  const y = geo.top + HEADER_H + geo.bodyH;
  const first = geo.left + geo.tubeW / 2 + PAD;
  const last = geo.left + (cfg.n - 1) * geo.colW + geo.tubeW / 2 + PAD;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: y, height: MANIFOLD_H }}>
      {cfg.p0.map((_, i) => (
        <View key={i} style={{ position: "absolute", left: geo.left + i * geo.colW + geo.tubeW / 2 + PAD - 4, top: -2, width: 8, height: MANIFOLD_H / 2 + 2, backgroundColor: palette.steel2, borderLeftWidth: 2, borderLeftColor: palette.steel3, borderRightWidth: 2, borderRightColor: palette.steel1 }} />
      ))}
      <View style={{ position: "absolute", left: first - 12, width: last - first + 24, top: MANIFOLD_H / 2 - 5, height: 10, borderRadius: 5, backgroundColor: palette.steel2, borderTopWidth: 2, borderTopColor: palette.steel3, borderBottomWidth: 2, borderBottomColor: palette.steel1 }} />
    </View>
  );
});

const Column = memo(function Column({
  i,
  cfg,
  geo,
  sim,
  time,
  leaking,
  locked,
  reduceMotion,
}: {
  i: number;
  cfg: ValvesConfig;
  geo: Geo;
  sim: Sim;
  time: SharedValue<number>;
  leaking: boolean;
  locked: boolean;
  reduceMotion: boolean;
}) {
  const t = useMiniTheme();
  const p = sim.P[i];
  const v = sim.V[i];
  const warn = sim.W[i];
  const fx = sim.burstFx[i];
  const lo = cfg.bandLo[i];
  const hi = cfg.bandHi[i];
  const startV = useSharedValue(0);
  const grab = useSharedValue(0);

  const tick = useCallback((step: number) => {
    haptic("detent");
    if (step % 4 === 0) sfx("valve", { volume: 0.6 });
  }, []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!locked)
        .minDistance(0)
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        .onBegin(() => {
          "worklet";
          startV.set(v.value);
          grab.set(withTiming(1, { duration: 60 }));
        })
        .onChange((e) => {
          "worklet";
          const next = Math.max(0, Math.min(1, startV.value - e.translationY / geo.throwLen));
          const before = Math.round(v.value * FADER_STEPS);
          const after = Math.round(next * FADER_STEPS);
          v.set(next);
          if (after !== before) scheduleOnRN(tick, after);
        })
        .onFinalize(() => {
          "worklet";
          grab.set(withTiming(0, { duration: 140 }));
        }),
    [locked, geo.throwLen, v, startV, grab, tick],
  );

  const inner = geo.tubeInner;
  const liquid = useAnimatedStyle(() => {
    const z = zoneOf(p.value, lo, hi);
    return {
      transform: [{ translateY: (1 - p.value) * inner }],
      backgroundColor: z === 1 ? palette.mint : z === 0 ? palette.cobalt2 : z === 2 ? palette.amber : palette.red1,
    };
  });
  const led = useAnimatedStyle(() => {
    const z = zoneOf(p.value, lo, hi);
    const blink = Math.floor(time.value * 6) % 2 === 0;
    if (z === 3) return { backgroundColor: reduceMotion || blink ? palette.red1 : palette.red0 };
    if (warn.value > 0) return { backgroundColor: reduceMotion || blink || warn.value === 2 ? palette.yellow : t.ledOff };
    return { backgroundColor: z === 1 ? palette.mint : t.ledOff };
  });
  const cap = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - v.value) * geo.throwLen }] }));
  const capLine = useAnimatedStyle(() => ({ opacity: 0.75 + grab.value * 0.25, height: 3 + grab.value }));
  const wheel = useAnimatedStyle(() => ({ transform: [{ rotate: `${v.value * 300}deg` }] }));

  const x = geo.left + i * geo.colW;
  const faderX = PAD + geo.tubeW + 3;
  const faderW = geo.colW - faderX - PAD;
  const ticks = useMemo(() => [0, 1, 2, 3, 4, 5, 6, 7, 8], []);

  return (
    <View style={{ position: "absolute", left: x, top: geo.top, width: geo.colW }}>
      <View style={{ height: HEADER_H, flexDirection: "row", alignItems: "center", gap: space.xs, paddingLeft: PAD + 2 }}>
        <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: t.rule }, led]} />
        <Label color={leaking ? t.orange : t.ink}>{leaking ? tr(TEXT.leak) : `P${i + 1}`}</Label>
      </View>

      <GestureDetector gesture={pan}>
        <View testID={`valves-col-${i}`} style={{ width: geo.colW, height: geo.bodyH }}>
          {/* gauge tube */}
          <View style={{ position: "absolute", left: PAD, top: 0, width: geo.tubeW, height: geo.bodyH, borderRadius: radius.lcd, backgroundColor: t.lcdBg, borderWidth: 1, borderColor: t.keyLo, padding: 2 }}>
            <View style={{ flex: 1, borderRadius: 3, overflow: "hidden", backgroundColor: t.lcdDim }}>
              <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: (1 - DANGER) * inner, backgroundColor: palette.red0 }} />
              <View testID={`valves-band-${i}`} style={{ position: "absolute", left: 0, right: 0, top: (1 - hi) * inner, height: (hi - lo) * inner, backgroundColor: palette.green0, borderTopWidth: 1.5, borderBottomWidth: 1.5, borderColor: palette.mint }} />
              {ticks.map((k) => (
                <View key={k} style={{ position: "absolute", right: 0, top: ((k + 1) / 10) * inner, width: 4, height: 1, backgroundColor: palette.steel2 }} />
              ))}
              <Animated.View testID={`valves-level-${i}`} style={[{ position: "absolute", left: "50%", marginLeft: -4, top: 0, width: 8, height: inner, borderTopLeftRadius: 2, borderTopRightRadius: 2 }, liquid]}>
                <View style={{ height: 2, backgroundColor: palette.bone2, opacity: 0.9, borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />
              </Animated.View>
            </View>
          </View>

          {/* fader */}
          <View style={{ position: "absolute", left: faderX, top: 0, width: faderW, height: geo.bodyH, alignItems: "center" }}>
            <View style={{ position: "absolute", top: 0, bottom: 0, width: 6, borderRadius: 3, backgroundColor: t.keyLo }} />
            {[0, 1, 2, 3, 4].map((k) => (
              <View key={k} style={{ position: "absolute", top: CAP_H / 2 + (k / 4) * geo.throwLen, width: Math.min(geo.capW, 30), height: 1, backgroundColor: t.rule }} />
            ))}
            <Animated.View style={[{ position: "absolute", top: 0, width: geo.capW, height: CAP_H, borderRadius: 5, backgroundColor: t.keyLo }, cap]}>
              <View style={{ height: CAP_H - 3, borderRadius: 5, backgroundColor: t.key, borderTopWidth: 1, borderTopColor: t.keyHi, justifyContent: "center" }}>
                <Animated.View style={[{ marginHorizontal: 4, borderRadius: 1.5, backgroundColor: t.orange }, capLine]} />
              </View>
            </Animated.View>
          </View>
        </View>
      </GestureDetector>

      {/* valve wheel sitting on the manifold */}
      <Animated.View pointerEvents="none" style={[{ position: "absolute", left: PAD + geo.tubeW / 2 - 13, top: HEADER_H + geo.bodyH + MANIFOLD_H / 2 - 13, width: 26, height: 26 }, wheel]}>
        <Svg width={26} height={26} viewBox="0 0 26 26">
          <Circle cx={13} cy={13} r={10} stroke={t.orange} strokeWidth={3.5} fill="none" />
          <Line x1={13} y1={3} x2={13} y2={23} stroke={t.orange} strokeWidth={2.5} />
          <Line x1={3} y1={13} x2={23} y2={13} stroke={t.orange} strokeWidth={2.5} />
          <Circle cx={13} cy={13} r={3.2} fill={t.key} />
          <Circle cx={13} cy={4} r={1.4} fill={palette.bone2} />
        </Svg>
      </Animated.View>

      {!reduceMotion && [0, 1, 2].map((k) => <Puff key={k} k={k} fx={fx} x={PAD + geo.tubeW / 2} y={HEADER_H + 4} />)}
      {leaking && [0, 1, 2].map((k) => <LeakPuff key={k} k={k} time={time} still={reduceMotion} x={PAD + geo.tubeW} y={HEADER_H + geo.bodyH * 0.72} />)}
    </View>
  );
});

/** Steam burst out of the top of a pipe. `fx` runs 0 -> 1 once per burst. */
function Puff({ k, fx, x, y }: { k: number; fx: SharedValue<number>; x: number; y: number }) {
  const dx = (k - 1) * 16;
  const size = 18 + k * 4;
  const style = useAnimatedStyle(() => {
    const f = fx.value;
    return {
      opacity: f >= 1 ? 0 : 0.85 * (1 - f),
      transform: [{ translateX: dx * f }, { translateY: -(14 + k * 5) * f }, { scale: 0.4 + f * 1.3 }],
    };
  });
  return <Animated.View pointerEvents="none" style={[{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: size / 2, backgroundColor: palette.bone2 }, style]} />;
}

/** Thin hiss from the leaking pipe (tier 3). */
function LeakPuff({ k, time, still, x, y }: { k: number; time: SharedValue<number>; still: boolean; x: number; y: number }) {
  const style = useAnimatedStyle(() => {
    const raw = still ? (k + 1) / 4 : time.value * 1.1 + k / 3;
    const f = raw - Math.floor(raw);
    return {
      opacity: 0.7 * (1 - f),
      transform: [{ translateX: 2 + f * 16 }, { translateY: -f * 12 }, { scale: 0.5 + f }],
    };
  });
  return <Animated.View pointerEvents="none" style={[{ position: "absolute", left: x - 4, top: y - 4, width: 9, height: 9, borderRadius: 5, backgroundColor: palette.bone2 }, style]} />;
}

function EndPlate({ text, good }: { text: L10n; good: boolean }) {
  const t: PanelTheme = useMiniTheme();
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
      <View style={{ maxWidth: "88%", backgroundColor: t.lcdBg, borderRadius: radius.lcd, borderWidth: 2, borderColor: t.keyLo, paddingHorizontal: space.lg, paddingVertical: space.md }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[type.lcdL, { color: good ? t.lcdOn : t.lcdWarn, textAlign: "center" }]}>
          {tr(text)}
        </Text>
      </View>
    </View>
  );
}

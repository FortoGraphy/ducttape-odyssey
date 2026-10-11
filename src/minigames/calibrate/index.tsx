// Calibration: turn the knob until the live trace matches the ghost (clean, tall, same pitch) and
// hold it there to lock. Tiers 2 and 3 split the dial into a coarse ring and a fine knob and let
// the target drift; tier 3 adds interference bursts and three locks. Also used as the gyro
// stabiliser for a tumbling ship. Dial position, hold meter and the trace all live on shared values.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useFrameCallback, useSharedValue, withSequence, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import type { L10n } from "@/engine/types";
import { tr } from "@/i18n";
import { MAX_FONT_SCALE, palette, radius, space, type } from "@/ui/theme";

import { MINI_HUD_HEIGHT, MiniHud, MiniStage, haptic, sfx, useCountdown, useMiniTheme } from "../shared";
import { makeResult, type MinigameMeta, type MinigameProps } from "../types";
import { SECONDS, TURN_FINE, TURN_RING, TURN_SINGLE, hash01, makeCalibrateConfig, quality, scoreCalibrate, type CalibrateConfig, type CalibrateEnd } from "./config";

export const meta: MinigameMeta = {
  id: "calibrate",
  name: { cs: "Kalibrace", en: "Calibration" },
  hint: {
    cs: "Otáčej knoflíkem, až vlna sedne na předlohu, a chvíli ji tam udrž.",
    en: "Turn the knob until the wave sits on the ghost trace, then hold it steady.",
  },
  icon: "mg_calibrate",
  seconds: SECONDS,
};

const TEXT = {
  search: { cs: "HLEDÁM", en: "SEARCHING" },
  hold: { cs: "DRŽ TO", en: "HOLD IT" },
  noise: { cs: "RUŠENÍ", en: "NOISE" },
  signal: { cs: "SIG", en: "SIG" },
  lock: { cs: "ZÁMEK", en: "LOCK" },
  fuses: { cs: "POJISTKY", en: "FUSES" },
  coarse: { cs: "HRUBĚ", en: "COARSE" },
  fine: { cs: "JEMNĚ", en: "FINE" },
  tune: { cs: "LADĚNÍ", en: "TUNE" },
  win: { cs: "ZKALIBROVÁNO", en: "CALIBRATED" },
  fusesEnd: { cs: "POJISTKY V TAHU", en: "FUSES BLOWN" },
  timeout: { cs: "ČAS VYPRŠEL", en: "OUT OF TIME" },
} satisfies Record<string, L10n>;
const END_TEXT: Record<CalibrateEnd, L10n> = { win: TEXT.win, fuses: TEXT.fusesEnd, timeout: TEXT.timeout };

export type CalibrateDebugAuto = "win" | "lose" | "idle";
type Props = MinigameProps & { debugAuto?: CalibrateDebugAuto };

const AnimatedPath = Animated.createAnimatedComponent(Path);

const POINTS = 64;
const GHOST_CYCLES = 3;
const ROW_H = 26;
const END_HOLD_MS = 750;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

export default function CalibrateGame({ tier, seed, width, height, reduceMotion, onFinish, debugAuto }: Props) {
  const t = useMiniTheme();
  const cfg = useMemo(() => makeCalibrateConfig(tier, seed), [tier, seed]);

  const x = useSharedValue(cfg.start);
  const tgt = useSharedValue(cfg.targets[0]);
  const ringA = useSharedValue(cfg.start * TAU);
  const knobA = useSharedValue(cfg.driftPh[0]);
  const time = useSharedValue(0);
  const lockIdx = useSharedValue(0);
  const lockStart = useSharedValue(0);
  const hold = useSharedValue(0);
  const dwell = useSharedValue(0);
  const inWin = useSharedValue(0);
  const inside = useSharedValue(0);
  const overshoots = useSharedValue(0);
  const noiseOn = useSharedValue(0);
  const ended = useSharedValue(0);
  const flash = useSharedValue(0);
  const mode = useSharedValue(0);
  const prevA = useSharedValue(0);
  const atStop = useSharedValue(0);

  const [locksDone, setLocksDone] = useState(0);
  const [fusesLeft, setFusesLeft] = useState(cfg.fuses);
  const [status, setStatus] = useState(0);
  const [end, setEnd] = useState<CalibrateEnd | null>(null);

  const finished = useRef(false);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishRef = useRef(onFinish);
  useEffect(() => {
    finishRef.current = onFinish;
  }, [onFinish]);

  // The countdown needs `conclude` and `conclude` needs the countdown: the ref breaks the cycle.
  const concludeRef = useRef<(kind: CalibrateEnd) => void>(() => {});
  const countdown = useCountdown(cfg.seconds, () => concludeRef.current("timeout"));
  const conclude = useCallback(
    (kind: CalibrateEnd) => {
      if (finished.current) return;
      finished.current = true;
      ended.set(1);
      countdown.stop();
      const done = kind === "win" ? cfg.locks : lockIdx.value;
      const score = scoreCalibrate(cfg, kind, done, hold.value, overshoots.value, time.value);
      const result = makeResult(score, countdown.startedAt);
      setLocksDone(done);
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

  const onLock = useCallback((done: number) => {
    setLocksDone(done);
    haptic("success");
    sfx("beepGood");
  }, []);
  const onOvershoot = useCallback((left: number) => {
    setFusesLeft(left);
    haptic("warning");
    sfx("beepBad");
  }, []);
  const onNoise = useCallback(() => {
    haptic("impact");
    sfx("zap", { volume: 0.6 });
  }, []);
  const onDetent = useCallback((ring: boolean) => {
    haptic("detent");
    sfx("knobTick", ring ? { rate: 0.8 } : { volume: 0.6, rate: 1.25 });
  }, []);
  const onStop = useCallback(() => {
    haptic("impact");
  }, []);

  useFrameCallback((info) => {
    if (ended.value !== 0) return;
    const dt = Math.min(0.05, (info.timeSincePreviousFrame ?? 16) / 1000);
    const now = time.value + dt;
    time.set(now);
    const i = lockIdx.value;
    const target = cfg.targets[i] + cfg.driftAmp * Math.sin(cfg.driftW * (now - lockStart.value) + cfg.driftPh[i]);
    tgt.set(target);

    let nz = 0;
    for (let s = 0; s < cfg.noiseAt.length; s++) {
      if (now >= cfg.noiseAt[s] && now < cfg.noiseAt[s] + cfg.noiseLen) nz = 1;
    }
    if (noiseOn.value !== nz) {
      noiseOn.set(nz);
      if (nz === 1) scheduleOnRN(onNoise);
    }

    if (debugAuto === "win" || debugAuto === "lose") {
      const goal = debugAuto === "win" ? target : target + cfg.window * 3 * Math.sin(now * 2);
      const step = Math.max(-0.16 * dt, Math.min(0.16 * dt, (goal - x.value) * (debugAuto === "win" ? 2.2 : 12) * dt));
      x.set(x.value + step);
      const turns = step / (cfg.dual ? TURN_FINE : TURN_SINGLE);
      knobA.set(knobA.value + (turns * TAU));
    }

    const err = Math.abs(x.value - target);
    const isIn = err < cfg.window;
    if (isIn) {
      dwell.set(dwell.value + dt);
      hold.set(Math.min(1, hold.value + dt / cfg.hold));
      if (inWin.value === 0) inWin.set(1);
    } else if (hold.value > 0) {
      hold.set(Math.max(0, hold.value - dt / 0.3));
    }
    if (inside.value !== (isIn ? 1 : 0)) inside.set(isIn ? 1 : 0);

    // Leaving the window after really sitting in it is an overshoot; a blind fast sweep is not.
    if (inWin.value === 1 && err > cfg.window * 1.3) {
      inWin.set(0);
      const sat = dwell.value >= 0.12;
      dwell.set(0);
      if (sat) {
        overshoots.set(overshoots.value + 1);
        const left = cfg.fuses - overshoots.value;
        scheduleOnRN(onOvershoot, left);
        if (left <= 0) {
          ended.set(1);
          scheduleOnRN(conclude, "fuses");
          return;
        }
      }
    }

    if (hold.value >= 1) {
      flash.set(withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: reduceMotion ? 0 : 420 })));
      if (i + 1 >= cfg.locks) {
        ended.set(1);
        scheduleOnRN(conclude, "win");
        return;
      }
      lockIdx.set(i + 1);
      lockStart.set(now);
      hold.set(0);
      dwell.set(0);
      inWin.set(0);
      scheduleOnRN(onLock, i + 1);
    }
  });

  useAnimatedReaction(
    () => (noiseOn.value === 1 ? 2 : inside.value),
    (now, prev) => {
      if (now !== prev) scheduleOnRN(setStatus, now);
    },
  );

  const stageH = height - MINI_HUD_HEIGHT;
  const innerW = width - space.sm * 2 - 2;
  const innerH = stageH - space.sm * 2 - 2;
  const scopeH = Math.max(96, Math.min(190, Math.round(innerH * 0.34)));
  const knobTop = space.sm + scopeH + 6 + ROW_H + 6;
  const knobAreaH = innerH - knobTop - space.sm;
  const dial = Math.min(knobAreaH - 22, innerW - 96, 236);
  const fineD = Math.max(60, Math.round(dial * 0.56));
  const cx = innerW / 2;
  const cy = knobAreaH / 2;

  const locked = end !== null || debugAuto !== undefined;
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!locked)
        .minDistance(0)
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        .onBegin((e) => {
          "worklet";
          const dx = e.x - cx;
          const dy = e.y - cy;
          mode.set(cfg.dual && Math.sqrt(dx * dx + dy * dy) > fineD / 2 + 5 ? 2 : 1);
          prevA.set(Math.atan2(dy, dx));
        })
        .onChange((e) => {
          "worklet";
          const dx = e.x - cx;
          const dy = e.y - cy;
          const a = Math.atan2(dy, dx);
          let da = a - prevA.value;
          if (da > Math.PI) da -= TAU;
          else if (da < -Math.PI) da += TAU;
          prevA.set(a);
          // Too close to the hub the angle is noise, not intent.
          if (dx * dx + dy * dy < 144) return;
          const ring = mode.value === 2;
          const per = ring ? TURN_RING : cfg.dual ? TURN_FINE : TURN_SINGLE;
          const next = x.value + (da / TAU) * per;
          if (next < 0 || next > 1) {
            x.set(next < 0 ? 0 : 1);
            if (atStop.value === 0) {
              atStop.set(1);
              scheduleOnRN(onStop);
            }
            return;
          }
          atStop.set(0);
          x.set(next);
          const angle = ring ? ringA : knobA;
          const stepA = (ring ? 15 : cfg.dual ? 20 : 12) * DEG;
          const before = Math.floor(angle.value / stepA);
          angle.set(angle.value + da);
          if (Math.floor(angle.value / stepA) !== before) scheduleOnRN(onDetent, ring);
        })
        .onFinalize(() => {
          "worklet";
          mode.set(0);
        }),
    [locked, cx, cy, fineD, cfg, x, ringA, knobA, mode, prevA, atStop, onDetent, onStop],
  );

  return (
    <View style={{ width, height, backgroundColor: t.body }}>
      <MiniHud title={meta.name} left={countdown.left} score={`${locksDone}/${cfg.locks}`} />
      <MiniStage width={width} height={stageH}>
        <Scope cfg={cfg} width={innerW - space.sm * 2} height={scopeH} x={x} tgt={tgt} time={time} noiseOn={noiseOn} flash={flash} status={status} reduceMotion={reduceMotion} />
        <LockRow cfg={cfg} hold={hold} locksDone={locksDone} fusesLeft={fusesLeft} />
        <GestureDetector gesture={pan}>
          <View testID="calibrate-dial" style={{ position: "absolute", left: 0, top: knobTop, width: innerW, height: knobAreaH }}>
            <Dial cfg={cfg} cx={cx} cy={cy} dial={dial} fineD={fineD} ringA={ringA} knobA={knobA} mode={mode} />
          </View>
        </GestureDetector>
        {end && <EndPlate text={END_TEXT[end]} good={end === "win"} />}
      </MiniStage>
    </View>
  );
}

function Label({ children, color }: { children: string; color: string }) {
  return (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={[type.micro, { color }]}>
      {children}
    </Text>
  );
}

const Scope = memo(function Scope({
  cfg,
  width,
  height,
  x,
  tgt,
  time,
  noiseOn,
  flash,
  status,
  reduceMotion,
}: {
  cfg: CalibrateConfig;
  width: number;
  height: number;
  x: SharedValue<number>;
  tgt: SharedValue<number>;
  time: SharedValue<number>;
  noiseOn: SharedValue<number>;
  flash: SharedValue<number>;
  status: number;
  reduceMotion: boolean;
}) {
  const t = useMiniTheme();
  const meterW = 22;
  const sw = width - 4 - meterW;
  const sh = height - 4;
  const mid = sh / 2;
  const half = sh / 2 - 9;
  const win = cfg.window;

  const ghost = useMemo(() => {
    let s = "";
    for (let k = 0; k <= POINTS; k++) {
      const u = k / POINTS;
      const y = mid - Math.sin(TAU * GHOST_CYCLES * (u - 0.5)) * half;
      s += `${k === 0 ? "M" : "L"}${Math.round(u * sw * 10) / 10} ${Math.round(y * 10) / 10}`;
    }
    return s;
  }, [sw, mid, half]);

  const trace = useAnimatedProps(() => {
    const d = x.value - tgt.value;
    const q = quality(d, win);
    const amp = (0.3 + 0.7 * q) * half;
    const cycles = GHOST_CYCLES * Math.exp(Math.max(-1.2, Math.min(1.2, d * 2.4)));
    const fuzz = Math.pow(1 - q, 1.5) * 0.13 * half + noiseOn.value * 0.6 * half;
    const frame = Math.floor(time.value * (reduceMotion ? 3 : 30));
    let s = "";
    for (let k = 0; k <= POINTS; k++) {
      const u = k / POINTS;
      const ph = TAU * cycles * (u - 0.5);
      let y = Math.sin(ph) * amp + (1 - q) * 0.22 * amp * Math.sin(ph * 3.1 + 1.3);
      y += (hash01(k, frame) - 0.5) * 2 * fuzz;
      if (y > mid - 2) y = mid - 2;
      else if (y < 2 - mid) y = 2 - mid;
      s += (k === 0 ? "M" : "L") + Math.round(u * sw * 10) / 10 + " " + Math.round((mid - y) * 10) / 10;
    }
    return { d: s };
  });

  const meterH = sh - 26;
  const meter = useAnimatedStyle(() => {
    const q = quality(x.value - tgt.value, win);
    const shown = noiseOn.value === 1 ? hash01(7, Math.floor(time.value * (reduceMotion ? 3 : 14))) : q;
    return { transform: [{ translateY: (1 - Math.round(shown * 10) / 10) * meterH }] };
  });
  const glow = useAnimatedStyle(() => ({ opacity: flash.value * 0.55 }));

  const grid = useMemo(() => [1, 2, 3, 4, 5, 6, 7], []);
  const statusText = status === 2 ? TEXT.noise : status === 1 ? TEXT.hold : TEXT.search;
  const statusColor = status === 2 ? t.lcdWarn : status === 1 ? t.mint : palette.teal2;

  return (
    <View style={{ marginTop: space.sm, marginHorizontal: space.sm, width, height, borderRadius: radius.lcd, backgroundColor: t.lcdBg, borderWidth: 2, borderColor: status === 1 ? t.mint : t.keyLo, flexDirection: "row", overflow: "hidden" }}>
      <View style={{ width: sw, height: sh }}>
        <Svg width={sw} height={sh}>
          {grid.map((k) => (
            <Line key={`v${k}`} x1={(k / 8) * sw} y1={0} x2={(k / 8) * sw} y2={sh} stroke={t.lcdDim} strokeWidth={1} />
          ))}
          {[1, 2, 3].map((k) => (
            <Line key={`h${k}`} x1={0} y1={(k / 4) * sh} x2={sw} y2={(k / 4) * sh} stroke={t.lcdDim} strokeWidth={k === 2 ? 1.5 : 1} />
          ))}
          <Path d={ghost} stroke={palette.teal1} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <AnimatedPath animatedProps={trace} stroke={t.lcdOn} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
        <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: palette.mint }, glow]} />
        <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, paddingLeft: 6, paddingRight: 6, paddingVertical: 2, backgroundColor: t.lcdBg, borderBottomRightRadius: radius.lcd, borderRightWidth: 1, borderBottomWidth: 1, borderColor: t.lcdDim }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[type.lcdS, { color: statusColor }]}>
            {tr(statusText)}
          </Text>
        </View>
      </View>
      <View style={{ width: meterW, height: sh, alignItems: "center", borderLeftWidth: 1, borderLeftColor: t.lcdDim, paddingTop: 4 }}>
        <Label color={palette.teal2}>{tr(TEXT.signal)}</Label>
        <View style={{ width: 8, height: meterH, marginTop: 4, borderRadius: 2, backgroundColor: t.lcdDim, overflow: "hidden" }}>
          <Animated.View testID="calibrate-signal" style={[{ width: 8, height: meterH, backgroundColor: t.mint }, meter]} />
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => (
            <View key={k} style={{ position: "absolute", left: 0, right: 0, top: (k / 10) * meterH, height: 1.5, backgroundColor: t.lcdBg }} />
          ))}
        </View>
      </View>
    </View>
  );
});

const LockRow = memo(function LockRow({ cfg, hold, locksDone, fusesLeft }: { cfg: CalibrateConfig; hold: SharedValue<number>; locksDone: number; fusesLeft: number }) {
  const t = useMiniTheme();
  const [barW, setBarW] = useState(0);
  const fill = useAnimatedStyle(() => ({ width: Math.max(0, Math.min(1, hold.value)) * barW }));
  return (
    <View style={{ height: ROW_H, marginTop: 6, marginHorizontal: space.sm, flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <Label color={t.inkDim}>{tr(TEXT.lock)}</Label>
      <View style={{ flexDirection: "row", gap: 3 }}>
        {cfg.targets.map((_, k) => (
          <View key={k} style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: k < locksDone ? t.mint : t.ledOff, borderWidth: 1, borderColor: t.rule }} />
        ))}
      </View>
      <View onLayout={(e) => setBarW(e.nativeEvent.layout.width - 4)} style={{ flex: 1, height: 12, borderRadius: 3, backgroundColor: t.lcdBg, padding: 2 }}>
        <Animated.View style={[{ height: 8, borderRadius: 1.5, backgroundColor: t.mint }, fill]} />
      </View>
      <Label color={t.inkDim}>{tr(TEXT.fuses)}</Label>
      <View style={{ flexDirection: "row", gap: 3 }}>
        {Array.from({ length: cfg.fuses }, (_, k) => (
          <View key={k} style={{ width: 6, height: 11, borderRadius: 2, backgroundColor: k < fusesLeft ? t.yellow : t.ledOff, borderWidth: 1, borderColor: t.rule }} />
        ))}
      </View>
    </View>
  );
});

const Dial = memo(function Dial({
  cfg,
  cx,
  cy,
  dial,
  fineD,
  ringA,
  knobA,
  mode,
}: {
  cfg: CalibrateConfig;
  cx: number;
  cy: number;
  dial: number;
  fineD: number;
  ringA: SharedValue<number>;
  knobA: SharedValue<number>;
  mode: SharedValue<number>;
}) {
  const t = useMiniTheme();
  const r = dial / 2;
  const outer = dial + 20;
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${cfg.dual ? ringA.value : knobA.value}rad` }] }));
  const fineStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${knobA.value}rad` }] }));
  const ringLed = useAnimatedStyle(() => ({ opacity: mode.value === 2 ? 1 : 0.35 }));
  const fineLed = useAnimatedStyle(() => ({ opacity: mode.value === 1 ? 1 : 0.35 }));

  const scale = useMemo(() => Array.from({ length: 36 }, (_, k) => k), []);
  const knurl = useMemo(() => Array.from({ length: 24 }, (_, k) => k), []);
  const fr = fineD / 2;

  return (
    <>
      {/* scale printed on the panel around the dial */}
      <Svg pointerEvents="none" width={outer} height={outer} style={{ position: "absolute", left: cx - outer / 2, top: cy - outer / 2 }}>
        {scale.map((k) => {
          const a = (k / 36) * TAU;
          const major = k % 3 === 0;
          const r0 = r + 3;
          const r1 = r + (major ? 9 : 6);
          return <Line key={k} x1={outer / 2 + Math.cos(a) * r0} y1={outer / 2 + Math.sin(a) * r0} x2={outer / 2 + Math.cos(a) * r1} y2={outer / 2 + Math.sin(a) * r1} stroke={major ? t.ink : t.rule} strokeWidth={major ? 1.5 : 1} />;
        })}
      </Svg>

      <Animated.View pointerEvents="none" style={[{ position: "absolute", left: cx - r, top: cy - r, width: dial, height: dial }, ringStyle]}>
        <View style={{ width: dial, height: dial, borderRadius: r, backgroundColor: t.keyLo }}>
          <View style={{ width: dial, height: dial - 3, borderRadius: r, backgroundColor: t.key, borderWidth: 1, borderColor: t.keyHi }} />
        </View>
        <Svg width={dial} height={dial} style={{ position: "absolute", left: 0, top: 0 }}>
          {knurl.map((k) => {
            const a = (k / 24) * TAU;
            return <Line key={k} x1={r + Math.cos(a) * (r - 4)} y1={r + Math.sin(a) * (r - 4)} x2={r + Math.cos(a) * (r - 10)} y2={r + Math.sin(a) * (r - 10)} stroke={t.keyHi} strokeWidth={2} strokeLinecap="round" />;
          })}
          <Line x1={r} y1={5} x2={r} y2={cfg.dual ? r - fr - 6 : r * 0.55} stroke={cfg.dual ? palette.cobalt2 : t.orange} strokeWidth={4} strokeLinecap="round" />
          {!cfg.dual && <Circle cx={r} cy={r} r={r * 0.34} fill={t.keyHi} />}
        </Svg>
      </Animated.View>

      {cfg.dual && (
        <Animated.View pointerEvents="none" style={[{ position: "absolute", left: cx - fr, top: cy - fr, width: fineD, height: fineD }, fineStyle]}>
          <View style={{ width: fineD, height: fineD, borderRadius: fr, backgroundColor: t.bodyLo }}>
            <View style={{ width: fineD, height: fineD - 3, borderRadius: fr, backgroundColor: t.bodyHi, borderWidth: 1, borderColor: t.rule }} />
          </View>
          <Svg width={fineD} height={fineD} style={{ position: "absolute", left: 0, top: 0 }}>
            <Line x1={fr} y1={5} x2={fr} y2={fr * 0.62} stroke={t.orange} strokeWidth={4} strokeLinecap="round" />
            <Circle cx={fr} cy={fr} r={3} fill={t.rule} />
          </Svg>
        </Animated.View>
      )}

      <View pointerEvents="none" style={{ position: "absolute", left: space.sm, bottom: 0, flexDirection: "row", alignItems: "center", gap: space.xs }}>
        <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: cfg.dual ? palette.cobalt2 : t.orange }, cfg.dual ? ringLed : fineLed]} />
        <Label color={t.inkDim}>{tr(cfg.dual ? TEXT.coarse : TEXT.tune)}</Label>
      </View>
      {cfg.dual && (
        <View pointerEvents="none" style={{ position: "absolute", right: space.sm, bottom: 0, flexDirection: "row", alignItems: "center", gap: space.xs }}>
          <Label color={t.inkDim}>{tr(TEXT.fine)}</Label>
          <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.orange }, fineLed]} />
        </View>
      )}
    </>
  );
});

function EndPlate({ text, good }: { text: L10n; good: boolean }) {
  const t = useMiniTheme();
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

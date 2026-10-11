// Rhythm repair: a 16-step sequencer row with a playhead. Tap as the playhead crosses lit steps.
// Everything is derived from performance.now() on the UI thread (playhead, judging, metronome),
// so the game cannot drift; React state changes only once per tap, beat or bar.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, ReduceMotion, cancelAnimation, makeMutable, useAnimatedStyle, useFrameCallback, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import type { L10n } from "@/engine/types";
import { tr } from "@/i18n";
import { MAX_FONT_SCALE, palette, radius, space, type } from "@/ui/theme";

import { mgPublish } from "../host/debug";
import { MINI_HUD_HEIGHT, MiniHud, MiniStage, haptic, sfx, useCountdown, useMiniTheme } from "../shared";
import { makeResult, type MinigameMeta, type MinigameProps } from "../types";
import { STEPS, buildSong, songMs, type Song } from "./pattern";

export const meta: MinigameMeta = {
  id: "rhythm",
  name: { cs: "Oprava rytmu", en: "Rhythm repair" },
  hint: {
    cs: "Ťukni pokaždé, když běžec přejede rozsvícený krok. Drž se metronomu.",
    en: "Tap every time the playhead crosses a lit step. Stay with the metronome.",
  },
  icon: "mg_rhythm",
  seconds: [Math.round(songMs(1) / 1000), Math.round(songMs(2) / 1000), Math.round(songMs(3) / 1000)],
};

// Judgement codes shared between the worklets and the JS tally.
const PERFECT = 1;
const GOOD = 2;
const MISS = 3;
const STRAY = 4;
const GOOD_VALUE = 0.6;
const STRAY_COST = 0.5;
const LCD_H = 48;
const never = ReduceMotion.Never;

// A touch reaches the app a little after the finger lands (digitizer scan + event delivery), so
// taps are judged slightly earlier than they arrive. Browser pointer events need no correction.
const INPUT_LAG_MS = Platform.OS === "web" ? 0 : 25;

/** The one clock everything is measured against (UI thread). */
function nowMs(): number {
  "worklet";
  return performance.now();
}

const L_READY: L10n = { cs: "PŘIPRAV SE", en: "GET READY" };
const L_PERFECT: L10n = { cs: "PŘESNĚ", en: "PERFECT" };
const L_EARLY: L10n = { cs: "BRZY", en: "EARLY" };
const L_LATE: L10n = { cs: "POZDĚ", en: "LATE" };
const L_MISS: L10n = { cs: "VEDLE", en: "MISSED" };
const L_STRAY: L10n = { cs: "NAVÍC", en: "EXTRA" };
const L_BAR: L10n = { cs: "TAKT", en: "BAR" };
const L_TAP: L10n = { cs: "ŤUKEJ", en: "TAP" };

interface CoreProps {
  song: Song;
  w: number;
  h: number;
  reduceMotion: boolean;
  ended: SharedValue<number>;
  beat: SharedValue<number>;
  downbeat: SharedValue<number>;
  onJudge(kind: number, deltaMs: number): void;
  onBeat(bar: number, beat: number): void;
  onClock(t0: number): void;
}

const StepPad = memo(function StepPad({ i, x, w, h, lit, fx, cur }: { i: number; x: number; w: number; h: number; lit: SharedValue<number>; fx: SharedValue<number>; cur: SharedValue<number> }) {
  const t = useMiniTheme();
  const lens = useAnimatedStyle(() => {
    const f = fx.value;
    const on = cur.value === i;
    return {
      backgroundColor: f === PERFECT ? palette.mint : f === GOOD ? palette.yellow : f === MISS ? palette.red1 : lit.value ? palette.orange : on ? palette.steel3 : palette.steel0,
      opacity: f || lit.value ? 1 : on ? 0.95 : 0.8,
    };
  });
  const frame = useAnimatedStyle(() => ({ borderColor: cur.value === i ? palette.bone2 : "transparent" }));
  return (
    <Animated.View style={[{ position: "absolute", left: x, top: 0, width: w, height: h, borderRadius: 4, backgroundColor: t.key, borderWidth: 1.5, padding: 2 }, frame]}>
      <Animated.View style={[{ flex: 1, borderRadius: 2 }, lens]} />
      {/* Quarter-note steps carry a notch, like the beat marks on a hardware sequencer. */}
      {i % 4 === 0 && <View style={{ position: "absolute", bottom: 4, left: w / 2 - 2.5, width: 3, height: 3, borderRadius: 2, backgroundColor: "rgba(0,0,0,0.45)" }} />}
    </Animated.View>
  );
});

const RhythmCore = memo(function RhythmCore({ song, w, h, reduceMotion, ended, beat, downbeat, onJudge, onBeat, onClock }: CoreProps) {
  const t = useMiniTheme();
  const { stepMs, leadMs, bars, perfectMs, goodMs, patterns, noteTime, notePad } = song;
  const notes = noteTime.length;
  const lit = useMemo(() => patterns[0].map((v) => makeMutable(v)), [patterns]);
  const fxs = useMemo(() => patterns[0].map(() => makeMutable(0)), [patterns]);
  useEffect(
    () => () => {
      for (const m of fxs) cancelAnimation(m);
    },
    [fxs],
  );

  const t0 = useSharedValue(-1);
  const pos = useSharedValue(-STEPS);
  const gstep = useSharedValue(-99999);
  const cur = useSharedValue(-1);
  const cursor = useSharedValue(0);
  const press = useSharedValue(0);
  const ring = useSharedValue(0);
  const ringKind = useSharedValue(0);

  const padPitch = (w - 20) / STEPS;
  const padW = padPitch - 3;
  const padH = Math.max(48, Math.min(72, Math.round(h * 0.22)));
  const rowTop = 24;
  const bigTop = rowTop + padH + 16;
  const bigH = h - bigTop - 10;

  useFrameCallback(() => {
    if (ended.value) return;
    const now = nowMs();
    if (t0.value < 0) {
      t0.set(now);
      scheduleOnRN(onClock, now);
    }
    const t1 = now - t0.value - leadMs;
    const p = t1 / stepMs;
    pos.set(p);
    const g = Math.floor(p + 0.5);
    if (g !== gstep.value) {
      gstep.set(g);
      const s = ((g % STEPS) + STEPS) % STEPS;
      const b = Math.floor(g / STEPS);
      cur.set(s);
      // The pad two steps behind the playhead switches to what it will be on its next pass, so
      // the next bar is always readable ahead of time.
      const j = (s + STEPS - 2) % STEPS;
      const nb = s >= 2 ? b + 1 : b;
      if (nb >= 0) {
        lit[j].set(nb < bars ? patterns[nb][j] : 0);
        fxs[j].set(0);
      }
      if (s % 4 === 0) {
        downbeat.set(s === 0 ? 1 : 0);
        beat.set(1);
        beat.set(withTiming(0, { duration: 170, reduceMotion: never }));
        scheduleOnRN(onBeat, b, s / 4);
      }
    }
    let c = cursor.value;
    while (c < notes && t1 - noteTime[c] > goodMs) {
      fxs[notePad[c]].set(MISS);
      c++;
      scheduleOnRN(onJudge, MISS, 0);
    }
    if (c !== cursor.value) cursor.set(c);
  });

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(60000)
        .onTouchesDown(() => {
          "worklet";
          if (ended.value || t0.value < 0) return;
          press.set(1);
          press.set(withTiming(0, { duration: 110, reduceMotion: never }));
          const t1 = nowMs() - INPUT_LAG_MS - t0.value - leadMs;
          // Tapping along with the count-in is free.
          if (notes === 0 || t1 < noteTime[0] - 2 * stepMs) return;
          let c = cursor.value;
          while (c < notes && t1 - noteTime[c] > goodMs) {
            fxs[notePad[c]].set(MISS);
            c++;
            scheduleOnRN(onJudge, MISS, 0);
          }
          let kind = STRAY;
          let delta = 0;
          if (c < notes && Math.abs(t1 - noteTime[c]) <= goodMs) {
            delta = t1 - noteTime[c];
            kind = Math.abs(delta) <= perfectMs ? PERFECT : GOOD;
            fxs[notePad[c]].set(kind);
            c++;
          }
          cursor.set(c);
          ringKind.set(kind);
          ring.set(0);
          ring.set(withTiming(1, { duration: 260, easing: Easing.out(Easing.quad), reduceMotion: never }));
          scheduleOnRN(onJudge, kind, delta);
        }),
    [cursor, ended, fxs, goodMs, leadMs, noteTime, notePad, notes, onJudge, perfectMs, press, ring, ringKind, stepMs, t0],
  );

  const headStyle = useAnimatedStyle(() => {
    let ph = ((pos.value % STEPS) + STEPS) % STEPS;
    // The last half step belongs to the approach of step 0, so the line re-enters from the left.
    if (ph >= STEPS - 0.5) ph -= STEPS;
    return { transform: [{ translateX: 10 + (ph + 0.5) * padPitch - 1.5 }] };
  });
  const bigStyle = useAnimatedStyle(() => ({ transform: [{ translateY: press.value * 4 }] }));
  const ringStyle = useAnimatedStyle(() => {
    const k = ringKind.value;
    return {
      opacity: ring.value <= 0 || ring.value >= 1 ? 0 : 1 - ring.value,
      borderColor: k === PERFECT ? palette.bone2 : k === GOOD ? palette.yellow : palette.red1,
      transform: [{ scale: reduceMotion ? 1 : 0.6 + ring.value * 0.9 }],
    };
  });
  const ringSize = Math.min(bigH - 24, 120);

  return (
    <GestureDetector gesture={tap}>
      <View testID="rhythm-pad" style={{ width: w, height: h }}>
        <View style={{ position: "absolute", left: 10, top: 6, width: w - 20, height: 14, flexDirection: "row", pointerEvents: "none" }}>
          {[1, 2, 3, 4].map((b) => (
            <Text key={b} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[type.micro, { width: padPitch * 4, color: t.inkDim, paddingLeft: 2 }]}>
              {b}
            </Text>
          ))}
        </View>
        <View style={{ position: "absolute", left: 10, top: rowTop, width: w - 20, height: padH, pointerEvents: "none" }}>
          {lit.map((m, i) => (
            <StepPad key={i} i={i} x={i * padPitch + 1.5} w={padW} h={padH} lit={m} fx={fxs[i]} cur={cur} />
          ))}
        </View>
        <Animated.View style={[{ position: "absolute", left: 0, top: rowTop - 6, width: 3, height: padH + 12, borderRadius: 2, backgroundColor: palette.bone2, borderWidth: 0.5, borderColor: "rgba(0,0,0,0.5)", pointerEvents: "none" }, headStyle]} />
        <View style={{ position: "absolute", left: 10, top: bigTop, width: w - 20, height: bigH, borderRadius: radius.key + 3, backgroundColor: t.keyLo, paddingBottom: 4, pointerEvents: "none" }}>
          <Animated.View style={[{ flex: 1, borderRadius: radius.key + 3, backgroundColor: t.orange, alignItems: "center", justifyContent: "center", borderTopWidth: 2, borderTopColor: palette.amber }, bigStyle]}>
            <Animated.View style={[{ position: "absolute", width: ringSize, height: ringSize, borderRadius: ringSize / 2, borderWidth: 5 }, ringStyle]} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[type.title, { color: "#15171C", letterSpacing: 2 }]}>
              {tr(L_TAP)}
            </Text>
          </Animated.View>
        </View>
      </View>
    </GestureDetector>
  );
});

const Lcd = memo(function Lcd({ bpm, text, warn, bar, bars, beat, downbeat }: { bpm: number; text: string; warn: boolean; bar: number; bars: number; beat: SharedValue<number>; downbeat: SharedValue<number> }) {
  const t = useMiniTheme();
  const led = useAnimatedStyle(() => ({
    backgroundColor: downbeat.value ? palette.orange : palette.mint,
    opacity: 0.18 + 0.82 * beat.value,
  }));
  return (
    <View style={{ height: LCD_H, padding: space.xs, backgroundColor: t.body, borderBottomWidth: 1, borderBottomColor: t.rule }}>
      <View style={{ flex: 1, borderRadius: radius.lcd, backgroundColor: t.lcdBg, flexDirection: "row", alignItems: "center", paddingHorizontal: space.sm, gap: space.sm }}>
        <View style={{ width: 62 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[type.micro, { color: t.lcdOn, opacity: 0.6 }]}>
            BPM
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[type.lcdM, { color: t.lcdOn, lineHeight: 18 }]}>
            {bpm}
          </Text>
        </View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={[type.lcdL, { flex: 1, textAlign: "center", color: warn ? t.lcdWarn : t.lcdOn }]}>
          {text}
        </Text>
        <View style={{ width: 62, alignItems: "flex-end" }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[type.micro, { color: t.lcdOn, opacity: 0.6 }]}>
            {tr(L_BAR)}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Animated.View style={[{ width: 8, height: 8, borderRadius: 4 }, led]} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[type.lcdM, { color: t.lcdOn, lineHeight: 18 }]}>
              {Math.max(0, Math.min(bars, bar))}/{bars}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
});

export default function Rhythm({ tier, seed, width, height, reduceMotion, onFinish }: MinigameProps) {
  const stageH = height - MINI_HUD_HEIGHT;
  const iw = width - 18;
  const ch = stageH - 18 - LCD_H;
  const song = useMemo(() => buildSong(seed, tier), [seed, tier]);
  const notes = song.noteTime.length;

  const [lcd, setLcd] = useState<{ text: string; warn: boolean }>({ text: tr(L_READY), warn: false });
  const [bar, setBar] = useState(0);
  const [acc, setAcc] = useState(0);
  const tally = useRef({ perfect: 0, good: 0, miss: 0, stray: 0 });
  const done = useRef(false);
  const ended = useSharedValue(0);
  const beat = useSharedValue(0);
  const downbeat = useSharedValue(0);

  // The song length is the time limit: the run always ends when the last bar has played out.
  const finishRef = useRef<() => void>(() => {});
  const clock = useCountdown(song.totalMs / 1000, () => finishRef.current());
  useEffect(() => {
    finishRef.current = () => {
      if (done.current) return;
      done.current = true;
      ended.set(1);
      const c = tally.current;
      const score = notes === 0 ? 0 : (c.perfect + GOOD_VALUE * c.good - STRAY_COST * c.stray) / notes;
      onFinish(makeResult(score, clock.startedAt));
    };
  });

  const onJudge = useCallback(
    (kind: number, deltaMs: number) => {
      if (done.current) return;
      const c = tally.current;
      if (kind === PERFECT) {
        c.perfect++;
        haptic("impact");
        sfx("stepHit", { rate: 1.06 });
        setLcd({ text: tr(L_PERFECT), warn: false });
      } else if (kind === GOOD) {
        c.good++;
        haptic("tap");
        sfx("stepHit", { rate: 0.94, volume: 0.8 });
        setLcd({ text: tr(deltaMs < 0 ? L_EARLY : L_LATE), warn: false });
      } else if (kind === MISS) {
        c.miss++;
        haptic("warning");
        sfx("stepMiss");
        setLcd({ text: tr(L_MISS), warn: true });
      } else {
        c.stray++;
        sfx("stepMiss", { volume: 0.6 });
        setLcd({ text: tr(L_STRAY), warn: true });
      }
      const judged = c.perfect + c.good + c.miss;
      const raw = judged === 0 ? 0 : (c.perfect + GOOD_VALUE * c.good - STRAY_COST * c.stray) / judged;
      setAcc(Math.round(Math.max(0, Math.min(1, raw)) * 100));
    },
    [],
  );
  const onBeat = useCallback(
    (b: number, q: number) => {
      if (done.current) return;
      haptic("detent");
      sfx("knobTick", { volume: q === 0 ? 0.7 : 0.4 });
      if (b < 0) setLcd({ text: String(4 - q), warn: false });
      else if (q === 0 && b < song.bars) setBar(b + 1);
    },
    [song.bars],
  );
  const onClock = useCallback(
    (t0: number) => {
      mgPublish("rhythm", {
        // Epoch time of bar 0, step 0, so a test can schedule taps on the wall clock.
        epoch0: Date.now() - (performance.now() - t0) + song.leadMs,
        noteTime: song.noteTime,
        stepMs: song.stepMs,
        goodMs: song.goodMs,
        perfectMs: song.perfectMs,
        totalMs: song.totalMs,
      });
    },
    [song],
  );

  return (
    <View style={{ width, height }}>
      <MiniHud title={meta.name} left={clock.left} score={`${acc}%`} />
      <MiniStage width={width} height={stageH}>
        <Lcd bpm={song.bpm} text={lcd.text} warn={lcd.warn} bar={bar} bars={song.bars} beat={beat} downbeat={downbeat} />
        <RhythmCore song={song} w={iw} h={ch} reduceMotion={reduceMotion} ended={ended} beat={beat} downbeat={downbeat} onJudge={onJudge} onBeat={onBeat} onClock={onClock} />
      </MiniStage>
    </View>
  );
}

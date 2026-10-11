// Duct-tape patching: cracks open on a hull section and vent air. A swipe lays a strip of tape
// along the finger's path; a strip that runs along a crack and is long enough seals it, a short or
// crooked one only covers part of it and the rest keeps hissing. Leak state, pressure, the strip
// pool and every particle run on shared values; React only hears about spawns, seals and the end.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { makeMutable, useAnimatedReaction, useAnimatedStyle, useFrameCallback, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import type { L10n } from "@/engine/types";
import { tr } from "@/i18n";
import { MAX_FONT_SCALE, palette, radius, space, type } from "@/ui/theme";

import { MINI_HUD_HEIGHT, MiniHud, MiniStage, haptic, sfx, useCountdown, useMiniTheme } from "../shared";
import { makeResult, type MinigameMeta, type MinigameProps } from "../types";
import { FULL_MASK, MAX_SEV, MIN_SWIPE, OVERHANG, PT_PER_CM, SAMPLES, SECONDS, TAPE_W, bitCount, coverMask, makeTapeConfig, scoreTape, type LeakDef, type TapeEnd } from "./config";

export const meta: MinigameMeta = {
  id: "tape",
  name: { cs: "Lepení trhlin", en: "Tape patching" },
  hint: {
    cs: "Přejeď prstem podél trhliny a přelep ji páskou. Kdo lepí ledabyle, lepí dvakrát.",
    en: "Swipe along each crack to tape it shut. Sloppy strips need a second wrap.",
  },
  icon: "mg_tape",
  seconds: SECONDS,
};

const TEXT = {
  pressure: { cs: "TLAK", en: "PRESSURE" },
  tapeUsed: { cs: "PÁSKA", en: "TAPE" },
  tapeLeft: { cs: "ZBÝVÁ", en: "LEFT" },
  stencil: { cs: "SEKCE 7-B · NEOPÍRAT SE", en: "SECTION 7-B · DO NOT LEAN" },
  win: { cs: "UTĚSNĚNO", en: "AIRTIGHT" },
  vented: { cs: "SEKCE BEZ VZDUCHU", en: "SECTION VENTED" },
  noTape: { cs: "DOŠLA PÁSKA", en: "OUT OF TAPE" },
  timeout: { cs: "ČAS VYPRŠEL", en: "OUT OF TIME" },
} satisfies Record<string, L10n>;
const END_TEXT: Record<TapeEnd, L10n> = { win: TEXT.win, vented: TEXT.vented, noTape: TEXT.noTape, timeout: TEXT.timeout };

export type TapeDebugAuto = "win" | "lose" | "idle";
type Props = MinigameProps & { debugAuto?: TapeDebugAuto };

const STRIP_H = 36;
const POOL = 18;
const PARTICLES = 8;
const END_HOLD_MS = 750;
const UNMOUNT_MS = 520;

interface Sim {
  /** 0 not spawned, 1 open, 2 sealed. */
  st: SharedValue<number>[];
  mask: SharedValue<number>[];
  sev: SharedValue<number>[];
  px: SharedValue<number>[];
  py: SharedValue<number>[];
  pop: SharedValue<number>[];
  /** Strip pool: start point, angle, length, opacity. */
  sx: SharedValue<number>[];
  sy: SharedValue<number>[];
  sa: SharedValue<number>[];
  sl: SharedValue<number>[];
  so: SharedValue<number>[];
}

const many = (n: number, v: number): SharedValue<number>[] => Array.from({ length: n }, () => makeMutable(v));

export default function TapeGame({ tier, seed, width, height, reduceMotion, onFinish, debugAuto }: Props) {
  const t = useMiniTheme();
  const stageH = height - MINI_HUD_HEIGHT;
  const innerW = width - space.sm * 2 - 2;
  const innerH = stageH - space.sm * 2 - 2;
  const hullW = innerW;
  const hullH = innerH - STRIP_H;
  const cfg = useMemo(() => makeTapeConfig(tier, seed, hullW, hullH), [tier, seed, hullW, hullH]);
  const n = cfg.leaks.length;

  const [sim] = useState<Sim>(() => ({
    st: many(n, 0),
    mask: many(n, 0),
    sev: many(n, 1),
    px: cfg.leaks.map((l) => makeMutable(l.x)),
    py: cfg.leaks.map((l) => makeMutable(l.y)),
    pop: many(n, 0),
    sx: many(POOL, 0),
    sy: many(POOL, 0),
    sa: many(POOL, 0),
    sl: many(POOL, 0),
    so: many(POOL, 0),
  }));

  const time = useSharedValue(0);
  const spawnClock = useSharedValue(0);
  const nextSpawn = useSharedValue(0);
  const pressure = useSharedValue(1);
  const sealedN = useSharedValue(0);
  const used = useSharedValue(0);
  const idealUsed = useSharedValue(0);
  const ended = useSharedValue(0);
  const slot = useSharedValue(0);
  const drawing = useSharedValue(-1);
  const drawTick = useSharedValue(0);
  const botT = useSharedValue(0);
  const botStage = useSharedValue(0);
  const hiss = useSharedValue(0);

  const [mounted, setMounted] = useState<number[]>([]);
  const [sealed, setSealed] = useState(0);
  const [tapePt, setTapePt] = useState(0);
  const [end, setEnd] = useState<TapeEnd | null>(null);

  const finished = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const finishRef = useRef(onFinish);
  useEffect(() => {
    finishRef.current = onFinish;
  }, [onFinish]);

  // The countdown needs `conclude` and `conclude` needs the countdown: the ref breaks the cycle.
  const concludeRef = useRef<(kind: TapeEnd) => void>(() => {});
  const countdown = useCountdown(cfg.seconds, () => concludeRef.current("timeout"));
  const conclude = useCallback(
    (kind: TapeEnd) => {
      if (finished.current) return;
      finished.current = true;
      ended.set(1);
      countdown.stop();
      const score = scoreTape(cfg, kind, pressure.value, sealedN.value, used.value, idealUsed.value);
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
      else timers.current.push(setTimeout(() => finishRef.current(result), END_HOLD_MS));
    },
    // `countdown.stop` and `startedAt` only touch refs inside the hook, so the first render's copy stays valid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfg],
  );
  useEffect(() => {
    concludeRef.current = conclude;
  }, [conclude]);
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

  const onSpawn = useCallback((i: number) => {
    setMounted((list) => (list.includes(i) ? list : [...list, i]));
    haptic("warning");
    sfx("alert", { volume: 0.5 });
  }, []);
  /** quality: 0 the strip missed everything, 1 partial cover, 2 at least one leak sealed. */
  const onWrap = useCallback((quality: number, sealedNow: number, usedPt: number, closed: number) => {
    setTapePt(usedPt);
    setSealed(sealedNow);
    if (quality === 2) {
      haptic("heavy");
      sfx("tape");
    } else if (quality === 1) {
      haptic("impact");
      sfx("tape", { volume: 0.6, rate: 1.3 });
    } else {
      haptic("tap");
      sfx("tape", { volume: 0.3, rate: 1.5 });
    }
    if (closed >= 0) timers.current.push(setTimeout(() => setMounted((list) => list.filter((k) => k !== closed)), UNMOUNT_MS));
  }, []);
  const onPeel = useCallback(() => {
    haptic("detent");
  }, []);
  const onHiss = useCallback(() => {
    haptic("tap");
  }, []);

  /** Scores a laid strip a-b against every open leak. Runs on the UI thread. */
  const commit = (ax: number, ay: number, bx: number, by: number): void => {
    "worklet";
    const len = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
    used.set(used.value + len);
    let best = 0;
    let closed = -1;
    for (let i = 0; i < nextSpawn.value; i++) {
      if (sim.st[i].value !== 1) continue;
      const leak = cfg.leaks[i];
      const m = coverMask(sim.px[i].value, sim.py[i].value, leak.angle, leak.len, ax, ay, bx, by);
      if (m === 0) continue;
      const merged = bitCount(m) >= SAMPLES - 1 ? FULL_MASK : sim.mask[i].value | m;
      sim.mask[i].set(merged);
      if (merged === FULL_MASK) {
        sim.st[i].set(2);
        sealedN.set(sealedN.value + 1);
        idealUsed.set(idealUsed.value + (leak.len + OVERHANG * 2));
        sim.pop[i].set(0);
        sim.pop[i].set(withTiming(1, { duration: reduceMotion ? 0 : 420 }));
        best = 2;
        closed = i;
      } else if (best < 1) best = 1;
    }
    scheduleOnRN(onWrap, best, sealedN.value, used.value, closed);
    if (cfg.budget > 0 && cfg.budget - used.value < MIN_SWIPE && sealedN.value < n) {
      ended.set(1);
      scheduleOnRN(conclude, "noTape");
    }
  };

  const layStrip = (ax: number, ay: number, bx: number, by: number): void => {
    "worklet";
    const k = slot.value;
    slot.set((k + 1) % POOL);
    sim.sx[k].set(ax);
    sim.sy[k].set(ay);
    sim.sa[k].set(Math.atan2(by - ay, bx - ax));
    sim.sl[k].set(Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)));
    sim.so[k].set(1);
    commit(ax, ay, bx, by);
  };

  useFrameCallback((info) => {
    if (ended.value !== 0) return;
    const dt = Math.min(0.05, (info.timeSincePreviousFrame ?? 16) / 1000);
    const now = time.value + dt;
    time.set(now);
    spawnClock.set(spawnClock.value + dt);

    while (nextSpawn.value < n && spawnClock.value >= cfg.leaks[nextSpawn.value].spawnAt) {
      const k = nextSpawn.value;
      sim.st[k].set(1);
      nextSpawn.set(k + 1);
      scheduleOnRN(onSpawn, k);
    }

    let open = 0;
    let drain = 0;
    for (let i = 0; i < nextSpawn.value; i++) {
      if (sim.st[i].value !== 1) continue;
      open++;
      const leak = cfg.leaks[i];
      const sv = Math.min(MAX_SEV, sim.sev[i].value + cfg.growth * dt);
      sim.sev[i].set(sv);
      drain += cfg.drain * sv * (1 - bitCount(sim.mask[i].value) / SAMPLES);
      if (leak.moveAmp > 0) {
        const o = leak.moveAmp * Math.sin(leak.moveW * now + leak.movePh);
        sim.px[i].set(leak.x + Math.cos(leak.moveDir) * o);
        sim.py[i].set(leak.y + Math.sin(leak.moveDir) * o);
      }
    }

    if (open === 0) {
      if (nextSpawn.value >= n) {
        ended.set(1);
        scheduleOnRN(conclude, "win");
        return;
      }
      // Nothing to do: bring the next leak forward instead of making the player wait.
      const due = cfg.leaks[nextSpawn.value].spawnAt - 0.6;
      if (spawnClock.value < due) spawnClock.set(due);
    } else {
      pressure.set(Math.max(0, pressure.value - drain * dt));
      if (pressure.value <= 0) {
        ended.set(1);
        scheduleOnRN(conclude, "vented");
        return;
      }
      hiss.set(hiss.value + (dt * open));
      if (hiss.value > 1.6) {
        hiss.set(0);
        scheduleOnRN(onHiss);
      }
    }

    if (debugAuto === "win" || debugAuto === "idle") {
      botT.set(botT.value + dt);
      if (botT.value > 1.25) {
        botT.set(0);
        for (let i = 0; i < nextSpawn.value; i++) {
          if (sim.st[i].value !== 1) continue;
          const leak = cfg.leaks[i];
          const ux = Math.cos(leak.angle);
          const uy = Math.sin(leak.angle);
          const cx = sim.px[i].value;
          const cy = sim.py[i].value;
          const h = leak.len / 2 + OVERHANG;
          if (debugAuto === "idle" && i === 0) {
            // The timeout bot leaves the first leak four-fifths covered so it never finishes.
            if (botStage.value === 0) {
              botStage.set(1);
              layStrip(cx - ux * h, cy - uy * h, cx - ux * 4, cy - uy * 4);
              break;
            }
            if (botStage.value === 1) {
              botStage.set(2);
              const o = leak.len * 0.25 - 6;
              layStrip(cx + ux * o + uy * 20, cy + uy * o - ux * 20, cx + ux * o - uy * 20, cy + uy * o + ux * 20);
              break;
            }
            continue;
          }
          layStrip(cx - ux * h, cy - uy * h, cx + ux * h, cy + uy * h);
          break;
        }
      }
    }
  });

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
          if (ended.value !== 0) return;
          const k = slot.value;
          drawing.set(k);
          drawTick.set(0);
          sim.sx[k].set(e.x);
          sim.sy[k].set(e.y);
          sim.sl[k].set(0);
          sim.so[k].set(0.8);
        })
        .onChange((e) => {
          "worklet";
          const k = drawing.value;
          if (k < 0) return;
          const dx = e.x - sim.sx[k].value;
          const dy = e.y - sim.sy[k].value;
          let len = Math.sqrt(dx * dx + dy * dy);
          if (cfg.budget > 0) len = Math.min(len, Math.max(0, cfg.budget - used.value));
          sim.sl[k].set(len);
          if (len > 6) sim.sa[k].set(Math.atan2(dy, dx));
          const tick = Math.floor(len / 26);
          if (tick !== drawTick.value) {
            drawTick.set(tick);
            scheduleOnRN(onPeel);
          }
        })
        // False positive: the handler runs on a touch, never during render (it reaches timers via `commit`).
        // eslint-disable-next-line react-hooks/refs
        .onFinalize(() => {
          "worklet";
          const k = drawing.value;
          if (k < 0) return;
          drawing.set(-1);
          const len = sim.sl[k].value;
          if (len < MIN_SWIPE || ended.value !== 0) {
            sim.so[k].set(withTiming(0, { duration: 120 }));
            return;
          }
          sim.so[k].set(1);
          slot.set((k + 1) % POOL);
          const a = sim.sa[k].value;
          const ax = sim.sx[k].value;
          const ay = sim.sy[k].value;
          commit(ax, ay, ax + Math.cos(a) * len, ay + Math.sin(a) * len);
        }),
    // `commit` only closes over stable shared values and the config.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locked, cfg, sim],
  );

  const tapeText = cfg.budget > 0 ? `${Math.max(0, Math.round((cfg.budget - tapePt) / PT_PER_CM))} cm` : `${Math.round(tapePt / PT_PER_CM)} cm`;
  const tapeLow = cfg.budget > 0 && cfg.budget - tapePt < cfg.budget * 0.2;
  const strips = useMemo(() => Array.from({ length: POOL }, (_, k) => k), []);

  return (
    <View style={{ width, height, backgroundColor: t.body }}>
      <MiniHud title={meta.name} left={countdown.left} score={`${sealed}/${n}`} />
      <MiniStage width={width} height={stageH} dark>
        <TopStrip pressure={pressure} label={tr(cfg.budget > 0 ? TEXT.tapeLeft : TEXT.tapeUsed)} tapeText={tapeText} tapeLow={tapeLow} />
        <GestureDetector gesture={pan}>
          <View testID="tape-hull" style={{ width: hullW, height: hullH, overflow: "hidden" }}>
            <Hull width={hullW} height={hullH} seed={seed} />
            {mounted.map((i) => (
              <Crack key={`c${i}`} i={i} leak={cfg.leaks[i]} sim={sim} />
            ))}
            {strips.map((k) => (
              <Strip key={k} k={k} sim={sim} />
            ))}
            {mounted.map((i) => (
              <Jet key={`j${i}`} i={i} leak={cfg.leaks[i]} sim={sim} time={time} still={reduceMotion} />
            ))}
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

const TopStrip = memo(function TopStrip({ pressure, label, tapeText, tapeLow }: { pressure: SharedValue<number>; label: string; tapeText: string; tapeLow: boolean }) {
  const t = useMiniTheme();
  const [barW, setBarW] = useState(0);
  const fill = useAnimatedStyle(() => {
    const p = pressure.value;
    return { width: Math.ceil(p * 20) / 20 * barW, backgroundColor: p > 0.5 ? palette.mint : p > 0.25 ? palette.yellow : palette.red1 };
  });
  const [pct, setPct] = useState(100);
  useAnimatedReaction(
    () => Math.ceil(pressure.value * 100),
    (now, prev) => {
      if (now !== prev) scheduleOnRN(setPct, now);
    },
  );
  const marks = useMemo(() => Array.from({ length: 19 }, (_, k) => k + 1), []);
  return (
    <View style={{ height: STRIP_H, paddingHorizontal: space.sm, flexDirection: "row", alignItems: "center", gap: space.sm, borderBottomWidth: 1, borderBottomColor: palette.steel1 }}>
      <Label color={palette.steel3}>{tr(TEXT.pressure)}</Label>
      <View onLayout={(e) => setBarW(e.nativeEvent.layout.width)} style={{ flex: 1, height: 10, borderRadius: 2, backgroundColor: t.lcdDim, overflow: "hidden" }}>
        <Animated.View style={[{ height: 10 }, fill]} />
        {marks.map((k) => (
          <View key={k} style={{ position: "absolute", top: 0, bottom: 0, left: (k / 20) * barW - 1, width: 2, backgroundColor: t.lcdBg }} />
        ))}
      </View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[type.lcdS, { color: pct > 25 ? t.lcdOn : t.lcdWarn, width: 36, textAlign: "right" }]}>
        {`${pct}%`}
      </Text>
      <View style={{ width: 1, height: 18, backgroundColor: palette.steel1 }} />
      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: palette.steel3, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.lcdBg }} />
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Label color={palette.steel3}>{label}</Label>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[type.lcdS, { color: tapeLow ? t.lcdWarn : t.lcdOn, minWidth: 52, textAlign: "right" }]}>
          {tapeText}
        </Text>
      </View>
    </View>
  );
});

/** Static hull plating: seams, rivets and a stencil. One SVG, never re-rendered. */
const Hull = memo(function Hull({ width, height, seed }: { width: number; height: number; seed: number }) {
  const rows = height > 360 ? 4 : 3;
  const rowH = height / rows;
  const seams: { x: number; row: number }[] = [];
  for (let r = 0; r < rows; r++) {
    const shift = ((seed + r) % 3) * 0.11;
    seams.push({ x: width * (0.3 + shift), row: r }, { x: width * (0.72 + shift * 0.6), row: r });
  }
  const rivets: { x: number; y: number }[] = [];
  for (let r = 0; r <= rows; r++) {
    const y = Math.min(height - 7, Math.max(7, r * rowH + (r === 0 ? 7 : r === rows ? -7 : 7)));
    for (let x = 14; x < width - 8; x += 28) rivets.push({ x, y });
  }
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width, height, backgroundColor: palette.steel0 }}>
      <Svg width={width} height={height}>
        {Array.from({ length: rows }, (_, r) => (
          <Rect key={`p${r}`} x={0} y={r * rowH} width={width} height={rowH} fill={palette.void3} opacity={r % 2 === 0 ? 0 : 0.3} />
        ))}
        {Array.from({ length: rows - 1 }, (_, r) => (
          <Line key={`h${r}`} x1={0} y1={(r + 1) * rowH} x2={width} y2={(r + 1) * rowH} stroke={palette.void2} strokeWidth={2} />
        ))}
        {Array.from({ length: rows - 1 }, (_, r) => (
          <Line key={`hh${r}`} x1={0} y1={(r + 1) * rowH + 1.5} x2={width} y2={(r + 1) * rowH + 1.5} stroke={palette.steel1} strokeWidth={1} />
        ))}
        {seams.map((s, k) => (
          <Line key={`v${k}`} x1={s.x} y1={s.row * rowH} x2={s.x} y2={(s.row + 1) * rowH} stroke={palette.void2} strokeWidth={2} />
        ))}
        {seams.map((s, k) => (
          <Line key={`vv${k}`} x1={s.x + 1.5} y1={s.row * rowH} x2={s.x + 1.5} y2={(s.row + 1) * rowH} stroke={palette.steel1} strokeWidth={1} />
        ))}
        {rivets.map((r, k) => (
          <Circle key={`r${k}`} cx={r.x} cy={r.y} r={2.2} fill={palette.steel1} />
        ))}
        {rivets.map((r, k) => (
          <Circle key={`rr${k}`} cx={r.x - 0.6} cy={r.y - 0.6} r={0.9} fill={palette.steel2} />
        ))}
      </Svg>
      <View style={{ position: "absolute", left: space.md, bottom: space.md, backgroundColor: palette.yellow, borderRadius: 2, paddingHorizontal: 6, paddingVertical: 2, transform: [{ rotate: "-2deg" }] }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={[type.micro, { color: palette.void2 }]}>
          {tr(TEXT.stencil)}
        </Text>
      </View>
    </View>
  );
});

function crackPath(leak: LeakDef, pad: number, mid: number): string {
  let d = "";
  const stations = leak.jag.length;
  for (let s = 0; s < stations; s++) {
    const x = pad + (s / (stations - 1)) * leak.len;
    d += `${s === 0 ? "M" : "L"}${Math.round(x * 10) / 10} ${Math.round((mid + leak.jag[s]) * 10) / 10}`;
  }
  return d;
}

/** The crack itself, drawn under the tape. */
const Crack = memo(function Crack({ i, leak, sim }: { i: number; leak: LeakDef; sim: Sim }) {
  const pad = 6;
  const w = leak.len + pad * 2;
  const h = 24;
  const d = useMemo(() => crackPath(leak, pad, h / 2), [leak]);
  const st = sim.st[i];
  const px = sim.px[i];
  const py = sim.py[i];
  const sev = sim.sev[i];
  const style = useAnimatedStyle(() => ({
    opacity: st.value === 1 ? 1 : 0,
    transform: [{ translateX: px.value - w / 2 }, { translateY: py.value - h / 2 }, { rotate: `${leak.angle}rad` }],
  }));
  const hot = useAnimatedStyle(() => ({ opacity: 0.25 + ((sev.value - 1) / (MAX_SEV - 1)) * 0.6 }));
  return (
    <Animated.View testID={`tape-leak-${i}`} pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0, width: w, height: h }, style]}>
      <Animated.View style={[{ position: "absolute", left: 0, top: 0 }, hot]}>
        <Svg width={w} height={h}>
          <Path d={d} stroke={palette.orange} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      </Animated.View>
      <Svg width={w} height={h}>
        <Path d={d} stroke={palette.void0} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Path d={d} stroke={palette.amber} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </Animated.View>
  );
});

/** Air escaping from the still-open stations of a crack, plus the ring that pops when it seals. */
const Jet = memo(function Jet({ i, leak, sim, time, still }: { i: number; leak: LeakDef; sim: Sim; time: SharedValue<number>; still: boolean }) {
  const pop = sim.pop[i];
  const px = sim.px[i];
  const py = sim.py[i];
  const ring = useAnimatedStyle(() => {
    const f = pop.value;
    return {
      opacity: f > 0 && f < 1 ? 1 - f : 0,
      transform: [{ translateX: px.value - 30 }, { translateY: py.value - 30 }, { scale: 0.5 + f * 0.9 }],
    };
  });
  const parts = useMemo(() => Array.from({ length: PARTICLES }, (_, k) => k), []);
  return (
    <>
      {parts.map((k) => (
        <Particle key={k} k={k} i={i} leak={leak} sim={sim} time={time} still={still} />
      ))}
      <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0, width: 60, height: 60, borderRadius: 30, borderWidth: 3, borderColor: palette.mint }, ring]} />
    </>
  );
});

function Particle({ k, i, leak, sim, time, still }: { k: number; i: number; leak: LeakDef; sim: Sim; time: SharedValue<number>; still: boolean }) {
  const st = sim.st[i];
  const mask = sim.mask[i];
  const sev = sim.sev[i];
  const px = sim.px[i];
  const py = sim.py[i];
  // The first SAMPLES particles sit one per station; the rest thicken the middle of the crack.
  const station = k < SAMPLES ? k : 1 + ((k - SAMPLES) % (SAMPLES - 2));
  const along = (station / (SAMPLES - 1) - 0.5) * leak.len + (k >= SAMPLES ? 5 : 0);
  const ox = Math.cos(leak.angle) * along;
  const oy = Math.sin(leak.angle) * along;
  const dir = leak.jet + ((k * 37) % 11) * 0.06 - 0.3;
  const dx = Math.cos(dir);
  const dy = Math.sin(dir);
  const speed = 1.1 + ((k * 53) % 7) * 0.09;
  const phase = ((k * 29) % 16) / 16;
  const size = 6 + (k % 3) * 2;
  const style = useAnimatedStyle(() => {
    if (st.value !== 1 || (mask.value & (1 << station)) !== 0) return { opacity: 0 };
    const raw = still ? phase : time.value * speed + phase;
    const f = raw - Math.floor(raw);
    const reach = (22 + 20 * sev.value) * f;
    return {
      opacity: (1 - f * f) * 0.9,
      transform: [{ translateX: px.value + ox + dx * reach - size / 2 }, { translateY: py.value + oy + dy * reach - size / 2 }, { scale: 0.5 + f * (0.5 + 0.35 * sev.value) }],
    };
  });
  return <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0, width: size, height: size, borderRadius: size / 2, backgroundColor: k % 3 === 0 ? palette.cobalt2 : palette.bone2 }, style]} />;
}

/** One strip of tape from the pool. Width follows the swipe, so the strip is "drawn" by the finger. */
const Strip = memo(function Strip({ k, sim }: { k: number; sim: Sim }) {
  const sx = sim.sx[k];
  const sy = sim.sy[k];
  const sa = sim.sa[k];
  const sl = sim.sl[k];
  const so = sim.so[k];
  const style = useAnimatedStyle(() => {
    const len = sl.value;
    const a = sa.value;
    return {
      opacity: so.value,
      width: len,
      transform: [{ translateX: sx.value + (Math.cos(a) * len) / 2 - len / 2 }, { translateY: sy.value + (Math.sin(a) * len) / 2 - TAPE_W / 2 }, { rotate: `${a}rad` }],
    };
  });
  const ribs = useMemo(() => Array.from({ length: 44 }, (_, r) => r), []);
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0, height: TAPE_W, borderRadius: 3, overflow: "hidden", backgroundColor: palette.steel3 }, style]}>
      {ribs.map((r) => (
        <View key={r} style={{ position: "absolute", left: 5 + r * 9, top: 0, bottom: 0, width: 1, backgroundColor: palette.steel2, opacity: 0.28 }} />
      ))}
      <View style={{ position: "absolute", left: 0, right: 0, top: 3, height: 5, backgroundColor: palette.bone1, opacity: 0.38 }} />
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3, backgroundColor: palette.steel2 }} />
      <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, backgroundColor: palette.steel2 }} />
      <View style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 2, backgroundColor: palette.steel2 }} />
    </Animated.View>
  );
});

function EndPlate({ text, good }: { text: L10n; good: boolean }) {
  const t = useMiniTheme();
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
      <View style={{ maxWidth: "88%", backgroundColor: t.lcdBg, borderRadius: radius.lcd, borderWidth: 2, borderColor: palette.steel1, paddingHorizontal: space.lg, paddingVertical: space.md }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[type.lcdL, { color: good ? t.lcdOn : t.lcdWarn, textAlign: "center" }]}>
          {tr(text)}
        </Text>
      </View>
    </View>
  );
}

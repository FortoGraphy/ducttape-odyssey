// Docking: fly the tug into the station's port. Four hold-keys under the thumb (left, brake, burn,
// right); sliding the thumb along the row switches thrusters without lifting. A row of keys beats a
// drag-to-steer pad one-handed here: the thumb never covers the approach, every thruster has a
// physical place, and the lean of the tug (a side burn tilts it) stays a deliberate choice.
// Tier 1: still station. Tier 2: the station swings and a drift pushes sideways. Tier 3: wider swing,
// tighter port, debris lanes and a tank that runs dry.
// One shared value holds the simulation; one frame callback steps it on the UI thread.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { makeMutable, useAnimatedStyle, useFrameCallback, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import type { L10n } from "@/engine/types";
import { tr } from "@/i18n";
import { MINI_HUD_HEIGHT, MiniHud, MiniStage, haptic, miniRng, sfx, useCountdown, useMiniTheme } from "@/minigames/shared";
import { makeResult, type MinigameMeta, type MinigameProps } from "@/minigames/types";
import { Txt } from "@/ui/kit/Txt";
import { palette, radius, space, type PanelTheme } from "@/ui/theme";

import { DebrisSprite, Stars, Station, TugSprite } from "./art";
import {
  COLLAR,
  DOCK_SECONDS,
  DUST_COUNT,
  EV_ALIGNED,
  EV_BUMP,
  EV_CRASH,
  EV_DEAD,
  EV_DOCK,
  EV_FUEL_OUT,
  EV_THRUST,
  KEY_BRAKE,
  KEY_LEFT,
  KEY_MAIN,
  KEY_NONE,
  KEY_RIGHT,
  PUFF_COUNT,
  STATE_STOPPED,
  buildDock,
  createDockSim,
  displaySpeed,
  dockScore,
  stepDock,
  type DockConfig,
  type DockSim,
} from "./sim";

export const meta: MinigameMeta = {
  id: "dock",
  name: { cs: "Dokování", en: "Docking" },
  hint: { cs: "Drž klávesy trysek, srovnej se s portem a doraz pomalu.", en: "Hold the thruster keys, line up with the port and touch down slowly." },
  icon: "mg_dock",
  seconds: DOCK_SECONDS,
};

/** Test-route hooks; the real host never passes this. */
export interface DockDebug {
  autoplay?: "win" | "lose";
  seconds?: number;
}

const TXT = {
  speed: { cs: "RYCHLOST", en: "SPEED" },
  offset: { cs: "POZICE", en: "OFFSET" },
  angle: { cs: "ÚHEL", en: "ANGLE" },
  hull: { cs: "TRUP", en: "HULL" },
  fuel: { cs: "PALIVO", en: "FUEL" },
  burn: { cs: "TAH", en: "BURN" },
  brake: { cs: "BRZDA", en: "BRAKE" },
  docked: { cs: "ZAKOTVENO", en: "DOCKED" },
  crash: { cs: "TVRDÝ NÁRAZ", en: "HARD IMPACT" },
  dead: { cs: "TRUP TO VZDAL", en: "THE HULL GAVE UP" },
  timeout: { cs: "ČAS VYPRŠEL", en: "TIME IS UP" },
  empty: { cs: "NÁDRŽ PRÁZDNÁ", en: "TANK EMPTY" },
} satisfies Record<string, L10n>;

const LCD_H = 34;
const KEYS_H = 56;
const OUTRO_MS = 850;
const KEY_WEIGHTS = [1, 1, 1.3, 1];

type Outcome = "docked" | "crash" | "dead" | "timeout";
type SimValue = SharedValue<DockSim>;

const pad2 = (v: number): string => (v < 10 ? `0${v}` : String(v));

const HIDDEN = { opacity: 0, transform: [{ translateX: -400 }, { translateY: -400 }, { rotate: "0rad" }, { scale: 1 }] };

type StatsFn = (speed: number, meters: number, hull: number, fuelOut: number, bumps: number, used: number, progress: number, cu: number, cda: number, cspeed: number) => void;
type FxFn = (code: number) => void;

function frameDock(sim: SimValue, cfg: DockConfig, ctrl: SharedValue<number>, sinceLast: number | null, onStats: StatsFn, onFx: FxFn): void {
  "worklet";
  const dt = (sinceLast === null ? 16.7 : sinceLast > 50 ? 50 : sinceLast) / 1000;
  const s = sim.value;
  stepDock(s, cfg, dt, ctrl.value);
  // Stats first, so an end-of-game event finds them up to date on the React side.
  if (s.dirty === 1) {
    s.dirty = 0;
    const progress = 1 - s.minGap / s.gap0;
    scheduleOnRN(onStats, displaySpeed(s, cfg), Math.max(0, Math.round((s.gap / cfg.h) * 60)), s.hull, s.fuelOut, s.bumps, s.used, progress < 0 ? 0 : progress > 1 ? 1 : progress, s.cu, s.cda, s.cspeed);
  }
  for (let i = 0; i < s.evN; i++) scheduleOnRN(onFx, s.ev[i * 2]);
  s.evN = 0;
  // The state object is mutated in place; this tells the views that read it to update.
  sim.modify(undefined, true);
}

/** The key under the thumb burns. `edges` are the x positions where one key ends and the next begins. */
function pressKey(ctrl: SharedValue<number>, edges: number[], x: number, onKey: (key: number) => void): void {
  "worklet";
  const key = x < edges[0] ? KEY_LEFT : x < edges[1] ? KEY_BRAKE : x < edges[2] ? KEY_MAIN : KEY_RIGHT;
  if (ctrl.value !== key) {
    ctrl.value = key;
    scheduleOnRN(onKey, key);
  }
}

function releaseKey(ctrl: SharedValue<number>): void {
  "worklet";
  ctrl.value = KEY_NONE;
}

function stopDock(s: DockSim): DockSim {
  "worklet";
  s.state = STATE_STOPPED;
  return s;
}

const PuffView = memo(function PuffView({ sim, index }: { sim: SimValue; index: number }) {
  const style = useAnimatedStyle(() => {
    const p = sim.value.puffs[index];
    if (p.life <= 0) return HIDDEN;
    const k = p.life / p.max;
    return { opacity: k * 0.85, transform: [{ translateX: p.x - 5 }, { translateY: p.y - 5 }, { rotate: "0rad" }, { scale: 0.5 + (1 - k) * 1.1 }] };
  });
  return <Animated.View style={[{ pointerEvents: "none", position: "absolute", left: 0, top: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: index % 3 === 0 ? palette.bone1 : palette.steel3 }, style]} />;
});

const DebrisView = memo(function DebrisView({ sim, index }: { sim: SimValue; index: number }) {
  const style = useAnimatedStyle(() => {
    const d = sim.value.debris[index];
    if (d.on === 0) return HIDDEN;
    return { opacity: 1, transform: [{ translateX: d.x - 18 }, { translateY: d.y - 18 }, { rotate: `${d.rot}rad` }, { scale: d.r / 13 }] };
  });
  return (
    <Animated.View style={[{ pointerEvents: "none", position: "absolute", left: 0, top: 0, width: 36, height: 36 }, style]}>
      <DebrisSprite variant={index} />
    </Animated.View>
  );
});

const DustView = memo(function DustView({ sim, index }: { sim: SimValue; index: number }) {
  const style = useAnimatedStyle(() => {
    const p = sim.value.dust[index];
    return { transform: [{ translateX: p.x }, { translateY: p.y }] };
  });
  return <Animated.View style={[{ pointerEvents: "none", position: "absolute", left: 0, top: 0, width: index % 2 === 0 ? 9 : 5, height: 1.5, borderRadius: 1, backgroundColor: palette.steel2, opacity: 0.55 }, style]} />;
});

function Flame({ sim, keyId, style, reduceMotion, small }: { sim: SimValue; keyId: number; style: object; reduceMotion: boolean; small?: boolean }) {
  const anim = useAnimatedStyle(() => {
    const s = sim.value;
    if (s.key !== keyId) return { opacity: 0 };
    return { opacity: reduceMotion ? 0.9 : 0.7 + 0.3 * Math.sin(s.t * 55) };
  });
  const w = small ? 8 : 12;
  const h = small ? 11 : 18;
  return (
    <Animated.View style={[{ pointerEvents: "none", position: "absolute", width: w, height: h }, style, anim]}>
      <Svg width={w} height={h} viewBox="0 0 12 18">
        <Path d="M1 0h10l-1 9-4 9-4-9z" fill={palette.orange} />
        <Path d="M3.5 0h5l-.6 6L6 11 4.1 6z" fill={palette.yellow} />
      </Svg>
    </Animated.View>
  );
}

/** Everything that moves. Memoized: an LCD refresh never re-renders it. */
const Field = memo(function Field({ sim, cfg, stars, reduceMotion }: { sim: SimValue; cfg: DockConfig; stars: { x: number; y: number; k: number }[]; reduceMotion: boolean }) {
  const { w, h, r } = cfg;
  const corridor = Math.min(170, h * 0.5);
  const mouth = cfg.tolU + 4;

  const station = useAnimatedStyle(() => ({ transform: [{ rotate: `${-sim.value.phi}rad` }] }));
  const lit = useAnimatedStyle(() => ({ opacity: sim.value.aligned === 1 ? 1 : 0 }));
  const tug = useAnimatedStyle(() => {
    const s = sim.value;
    return { transform: [{ translateX: s.x - 20 }, { translateY: s.y - 24 }, { rotate: `${s.th}rad` }] };
  });
  const shake = useAnimatedStyle(() => {
    const s = sim.value;
    return { transform: [{ translateX: s.shake > 0 ? Math.sin(s.t * 85) * 3 * s.shake : 0 }] };
  });
  const flash = useAnimatedStyle(() => ({ opacity: sim.value.flash * (reduceMotion ? 0.3 : 0.8) }));

  const dashes = Math.floor(corridor / 14);
  return (
    <Animated.View style={[{ pointerEvents: "none", position: "absolute", left: 0, top: 0, width: w, height: h }, shake]}>
      <Stars w={w} h={h} points={stars} />
      {cfg.drift !== 0 && Array.from({ length: DUST_COUNT }, (_, i) => <DustView key={i} sim={sim} index={i} />)}
      <Animated.View style={[{ position: "absolute", left: cfg.cx - r, top: cfg.cy - r, width: r * 2, height: r * 2 }, station]}>
        <Station r={r} collar={COLLAR} corridor={corridor} mouth={mouth}>
          {Array.from({ length: dashes }, (_, i) => (
            <View key={i} style={{ position: "absolute", left: 19, top: 6 + i * 14, width: 2, height: 7, borderRadius: 1, backgroundColor: palette.teal2, opacity: 0.75 - (i / dashes) * 0.45 }} />
          ))}
          <Animated.View style={[StyleSheet.absoluteFill, lit]}>
            {Array.from({ length: dashes }, (_, i) => (
              <View key={i} style={{ position: "absolute", left: 18.5, top: 6 + i * 14, width: 3, height: 7, borderRadius: 1, backgroundColor: palette.mint, opacity: 1 - (i / dashes) * 0.5 }} />
            ))}
            <View style={{ position: "absolute", left: 20 - mouth - 5, top: -5, width: 5, height: 5, borderRadius: 1.5, backgroundColor: palette.mint }} />
            <View style={{ position: "absolute", left: 20 + mouth, top: -5, width: 5, height: 5, borderRadius: 1.5, backgroundColor: palette.mint }} />
          </Animated.View>
        </Station>
      </Animated.View>
      {Array.from({ length: cfg.debris.length }, (_, i) => (
        <DebrisView key={i} sim={sim} index={i} />
      ))}
      {Array.from({ length: PUFF_COUNT }, (_, i) => (
        <PuffView key={i} sim={sim} index={i} />
      ))}
      <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: 40, height: 48 }, tug]}>
        <Flame sim={sim} keyId={KEY_MAIN} reduceMotion={reduceMotion} style={{ left: 14, top: 44 }} />
        <Flame sim={sim} keyId={KEY_BRAKE} reduceMotion={reduceMotion} small style={{ left: 7, top: 2, transform: [{ rotate: "180deg" }] }} />
        <Flame sim={sim} keyId={KEY_BRAKE} reduceMotion={reduceMotion} small style={{ left: 25, top: 2, transform: [{ rotate: "180deg" }] }} />
        <Flame sim={sim} keyId={KEY_LEFT} reduceMotion={reduceMotion} small style={{ left: 38, top: 20, transform: [{ rotate: "-90deg" }] }} />
        <Flame sim={sim} keyId={KEY_RIGHT} reduceMotion={reduceMotion} small style={{ left: -6, top: 20, transform: [{ rotate: "90deg" }] }} />
        <TugSprite />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { borderWidth: 3, borderColor: palette.red1 }, flash]} />
    </Animated.View>
  );
});

/** Two centre-zero needles (offset and angle). The bracket in the middle is the tolerance. */
const Instruments = memo(function Instruments({ sim, cfg, theme }: { sim: SimValue; cfg: DockConfig; theme: PanelTheme }) {
  const track = 68;
  const window = track / 3.4;
  // Each needle reads its error in units of the tolerance, so both brackets have the same width.
  const uDot = useAnimatedStyle(() => {
    const k = sim.value.u / cfg.tolU / 3.4;
    return { transform: [{ translateX: (k > 1 ? 1 : k < -1 ? -1 : k) * (track / 2 - 3) }], backgroundColor: Math.abs(sim.value.u) <= cfg.tolU ? palette.mint : palette.orange };
  });
  const aDot = useAnimatedStyle(() => {
    const k = sim.value.da / cfg.tolA / 3.4;
    return { transform: [{ translateX: (k > 1 ? 1 : k < -1 ? -1 : k) * (track / 2 - 3) }], backgroundColor: Math.abs(sim.value.da) <= cfg.tolA ? palette.mint : palette.orange };
  });
  const row = (label: L10n, style: object) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, height: 11 }}>
      <View style={{ width: 38 }}>
        <Txt variant="micro" color={theme.lcdOn} style={{ opacity: 0.7, lineHeight: 11 }}>
          {tr(label)}
        </Txt>
      </View>
      <View style={{ width: track, height: 8 }}>
        <View style={{ position: "absolute", left: 0, right: 0, top: 3.25, height: 1.5, backgroundColor: theme.lcdDim }} />
        <View style={{ position: "absolute", left: (track - window) / 2, top: 0, width: window, height: 8, borderLeftWidth: 1.5, borderRightWidth: 1.5, borderColor: theme.lcdOn, opacity: 0.6 }} />
        <Animated.View style={[{ position: "absolute", left: track / 2 - 3, top: 0, width: 6, height: 8, borderRadius: 2 }, style]} />
      </View>
    </View>
  );
  return (
    <View style={{ gap: 2 }}>
      {row(TXT.offset, uDot)}
      {row(TXT.angle, aDot)}
    </View>
  );
});

function FuelBar({ sim, theme }: { sim: SimValue; theme: PanelTheme }) {
  const style = useAnimatedStyle(() => {
    const f = sim.value.fuel;
    return { width: `${f < 0 ? 0 : f > 100 ? 100 : f}%`, backgroundColor: f < 25 ? palette.orange : palette.mint };
  });
  return (
    <View style={{ width: 40, height: 8, borderRadius: 2, backgroundColor: theme.lcdDim, overflow: "hidden" }}>
      <Animated.View style={[{ height: 8 }, style]} />
    </View>
  );
}

function Arrow({ dir, color }: { dir: "left" | "right" | "up" | "down"; color: string }) {
  const rot = dir === "up" ? 0 : dir === "right" ? 90 : dir === "down" ? 180 : 270;
  return (
    <View style={{ transform: [{ rotate: `${rot}deg` }] }}>
      <Svg width={16} height={16} viewBox="0 0 16 16">
        <Path d="M8 2 14 10H10.5V14H5.5V10H2z" fill={color} />
      </Svg>
    </View>
  );
}

/** Same look as MiniKey, but a hold-key whose state lives on the UI thread. */
function HoldKey({ ctrl, keyId, flex, tone, theme, children }: { ctrl: SharedValue<number>; keyId: number; flex: number; tone: "black" | "orange" | "cobalt"; theme: PanelTheme; children: React.ReactNode }) {
  const bg = tone === "orange" ? theme.orange : tone === "cobalt" ? theme.cobalt : theme.key;
  const cap = useAnimatedStyle(() => ({ transform: [{ translateY: withTiming(ctrl.value === keyId ? 3 : 0, { duration: ctrl.value === keyId ? 40 : 90 }) }] }));
  return (
    <View style={{ flex, borderRadius: radius.key, backgroundColor: theme.keyLo, paddingBottom: 3 }}>
      <Animated.View style={[{ height: 44, borderRadius: radius.key, backgroundColor: bg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs }, cap]}>{children}</Animated.View>
    </View>
  );
}

function Banner({ outcome, theme }: { outcome: Outcome; theme: PanelTheme }) {
  const color = outcome === "docked" ? theme.mint : outcome === "timeout" ? theme.orange : theme.red;
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: "none", alignItems: "center", justifyContent: "flex-end", paddingBottom: "12%", backgroundColor: "rgba(5,6,10,0.45)" }]}>
      <View style={{ paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.well, backgroundColor: theme.lcdBg, borderWidth: 1, borderColor: color, maxWidth: "92%" }}>
        <Txt variant="title" color={color} align="center">
          {tr(TXT[outcome])}
        </Txt>
      </View>
    </View>
  );
}

interface Readout {
  speed: number;
  meters: number;
  hull: number;
  fuelOut: boolean;
}

interface Stats {
  bumps: number;
  used: number;
  progress: number;
  cu: number;
  cda: number;
  cspeed: number;
}

export default function DockGame({ tier, seed, width, height, reduceMotion, onFinish, debug }: MinigameProps & { debug?: DockDebug }) {
  const theme = useMiniTheme();
  const seconds = debug?.seconds ?? meta.seconds[tier - 1];
  const stageH = height - MINI_HUD_HEIGHT - LCD_H - KEYS_H;
  const fieldW = width - 2 * space.sm - 2;
  const fieldH = stageH - 2 * space.sm - 2;
  const bot = debug?.autoplay === "win" ? 1 : debug?.autoplay === "lose" ? 2 : 0;

  const { cfg, stars } = useMemo(() => {
    const rnd = miniRng(seed);
    const built = buildDock(tier, rnd, fieldW, fieldH, reduceMotion, bot);
    const points = Array.from({ length: 26 }, () => ({ x: rnd(), y: rnd(), k: rnd() }));
    return { cfg: built, stars: points };
  }, [tier, seed, fieldW, fieldH, reduceMotion, bot]);
  const sim = useMemo(() => makeMutable(createDockSim(cfg)), [cfg]);
  const ctrl = useSharedValue(KEY_NONE);

  const [readout, setReadout] = useState<Readout>({ speed: 0, meters: 0, hull: cfg.hullMax, fuelOut: false });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const readoutRef = useRef(readout);
  const statsRef = useRef<Stats>({ bumps: 0, used: 0, progress: 0, cu: 0, cda: 0, cspeed: 0 });
  const done = useRef(false);
  const thrustTicks = useRef(0);
  const outro = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishRef = useRef(onFinish);
  const endRef = useRef<(kind: Outcome) => void>(() => {});
  const countdown = useCountdown(seconds, () => endRef.current("timeout"));
  const startedAt = countdown.startedAt;
  const stopCountdown = countdown.stop;

  const end = (kind: Outcome) => {
    if (done.current) return;
    done.current = true;
    stopCountdown();
    if (kind === "timeout") sim.modify(stopDock);
    const st = statsRef.current;
    const elapsed = (Date.now() - startedAt) / 1000;
    const score = dockScore({
      docked: kind === "docked",
      crashed: kind === "crash",
      u: st.cu,
      tolU: cfg.tolU,
      da: st.cda,
      tolA: cfg.tolA,
      speed: st.cspeed,
      vLimit: cfg.vLimit,
      used: st.used,
      timeLeft: Math.max(0, 1 - elapsed / seconds),
      bumps: st.bumps,
      progress: st.progress,
    });
    setOutcome(kind);
    if (kind === "docked") {
      sfx("dock");
      haptic("success");
    } else if (kind === "timeout") {
      sfx("fail");
      haptic("error");
    } else {
      sfx("explosion");
      haptic("error");
    }
    const result = makeResult(score, startedAt);
    outro.current = setTimeout(() => finishRef.current(result), OUTRO_MS);
  };
  useEffect(() => {
    finishRef.current = onFinish;
    endRef.current = end;
  });

  useEffect(
    () => () => {
      if (outro.current) clearTimeout(outro.current);
    },
    [],
  );

  const onStats = useCallback((speed: number, meters: number, hull: number, fuelOut: number, bumps: number, used: number, progress: number, cu: number, cda: number, cspeed: number) => {
    statsRef.current = { bumps, used, progress, cu, cda, cspeed };
    const prev = readoutRef.current;
    if (prev.speed !== speed || prev.meters !== meters || prev.hull !== hull || prev.fuelOut !== (fuelOut === 1)) {
      const next = { speed, meters, hull, fuelOut: fuelOut === 1 };
      readoutRef.current = next;
      setReadout(next);
    }
  }, []);

  const onFx = useCallback((code: number) => {
    switch (code) {
      case EV_THRUST:
        haptic("tap");
        if (thrustTicks.current++ % 3 === 0) sfx("thruster", { volume: 0.7 });
        break;
      case EV_BUMP:
        sfx("impact");
        haptic("heavy");
        break;
      case EV_ALIGNED:
        sfx("beepGood", { volume: 0.4 });
        haptic("detent");
        break;
      case EV_FUEL_OUT:
        sfx("deny");
        haptic("warning");
        break;
      case EV_DOCK:
        endRef.current("docked");
        break;
      case EV_CRASH:
        endRef.current("crash");
        break;
      case EV_DEAD:
        endRef.current("dead");
        break;
    }
  }, []);

  const onKey = useCallback((key: number) => {
    if (key === KEY_NONE) return;
    haptic("key");
    sfx("keyDown");
    thrustTicks.current = 0;
  }, []);

  useFrameCallback((frame) => {
    frameDock(sim, cfg, ctrl, frame.timeSincePreviousFrame, onStats, onFx);
  });

  // One gesture for the whole key row: the key under the thumb is the one that burns.
  const rowW = width - 2 * space.md;
  const edges = useMemo(() => {
    const gap = space.sm;
    const total = KEY_WEIGHTS.reduce((a, b) => a + b, 0);
    const unit = (rowW - gap * (KEY_WEIGHTS.length - 1)) / total;
    const out: number[] = [];
    // Measured from the left edge of the row view, which includes its padding.
    let x = space.md;
    for (let i = 0; i < KEY_WEIGHTS.length - 1; i++) {
      x += KEY_WEIGHTS[i] * unit;
      out.push(x + gap / 2);
      x += gap;
    }
    return out;
  }, [rowW]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .shouldCancelWhenOutside(false)
        // eslint-disable-next-line react-hooks/refs -- the builder only stores the callbacks; they run on touch, not during render
        .onBegin((e) => pressKey(ctrl, edges, e.x, onKey))
        // eslint-disable-next-line react-hooks/refs
        .onUpdate((e) => pressKey(ctrl, edges, e.x, onKey))
        .onFinalize(() => releaseKey(ctrl)),
    [ctrl, edges, onKey],
  );

  const over = readout.speed > cfg.limitUnits;
  const hullColor = readout.hull >= 3 ? theme.mint : readout.hull === 2 ? theme.yellow : theme.red;

  return (
    <View style={{ width, height, backgroundColor: theme.body }}>
      <MiniHud title={meta.name} left={countdown.left} score={`${readout.meters} m`} />
      <MiniStage width={width} height={stageH} dark>
        <View style={{ width: fieldW, height: fieldH, backgroundColor: palette.void0 }}>
          <Field sim={sim} cfg={cfg} stars={stars} reduceMotion={reduceMotion} />
          {readout.fuelOut && !outcome && (
            <View style={{ pointerEvents: "none", position: "absolute", left: 0, right: 0, bottom: space.sm, alignItems: "center" }}>
              <Txt variant="label" color={theme.orange}>
                {tr(TXT.empty)}
              </Txt>
            </View>
          )}
          {outcome && <Banner outcome={outcome} theme={theme} />}
        </View>
      </MiniStage>

      <View style={{ height: LCD_H, paddingHorizontal: space.md, justifyContent: "flex-start" }}>
        <View style={{ height: 30, borderRadius: radius.lcd, backgroundColor: theme.lcdBg, paddingHorizontal: 6, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <Txt variant="micro" color={theme.lcdOn} style={{ opacity: 0.7 }}>
              {tr(TXT.speed)}
            </Txt>
            <Txt testID="dock-speed" variant="lcdM" color={over ? theme.lcdWarn : theme.lcdOn}>
              {`${pad2(Math.min(99, readout.speed))}/${pad2(cfg.limitUnits)}`}
            </Txt>
          </View>
          <Instruments sim={sim} cfg={cfg} theme={theme} />
          <View style={{ alignItems: "flex-start", gap: 2 }}>
            <Txt variant="micro" color={theme.lcdOn} style={{ opacity: 0.7, lineHeight: 11 }}>
              {tr(TXT.hull)}
            </Txt>
            <View style={{ flexDirection: "row", gap: 3 }}>
              {Array.from({ length: cfg.hullMax }, (_, i) => (
                <View key={i} style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: i < readout.hull ? hullColor : theme.lcdDim }} />
              ))}
            </View>
          </View>
          {cfg.fuelLimited && (
            <View style={{ alignItems: "flex-start", gap: 2 }}>
              <Txt variant="micro" color={theme.lcdOn} style={{ opacity: 0.7, lineHeight: 11 }}>
                {tr(TXT.fuel)}
              </Txt>
              <FuelBar sim={sim} theme={theme} />
            </View>
          )}
        </View>
      </View>

      <GestureDetector gesture={pan}>
        <View testID="dock-keys" style={{ height: KEYS_H, paddingHorizontal: space.md, paddingTop: 2, flexDirection: "row", gap: space.sm }}>
          <HoldKey ctrl={ctrl} keyId={KEY_LEFT} flex={KEY_WEIGHTS[0]} tone="black" theme={theme}>
            <Arrow dir="left" color={theme.keyText} />
          </HoldKey>
          <HoldKey ctrl={ctrl} keyId={KEY_BRAKE} flex={KEY_WEIGHTS[1]} tone="cobalt" theme={theme}>
            <Arrow dir="down" color={theme.keyText} />
            <Txt variant="key" color={theme.keyText}>
              {tr(TXT.brake)}
            </Txt>
          </HoldKey>
          <HoldKey ctrl={ctrl} keyId={KEY_MAIN} flex={KEY_WEIGHTS[2]} tone="orange" theme={theme}>
            <Arrow dir="up" color="#15171C" />
            <Txt variant="key" color="#15171C">
              {tr(TXT.burn)}
            </Txt>
          </HoldKey>
          <HoldKey ctrl={ctrl} keyId={KEY_RIGHT} flex={KEY_WEIGHTS[3]} tone="black" theme={theme}>
            <Arrow dir="right" color={theme.keyText} />
          </HoldKey>
        </View>
      </GestureDetector>
    </View>
  );
}

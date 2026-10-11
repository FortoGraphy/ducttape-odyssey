// Point defense: tap meteors before they reach the hull line above the tug.
// Tier 1: slow rocks and boulders that split. Tier 2: denser, fast streaks, salvage crates that must
// not be shot. Tier 3: five waves on curved paths and a laser with five charges.
// One shared value holds the whole simulation; a single frame callback steps it on the UI thread and
// a fixed pool of views reads from it. React state only changes on discrete events.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, cancelAnimation, makeMutable, useAnimatedStyle, useFrameCallback, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import type { L10n } from "@/engine/types";
import { tr } from "@/i18n";
import { MINI_HUD_HEIGHT, MiniHud, MiniStage, haptic, miniRng, sfx, useCountdown, useMiniTheme } from "@/minigames/shared";
import { makeResult, type MinigameMeta, type MinigameProps } from "@/minigames/types";
import { Txt } from "@/ui/kit/Txt";
import { palette, radius, space, type PanelTheme } from "@/ui/theme";

import { BigSprite, CrateIcon, CrateSprite, FastSprite, RadarGrid, RockIcon, RockSprite, ShipSprite } from "./art";
import {
  BEAM_COUNT,
  DEFENSE_SECONDS,
  EV_CLEARED,
  EV_CRATE_SAVED,
  EV_CRATE_SHOT,
  EV_DEAD,
  EV_HIT,
  EV_IMPACT,
  EV_MISS,
  EV_NO_CHARGE,
  EV_SPLIT,
  EV_WAVE,
  KIND_BIG,
  KIND_CRATE,
  KIND_FAST,
  KIND_ROCK,
  PARTICLE_COUNT,
  RING_COUNT,
  SLOT_COUNT,
  SLOT_START,
  buildDefense,
  createDefenseSim,
  defenseScore,
  stepDefense,
  tapDefense,
  type DefenseConfig,
  type DefenseSim,
} from "./sim";

export const meta: MinigameMeta = {
  id: "defense",
  name: { cs: "Bodová obrana", en: "Point Defense" },
  hint: { cs: "Klepnutím sestřel meteory. Bedny se šrotem nech být.", en: "Tap meteors to shoot them. Leave the salvage crates alone." },
  icon: "mg_defense",
  seconds: DEFENSE_SECONDS,
};

/** Test-route hooks; the real host never passes this. */
export interface DefenseDebug {
  autoplay?: "win" | "lose";
  seconds?: number;
}

const TXT = {
  hull: { cs: "TRUP", en: "HULL" },
  accuracy: { cs: "PŘESNOST", en: "ACCURACY" },
  laser: { cs: "LASER", en: "LASER" },
  wave: { cs: "VLNA {n}/{of}", en: "WAVE {n}/{of}" },
  tapRocks: { cs: "KLEPNI NA METEOR", en: "TAP THE METEORS" },
  leaveCrates: { cs: "BEDNY NECH BÝT", en: "LEAVE THE CRATES" },
  cleared: { cs: "SEKTOR ČISTÝ", en: "SECTOR CLEAR" },
  dead: { cs: "TRUP PRORAŽEN", en: "HULL BREACHED" },
  timeout: { cs: "KONEC SMĚNY", en: "SHIFT OVER" },
} satisfies Record<string, L10n>;

const STRIP_H = 36;
const OUTRO_MS = 750;
const PARTICLE_COLORS = [palette.steel3, palette.amber, palette.orange, palette.bone1];

type Outcome = "cleared" | "dead" | "timeout";
type SimValue = SharedValue<DefenseSim>;

const pad2 = (v: number): string => (v < 10 ? `0${v}` : String(v));

// Returned for pool slots that are idle: the same object every frame, so nothing is sent to the view.
const HIDDEN = { opacity: 0, transform: [{ translateX: -400 }, { translateY: -400 }, { rotate: "0rad" }, { scale: 1 }] };
const HIDDEN_BEAM = { opacity: 0, transform: [{ translateX: -400 }, { translateY: -400 }, { rotate: "0rad" }, { scaleX: 1 }] };

type StatsFn = (hull: number, shots: number, hits: number, cratesShot: number, kills: number) => void;
type FxFn = (code: number, a: number) => void;

/** UI thread: hands the discrete results of the simulation to React (stats first, then events). */
function flushDefense(s: DefenseSim, onStats: StatsFn, onFx: FxFn): void {
  "worklet";
  if (s.dirty === 1) {
    s.dirty = 0;
    scheduleOnRN(onStats, s.hull, s.shots, s.hits, s.cratesShot, s.kills);
  }
  for (let i = 0; i < s.evN; i++) scheduleOnRN(onFx, s.ev[i * 2], s.ev[i * 2 + 1]);
  s.evN = 0;
}

function frameDefense(sim: SimValue, cfg: DefenseConfig, sinceLast: number | null, onStats: StatsFn, onFx: FxFn): void {
  "worklet";
  const dt = (sinceLast === null ? 16.7 : sinceLast > 50 ? 50 : sinceLast) / 1000;
  const s = sim.value;
  stepDefense(s, cfg, dt);
  flushDefense(s, onStats, onFx);
  // The state object is mutated in place; this tells the views that read it to update.
  sim.modify(undefined, true);
}

function shootDefense(sim: SimValue, cfg: DefenseConfig, x: number, y: number, onStats: StatsFn, onFx: FxFn): void {
  "worklet";
  const s = sim.value;
  tapDefense(s, cfg, x, y);
  flushDefense(s, onStats, onFx);
}

function stopDefense(s: DefenseSim): DefenseSim {
  "worklet";
  s.over = 3;
  return s;
}

const BodyView = memo(function BodyView({ sim, index, size, children }: { sim: SimValue; index: number; size: number; children: React.ReactNode }) {
  const half = size / 2;
  const style = useAnimatedStyle(() => {
    const m = sim.value.m[index];
    if (m.on === 0) return HIDDEN;
    return { opacity: 1, transform: [{ translateX: m.x - half }, { translateY: m.y - half }, { rotate: `${m.rot}rad` }, { scale: m.s }] };
  });
  return (
    <Animated.View style={[{ pointerEvents: "none", position: "absolute", left: 0, top: 0, width: size, height: size }, style]}>
      {children}
    </Animated.View>
  );
});

const ParticleView = memo(function ParticleView({ sim, index }: { sim: SimValue; index: number }) {
  const style = useAnimatedStyle(() => {
    const p = sim.value.p[index];
    if (p.life <= 0) return HIDDEN;
    const k = p.life / p.max;
    return { opacity: k, transform: [{ translateX: p.x - 3 }, { translateY: p.y - 3 }, { rotate: "0rad" }, { scale: 0.5 + k * 0.7 }] };
  });
  return <Animated.View style={[{ pointerEvents: "none", position: "absolute", left: 0, top: 0, width: 6, height: 6, borderRadius: 1, backgroundColor: PARTICLE_COLORS[index % PARTICLE_COLORS.length] }, style]} />;
});

const RingView = memo(function RingView({ sim, index }: { sim: SimValue; index: number }) {
  const style = useAnimatedStyle(() => {
    const r = sim.value.rings[index];
    if (r.life <= 0) return HIDDEN;
    return { opacity: r.life * 0.9, transform: [{ translateX: r.x - 28 }, { translateY: r.y - 28 }, { rotate: "0rad" }, { scale: 0.35 + (1 - r.life) * 0.9 }] };
  });
  return <Animated.View style={[{ pointerEvents: "none", position: "absolute", left: 0, top: 0, width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: palette.amber }, style]} />;
});

const BeamView = memo(function BeamView({ sim, index, fromX, fromY }: { sim: SimValue; index: number; fromX: number; fromY: number }) {
  const style = useAnimatedStyle(() => {
    const b = sim.value.b[index];
    if (b.life <= 0) return HIDDEN_BEAM;
    const dx = b.x - fromX;
    const dy = b.y - fromY;
    const len = Math.sqrt(dx * dx + dy * dy);
    return {
      opacity: (b.hit === 1 ? 1 : 0.55) * Math.min(1, b.life * 1.4),
      transform: [{ translateX: (fromX + b.x) / 2 - 50 }, { translateY: (fromY + b.y) / 2 - 2 }, { rotate: `${Math.atan2(dy, dx)}rad` }, { scaleX: len / 100 }],
    };
  });
  return (
    <Animated.View style={[{ pointerEvents: "none", position: "absolute", left: 0, top: 0, width: 100, height: 4, borderRadius: 2, backgroundColor: palette.mint, justifyContent: "center" }, style]}>
      <View style={{ height: 1.5, backgroundColor: palette.bone2 }} />
    </Animated.View>
  );
});

const ChargePip = memo(function ChargePip({ sim, index }: { sim: SimValue; index: number }) {
  const style = useAnimatedStyle(() => {
    const fill = Math.max(0, Math.min(1, sim.value.charge - index));
    return { opacity: 0.22 + fill * 0.78 };
  });
  return <Animated.View style={[{ width: 9, height: 12, borderRadius: 2, backgroundColor: palette.mint }, style]} />;
});

/** Everything that moves. Memoized: a HUD update never re-renders the pool. */
const Field = memo(function Field({ sim, w, h, lineY, turretX, turretY, tier, reduceMotion }: { sim: SimValue; w: number; h: number; lineY: number; turretX: number; turretY: number; tier: number; reduceMotion: boolean }) {
  const sweep = useSharedValue(-70);
  useEffect(() => {
    if (reduceMotion) return;
    sweep.value = withRepeat(withTiming(70, { duration: 3600, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(sweep);
  }, [reduceMotion, sweep]);

  const reach = Math.hypot(Math.max(turretX, w - turretX), turretY);
  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${sweep.value}deg` }] }));
  const shake = useAnimatedStyle(() => {
    const s = sim.value;
    return { transform: [{ translateX: s.shake > 0 ? Math.sin(s.t * 85) * 3 * s.shake : 0 }] };
  });
  const flash = useAnimatedStyle(() => ({ opacity: sim.value.flash * (reduceMotion ? 0.16 : 0.5) }));

  const bodies: React.ReactNode[] = [];
  // Draw order: crates below rocks, boulders, then the fast ones on top.
  for (const kind of [KIND_CRATE, KIND_ROCK, KIND_BIG, KIND_FAST]) {
    for (let k = 0; k < SLOT_COUNT[kind]; k++) {
      const index = SLOT_START[kind] + k;
      bodies.push(
        <BodyView key={index} sim={sim} index={index} size={kind === KIND_BIG ? 68 : kind === KIND_FAST ? 72 : 44}>
          {kind === KIND_ROCK ? <RockSprite variant={k} /> : kind === KIND_BIG ? <BigSprite /> : kind === KIND_FAST ? <FastSprite /> : <CrateSprite />}
        </BodyView>,
      );
    }
  }

  return (
    <Animated.View style={[{ pointerEvents: "none", position: "absolute", left: 0, top: 0, width: w, height: h }, shake]}>
      <RadarGrid w={w} h={h} cx={turretX} cy={turretY} lineY={lineY} />
      {!reduceMotion && (
        <Animated.View style={[{ position: "absolute", left: turretX - reach, top: turretY - reach, width: reach * 2, height: reach * 2, alignItems: "center" }, sweepStyle]}>
          <View style={{ width: 2, height: reach, backgroundColor: palette.teal2, opacity: 0.28 }} />
        </Animated.View>
      )}
      <Animated.View style={[{ position: "absolute", left: 0, right: 0, top: lineY, bottom: 0, backgroundColor: palette.red1 }, flash]} />
      {bodies}
      {Array.from({ length: BEAM_COUNT }, (_, i) => (
        <BeamView key={i} sim={sim} index={i} fromX={turretX} fromY={turretY - 12} />
      ))}
      {Array.from({ length: RING_COUNT }, (_, i) => (
        <RingView key={i} sim={sim} index={i} />
      ))}
      {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
        <ParticleView key={i} sim={sim} index={i} />
      ))}
      <View style={{ position: "absolute", left: turretX - 48, top: turretY - 14 }}>
        <ShipSprite />
      </View>
      {tier === 3 && (
        <View style={{ position: "absolute", left: space.sm, bottom: space.sm, gap: 3 }}>
          <Txt variant="micro" color={palette.mint}>
            {tr(TXT.laser)}
          </Txt>
          <View style={{ flexDirection: "row", gap: 3 }}>
            {Array.from({ length: 5 }, (_, i) => (
              <ChargePip key={i} sim={sim} index={i} />
            ))}
          </View>
        </View>
      )}
    </Animated.View>
  );
});

/** Fading chip at the top of the field: the one rule of the tier, shown for the first seconds. */
function Legend({ tier, reduceMotion, theme }: { tier: number; reduceMotion: boolean; theme: PanelTheme }) {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withDelay(5200, withTiming(0, { duration: reduceMotion ? 0 : 600 }));
    return () => cancelAnimation(o);
  }, [o, reduceMotion]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View style={[{ pointerEvents: "none", position: "absolute", top: space.sm, left: 0, right: 0, alignItems: "center" }, style]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm, height: 26, borderRadius: radius.lcd, backgroundColor: "rgba(5,6,10,0.72)", borderWidth: 1, borderColor: theme.lcdDim }}>
        {tier === 1 ? <RockIcon size={16} /> : <CrateIcon size={16} />}
        <Txt variant="label" color={tier === 1 ? theme.lcdOn : theme.mint}>
          {tr(tier === 1 ? TXT.tapRocks : TXT.leaveCrates)}
        </Txt>
      </View>
    </Animated.View>
  );
}

function WaveCall({ wave, of, reduceMotion, theme }: { wave: number; of: number; reduceMotion: boolean; theme: PanelTheme }) {
  const o = useSharedValue(0);
  useEffect(() => {
    if (wave <= 0) return;
    o.value = withSequence(withTiming(1, { duration: reduceMotion ? 0 : 140 }), withDelay(1300, withTiming(0, { duration: reduceMotion ? 0 : 400 })));
  }, [wave, o, reduceMotion]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  if (wave <= 0) return null;
  return (
    <Animated.View style={[{ pointerEvents: "none", position: "absolute", top: "30%", left: 0, right: 0, alignItems: "center" }, style]}>
      <View style={{ paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.lcd, backgroundColor: "rgba(5,6,10,0.72)", borderWidth: 1, borderColor: theme.orange }}>
        <Txt variant="title" color={theme.orange}>
          {tr(TXT.wave, { n: wave, of })}
        </Txt>
      </View>
    </Animated.View>
  );
}

function Banner({ outcome, theme }: { outcome: Outcome; theme: PanelTheme }) {
  const color = outcome === "cleared" ? theme.mint : outcome === "dead" ? theme.red : theme.orange;
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: "none", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(5,6,10,0.55)" }]}>
      <View style={{ paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.well, backgroundColor: theme.lcdBg, borderWidth: 1, borderColor: color, maxWidth: "92%" }}>
        <Txt variant="title" color={color} align="center">
          {tr(TXT[outcome])}
        </Txt>
      </View>
    </View>
  );
}

interface Stats {
  hull: number;
  shots: number;
  hits: number;
  cratesShot: number;
  kills: number;
}

export default function DefenseGame({ tier, seed, width, height, reduceMotion, onFinish, debug }: MinigameProps & { debug?: DefenseDebug }) {
  const theme = useMiniTheme();
  const seconds = debug?.seconds ?? meta.seconds[tier - 1];
  const stageH = height - MINI_HUD_HEIGHT - STRIP_H;
  const fieldW = width - 2 * space.sm - 2;
  const fieldH = stageH - 2 * space.sm - 2;
  const bot = debug?.autoplay === "win" ? 1 : 0;

  const cfg = useMemo(() => buildDefense(tier, miniRng(seed), fieldW, fieldH, reduceMotion, bot), [tier, seed, fieldW, fieldH, reduceMotion, bot]);
  const sim = useMemo(() => makeMutable(createDefenseSim(cfg)), [cfg]);

  const [stats, setStats] = useState<Stats>({ hull: cfg.hullMax, shots: 0, hits: 0, cratesShot: 0, kills: 0 });
  const [wave, setWave] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const statsRef = useRef(stats);
  const done = useRef(false);
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
    if (kind === "timeout") sim.modify(stopDefense);
    const st = statsRef.current;
    const elapsed = (Date.now() - startedAt) / 1000;
    const score = defenseScore({ hull: st.hull, hullMax: cfg.hullMax, shots: st.shots, hits: st.hits, cratesShot: st.cratesShot, progress: Math.min(1, elapsed / seconds) });
    setOutcome(kind);
    if (kind === "dead") {
      sfx("fail");
      haptic("error");
    } else {
      sfx("success");
      haptic("success");
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

  const onStats = useCallback((hull: number, shots: number, hits: number, cratesShot: number, kills: number) => {
    const next = { hull, shots, hits, cratesShot, kills };
    statsRef.current = next;
    setStats(next);
  }, []);

  const onFx = useCallback((code: number, a: number) => {
    switch (code) {
      case EV_HIT:
        sfx("laser");
        sfx("explosion", { volume: 0.7, rate: 1.1 });
        haptic("impact");
        break;
      case EV_SPLIT:
        sfx("laser");
        sfx("explosion", { rate: 0.8 });
        haptic("heavy");
        break;
      case EV_MISS:
        sfx("laser", { volume: 0.5, rate: 1.25 });
        haptic("tap");
        break;
      case EV_CRATE_SHOT:
        sfx("laser");
        sfx("beepBad");
        haptic("warning");
        break;
      case EV_NO_CHARGE:
        sfx("deny");
        haptic("tap");
        break;
      case EV_IMPACT:
        sfx("impact");
        haptic("heavy");
        break;
      case EV_CRATE_SAVED:
        sfx("collect");
        haptic("tap");
        break;
      case EV_WAVE:
        setWave(a);
        sfx("alert");
        break;
      case EV_CLEARED:
        endRef.current("cleared");
        break;
      case EV_DEAD:
        endRef.current("dead");
        break;
    }
  }, []);

  useFrameCallback((frame) => {
    frameDefense(sim, cfg, frame.timeSincePreviousFrame, onStats, onFx);
  });

  // Fires on touch-down (not on release) so the laser answers the thumb at once.
  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(60000)
        .maxDistance(9999)
        // eslint-disable-next-line react-hooks/refs -- the builder only stores the callback; it runs on touch, not during render
        .onBegin((e) => {
          shootDefense(sim, cfg, e.x, e.y, onStats, onFx);
        }),
    [sim, cfg, onStats, onFx],
  );

  const acc = stats.shots > 0 ? Math.round((stats.hits / stats.shots) * 100) : 100;
  const hullColor = stats.hull >= 4 ? theme.mint : stats.hull >= 2 ? theme.yellow : theme.red;

  return (
    <View style={{ width, height, backgroundColor: theme.body }}>
      <MiniHud title={meta.name} left={countdown.left} score={`${pad2(stats.kills)}/${pad2(cfg.total)}`} />
      <MiniStage width={width} height={stageH} dark>
        <GestureDetector gesture={tapGesture}>
          <View testID="defense-field" style={{ width: fieldW, height: fieldH }}>
            <Field sim={sim} w={fieldW} h={fieldH} lineY={cfg.lineY} turretX={cfg.turretX} turretY={cfg.turretY} tier={tier} reduceMotion={reduceMotion} />
            <Legend tier={tier} reduceMotion={reduceMotion} theme={theme} />
            {tier === 3 && <WaveCall wave={wave} of={cfg.waves.length} reduceMotion={reduceMotion} theme={theme} />}
            {tier === 3 && wave > 0 && (
              <View style={{ pointerEvents: "none", position: "absolute", right: space.sm, bottom: space.sm }}>
                <Txt variant="micro" color={palette.mint}>
                  {tr(TXT.wave, { n: wave, of: cfg.waves.length })}
                </Txt>
              </View>
            )}
            {outcome && <Banner outcome={outcome} theme={theme} />}
          </View>
        </GestureDetector>
      </MiniStage>

      <View style={{ height: STRIP_H, paddingHorizontal: space.md, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <View>
          <View style={{ height: 13 }}>
            <Txt variant="micro" color={theme.inkDim}>
              {tr(TXT.hull)}
            </Txt>
          </View>
          <View style={{ flexDirection: "row", gap: 3 }}>
            {Array.from({ length: cfg.hullMax }, (_, i) => (
              <View key={i} style={{ width: 20, height: 8, borderRadius: 2, backgroundColor: i < stats.hull ? hullColor : theme.ledOff, opacity: i < stats.hull ? 1 : 0.55 }} />
            ))}
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingTop: 2 }}>
          <Txt variant="micro" color={theme.inkDim}>
            {tr(TXT.accuracy)}
          </Txt>
          <View style={{ backgroundColor: theme.lcdBg, borderRadius: radius.lcd, paddingHorizontal: space.sm, minWidth: 58, height: 22, alignItems: "flex-end", justifyContent: "center" }}>
            <Txt variant="lcdS" color={acc < 60 ? theme.lcdWarn : theme.lcdOn}>
              {`${acc} %`}
            </Txt>
          </View>
        </View>
      </View>
    </View>
  );
}

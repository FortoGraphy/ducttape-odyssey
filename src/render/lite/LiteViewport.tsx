// Fallback renderer: react-native-svg + Reanimated only, no Skia anywhere in this folder. Same
// props and the same scene layout as the full renderer at lower fidelity: gradient nebula, three
// stepped star layers, a CPU-rendered pixel planet, the procedural pixel sprites as SVG paths,
// basic bursts. Animations are view transforms driven on the UI thread; nothing re-renders per frame.
import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Ref } from "react";
import { PixelRatio, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import type { FrameInfo, SharedValue } from "react-native-reanimated";
import Svg, { Circle, Defs, Ellipse, G, Line, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import type { ViewportBurst, ViewportHandle, ViewportProps } from "../types";

import { PAL_HEX, hex } from "./common/palette";
import { buildPlanetSprite } from "./common/planetCpu";
import { compileScene, computeLayout, nebulaKeys, salvageX, salvageY, starLook } from "./common/scene";
import { FRAME_ID, SHIP_EMITTER, SHIP_NOZZLE, getSpriteSet, spritePaths } from "./common/sprites";
import type { Sprite } from "./common/sprites";

export interface LiteViewportProps extends ViewportProps {
  ref?: Ref<ViewportHandle>;
}

function rng(seed: number) {
  let a = (seed * 2654435761 + 12345) >>> 0;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

/** 0..1 repeating value; cancelled (frozen) while inactive. */
function useLoop(durationMs: number, active: boolean, steps = 0, reverse = false): SharedValue<number> {
  const v = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      cancelAnimation(v);
      return;
    }
    v.value = 0;
    v.value = withRepeat(withTiming(1, { duration: durationMs, easing: steps > 0 ? Easing.steps(steps, false) : Easing.linear }), -1, reverse);
    return () => cancelAnimation(v);
  }, [durationMs, active, steps, reverse, v]);
  return v;
}

const PixelSprite = memo(function PixelSprite({ sprite, lights, scale, opacity }: { sprite: Sprite; lights: boolean; scale: number; opacity?: number }) {
  const paths = useMemo(() => spritePaths(sprite, lights), [sprite, lights]);
  return (
    <Svg width={sprite.w * scale} height={sprite.h * scale} viewBox={`0 0 ${sprite.w} ${sprite.h}`} opacity={opacity}>
      {paths.map((p) => (
        <Path key={p.color} d={p.d} fill={PAL_HEX[p.color]} />
      ))}
    </Svg>
  );
});

/** A sprite centred on an internal-pixel position, optionally bobbing by whole pixels. */
function Placed({
  sprite,
  x,
  y,
  scale,
  lights = true,
  bob,
  bobPx = 0,
  opacity,
}: {
  sprite: Sprite;
  x: number;
  y: number;
  scale: number;
  lights?: boolean;
  bob?: SharedValue<number>;
  bobPx?: number;
  opacity?: number;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: bob ? Math.round((bob.value - 0.5) * 2 * bobPx) * scale : 0 }],
  }));
  return (
    <Animated.View style={[{ position: "absolute", left: Math.round(x - sprite.w / 2) * scale, top: Math.round(y - sprite.h / 2) * scale }, style]}>
      <PixelSprite sprite={sprite} lights={lights} scale={scale} opacity={opacity} />
    </Animated.View>
  );
}

const StarLayer = memo(function StarLayer({
  seed,
  count,
  colors,
  pxW,
  pxH,
  scale,
  speed,
  active,
  streak,
}: {
  seed: number;
  count: number;
  colors: string[];
  pxW: number;
  pxH: number;
  scale: number;
  speed: number;
  active: boolean;
  streak: number;
}) {
  const span = pxW + 16;
  const stars = useMemo(() => {
    const r = rng(seed);
    const out: { x: number; y: number; c: string }[] = [];
    for (let i = 0; i < count; i++) out.push({ x: Math.floor(r() * span), y: Math.floor(r() * pxH), c: colors[Math.floor(r() * colors.length)] });
    return out;
  }, [seed, count, colors, span, pxH]);
  const drift = useLoop(Math.max(400, (span / Math.max(0.05, speed)) * 1000), active && speed > 0, span);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: -Math.round(drift.value * span) * scale }] }));
  const w = Math.max(1, Math.round(streak));
  return (
    <Animated.View style={[{ position: "absolute", left: 0, top: 0 }, style]}>
      <Svg width={span * 2 * scale} height={pxH * scale} viewBox={`0 0 ${span * 2} ${pxH}`}>
        {stars.map((s, i) => (
          <G key={i}>
            <Rect x={s.x} y={s.y} width={w} height={1} fill={s.c} />
            <Rect x={s.x + span} y={s.y} width={w} height={1} fill={s.c} />
          </G>
        ))}
      </Svg>
    </Animated.View>
  );
});

const BURST_COLORS: Record<ViewportBurst, string[]> = {
  collect: ["mint", "teal2"],
  impact: ["yellow", "orange"],
  jump: ["cobalt2", "violet3"],
  spark: ["yellow", "amber"],
  levelUp: ["yellow", "lime"],
  explosion: ["amber", "red1"],
  scan: ["mint", "teal1"],
};
const BURST_DOTS = 10;

interface BurstSlotHandle {
  fire(kind: ViewportBurst, x: number, y: number): void;
}

function BurstSlot({ scale, ref }: { scale: number; ref: Ref<BurstSlotHandle> }) {
  const [look, setLook] = useState<{ kind: ViewportBurst; x: number; y: number }>({ kind: "spark", x: 0, y: 0 });
  const p = useSharedValue(1);
  useImperativeHandle(
    ref,
    () => ({
      fire(kind, x, y) {
        setLook({ kind, x, y });
        p.value = 0;
        p.value = withTiming(1, { duration: kind === "explosion" || kind === "jump" ? 700 : 480, easing: Easing.out(Easing.quad) });
      },
    }),
    [p]
  );
  const style = useAnimatedStyle(() => ({ opacity: p.value >= 1 ? 0 : 1 - p.value * p.value, transform: [{ scale: 0.2 + p.value * 0.8 }] }));
  const reach = (look.kind === "explosion" || look.kind === "jump" || look.kind === "scan" ? 30 : 16) * scale;
  const colors = BURST_COLORS[look.kind];
  return (
    <Animated.View style={[{ position: "absolute", left: look.x - reach, top: look.y - reach, width: reach * 2, height: reach * 2 }, style]}>
      {Array.from({ length: BURST_DOTS }, (_, i) => {
        const a = (i / BURST_DOTS) * Math.PI * 2;
        const r = reach * (i % 2 ? 0.95 : 0.6);
        const s = (i % 3 === 0 ? 2 : 1) * scale;
        return (
          <View
            key={i}
            style={{
              position: "absolute",
              left: Math.round(reach + Math.cos(a) * r),
              top: Math.round(reach + Math.sin(a) * r),
              width: s,
              height: s,
              backgroundColor: hex(colors[i % 2]),
            }}
          />
        );
      })}
    </Animated.View>
  );
}

function perfTick(total: SharedValue<number>, frames: SharedValue<number>, elapsedMs: number, report: (ms: number) => void) {
  "worklet";
  total.value += elapsedMs;
  frames.value += 1;
  if (total.value >= 1000) {
    scheduleOnRN(report, total.value / frames.value);
    total.value = 0;
    frames.value = 0;
  }
}

const BURST_SLOTS = [0, 1, 2, 3];
const HAZARD_TINT = ["", "rust1", "cobalt0", "violet1", "green0", "steel0", "cobalt0"];

export default function LiteViewport({ width, height, scene, quality, onPerf, ref }: LiteViewportProps) {
  const layout = useMemo(() => computeLayout(width, height, PixelRatio.get()), [width, height]);
  const { pxW: W, pxH: H, scale } = layout;
  const sc = useMemo(() => compileScene(scene), [scene]);
  const active = !quality.paused;
  const calm = quality.reduceMotion ? 0.25 : 1;
  const sprites = useMemo(() => getSpriteSet(scene.ship.paint).sprites, [scene.ship.paint]);
  const look = starLook(scene.star);
  const neb = useMemo(() => nebulaKeys(scene.star, scene.systemSeed), [scene.star, scene.systemSeed]);

  const warp = sc.mode === 2;
  const docked = sc.mode === 3;
  const orbit = sc.planet === 1 && !warp;
  // quantized so a 10 Hz thrust change does not restart the drift loops
  const thrustLevel = sc.thrust > 0.66 ? 1 : sc.thrust > 0.25 ? 0.6 : 0.3;
  const speed = (warp ? 60 : (0.22 + thrustLevel * 0.9) * (docked ? 0.06 : 1)) * calm;

  let shipX = W * 0.4;
  let shipY = H * 0.56;
  if (sc.mode === 1 && sc.planet === 1) {
    shipX = W * 0.34;
    shipY = H * 0.64;
  } else if (warp) {
    shipX = W * 0.42;
    shipY = H * 0.53;
  } else if (docked) {
    shipX = W - 6 - 64 - SHIP_EMITTER.x - 1;
    shipY = H * 0.5 - SHIP_EMITTER.y;
  }
  shipX = Math.round(shipX);
  shipY = Math.round(shipY);

  const pR = Math.round((sc.pRings ? 22 : 26) + sc.pSize * (sc.pRings ? 16 : 26));
  const pCx = Math.round(W * (sc.pRings ? 0.66 : 0.7) + (pR - 26) * 0.2);
  const pCy = Math.round(H * 0.3);
  const planet = useMemo(
    () => (sc.planet ? buildPlanetSprite(sc.pKind, sc.pSeed, pR, sc.pRings === 1, sc.pRampIdx) : null),
    // pHash covers kind, seed, size, rings and ramp
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sc.pHash]
  );

  const bob = useLoop(2600 / (0.4 + 0.6 * calm), active, 0, true);
  const flicker = useLoop(210, active, 3);
  const spin = useLoop(2300 / calm, active && sc.tumble === 1, 16);
  const blink = useLoop(1400, active, 2);

  const shipStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.round((bob.value - 0.5) * 3) * scale }, { rotate: `${spin.value * 360}deg` }],
  }));
  const flameStyle = useAnimatedStyle(() => ({ opacity: 0.75 + flicker.value * 0.25, transform: [{ scaleX: 0.85 + flicker.value * 0.3 }] }));
  const blinkStyle = useAnimatedStyle(() => ({ opacity: blink.value < 0.5 ? 1 : 0.25 }));

  // imperative effects
  const shakeX = useSharedValue(0);
  const flash = useSharedValue(0);
  const [flashColor, setFlashColor] = useState("#FFFFFF");
  const slots = useRef<(BurstSlotHandle | null)[]>([null, null, null, null]);
  const nextSlot = useRef(0);
  const setSlot = useMemo(
    () =>
      BURST_SLOTS.map((i) => (h: BurstSlotHandle | null) => {
        slots.current[i] = h;
      }),
    []
  );
  const reduce = quality.reduceMotion;
  useImperativeHandle(
    ref,
    () => ({
      burst(kind, x, y) {
        const slot = slots.current[nextSlot.current];
        nextSlot.current = (nextSlot.current + 1) % slots.current.length;
        slot?.fire(kind, x === undefined ? shipX * scale : x * width, y === undefined ? shipY * scale : y * height);
      },
      shake(amount) {
        if (reduce) return;
        const a = Math.round(Math.min(1, Math.max(0, amount)) * 3) * scale;
        shakeX.value = withSequence(withTiming(a, { duration: 40 }), withTiming(-a, { duration: 50 }), withTiming(a / 2, { duration: 50 }), withTiming(0, { duration: 50 }));
      },
      flash(color, ms) {
        if (reduce) return;
        setFlashColor(color);
        flash.value = withSequence(withTiming(0.55, { duration: 30 }), withTiming(0, { duration: ms ?? 160 }));
      },
    }),
    [shipX, shipY, scale, width, height, reduce, shakeX, flash]
  );
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  // perf HUD: average frame interval, measured only while someone listens
  const perfRef = useRef(onPerf);
  useEffect(() => {
    perfRef.current = onPerf;
  }, [onPerf]);
  const report = useCallback((ms: number) => perfRef.current?.(ms, 0), []);
  const perfT = useSharedValue(0);
  const perfN = useSharedValue(0);
  const onFrame = useCallback(
    (info: FrameInfo) => {
      "worklet";
      perfTick(perfT, perfN, info.timeSincePreviousFrame ?? 16.7, report);
    },
    [perfT, perfN, report]
  );
  const perfLoop = useFrameCallback(onFrame, false);
  const wantsPerf = onPerf !== undefined && active;
  useEffect(() => {
    perfLoop.setActive(wantsPerf);
  }, [perfLoop, wantsPerf, onFrame]);

  const farColors = useMemo(() => [hex("steel0"), hex("steel1"), hex("void3")], []);
  const midColors = useMemo(() => [hex("steel2"), hex("steel1"), hex("cobalt1"), hex("violet2")], []);
  const nearColors = useMemo(() => [hex("bone1"), hex("bone2"), hex("cobalt2"), hex("amber")], []);
  const warpColors = useMemo(() => [hex("cobalt2"), hex("violet3"), hex("bone2")], []);

  const nebBlobs = useMemo(() => {
    const r = rng(scene.systemSeed + 7);
    return [0, 1, 2].map((i) => ({ cx: r() * W, cy: r() * H, rx: 50 + r() * 60, ry: 30 + r() * 40, c: hex((i === 1 ? neb[1] : neb[0])[i === 2 ? 3 : 4]) }));
  }, [scene.systemSeed, W, H, neb]);

  const lights = sc.powerOut === 0;
  const engineOn = sc.failure !== 4 && sc.thrust > 0.03 && sc.tumble === 0 && !docked;
  const flameLen = Math.round((3 + sc.thrust * 9) * (1 + sc.overdrive * 0.5 + (warp ? 0.8 : 0)));
  const trail = sc.trail;
  const mining = sc.mining === 1 && !docked && !warp && sc.tumble === 0;
  const ex = shipX + SHIP_EMITTER.x;
  const ey = shipY + SHIP_EMITTER.y;
  let bx = shipX + 53;
  let by = shipY + 3;
  if (orbit && sc.mode === 1) {
    const dx = ex - pCx;
    const dy = ey - pCy;
    const d = Math.hypot(dx, dy) + 0.001;
    bx = Math.round(pCx + (dx / d) * pR * 0.86);
    by = Math.round(pCy + (dy / d) * pR * 0.86);
  }
  const hz = sc.hazard === 0 && sc.failure === 6 ? 3 : sc.hazard;
  const tint = hz ? hex(HAZARD_TINT[hz]) : sc.failure === 7 || sc.failure === 2 ? hex("red0") : null;
  const sx = Math.round(W * 0.17);
  const sy = Math.round(H * 0.19);

  return (
    <View style={{ width, height, backgroundColor: hex("void0"), overflow: "hidden" }} pointerEvents="none">
      <Animated.View style={[{ position: "absolute", left: layout.offX, top: layout.offY, width: W * scale, height: H * scale }, shakeStyle]}>
        <Svg width={W * scale} height={H * scale} viewBox={`0 0 ${W} ${H}`} style={StyleSheet.absoluteFill}>
          <Defs>
            {nebBlobs.map((b, i) => (
              <RadialGradient key={i} id={`neb${i}`} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={b.c} stopOpacity={warp ? 0.25 : 0.85} />
                <Stop offset="0.6" stopColor={b.c} stopOpacity={warp ? 0.08 : 0.3} />
                <Stop offset="1" stopColor={b.c} stopOpacity="0" />
              </RadialGradient>
            ))}
            <RadialGradient id="sun" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={hex(look.ramp[2])} stopOpacity="0.55" />
              <Stop offset="1" stopColor={hex(look.ramp[1])} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={W} height={H} fill={hex("void0")} />
          {nebBlobs.map((b, i) => (
            <Ellipse key={i} cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry} fill={`url(#neb${i})`} />
          ))}
          {!warp && (
            <G>
              <Circle cx={sx} cy={sy} r={look.r * 5} fill="url(#sun)" />
              {look.kind === 1 ? (
                <G>
                  <Ellipse cx={sx} cy={sy} rx={look.r * 3} ry={look.r * 0.9} fill="none" stroke={hex("amber")} strokeWidth={1.5} />
                  <Circle cx={sx} cy={sy} r={look.r} fill={hex("void0")} />
                </G>
              ) : (
                <Circle cx={sx} cy={sy} r={look.r} fill={hex(look.ramp[4])} />
              )}
              {look.kind === 2 && <Circle cx={sx + look.r * 2.9} cy={sy + look.r * 1.3} r={look.r * 0.55} fill={hex(look.ramp[4])} />}
            </G>
          )}
        </Svg>
        <StarLayer seed={scene.systemSeed * 3 + 1} count={34} colors={warp ? warpColors : farColors} pxW={W} pxH={H} scale={scale} speed={speed * 1.6} active={active} streak={warp ? 5 : 1} />
        <StarLayer seed={scene.systemSeed * 3 + 2} count={20} colors={warp ? warpColors : midColors} pxW={W} pxH={H} scale={scale} speed={speed * 4.2} active={active} streak={warp ? 13 : 1} />
        <StarLayer seed={scene.systemSeed * 3 + 3} count={9} colors={warp ? warpColors : nearColors} pxW={W} pxH={H} scale={scale} speed={speed * 10} active={active} streak={warp ? 30 : 1} />

        {orbit && planet && <Placed sprite={planet} x={pCx} y={pCy} scale={scale} />}
        {sc.station === 1 && !docked && !warp && <Placed sprite={sprites[FRAME_ID.station_far]} x={W * 0.84} y={H * 0.74} scale={scale} bob={bob} bobPx={1} />}
        {docked && <Placed sprite={sprites[FRAME_ID.station_0]} x={W - 38} y={H * 0.5} scale={scale} />}
        {!docked && !warp && !orbit && (
          <>
            <Placed sprite={sprites[FRAME_ID.asteroid_3]} x={W * 0.8} y={H * 0.24} scale={scale} bob={bob} bobPx={1} />
            <Placed sprite={sprites[FRAME_ID.asteroid_1]} x={W * 0.62} y={H * 0.86} scale={scale} />
            <Placed sprite={sprites[FRAME_ID.asteroid_5]} x={W * 0.12} y={H * 0.8} scale={scale} bob={bob} bobPx={1} />
          </>
        )}
        {mining && !(orbit && sc.mode === 1) && <Placed sprite={sprites[FRAME_ID.asteroid_4]} x={shipX + 58} y={shipY + 1} scale={scale} />}
        {scene.salvage.slice(0, sc.salN).map((s, i) => (
          <Placed key={s.uid} sprite={sprites[FRAME_ID.salvage_crate + sc.salKind[i]]} x={salvageX(s.x, W)} y={salvageY(s.y, H)} scale={scale} bob={bob} bobPx={i % 2 ? 2 : 1} />
        ))}
        {sc.tow === 1 && <Placed sprite={sprites[FRAME_ID.tow_0]} x={shipX + 62} y={shipY - 12} scale={scale} bob={bob} bobPx={1} />}
        {sc.failure === 7 && (
          <>
            <Placed sprite={sprites[FRAME_ID.pirate_0]} x={shipX - 22} y={shipY - 44} scale={scale} bob={bob} bobPx={1} />
            <Placed sprite={sprites[FRAME_ID.pirate_1]} x={shipX + 34} y={shipY + 40} scale={scale} />
          </>
        )}
        {sc.failure === 8 && (
          <Svg width={W * scale} height={H * scale} viewBox={`0 0 ${W} ${H}`} style={StyleSheet.absoluteFill}>
            <Circle cx={W * 0.74} cy={H * 0.36} r={12} fill={hex("violet2")} opacity={0.35} />
            <Circle cx={W * 0.74} cy={H * 0.36} r={5} fill={hex("void0")} stroke={hex("violet3")} strokeWidth={1} />
          </Svg>
        )}
        {Array.from({ length: sc.drones }, (_, i) => {
          const a = (i * Math.PI * 2) / Math.max(1, sc.drones) + 0.6;
          return <Placed key={i} sprite={sprites[FRAME_ID.drone_hauler_0 + (i % 4) * 4]} x={shipX + Math.cos(a) * (36 + i * 3)} y={shipY - 3 + Math.sin(a) * (17 + i * 2)} scale={scale} bob={bob} bobPx={i % 2 ? 1 : 2} />;
        })}

        {mining && (
          <Animated.View style={[StyleSheet.absoluteFill, flameStyle]}>
            <Svg width={W * scale} height={H * scale} viewBox={`0 0 ${W} ${H}`}>
              <Line x1={ex} y1={ey} x2={bx} y2={by} stroke={hex(sc.overdrive ? "amber" : "red1")} strokeWidth={3} />
              <Line x1={ex} y1={ey} x2={bx} y2={by} stroke={hex("bone2")} strokeWidth={1} />
              <Rect x={bx - 1} y={by - 1} width={3} height={3} fill={hex("bone2")} />
            </Svg>
          </Animated.View>
        )}

        <Animated.View style={[{ position: "absolute", left: (shipX - 28) * scale, top: (shipY - 28) * scale, width: 56 * scale, height: 56 * scale }, shipStyle]}>
          {engineOn && (
            <Animated.View style={[{ position: "absolute", left: (28 + SHIP_NOZZLE.x + 1 - flameLen) * scale, top: (28 + SHIP_NOZZLE.y - 4) * scale, transformOrigin: "right" }, flameStyle]}>
              <Svg width={flameLen * scale} height={9 * scale} viewBox={`0 0 ${flameLen} 9`}>
                <Rect x={0} y={3} width={flameLen} height={3} fill={PAL_HEX[trail[2]]} />
                <Rect x={flameLen * 0.25} y={1} width={flameLen * 0.75} height={7} fill={PAL_HEX[trail[2]]} />
                <Rect x={flameLen * 0.55} y={0} width={flameLen * 0.45} height={9} fill={PAL_HEX[trail[2]]} />
                <Rect x={flameLen * 0.4} y={3} width={flameLen * 0.6} height={3} fill={PAL_HEX[trail[1]]} />
                <Rect x={flameLen * 0.7} y={3} width={flameLen * 0.3} height={3} fill={hex(sc.overdrive ? "cobalt2" : "yellow")} />
              </Svg>
            </Animated.View>
          )}
          <PixelSprite sprite={sprites[FRAME_ID.ship_00]} lights={lights} scale={scale} opacity={lights ? 1 : 0.55} />
          {sc.damage > 0.3 && (
            <Animated.View style={[{ position: "absolute", left: 20 * scale, top: 22 * scale, width: scale * 2, height: scale * 2, backgroundColor: hex("yellow") }, blinkStyle]} />
          )}
          {sc.damage > 0.5 && (
            <Animated.View style={[{ position: "absolute", left: 8 * scale, top: 14 * scale, width: scale * 3, height: scale * 3, backgroundColor: hex("steel1") }, flameStyle]} />
          )}
          {sc.charge > 0.05 && !warp && (
            <Animated.View style={[{ position: "absolute", left: 2 * scale, top: 26 * scale, width: scale * 4, height: scale * 6, backgroundColor: hex("cobalt2"), opacity: sc.charge }, blinkStyle]} />
          )}
        </Animated.View>

        {tint && <View style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: hz === 4 || hz === 2 ? 0.3 : 0.2 }]} />}
        <Svg width={W * scale} height={H * scale} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="vig" cx="50%" cy="50%" r="72%">
              <Stop offset="0.45" stopColor="#000000" stopOpacity="0" />
              <Stop offset="1" stopColor="#000000" stopOpacity="0.5" />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width="100%" height="100%" fill="url(#vig)" />
        </Svg>
        {BURST_SLOTS.map((i) => (
          <BurstSlot key={i} scale={scale} ref={setSlot[i]} />
        ))}
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: flashColor }, flashStyle]} />
    </View>
  );
}

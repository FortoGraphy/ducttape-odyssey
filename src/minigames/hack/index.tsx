// Hacking: rotate pipe tiles until the source on the left feeds every lock on the right.
// Tier 1: 4x4, only the route has pipes. Tier 2: 5x5 with dead-end branches. Tier 3: 6x6, two locks,
// a few locked tiles and an ICE that turns one solved tile back every few seconds.
// The board is discrete, so React state holds it; only rotations, flashes and bars animate on the UI
// thread. Power is recomputed by a flood fill when a tile changes, never per frame.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Path, Rect } from "react-native-svg";

import type { L10n } from "@/engine/types";
import { tr } from "@/i18n";
import { MINI_HUD_HEIGHT, MiniHud, MiniStage, haptic, miniRng, sfx, useCountdown, useMiniTheme } from "@/minigames/shared";
import { makeResult, type MinigameMeta, type MinigameProps } from "@/minigames/types";
import { Txt } from "@/ui/kit/Txt";
import { palette, radius, space, type PanelTheme } from "@/ui/theme";

import { DIR_E, DIR_N, DIR_S, DIR_W, HACK_SPEC, SHAPE_MASK, clicksBetween, computePower, generateBoard, hackScore, pathProgress, pickIceTarget, type HackBoard, type Shape } from "./logic";

export const meta: MinigameMeta = {
  id: "hack",
  name: { cs: "Hackování", en: "Hacking" },
  hint: { cs: "Klepnutím otáčej dlaždice a propoj zdroj se zámkem.", en: "Tap tiles to rotate them and wire the source to the lock." },
  icon: "mg_hack",
  seconds: [45, 60, 80],
};

/** Test-route hooks; the real host never passes this. */
export interface HackDebug {
  autoplay?: "win" | "lose";
  seconds?: number;
}

const TXT = {
  moves: { cs: "TAHY", en: "MOVES" },
  par: { cs: "NORMA", en: "PAR" },
  limit: { cs: "LIMIT", en: "LIMIT" },
  locks: { cs: "ZÁMKY", en: "LOCKS" },
  lock: { cs: "ZÁMEK", en: "LOCK" },
  ice: { cs: "ICE", en: "ICE" },
  win: { cs: "PŘÍSTUP POVOLEN", en: "ACCESS GRANTED" },
  lockout: { cs: "TERMINÁL ZAMČEN", en: "TERMINAL LOCKED" },
  timeout: { cs: "SPOJENÍ VYPRŠELO", en: "CONNECTION TIMED OUT" },
  kipp: [
    { cs: "> KIPP: zámek je hloupější než ty. Většinou.", en: "> KIPP: the lock is dumber than you. Mostly." },
    { cs: "> KIPP: slepé větve nikam nevedou. Od toho jsou slepé.", en: "> KIPP: dead ends lead nowhere. Hence the name." },
    { cs: "> KIPP: ICE ti občas něco pootočí. Neber si to osobně.", en: "> KIPP: the ICE will undo your work. Nothing personal." },
  ],
  how: [
    { cs: "Klepnutím otoč dlaždici. Propoj zdroj se zámkem.", en: "Tap a tile to rotate it. Wire the source to the lock." },
    { cs: "Klepnutím otoč dlaždici. Propoj zdroj se zámkem.", en: "Tap a tile to rotate it. Wire the source to the lock." },
    { cs: "Propoj zdroj s oběma zámky. Dlaždice s visacím zámkem se neotáčí.", en: "Wire the source to both locks. Padlocked tiles do not turn." },
  ],
} satisfies Record<string, L10n | L10n[]>;

// Tiles turn on touch-down. react-native-web delays press-in by 50 ms and drops it for quicker clicks;
// its (untyped) delayPressIn prop turns that off. Native has no such delay.
const WEB_PRESS: object | null = Platform.OS === "web" ? { delayPressIn: 0 } : null;

const STRIP_H = 36;
const TERMINAL_W = 26;
const LEDS = 16;
const OUTRO_MS = 750;

type Outcome = "win" | "lockout" | "timeout";

const mod4 = (v: number): number => ((v % 4) + 4) % 4;
const pad2 = (v: number): string => (v < 10 ? `0${v}` : String(v));

/** One pipe piece in its canonical orientation; the parent view rotates it. */
const Pipe = memo(function Pipe({ shape, powered, size }: { shape: Shape; powered: boolean; size: number }) {
  const m = SHAPE_MASK[shape];
  let d = "";
  if (m & DIR_N) d += "M50 50V0";
  if (m & DIR_E) d += "M50 50H100";
  if (m & DIR_S) d += "M50 50V100";
  if (m & DIR_W) d += "M50 50H0";
  const casing = powered ? palette.teal1 : palette.teal0;
  const core = powered ? palette.mint : palette.teal1;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {powered && <Path d={d} stroke={palette.mint} strokeOpacity={0.22} strokeWidth={40} strokeLinecap="butt" fill="none" />}
      <Path d={d} stroke={casing} strokeWidth={26} strokeLinecap="butt" fill="none" />
      <Path d={d} stroke={core} strokeWidth={12} strokeLinecap="butt" fill="none" />
      {powered && <Path d={d} stroke="#C9F5D5" strokeWidth={4} strokeLinecap="butt" fill="none" />}
      <Rect x={33} y={33} width={34} height={34} rx={6} fill={casing} />
      <Rect x={40} y={40} width={20} height={20} rx={3} fill={powered ? "#C9F5D5" : core} />
    </Svg>
  );
});

function Padlock({ size, body, open }: { size: number; body: string; open?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Path d={open ? "M5 8V5a3 3 0 0 1 6 0" : "M5 8V5.5a3 3 0 0 1 6 0V8"} stroke={body} strokeWidth={2} fill="none" strokeLinecap="round" />
      <Rect x={3} y={7.5} width={10} height={7} rx={1.5} fill={body} />
      <Rect x={7.2} y={9.6} width={1.6} height={3} rx={0.8} fill="#0B100E" />
    </Svg>
  );
}

interface TileProps {
  index: number;
  shape: Shape;
  turns: number;
  powered: boolean;
  locked: boolean;
  /** Bumps whenever the ICE hits this tile. */
  zap: number;
  /** Bumps whenever the player taps this locked tile. */
  nudge: number;
  size: number;
  left: number;
  top: number;
  reduceMotion: boolean;
  theme: PanelTheme;
  onTap(index: number): void;
}

const Tile = memo(function Tile({ index, shape, turns, powered, locked, zap, nudge, size, left, top, reduceMotion, theme, onTap }: TileProps) {
  const angle = useSharedValue(turns * 90);
  const flash = useSharedValue(0);
  const shake = useSharedValue(0);
  const pop = useSharedValue(0);
  const wasPowered = useRef(powered);

  useEffect(() => {
    angle.value = reduceMotion ? turns * 90 : withTiming(turns * 90, { duration: 110, easing: Easing.out(Easing.cubic) });
  }, [turns, reduceMotion, angle]);

  useEffect(() => {
    if (zap > 0) flash.value = withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: reduceMotion ? 900 : 620 }));
  }, [zap, reduceMotion, flash]);

  useEffect(() => {
    if (nudge > 0 && !reduceMotion) shake.value = withSequence(withTiming(1, { duration: 40 }), withTiming(-1, { duration: 70 }), withTiming(0, { duration: 60 }));
  }, [nudge, reduceMotion, shake]);

  useEffect(() => {
    if (powered && !wasPowered.current && !reduceMotion) pop.value = withSequence(withTiming(1, { duration: 70 }), withTiming(0, { duration: 180 }));
    wasPowered.current = powered;
  }, [powered, reduceMotion, pop]);

  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }, { scale: 1 + pop.value * 0.06 }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.75 }));
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value * 2.5 }] }));

  if (shape === "blank") {
    return (
      <View style={{ pointerEvents: "none", position: "absolute", left, top, width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 4, height: 4, borderRadius: 1, backgroundColor: theme.lcdDim }} />
      </View>
    );
  }

  return (
    <Pressable
      testID={`hack-tile-${index}`}
      accessibilityRole="button"
      {...WEB_PRESS}
      onPressIn={() => onTap(index)}
      style={{ position: "absolute", left, top, width: size, height: size }}
    >
      <Animated.View style={[StyleSheet.absoluteFill, shakeStyle]}>
        <View
          style={{
            position: "absolute",
            left: 1.5,
            top: 1.5,
            right: 1.5,
            bottom: 1.5,
            borderRadius: 5,
            backgroundColor: locked ? palette.steel0 : theme.lcdDim,
            opacity: locked ? 0.9 : 0.6,
            borderWidth: 1,
            borderColor: locked ? palette.steel1 : theme.lcdDim,
          }}
        />
        <Animated.View style={[{ width: size, height: size }, spin]}>
          <Pipe shape={shape} powered={powered} size={size} />
        </Animated.View>
        {locked && (
          <View style={{ pointerEvents: "none", position: "absolute", right: 3, top: 3, width: 16, height: 16, borderRadius: 4, backgroundColor: theme.lcdBg, alignItems: "center", justifyContent: "center" }}>
            <Padlock size={12} body={palette.yellow} />
          </View>
        )}
        <Animated.View style={[{ pointerEvents: "none", position: "absolute", left: 1.5, top: 1.5, right: 1.5, bottom: 1.5, borderRadius: 5, backgroundColor: palette.red1 }, flashStyle]} />
      </Animated.View>
    </Pressable>
  );
});

/** Source plug (left) or door lock (right) with the stub that enters the board. */
function Terminal({ kind, powered, x, y, tile, theme }: { kind: "source" | "sink"; powered: boolean; x: number; y: number; tile: number; theme: PanelTheme }) {
  const stubH = Math.round(tile * 0.12);
  const lit = kind === "source" || powered;
  const boxW = TERMINAL_W - 6;
  const boxH = Math.min(34, tile - 10);
  return (
    <View style={{ pointerEvents: "none", position: "absolute", left: x, top: y, width: TERMINAL_W, height: tile, justifyContent: "center" }}>
      <View style={{ position: "absolute", left: 0, right: 0, top: (tile - stubH * 2.2) / 2, height: stubH * 2.2, backgroundColor: lit ? palette.teal1 : palette.teal0 }} />
      <View style={{ position: "absolute", left: 0, right: 0, top: (tile - stubH) / 2, height: stubH, backgroundColor: lit ? palette.mint : palette.teal1 }} />
      <View
        style={{
          alignSelf: kind === "source" ? "flex-start" : "flex-end",
          width: boxW,
          height: boxH,
          borderRadius: 5,
          backgroundColor: kind === "source" ? theme.orange : powered ? theme.mint : palette.steel1,
          borderWidth: 1,
          borderColor: theme.lcdBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {kind === "source" ? (
          <Svg width={14} height={14} viewBox="0 0 16 16">
            <Path d="M9.5 1 3.5 9h3.6L6 15l6.5-8.4H8.7z" fill="#15171C" />
          </Svg>
        ) : (
          <Padlock size={15} body={powered ? "#15171C" : palette.steel3} open={powered} />
        )}
      </View>
    </View>
  );
}

function Banner({ outcome, theme }: { outcome: Outcome; theme: PanelTheme }) {
  const color = outcome === "win" ? theme.mint : outcome === "lockout" ? theme.red : theme.orange;
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

export default function HackGame({ tier, seed, width, height, reduceMotion, onFinish, debug }: MinigameProps & { debug?: HackDebug }) {
  const theme = useMiniTheme();
  const spec = HACK_SPEC[tier];
  const seconds = debug?.seconds ?? meta.seconds[tier - 1];

  const board = useMemo<HackBoard>(() => generateBoard(tier, miniRng(seed)), [tier, seed]);
  const iceRnd = useMemo(() => miniRng(seed ^ 0x1ce1ce), [seed]);

  // `turns` counts quarter turns without wrapping so the animation always takes the short way.
  const [turns, setTurns] = useState<number[]>(() => board.rot.slice());
  const [moves, setMoves] = useState(0);
  const [iceHits, setIceHits] = useState(0);
  const [zaps, setZaps] = useState<number[]>(() => board.rot.map(() => 0));
  const [nudges, setNudges] = useState<number[]>(() => board.rot.map(() => 0));
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const turnsRef = useRef(turns);
  const movesRef = useRef(0);
  const iceRef = useRef(0);
  const sinksRef = useRef(0);
  const done = useRef(false);
  const outro = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishRef = useRef(onFinish);

  const power = useMemo(() => computePower(board, turns.map(mod4)), [board, turns]);
  const par = board.par + iceHits;
  const budget = board.budget + iceHits * 2;

  const ice = useSharedValue(1);

  const endRef = useRef<(kind: Outcome) => void>(() => {});
  const countdown = useCountdown(seconds, () => endRef.current("timeout"));
  const startedAt = countdown.startedAt;
  const stopCountdown = countdown.stop;

  const end = useCallback(
    (kind: Outcome) => {
      if (done.current) return;
      done.current = true;
      stopCountdown();
      cancelAnimation(ice);
      const rot = turnsRef.current.map(mod4);
      const elapsed = (Date.now() - startedAt) / 1000;
      const score = hackScore({
        solved: kind === "win",
        moves: movesRef.current,
        par: board.par + iceRef.current,
        timeLeft: Math.max(0, 1 - elapsed / seconds),
        progress: pathProgress(board, rot),
      });
      setOutcome(kind);
      if (kind === "win") {
        sfx("success");
        haptic("success");
      } else {
        sfx(kind === "lockout" ? "alarm" : "fail");
        haptic("error");
      }
      const result = makeResult(score, startedAt);
      outro.current = setTimeout(() => finishRef.current(result), OUTRO_MS);
    },
    // stopCountdown is recreated every render but only touches refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board, seconds, ice, startedAt],
  );
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

  const tap = useCallback(
    (i: number) => {
      if (done.current || board.shape[i] === "blank") return;
      if (board.locked[i]) {
        sfx("deny");
        haptic("warning");
        setNudges((prev) => {
          const next = prev.slice();
          next[i]++;
          return next;
        });
        return;
      }
      const next = turnsRef.current.slice();
      next[i]++;
      turnsRef.current = next;
      movesRef.current++;
      setTurns(next);
      setMoves(movesRef.current);
      const now = computePower(board, next.map(mod4));
      const sinksOn = now.sinks.filter(Boolean).length;
      haptic("detent");
      sfx("knobTick");
      if (sinksOn > sinksRef.current) {
        sfx("beepGood");
        haptic("impact");
      }
      sinksRef.current = sinksOn;
      if (now.solved) end("win");
      else if (movesRef.current >= board.budget + iceRef.current * 2) end("lockout");
    },
    [board, end],
  );

  // ICE: every `iceEvery` seconds one solved path tile is turned back by a quarter.
  useEffect(() => {
    if (spec.iceEvery <= 0) return;
    const arm = () => {
      ice.set(1);
      ice.set(withTiming(0, { duration: spec.iceEvery * 1000, easing: Easing.linear }));
    };
    arm();
    const id = setInterval(() => {
      if (done.current) return;
      arm();
      const rot = turnsRef.current.map(mod4);
      const i = pickIceTarget(board, rot, iceRnd);
      if (i < 0) return;
      const next = turnsRef.current.slice();
      next[i]--;
      turnsRef.current = next;
      iceRef.current++;
      sinksRef.current = computePower(board, next.map(mod4)).sinks.filter(Boolean).length;
      setTurns(next);
      setIceHits(iceRef.current);
      setZaps((prev) => {
        const z = prev.slice();
        z[i]++;
        return z;
      });
      sfx("zap");
      haptic("warning");
    }, spec.iceEvery * 1000);
    return () => {
      clearInterval(id);
      cancelAnimation(ice);
    };
  }, [board, spec.iceEvery, ice, iceRnd]);

  // Test-route autoplay: goes through the same tap() as a finger.
  const autoplay = debug?.autoplay;
  useEffect(() => {
    if (!autoplay) return;
    const id = setInterval(
      () => {
        if (done.current) return;
        const rot = turnsRef.current.map(mod4);
        if (autoplay === "win") {
          for (let i = 0; i < rot.length; i++) {
            if (board.onPath[i] && !board.locked[i] && clicksBetween(board.shape[i], rot[i], board.solution[i]) > 0) return tap(i);
          }
        } else {
          let pick = -1;
          for (let i = 0; i < rot.length && pick < 0; i++) if (!board.onPath[i] && !board.locked[i] && board.shape[i] !== "blank") pick = i;
          for (let i = 0; i < rot.length && pick < 0; i++) if (!board.locked[i] && board.shape[i] !== "blank") pick = i;
          if (pick >= 0) tap(pick);
        }
      },
      autoplay === "win" ? 260 : 70,
    );
    return () => clearInterval(id);
  }, [autoplay, board, tap]);

  // Layout.
  const stageH = height - MINI_HUD_HEIGHT - STRIP_H;
  const innerW = width - 2 * space.sm - 2;
  const innerH = stageH - 2 * space.sm - 2;
  const n = board.size;
  const tile = Math.max(40, Math.min(68, Math.floor((innerW - 2 * TERMINAL_W) / n), Math.floor((innerH - 4) / n)));
  const boardW = tile * n;
  const free = innerH - boardW;
  const showText = free >= 76;
  const boardLeft = Math.round((innerW - boardW) / 2);
  const boardTop = Math.round((innerH - boardW) / 2);

  const parIdx = Math.max(1, Math.min(LEDS - 2, Math.round((par / budget) * LEDS)));
  const lit = Math.min(LEDS, Math.ceil((moves / budget) * LEDS));
  const ledSize = 8;
  const ledGap = 3;
  const ledsW = LEDS * ledSize + (LEDS - 1) * ledGap;
  const parX = parIdx * (ledSize + ledGap) - ledGap / 2;

  const iceBar = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, ice.value)) * 100}%` }));

  return (
    <View style={{ width, height, backgroundColor: theme.body }}>
      <MiniHud title={meta.name} left={countdown.left} score={`${pad2(moves)}/${pad2(par)}`} />
      <MiniStage width={width} height={stageH} dark>
        {showText && (
          <View style={{ pointerEvents: "none", position: "absolute", left: space.sm, right: space.sm, top: Math.max(space.xs, (boardTop - 28) / 2), height: 28, justifyContent: "center" }}>
            <Txt variant="label" color={theme.lcdOn} numberOfLines={2} style={{ opacity: 0.75 }}>
              {tr(TXT.kipp[tier - 1])}
            </Txt>
          </View>
        )}
        <View style={{ position: "absolute", left: boardLeft, top: boardTop, width: boardW, height: boardW }}>
          {board.shape.map((shape, i) => (
            <Tile
              key={i}
              index={i}
              shape={shape}
              turns={turns[i]}
              powered={power.on[i]}
              locked={board.locked[i]}
              zap={zaps[i]}
              nudge={nudges[i]}
              size={tile}
              left={(i % n) * tile}
              top={Math.floor(i / n) * tile}
              reduceMotion={reduceMotion}
              theme={theme}
              onTap={tap}
            />
          ))}
        </View>
        <Terminal kind="source" powered x={boardLeft - TERMINAL_W} y={boardTop + board.sourceRow * tile} tile={tile} theme={theme} />
        {board.sinkRows.map((row, k) => (
          <Terminal key={row} kind="sink" powered={power.sinks[k]} x={boardLeft + boardW} y={boardTop + row * tile} tile={tile} theme={theme} />
        ))}
        {showText && (
          <View style={{ pointerEvents: "none", position: "absolute", left: space.sm, right: space.sm, top: boardTop + boardW + Math.max(space.xs, (free / 2 - 28) / 2), height: 28, justifyContent: "center" }}>
            <Txt variant="label" color={theme.lcdOn} numberOfLines={2} align="center" style={{ opacity: 0.6 }}>
              {tr(TXT.how[tier - 1])}
            </Txt>
          </View>
        )}
        {outcome && <Banner outcome={outcome} theme={theme} />}
      </MiniStage>

      <View style={{ height: STRIP_H, paddingHorizontal: space.md, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <View style={{ width: ledsW }}>
          <View style={{ height: 13 }}>
            <Txt variant="micro" color={theme.inkDim} style={{ position: "absolute", left: 0, top: 0 }}>
              {tr(TXT.moves)}
            </Txt>
            <Txt variant="micro" color={theme.ink} style={{ position: "absolute", left: parX - 30, width: 60, top: 0, textAlign: "center" }}>
              {tr(TXT.par)}
            </Txt>
            <Txt variant="micro" color={theme.inkDim} style={{ position: "absolute", right: 0, top: 0 }}>
              {tr(TXT.limit)}
            </Txt>
          </View>
          <View style={{ flexDirection: "row", gap: ledGap, alignItems: "center" }}>
            {Array.from({ length: LEDS }, (_, j) => {
              const on = j < lit;
              const color = j >= LEDS - 3 ? theme.red : j >= parIdx ? theme.yellow : theme.mint;
              return <View key={j} style={{ width: ledSize, height: ledSize, borderRadius: 2, backgroundColor: on ? color : theme.ledOff, opacity: on ? 1 : 0.55 }} />;
            })}
            <View style={{ pointerEvents: "none", position: "absolute", left: parX - 0.75, top: -3, width: 1.5, height: ledSize + 6, backgroundColor: theme.ink }} />
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: space.md }}>
          {spec.iceEvery > 0 && (
            <View style={{ width: 56 }}>
              <View style={{ height: 13 }}>
                <Txt variant="micro" color={theme.inkDim}>
                  {tr(TXT.ice)}
                </Txt>
              </View>
              <View style={{ height: ledSize, borderRadius: 2, backgroundColor: theme.well, overflow: "hidden" }}>
                <Animated.View style={[{ height: ledSize, backgroundColor: theme.red }, iceBar]} />
              </View>
            </View>
          )}
          <View style={{ alignItems: "flex-end" }}>
            <View style={{ height: 13 }}>
              <Txt variant="micro" color={theme.inkDim}>
                {tr(board.sinkRows.length > 1 ? TXT.locks : TXT.lock)}
              </Txt>
            </View>
            <View style={{ flexDirection: "row", gap: ledGap + 1 }}>
              {power.sinks.map((on, k) => (
                <View key={k} style={{ width: ledSize + 4, height: ledSize, borderRadius: 2, backgroundColor: on ? theme.mint : theme.ledOff, opacity: on ? 1 : 0.55 }} />
              ))}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

// The window onto space plus the active-play controls laid over its lower edge: heat gauge,
// scanner pulse, overdrive, the system caption and the first-run "hold to mine" hint.
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { PixelRatio, Platform, View } from "react-native";
import Animated, { Easing, ReduceMotion, cancelAnimation, useAnimatedProps, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { collectSalvage, pulseScan, setMining, triggerOverdrive } from "@/engine/core";
import { coreDepth } from "@/engine/world";
import { useT } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { computeLayout, hitSalvage } from "@/render/lite/common/scene";
import { Viewport } from "@/render/Viewport";
import type { ViewportHandle } from "@/render/types";
import { act, getGame, useGame } from "@/store/game";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";
import { Icon, Key, LcdMeter, LedRow, Txt, toast, useReduceMotion } from "@/ui/kit";
import { fonts } from "@/ui/fonts";
import { palette, space } from "@/ui/theme";

import { usePulseValue } from "./hooks";
import { buildQuality, buildScene, sceneEqual } from "./scene";
import { fx, setViewportHandle, useShell, viewportBox, viewportPerf } from "./store";

const GLASS = "rgba(7,9,15,0.72)";
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING = 58;
const RING_R = 26;
const RING_LEN = 2 * Math.PI * RING_R;

const ScanKey = memo(function ScanKey() {
  const t = useT("world");
  const ready = useGame((g) => g.state.active.scanReadyAt <= g.state.t);
  const cooldown = usePulseValue((g) => {
    const total = (g.content.balance.pulseCooldown as number | undefined) ?? 20;
    return Math.max(0, Math.min(1, (g.state.active.scanReadyAt - g.state.t) / total));
  });
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: RING_LEN * cooldown.value }));
  const onPress = useCallback(() => {
    const r = act((g) => pulseScan(g));
    if (r.ok) {
      sfx("scanPing");
      haptic("impact");
      fx.burst("scan");
    } else {
      sfx("deny");
    }
  }, []);
  return (
    <View style={{ width: RING, height: RING, alignItems: "center", justifyContent: "center" }}>
      <View pointerEvents="none" style={{ position: "absolute", width: RING, height: RING, borderRadius: RING / 2, backgroundColor: GLASS }} />
      <Svg pointerEvents="none" width={RING} height={RING} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke={palette.steel0} strokeWidth={3} fill="none" />
        <AnimatedCircle cx={RING / 2} cy={RING / 2} r={RING_R} stroke={ready ? palette.mint : palette.cobalt2} strokeWidth={3} fill="none" strokeDasharray={`${RING_LEN} ${RING_LEN}`} animatedProps={ringProps} />
      </Svg>
      <Key icon="scan" tone={ready ? "cobalt" : "black"} size="sm" width={44} onPress={onPress} sound={null} hapticKind={null} accessibilityLabel={t("hud.scan")} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} />
    </View>
  );
});

const Overdrive = memo(function Overdrive() {
  const t = useT("world");
  const reduce = useReduceMotion();
  const state = useGame((g) => {
    const a = g.state.active;
    const max = (g.content.balance.comboMax as number | undefined) ?? 100;
    return a.overdriveUntil > g.state.t ? 2 : a.combo >= max ? 1 : 0;
  });
  const combo = usePulseValue((g) => Math.min(1, g.state.active.combo / ((g.content.balance.comboMax as number | undefined) ?? 100)), 250);
  const left = usePulseValue((g) => Math.max(0, Math.min(1, (g.state.active.overdriveUntil - g.state.t) / ((g.content.balance.overdriveSecs as number | undefined) ?? 20))));
  const glow = useSharedValue(0);
  useEffect(() => {
    if (state === 1 && !reduce) glow.set(withRepeat(withTiming(1, { duration: 620, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.Never }), -1, true));
    else {
      cancelAnimation(glow);
      glow.set(state === 1 ? 0.7 : 0);
    }
    return () => cancelAnimation(glow);
  }, [state, reduce, glow]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.25 + glow.value * 0.6, transform: [{ scale: 1 + glow.value * 0.06 }] }));
  const fire = useCallback(() => {
    const r = act((g) => triggerOverdrive(g));
    if (!r.ok) sfx("deny");
  }, []);

  if (state === 1) {
    return (
      <View style={{ justifyContent: "flex-end" }}>
        <Animated.View pointerEvents="none" style={[{ position: "absolute", left: -5, right: -5, top: -5, bottom: -5, borderRadius: 12, backgroundColor: palette.orange }, glowStyle]} />
        <Key label={t("hud.overdrive")} icon="power" tone="orange" size="sm" width={124} onPress={fire} sound={null} hapticKind="heavy" />
      </View>
    );
  }
  return (
    <View accessible accessibilityLabel={t("hud.overdrive")} style={{ width: 124, backgroundColor: GLASS, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 5, gap: 3 }}>
      <Txt variant="micro" color={state === 2 ? palette.yellow : palette.steel3} upper numberOfLines={1}>
        {state === 2 ? t("hud.overdriveOn") : t("hud.combo")}
      </Txt>
      {state === 2 ? <LcdMeter value={left} segments={12} height={6} tone="warn" /> : <LedRow steps={12} progress={combo} color="orange" hotColor="yellow" hotSteps={2} size={5} fill />}
    </View>
  );
});

const Heat = memo(function Heat() {
  const t = useT("world");
  const heat = usePulseValue((g) => g.state.active.heat / 100);
  const locked = useGame((g) => (g.state.active.lockUntil > g.state.t ? Math.ceil(g.state.active.lockUntil - g.state.t) : 0));
  return (
    <View accessible accessibilityLabel={t("hud.heat")} style={{ flexDirection: "row", alignItems: "center", gap: space.xs, backgroundColor: GLASS, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4 }}>
      <Icon name="heat" size={16} />
      {locked > 0 ? (
        <Txt variant="micro" color={palette.orange} upper numberOfLines={1} style={{ width: 84 }}>
          {t("hud.locked", { n: locked })}
        </Txt>
      ) : (
        <LcdMeter value={heat} segments={12} height={8} warnFrom={0.75} style={{ width: 84 }} />
      )}
    </View>
  );
});

const Caption = memo(function Caption() {
  const t = useT("world");
  const info = useGame(
    (g) => {
      const sys = g.api.currentSystem();
      const jumping = g.state.nav.jump !== null;
      return { name: sys.name, depth: sys.depth, core: coreDepth(g), jumping, docked: g.state.station.docked, station: sys.station ? sys.station.name : "", nav: g.state.features.nav === 1 };
    },
    undefined,
    5,
  );
  return (
    <View pointerEvents="none" style={{ gap: 1 }}>
      <Txt numberOfLines={1} style={{ fontFamily: fonts.pixelBold, fontSize: 14, lineHeight: 18, color: palette.bone2, textShadowColor: "#000", textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } }}>
        {info.jumping ? t("hud.jumping") : info.docked && info.station ? info.station : info.name}
      </Txt>
      <Txt variant="micro" color={palette.steel3} upper numberOfLines={1} style={{ textShadowColor: "#000", textShadowRadius: 2, textShadowOffset: { width: 0, height: 1 } }}>
        {info.nav ? t("hud.depth", { depth: info.depth, core: info.core }) : t("hud.adrift")}
      </Txt>
    </View>
  );
});

const HoldHint = memo(function HoldHint() {
  const t = useT("world");
  const reduce = useReduceMotion();
  const v = useSharedValue(0);
  useEffect(() => {
    if (!reduce) v.set(withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.Never }), -1, true));
    return () => cancelAnimation(v);
  }, [reduce, v]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.35 + 0.5 * v.value, transform: [{ scale: 0.85 + 0.25 * v.value }] }));
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: "14%", alignItems: "center", gap: space.sm }}>
      <Animated.View style={[{ width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: palette.orange }, ring]} />
      <View style={{ backgroundColor: GLASS, borderRadius: 6, paddingHorizontal: space.sm, paddingVertical: space.xs }}>
        <Txt variant="pixel" color={palette.bone2} align="center">
          {t("hud.holdHint")}
        </Txt>
      </View>
    </View>
  );
});

export interface ViewportPaneProps {
  width: number;
  height: number;
  safeMode: boolean;
}

export const ViewportPane = memo(function ViewportPane({ width, height, safeMode }: ViewportPaneProps) {
  const t = useT("world");
  const ref = useRef<ViewportHandle>(null);
  const scene = useGame(buildScene, sceneEqual);
  const batterySaver = useSettings((s) => s.batterySaver);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const holdStep = useShell((s) => s.tutorial === 1);
  const covered = useUi((s) => s.viewportCovered);
  const active = useShell((s) => s.active);
  const overdriveUnlocked = useGame((g) => g.state.features.overdrive === 1);
  const quality = useMemo(() => buildQuality({ safeMode, batterySaver, reduceMotion, paused: covered || !active }), [safeMode, batterySaver, reduceMotion, covered, active]);

  useEffect(() => {
    viewportBox.width = width;
    viewportBox.height = height;
  }, [width, height]);
  useEffect(() => {
    setViewportHandle(ref.current);
    return () => setViewportHandle(null);
  });

  // Web preview only: react-native-web's press event carries no locationX/Y, so the Viewport cannot
  // tell where it was tapped. The pointer position is recorded here and the hit test repeated.
  const pointer = useRef({ x: 0, y: 0 });
  const sceneRef = useRef(scene);
  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);
  const onTap = useCallback(
    (hit: number | null, tx: number, ty: number) => {
      let uid = hit;
      let x = tx;
      let y = ty;
      if (Platform.OS === "web" && !(Number.isFinite(x) && Number.isFinite(y))) {
        x = Math.min(1, Math.max(0, pointer.current.x / width));
        y = Math.min(1, Math.max(0, pointer.current.y / height));
        uid = hitSalvage(sceneRef.current, computeLayout(width, height, PixelRatio.get()), pointer.current.x, pointer.current.y);
      }
      viewportBox.tapX = x * width;
      viewportBox.tapY = y * height;
      viewportBox.tapAt = Date.now();
      if (uid === null) {
        fx.burst("spark", x, y);
        return;
      }
      const target = uid;
      const r = act((g) => collectSalvage(g, target));
      if (!r.ok) sfx("deny");
    },
    [width, height],
  );
  const onHold = useCallback((on: boolean) => {
    const r = act((g) => setMining(g, on));
    if (!on) return;
    if (r.ok) {
      sfx("laser");
      haptic("impact");
    } else {
      sfx("deny");
      haptic("warning");
      toast(t("hud.cooling"), "warn");
    }
  }, [t]);
  const onPerf = useCallback((frameMs: number, draws: number) => {
    viewportPerf.frameMs = frameMs;
    viewportPerf.draws = draws;
  }, []);
  // releasing the hold when the pane goes away (overlay, background) is the Viewport's job; this
  // covers the app being backgrounded mid-hold, where no press-out ever arrives
  useEffect(() => {
    if (!active && getGame().state.active.mining) act((g) => setMining(g, false));
  }, [active]);

  return (
    <View
      style={{ width, height, backgroundColor: palette.void0, overflow: "hidden" }}
      onPointerDown={Platform.OS === "web" ? (e) => {
        pointer.current.x = e.nativeEvent.clientX;
        pointer.current.y = e.nativeEvent.clientY;
      } : undefined}
    >
      <Viewport ref={ref} width={width} height={height} scene={scene} quality={quality} onTap={onTap} onHold={onHold} onPerf={onPerf} />
      {holdStep ? <HoldHint /> : null}
      <View pointerEvents="box-none" style={{ position: "absolute", left: space.sm, right: space.sm, bottom: space.sm, flexDirection: "row", alignItems: "flex-end", gap: space.sm }}>
        <View pointerEvents="box-none" style={{ flex: 1, minWidth: 0, gap: space.xs, alignItems: "flex-start" }}>
          <Caption />
          <Heat />
        </View>
        {overdriveUnlocked ? <Overdrive /> : null}
        <ScanKey />
      </View>
    </View>
  );
});

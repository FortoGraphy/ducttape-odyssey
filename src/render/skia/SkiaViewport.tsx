// Full renderer. One <Canvas> whose only job is the integer nearest-neighbour upscale of the
// low-res frame produced by engine.ts on the UI thread (plus the LCD grid and vignette, which are
// the only full-resolution work). See engine.ts for the rendering model.
import { Canvas, Fill, FilterMode, Image, ImageShader, MipmapMode, Shader, Skia, useImage } from "@shopify/react-native-skia";
import type { DataSourceParam, SkImage } from "@shopify/react-native-skia";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Ref } from "react";
import { PixelRatio, Platform, View } from "react-native";
import { useFrameCallback, useSharedValue } from "react-native-reanimated";
import type { FrameInfo, SharedValue } from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

import { compileScene, computeLayout } from "../lite/common/scene";
import type { SceneU } from "../lite/common/scene";
import { EMPTY_SCENE } from "../types";
import type { ViewportBurst, ViewportHandle, ViewportProps, ViewportQuality } from "../types";

import { buildAssets, generatedAtlasNames, generatedAtlasSource } from "./atlas";
import { createState, disposeState, publishFrame, renderFrame, setFlash, setShake, spawnBurst, surfaceWorks } from "./engine";
import type { AssetsU, QualityU, VP } from "./engine";
import { upscaleEffect } from "./shaders";

export interface SkiaViewportProps extends ViewportProps {
  ref?: Ref<ViewportHandle>;
  /** The renderer could not start or threw while drawing: the host swaps in the lite renderer. */
  onFail?(reason: string): void;
  /** Time spent inside the frame worklet, averaged over about a second: drawing, and handing the frame over (ms). */
  onCpu?(drawMs: number, publishMs: number): void;
}

const IS_WEB = Platform.OS === "web";
const NEAREST = { filter: FilterMode.Nearest, mipmap: MipmapMode.None };
const DEFAULT_QUALITY: ViewportQuality = { level: 2, fps: 60, reduceMotion: false, paused: false };
const BURSTS: ViewportBurst[] = ["collect", "impact", "jump", "spark", "levelUp", "explosion", "scan"];

function burstW(state: SharedValue<VP | null>, kind: number, x: number, y: number) {
  "worklet";
  spawnBurst(state.value, kind, x, y);
}
function shakeW(state: SharedValue<VP | null>, amount: number) {
  "worklet";
  setShake(state.value, amount);
}
function flashW(state: SharedValue<VP | null>, r: number, g: number, b: number, ms: number) {
  "worklet";
  setFlash(state.value, r, g, b, ms);
}
function nowMs(): number {
  "worklet";
  return typeof performance !== "undefined" ? performance.now() : 0;
}

/** Draws a single frame outside the loop, so a viewport that mounts (or changes) while paused is not blank. */
function renderOnce(
  state: SharedValue<VP | null>,
  assets: SharedValue<AssetsU | null>,
  scene: SharedValue<SceneU>,
  quality: SharedValue<QualityU>,
  frame: SharedValue<SkImage | null>
) {
  "worklet";
  const st = state.value;
  const as = assets.value;
  if (!st || !as || st.failed) return;
  try {
    renderFrame(st, scene.value, as, quality.value, 0);
    publishFrame(st, frame);
  } catch {
    st.failed = true;
  }
}

/** One display frame: skip (30 fps), draw, verify the surface once, publish, account. */
function frameStep(
  state: SharedValue<VP | null>,
  assets: SharedValue<AssetsU | null>,
  scene: SharedValue<SceneU>,
  quality: SharedValue<QualityU>,
  frame: SharedValue<SkImage | null>,
  elapsedMs: number,
  reportFail: (reason: string) => void,
  reportPerf: (frameMs: number, calls: number, drawMs: number, publishMs: number) => void
) {
  "worklet";
  const st = state.value;
  const as = assets.value;
  if (!st || !as || st.failed) return;
  const q = quality.value;
  st.acc += elapsedMs;
  // 30 fps on a 60 Hz display: draw on every other callback
  if (st.acc < 1000 / q.fps - 4) return;
  const step = st.acc;
  st.acc = 0;
  const t0 = nowMs();
  let t1 = t0;
  try {
    renderFrame(st, scene.value, as, q, step);
    if (st.frame === 3 && !surfaceWorks(st)) {
      // the offscreen surface came back empty: retry on a CPU surface, then give up to lite
      const gpu = st.gpu;
      disposeState(st, frame);
      const cpu = gpu ? createState(st.W, st.H, st.level, IS_WEB, true) : null;
      state.value = cpu;
      if (!cpu) scheduleOnRN(reportFail, "offscreen surface reads back empty");
      return;
    }
    t1 = nowMs();
    publishFrame(st, frame);
  } catch (e) {
    st.failed = true;
    scheduleOnRN(reportFail, String(e));
    return;
  }
  st.perfCpu += t1 - t0;
  st.perfPub += nowMs() - t1;
  st.perfT += step;
  st.perfN++;
  if (st.perfT >= 1000) {
    scheduleOnRN(reportPerf, st.perfT / st.perfN, st.calls, st.perfCpu / st.perfN, st.perfPub / st.perfN);
    st.perfT = 0;
    st.perfN = 0;
    st.perfCpu = 0;
    st.perfPub = 0;
  }
}

function AtlasLoader({ name, source, onImage }: { name: string; source: DataSourceParam; onImage(name: string, image: SkImage): void }) {
  const image = useImage(source);
  useEffect(() => {
    if (image) onImage(name, image);
  }, [image, name, onImage]);
  return null;
}

export default function SkiaViewport({ width, height, scene = EMPTY_SCENE, quality = DEFAULT_QUALITY, onPerf, onFail, onCpu, ref }: SkiaViewportProps) {
  const layout = useMemo(() => computeLayout(width, height, PixelRatio.get()), [width, height]);
  const { pxW, pxH } = layout;
  const level = quality.level;

  const frame = useSharedValue<SkImage | null>(null);
  const state = useSharedValue<VP | null>(null);
  const compiled = useMemo(() => compileScene(scene), [scene]);
  const sceneSV = useSharedValue<SceneU>(compiled);
  const qualityU = useMemo<QualityU>(
    () => ({ level, fps: level === 1 ? 30 : quality.fps, calm: quality.reduceMotion ? 1 : 0 }),
    [level, quality.fps, quality.reduceMotion]
  );
  const qualitySV = useSharedValue<QualityU>(qualityU);
  const assetsSV = useSharedValue<AssetsU | null>(null);

  useEffect(() => {
    sceneSV.set(compiled);
  }, [compiled, sceneSV]);
  useEffect(() => {
    qualitySV.set(qualityU);
  }, [qualityU, qualitySV]);

  // callbacks reach the JS thread through stable functions so the frame worklet never changes
  const cb = useRef({ onPerf, onFail, onCpu });
  useEffect(() => {
    cb.current = { onPerf, onFail, onCpu };
  });
  const reportPerf = useCallback((frameMs: number, calls: number, drawMs: number, publishMs: number) => {
    cb.current.onPerf?.(frameMs, calls);
    cb.current.onCpu?.(drawMs, publishMs);
  }, []);
  const reportFail = useCallback((reason: string) => {
    console.warn(`viewport: Skia renderer stopped (${reason})`);
    cb.current.onFail?.(reason);
  }, []);

  // sprites: procedural sheet, overridden by the generated atlas once its images are decoded
  const [loaded, setLoaded] = useState<Record<string, SkImage | null>>({});
  const onAtlasImage = useCallback((name: string, image: SkImage) => {
    setLoaded((prev) => (prev[name] === image ? prev : { ...prev, [name]: image }));
  }, []);
  const paint = scene.ship.paint;
  const hull = scene.ship.hull;
  useEffect(() => {
    const built = buildAssets(paint, hull, loaded);
    if (!built) {
      reportFail("sprite sheet");
      return;
    }
    assetsSV.set(built);
    scheduleOnUI(renderOnce, state, assetsSV, sceneSV, qualitySV, frame);
  }, [paint, hull, loaded, assetsSV, reportFail, state, sceneSV, qualitySV, frame]);

  // the UI-thread state lives exactly as long as this size and quality level
  useEffect(() => {
    scheduleOnUI(() => {
      "worklet";
      disposeState(state.value, frame);
      const st = createState(pxW, pxH, level, IS_WEB, false);
      state.value = st;
      if (!st) scheduleOnRN(reportFail, "no offscreen surface");
      else renderOnce(state, assetsSV, sceneSV, qualitySV, frame);
    });
    return () => {
      scheduleOnUI(() => {
        "worklet";
        disposeState(state.value, frame);
        state.value = null;
      });
    };
  }, [pxW, pxH, level, state, frame, reportFail, assetsSV, sceneSV, qualitySV]);

  const onFrame = useCallback(
    (info: FrameInfo) => {
      "worklet";
      frameStep(state, assetsSV, sceneSV, qualitySV, frame, info.timeSincePreviousFrame ?? 16.7, reportFail, reportPerf);
    },
    [state, assetsSV, qualitySV, sceneSV, frame, reportFail, reportPerf]
  );
  const loop = useFrameCallback(onFrame, false);
  const paused = quality.paused;
  useEffect(() => {
    // useFrameCallback unregisters (and so stops) the callback itself on unmount
    loop.setActive(!paused);
  }, [loop, paused, onFrame]);

  useImperativeHandle(
    ref,
    () => ({
      burst(kind, x, y) {
        scheduleOnUI(burstW, state, BURSTS.indexOf(kind), x ?? -1, y ?? -1);
      },
      shake(amount) {
        scheduleOnUI(shakeW, state, amount);
      },
      flash(color, ms) {
        let c: Float32Array;
        try {
          c = Skia.Color(color);
        } catch {
          c = Float32Array.of(1, 1, 1, 1);
        }
        scheduleOnUI(flashW, state, c[0], c[1], c[2], ms ?? 160);
      },
    }),
    [state]
  );

  const uniforms = useMemo(
    () => ({
      uScale: layout.scale,
      uOff: [layout.offX, layout.offY],
      uSize: [width, height],
      uCell: 1 / layout.k,
      uGrid: layout.k >= 3 ? 0.16 : 0,
      uVig: 0.42,
    }),
    [layout, width, height]
  );

  return (
    <View style={{ width, height, backgroundColor: "#05060A", overflow: "hidden" }} pointerEvents="none">
      <Canvas style={{ width, height }} opaque>
        {level > 0 && upscaleEffect ? (
          <Fill>
            <Shader source={upscaleEffect} uniforms={uniforms}>
              <ImageShader image={frame} tx="clamp" ty="clamp" sampling={NEAREST} />
            </Shader>
          </Fill>
        ) : (
          <Image image={frame} x={layout.offX} y={layout.offY} width={pxW * layout.scale} height={pxH * layout.scale} fit="fill" sampling={NEAREST} />
        )}
      </Canvas>
      {generatedAtlasNames.map((name) => (
        <AtlasLoader key={name} name={name} source={generatedAtlasSource(name)} onImage={onAtlasImage} />
      ))}
    </View>
  );
}

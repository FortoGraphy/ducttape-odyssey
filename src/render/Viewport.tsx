// Public viewport component: picks the Skia renderer or the lite fallback, isolates the Skia one
// behind an error boundary (any failure swaps in lite for the rest of the session) and owns the
// gestures, so both renderers stay pure drawing code.
import { Component, forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, ReactNode, Ref } from "react";
import { PixelRatio, Pressable } from "react-native";
import type { GestureResponderEvent } from "react-native";

import LiteViewport from "./lite/LiteViewport";
import { computeLayout, hitSalvage } from "./lite/common/scene";
import { loadSkiaModule } from "./loadSkia";
import { getRenderMode } from "./mode";
import type { ViewportHandle, ViewportProps } from "./types";

type RendererProps = ViewportProps & {
  ref?: Ref<ViewportHandle>;
  onFail?(reason: string): void;
  onCpu?(drawMs: number, publishMs: number): void;
};

export interface ViewportComponentProps extends ViewportProps {
  /** QA only: time spent in the Skia frame worklet (ms): drawing the scene, and handing the frame to the canvas. */
  onCpu?(drawMs: number, publishMs: number): void;
  /** QA only: which renderer ended up on screen. */
  onRenderer?(mode: "skia" | "lite"): void;
}

let skiaRenderer: ComponentType<RendererProps> | null | undefined;
let skiaBroken = false;

function resolveSkia(): ComponentType<RendererProps> | null {
  if (skiaBroken) return null;
  if (skiaRenderer === undefined) {
    try {
      skiaRenderer = loadSkiaModule<RendererProps>();
    } catch (e) {
      console.warn("viewport: Skia renderer failed to load, using lite", e);
      skiaRenderer = null;
    }
  }
  return skiaRenderer;
}

class RenderBoundary extends Component<{ onError(): void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("viewport: Skia renderer crashed, using lite", error);
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const HOLD_DELAY_MS = 220;

export const Viewport = forwardRef<ViewportHandle, ViewportComponentProps>(function Viewport(props, ref) {
  const { width, height, scene, onTap, onHold, onCpu, onRenderer, ...rest } = props;
  const [failed, setFailed] = useState(false);
  const Skia = !failed && getRenderMode() === "skia" ? resolveSkia() : null;
  const fail = useCallback(() => {
    // a renderer that failed once is not retried: Safe Mode and the next launch decide again
    skiaBroken = true;
    setFailed(true);
  }, []);

  const mode = Skia ? "skia" : "lite";
  useEffect(() => {
    onRenderer?.(mode);
  }, [mode, onRenderer]);

  const layout = useMemo(() => computeLayout(width, height, PixelRatio.get()), [width, height]);
  const holding = useRef(false);
  const holdRef = useRef(onHold);
  useEffect(() => {
    holdRef.current = onHold;
  }, [onHold]);
  const onPress = useCallback(
    (e: GestureResponderEvent) => {
      if (!onTap) return;
      const x = e.nativeEvent.locationX;
      const y = e.nativeEvent.locationY;
      onTap(hitSalvage(scene, layout, x, y), Math.min(1, Math.max(0, x / width)), Math.min(1, Math.max(0, y / height)));
    },
    [onTap, scene, layout, width, height]
  );
  const onLongPress = useCallback(() => {
    holding.current = true;
    holdRef.current?.(true);
  }, []);
  const onPressOut = useCallback(() => {
    if (!holding.current) return;
    holding.current = false;
    holdRef.current?.(false);
  }, []);
  useEffect(
    () => () => {
      // never leave the shell in hold-to-mine when the viewport goes away mid-press
      if (holding.current) holdRef.current?.(false);
    },
    []
  );

  return (
    <Pressable style={{ width, height }} delayLongPress={HOLD_DELAY_MS} onPress={onPress} onLongPress={onLongPress} onPressOut={onPressOut} accessible={false}>
      {Skia ? (
        <RenderBoundary onError={fail}>
          <Skia ref={ref} width={width} height={height} scene={scene} onFail={fail} onCpu={onCpu} {...rest} />
        </RenderBoundary>
      ) : (
        <LiteViewport ref={ref} width={width} height={height} scene={scene} {...rest} />
      )}
    </Pressable>
  );
});

export default Viewport;

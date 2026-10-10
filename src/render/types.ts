// Contract between the game shell and the Viewport renderer. Owned by the orchestrator.
// The shell writes a ViewportScene snapshot at most 10 times per second; the renderer
// interpolates and animates on the UI thread. The same props drive both implementations:
// src/render/skia (full effects) and src/render/lite (SVG/Reanimated fallback, no shaders).
import type { BiomeId, FailureKind, HazardKind, HullClassId, StarType } from "@/engine/types";

export type ViewportMode = "cruise" | "orbit" | "warp" | "docked";

export interface ViewportScene {
  mode: ViewportMode;
  /** Changes re-seed nebula, star field and star color. */
  systemSeed: number;
  star: StarType;
  /** Planet shown in orbit mode (null = deep space). */
  planet: null | { seed: number; biome: BiomeId; size: number; rings: boolean; palette: string[]; shader: string };
  ship: {
    hull: HullClassId;
    paint: string; // palette key or cosmetic value
    trail: string;
    damage: number; // 0..1, drives sparks/flicker/smoke
    thrust: number; // 0..1 engine intensity
    mining: boolean; // laser on
    overdrive: boolean;
    tumble: boolean; // tumbling failure: ship spins
    powerOut: boolean; // blackout: lights off
  };
  failure: FailureKind | null;
  hazard: HazardKind | null;
  station: boolean;
  drones: number; // visible drones, capped by the renderer
  tow: boolean; // tow ship present
  salvage: { uid: number; kind: "crate" | "pod" | "wreck" | "crystal"; x: number; y: number }[]; // x,y 0..1
  /** 0..1 hyperdrive charge, shown as a glow build-up. */
  charge: number;
}

export interface ViewportQuality {
  /** 0 = Safe Mode (no shaders, minimal particles), 1 = battery saver, 2 = full. */
  level: 0 | 1 | 2;
  fps: 30 | 60;
  reduceMotion: boolean;
  /** Render loop fully stopped (app backgrounded or a full-screen overlay hides the viewport). */
  paused: boolean;
}

export type ViewportBurst = "collect" | "impact" | "jump" | "spark" | "levelUp" | "explosion" | "scan";

/** Imperative effects, called by the shell in response to engine events. */
export interface ViewportHandle {
  burst(kind: ViewportBurst, x?: number, y?: number): void;
  shake(amount: number): void; // 0..1
  flash(color: string, ms?: number): void;
}

export interface ViewportProps {
  width: number;
  height: number;
  scene: ViewportScene;
  quality: ViewportQuality;
  /** Tap on a salvage blob (uid) or on empty space (null, x/y 0..1). */
  onTap?(uid: number | null, x: number, y: number): void;
  /** Press and hold anywhere = hold-to-mine. */
  onHold?(active: boolean): void;
  /** Reports measured frame time for the perf HUD (ms, about once per second). */
  onPerf?(frameMs: number, drawCalls: number): void;
}

/** Internal pixel width of the viewport; everything is drawn at this resolution and upscaled by an integer factor. */
export const VIEW_PX_WIDTH = 180;

export const EMPTY_SCENE: ViewportScene = {
  mode: "cruise",
  systemSeed: 1,
  star: "yellow",
  planet: null,
  ship: { hull: "tug", paint: "", trail: "", damage: 0, thrust: 0.3, mining: false, overdrive: false, tumble: false, powerOut: false },
  failure: null,
  hazard: null,
  station: false,
  drones: 0,
  tow: false,
  salvage: [],
  charge: 0,
};

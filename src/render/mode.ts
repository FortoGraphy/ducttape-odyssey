import { Platform } from "react-native";

export type RenderMode = "skia" | "lite";

// EXPO_PUBLIC_RENDER is inlined at build time. "lite" builds never evaluate any Skia module, so a
// Skia-related launch crash cannot happen there. Safe Mode (crash-loop guard) can also force "lite"
// at runtime through setRuntimeRenderOverride before the viewport mounts.
const BUILD_MODE: RenderMode = process.env.EXPO_PUBLIC_RENDER === "lite" ? "lite" : "skia";

let runtimeOverride: RenderMode | null = null;

export function setRuntimeRenderOverride(mode: RenderMode | null) {
  runtimeOverride = mode;
}

export function getBuildRenderMode(): RenderMode {
  return BUILD_MODE;
}

export function getRenderMode(): RenderMode {
  if (BUILD_MODE === "lite") return "lite";
  if (Platform.OS === "web" && !(globalThis as { CanvasKit?: unknown }).CanvasKit) return "lite";
  return runtimeOverride ?? BUILD_MODE;
}

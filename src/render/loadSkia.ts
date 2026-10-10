import type { ComponentType } from "react";

// The ONLY place that may reference files under src/render/skia (or import @shopify/react-native-skia
// indirectly). Keep the comparison against process.env inline in the ternary: Expo inlines the value
// and Metro's constant folding then drops the require, so "lite" builds do not contain Skia JS at all
// (scripts/ci/check-lite-bundle.mjs enforces this). The require is lazy so Safe Mode can skip it at runtime.
export function loadSkiaModule<P>(): ComponentType<P> | null {
  return process.env.EXPO_PUBLIC_RENDER === "lite" ? null : (require("./skia/SpikeCanvas").default as ComponentType<P>);
}

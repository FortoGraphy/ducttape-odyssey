// Web entry (browser preview only; the native entry is index.js). Skia on web needs CanvasKit to be
// loaded BEFORE any module that touches the Skia API is evaluated, so the router is mounted only
// after the wasm is ready. The binary is served from public/canvaskit.wasm (copied from
// node_modules/canvaskit-wasm/bin/full; `npx setup-skia-web public` does the same). If loading fails,
// the app still starts: src/render/mode.ts sees no global CanvasKit and picks the lite renderer.
import "@expo/metro-runtime";

function start() {
  const { App } = require("expo-router/build/qualified-entry");
  const { renderRootComponent } = require("expo-router/build/renderRootComponent");
  renderRootComponent(App);
}

const forceLite =
  process.env.EXPO_PUBLIC_RENDER === "lite" ||
  (typeof location !== "undefined" && /[?&]render=lite(&|$)/.test(location.search));

if (forceLite) {
  start();
} else {
  const { LoadSkiaWeb } = require("@shopify/react-native-skia/lib/module/web");
  LoadSkiaWeb({ locateFile: (file) => `/${file}` })
    .catch((e) => {
      console.warn("CanvasKit failed to load, using the lite renderer", e);
    })
    .then(start);
}

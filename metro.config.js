const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// CanvasKit (Skia on web) ships a .wasm binary; only the browser preview needs it.
config.resolver.assetExts.push("wasm");

module.exports = config;

// Samples JS heap allocations of the viewport demo route for a few seconds and attributes them to
// functions (Chrome sampling heap profiler, including objects already collected). Meant to be run
// against a NON-minified web export so function names survive:
//   npx expo export --platform web --no-minify --output-dir <dir>
//   node scripts/preview/alloc-profile.mjs <baseUrl> <preset> [seconds] [--query "q=1"]
// Prints bytes per frame for the renderer's own frame functions and the biggest allocators overall.
// On web the Skia API is a JS shim over CanvasKit that allocates on most calls; those show up under
// their own names (JsiSk*, CanvasKit glue), not under the renderer's functions.
import { chromium } from "playwright";

const args = process.argv.slice(2);
const [base, preset = "cruise", secondsArg = "8"] = args;
if (!base) {
  console.error("usage: alloc-profile.mjs <baseUrl> [preset] [seconds] [--query qs]");
  process.exit(2);
}
const qi = args.indexOf("--query");
const query = qi >= 0 ? `&${args[qi + 1]}` : "";
const seconds = Number(secondsArg);

// functions of src/render/skia/engine.ts and the frame callback in SkiaViewport.tsx
const OWN = new Set([
  "renderFrame", "drawEmissive", "simulate", "batchParticles", "updateParticles", "drawStars", "drawStar", "drawPlanet", "drawBolt",
  "updateSkyShaders", "updatePlanetShader", "planetOffset", "sprite", "shipSprite", "flush", "fillRect", "fillCircle", "line", "spawn",
  "radial", "emit", "ambient", "rnd", "hash1", "seedStars", "publishFrame", "frameStep", "surfaceWorks", "nowMs", "salvageX", "salvageY",
]);

const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--enable-webgl", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
await page.goto(`${base}/viewport?p=${preset}${query}`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(3000);
const cdp = await page.context().newCDPSession(page);
await cdp.send("HeapProfiler.enable");
await cdp.send("HeapProfiler.startSampling", { samplingInterval: 512, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
await page.waitForTimeout(seconds * 1000);
const { profile } = await cdp.send("HeapProfiler.stopSampling");
const perfLine = await page.evaluate(() => {
  const el = [...document.querySelectorAll("div")].find((d) => d.children.length === 0 && /ms\/frame/.test(d.textContent ?? ""));
  return el ? el.textContent : "";
});
await browser.close();

const byFn = new Map();
let total = 0;
const walk = (node) => {
  const name = node.callFrame.functionName || "(anonymous)";
  if (node.selfSize > 0) {
    byFn.set(name, (byFn.get(name) ?? 0) + node.selfSize);
    total += node.selfSize;
  }
  for (const child of node.children ?? []) walk(child);
};
walk(profile.head);

const frameMs = Number((/([\d.]+) ms\/frame/.exec(perfLine) ?? [])[1] ?? 16.7);
const frames = (seconds * 1000) / frameMs;
const perFrame = (bytes) => `${(bytes / frames).toFixed(1)} B/frame`;
let own = 0;
const ownRows = [];
for (const [name, size] of byFn) {
  if (OWN.has(name)) {
    own += size;
    ownRows.push([name, size]);
  }
}
console.log(`preset ${preset}: ${perfLine.trim()}`);
console.log(`sampled ${seconds}s, about ${Math.round(frames)} frames`);
console.log(`all JS allocations:        ${perFrame(total)} (${(total / 1024).toFixed(0)} KiB)`);
console.log(`renderer frame functions:  ${perFrame(own)} (${own} B in ${ownRows.length} functions)`);
for (const [name, size] of ownRows.sort((a, b) => b[1] - a[1])) console.log(`    ${name}: ${perFrame(size)}`);
console.log("top allocators:");
for (const [name, size] of [...byFn].sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`    ${name}: ${perFrame(size)}`);

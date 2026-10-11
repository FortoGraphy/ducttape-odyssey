// Batch screenshots of the viewport demo route (one browser, many presets), cropped to the viewport.
//   node scripts/preview/viewport-shots.mjs <baseUrl> <outDir> <preset[,preset...]> [--wait ms] [--query "q=1&rm=1"] [--full] [--perf]
// Same device setup as shot.mjs (iPhone 13 mini, 375x812 @3x). --perf prints the route's perf line.
import fs from "node:fs";
import path from "node:path";

import { chromium } from "playwright";

const args = process.argv.slice(2);
const [base, outDir, list] = args;
if (!base || !outDir || !list) {
  console.error("usage: viewport-shots.mjs <baseUrl> <outDir> <presets> [--wait ms] [--query qs] [--full] [--perf] [--gpu]");
  process.exit(2);
}
const opt = { wait: 3000, query: "", full: false, perf: false, gpu: false, suffix: "" };
for (let i = 3; i < args.length; i++) {
  if (args[i] === "--wait") opt.wait = Number(args[++i]);
  else if (args[i] === "--query") opt.query = args[++i];
  else if (args[i] === "--suffix") opt.suffix = args[++i];
  else if (args[i] === "--full") opt.full = true;
  else if (args[i] === "--perf") opt.perf = true;
  else if (args[i] === "--gpu") opt.gpu = true;
}
fs.mkdirSync(outDir, { recursive: true });

// --gpu asks headless Chromium for the machine's real GPU (ANGLE/D3D11) instead of SwiftShader, for
// frame-time measurements; the WebGL renderer string is printed so the result can be trusted.
const browser = await chromium.launch({
  args: opt.gpu ? ["--use-angle=d3d11", "--enable-gpu", "--enable-webgl", "--ignore-gpu-blocklist"] : ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
const errors = [];
if (opt.gpu) {
  await page.goto("about:blank");
  const renderer = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
    return gl ? gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : "no webgl";
  });
  console.log(`webgl renderer: ${renderer}`);
}
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`);
});
for (const preset of list.split(",")) {
  const url = `${base}/viewport?p=${preset}${opt.query ? `&${opt.query}` : ""}`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 120000 }).catch((e) => errors.push(`goto ${preset}: ${e.message}`));
  await page.waitForTimeout(opt.wait);
  const out = path.join(outDir, `${preset}${opt.suffix}.png`);
  await page.screenshot({ path: out, clip: opt.full ? undefined : { x: 0, y: 0, width: 375, height: Math.round(812 * 0.48) } });
  if (opt.perf) {
    const line = await page.evaluate(() => {
      const el = [...document.querySelectorAll("div")].find((d) => d.children.length === 0 && /ms\/frame/.test(d.textContent ?? ""));
      return el ? el.textContent : "(no perf line)";
    });
    console.log(`${preset}: ${line}`);
  }
  console.log(`saved ${out}`);
}
await browser.close();
if (errors.length) console.log(`page messages (${errors.length}):\n` + [...new Set(errors)].slice(0, 20).join("\n"));

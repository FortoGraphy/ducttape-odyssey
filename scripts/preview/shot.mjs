// Screenshot helper for visual QA without a device: iPhone 13 mini viewport (375x812 @3x).
//   node scripts/preview/shot.mjs <url> <out.png> [--wait 1500] [--click "text=Label"]... [--full] [--w 375 --h 812]
// Each --click is performed in order (Playwright selector), waiting 400 ms after each.
import { chromium } from "playwright";

const args = process.argv.slice(2);
const [url, out] = args;
if (!url || !out) {
  console.error("usage: shot.mjs <url> <out.png> [--wait ms] [--click selector]... [--full]");
  process.exit(2);
}
const opt = { wait: 1500, clicks: [], full: false, w: 375, h: 812 };
for (let i = 2; i < args.length; i++) {
  if (args[i] === "--wait") opt.wait = Number(args[++i]);
  else if (args[i] === "--click") opt.clicks.push(args[++i]);
  else if (args[i] === "--full") opt.full = true;
  else if (args[i] === "--w") opt.w = Number(args[++i]);
  else if (args[i] === "--h") opt.h = Number(args[++i]);
}

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: opt.w, height: opt.h }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto(url, { waitUntil: "networkidle", timeout: 120000 }).catch((e) => errors.push(`goto: ${e.message}`));
await page.waitForTimeout(opt.wait);
for (const sel of opt.clicks) {
  await page.click(sel, { timeout: 8000 }).catch((e) => errors.push(`click ${sel}: ${e.message}`));
  await page.waitForTimeout(400);
}
await page.screenshot({ path: out, fullPage: opt.full });
await browser.close();
if (errors.length) console.log(`page errors (${errors.length}):\n` + errors.slice(0, 12).join("\n"));
console.log(`saved ${out}`);

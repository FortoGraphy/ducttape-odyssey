// Verifies the render-path build flag: a "lite" JS bundle must not contain any Skia code, and a
// "skia" bundle must. Usage: node scripts/ci/check-lite-bundle.mjs <export-dir> <skia|lite>
import fs from "node:fs";
import path from "node:path";

const [dir, mode] = process.argv.slice(2);
if (!dir || !["skia", "lite"].includes(mode)) {
  console.error("usage: check-lite-bundle.mjs <export-dir> <skia|lite>");
  process.exit(2);
}

const bundles = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const full = path.join(d, e.name);
    if (e.isDirectory()) walk(full);
    else if (/\.(hbc|js|jsbundle)$/.test(e.name)) bundles.push(full);
  }
};
walk(dir);
if (!bundles.length) {
  console.error(`no JS bundle found under ${dir}`);
  process.exit(1);
}

const MARKERS = ["RNSkiaModule", "SkiaPictureView", "RuntimeEffect"];
let hasSkia = false;
for (const file of bundles) {
  const text = fs.readFileSync(file, "latin1");
  const hits = MARKERS.filter((m) => text.includes(m));
  console.log(`${path.relative(dir, file)} (${(fs.statSync(file).size / 1e6).toFixed(2)} MB): ${hits.length ? hits.join(", ") : "no Skia markers"}`);
  if (hits.length) hasSkia = true;
}

if (mode === "lite" && hasSkia) {
  console.error("::error::lite bundle contains Skia code; the fallback build would not be independent of Skia");
  process.exit(1);
}
if (mode === "skia" && !hasSkia) {
  console.error("::error::skia bundle contains no Skia code; EXPO_PUBLIC_RENDER wiring is broken");
  process.exit(1);
}
console.log(`check-lite-bundle: OK (${mode})`);

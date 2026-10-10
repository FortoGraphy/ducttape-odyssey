// Fails the build if the generated iOS project asks for anything a free Apple ID cannot sign.
// Run after `npx expo prebuild --platform ios`.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { FORBIDDEN_ENTITLEMENTS } = require("../../plugins/withFreeSigningSafe.js");

const root = path.resolve(process.argv[2] ?? "ios");
if (!fs.existsSync(root)) {
  console.error(`check-entitlements: ${root} does not exist (run expo prebuild first)`);
  process.exit(1);
}

const found = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "Pods" || entry.name === "build" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".entitlements")) checkEntitlements(full);
    else if (entry.name === "Info.plist") checkInfoPlist(full);
  }
};

function checkEntitlements(file) {
  const text = fs.readFileSync(file, "utf8");
  for (const key of FORBIDDEN_ENTITLEMENTS) {
    if (text.includes(`<key>${key}</key>`)) found.push(`${file}: forbidden entitlement ${key}`);
  }
  console.log(`checked ${file}`);
}

function checkInfoPlist(file) {
  const text = fs.readFileSync(file, "utf8");
  const m = text.match(/<key>UIBackgroundModes<\/key>\s*<array>([\s\S]*?)<\/array>/);
  if (m && /<string>/.test(m[1])) found.push(`${file}: UIBackgroundModes must be empty (${m[1].replace(/\s+/g, " ").trim()})`);
  console.log(`checked ${file}`);
}

walk(root);

if (found.length) {
  for (const f of found) console.error(`::error::${f}`);
  process.exit(1);
}
console.log("check-entitlements: OK, nothing a free Apple ID cannot sign");

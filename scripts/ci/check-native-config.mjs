// Evaluates all config plugins without generating ios/ (works on Windows and Linux) and fails if the
// resulting native config contains anything a free Apple ID cannot sign, or if the bundle id changed.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { FORBIDDEN_ENTITLEMENTS } = require("../../plugins/withFreeSigningSafe.js");
const BUNDLE_ID = "cz.johny.ducttape";

const out = execFileSync(process.execPath, [require.resolve("expo/bin/cli"), "config", "--type", "introspect", "--json"], {
  encoding: "utf8",
  env: { ...process.env, EXPO_NO_TELEMETRY: "1" },
  maxBuffer: 64 * 1024 * 1024,
});
const config = JSON.parse(out.slice(out.indexOf("{")));
const ios = config._internal?.modResults?.ios ?? {};
const errors = [];

if (config.ios?.bundleIdentifier !== BUNDLE_ID) errors.push(`bundle id is ${config.ios?.bundleIdentifier}, expected ${BUNDLE_ID} (changing it loses the save)`);
const entitlements = ios.entitlements ?? {};
for (const key of Object.keys(entitlements)) {
  if (FORBIDDEN_ENTITLEMENTS.includes(key)) errors.push(`forbidden entitlement ${key}`);
  else console.log(`note: entitlement ${key} = ${JSON.stringify(entitlements[key])}`);
}
const modes = ios.infoPlist?.UIBackgroundModes;
if (Array.isArray(modes) && modes.length) errors.push(`UIBackgroundModes must be empty, got ${JSON.stringify(modes)}`);
if (config.orientation !== "portrait") errors.push("orientation must be portrait");
if (config.ios?.supportsTablet !== false) errors.push("supportsTablet must be false");

if (errors.length) {
  for (const e of errors) console.error(`::error::${e}`);
  process.exit(1);
}
console.log(`check-native-config: OK (${Object.keys(entitlements).length} entitlements, no background modes, ${BUNDLE_ID})`);

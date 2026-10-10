// The app is signed with a free Apple ID through Sideloadly. Free provisioning cannot grant push,
// iCloud, App Groups, Associated Domains or Sign in with Apple, and no background modes are wanted.
// Other config plugins (expo-notifications sets aps-environment unconditionally) add some of these,
// so this plugin must stay LAST in app.json "plugins" and removes them again.
// scripts/ci/check-entitlements.mjs verifies the result after `expo prebuild`.
const { withEntitlementsPlist, withInfoPlist } = require("expo/config-plugins");

const FORBIDDEN_ENTITLEMENTS = [
  "aps-environment",
  "com.apple.developer.aps-environment",
  "com.apple.developer.icloud-container-identifiers",
  "com.apple.developer.icloud-services",
  "com.apple.developer.ubiquity-container-identifiers",
  "com.apple.developer.ubiquity-kvstore-identifier",
  "com.apple.security.application-groups",
  "com.apple.developer.associated-domains",
  "com.apple.developer.applesignin",
  "com.apple.developer.in-app-payments",
  "com.apple.developer.healthkit",
  "com.apple.developer.nfc.readersession.formats",
  "com.apple.developer.siri",
  "com.apple.developer.usernotifications.time-sensitive",
  "com.apple.developer.usernotifications.communication",
  "keychain-access-groups",
];

module.exports = function withFreeSigningSafe(config) {
  config = withEntitlementsPlist(config, (cfg) => {
    for (const key of FORBIDDEN_ENTITLEMENTS) delete cfg.modResults[key];
    return cfg;
  });
  config = withInfoPlist(config, (cfg) => {
    delete cfg.modResults.UIBackgroundModes;
    return cfg;
  });
  return config;
};

module.exports.FORBIDDEN_ENTITLEMENTS = FORBIDDEN_ENTITLEMENTS;

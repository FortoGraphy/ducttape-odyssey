# Naming

Working title: **Duct Tape Odyssey** (slug `ducttape`, bundle id `cz.johny.ducttape`).

## Alternatives

1. Hull Integrity: Pending
2. Patchwork Cosmos
3. Please Hold: Warp in Progress
4. Spare Parts & Starlight
5. Gaffer Galaxy
6. Warranty Void
7. One Bolt From Disaster
8. The Long Haul Home
9. Priority One Ticket

Czech store-style subtitle: "Vesmír drží pohromadě izolepou".

## Renaming touchpoints

1. `app.json` -> `expo.name` (display name under the icon).
2. `app.json` -> `expo.slug` and `expo.scheme`; `expo.ios.bundleIdentifier`.
   **Do not change the bundle id once installed**: iOS treats it as a different app and the save is
   lost (export the save first if it ever has to change). `scripts/ci/check-native-config.mjs` and the
   workflow both fail if it differs from `cz.johny.ducttape`.
3. Icon and splash text/art: `scripts/assets/` (app icon, splash) and the title strings in
   `src/i18n/locales/*/common.ts`.

The IPA file name prefix (`DuctTapeOdyssey-`) is set in `.github/workflows/ios-build.yml`.

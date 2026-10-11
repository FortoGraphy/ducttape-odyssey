# Decisions

Autonomous decisions made during the build, newest last. Format: decision, then why.

1. **GitHub login was already present** (`gh` logged in as FortoGraphy), so no device-code step was
   needed. The `gh` token has no `workflow` scope, so pushes use Git Credential Manager (repo-local
   `credential.https://github.com.helper = manager`), which the reference repo already used.
2. **Power settings left untouched.** AC sleep/hibernate/display timeouts were already "never"; the
   Claude app's keep-awake hold is used for the session instead of `powercfg`.
3. **Blender**: winget upgraded an existing Blender 5.2.x to 5.2.2 LTS (same config folder). All
   Blender work is headless (`blender --background --python`); Blender MCP is not used.
4. **Versions follow the reference project** (Expo 57.0.x, RN 0.86.3, React 19.2.3, Reanimated 4.5.1,
   worklets 0.10.1). Added with `npx expo install`: `@shopify/react-native-skia` 2.6.2, `expo-audio`,
   `expo-notifications`. No `expo-dev-client`, no `expo-sqlite`, no MMKV: smaller native surface.
5. **Render path flag**: `EXPO_PUBLIC_RENDER=skia|lite`. The lite bundle contains no Skia JS at all
   (constant-folded require in `src/render/loadSkia.ts`, enforced in CI). CI builds both IPAs.
6. **Entitlements**: `plugins/withFreeSigningSafe.js` strips `aps-environment` (added by
   expo-notifications) and all background modes. It must be FIRST in `plugins` because config mods
   registered first run last (the first CI run caught the wrong order). Verified on any OS by
   `scripts/ci/check-native-config.mjs` and again after prebuild on macOS.
7. **Fonts**: Doto (LCD), Pixelify Sans (pixel titles), IBM Plex Mono (labels/body), all OFL, static
   instances renamed so PostScript name = key. Rejected for missing Czech glyphs: Silkscreen,
   DotGothic16. Arrows exist only in Plex Mono.
8. **Big numbers** are plain data `{ m, e }` with pure functions, not a class, so `GameState` is
   plain JSON (trivial save, no revival, Hermes-safe).
9. **Engine areas** (core/world/meta) only talk through `Game.api`, so three engine agents can work
   in parallel without importing each other.
10. **Content strings are `{ cs, en }` objects** next to the data; only UI chrome uses i18next keys
    (with Czech plural forms). Validators check both languages.
11. **13 decks**: the cargo lift is its own upgradable deck (classic mine/elevator/warehouse triangle).
12. **Tests run on vitest in Node**, not jest-expo: the engine is pure TypeScript.
13. **Mini-games never use Skia** (views + Reanimated + SVG) so they are identical in the lite build.
14. **Saves use `expo-file-system`** (atomic temp + move, 3 rotating backups), not SQLite.
15. **Viewport share 0.44 instead of 0.48, and the Ship tab is one scrolling list** (flow strip and
    buy-mode row are the list header, mining is the first card). On an iPhone 13 mini the Control Deck
    loses 34 pt to the home indicator; with pinned chrome there was room for half a deck card.
16. **Codex is compacted on warp**: procedural entries of galaxies the ship has left are dropped unless
    the player named them (counters and set rewards stay). The 7-day soak showed the save growing to
    3 MB otherwise.
17. **Balance was retuned by simulation** (see `docs/BALANCE.md`): with the first-draft numbers every
    deck unlocked in 8 minutes and the core was reached in 47. Hyperdrive charge is now 240 s.
18. **Usage limit**: wave 2 ran in "economy mode" (fewer verification iterations per agent) after the
    account hit its limit at about 00:20 and all agents were lost until 05:38.

# Duct Tape Odyssey

An offline, endless space idle-tycoon for iPhone. You are the last engineer aboard the salvage tug
S.S. Gaffer: mine, craft, patch a hull that is permanently one bolt from falling apart, explore a
procedurally generated galaxy and answer a signal that has been on hold for forty years.

No ads, no purchases, no account, no network. Czech and English.

- **Install on an iPhone from Windows (Czech):** [docs/INSTALACE.md](docs/INSTALACE.md)
- **Design:** [docs/GDD.md](docs/GDD.md), balance notes in [docs/BALANCE.md](docs/BALANCE.md)
- **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), decisions in [docs/DECISIONS.md](docs/DECISIONS.md)
- **Art direction:** [docs/ART_BIBLE.md](docs/ART_BIBLE.md), credits in [CREDITS.md](CREDITS.md)

## Stack

Expo SDK 57, React Native 0.86, React 19, TypeScript (strict), Reanimated 4, React Native Skia
(viewport), react-native-svg (fallback renderer and mini-games), zustand, i18next, expo-audio.
The engine (`src/engine`) is pure TypeScript and runs in Node for tests and simulation.

## Build

The iOS app is built by GitHub Actions on a macOS runner as an **unsigned IPA** and sideloaded with
Sideloadly (free Apple ID). Run the workflow **iOS build (unsigned IPA)** or push a `v*` tag. It
produces two artifacts with the same bundle id (`cz.johny.ducttape`):

| Artifact | Renderer |
| --- | --- |
| `DuctTapeOdyssey-release` | Skia, full effects |
| `DuctTapeOdyssey-release-lite` | SVG fallback, no shaders (`EXPO_PUBLIC_RENDER=lite`) |

The workflow fails if the app would need an entitlement a free Apple ID cannot sign (push, iCloud,
background modes) or if the bundle id changes.

## Develop

```bash
npm install
npm run check        # typecheck + unit tests + content validation
npm run sim          # economy simulator: idle and active bots, asserts the pacing targets
npm run fuzz         # softlock fuzzer: every reachable state must have a way forward
npm run soak         # 7 days of game time: bounded memory, constant tick cost
npm run assets       # rebuild sprites, icons, portraits, fonts (Blender + Python)
node scripts/ci/check-native-config.mjs   # entitlements / bundle id, any OS
```

Web preview for visual checks (not a shipping target):

```bash
npx expo export --platform web --output-dir .scratch/web
node scripts/preview/serve.mjs .scratch/web 8200
node scripts/preview/shot.mjs "http://localhost:8200/dev-shell?preset=mid&full=1" shot.png
```

Preview routes: `/kit` (UI kit), `/viewport` (renderer), `/minigames`, `/dev-shell`, `/dev-ship`,
`/dev-craft`, `/dev-nav`, `/dev-crew`, `/dev-meta`, `/dev-log` with
`?preset=fresh|early|mid|late|damaged&theme=night&lang=en`.

## Layout

```
src/engine    pure game logic (core, world, meta), kernel, big numbers, seeded PRNG
src/content   authored data: items, recipes, decks, research, events, story (cs + en)
src/ui        control deck kit, shell, tab screens
src/render    viewport: skia/ and lite/ behind one props contract
src/minigames nine repair mini-games and their host
src/audio     sound effects and music players
src/platform  storage, crash guard, notifications, haptics
scripts       assets (Blender, Pillow), audio (numpy), sim, validate, ci, preview
```

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

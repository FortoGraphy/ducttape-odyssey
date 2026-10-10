# Architecture

Expo SDK 57 / React Native 0.86 / React 19 / Reanimated 4 / TypeScript strict. iPhone only, portrait,
offline, unsigned IPA built by GitHub Actions (`.github/workflows/ios-build.yml`).

## Layers

```
src/engine/     pure TypeScript, no react / react-native / expo imports. Runs in Node (tests, sim, soak).
  types.ts        the contract (orchestrator-owned)
  big.ts prng.ts kernel.ts index.ts   foundations (orchestrator-owned)
  core/           economy: decks, lift, cargo, selling, power, crafting, grid, wear, repair, active play,
                  offline closed form, save/migrations/export, number format, goals
  world/          galaxy generator, navigation, planets, expeditions, outposts, codex, events, failure
                  states, crew, cards, stations/trade
  meta/           research, prestige (3 layers), story/KIPP, achievements, quests, cosmetics
src/content/    authored data typed by engine/types.ts (bilingual L10n objects). No logic.
src/store/      zustand stores: game runtime (holds the Game object), settings. Glue between engine and UI.
src/platform/   device services: feedback (haptics/sfx), storage (expo-file-system), notifications, crash guard.
src/ui/         theme.ts, fonts.ts, kit/ (panel components), screens/<area>/ (tabs and overlays)
src/render/     Viewport: skia/ (full) and lite/ (SVG fallback) behind one props contract (render/types.ts)
src/minigames/  9 games + host; contract in minigames/types.ts; never Skia
src/audio/      expo-audio players, music scenes; registers the sfx backend in platform/feedback
src/i18n/       i18next setup; locales/<lang>/<namespace>.ts
src/app/        expo-router, thin routes only
scripts/        assets (Python/Blender), audio (numpy), sim, validate, ci, preview
```

## Engine model

- `Game` = `{ state, content, mods, deckMult, rates, dirty, rev, outbox, api, systems }`.
  `state: GameState` is plain JSON and is the only thing saved. Everything else is cache.
- The engine mutates state in place. It ticks at a fixed 10 Hz (`kernel.step`), decoupled from
  rendering. A long gap (>= 60 s) takes the closed-form offline path (`kernel.applyOffline`).
- Areas expose `SystemDef[]` (`init`, `modifiers`, `tick`, `offline`, `prestige`). Systems never
  import another area's files: cross-area calls go through `Game.api` (`EngineApi`), which each area
  fills in its `init`. Shared primitives (credits, items, flags, stats, rng, buffs, features, emit)
  are in `kernel.ts`.
- Player actions are plain exported functions `(g: Game, ...args) => ActionResult` in each area's
  `index.ts` (for example `buyDeck(g, "mining")`). They validate, mutate, set `g.dirty` when modifier
  or rate inputs changed, and `emit` events for feedback.
- Modifiers: each system pushes `Effect`s in `modifiers()`. `kernel.rebuildMods` folds them into
  `g.mods[stat]` (final = (1 + sum add) * prod mul) and `g.deckMult[deck]` and bumps `g.rev`.
  Core recomputes `g.rates` when `rev` changes. Nothing recomputes rates per tick.
- Randomness: gameplay rolls use `kernel.roll(g)` (state-backed, saved). Galaxy generation uses
  `prng.Rng(hashSeed(...))` and is a pure function of indices.
- `outbox`: transient `EngineEvent`s for sound, haptics, toasts, viewport bursts. The shell drains it
  every pulse. It is not saved.
- Mini-games: an area calls `g.api.requestMinigame(game, tier, purpose, ref)` -> `state.minigame` is
  set and `minigameRequest` is emitted. The UI host plays it and calls core `resolveMinigame(g,
  result)`, which dispatches to `g.minigameHandlers[purpose]`. `autoResolveMinigame(g)` gives 0.5.
- Performance rules: no allocation in steady-state ticks beyond real state changes, no `Object.keys`
  over the inventory per tick (iterate only when `rev` or a counter says so), bounded arrays
  (salvage, outbox, buffs, queues, logs), no closures created per tick.

## UI model

- `src/store/game.ts` owns the `Game` instance, the `Stepper`, autosave and the 10 Hz pulse.
  Components read with `useGame(selector, isEqual?)`: the selector is re-evaluated on each pulse and
  the component re-renders only when the selected value changed. Selectors must return primitives,
  stable references, or use the provided shallow comparer. Per-frame values (heat gauge, progress
  bars, number tweens) use Reanimated shared values, never React state.
- Screen = Viewport (top 48 %) + Control Deck (bottom 52 %): status LCD strip, tab content, key row.
  Overlays (event dialog, mini-game host, offline log, failure banner, story beat) render above both
  and pause the viewport when they cover it.
- All colors from `ui/theme.ts`, all text through `kit/Txt` (font scaling clamped), all press
  feedback through `platform/feedback`. Hit targets >= 44 pt. Safe areas respected.
- Lists are `FlatList` with stable keys and `getItemLayout` where rows are fixed height.
- UI chrome strings: i18next namespaces. Authored content: `L10n` objects rendered with `tr()`.

## Render model

- `Viewport` props: `ViewportProps` (render/types.ts). Internal resolution 180 px wide, integer
  nearest-neighbour upscale. Skia implementation: one `Canvas`, shaders compiled once (try/catch,
  fallback to flat fills), sprites drawn with `Atlas`, particles in preallocated typed arrays, no
  per-frame JS allocation, loop paused when `quality.paused`.
- Only `src/render/loadSkia.ts` may reference `src/render/skia`. `EXPO_PUBLIC_RENDER=lite` builds
  contain no Skia JS (checked in CI by `scripts/ci/check-lite-bundle.mjs`). Nothing outside
  `src/render/skia` imports `@shopify/react-native-skia`.

## Persistence

- `core/save.ts`: `serialize(state)` -> JSON + checksum; `deserialize` validates, migrates
  (`migrations[v]`), sanitizes Big values, clamps clocks. Export code = base64url(deflate-less compact
  JSON with RLE-free packing) + CRC32, prefix `DTO1.`.
- `platform/storage.ts`: atomic write (temp file + move) with 3 rotating backups in the document
  directory; load tries newest to oldest; a corrupt main file never loses the backups.
- Autosave every 10 s and on background.

## Crash resistance

- `platform/crashGuard.ts`: writes "launching" before mounting the game, clears it after 10 s of
  healthy running. Two unclean launches in a row boot Safe Mode: render mode `lite`, effects off,
  a clear message, and a button to try full mode again.
- Root error boundary with a recovery screen (retry, safe mode, export save).

## Ownership (parallel work)

One owner per path. Agents never edit files outside their paths; they report needed contract changes
instead. Only the orchestrator commits to git.

| Path | Owner |
| --- | --- |
| `src/engine/types.ts`, `big.ts`, `prng.ts`, `kernel.ts`, `index.ts`, `src/content/index.ts`, `src/i18n/index.ts`, `src/i18n/resources.ts`, `src/ui/theme.ts`, `src/ui/fonts.ts`, `src/render/types.ts`, `src/render/mode.ts`, `src/render/loadSkia.ts`, `src/minigames/types.ts`, `src/platform/feedback.ts`, `package.json`, `app.json`, `.github/`, `docs/` | orchestrator |
| `src/engine/core/**`, `tests/core/**` | engine-core |
| `src/engine/world/**`, `tests/world/**` | engine-world |
| `src/engine/meta/**`, `tests/meta/**` | engine-meta |
| `src/content/economy/**` | content-economy |
| `src/content/events/**` | content-events |
| `src/content/story/**` | content-narrative |
| `src/ui/kit/**`, `src/i18n/locales/*/common.ts`, `src/app/kit.tsx` | ui-kit |
| `src/render/skia/**`, `src/render/lite/**`, `src/render/Viewport.tsx`, `src/app/viewport.tsx`, `scripts/preview/**` | render |
| `scripts/assets/**`, `scripts/blender/**`, `assets/**` (except `assets/audio`), `src/ui/icons.generated.ts`, `src/render/atlas.generated.ts`, `src/ui/portraits.generated.ts` | assets |
| `scripts/audio/**`, `assets/audio/**`, `src/audio/**` | audio |
| `src/minigames/shared.tsx`, `src/store/**`, `src/platform/**` | orchestrator |
| `src/minigames/{weld,wire,rhythm,host}/**`, `src/minigames/index.ts`, `src/app/minigames.tsx`, `src/i18n/locales/*/minigames.ts` | minigames-a |
| `src/minigames/{valves,calibrate,tape}/**`, `src/app/mg-b.tsx` | minigames-b |
| `src/minigames/{defense,dock,hack}/**`, `src/app/mg-c.tsx`, `tests/minigames/**` | minigames-c |
| `src/app/_layout.tsx`, `src/app/index.tsx`, `src/ui/shell/**`, `src/i18n/locales/*/{story,world}.ts`, `src/app/dev-shell.tsx` | shell |
| `src/ui/screens/ship/**`, `src/i18n/locales/*/ship.ts`, `src/app/dev-ship.tsx` | screens-ship |
| `src/ui/screens/{craft,grid}/**`, `src/i18n/locales/*/{craft,grid}.ts`, `src/app/dev-craft.tsx` | screens-craft |
| `src/ui/screens/nav/**`, `src/i18n/locales/*/nav.ts`, `src/app/dev-nav.tsx` | screens-nav |
| `src/ui/screens/crew/**`, `src/i18n/locales/*/crew.ts`, `src/app/dev-crew.tsx` | screens-crew |
| `src/ui/screens/meta/**`, `src/i18n/locales/*/meta.ts`, `src/app/dev-meta.tsx` | screens-meta |
| `src/ui/screens/{log,settings}/**`, `src/i18n/locales/*/{log,settings}.ts`, `src/app/dev-log.tsx` | screens-log |
| `scripts/sim/**` (except smoke.ts), `scripts/validate/**`, `tests/sim/**`, balance numbers in `src/content/economy/**`, engine bug fixes in `src/engine/{core,world,meta}/**` | sim-qa |
| `src/ui/common/**`, `src/ui/dev/**`, `src/ui/format.ts` | orchestrator |

## Commands

```
npm run typecheck   npm test   npm run validate   npm run sim   npm run soak   npm run fuzz
npm run assets      npm run lint   npm run doctor
node scripts/ci/check-native-config.mjs      # entitlements / background modes / bundle id, any OS
```

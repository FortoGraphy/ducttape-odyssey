# UI screens brief (wave 2, read after AGENT_BRIEF.md)

The engine, content, UI kit, audio and the platform layer exist. You build screens on top of them.

## What exists (read the files, do not guess APIs)

- **Engine actions**: plain functions `(g: Game, ...) => ActionResult` exported from
  `@/engine/core`, `@/engine/world`, `@/engine/meta` (read each `index.ts` and the source of what you
  call). State is `g.state` (`GameState` in `src/engine/types.ts`), caches are `g.rates`, `g.mods`.
- **Content**: `import { content } from "@/content"` (items, recipes, decks, research, events, ...).
- **Game store** (`src/store/game.ts`):
  - `useGame(selector, isEqual?, every?)`: re-evaluated on every 10 Hz pulse, re-renders only when
    the selected value changed (shallow compare by default). Select primitives or small flat
    objects/arrays. NEVER return `g.state` or a nested state object: it is mutated in place and will
    never look changed. For lists select a compact signature (ids + the numbers you render).
  - `act((g) => buyDeck(g, "mining"))`: runs an action and wakes subscribers immediately.
  - `getGame()`, `onEngineEvent(listener)`, `onOfflineReport(listener)`, `saveNow()`.
- **UI store** (`src/store/ui.ts`): `useUi`, `goTo(tab, section?)`, tab ids
  `ship craft grid nav crew meta log settings`.
- **Settings** (`src/store/settings.ts`): `useSettings((s) => s.x)`, `useSettings.getState().set(key, value)`.
- **Formatting** (`src/ui/format.ts`): `fmt` (Big or number), `fmtRate`, `fmtPct`, `fmtBonus`,
  `fmtTime`, `itemName`, `useFmt()`. Never print a Big any other way.
- **Kit** (`src/ui/kit`, gallery in `src/app/kit.tsx`): use it for everything. Do not restyle from
  scratch. `useTheme()` for colors, `Txt` for all text, `Icon` for all pictograms (names in
  `docs/ICONS.md`; item icon name = item id), `toast()` / `popNumber()` for feedback, `Sheet` /
  `Dialog` for modals, `LcdNumber` for tweening numbers, `ProgressBar`/`Gauge` with shared values.
- **Text**: UI chrome through i18next: `const t = useT("<your namespace>")`, keys in
  `src/i18n/locales/{cs,en}/<namespace>.ts` (identical key sets, Czech plurals with
  `_one/_few/_many/_other`). Content strings (`L10n`) through `tr(x)` / `useTr()`.
- **Feedback**: `haptic()` / `sfx()` from `src/platform/feedback` (the kit's `Key` already does it).
- **Preview**: `src/ui/dev/Harness.tsx` (`<DevHarness>` boots a deterministic game from
  `?preset=fresh|early|mid|late|damaged`, `&theme=night`, `&lang=en`, `&failure=<kind>`,
  `&event=<id>`, `&full=1`) and `src/store/presets.ts`. Create your own preview route(s)
  `src/app/dev-<name>.tsx` rendering your screen inside `<DevHarness>`.
- **Isolated web preview** (other agents' half-written routes must not break your bundle): follow the
  header of `scripts/preview/isolated.mjs` (private router root under `.scratch/<you>/app` using
  `src/ui/dev/DevLayout`, your own Metro on your assigned port + 10000, the proxy on your assigned
  port), then `scripts/preview/shot.mjs`. Stop your servers when done.

## Rules for screens

- A tab screen is `src/ui/screens/<tab>/index.tsx` with a default-exported component that fills its
  parent (`flex: 1`); the shell gives it the Control Deck content area (about 375 x 330 pt on an
  iPhone 13 mini, between the status strip and the tab keys) and handles safe areas. Everything
  longer scrolls inside (`FlatList` with stable keys for lists, `getItemLayout` for fixed rows).
  Sub-sections inside a tab use the kit's `Segmented` or small keys at the top.
- One thumb: primary actions in the lower half, hit targets >= 44 pt, no hover-only affordances.
- Every action answers: disabled state with the reason (cost in red via `CostTag`, lock + what
  unlocks it), success feedback (number pop / LED / toast), failure feedback (`sfx("deny")`).
- Show the consequence before commitment where the design says so (stat deltas, costs, risks).
- Empty, locked and loading states are designed, not blank (kit `EmptyState`, lock cards that say
  how to unlock). Features not yet unlocked (`g.state.features`) are shown as teasers or hidden,
  never as broken controls.
- No per-frame React state. Progress bars and timers animate with shared values driven from the
  10 Hz selection (set a target, let Reanimated interpolate) or the kit's `TimerBar`.
- Performance: selectors are cheap (no sorting whole inventories at 10 Hz: use `every` 3-5 for
  heavy lists, memoize rows, `React.memo` list items).
- All text bilingual, native Czech, dry humor where it fits, no emoji or symbol characters the
  pixel fonts lack (see AGENT_BRIEF.md).

## Acceptance for every screens agent

- `npx tsc --noEmit` clean for your paths; `npx eslint <your paths>` clean.
- cs and en namespace files have identical key sets (small node check).
- Screenshots at 375x812 @3x of every screen and sub-section you built, in presets `early`, `mid`
  and `late` (plus `fresh` where the first-run view matters), day theme and at least two in night
  theme, with Czech text. READ them and iterate until the layout is clean, legible, consistent with
  the kit and never overflows at 375 pt. Exercise the main actions with Playwright clicks (buy,
  craft, install, jump, research, ...) and screenshot the result state. Save finals in
  `.scratch/<you>/` and list them in the report.
- Report honestly what was only verified on web.

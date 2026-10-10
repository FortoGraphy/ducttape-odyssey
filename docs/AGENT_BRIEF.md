# Agent brief (read first)

You are one of several agents building **Duct Tape Odyssey** in parallel, an offline endless space
idle-tycoon for iPhone (Expo SDK 57, React Native 0.86, TypeScript strict). The user is asleep; the
orchestrator integrates your work. Quality bar: a polished commercial game, not a prototype.

## Read before writing code

1. `docs/GDD.md` (design and numbers), `docs/ARCHITECTURE.md` (layers, rules, ownership).
2. `src/engine/types.ts` (the contract), and for engine work `src/engine/kernel.ts`, `big.ts`, `prng.ts`.
3. UI/art work: `docs/ART_BIBLE.md`, `src/ui/theme.ts`, `src/ui/fonts.ts`, `docs/ICONS.md`.
4. `AGENTS.md`: Expo changes every SDK. Before using any Expo / React Native / Skia / Reanimated API,
   check the installed package's types in `node_modules` or fetch the versioned docs
   (`https://docs.expo.dev/versions/v57.0.0/sdk/<name>/`). Do not trust memory.

## Hard rules

- **Stay in your paths.** Only create/edit files under the paths you own (listed in your task). If
  you need a change elsewhere (a contract type, a dependency, another area's file), do NOT make it:
  work around it locally and list it under "Requests for the orchestrator" in your final report.
- **No git commands that change anything** (no add/commit/checkout/stash/reset). No `npm install`,
  no `npx expo install`, no edits to `package.json`, `app.json`, `tsconfig.json`, `metro.config.js`.
  Never create or edit `ios/` or `android/`.
- Other agents are editing other folders at the same time. `npx tsc --noEmit` checks the whole
  project, so errors in files you do not own are not yours: filter the output to your paths
  (`npx tsc --noEmit 2>&1 | grep "src/your/path"`) and do not "fix" other people's files.
- Code, comments and identifiers in English. Comments only where they explain a non-obvious why.
- All player-facing text exists in Czech and English. Czech is written natively and idiomatically
  with correct diacritics, never translated word for word. Humor must land in both languages.
- IP hygiene: everything is original. No names, terms or assets from No Man's Sky (no "Atlas",
  "Sentinels", "Traveller", "Nanites", "Quicksilver", "Anomaly" as a proper noun...), no Teenage
  Engineering names/logos/product artwork, no other game or brand references.
- No `console.log` left in app code (`console.warn` in catch blocks is fine). Scripts may print.
- No new runtime dependencies. If you believe one is essential, explain why in your report.
- Performance: nothing allocates per frame; per-frame values live in Reanimated shared values or
  Skia, never React state. Engine ticks (10 Hz) must stay allocation-light and O(small).
- Only `src/render/skia/**` may import `@shopify/react-native-skia`. Mini-games and UI never do.

## Canonical ids (anyone may reference these; content-economy must define all of them)

- Decks: `bridge observatory quarters lab greenhouse hangar workshop fabricator refinery cargo lift reactor mining`
- T0 raw: `scrap ice silicates carbon hydrogen conductite lumite voidglass antimatter organics sulfur ferrite helium3 brine xenon strange_dust`
- T1 refined: `alloy coolant fuel glass polymer slag water oxygen wire ceramic`
- T2 components: `circuit actuator plating lens power_cell tubing`
- Consumables: `duct_tape spare_parts nano_gel fuel_cell coffee beacon`
- Module families: `laser engine shield scanner reactor cargo repair life`, item ids `mod_<family>_mk<1-5>`
- Failure kinds: `tumble breach blackout noFuel engine radiation boarding anomaly`
- Mini-games: `weld wire rhythm valves calibrate tape defense dock hack`
- Factions: `lamplighters` (Lamplighters Guild, traders), `rustborn` (Rustborn Collective,
  scavengers), `ledger` (The Quiet Ledger, auditors)
- Hull classes: first is `tug`
- Story names: ship AI **KIPP** (Kinetic Intelligence for Propulsion & Plumbing), tug **S.S. Gaffer**,
  player default "Chief Wrench" (Engineer 3rd Class), the signal: "Please hold. Your call is
  important to us."

## Tools on this machine (Windows 11, Git Bash and PowerShell available)

- Node 24, npm 11, Python 3.12 (Pillow, numpy, fonttools), ffmpeg, uv.
- Blender 5.2.2: `"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --python <script>`
- Tests: vitest, files in `tests/<area>/*.test.ts`, run `npx vitest run tests/<area>`.
- Screenshots (iPhone 13 mini, 375x812 @3x): `node scripts/preview/shot.mjs <url> <out.png> [--wait ms] [--click "text=..."]`.
  For a web build without a dev server: `npx expo export --platform web --output-dir <dir>` then serve
  the folder (`npx serve -s <dir> -l <port>` is NOT installed; use `python -m http.server <port> -d <dir>`).
  If you start a dev server, use your assigned port and stop it when done. LOOK at your screenshots
  (Read the PNG) and fix what looks off. Never claim visual quality you have not looked at.
- Scratch space for temporary files: your own folder under `.scratch/<your-name>/` in the project
  root (git-ignored). Do not leave temp files elsewhere.

## Final report (keep it under 60 lines)

1. What you built (files, key decisions).
2. Verification you ran and its actual output (typecheck for your paths, tests, screenshots viewed).
3. Known gaps or shortcuts, honestly.
4. Requests for the orchestrator (contract changes, dependencies, cross-area hooks you need).

# Progress

Updated after every milestone so work can resume after a context reset. Newest state first.

## Now

- **All phases merged.** Final CI run 38115093227 is green for both IPAs (full Skia + lite):
  https://github.com/FortoGraphy/ducttape-odyssey/actions/runs/38115093227
- Local gates all pass: `npx tsc --noEmit`, `npx vitest run` (481), `npx expo lint` (0 errors),
  `npm run validate`, `npm run sim` (5 seeds), `npm run fuzz` (0 softlocks), `npm run soak`,
  `npx expo-doctor`, lite/skia bundle checks, native config check.
- Tagged `v1.0.0`. Waiting for the on-device check by Honza (checklist in docs/MORNING.md).

## Not done (budget ran out after the usage-limit interruption)

- Independent QA reviewer pass, dedicated juice pass, full Czech/English read-through.
- Late-game balance: active/idle ratio after 2 h is 8-12x (target 3-8x); rebuild/reboot pacing unsimulated.
- Drag-to-place in the tech grid; cosmetic paint on atlas ship sprites; per-tier mini-game hints.
- Nothing has run on a device.

## Done

- Tooling verified: node 24, npm 11, git, gh (FortoGraphy), python 3.12 + Pillow/numpy/fonttools, uv, ffmpeg, Blender 5.2.2.
- Repo: https://github.com/FortoGraphy/ducttape-odyssey (public).
- Spike: Skia SkSL shader + Reanimated + Czech fonts + haptics; lite bundle verified Skia-free.
- Contracts: `src/engine/types.ts`, `big.ts`, `prng.ts`, `kernel.ts`, `render/types.ts`, `minigames/types.ts`, `platform/feedback.ts`, `ui/theme.ts`, i18n scaffolding.
- Docs: GDD, ARCHITECTURE, ART_BIBLE, NAMING, DECISIONS.

## Next

1. Verify and commit each agent's result (run its checks, look at its screenshots).
2. Integration: full web export, screenshots of the real game in every preset, fix what is off.
3. CI build of both IPAs, then README, final MORNING.md, tag v1.0.0.
4. If budget remains: fresh QA reviewer, juice pass, Czech/English read-through.

## Open risks

- No device tonight: a launch crash can only be mitigated (lite IPA, Safe Mode, crash-loop guard).
- Skia on web (CanvasKit) for screenshots may be brittle; fallback is a Node-side render harness.
- Scope is very large; breadth targets (150 items, 120 recipes, 80 events, 100 achievements, 9 mini-games) are validated by scripts.

# Progress

Updated after every milestone so work can resume after a context reset. Newest state first.

## Now

- **Phase 0 (bootstrap and de-risk)**: project skeleton, CI workflow, spike app, contracts, planning docs.
- CI run 1 failed at the entitlement check (plugin order), fixed. CI run 2 in progress.

## Done

- Tooling verified: node 24, npm 11, git, gh (FortoGraphy), python 3.12 + Pillow/numpy/fonttools, uv, ffmpeg, Blender 5.2.2.
- Repo: https://github.com/FortoGraphy/ducttape-odyssey (public).
- Spike: Skia SkSL shader + Reanimated + Czech fonts + haptics; lite bundle verified Skia-free.
- Contracts: `src/engine/types.ts`, `big.ts`, `prng.ts`, `kernel.ts`, `render/types.ts`, `minigames/types.ts`, `platform/feedback.ts`, `ui/theme.ts`, i18n scaffolding.
- Docs: GDD, ARCHITECTURE, ART_BIBLE, NAMING, DECISIONS.

## Next

1. Wave 1 agents in parallel: engine core/world/meta, content economy/events/narrative, UI kit, render, assets, audio.
2. Wave 2: mini-games (after the kit), game shell and screens (after engine + kit), simulator/validators.
3. Wave 3: integration, QA, balance, soak, screenshots, final builds, tag v1.0.0.

## Open risks

- No device tonight: a launch crash can only be mitigated (lite IPA, Safe Mode, crash-loop guard).
- Skia on web (CanvasKit) for screenshots may be brittle; fallback is a Node-side render harness.
- Scope is very large; breadth targets (150 items, 120 recipes, 80 events, 100 achievements, 9 mini-games) are validated by scripts.

# Art Bible

The app is a pocket instrument sitting in front of a window onto space. The signature is the
contrast: a **dark, moody pixel-art viewport** above a **light, tactile hardware panel**.

## Palette: "Night Shift" (32 colors, `assets/palette.json`)

Every sprite, icon and shader ramp is quantized to these colors. Keys are stable identifiers.

- Space: `void0..3` (near-black blues), `violet0..3` (nebula), `teal0..2` + `mint`, `cobalt0..2`.
- Metal and panel: `steel0..3`, `bone0..2` (warm off-white).
- Heat and signal: `rust0..1`, `orange` (signal orange, primary accent), `amber`, `yellow`.
- Alerts and life: `red0..1`, `green0..1`, `lime`.

Accent meaning on the panel: orange = primary action / active, cobalt = navigation and info,
yellow = caution and currency, mint = OK / power / LCD, red = damage and danger.

## Viewport (top 48 %)

- Internal resolution **180 px wide** (height follows aspect, about 187 px on iPhone 13 mini),
  nearest-neighbour integer upscale (x2 points = x6 device pixels at @3x). Never smooth-scale.
- Layers back to front: nebula shader -> 3 parallax star layers -> star glow -> planet (shader) ->
  station / asteroids / salvage -> drones -> ship -> lasers and engine particles -> hazards / weather
  overlay -> bloom of emissives -> vignette -> faint LCD grid.
- Lighting: one key light from the system star (upper left by default), dithered terminator on
  planets (ordered 4x4 Bayer), rim light on the ship, emissive pass for windows, engines, lasers and
  LEDs. Bloom is applied only to the emissive pass. Realistic and moody, never flat or cartoonish.
- Ship: the S.S. Gaffer is a stubby salvage tug: asymmetric, patched plates in mismatched colors,
  one oversized engine, a cargo cradle, an antenna that is visibly bent, visible duct tape. About
  48x28 px side view at rest, 16 rotation frames for tumbling.
- Motion: slow parallax drift, engine flicker (2-3 frame cycle), hull sparks when damaged, screen
  shake on impacts (max 3 px at internal resolution), warp streaks during jumps.
- Reduce-motion: no shake, no flashes, parallax at 25 %.

## Control Deck (bottom 52 %)

Original hardware in the spirit of compact pocket synthesizers. No real product is copied.

- Body: `bone1` with a subtle top highlight (`bone2`) and bottom shade (`bone0`); "night" theme uses
  graphite (`steel0`). 1 px engraved rules, corner screws, tiny printed micro labels (mono, upper
  case, letter-spaced), a few stickers (warranty void, inspected by nobody).
- Keys: black rubber, rounded 7 pt, 3 pt travel on press with shadow collapse, click sound, haptic.
  Colored caps for primary actions (orange) and navigation (cobalt).
- Rotary encoders: drag to rotate, detents with haptic ticks, a painted indicator line.
- LCDs: near-black glass, dot-matrix font (Doto), lit color `#C9F5D5`, ghost segments visible,
  numbers tween between values. Warnings switch the readout to orange.
- LED rows: 16-step rows as progress bars and sequencer steps; LEDs glow softly when lit.
- Layout grid 4 pt. Outer margin 12 pt. Nothing touches the screen edges or the home indicator.
- Feedback on every action: number pop, LED blink, key travel, sound, haptic.

## Typography (OFL, bundled, Czech diacritics verified by `scripts/assets/build_fonts.py`)

- **Doto** (Bold/Black): LCD readouts.
- **Pixelify Sans** (Regular/Bold): titles, viewport captions, event headings.
- **IBM Plex Mono** (Regular/Medium/Bold): labels, body text, dialogue. Arrows only exist here.

## Sprites and icons

- Blender, headless, orthographic camera, flat/toon shading plus a separate emissive pass; render at
  4x, downsample with box filter, quantize to the palette (no dithering on sprites below 32 px),
  1 px darker outline on the lower right. Atlases are power-of-two, at most 2048 px, with JSON
  frames; emissive frames carry the suffix `_e`.
- Naming: `ship_<hull>_<00-15>`, `drone_<hauler|probe|salvager|fixer>_<0-3>`, `station_<0-3>`,
  `asteroid_<0-5>`, `salvage_<crate|pod|wreck|crystal>`, `tow_<0-3>`, `meteor_<0-3>`,
  `pirate_<0-3>`, `derelict_<0-2>`, `probe_<0-1>`.
- UI and item icons: 16x16 pixel grids authored in code, exported at 96 px (x6 nearest) so that
  16 / 24 / 32 pt all land on integer ratios at @3x. One icon per item, built from shared shapes per
  category with palette swaps so the set stays consistent.
- Crew portraits: 32x32 layers (head, hair, eyes, mouth, suit, accessory, background) composited at
  runtime from a seed.
- App icon and splash come from the same pipeline (the tug against a nebula, a strip of tape).

## Do not

- No gradients on the panel except the two bevel tones. No drop shadows larger than 4 pt.
- No colors outside the palette (text ink and LCD tones in `ui/theme.ts` are the documented exceptions).
- No names, logos or artwork from existing games or hardware brands.

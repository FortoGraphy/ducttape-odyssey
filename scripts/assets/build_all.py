"""One-command asset pipeline for Duct Tape Odyssey.

    python scripts/assets/build_all.py [--skip-blender] [--fonts]

Steps: fonts (existing script, only when stale) -> item manifest (tsx, from the real content) ->
Blender renders (4x, color + emissive) cached as strips in assets-src/renders -> palette sprites
and atlases -> UI / item / cosmetic icons -> crew portrait layers -> app icon, splash, favicon ->
event vignettes -> generated TypeScript -> checks. Idempotent; exits non-zero when a check fails.
`--skip-blender` reuses the committed render cache (machines without Blender, CI).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from PIL import Image  # noqa: E402

import icons_lib  # noqa: E402
import pal  # noqa: E402
import portraits_lib  # noqa: E402
import scenes  # noqa: E402
import sprites  # noqa: E402

ROOT = pal.ROOT
ASSETS = pal.ASSETS
SCRATCH = pal.SCRATCH
RAW = SCRATCH / "raw"
CACHE = ROOT / "assets-src" / "renders"
MANIFEST = HERE / "item_manifest.json"
SIZE_BUDGET = 6 * 1024 * 1024
EXTRA_HULLS = ["relic"]  # rendered in addition to the content's hull classes

errors: list[str] = []
summary: list[str] = []


def fail(msg: str) -> None:
    errors.append(msg)
    print(f"  FAIL {msg}")


def note(msg: str) -> None:
    summary.append(msg)
    print(f"  {msg}")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def sync_dir(folder: Path, images: dict[str, Image.Image]) -> None:
    """Writes name -> image as PNGs and removes PNGs that are no longer produced."""
    folder.mkdir(parents=True, exist_ok=True)
    keep = set()
    for name, img in images.items():
        pal.save(img, folder / f"{name}.png")
        keep.add(f"{name}.png")
    for old in folder.glob("*.png"):
        if old.name not in keep:
            old.unlink()


def ts_key(name: str) -> str:
    return name if re.fullmatch(r"[A-Za-z_$][A-Za-z0-9_$]*", name) else json.dumps(name)


# ---------- steps -----------------------------------------------------------------------------

def step_fonts(force: bool) -> None:
    script = HERE / "build_fonts.py"
    src = ROOT / "assets-src" / "fonts"
    out = ASSETS / "fonts"
    wanted = ["Doto-Bold", "Doto-Black", "PixelifySans-Regular", "PixelifySans-Bold", "IBMPlexMono-Regular", "IBMPlexMono-Medium", "IBMPlexMono-Bold"]
    newest_src = max((p.stat().st_mtime for p in src.glob("*.ttf")), default=0.0)
    stale = [n for n in wanted if not (out / f"{n}.ttf").exists() or (out / f"{n}.ttf").stat().st_mtime < newest_src]
    if not force and not stale:
        note(f"fonts: {len(wanted)} up to date (use --fonts to rebuild)")
        return
    res = subprocess.run([sys.executable, str(script)], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
    if res.returncode != 0:
        fail(f"build_fonts.py failed:\n{res.stdout}\n{res.stderr}")
    else:
        note(f"fonts: rebuilt {len(wanted)}")


def canonical_manifest() -> dict:
    """Last-resort copy of the canonical ids from docs/AGENT_BRIEF.md, used when tsx cannot run."""
    def entries(ids: str, tier: int, category: str) -> list[dict]:
        return [{"id": i, "tier": tier, "category": category, "tags": []} for i in ids.split()]

    items = entries("scrap ice silicates carbon hydrogen conductite lumite voidglass antimatter organics sulfur ferrite helium3 brine xenon strange_dust", 0, "raw")
    items += entries("alloy coolant fuel glass polymer slag water oxygen wire ceramic", 1, "refined")
    items += entries("circuit actuator plating lens power_cell tubing", 2, "component")
    items += entries("duct_tape spare_parts nano_gel fuel_cell coffee beacon", 1, "consumable")
    for family in "laser engine shield scanner reactor cargo repair life".split():
        for mk in range(1, 6):
            items.append({"id": f"mod_{family}_mk{mk}", "tier": 3, "category": "module", "family": family, "mk": mk, "tags": []})
    return {"source": "canonical", "items": items, "cosmetics": [], "hulls": ["tug"]}


def step_manifest() -> dict:
    npx = shutil.which("npx")
    ran = False
    if npx:
        res = subprocess.run(f'"{npx}" tsx scripts/assets/dump_items.ts', cwd=ROOT, capture_output=True, text=True, encoding="utf-8", shell=True)
        ran = res.returncode == 0
        if not ran:
            print(f"  warn: dump_items.ts failed, keeping the previous manifest\n{res.stderr.strip()[-600:]}")
    if not ran and not MANIFEST.exists():
        write_text(MANIFEST, json.dumps(canonical_manifest(), indent=1) + "\n")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    note(f"manifest: {manifest['source']}, {len(manifest['items'])} items, {len(manifest['cosmetics'])} cosmetics, hulls {' '.join(manifest['hulls'])}")
    return manifest


def find_blender() -> str | None:
    candidates = [os.environ.get("BLENDER"), r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe", shutil.which("blender"),
                  "/Applications/Blender.app/Contents/MacOS/Blender"]
    for c in candidates:
        if c and Path(c).exists():
            return c
    return None


def step_blender(skip: bool, hulls: list[str]) -> None:
    if skip:
        if not (CACHE / "manifest.json").exists():
            fail("--skip-blender needs the render cache in assets-src/renders (run once without the flag)")
            return
        cached = json.loads((CACHE / "manifest.json").read_text())["groups"]
        missing = [h for h in hulls if f"ship_{h}" not in cached]
        if missing:
            fail(f"render cache has no hull(s) {missing}; run without --skip-blender")
        note(f"blender: skipped, reusing {len(cached)} cached groups")
        return
    blender = find_blender()
    if not blender:
        fail("Blender not found (set BLENDER or use --skip-blender)")
        return
    if RAW.exists():
        shutil.rmtree(RAW)
    RAW.mkdir(parents=True)
    t0 = time.time()
    cmd = [blender, "--background", "--factory-startup", "--python-exit-code", "1", "--python", str(ROOT / "scripts" / "blender" / "render_sprites.py"),
           "--", "--out", str(RAW), "--ss", "4", "--hulls", ",".join(hulls)]
    res = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if res.returncode != 0 or not (RAW / "manifest.json").exists():
        tail = "\n".join((res.stdout + "\n" + res.stderr).splitlines()[-25:])
        fail(f"Blender render failed (exit {res.returncode}):\n{tail}")
        return
    strips = sprites.collect(RAW, CACHE)
    frames = sum(len(g["frames"]) for g in json.loads((CACHE / "manifest.json").read_text())["groups"].values())
    note(f"blender: {frames} frames x 2 passes in {time.time() - t0:.0f} s -> {strips} cached strips")


def expected_frames(hulls: list[str]) -> list[str]:
    names = [f"ship_{h}_{i:02d}" for h in hulls for i in range(16)]
    names += [f"drone_{k}_{i}" for k in ("hauler", "probe", "salvager", "fixer") for i in range(4)]
    names += [f"station_{i}" for i in range(4)] + [f"asteroid_{i}" for i in range(6)]
    names += [f"salvage_{k}" for k in ("crate", "pod", "wreck", "crystal")]
    names += [f"tow_{i}" for i in range(4)] + [f"meteor_{i}" for i in range(4)] + [f"pirate_{i}" for i in range(4)]
    names += [f"derelict_{i}" for i in range(3)] + [f"probe_{i}" for i in range(2)]
    return names


def step_sprites(hulls: list[str]) -> dict[str, Image.Image]:
    frames, groups, anchors = sprites.process_all(CACHE)
    packable = {k: v for k, v in frames.items() if not k.startswith("hero_")}
    pack_groups = {g: info for g, info in groups.items() if not g.startswith("hero_")}
    atlases, table = sprites.pack(packable)
    sync_dir(ASSETS / "sprites", {f"atlas-{i}": a for i, a in enumerate(atlases)})
    doc = {"atlases": [f"atlas-{i}.png" for i in range(len(atlases))], "frames": {k: table[k] for k in sorted(table)},
           "groups": {g: pack_groups[g]["frames"] for g in sorted(pack_groups)}, "anchors": {g: anchors[g] for g in sorted(anchors)}}
    write_text(ASSETS / "sprites" / "atlas.json", json.dumps(doc, indent=1) + "\n")
    sprites.write_ts(ROOT / "src" / "render" / "atlas.generated.ts", len(atlases), table, anchors, pack_groups)

    for name in expected_frames(hulls):
        for suffix in ("", "_e"):
            if name + suffix not in table:
                fail(f"atlas frame missing: {name + suffix}")
    # Silhouette sanity at 1x: every base frame must cover a meaningful part of its rect.
    for name, im in packable.items():
        if name.endswith("_e"):
            continue
        alpha = im.getchannel("A")
        solid = sum(1 for v in alpha.getdata() if v)
        if solid < 20 or solid < 0.08 * im.width * im.height:
            fail(f"sprite {name} barely visible at 1x ({solid} px in {im.width}x{im.height})")
    for a in atlases:
        if a.width != a.height or a.width & (a.width - 1) or a.width > 2048:
            fail(f"atlas size {a.size} is not a power of two <= 2048")

    # Viewing sheets (lit = base + emissive) for the human / agent review.
    def lit(n: str) -> Image.Image:
        return scenes.lit(frames, n)

    SCRATCH.mkdir(parents=True, exist_ok=True)
    rest = [lit(f"ship_{h}_00") for h in hulls]
    pal.sheet(rest, 4, 4, "void1").save(SCRATCH / "view_ships_rest_x4.png")
    pal.sheet(rest, 4, 1, "void1").save(SCRATCH / "view_ships_rest_x1.png")
    if "ship_tug_00" in frames:
        pal.sheet([lit(f"ship_tug_{i:02d}") for i in range(16)], 8, 4, "void1").save(SCRATCH / "view_ship_tug_x4.png")
        pal.sheet([frames["ship_tug_00"], frames["ship_tug_00_e"], lit("ship_tug_00")], 3, 8, "void2").save(SCRATCH / "view_ship_tug_passes_x8.png")
    world = [lit(n) for g, info in pack_groups.items() if not g.startswith("ship_") for n in info["frames"]]
    pal.sheet(world, 8, 4, "void1").save(SCRATCH / "view_world_x4.png")
    for i, a in enumerate(atlases):
        bg = Image.new("RGBA", a.size, pal.c("void1"))
        bg.alpha_composite(a)
        bg.save(SCRATCH / f"view_atlas-{i}.png")
    sizes = ", ".join(f"{a.width}x{a.height}" for a in atlases)
    note(f"sprites: {len(table)} frames ({len(table) // 2} + emissive) in {len(atlases)} atlas(es) [{sizes}], {len(pack_groups)} groups")
    return frames


def required_icon_names() -> list[str]:
    text = (ROOT / "docs" / "ICONS.md").read_text(encoding="utf-8")
    section = text.split("## Required names", 1)[1]
    names: list[str] = []
    for line in section.splitlines():
        if not line.startswith("- "):
            if names and line.strip() and not line.startswith(" "):
                break  # the closing paragraph after the list
            continue
        for chunk in re.findall(r"`([^`]+)`", line):
            names += chunk.split()
    return names


def step_icons(manifest: dict, frames: dict[str, Image.Image]) -> None:
    import icons_items
    import icons_ui_core
    import icons_ui_world

    icons: dict[str, Image.Image] = {}
    generated = icons_items.build_item_icons(manifest)
    for name, img in generated.items():
        icons[name] = img
    ui = {**icons_ui_core.ICONS, **icons_ui_world.ICONS}
    shadowed = sorted(set(ui) & set(generated))
    for name, grid in ui.items():
        icons[name] = icons_lib.parse(grid)  # hand-drawn UI art wins over a generated item icon of the same name
    for name, img in icons.items():
        if img.size != (16, 16):
            fail(f"icon {name} is {img.size}, expected 16x16")
    sync_dir(ASSETS / "icons", {n: icons_lib.export(im) for n, im in icons.items()})

    vignettes = {f"ev_art_{k}": pal.upscale(scenes.vignette(k, frames), 6) for k in scenes.VIGNETTES}
    sync_dir(ASSETS / "vignettes", vignettes)

    lines = ["// Generated by scripts/assets/build_all.py. Do not edit by hand.", "/* eslint-disable */", "export const icons = {"]
    for name in sorted(icons):
        lines.append(f'  {ts_key(name)}: require("../../assets/icons/{name}.png"),')
    lines += ["} as const;", "", "export type IconName = keyof typeof icons;", "",
              "/** 64x40 event illustrations (exported at 384x240), keyed by event type. */", "export const eventArt = {"]
    for k in scenes.VIGNETTES:
        lines.append(f'  {k}: require("../../assets/vignettes/ev_art_{k}.png"),')
    lines += ["} as const;", "", "export type EventArtName = keyof typeof eventArt;", ""]
    write_text(ROOT / "src" / "ui" / "icons.generated.ts", "\n".join(lines))

    required = required_icon_names()
    wanted = set(required) | {i["id"] for i in manifest["items"]} | {c["id"] for c in manifest["cosmetics"] if c["kind"] in ("sticker", "toy")}
    ts = (ROOT / "src" / "ui" / "icons.generated.ts").read_text(encoding="utf-8")
    for name in sorted(wanted):
        if not (ASSETS / "icons" / f"{name}.png").exists():
            fail(f"icon PNG missing: {name}")
        if f'/icons/{name}.png")' not in ts:
            fail(f"icon missing from icons.generated.ts: {name}")

    order = [n for n in required if n in icons] + sorted(n for n in icons if n not in required)
    icons_lib.contact_sheet({n: icons[n] for n in order}, cols=24, scale=3).save(SCRATCH / "icons_sheet.png")
    pal.sheet(list(vignettes.values()), 4, 1, "steel1", pad=6).save(SCRATCH / "vignettes_sheet.png")
    extra = f", UI art used for item ids: {' '.join(shadowed)}" if shadowed else ""
    note(f"icons: {len(icons)} ({len(ui)} UI, {len(generated)} generated; {len(required)} contract names checked){extra}")
    note(f"vignettes: {len(vignettes)}")


def step_portraits() -> None:
    import portraits_parts

    layers = portraits_parts.build_layers()
    if list(layers.keys()) != portraits_lib.LAYERS and set(layers) != set(portraits_lib.LAYERS):
        fail(f"portrait layers {list(layers)} != {portraits_lib.LAYERS}")
        return
    out: dict[str, Image.Image] = {}
    for layer in portraits_lib.LAYERS:
        for n, img in enumerate(layers[layer]):
            if img.size != (32, 32):
                fail(f"portrait part {layer}_{n} is {img.size}")
            out[f"{layer}_{n}"] = pal.upscale(img, portraits_lib.SCALE)
    for layer, idx in (("hair", 0), ("acc", 0)):
        if layers[layer][idx].getbbox() is not None:
            fail(f"portrait {layer}_0 must be fully transparent")
    sync_dir(ASSETS / "portraits", out)

    none = portraits_lib.NONE_CHANCE
    lines = ["// Generated by scripts/assets/build_all.py. Do not edit by hand.",
             "// Crew portraits: draw one 32x32 part (exported at 96 px) per layer, in `portraitLayers` order.",
             "/* eslint-disable */", "export const portraits = {", "  layers: {"]
    for layer in portraits_lib.LAYERS:
        lines.append(f"    {layer}: [")
        for n in range(len(layers[layer])):
            lines.append(f'      require("../../assets/portraits/{layer}_{n}.png"),')
        lines.append("    ],")
    lines += ["  },", "} as const;", "",
              "export const portraitLayers = [" + ", ".join(f'"{k}"' for k in portraits_lib.LAYERS) + "] as const;",
              "export type PortraitLayer = (typeof portraitLayers)[number];", "",
              "const COUNTS: readonly number[] = [" + ", ".join(str(len(layers[k])) for k in portraits_lib.LAYERS) + "];",
              "// Chance that a layer shows nothing (index 0 is the empty part): bald, no accessory.",
              "const NONE: readonly number[] = [" + ", ".join(repr(float(none.get(k, 0.0))) for k in portraits_lib.LAYERS) + "];", "",
              "/** Deterministic part indices for a crew seed, one per layer in `portraitLayers` order. Pure. */",
              "export function portraitParts(seed: number): number[] {",
              "  let s = ((seed | 0) ^ 0x9e3779b9) >>> 0;",
              "  const out: number[] = [];",
              "  for (let i = 0; i < COUNTS.length; i++) {",
              "    // mulberry32 step",
              "    s = (s + 0x6d2b79f5) >>> 0;",
              "    let t = s;",
              "    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;",
              "    t = (t ^ ((t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0)) >>> 0;",
              "    const u = ((t ^ (t >>> 14)) >>> 0) / 4294967296;",
              "    const n = COUNTS[i];",
              "    const none = NONE[i];",
              "    const idx = none > 0 && n > 1 ? (u < none ? 0 : 1 + Math.floor(((u - none) / (1 - none)) * (n - 1))) : Math.floor(u * n);",
              "    out.push(Math.min(n - 1, idx));",
              "  }",
              "  return out;",
              "}", ""]
    write_text(ROOT / "src" / "ui" / "portraits.generated.ts", "\n".join(lines))

    portraits_lib.contact_sheet(layers, 48, 12, 3).save(SCRATCH / "portraits_sheet.png")
    portraits_lib.layer_sheet(layers, 2).save(SCRATCH / "portraits_layers.png")
    counts = {k: len(layers[k]) for k in portraits_lib.LAYERS}
    combos = 1
    for v in counts.values():
        combos *= v
    note(f"portraits: {sum(counts.values())} parts {counts} = {combos:,} combinations")


def step_app(frames: dict[str, Image.Image]) -> None:
    icon = pal.upscale(scenes.app_icon(frames), 8)
    splash = pal.upscale(scenes.splash_icon(frames), 8)
    fav = scenes.favicon(frames)
    pal.save(icon, ASSETS / "icon.png")
    pal.save(splash, ASSETS / "splash-icon.png")
    pal.save(fav, ASSETS / "favicon.png")
    check = Image.open(ASSETS / "icon.png")
    if check.size != (1024, 1024) or check.mode not in ("RGB", "P") or "transparency" in check.info:
        fail(f"app icon must be 1024x1024 without alpha, got {check.size} {check.mode}")
    Image.open(ASSETS / "icon.png").convert("RGB").resize((256, 256), Image.NEAREST).save(SCRATCH / "view_icon_256.png")
    note(f"app: icon {icon.size[0]} px (opaque), splash {splash.size[0]} px, favicon {fav.size[0]} px")


def step_checks() -> None:
    total = 0
    count = 0
    bad = 0
    for path in sorted(ASSETS.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(ASSETS).as_posix()
        if rel.startswith(("fonts/", "audio/")):
            continue
        total += path.stat().st_size
        if path.suffix.lower() == ".png":
            count += 1
            off = pal.off_palette(Image.open(path))
            if off:
                bad += 1
                fail(f"{rel}: {off} pixels are neither palette colors nor fully transparent")
    if total > SIZE_BUDGET:
        fail(f"assets (without fonts/audio) are {total / 1e6:.2f} MB, budget is {SIZE_BUDGET / 1e6:.0f} MB")
    for ts in ("src/ui/icons.generated.ts", "src/render/atlas.generated.ts", "src/ui/portraits.generated.ts"):
        if not (ROOT / ts).exists():
            fail(f"{ts} was not generated")
    note(f"palette check: {count} PNGs, {bad} with off-palette pixels")
    note(f"size: assets without fonts/audio = {total / 1e6:.2f} MB (budget {SIZE_BUDGET / 1e6:.0f} MB)")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--skip-blender", action="store_true", help="reuse the render cache in assets-src/renders")
    ap.add_argument("--fonts", action="store_true", help="force a font rebuild")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    t0 = time.time()
    frames: dict[str, Image.Image] = {}
    manifest: dict = {}

    def run(title: str, fn) -> None:
        print(f"[{title}]", flush=True)
        try:
            fn()
        except Exception as exc:  # keep going so one broken step does not hide the others
            import traceback

            traceback.print_exc()
            fail(f"{title}: {type(exc).__name__}: {exc}")

    def do_manifest() -> None:
        manifest.update(step_manifest())

    def hulls() -> list[str]:
        ids = list(manifest.get("hulls") or ["tug"])
        return ids + [h for h in EXTRA_HULLS if h not in ids]

    def do_sprites() -> None:
        frames.update(step_sprites(hulls()))

    run("fonts", lambda: step_fonts(args.fonts))
    run("manifest", do_manifest)
    run("blender", lambda: step_blender(args.skip_blender, hulls()))
    run("sprites", do_sprites)
    run("icons", lambda: step_icons(manifest, frames))
    run("portraits", step_portraits)
    run("app icon", lambda: step_app(frames))
    run("checks", step_checks)
    stale = HERE / "placeholders.py"
    if stale.exists():
        stale.unlink()

    print("\n==== asset build summary ====")
    for line in summary:
        print(f"  {line}")
    print(f"  time: {time.time() - t0:.1f} s")
    if errors:
        print(f"\nFAILED with {len(errors)} error(s):")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("\nOK")
    return 0


if __name__ == "__main__":
    sys.exit(main())

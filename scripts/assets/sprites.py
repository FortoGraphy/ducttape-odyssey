"""Sprite post-processing: 4x Blender renders -> palette pixel art frames -> packed atlases.

Per frame: box downsample (premultiplied), binary alpha, quantize to the Night Shift palette
(no dithering), 1 px darker outline on the lower right. Emissive frames (`_e`) share the rect of
their base frame so the renderer can draw them on top (and bloom them) without offsets.
Base frames show the lights switched off; base + `_e` is the lit sprite.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

import pal

ALPHA_CUT = 0.45
EMIT_CUT = 0.30


def collect(raw: Path, cache: Path) -> int:
    """Stacks the per-frame Blender renders into one strip per group and pass (the committed cache)."""
    manifest = json.loads((raw / "manifest.json").read_text())
    cache.mkdir(parents=True, exist_ok=True)
    for old in cache.glob("*.png"):
        old.unlink()
    count = 0
    for group, info in manifest["groups"].items():
        for suffix in ("", "_e"):
            tiles = [Image.open(raw / f"{name}{suffix}.png").convert("RGBA") for name in info["frames"]]
            strip = Image.new("RGBA", (sum(t.width for t in tiles), tiles[0].height), (0, 0, 0, 0))
            x = 0
            for t in tiles:
                strip.paste(t, (x, 0))
                x += t.width
            pal.save(strip, cache / f"{group}{suffix}.png")
            count += 1
    (cache / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8", newline="\n")
    return count


def _downsample(tile: Image.Image, ss: int, min_share: float = 0.16) -> tuple[np.ndarray, np.ndarray]:
    """Box-downsamples a supersampled render. Returns (rgb uint8 palette colors, alpha coverage 0..1).

    The box average of two unrelated colors can land on a third hue (yellow paint over blue steel
    reads as green), so the quantizer may only pick palette colors that are actually present in
    the source block, choosing the one nearest to the box average.
    """
    a = np.asarray(tile.convert("RGBA")).astype(np.float64)
    h, w = a.shape[0] // ss, a.shape[1] // ss
    a = a[: h * ss, : w * ss]
    idx = pal.nearest_index(a[..., :3].astype(np.uint8))
    blocks = a.reshape(h, ss, w, ss, 4)
    alpha = blocks[..., 3:4] / 255.0
    cov = alpha.mean(axis=(1, 3))[..., 0]
    weight = np.maximum(alpha.sum(axis=(1, 3)), 1e-6)
    rgb = (blocks[..., :3] * alpha).sum(axis=(1, 3)) / weight
    lab = pal._oklab(rgb)
    alpha2d = a[..., 3] / 255.0
    best = np.zeros((h, w), dtype=np.int64)
    best_d = np.full((h, w), np.inf)
    for k in np.unique(idx):
        share = np.where(idx == k, alpha2d, 0.0).reshape(h, ss, w, ss).sum(axis=(1, 3)) / weight[..., 0]
        d = ((lab - pal._TABLE_LAB[k]) ** 2).sum(-1)
        d[share < min_share] = np.inf
        better = d < best_d
        best[better] = k
        best_d[better] = d[better]
    return pal.TABLE[best], cov


def _outline(rgba: np.ndarray) -> np.ndarray:
    """Adds a 1 px outline on transparent pixels directly right of, below, or diagonal to the sprite."""
    h, w = rgba.shape[:2]
    out = rgba.copy()
    opaque = rgba[..., 3] > 0
    key_of = {pal.RGB[k]: k for k in pal.KEYS}
    # Neighbour priority: left, up, then up-left, so the outline takes the color family it hugs.
    for dy, dx in ((0, 1), (1, 0), (1, 1)):
        src = np.zeros_like(opaque)
        src[dy:, dx:] = opaque[: h - dy, : w - dx]
        todo = src & ~opaque & (out[..., 3] == 0)
        ys, xs = np.nonzero(todo)
        for y, x in zip(ys, xs):
            r, g, b = (int(v) for v in rgba[y - dy, x - dx, :3])
            out[y, x] = pal.c(pal.DARKER[key_of[(r, g, b)]])
    return out


def process_frame(color: Image.Image, emissive: Image.Image, ss: int) -> tuple[Image.Image, Image.Image]:
    rgb, cov = _downsample(color, ss)
    e_rgb, e_cov = _downsample(emissive, ss)
    h, w = cov.shape
    base = np.zeros((h + 1, w + 1, 4), dtype=np.uint8)
    mask = cov >= ALPHA_CUT
    base[:h, :w, :3] = rgb
    base[:h, :w, 3] = np.where(mask, 255, 0)
    base[base[..., 3] == 0] = 0
    base = _outline(base)
    emit = np.zeros_like(base)
    e_mask = (e_cov >= EMIT_CUT) & mask
    emit[:h, :w, :3] = e_rgb
    emit[:h, :w, 3] = np.where(e_mask, 255, 0)
    emit[emit[..., 3] == 0] = 0
    return Image.fromarray(base, "RGBA"), Image.fromarray(emit, "RGBA")


def process_all(cache: Path) -> tuple[dict[str, Image.Image], dict[str, dict], dict[str, dict]]:
    """Reads the render cache. Returns (frames by name, group info, anchors by group)."""
    manifest = json.loads((cache / "manifest.json").read_text())
    ss = manifest["ss"]
    frames: dict[str, Image.Image] = {}
    groups: dict[str, dict] = {}
    anchors: dict[str, dict] = {}
    for group, info in manifest["groups"].items():
        w, h = info["size"]
        strip = Image.open(cache / f"{group}.png")
        strip_e = Image.open(cache / f"{group}_e.png")
        done = []
        for i, name in enumerate(info["frames"]):
            box = (i * w * ss, 0, (i + 1) * w * ss, h * ss)
            done.append((name, *process_frame(strip.crop(box), strip_e.crop(box), ss)))
        # One shared crop per group keeps the pivot stable across animation / rotation frames.
        boxes = [b.getbbox() for _, b, _ in done]
        boxes = [b for b in boxes if b]
        if not boxes:
            raise RuntimeError(f"{group}: empty render")
        x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
        x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
        for name, b, e in done:
            frames[name] = b.crop((x0, y0, x1, y1))
            frames[name + "_e"] = e.crop((x0, y0, x1, y1))
        cx, cz = info.get("center", (0.0, 0.0))
        groups[group] = {"frames": info["frames"], "w": x1 - x0, "h": y1 - y0}
        if info.get("anchors"):
            pts = {}
            for key, (ax, az) in info["anchors"].items():
                pts[key] = [round(ax - cx + w / 2 - x0, 1), round(cz + h / 2 - az - y0, 1)]
            anchors[group] = pts
    return frames, groups, anchors


# ---------- packing -------------------------------------------------------------------------

def _try_pack(sizes: list[tuple[str, int, int]], side: int, pad: int = 1) -> dict[str, tuple[int, int]] | None:
    """Shelf packer. sizes must be sorted by height descending."""
    pos: dict[str, tuple[int, int]] = {}
    x = y = pad
    shelf = 0
    for name, w, h in sizes:
        if w + 2 * pad > side or h + 2 * pad > side:
            return None
        if x + w + pad > side:
            x = pad
            y += shelf + pad
            shelf = 0
        if y + h + pad > side:
            return None
        pos[name] = (x, y)
        x += w + pad
        shelf = max(shelf, h)
    return pos


def pack(frames: dict[str, Image.Image], max_side: int = 2048) -> tuple[list[Image.Image], dict[str, dict]]:
    order = sorted(frames.items(), key=lambda kv: (-kv[1].height, -kv[1].width, kv[0]))
    remaining = [(n, im.width, im.height) for n, im in order]
    atlases: list[Image.Image] = []
    table: dict[str, dict] = {}
    while remaining:
        placed = None
        for side in (64, 128, 256, 512, 1024, 2048):
            if side > max_side:
                break
            placed = _try_pack(remaining, side)
            if placed is not None:
                break
        if placed is None:
            # Fill one max-size atlas greedily and carry the rest over to the next one.
            side = max_side
            placed = {}
            subset: list[tuple[str, int, int]] = []
            for item in remaining:
                trial = _try_pack(subset + [item], side)
                if trial is not None:
                    subset.append(item)
                    placed = trial
            if not placed:
                raise RuntimeError("a frame is larger than the maximum atlas size")
        sheet = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        key = f"atlas-{len(atlases)}"
        for name, (x, y) in placed.items():
            im = frames[name]
            sheet.paste(im, (x, y))
            table[name] = {"atlas": key, "x": x, "y": y, "w": im.width, "h": im.height}
        atlases.append(sheet)
        remaining = [r for r in remaining if r[0] not in placed]
    return atlases, table


def write_ts(path: Path, atlas_count: int, table: dict[str, dict], anchors: dict[str, dict], groups: dict[str, dict]) -> None:
    lines = [
        "// Generated by scripts/assets/build_all.py. Do not edit by hand.",
        "// Base frames show the lights switched off; draw the matching `_e` frame on top (same size,",
        "// same origin) for windows, engines and LEDs, and feed only `_e` frames into the bloom pass.",
        "/* eslint-disable */",
        "export const atlas = {",
        "  atlases: {",
    ]
    for i in range(atlas_count):
        lines.append(f'    "atlas-{i}": require("../../assets/sprites/atlas-{i}.png"),')
    lines += ["  },", "  frames: {"]
    for name in sorted(table):
        f = table[name]
        lines.append(f'    {name}: {{ atlas: "{f["atlas"]}", x: {f["x"]}, y: {f["y"]}, w: {f["w"]}, h: {f["h"]} }},')
    lines += ["  },", "} as const;", "", "export type AtlasName = keyof typeof atlas.atlases;", "export type FrameName = keyof typeof atlas.frames;", ""]
    lines.append("/** Frame names per sprite group, in animation / rotation order. */")
    lines.append("export const spriteGroups = {")
    for g in sorted(groups):
        names = ", ".join(f'"{n}"' for n in groups[g]["frames"])
        lines.append(f"  {g}: [{names}],")
    lines += ["} as const;", "", "export type SpriteGroup = keyof typeof spriteGroups;", ""]
    lines.append("/** Attachment points in frame pixels (origin top left) for the resting frame of a group. */")
    lines.append("export const anchors = {")
    for g in sorted(anchors):
        pts = ", ".join(f"{k}: {{ x: {v[0]}, y: {v[1]} }}" for k, v in sorted(anchors[g].items()))
        lines.append(f"  {g}: {{ {pts} }},")
    lines += ["} as const;", ""]
    path.write_text("\n".join(lines), encoding="utf-8", newline="\n")

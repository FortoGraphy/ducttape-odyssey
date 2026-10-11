"""Night Shift palette helpers shared by every asset script: lookup, quantization, checks, PNG io."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets"
SCRATCH = ROOT / ".scratch" / "assets"

_data = json.loads((ASSETS / "palette.json").read_text(encoding="utf-8"))
HEX: dict[str, str] = dict(_data["colors"])
KEYS: list[str] = list(HEX.keys())
RGB: dict[str, tuple[int, int, int]] = {k: tuple(int(v[i : i + 2], 16) for i in (1, 3, 5)) for k, v in HEX.items()}
TABLE = np.array([RGB[k] for k in KEYS], dtype=np.uint8)
_PACKED = set(int(r) << 16 | int(g) << 8 | int(b) for r, g, b in TABLE)

# One step darker within the same hue family; used for the lower-right sprite outline.
DARKER = {
    "void0": "void0", "void1": "void0", "void2": "void0", "void3": "void1",
    "steel0": "void1", "steel1": "void2", "steel2": "void3", "steel3": "steel0",
    "bone0": "steel0", "bone1": "steel1", "bone2": "steel1",
    "violet0": "void1", "violet1": "void2", "violet2": "violet0", "violet3": "violet0",
    "teal0": "void1", "teal1": "void2", "teal2": "teal0", "mint": "teal0",
    "cobalt0": "void1", "cobalt1": "void2", "cobalt2": "cobalt0",
    "rust0": "void0", "rust1": "void1", "orange": "rust0", "amber": "rust0", "yellow": "rust0",
    "red0": "void1", "red1": "rust0", "green0": "void1", "green1": "void2", "lime": "green0",
}


def c(key: str, a: int = 255) -> tuple[int, int, int, int]:
    r, g, b = RGB[key]
    return (r, g, b, a)


def _oklab(rgb: np.ndarray) -> np.ndarray:
    x = rgb.astype(np.float64) / 255.0
    lin = np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)
    l = 0.4122214708 * lin[..., 0] + 0.5363325363 * lin[..., 1] + 0.0514459929 * lin[..., 2]
    m = 0.2119034982 * lin[..., 0] + 0.6806995451 * lin[..., 1] + 0.1073969566 * lin[..., 2]
    s = 0.0883024619 * lin[..., 0] + 0.2817188376 * lin[..., 1] + 0.6299787005 * lin[..., 2]
    l, m, s = np.cbrt(l), np.cbrt(m), np.cbrt(s)
    return np.stack([
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ], axis=-1)


_TABLE_LAB = _oklab(TABLE)


def nearest_index(rgb: np.ndarray, allowed: list[str] | None = None) -> np.ndarray:
    """Index into KEYS of the perceptually nearest palette color for every pixel of an (..., 3) uint8 array."""
    flat = rgb.reshape(-1, 3).astype(np.int64)
    packed = flat[:, 0] << 16 | flat[:, 1] << 8 | flat[:, 2]
    # Renders are mostly flat palette colors, so only the distinct colors need a distance search.
    uniq, inverse = np.unique(packed, return_inverse=True)
    colors = np.stack([uniq >> 16 & 255, uniq >> 8 & 255, uniq & 255], axis=-1).astype(np.uint8)
    table = _TABLE_LAB
    idx_map = None
    if allowed is not None:
        idx_map = np.array([KEYS.index(k) for k in allowed])
        table = table[idx_map]
    lab = _oklab(colors)
    best = np.empty(len(colors), dtype=np.int64)
    step = 65536
    for i in range(0, len(colors), step):
        d = ((lab[i : i + step, None, :] - table[None, :, :]) ** 2).sum(-1)
        best[i : i + step] = d.argmin(1)
    if idx_map is not None:
        best = idx_map[best]
    return best[inverse].reshape(rgb.shape[:-1])


def quantize_rgb(rgb: np.ndarray, allowed: list[str] | None = None) -> np.ndarray:
    return TABLE[nearest_index(rgb, allowed)]


def bayer(n: int = 4) -> np.ndarray:
    m = np.array([[0, 2], [3, 1]], dtype=np.float64)
    while m.shape[0] < n:
        m = np.block([[4 * m, 4 * m + 2], [4 * m + 3, 4 * m + 1]])
    return (m + 0.5) / (m.size)


def ramp_dither(value: np.ndarray, ramp: list[str], strength: float = 1.0) -> np.ndarray:
    """Map a 0..1 field onto a palette ramp with ordered 4x4 Bayer dithering. Returns (h, w, 3) uint8."""
    h, w = value.shape
    b = np.tile(bayer(4), (h // 4 + 1, w // 4 + 1))[:h, :w]
    v = np.clip(value, 0, 1) * (len(ramp) - 1)
    lo = np.floor(v)
    frac = v - lo
    idx = (lo + (frac > 0.5 + (b - 0.5) * strength)).astype(int).clip(0, len(ramp) - 1)
    table = np.array([RGB[k] for k in ramp], dtype=np.uint8)
    return table[idx]


def off_palette(img: Image.Image) -> int:
    """Number of pixels that are neither fully transparent nor an opaque palette color."""
    a = np.asarray(img.convert("RGBA")).astype(np.int64)
    alpha = a[..., 3]
    packed = a[..., 0] << 16 | a[..., 1] << 8 | a[..., 2]
    ok_color = np.isin(packed, np.fromiter(_PACKED, dtype=np.int64))
    bad = ~((alpha == 0) | ((alpha == 255) & ok_color))
    return int(bad.sum())


def upscale(img: Image.Image, k: int) -> Image.Image:
    return img.resize((img.width * k, img.height * k), Image.NEAREST)


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if img.mode == "RGBA":
        # Zero the color of transparent pixels so files are deterministic and compress well.
        a = np.array(img)
        a[a[..., 3] == 0] = 0
        img = Image.fromarray(a, "RGBA")
    img.save(path, optimize=True)


def sheet(images: list[Image.Image], cols: int, scale: int = 1, bg: str = "void1", pad: int = 2, cell: tuple[int, int] | None = None) -> Image.Image:
    """Contact sheet for eyeballing: every image centered in a cell, nearest upscale."""
    cw = cell[0] if cell else max(i.width for i in images)
    ch = cell[1] if cell else max(i.height for i in images)
    rows = (len(images) + cols - 1) // cols
    out = Image.new("RGBA", (cols * (cw + pad) + pad, rows * (ch + pad) + pad), c(bg))
    for n, im in enumerate(images):
        x = pad + (n % cols) * (cw + pad) + (cw - im.width) // 2
        y = pad + (n // cols) * (ch + pad) + (ch - im.height) // 2
        out.alpha_composite(im.convert("RGBA"), (x, y))
    return upscale(out, scale) if scale > 1 else out

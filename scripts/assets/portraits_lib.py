"""Crew portrait plumbing: deterministic part picking (mirrored in TypeScript), compositing, sheets.

Layers are drawn in LAYERS order. hair[0] is "bald" and acc[0] is "no accessory" (both fully
transparent), picked with the probabilities in NONE_CHANCE.
"""
from __future__ import annotations

from PIL import Image

import pal

SIZE = 32
SCALE = 3
LAYERS = ["bg", "suit", "head", "hair", "eyes", "mouth", "acc"]
NONE_CHANCE = {"hair": 0.08, "acc": 0.4}
_M = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    return (a * b) & _M


def pick(seed: int, counts: dict[str, int]) -> list[int]:
    """One index per layer. Must stay bit-identical to portraitParts() in portraits.generated.ts."""
    s = (int(seed) ^ 0x9E3779B9) & _M
    out: list[int] = []
    for layer in LAYERS:
        # mulberry32 step
        s = (s + 0x6D2B79F5) & _M
        t = s
        t = _imul(t ^ (t >> 15), t | 1)
        t ^= (t + _imul(t ^ (t >> 7), t | 61)) & _M
        u = ((t ^ (t >> 14)) & _M) / 4294967296
        n = counts[layer]
        none = NONE_CHANCE.get(layer, 0.0)
        if none > 0 and n > 1:
            idx = 0 if u < none else 1 + int((u - none) / (1 - none) * (n - 1))
        else:
            idx = int(u * n)
        out.append(min(n - 1, idx))
    return out


def compose(layers: dict[str, list[Image.Image]], parts: list[int]) -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    for layer, idx in zip(LAYERS, parts):
        img.alpha_composite(layers[layer][idx])
    return img


def contact_sheet(layers: dict[str, list[Image.Image]], count: int = 48, cols: int = 12, scale: int = 3, seed0: int = 1) -> Image.Image:
    counts = {k: len(v) for k, v in layers.items()}
    faces = [compose(layers, pick(seed0 + n * 7919, counts)) for n in range(count)]
    return pal.sheet(faces, cols, scale, "void0", pad=2)


def layer_sheet(layers: dict[str, list[Image.Image]], scale: int = 2) -> Image.Image:
    """Every part of every layer on a neutral backdrop, one row per layer."""
    cols = max(len(v) for v in layers.values())
    out = Image.new("RGBA", (cols * (SIZE + 2) + 2, len(LAYERS) * (SIZE + 2) + 2), pal.c("steel1"))
    for r, layer in enumerate(LAYERS):
        for n, im in enumerate(layers[layer]):
            out.alpha_composite(im, (2 + n * (SIZE + 2), 2 + r * (SIZE + 2)))
    return pal.upscale(out, scale)

"""16x16 pixel icon engine: character grids -> palette pixels -> auto outline -> 96 px PNG.

An icon is 16 strings of 16 characters. Draw inside the 14x14 interior (rows and columns 1..14):
the engine adds a 1 px dark outline around the art so the same icon reads on the light panel and
on dark wells. Light comes from the upper left: highlight on top/left edges, shade on bottom/right.
"""
from __future__ import annotations

from PIL import Image

import pal

SIZE = 16
SCALE = 6
OUTLINE = "void3"

# Neutral family first (every icon is built mostly from these), then accents.
LEGEND = {
    ".": None,
    "#": "bone1",   # main light body
    "+": "bone2",   # highlight
    "-": "steel3",  # shade of the light body
    "=": "steel2",  # mid grey part
    "%": "steel1",  # dark grey part
    "k": "void3",   # interior line / hole (same as the outline)
    "K": "void1",   # deep black (screens, voids)
    "o": "orange", "a": "amber", "y": "yellow", "u": "rust1", "U": "rust0",
    "r": "red1", "R": "red0",
    "b": "cobalt1", "B": "cobalt2", "c": "cobalt0",
    "m": "mint", "t": "teal2", "T": "teal1",
    "g": "green1", "G": "green0", "l": "lime",
    "v": "violet2", "V": "violet3", "w": "violet1",
}


def parse(grid: list[str] | str, legend: dict[str, str | None] | None = None, outline: str | None = OUTLINE) -> Image.Image:
    """Grid -> 16x16 RGBA. Extra legend entries override or extend LEGEND (used by item ramps)."""
    rows = grid.strip("\n").split("\n") if isinstance(grid, str) else list(grid)
    rows = [r.strip() for r in rows]
    if len(rows) != SIZE or any(len(r) != SIZE for r in rows):
        raise ValueError(f"icon grid must be {SIZE}x{SIZE}, got {len(rows)} rows: {[len(r) for r in rows]}")
    table = dict(LEGEND)
    if legend:
        table.update(legend)
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch not in table:
                raise ValueError(f"unknown icon character {ch!r} at {x},{y}")
            key = table[ch]
            if key:
                px[x, y] = pal.c(key)
    return add_outline(img, outline) if outline else img


def add_outline(img: Image.Image, key: str = OUTLINE) -> Image.Image:
    """Fills every transparent pixel that touches the art on a side (4-neighbourhood)."""
    src = img.load()
    out = img.copy()
    dst = out.load()
    w, h = img.size
    color = pal.c(key)
    for y in range(h):
        for x in range(w):
            if src[x, y][3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and src[nx, ny][3]:
                    dst[x, y] = color
                    break
    return out


def export(img: Image.Image) -> Image.Image:
    return pal.upscale(img, SCALE)


def contact_sheet(icons: dict[str, Image.Image], cols: int = 24, scale: int = 3) -> Image.Image:
    """Three bands for judging legibility: dark well, light panel, and true 16 px size on both."""
    names = list(icons)
    rows = (len(names) + cols - 1) // cols
    cell = SIZE + 2
    band_w, band_h = cols * cell + 2, rows * cell + 2
    big = Image.new("RGBA", (band_w * scale, band_h * scale * 2 + band_h * 2), pal.c("void0"))
    for band, bg in enumerate(("void2", "bone1")):
        sheet = Image.new("RGBA", (band_w, band_h), pal.c(bg))
        for n, name in enumerate(names):
            sheet.alpha_composite(icons[name], (2 + (n % cols) * cell, 2 + (n // cols) * cell))
        big.paste(pal.upscale(sheet, scale), (0, band * band_h * scale))
        big.paste(sheet, (0, band_h * scale * 2 + band * band_h))
    return big

"""2D compositions built from the rendered sprites: app icon, splash, favicon, event vignettes.

Everything is composed at low resolution in palette colors and upscaled with nearest neighbour,
so the store icon is made of the same pixels as the game.
"""
from __future__ import annotations

import math

import numpy as np
from PIL import Image

import pal


# ---------- procedural backdrops --------------------------------------------------------------

def _value_noise(h: int, w: int, cell: int, rng: np.random.Generator) -> np.ndarray:
    gh, gw = h // cell + 2, w // cell + 2
    grid = rng.random((gh, gw))
    ys, xs = np.arange(h) / cell, np.arange(w) / cell
    y0, x0 = ys.astype(int), xs.astype(int)
    fy, fx = ys - y0, xs - x0
    fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
    a = grid[np.ix_(y0, x0)]
    b = grid[np.ix_(y0, x0 + 1)]
    c = grid[np.ix_(y0 + 1, x0)]
    d = grid[np.ix_(y0 + 1, x0 + 1)]
    top = a + (b - a) * fx[None, :]
    bot = c + (d - c) * fx[None, :]
    return top + (bot - top) * fy[:, None]


def fbm(h: int, w: int, seed: int, cell: int = 32, octaves: int = 4) -> np.ndarray:
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w))
    amp, total = 1.0, 0.0
    for _ in range(octaves):
        out += amp * _value_noise(h, w, max(2, cell), rng)
        total += amp
        amp *= 0.5
        cell //= 2
    out /= total
    lo, hi = out.min(), out.max()
    return (out - lo) / (hi - lo + 1e-9)


def nebula(w: int, h: int, seed: int, warm: tuple[str, ...] = ("violet0", "violet1", "violet2"),
           cool: tuple[str, ...] = ("teal0", "teal1"), density: float = 1.0, stars: int | None = None) -> Image.Image:
    f1 = fbm(h, w, seed, cell=max(8, w // 3))
    f2 = fbm(h, w, seed + 101, cell=max(8, w // 4))
    base = pal.ramp_dither(np.clip((f1 - 0.25) * 1.5 * density, 0, 1), ["void0", "void1", "void2", *warm])
    cool_field = np.clip((f2 - 0.55) * 2.6 * density, 0, 1)
    cool_rgb = pal.ramp_dither(cool_field, ["void1", "void2", *cool])
    mask = (cool_field > 0.18) & (f1 < 0.6)
    rgb = np.where(mask[..., None], cool_rgb, base)
    rng = np.random.default_rng(seed + 7)
    count = stars if stars is not None else (w * h) // 140
    for n in range(count):
        x, y = int(rng.integers(0, w)), int(rng.integers(0, h))
        key = ("steel2", "steel3", "bone1", "cobalt2", "bone2", "amber")[int(rng.integers(0, 6))]
        rgb[y, x] = pal.RGB[key]
        if n % 17 == 0 and 1 <= x < w - 1 and 1 <= y < h - 1:
            rgb[y, x] = pal.RGB["bone2"]
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                rgb[y + dy, x + dx] = pal.RGB["steel3"]
    out = np.dstack([rgb, np.full((h, w), 255, dtype=np.uint8)]).astype(np.uint8)
    return Image.fromarray(out, "RGBA").copy()


def disc(canvas: Image.Image, cx: float, cy: float, r: float, ramp: list[str], light=(-0.55, -0.7), rim: float = 0.0) -> None:
    """Shaded sphere with a Bayer-dithered terminator (planets, stars)."""
    w, h = canvas.size
    ys, xs = np.mgrid[0:h, 0:w]
    dx, dy = (xs + 0.5 - cx) / r, (ys + 0.5 - cy) / r
    d2 = dx * dx + dy * dy
    inside = d2 <= 1.0
    dz = np.sqrt(np.clip(1 - d2, 0, 1))
    lz = math.sqrt(max(0.0, 1 - light[0] ** 2 - light[1] ** 2))
    lam = np.clip(dx * light[0] + dy * light[1] + dz * lz, 0, 1)
    if rim:
        lam = np.clip(lam + rim * (1 - dz) ** 3, 0, 1)
    rgb = pal.ramp_dither(lam, ramp)
    a = np.array(canvas)
    a[inside, :3] = rgb[inside]
    a[inside, 3] = 255
    canvas.paste(Image.fromarray(a, "RGBA"))


def glow(canvas: Image.Image, cx: float, cy: float, r: float, ramp: list[str], squash: float = 1.0, power: float = 1.6) -> None:
    """Dithered radial glow; ramp runs from the faint edge to the hot core. Pixels below the first step stay untouched."""
    w, h = canvas.size
    ys, xs = np.mgrid[0:h, 0:w]
    d = np.sqrt(((xs + 0.5 - cx) / r) ** 2 + ((ys + 0.5 - cy) / (r * squash)) ** 2)
    v = np.clip(1 - d, 0, 1) ** power
    steps = len(ramp)
    b = np.tile(pal.bayer(4), (h // 4 + 1, w // 4 + 1))[:h, :w]
    level = np.floor(v * steps + b).astype(int)
    a = np.array(canvas)
    table = np.array([pal.RGB[k] for k in ramp], dtype=np.uint8)
    on = level >= 1
    a[on, :3] = table[np.clip(level[on] - 1, 0, steps - 1)]
    a[on, 3] = 255
    canvas.paste(Image.fromarray(a, "RGBA"))


def tape(canvas: Image.Image, a: tuple[float, float], b: tuple[float, float], width: float, shadow: bool = True) -> None:
    """A strip of duct tape from a to b: woven highlight lines, torn zigzag ends, a 1 px shadow."""
    w, h = canvas.size
    px = canvas.load()
    ax, ay = a
    bx, by = b
    length = math.hypot(bx - ax, by - ay)
    ux, uy = (bx - ax) / length, (by - ay) / length
    vx, vy = -uy, ux
    half = width / 2

    def inside(x: float, y: float) -> tuple[float, float] | None:
        u = (x - ax) * ux + (y - ay) * uy
        v = (x - ax) * vx + (y - ay) * vy
        tear = 1.5 if int(math.floor(v)) % 3 == 0 else 0.0
        if abs(v) <= half and tear <= u <= length - tear:
            return u, v
        return None

    if shadow:
        for y in range(h):
            for x in range(w):
                if inside(x + 0.5 - 1.2, y + 0.5 - 1.6) and not inside(x + 0.5, y + 0.5):
                    px[x, y] = pal.c("void0")
    for y in range(h):
        for x in range(w):
            hit = inside(x + 0.5, y + 0.5)
            if not hit:
                continue
            u, v = hit
            crease = (u + v * 0.8) % 17.0
            if v < -half + 1.2:
                key = "bone1"
            elif v > half - 1.4:
                key = "steel2"
            elif crease < 1.0:
                key = "bone0"
            elif 1.0 <= crease < 2.0:
                key = "steel2"
            else:
                key = "steel3"
            px[x, y] = pal.c(key)


def lit(frames: dict[str, Image.Image], name: str) -> Image.Image:
    im = frames[name].copy()
    im.alpha_composite(frames[name + "_e"])
    return im


def trimmed(im: Image.Image) -> Image.Image:
    box = im.getbbox()
    return im.crop(box) if box else im


def put(canvas: Image.Image, sprite: Image.Image, cx: float, cy: float) -> None:
    """Composites a sprite centered on (cx, cy), clipping at the canvas edges."""
    x, y = int(round(cx - sprite.width / 2)), int(round(cy - sprite.height / 2))
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    layer.paste(sprite, (x, y))
    canvas.alpha_composite(layer)


def streak(canvas: Image.Image, x0: float, y0: float, x1: float, y1: float, ramp: list[str]) -> None:
    """1 px line whose color walks the ramp from start to end."""
    px = canvas.load()
    n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    for i in range(n):
        t = i / max(1, n - 1)
        x, y = int(round(x0 + (x1 - x0) * t)), int(round(y0 + (y1 - y0) * t))
        if 0 <= x < canvas.width and 0 <= y < canvas.height:
            px[x, y] = pal.c(ramp[min(len(ramp) - 1, int(t * len(ramp)))])


# ---------- app icon, splash, favicon ---------------------------------------------------------

def app_icon(frames: dict[str, Image.Image]) -> Image.Image:
    """128x128 scene: the Gaffer against a nebula, a planet limb below, a strip of tape across a corner."""
    size = 128
    canvas = nebula(size, size, seed=57, density=1.15)
    disc(canvas, 104, 214, 108, ["void1", "void2", "void3", "teal0", "teal0", "teal1", "teal2"], light=(-0.62, -0.5))
    hero = trimmed(lit(frames, "hero_tug"))
    cx, cy = 69, 58
    # Exhaust plume behind the bell (the bell opens toward the left edge of the sprite).
    glow(canvas, cx - hero.width / 2 + 6, cy + 13, 34, ["rust0", "rust1", "orange", "amber", "yellow"], squash=0.62, power=1.15)
    put(canvas, hero, cx, cy)
    tape(canvas, (80, 121), (122, 97), 13)
    return canvas.convert("RGB")


def splash_icon(frames: dict[str, Image.Image]) -> Image.Image:
    """Transparent 128x128: the lit tug with a strip of tape, for the dark launch screen."""
    size = 128
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    hero = trimmed(lit(frames, "hero_tug"))
    glow(canvas, 66 - hero.width / 2 + 6, 73, 26, ["rust0", "rust1", "orange", "amber"], squash=0.62, power=1.25)
    put(canvas, hero, 66, 60)
    tape(canvas, (78, 116), (120, 100), 11, shadow=False)
    return canvas


def favicon(frames: dict[str, Image.Image]) -> Image.Image:
    """48x48: the resting tug sprite (cropped to its hull) on the void."""
    canvas = Image.new("RGBA", (48, 48), pal.c("void1"))
    put(canvas, trimmed(lit(frames, "ship_tug_00")), 24, 24)
    return canvas.convert("RGB")


# ---------- event vignettes (64x40) -----------------------------------------------------------

VW, VH = 64, 40


def _kipp_screen(canvas: Image.Image) -> None:
    px = canvas.load()
    for y in range(6, 34):
        for x in range(12, 52):
            edge = x in (12, 51) or y in (6, 33)
            px[x, y] = pal.c("steel1" if edge else "void0")
    for x in range(13, 51):
        px[x, 7] = pal.c("void2")
    for x0 in (22, 36):
        for x in range(x0, x0 + 6):
            px[x, 16] = pal.c("mint")
            px[x, 17] = pal.c("teal2")
        px[x0 + 3, 18] = pal.c("mint")
        px[x0 + 4, 18] = pal.c("mint")
    for x in range(26, 38):
        px[x, 26] = pal.c("mint")
    px[38, 25] = pal.c("mint")
    for x in range(14, 50, 2):
        for y in range(9, 32, 2):
            if px[x, y][:3] == pal.RGB["void0"]:
                px[x, y] = pal.c("void1")
    for x in range(26, 38):
        px[x, 34] = pal.c("steel0")
        px[x, 35] = pal.c("steel1")


def _jelly(canvas: Image.Image, cx: int, cy: int) -> None:
    px = canvas.load()
    for y in range(-9, 3):
        for x in range(-11, 12):
            d = (x / 11.0) ** 2 + (y / 9.0) ** 2
            if d <= 1.0 and y <= 1:
                key = "mint" if d < 0.25 and y < -3 else ("teal2" if d < 0.6 else "teal1")
                px[cx + x, cy + y] = pal.c(key)
    for k, x in enumerate(range(-9, 10, 3)):
        length = 9 + (k * 5) % 7
        for i in range(length):
            wob = int(round(math.sin((i + k) * 0.9) * 1.4))
            yy = cy + 2 + i
            if 0 <= yy < canvas.height:
                px[cx + x + wob, yy] = pal.c("teal2" if i < length * 0.5 else "teal1")
    for x, y in ((-4, -4), (4, -5), (0, -2)):
        px[cx + x, cy + y] = pal.c("bone2")


def vignette(kind: str, frames: dict[str, Image.Image]) -> Image.Image:
    seeds = {"meteor": 11, "pirates": 23, "merchant": 31, "derelict": 43, "anomaly": 59, "flare": 61, "fauna": 71,
             "distress": 83, "fault": 97, "stowaway": 103, "kipp": 113, "contact": 127, "story": 131}
    warm = {"pirates": ("rust0", "red0"), "flare": ("rust0", "rust1"), "fauna": ("teal0", "teal1"), "contact": ("cobalt0", "cobalt1"),
            "merchant": ("rust0", "rust1")}.get(kind, ("violet0", "violet1", "violet2"))
    c = nebula(VW, VH, seeds[kind], warm=warm, density=0.9)
    if kind == "meteor":
        for name, x, y in (("meteor_2", 40, 22), ("meteor_0", 16, 12), ("meteor_1", 54, 8), ("meteor_3", 26, 30)):
            for k in range(2):
                streak(c, x + 2, y - 2 + k, x + 15, y - 13 + k, ["amber", "orange", "orange", "rust1", "rust1", "rust0"])
            put(c, lit(frames, name), x, y)
    elif kind == "pirates":
        put(c, lit(frames, "pirate_2"), 34, 21)
    elif kind == "merchant":
        put(c, lit(frames, "station_1"), 44, 26)
        put(c, lit(frames, "drone_hauler_1"), 13, 14)
        put(c, lit(frames, "salvage_crate"), 14, 29)
    elif kind == "derelict":
        put(c, lit(frames, "derelict_0"), 32, 21)
    elif kind == "anomaly":
        for r, key in ((17, "violet1"), (13, "violet2"), (9, "violet3"), (5, "bone2")):
            for a in range(0, 360, 2):
                t = math.radians(a)
                rr = r + math.sin(t * 3 + r) * 1.6
                x, y = int(32 + math.cos(t) * rr * 1.25), int(20 + math.sin(t) * rr * 0.8)
                if 0 <= x < VW and 0 <= y < VH and (a // 10 + r) % 5:
                    c.putpixel((x, y), pal.c(key))
        glow(c, 32, 20, 6, ["violet2", "violet3", "bone2"])
    elif kind == "flare":
        disc(c, 8, 46, 34, ["rust1", "orange", "amber", "yellow", "bone2"], light=(0.3, -0.6))
        for a in range(200, 345, 3):
            t = math.radians(a)
            x, y = int(36 + math.cos(t) * 11), int(20 + math.sin(t) * 14)
            if 0 <= x < VW and 0 <= y < VH:
                c.putpixel((x, y), pal.c("amber" if a % 9 else "yellow"))
                if x + 1 < VW:
                    c.putpixel((x + 1, y), pal.c("orange"))
    elif kind == "fauna":
        _jelly(c, 36, 16)
    elif kind == "distress":
        for r in (9, 14, 19):
            for a in range(200, 340, 4):
                t = math.radians(a)
                x, y = int(32 + math.cos(t) * r), int(24 + math.sin(t) * r)
                if 0 <= x < VW and 0 <= y < VH:
                    c.putpixel((x, y), pal.c("red1" if r < 19 else "red0"))
        put(c, lit(frames, "salvage_pod"), 32, 25)
    elif kind == "fault":
        hero = lit(frames, "hero_tug")
        c.alpha_composite(hero.crop((34, 30, 34 + VW, 30 + VH)))
        glow(c, 46, 26, 7, ["orange", "amber", "yellow", "bone2"], power=1.0)
        for x, y, key in ((52, 20, "yellow"), (55, 17, "amber"), (40, 19, "yellow"), (38, 15, "amber"), (50, 33, "amber"), (56, 30, "orange"), (43, 35, "yellow"), (36, 30, "orange"), (47, 14, "bone2")):
            c.putpixel((x, y), pal.c(key))
    elif kind == "stowaway":
        crate = pal.upscale(lit(frames, "salvage_crate"), 2)
        put(c, crate, 32, 21)
        for y in range(18, 22):
            for x in range(26, 39):
                c.putpixel((x, y), pal.c("void0"))
        for x in (28, 34):
            for dx in (0, 1, 2):
                c.putpixel((x + dx, 19), pal.c("bone2"))
                c.putpixel((x + dx, 20), pal.c("bone2"))
            c.putpixel((x + 1, 20), pal.c("void0"))
    elif kind == "kipp":
        _kipp_screen(c)
    elif kind == "contact":
        put(c, lit(frames, "ship_relic_00"), 34, 20)
    elif kind == "story":
        glow(c, 60, 8, 20, ["violet1", "violet2", "violet3", "bone2"], power=1.2)
        put(c, trimmed(lit(frames, "ship_tug_00")), 26, 22)
    return c.convert("RGB")


VIGNETTES = ["meteor", "pirates", "merchant", "derelict", "anomaly", "flare", "fauna", "distress", "fault", "stowaway", "kipp", "contact", "story"]

"""Layered 32x32 crew portrait parts (bg, suit, head, hair, eyes, mouth, acc) in the Night Shift palette.

Every part is drawn against one anatomical template so any combination lines up:

    head box   x 8..23 (outline), y 5..22/23, ears at x 6..7 and 24..25 (rows 12..16)
    brows      y 10 (9 when raised, 11 when lowered)
    eyes       lid y 12, eye y 13, bags y 14; left x 11..13, right x 18..20
    nose       x 15..16, y 14..17
    mouth      y 19 (18..20 used by open / toothy mouths), x 13..18
    neck       y 23..25, x 12..19 (thick necks x 11..20); suits own everything from y 26 down

All skulls are identical from y 5 to y 15 (only the jaw differs), which is what lets every
hair style and every forehead / eye accessory fit every head.

Parts are authored as small character grids stamped at an offset; a "ramp" is the legend that
turns grid characters into palette keys, so one drawing is recolored into many variants.
"""
from __future__ import annotations

import numpy as np
from PIL import Image

import pal

S = 32

Ramp = dict[str, str]


# ----------------------------------------------------------------------------------------------
# drawing helpers
# ----------------------------------------------------------------------------------------------

def _new(fill: str | None = None) -> Image.Image:
    return Image.new("RGBA", (S, S), pal.c(fill) if fill else (0, 0, 0, 0))


def _px(img: Image.Image, x: int, y: int, key: str) -> None:
    if 0 <= x < S and 0 <= y < S:
        img.putpixel((x, y), pal.c(key))


def _h(img: Image.Image, x0: int, x1: int, y: int, key: str) -> None:
    for x in range(x0, x1 + 1):
        _px(img, x, y, key)


def _v(img: Image.Image, x: int, y0: int, y1: int, key: str) -> None:
    for y in range(y0, y1 + 1):
        _px(img, x, y, key)


def _rect(img: Image.Image, x0: int, y0: int, x1: int, y1: int, key: str) -> None:
    for y in range(y0, y1 + 1):
        _h(img, x0, x1, y, key)


def _rows(grid: str) -> list[str]:
    rows = [r.strip() for r in grid.strip("\n").split("\n")]
    rows = [r for r in rows if r]
    if len({len(r) for r in rows}) != 1:
        raise ValueError(f"ragged grid: {[len(r) for r in rows]}\n{grid}")
    return rows


def _stamp(img: Image.Image, grid: str, legend: Ramp, ox: int, oy: int) -> Image.Image:
    """Paint a character grid at (ox, oy). '.' is transparent; every other char must be in legend."""
    for dy, row in enumerate(_rows(grid)):
        for dx, ch in enumerate(row):
            if ch != ".":
                _px(img, ox + dx, oy + dy, legend[ch])
    return img


def _part(grid: str, legend: Ramp, ox: int, oy: int) -> Image.Image:
    return _stamp(_new(), grid, legend, ox, oy)


def _is(img: Image.Image, x: int, y: int, *keys: str) -> bool:
    p = img.getpixel((x, y))
    return p[3] == 255 and any(p[:3] == pal.RGB[k] for k in keys)


# ----------------------------------------------------------------------------------------------
# backgrounds: dark, low contrast, a single quiet accent each
# ----------------------------------------------------------------------------------------------

def _glow(cx: float, cy: float, radius: float, ramp: list[str], strength: float = 1.0) -> Image.Image:
    yy, xx = np.mgrid[0:S, 0:S]
    v = np.clip(1.0 - np.hypot(xx - cx, yy - cy) / radius, 0.0, 1.0)
    rgb = pal.ramp_dither(v, ramp, strength)
    return Image.fromarray(np.dstack([rgb, np.full((S, S), 255, np.uint8)]), "RGBA")


def _bg_bulkhead() -> Image.Image:
    img = _new("void2")
    _rect(img, 0, 0, 31, 8, "void3")
    _h(img, 0, 31, 9, "void1")
    for x in (6, 25):
        _v(img, x, 10, 31, "void1")
        _v(img, x + 1, 10, 31, "void3")
    for x, y in ((2, 2), (29, 2), (2, 6), (29, 6), (3, 12), (28, 12)):
        _px(img, x, y, "steel0")
    return img


def _bg_porthole() -> Image.Image:
    img = _new("void2")
    _v(img, 4, 0, 31, "void1")
    _v(img, 5, 0, 31, "void3")
    cx, cy = 25.0, 7.0
    for y in range(S):
        for x in range(S):
            d = np.hypot(x - cx, y - cy)
            if d < 5.2:
                _px(img, x, y, "void0")
            elif d < 6.4:
                _px(img, x, y, "steel0" if (x - cx) + (y - cy) < 0 else "void3")
            elif d < 7.3:
                _px(img, x, y, "void1")
    for x, y, k in ((23, 5, "bone1"), (27, 8, "steel2"), (25, 10, "cobalt2"), (28, 5, "steel1"), (22, 8, "steel1"), (26, 4, "steel2")):
        _px(img, x, y, k)
    return img


def _bg_pipes() -> Image.Image:
    img = _new("void2")
    for x0 in (1, 26):
        _v(img, x0, 0, 31, "void1")
        _v(img, x0 + 1, 0, 31, "steel0")
        _v(img, x0 + 2, 0, 31, "void3")
        _v(img, x0 + 3, 0, 31, "void3")
        _v(img, x0 + 4, 0, 31, "void1")
        for y in (5, 19):
            _h(img, x0, x0 + 4, y, "void1")
            _h(img, x0, x0 + 4, y + 1, "steel0")
            _px(img, x0 + 1, y + 1, "steel1")
            _h(img, x0, x0 + 4, y + 2, "void1")
    _h(img, 6, 25, 3, "void1")
    _h(img, 6, 25, 4, "void3")
    return img


def _bg_lcd() -> Image.Image:
    img = _glow(4.0, 7.0, 20.0, ["void1", "void2", "teal0"], 1.0)
    _rect(img, 0, 2, 8, 12, "void0")
    _rect(img, 0, 3, 7, 11, "teal0")
    for y in (4, 6, 8, 10):
        _h(img, 0, 7, y, "teal1")
    for x, y in ((1, 4), (2, 4), (4, 6), (1, 8), (2, 8), (3, 8), (5, 10)):
        _px(img, x, y, "teal2")
    return img


def _bg_hazard() -> Image.Image:
    img = _new("void2")
    for y in range(0, 5):
        for x in range(S):
            _px(img, x, y, "rust1" if ((x + y) // 3) % 2 == 0 else "void1")
    _h(img, 0, 31, 5, "void0")
    _h(img, 0, 31, 6, "void3")
    for x in (3, 28):
        _v(img, x, 8, 31, "void1")
    _px(img, 2, 9, "steel0")
    _px(img, 29, 9, "steel0")
    return img


def _bg_vent() -> Image.Image:
    img = _new("void2")
    _rect(img, 2, 1, 29, 22, "void1")
    for y in range(2, 22, 3):
        _h(img, 3, 28, y, "void3")
        _h(img, 3, 28, y + 1, "void0")
    for x, y in ((0, 0), (31, 0), (0, 24), (31, 24)):
        _px(img, x, y, "steel0")
    return img


def _bg_violet() -> Image.Image:
    return _glow(15.5, 12.0, 22.0, ["void1", "void2", "violet0", "violet1"], 1.0)


def _bg_cobalt() -> Image.Image:
    img = _glow(15.5, 2.0, 30.0, ["void1", "void2", "void3", "cobalt0"], 1.0)
    for x in (7, 24):
        _v(img, x, 0, 31, "void1")
    return img


def _bg_locker() -> Image.Image:
    img = _new("void3")
    _rect(img, 0, 0, 31, 1, "void1")
    for x in (0, 10, 21, 31):
        _v(img, x, 2, 31, "void1")
    for x in (1, 11, 22):
        _v(img, x, 2, 31, "steel0")
    for x0 in (3, 24):
        for y in (4, 6, 8):
            _h(img, x0, x0 + 4, y, "void1")
    _px(img, 13, 3, "red0")
    _px(img, 14, 3, "red1")
    return img


def _bg_wires() -> Image.Image:
    img = _new("void1")
    _rect(img, 0, 0, 31, 2, "void2")
    for x, k in ((2, "green0"), (5, "steel0"), (27, "rust0"), (30, "green0")):
        _v(img, x, 3, 31, k)
    for x in range(0, 12):
        _px(img, x, 3 + (x * x) // 14, "steel0")
        _px(img, 31 - x, 3 + (x * x) // 10, "rust0")
    for x, y, k in ((2, 8, "green1"), (30, 14, "green1"), (5, 17, "steel1"), (27, 10, "rust1")):
        _px(img, x, y, k)
    return img


def _bg_viewport() -> Image.Image:
    img = _new("void0")
    stars = ((2, 3, "steel2"), (6, 9, "steel1"), (4, 16, "bone0"), (9, 2, "steel1"), (27, 4, "bone1"), (29, 12, "steel1"),
             (24, 8, "cobalt2"), (26, 17, "steel2"), (1, 21, "steel1"), (30, 22, "steel1"), (22, 2, "steel1"), (12, 6, "violet2"))
    for x, y, k in stars:
        _px(img, x, y, k)
    _rect(img, 0, 0, 31, 0, "void3")
    _v(img, 15, 0, 31, "void3")
    _v(img, 16, 0, 31, "void2")
    _rect(img, 0, 24, 31, 31, "void2")
    _h(img, 0, 31, 24, "steel0")
    return img


def _bg_rust() -> Image.Image:
    img = _glow(26.0, 28.0, 26.0, ["void1", "void2", "rust0"], 1.0)
    _h(img, 0, 31, 7, "void1")
    _h(img, 0, 31, 8, "void3")
    return img


def _build_bg() -> list[Image.Image]:
    return [_bg_bulkhead(), _bg_porthole(), _bg_pipes(), _bg_lcd(), _bg_hazard(), _bg_vent(),
            _bg_violet(), _bg_cobalt(), _bg_locker(), _bg_wires(), _bg_viewport(), _bg_rust()]


# ----------------------------------------------------------------------------------------------
# suits: shoulders from y 24, collar details stamped on top (the neck is drawn later by the head)
# ----------------------------------------------------------------------------------------------

_BROAD = {24: (10, 21), 25: (7, 24), 26: (5, 26), 27: (3, 28), 28: (2, 29), 29: (1, 30), 30: (1, 30), 31: (1, 30)}
_SLIM = {24: (11, 20), 25: (9, 22), 26: (7, 24), 27: (5, 26), 28: (4, 27), 29: (3, 28), 30: (3, 28), 31: (3, 28)}


def _torso(o: str, b: str, s: str, h: str, shape: dict[int, tuple[int, int]] = _BROAD) -> Image.Image:
    img = _new()
    prev: tuple[int, int] | None = None
    for y in range(24, 32):
        x0, x1 = shape[y]
        for x in range(x0, x1 + 1):
            top = prev is None or x < prev[0] or x > prev[1]
            if x in (x0, x1) or top:
                key = o
            elif x >= x1 - 3:
                key = s
            else:
                key = b
            _px(img, x, y, key)
        prev = (x0, x1)
    # Top-left rim light.
    for y in range(25, 32):
        for x in range(0, 14):
            if _is(img, x, y, b) and _is(img, x, y - 1, o):
                _px(img, x, y, h)
    # Sleeve seams.
    x0, x1 = shape[31]
    _v(img, x0 + 4, 29, 31, s)
    _v(img, x1 - 4, 29, 31, o)
    return img


# Chest grids are 16 wide and stamped at x 8, y 23.
_CHEST_JUMPSUIT = """
................
..kk........kk..
.kkko......okkk.
..okkUUUUUUkko..
...okkuuuukko...
....okkzzkko....
.......zz..pp...
.......zz..pp...
.......zz.......
"""

_CHEST_OPEN = """
................
..kk........kk..
.kkko......okkk.
.okkkUUUUUUkkko.
..okkuuuuuukko..
..okkkuuuukkko..
...okkuuuukko...
...okkuuuukko...
....okuuuuko....
"""

_CHEST_VNECK = """
................
................
................
..okkUUUUUUkko..
...okkuuuukko...
....okkuukko....
.....okkkko.....
......oooo......
................
"""

_CHEST_HIGH = """
................
..okk......kko..
.okkk......kkko.
.okkkkzzzzkkkko.
..ooookzzkoooo..
.......zz.......
.tt....zz....tt.
.......zz.......
.tt....zz....tt.
"""

_CHEST_OVERALLS = """
................
................
..S..........S..
..SS.UUUUUU.SS..
...SS.uuuu.SS...
...SBBBBBBBBS...
..oBBBBBBBBBBo..
..oBBBtTtBBBBo..
..oBBBTtTBBBBo..
"""

_CHEST_VEST = """
................
................
..o..........o..
..okkUUUUUUkko..
..okkkuuuukkko..
..okkkkuukkkko..
..orrrrkkrrrro..
..okkkkkkkkkko..
..okpkkkkkkpko..
"""

_CHEST_COAT = """
................
..kk........kk..
.kkko......okkk.
.okkkUUUUUUkkko.
..okkkuuuukkko..
...okkkuukkko...
....okkkkkko....
...t.okkkko.t...
.....okkkko.....
"""

# Hoodie hood and spacesuit ring are 20 wide and stamped at x 6.
_HOOD = """
..ooo..........ooo..
.ohbbo........obbso.
ohbbbbsddddddsbbbbso
obbbbbbsddddsbbbbbso
"""

_RING = """
....oooooooooooo....
..oorrrrrrrrrrrroo..
.oRRddddddddddddRRo.
.oHHRRRRRRRRRRRRrro.
..oooooooooooooooo..
"""


_UNDER_SHADE = {"bone0": "steel3", "bone1": "bone0", "steel0": "void3", "steel1": "steel0", "steel3": "steel2", "void3": "void2"}


def _suit_jumpsuit(o: str, b: str, s: str, h: str, under: str, zip_: str, patch: str) -> Image.Image:
    img = _torso(o, b, s, h)
    return _stamp(img, _CHEST_JUMPSUIT, {"k": h, "o": o, "u": under, "U": _UNDER_SHADE[under], "z": zip_, "p": patch}, 8, 23)


def _suit_open(o: str, b: str, s: str, h: str, under: str) -> Image.Image:
    img = _torso(o, b, s, h)
    return _stamp(img, _CHEST_OPEN, {"k": h, "o": o, "u": under, "U": _UNDER_SHADE[under]}, 8, 23)


def _suit_hoodie(o: str, b: str, s: str, h: str, cord: str) -> Image.Image:
    img = _torso(o, b, s, h, _SLIM)
    _stamp(img, _HOOD, {"o": o, "b": b, "s": s, "h": h, "d": o}, 6, 22)
    _rect(img, 13, 26, 18, 26, s)
    for x in (13, 18):
        _v(img, x, 27, 30, cord)
    _px(img, 13, 31, o)
    _px(img, 18, 31, o)
    return img


def _suit_spacesuit(o: str, b: str, s: str, h: str, ring: str, ring_hi: str, ring_lo: str, light: str) -> Image.Image:
    img = _torso(o, b, s, h)
    _stamp(img, _RING, {"o": o, "r": ring_lo, "R": ring, "H": ring_hi, "d": "void2"}, 6, 23)
    _rect(img, 12, 29, 19, 31, s)
    _h(img, 12, 19, 28, o)
    _px(img, 13, 30, light)
    _px(img, 15, 30, "steel1")
    _px(img, 17, 30, "steel1")
    return img


def _suit_overalls(o: str, b: str, s: str, h: str, bib: str, bib_lo: str, under: str) -> Image.Image:
    img = _torso(o, b, s, h)
    return _stamp(img, _CHEST_OVERALLS, {"S": bib, "B": bib, "o": bib_lo, "u": under, "U": _UNDER_SHADE[under], "t": "steel3", "T": "bone1"}, 8, 23)


def _suit_vest(o: str, b: str, s: str, h: str, vest: str, vest_lo: str, stripe: str, pocket: str, under: str) -> Image.Image:
    img = _torso(o, b, s, h)
    return _stamp(img, _CHEST_VEST, {"o": vest_lo, "k": vest, "r": stripe, "p": pocket, "u": under, "U": _UNDER_SHADE[under]}, 8, 23)


def _suit_high(o: str, b: str, s: str, h: str, zip_: str, trim: str) -> Image.Image:
    img = _torso(o, b, s, h)
    return _stamp(img, _CHEST_HIGH, {"o": o, "k": h, "z": zip_, "t": trim}, 8, 23)


def _suit_vneck(o: str, b: str, s: str, h: str, under: str) -> Image.Image:
    img = _torso(o, b, s, h, _SLIM)
    return _stamp(img, _CHEST_VNECK, {"o": o, "k": h, "u": under, "U": _UNDER_SHADE[under]}, 8, 23)


def _suit_coat(o: str, b: str, s: str, h: str, lapel: str, under: str, trim: str) -> Image.Image:
    img = _torso(o, b, s, h)
    _stamp(img, _CHEST_COAT, {"o": o, "k": lapel, "u": under, "U": _UNDER_SHADE[under], "t": trim}, 8, 23)
    for x in (4, 5, 26, 27):
        _px(img, x, 27, trim)
    return img


def _suit_tee(o: str, b: str, s: str, h: str, logo: str) -> Image.Image:
    img = _torso(o, b, s, h, _SLIM)
    for y in (28, 30):
        for x in range(S):
            if _is(img, x, y, b, h):
                _px(img, x, y, logo)
    _h(img, 12, 19, 26, o)
    _h(img, 13, 18, 26, s)
    _h(img, 13, 18, 27, o)
    return img


def _build_suit() -> list[Image.Image]:
    return [
        _suit_jumpsuit("rust0", "orange", "rust1", "amber", "steel0", "steel3", "bone1"),
        _suit_jumpsuit("void1", "steel1", "steel0", "steel2", "void3", "teal2", "teal2"),
        _suit_open("void2", "cobalt1", "cobalt0", "cobalt2", "bone0"),
        _suit_hoodie("violet0", "violet2", "violet1", "violet3", "bone0"),
        _suit_spacesuit("steel0", "bone0", "steel3", "bone2", "steel2", "steel3", "steel1", "cobalt2"),
        _suit_overalls("rust0", "red0", "rust0", "red1", "cobalt1", "cobalt0", "steel3"),
        _suit_vest("void1", "steel0", "void3", "steel1", "green1", "green0", "green0", "lime", "steel0"),
        _suit_high("void1", "red0", "rust0", "red1", "yellow", "amber"),
        _suit_vneck("teal0", "teal1", "teal0", "teal2", "bone1"),
        _suit_coat("void0", "void3", "void2", "steel0", "steel0", "bone0", "amber"),
        _suit_vest("void1", "steel1", "steel0", "steel2", "yellow", "amber", "bone2", "amber", "void3"),
        _suit_coat("void1", "rust0", "void2", "rust1", "bone0", "steel1", "rust1"),
        _suit_tee("void1", "steel0", "void3", "steel1", "teal2"),
        _suit_high("green0", "green1", "green0", "lime", "steel3", "bone1"),
    ]


# ----------------------------------------------------------------------------------------------
# heads: shared skull (y 5..15) + one of five jaws (y 16..25), 20 wide, stamped at x 6
# o outline, b base, s shade, d nose underside, n chin / neck shadow, h highlight
# ----------------------------------------------------------------------------------------------

_SKULL = """
......oooooooo......
....oohhbbbbbboo....
...ohhhbbbbbbbbso...
..ohhbbbbbbbbbbbso..
..ohbbbbbbbbbbbbso..
..ohbbbbbbbbbbbbso..
..obbbbbbbbbbbbbso..
.oobbbbbbbbbbbbbsoo.
obsbbbbbbbbbbbbbssso
obsbbbbbbbsbbbbbssso
obsbbbbbbbsbbbbbssso
"""

_JAWS = {
    "oval": """
.oobbbbbbhbsbbbbsoo.
..obbbbbbddbbbbsso..
...obbbbbbbbbbsso...
...obbbbbbbbbbsso...
....obbbbllbbsso....
.....oobbbbssoo.....
......ooddddoo......
......onnnnnno......
......obbbssso......
......obbbbsso......
""",
    "square": """
.oobbbbbbhbsbbbbsoo.
..obbbbbbddbbbbbso..
..obbbbbbbbbbbbsso..
..obbbbbbbbbbbbsso..
..oobbbbbllbbbssoo..
...oobbbbbbbbssoo...
.....oooddddooo.....
.....onnnnnnnno.....
.....obbbbsssso.....
.....obbbbbssso.....
""",
    "heart": """
.oobbbbbbhbsbbbbsoo.
..obbbbbbddbbbbsso..
...obbbbbbbbbbsso...
....obbbbbbbbsso....
.....obbbllbbso.....
......oobbbsoo......
......onddddno......
......onnnnnno......
......obbbssso......
......obbbbsso......
""",
    "round": """
.oobbbbbbhbsbbbbsoo.
..obbbbbbddbbbbbso..
..ohbbbbbbbbbbbbso..
..ohbbbbbbbbbbbsso..
..obbbbbbllbbbbsso..
...obbbbbbbbbbsso...
....oossbbbbssoo....
.....oooddddooo.....
.....onnnnnnnno.....
.....obbbbbssso.....
""",
    "long": """
.oobbbbbbhbsbbbbsoo.
..obsbbbbddbbbssso..
..obssbbbbbbbbssso..
...osbbbbbbbbbsso...
...obbbbbllbbbsso...
....obbbbbbbbsso....
....oobbbbbbssoo....
......ooddddoo......
......onnnnnno......
......obbbssso......
""",
}

_SKINS: dict[str, Ramp] = {
    "pale": {"l": "bone0", "o": "rust0", "b": "bone1", "s": "bone0", "d": "steel3", "n": "steel3", "h": "bone2"},
    "light": {"l": "steel3", "o": "rust0", "b": "bone0", "s": "steel3", "d": "steel2", "n": "steel2", "h": "bone1"},
    "tan": {"l": "orange", "o": "rust0", "b": "amber", "s": "orange", "d": "rust1", "n": "rust1", "h": "amber"},
    "brown": {"l": "rust1", "o": "void1", "b": "rust1", "s": "rust0", "d": "rust0", "n": "void2", "h": "rust1"},
    "teal": {"l": "teal1", "o": "teal0", "b": "teal2", "s": "teal1", "d": "teal1", "n": "teal0", "h": "mint"},
    "violet": {"l": "violet2", "o": "violet0", "b": "violet3", "s": "violet2", "d": "violet2", "n": "violet1", "h": "cobalt2"},
    "android": {"l": "steel2", "o": "void3", "b": "steel3", "s": "steel2", "d": "steel2", "n": "steel1", "h": "bone0"},
}

_HUMAN = ("pale", "light", "tan", "brown")
_HUMAN_SHAPES = ("oval", "square", "heart", "round", "long")
_OTHER_SHAPES = {"teal": ("oval", "heart", "long"), "violet": ("oval", "round", "heart"), "android": ("oval", "square", "long")}


_FIN_LEFT = """
oo.
obo
obb
"""
_FIN_RIGHT = """
.oo
oso
sso
"""


def _head(shape: str, skin: str) -> Image.Image:
    ramp = _SKINS[skin]
    img = _part(_SKULL + _JAWS[shape], ramp, 6, 5)
    b, s = ramp["b"], ramp["s"]
    if skin == "android":
        # Panel seams and a status light; only painted where there is skin so every jaw works.
        for x, y in [(10, y) for y in range(15, 19)] + [(21, y) for y in range(15, 19)] + [(x, 24) for x in range(12, 20)]:
            if _is(img, x, y, b, s):
                _px(img, x, y, "steel1")
        for x, y in ((11, 19), (20, 19)):
            if _is(img, x, y, b, s):
                _px(img, x, y, "steel1")
        _px(img, 7, 14, "cobalt2")
    elif skin == "teal":
        for x, y in ((10, 16), (11, 17), (10, 18), (21, 16), (20, 17), (12, 7), (14, 6), (19, 7)):
            if _is(img, x, y, b, ramp["h"]):
                _px(img, x, y, s)
        # Finned ears: a pointed tip above each ear, small enough to sit under any hair.
        _stamp(img, _FIN_LEFT, ramp, 5, 10)
        _stamp(img, _FIN_RIGHT, ramp, 24, 10)
    elif skin == "violet":
        for x, y in ((10, 15), (11, 16), (21, 15), (20, 16)):
            if _is(img, x, y, b, s):
                _px(img, x, y, "cobalt2")
    return img


def _build_head() -> list[Image.Image]:
    out = [_head(shape, skin) for skin in _HUMAN for shape in _HUMAN_SHAPES]
    out += [_head(shape, skin) for skin, shapes in _OTHER_SHAPES.items() for shape in shapes]
    return out


# ----------------------------------------------------------------------------------------------
# hair: 24 wide grids stamped at x 4. o outline, b base, s shade, h highlight, e hairline edge
# ----------------------------------------------------------------------------------------------

_HAIR_RAMPS: dict[str, Ramp] = {
    "black": {"o": "void0", "b": "steel0", "s": "void3", "h": "steel1", "e": "void1"},
    "brown": {"o": "void1", "b": "rust0", "s": "void2", "h": "rust1", "e": "void2"},
    "auburn": {"o": "rust0", "b": "rust1", "s": "rust0", "h": "orange", "e": "rust0"},
    "ginger": {"o": "rust0", "b": "orange", "s": "rust1", "h": "amber", "e": "rust1"},
    "blond": {"o": "rust1", "b": "yellow", "s": "amber", "h": "bone2", "e": "rust1"},
    "grey": {"o": "steel0", "b": "steel2", "s": "steel1", "h": "steel3", "e": "steel0"},
    "white": {"o": "steel1", "b": "bone1", "s": "steel3", "h": "bone2", "e": "steel2"},
    "teal": {"o": "void2", "b": "teal1", "s": "teal0", "h": "teal2", "e": "teal0"},
    "violet": {"o": "violet0", "b": "violet2", "s": "violet1", "h": "violet3", "e": "violet0"},
    "red": {"o": "rust0", "b": "red1", "s": "red0", "h": "orange", "e": "red0"},
    "green": {"o": "green0", "b": "green1", "s": "green0", "h": "lime", "e": "green0"},
    "cobalt": {"o": "void2", "b": "cobalt1", "s": "cobalt0", "h": "cobalt2", "e": "cobalt0"},
}

# (grid, grid x, grid y, colors)
_HAIR_STYLES: dict[str, tuple[str, int, int, tuple[str, ...]]] = {
    "buzz": ("""
........oooooooo........
......oobshhsbsboo......
.....obsbhhbsbsbsbo.....
....obsbseeeeeesbsbo....
....osbe........esbo....
....ose..........eso....
....os............so....
....o..............o....
""", 4, 4, ("black", "brown", "grey")),
    "short": ("""
.........oooooo.........
.......oobbhhbboo.......
.....oobbhhhbbbbsoo.....
....obbhhbbbbsbbbbso....
...obbbbbebbeeebebbso...
...obbe.ee.e.....ebso...
...obe............eso...
....oe............eo....
....o..............o....
""", 4, 3, ("brown", "black", "blond", "auburn")),
    "sidepart": ("""
.........oooooo.........
.......oobbhhhboo.......
.....oobsbhhhbbbsoo.....
....obbsbbhhbbbbbbso....
...obbsbbbbbbbbbbbsso...
...obse.eebbbbbbbbsso...
...obe.....eeebbbbeso...
...oe.............eso...
....o..............o....
""", 4, 3, ("black", "blond", "grey", "cobalt")),
    "mohawk": ("""
..........oooo..........
.........obhbso.........
.........obhbso.........
.........obhbso.........
.........obhbso.........
.........obhbso.........
......t.tobhbsot.t......
.....t.t..obso..t.t.....
......t....ee....t......
""", 4, 1, ("red", "green", "violet")),
    "bun": ("""
..........oooo..........
.........obhbso.........
.........obbsso.........
........oooooooo........
......oobbhhbbbboo......
.....obbhhbbbbbbbso.....
....obbhbbbbbbbbbbso....
....obbbeeeeeeeebbso....
....obe..........eso....
....oe............eo....
....o..............o....
""", 4, 0, ("brown", "auburn", "white")),
    "long": ("""
.........oooooo.........
.......oobbhhbboo.......
.....oobbbhhsbbbsoo.....
....obbbbhhesbbbbbso....
...obbbbhbe..ebbbbbso...
..obbbbbee....eebbbbso..
..obbbee........eebbso..
..obbe............ebso..
..obhe............ebso..
..obhe............ebso..
..obbe............ebso..
..obbe............ebso..
..obbe............ebso..
..obbe............ebso..
..obhe............ebso..
..obhe............ebso..
..obbbe..........ebbso..
..obbbe..........ebbso..
..obbbbe........ebbbso..
..obbbbe........ebbbso..
..obhbbbe......ebbbbso..
..obhbbbe......ebbbbso..
..obbbbbe......ebbbbso..
..obbbbbe......ebbbbso..
..obbbbbe......ebbbbso..
...obbbbe......ebbbso...
....oooo........oooo....
""", 4, 3, ("black", "blond", "violet", "auburn")),
    "afro": ("""
........oooooooo........
.....ooobbhbbhbbooo.....
...oobbhbbsbbbbshbboo...
..obbhbbbhbbsbhbbbsbso..
.obbsbbhbbbbhbbbsbhbsso.
.obhbbbsbbhbbbsbhbbsbso.
obbbsbbbeeeeeeeebbsbhsso
obbhbbbe........ebbbbsso
obsbbbe..........ebbsbso
.obbbe............ebbso.
.obhbe............ebsso.
..obbe............ebso..
...oo..............oo...
""", 4, 1, ("black", "brown", "ginger")),
    "ponytail": ("""
........oooooooo..........
......oobbhhbbbboo........
.....obbhhbbbbbbbsooo.....
....obbhbbbbbbbbbbsqbbo...
....obbbeeeeeeeebbsqbbbso.
....obe..........eso.obbso
....oe............eo..obso
....o..............o..obso
......................obso
......................obho
......................obso
......................obso
......................obso
......................obso
......................obso
......................obso
.......................oo.
""", 4, 3, ("blond", "auburn", "teal")),
    "bob": ("""
.........oooooo.........
.......oobbhhbboo.......
.....oobbhhhbbbbsoo.....
....obbbhhbbbbbbbbso....
...obbbhbbbbbbbbbbsso...
..obbbbbbbbbbbbbbbbsso..
..obbbeeeeeeeeeeeebsso..
..obbe............ebso..
..obhe............ebso..
..obhe............ebso..
..obbe............ebso..
..obbe............ebso..
..obbe............ebso..
..obbe............ebso..
..obbe............ebso..
..obbbe..........ebbso..
..obbbe..........ebbso..
...obbbe........ebbso...
....ooo..........ooo....
""", 4, 3, ("black", "red", "white")),
    "receding": ("""
........oooooooo........
......oobbhbbbbsoo......
.....obbe.ebbe.ebso.....
....obbe...ee...ebso....
....obe..........eso....
....obe..........eso....
....oe............eo....
....o..............o....
""", 4, 4, ("grey", "brown", "black")),
    "horseshoe": ("""
....oo............oo....
...obbe..........ebso...
...obhe..........ebso...
...obbe..........ebso...
...obe............eso...
....o..............o....
""", 4, 7, ("grey", "white", "brown")),
    "spiky": ("""
......o...o...o...o.....
.....obo.obo.obo.obo....
....obbbobbhobbbobbso...
...obbhbbbhbbbbhbbsso...
...obhbbbbbbsbbbbbbso...
...obbbbsbbbbbbsbbsso...
...obbbebbbbebbbebbso...
...obbe.ebbe.ebe.ebso...
...obe............eso...
....oe............eo....
""", 4, 1, ("ginger", "teal", "black")),
}


def _build_hair() -> list[Image.Image]:
    out = [_new()]
    for grid, ox, oy, colors in _HAIR_STYLES.values():
        for color in colors:
            ramp = dict(_HAIR_RAMPS[color])
            ramp["t"] = "steel1"  # shaved-side stubble: neutral so it reads on every skin
            ramp["q"] = "red1" if color in ("white", "blond") else "bone0"  # hair tie
            out.append(_part(grid, ramp, ox, oy))
    return out


# ----------------------------------------------------------------------------------------------
# eyes: 12 wide (x 10..21), 6 rows (y 9..14). K brow, L lid, W white, I iris, G bag, D socket
# ----------------------------------------------------------------------------------------------

_EYES_BASE = {"K": "void2", "L": "void1", "W": "bone2", "w": "steel3", "G": "steel1", "D": "void0"}

_E_NEUTRAL = """
............
KKKK....KKKK
............
.LLL....LLL.
.WIw....WIw.
............
"""
_E_TIRED = """
............
.KKK....KKK.
K..........K
.LLL....LLL.
.WIw....WIw.
.GGG....GGG.
"""
_E_SQUINT = """
............
............
KKKK....KKKK
............
.LLL....LLL.
............
"""
_E_WIDE = """
KKKK....KKKK
............
.LLL....LLL.
.WIw....WIw.
.WWw....WWw.
............
"""
_E_BROW = """
........KKK.
KKKK.......K
............
.LLL....LLL.
.WIw....WIw.
............
"""
_E_HAPPY = """
............
KKKK....KKKK
............
..L......L..
.L.L....L.L.
............
"""
_E_SIDE = """
............
KKKK....KKKK
............
.LLL....LLL.
.WWI....WWI.
............
"""
_E_ANGRY = """
............
KK........KK
..KK....KK..
.LLL....LLL.
.WIw....WIw.
............
"""
_E_LASH = """
............
.KKK....KKK.
............
LLLL....LLLL
.WIw....WIw.
............
"""
_E_BUSHY = """
.KKK....KKK.
KKKK....KKKK
............
.LLL....LLL.
.WIw....WIw.
............
"""
_E_WORRIED = """
..KK....KK..
KK........KK
............
.LLL....LLL.
.WIw....WIw.
............
"""
_E_LED = """
............
............
.DDD....DDD.
.gIg....gIg.
.DDD....DDD.
............
"""


def _eyes(grid: str, iris: str, **extra: str) -> Image.Image:
    return _part(grid, {**_EYES_BASE, "I": iris, **extra}, 10, 9)


def _build_eyes() -> list[Image.Image]:
    return [
        _eyes(_E_NEUTRAL, "void1"),
        _eyes(_E_NEUTRAL, "cobalt1"),
        _eyes(_E_NEUTRAL, "rust1"),
        _eyes(_E_TIRED, "void1"),
        _eyes(_E_TIRED, "teal1"),
        _eyes(_E_SQUINT, "void1"),
        _eyes(_E_WIDE, "void1"),
        _eyes(_E_BROW, "rust0"),
        _eyes(_E_HAPPY, "void1"),
        _eyes(_E_SIDE, "void1"),
        _eyes(_E_ANGRY, "void1"),
        _eyes(_E_LASH, "green1"),
        _eyes(_E_BUSHY, "void1"),
        _eyes(_E_WORRIED, "cobalt1"),
        _eyes(_E_LED, "mint", g="teal2"),
        _eyes(_E_LED, "yellow", g="orange"),
    ]


# ----------------------------------------------------------------------------------------------
# mouths: 10 wide (x 11..20), 4 rows (y 18..21). M lip line, D inside, W teeth, T tongue, R lip
# ----------------------------------------------------------------------------------------------

_MOUTH_LEGEND = {"M": "void2", "D": "void1", "W": "bone2", "T": "red1", "R": "red0"}

_MOUTHS = [
    # neutral
    """
..........
...MMMM...
..........
..........
""",
    # smirk
    """
.......M..
...MMMM...
..........
..........
""",
    # smile
    """
..M....M..
...MMMM...
..........
..........
""",
    # frown
    """
..........
...MMMM...
..M....M..
..........
""",
    # yawn
    """
..........
...MDDM...
...DTTD...
....MM....
""",
    # teeth grit
    """
...MMMM...
..MWWWWM..
...MMMM...
..........
""",
    # small o
    """
..........
....MM....
....DD....
..........
""",
    # lip bite
    """
..........
...MMMW...
......M...
..........
""",
    # grin
    """
.M......M.
..MWWWWM..
...MMMM...
..........
""",
    # deadpan
    """
..........
..MMMMMM..
..........
..........
""",
    # wry
    """
..........
...MMM....
......MM..
..........
""",
    # full lips
    """
..........
...MMMM...
....RR....
..........
""",
]


def _build_mouth() -> list[Image.Image]:
    return [_part(g, _MOUTH_LEGEND, 11, 18) for g in _MOUTHS]


# ----------------------------------------------------------------------------------------------
# accessories (drawn last)
# ----------------------------------------------------------------------------------------------

def _acc_goggles_up() -> Image.Image:
    grid = """
......fffff..fffff......
.....FgGGGgFFgGGGgF.....
...ssFgGGGgFFgGGGgFss...
......FFFFF..FFFFF......
"""
    img = _part(grid, {"f": "steel2", "F": "steel1", "g": "teal0", "G": "teal1", "s": "steel0"}, 4, 6)
    _px(img, 11, 7, "mint")
    _px(img, 18, 7, "mint")
    return img


def _acc_headset() -> Image.Image:
    img = _new()
    _h(img, 10, 21, 3, "steel1")
    _h(img, 11, 14, 3, "steel2")
    for x in (8, 9, 22, 23):
        _px(img, x, 4, "steel1")
    _v(img, 7, 5, 10, "steel1")
    _v(img, 24, 5, 10, "steel0")
    for x0 in (5, 24):
        _rect(img, x0, 11, x0 + 2, 16, "void1")
        _rect(img, x0, 12, x0 + 2, 15, "steel0")
        _v(img, x0 + 1, 12, 15, "steel1")
    _px(img, 6, 13, "steel2")
    for x, y in ((6, 17), (7, 18), (8, 19), (9, 20), (10, 20)):
        _px(img, x, y, "steel0")
    _px(img, 11, 20, "void1")
    _px(img, 12, 20, "steel2")
    _px(img, 12, 21, "void1")
    return img


def _acc_cap(o: str, b: str, s: str, h: str, logo: str) -> Image.Image:
    grid = """
........oooooooo........
......oobbhhbbbboo......
....oobbhhbbbbbbbsoo....
...obbhbbbbbbbbbbbbso...
...obbbbbbbllbbbbbsso...
...obbbbbbbllbbbbbsso...
...oooooooooooooooooo...
....oPPppppppppppppo....
"""
    # The brim is no wider than the crown so it reads as a cap seen from the front, not a hat.
    return _part(grid, {"o": o, "b": b, "s": s, "h": h, "l": logo, "P": b, "p": s}, 4, 2)


def _acc_hardhat() -> Image.Image:
    grid = """
.........oooooo.........
.......oobbhhbboo.......
.....oobbhhbbbbbsoo.....
....obbhhbbbllbbbbso....
...obbhbbbbbllbbbbsso...
...obbbbbbbbbbbbbbsso...
...obbbbbbbbbbbbbbsso...
.oooooooooooooooooooooo.
.ohhbbbbbbbbbbbbbbbbsso.
"""
    return _part(grid, {"o": "rust0", "b": "yellow", "s": "amber", "h": "bone2", "l": "bone2"}, 4, 1)


def _acc_scar() -> Image.Image:
    img = _new()
    for x, y, k in ((12, 11, "red0"), (12, 14, "red1"), (12, 15, "red1"), (13, 16, "red1"), (13, 17, "red0")):
        _px(img, x, y, k)
    return img


def _acc_moustache(b: str, h: str) -> Image.Image:
    img = _new()
    _h(img, 12, 19, 18, b)
    _h(img, 14, 15, 18, h)
    _px(img, 12, 19, b)
    _px(img, 19, 19, b)
    return img


_BEARD = """
.o..............o.
.ob............bo.
.obb..........bso.
.obbhbbbbbbbbbbso.
.obbbb......bbbso.
.obbbb......bbsso.
..obbbbbbbbbbsso..
..oobbhbbbbbssoo..
...oobbbbbbssoo...
.....oooooooo.....
"""


def _acc_beard(o: str, b: str, s: str, h: str) -> Image.Image:
    return _part(_BEARD, {"o": o, "b": b, "s": s, "h": h}, 7, 15)


def _acc_eyepatch() -> Image.Image:
    img = _new()
    for x, y in ((8, 6), (9, 6), (10, 7), (11, 7), (12, 8), (13, 8), (14, 9), (15, 9), (16, 10), (22, 11), (23, 11)):
        _px(img, x, y, "steel0")
    _rect(img, 17, 11, 21, 14, "void1")
    _h(img, 18, 20, 15, "void1")
    _h(img, 17, 20, 11, "steel0")
    _px(img, 18, 12, "steel0")
    return img


def _acc_glasses() -> Image.Image:
    img = _new()
    for x0 in (10, 17):
        _h(img, x0, x0 + 4, 14, "steel1")
        _v(img, x0, 12, 13, "steel1")
        _v(img, x0 + 4, 12, 13, "steel1")
    _h(img, 15, 16, 12, "steel1")
    for x in (8, 9, 22, 23):
        _px(img, x, 12, "steel0")
    return img


def _acc_visor() -> Image.Image:
    grid = """
.oooooooooooooooo.
oGhhhGGGGGGGGGGGgo
ogGGhhGGGGGGGGgggo
.oooooooooooooooo.
"""
    return _part(grid, {"o": "void3", "G": "teal1", "g": "teal0", "h": "mint"}, 7, 11)


def _acc_bandana() -> Image.Image:
    grid = """
.oooooooooooooooo....
obbhhbbbbbbbbbbbsoo..
obbbbbbbbbbbbbbsssbo.
.ssssssssssssssss.sbo
..................os.
"""
    return _part(grid, {"o": "rust0", "b": "red1", "s": "red0", "h": "orange"}, 7, 5)


def _acc_earpiece() -> Image.Image:
    img = _new()
    _rect(img, 23, 12, 25, 15, "void1")
    _rect(img, 24, 12, 24, 15, "steel1")
    _px(img, 24, 13, "mint")
    _v(img, 25, 6, 11, "steel2")
    _px(img, 25, 5, "red1")
    return img


def _acc_mask() -> Image.Image:
    grid = """
.....oooooo.....
ttttobhhbbsotttt
...obbbbbbbso...
occobbvVvVbsocco
occobbVvVvbsocco
.oo.obbbbsso.oo.
.....oooooo.....
"""
    return _part(grid, {"o": "void3", "b": "steel2", "s": "steel1", "h": "steel3", "v": "void2", "V": "steel0", "c": "teal1", "t": "steel0"}, 8, 15)


def _acc_tape() -> Image.Image:
    img = _new()
    _h(img, 13, 18, 15, "steel3")
    _h(img, 14, 15, 15, "bone1")
    _h(img, 14, 18, 16, "steel1")
    return img


def _acc_welding() -> Image.Image:
    grid = """
..fffff..fffff..
ssFgLLFFFFgLLFss
ssFLLLF..FLLLFss
..FFFFF..FFFFF..
"""
    return _part(grid, {"f": "amber", "F": "rust1", "L": "void1", "g": "lime", "s": "steel0"}, 8, 11)


def _build_acc() -> list[Image.Image]:
    return [
        _new(),
        _acc_goggles_up(),
        _acc_headset(),
        _acc_cap("void2", "cobalt1", "cobalt0", "cobalt2", "bone1"),
        _acc_scar(),
        _acc_moustache("void3", "steel0"),
        _acc_beard("void1", "void3", "void2", "steel0"),
        _acc_eyepatch(),
        _acc_glasses(),
        _acc_visor(),
        _acc_bandana(),
        _acc_earpiece(),
        _acc_mask(),
        _acc_tape(),
        _acc_welding(),
        _acc_beard("void1", "rust0", "void2", "rust1"),
        _acc_beard("steel0", "steel2", "steel1", "steel3"),
        _acc_moustache("steel1", "steel2"),
        _acc_cap("rust0", "orange", "rust1", "amber", "void2"),
        _acc_hardhat(),
    ]


def build_layers() -> dict[str, list[Image.Image]]:
    return {
        "bg": _build_bg(),
        "suit": _build_suit(),
        "head": _build_head(),
        "hair": _build_hair(),
        "eyes": _build_eyes(),
        "mouth": _build_mouth(),
        "acc": _build_acc(),
    }

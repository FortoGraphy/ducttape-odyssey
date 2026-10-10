"""Builds the bundled fonts from the OFL sources in assets-src/fonts.

Variable fonts are pinned to static instances (React Native on iOS addresses fonts by PostScript
name, and variable axes are not reliably selectable), renamed so the PostScript name equals the
key used in src/ui/fonts.ts, and checked for full Czech glyph coverage.

    python scripts/assets/build_fonts.py
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets-src" / "fonts"
OUT = ROOT / "assets" / "fonts"

CZECH = "ěščřžýáíéúůďťňóĚŠČŘŽÝÁÍÉÚŮĎŤŇÓ"
BASIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:;!?%+-/()[]<>=#&'\"×…–°•"
ARROWS = "→←↑↓"

# (output PostScript name, source file, axis pins or None, family, style, extra required glyphs)
FONTS = [
    ("Doto-Bold", "Doto-VF.ttf", {"wght": 700, "ROND": 0}, "Doto", "Bold", ""),
    ("Doto-Black", "Doto-VF.ttf", {"wght": 900, "ROND": 0}, "Doto", "Black", ""),
    ("PixelifySans-Regular", "PixelifySans-VF.ttf", {"wght": 400}, "Pixelify Sans", "Regular", ""),
    ("PixelifySans-Bold", "PixelifySans-VF.ttf", {"wght": 700}, "Pixelify Sans", "Bold", ""),
    ("IBMPlexMono-Regular", "IBMPlexMono-Regular.ttf", None, "IBM Plex Mono", "Regular", ARROWS),
    ("IBMPlexMono-Medium", "IBMPlexMono-Medium.ttf", None, "IBM Plex Mono", "Medium", ARROWS),
    ("IBMPlexMono-Bold", "IBMPlexMono-Bold.ttf", None, "IBM Plex Mono", "Bold", ARROWS),
]


def set_name(font: TTFont, name_id: int, value: str) -> None:
    table = font["name"]
    table.names = [n for n in table.names if n.nameID != name_id]
    table.setName(value, name_id, 3, 1, 0x409)
    table.setName(value, name_id, 1, 0, 0)


def build() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    failed = False
    for ps_name, src_name, pins, family, style, extra in FONTS:
        font = TTFont(SRC / src_name)
        if pins:
            font = instantiateVariableFont(font, pins, inplace=False)
            set_name(font, 1, f"{family} {style}" if style not in ("Regular", "Bold") else family)
            set_name(font, 2, style if style in ("Regular", "Bold") else "Regular")
            set_name(font, 4, f"{family} {style}")
            set_name(font, 6, ps_name)
            set_name(font, 16, family)
            set_name(font, 17, style)
            for tag in ("STAT", "MVAR", "HVAR", "avar", "fvar", "gvar"):
                if tag in font:
                    del font[tag]
        ps_actual = font["name"].getDebugName(6)
        cmap = font.getBestCmap()
        missing = [c for c in CZECH + BASIC + extra if ord(c) not in cmap]
        target = OUT / f"{ps_name}.ttf"
        font.save(target)
        status = "ok" if not missing and ps_actual == ps_name else "FAIL"
        if status == "FAIL":
            failed = True
        print(f"{status:4s} {target.name:28s} ps={ps_actual:24s} {target.stat().st_size / 1024:6.0f} kB missing={''.join(missing) or '-'}")
    for lic in SRC.glob("OFL-*.txt"):
        shutil.copy(lic, OUT / lic.name)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(build())

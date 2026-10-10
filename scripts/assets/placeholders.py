"""Temporary icon/splash placeholders so `expo prebuild` works before the art pipeline exists."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
BG, ORANGE = (7, 9, 15), (255, 106, 26)


def make(name: str, size: int, pad: int) -> None:
    im = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(im)
    d.rectangle([pad, pad, size - pad, size - pad], outline=ORANGE, width=max(2, size // 40))
    d.rectangle([size * 0.38, size * 0.38, size * 0.62, size * 0.62], fill=ORANGE)
    im.save(ROOT / "assets" / name)


make("icon.png", 1024, 180)
make("splash-icon.png", 512, 120)
make("favicon.png", 48, 8)
print("placeholders ok")

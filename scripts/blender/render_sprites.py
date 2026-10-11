"""Renders every sprite frame (color pass + emissive pass) at supersampled resolution.

    blender --background --factory-startup --python scripts/blender/render_sprites.py -- \
        --out .scratch/assets/raw [--only ship_tug,asteroid] [--ss 4] [--hulls tug,hauler,...]

Writes <out>/<frame>.png, <out>/<frame>_e.png and <out>/manifest.json. Post-processing
(downsample, palette quantization, outline, packing) happens in scripts/assets/sprites.py.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import kit  # noqa: E402
import props  # noqa: E402
import ships  # noqa: E402


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", default="")
    ap.add_argument("--ss", type=int, default=4)
    ap.add_argument("--hulls", default="")
    args = ap.parse_args(argv)

    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    hull_ids = [h for h in args.hulls.split(",") if h] or list(ships.DEFAULT_HULLS)
    groups = ships.groups(hull_ids) + props.groups()
    only = [o for o in args.only.split(",") if o]
    if only:
        groups = [g for g in groups if any(g["group"].startswith(o) for o in only)]

    kit.setup_scene()
    manifest_path = out / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() and only else {"ss": args.ss, "groups": {}}
    manifest["ss"] = args.ss
    t0 = time.time()
    count = 0
    for g in groups:
        w, h = g["size"]
        kit.frame_camera(w, h, args.ss, g.get("center", (0.0, 0.0)))
        names = []
        for i, name in enumerate(g["frames"]):
            kit.clear_objects()
            g["build"](i)
            kit.set_pass("color")
            kit.render(str(out / f"{name}.png"))
            kit.set_pass("emit")
            kit.render(str(out / f"{name}_e.png"))
            names.append(name)
            count += 1
        manifest["groups"][g["group"]] = {"size": [w, h], "center": list(g.get("center", (0.0, 0.0))), "frames": names,
                                         "anchors": g.get("anchors", {})}
        print(f"[render] {g['group']}: {len(names)} frames", flush=True)
    manifest_path.write_text(json.dumps(manifest, indent=1))
    print(f"[render] done: {count} frames x 2 passes in {time.time() - t0:.1f} s")
    return 0


if __name__ == "__main__":
    try:
        code = main()
    except Exception:
        import traceback

        traceback.print_exc()
        code = 1
    sys.exit(code)

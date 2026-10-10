#!/usr/bin/env python3
"""Builds every sound in the game from code: python scripts/audio/build_audio.py

Outputs
  assets/audio/sfx/<id>.wav                one per id in SFX_IDS (src/platform/feedback.ts)
  assets/audio/music/<scene>_{base,layer}.wav
  assets/audio/manifest.json
  src/audio/manifest.generated.ts          require() maps
  scripts/audio/preview.html               listening page (serve the repo root over http)
  .scratch/audio/medley.wav                everything in one file

Format decision: PCM 16 bit mono WAV at 22.05 kHz for everything.
  * Loops must be gap-free. AAC/MP3 carry encoder delay and padding, so a looped player either
    plays a few milliseconds of silence or needs gapless metadata that cannot be verified here.
    PCM has no priming samples: the file is exactly `loopSamples` frames long and the last frame
    is followed by the first.
  * 22.05 kHz mono costs 44.1 kB per second. Twelve loop files of 13-27 s come to about 10 MB,
    inside the 15 MB budget, and the 11 kHz bandwidth suits the lo-fi palette (and a phone speaker).
  * Metro bundles .wav by default and both AVPlayer and browsers decode it without surprises.

Determinism: all randomness comes from generators seeded with crc32 of a fixed name, so two runs
produce byte-identical files.

Flags: --only sfx|music, --no-medley, --quiet. Exit code is non-zero when any check fails.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import numpy as np  # noqa: E402

import music  # noqa: E402
from sfx import SFX  # noqa: E402
from synth import SR, circ_filt, db, fade, hp, n_of, peak, read_wav, rng_of, to_pcm16, write_wav  # noqa: E402

ROOT = HERE.parent.parent
OUT = ROOT / "assets" / "audio"
TS_OUT = ROOT / "src" / "audio" / "manifest.generated.ts"
FEEDBACK_TS = ROOT / "src" / "platform" / "feedback.ts"
SCRATCH = ROOT / ".scratch" / "audio"

BUDGET_BYTES = 15 * 1024 * 1024

# Verification thresholds (documented in the table footer as well).
SFX_MIN_S, SFX_PEAK_CAP_DB, SFX_PEAK_MAX_DB, SFX_CENTROID_MAX = 0.030, -1.5, -1.0, 5000.0
MUSIC_PEAK_MAX_DB, BASE_CENTROID_MAX, LAYER_CENTROID_MAX = -3.0, 3500.0, 5000.0
DC_MAX = 0.004
STEADY_MAX_DB = -80.0  # folded loop vs middle of a three-repetition render
LEAK_MAX_DB = -80.0  # level left at the very end of the render tail
SEAM_RATIO_MAX = 1.0  # seam step / slope / LPC residual vs the largest value inside the loop
MASTER_CEIL_DB = -3.5
LPC_ORDER = 24


# ----------------------------------------------------------------------------- analysis

def dbfs(v: float) -> float:
    return 20.0 * np.log10(max(v, 1e-9))


def spectrum_stats(x: np.ndarray) -> tuple[float, float]:
    """Power-weighted spectral centroid in Hz and the share of energy above 6 kHz."""
    p = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2
    f = np.fft.rfftfreq(len(x), 1.0 / SR)
    total = p.sum() + 1e-20
    return float((f * p).sum() / total), float(p[f > 6000.0].sum() / total)


def basic_stats(x: np.ndarray) -> dict:
    pcm = to_pcm16(x)
    cen, hf = spectrum_stats(x)
    return {
        "peak": dbfs(float(np.max(np.abs(x)))),
        "rms": dbfs(float(np.sqrt(np.mean(x * x)))),
        "dc": float(np.mean(x)),
        "clipped": int(np.sum(np.abs(pcm.astype(np.int32)) >= 32767)),
        "centroid": cen,
        "hf": hf,
    }


def seam_stats(x: np.ndarray) -> dict:
    """How the wrap from the last sample to the first compares with the inside of the loop.

    step:  |x[0] - x[N-1]|                      vs max |first difference| inside
    slope: second difference across the wrap    vs max |second difference| inside
    lpc:   linear-prediction error at the wrap  vs max error inside (a click is, by definition,
           a sample the surrounding signal fails to predict)
    Each also gets a ratio against the 99.9th percentile, which is printed for information.
    """
    n = len(x)
    d1 = np.roll(x, -1) - x  # d1[n-1] is the wrap
    d2 = np.roll(x, -1) - 2.0 * x + np.roll(x, 1)  # d2[0] and d2[n-1] touch the wrap
    in1 = np.abs(d1[:-1])
    in2 = np.abs(d2[1:-1])
    spec = np.abs(np.fft.rfft(x)) ** 2
    ac = np.fft.irfft(spec, n)[:LPC_ORDER + 1]
    idx = np.abs(np.subtract.outer(np.arange(LPC_ORDER), np.arange(LPC_ORDER)))
    mat = ac[idx] + np.eye(LPC_ORDER) * ac[0] * 1e-9
    coef = np.linalg.solve(mat, ac[1:LPC_ORDER + 1])
    err = x.copy()
    for k in range(1, LPC_ORDER + 1):
        err -= coef[k - 1] * np.roll(x, k)
    err = np.abs(err)
    seam_err = float(err[:LPC_ORDER].max())  # these predictions read samples from before the wrap
    inside = err[LPC_ORDER:]
    eps = 1e-12
    return {
        "step": abs(float(d1[-1])) / (float(in1.max()) + eps),
        "step999": abs(float(d1[-1])) / (float(np.percentile(in1, 99.9)) + eps),
        "slope": max(abs(float(d2[0])), abs(float(d2[-1]))) / (float(in2.max()) + eps),
        "slope999": max(abs(float(d2[0])), abs(float(d2[-1]))) / (float(np.percentile(in2, 99.9)) + eps),
        "lpc": seam_err / (float(inside.max()) + eps),
        "lpc999": seam_err / (float(np.percentile(inside, 99.9)) + eps),
    }


# ----------------------------------------------------------------------------- sfx

def read_sfx_ids() -> list[str]:
    src = FEEDBACK_TS.read_text(encoding="utf-8")
    m = re.search(r"SFX_IDS\s*=\s*\[(.*?)\]\s*as const", src, re.S)
    if not m:
        raise SystemExit(f"could not find SFX_IDS in {FEEDBACK_TS}")
    return re.findall(r'"([A-Za-z0-9_]+)"', m.group(1))


def loudness(x: np.ndarray) -> float:
    """Loudest 20 ms (RMS, dBFS) after a rough phone-speaker / ear weighting: nothing below 250 Hz
    counts, the 3 kHz region counts a little extra. Used to balance the effects against each other."""
    w = peak(hp(np.concatenate([x, np.zeros(n_of(0.02))]), 250.0), 3000.0, 3.0, 0.8)
    win = min(len(w), n_of(0.020))
    acc = np.concatenate([[0.0], np.cumsum(w * w)])
    return dbfs(float(np.sqrt(np.max(acc[win:] - acc[:-win]) / win)))


def render_sfx(sfx_id: str) -> np.ndarray:
    fn, loud_db, max_s = SFX[sfx_id]
    x = np.asarray(fn(rng_of("sfx:" + sfx_id)), dtype=np.float64)
    x = hp(np.concatenate([x, np.zeros(n_of(0.02))]), 28.0)  # DC and sub-rumble out
    # trim the inaudible tail, keep at least the minimum length
    audible = np.nonzero(np.abs(x) > np.max(np.abs(x)) * db(-62.0))[0]
    end = max(n_of(SFX_MIN_S), min(len(x), n_of(max_s), int(audible[-1]) + n_of(0.012)))
    # 1 ms in (keeps the transient of clicks), 10 ms raised-cosine out
    x = fade(x[:end], 0.001, 0.010)
    x = x - np.mean(x) * np.hanning(len(x)) * 2.0  # windowed so the ends stay at zero
    cap = db(SFX_PEAK_CAP_DB)
    g = db(loud_db - loudness(x))
    if float(np.max(np.abs(x))) * g <= cap:
        return x * g
    # The target would push the peak past the cap: lean into a soft clipper instead (at most 6 dB),
    # which is what a small speaker wants from thuds and booms anyway.
    g0 = g
    for _ in range(5):
        y = np.tanh(x * g / cap) * cap
        g = min(g0 * 2.0, g * db(loud_db - loudness(y)))
    return np.tanh(x * g / cap) * cap


def build_sfx(ids: list[str], rows: list[dict], problems: list[str]) -> list[dict]:
    missing = [i for i in ids if i not in SFX]
    if missing:
        raise SystemExit(f"SFX_IDS without a generator in scripts/audio/sfx.py: {missing}")
    for extra in sorted(set(SFX) - set(ids)):
        print(f"note: generator '{extra}' is not in SFX_IDS, skipped")
    out_dir = OUT / "sfx"
    out_dir.mkdir(parents=True, exist_ok=True)
    for stale in out_dir.glob("*.wav"):
        if stale.stem not in ids:
            stale.unlink()
    entries = []
    for sfx_id in ids:
        x = render_sfx(sfx_id)
        path = out_dir / f"{sfx_id}.wav"
        size = write_wav(path, x)
        y, _ = read_wav(path)
        st = basic_stats(y)
        dur = len(y) / SR
        max_s = SFX[sfx_id][2]
        row = {"kind": "sfx", "name": sfx_id, "dur": dur, "size": size, "loud": loudness(y), "want": SFX[sfx_id][1], **st}
        rows.append(row)
        if not (SFX_MIN_S - 1e-6 <= dur <= max_s + 1e-6):
            problems.append(f"sfx {sfx_id}: duration {dur * 1000:.0f} ms outside {SFX_MIN_S * 1000:.0f}..{max_s * 1000:.0f} ms")
        if st["peak"] > SFX_PEAK_MAX_DB or st["clipped"]:
            problems.append(f"sfx {sfx_id}: peak {st['peak']:.1f} dBFS / {st['clipped']} clipped samples")
        if abs(st["dc"]) > DC_MAX:
            problems.append(f"sfx {sfx_id}: DC offset {st['dc']:.4f}")
        if st["centroid"] > SFX_CENTROID_MAX:
            problems.append(f"sfx {sfx_id}: spectral centroid {st['centroid']:.0f} Hz")
        if y[0] != 0.0 or y[-1] != 0.0:
            problems.append(f"sfx {sfx_id}: does not start and end at zero")
        entries.append({"id": sfx_id, "file": f"sfx/{sfx_id}.wav", "duration": round(dur, 4), "samples": len(y),
                        "peakDb": round(st["peak"], 2), "rmsDb": round(st["rms"], 2), "loudDb": round(row["loud"], 2), "bytes": size})
    return entries


# ----------------------------------------------------------------------------- music

def master(base: np.ndarray, layer: np.ndarray, target_rms_db: float) -> tuple[np.ndarray, np.ndarray]:
    """Soft ceiling plus loudness target. Memoryless, so a periodic input stays periodic. The layer
    goes through the same gain so its balance against the base is exactly what the scene wrote."""
    ceil = db(MASTER_CEIL_DB)

    def level(sig: np.ndarray) -> float:
        # Loudness is judged above 200 Hz: a phone speaker plays nothing below that, and a
        # full-band RMS would let a bass line decide how loud the tune feels.
        w = circ_filt(sig, "hp", 200.0)
        return float(np.sqrt(np.mean(w * w))) + 1e-12

    g = db(target_rms_db) / level(base)
    for _ in range(6):  # tanh shaves a little level off: converge on the target
        g *= db(target_rms_db) / level(np.tanh(base * g / ceil) * ceil)
    return np.tanh(base * g / ceil) * ceil, np.tanh(layer * g / ceil) * ceil


def build_music(rows: list[dict], problems: list[str]) -> tuple[list[dict], dict]:
    out_dir = OUT / "music"
    out_dir.mkdir(parents=True, exist_ok=True)
    for stale in out_dir.glob("*.wav"):
        if stale.stem.rsplit("_", 1)[0] not in music.SCENES:
            stale.unlink()
    entries, loops = [], {}
    for name, fn in music.SCENES.items():
        t0 = time.time()
        music.clear_memo()
        one, three = fn(1), fn(3)
        S = one.scene
        if S.truncated or three.scene.truncated:
            problems.append(f"music {name}: {S.truncated} voices ran past the render tail")
        stems = {}
        for part in ("base", "layer"):
            lin1 = music.master_eq(getattr(one, part))
            lin3 = music.master_eq(getattr(three, part))
            folded, middle = S.fold(lin1), three.scene.fold(lin3)
            ref = float(np.max(np.abs(middle))) + 1e-12
            steady = dbfs(float(np.max(np.abs(folded - middle))) / ref)
            leak = S.tail_leak_db(lin1)
            stems[part] = (folded, steady, leak)
        base_f = stems["base"][0] + (one.base_bed if one.base_bed is not None else 0.0)
        base, layer = master(base_f, stems["layer"][0], one.target_rms_db)
        music.clear_memo()

        files = {}
        for part, sig in (("base", base), ("layer", layer)):
            path = out_dir / f"{name}_{part}.wav"
            size = write_wav(path, sig)
            y, _ = read_wav(path)
            assert len(y) == S.n
            st, seam = basic_stats(y), seam_stats(y)
            _, steady, leak = stems[part]
            rows.append({"kind": "music", "name": f"{name}_{part}", "dur": len(y) / SR, "size": size, **st, **seam,
                         "steady": steady, "leak": leak})
            tag = f"music {name}_{part}"
            if st["peak"] > MUSIC_PEAK_MAX_DB or st["clipped"]:
                problems.append(f"{tag}: peak {st['peak']:.1f} dBFS / {st['clipped']} clipped samples")
            if abs(st["dc"]) > DC_MAX:
                problems.append(f"{tag}: DC offset {st['dc']:.4f}")
            if st["centroid"] > (BASE_CENTROID_MAX if part == "base" else LAYER_CENTROID_MAX):
                problems.append(f"{tag}: spectral centroid {st['centroid']:.0f} Hz")
            if steady > STEADY_MAX_DB:
                problems.append(f"{tag}: folded loop differs from steady state by {steady:.1f} dB")
            if leak > LEAK_MAX_DB:
                problems.append(f"{tag}: render tail still at {leak:.1f} dB, tail too short")
            for key in ("step", "slope", "lpc"):
                if seam[key] > SEAM_RATIO_MAX:
                    problems.append(f"{tag}: seam {key} ratio {seam[key]:.2f} > {SEAM_RATIO_MAX}")
            files[part] = {"file": f"music/{name}_{part}.wav", "peakDb": round(st["peak"], 2), "rmsDb": round(st["rms"], 2), "bytes": size}
            loops[f"{name}_{part}"] = y
        both = loops[f"{name}_base"] + loops[f"{name}_layer"]
        sum_peak = dbfs(float(np.max(np.abs(both))))
        if sum_peak > -0.3:
            problems.append(f"music {name}: base + layer peaks at {sum_peak:.1f} dBFS")
        entries.append({"id": name, "bpm": S.bpm, "bars": S.bars, "beatsPerBar": 4, "loopSamples": S.n,
                        "duration": round(S.n / SR, 6), "sumPeakDb": round(sum_peak, 2), **files})
        print(f"  {name:9s} {S.bpm:5.1f} BPM  {S.bars} bars  {S.n} samples  base+layer peak {sum_peak:5.1f} dBFS  ({time.time() - t0:.1f} s)")
    return entries, loops


# ----------------------------------------------------------------------------- outputs

def print_table(rows: list[dict]) -> None:
    print()
    srows = [r for r in rows if r["kind"] == "sfx"]
    if srows:
        print(f"{'file':22s} {'sec':>7s} {'peak':>6s} {'rms':>6s} {'loud':>6s} {'want':>6s} {'dc':>8s} {'clip':>4s} {'cent':>6s} {'>6k':>5s} {'kB':>7s}")
    for r in srows:
        print(f"{'sfx/' + r['name']:22s} {r['dur']:7.3f} {r['peak']:6.1f} {r['rms']:6.1f} {r['loud']:6.1f} {r['want']:6.1f} {r['dc']:8.5f} "
              f"{r['clipped']:4d} {r['centroid']:6.0f} {r['hf'] * 100:4.1f}% {r['size'] / 1024:7.1f}")
    if srows:
        print("  loud = loudest 20 ms after phone-speaker weighting (dBFS); want = its target; a gap means the peak cap won")
    mrows = [r for r in rows if r["kind"] == "music"]
    if mrows:
        print()
        print(f"{'loop':22s} {'sec':>7s} {'peak':>6s} {'rms':>6s} {'dc':>8s} {'clip':>4s} {'cent':>6s} {'>6k':>5s} {'kB':>7s} "
              f"{'steady':>7s} {'leak':>7s} {'step':>5s} {'slope':>5s} {'lpc':>5s} {'st99.9':>6s} {'sl99.9':>6s} {'lp99.9':>6s}")
        for r in mrows:
            print(f"{'music/' + r['name']:22s} {r['dur']:7.3f} {r['peak']:6.1f} {r['rms']:6.1f} {r['dc']:8.5f} {r['clipped']:4d} "
                  f"{r['centroid']:6.0f} {r['hf'] * 100:4.1f}% {r['size'] / 1024:7.1f} {r['steady']:7.1f} {r['leak']:7.1f} "
                  f"{r['step']:5.2f} {r['slope']:5.2f} {r['lpc']:5.2f} {r['step999']:6.2f} {r['slope999']:6.2f} {r['lpc999']:6.2f}")
        print()
        print("columns: peak/rms in dBFS; cent = spectral centroid (Hz); >6k = share of energy above 6 kHz")
        print(f"  steady = max |folded loop - middle of a 3x render| re peak, dB   (must be <= {STEADY_MAX_DB:.0f})")
        print(f"  leak   = level at the end of the render tail re peak, dB          (must be <= {LEAK_MAX_DB:.0f})")
        print(f"  step/slope/lpc = wrap discontinuity (first diff, second diff, order-{LPC_ORDER} prediction error)")
        print(f"                   divided by the largest value inside the loop     (must be <= {SEAM_RATIO_MAX:.1f})")
        print("  *99.9  = the same three divided by the 99.9th percentile inside the loop (information only:")
        print("           a loop that starts on a drum hit legitimately has an onset at the wrap)")


def write_manifest(sfx_entries: list[dict], music_entries: list[dict], total: int) -> None:
    manifest = {
        "version": 1,
        "generator": "scripts/audio/build_audio.py",
        "format": "wav/pcm_s16le/mono",
        "sampleRate": SR,
        "minigameBpm": music.MINIGAME_BPM,
        "totalBytes": total,
        "sfx": sfx_entries,
        "music": music_entries,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")

    lines = [
        "// GENERATED by scripts/audio/build_audio.py. Do not edit: run `python scripts/audio/build_audio.py`.",
        'import type { SfxId } from "@/platform/feedback";',
        "",
        f"export const AUDIO_SAMPLE_RATE = {SR};",
        "/** Tempo of the `minigame` scene. Its loop starts on a downbeat and is exactly 8 bars long. */",
        f"export const MINIGAME_BPM = {music.MINIGAME_BPM};",
        "",
        "export const SFX_SOURCES: Record<SfxId, number> = {",
    ]
    lines += [f'  {e["id"]}: require("../../assets/audio/{e["file"]}"),' for e in sfx_entries]
    lines += ["};", "", "export const SFX_DURATION_MS: Record<SfxId, number> = {"]
    lines += [f'  {e["id"]}: {int(round(e["duration"] * 1000))},' for e in sfx_entries]
    lines += ["};", "", "export const MUSIC_SCENE_IDS = [" + ", ".join(f'"{e["id"]}"' for e in music_entries) + "] as const;",
              "export type MusicSceneId = (typeof MUSIC_SCENE_IDS)[number];", "",
              "export interface MusicSceneDef {", "  base: number;", "  /** Intensity layer, same length as base. */",
              "  layer: number | null;", "  bpm: number;", "  bars: number;", "  beatsPerBar: number;",
              "  loopSamples: number;", "  durationSec: number;", "}", "",
              "export const MUSIC_SCENES: Record<MusicSceneId, MusicSceneDef> = {"]
    for e in music_entries:
        lines += [f'  {e["id"]}: {{',
                  f'    base: require("../../assets/audio/{e["base"]["file"]}"),',
                  f'    layer: require("../../assets/audio/{e["layer"]["file"]}"),',
                  f'    bpm: {e["bpm"]:g},', f'    bars: {e["bars"]},', f'    beatsPerBar: {e["beatsPerBar"]},',
                  f'    loopSamples: {e["loopSamples"]},', f'    durationSec: {e["duration"]:g},', "  },"]
    lines += ["};", ""]
    TS_OUT.parent.mkdir(parents=True, exist_ok=True)
    TS_OUT.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def write_medley(ids: list[str], loops: dict) -> Path:
    SCRATCH.mkdir(parents=True, exist_ok=True)
    gap = np.zeros(n_of(0.3))
    parts = []
    for sfx_id in ids:
        path = OUT / "sfx" / f"{sfx_id}.wav"
        if path.exists():
            parts += [read_wav(path)[0], gap]
    for name in music.SCENES:
        if f"{name}_base" not in loops:
            continue
        base, layer = loops[f"{name}_base"], loops[f"{name}_layer"]
        # base alone, then across the loop seam with the layer faded in over two bars
        ramp = np.minimum(np.arange(len(base)) / (len(base) / 4.0), 1.0)
        section = np.concatenate([base, base + layer * ramp, base + layer])
        parts += [np.zeros(n_of(0.8)), fade(section * 0.8, 0.02, 1.5)]
    path = SCRATCH / "medley.wav"
    write_wav(path, np.concatenate(parts) if parts else np.zeros(1))
    return path


def write_preview(sfx_entries: list[dict], music_entries: list[dict]) -> None:
    data = json.dumps({"sfx": [e["id"] for e in sfx_entries],
                       "music": [{"id": e["id"], "bpm": e["bpm"], "sec": e["duration"]} for e in music_entries]})
    html = """<!doctype html>
<!-- GENERATED by scripts/audio/build_audio.py. Serve the repo root (python -m http.server 8765) and open
     http://localhost:8765/scripts/audio/preview.html : the loop buttons use Web Audio buffers, which
     loop sample-accurately and keep base and layer locked, exactly what the seam check measures. -->
<meta charset="utf-8"><title>Duct Tape Odyssey audio preview</title>
<style>
body{font:14px/1.4 system-ui,sans-serif;background:#16181c;color:#e6e2d6;margin:24px;max-width:900px}
button{font:inherit;margin:3px;padding:6px 10px;background:#2a2e36;color:inherit;border:1px solid #4a505c;border-radius:6px;cursor:pointer}
button.on{background:#c8642a;border-color:#e8894f}
h2{margin-top:28px;font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:#9aa3b2}
input[type=range]{width:260px;vertical-align:middle}
</style>
<h1>Audio preview</h1>
<h2>Sound effects</h2><div id="sfx"></div>
<h2>Music (gapless, base + intensity layer)</h2>
<p>Intensity <input id="int" type="range" min="0" max="1" step="0.01" value="0"> <button id="stop">stop</button></p>
<div id="music"></div>
<script>
const DATA = __DATA__;
const base = "../../assets/audio/";
let ctx, cur = null;
const cache = new Map();
function ac(){ return ctx || (ctx = new (window.AudioContext || window.webkitAudioContext)()); }
async function load(url){
  if (!cache.has(url)) cache.set(url, fetch(url).then(r => r.arrayBuffer()).then(b => ac().decodeAudioData(b)));
  return cache.get(url);
}
async function shot(id){
  const src = ac().createBufferSource(); src.buffer = await load(base + "sfx/" + id + ".wav");
  src.connect(ac().destination); src.start();
}
function stop(){
  if (!cur) return;
  const t = ac().currentTime;
  cur.gains.forEach(g => g.gain.setTargetAtTime(0, t, 0.25));
  const old = cur; setTimeout(() => old.srcs.forEach(s => s.stop()), 1500);
  cur = null; document.querySelectorAll("#music button").forEach(b => b.classList.remove("on"));
}
async function scene(id, btn){
  stop();
  const [b, l] = await Promise.all([load(base + "music/" + id + "_base.wav"), load(base + "music/" + id + "_layer.wav")]);
  const when = ac().currentTime + 0.05, srcs = [], gains = [];
  [b, l].forEach((buf, i) => {
    const s = ac().createBufferSource(), g = ac().createGain();
    s.buffer = buf; s.loop = true; g.gain.value = i === 0 ? 0.7 : 0.7 * document.getElementById("int").value;
    s.connect(g).connect(ac().destination); s.start(when); srcs.push(s); gains.push(g);
  });
  cur = { srcs, gains }; btn.classList.add("on");
}
document.getElementById("int").oninput = e => { if (cur) cur.gains[1].gain.setTargetAtTime(0.7 * e.target.value, ac().currentTime, 0.1); };
document.getElementById("stop").onclick = stop;
for (const id of DATA.sfx){ const b = document.createElement("button"); b.textContent = id; b.onclick = () => shot(id); document.getElementById("sfx").append(b); }
for (const m of DATA.music){ const b = document.createElement("button"); b.textContent = m.id + " (" + m.bpm + " BPM, " + m.sec.toFixed(1) + " s)"; b.onclick = () => scene(m.id, b); document.getElementById("music").append(b); }
</script>
""".replace("__DATA__", data)
    (HERE / "preview.html").write_text(html, encoding="utf-8", newline="\n")


def total_bytes() -> int:
    return sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file() and p.name != "manifest.json")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", choices=["sfx", "music"], help="rebuild one half (manifest needs a full build first)")
    ap.add_argument("--no-medley", action="store_true")
    ap.add_argument("--quiet", action="store_true", help="skip the per-file table")
    args = ap.parse_args(argv)

    t0 = time.time()
    rows: list[dict] = []
    problems: list[str] = []
    ids = read_sfx_ids()
    prior = json.loads((OUT / "manifest.json").read_text(encoding="utf-8")) if (OUT / "manifest.json").exists() else {}
    sfx_entries, music_entries, loops = prior.get("sfx", []), prior.get("music", []), {}

    if args.only != "music":
        print(f"sfx: {len(ids)} ids from {FEEDBACK_TS.relative_to(ROOT).as_posix()}")
        sfx_entries = build_sfx(ids, rows, problems)
    if args.only != "sfx":
        print("music:")
        music_entries, loops = build_music(rows, problems)

    have = {e["id"] for e in sfx_entries}
    for sfx_id in ids:
        if sfx_id not in have or not (OUT / "sfx" / f"{sfx_id}.wav").exists():
            problems.append(f"sfx {sfx_id}: no file or manifest entry")
    if {e["id"] for e in music_entries} != set(music.SCENES):
        problems.append("music: manifest does not cover every scene (run a full build)")

    total = total_bytes()
    write_manifest(sfx_entries, music_entries, total)
    write_preview(sfx_entries, music_entries)
    if not args.quiet:
        print_table(rows)
    if not args.no_medley:
        print(f"\nmedley: {write_medley(ids, loops).relative_to(ROOT).as_posix()}")

    sfx_bytes = sum(e["bytes"] for e in sfx_entries)
    music_bytes = sum(e[p]["bytes"] for e in music_entries for p in ("base", "layer"))
    print(f"\nsfx   {len(sfx_entries):3d} files {sfx_bytes / 1048576:6.2f} MB")
    print(f"music {len(music_entries) * 2:3d} files {music_bytes / 1048576:6.2f} MB")
    print(f"total assets/audio  {total / 1048576:6.2f} MB (budget {BUDGET_BYTES / 1048576:.0f} MB)   minigame BPM {music.MINIGAME_BPM}   {time.time() - t0:.0f} s")
    if total >= BUDGET_BYTES:
        problems.append(f"assets/audio is {total / 1048576:.2f} MB, over the {BUDGET_BYTES / 1048576:.0f} MB budget")

    if problems:
        print(f"\nFAILED: {len(problems)} problem(s)")
        for p in problems:
            print("  - " + p)
        return 1
    print("\nOK: every SFX id has a file and a manifest entry, all loops pass the seam checks")
    return 0


if __name__ == "__main__":
    sys.exit(main())

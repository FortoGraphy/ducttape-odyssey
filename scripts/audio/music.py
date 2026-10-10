"""Procedural soundtrack: six scenes, each a base loop plus an intensity layer of identical length.

Key plan (so cross-fades between scenes never clash): everything lives on the white keys.
  drift     D dorian     72 BPM   lonely main theme, descending bass D C B A
  work      F lydian/C   105 BPM  light groove
  wonder    F lydian     90 BPM   bells and wide pads
  station   C major      100 BPM  swung ii-V-I, a bit jazzy
  minigame  A minor      120 BPM  four on the floor, fixed tempo for the rhythm game
  tension   D phrygian   108 BPM  same tonic as drift, darkened (Eb, Ab)

Seamless loops: every voice is written into a buffer that is one loop plus a tail long. All
effects are linear and time-invariant (or periodic gains), so folding the tail back onto the
start gives exactly the steady state of an endlessly repeating loop. build_audio.py proves that
by rendering three repetitions and comparing the middle one against the folded loop.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from synth import (NYQ_GUARD, SR, TAU, adsr, bp, circ_filt, colored, db, delay, duck_curve, fade, filt, fm, glide,
                   hp, lp, lp_gain, mtof, n_of, osc, partials, perc, reverb, rng_of, sat, sine, swell, tsec, white)

MINIGAME_BPM = 120


# ----------------------------------------------------------------------------- scene container

class Scene:
    def __init__(self, name: str, bpm: float, bars: int, tail: float, reps: int = 1):
        self.name, self.bpm, self.bars, self.reps = name, bpm, bars, reps
        self.spb = 60.0 / bpm * SR  # samples per beat
        n = bars * 4 * self.spb
        assert abs(n - round(n)) < 1e-6, f"{name}: loop is not a whole number of samples"
        self.n = int(round(n))
        self.tail = n_of(tail)
        assert self.tail <= self.n, f"{name}: tail longer than loop"
        self.single = self.n + self.tail
        self.total = self.n * reps + self.tail
        self.buses: dict[str, np.ndarray] = {}
        self.truncated = 0

    def beat_s(self, beats: float) -> float:
        return beats * 60.0 / self.bpm

    def put(self, bus: str, sig: np.ndarray, beat: float, gain: float = 1.0) -> None:
        buf = self.buses.setdefault(bus, np.zeros(self.single, dtype=np.float64))
        pos = int(round(beat * self.spb))
        m = min(len(sig), self.single - pos)
        if m < len(sig):
            self.truncated += 1
        buf[pos:pos + m] += gain * sig[:m]

    def out(self, bus: str, rms_db: float | None = None, peak_db: float | None = None) -> np.ndarray:
        """Bus scaled to a level (measured on one repetition) and expanded to the render length."""
        x = self.buses[bus]
        g = 1.0
        if rms_db is not None:
            g = db(rms_db) / (np.sqrt(np.sum(x * x) / self.n) + 1e-12)
        elif peak_db is not None:
            g = db(peak_db) / (np.max(np.abs(x)) + 1e-12)
        y = np.zeros(self.total, dtype=np.float64)
        for r in range(self.reps):
            y[r * self.n:r * self.n + self.single] += x * g
        return y

    def periodic(self, curve: np.ndarray) -> np.ndarray:
        assert len(curve) == self.n
        return np.resize(curve, self.total)

    def fold(self, x: np.ndarray) -> np.ndarray:
        if self.reps == 1:
            y = x[:self.n].copy()
            y[:self.tail] += x[self.n:self.n + self.tail]
            return y
        mid = self.reps // 2
        return x[mid * self.n:(mid + 1) * self.n].copy()

    def tail_leak_db(self, x: np.ndarray) -> float:
        """Level of the very end of the tail relative to the peak: must be silence, or the fold would truncate."""
        end = x[self.single - n_of(0.02):self.single] if self.reps == 1 else x[-n_of(0.02):]
        return 20.0 * np.log10((np.max(np.abs(end)) + 1e-12) / (np.max(np.abs(x)) + 1e-12))


@dataclass
class Rendered:
    scene: Scene
    base: np.ndarray  # pre-fold, length scene.total
    layer: np.ndarray
    target_rms_db: float  # loudness target for the base, measured above 200 Hz (see build_audio.master)
    base_bed: np.ndarray | None = None  # circular, length scene.n, added after the fold
    notes: dict = field(default_factory=dict)


# ----------------------------------------------------------------------------- instruments

_MEMO: dict[tuple, np.ndarray] = {}


def memo(fn):
    """Voices are pure functions of their arguments, and the verification render repeats every
    call, so cache them. Callers never mutate the returned buffers."""
    def wrapped(*args, **kwargs):
        key = (fn.__name__, repr(args), repr(sorted(kwargs.items())))
        if key not in _MEMO:
            _MEMO[key] = fn(*args, **kwargs)
        return _MEMO[key]
    wrapped.__name__ = fn.__name__
    return wrapped


def clear_memo() -> None:
    _MEMO.clear()


def _ph(f: float) -> float:
    return (f * 0.6180339887) % 1.0  # deterministic but uncorrelated start phases


@memo
def v_pad(notes, dur, fc=1100.0, q=0.9, attack=1.4, release=2.2, detune=0.0035, shape="saw", breathe=0.35):
    n = n_of(dur + release)
    t = tsec(n)
    cut = fc * (1.0 - 0.5 * breathe + breathe * np.sin(np.pi * np.clip(t / dur, 0.0, 1.0)))
    top = min(NYQ_GUARD, 3.2 * fc * (1.0 + breathe))
    out = np.zeros(n)
    for m in notes:
        f = float(mtof(m))
        for sgn in (-1.0, 1.0):
            ff = f * (1.0 + sgn * detune)
            out += osc(shape, ff, n, start=_ph(ff), top=max(top, ff * 1.5), hgain=lambda fk: lp_gain(fk, cut, q, 4))
    return out * swell(n, attack, release) / (2 * len(notes)) ** 0.7


@memo
def v_pluck(m, dur, shape="saw", fc0=3800.0, fc1=350.0, fdec=0.07, q=1.4, decay=0.22, attack=0.003, duty=0.5, vel=1.0):
    f = float(mtof(m))
    n = n_of(dur)
    t = tsec(n)
    cut = fc1 + (fc0 * (0.5 + 0.5 * vel) - fc1) * np.exp(-t / fdec)
    x = osc(shape, f, n, start=_ph(f), duty=duty, top=min(NYQ_GUARD, max(fc0 * 2.5, f * 3.0)),
            hgain=lambda fk: lp_gain(fk, cut, q, 4))
    return fade(x * perc(n, attack, decay) * vel, 0.0005, min(0.03, dur / 3.0))


@memo
def v_bass(m, dur, fc0=1300.0, fc1=420.0, fdec=0.09, q=1.1, decay=0.3, sus=0.35, sub=0.55, drive=1.6, vel=1.0):
    f = float(mtof(m))
    n = n_of(dur)
    t = tsec(n)
    cut = fc1 + (fc0 - fc1) * np.exp(-t / fdec)
    x = osc("saw", f, n, start=0.0, top=min(NYQ_GUARD, fc0 * 3.0), hgain=lambda fk: lp_gain(fk, cut, q, 4))
    x = 0.8 * x + sub * sine(f, n)
    return fade(sat(x * adsr(n, 0.004, decay, sus, min(0.05, dur / 3.0)) * vel, drive), 0.0005, 0.01)


@memo
def v_sub(m, dur, attack=0.05, release=0.3, harm=0.3):
    f = float(mtof(m))
    n = n_of(dur + release)
    x = sine(f, n) + harm * sine(2 * f, n) + 0.5 * harm * sine(3 * f, n) + 0.25 * harm * sine(4 * f, n)
    return sat(x * swell(n, attack, release), 1.3)


@memo
def v_bell(m, dur, bright=1.0, decay=1.2, ratio=4.0, vel=1.0):
    f = float(mtof(m))
    n = n_of(dur)
    t = tsec(n)
    peak_idx = 2.2 * bright + 0.25
    room = max(0.0, NYQ_GUARD / (f * ratio) - 1.0)  # keep FM sidebands under Nyquist
    scale = min(1.0, room / peak_idx)
    idx = scale * bright * (2.2 * np.exp(-t / (decay * 0.18)) + 0.25)
    x = fm(f, n, ratio, idx) + 0.25 * sine(f * 2.0, n) * np.exp(-t / (decay * 0.4))
    return fade(x * perc(n, 0.002, decay) * vel, 0.0005, min(0.05, dur / 3.0))


@memo
def v_vibes(m, dur, vel=1.0, decay=0.9):
    """Vibraphone-ish: mellow FM bar with a slow tremolo that starts with the note."""
    f = float(mtof(m))
    n = n_of(dur)
    t = tsec(n)
    idx = min(1.0, max(0.0, NYQ_GUARD / (f * 4.0) - 1.0)) * (0.9 * np.exp(-t / 0.05) + 0.12)
    x = fm(f, n, 4.0, idx) + 0.2 * sine(f * 3.0, n) * np.exp(-t / 0.15)
    trem = 1.0 - 0.18 * (0.5 - 0.5 * np.cos(TAU * 5.2 * t))
    return fade(x * trem * perc(n, 0.003, decay) * vel, 0.0005, min(0.06, dur / 3.0))


@memo
def v_ep(m, dur, vel=0.8, decay=1.0):
    """Electric piano: FM 1:1 with a bark that softens, plus a short tine."""
    f = float(mtof(m))
    n = n_of(dur)
    t = tsec(n)
    idx = vel * (2.6 * np.exp(-t / 0.12) + 0.9 * np.exp(-t / 0.7))
    x = fm(f, n, 1.0, idx)
    tine = sine(min(f * 5.0, 5200.0), n) * np.exp(-t / 0.035) * 0.14 * vel
    return fade((x + tine) * perc(n, 0.003, decay) * vel, 0.0005, min(0.08, dur / 3.0))


@memo
def v_lead(m, dur, duty=0.3, fc=2600.0, vib_rate=5.2, vib_depth=0.006, vib_delay=0.2, attack=0.012, release=0.09,
           glide_from=None, vel=1.0):
    f = float(mtof(m))
    n = n_of(dur + release)
    t = tsec(n)
    fr = f * (1.0 + vib_depth * np.sin(TAU * vib_rate * t) * np.clip((t - vib_delay) / 0.25, 0.0, 1.0))
    if glide_from is not None:
        fr = fr * (1.0 + (float(mtof(glide_from)) / f - 1.0) * np.exp(-t / 0.035))
    x = osc("pulse", fr, n, start=_ph(f), duty=duty, top=min(NYQ_GUARD, fc * 3.0),
            hgain=lambda fk: lp_gain(fk, fc, 0.9, 4))
    env = np.minimum(t / attack, 1.0) * (0.75 + 0.25 * np.exp(-t / 0.25))
    rn = n_of(release)
    env[n - rn:] *= 0.5 * (1.0 + np.cos(np.linspace(0.0, np.pi, rn)))
    return fade(x * env * vel, 0.0005, 0.005)


@memo
def v_chip(m, dur, duty=0.25, decay=0.09, fc=4500.0, vel=1.0):
    f = float(mtof(m))
    n = n_of(dur)
    x = osc("pulse", f, n, start=_ph(f), duty=duty, top=min(NYQ_GUARD, fc * 2.5), hgain=lambda fk: lp_gain(fk, fc, 0.7, 2))
    return fade(x * perc(n, 0.002, decay) * vel, 0.0005, min(0.012, dur / 3.0))


@memo
def d_kick(f0=115.0, f1=44.0, pdec=0.03, decay=0.2, click=0.25, drive=1.8, dur=0.45):
    n = n_of(dur)
    t = tsec(n)
    body = sine(f1 + (f0 - f1) * np.exp(-t / pdec), n) * np.exp(-t / decay)
    clk = click * hp(white(rng_of("kick"), n), 1800.0) * np.exp(-t / 0.004)
    return fade(sat(body + clk, drive), 0.0003, 0.03)


@memo
def d_snare(seed=0, tone=190.0, decay=0.12, dur=0.32, body=0.5):
    rng = rng_of("snare", seed)
    n = n_of(dur)
    t = tsec(n)
    nz = (bp(white(rng, n), 2800.0, 0.6) + 0.5 * hp(white(rng, n), 5000.0)) * np.exp(-t / decay)
    tn = sine(glide(n, tone * 1.5, tone, 0.02), n) * np.exp(-t / 0.07) * body
    return fade(sat(nz + tn, 1.5), 0.0003, 0.03)


@memo
def d_hat(seed=0, decay=0.028, fc=7500.0, dur=0.12):
    n = n_of(dur)
    return fade(hp(white(rng_of("hat", seed), n), fc, order=2) * np.exp(-tsec(n) / decay), 0.0003, 0.01)


@memo
def d_rim(seed=0):
    n = n_of(0.09)
    t = tsec(n)
    x = bp(white(rng_of("rim", seed), n), 1750.0, 3.0) * np.exp(-t / 0.012) * 2.0 + 0.5 * sine(820.0, n) * np.exp(-t / 0.02)
    return fade(x, 0.0003, 0.01)


@memo
def d_shaker(seed=0, decay=0.035):
    n = n_of(0.11)
    t = tsec(n)
    env = (1.0 - np.exp(-t / 0.008)) * np.exp(-t / decay)
    return fade(bp(white(rng_of("shaker", seed), n), 6000.0, 0.8) * env, 0.001, 0.01)


@memo
def d_tom(f0=110.0, dur=0.42, decay=0.16):
    n = n_of(dur)
    t = tsec(n)
    x = sine(glide(n, f0 * 1.6, f0, 0.04), n) * np.exp(-t / decay)
    x += 0.12 * lp(white(rng_of("tom"), n), 900.0) * np.exp(-t / 0.02)
    return fade(sat(x, 1.4), 0.0003, 0.03)


@memo
def d_clap(seed=0):
    rng = rng_of("clap", seed)
    n = n_of(0.3)
    t = tsec(n)
    env = np.zeros(n)
    for off in (0.0, 0.009, 0.019):
        env += np.where(t >= off, np.exp(-(t - off) / 0.006), 0.0) * 0.6
    env += np.where(t >= 0.028, np.exp(-(t - 0.028) / 0.07), 0.0)
    return fade(bp(white(rng, n), 1500.0, 1.0) * env, 0.0003, 0.03)


@memo
def d_brush(seed=0):
    n = n_of(0.22)
    t = tsec(n)
    env = (1.0 - np.exp(-t / 0.02)) * np.exp(-t / 0.06)
    return fade(bp(white(rng_of("brush", seed), n), 4500.0, 0.5) * env, 0.002, 0.03)


@memo
def d_ride(seed=0, decay=0.22):
    rng = rng_of("ride", seed)
    n = n_of(0.6)
    t = tsec(n)
    ping = partials([3120.0, 4370.0, 5830.0, 7410.0, 8950.0], [1.0, 0.8, 0.6, 0.4, 0.3], [decay, decay * 0.8, decay * 0.6, decay * 0.5, decay * 0.4], n)
    wash = hp(white(rng, n), 6000.0) * np.exp(-t / (decay * 0.7)) * 0.5
    return fade((ping * 0.25 + wash) * (1.0 - np.exp(-t / 0.001)), 0.0003, 0.05)


def noise_bed(name: str, n: int, lo: float, hi: float, lfo_cycles: int, depth: float = 0.6) -> np.ndarray:
    """Loop-periodic filtered noise with a slow swell (wind, air). Unit RMS."""
    x = colored(rng_of(name), n, 0.5)
    x = circ_filt(circ_filt(x, "hp", lo), "lp", hi)
    lfo = 1.0 - depth * (0.5 + 0.5 * np.cos(TAU * lfo_cycles * np.arange(n) / n))
    x *= lfo
    return x / (np.sqrt(np.mean(x * x)) + 1e-12)


# ----------------------------------------------------------------------------- scenes

def scene_drift(reps=1) -> Rendered:
    S = Scene("drift", 72, 8, tail=11.0, reps=reps)
    two_bars = S.beat_s(8)
    prog = [(38, [53, 57, 60, 64]),  # Dm9
            (36, [52, 55, 59, 64]),  # Cmaj7
            (35, [50, 55, 59, 62]),  # G/B
            (33, [52, 55, 60, 64])]  # Am7
    for i, (root, notes) in enumerate(prog):
        b = i * 8
        S.put("pad", v_pad(notes, two_bars - 0.4, fc=1300.0, attack=1.8, release=2.8), b)
        S.put("bass", v_sub(root + 12, two_bars - 1.0, attack=0.5, release=1.6, harm=0.55), b)
        S.put("bass", v_sub(root, two_bars - 1.0, attack=0.8, release=1.6, harm=0.2), b, 0.35)
        S.put("bass", v_pluck(root + 12, 3.0, fc0=1300.0, fc1=320.0, fdec=0.25, decay=1.1, q=0.9), b, 0.6)
    melody = [(1, 76, .9), (6.5, 74, .6), (7.5, 69, .7), (9, 79, .8), (14, 76, .7), (16.5, 74, .7), (18, 71, .8),
              (23, 74, .6), (25, 72, .8), (27, 76, .6), (30, 69, .8)]
    for beat, m, vel in melody:
        S.put("bell", v_bell(m, 3.2, bright=0.7, decay=1.5, vel=vel), beat)
    for beat in (0, 16):  # sonar ping on the common tone E
        S.put("ping", sine(float(mtof(88)), n_of(0.5)) * perc(n_of(0.5), 0.004, 0.09), beat)

    pad = S.out("pad", rms_db=-21.0)
    bass = S.out("bass", rms_db=-26.0)
    bell = delay(S.out("bell", rms_db=-25.5), S.beat_s(0.75), feedback=0.45, damp=3200.0, mix=0.5)
    ping = delay(S.out("ping", peak_db=-17.0), S.beat_s(1.5), feedback=0.5, damp=2600.0, mix=0.6)
    base = pad + bass + bell + ping
    base += reverb(pad * 0.5 + bell + ping, mix=0.5, dur=3.2, dark=1200.0, seed=11, wet_only=True)

    # layer: slow arpeggio, a soft heartbeat and a brushed backbeat
    pattern = [0, 1, 2, 3, 2, 1, 2, 3]
    for i, (root, notes) in enumerate(prog):
        for bar in range(2):
            for e in range(8):
                beat = i * 8 + bar * 4 + e * 0.5
                vel = 0.95 if e % 4 == 0 else 0.6
                S.put("arp", v_pluck(notes[pattern[e]] + 12, 0.7, fc0=2300.0, fc1=500.0, decay=0.32, vel=vel), beat)
    kick = d_kick(f0=120.0, f1=58.0, decay=0.22, click=0.08, drive=1.2)
    hat, shaker = d_hat(1, decay=0.02, fc=6500.0), d_shaker(1)
    for bar in range(8):
        S.put("kick", kick, bar * 4)
        S.put("kick", kick, bar * 4 + 2.5, 0.7)
        S.put("perc", hat, bar * 4 + 1, 0.6)
        S.put("perc", hat, bar * 4 + 3, 0.8)
        S.put("perc", shaker, bar * 4 + 3.5, 0.5)
    arp = delay(S.out("arp", rms_db=-25.0), S.beat_s(0.75), feedback=0.4, damp=3000.0, mix=0.4)
    layer = arp + S.out("kick", peak_db=-15.0) + S.out("perc", peak_db=-20.0)
    layer += reverb(arp, mix=0.3, dur=3.2, dark=1200.0, seed=11, wet_only=True)

    bed = noise_bed("drift-wind", S.n, 300.0, 2400.0, lfo_cycles=2, depth=0.7) * db(-45.0)
    return Rendered(S, base, layer, target_rms_db=-23.0, base_bed=bed)


def scene_work(reps=1) -> Rendered:
    S = Scene("work", 105, 8, tail=5.0, reps=reps)
    prog = [(41, [57, 60, 64, 67]),  # Fmaj9
            (45, [57, 60, 64, 67]),  # Am7
            (38, [57, 60, 64, 65]),  # Dm9
            (43, [57, 60, 62, 65])]  # G9sus
    kick = d_kick(f0=150.0, f1=52.0, decay=0.15, click=0.35)
    rim = d_rim()
    hats = [d_hat(s, decay=0.022) for s in range(3)]
    ohat = d_hat(5, decay=0.14, dur=0.4)
    kick_steps = []
    for bar in range(8):
        root, notes = prog[bar // 2]
        odd = bar % 2 == 1
        b0 = bar * 4
        for st in ([0, 7, 8] if odd else [0, 8]):
            S.put("kick", kick, b0 + st / 4, 0.75 if st == 7 else 1.0)
            kick_steps.append(int(round((b0 + st / 4) * S.spb)))
        S.put("rim", rim, b0 + 1)
        S.put("rim", rim, b0 + 3)
        for e in range(8):
            S.put("hat", hats[e % 3], b0 + e * 0.5, 0.95 if e % 2 else 0.5)
        if bar == 7:
            S.put("hat", ohat, b0 + 3.5, 0.8)
        line = {0: 0, 3: 0, 6: 12, 8: 0, 11: 7, 12: 12, 14: 7} if odd else {0: 0, 3: 0, 6: 12, 8: 0, 10: 7, 14: 10}
        for st, iv in line.items():
            S.put("bass", v_bass(root + iv, 0.24 if st % 4 else 0.3, fc0=1700.0, fc1=650.0, decay=0.16, sus=0.2, sub=0.3,
                                 vel=1.0 if st % 4 == 0 else 0.8), b0 + st / 4)
        for st, length in (((6, 0.45),) if odd else ((3, 0.25), (10, 0.6))):
            for m in notes:
                S.put("keys", v_ep(m, length + 0.25, vel=0.75, decay=0.5), b0 + st / 4)
    hook = [(2, 72, .3), (2.5, 76, .3), (3, 81, .9), (10, 76, .3), (10.5, 79, .3), (11.5, 76, .7), (18, 77, .3),
            (18.5, 76, .3), (19, 72, .9), (26, 74, .3), (26.5, 79, .8), (30, 77, .4), (31, 74, .7)]
    for beat, m, length in hook:
        S.put("hook", v_pluck(m, length + 0.35, shape="pulse", duty=0.3, fc0=4200.0, fc1=900.0, fdec=0.12, decay=0.28), beat)

    duck = S.periodic(duck_curve(S.n, kick_steps, depth=0.35, release=0.12))
    keys = S.out("keys", rms_db=-22.0)
    hookb = delay(S.out("hook", rms_db=-24.0), S.beat_s(0.75), feedback=0.35, damp=3200.0, mix=0.4)
    base = (S.out("kick", peak_db=-10.0) + S.out("rim", peak_db=-14.0) + S.out("hat", peak_db=-14.5)
            + S.out("bass", rms_db=-25.0) * duck + keys * duck + hookb)
    base += reverb(keys + hookb + S.out("rim", peak_db=-14.0) * 0.5, mix=0.22, dur=1.4, seed=21, wet_only=True)

    # layer: sixteenth arpeggio, shaker, clap and a busier kick
    order = [0, 2, 1, 3]
    shaker = d_shaker(2)
    clap = d_clap()
    for bar in range(8):
        _, notes = prog[bar // 2]
        b0 = bar * 4
        for st in range(16):
            vel = 0.9 if st % 4 == 0 else (0.7 if st % 2 == 0 else 0.5)
            S.put("arp", v_chip(notes[order[st % 4]] + 12, 0.14, duty=0.25, decay=0.06, vel=vel), b0 + st / 4)
            S.put("shaker", shaker, b0 + st / 4, 0.9 if st % 4 == 2 else 0.5)
        if bar % 2 == 1:
            S.put("clap", clap, b0 + 3)
            S.put("kick2", kick, b0 + 3.5, 0.7)
    arp = delay(S.out("arp", rms_db=-28.0), S.beat_s(0.75), feedback=0.3, damp=3500.0, mix=0.35)
    layer = arp + S.out("shaker", peak_db=-21.0) + S.out("clap", peak_db=-14.0) + S.out("kick2", peak_db=-14.0)
    layer += reverb(arp + S.out("clap", peak_db=-14.0), mix=0.2, dur=1.4, seed=21, wet_only=True)
    return Rendered(S, base, layer, target_rms_db=-21.5)


def scene_tension(reps=1) -> Rendered:
    S = Scene("tension", 108, 6, tail=6.0, reps=reps)
    two_bars = S.beat_s(8)
    drones = [[50, 57, 62], [50, 58, 63, 67], [50, 56, 62, 65]]  # D5, Eb/D, D diminished colour
    for i, notes in enumerate(drones):
        S.put("drone", v_pad(notes, two_bars - 0.3, fc=700.0, q=1.3, attack=0.9, release=1.6, detune=0.006, breathe=0.6), i * 8)
        S.put("drone", v_sub(38, two_bars - 0.6, attack=0.6, release=1.2, harm=0.3), i * 8, 0.25)
    kick = d_kick(f0=110.0, f1=50.0, decay=0.18, click=0.12, drive=1.3)
    tick = d_rim(1)
    tock = lp(d_rim(2), 1400.0)
    hat = d_hat(4, decay=0.012, fc=6000.0)
    kick_steps = []
    for bar in range(6):
        b0 = bar * 4
        for e in range(8):
            m = 62 if e in (2, 6) else 50
            if bar == 5 and e >= 4:
                m = 51 if e % 2 else 50  # Eb neighbour note: the screw tightens before the loop restarts
            S.put("pulse", v_bass(m, 0.2, fc0=1500.0, fc1=520.0, decay=0.12, sus=0.15, sub=0.3, vel=1.0 if e % 2 == 0 else 0.7), b0 + e * 0.5)
        for beat in (0, 0.5, 2, 2.5):  # heartbeat
            S.put("kick", kick, b0 + beat, 1.0 if beat in (0, 2) else 0.7)
            kick_steps.append(int(round((b0 + beat) * S.spb)))
        for beat in range(4):  # clock
            S.put("clock", tick if beat % 2 == 0 else tock, b0 + beat, 1.0 if beat % 2 == 0 else 0.8)
        for e in range(8):
            S.put("tick", hat, b0 + e * 0.5, 1.0 if e % 2 == 0 else 0.55)
    for beat in (6, 18):  # minor second alarm call
        S.put("call", v_lead(75, 0.22, duty=0.5, fc=2200.0, vib_depth=0.0), beat)
        S.put("call", v_lead(74, 0.5, duty=0.5, fc=2200.0, vib_depth=0.004, glide_from=75), beat + 0.5)
    eerie = (sine(float(mtof(81)), n_of(5.0)) + sine(float(mtof(82)), n_of(5.0))) * swell(n_of(5.0), 2.2, 2.6)
    S.put("eerie", eerie, 9)

    duck = S.periodic(duck_curve(S.n, kick_steps, depth=0.3, release=0.14))
    call = delay(S.out("call", rms_db=-26.0), S.beat_s(1.5), feedback=0.45, damp=2200.0, mix=0.6)
    eer = S.out("eerie", peak_db=-24.0)
    base = (S.out("drone", rms_db=-23.0) * duck + S.out("pulse", rms_db=-24.0) + S.out("kick", peak_db=-12.0)
            + S.out("clock", peak_db=-16.0) + S.out("tick", peak_db=-22.0) + call + eer)
    base += reverb(call + eer + S.out("clock", peak_db=-16.0) * 0.7, mix=0.4, dur=2.2, dark=1000.0, seed=31, wet_only=True)

    # layer: driving sixteenths, backbeat, tom fall and a riser into the loop point
    snare = d_snare(1, tone=170.0, decay=0.14)
    for bar in range(6):
        b0 = bar * 4
        for st in range(16):
            if st % 2 == 1 or st % 8 == 4:
                S.put("drive", v_bass(62, 0.11, fc0=1700.0, fc1=500.0, decay=0.07, sus=0.1, sub=0.2, vel=0.9 if st % 4 == 3 else 0.6), b0 + st / 4)
        S.put("snare", snare, b0 + 1)
        S.put("snare", snare, b0 + 3)
    for k, f0 in enumerate((150.0, 130.0, 110.0, 95.0, 82.0, 70.0)):
        S.put("tom", d_tom(f0), 20 + 2 + k * 0.25 + (0.25 if k >= 4 else 0.0), 0.7 + 0.05 * k)
    rn = n_of(S.beat_s(8))
    riser = bp(white(rng_of("tension-riser"), rn), 2400.0, 0.7) * (tsec(rn) / tsec(rn)[-1]) ** 2.5
    S.put("riser", fade(riser, 0.01, 0.03), 16)
    sn = S.out("snare", peak_db=-12.0)
    layer = S.out("drive", rms_db=-26.0) + sn + S.out("tom", peak_db=-13.0) + S.out("riser", peak_db=-26.0)
    layer += reverb(sn + S.out("tom", peak_db=-13.0), mix=0.3, dur=2.2, dark=1000.0, seed=31, wet_only=True)
    return Rendered(S, base, layer, target_rms_db=-21.5)


def scene_wonder(reps=1) -> Rendered:
    S = Scene("wonder", 90, 8, tail=11.0, reps=reps)
    two_bars = S.beat_s(8)
    prog = [(41, [57, 60, 64, 71]),  # Fmaj7#11
            (40, [55, 60, 64, 72]),  # C/E
            (38, [57, 60, 65, 67]),  # Dm11
            (43, [57, 62, 67, 72])]  # Gsus(add9)
    for i, (root, notes) in enumerate(prog):
        S.put("pad", v_pad(notes, two_bars - 0.4, fc=1700.0, q=0.8, attack=1.5, release=2.6, detune=0.0045), i * 8)
        S.put("bass", v_sub(root + 12, two_bars - 0.8, attack=0.35, release=1.2, harm=0.35), i * 8)
    bells = [(0, 65), (1, 72), (2, 76), (3, 83), (4.5, 81), (6, 76),
             (8, 64), (9, 67), (10, 72), (11, 79), (12.5, 76), (14, 74),
             (16, 62), (17, 69), (18, 76), (19, 79), (20.5, 77), (22, 72),
             (24, 67), (25, 74), (26, 81), (27, 84), (28.5, 83), (30, 79)]
    for k, (beat, m) in enumerate(bells):
        S.put("bell", v_bell(m, 3.0, bright=0.7, decay=1.3, vel=0.9 if k % 6 == 0 else 0.7), beat)

    pad = S.out("pad", rms_db=-22.0)
    bell = delay(S.out("bell", rms_db=-25.0), S.beat_s(1.5), feedback=0.42, damp=3400.0, mix=0.45)
    base = pad + S.out("bass", rms_db=-24.0) + bell
    base += reverb(pad * 0.6 + bell, mix=0.55, dur=3.4, bright=6000.0, dark=1500.0, seed=41, wet_only=True)

    # layer: slow lead line, twinkles, a soft tom pulse
    lead = [(0, 76, 4), (4, 83, 2), (6, 81, 2), (8, 79, 4), (12, 76, 2), (14, 74, 2), (16, 77, 4), (20, 81, 2),
            (22, 79, 2), (24, 74, 2), (26, 81, 2), (28, 83, 3), (31, 79, 1)]
    prev = None
    for beat, m, beats in lead:
        S.put("lead", v_lead(m, S.beat_s(beats) - 0.08, duty=0.5, fc=1900.0, attack=0.06, release=0.25, glide_from=prev, vel=0.9), beat)
        prev = m
    twinkle_rng = rng_of("wonder-twinkle")
    penta = [84, 86, 88, 91, 93, 96]
    for bar in range(8):
        for st in sorted(twinkle_rng.choice(16, size=5, replace=False)):
            S.put("twinkle", v_chip(int(twinkle_rng.choice(penta)), 0.2, duty=0.5, decay=0.08, fc=6000.0, vel=float(twinkle_rng.uniform(0.5, 1.0))), bar * 4 + st / 4)
    tom = d_tom(73.0, dur=0.6, decay=0.22)
    for bar in range(0, 8, 2):
        S.put("tom", tom, bar * 4)
        S.put("tom", tom, bar * 4 + 3.5, 0.6)
    ld = delay(S.out("lead", rms_db=-25.0), S.beat_s(0.75), feedback=0.3, damp=2600.0, mix=0.3)
    tw = delay(S.out("twinkle", rms_db=-33.0), S.beat_s(0.75), feedback=0.5, damp=4500.0, mix=0.6)
    layer = ld + tw + S.out("tom", peak_db=-13.0)
    layer += reverb(ld + tw, mix=0.45, dur=3.4, bright=6000.0, dark=1500.0, seed=41, wet_only=True)

    bed = noise_bed("wonder-air", S.n, 1800.0, 6500.0, lfo_cycles=4, depth=0.85) * db(-50.0)
    return Rendered(S, base, layer, target_rms_db=-23.0, base_bed=bed)


def _swing(beat: float) -> float:
    whole = np.floor(beat)
    frac = beat - whole
    return float(whole + (2.0 / 3.0 if abs(frac - 0.5) < 1e-6 else frac))


def scene_station(reps=1) -> Rendered:
    S = Scene("station", 100, 8, tail=5.0, reps=reps)
    chords = [[53, 57, 60, 64],  # Dm9
              [53, 57, 59, 64],  # G13
              [52, 55, 59, 62],  # Cmaj9
              [55, 61, 65],      # A7b13
              [53, 57, 60, 64],  # Dm9
              [53, 57, 59, 64],  # G13
              [55, 59, 62, 64],  # Em7
              [55, 59, 61, 64]]  # A9
    walk = [[38, 41, 45, 44], [43, 47, 50, 49], [48, 52, 55, 46], [45, 49, 52, 51],
            [50, 48, 45, 44], [43, 45, 47, 50], [52, 50, 47, 46], [45, 40, 43, 49]]
    ride, ride_soft = d_ride(0), d_ride(1, decay=0.14)
    brush = d_brush()
    kick = d_kick(f0=120.0, f1=56.0, decay=0.12, click=0.08, drive=1.1)
    for bar in range(8):
        b0 = bar * 4
        for q, m in enumerate(walk[bar]):
            S.put("bass", v_bass(m, 0.56, fc0=1200.0, fc1=520.0, fdec=0.12, decay=0.4, sus=0.3, sub=0.4, drive=1.3,
                                 vel=1.0 if q % 2 == 0 else 0.88), b0 + q)
        comp = [(0, 0.9, 0.8), (1.5, 0.45, 0.65)] + ([(3.5, 0.4, 0.55)] if bar % 2 == 1 else [])
        for beat, length, vel in comp:
            for m in chords[bar]:
                S.put("keys", v_ep(m, length + 0.3, vel=vel, decay=0.7), b0 + _swing(beat))
        for beat, vel in ((0, .7), (1, 1.0), (1.5, .55), (2, .7), (3, 1.0), (3.5, .55)):
            S.put("ride", ride if vel > 0.6 else ride_soft, b0 + _swing(beat), vel)
        S.put("brush", brush, b0 + 1)
        S.put("brush", brush, b0 + 3)
        S.put("kick", kick, b0)
        S.put("kick", kick, b0 + 2, 0.7)

    keys = S.out("keys", rms_db=-21.0)
    base = (S.out("bass", rms_db=-26.5) + keys + S.out("ride", peak_db=-20.0) + S.out("brush", peak_db=-16.0)
            + S.out("kick", peak_db=-16.0))
    base += reverb(keys + S.out("brush", peak_db=-16.0), mix=0.25, dur=1.6, dark=1600.0, seed=51, wet_only=True)

    # layer: vibraphone line and a warm guide-tone pad
    tune = [(0.5, 69, .5), (1, 72, 1), (2, 76, 1.6), (4, 74, 1.4), (5.5, 71, .5), (6, 69, 1.6),
            (8.5, 67, .5), (9, 71, 1), (10, 74, 1.4), (11.5, 76, .6), (12, 73, 2.2), (14.5, 70, .5), (15, 69, 1),
            (17, 77, .5), (17.5, 76, .5), (18, 74, 1), (19, 69, 1), (20.5, 71, .5), (21, 74, 1.4), (22.5, 76, 1.2),
            (24, 79, 1.8), (26, 76, 1), (27, 74, 1), (28, 73, 1.4), (29.5, 76, .5), (30, 69, 1.8)]
    for beat, m, beats in tune:
        S.put("vibes", v_vibes(m, S.beat_s(beats) + 0.5, vel=0.9, decay=0.8), _swing(beat))
    for bar in range(8):
        guide = chords[bar][1:3] if len(chords[bar]) > 3 else chords[bar][:2]
        S.put("warm", v_pad([m + 12 for m in guide], S.beat_s(4) - 0.2, fc=900.0, attack=0.5, release=0.9, shape="tri", breathe=0.2), bar * 4)
    vib = S.out("vibes", rms_db=-24.0)
    layer = vib + S.out("warm", rms_db=-31.0)
    layer += reverb(vib, mix=0.3, dur=1.6, dark=1600.0, seed=51, wet_only=True)
    return Rendered(S, base, layer, target_rms_db=-22.0)


def scene_minigame(reps=1) -> Rendered:
    S = Scene("minigame", MINIGAME_BPM, 8, tail=4.0, reps=reps)
    roots = [45, 45, 41, 43, 45, 48, 41, 43]
    stabs = {45: [57, 60, 64], 41: [57, 60, 65], 43: [55, 59, 62], 48: [55, 60, 64]}
    kick = d_kick(f0=170.0, f1=58.0, decay=0.11, click=0.45, drive=2.0)
    snare = d_snare(0)
    hats = [d_hat(s, decay=0.024) for s in range(2)]
    ohat = d_hat(7, decay=0.15, dur=0.4)
    kick_steps = []
    for bar in range(8):
        b0 = bar * 4
        root = roots[bar]
        for beat in range(4):
            S.put("kick", kick, b0 + beat)
            kick_steps.append(int(round((b0 + beat) * S.spb)))
            S.put("hat", hats[beat % 2], b0 + beat + 0.5)
            if beat % 2 == 1:
                S.put("snare", snare, b0 + beat)
            for st, iv in ((2, 12), (3, 0)):
                S.put("bass", v_bass(root + iv, 0.115, fc0=1900.0, fc1=650.0, decay=0.08, sus=0.25, sub=0.3, vel=1.0 if st == 2 else 0.8), b0 + beat + st / 4)
        if bar in (3, 7):
            S.put("hat", ohat, b0 + 3.5, 0.9)
        if bar == 7:
            S.put("snare", snare, b0 + 3.5, 0.6)
            S.put("snare", snare, b0 + 3.75, 0.8)
        for st in (3, 6, 11, 14):
            for m in stabs[root]:
                S.put("stab", v_chip(m, 0.2, duty=0.5, decay=0.09, fc=3000.0), b0 + st / 4)
    riff_a = [(0, 76, .5), (0.75, 76, .25), (1.5, 79, .5), (2.5, 76, .5), (3.5, 74, .5)]
    riff = {0: riff_a, 1: [(0, 72, 1), (1.5, 69, .5), (2.5, 72, .5), (3, 74, .75)],
            2: [(0, 77, .5), (0.75, 77, .25), (1.5, 81, .5), (2.5, 77, .5), (3.5, 76, .5)],
            3: [(0, 74, 1), (1.5, 71, .5), (2.5, 74, .5), (3, 79, .75)],
            4: riff_a, 5: [(0, 79, 1), (1.5, 76, .5), (2.5, 72, .5), (3, 76, .75)],
            6: [(0, 77, .5), (0.75, 77, .25), (1.5, 81, .5), (2.5, 77, .5), (3.5, 76, .5)],
            7: [(0, 74, .5), (1, 79, .5), (2, 83, 1.25)]}
    for bar, notes in riff.items():
        for beat, m, beats in notes:
            S.put("riff", v_lead(m, S.beat_s(beats) - 0.05, duty=0.25, fc=3200.0, attack=0.006, release=0.05, vib_delay=0.15), bar * 4 + beat)

    duck = S.periodic(duck_curve(S.n, kick_steps, depth=0.5, release=0.11))
    riffb = delay(S.out("riff", rms_db=-22.0), S.beat_s(0.75), feedback=0.25, damp=3000.0, mix=0.3)
    sn = S.out("snare", peak_db=-10.0)
    base = (S.out("kick", peak_db=-9.5) + sn + S.out("hat", peak_db=-15.0) + S.out("bass", rms_db=-24.0) * duck
            + S.out("stab", rms_db=-24.5) * duck + riffb)
    base += reverb(sn * 0.6 + riffb + S.out("stab", rms_db=-24.5), mix=0.18, dur=1.1, seed=61, wet_only=True)

    # layer: sixteenth arpeggio, sixteenth hats, a harmony a third above the riff, claps
    order = [0, 1, 2, 1]
    hat16 = d_hat(3, decay=0.014)
    clap = d_clap(1)
    for bar in range(8):
        b0 = bar * 4
        notes = stabs[roots[bar]]
        for st in range(16):
            S.put("arp", v_chip(notes[order[st % 4]] + (24 if st % 8 >= 4 else 12), 0.12, duty=0.125, decay=0.05, vel=0.9 if st % 4 == 0 else 0.6), b0 + st / 4)
            if st % 2 == 1:
                S.put("hat16", hat16, b0 + st / 4, 0.8 if st % 4 == 3 else 0.5)
        S.put("clap", clap, b0 + 1)
        S.put("clap", clap, b0 + 3)
    scale = [69, 71, 72, 74, 76, 77, 79, 81, 83, 84, 86, 88]
    for bar, notes in riff.items():
        for beat, m, beats in notes:
            if beats >= 0.5:
                third = scale[min(len(scale) - 1, scale.index(m) + 2)]
                S.put("harm", v_lead(third, S.beat_s(beats) - 0.05, duty=0.5, fc=2400.0, attack=0.01, release=0.05, vib_delay=0.15), bar * 4 + beat)
    arp = S.out("arp", rms_db=-26.0) * duck
    harm = delay(S.out("harm", rms_db=-26.0), S.beat_s(0.75), feedback=0.25, damp=3000.0, mix=0.3)
    cl = S.out("clap", peak_db=-12.0)
    layer = arp + harm + S.out("hat16", peak_db=-20.0) + cl
    layer += reverb(arp + harm + cl, mix=0.2, dur=1.1, seed=61, wet_only=True)
    return Rendered(S, base, layer, target_rms_db=-20.5, notes={"bpm": MINIGAME_BPM})


SCENES = {
    "drift": scene_drift,
    "work": scene_work,
    "tension": scene_tension,
    "wonder": scene_wonder,
    "station": scene_station,
    "minigame": scene_minigame,
}


def master_eq(x: np.ndarray) -> np.ndarray:
    """Linear part of the master chain (runs before the fold): rumble filter and lo-fi top end."""
    y = hp(x, 38.0)
    y = filt(y, "highshelf", 5500.0, 0.7071, -1.0)
    return lp(y, 9000.0, 0.6)

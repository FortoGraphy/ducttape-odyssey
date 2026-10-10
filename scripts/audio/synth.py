"""Small numpy-only synth toolkit used by build_audio.py.

Everything is offline and vectorised: oscillators are additive (exactly band-limited, and a
"filter" can be applied per harmonic, which gives analog style filter sweeps without a per-sample
loop), static filters are biquads evaluated in the frequency domain, and time-varying filters are
a cross-faded bank of static ones.
"""
from __future__ import annotations

import struct
import zlib

import numpy as np

SR = 22050
TAU = 2.0 * np.pi
NYQ_GUARD = 0.46 * SR  # nothing is synthesised above this


# ----------------------------------------------------------------------------- basics

def n_of(seconds: float) -> int:
    return max(1, int(round(seconds * SR)))


def mtof(m) -> np.ndarray | float:
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=np.float64) - 69.0) / 12.0)


def db(x: float) -> float:
    return 10.0 ** (x / 20.0)


def seed_of(name: str, salt: int = 0) -> int:
    return (zlib.crc32(name.encode("utf-8")) + salt * 7919) & 0x7FFFFFFF


def rng_of(name: str, salt: int = 0) -> np.random.Generator:
    return np.random.default_rng(seed_of(name, salt))


def tsec(n: int) -> np.ndarray:
    return np.arange(n, dtype=np.float64) / SR


def phase(freq, n: int, start: float = 0.0) -> np.ndarray:
    """Phase in cycles for a constant or per-sample frequency."""
    if np.isscalar(freq):
        return start + float(freq) * np.arange(n, dtype=np.float64) / SR
    f = np.asarray(freq, dtype=np.float64)
    ph = np.empty(n, dtype=np.float64)
    ph[0] = 0.0
    np.cumsum(f[:-1], out=ph[1:])
    ph[1:] /= SR
    return start + ph


def sine(freq, n: int, start: float = 0.0) -> np.ndarray:
    return np.sin(TAU * phase(freq, n, start))


# ----------------------------------------------------------------------------- envelopes

def seg(n: int, points, curve: str = "lin") -> np.ndarray:
    """Piecewise envelope through (seconds, value) points. curve="exp" interpolates in log space."""
    ts = np.array([p[0] for p in points], dtype=np.float64) * SR
    vs = np.array([p[1] for p in points], dtype=np.float64)
    x = np.arange(n, dtype=np.float64)
    if curve == "exp":
        return np.exp(np.interp(x, ts, np.log(np.maximum(vs, 1e-9))))
    return np.interp(x, ts, vs)


def glide(n: int, v0: float, v1: float, tau: float | None = None) -> np.ndarray:
    """Exponential move from v0 to v1. With tau it settles like an RC circuit, else it is a
    straight line in log space across the whole length."""
    if tau is None:
        return v0 * (v1 / v0) ** (np.arange(n, dtype=np.float64) / max(1, n - 1))
    return v1 + (v0 - v1) * np.exp(-tsec(n) / tau)


def perc(n: int, attack: float = 0.002, decay: float = 0.15) -> np.ndarray:
    t = tsec(n)
    a = 1.0 - np.exp(-t / max(attack, 1e-5)) if attack > 0 else 1.0
    return a * np.exp(-t / decay)


def adsr(n: int, a: float, d: float, s: float, r: float) -> np.ndarray:
    """Linear attack, exponential decay to the sustain level, cosine release over the last r seconds."""
    t = tsec(n)
    env = np.where(t < a, t / max(a, 1e-6), s + (1.0 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    rn = min(n, n_of(r))
    env[n - rn:] *= 0.5 * (1.0 + np.cos(np.linspace(0.0, np.pi, rn)))
    return env


def swell(n: int, attack: float, release: float) -> np.ndarray:
    """Raised-cosine fade in and out, flat in the middle (pads)."""
    env = np.ones(n, dtype=np.float64)
    an = min(n, n_of(attack))
    rn = min(n, n_of(release))
    env[:an] *= 0.5 * (1.0 - np.cos(np.linspace(0.0, np.pi, an)))
    env[n - rn:] *= 0.5 * (1.0 + np.cos(np.linspace(0.0, np.pi, rn)))
    return env


def fade(x: np.ndarray, fin: float = 0.001, fout: float = 0.010) -> np.ndarray:
    y = x.copy()
    a = min(len(y) // 2, n_of(fin))
    b = min(len(y) // 2, n_of(fout))
    if a > 1:
        y[:a] *= np.linspace(0.0, 1.0, a)
    if b > 1:
        y[-b:] *= 0.5 * (1.0 + np.cos(np.linspace(0.0, np.pi, b)))
    y[0] = 0.0
    y[-1] = 0.0
    return y


# ----------------------------------------------------------------------------- oscillators

def lp_gain(f, fc, q: float = 0.707, poles: int = 4):
    """Magnitude of a resonant low-pass at frequency f. Used as a per-harmonic gain."""
    r = np.asarray(f, dtype=np.float64) / fc
    r2 = r * r
    g = 1.0 / np.sqrt((1.0 - r2) ** 2 + r2 / (q * q))
    if poles >= 4:
        g = g / np.sqrt(1.0 + r2 * r2)
    return g


def osc(shape: str, freq, n: int, start: float = 0.0, duty: float = 0.5, top: float | None = None,
        hgain=None, max_harm: int = 400) -> np.ndarray:
    """Band-limited saw / square / tri / pulse built from harmonics.

    freq may be an array (sweeps): each harmonic is tapered out as it approaches `top`, so nothing
    ever aliases. hgain(f_harmonic) returns a scalar or per-sample gain, which is how filter
    envelopes are applied.
    """
    top = min(NYQ_GUARD, top if top is not None else NYQ_GUARD)
    scalar = np.isscalar(freq)
    f = float(freq) if scalar else np.asarray(freq, dtype=np.float64)
    fmin = f if scalar else float(np.min(f))
    fmin = max(fmin, 8.0)
    kmax = int(min(max_harm, np.floor(top / fmin)))
    ph = TAU * phase(f, n, start)
    out = np.zeros(n, dtype=np.float64)
    if shape == "sine":
        return np.sin(ph)
    odd_only = shape in ("square", "tri")
    for k in range(1, kmax + 1):
        if odd_only and k % 2 == 0:
            continue
        if shape == "saw":
            amp, off = (2.0 / np.pi) / k * (1.0 if k % 2 else -1.0), 0.0
        elif shape == "square":
            amp, off = (4.0 / np.pi) / k, 0.0
        elif shape == "tri":
            amp, off = (8.0 / np.pi ** 2) / (k * k) * (1.0 if (k // 2) % 2 == 0 else -1.0), 0.0
        elif shape == "pulse":
            amp = (4.0 / np.pi) / k * np.sin(np.pi * k * duty)
            off = np.pi / 2.0 - np.pi * k * duty  # cos(kx - pi k d)
            if abs(amp) < 1e-6:
                continue
        else:
            raise ValueError(shape)
        fk = f * k
        g = amp
        if hgain is not None:
            g = g * hgain(fk)
        if not scalar:
            # smooth roll-off just below the ceiling instead of a hard on/off per harmonic
            g = g * np.clip((top - fk) / (0.12 * top), 0.0, 1.0)
        out += g * np.sin(k * ph + off)
    return out


def fm(freq, n: int, ratio: float, index, start: float = 0.0) -> np.ndarray:
    """Two-operator FM (sine carrier, sine modulator). index may be an envelope."""
    ph = TAU * phase(freq, n, start)
    return np.sin(ph + index * np.sin(ratio * ph))


def partials(freqs, amps, decays, n: int, start_phase: float = 0.0) -> np.ndarray:
    """Sum of decaying sines (metal, bells, gongs)."""
    t = tsec(n)
    out = np.zeros(n, dtype=np.float64)
    for f, a, d in zip(freqs, amps, decays):
        if f < NYQ_GUARD:
            out += a * np.sin(TAU * f * t + start_phase) * np.exp(-t / d)
    return out


# ----------------------------------------------------------------------------- noise

def white(rng: np.random.Generator, n: int) -> np.ndarray:
    return rng.uniform(-1.0, 1.0, n)


def colored(rng: np.random.Generator, n: int, exponent: float) -> np.ndarray:
    """Noise with a 1/f^exponent amplitude spectrum (0.5 pink, 1.0 brown). Circular by construction."""
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1.0 / SR)
    f[0] = f[1] if n > 1 else 1.0
    spec *= (f / 100.0) ** (-exponent)
    spec[f < 20.0] = 0.0
    y = np.fft.irfft(spec, n)
    return y / (np.max(np.abs(y)) + 1e-12)


# ----------------------------------------------------------------------------- filters

def _fft_len(n: int) -> int:
    return 1 << int(np.ceil(np.log2(max(2, n))))


def _rbj(kind: str, fc: float, q: float, gain_db: float):
    fc = float(min(max(fc, 10.0), 0.49 * SR))
    w0 = TAU * fc / SR
    cw, sw = np.cos(w0), np.sin(w0)
    alpha = sw / (2.0 * q)
    a_lin = 10.0 ** (gain_db / 40.0)
    if kind == "lp":
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "hp":
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "bp":  # constant 0 dB peak gain
        b = [alpha, 0.0, -alpha]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "peak":
        b = [1 + alpha * a_lin, -2 * cw, 1 - alpha * a_lin]
        a = [1 + alpha / a_lin, -2 * cw, 1 - alpha / a_lin]
    elif kind == "lowshelf":
        s = 2 * np.sqrt(a_lin) * alpha
        b = [a_lin * ((a_lin + 1) - (a_lin - 1) * cw + s), 2 * a_lin * ((a_lin - 1) - (a_lin + 1) * cw),
             a_lin * ((a_lin + 1) - (a_lin - 1) * cw - s)]
        a = [(a_lin + 1) + (a_lin - 1) * cw + s, -2 * ((a_lin - 1) + (a_lin + 1) * cw),
             (a_lin + 1) + (a_lin - 1) * cw - s]
    elif kind == "highshelf":
        s = 2 * np.sqrt(a_lin) * alpha
        b = [a_lin * ((a_lin + 1) + (a_lin - 1) * cw + s), -2 * a_lin * ((a_lin - 1) + (a_lin + 1) * cw),
             a_lin * ((a_lin + 1) + (a_lin - 1) * cw - s)]
        a = [(a_lin + 1) - (a_lin - 1) * cw + s, 2 * ((a_lin - 1) - (a_lin + 1) * cw),
             (a_lin + 1) - (a_lin - 1) * cw - s]
    else:
        raise ValueError(kind)
    return np.array(b) / a[0], np.array(a) / a[0]


def _response(kind: str, fc: float, q: float, gain_db: float, order: int, nfft: int) -> np.ndarray:
    z = np.exp(-1j * TAU * np.arange(nfft // 2 + 1) / nfft)
    if kind == "lp1":  # one pole
        p = np.exp(-TAU * min(fc, 0.49 * SR) / SR)
        h = (1.0 - p) / (1.0 - p * z)
    else:
        b, a = _rbj(kind, fc, q, gain_db)
        h = (b[0] + b[1] * z + b[2] * z * z) / (1.0 + a[1] * z + a[2] * z * z)
    return h ** order if order != 1 else h


def _pad_for(fc: float, q: float) -> int:
    # impulse response time constant of a biquad is about q / (pi fc); keep ten of them
    return int(min(2 * SR, 10.0 * SR * max(q, 0.5) / (np.pi * max(fc, 15.0)) + 128))


def filt(x: np.ndarray, kind: str, fc: float, q: float = 0.7071, gain_db: float = 0.0, order: int = 1) -> np.ndarray:
    """Causal IIR response applied through the FFT. Output has the input's length, so leave
    silence at the end of x if the ringing matters."""
    n = len(x)
    nfft = _fft_len(n + _pad_for(fc, q))
    spec = np.fft.rfft(x, nfft) * _response(kind, fc, q, gain_db, order, nfft)
    return np.fft.irfft(spec, nfft)[:n]


def lp(x, fc, q=0.7071, order=1):
    return filt(x, "lp", fc, q, order=order)


def hp(x, fc, q=0.7071, order=1):
    return filt(x, "hp", fc, q, order=order)


def bp(x, fc, q=1.0, order=1):
    return filt(x, "bp", fc, q, order=order)


def lp1(x, fc):
    return filt(x, "lp1", fc)


def peak(x, fc, gain_db, q=1.0):
    return filt(x, "peak", fc, q, gain_db)


def shelf(x, kind, fc, gain_db):
    return filt(x, kind, fc, 0.7071, gain_db)


def circ_filt(x: np.ndarray, kind: str, fc: float, q: float = 0.7071, order: int = 1) -> np.ndarray:
    """Circular (periodic) version of filt for loop-length noise beds: no padding, exact wrap."""
    n = len(x)
    z = np.exp(-1j * TAU * np.arange(n // 2 + 1) / n)
    if kind == "lp1":
        p = np.exp(-TAU * fc / SR)
        h = (1.0 - p) / (1.0 - p * z)
    else:
        b, a = _rbj(kind, fc, q, 0.0)
        h = (b[0] + b[1] * z + b[2] * z * z) / (1.0 + a[1] * z + a[2] * z * z)
    return np.fft.irfft(np.fft.rfft(x) * h ** order, n)


def sweep(x: np.ndarray, kind: str, fc_env: np.ndarray, q: float = 0.7071, order: int = 1, steps: int = 14) -> np.ndarray:
    """Time-varying filter: a log-spaced bank of static filters, cross-faded by the cutoff envelope."""
    n = len(x)
    fc_env = np.clip(np.asarray(fc_env, dtype=np.float64), 20.0, 0.48 * SR)
    lo, hi = float(fc_env.min()), float(fc_env.max())
    if hi / lo < 1.03:
        return filt(x, kind, np.sqrt(lo * hi), q, order=order)
    nfft = _fft_len(n + _pad_for(lo, q))
    spec = np.fft.rfft(x, nfft)
    pos = np.log(fc_env / lo) / np.log(hi / lo) * (steps - 1)
    i0 = np.clip(np.floor(pos).astype(np.int64), 0, steps - 2)
    frac = pos - i0
    out = np.zeros(n, dtype=np.float64)
    for i, fc in enumerate(np.geomspace(lo, hi, steps)):
        w = np.where(i0 == i, 1.0 - frac, 0.0) + np.where(i0 == i - 1, frac, 0.0)
        if not w.any():
            continue
        out += w * np.fft.irfft(spec * _response(kind, float(fc), q, 0.0, order, nfft), nfft)[:n]
    return out


# ----------------------------------------------------------------------------- effects

def delay(x: np.ndarray, time_s: float, feedback: float = 0.4, damp: float = 3000.0, wet_only: bool = False,
          mix: float = 0.3) -> np.ndarray:
    """Feedback delay with a low-pass in the loop (each repeat is darker). Same length as x."""
    d = max(1, int(round(time_s * SR)))
    n = len(x)
    wet = np.zeros(n, dtype=np.float64)
    cur = x
    k = 1
    g = 1.0
    while k * d < n and g > 2e-3:
        cur = lp1(cur, damp)
        g *= feedback if k > 1 else 1.0
        wet[k * d:] += g * cur[: n - k * d]
        k += 1
    return wet * mix if wet_only else x + wet * mix


def make_ir(dur: float = 2.2, predelay: float = 0.012, bright: float = 5200.0, dark: float = 1400.0,
            seed: int = 7) -> np.ndarray:
    """Synthetic room: two noise bands with different decay times plus a few early reflections."""
    rng = np.random.default_rng(seed)
    n = n_of(dur)
    t = tsec(n)
    hi = lp(rng.standard_normal(n), bright) * np.exp(-t / (dur * 0.085))
    lo = lp(rng.standard_normal(n), dark) * np.exp(-t / (dur * 0.17))
    ir = 0.7 * hi + lo
    ir *= 1.0 - np.exp(-t / 0.006)  # diffuse build-up instead of a slap
    for _ in range(7):
        at = int(rng.uniform(0.004, 0.045) * SR)
        ir[at] += rng.choice([-1.0, 1.0]) * rng.uniform(0.6, 1.4) * np.max(np.abs(ir))
    ir = hp(ir, 180.0)
    ir *= swell(n, 0.0005, dur * 0.25)
    ir = np.concatenate([np.zeros(n_of(predelay)), ir])
    return ir / np.sqrt(np.sum(ir * ir))


def convolve(x: np.ndarray, ir: np.ndarray) -> np.ndarray:
    """FFT convolution truncated to len(x)."""
    n = len(x)
    nfft = _fft_len(n + len(ir))
    return np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(ir, nfft), nfft)[:n]


_IR_CACHE: dict[tuple, np.ndarray] = {}


def reverb(x: np.ndarray, mix: float = 0.25, dur: float = 1.2, bright: float = 5200.0, dark: float = 1400.0,
           seed: int = 7, wet_only: bool = False) -> np.ndarray:
    key = (dur, bright, dark, seed)
    if key not in _IR_CACHE:
        _IR_CACHE[key] = make_ir(dur, bright=bright, dark=dark, seed=seed)
    wet = convolve(x, _IR_CACHE[key])
    return wet * mix if wet_only else x + wet * mix


def sat(x: np.ndarray, drive: float = 1.5) -> np.ndarray:
    """tanh soft clip, unity gain for small signals."""
    return np.tanh(x * drive) / drive


def crush(x: np.ndarray, bits: float = 8.0, hold: int = 1) -> np.ndarray:
    """Bit depth and sample rate reduction (the aliasing is the point)."""
    y = x
    if hold > 1:
        idx = (np.arange(len(x)) // hold) * hold
        y = x[idx]
    levels = 2.0 ** (bits - 1.0)
    return np.round(y * levels) / levels


def duck_curve(n: int, triggers, depth: float = 0.5, release: float = 0.18, attack: float = 0.004) -> np.ndarray:
    """Periodic gain curve (length n, wraps) that dips at each trigger sample: sidechain-style pumping."""
    trig = np.zeros(n, dtype=np.float64)
    for p in triggers:
        trig[int(p) % n] = 1.0
    k = np.arange(n, dtype=np.float64) / SR
    shape = (1.0 - np.exp(-k / attack)) * np.exp(-k / release)
    shape /= shape.max()
    # circular convolution so a hit near the loop end keeps ducking after the wrap
    dip = np.fft.irfft(np.fft.rfft(trig) * np.fft.rfft(shape), n)
    return 1.0 - depth * np.clip(dip, 0.0, 1.0)


def mix(*parts, length: float | None = None) -> np.ndarray:
    """mix((start_seconds, signal[, gain]), ...) -> one buffer."""
    end = 0
    placed = []
    for p in parts:
        start, sig = int(round(p[0] * SR)), p[1]
        g = p[2] if len(p) > 2 else 1.0
        placed.append((start, sig, g))
        end = max(end, start + len(sig))
    if length is not None:
        end = n_of(length)
    out = np.zeros(end, dtype=np.float64)
    for start, sig, g in placed:
        m = min(len(sig), end - start)
        if m > 0:
            out[start:start + m] += g * sig[:m]
    return out


def normalize(x: np.ndarray, peak_db: float) -> np.ndarray:
    p = float(np.max(np.abs(x)))
    return x if p < 1e-9 else x * (db(peak_db) / p)


# ----------------------------------------------------------------------------- io

def to_pcm16(x: np.ndarray) -> np.ndarray:
    return np.clip(np.round(x * 32767.0), -32768, 32767).astype("<i2")


def write_wav(path, x: np.ndarray, sr: int = SR) -> int:
    pcm = to_pcm16(x)
    data = pcm.tobytes()
    header = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE" + b"fmt " + struct.pack(
        "<IHHIIHH", 16, 1, 1, sr, sr * 2, 2, 16) + b"data" + struct.pack("<I", len(data))
    with open(path, "wb") as fh:
        fh.write(header)
        fh.write(data)
    return len(header) + len(data)


def read_wav(path) -> tuple[np.ndarray, int]:
    """Minimal reader for the files this toolkit writes (PCM16 mono)."""
    with open(path, "rb") as fh:
        raw = fh.read()
    assert raw[:4] == b"RIFF" and raw[8:12] == b"WAVE", path
    pos = 12
    sr = SR
    while pos < len(raw):
        tag, size = raw[pos:pos + 4], struct.unpack("<I", raw[pos + 4:pos + 8])[0]
        if tag == b"fmt ":
            fmt, ch, sr = struct.unpack("<HHI", raw[pos + 8:pos + 16])
            assert fmt == 1 and ch == 1, (path, fmt, ch)
        elif tag == b"data":
            return np.frombuffer(raw[pos + 8:pos + 8 + size], dtype="<i2").astype(np.float64) / 32767.0, sr
        pos += 8 + size + (size & 1)
    raise ValueError(f"no data chunk in {path}")

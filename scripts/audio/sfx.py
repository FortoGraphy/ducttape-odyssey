"""One sound per id in SFX_IDS (src/platform/feedback.ts).

Palette: rubber keys, encoder detents, LCD blips, relays and ratchets, analog lasers, arcs, valves.
Each function returns a float buffer at synth.SR; build_audio.py trims, fades, removes DC and
normalises it to the peak level listed in SFX.
"""
from __future__ import annotations

import numpy as np

from synth import (NYQ_GUARD, SR, TAU, adsr, bp, colored, crush, delay, fade, fm, glide, hp, lp, lp_gain, mix, mtof, n_of, osc,
                   partials, perc, reverb, sat, seg, sine, sweep, swell, tsec, white)


# ----------------------------------------------------------------------------- building blocks

def thump(f0, f1, dur, pdec=0.02, decay=0.05):
    n = n_of(dur)
    t = tsec(n)
    return sine(f1 + (f0 - f1) * np.exp(-t / pdec), n) * np.exp(-t / decay)


def click(r, dur, fc, q=1.5, decay=0.004):
    n = n_of(dur)
    return bp(white(r, n), fc, q) * np.exp(-tsec(n) / decay) * (1.0 + q)


def blip(f, dur, shape="pulse", duty=0.5, fc=4500.0, attack=0.002, release=0.008):
    """LCD style beep: band-limited pulse with a rounded edge."""
    n = n_of(dur)
    x = osc(shape, f, n, duty=duty, top=fc * 2.5, hgain=lambda fk: lp_gain(fk, fc, 0.7, 2))
    env = np.minimum(tsec(n) / attack, 1.0)
    rn = min(n, n_of(release))
    env[n - rn:] *= np.linspace(1.0, 0.0, rn)
    return x * env


def bell(f, dur, decay=0.25, ratio=4.0, index=1.6):
    n = n_of(dur)
    t = tsec(n)
    room = max(0.0, NYQ_GUARD / (f * ratio) - 1.0)
    idx = min(1.0, room / (index + 0.2)) * (index * np.exp(-t / (decay * 0.3)) + 0.2)
    return fm(f, n, ratio, idx) * perc(n, 0.0015, decay)


def chunk(r, pitch=1.0, weight=1.0):
    """One mechanical latch: low thud, plastic click, a little metal."""
    body = thump(190.0 * pitch, 78.0 * pitch, 0.16, pdec=0.02, decay=0.05) * weight
    tick = click(r, 0.05, 1400.0 * pitch, 1.5, 0.010) * 0.7
    metal = partials([820.0 * pitch, 1370.0 * pitch, 2210.0 * pitch], [0.4, 0.3, 0.18], [0.03, 0.025, 0.015], n_of(0.12))
    return mix((0, body), (0, tick), (0.001, metal))


def ching(f=2637.0, dur=0.3, decay=0.14):
    return partials([f, f * 1.498, f * 2.0, f * 2.76], [1.0, 0.5, 0.3, 0.12], [decay, decay * 0.7, decay * 0.5, decay * 0.3], n_of(dur))


def arp(notes, step, note_dur, voice, hold_last=None):
    parts = []
    for i, m in enumerate(notes):
        d = hold_last if (hold_last and i == len(notes) - 1) else note_dur
        parts.append((i * step, voice(float(mtof(m)), d)))
    return mix(*parts)


def chip_note(duty=0.25, decay=0.12, fc=5000.0):
    return lambda f, d: blip(f, d, duty=duty, fc=fc) * np.exp(-tsec(n_of(d)) / decay)


# ----------------------------------------------------------------------------- interface

def keyDown(r):  # rubber dome bottoming out
    return mix((0, thump(520.0, 300.0, 0.05, pdec=0.010, decay=0.013)),
               (0, click(r, 0.012, 2600.0, 1.2, 0.0025), 0.5),
               (0.001, click(r, 0.03, 1100.0, 2.5, 0.006), 0.5))


def keyUp(r):
    return mix((0, thump(700.0, 480.0, 0.035, pdec=0.008, decay=0.008), 0.6),
               (0, click(r, 0.012, 3400.0, 1.5, 0.002), 0.45))


def knobTick(r):  # encoder detent
    n = n_of(0.03)
    return mix((0, click(r, 0.03, 3200.0, 3.0, 0.0018), 0.5),
               (0, sine(2100.0, n) * np.exp(-tsec(n) / 0.004), 0.5))


def toggle(r):  # click-clack with a metal lever
    a = mix((0, click(r, 0.02, 2200.0, 1.5, 0.003), 0.5), (0, thump(300.0, 180.0, 0.03, 0.006, 0.008), 0.7))
    b = mix((0, click(r, 0.03, 1500.0, 1.5, 0.004), 0.6),
            (0, partials([1850.0, 2730.0, 4120.0], [0.4, 0.3, 0.2], [0.016, 0.012, 0.008], n_of(0.07))),
            (0, thump(210.0, 120.0, 0.04, 0.008, 0.012)))
    return mix((0, a, 0.8), (0.045, b))


def tab(r):
    return mix((0, click(r, 0.01, 2800.0, 1.5, 0.002), 0.25),
               (0.002, blip(1175.0, 0.045, duty=0.5, fc=3500.0) * np.exp(-tsec(n_of(0.045)) / 0.03)))


def uiOpen(r):
    return mix((0, blip(659.0, 0.05, duty=0.5, fc=3200.0), 0.8), (0.055, blip(988.0, 0.085, duty=0.5, fc=3600.0) * np.exp(-tsec(n_of(0.085)) / 0.05)))


def uiClose(r):
    return mix((0, blip(988.0, 0.045, duty=0.5, fc=3600.0), 0.8), (0.05, blip(659.0, 0.08, duty=0.5, fc=3000.0) * np.exp(-tsec(n_of(0.08)) / 0.04)))


def choice(r):
    return mix((0, click(r, 0.01, 2400.0, 1.5, 0.002), 0.3),
               (0.001, blip(784.0, 0.05, shape="tri") * np.exp(-tsec(n_of(0.05)) / 0.03)),
               (0.03, blip(1175.0, 0.05, shape="tri") * np.exp(-tsec(n_of(0.05)) / 0.02), 0.7))


def deny(r):
    def burst():
        n = n_of(0.075)
        x = osc("square", 185.0, n, top=2600.0) + osc("square", 196.0, n, top=2600.0)
        return lp(x, 2400.0) * adsr(n, 0.003, 0.05, 0.8, 0.012)
    return mix((0, burst()), (0.115, burst(), 0.9))


def beepGood(r):
    return mix((0, blip(1319.0, 0.04, fc=5000.0), 0.8), (0.062, blip(1760.0, 0.075, fc=5500.0) * np.exp(-tsec(n_of(0.075)) / 0.05)))


def beepBad(r):
    return mix((0, blip(392.0, 0.075, duty=0.25, fc=2500.0)), (0.095, blip(330.0, 0.1, duty=0.25, fc=2200.0) * np.exp(-tsec(n_of(0.1)) / 0.07)))


def notify(r):
    x = mix((0, bell(1319.0, 0.4, decay=0.2, index=0.8)), (0.11, bell(1760.0, 0.4, decay=0.22, index=0.8), 0.9), length=0.55)
    return delay(x, 0.14, feedback=0.3, damp=3000.0, mix=0.25)


def alert(r):
    b = blip(932.0, 0.085, duty=0.25, fc=4000.0)
    return mix((0, b), (0.145, b), (0.29, b), length=0.42)


def alarm(r):  # two-tone klaxon, slightly drooping like a tired horn
    parts = []
    for i, f in enumerate((587.0, 440.0, 587.0, 440.0)):
        n = n_of(0.19)
        tone = osc("square", glide(n, f * 1.02, f * 0.985), n, top=3200.0) + 0.4 * osc("saw", f * 0.5, n, top=2000.0)
        parts.append((i * 0.195, tone * adsr(n, 0.006, 0.05, 0.85, 0.02)))
    return sat(lp(mix(*parts, length=0.8), 2800.0) * 1.4, 1.6)


def eventOpen(r):  # incoming transmission
    static = bp(white(r, n_of(0.07)), 2200.0, 0.8) * seg(n_of(0.07), [(0, 0), (0.005, 1), (0.05, 0.5), (0.07, 0)])
    tones = mix(*[(i * 0.05, blip(f, 0.045, fc=4500.0)) for i, f in enumerate((1047.0, 1319.0, 1568.0))])
    tail = bp(white(r, n_of(0.12)), 3000.0, 0.7) * np.exp(-tsec(n_of(0.12)) / 0.04)
    return mix((0, static, 0.5), (0.07, crush(tones, 5, 2)), (0.22, tail, 0.3))


def kippBlip(r):  # one syllable of the ship computer
    n = n_of(0.06)
    src = osc("pulse", glide(n, 330.0, 296.0), n, duty=0.35, top=5000.0)
    voc = 1.2 * bp(src, 780.0, 4.0) + 0.9 * bp(src, 1500.0, 5.0) + 0.2 * src
    return voc * adsr(n, 0.004, 0.03, 0.7, 0.018)


# ----------------------------------------------------------------------------- economy

def buy(r):  # ka-chunk + register bell
    return mix((0, chunk(r, 1.25, 0.8), 0.7), (0.075, chunk(r, 0.92, 1.0)), (0.085, ching(2637.0, 0.3, 0.13), 0.3))


def buyMax(r):
    parts = [(i * 0.058, chunk(r, 1.0 + 0.12 * i, 0.9), 0.75) for i in range(4)]
    parts += [(0.2, chunk(r, 0.85, 1.1)), (0.21, ching(2637.0, 0.36, 0.15), 0.3), (0.3, ching(3136.0, 0.3, 0.13), 0.24)]
    return mix(*parts)


def coin(r):
    a = blip(988.0, 0.065, duty=0.5, fc=5000.0)
    b = blip(1319.0, 0.19, duty=0.5, fc=5000.0) * np.exp(-tsec(n_of(0.19)) / 0.07)
    return mix((0, a, 0.9), (0.06, b))


def collect(r):
    n = n_of(0.11)
    chirp = osc("tri", glide(n, 520.0, 1250.0), n) * perc(n, 0.003, 0.05)
    return mix((0, thump(420.0, 200.0, 0.02, 0.004, 0.006), 0.6), (0, chirp))


def milestone(r):
    x = arp([72, 76, 79, 84], 0.07, 0.09, chip_note(0.25, 0.1), hold_last=0.3)
    return delay(mix((0, x), length=0.72), 0.105, feedback=0.3, damp=3500.0, mix=0.3)


def levelUp(r):
    x = arp([72, 76, 79, 84, 88, 91, 96], 0.055, 0.075, chip_note(0.25, 0.09), hold_last=0.3)
    sparkle = mix((0, bell(2093.0, 0.35, decay=0.16, index=0.6)), (0.04, bell(2637.0, 0.3, decay=0.14, index=0.5), 0.7))
    return delay(mix((0, x), (0.33, sparkle, 0.5), length=0.86), 0.11, feedback=0.35, damp=4000.0, mix=0.3)


def achievement(r):
    def strum(notes, step=0.018):
        return mix(*[(i * step, bell(float(mtof(m)), 0.5, decay=0.24, index=1.1)) for i, m in enumerate(notes)])
    ticks = mix(*[(i * 0.045, click(r, 0.01, 6000.0, 2.0, 0.002), 0.15) for i in range(6)])
    x = mix((0, strum([77, 81, 84]), 0.8), (0.24, strum([79, 84, 88, 91])), (0.26, ticks), length=0.9)
    return reverb(x, mix=0.25, dur=0.6)


def success(r):
    lead = arp([67, 72, 76, 79], 0.06, 0.08, chip_note(0.25, 0.1))
    n = n_of(0.5)
    chord = sum(osc("pulse", float(mtof(m)), n, duty=0.3, top=6000.0) for m in (72, 76, 79, 84)) * perc(n, 0.004, 0.16)
    return delay(mix((0, lead), (0.25, chord, 0.35), length=0.84), 0.12, feedback=0.3, damp=3500.0, mix=0.25)


def fail(r):
    parts = []
    for i, m in enumerate((67, 66, 63, 58)):
        d = 0.15 if i < 3 else 0.3
        n = n_of(d)
        f = float(mtof(m))
        cut = glide(n, 2400.0, 700.0)
        tone = osc("saw", glide(n, f, f * 0.97), n, top=6000.0, hgain=lambda fk, c=cut: lp_gain(fk, c, 1.2, 4))
        parts.append((i * 0.15, tone * adsr(n, 0.005, 0.1, 0.6, 0.03)))
    return sat(mix(*parts, length=0.76) * 1.3, 1.4)


def prestige(r):  # the big one: riser, boom, chord bloom, sparkle
    rn = n_of(0.72)
    riser = sweep(white(r, rn), "bp", glide(rn, 300.0, 7000.0), 1.2) * (tsec(rn) / 0.72) ** 2
    saw_up = osc("saw", glide(rn, 110.0, 880.0), rn, top=5000.0) * (tsec(rn) / 0.72) ** 2 * 0.3
    boom = thump(140.0, 30.0, 0.9, pdec=0.08, decay=0.35)
    cn = n_of(1.25)
    cut = seg(cn, [(0, 600), (0.25, 3600), (1.25, 900)], "exp")
    chord = sum(osc("saw", float(mtof(m)) * d, cn, top=7000.0, hgain=lambda fk: lp_gain(fk, cut, 0.9, 4))
                for m in (60, 67, 72, 76, 79, 86) for d in (0.996, 1.004)) / 6.0
    chord *= seg(cn, [(0, 0), (0.03, 1), (0.5, 0.7), (1.25, 0)])
    sparks = mix(*[(i * 0.07, bell(float(mtof(m)), 0.4, decay=0.18, index=0.7), 0.5) for i, m in enumerate((84, 88, 91, 96, 91, 96, 100, 103))])
    x = mix((0, riser, 0.5), (0, saw_up), (0.7, boom, 1.1), (0.7, chord, 0.6), (0.8, sparks, 0.35), length=1.98)
    return sat(reverb(x, mix=0.3, dur=1.0) * 1.2, 1.3)


def chapter(r):  # a gong in a very large room
    n = n_of(1.95)
    f = float(mtof(50))
    gong = partials([f, f * 2.0, f * 2.76, f * 4.07, f * 5.2, f * 6.6], [1.0, 0.7, 0.5, 0.35, 0.2, 0.12],
                    [1.1, 0.9, 0.7, 0.5, 0.35, 0.25], n) * (1.0 - np.exp(-tsec(n) / 0.004))
    pn = n_of(1.6)
    cut = seg(pn, [(0, 500), (0.7, 1700), (1.6, 700)], "exp")
    pad = sum(osc("saw", float(mtof(m)) * d, pn, top=5000.0, hgain=lambda fk: lp_gain(fk, cut, 0.8, 4))
              for m in (50, 57, 62, 64) for d in (0.996, 1.004)) / 5.0 * swell(pn, 0.55, 0.8)
    x = mix((0, gong, 0.9), (0.1, pad, 0.5), (0.6, bell(float(mtof(74)), 0.9, decay=0.4, index=1.0), 0.25), length=1.98)
    return reverb(x, mix=0.35, dur=1.2, dark=1100.0)


# ----------------------------------------------------------------------------- workshop

def craftStart(r):  # clamp, then a small motor spinning up
    n = n_of(0.36)
    motor = osc("saw", glide(n, 130.0, 360.0), n, top=3600.0) * (0.75 + 0.25 * np.sin(TAU * 28.0 * tsec(n)))
    motor = lp(motor, 2400.0) * seg(n, [(0, 0), (0.04, 0.8), (0.3, 1.0), (0.36, 0)])
    hiss = sweep(white(r, n), "bp", glide(n, 900.0, 3200.0), 1.0) * seg(n, [(0, 0), (0.2, 0.4), (0.36, 0)])
    return mix((0, chunk(r, 1.1, 0.7), 0.7), (0.03, motor, 0.7), (0.03, hiss, 0.25))


def craftDone(r):
    return mix((0, chunk(r, 1.4, 0.6), 0.6), (0.04, bell(1319.0, 0.4, decay=0.22, ratio=3.5), 0.7), (0.13, bell(1976.0, 0.36, decay=0.2, ratio=3.5), 0.6), length=0.5)


def moduleInstall(r):  # slide in, lock, confirm
    n = n_of(0.19)
    slide = sweep(white(r, n), "bp", glide(n, 600.0, 2400.0), 1.5) * seg(n, [(0, 0), (0.15, 1.0), (0.19, 0.2)])
    return mix((0, slide, 0.5), (0.19, chunk(r, 0.8, 1.2)), (0.3, blip(880.0, 0.045, shape="tri"), 0.5),
               (0.36, blip(1319.0, 0.1, shape="tri") * np.exp(-tsec(n_of(0.1)) / 0.05), 0.5))


def moduleBreak(r):  # crack, then the magic smoke leaves
    n = n_of(0.5)
    fizz = crush(osc("saw", glide(n, 420.0, 55.0), n, top=5000.0), 4.5, 3)
    gate = lp((r.uniform(0, 1, n // 400 + 1) > 0.35).astype(float).repeat(400)[:n], 300.0)
    fizz *= gate * np.exp(-tsec(n) / 0.18)
    sparks = mix(*[(float(t), click(r, 0.012, float(r.uniform(3500, 7000)), 2.0, 0.002), float(r.uniform(0.3, 0.8)))
                   for t in np.sort(r.uniform(0.03, 0.45, 9))])
    crack = mix((0, hp(white(r, n_of(0.04)), 1500.0) * np.exp(-tsec(n_of(0.04)) / 0.008)), (0, thump(260.0, 70.0, 0.2, 0.03, 0.07)))
    return sat(mix((0, crack), (0.02, fizz, 0.6), (0, sparks, 0.5), length=0.6), 1.5)


def repairTick(r):  # one click of a ratchet
    return mix((0, click(r, 0.02, 2400.0, 2.0, 0.003), 0.5), (0, partials([1500.0, 2900.0], [0.4, 0.25], [0.012, 0.008], n_of(0.05))),
               (0, thump(220.0, 150.0, 0.03, 0.006, 0.01), 0.6))


def repairDone(r):
    def tick(p):
        return mix((0, click(r, 0.02, 2400.0 * p, 2.0, 0.003), 0.5), (0, partials([1500.0 * p, 2900.0 * p], [0.4, 0.25], [0.012, 0.008], n_of(0.05))))
    chime = lambda f: (osc("tri", f, n_of(0.36)) + 0.4 * sine(2 * f, n_of(0.36))) * perc(n_of(0.36), 0.003, 0.14)
    return mix((0, tick(1.0), 0.6), (0.05, tick(1.12), 0.65), (0.10, tick(1.26), 0.7), (0.17, chime(784.0), 0.8), (0.26, chime(1047.0), 0.8), length=0.62)


def weld(r):  # arc: mains buzz chopping bright noise
    n = n_of(0.42)
    t = tsec(n)
    buzz = 0.5 + 0.5 * osc("square", 100.0, n, top=3000.0)
    arc = bp(white(r, n), 3500.0, 0.8) * (0.25 + 0.75 * buzz)
    hum = lp(osc("saw", 100.0, n, top=1500.0), 600.0) * 0.5
    crackle = (r.uniform(0, 1, n) > 0.994).astype(float) * r.uniform(0.5, 1.0, n)
    crackle = bp(crackle, 5000.0, 1.0) * 6.0
    env = seg(n, [(0, 0), (0.006, 1.0), (0.3, 0.85), (0.42, 0)]) * (0.85 + 0.15 * lp(white(r, n), 40.0) * 8.0)
    return sat((arc + hum + crackle) * np.clip(env, 0, 1.4), 1.5)


def zap(r):
    n = n_of(0.17)
    x = osc("saw", glide(n, 2400.0, 180.0), n) * (0.5 + 0.5 * osc("square", 70.0, n, top=2000.0))
    burst = hp(white(r, n), 3000.0) * np.exp(-tsec(n) / 0.02)
    return crush((x * perc(n, 0.001, 0.06) + 0.5 * burst), 5.5, 1)


def tape(r):  # ripping a length of duct tape off the roll
    n = n_of(0.34)
    rag = 0.55 + 0.45 * np.clip(lp(white(r, n), 90.0) * 9.0, -1, 1)
    x = sweep(white(r, n), "bp", glide(n, 700.0, 3800.0), 1.4, order=2) * 3.0
    env = seg(n, [(0, 0), (0.01, 0.5), (0.27, 1.0), (0.305, 0.9), (0.34, 0)])
    return mix((0, click(r, 0.015, 1600.0, 1.5, 0.004), 0.5), (0, x * rag * env), (0.3, click(r, 0.02, 900.0, 2.0, 0.006), 0.7))


def valve(r):  # squeaky handwheel, then steam
    n = n_of(0.13)
    sq = sine(glide(n, 1250.0, 820.0) * (1.0 + 0.02 * np.sin(TAU * 38.0 * tsec(n))), n) * seg(n, [(0, 0), (0.02, 1), (0.1, 0.7), (0.13, 0)])
    hn = n_of(0.34)
    hiss = bp(white(r, hn), 3200.0, 0.6) * (1.0 - np.exp(-tsec(hn) / 0.02)) * np.exp(-tsec(hn) / 0.11)
    return mix((0, sq, 0.3), (0.07, hiss, 0.8), (0.07, thump(260.0, 150.0, 0.05, 0.01, 0.02), 0.5))


def dock(r):  # two clamps and the airlock equalising
    hn = n_of(0.36)
    hiss = bp(white(r, hn), 3000.0, 0.6) * (1.0 - np.exp(-tsec(hn) / 0.015)) * np.exp(-tsec(hn) / 0.1)
    return mix((0, chunk(r, 0.8, 1.0), 0.85), (0.16, chunk(r, 0.62, 1.3)), (0.22, hiss, 0.3), length=0.6)


def towArrive(r):  # the tow truck honks, of course
    def honk(d):
        n = n_of(d)
        x = osc("saw", 311.0, n, top=4000.0) + osc("saw", 392.0, n, top=4000.0) + 0.5 * osc("square", 155.5, n, top=3000.0)
        return lp(x + 2.0 * bp(x, 1000.0, 2.5), 2200.0) * adsr(n, 0.012, 0.05, 0.9, 0.03)
    return sat(mix((0, honk(0.15)), (0.21, honk(0.27)), (0.56, chunk(r, 0.75, 1.2), 2.0), length=0.75) * 0.5, 1.4)


# ----------------------------------------------------------------------------- mini-games and action

def stepHit(r):
    n = n_of(0.085)
    return mix((0, osc("tri", glide(n, 1100.0, 880.0, 0.006), n) * perc(n, 0.001, 0.035)), (0, click(r, 0.008, 4000.0, 1.5, 0.0015), 0.3))


def stepMiss(r):
    n = n_of(0.07)
    dull = (osc("square", 233.0, n, top=1600.0) + osc("square", 247.0, n, top=1600.0)) * perc(n, 0.002, 0.03)
    return mix((0, thump(380.0, 240.0, 0.1, 0.02, 0.035)), (0, lp(white(r, n_of(0.06)), 1100.0) * np.exp(-tsec(n_of(0.06)) / 0.02), 0.8), (0.005, dull, 0.5))


def laser(r):
    n = n_of(0.2)
    f = glide(n, 1500.0, 280.0)
    x = osc("pulse", f, n, duty=0.3) + 0.4 * sine(f * 2.0, n) * np.exp(-tsec(n) / 0.03)
    return x * perc(n, 0.001, 0.07)


def explosion(r):
    n = n_of(0.88)
    t = tsec(n)
    body = sweep(colored(r, n, 0.5) * 2.0 + white(r, n) * 0.6, "lp", glide(n, 5000.0, 350.0, 0.25), 0.8)
    body += 0.8 * bp(white(r, n), 900.0, 0.7) * np.exp(-t / 0.2)  # mid crunch that survives a phone speaker
    body *= (1.0 - np.exp(-t / 0.004)) * np.exp(-t / 0.28)
    debris = mix(*[(float(tt), click(r, 0.02, float(r.uniform(600, 2500)), 1.5, 0.006), float(r.uniform(0.2, 0.6)))
                   for tt in np.sort(r.uniform(0.08, 0.6, 10))], length=0.88)
    return sat(mix((0, body, 1.4), (0, thump(130.0, 45.0, 0.6, 0.06, 0.22), 1.0), (0, debris, 0.5), length=0.88) * 1.6, 2.2)


def impact(r):  # something hit the hull
    n = n_of(0.34)
    clang = partials([317.0, 743.0, 1190.0, 1870.0, 2630.0], [0.6, 0.5, 0.35, 0.2, 0.12], [0.12, 0.1, 0.08, 0.06, 0.05], n)
    return sat(mix((0, thump(170.0, 62.0, 0.3, 0.025, 0.09), 1.0), (0, clang, 0.9), (0, lp(white(r, n_of(0.08)), 1800.0) * np.exp(-tsec(n_of(0.08)) / 0.025), 0.6)), 1.6)


def thruster(r):
    n = n_of(0.27)
    x = sweep(colored(r, n, 0.35) * 2.0 + white(r, n) * 0.5, "lp", glide(n, 3200.0, 800.0), 0.9)
    x = hp(x, 180.0) + 0.3 * bp(white(r, n), 2500.0, 0.8)
    return x * seg(n, [(0, 0), (0.015, 1.0), (0.1, 0.8), (0.27, 0)])


def overdrive(r):
    n = n_of(0.38)
    cut = glide(n, 500.0, 6000.0)
    rise = osc("saw", glide(n, 110.0, 440.0), n, top=7000.0, hgain=lambda fk: lp_gain(fk, cut, 1.4, 4)) * (tsec(n) / 0.38) ** 0.7
    pn = n_of(0.26)
    power = sum(osc("saw", float(mtof(m)), pn, top=6000.0) for m in (57, 64, 69)) / 3.0
    power *= (0.7 + 0.3 * np.sin(TAU * 24.0 * tsec(pn))) * perc(pn, 0.003, 0.11)
    return sat(mix((0, thump(160.0, 50.0, 0.2, 0.03, 0.07), 1.0), (0, rise, 0.6), (0.37, power, 0.9), length=0.66) * 1.3, 1.6)


def overheat(r):
    n = n_of(0.66)
    t = tsec(n)
    wob = np.where(np.sin(TAU * 12.0 * t) > 0, 740.0, 622.0) * glide(n, 1.0, 0.88)
    wob = lp(wob - wob.mean(), 200.0) + wob.mean()  # round the steps so the pitch slides instead of clicking
    warble = lp(osc("square", wob, n, top=4000.0), 3000.0) * seg(n, [(0, 0), (0.01, 1), (0.5, 0.8), (0.66, 0)])
    hiss = bp(white(r, n), 3600.0, 0.6) * (1.0 - np.exp(-t / 0.01)) * np.exp(-t / 0.2)
    return mix((0, warble, 0.6), (0, hiss, 0.5), length=0.7)


# ----------------------------------------------------------------------------- navigation and story

def jumpCharge(r):
    n = n_of(0.88)
    t = tsec(n)
    f = glide(n, 55.0, 880.0)
    cut = glide(n, 400.0, 5000.0)
    whine = osc("saw", f, n, top=8000.0, hgain=lambda fk: lp_gain(fk, cut, 1.6, 4))
    trem_rate = glide(n, 6.0, 30.0)
    trem = 1.0 - 0.4 * (0.5 + 0.5 * np.sin(TAU * np.cumsum(trem_rate) / SR))
    air = sweep(white(r, n), "hp", glide(n, 6000.0, 1500.0), 0.8) * (t / 0.88) ** 3 * 0.3
    return (whine * trem + air) * seg(n, [(0, 0), (0.05, 0.25), (0.84, 1.0), (0.88, 0)])


def jumpGo(r):
    n = n_of(1.5)
    t = tsec(n)
    fc = seg(n, [(0, 300), (0.25, 6000), (1.5, 200)], "exp")
    whoosh = sweep(white(r, n), "bp", fc, 1.1) * seg(n, [(0, 0), (0.03, 1.0), (0.3, 0.9), (1.5, 0)]) * 2.0
    doppler = osc("saw", glide(n, 880.0, 110.0, 0.35), n, top=5000.0) * np.exp(-t / 0.4) * 0.25
    x = mix((0, thump(180.0, 28.0, 1.2, pdec=0.12, decay=0.45), 1.3), (0, whoosh, 0.7), (0, doppler), length=1.9)
    return sat(reverb(x, mix=0.3, dur=0.9, dark=1200.0) * 1.3, 1.5)


def arrive(r):
    n = n_of(0.36)
    swellin = sweep(white(r, n), "bp", glide(n, 500.0, 3000.0), 1.2) * (tsec(n) / 0.36) ** 2.5
    chord = mix((0, bell(880.0, 0.45, decay=0.25, index=0.9)), (0.01, bell(1319.0, 0.45, decay=0.22, index=0.7), 0.7))
    return mix((0, swellin, 0.7), (0.36, thump(90.0, 45.0, 0.3, 0.03, 0.1), 1.0), (0.37, chord, 0.5), length=0.86)


def scanPing(r):
    n = n_of(0.3)
    ping = sine(glide(n, 1584.0, 1568.0), n) * perc(n, 0.003, 0.09)
    x = mix((0, ping), length=0.76)
    return delay(x, 0.16, feedback=0.5, damp=2500.0, mix=0.5)


def discovery(r):
    notes = [72, 76, 78, 79, 83, 86]  # lydian climb
    x = mix(*[(i * 0.075, bell(float(mtof(m)), 0.45, decay=0.22, index=1.0), 0.7 + 0.05 * i) for i, m in enumerate(notes)], length=0.9)
    return reverb(delay(x, 0.15, feedback=0.3, damp=4000.0, mix=0.25), mix=0.25, dur=0.6)


# id -> (generator, loudness target in dB, max seconds). Loudness is the loudest 20 ms of the file
# after a phone-speaker weighting (see build_audio.loudness), which is what sets the mix: ticks sit
# well below stingers, so callers never need per-call volume tweaks. Peaks are capped separately.
TICK, UI, EVENT, BIG, HUGE = -22.0, -18.5, -15.5, -12.5, -9.5
SFX = {
    "keyDown": (keyDown, UI, 0.9), "keyUp": (keyUp, TICK, 0.9), "knobTick": (knobTick, TICK, 0.9),
    "toggle": (toggle, UI, 0.9), "tab": (tab, UI, 0.9), "uiOpen": (uiOpen, UI, 0.9), "uiClose": (uiClose, UI, 0.9),
    "buy": (buy, EVENT + 1.0, 0.9), "buyMax": (buyMax, BIG, 0.9), "milestone": (milestone, BIG, 0.9),
    "deny": (deny, EVENT, 0.9), "coin": (coin, UI + 1.0, 0.9), "collect": (collect, UI, 0.9),
    "craftStart": (craftStart, EVENT, 0.9), "craftDone": (craftDone, EVENT, 0.9),
    "moduleInstall": (moduleInstall, BIG, 0.9), "moduleBreak": (moduleBreak, BIG, 0.9),
    "repairTick": (repairTick, TICK + 1.5, 0.9), "repairDone": (repairDone, EVENT, 0.9), "weld": (weld, EVENT - 1.5, 0.9),
    "zap": (zap, EVENT, 0.9), "tape": (tape, EVENT, 0.9), "valve": (valve, EVENT - 1.0, 0.9),
    "beepGood": (beepGood, UI, 0.9), "beepBad": (beepBad, UI, 0.9), "stepHit": (stepHit, UI + 1.0, 0.9),
    "stepMiss": (stepMiss, UI, 0.9), "laser": (laser, EVENT, 0.9), "explosion": (explosion, HUGE, 0.9),
    "impact": (impact, BIG, 0.9), "alarm": (alarm, BIG, 0.9), "alert": (alert, EVENT, 0.9),
    "notify": (notify, EVENT - 1.0, 0.9), "jumpCharge": (jumpCharge, BIG, 0.9), "jumpGo": (jumpGo, HUGE, 2.0),
    "arrive": (arrive, BIG, 0.9), "scanPing": (scanPing, EVENT, 0.9), "discovery": (discovery, BIG, 0.9),
    "eventOpen": (eventOpen, EVENT, 0.9), "choice": (choice, UI, 0.9), "success": (success, BIG, 0.9),
    "fail": (fail, BIG, 0.9), "overdrive": (overdrive, BIG + 1.0, 0.9), "overheat": (overheat, BIG, 0.9),
    "levelUp": (levelUp, BIG, 0.9), "achievement": (achievement, BIG, 0.9), "chapter": (chapter, HUGE, 2.0),
    "kippBlip": (kippBlip, TICK + 1.0, 0.9), "dock": (dock, BIG, 0.9), "thruster": (thruster, EVENT - 1.0, 0.9),
    "towArrive": (towArrive, BIG, 0.9), "prestige": (prestige, HUGE, 2.0),
}
